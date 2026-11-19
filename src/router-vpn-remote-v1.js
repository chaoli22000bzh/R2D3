/*
 * VPN nomade à site (pédagogique) : comptes multiples, un routeur, un LAN.
 * Aucun protocole cryptographique, socket ou routage général.
 * Le registre R2 possède la configuration du routeur. Le client garde son état
 * dans la séance/laboratoire appelant. Le ping réutilise observeRouterPing.
 */
import {observeRouterPing} from "./router-routing-v01.js";
const fail=(code,message)=>({success:false,code,message});
const clone=v=>JSON.parse(JSON.stringify(v));
const ipNum=s=>{
 if(typeof s!=="string"||!/^\d{1,3}(\.\d{1,3}){3}$/.test(s))return null;
 const oct=s.split(".").map(Number);
 if(oct.some(n=>n>255))return null;
 return oct.reduce((v,n)=>((v<<8)|n)>>>0,0);
};
const ipText=n=>[24,16,8,0].map(b=>(n>>>b)&255).join(".");
const subnet=(ip,prefix)=>{
 const n=ipNum(ip);
 if(n===null||!Number.isInteger(prefix)||prefix<1||prefix>30)return null;
 const mask=(0xffffffff<<(32-prefix))>>>0;
 return {network:(n&mask)>>>0,mask,prefix};
};
const inSubnet=(ip,s)=>{const n=ipNum(ip);return n!==null&&((n&s.mask)>>>0)===s.network;};
const router=(registry,id)=>{
 const r=registry?.getAsset?.(id);
 return r?.networkCapabilities?.includes("ipv4-router")&&r.routerConfig?r:null;
};
const iface=(r,id)=>r?.routerConfig?.interfaces?.[id];
const configOf=(r)=>r?.routerConfig?.remoteVpn||null;
export function getRemoteVpnConfig(registry,routerId){
 const r=router(registry,routerId);return r?clone(configOf(r)):null;
}
export function configureRemoteVpn(registry,routerId,{wanPortId,lanPortId,vpnNetwork,vpnPrefix,username,password,accounts,dnsServer="",dnsServers,enabled=false}={}){
 const r=router(registry,routerId);
 if(!r)return fail("router_missing","Routeur introuvable");
 const wan=iface(r,wanPortId),lan=iface(r,lanPortId);
 if(!wan||wan.role!=="wan"||wan.mode!=="static"||ipNum(wan.address)===null)
  return fail("wan_invalid","Choisir un WAN avec une adresse IPv4");
 if(!lan||lan.role!=="lan"||lan.mode!=="static"||ipNum(lan.address)===null||lanPortId===wanPortId)
  return fail("lan_invalid","Choisir un LAN avec une adresse IPv4");
 const pool=subnet(vpnNetwork,vpnPrefix),lanNet=subnet(lan.address,lan.prefix),wanNet=subnet(wan.address,wan.prefix);
 if(!pool||!lanNet||!wanNet||ipNum(vpnNetwork)!==pool.network)
  return fail("network_invalid","Réseau VPN incorrect");
 if([lanNet,wanNet].some(s=>inSubnet(vpnNetwork,s)||inSubnet(lan.address,pool)||inSubnet(wan.address,pool)))
  return fail("network_overlap","Réseaux VPN, LAN et WAN à séparer");
 const users=accounts??(typeof username==="string"&&typeof password==="string"?[{username,password,enabled:true}]:null);
 if(!Array.isArray(users)||users.length<1||users.length>100||
    users.some(u=>!u||typeof u.username!=="string"||!u.username.trim()||typeof u.password!=="string"||!u.password||typeof u.enabled!=="boolean")||
    new Set(users.map(u=>u.username.trim().toLowerCase())).size!==users.length||
    typeof enabled!=="boolean")
  return fail("credentials_invalid","Liste de comptes incorrecte (1 à 100)");
 const dns=dnsServers??(dnsServer?[dnsServer]:[]);
 if(!Array.isArray(dns)||dns.length>2||dns.some(ip=>ipNum(ip)===null)||new Set(dns).size!==dns.length)
  return fail("dns_invalid","DNS incorrect : deux adresses maximum, sans doublon");
 const capacity=(2**(32-pool.prefix))-2;
 if(users.length>capacity)return fail("vpn_pool_full","Réseau VPN trop petit pour les comptes");
 const settings={wanPortId,lanPortId,vpnNetwork,vpnPrefix,accounts:users.map(u=>({username:u.username.trim(),password:u.password,enabled:u.enabled})),dnsServers:[...dns],enabled};
 const updated=clone(r.routerConfig);updated.remoteVpn=settings;
 const done=registry.setAssetRouterConfig(routerId,updated);
 return done.success?{success:true,config:clone(settings)}:fail("config_rejected",done.message||"Configuration refusée");
}
export function setRemoteVpnEnabled(registry,routerId,enabled){
 const r=router(registry,routerId),config=configOf(r);
 if(!config)return fail("vpn_missing","VPN non configuré");
 if(typeof enabled!=="boolean")return fail("state_invalid","État invalide");
 const updated=clone(r.routerConfig);updated.remoteVpn.enabled=enabled;
 const done=registry.setAssetRouterConfig(routerId,updated);
 return done.success?{success:true}:fail("config_rejected",done.message||"Modification refusée");
}
/* session : résultat courant, possédé par le client et jamais par le moteur réseau. */
export function connectRemoteVpn(registry,routerId,clientId,addresses,{serverAddress,username,password}={}){
 const r=router(registry,routerId),client=registry?.getAsset?.(clientId),cfg=configOf(r);
 if(!r||!client||!cfg)return fail("vpn_missing","VPN ou PC introuvable");
 if(r.status!=="En service"||client.status!=="En service")return fail("device_down","PC ou routeur arrêté");
 if(!cfg.enabled)return fail("vpn_off","VPN désactivé");
 const wan=iface(r,cfg.wanPortId);
 if(!wan||wan.role!=="wan"||wan.mode!=="static"||wan.address!==serverAddress)
  return fail("wrong_server","Adresse du serveur VPN incorrecte");
 const users=cfg.accounts??[{username:cfg.username,password:cfg.password,enabled:true}];
 const index=users.findIndex(u=>u.username===username&&u.password===password&&u.enabled!==false);
 if(index<0)return fail("wrong_credentials","Identifiant ou mot de passe incorrect");
 const clientPorts=client.ports.filter(p=>p.type==="ethernet-rj45");
 if(clientPorts.length!==1||!registry.explorePhysicalPath(clientPorts[0].id,cfg.wanPortId).connected)
  return fail("network_down","Routeur VPN inaccessible");
 const ci=addresses?.[clientId],wi=subnet(wan.address,wan.prefix),cn=subnet(ci?.address,ci?.prefix);
 if(!cn||!wi||cn.network!==wi.network||cn.prefix!==wi.prefix||ci.gateway!==wan.address)
  return fail("network_down","Adresse IP ou passerelle incorrecte");
 const pool=subnet(cfg.vpnNetwork,cfg.vpnPrefix);
 if(!pool)return fail("config_invalid","Plage VPN incorrecte");
 // Une IPv4 stable et distincte par compte autorisé dans ce lot.
 // L'adresse .10 est conservée pour le premier compte, si le préfixe le permet.
 const first=pool.network+1, last=pool.network+(2**(32-pool.prefix))-2;
 const start=Math.min(first+9,last);
 const offset=index, range=last-first+1;
 const assigned=first+((start-first+offset)%range);
 const dnsServers=cfg.dnsServers??(cfg.dnsServer?[cfg.dnsServer]:[]);
 return {success:true,session:{routerId,clientId,username,serverAddress,vpnAddress:ipText(assigned),
  dnsServer:dnsServers[0]||"",dnsServers:[...dnsServers],connected:true}};
}
/*
 * Vérification de validité à chaque usage du tunnel.
 * Ne dépend pas de l'interface : même un ancien objet session devient inutilisable
 * quand l'administrateur bloque ou supprime son compte.
 */
export function validateRemoteVpnSession(registry,session){
 if(!session?.connected)return fail("disconnected","VPN déconnecté");
 const r=router(registry,session.routerId),cfg=configOf(r);
 if(!r||!cfg||!cfg.enabled)return fail("vpn_off","VPN désactivé");
 if(r.status!=="En service")return fail("router_down","Routeur arrêté");
 if(registry?.getAsset?.(session.clientId)?.status!=="En service")return fail("device_down","PC arrêté");
 const accounts=cfg.accounts??(cfg.username?[{username:cfg.username,password:cfg.password,enabled:true}]:[]);
 if(typeof session.username!=="string"||!accounts.some(a=>a.username===session.username&&a.enabled!==false))
  return fail("account_revoked","Compte VPN bloqué ou supprimé");
 return {success:true};
}
export function disconnectRemoteVpn(session){
 return {...(session||{}),connected:false};
}
/* Le même observateur de routage direct contrôle les deux accès physiques.
 * Le tunnel autorise l'accès ; le routage et le ping sont vérifiés séparément.
 */
export function observeRemoteVpnPing(registry,session,targetId,addresses){
 const valid=validateRemoteVpnSession(registry,session);
 if(!valid.success)return valid;
 const r=router(registry,session.routerId),cfg=configOf(r);
 const target=registry?.getAsset?.(targetId);
 if(!target||target.status!=="En service")return fail("target_down","Machine distante arrêtée");
 if(cfg.wanPortId===cfg.lanPortId||iface(r,cfg.wanPortId)?.address!==session.serverAddress)
  return fail("vpn_changed","Configuration VPN modifiée");
 const lan=iface(r,cfg.lanPortId),net=subnet(lan?.address,lan?.prefix),ip=addresses?.[targetId]?.address;
 if(!net||!inSubnet(ip,net))return fail("wrong_destination","Machine hors du réseau interne");
 const check=observeRouterPing(registry,session.routerId,session.clientId,targetId,addresses);
 return check.success?{success:true,status:"ok",reason:"Réponse du PC distant",vpnAddress:session.vpnAddress}:fail(check.status==="unavailable"?"unsupported":"unreachable",check.reason||"Réseau inaccessible");
}

/*
 * DNS VPN V1 : une machine du LAN fournit le DNS, le client l'obtient à
 * la connexion. Le Core DNS existant résout le nom ; aucun enregistrement
 * ou réponse DNS n'est inventé ici.
 *
 * dnsEngine : moteur Core du scénario DNS réellement raccordé au LAN.
 * dnsClientId : point de résolution DNS côté LAN dans ce Core, avec
 * networkOptions.dns configuré sur le DNS poussé par le VPN.
 * dnsAssetId : actif R2 correspondant au serveur DNS (joignabilité VPN).
 * targetId : actif R2 de la destination dont l'IPv4 doit correspondre
 * à l'enregistrement A.
 */
export function observeRemoteVpnPingName(registry,session,name,targetId,addresses,{dnsEngine,dnsClientId,dnsAssetId}={}){
 const valid=validateRemoteVpnSession(registry,session);
 if(!valid.success&&["account_revoked","disconnected"].includes(valid.code))return valid;
 const servers=session.dnsServers??(session.dnsServer?[session.dnsServer]:[]);
 if(!servers.length)return fail("dns_not_configured","Aucun DNS fourni par le VPN");
 if(!dnsEngine?.query||!dnsClientId)return fail("dns_engine_missing","Moteur DNS non disponible");
 const targetDns=addresses?.[dnsAssetId]?.address;
 const available=servers.filter(ip=>ip===targetDns);
 if(!available.length)return fail("dns_server_missing","Serveur DNS introuvable");
 const dnsPing=observeRemoteVpnPing(registry,session,dnsAssetId,addresses);
 if(!dnsPing.success)return fail("dns_unreachable","Serveur DNS inaccessible : "+(dnsPing.message||"réseau coupé"));
 const answer=dnsEngine.query({type:"dns.resolve",sourceId:dnsClientId,serverAddress:available[0],name,recordType:"A"});
 if(answer.status!=="ok")return fail("dns_error",answer.reason||"Résolution DNS impossible");
 if(!answer.found)return fail("dns_not_found","Nom DNS inconnu");
 if(answer.address!==addresses?.[targetId]?.address)return fail("dns_wrong_target","Le nom ne correspond pas au serveur testé");
 const ping=observeRemoteVpnPing(registry,session,targetId,addresses);
 return ping.success?{...ping,resolvedAddress:answer.address,dnsServer:available[0],name}:ping;
}

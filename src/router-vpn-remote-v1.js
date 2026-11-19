/*
 * VPN nomade à site V1 (pédagogique) : un client, un routeur, un réseau interne.
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
export function configureRemoteVpn(registry,routerId,{wanPortId,lanPortId,vpnNetwork,vpnPrefix,username,password,enabled=false}={}){
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
 if(typeof username!=="string"||!username.trim()||typeof password!=="string"||!password||typeof enabled!=="boolean")
  return fail("credentials_invalid","Identifiant, mot de passe ou état incorrect");
 const settings={wanPortId,lanPortId,vpnNetwork,vpnPrefix,username:username.trim(),password,enabled};
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
 if(cfg.username!==username||cfg.password!==password)
  return fail("wrong_credentials","Identifiant ou mot de passe incorrect");
 const clientPorts=client.ports.filter(p=>p.type==="ethernet-rj45");
 if(clientPorts.length!==1||!registry.explorePhysicalPath(clientPorts[0].id,cfg.wanPortId).connected)
  return fail("network_down","Routeur VPN inaccessible");
 const ci=addresses?.[clientId],wi=subnet(wan.address,wan.prefix),cn=subnet(ci?.address,ci?.prefix);
 if(!cn||!wi||cn.network!==wi.network||cn.prefix!==wi.prefix||ci.gateway!==wan.address)
  return fail("network_down","Adresse IP ou passerelle incorrecte");
 const pool=subnet(cfg.vpnNetwork,cfg.vpnPrefix);
 if(!pool)return fail("config_invalid","Plage VPN incorrecte");
 // V1 : un seul client ; adresse .10 si utilisable, sinon première adresse.
 const first=pool.network+1, last=pool.network+(2**(32-pool.prefix))-2;
 const assigned=Math.min(first+9,last);
 return {success:true,session:{routerId,clientId,serverAddress,vpnAddress:ipText(assigned),connected:true}};
}
export function disconnectRemoteVpn(session){
 return {...(session||{}),connected:false};
}
/* Le même observateur de routage direct contrôle les deux accès physiques.
 * Le tunnel autorise l'accès ; le routage et le ping sont vérifiés séparément.
 */
export function observeRemoteVpnPing(registry,session,targetId,addresses){
 if(!session?.connected)return fail("disconnected","VPN déconnecté");
 const r=router(registry,session.routerId),cfg=configOf(r);
 if(!r||!cfg||!cfg.enabled)return fail("vpn_off","VPN désactivé");
 if(r.status!=="En service")return fail("router_down","Routeur arrêté");
 const target=registry?.getAsset?.(targetId);
 if(!target||target.status!=="En service")return fail("target_down","Machine distante arrêtée");
 if(cfg.wanPortId===cfg.lanPortId||iface(r,cfg.wanPortId)?.address!==session.serverAddress)
  return fail("vpn_changed","Configuration VPN modifiée");
 const lan=iface(r,cfg.lanPortId),net=subnet(lan?.address,lan?.prefix),ip=addresses?.[targetId]?.address;
 if(!net||!inSubnet(ip,net))return fail("wrong_destination","Machine hors du réseau interne");
 const check=observeRouterPing(registry,session.routerId,session.clientId,targetId,addresses);
 return check.success?{success:true,status:"ok",reason:"Réponse du PC distant",vpnAddress:session.vpnAddress}:fail(check.status==="unavailable"?"unsupported":"unreachable",check.reason||"Réseau inaccessible");
}

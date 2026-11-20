/*
 * R2D3 - VPN site à site pédagogique V0.1.
 * Un tunnel logique entre deux routeurs, un LAN par site.
 * Le registre R2 reste propriétaire des actifs, câbles et configurations.
 * Les trois liaisons directes sont contrôlées avec le Core ping existant.
 * Pas d'IPsec, d'IKE, de chiffrement ni de routage général multi-sauts.
 */
import {createEngine} from "./r2d3-core.js";
const fail=(code,message)=>({success:false,code,message});
const clone=x=>JSON.parse(JSON.stringify(x));
const ipv4=s=>{
 if(typeof s!=="string"||!/^\d{1,3}(\.\d{1,3}){3}$/.test(s))return null;
 const a=s.split(".").map(Number);
 if(a.some(n=>n>255))return null;
 return a.reduce((v,n)=>((v*256+n)>>>0),0);
};
const net=(address,prefix)=>{
 const ip=ipv4(address);
 if(ip===null||!Number.isInteger(prefix)||prefix<1||prefix>30)return null;
 const mask=(0xffffffff<<(32-prefix))>>>0;
 return {network:(ip&mask)>>>0,mask,prefix,ip};
};
const same=(a,b)=>a&&b&&a.network===b.network&&a.prefix===b.prefix;
const inside=(ip,n)=>ipv4(ip)!==null&&((ipv4(ip)&n.mask)>>>0)===n.network;
const asset=(registry,id)=>{
 const a=registry?.getAsset?.(id);
 return a?.networkCapabilities?.includes("ipv4-router")&&a.routerConfig?a:null;
};
const port=(router,id)=>router?.ports?.find(p=>p.id===id&&p.type==="ethernet-rj45");
const intf=(router,id)=>router?.routerConfig?.interfaces?.[id];
const config=router=>router?.routerConfig?.siteVpn??null;
export function getSiteVpnConfig(registry,routerId){
 const r=asset(registry,routerId);return r?clone(config(r)):null;
}
export function configureSiteVpn(registry,routerId,{wanPortId,lanPortId,peerAddress,remoteNetwork,remotePrefix,enabled=false}={}){
 const r=asset(registry,routerId);
 if(!r)return fail("router_missing","Routeur introuvable");
 const wan=intf(r,wanPortId),lan=intf(r,lanPortId);
 if(!port(r,wanPortId)||!wan||wan.role!=="wan"||wan.mode!=="static"||!net(wan.address,wan.prefix))
  return fail("wan_invalid","Choisir une interface WAN avec une IPv4 statique");
 if(!port(r,lanPortId)||lanPortId===wanPortId||!lan||lan.role!=="lan"||lan.mode!=="static"||!net(lan.address,lan.prefix))
  return fail("lan_invalid","Choisir une interface LAN avec une IPv4 statique");
 const remote=net(remoteNetwork,remotePrefix),local=net(lan.address,lan.prefix),outside=net(wan.address,wan.prefix);
 if(!remote||ipv4(remoteNetwork)!==remote.network||ipv4(peerAddress)===null||typeof enabled!=="boolean")
  return fail("settings_invalid","Adresse du pair, réseau distant ou état invalide");
 if(same(remote,local)||inside(remoteNetwork,local)||inside(lan.address,remote)||inside(peerAddress,local)||inside(peerAddress,remote)||
    inside(lan.address,outside)||inside(remoteNetwork,outside))
  return fail("network_overlap","Les réseaux LAN et WAN doivent rester distincts");
 const settings={wanPortId,lanPortId,peerAddress,remoteNetwork,remotePrefix,enabled};
 const updated=clone(r.routerConfig);updated.siteVpn=settings;
 const saved=registry.setAssetRouterConfig(routerId,updated);
 return saved.success?{success:true,config:clone(settings)}:fail("config_rejected",saved.message||"Configuration refusée");
}
/* Chaque segment doit être raccordé physiquement et accessible via le Core réseau. */
function segment(registry,source,sourcePort,srcIp,target,targetPort,dstIp){
 if(!port(source,sourcePort)||!port(target,targetPort))return fail("port_invalid","Port Ethernet absent");
 if(!registry.explorePhysicalPath(sourcePort,targetPort).connected)
  return fail("link_down","Liaison Ethernet interrompue");
 const scenario={
  format:"r2d3-scenario",schemaVersion:1,scenarioId:"site-vpn-segment",
  scenarioVersion:"0.1.0",capabilities:{network:true},
  objects:[
   {id:"left",kind:"ethernet-endpoint",name:"Extrémité A",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"static",address:srcIp.address,prefix:srcIp.prefix}},runtime:{}},
   {id:"right",kind:"ethernet-endpoint",name:"Extrémité B",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"static",address:dstIp.address,prefix:dstIp.prefix}},runtime:{}}
  ],
  links:[{id:"link",kind:"ethernet-cable",connected:true,endpoints:[{objectId:"left",portId:"eth0"},{objectId:"right",portId:"eth0"}]}]
 };
 const observed=createEngine(scenario).query({type:"network.ping",sourceId:"left",targetId:"right"});
 return observed.success?{success:true}:fail("segment_down",observed.reason||"Liaison IP inaccessible");
}
export function observeSiteVpnPing(registry,routerAId,routerBId,sourceId,targetId,addresses){
 if(!registry?.explorePhysicalPath)return fail("registry_missing","Registre physique indisponible");
 const a=asset(registry,routerAId),b=asset(registry,routerBId),
  source=registry?.getAsset?.(sourceId),target=registry?.getAsset?.(targetId);
 if(!a||!b||!source||!target||new Set([routerAId,routerBId,sourceId,targetId]).size!==4)
  return fail("assets_missing","Équipements manquants ou identiques");
 if([a,b,source,target].some(x=>x.status!=="En service"))return fail("device_down","Un équipement est arrêté");
 const ca=config(a),cb=config(b);
 if(!ca||!cb||!ca.enabled||!cb.enabled)return fail("tunnel_off","Tunnel VPN désactivé");
 const wa=intf(a,ca.wanPortId),wb=intf(b,cb.wanPortId),
  la=intf(a,ca.lanPortId),lb=intf(b,cb.lanPortId);
 if(!wa||!wb||!la||!lb||wa.role!=="wan"||wb.role!=="wan"||la.role!=="lan"||lb.role!=="lan"||
    [wa,wb,la,lb].some(i=>i.mode!=="static"))
  return fail("interface_invalid","Interfaces VPN incorrectes");
 const lanA=net(la.address,la.prefix),lanB=net(lb.address,lb.prefix),wanA=net(wa.address,wa.prefix),wanB=net(wb.address,wb.prefix);
 if(!lanA||!lanB||!same(wanA,wanB))return fail("wan_mismatch","Réseau WAN incompatible");
 if(ca.peerAddress!==wb.address||cb.peerAddress!==wa.address||
    !same(net(ca.remoteNetwork,ca.remotePrefix),lanB)||
    !same(net(cb.remoteNetwork,cb.remotePrefix),lanA))
  return fail("mirror_mismatch","Configurations des deux VPN non concordantes");
 const srcPort=source.ports.filter(p=>p.type==="ethernet-rj45");
 const dstPort=target.ports.filter(p=>p.type==="ethernet-rj45");
 if(srcPort.length!==1||dstPort.length!==1)return fail("client_invalid","Ce lot exige un port RJ45 par PC");
 const si=addresses?.[sourceId],ti=addresses?.[targetId];
 if(!si||!ti||!same(net(si.address,si.prefix),lanA)||!same(net(ti.address,ti.prefix),lanB)||
    si.gateway!==la.address||ti.gateway!==lb.address||si.address===la.address||ti.address===lb.address)
  return fail("address_invalid","Adresse IPv4 ou passerelle du PC incorrecte");
 for(const [left,lp,lip,right,rp,rip] of [
  [source,srcPort[0].id,si,a,ca.lanPortId,la],
  [a,ca.wanPortId,wa,b,cb.wanPortId,wb],
  [b,cb.lanPortId,lb,target,dstPort[0].id,ti]
 ]){
  const checked=segment(registry,left,lp,lip,right,rp,rip);
  if(!checked.success)return checked;
 }
 return {success:true,status:"ok",message:"Ping réussi entre les deux LAN par VPN site à site"};
}

/*
 * Résolution par un DNS configuré sur le PC source, jamais sur le tunnel.
 * L'accès au serveur DNS et à la cible doit être possible via le VPN.
 * Le Core DNS existant fournit seul la réponse et vérifie l'enregistrement A.
 */
export function observeSiteVpnPingName(registry,routerAId,routerBId,sourceId,targetId,addresses,name,
 {dnsEngine,dnsClientId,dnsAssetId}={}){
 const sourceDns=addresses?.[sourceId]?.dns;
 const servers=Array.isArray(sourceDns)?sourceDns:(typeof sourceDns==="string"&&sourceDns?[sourceDns]:[]);
 if(!servers.length)return fail("dns_missing","Aucun DNS configuré sur le PC A");
 if(!dnsAssetId||!dnsEngine?.query||!dnsClientId)return fail("dns_engine_missing","Serveur DNS non disponible");
 const configured=servers.find(ip=>ip===addresses?.[dnsAssetId]?.address);
 if(!configured)return fail("dns_wrong_server","Le DNS du PC A ne correspond pas au serveur disponible");
 const reachable=observeSiteVpnPing(registry,routerAId,routerBId,sourceId,dnsAssetId,addresses);
 if(!reachable.success)return fail("dns_unreachable","DNS inaccessible via le VPN : "+(reachable.message||"réseau interrompu"));
 const answer=dnsEngine.query({type:"dns.resolve",sourceId:dnsClientId,serverAddress:configured,name,recordType:"A"});
 if(answer.status!=="ok")return fail("dns_error",answer.reason||"Résolution DNS impossible");
 if(!answer.found)return fail("dns_not_found","Nom DNS inconnu");
 if(answer.address!==addresses?.[targetId]?.address)return fail("dns_wrong_target","Le nom ne correspond pas au PC B");
 const ping=observeSiteVpnPing(registry,routerAId,routerBId,sourceId,targetId,addresses);
 return ping.success?{...ping,resolvedAddress:answer.address,dnsServer:configured,name}:ping;
}

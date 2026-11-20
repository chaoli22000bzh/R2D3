/*
 * Routeur DHCP et IP Helper R2D3.
 * Les plages sont liées aux interfaces LAN/DMZ (pas à des VLAN).
 * Aucun second moteur DHCP : le Core attribue les baux.
 */
import {normalizeDhcpExclusions} from "./switch-dhcp-service-v1.js";
import {getAssetIpHelperConfig} from "./ip-helper-v1.js";
import {relayDhcpViaCommonEngine} from "./dhcp-relay-common-v01.js";
const fail=(code,message)=>({success:false,code,message});
const copy=x=>JSON.parse(JSON.stringify(x));
const ipNum=s=>typeof s==="string"&&/^\d{1,3}(\.\d{1,3}){3}$/.test(s)&&
 s.split(".").every(x=>+x<=255)?s.split(".").reduce((v,x)=>(v*256+Number(x))>>>0,0):null;
const network=(s,p)=>{const n=ipNum(s);return n===null||!Number.isInteger(p)||p<1||p>30?null:(n&((0xffffffff<<(32-p))>>>0))>>>0;};
const isSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const router=(reg,id)=>{const a=reg?.getAsset?.(id);return a?.networkCapabilities?.includes("ipv4-router")?a:null;};
const ethernet=a=>a.ports.filter(p=>p.type==="ethernet-rj45");
const connected=(reg,device,rt)=>{
 const ports=ethernet(device);
 if(ports.length!==1)return fail("client_port","L'équipement nécessite un port RJ45 unique");
 const portsRouter=ethernet(rt).filter(p=>reg.explorePhysicalPath(ports[0].id,p.id).connected);
 return portsRouter.length===1?{success:true,portId:portsRouter[0].id}:
  fail(portsRouter.length?"topology_ambiguous":"link_down",
   portsRouter.length?"Plusieurs interfaces candidates":"Câble Ethernet interrompu");
};
export function getRouterDhcpConfig(reg,routerId){
 const a=router(reg,routerId);
 return a?.networkCapabilities?.includes("dhcp-server")?copy(a.dhcpServerConfig):null;
}
export function configureRouterDhcp(reg,routerId,{enabled,pools}={}){
 const a=router(reg,routerId);
 if(!a?.networkCapabilities?.includes("dhcp-server"))return fail("unsupported","DHCP indisponible sur ce routeur");
 if(typeof enabled!=="boolean"||!Array.isArray(pools))return fail("invalid_config","Plages ou état DHCP incorrects");
 const normalized=normalizeDhcpExclusions(pools);
 if(!normalized.success)return normalized;
 return reg.setAssetDhcpServerConfig(routerId,{assetId:routerId,enabled,pools:normalized.pools});
}
const corePools=pools=>pools.map(({portId,...pool})=>copy(pool));
export function createRouterDhcpCoreObject(reg,routerId){
 const a=router(reg,routerId),conf=getRouterDhcpConfig(reg,routerId);
 if(!a||!conf)return null;
 const iface=Object.values(a.routerConfig.interfaces).find(i=>i.role==="lan"&&i.mode==="static")||
  Object.values(a.routerConfig.interfaces).find(i=>i.role==="dmz"&&i.mode==="static");
 return {id:a.id,kind:"ipv4-router",name:a.name,
  ports:ethernet(a).map(p=>({id:p.id,type:"rj45"})),
  config:{
   ...(iface?{ipv4:{interfaceId:ethernet(a).find(p=>a.routerConfig.interfaces[p.id]===iface)?.id,
    mode:"static",address:iface.address,prefix:iface.prefix}}:{}),
   ...(conf.pools.length?{dhcpPools:corePools(conf.pools),dhcpEnabled:conf.enabled}:{})
  }};
}
export function requestRouterDhcp({registry,routerId,clientId,dhcpEngine,commandId}){
 if(!dhcpEngine?.getSnapshot||!dhcpEngine?.dispatch||!dhcpEngine?.query)
  return fail("missing_core","Moteur DHCP commun indisponible");
 const rt=router(registry,routerId),client=registry?.getAsset?.(clientId),conf=getRouterDhcpConfig(registry,routerId);
 if(!rt||!client||!conf)return fail("assets_missing","Routeur DHCP ou poste introuvable");
 if(rt.status!=="En service"||client.status!=="En service")return fail("offline","Équipement hors service");
 const path=connected(registry,client,rt);
 if(!path.success)return path;
 const port=rt.routerConfig.interfaces[path.portId];
 if(!port||!["lan","dmz"].includes(port.role)||port.mode!=="static")
  return fail("invalid_interface","Interface LAN ou DMZ statique requise");
 const matching=conf.pools.filter(p=>p.portId===path.portId);
 if(matching.length!==1)return fail(matching.length?"ambiguous_pool":"missing_pool",
  matching.length?"Plages DHCP ambiguës":"Aucune plage DHCP pour cette interface");
 const pool=matching[0];
 if(network(pool.start,pool.prefix)!==network(port.address,port.prefix)||pool.prefix!==port.prefix||pool.gateway!==port.address)
  return fail("invalid_pool","Plage incompatible avec l'interface");
 const state=dhcpEngine.getSnapshot(),coreServer=state.objectsById?.[routerId],coreClient=state.objectsById?.[clientId];
 if(!coreServer||coreClient?.config?.ipv4?.mode!=="dhcp")return fail("missing_core_asset","Équipements absents du Core DHCP");
 const observed=dhcpEngine.query({type:"dhcp.pools",serverId:routerId});
 if(observed.status!=="ok"||observed.enabled!==conf.enabled||!isSame(observed.pools,corePools(conf.pools)))
  return fail("out_of_sync","Moteur DHCP et registre R2 non synchronisés");
 const result=dhcpEngine.dispatch({commandVersion:1,id:commandId||"router-dhcp-"+(state.revision+1),
  type:"dhcp.request",targetId:clientId,params:{serverId:routerId,poolId:pool.id}});
 if(result.status!=="applied")return fail("core_rejected",result.message||"Requête refusée");
 const next=dhcpEngine.getSnapshot(),ip=next.objectsById[clientId].config.ipv4;
 return {success:next.runtime?.[clientId]?.dhcpStatus==="lease",code:next.runtime?.[clientId]?.dhcpStatus||"unknown",
  address:ip.address,prefix:ip.prefix,lease:copy(ip.lease),portId:path.portId,serverId:routerId};
}
/* Relais : vérifie les deux segments réels et les réseaux, puis délègue
 * exclusivement à l'adaptateur DHCP commun. Pas de routage inventé.
 * V1 : PC et serveur chacun raccordés directement à un port distinct du routeur.
 */
export function requestRouterRelayedDhcp({registry,routerId,clientId,serverId,serverAddress,dhcpEngine,commandId}){
 const rt=router(registry,routerId),client=registry?.getAsset?.(clientId),server=registry?.getAsset?.(serverId);
 const helper=getAssetIpHelperConfig(registry,routerId);
 if(!rt||!client||!server||!helper)return fail("assets_missing","Routeur, client ou serveur IP Helper indisponible");
 if(new Set([routerId,clientId,serverId]).size!==3)return fail("invalid_assets","Équipements distincts requis");
 if([rt,client,server].some(a=>a.status!=="En service"))return fail("offline","Équipement hors service");
 const cp=connected(registry,client,rt),sp=connected(registry,server,rt);
 if(!cp.success)return cp;
 if(!sp.success)return sp;
 if(cp.portId===sp.portId)return fail("same_interface","Serveur et client doivent être sur des interfaces différentes");
 const ci=rt.routerConfig.interfaces[cp.portId],si=rt.routerConfig.interfaces[sp.portId];
 if(!ci||!si||!["lan","dmz"].includes(ci.role)||!["lan","dmz"].includes(si.role)||
    ci.mode!=="static"||si.mode!=="static")
  return fail("invalid_interface","Interfaces LAN/DMZ statiques nécessaires");
 if(network(ci.address,ci.prefix)===null||network(si.address,si.prefix)===null||
    network(ci.address,ci.prefix)===network(si.address,si.prefix))
  return fail("invalid_network","Réseaux client et serveur distincts requis");
 if(ipNum(serverAddress)===null||network(serverAddress,si.prefix)!==network(si.address,si.prefix))
  return fail("server_network","Serveur DHCP hors du réseau de son interface");
 const options={registry,routerId,clientId,serverId,dhcpEngine,serverAddress,commandId};
 const transport={kind:ci.role==="dmz"?"dmz":"router",reachable:true};
 return relayDhcpViaCommonEngine({dhcpEngine,clientId,serverId,serverAddress,
  clientNetwork:{address:ci.address,prefix:ci.prefix},
  helper:helper.helpers["interface:"+cp.portId],transport,commandId});
}

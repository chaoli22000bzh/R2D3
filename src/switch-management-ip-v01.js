/*
 * IP de gestion des switchs administrables : statique ou client DHCP.
 * L'adresse d'administration est indépendante du routage des utilisateurs.
 * Aucun serveur DHCP parallèle : attribution déléguée au Core R2D3.
 */
const copy=x=>JSON.parse(JSON.stringify(x));
const reject=(code,message)=>({success:false,code,message});
export function getSwitchManagement(registry,assetId){
 const a=registry?.getAsset?.(assetId);
 return a?.networkCapabilities?.includes("vlan")?copy(a.managementConfig):null;
}
function set(registry,id,config){
 if(typeof registry?.setAssetManagementConfig!=="function")
  return reject("registry_missing","Registre R2 incompatible");
 return registry.setAssetManagementConfig(id,config);
}
export function configureSwitchManagementStatic(registry,id,address,prefix,gateway=null){
 const old=getSwitchManagement(registry,id);
 if(!old)return reject("not_managed","Switch non administrable");
 return set(registry,id,{assetId:id,mode:"static",address,prefix,gateway,lease:null});
}
export function configureSwitchManagementDhcp(registry,id){
 const old=getSwitchManagement(registry,id);
 if(!old)return reject("not_managed","Switch non administrable");
 return set(registry,id,{assetId:id,mode:"dhcp",address:null,prefix:null,gateway:null,lease:null});
}
export function acquireSwitchManagementDhcp({registry,switchId,serverId,dhcpEngine,poolId,commandId}){
 const sw=registry?.getAsset?.(switchId),server=registry?.getAsset?.(serverId);
 const conf=getSwitchManagement(registry,switchId);
 if(!sw||!server||!conf)return reject("not_found","Switch ou serveur absent");
 if(conf.mode!=="dhcp")return reject("not_dhcp","Switch non configuré en DHCP");
 if(sw.status!=="En service"||server.status!=="En service")
  return reject("offline","Équipement hors service");
 if(typeof registry?.explorePhysicalPath!=="function"||
    typeof dhcpEngine?.getSnapshot!=="function"||
    typeof dhcpEngine?.dispatch!=="function"||typeof dhcpEngine?.query!=="function")
  return reject("engine_missing","Moteur R2 ou DHCP indisponible");
 // Port Access du VLAN 1 uniquement en V0.1. Ne pas inventer une
 // connectivité à travers les VLAN, un Trunk ou IP Helper.
 const direct=server.ports.filter(p=>p.type==="ethernet-rj45").flatMap(sp=>
  sw.ports.filter(p=>p.type==="ethernet-rj45"&&
    registry.explorePhysicalPath(sp.id,p.id).connected));
 const access=direct.filter(p=>{
  const c=sw.vlanConfig?.ports[p.id];
  return c?.mode==="access"&&
    sw.vlanConfig.vlans.some(v=>v.id===c.vlanId&&v.number===1);
 });
 if(access.length!==1)return reject("network_unavailable","Serveur DHCP non raccordé au VLAN de gestion 1");
 const before=dhcpEngine.getSnapshot();
 const client=before.objectsById?.[switchId],srv=before.objectsById?.[serverId];
 if(!client||!srv||client.config?.ipv4?.mode!=="dhcp")
  return reject("client_missing","Client DHCP de gestion absent du Core");
 const available=dhcpEngine.query({type:"dhcp.pools",serverId});
 if(available.status!=="ok"||!available.enabled)return reject("server_off","Serveur DHCP indisponible");
 if(!available.pools.some(p=>p.id===poolId))
  return reject("pool_missing","Plage DHCP non trouvée");
 const response=dhcpEngine.dispatch({commandVersion:1,
  id:commandId||"mgmt-"+switchId+"-"+(before.revision+1),
  type:"dhcp.request",targetId:switchId,params:{serverId,poolId}});
 if(response.status!=="applied")
  return reject("request_failed",response.message||response.code||"Demande DHCP refusée");
 const current=dhcpEngine.getSnapshot();
 const state=current.objectsById?.[switchId]?.config;
 if(current.runtime?.[switchId]?.dhcpStatus!=="lease"||!state?.ipv4?.lease)
  return reject("no_lease","Aucun bail DHCP attribué");
 const lease=copy(state.ipv4.lease);
 const result=set(registry,switchId,{
  assetId:switchId,mode:"dhcp",address:state.ipv4.address,
  prefix:state.ipv4.prefix,gateway:state.networkOptions?.gateway??null,lease
 });
 return result.success?{...result,address:state.ipv4.address,poolId:lease.poolId}:
  result;
}

/*
 * Relecture de l'état du vrai Core DHCP après progression de l'horloge.
 * Un câble coupé n'efface jamais le bail. T1/T2 échoués le conservent,
 * puis le Core calcule une APIPA uniquement à l'expiration.
 */
export function syncSwitchManagementDhcp(registry,switchId,dhcpEngine){
 const conf=getSwitchManagement(registry,switchId);
 if(!conf||conf.mode!=="dhcp")return reject("not_dhcp","Switch non configuré en DHCP");
 if(typeof dhcpEngine?.getSnapshot!=="function")return reject("engine_missing","Core DHCP indisponible");
 const state=dhcpEngine.getSnapshot(),client=state.objectsById?.[switchId];
 const ipv4=client?.config?.ipv4;
 if(!ipv4||ipv4.mode!=="dhcp")return reject("client_missing","Client DHCP absent du Core");
 const runtime=state.runtime?.[switchId];
 const validLease=ipv4.lease&&ipv4.lease.expires>state.simulationClock;
 const apipa=runtime?.dhcpStatus==="apipa"&&ipv4.address?.startsWith("169.254.")&&
   ipv4.prefix===16&&!ipv4.lease;
 const next=validLease?{
   assetId:switchId,mode:"dhcp",address:ipv4.address,prefix:ipv4.prefix,
   gateway:client.config.networkOptions?.gateway??null,lease:copy(ipv4.lease)
  }:apipa?{
   assetId:switchId,mode:"dhcp",address:ipv4.address,prefix:16,gateway:null,lease:null
  }:{assetId:switchId,mode:"dhcp",address:null,prefix:null,gateway:null,lease:null};
 const result=set(registry,switchId,next);
 return result.success?{...result,dhcpStatus:runtime?.dhcpStatus??"unassigned",
  leasePhase:runtime?.dhcpLeasePhase??null,simulationClock:state.simulationClock}:result;
}

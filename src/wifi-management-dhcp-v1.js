/* Adresse de gestion DHCP d'une borne Wi-Fi, déléguée au Core R2D3.
 * Le chemin Ethernet est vérifié dans le registre avant toute liaison Core.
 * Aucun serveur ni générateur APIPA supplémentaire.
 */
import {createEngine} from "./r2d3-core.js";
import {createRouterDhcpCoreObject} from "./router-dhcp-service-v1.js";
import {createSwitchDhcpCoreObject} from "./switch-dhcp-service-v1.js";
const fail=(code,message)=>({success:false,code,message});
const copy=x=>JSON.parse(JSON.stringify(x));
const ipInt=x=>typeof x==="string"&&/^\d{1,3}(\.\d{1,3}){3}$/.test(x)&&x.split(".").every(n=>Number(n)<=255)?
 x.split(".").reduce((v,n)=>(v*256+Number(n))>>>0,0):null;
const sameNet=(a,b,p)=>{const x=ipInt(a),y=ipInt(b);return x!==null&&y!==null&&Number.isInteger(p)&&p>=1&&p<=30&&
 (x&((0xffffffff<<(32-p))>>>0))===(y&((0xffffffff<<(32-p))>>>0));};
const ethernet=a=>a.ports.filter(p=>p.type==="ethernet-rj45");
const linked=(r,p,q)=>r.explorePhysicalPath(p.id,q.id).connected;
function detectServer(registry,ap){
 const uplinks=ethernet(ap);
 if(uplinks.length!==1)return {invalid:"Un seul port Ethernet de borne est requis."};
 if(typeof registry.explorePhysicalPath!=="function")return {invalid:"Registre de câblage indisponible."};
 const candidates=[];
 for(const other of registry.listAssets()){
  if(other.id===ap.id||other.status!=="En service")continue;
  for(const port of ethernet(other)){
   if(!linked(registry,uplinks[0],port))continue;
   if(other.networkCapabilities?.includes("ipv4-router")&&other.networkCapabilities.includes("dhcp-server")){
    const iface=other.routerConfig?.interfaces?.[port.id];
    const conf=other.dhcpServerConfig;
    const pool=conf?.pools?.filter(p=>p.portId===port.id)??[];
    if(iface&&["lan","dmz"].includes(iface.role)&&iface.mode==="static"&&
       pool.length===1&&pool[0].gateway===iface.address&&pool[0].prefix===iface.prefix&&
       sameNet(pool[0].start,iface.address,iface.prefix)){
      const obj=createRouterDhcpCoreObject(registry,other.id);
      if(obj){
       const projection=copy(obj);
       projection.config.ipv4={interfaceId:port.id,mode:"static",address:iface.address,prefix:iface.prefix};
       projection.config.dhcpPools=pool.map(({portId,...p})=>copy(p));
       projection.config.dhcpEnabled=!!conf.enabled;
       candidates.push({server:projection,asset:other,port,pool:pool[0]});
      }
    }
   }
   if(other.networkCapabilities?.includes("inter-vlan-routing")&&other.networkCapabilities.includes("dhcp-server")){
    const vlanPort=other.vlanConfig?.ports?.[port.id],vlan=other.vlanConfig?.vlans?.find(v=>v.number===1);
    const access=vlanPort?.mode==="access"&&vlanPort.vlanId===vlan?.id;
    const trunk=vlanPort?.mode==="trunk"&&vlanPort.allowedVlanIds?.includes(vlan?.id);
    const svi=other.routingConfig?.interfaces?.["1"];
    const conf=other.dhcpServerConfig,pool=conf?.pools?.filter(p=>p.vlanNumber===1)??[];
    if((access||trunk)&&svi?.enabled&&pool.length===1&&
       pool[0].gateway===svi.address&&pool[0].prefix===svi.prefix&&
       sameNet(pool[0].start,svi.address,svi.prefix)){
      const obj=createSwitchDhcpCoreObject(registry,other.id);
      if(obj){
       const projection=copy(obj);
       projection.config.ipv4={interfaceId:port.id,mode:"static",address:svi.address,prefix:svi.prefix};
       projection.config.dhcpPools=pool.map(({vlanNumber,...p})=>copy(p));
       projection.config.dhcpEnabled=!!conf.enabled;
       candidates.push({server:projection,asset:other,port,pool:pool[0]});
      }
    }
   }
  }
 }
 // Plusieurs chemins DHCP valides : ne pas attribuer arbitrairement un bail.
 if(candidates.length>1)return {invalid:"Plusieurs serveurs DHCP candidats : topologie ambiguë."};
 return {candidate:candidates[0]??null,uplink:uplinks[0]};
}
const coreClient=(ap,port,serverId=null)=>{
 const mg=ap.managementConfig,previous=mg?.mode==="dhcp"&&mg.lease?.serverId===serverId&&
  Number.isInteger(mg.lease.start)&&Number.isInteger(mg.lease.expires)&&mg.lease.expires>mg.lease.start;
 const idNumber=Number(ap.id.match(/\d+$/)?.[0]||1);
 return {id:ap.id,kind:"pc-windows",name:ap.name,
  ports:[{id:port.id,type:"rj45"}],
  config:{macAddress:"02-00-00-00-"+Math.floor(idNumber/256%256).toString(16).padStart(2,"0")+"-"+(idNumber%256).toString(16).padStart(2,"0"),
   ipv4:{interfaceId:port.id,mode:"dhcp",address:previous?mg.address:null,
    prefix:previous?mg.prefix:null,lease:previous?copy(mg.lease):null},
   networkOptions:{gateway:previous?mg.gateway:null,dns:previous?copy(mg.dns):[]}}
 };
};
function persistCore(registry,apId,engine){
 const snap=engine.getSnapshot(),node=snap.objectsById?.[apId],ip=node?.config?.ipv4;
 if(ip?.mode!=="dhcp")return fail("core_client_missing","Client DHCP absent du Core.");
 const status=snap.runtime?.[apId]?.dhcpStatus;
 const leased=ip.lease&&ip.lease.expires>snap.simulationClock;
 const apipa=status==="apipa"&&/^169\.254\./.test(ip.address||"")&&ip.prefix===16;
 const state=leased?{address:ip.address,prefix:ip.prefix,
  gateway:node.config.networkOptions?.gateway??null,
  dns:copy(node.config.networkOptions?.dns??[]),lease:copy(ip.lease)}
  :apipa?{address:ip.address,prefix:16,gateway:null,dns:[],lease:null}
  :{address:null,prefix:null,gateway:null,dns:[],lease:null};
 const saved=registry.setAssetManagementConfig(apId,{assetId:apId,mode:"dhcp",...state});
 return saved.success?{success:true,code:leased?"lease":apipa?"apipa":"unassigned",
  dhcpStatus:status??"unassigned",address:state.address,prefix:state.prefix,
  gateway:state.gateway,dns:state.dns,lease:state.lease,
  simulationClock:snap.simulationClock}:saved;
}
export function requestWifiManagementDhcp({registry,apId}={}){
 const ap=registry?.getAsset?.(apId);
 if(!ap?.networkCapabilities?.includes("wifi-ap"))return fail("ap_missing","Borne Wi-Fi introuvable.");
 if(ap.managementConfig?.mode!=="dhcp")return fail("not_dhcp","Borne non configurée en DHCP.");
 if(ap.status!=="En service")return fail("offline","Borne hors service.");
 const route=detectServer(registry,ap);
 if(route.invalid)return fail("topology_invalid",route.invalid);
 const {candidate,uplink}=route;
 const objects=[coreClient(ap,uplink,candidate?.asset.id??null)],links=[];
 // Les baux déjà attribués à d'autres bornes restent connus du Core ;
 // un nouveau client ne peut pas reprendre une IPv4 encore louée.
 if(candidate){
  for(const peer of registry.listAssets()){
   if(peer.id===apId||!peer.networkCapabilities?.includes("wifi-ap")||
      peer.managementConfig?.lease?.serverId!==candidate.asset.id)continue;
   const p=ethernet(peer)[0];
   if(p)objects.push(coreClient(peer,p,candidate.asset.id));
  }
 }
 if(candidate){
  objects.push(candidate.server);
  links.push({id:"wifi-management-link",kind:"ethernet-cable",connected:true,
   endpoints:[{objectId:apId,portId:uplink.id},
    {objectId:candidate.asset.id,portId:candidate.port.id}]});
 }
 let engine;
 try{engine=createEngine({format:"r2d3-scenario",schemaVersion:1,
   scenarioId:"wifi-management-dhcp",scenarioVersion:"1",capabilities:{network:true},
   objects,links});}
 catch(e){return fail("core_scenario_invalid",e.message);}
 const params=candidate&&candidate.server.config.dhcpEnabled?
  {serverId:candidate.asset.id,poolId:candidate.pool.id}:{};
 const reply=engine.dispatch({commandVersion:1,id:"wifi-management-request",
  type:"dhcp.request",targetId:apId,params});
 if(reply.status!=="applied")return fail("core_rejected",reply.message||reply.code||"Demande DHCP refusée.");
 const result=persistCore(registry,apId,engine);
 return {...result,serverId:candidate?.asset.id??null,engine};
}
export function syncWifiManagementDhcp({registry,apId,engine}={}){
 if(registry?.getAsset?.(apId)?.managementConfig?.mode!=="dhcp")return fail("not_dhcp","Borne non configurée en DHCP.");
 if(!engine?.getSnapshot)return fail("engine_missing","Core DHCP indisponible.");
 return persistCore(registry,apId,engine);
}

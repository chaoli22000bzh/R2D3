/*
 * Pont Wi-Fi -> DHCP local du routeur R2D3, premier scénario autonome.
 * Vérifie l'association et le câble physique avant d'employer le Core DHCP commun.
 * Le lien client/routeur du scénario Core représente le segment L2 radio + Ethernet
 * déjà contrôlé, il n'est pas un câble ajouté au registre.
 * Pas de VLAN/trunk/relay dans ce lot.
 */
import {createEngine} from "./r2d3-core.js";
import {createRouterDhcpCoreObject,getRouterDhcpConfig} from "./router-dhcp-service-v1.js";
import {associateWifiClient} from "./wifi-ap-v1.js";
const fail=(code,message)=>({success:false,code,message});
export function requestWifiRouterDhcp({registry,apId,routerId,clientId,ssidId="ssid-1",password="",bands=["2.4","5"],security=["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"],macAddress="02-00-00-00-10-01"}={}){
 const association=associateWifiClient(registry,{apId,ssidId,password,bands,security});
 if(!association.success)return association;
 const ap=registry.getAsset(apId),router=registry.getAsset(routerId),client=registry.getAsset(clientId);
 if(!router?.networkCapabilities?.includes("ipv4-router")||!client)return fail("missing_assets","Routeur ou client introuvable.");
 if(router.status!=="En service"||client.status!=="En service")return fail("offline","Routeur ou client hors service.");
 const uplinks=ap.ports.filter(p=>p.type==="ethernet-rj45"),routerPorts=router.ports.filter(p=>p.type==="ethernet-rj45");
 if(uplinks.length!==1)return fail("invalid_ap_uplink","Une seule interface Ethernet de borne attendue.");
 const connected=routerPorts.filter(p=>registry.explorePhysicalPath(uplinks[0].id,p.id).connected);
 if(connected.length!==1)return fail(connected.length?"ambiguous_path":"link_down",connected.length?"Plusieurs chemins Ethernet ambiguës.":"La borne n'est pas raccordée au routeur.");
 const port=connected[0],iface=router.routerConfig?.interfaces?.[port.id];
 if(!iface||!["lan","dmz"].includes(iface.role)||iface.mode!=="static")
  return fail("invalid_router_port","Interface LAN/DMZ statique nécessaire.");
 const dhcp=getRouterDhcpConfig(registry,routerId);
 if(!dhcp)return fail("dhcp_unavailable","Le routeur ne fournit pas de DHCP.");
 const pools=dhcp.pools.filter(p=>p.portId===port.id);
 if(pools.length!==1)return fail("missing_pool",pools.length?"Plusieurs plages DHCP sur l'interface.":"Aucune plage DHCP pour le réseau Wi-Fi.");
 const pool=pools[0];
 if(pool.gateway!==iface.address||pool.prefix!==iface.prefix)return fail("invalid_pool","Passerelle ou préfixe DHCP incompatibles.");
 const coreRouter=createRouterDhcpCoreObject(registry,routerId);
 if(!coreRouter)return fail("missing_core_asset","Routeur absent du moteur DHCP.");
 const coreClient={id:clientId,kind:"pc-windows",name:client.name,ports:[{id:"wifi-logical",type:"rj45"}],
  config:{macAddress,ipv4:{interfaceId:"wifi-logical",mode:"dhcp",address:null,prefix:null,lease:null},
   networkOptions:{gateway:null,dns:[]}}};
 let engine;
 try{
  engine=createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"wifi-router-dhcp",
   scenarioVersion:"1",capabilities:{network:true},objects:[coreClient,coreRouter],
   links:[{id:"wifi-bridge-path",kind:"ethernet-cable",connected:true,
     endpoints:[{objectId:clientId,portId:"wifi-logical"},{objectId:routerId,portId:port.id}]}]});
 }catch(e){return fail("core_scenario_invalid",e.message);}
 const cmd=engine.dispatch({commandVersion:1,id:"wifi-dhcp-request",type:"dhcp.request",
  targetId:clientId,params:{serverId:routerId,poolId:pool.id}});
 if(cmd.status!=="applied")return fail("core_rejected",cmd.message||cmd.code||"Requête DHCP refusée.");
 const snapshot=engine.getSnapshot(),ip=snapshot.objectsById[clientId].config.ipv4;
 const lease=snapshot.runtime?.[clientId]?.dhcpStatus==="lease";
 return {success:lease,code:lease?"lease":"apipa",message:lease?"Bail attribué par le Core DHCP.":"Aucun bail : adressage APIPA.",
  address:ip.address,prefix:ip.prefix,lease:ip.lease,
  gateway:snapshot.objectsById[clientId].config.networkOptions.gateway,
  dns:snapshot.objectsById[clientId].config.networkOptions.dns,
  apId,routerPortId:port.id};
}

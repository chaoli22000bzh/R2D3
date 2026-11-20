/*
 * R2D3 Wi-Fi isolation mode, lot 4.
 * Deux clients associés à la même borne et au même SSID sur VLAN du switch L3.
 * Reprend la validation d'association, Trunk et DHCP du lot 3, puis maintient
 * une seule session Core : les deux baux sont réellement distincts.
 * La politique client-à-client est évaluée sur la configuration R2 actuelle,
 * après le contrôle de communication IPv4 du Core ; ni case cosmétique,
 * ni faux ping répondu systématiquement.
 */
import {createEngine} from "./r2d3-core.js";
import {getSwitchDhcpConfig,createSwitchDhcpCoreObject} from "./switch-dhcp-service-v1.js";
import {requestWifiVlanDhcp} from "./wifi-vlan-dhcp-v1.js";
const fail=(code,message)=>({success:false,code,message});
const same=(a,b)=>a===b;
export function createWifiIsolationSession({registry,apId,switchId,ssidId,clients}={}){
 if(!registry?.getAsset||!Array.isArray(clients)||clients.length!==2||
   clients.some(c=>!c||!c.clientId||typeof c.password!=="string")||
   clients[0].clientId===clients[1].clientId)return fail("invalid_clients","Deux clients Wi-Fi distincts sont requis.");
 const ap=registry.getAsset(apId),sw=registry.getAsset(switchId);
 const ssid=ap?.wifiConfig?.ssids?.find(s=>s.id===ssidId);
 if(!ssid||!sw)return fail("missing_assets","Borne, SSID ou switch introuvable.");
 const checks=clients.map((client,i)=>requestWifiVlanDhcp({
   registry,apId,switchId,ssidId,clientId:client.clientId,password:client.password,
   bands:client.bands??["2.4","5"],security:client.security??["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"],
   macAddress:client.macAddress??("02-00-00-00-10-0"+(i+1))
 }));
 const bad=checks.find(c=>!c.success);if(bad)return bad;
 const vlanNumber=checks[0].vlanNumber;
 if(!same(vlanNumber,checks[1].vlanNumber))return fail("vlan_mismatch","Les deux clients doivent partager le VLAN du SSID.");
 const config=getSwitchDhcpConfig(registry,switchId),pool=config.pools.find(p=>p.vlanNumber===vlanNumber);
 const coreServer=createSwitchDhcpCoreObject(registry,switchId);
 if(!coreServer||!pool)return fail("missing_core","Core DHCP ou plage VLAN indisponible.");
 const portId=checks[0].portId;
 const ids=clients.map(c=>c.clientId);
 const coreClients=clients.map((c,i)=>({
   id:c.clientId,kind:"pc-windows",name:registry.getAsset(c.clientId).name,
   ports:[{id:"wifi-client",type:"rj45"}],
   config:{macAddress:c.macAddress??("02-00-00-00-10-0"+(i+1)),
    ipv4:{interfaceId:"wifi-client",mode:"dhcp",address:null,prefix:null,lease:null},
    networkOptions:{gateway:null,dns:[]}}
 }));
 let core;
 try{
  core=createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"wifi-isolation",
    scenarioVersion:"1",capabilities:{network:true},objects:[...coreClients,coreServer],
    links:ids.map((id,i)=>({id:"radio-client-"+i,kind:"ethernet-cable",connected:true,
      endpoints:[{objectId:id,portId:"wifi-client"},{objectId:switchId,portId}]}))
  });
 }catch(e){return fail("core_invalid",e.message);}
 for(let i=0;i<ids.length;i++){
  const r=core.dispatch({commandVersion:1,id:"wifi-lease-"+i,type:"dhcp.request",targetId:ids[i],
    params:{serverId:switchId,poolId:pool.id}});
  if(r.status!=="applied")return fail("dhcp_rejected",r.message||r.code||"DHCP refusé.");
  if(core.getSnapshot().runtime[ids[i]]?.dhcpStatus!=="lease")
    return fail("dhcp_missing","Le client "+(i+1)+" ne reçoit pas de bail.");
 }
 const addresses=()=>ids.map(id=>core.getSnapshot().objectsById[id].config.ipv4.address);
 const pingPeers=()=>{
  const liveAp=registry.getAsset(apId),liveSsid=liveAp?.wifiConfig?.ssids?.find(s=>s.id===ssidId);
  if(!liveAp||liveAp.status!=="En service"||!liveAp.wifiConfig?.enabled||!liveSsid?.enabled)
    return fail("ssid_unavailable","Le réseau Wi-Fi est désactivé.");
  const base=core.query({type:"network.ping",sourceId:ids[0],targetId:ids[1]});
  if(base.status!=="ok"||!base.success)
    return fail("ip_unreachable",base.reason||"Communication IP impossible.");
  if(liveSsid.clientIsolation)
    return fail("client_isolation","Isolation mode actif : la borne bloque la communication directe entre clients du même SSID.");
  return {success:true,code:"reply",message:"Réponse ping reçue entre les deux clients du SSID.",source:base.source,target:base.target};
 };
 const pingGateway=()=>{
  const liveAp=registry.getAsset(apId),liveSsid=liveAp?.wifiConfig?.ssids?.find(s=>s.id===ssidId);
  if(!liveAp||liveAp.status!=="En service"||!liveAp.wifiConfig?.enabled||!liveSsid?.enabled)
   return fail("ssid_unavailable","Le Wi-Fi est désactivé.");
  const ping=core.query({type:"network.ping",sourceId:ids[0],targetId:switchId});
  return ping.status==="ok"&&ping.success?
    {success:true,code:"reply",message:"Passerelle joignable : Isolation mode ne bloque pas le switch L3.",target:ping.target}:
    fail("gateway_unreachable",ping.reason||"Passerelle inaccessible.");
 };
 return {success:true,code:"ready",addresses:addresses(),ssidId,vlanNumber,pingPeers,pingGateway};
}

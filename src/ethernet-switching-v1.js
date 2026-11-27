/*
 * Commutation Ethernet simple V1.
 * Le registre R2 possède les câbles, ports, lieux et capacités matérielles.
 * Cette lecture ne modifie aucun état et n'enregistre aucune topologie parallèle.
 * Périmètre : Ethernet RJ45 non étiqueté, switchs non administrables, sans VLAN/STP/routage.
 */
import {createEngine} from "./r2d3-core.js";

const unavailable=reason=>({status:"unavailable",success:false,reason});
const isEthernet=p=>p?.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45";
const live=a=>a?.status==="En service";

/* Continuité Ethernet simple, utilisée par le ping et les clients DHCP.
 * Les câbles/prises/panneaux proviennent du registre, la commutation active
 * existe uniquement sur un équipement déclaré comme switch Ethernet.
 * Ne traverse pas un équipement hors service, n'infère aucun VLAN.
 */
export function ethernetPortReachable(registry,fromPortId,toPortId){
 if(!registry||["listAssets","listCables","listWallOutlets","listPanels","listCablePoints"]
    .some(fn=>typeof registry[fn]!=="function"))return false;
 const ids=new Set(registry.listCablePoints()
  .filter(p=>p.portType==="ethernet-rj45").map(p=>p.portId));
 if(!ids.has(fromPortId)||!ids.has(toPortId))return false;
 const graph=new Map([...ids].map(id=>[id,new Set()]));
 const link=(a,b)=>{
  if(!graph.has(a)||!graph.has(b))return;
  graph.get(a).add(b);graph.get(b).add(a);
 };
 for(const cable of registry.listCables()){
  const a=cable.ends?.[0]?.portId,b=cable.ends?.[1]?.portId;
  if(a&&b)link(a,b);
 }
 for(const infrastructure of [...registry.listWallOutlets(),...registry.listPanels()])
  for(const slot of infrastructure.ports)link(slot.front.id,slot.back.id);
 for(const asset of registry.listAssets()){
  if(!live(asset)||!asset.networkCapabilities?.includes("ethernet-switching"))continue;
  // VLAN configurés : la continuité L2 dépend d'un autre mécanisme VLAN.
  if(asset.vlanConfig)continue;
  const ports=asset.ports.filter(isEthernet).map(p=>p.id);
  for(let i=0;i<ports.length;i++)
   for(let j=i+1;j<ports.length;j++)link(ports[i],ports[j]);
 }
 const visited=new Set([fromPortId]),queue=[fromPortId];
 for(let i=0;i<queue.length&&!visited.has(toPortId);i++)
  for(const next of graph.get(queue[i])||[])
   if(!visited.has(next)){visited.add(next);queue.push(next);}
 return visited.has(toPortId);
}

export function observeEthernetNetworkPing(registry,sourceId,targetId,addresses){
 if(!registry || ["getAsset","listAssets","listCables","listWallOutlets","listPanels","listCablePoints"].some(fn=>typeof registry[fn]!=="function"))
  return unavailable("Registre R2 indisponible");
 if(sourceId===targetId)return unavailable("Équipements identiques");
 const source=registry.getAsset(sourceId),target=registry.getAsset(targetId);
 if(!source||!target)return unavailable("Équipement introuvable");
 if(!live(source)||!live(target))
  return {status:"ok",success:false,reason:"Équipement hors service ou en stock"};
 const sourcePorts=source.ports.filter(isEthernet),targetPorts=target.ports.filter(isEthernet);
 if(sourcePorts.length!==1||targetPorts.length!==1)
  return unavailable("V1 : PC source et destination avec un port Ethernet RJ45 requis");
 const a=addresses?.[sourceId],b=addresses?.[targetId];
 if(!a||!b)return unavailable("Configuration IPv4 manquante");

 const start=sourcePorts[0].id,end=targetPorts[0].id;
 const connected=ethernetPortReachable(registry,start,end);
 
 // Le cœur IPv4 existant reste responsable des masques, doublons et réponses ping.
 // Une liaison *dérivée* représente uniquement la communication permise par Ethernet.
 const scenario={
  format:"r2d3-scenario",schemaVersion:1,scenarioId:"ethernet-simple-v1",
  scenarioVersion:"1.0.0",capabilities:{network:true},
  objects:[[source,sourcePorts[0],a],[target,targetPorts[0],b]].map(([asset,port,ip])=>({
   id:asset.id,name:asset.name,kind:"ethernet-endpoint",
   ports:[{id:port.id,type:"rj45"}],
   config:{ipv4:{interfaceId:port.id,mode:"static",address:ip.address,prefix:ip.prefix}},
   runtime:{}
  })),
  links:connected?[{
   id:"derived-ethernet-connectivity",kind:"ethernet-cable",
   endpoints:[{objectId:sourceId,portId:start},{objectId:targetId,portId:end}],
   connected:true
  }]:[]
 };
 try{return createEngine(scenario).query({type:"network.ping",sourceId,targetId});}
 catch{return unavailable("Configuration IPv4 non prise en charge");}
}

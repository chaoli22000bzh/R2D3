/*
 * Ethernet simple V0.1 : observation du réseau à travers un switch non administrable.
 * Les ports et câbles sont lus dans le registre R2 : aucune seconde topologie persistante.
 * Cette API est limitée à un switch, deux extrémités RJ45 et un seul domaine Ethernet.
 * L'association générique profil -> capacités sera réalisée lors du lot complet.
 */
import {createEngine} from "./r2d3-core.js";

const unavailable=reason=>({status:"unavailable",success:false,reason});
const ethernetPorts=asset=>asset.ports.filter(p=>p.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45");

export function observeSimpleEthernetSwitch(registry,sourceId,targetId,switchId,addresses) {
  if(!registry || typeof registry.getAsset!=="function" || typeof registry.explorePhysicalPath!=="function")
    return unavailable("Registre de câblage indisponible");
  const source=registry.getAsset(sourceId),target=registry.getAsset(targetId),sw=registry.getAsset(switchId);
  if(!source||!target||!sw||new Set([sourceId,targetId,switchId]).size!==3)
    return unavailable("Équipements inexistants ou identiques");
  if([source,target,sw].some(a=>a.status!=="En service"))
    return {status:"ok",success:false,reason:"Équipement hors service ou en stock"};
  const aPorts=ethernetPorts(source),bPorts=ethernetPorts(target),sPorts=ethernetPorts(sw);
  if(aPorts.length!==1||bPorts.length!==1||sPorts.length<2)
    return unavailable("V0.1 : deux postes à un port RJ45 et un switch Ethernet à plusieurs ports requis");
  const a=addresses?.[sourceId],b=addresses?.[targetId];
  if(!a||!b)return unavailable("Configuration IPv4 manquante");
  const sourcePorts=sPorts.filter(p=>registry.explorePhysicalPath(aPorts[0].id,p.id).connected);
  const targetPorts=sPorts.filter(p=>registry.explorePhysicalPath(bPorts[0].id,p.id).connected);
  const connected=sourcePorts.some(x=>targetPorts.some(y=>x.id!==y.id));
  const scenario={
    format:"r2d3-scenario",schemaVersion:1,scenarioId:"switch-ethernet-simple-v01",
    scenarioVersion:"0.1.0",capabilities:{network:true},
    objects:[[source,aPorts[0],a],[target,bPorts[0],b]].map(([asset,port,ip])=>({
      id:asset.id,name:asset.name,kind:"ethernet-endpoint",
      ports:[{id:port.id,type:"rj45"}],
      config:{ipv4:{interfaceId:port.id,mode:"static",address:ip.address,prefix:ip.prefix}},
      runtime:{}
    })),
    links:connected?[{
      id:"derived-switch-forwarding",kind:"ethernet-cable",
      endpoints:[{objectId:sourceId,portId:aPorts[0].id},{objectId:targetId,portId:bPorts[0].id}],
      connected:true
    }]:[]
  };
  try{return createEngine(scenario).query({type:"network.ping",sourceId,targetId});}
  catch{return unavailable("Configuration IPv4 non prise en charge");}
}

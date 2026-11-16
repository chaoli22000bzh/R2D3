/*
 * Routeur générique V0.1 - ping entre deux interfaces directement raccordées.
 * Topologie exclusivement issue du registre R2 et vérifiée par le moteur ping commun.
 * Ce lot ne modélise ni NAT, ni DMZ, ni transport à travers un switch.
 */
import {createEngine} from "./r2d3-core.js";
const fail=(reason,status="ok")=>({status,success:false,reason});
const unsupported=reason=>fail(reason,"unavailable");
const ipNumber=v=>{
 if(typeof v!=="string"||!/^(\d{1,3}\.){3}\d{1,3}$/.test(v))return null;
 const octets=v.split(".").map(Number);
 return octets.some(x=>x>255)?null:octets.reduce((n,x)=>((n*256+x)>>>0),0);
};
const network=(address,prefix)=>{
 const ip=ipNumber(address);
 if(ip===null||!Number.isInteger(prefix)||prefix<1||prefix>30)return null;
 const mask=(0xffffffff<<(32-prefix))>>>0;
 return {ip,mask,prefix,network:(ip&mask)>>>0};
};
const overlap=(a,b)=>((a.ip&b.mask)>>>0)===b.network||((b.ip&a.mask)>>>0)===a.network;
const ether=p=>p.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45";
const corePing=(host,hostPort,hostIp,router,routerPort,routerIp,pathConnected)=>{
 const scenario={
  format:"r2d3-scenario",schemaVersion:1,scenarioId:"router-direct-interface",
  scenarioVersion:"0.1.0",capabilities:{network:true},
  objects:[
   {id:host.id,kind:"ethernet-endpoint",name:host.name,ports:[{id:hostPort.id,type:"rj45"}],config:{ipv4:{interfaceId:hostPort.id,mode:"static",address:hostIp.address,prefix:hostIp.prefix}},runtime:{}},
   {id:router.id,kind:"router-endpoint",name:router.name,ports:[{id:routerPort.id,type:"rj45"}],config:{ipv4:{interfaceId:routerPort.id,mode:"static",address:routerIp.address,prefix:routerIp.prefix}},runtime:{}}
  ],
  links:pathConnected?[{id:"physical-"+host.id,kind:"ethernet-cable",connected:true,endpoints:[{objectId:host.id,portId:hostPort.id},{objectId:router.id,portId:routerPort.id}]}]:[]
 };
 return createEngine(scenario).query({type:"network.ping",sourceId:host.id,targetId:router.id});
};
export function observeRouterPing(registry,routerId,sourceId,targetId,addresses){
 if(!registry?.getAsset||!registry?.explorePhysicalPath)return unsupported("Registre R2 indisponible");
 const router=registry.getAsset(routerId),src=registry.getAsset(sourceId),dst=registry.getAsset(targetId);
 if(!router||!src||!dst||new Set([routerId,sourceId,targetId]).size!==3)
  return unsupported("Équipements absents ou identiques");
 if(!router.networkCapabilities?.includes("ipv4-router")||!router.routerConfig)
  return unsupported("Routeur générique sans configuration");
 if([router,src,dst].some(a=>a.status!=="En service"))
  return fail("Un équipement est hors service ou en stock");
 const clients=[src,dst],ports=clients.map(a=>a.ports.filter(ether)),config=clients.map(a=>addresses?.[a.id]);
 if(ports.some(p=>p.length!==1))return unsupported("Ce lot exige un port Ethernet RJ45 par PC");
 if(config.some(c=>!c||!network(c.address,c.prefix)))return unsupported("Adressage IPv4 des PC invalide");
 const attached=ports.map(p=>router.ports.filter(ether).filter(r=>registry.explorePhysicalPath(p[0].id,r.id).connected));
 if(attached.some(p=>p.length!==1))
  return attached.some(p=>p.length===0)?fail("Câble Ethernet débranché"):unsupported("Plusieurs raccordements simultanés non pris en charge");
 const [a,b]=attached.map(x=>x[0]);
 if(a.id===b.id)return unsupported("Les deux PC doivent utiliser deux ports distincts");
 const pair=[a,b].map((port,i)=>({port,interface:router.routerConfig.interfaces[port.id],client:config[i],asset:clients[i],clientPort:ports[i][0]}));
 if(pair.some(p=>!p.interface||p.interface.mode!=="static"))
  return fail("Interface du routeur sans IPv4 statique");
 const roles=pair.map(p=>p.interface.role);
 if(roles.some(role=>!["lan","wan"].includes(role)))
  return unsupported("Lot 2 : les réseaux DMZ ne sont pas encore pris en charge");
 if(roles[0]==="wan"&&roles[1]==="wan")
  return unsupported("Lot 2 : deux interfaces WAN non prises en charge");
 const hasWan=roles.includes("wan");
 const gatewayNets=pair.map(p=>network(p.interface.address,p.interface.prefix));
 if(gatewayNets.some(n=>!n))return unsupported("Adressage d'interface routeur invalide");
 if(overlap(gatewayNets[0],gatewayNets[1]))
  return unsupported("Réseaux des interfaces du routeur chevauchants");
 for(let i=0;i<2;i++){
  const p=pair[i],clientNet=network(p.client.address,p.client.prefix),routerNet=gatewayNets[i];
  if(!clientNet||clientNet.network!==routerNet.network||clientNet.mask!==routerNet.mask)
   return fail("Le PC n'appartient pas au sous-réseau de son interface routeur");
  if(ipNumber(p.client.gateway)!==routerNet.ip)
   return fail("Passerelle du PC incorrecte");
  if(clientNet.ip===routerNet.ip)return fail("Conflit d'adresse entre PC et routeur");
  // Le moteur ping commun vérifie réellement la couche Ethernet et l'adressage
  // pour chacun des deux chemins PC -> interface du routeur.
  const observed=corePing(p.asset,p.clientPort,p.client,router,p.port,p.interface,true);
  if(!observed.success)return {status:observed.status||"ok",success:false,reason:"PC et passerelle non joignables : "+(observed.reason||"échec réseau")};
 }
 return {status:"ok",success:true,reason:hasWan?"Routage IPv4 direct opérationnel entre LAN et WAN (sans NAT ni pare-feu simulé)":"Routage IPv4 direct opérationnel entre les deux réseaux LAN"};
}

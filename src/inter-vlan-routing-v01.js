/*
 * Routage inter-VLAN V0.1 : un switch L3, deux postes, deux VLAN Access.
 * Lecture seule du registre R2 ; interfaces VLAN logiques hors inventaire physique.
 * Pas de routage multi-switch, routes statiques, STP ni IP Helper.
 */
import {observeRegisteredVlanPing} from "./vlan-v1.js";

const fail=(reason,status="ok")=>({status,success:false,reason});
const unsupported=reason=>fail(reason,"unavailable");
const ipNumber=value=>{
 if(typeof value!=="string")return null;
 const parts=value.split(".");
 if(parts.length!==4||parts.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))return null;
 return parts.reduce((n,x)=>(n*256+Number(x))>>>0,0);
};
const subnet=(address,prefix)=>{
 const ip=ipNumber(address);
 if(ip===null||!Number.isInteger(prefix)||prefix<1||prefix>30)return null;
 const mask=(0xffffffff<<(32-prefix))>>>0;
 return {ip,mask,network:(ip&mask)>>>0};
};
const same=(a,b)=>a&&b&&a.mask===b.mask&&a.network===b.network;
const ethernet=p=>p.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45";
export function createDefaultInterVlanRoutingConfig(switchAsset){
 if(!switchAsset?.networkCapabilities?.includes("vlan"))
  throw Error("Switch doté de VLAN nécessaire");
 return {assetId:switchAsset.id,routingEnabled:false,interfaces:{}};
}
export function configureInterVlanRouting(config,enabled){
 if(typeof enabled!=="boolean")return {success:false,reason:"État de routage invalide"};
 return {success:true,config:{...config,routingEnabled:enabled,interfaces:{...config.interfaces}}};
}
export function configureInterVlanInterface(config,vlanNumber,address,prefix,enabled=true){
 if(!Number.isInteger(vlanNumber)||vlanNumber<1||vlanNumber>4094||
    !subnet(address,prefix)||typeof enabled!=="boolean")
  return {success:false,reason:"Adresse, masque, VLAN ou état d’interface invalide"};
 return {success:true,config:{...config,interfaces:{...config.interfaces,
  [String(vlanNumber)]:{address,prefix,enabled}}}};
}
export function observeInterVlanPing(registry,switchId,routingConfig,sourceId,targetId,addresses){
 if(!registry||typeof registry.getAsset!=="function"||typeof registry.explorePhysicalPath!=="function")
  return unsupported("Registre R2 indisponible");
 const sw=registry.getAsset(switchId),src=registry.getAsset(sourceId),dst=registry.getAsset(targetId);
 if(!sw||!src||!dst||new Set([switchId,sourceId,targetId]).size!==3)
  return unsupported("Équipements inexistants ou identiques");
 if(!sw.networkCapabilities?.includes("vlan")||!sw.networkCapabilities.includes("ethernet-switching"))
  return unsupported("Switch sans capacités Ethernet et VLAN");
 if(!routingConfig||routingConfig.assetId!==switchId||typeof routingConfig.routingEnabled!=="boolean"||
    !routingConfig.interfaces||typeof routingConfig.interfaces!=="object")
  return unsupported("Configuration de routage invalide");
 if([sw,src,dst].some(a=>a.status!=="En service"))
  return fail("Équipement hors service ou en stock");
 const conf=sw.vlanConfig;
 if(!conf)return unsupported("Configuration VLAN manquante");
 const clients=[src,dst],ports=clients.map(a=>a.ports.filter(ethernet));
 if(ports.some(p=>p.length!==1))return unsupported("V0.1 : un port Ethernet par poste");
 const clientConfigs=clients.map(a=>addresses?.[a.id]);
 if(clientConfigs.some(c=>!c||!subnet(c.address,c.prefix)))return unsupported("Adressage IPv4 invalide");
 const attached=ports.map(p=>sw.ports.filter(ethernet)
  .filter(s=>registry.explorePhysicalPath(p[0].id,s.id).connected));
 if(attached.some(list=>list.length!==1))
  return attached.some(list=>list.length===0)?fail("Câble Ethernet débranché"):unsupported("Topologie multi-connexion non prise en charge");
 const vlanNums=attached.map(list=>{
  const port=conf.ports[list[0].id];
  if(!port||port.mode!=="access")return null;
  return conf.vlans.find(v=>v.id===port.vlanId)?.number??null;
 });
 if(vlanNums.some(v=>v===null))return unsupported("Port client non Access ou VLAN absent");
 if(vlanNums[0]===vlanNums[1]){
  // Pas de routage pour deux clients du même VLAN : déléguer au moteur L2/IP déjà recetté.
  return observeRegisteredVlanPing(registry,sourceId,targetId,addresses);
 }
 return evaluateInterVlanLogicalEndpoints(routingConfig,vlanNums,clientConfigs);
}
/* Validation L3 commune aux terminaux Ethernet Access et Wi-Fi/Trunk.
 * L'appelant vérifie au préalable les chemins et VLAN réels dans R2.
 * Ce contrôle ne construit aucune liaison et ne décide aucun bail DHCP.
 */
export function evaluateInterVlanLogicalEndpoints(routingConfig,vlanNums,clientConfigs){
 if(!routingConfig||!Array.isArray(vlanNums)||vlanNums.length!==2||
  !Array.isArray(clientConfigs)||clientConfigs.length!==2||vlanNums.some(n=>!Number.isInteger(n))||
  clientConfigs.some(c=>!c||!subnet(c.address,c.prefix)))
  return unsupported("Paramètres de routage ou clients invalides");
 if(vlanNums[0]===vlanNums[1])return unsupported("Utiliser la commutation L2 pour le même VLAN");
 if(!routingConfig.routingEnabled)return fail("Routage inter-VLAN désactivé");
 const svi=vlanNums.map(n=>routingConfig.interfaces[String(n)]);
 if(svi.some(c=>!c||!c.enabled))return fail("Interface VLAN absente ou désactivée");
 const networks=svi.map(c=>subnet(c.address,c.prefix));
 if(networks.some(n=>!n))return unsupported("Interface VLAN incorrecte");
 if(networks[0].network===(networks[1].network)&&networks[0].mask===networks[1].mask||
    (networks[0].ip&networks[1].mask)>>>0===networks[1].network||
    (networks[1].ip&networks[0].mask)>>>0===networks[0].network)
  return unsupported("Sous-réseaux des interfaces VLAN chevauchants");
 for(let i=0;i<2;i++){
  const client=subnet(clientConfigs[i].address,clientConfigs[i].prefix);
  if(!same(client,networks[i]))return fail("Poste hors du sous-réseau de son interface VLAN");
  if(ipNumber(clientConfigs[i].gateway)!==networks[i].ip)
   return fail("Passerelle IPv4 du poste incorrecte");
  if(client.ip===networks[i].ip)return fail("Conflit entre l’adresse du poste et sa passerelle");
 }
 // Les règles ne filtrent que les nouvelles communications initiées dans ce sens.
 // La réponse à une communication initiée dans le sens autorisé est admise
 // dans ce modèle pédagogique simplifié (pas de suivi des paquets TCP/ICMP).
 const blocked=routingConfig.accessRules?.find(r=>
  r.enabled&&r.action==="deny"&&r.sourceVlan===vlanNums[0]&&r.targetVlan===vlanNums[1]);
 if(blocked)return {status:"ok",success:false,code:"access_denied",reason:
  "Politique réseau : trafic initié du VLAN "+vlanNums[0]+" vers le VLAN "+vlanNums[1]+" interdit."};
 return {status:"ok",success:true,reason:"Routage entre VLAN "+vlanNums[0]+" et "+vlanNums[1]+" opérationnel"};
}

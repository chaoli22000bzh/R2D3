/*
 * IP Helper V1 : configuration par réseau ou interface stockée dans R2.
 * Le relais DHCP effectif utilise exclusivement le moteur DHCP commun.
 * Le transport VLAN recetté est conservé ; VPN et DMZ gardent des adaptateurs
 * de connectivité propres à implémenter sans dupliquer les baux ni l'allocation.
 */
import {requestRelayedDhcp} from "./ip-helper-v01.js";
const err=(code,message)=>({success:false,code,message});
const clone=x=>JSON.parse(JSON.stringify(x));
const ip=value=>typeof value==="string"&&value.split(".").length===4&&
 value.split(".").every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255);
export function getAssetIpHelperConfig(registry,assetId){
 const asset=registry?.getAsset?.(assetId);
 return asset?.networkCapabilities?.includes("ip-helper")?clone(asset.ipHelperConfig):null;
}
function change(registry,assetId,action){
 if(!registry||typeof registry.setAssetIpHelperConfig!=="function")
  return err("invalid_registry","Registre R2 incompatible avec IP Helper");
 const asset=registry.getAsset(assetId),prior=getAssetIpHelperConfig(registry,assetId);
 if(!asset||!prior)return err("capability_missing","Équipement sans capacité IP Helper");
 const candidate=action(prior,asset);
 if(!candidate?.success)return err("invalid_operation",candidate?.reason||"Configuration refusée");
 return registry.setAssetIpHelperConfig(assetId,candidate.config);
}
export function setVlanIpHelper(registry,assetId,vlanNumber,serverAddress,enabled=true){
 return change(registry,assetId,(conf,asset)=>{
  if(!Number.isInteger(vlanNumber)||!asset.vlanConfig?.vlans?.some(v=>v.number===vlanNumber))
   return {success:false,reason:"VLAN absent sur cet équipement"};
  if(!ip(serverAddress)||typeof enabled!=="boolean")
   return {success:false,reason:"Adresse de serveur ou état IP Helper invalide"};
  return {success:true,config:{...conf,helpers:{...conf.helpers,
   ["vlan:"+vlanNumber]:{serverAddress,enabled}}}};
 });
}
export function setInterfaceIpHelper(registry,assetId,portId,serverAddress,enabled=true){
 return change(registry,assetId,(conf,asset)=>{
  if(!asset.ports.some(p=>p.id===portId&&p.medium==="ethernet"))
   return {success:false,reason:"Interface Ethernet absente"};
  if(!ip(serverAddress)||typeof enabled!=="boolean")
   return {success:false,reason:"Adresse de serveur ou état IP Helper invalide"};
  return {success:true,config:{...conf,helpers:{...conf.helpers,
   ["interface:"+portId]:{serverAddress,enabled}}}};
 });
}
export function observeRegisteredRelayedDhcp({
 registry,switchId,clientId,serverId,serverAddress,dhcpEngine,commandId
}){
 const asset=registry?.getAsset?.(switchId);
 const conf=getAssetIpHelperConfig(registry,switchId);
 if(!asset||!conf)return {status:"unavailable",success:false,reason:"IP Helper non pris en charge"};
 if(!asset.networkCapabilities.includes("inter-vlan-routing"))
  return {status:"unavailable",success:false,reason:"Transport L3 de ce relais non pris en charge"};
 // V0.1 valide le chemin Ethernet et les interfaces avant tout dispatch DHCP.
 // Sa configuration projetée est l'état canonique R2, sans copie parallèle.
 const projected={assetId:switchId,helpers:Object.fromEntries(
  Object.entries(conf.helpers).filter(([key])=>key.startsWith("vlan:"))
   .map(([key,value])=>[key.slice(5),value])
 )};
 return requestRelayedDhcp({registry,switchId,clientId,serverId,serverAddress,
  dhcpEngine,helperConfig:projected,commandId});
}

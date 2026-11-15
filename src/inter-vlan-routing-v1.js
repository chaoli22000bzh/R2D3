/*
 * Routage inter-VLAN V1.
 * La capacité, l'activation et les interfaces VLAN sont portées par le registre R2.
 * Le comportement réseau reste calculé par le moteur L3 V0.1 recetté.
 */
import {configureInterVlanRouting,configureInterVlanInterface,observeInterVlanPing} from "./inter-vlan-routing-v01.js";
const bad=(code,message)=>({success:false,code,message});
const clone=x=>JSON.parse(JSON.stringify(x));
export function getSwitchRoutingConfig(registry,assetId){
 const a=registry?.getAsset?.(assetId);
 return a?.networkCapabilities?.includes("inter-vlan-routing")?clone(a.routingConfig):null;
}
function change(registry,assetId,action){
 if(!registry||typeof registry.setAssetRoutingConfig!=="function")
  return bad("invalid_registry","Registre R2 incompatible avec le routage L3");
 const a=registry.getAsset(assetId),previous=getSwitchRoutingConfig(registry,assetId);
 if(!a||!previous)return bad("capability_missing","Cet équipement ne possède pas le routage inter-VLAN");
 const updated=action(previous,a);
 if(!updated?.success)return bad("invalid_operation",updated?.reason||"Modification de routage refusée");
 return registry.setAssetRoutingConfig(assetId,updated.config);
}
export function setSwitchInterVlanRouting(registry,assetId,enabled){
 return change(registry,assetId,c=>configureInterVlanRouting(c,enabled));
}
export function setSwitchVlanInterface(registry,assetId,vlanNumber,address,prefix,enabled=true){
 return change(registry,assetId,(c,a)=>{
  if(!a.vlanConfig?.vlans?.some(v=>v.number===vlanNumber))
   return {success:false,reason:"VLAN absent sur ce switch"};
  return configureInterVlanInterface(c,vlanNumber,address,prefix,enabled);
 });
}
export function observeRegisteredInterVlanPing(registry,switchId,sourceId,targetId,addresses){
 const config=getSwitchRoutingConfig(registry,switchId);
 if(!config)return {status:"unavailable",success:false,reason:"Switch sans capacité de routage inter-VLAN"};
 return observeInterVlanPing(registry,switchId,config,sourceId,targetId,addresses);
}

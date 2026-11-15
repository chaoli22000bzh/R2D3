/*
 * VLAN V1 : les configurations appartiennent aux équipements R2.
 * Aucun état VLAN parallèle à exporter. La topologie reste le câblage R2.
 */
import {createVlan,configureVlanAccess,configureVlanTrunk,observeVlanPing} from "./vlan-v01.js";

const error=(code,message)=>({success:false,code,message});
const copy=x=>JSON.parse(JSON.stringify(x));
export function vlanSwitchConfig(registry,assetId){
 const asset=registry?.getAsset?.(assetId);
 return asset?.networkCapabilities?.includes("vlan")?copy(asset.vlanConfig):null;
}
function change(registry,assetId,operation){
 if(!registry||typeof registry.setAssetVlanConfig!=="function")return error("invalid_registry","Registre R2 non compatible avec les VLAN");
 const old=vlanSwitchConfig(registry,assetId);
 if(!old)return error("capability_missing","L'équipement n'a pas la capacité VLAN");
 const result=operation(old);
 if(!result?.success)return error("invalid_operation",result?.reason||"Configuration refusée");
 return registry.setAssetVlanConfig(assetId,result.config);
}
export function addSwitchVlan(registry,assetId,number,name){
 return change(registry,assetId,c=>createVlan(c,number,name));
}
export function setSwitchAccessPort(registry,assetId,portId,vlanNumber){
 return change(registry,assetId,c=>{
  const vlan=c.vlans.find(v=>v.number===vlanNumber);
  if(!vlan)return {success:false,reason:"VLAN absent sur ce switch"};
  return configureVlanAccess(c,portId,vlan.id);
 });
}
export function setSwitchTrunkPort(registry,assetId,portId,allowedNumbers){
 return change(registry,assetId,c=>{
  if(!Array.isArray(allowedNumbers)||allowedNumbers.length===0||
     new Set(allowedNumbers).size!==allowedNumbers.length)return {success:false,reason:"Liste de VLAN invalide"};
  const ids=[];
  for(const n of allowedNumbers){
   const vlan=c.vlans.find(v=>v.number===n);
   if(!vlan)return {success:false,reason:"VLAN "+n+" absent sur ce switch"};
   ids.push(vlan.id);
  }
  return configureVlanTrunk(c,portId,ids);
 });
}
export function observeRegisteredVlanPing(registry,sourceId,targetId,addresses){
 if(!registry||typeof registry.listAssets!=="function")return {status:"unavailable",success:false,reason:"Registre R2 indisponible"};
 const configs=Object.fromEntries(registry.listAssets()
  .filter(a=>a.networkCapabilities?.includes("vlan")&&a.vlanConfig)
  .map(a=>[a.id,a.vlanConfig]));
 return observeVlanPing(registry,configs,sourceId,targetId,addresses);
}

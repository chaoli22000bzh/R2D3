/* Politique de filtrage L3 commune : règles directionnelles sur le switch.
 * Pas de moteur réseau parallèle. La décision de trafic est appliquée par
 * evaluateInterVlanLogicalEndpoints (clients Ethernet Access et Wi-Fi).
 * Interdire une communication initiée n'interdit pas les réponses à un flux
 * initié dans le sens autorisé, dans cette abstraction pédagogique.
 */
import {getSwitchRoutingConfig} from "./inter-vlan-routing-v1.js";
const bad=(code,message)=>({success:false,code,message});
export function getSwitchAccessRules(registry,switchId){
 const config=getSwitchRoutingConfig(registry,switchId);
 return config?structuredClone(config.accessRules??[]):null;
}
export function setSwitchAccessRule(registry,switchId,{id,sourceVlan,targetVlan,action="deny",enabled}={}){
 const sw=registry?.getAsset?.(switchId),config=getSwitchRoutingConfig(registry,switchId);
 if(!sw||!config||typeof registry.setAssetRoutingConfig!=="function")
  return bad("unsupported","Switch L3 administrable requis.");
 if(typeof id!=="string"||!/^[-a-zA-Z0-9_]{1,40}$/.test(id)||
    !Number.isInteger(sourceVlan)||!Number.isInteger(targetVlan)||
    sourceVlan===targetVlan||action!=="deny"||typeof enabled!=="boolean")
  return bad("invalid_rule","Règle directionnelle invalide.");
 const vlans=new Set(sw.vlanConfig?.vlans?.map(v=>v.number)??[]);
 if(!vlans.has(sourceVlan)||!vlans.has(targetVlan))
  return bad("unknown_vlan","Les VLAN de la règle doivent exister sur le switch.");
 const rules=config.accessRules??[];
 const item={id,sourceVlan,targetVlan,action,enabled};
 const updated=rules.some(r=>r.id===id)?rules.map(r=>r.id===id?item:r):[...rules,item];
 return registry.setAssetRoutingConfig(switchId,{...config,accessRules:updated});
}
export function removeSwitchAccessRule(registry,switchId,id){
 const config=getSwitchRoutingConfig(registry,switchId);
 if(!config||typeof registry?.setAssetRoutingConfig!=="function")
  return bad("unsupported","Switch L3 administrable requis.");
 const rules=config.accessRules??[];
 if(!rules.some(r=>r.id===id))return bad("unknown_rule","Règle introuvable.");
 return registry.setAssetRoutingConfig(switchId,{...config,accessRules:rules.filter(r=>r.id!==id)});
}

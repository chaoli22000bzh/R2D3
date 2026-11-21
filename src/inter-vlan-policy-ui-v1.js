/* Interface partagée des politiques inter-VLAN d'un switch L3.
 * Vue/commandes uniquement : l'état persiste dans le registre R2D3.
 */
import {getSwitchAccessRules,setSwitchAccessRule} from "./inter-vlan-access-policy-v1.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function mountSwitchAccessPolicy({root,registry,switchId,ruleId="guest-to-lan",defaultSourceVlan=20,defaultTargetVlan=10}={}){
 if(!root||!registry?.getAsset||!switchId)throw Error("Interface ou registre de filtrage indisponible.");
 let message="",isError=false;
 const render=()=>{
  const sw=registry.getAsset(switchId),rules=getSwitchAccessRules(registry,switchId);
  if(!sw||!rules)throw Error("Switch L3 incompatible avec le filtrage.");
  const vlans=sw.vlanConfig?.vlans?.map(v=>v.number).sort((a,b)=>a-b)??[];
  const rule=rules.find(r=>r.id===ruleId);
  const source=rule?.sourceVlan??defaultSourceVlan,target=rule?.targetVlan??defaultTargetVlan;
  const options=value=>vlans.map(n=>'<option value="'+n+'"'+(n===value?' selected':'')+'>'+n+'</option>').join("");
  root.innerHTML='<div class="r2d3-policy-ui"><h3>Filtrage inter-VLAN</h3>'+
   '<p>Bloquer les communications initiées depuis un VLAN vers un autre, sans arrêter le routage.</p>'+
   '<form data-policy-form><label>VLAN source<select name="source">'+options(source)+'</select></label>'+
   '<label>VLAN destination<select name="target">'+options(target)+'</select></label>'+
   '<label class="policy-toggle"><input type="checkbox" name="enabled"'+(rule?.enabled?' checked':'')+'>Activer le blocage</label>'+
   '<button type="submit">Appliquer la règle</button></form>'+
   '<p class="policy-help">Les réponses à une communication autorisée dans le sens inverse ne sont pas bloquées (modèle simplifié). Le DHCP et la passerelle locale ne sont pas des flux inter-VLAN.</p>'+
   (message?'<div role="status" class="policy-status'+(isError?' error':'')+'">'+esc(message)+'</div>':'')+'</div>';
 };
 const submit=e=>{
  if(!root.contains(e.target)||!e.target.matches("form[data-policy-form]"))return;
  e.preventDefault();
  const d=new FormData(e.target);
  const r=setSwitchAccessRule(registry,switchId,{id:ruleId,sourceVlan:Number(d.get("source")),
   targetVlan:Number(d.get("target")),enabled:d.get("enabled")==="on"});
  message=r.message??r.code??"Résultat inconnu";isError=!r.success;render();
 };
 root.addEventListener("submit",submit);render();
 return {refresh:render,destroy(){root.removeEventListener("submit",submit);root.replaceChildren();}};
}

/* Interface PAT entrant commune aux routeurs génériques et aux box.
 * Règles persistées dans les registres R2D3, aucun état PAT dupliqué dans la vue.
 * Le test d'accès au service reste une recette réseau distincte.
 */
import {getRouterPatRules,addRouterPatRule,setRouterPatRuleEnabled,removeRouterPatRule} from "./router-pat-v1.js";
import {getBoxPatRules,addBoxPatRule,setBoxPatRuleEnabled,removeBoxPatRule} from "./box-pat-v1.js";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const port=n=>Number.isInteger(n)&&n>=1&&n<=65535;
const ip=s=>typeof s==="string"&&/^(\d{1,3}\.){3}\d{1,3}$/.test(s)&&s.split(".").every(o=>Number(o)<=255);
const bad=(code,message)=>({success:false,code,message});
const options=(rows,selected)=>rows.map(([value,label])=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>').join("");
const context=(registry,assetId,kind)=>{
 const a=registry.getAsset(assetId);
 if(!a)return null;
 if(kind==="box"&&a.boxConfig)return {wan:[{id:a.boxConfig.ports.wanPortId,label:"WAN (Internet simulé)"}],
  rules:getBoxPatRules(registry,assetId)??[],kind};
 if(kind==="router"&&a.routerConfig)return {wan:a.ports.filter(p=>a.routerConfig.interfaces[p.id]?.role==="wan").map(p=>({id:p.id,label:p.name})),
  rules:getRouterPatRules(registry,assetId)??[],kind};
 return null;
};
export function renderPatAdmin({registry,assetId,kind,editingRuleId=null}={}){
 const ctx=context(registry,assetId,kind);
 if(!ctx)return '<section class="admin-panel"><p>Configuration PAT indisponible.</p></section>';
 const selected=ctx.rules.find(r=>r.id===editingRuleId)??null;
 const chosenWan=selected?.wanPortId??ctx.wan[0]?.id??"";
 return '<section class="admin-panel pat-admin"><h3>Redirections de ports (PAT entrant)</h3>'+
  '<p>Publier un service du réseau local depuis le WAN. TCP et UDP : ports de 1 à 65535. La disponibilité du service doit être vérifiée séparément.</p>'+
  (ctx.rules.length?'<div class="table-scroll"><table class="admin-table"><thead><tr><th>WAN</th><th>Protocole</th><th>Port externe</th><th>Serveur LAN</th><th>Port interne</th><th>État</th><th>Actions</th></tr></thead><tbody>'+
   ctx.rules.map(r=>'<tr><td>'+esc(ctx.wan.find(w=>w.id===r.wanPortId)?.label??r.wanPortId)+'</td>'+
    '<td>'+esc(r.protocol.toUpperCase())+'</td><td>'+r.externalPort+'</td><td>'+esc(r.internalAddress)+'</td>'+
    '<td>'+r.internalPort+'</td><td>'+(r.enabled?'Activée':'Désactivée')+'</td><td>'+
    '<button type="button" data-pat-action="edit" data-pat-id="'+esc(r.id)+'">Modifier</button> '+
    '<button type="button" data-pat-action="toggle" data-pat-id="'+esc(r.id)+'">'+(r.enabled?'Désactiver':'Activer')+'</button> '+
    '<button type="button" data-pat-action="remove" data-pat-id="'+esc(r.id)+'">Supprimer</button></td></tr>').join("")+
   '</tbody></table></div>':'<p>Aucune règle PAT entrante.</p>')+
  '<h3>'+(selected?'Modifier une redirection':'Ajouter une redirection')+'</h3>'+
  '<form data-form="pat-rule" class="pat-form">'+
   '<label>Interface WAN<select name="wanPortId" required>'+options(ctx.wan.map(w=>[w.id,w.label]),chosenWan)+'</select></label>'+
   '<label>Protocole<select name="protocol">'+options([["tcp","TCP"],["udp","UDP"]],selected?.protocol??"tcp")+'</select></label>'+
   '<label>Port externe<input name="externalPort" type="number" min="1" max="65535" step="1" value="'+esc(selected?.externalPort??"")+'" required></label>'+
   '<label>IPv4 du serveur<input name="internalAddress" inputmode="decimal" placeholder="192.168.1.110" value="'+esc(selected?.internalAddress??"")+'" required></label>'+
   '<label>Port interne<input name="internalPort" type="number" min="1" max="65535" step="1" value="'+esc(selected?.internalPort??"")+'" required></label>'+
   '<label class="pat-check"><input name="enabled" type="checkbox"'+((selected?.enabled??true)?' checked':'')+'> Règle active</label>'+
   '<div class="pat-actions"><button class="primary" type="submit"'+(ctx.wan.length?'':' disabled')+'>'+(selected?'Enregistrer les modifications':'Ajouter la règle')+'</button>'+
   (selected?' <button type="button" data-pat-action="new">Annuler la modification</button>':'')+'</div></form>'+
  (ctx.wan.length?'':'<p>Configurer d’abord au moins un port WAN pour ajouter une règle.</p>')+
  '</section>';
}
export function submitPatAdmin({registry,assetId,kind,editingRuleId=null,form}={}){
 const ctx=context(registry,assetId,kind);
 if(!ctx)return bad("asset_missing","Équipement PAT introuvable.");
 const f=form?.elements;
 if(!f)return bad("invalid_form","Formulaire PAT absent.");
 const rule={wanPortId:f.namedItem("wanPortId").value,protocol:f.namedItem("protocol").value,
  externalPort:Number(f.namedItem("externalPort").value),
  internalAddress:f.namedItem("internalAddress").value.trim(),
  internalPort:Number(f.namedItem("internalPort").value),enabled:f.namedItem("enabled").checked};
 if(!ctx.wan.some(w=>w.id===rule.wanPortId)||!["tcp","udp"].includes(rule.protocol)||
    !port(rule.externalPort)||!port(rule.internalPort)||!ip(rule.internalAddress))
  return bad("invalid_pat_rule","Vérifier l’interface WAN, le protocole, l’IPv4 et les ports (1 à 65535).");
 if(!editingRuleId)return kind==="box"?
  addBoxPatRule(registry,assetId,rule):
  addRouterPatRule(registry,assetId,rule);
 const current=ctx.rules.find(r=>r.id===editingRuleId);
 if(!current)return bad("rule_missing","Redirection à modifier introuvable.");
 const updated=ctx.rules.map(r=>r.id===editingRuleId?{...r,...rule}:r);
 if(kind==="box")return registry.setBoxPatRules(assetId,updated);
 const asset=registry.getAsset(assetId);
 return registry.setAssetRouterConfig(assetId,{...asset.routerConfig,patRules:updated});
}
export function actionPatAdmin({registry,assetId,kind,action,ruleId}={}){
 if(action==="new")return {success:true,message:"Nouvelle redirection."};
 const ctx=context(registry,assetId,kind);
 const r=ctx?.rules.find(r=>r.id===ruleId);
 if(!r)return bad("rule_missing","Redirection introuvable.");
 if(action==="edit")return {success:true,message:"Modification de la règle.",editingRuleId:ruleId};
 if(action==="toggle")return kind==="box"?setBoxPatRuleEnabled(registry,assetId,ruleId,!r.enabled):
  setRouterPatRuleEnabled(registry,assetId,ruleId,!r.enabled);
 if(action==="remove")return kind==="box"?removeBoxPatRule(registry,assetId,ruleId):
  removeRouterPatRule(registry,assetId,ruleId);
 return bad("invalid_action","Action PAT inconnue.");
}

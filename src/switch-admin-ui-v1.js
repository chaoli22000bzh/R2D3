/*
 * Interface d'administration graphique des switchs L2/L3.
 * Uniquement une vue/commande : les configurations restent dans le registre R2,
 * et les mutations utilisent les adaptateurs réseau R2D3 communs.
 */
import {addSwitchVlan,setSwitchAccessPort,setSwitchTrunkPort} from "./vlan-v1.js";
import {configureSwitchManagementStatic,configureSwitchManagementDhcp} from "./switch-management-ip-v01.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=x=>Number(x);
const resultLabel=x=>x?.message||x?.reason||x?.code||"Configuration refusée";
const opts=(items,selected)=>items.map(([v,t])=>'<option value="'+esc(v)+'"'+(String(v)===String(selected)?' selected':'')+'>'+esc(t)+'</option>').join("");
export function mountSwitchAdmin({root,registry,assetId}){
 if(!root||!registry?.getAsset)throw Error("Élément d'affichage ou registre R2 manquant");
 let current=assetId,tab="overview",message="",severity="ok",selectedPort=null;
 const tabTitle={overview:"Vue d'ensemble",ports:"Ports et connexions",vlans:"Réseaux VLAN",management:"Adresse IP de gestion"};
 const portCard=(p,a)=>{
   const state=a.vlanConfig.ports[p.id];
   const connected=registry.listCables().some(c=>c.ends.some(end=>end?.portId===p.id));
   const currentVlan=state.mode==="access"?
     "Access · VLAN "+(a.vlanConfig.vlans.find(v=>v.id===state.vlanId)?.number??"?"):
     "Trunk · "+state.allowedVlanIds.length+" VLAN";
   const chosen=selectedPort===p.id;
   return '<button type="button" class="face-port'+(chosen?' selected':'')+
     '" data-port="'+esc(p.id)+'" aria-label="'+esc(p.name)+', '+esc(currentVlan)+', '+(connected?'câble raccordé':'port libre')+
     '" aria-pressed="'+chosen+'" title="'+esc(p.name+' : '+currentVlan)+'">'+
     '<span class="port-number">'+esc(p.name)+'</span>'+
     '<span class="port-socket" aria-hidden="true"><span class="port-pins"></span></span>'+
     '<span class="port-status '+(connected?'connected':'free')+'">'+(connected?'Raccordé':'Libre')+'</span></button>';
 };
 const facade=(a,ports)=>'<div class="equipment-front"><div class="front-title"><span class="front-name">SWITCH · '+esc(a.name)+'</span>'+
 '<span class="front-desc">'+ports.length+' ports RJ45</span></div>'+
 '<div class="front-ports" role="group" aria-label="Façade des ports Ethernet">'+ports.map(p=>portCard(p,a)).join("")+'</div>'+
 '<p class="front-help">Sélectionnez un port pour consulter et modifier ses paramètres. L’état « Raccordé » correspond aux câbles réellement branchés.</p></div>';
 function asset(){
  const a=registry.getAsset(current);
  if(!a?.networkCapabilities?.includes("vlan"))throw Error("Switch L2/L3 administrable introuvable");
  return a;
 }
 function notify(out){
  severity=out?.success?"ok":"error";message=resultLabel(out);
  if(out?.success)render();
  else render();
 }
 function render(){
  const a=asset(),vlans=a.vlanConfig.vlans,ports=a.ports.filter(p=>p.type==="ethernet-rj45");
  const l3=a.networkCapabilities.includes("inter-vlan-routing"),mg=a.managementConfig;
  const label=v=>vlans.find(x=>x.id===v)?.number??"?";
  const tabs=Object.entries(tabTitle).map(([id,name])=>'<button type="button" class="menu-entry" aria-current="'+(tab===id?'page':'false')+'" data-tab="'+id+'">'+name+'</button>').join("");
  let content="";
  if(tab==="overview"){
   content='<div class="stats">'+
    '<div><span>Type d’équipement</span><strong>'+(l3?"Switch administrable L3":"Switch administrable L2")+'</strong></div>'+
    '<div><span>Ports Ethernet</span><strong>'+ports.length+'</strong></div>'+
    '<div><span>Réseaux VLAN</span><strong>'+vlans.length+'</strong></div>'+
    '<div><span>Alimentation PoE</span><strong>'+(a.poe?"Oui · automatique":"Non")+'</strong></div></div>'+
    '<h2>Façade du switch</h2>'+facade(a,ports)+
    '<div class="info-grid"><div class="notice"><strong>Spanning Tree (STP)</strong><p>Actif automatiquement. Aucun réglage nécessaire.</p></div>'+
    '<div class="notice"><strong>PoE</strong><p>Caractéristique matérielle : '+(a.poe?"activée automatiquement":"non disponible")+'. Aucun réglage par port.</p></div></div>'+
    (l3?'<div class="notice"><strong>Fonctions L3</strong><p>Les capacités de routage, de DHCP et d’IP Helper sont présentes sur ce modèle. Leur administration sera ajoutée au prochain lot.</p></div>':'');
  }else if(tab==="vlans"){
   content='<h2>VLAN du switch</h2><div class="vlan-list">'+vlans.map(v=>'<div class="vlan-line"><strong>VLAN '+esc(v.number)+'</strong><span>'+esc(v.name)+'</span></div>').join("")+'</div>'+
    '<h3>Créer un VLAN</h3><form data-form="vlan" class="fields"><label>Numéro de VLAN <input type="number" name="number" min="2" max="4094" required placeholder="10"></label>'+
    '<label>Nom du VLAN <input name="name" required maxlength="50" placeholder="Bureaux"></label><button type="submit" class="primary">Créer le VLAN</button></form>'+
    '<p class="hint">Les VLAN sont enregistrés sur cet équipement uniquement. VLAN 1 existe par défaut.</p>';
  }else if(tab==="ports"){
   if(!selectedPort||!ports.some(p=>p.id===selectedPort))selectedPort=ports[0]?.id??null;
   const p=ports.find(x=>x.id===selectedPort),state=p&&a.vlanConfig.ports[p.id];
   const active=state?.mode==="access";
   const currentVlans=state?(active?[label(state.vlanId)]:state.allowedVlanIds.map(label)):[];
   content='<h2>Façade et configuration des ports</h2>'+facade(a,ports)+
     (p?'<section class="port-editor"><div class="editor-head"><h3>Configuration du port '+esc(p.name)+'</h3><span>Port actif en permanence</span></div>'+
      '<form data-form="port" class="fields"><input type="hidden" name="portId" value="'+esc(p.id)+'">'+
      '<label>Mode du port<select name="mode">'+opts([["access","Access"],["trunk","Trunk"]],state.mode)+'</select></label>'+
      '<label>VLAN Access ou VLAN Trunk autorisés<input name="vlans" required value="'+esc(currentVlans.join(", "))+'" placeholder="10 ou 10, 20"></label>'+
      '<button type="submit" class="primary">Enregistrer les paramètres</button></form></section>':'')+
      '<p class="hint"><strong>Access :</strong> un VLAN. <strong>Trunk :</strong> plusieurs VLAN existants, séparés par des virgules. Aucun bouton de désactivation des ports.</p>';
  }else{
   const staticMode=mg.mode==="static";
   content='<h2>Adresse IPv4 de gestion</h2><p>Indépendante du routage des postes.</p><div class="notice">Mode courant : <strong>'+esc(mg.mode==="dhcp"?"DHCP":"Statique")+'</strong>'+
    (mg.address?' • '+esc(mg.address)+"/"+esc(mg.prefix):"")+'</div>'+
    '<form data-form="management" class="fields"><label>Mode <select name="mode">'+opts([["static","Statique"],["dhcp","DHCP"]],mg.mode)+'</select></label>'+
    '<label>Adresse IPv4 (mode statique)<input name="address" inputmode="decimal" placeholder="192.168.1.2" value="'+esc(staticMode?mg.address:"")+'"></label>'+
    '<label>Préfixe réseau (mode statique)<input type="number" name="prefix" min="1" max="30" placeholder="24" value="'+esc(staticMode?mg.prefix:"")+'"></label>'+
    '<label>Passerelle (facultative)<input name="gateway" inputmode="decimal" placeholder="192.168.1.1" value="'+esc(staticMode?mg.gateway:"")+'"></label>'+
    '<label>DNS principal (mode statique)<input name="dns1" inputmode="decimal" placeholder="192.168.1.10" value="'+esc(staticMode?(mg.dns?.[0]??""):"")+'"></label>'+
    '<label>DNS secondaire (facultatif)<input name="dns2" inputmode="decimal" placeholder="192.168.1.11" value="'+esc(staticMode?(mg.dns?.[1]??""):"")+'"></label>'+
    '<button type="submit" class="primary">Enregistrer</button></form>'+
    '<p class="hint">Le mode DHCP est enregistré sur le switch. L’obtention d’un bail nécessite un vrai serveur DHCP raccordé et sera vérifiée dans un scénario de réseau dédié.</p>';
  }
  root.innerHTML='<div class="switch-admin"><div class="switch-shell">'+
   '<aside class="switch-sidebar"><div class="brand"><span class="brand-glyph" aria-hidden="true">◈</span><span>Administration <strong>réseau</strong></span></div>'+
   '<p class="sidebar-heading">ADMINISTRATION</p><nav aria-label="Configuration de l’équipement">'+tabs+'</nav>'+
   '<div class="sidebar-foot">Configuration des équipements</div></aside>'+
   '<div class="switch-workspace"><header class="switch-top"><div><div class="eyebrow">Équipements réseau / Administration</div>'+
   '<h1>'+esc(a.name)+'</h1><p>'+esc(l3?"Switch administrable L3":"Switch administrable L2")+
   ' <span class="state-chip">'+esc(a.status)+'</span></p></div><span class="device-icon" aria-hidden="true">▤</span></header>'+
   '<main class="switch-content"><div class="section-head"><h2>'+esc(tabTitle[tab])+'</h2><span>Configuration de l’équipement</span></div>'+
   (message?'<p class="feedback '+severity+'" role="status">'+esc(message)+'</p>':"")+content+'</main></div></div></div>';
 }
 const onClick=e=>{
  const btn=e.target.closest("[data-tab]");
  if(btn&&root.contains(btn)){tab=btn.dataset.tab;message="";render();return;}
  const port=e.target.closest("[data-port]");
  if(port&&root.contains(port)){selectedPort=port.dataset.port;tab="ports";message="";render();}
 };
 const onChange=e=>{
   const mode=e.target.closest('select[name="mode"]');
   if(!mode||!root.contains(mode)||!mode.closest('form[data-form="management"]'))return;
   const form=mode.closest("form");
   for(const name of ["address","prefix","gateway","dns1","dns2"]){
     const input=form.elements.namedItem(name);
     if(input)input.disabled=mode.value==="dhcp";
   }
 };
 const onSubmit=e=>{
  const form=e.target.closest("form[data-form]");if(!form||!root.contains(form))return;
  e.preventDefault();const data=new FormData(form),a=asset();let res;
  if(form.dataset.form==="vlan"){
   res=addSwitchVlan(registry,a.id,num(data.get("number")),String(data.get("name")).trim());
  }else if(form.dataset.form==="port"){
   const raw=String(data.get("vlans")).trim();
   const values=raw.split(",").map(v=>v.trim());
   const valid=values.every(v=>/^[0-9]{1,4}$/.test(v)&&Number(v)>=1&&Number(v)<=4094);
   if(!valid||!values.length){notify({success:false,message:"Saisis des numéros de VLAN valides, séparés par des virgules."});return;}
   const nums=values.map(Number);
   res=data.get("mode")==="trunk"?
    setSwitchTrunkPort(registry,a.id,String(data.get("portId")),nums):
    (nums.length===1?setSwitchAccessPort(registry,a.id,String(data.get("portId")),nums[0]):
     {success:false,message:"Un port Access appartient à un seul VLAN."});
  }else if(form.dataset.form==="management"){
   res=data.get("mode")==="dhcp"?configureSwitchManagementDhcp(registry,a.id):
    configureSwitchManagementStatic(registry,a.id,String(data.get("address")).trim(),
      num(data.get("prefix")),String(data.get("gateway")).trim()||null,
      [String(data.get("dns1")).trim(),String(data.get("dns2")).trim()].filter(Boolean));
  }
  notify(res);
 };
 root.addEventListener("click",onClick);
 root.addEventListener("submit",onSubmit);
 root.addEventListener("change",onChange);
 render();
 return {refresh:render,setAssetId(id){current=id;tab="overview";selectedPort=null;message="";render();},destroy(){root.removeEventListener("click",onClick);root.removeEventListener("submit",onSubmit);root.removeEventListener("change",onChange);root.replaceChildren();}};
}
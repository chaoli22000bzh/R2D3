/* Administration partageable d'un point d'accès Wi-Fi.
 * Un seul registre R2D3, aucune logique DHCP/VLAN parallèle.
 */
import {getWifiConfig,configureWifiAp} from "./wifi-ap-v1.js";
import {WIFI_RADIO_BANDS,WIFI_RADIO_OPTIONS,effectiveWifiRadios} from "./wifi-radio-config-v1.js";

const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));
const securityChoices=[["open","Ouvert"],["wpa2-personal","WPA2-Personal"],["wpa3-personal","WPA3-Personal"],["wpa2-wpa3-personal","WPA2/WPA3"]];
const bands=[["2.4","2,4 GHz"],["5","5 GHz"],["6","6 GHz"]];
const tabs=[["overview","Vue d’ensemble"],["networks","Réseaux Wi-Fi"],["security","Sécurité"],["radios","Radios"],["vlan","VLAN"]];
const opt=(choices,current)=>choices.map(([value,label])=>'<option value="'+esc(value)+'"'+(String(current)===String(value)?" selected":"")+'>'+esc(label)+'</option>').join("");

export function mountWifiAdmin({root,registry,assetId,onChange}={}){
 if(!root||!registry?.getAsset)throw Error("Élément ou registre réseau absent.");
 const initial=getWifiConfig(registry,assetId);
 if(!initial)throw Error("Point d’accès Wi-Fi introuvable.");
 let draft=copy(initial),page="overview",dirty=false,feedback="",feedbackError=false;
 const get=()=>getWifiConfig(registry,assetId);
 const asset=()=>registry.getAsset(assetId);
 const ssidName=s=>s.name||"Sans nom";
 const status=(message,isError=false)=>{feedback=message;feedbackError=isError;const box=root.querySelector("[data-feedback]");if(box){box.textContent=message;box.hidden=!message;box.classList.toggle("error",isError);}};
 const note=()=>dirty?'<span class="wifi-admin-pending">Modifications non enregistrées</span>':"";
 const overview=()=>{
  const a=asset(),ethernet=(a?.ports||[]).filter(p=>p.type==="ethernet-rj45"),radio=(a?.ports||[]).filter(p=>p.type==="wifi");
  const details=[["Équipement",a?.name||""],["État de l’actif",a?.status||"Non renseigné"],["Ports Ethernet",ethernet.map(p=>p.name).join(", ")||"Aucun"],["Interfaces radio",radio.map(p=>p.name).join(", ")||"Aucune"],["Réseaux configurés",String(draft.ssids.length)],["Réseaux actifs",String(draft.ssids.filter(s=>s.enabled).length)]];
  return '<section class="wifi-admin-panel"><h3>Informations de la borne</h3><dl class="wifi-admin-details">'+details.map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join("")+'</dl></section>'+
   '<section class="wifi-admin-panel"><h3>État du Wi-Fi</h3><label class="wifi-admin-check"><input type="checkbox" data-global-enabled'+(draft.enabled?" checked":"")+'> Activer la borne Wi-Fi</label></section>';
 };
 const networkRow=(s,i)=>'<section class="wifi-admin-panel wifi-admin-ssid" data-ssid="'+esc(s.id)+'">'+
  '<div class="wifi-admin-panel-title"><h3>'+esc(ssidName(s))+'</h3><span>Réseau '+(i+1)+'</span></div>'+
  '<div class="wifi-admin-fields">'+
  '<label class="wifi-admin-label wifi-admin-ssidname">Nom du réseau (SSID)<input data-field="name" maxlength="32" value="'+esc(s.name)+'"></label>'+
  '<div class="wifi-admin-band-field"><span>Bandes Wi-Fi</span><div class="wifi-admin-band-options">'+bands.map(([id,label])=>'<label class="wifi-admin-check"><input type="checkbox" data-band="'+id+'"'+(s.bands.includes(id)?" checked":"")+'> '+label+'</label>').join("")+'</div></div>'+
  '<label class="wifi-admin-check"><input type="checkbox" data-field="enabled"'+(s.enabled?" checked":"")+'> SSID actif</label>'+
  '<label class="wifi-admin-check"><input type="checkbox" data-field="clientIsolation"'+(s.clientIsolation?" checked":"")+'> Isolation mode</label>'+
  '</div><div class="wifi-admin-panel-foot"><button type="button" class="wifi-admin-danger" data-remove-ssid="'+esc(s.id)+'">Supprimer ce SSID</button></div></section>';
 const networks=()=>'<div class="wifi-admin-section-head"><div><h3>Réseaux Wi-Fi</h3><p>Chaque SSID peut être diffusé sur plusieurs bandes.</p></div>'+
  '<button type="button" class="wifi-admin-secondary" data-add-ssid'+(draft.ssids.length>=16?" disabled":"")+'>Ajouter un SSID ('+draft.ssids.length+'/16)</button></div>'+
  (draft.ssids.length?draft.ssids.map(networkRow).join(""):'<p>Aucun SSID configuré. Ajoutez un réseau Wi-Fi.</p>');
 const security=()=>'<div class="wifi-admin-section-head"><div><h3>Sécurité des réseaux</h3><p>Les paramètres sont propres à chaque SSID.</p></div></div>'+
  draft.ssids.map(s=>'<section class="wifi-admin-panel wifi-admin-security-row" data-ssid="'+esc(s.id)+'"><h3>'+esc(ssidName(s))+'</h3>'+
  '<div class="wifi-admin-fields"><label class="wifi-admin-label wifi-admin-security">Mode de sécurité<select data-field="security">'+opt(securityChoices,s.security)+'</select></label>'+
  '<label class="wifi-admin-label wifi-admin-password">Mot de passe<input type="password" autocomplete="new-password" minlength="8" maxlength="63" data-field="password" value="'+esc(s.password||"")+'"'+(s.security==="open"?" disabled":"")+'></label>'+
  '</div></section>').join("");
 const radios=()=>'<div class="wifi-admin-section-head"><div><h3>Radios et canaux</h3><p>Réglage indépendant des bandes disponibles.</p></div></div>'+
  '<section class="wifi-admin-panel wifi-admin-radio-panel">'+WIFI_RADIO_BANDS.map(band=>{
   const r=effectiveWifiRadios(draft)[band],info=WIFI_RADIO_OPTIONS[band];
   return '<div class="wifi-admin-radio-row" data-radio="'+esc(band)+'">'+
    '<label class="wifi-admin-check"><input type="checkbox" data-radio-enabled'+(r.enabled?" checked":"")+'> '+esc(info.label)+'</label>'+
    '<label class="wifi-admin-label wifi-admin-channel">Canal<select data-radio-channel>'+opt([["auto","Automatique"],...info.channels.map(n=>[n,String(n)])],r.channel)+'</select></label></div>';
  }).join("")+'</section>';
 const vlan=()=>'<div class="wifi-admin-section-head"><div><h3>Association SSID / VLAN</h3><p>Un identifiant VLAN est un nombre entre 1 et 4094. Vide : aucun VLAN associé au SSID.</p></div></div>'+
  '<section class="wifi-admin-panel"><div class="wifi-admin-vlan-rows">'+
  draft.ssids.map(s=>'<div class="wifi-admin-vlan-row" data-ssid="'+esc(s.id)+'"><div><strong>'+esc(ssidName(s))+'</strong><span>SSID</span></div>'+
   '<label class="wifi-admin-label wifi-admin-vlan">Identifiant VLAN<input type="text" inputmode="numeric" pattern="[0-9]{1,4}" maxlength="4" data-field="vlanNumber" value="'+esc(s.vlanNumber??"")+'"></label></div>').join("")+
  '</div></section>';
 const pages={overview,networks,security,radios,vlan};
 function render(){
  const a=asset();if(!a)throw Error("Équipement indisponible.");
  root.classList.add("wifi-admin");
  root.innerHTML='<header class="wifi-admin-topbar">Administration réseau</header>'+
   '<div class="wifi-admin-device"><div class="wifi-admin-device-ident"><h2>'+esc(a.name||"Point d’accès")+'</h2><span>Point d’accès Wi-Fi</span></div>'+
   '<span class="wifi-admin-state">'+(draft.enabled?"Wi-Fi activé":"Wi-Fi désactivé")+'</span></div>'+
   '<nav class="wifi-admin-tabs" aria-label="Rubriques de la borne">'+tabs.map(([key,label])=>
    '<button type="button" data-tab="'+key+'" class="'+(page===key?"active":"")+'" aria-current="'+(page===key?"page":"false")+'">'+label+'</button>').join("")+'</nav>'+
   '<div class="wifi-admin-content">'+
   '<div class="wifi-admin-feedback'+(feedbackError?" error":"")+'" data-feedback role="status"'+(!feedback?" hidden":"")+'>'+esc(feedback)+'</div>'+
   pages[page]()+ '<footer class="wifi-admin-actions">'+note()+
   '<button type="button" class="wifi-admin-primary" data-save'+(!dirty?" disabled":"")+'>Enregistrer les réglages</button></footer></div>';
 }
 function collect(){
  if(page==="overview"){
   const enabled=root.querySelector("[data-global-enabled]");
   if(enabled)draft.enabled=enabled.checked;
  }
  if(page==="networks"){
   for(const row of root.querySelectorAll("[data-ssid]")){
    const s=draft.ssids.find(x=>x.id===row.dataset.ssid);if(!s)continue;
    s.name=row.querySelector('[data-field="name"]').value.trim();
    s.bands=[...row.querySelectorAll("[data-band]:checked")].map(x=>x.dataset.band);
    s.enabled=row.querySelector('[data-field="enabled"]').checked;
    s.clientIsolation=row.querySelector('[data-field="clientIsolation"]').checked;
   }
  }
  if(page==="security"){
   for(const row of root.querySelectorAll("[data-ssid]")){
    const s=draft.ssids.find(x=>x.id===row.dataset.ssid);if(!s)continue;
    s.security=row.querySelector('[data-field="security"]').value;
    s.password=s.security==="open"?"":row.querySelector('[data-field="password"]').value;
   }
  }
  if(page==="radios"){
   draft.radios=effectiveWifiRadios(draft);
   for(const row of root.querySelectorAll("[data-radio]")){
    const band=row.dataset.radio,value=row.querySelector("[data-radio-channel]").value;
    draft.radios[band]={enabled:row.querySelector("[data-radio-enabled]").checked,channel:value==="auto"?"auto":Number(value)};
   }
  }
  if(page==="vlan"){
   for(const row of root.querySelectorAll("[data-ssid]")){
    const s=draft.ssids.find(x=>x.id===row.dataset.ssid);if(!s)continue;
    const raw=row.querySelector('[data-field="vlanNumber"]').value.trim();
    s.vlanNumber=raw===""?null:Number(raw);
    s._vlanRaw=raw;
   }
  }
 }
 function validate(){
  if(draft.ssids.length>16)return "Une borne accepte au maximum 16 SSID.";
  for(const s of draft.ssids){
   if(!s.name||s.name.length>32)return "Le nom de chaque SSID doit contenir de 1 à 32 caractères.";
   if(!s.bands.length)return "Sélectionnez au moins une bande pour "+s.name+".";
   if(s.bands.includes("6")&&s.security!=="wpa3-personal")return "La bande 6 GHz nécessite WPA3-Personal pour "+s.name+".";
   if(s.security!=="open"&&s.password!==""&&(s.password.length<8||s.password.length>63))return "Le mot de passe de "+s.name+" doit contenir entre 8 et 63 caractères.";
   if(s._vlanRaw!==undefined&&s._vlanRaw!==""&&!/^[0-9]{1,4}$/.test(s._vlanRaw))return "Identifiant VLAN invalide pour "+s.name+".";
   if(s.vlanNumber!=null&&(!Number.isInteger(s.vlanNumber)||s.vlanNumber<1||s.vlanNumber>4094))return "Le VLAN de "+s.name+" doit être compris entre 1 et 4094.";
  }
  return "";
 }
 function save(){
  collect();
  const invalid=validate();
  if(invalid){status(invalid,true);return {success:false,message:invalid};}
  const config=copy(draft);
  for(const s of config.ssids)delete s._vlanRaw;
  const result=configureWifiAp(registry,assetId,config);
  if(result.success){draft=copy(get());dirty=false;feedback="Configuration enregistrée.";feedbackError=false;render();}
  else status(result.message||"Configuration refusée.",true);
  onChange?.(result);
  return result;
 }
 function newSsid(){
  if(draft.ssids.length>=16){status("Limite de 16 SSID atteinte.",true);return;}
  let n=1;while(draft.ssids.some(s=>s.id==="ssid-"+n))n++;
  let name="WIFI-"+String(n).padStart(2,"0");
  while(draft.ssids.some(s=>s.name===name)){n++;name="WIFI-"+String(n).padStart(2,"0");}
  draft.ssids.push({id:"ssid-"+n,name,enabled:true,security:"open",password:"",bands:["2.4","5"],clientIsolation:false,vlanNumber:null});
  dirty=true;feedback="";render();
 }
 root.onclick=e=>{
  const tab=e.target.closest("[data-tab]");
  if(tab){collect();page=tab.dataset.tab;feedback="";render();return;}
  if(e.target.closest("[data-save]")){save();return;}
  if(e.target.closest("[data-add-ssid]")){collect();newSsid();return;}
  const remove=e.target.closest("[data-remove-ssid]");
  if(remove){
   collect();
   const s=draft.ssids.find(x=>x.id===remove.dataset.removeSsid);
   if(!s)return;
   if(!window.confirm('Supprimer le SSID « '+s.name+' » de la configuration en cours ?'))return;
   draft.ssids=draft.ssids.filter(x=>x.id!==s.id);
   dirty=true;feedback="";render();
  }
 };
 root.oninput=e=>{
  if(e.target.matches("input,select")){dirty=true;const saveButton=root.querySelector("[data-save]");if(saveButton)saveButton.disabled=false;}
 };
 root.onchange=e=>{
  if(e.target.matches('[data-field="security"]')){
   const row=e.target.closest("[data-ssid]");
   const password=row?.querySelector('[data-field="password"]');
   if(password){password.disabled=e.target.value==="open";if(password.disabled)password.value="";}
  }
 };
 render();
 return {render,save,getConfig:get,destroy(){root.onclick=null;root.oninput=null;root.onchange=null;root.replaceChildren();root.classList.remove("wifi-admin");}};
}

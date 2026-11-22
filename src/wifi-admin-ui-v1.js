/* R2D3 - Administration Wi-Fi partageable.
 * Toute configuration est lue et enregistrée dans le registre R2D3.
 * Aucun état radio, VLAN, sécurité ou DHCP parallèle dans cette interface.
 */
import {getWifiConfig,configureWifiAp} from "./wifi-ap-v1.js";
import {WIFI_RADIO_BANDS,WIFI_RADIO_OPTIONS,effectiveWifiRadios} from "./wifi-radio-config-v1.js";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const choices=[["open","Ouvert"],["wpa2-personal","WPA2-Personal"],["wpa3-personal","WPA3-Personal"],["wpa2-wpa3-personal","WPA2/WPA3"]];
export function mountWifiAdmin({root,registry,assetId,onChange}={}){
 if(!root||!registry?.getAsset)throw Error("Élément ou registre R2D3 absent.");
 let error="",isError=false,activeTab="overview";
 const get=()=>getWifiConfig(registry,assetId);
 function render(){
  const config=get();if(!config)throw Error("Borne Wi-Fi R2D3 introuvable.");
  const asset=registry.getAsset(assetId);
  root.classList.add("wifi-admin");
  root.dataset.tab=activeTab;
  root.innerHTML='<div class="wifi-admin-topbar">R2D3 <span>Administration réseau</span></div>'+
   '<div class="wifi-admin-device"><div><strong>'+esc(asset?.name||"Point d’accès Wi-Fi")+'</strong><span>Point d’accès Wi-Fi</span></div><span class="wifi-admin-state">'+(config.enabled?"Activée":"Désactivée")+'</span></div>'+
   '<nav class="wifi-admin-tabs" aria-label="Administration Wi-Fi">'+
   [["overview","Vue d’ensemble"],["networks","Réseaux Wi-Fi"],["security","Sécurité"],["radios","Radios"],["vlan","VLAN"]].map(([id,label])=>'<button type="button" data-tab-target="'+id+'" class="'+(activeTab===id?"active":"")+'" aria-current="'+(activeTab===id?"page":"false")+'">'+label+'</button>').join("")+
   '</nav>'+
   '<section class="wifi-admin-overview"><h3>Vue d’ensemble</h3><dl><div><dt>Nom</dt><dd>'+esc(asset?.name||"")+'</dd></div><div><dt>État</dt><dd>'+(config.enabled?"Activée":"Désactivée")+'</dd></div><div><dt>Ports</dt><dd>'+esc((asset?.ports||[]).map(p=>p.name||p.id).join(", "))+'</dd></div><div><dt>SSID</dt><dd>'+config.ssids.length+'</dd></div></dl></section>'+
   '<div class="wifi-admin-head"><strong>Administration Wi-Fi</strong><label><input type="checkbox" data-enabled '+(config.enabled?"checked":"")+'> Borne activée</label></div>'+
   (error?'<p role="status" class="wifi-admin-feedback '+(isError?"error":"")+'">'+esc(error)+'</p>':"")+
   '<fieldset class="wifi-admin-radios"><legend>Radios et canaux</legend>'+
   WIFI_RADIO_BANDS.map(band=>{
    const options=WIFI_RADIO_OPTIONS[band],radio=effectiveWifiRadios(config)[band];
    return '<div class="wifi-admin-radio" data-radio-band="'+band+'">'+
     '<label class="check"><input type="checkbox" data-radio-enabled'+(radio.enabled?' checked':'')+'> '+options.label+'</label>'+
     '<label>Canal<select data-radio-channel><option value="auto"'+(radio.channel==="auto"?' selected':'')+'>Automatique</option>'+
      options.channels.map(n=>'<option value="'+n+'"'+(radio.channel===n?' selected':'')+'>'+n+'</option>').join("")+'</select></label>'+
     '</div>';
   }).join("")+'</fieldset>'+
   config.ssids.map((s,i)=>'<fieldset data-index="'+i+'"><legend>SSID '+(i+1)+'</legend>'+
    '<label>Nom du réseau<input data-field="name" maxlength="32" value="'+esc(s.name)+'"></label>'+
    '<label>Sécurité<select data-field="security">'+choices.map(([id,label])=>'<option value="'+id+'" '+(s.security===id?"selected":"")+'>'+label+'</option>').join("")+'</select></label>'+
    '<label>Mot de passe<input data-field="password" value="'+esc(s.password||"")+'"></label>'+
    '<div class="wifi-admin-bands" role="group" aria-label="Bandes du SSID '+(i+1)+'"><span>Bandes Wi-Fi</span><div class="wifi-admin-band-options">'+
     [["2.4","2,4 GHz"],["5","5 GHz"],["6","6 GHz"]].map(([id,label])=>
      '<label class="check"><input type="checkbox" data-band="'+id+'"'+(s.bands.includes(id)?' checked':'')+'>'+label+'</label>').join("")+
    '</div></div>'+
    '<label class="wifi-admin-vlan">VLAN<input type="text" inputmode="numeric" pattern="[0-9]{1,4}" maxlength="4" autocomplete="off" data-field="vlanNumber" value="'+esc(s.vlanNumber??"")+'"></label>'+
    '<label class="check"><input type="checkbox" data-field="enabled" '+(s.enabled?"checked":"")+'> SSID actif</label>'+
    '<label class="check"><input type="checkbox" data-field="clientIsolation" '+(s.clientIsolation?"checked":"")+'> Isolation mode</label>'+
    '</fieldset>').join("")+
   '<div class="wifi-admin-actions"><button type="button" data-save class="primary">Enregistrer les réglages</button></div>';
 }
 function save(){
  const prev=get();if(!prev)return {success:false,message:"Borne indisponible."};
  const vlanInputs=[...root.querySelectorAll('[data-field="vlanNumber"]')];
  if(vlanInputs.some(input=>{const value=input.value.trim();return value!==""&&(!/^[0-9]{1,4}$/.test(value)||Number(value)<1||Number(value)>4094);})){
   error="Le numéro de VLAN doit être compris entre 1 et 4094.";isError=true;
   const existing=root.querySelector(".wifi-admin-feedback");
   if(existing){existing.textContent=error;existing.classList.add("error");}
   else {const p=document.createElement("p");p.className="wifi-admin-feedback error";p.setAttribute("role","status");p.textContent=error;root.querySelector(".wifi-admin-head").after(p);}
   return {success:false,message:error};
  }
  // La configuration de chaque SSID doit contenir au moins une bande ;
  // sur 6 GHz le registre n'accepte actuellement que WPA3-Personal.
  const fieldsets=[...root.querySelectorAll('fieldset[data-index]')];
  if(fieldsets.some(fieldset=>{
   const bands=[...fieldset.querySelectorAll('input[data-band]:checked')].map(input=>input.dataset.band);
   return bands.length===0||(bands.includes("6")&&fieldset.querySelector('[data-field="security"]').value!=="wpa3-personal");
  })){
   error="Sélectionne au moins une bande. La bande 6 GHz nécessite WPA3-Personal.";
   isError=true;
   const existing=root.querySelector(".wifi-admin-feedback");
   if(existing){existing.textContent=error;existing.classList.add("error");}
   else {const p=document.createElement("p");p.className="wifi-admin-feedback error";p.setAttribute("role","status");p.textContent=error;root.querySelector(".wifi-admin-head").after(p);}
   return {success:false,message:error};
  }
  const ssids=prev.ssids.map((s,i)=>{
   const fieldset=root.querySelector('fieldset[data-index="'+i+'"]');
   const read=k=>fieldset.querySelector('[data-field="'+k+'"]');
   const raw=read("vlanNumber").value.trim();
   return {...s,name:read("name").value.trim(),security:read("security").value,
     password:read("password").value,
     bands:[...fieldset.querySelectorAll('input[data-band]:checked')].map(input=>input.dataset.band),
     vlanNumber:raw===""?null:Number(raw),
     enabled:read("enabled").checked,clientIsolation:read("clientIsolation").checked};
  });
  const radios=effectiveWifiRadios(prev);
  for(const row of root.querySelectorAll("[data-radio-band]")){
   const band=row.dataset.radioBand;
   const choice=row.querySelector("[data-radio-channel]").value;
   radios[band]={
    enabled:row.querySelector("[data-radio-enabled]").checked,
    channel:choice==="auto"?"auto":Number(choice)
   };
  }
  const result=configureWifiAp(registry,assetId,{enabled:root.querySelector("[data-enabled]").checked,ssids,radios});
  error=result.success?"Configuration de la borne enregistrée.":(result.message||"Configuration refusée.");
  isError=!result.success;
  if(result.success)render();
  else {const box=root.querySelector(".wifi-admin-feedback");if(box){box.textContent=error;box.classList.add("error");}else{const p=document.createElement("p");p.className="wifi-admin-feedback error";p.setAttribute("role","status");p.textContent=error;root.querySelector(".wifi-admin-head").after(p);}}
  onChange?.(result);
  return result;
 }
 root.onclick=e=>{
  const tab=e.target.closest("[data-tab-target]");
  if(tab){
   activeTab=tab.dataset.tabTarget;root.dataset.tab=activeTab;
   for(const button of root.querySelectorAll("[data-tab-target]")){
    const selected=button.dataset.tabTarget===activeTab;
    button.classList.toggle("active",selected);button.setAttribute("aria-current",selected?"page":"false");
   }
   return;
  }
  if(e.target.closest("[data-save]"))save();
 };
 render();return {render,save,getConfig:get};
}

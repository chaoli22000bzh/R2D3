/* Administration partageable d'un point d'accès Wi-Fi.
 * Un seul registre R2D3, aucune logique DHCP/VLAN parallèle.
 */
import {getWifiConfig,configureWifiAp} from "./wifi-ap-v1.js";
import {requestWifiManagementDhcp} from "./wifi-management-dhcp-v1.js";
import {WIFI_RADIO_BANDS,WIFI_RADIO_OPTIONS,effectiveWifiRadios} from "./wifi-radio-config-v1.js";

const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));
const securityChoices=[["open","Ouvert"],["wpa2-personal","WPA2-Personal"],["wpa3-personal","WPA3-Personal"],["wpa2-wpa3-personal","WPA2/WPA3"]];
const bands=[["2.4","2,4 GHz"],["5","5 GHz"],["6","6 GHz"]];
const tabs=[["overview","Vue d’ensemble"],["lan","LAN / IPv4"],["networks","Réseaux Wi-Fi"],["radios","Radios"]];
const opt=(choices,current)=>choices.map(([value,label])=>'<option value="'+esc(value)+'"'+(String(current)===String(value)?" selected":"")+'>'+esc(label)+'</option>').join("");

export function mountWifiAdmin({root,registry,assetId,onChange}={}){
 if(!root||!registry?.getAsset)throw Error("Élément ou registre réseau absent.");
 const initial=getWifiConfig(registry,assetId);
 if(!initial)throw Error("Point d’accès Wi-Fi introuvable.");
 let draft=copy(initial),page="overview",dirty=false,feedback="",feedbackError=false,assetName=registry.getAsset(assetId)?.name||"";
 let lanDraft=copy(registry.getAsset(assetId)?.managementConfig||{assetId,mode:"dhcp",address:null,prefix:null,gateway:null,dns:[],lease:null});
 let lanMask=lanDraft.prefix==null?"":maskOf(lanDraft.prefix);
 function ipv4(value){if(typeof value!=="string"||!/^\d{1,3}(\.\d{1,3}){3}$/.test(value))return false;return value.split(".").every(x=>Number(x)<=255);}
 function maskOf(prefix){const bits=((0xffffffff<<(32-prefix))>>>0);return [24,16,8,0].map(x=>(bits>>>x)&255).join(".");}
 function prefixOf(mask){if(!ipv4(mask))return null;const binary=mask.split(".").map(x=>Number(x).toString(2).padStart(8,"0")).join("");if(!/^1+0*$/.test(binary))return null;const count=binary.indexOf("0");return count===-1?32:count;}
 function sameSubnet(address,gateway,prefix){const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;const toInt=v=>v.split(".").reduce((n,x)=>((n<<8)|Number(x))>>>0,0);return (toInt(address)&mask)===(toInt(gateway)&mask);}

 const get=()=>getWifiConfig(registry,assetId);
 const asset=()=>registry.getAsset(assetId);
 const ssidName=s=>s.name||"Sans nom";
 const status=(message,isError=false)=>{feedback=message;feedbackError=isError;const box=root.querySelector("[data-feedback]");if(box){box.textContent=message;box.hidden=!message;box.classList.toggle("error",isError);}};
 const note=()=>dirty?'<span class="wifi-admin-pending">Modifications non enregistrées</span>':"";
 const overview=()=>{
  const a=asset(),ethernet=(a?.ports||[]).filter(p=>p.type==="ethernet-rj45"),radio=(a?.ports||[]).filter(p=>p.type==="wifi");
  const cables=registry.listCables?.()||[];
  const wired=port=>cables.some(c=>c.ends?.some(end=>end?.portId===port.id));
  const lan=ethernet.length?ethernet.map(p=>'<div class="wifi-admin-lan-row"><strong>'+esc(p.name)+'</strong><span>'+(wired(p)?"Câble raccordé":"Port non raccordé")+'</span></div>').join(""):'<p>Aucun port Ethernet.</p>';
  const details=[["État de l’actif",a?.status||"Non renseigné"],["Interfaces radio",radio.map(p=>p.name).join(", ")||"Aucune"],["Réseaux configurés",String(draft.ssids.length)],["Réseaux actifs",String(draft.ssids.filter(s=>s.enabled).length)]];
  return '<section class="wifi-admin-panel"><h3>Informations de la borne</h3><label class="wifi-admin-label wifi-admin-assetname">Nom de la borne<input data-asset-name maxlength="100" value="'+esc(assetName)+'"></label><dl class="wifi-admin-details">'+details.map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join("")+'</dl></section>'+ '<section class="wifi-admin-panel wifi-admin-lan"><h3>Raccordement LAN</h3>'+lan+'</section>'+
   '<section class="wifi-admin-panel"><h3>État du Wi-Fi</h3><label class="wifi-admin-check"><input type="checkbox" data-global-enabled'+(draft.enabled?" checked":"")+'> Activer la borne Wi-Fi</label></section>';
 };
 const lan=()=>{
  const a=asset(),ports=(a?.ports||[]).filter(p=>p.type==="ethernet-rj45"),cables=registry.listCables?.()||[];
  const physical=ports.map(p=>'<div class="wifi-admin-lan-row"><strong>'+esc(p.name)+'</strong><span>'+
   (cables.some(c=>c.ends?.some(end=>end?.portId===p.id))?"Raccordé":"Non raccordé")+'</span></div>').join("");
  const mode=lanDraft.mode,dhcp=mode==="dhcp";
  return '<section class="wifi-admin-panel wifi-admin-lan"><h3>Interface Ethernet</h3>'+physical+'</section>'+
    '<section class="wifi-admin-panel wifi-admin-ipv4"><h3>IPv4 de gestion de la borne</h3>'+
    '<label class="wifi-admin-label wifi-admin-mode">Mode d’adressage<select data-lan-mode>'+
      opt([["dhcp","DHCP"],["static","Statique"]],mode)+'</select></label>'+
    (dhcp?
      '<p class="wifi-admin-ip-status">Adresse obtenue : '+esc(lanDraft.address||"En attente d’attribution DHCP")+
      (lanDraft.prefix!=null?'/'+lanDraft.prefix:'')+'</p>'+
      '<p class="wifi-admin-ip-note">Sans serveur DHCP accessible, le Core R2D3 attribue une adresse APIPA.</p><button type="button" class="wifi-admin-secondary wifi-admin-renew" data-dhcp-renew>Renouveler DHCP</button>'
     :'<div class="wifi-admin-ip-fields">'+
       '<label class="wifi-admin-label wifi-admin-ip">Adresse IPv4<input data-lan-field="address" inputmode="decimal" maxlength="15" value="'+esc(lanDraft.address||"")+'" placeholder="192.168.1.10"></label>'+
       '<label class="wifi-admin-label wifi-admin-ip">Masque de sous-réseau<input data-lan-mask inputmode="decimal" maxlength="15" value="'+esc(lanMask)+'" placeholder="255.255.255.0"></label>'+
       '<label class="wifi-admin-label wifi-admin-ip">Passerelle<input data-lan-field="gateway" inputmode="decimal" maxlength="15" value="'+esc(lanDraft.gateway||"")+'" placeholder="192.168.1.1"></label>'+
       '<label class="wifi-admin-label wifi-admin-ip">DNS primaire<input data-lan-dns="0" inputmode="decimal" maxlength="15" value="'+esc(lanDraft.dns?.[0]||"")+'"></label>'+
       '<label class="wifi-admin-label wifi-admin-ip">DNS secondaire<input data-lan-dns="1" inputmode="decimal" maxlength="15" value="'+esc(lanDraft.dns?.[1]||"")+'"></label>'+
      '</div>')+'</section>';
 };
 const networkRow=s=>'<section class="wifi-admin-panel wifi-admin-ssid" data-ssid="'+esc(s.id)+'">'+
  '<h3>'+esc(ssidName(s))+'</h3>'+
  '<div class="wifi-admin-network-config">'+
   '<div class="wifi-admin-config-row">'+
    '<label class="wifi-admin-label wifi-admin-ssidname">Nom du réseau (SSID)<input data-field="name" maxlength="32" value="'+esc(s.name)+'"></label>'+
    '<div class="wifi-admin-band-field"><span>Bandes diffusées</span><div class="wifi-admin-band-options">'+bands.map(([id,label])=>'<label class="wifi-admin-check"><input type="checkbox" data-band="'+id+'"'+(s.bands.includes(id)?" checked":"")+'> '+label+'</label>').join("")+'</div></div>'+
   '</div>'+
   '<div class="wifi-admin-config-row wifi-admin-config-security">'+
    '<label class="wifi-admin-label wifi-admin-security">Sécurité<select data-field="security">'+opt(securityChoices,s.security)+'</select></label>'+
    '<label class="wifi-admin-label wifi-admin-password">Mot de passe<input type="password" autocomplete="new-password" minlength="8" maxlength="63" data-field="password" value="'+esc(s.password||"")+'"'+(s.security==="open"?" disabled":"")+'></label>'+
    '<label class="wifi-admin-label wifi-admin-vlan">VLAN du SSID<input type="text" inputmode="numeric" maxlength="4" pattern="[0-9]{1,4}" placeholder="Aucun" data-field="vlanNumber" value="'+esc(s.vlanNumber??"")+'"></label>'+
   '</div>'+
   '<div class="wifi-admin-config-row wifi-admin-config-switches">'+
    '<label class="wifi-admin-check"><input type="checkbox" data-field="enabled"'+(s.enabled?" checked":"")+'> SSID actif</label>'+
    '<label class="wifi-admin-check"><input type="checkbox" data-field="clientIsolation"'+(s.clientIsolation?" checked":"")+'> Isolation mode</label>'+
   '</div>'+
  '</div><div class="wifi-admin-panel-foot"><button type="button" class="wifi-admin-danger" data-remove-ssid="'+esc(s.id)+'">Supprimer ce SSID</button></div></section>';
 const networks=()=>'<div class="wifi-admin-section-head"><div><h3>Réseaux Wi-Fi</h3><p>Chaque SSID peut être diffusé sur plusieurs bandes.</p></div>'+
  '<button type="button" class="wifi-admin-secondary" data-add-ssid'+(draft.ssids.length>=16?" disabled":"")+'>Ajouter un SSID ('+draft.ssids.length+'/16)</button></div>'+
  (draft.ssids.length?draft.ssids.map(networkRow).join(""):'<p>Aucun SSID configuré. Ajoutez un réseau Wi-Fi.</p>');
 const radios=()=>'<div class="wifi-admin-section-head"><div><h3>Radios et canaux</h3><p>Réglage indépendant des bandes disponibles.</p></div></div>'+
  '<section class="wifi-admin-panel wifi-admin-radio-panel">'+WIFI_RADIO_BANDS.map(band=>{
   const r=effectiveWifiRadios(draft)[band],info=WIFI_RADIO_OPTIONS[band];
   return '<div class="wifi-admin-radio-row" data-radio="'+esc(band)+'">'+
    '<label class="wifi-admin-check"><input type="checkbox" data-radio-enabled'+(r.enabled?" checked":"")+'> '+esc(info.label)+'</label>'+
    '<label class="wifi-admin-label wifi-admin-channel">Canal<select data-radio-channel>'+opt([["auto","Automatique"],...info.channels.map(n=>[n,String(n)])],r.channel)+'</select></label></div>';
  }).join("")+'</section>';
 const pages={overview,lan,networks,radios};
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
   const name=root.querySelector("[data-asset-name]");if(name)assetName=name.value.trim();
  }
  if(page==="lan"){
   const mode=root.querySelector("[data-lan-mode]")?.value;
   if(mode==="static"){
    const address=root.querySelector('[data-lan-field="address"]')?.value.trim()||"";
    const gateway=root.querySelector('[data-lan-field="gateway"]')?.value.trim()||"";
    const primary=root.querySelector('[data-lan-dns="0"]')?.value.trim()||"";
    const secondary=root.querySelector('[data-lan-dns="1"]')?.value.trim()||"";
    lanMask=root.querySelector("[data-lan-mask]")?.value.trim()||"";
    const prefix=prefixOf(lanMask);
    lanDraft={assetId,mode:"static",address,prefix,gateway:gateway||null,dns:[primary,secondary].filter(Boolean),lease:null};
   }else if(mode==="dhcp"&&lanDraft.mode!=="dhcp"){
    lanDraft={assetId,mode:"dhcp",address:null,prefix:null,gateway:null,dns:[],lease:null};
   }
  }
  if(page==="networks"){
   for(const row of root.querySelectorAll("[data-ssid]")){
    const s=draft.ssids.find(x=>x.id===row.dataset.ssid);if(!s)continue;
    s.name=row.querySelector('[data-field="name"]').value.trim();
    s.bands=[...row.querySelectorAll("[data-band]:checked")].map(x=>x.dataset.band);
    s.enabled=row.querySelector('[data-field="enabled"]').checked;
    s.clientIsolation=row.querySelector('[data-field="clientIsolation"]').checked;
    s.security=row.querySelector('[data-field="security"]').value;
    s.password=s.security==="open"?"":row.querySelector('[data-field="password"]').value;
    const raw=row.querySelector('[data-field="vlanNumber"]').value.trim();s.vlanNumber=raw===""?null:Number(raw);s._vlanRaw=raw;
   }
  }
  if(page==="radios"){
   draft.radios=effectiveWifiRadios(draft);
   for(const row of root.querySelectorAll("[data-radio]")){
    const band=row.dataset.radio,value=row.querySelector("[data-radio-channel]").value;
    draft.radios[band]={enabled:row.querySelector("[data-radio-enabled]").checked,channel:value==="auto"?"auto":Number(value)};
   }
  }

 }
 function validate(){
  if(!assetName)return "Le nom de la borne est obligatoire.";
  if(lanDraft.mode==="static"){
   if(!ipv4(lanDraft.address))return "Adresse IPv4 de gestion invalide.";
   if(lanDraft.prefix===null||lanDraft.prefix<1||lanDraft.prefix>30)return "Masque de sous-réseau invalide.";
   if(lanDraft.gateway&&(!ipv4(lanDraft.gateway)||!sameSubnet(lanDraft.address,lanDraft.gateway,lanDraft.prefix)))
    return "La passerelle doit être une IPv4 du même sous-réseau.";
   if(lanDraft.dns.some(x=>!ipv4(x)))return "Une adresse DNS est invalide.";
  }

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
  const currentManagement=asset()?.managementConfig;
  const needsManagement=JSON.stringify(currentManagement)!==JSON.stringify(lanDraft);
  if(needsManagement){
   const management=registry.setAssetManagementConfig(assetId,copy(lanDraft));
   if(!management.success){status(management.message||"Configuration IPv4 refusée.",true);return management;}
  }
  const result=configureWifiAp(registry,assetId,config);
  if(!result.success&&needsManagement&&currentManagement){
   registry.setAssetManagementConfig(assetId,currentManagement);
  }
  if(result.success){
   if(assetName!==asset()?.name){const rename=registry.updateAsset(assetId,{name:assetName});if(!rename.success){status(rename.message||"Renommage refusé.",true);return rename;}}
   draft=copy(get());lanDraft=copy(asset().managementConfig);lanMask=lanDraft.prefix==null?"":maskOf(lanDraft.prefix);dirty=false;feedback="Configuration enregistrée.";feedbackError=false;render();
  }
  else status(result.message||"Configuration refusée.",true);
  if(result.success&&lanDraft.mode==="dhcp"&&lanDraft.address===null){
   const lease=requestWifiManagementDhcp({registry,apId:assetId});
   if(lease.success){
    lanDraft=copy(asset().managementConfig);lanMask=lanDraft.prefix==null?"":maskOf(lanDraft.prefix);
    feedback=lease.code==="apipa"?"Aucun bail DHCP : APIPA attribuée par le Core.":"Bail DHCP attribué par le Core.";
    feedbackError=false;render();
   }else{feedback="Configuration enregistrée. DHCP non exécuté : "+lease.message;feedbackError=true;render();}
  }
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
  if(e.target.closest("[data-dhcp-renew]")){
   collect();
   if(dirty){status("Enregistrez les modifications avant le renouvellement DHCP.",true);return;}
   const renewal=requestWifiManagementDhcp({registry,apId:assetId});
   if(renewal.success){
    lanDraft=copy(asset().managementConfig);lanMask=lanDraft.prefix==null?"":maskOf(lanDraft.prefix);
    feedback=renewal.code==="apipa"?"Aucun DHCP accessible : APIPA attribuée par le Core.":"Bail DHCP attribué par le Core.";
    feedbackError=false;render();
   }else status(renewal.message||"Renouvellement DHCP refusé.",true);
   return;
  }
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
  if(e.target.matches("[data-lan-mode]")){collect();dirty=true;feedback="";render();return;}
  if(e.target.matches('[data-field="security"]')){
   const row=e.target.closest("[data-ssid]");
   const password=row?.querySelector('[data-field="password"]');
   if(password){password.disabled=e.target.value==="open";if(password.disabled)password.value="";}
  }
 };
 render();
 return {render,save,getConfig:get,destroy(){root.onclick=null;root.oninput=null;root.onchange=null;root.replaceChildren();root.classList.remove("wifi-admin");}};
}

/* R2D3 : administration NetCam V1.
 * Une caméra physique, interfaces réseau clientes communes.
 * Ne crée ni point d'accès, ni serveur DHCP, ni session réseau fictive.
 */
import {requestAssetInterfaceDhcp} from "./network-client-dhcp-v1.js?dhcp-multi-v1=1";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const choices=(values,selected)=>values.map(([value,label])=>
 '<option value="'+esc(value)+'"'+(String(selected)===String(value)?" selected":"")+'>'+esc(label)+'</option>').join("");
const ip=v=>typeof v==="string"&&/^\d{1,3}(\.\d{1,3}){3}$/.test(v)&&v.split(".").every(x=>Number(x)<=255);
const security=[["open","Ouvert"],["wpa2-personal","WPA2-Personal"],["wpa3-personal","WPA3-Personal"],["wpa2-wpa3-personal","WPA2/WPA3-Personal"]];

export function mountNetCamAdmin({root,registry,assetId,onChange}={}){
 if(!root||!registry?.getAsset||!registry?.getProfile||!registry?.listAssetNetworkInterfaces||
    !registry?.setAssetInterfaceIpv4||!registry?.setAssetClientWifi||!registry?.updateAssetComponent||!registry?.setAssetField)
  throw Error("Registre réseau R2D3 indisponible.");
 let page="network",portId=null,editMode=null,feedback="",isError=false;
 const get=()=>{
  const a=registry.getAsset(assetId);
  if(!a||registry.getProfile(a.profileId)?.netcamProfile!==true)throw Error("NetCam introuvable.");
  return a;
 };
 const interfaces=()=>registry.listAssetNetworkInterfaces(assetId);
 const control=(name,label,value,extra="")=>'<label>'+label+'<input name="'+name+'" value="'+esc(value??"")+'" '+extra+'></label>';
 const select=(name,label,items,value)=>'<label>'+label+'<select name="'+name+'">'+choices(items,value)+'</select></label>';
 const info=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value??"Non renseigné")+'</dd></div>';
 const message=(text,error=false)=>{feedback=text;isError=error;render();};
 function wifiDiagnosis(port){
  if(port.type!=="wifi"||!port.clientWifi?.ssid||typeof registry.listAssets!=="function")return "";
  const boxes=registry.listAssets().filter(a=>a.boxConfig?.mode!=="bridge"&&a.boxConfig?.wifi?.enabled);
  const names=[...new Set(boxes.flatMap(b=>b.boxConfig.wifi.ssids.filter(s=>s.enabled).map(s=>s.name)))];
  if(!names.length)return " Aucune box Wi-Fi active disponible dans le parc.";
  if(!names.includes(port.clientWifi.ssid))
   return " Aucun réseau Wi-Fi de box ne diffuse le SSID « "+port.clientWifi.ssid+" ». SSID disponibles : "+names.join(", ")+".";
  const matches=boxes.flatMap(b=>b.boxConfig.wifi.ssids.filter(s=>s.enabled&&s.name===port.clientWifi.ssid));
  if(!matches.some(s=>s.security===port.clientWifi.security))
   return " Le SSID est reconnu, mais le mode de sécurité ne correspond pas à celui de la box.";
  return " Vérifier l'association Wi-Fi et le serveur DHCP.";
 }
 function network(){
  const ports=interfaces();
  if(!ports.length)return '<section class="nc-panel"><h3>Interfaces réseau</h3><p>Aucune interface Ethernet ou Wi-Fi sur cet actif. Ajoutez une interface au profil ou à l’actif.</p></section>';
  if(!ports.some(p=>p.id===portId))portId=ports[0].id;
  const p=ports.find(p=>p.id===portId),c=p.ipv4,wifi=p.clientWifi;
  const mode=editMode??c?.mode??"dhcp",isWifi=p.type==="wifi";
  const status=c?.address?c.address+"/"+c.prefix:"Adresse non attribuée";
  const rows=ports.map(v=>{
   const label=v.name+" ("+(v.type==="wifi"?"Wi-Fi":"Ethernet")+")";
   const modeLabel=v.ipv4?.mode==="static"?"IPv4 fixe":"DHCP";
   const address=v.ipv4?.address?v.ipv4.address+"/"+v.ipv4.prefix:"Non attribuée";
   const active=v.id===portId;
   return '<tr class="'+(active?"nc-selected":"")+'"><td><button type="button" data-nc-port="'+esc(v.id)+'" aria-pressed="'+active+'">'+esc(label)+'</button></td>'+
    '<td>'+esc(modeLabel)+'</td><td>'+esc(address)+'</td></tr>';
  }).join("");
  return '<section class="nc-panel"><h3>Interfaces réseau</h3>'+
    '<div class="nc-table-wrap"><table class="nc-interfaces"><thead><tr><th>Interface</th><th>Mode</th><th>IPv4</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div>'+
    '<p class="nc-hint">Sélectionnez une interface pour afficher et modifier ses paramètres.</p>'+
    '<h3 class="nc-config-heading">Configuration : '+esc(p.name)+' ('+(isWifi?"Wi-Fi":"Ethernet")+')</h3>'+
    '<dl class="nc-details">'+info("Adressage actuel",status)+
     info("Passerelle",c?.gateway)+info("DNS",c?.dns?.join(", ")||null)+'</dl>'+
    '<form data-nc-form="network" class="nc-form">'+
    select("mode","Mode d'adressage",[["dhcp","Automatique (DHCP)"],["static","IPv4 fixe"]],mode)+
    (mode==="dhcp"?
      '<p class="nc-hint nc-wide">Le Core DHCP obtient l’adresse ou attribue une APIPA si aucun serveur n’est joignable. La réservation éventuelle se configure sur le serveur DHCP.</p>'+
      '<p class="nc-hint nc-wide">Adresse obtenue : <strong>'+esc(status)+'</strong></p>':
      control("address","Adresse IPv4",c?.mode==="static"?c.address:"",'required inputmode="decimal" class="nc-ip"')+
      control("prefix","Préfixe",c?.mode==="static"?c.prefix:24,'required inputmode="numeric" pattern="[0-9]{1,2}" class="nc-prefix"')+
      control("gateway","Passerelle",c?.mode==="static"?c.gateway:"",'inputmode="decimal" class="nc-ip"')+
      control("dns1","DNS 1",c?.mode==="static"?c.dns?.[0]:"",'inputmode="decimal" class="nc-ip"')+
      control("dns2","DNS 2",c?.mode==="static"?c.dns?.[1]:"",'inputmode="decimal" class="nc-ip"'))+
    (isWifi?
      '<h3 class="nc-wide">Client Wi-Fi</h3>'+
      control("ssid","SSID",wifi?.ssid??"",'maxlength="32" class="nc-ssid"')+
      select("security","Sécurité",security,wifi?.security??"wpa2-personal")+
      '<label>Mot de passe<input name="password" type="password" autocomplete="new-password" maxlength="63" value="'+esc(wifi?.password??"")+'" class="nc-password"></label>'+
      '<p class="nc-hint nc-wide">Renseigner le SSID ne prouve pas la connexion. L’association est vérifiée par les composants réseau communs.</p>':'')+
    '<div class="nc-actions nc-wide"><button type="submit">Enregistrer</button>'+
      (mode==="dhcp"?'<button type="button" data-nc-renew class="nc-secondary">Renouveler DHCP</button>':'')+'</div>'+
    '</form></section>';
 }
 function camera(){
  const a=get(),c=a.netCamera;
  return '<section class="nc-panel"><h3>Caméra intégrée</h3>'+
   '<p class="nc-hint">Une seule caméra, intégrée à la NetCam. Sa suppression est interdite.</p>'+
   '<form data-nc-form="camera" class="nc-form">'+
   select("resolution","Résolution",[["","Non renseignée"],["720p","720p"],["1080p","1080p"],["2K","2K"],["4K","4K"],["Autre","Autre"]],c.resolution)+
   select("microphone","Microphone",[["","Non renseigné"],["yes","Oui"],["no","Non"]],c.microphone===null?"":c.microphone?"yes":"no")+
   '<div class="nc-actions nc-wide"><button type="submit">Enregistrer</button></div></form></section>';
 }
 function details(){
  const a=get(),p=registry.getProfile(a.profileId);
  const keys=["usage_netcam","vision_nocturne","vue_panoramique","protection_ip","alimentation_netcam"];
  const field=key=>p.fields.find(f=>f.key===key);
  const options=key=>{
   const f=field(key),value=a.values[key]??"";
   if(f?.type==="boolean")return [["","Non renseigné"],["true","Oui"],["false","Non"]];
   const list=f?.options??[];
   const all=String(value)&&!list.includes(value)?[value,...list]:list;
   return [["","Non renseigné"],...all.map(v=>[v,v])];
  };
  return '<section class="nc-panel"><h3>Caractéristiques de la NetCam</h3>'+
   '<form data-nc-form="details" class="nc-form">'+
   keys.map(k=>select(k,field(k)?.label??k,options(k),a.values[k]===null?"":String(a.values[k]))).join("")+
   '<div class="nc-actions nc-wide"><button type="submit">Enregistrer</button></div></form></section>';
 }
 function render(){
  const a=get();
  root.innerHTML='<div class="netcam-admin"><header class="nc-head"><div><strong>'+esc(a.name)+'</strong><span>Administration NetCam</span></div></header>'+
   '<nav class="nc-tabs" aria-label="Rubriques NetCam">'+
   [["network","Réseau"],["camera","Caméra"],["details","Informations"]].map(([key,name])=>
    '<button type="button" data-nc-tab="'+key+'" aria-pressed="'+(page===key)+'">'+name+'</button>').join("")+'</nav>'+
   (page==="network"?network():page==="camera"?camera():details())+
   (feedback?'<p class="nc-feedback'+(isError?" nc-error":"")+'" role="status">'+esc(feedback)+'</p>':"")+
   '</div>';
 }
 function change(e){
  if(e.target.name==="portId"){portId=e.target.value;editMode=null;feedback="";render();}
  if(e.target.name==="mode"){
   editMode=e.target.value;feedback="";render();
  }
 }
 function submit(e){
  const form=e.target.closest("[data-nc-form]");
  if(!form)return;
  e.preventDefault();
  const data=new FormData(form),kind=form.dataset.ncForm,a=get();
  if(kind==="network"){
   const p=interfaces().find(p=>p.id===portId);if(!p)return message("Interface introuvable.",true);
   const mode=String(data.get("mode")),previous=p.ipv4;
   let config;
   if(mode==="dhcp"){
    config=previous?.mode==="dhcp"?previous:{mode:"dhcp",status:"disconnected",address:null,prefix:null,gateway:null,dns:[]};
   }else{
    const address=String(data.get("address")??"").trim(),prefix=Number(data.get("prefix"));
    const gateway=String(data.get("gateway")??"").trim(),dns=[String(data.get("dns1")??"").trim(),String(data.get("dns2")??"").trim()].filter(Boolean);
    if(!ip(address)||!Number.isInteger(prefix)||prefix<1||prefix>32||
       (gateway&&!ip(gateway))||dns.length>2||dns.some(v=>!ip(v)))
     return message("Paramètres IPv4 invalides.",true);
    config={mode:"static",status:p.type==="ethernet-rj45"&&p.connectedCableIds?.length?"connected":"disconnected",address,prefix,gateway:gateway||null,dns};
   }
   if(p.type==="wifi"){
    const ssid=String(data.get("ssid")??"").trim(),securityType=String(data.get("security")??""),password=String(data.get("password")??"");
    if(ssid.length>32||!security.some(v=>v[0]===securityType)||
       (securityType==="open"&&password!=="")||password.length>63||
       (securityType!=="open"&&password!==""&&password.length<8))
     return message("Paramètres client Wi-Fi invalides.",true);
    // Vérifier d'abord le mode IPv4 ; refuser un doublon sans toucher au Wi-Fi.
    const v=registry.setAssetInterfaceIpv4(assetId,p.id,config);
    if(!v.success)return message(v.message,true);
    const w=registry.setAssetClientWifi(assetId,p.id,{ssid,security:securityType,password});
    if(!w.success)return message(w.message,true);
   }else{
    const v=registry.setAssetInterfaceIpv4(assetId,p.id,config);
    if(!v.success)return message(v.message,true);
   }
   editMode=null;
   if(mode==="dhcp"){
    const requested=requestAssetInterfaceDhcp({registry,assetId,portId:p.id});
    const savedText=p.type==="wifi"?"Paramètres Wi-Fi enregistrés. ":"Configuration réseau enregistrée. ";
    if(!requested.success){onChange?.();return message(savedText+"Connexion : "+requested.message,true);}
    onChange?.();
    return message(requested.code==="apipa"?
     savedText+"Adresse APIPA attribuée."+wifiDiagnosis(interfaces().find(v=>v.id===p.id)):
     savedText+"Connexion DHCP établie : "+requested.address+"/"+requested.prefix+".");
   }
   onChange?.();message("Configuration de l'interface enregistrée.");
  }else if(kind==="camera"){
   const microphone=String(data.get("microphone"));
   const r=registry.updateAssetComponent(assetId,"camera",a.netCamera.id,{
    resolution:String(data.get("resolution")??""),
    microphone:microphone===""?null:microphone==="yes"});
   if(r.success)onChange?.();message(r.message,!r.success);
  }else if(kind==="details"){
   const keys=["usage_netcam","vision_nocturne","vue_panoramique","protection_ip","alimentation_netcam"];
   const p=registry.getProfile(a.profileId);
   const changes=keys.map(k=>{const raw=String(data.get(k)??"");
    return {key:k,value:raw===""?null:p.fields.find(f=>f.key===k)?.type==="boolean"?raw==="true":raw};});
   for(const change of changes){
    const r=registry.setAssetField(assetId,change.key,change.value);
    if(!r.success)return message(r.message,true);
   }
   onChange?.();message("Caractéristiques enregistrées.");
  }
 }
 function click(e){
  const renew=e.target.closest("[data-nc-renew]");
  if(renew){
   const r=requestAssetInterfaceDhcp({registry,assetId,portId});
   if(r.success)onChange?.();
   message(r.success?(r.code==="apipa"?
    "Adresse APIPA attribuée."+wifiDiagnosis(interfaces().find(v=>v.id===portId)):
    "Configuration DHCP obtenue : "+r.address+"/"+r.prefix+"."):r.message,!r.success);
   return;
  }
  const port=e.target.closest("[data-nc-port]");
  if(port){
   portId=port.dataset.ncPort;editMode=null;feedback="";render();
   return;
  }
  const button=e.target.closest("[data-nc-tab]");
  if(!button)return;
  page=button.dataset.ncTab;feedback="";render();
 }
 // Une interface DHCP fraîchement créée demande immédiatement sa
 // configuration au Core, même si aucun équipement n'est raccordé.
 for(const p of interfaces().filter(p=>!p.ipv4||p.ipv4.mode==="dhcp")){
  const response=requestAssetInterfaceDhcp({registry,assetId,portId:p.id});
  if(!response.success){feedback="DHCP "+p.name+" : "+response.message;isError=true;}
 }
 root.addEventListener("change",change);
 root.addEventListener("submit",submit);
 root.addEventListener("click",click);
 render();
 return {render,destroy(){root.removeEventListener("change",change);root.removeEventListener("submit",submit);root.removeEventListener("click",click);root.replaceChildren();}};
}

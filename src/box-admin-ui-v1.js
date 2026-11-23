/* R2D3 : administration de la box Internet V1.
 * Un actif composite, même registre R2D3 et mêmes moteurs métiers.
 * Aucune administration VLAN/switch. WAN routé et VPN non simulés ici.
 */
import {WIFI_RADIO_BANDS,WIFI_RADIO_OPTIONS} from "./wifi-radio-config-v1.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));
const options=(items,selected)=>items.map(([v,label])=>'<option value="'+esc(v)+'"'+(String(v)===String(selected)?' selected':'')+'>'+esc(label)+'</option>').join("");
const security=[["open","Ouvert"],["wpa2-personal","WPA2-Personal"],["wpa3-personal","WPA3-Personal"],["wpa2-wpa3-personal","WPA2/WPA3-Personal"]];
const bands=[["2.4","2,4 GHz"],["5","5 GHz"],["6","6 GHz"]];
const tabs=[["overview","Vue d’ensemble"],["lan","LAN et DHCP"],["wan","Internet (WAN)"],["wifi","Wi-Fi"]];
const checked=x=>x?" checked":"";
const ipv4=x=>typeof x==="string"&&/^(\d{1,3}\.){3}\d{1,3}$/.test(x)&&x.split(".").every(o=>Number(o)<=255);

export function mountBoxAdmin({root,registry,assetId,onChange}={}){
 if(!root||!registry?.getAsset||!registry?.setBoxLanConfig||!registry?.setBoxWanConfig||!registry?.setBoxWifiConfig)
  throw Error("Registre R2D3 ou interface indisponible.");
 let id=assetId,page="overview",feedback="",feedbackError=false,ssidIndex=0;
 const get=()=>{const a=registry.getAsset(id);if(!a?.boxConfig)throw Error("Box Internet introuvable.");return a;};
 let lan=copy(get().boxConfig.lan),wifi=copy(get().boxConfig.wifi),wan=copy(get().boxConfig.wan??{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]});
 const physical=id=>registry.listCables().some(c=>c.ends.some(end=>end?.portId===id));
 function status(message,error=false){feedback=message;feedbackError=error;render();}
 const info=(title,value)=>'<div><dt>'+esc(title)+'</dt><dd>'+esc(value)+'</dd></div>';
 const portButton=(id,label,internal=false)=>{
  const active=internal||physical(id);
  return '<div class="box-port" title="'+esc(label)+'">'+
   '<span class="mini-label">'+esc(label)+'</span>'+
   '<span class="mini-socket '+(active?'box-linked':'')+'"><span></span></span>'+
   '<small>'+esc(internal?"Interne":active?"Raccordé":"Libre")+'</small></div>';
 };
 function overview(a){
  const c=a.boxConfig;
  return '<section class="admin-panel"><h3>Équipement</h3><dl class="device-details">'+
   info("Type","Box Internet")+
   info("Mode matériel","Routeur + switch L2 6 ports + point d’accès Wi-Fi")+
   info("Passerelle LAN",c.lan.address+"/"+c.lan.prefix)+
   info("Serveur DHCP",c.lan.dhcpEnabled?"Actif":"Arrêté")+
   info("Wi-Fi",c.wifi.enabled?"Actif":"Arrêté")+
   info("WAN IPv4",c.wan?.mode==="static"?c.wan.address+"/"+c.wan.prefix:"Client DHCP (adresse non attribuée)")+
   info("Accès Internet","Non simulé pour ce lot")+
   info("VLAN","Non administrables")+
   '</dl></section>'+
   '<section class="admin-panel"><h3>Connectiques externes</h3><div class="box-port-bank">'+
   portButton(c.ports.wanPortId,"WAN")+
   c.ports.lanPortIds.map((p,i)=>portButton(p,"LAN "+(i+1))).join("")+
   '</div><p class="box-note">Switch interne non administrable : LAN 1 à 6 appartiennent au même réseau. Le port 5 relie le Wi-Fi ; le port 6 relie le routeur. Ces deux connexions sont permanentes.</p></section>'+
   '<section class="admin-panel"><h3>Connexion Internet</h3>'+
   '<p class="box-note">Le modem reste un équipement externe, raccordé au port WAN. L’administration IPv4 WAN, le NAT/PAT, les VPN et le mode bridge seront intégrés dans les lots suivants. Leur fonctionnement n’est pas simulé par cette interface.</p></section>';
 }
 const field=(name,label,value,type="text",extra="")=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
 function lanPanel(){
  const pool=lan.pools[0];
  return '<section class="admin-panel"><h3>Adresse IPv4 du routeur LAN</h3>'+
   '<form data-form="box-lan" class="box-form">'+
   field("address","Adresse IPv4",lan.address,"text",'required inputmode="decimal"')+
   field("prefix","Préfixe CIDR",lan.prefix,"number",'min="1" max="30" required class="box-cidr"')+
   '<label class="box-check"><input type="checkbox" name="enabled"'+checked(lan.dhcpEnabled)+'> Serveur DHCP actif</label>'+
   '<h3 class="box-span">Plage DHCP du routeur</h3>'+
   field("start","Début de plage",pool.start,"text",'required inputmode="decimal"')+
   field("end","Fin de plage",pool.end,"text",'required inputmode="decimal"')+
   field("leaseSeconds","Bail (secondes)",pool.leaseSeconds,"number",'min="60" max="2592000" required')+
   field("dns1","DNS 1",pool.dns[0]||"")+
   field("dns2","DNS 2",pool.dns[1]||"")+
   '<p class="box-note box-span">Le routeur reste l’unique serveur DHCP. Tous les PC filaires et Wi-Fi utilisent ce réseau et sa passerelle.</p>'+
   '<div class="form-actions box-span"><button class="primary" type="submit">Enregistrer LAN et DHCP</button></div></form></section>';
 }
 function wanPanel(){
  const c=wan,box=get(),connected=physical(box.boxConfig.ports.wanPortId);
  return '<section class="admin-panel"><h3>Connexion Internet : WAN IPv4</h3>'+
   '<p class="box-note">Le modem est un équipement externe. La présence du câble ne prouve pas l’obtention d’une adresse ni l’accès à Internet.</p>'+
   '<dl class="device-details">'+info("Câble WAN",connected?"Raccordé":"Débranché")+
   info("Configuration",c.mode==="dhcp"?"Client DHCP":"IPv4 statique")+
   info("Adresse WAN",c.mode==="static"?c.address+"/"+c.prefix:"Non attribuée")+
   info("Connexion Internet","Non simulée (lot d’adressage)")+'</dl></section>'+
   '<section class="admin-panel"><h3>Paramètres WAN IPv4</h3>'+
   '<form data-form="box-wan" class="box-form">'+
   '<label>Mode d’adressage<select name="mode" data-wan-mode>'+
   options([["dhcp","Automatique (DHCP)"],["static","Statique"]],c.mode)+'</select></label>'+
   (c.mode==="static"?
     field("address","Adresse IPv4",c.address,"text",'required inputmode="decimal"')+
     field("prefix","Préfixe réseau",c.prefix??24,"number",'min="1" max="30" required class="box-cidr"')+
     field("gateway","Passerelle",c.gateway,"text",'required inputmode="decimal"')+
     field("dns1","DNS 1",c.dns[0]??"")+
     field("dns2","DNS 2",c.dns[1]??""):
     '<p class="box-note box-span">L’adresse IPv4, le préfixe, la passerelle et les DNS seront obtenus du serveur DHCP situé côté WAN, lors du prochain lot fonctionnel.</p>')+
   '<div class="form-actions box-span"><button type="submit" class="primary">Enregistrer le WAN IPv4</button></div></form></section>';
 }
 function wifiPanel(){
  const ssids=wifi.ssids,sel=ssids[ssidIndex]??ssids[0];
  if(!sel)ssidIndex=0;
  const optionsSsid=ssids.map((s,i)=>[i,s.name||"Sans nom"]);
  return '<section class="admin-panel"><h3>Point d’accès intégré</h3>'+
   '<label class="box-check"><input data-global-wifi type="checkbox"'+checked(wifi.enabled)+'> Activer le Wi-Fi</label>'+
   '<p class="box-note">La borne est reliée en interne au port LAN 5. Les clients Wi-Fi appartiennent au même LAN que les PC filaires. Aucun VLAN par SSID.</p></section>'+
   '<section class="admin-panel"><h3>SSID ('+ssids.length+'/16)</h3>'+
   '<div class="box-actions"><label>Réseau à configurer<select data-ssid-select>'+options(optionsSsid,ssidIndex)+'</select></label>'+
   '<button type="button" data-action="ssid-add"'+(ssids.length>=16?' disabled':'')+'>Ajouter un SSID</button>'+
   '<button type="button" data-action="ssid-remove"'+(ssids.length<=1?' disabled':'')+'>Supprimer</button></div>'+
   (sel?'<form data-form="box-ssid" class="box-form">'+
     field("name","Nom du réseau (SSID)",sel.name,"text",'maxlength="32" required')+
     '<label>Sécurité<select name="security">'+options(security,sel.security)+'</select></label>'+
     field("password","Mot de passe (8 à 63 caractères)",sel.password,"text",'autocomplete="off"')+
     '<label class="box-check"><input type="checkbox" name="enabled"'+checked(sel.enabled)+'> SSID actif</label>'+
     '<label class="box-check"><input type="checkbox" name="clientIsolation"'+checked(sel.clientIsolation)+'> Isolation mode</label>'+
     '<fieldset class="box-span"><legend>Bandes utilisées</legend><div class="box-band-row">'+
      bands.map(([id,label])=>'<label class="box-check"><input type="checkbox" name="band-'+id+'"'+checked(sel.bands.includes(id))+'> '+label+'</label>').join("")+
      '</div></fieldset>'+
     '<div class="box-span form-actions"><button type="submit" class="primary">Enregistrer le SSID</button></div></form>':'')+
   '</section>'+radiosPanel();
 }
 function radiosPanel(){
  return '<section class="admin-panel"><h3>Interfaces radio</h3>'+
   '<form data-form="box-radios" class="box-form">'+
   WIFI_RADIO_BANDS.map(band=>{
    const cfg=wifi.radios[band],choice=WIFI_RADIO_OPTIONS[band];
    return '<div class="box-radio"><label class="box-check"><input type="checkbox" name="enabled-'+band+'"'+checked(cfg.enabled)+'> '+esc(choice.label)+'</label>'+
     '<label>Canal<select name="channel-'+band+'">'+options([["auto","Automatique"],...choice.channels.map(c=>[c,String(c)])],cfg.channel)+'</select></label></div>';
   }).join("")+
   '<p class="box-note box-span">La disponibilité d’un SSID dépend de ses bandes et des radios activées.</p>'+
   '<div class="form-actions box-span"><button class="primary" type="submit">Enregistrer les radios</button></div></form></section>';
 }
 function render(){
  const a=get();
  root.innerHTML='<div class="switch-admin v4 router-admin box-admin"><header class="device-bar"><div class="device-ident"><h2>'+esc(a.name)+'</h2><span>Box Internet</span><span class="device-state">'+esc(a.status)+'</span></div></header>'+
   '<nav class="device-tabs">'+tabs.map(([key,label])=>'<button type="button" data-page="'+key+'" class="menu-item'+(page===key?' active':'')+'">'+label+'</button>').join("")+'</nav>'+
   '<main class="admin-content">'+(page==="overview"?overview(a):page==="lan"?lanPanel():page==="wan"?wanPanel():wifiPanel())+
   (feedback?'<p class="box-feedback'+(feedbackError?' error':'')+'" role="status">'+esc(feedback)+'</p>':'')+
   '</main></div>';
 }
 const read=(form,name)=>form.elements.namedItem(name)?.value.trim()??"";
 function submit(e){
  const form=e.target.closest("form[data-form]");if(!form)return;
  e.preventDefault();
  const kind=form.dataset.form;
  if(kind==="box-wan"){
   const mode=read(form,"mode");
   const next=mode==="dhcp"?{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]}:{
    mode:"static",address:read(form,"address"),prefix:Number(read(form,"prefix")),
    gateway:read(form,"gateway"),dns:[read(form,"dns1"),read(form,"dns2")].filter(Boolean)};
   const result=registry.setBoxWanConfig(id,next);
   if(result.success){wan=copy(result.wan);onChange?.();}
   status(result.message,!result.success);
  }else if(kind==="box-lan"){
   const address=read(form,"address"),prefix=Number(read(form,"prefix"));
   const start=read(form,"start"),end=read(form,"end"),dns=[read(form,"dns1"),read(form,"dns2")].filter(Boolean);
   if(![address,start,end,...dns].every(ipv4)){status("Adresse IPv4 ou DNS incorrect.",true);return;}
   const next={...lan,address,prefix,dhcpEnabled:form.elements.namedItem("enabled").checked,
    pools:[{...lan.pools[0],start,end,prefix,gateway:address,dns,
     leaseSeconds:Number(read(form,"leaseSeconds"))}]};
   const result=registry.setBoxLanConfig(id,next);
   if(result.success){lan=copy(result.lan);onChange?.();}
   status(result.message,!result.success);
  }else if(kind==="box-ssid"){
   const sel=wifi.ssids[ssidIndex];if(!sel)return;
   const securityValue=read(form,"security");
   const next=copy(wifi);
   next.ssids[ssidIndex]={...sel,name:read(form,"name"),security:securityValue,
    password:securityValue==="open"?"":read(form,"password"),
    enabled:form.elements.namedItem("enabled").checked,
    clientIsolation:form.elements.namedItem("clientIsolation").checked,
    bands:bands.map(([band])=>band).filter(b=>form.elements.namedItem("band-"+b).checked)};
   const result=registry.setBoxWifiConfig(id,next);
   if(result.success){wifi=copy(result.wifi);onChange?.();}
   status(result.message,!result.success);
  }else if(kind==="box-radios"){
   const next=copy(wifi);
   for(const band of WIFI_RADIO_BANDS){
    const raw=read(form,"channel-"+band);
    next.radios[band]={enabled:form.elements.namedItem("enabled-"+band).checked,
     channel:raw==="auto"?"auto":Number(raw)};
   }
   const result=registry.setBoxWifiConfig(id,next);
   if(result.success){wifi=copy(result.wifi);onChange?.();}
   status(result.message,!result.success);
  }
 }
 function click(e){
  const tab=e.target.closest("[data-page]");if(tab){page=tab.dataset.page;feedback="";render();return;}
  const action=e.target.closest("[data-action]");if(!action)return;
  if(action.dataset.action==="ssid-add"){
   if(wifi.ssids.length>=16)return;
   const next=copy(wifi),n=next.ssids.length+1;
   next.ssids.push({id:"ssid-"+(Math.max(0,...next.ssids.map(s=>Number(s.id.match(/\d+$/)?.[0])||0))+1),
    name:"WIFI-"+String(n).padStart(2,"0"),enabled:false,security:"wpa2-personal",
    password:"",clientIsolation:false,bands:["2.4","5"]});
   const result=registry.setBoxWifiConfig(id,next);
   if(result.success){wifi=copy(result.wifi);ssidIndex=wifi.ssids.length-1;onChange?.();}
   status(result.message,!result.success);
  }else if(action.dataset.action==="ssid-remove"){
   if(wifi.ssids.length<=1)return;
   const next=copy(wifi);next.ssids.splice(ssidIndex,1);
   const result=registry.setBoxWifiConfig(id,next);
   if(result.success){wifi=copy(result.wifi);ssidIndex=0;onChange?.();}
   status(result.message,!result.success);
  }
 }
 function change(e){
  if(e.target.matches("[data-wan-mode]")){
   const newMode=e.target.value;
   wan=newMode==="dhcp"?{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]}:
    {...wan,mode:"static",address:wan.address||"",prefix:wan.prefix??24,gateway:wan.gateway||"",dns:wan.dns||[]};
   feedback="";render();return;
  }
  if(e.target.matches("[data-ssid-select]")){ssidIndex=Number(e.target.value);feedback="";render();}
  if(e.target.matches("[data-global-wifi]")){
   const next={...wifi,enabled:e.target.checked},r=registry.setBoxWifiConfig(id,next);
   if(r.success){wifi=copy(r.wifi);onChange?.();}
   status(r.message,!r.success);
  }
 }
 root.addEventListener("click",click);root.addEventListener("change",change);root.addEventListener("submit",submit);
 render();
 return {render,setAssetId(next){id=next;page="overview";ssidIndex=0;feedback="";lan=copy(get().boxConfig.lan);wifi=copy(get().boxConfig.wifi);wan=copy(get().boxConfig.wan);render();},
  destroy(){root.removeEventListener("click",click);root.removeEventListener("change",change);root.removeEventListener("submit",submit);root.replaceChildren();}};
}

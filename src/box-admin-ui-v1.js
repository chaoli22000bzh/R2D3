/* R2D3 : administration de la box Internet V1.
 * Un actif composite, même registre R2D3 et mêmes moteurs métiers.
 * Aucune administration VLAN/switch. L’état Internet provient d’une observation réseau.
 * Un WAN adressé ne prouve jamais à lui seul l’accès Internet.
 */
import {WIFI_RADIO_BANDS,WIFI_RADIO_OPTIONS} from "./wifi-radio-config-v1.js";
import {renderPatAdmin,submitPatAdmin,actionPatAdmin} from "./pat-admin-ui-v1.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));
const options=(items,selected)=>items.map(([v,label])=>'<option value="'+esc(v)+'"'+(String(v)===String(selected)?' selected':'')+'>'+esc(label)+'</option>').join("");
const security=[["open","Ouvert"],["wpa2-personal","WPA2-Personal"],["wpa3-personal","WPA3-Personal"],["wpa2-wpa3-personal","WPA2/WPA3-Personal"]];
const bands=[["2.4","2,4 GHz"],["5","5 GHz"],["6","6 GHz"]];
const tabs=[["overview","Vue d’ensemble"],["lan","LAN et DHCP"],["wan","Internet (WAN)"],["pat","PAT entrant"],["wifi","Wi-Fi"]];
const checked=x=>x?" checked":"";
const ipv4=x=>typeof x==="string"&&/^(\d{1,3}\.){3}\d{1,3}$/.test(x)&&x.split(".").every(o=>Number(o)<=255);

export function mountBoxAdmin({root,registry,assetId,onChange,getInternetStatus}={}){
 if(!root||!registry?.getAsset||!registry?.setBoxLanConfig||!registry?.setBoxWanConfig||!registry?.setBoxWifiConfig||!registry?.setBoxMode)
  throw Error("Registre R2D3 ou interface indisponible.");
 let id=assetId,page="overview",feedback="",feedbackError=false,ssidIndex=0,editingPatId=null;
 let ssidFeedback="",ssidFeedbackError=false,radioFeedback="",radioFeedbackError=false;
 const get=()=>{const a=registry.getAsset(id);if(!a?.boxConfig)throw Error("Box Internet introuvable.");return a;};
 let lan=copy(get().boxConfig.lan),wifi=copy(get().boxConfig.wifi),wan=copy(get().boxConfig.wan??{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]});
 // L'état de la prise appartient au port de l'actif et non à une liste
 // de câbles potentiellement filtrée (les liaisons internes restent cachées).
 const physical=(asset,portId)=>asset.ports.some(p=>
  p.id===portId&&Array.isArray(p.connectedCableIds)&&p.connectedCableIds.length>0);
 const connection=()=>{
  const box=get(),wan=registry.getBoxWanEffective?.(id);
  if(box.boxConfig.mode==="bridge")return "WAN transmis sur LAN 1 (bridge)";
  if(box.status!=="En service")return "Box hors service";
  if(!wan?.address||!wan?.gateway)return "WAN non configuré";
  const observation=typeof getInternetStatus==="function"?getInternetStatus(id):null;
  return observation?.connected===true&&observation?.wanAddress===wan.address?
   "Connecté à Internet simulé":"Accès Internet non vérifié";
 };
 function status(message,error=false){feedback=message;feedbackError=error;render();}
 function wifiStatus(section,message,error=false){
  if(section==="ssid"){ssidFeedback=message;ssidFeedbackError=error;}
  else{radioFeedback=message;radioFeedbackError=error;}
  feedback="";render();
 }
 const info=(title,value)=>'<div><dt>'+esc(title)+'</dt><dd>'+esc(value)+'</dd></div>';
 const portButton=(asset,portId,label,disabled=false)=>{
  const connected=physical(asset,portId);
  return '<div class="box-port" title="'+esc(label)+'">'+
   '<span class="mini-label">'+esc(label)+'</span>'+
   '<span class="mini-socket '+(!disabled&&connected?'box-linked':'')+'"><span></span></span>'+
   '<small>'+esc(disabled?"Inactif":connected?"Actif · raccordé":"Actif · libre")+'</small></div>';
 };
 function overview(a){
  const c=a.boxConfig,effective=registry.getBoxWanEffective?.(id),bridge=c.mode==="bridge";
  return '<section class="admin-panel"><h3>Équipement</h3><dl class="device-details">'+
   info("Type","Box Internet")+
   info("Mode de fonctionnement",c.mode==="bridge"?"Bridge":"Routeur")+
   info("Mode matériel","Routeur + switch L2 6 ports + point d’accès Wi-Fi")+
   info("Passerelle LAN",c.lan.address+"/"+c.lan.prefix)+
   info("Serveur DHCP",bridge?"Inactif (bridge)":c.lan.dhcpEnabled?"Actif":"Arrêté")+
   info("Wi-Fi",bridge?"Inactif (bridge)":c.wifi.enabled?"Actif":"Arrêté")+
   info("Routage IPv4",bridge?"Inactif":"Actif")+
   info("NAT/PAT",bridge?"Inactif":"Actif")+
   info("WAN IPv4",effective?effective.address+"/"+effective.prefix:"Non configurée")+
   info("Accès Internet",connection())+
   info("VLAN","Non administrables")+
   '</dl></section>'+
   '<section class="admin-panel"><h3>Mode de fonctionnement</h3><form data-form="box-mode" class="box-form">'+
   '<label>Mode<select name="mode">'+options([["router","Routeur"],["bridge","Bridge"]],c.mode??"router")+'</select></label>'+
   '<p class="box-note box-span">En mode bridge, seuls LAN 1 et WAN sont utilisables. Wi-Fi, DHCP, routage et NAT/PAT sont neutralisés. Les réglages sont conservés.</p>'+ 
   (feedback&&!feedbackError?'<p class="box-feedback box-span" role="status">'+esc(feedback)+'</p>':'')+
   '<div class="form-actions box-span"><button class="primary" type="submit">Enregistrer le mode</button></div></form></section>'+
   '<section class="admin-panel"><h3>Connectiques externes</h3><div class="box-port-bank">'+
   '<div class="box-port box-port-wan" title="WAN relié à Internet simulé">'+
    '<span class="mini-label">WAN</span>'+
    '<span class="mini-socket box-wan-virtual"><span></span></span>'+
    '<small>Internet</small></div>'+
   c.ports.lanPortIds.map((p,i)=>portButton(a,p,"LAN "+(i+1),bridge&&i!==0)).join("")+
   '</div><p class="box-note">'+(bridge?'Bridge : LAN 1 et WAN actifs, LAN 2 à 5 inactifs. LAN 6 conserve sa liaison interne ; passage WAN logique réservé au LAN 1. Les câbles restent branchés.':'Mode routeur : LAN 1 à 6 appartiennent au même réseau. LAN 5 relie le Wi-Fi ; LAN 6 relie le routeur. Les liaisons internes sont permanentes.')+'</p></section>'+ 
   '<section class="admin-panel"><h3>Connexion Internet</h3>'+
   '<p class="box-note">'+(bridge?'Mode bridge : aucune traduction NAT/PAT, aucun routage ni service DHCP/Wi-Fi de la box. Le WAN reste logiquement destiné au seul LAN 1 ; la communication directe avec un pare-feu externe fera l’objet d’une recette propre.':'Le WAN est relié directement à Internet simulé. Routage et PAT sortant disponibles pour les services déclarés ; une connexion doit être prouvée par un test.')+'</p></section>';
 }
 const field=(name,label,value,type="text",extra="")=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
 function lanPanel(){
  const pool=lan.pools[0],bridge=get().boxConfig.mode==="bridge";
  return '<section class="admin-panel"><h3>Adresse IPv4 du routeur LAN</h3>'+
   (bridge?'<p class="box-feedback" role="status">Serveur DHCP désactivé en mode Bridge. Les paramètres sont conservés pour le retour en mode Routeur.</p>':'')+
   '<form data-form="box-lan" class="box-form">'+
   '<fieldset class="box-span"'+(bridge?' disabled':'')+' style="display:contents">'+
   field("address","Adresse IPv4",lan.address,"text",'required inputmode="decimal"')+
   field("prefix","Préfixe CIDR",lan.prefix,"number",'min="1" max="30" required class="box-cidr"')+
   '<label class="box-check"><input type="checkbox" name="enabled"'+(bridge?'':checked(lan.dhcpEnabled))+'> Serveur DHCP actif</label>'+
   '<h3 class="box-span">Plage DHCP du routeur</h3>'+
   field("start","Début de plage",pool.start,"text",'required inputmode="decimal"')+
   field("end","Fin de plage",pool.end,"text",'required inputmode="decimal"')+
   field("leaseSeconds","Bail (secondes)",pool.leaseSeconds,"number",'min="60" max="2592000" required')+
   field("dns1","DNS 1",pool.dns[0]||"")+
   field("dns2","DNS 2",pool.dns[1]||"")+
   '</fieldset>'+
   (!bridge?'<p class="box-note box-span">Le routeur reste l’unique serveur DHCP. Tous les PC filaires et Wi-Fi utilisent ce réseau et sa passerelle.</p>':'')+
   '<div class="form-actions box-span"><button class="primary" type="submit"'+(bridge?' disabled':'')+'>Enregistrer LAN et DHCP</button></div></form></section>';
 }
 function wanPanel(){
  const c=wan,effective=registry.getBoxWanEffective?.(id),bridge=get().boxConfig.mode==="bridge";
  return '<section class="admin-panel"><h3>Connexion Internet : WAN IPv4</h3>'+
   (bridge?'<p class="box-feedback" role="status">WAN en mode Bridge : l’adresse IPv4, la passerelle et les DNS WAN sont destinés à l’équipement raccordé au LAN 1. La box ne possède plus cette IPv4 pour le routage. Aucun NAT/PAT.</p>':'<p class="box-note">La box est directement reliée à l’Internet simulé. Aucun modem ni équipement FAI n’est à installer.</p>')+
   '<dl class="device-details">'+
   info("Mode de fonctionnement",bridge?"Bridge : WAN vers LAN 1":"Routeur")+
   info("Configuration mémorisée",c.mode==="dhcp"?"Client DHCP":"IPv4 statique")+
   info(bridge?"IPv4 destinée au PC LAN 1":"Adresse WAN de la box",effective?effective.address+"/"+effective.prefix:"Non configurée")+
   info("Passerelle",effective?.gateway??"Non configurée")+
   info("DNS 1",effective?.dns?.[0]??"Non configuré")+
   info("DNS 2",effective?.dns?.[1]??"Non configuré")+
   info("Routage et NAT/PAT",bridge?"Inactifs":"Disponibles")+
   info("Connexion Internet",connection())+'</dl></section>'+
   '<section class="admin-panel"><h3>Paramètres WAN IPv4</h3>'+
   '<form data-form="box-wan" class="box-form">'+
   '<fieldset class="box-span"'+(bridge?' disabled':'')+' style="display:contents">'+
   '<label>Mode d’adressage<select name="mode" data-wan-mode>'+
   options([["dhcp","Automatique (DHCP)"],["static","Statique"]],c.mode)+'</select></label>'+
   (c.mode==="static"?
     field("address","Adresse IPv4",c.address,"text",'required inputmode="decimal"')+
     field("prefix","Préfixe réseau",c.prefix??24,"number",'min="1" max="30" required class="box-cidr"')+
     field("gateway","Passerelle",c.gateway,"text",'required inputmode="decimal"')+
     field("dns1","DNS 1",c.dns[0]??"")+
     field("dns2","DNS 2",c.dns[1]??""):
     '<p class="box-note box-span">L’Internet simulé attribue automatiquement l’adresse WAN, le préfixe, la passerelle et les DNS Orange de référence. Aucun équipement FAI n’est représenté.</p>')+
   '</fieldset>'+
   (bridge?'<p class="box-note box-span">Réglages WAN conservés et non modifiables en mode Bridge. Retourne en mode Routeur pour les modifier.</p>':'')+
   '<div class="form-actions box-span"><button type="submit" class="primary"'+(bridge?' disabled':'')+'>Enregistrer le WAN IPv4</button></div></form></section>';
 }
 function wifiPanel(){
  const ssids=wifi.ssids,sel=ssids[ssidIndex]??ssids[0],bridge=get().boxConfig.mode==="bridge";
  if(!sel)ssidIndex=0;
  const optionsSsid=ssids.map((s,i)=>[i,s.name||"Sans nom"]);
  return '<section class="admin-panel"><h3>Point d’accès intégré</h3>'+ 
    (bridge?'<p class="box-feedback" role="status">Wi-Fi désactivé en mode Bridge. Les paramètres sont conservés pour le retour en mode Routeur.</p>':'')+
   '<label class="box-check"><input data-global-wifi type="checkbox"'+(bridge?' disabled':checked(wifi.enabled))+'> Activer le Wi-Fi</label>'+
   '<p class="box-note">La borne est reliée en interne au port LAN 5. Les clients Wi-Fi appartiennent au même LAN que les PC filaires. Aucun VLAN par SSID.</p></section>'+
   '<section class="admin-panel"><h3>SSID ('+ssids.length+'/16)</h3>'+
   '<div class="box-actions"><label>Réseau à configurer<select data-ssid-select'+(bridge?' disabled':'')+'>'+options(optionsSsid,ssidIndex)+'</select></label>'+
   '<button type="button" data-action="ssid-add"'+(bridge||ssids.length>=16?' disabled':'')+'>Ajouter un SSID</button>'+
   '<button type="button" data-action="ssid-remove"'+(bridge||ssids.length<=1?' disabled':'')+'>Supprimer</button></div>'+
   (sel?'<form data-form="box-ssid" class="box-form">'+
      '<fieldset class="box-span"'+(bridge?' disabled':'')+' style="display:contents">'+
     field("name","Nom du réseau (SSID)",sel.name,"text",'maxlength="32" required')+
     '<label>Sécurité<select name="security">'+options(security,sel.security)+'</select></label>'+
     field("password","Mot de passe (8 à 63 caractères)",sel.password,"password",'autocomplete="off" minlength="8" maxlength="63"')+
     '<label class="box-check"><input type="checkbox" data-toggle-ssid-password'+(bridge?' disabled':'')+'> Afficher le mot de passe</label>'+
     '<label class="box-check"><input type="checkbox" name="enabled"'+checked(sel.enabled)+'> SSID actif</label>'+
     '<label class="box-check"><input type="checkbox" name="clientIsolation"'+checked(sel.clientIsolation)+'> Isolation mode</label>'+
     '<fieldset class="box-span"><legend>Bandes utilisées</legend><div class="box-band-row">'+
      bands.map(([id,label])=>'<label class="box-check"><input type="checkbox" name="band-'+id+'"'+checked(sel.bands.includes(id))+'> '+label+'</label>').join("")+
      '</div></fieldset>'+
     '</fieldset><div class="box-span form-actions"><button type="button" data-save-ssid class="primary"'+(bridge?' disabled':'')+'>Enregistrer le SSID</button></div>'+
     (ssidFeedback?'<p class="box-feedback box-span'+(ssidFeedbackError?' error':'')+'" role="status">'+esc(ssidFeedback)+'</p>':'')+'</form>':'')+
   '</section>'+radiosPanel();
 }
 function radiosPanel(){
  const bridge=get().boxConfig.mode==="bridge";
  return '<section class="admin-panel"><h3>Interfaces radio</h3>'+
   '<form data-form="box-radios" class="box-form">'+
    '<fieldset class="box-span"'+(bridge?' disabled':'')+' style="display:contents">'+
   WIFI_RADIO_BANDS.map(band=>{
    const cfg=wifi.radios[band],choice=WIFI_RADIO_OPTIONS[band];
    return '<div class="box-radio"><label class="box-check"><input type="checkbox" name="enabled-'+band+'"'+checked(cfg.enabled)+'> '+esc(choice.label)+'</label>'+
     '<label>Canal<select name="channel-'+band+'">'+options([["auto","Automatique"],...choice.channels.map(c=>[c,String(c)])],cfg.channel)+'</select></label></div>';
   }).join("")+
   '<p class="box-note box-span">La disponibilité d’un SSID dépend de ses bandes et des radios activées.</p>'+
   '</fieldset><div class="form-actions box-span"><button class="primary" type="button" data-save-radios'+(bridge?' disabled':'')+'>Enregistrer les radios</button></div>'+
    (radioFeedback?'<p class="box-feedback box-span'+(radioFeedbackError?' error':'')+'" role="status">'+esc(radioFeedback)+'</p>':'')+'</form></section>';
 }
 function render(){
  const a=get();
  root.innerHTML='<div class="switch-admin v4 router-admin box-admin"><header class="device-bar"><div class="device-ident"><h2>'+esc(a.name)+'</h2><span>Box Internet</span><span class="device-state">'+esc(a.status)+'</span></div></header>'+
   '<nav class="device-tabs">'+tabs.map(([key,label])=>'<button type="button" data-page="'+key+'" class="menu-item'+(page===key?' active':'')+'">'+label+'</button>').join("")+'</nav>'+
   '<main class="admin-content">'+(page==="overview"?overview(a):page==="lan"?lanPanel():page==="wan"?wanPanel():page==="pat"?(get().boxConfig.mode==="bridge"?'<p class="box-feedback">PAT entrant inactif en mode bridge. Les règles restent enregistrées.</p>':'')+renderPatAdmin({registry,assetId:id,kind:"box",editingRuleId:editingPatId}):wifiPanel())+
   (feedback?'<p class="box-feedback'+(feedbackError?' error':'')+'" role="status">'+esc(feedback)+'</p>':'')+
   '</main></div>';
 }
 const read=(form,name)=>form.elements.namedItem(name)?.value.trim()??"";
 function submit(e){
  const form=e.target.closest("form[data-form]");if(!form)return;
  e.preventDefault();
  const kind=form.dataset.form;
  if(kind==="box-mode"){
    const result=registry.setBoxMode(id,read(form,"mode"));
    if(result.success)onChange?.();
    status(result.success?(result.mode==="bridge"?"Mode Bridge activé.":"Mode Routeur activé."):result.message,!result.success);
   }else if(kind==="pat-rule"){
   const result=submitPatAdmin({registry,assetId:id,kind:"box",editingRuleId:editingPatId,form});
   if(result.success){editingPatId=null;onChange?.();}
   status(result.message??(result.success?"Règle PAT enregistrée.":"Règle PAT refusée."),!result.success);
  }else if(kind==="box-wan"){
    if(get().boxConfig.mode==="bridge"){status("WAN non modifiable en mode Bridge.",true);return;}
   const mode=read(form,"mode");
   const next=mode==="dhcp"?{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]}:{
    mode:"static",address:read(form,"address"),prefix:Number(read(form,"prefix")),
    gateway:read(form,"gateway"),dns:[read(form,"dns1"),read(form,"dns2")].filter(Boolean)};
   const result=registry.setBoxWanConfig(id,next);
   if(result.success){wan=copy(result.wan);onChange?.();}
   status(result.message,!result.success);
  }else if(kind==="box-lan"){
    if(get().boxConfig.mode==="bridge"){status("Paramètres LAN et DHCP non modifiables en mode Bridge.",true);return;}
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
   if(get().boxConfig.mode==="bridge"){status("Wi-Fi non modifiable en mode Bridge.",true);return;}
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
    wifiStatus("ssid",result.success?"Configuration SSID enregistrée":result.message||"Enregistrement SSID refusé.",!result.success);
  }else if(kind==="box-radios"){
   if(get().boxConfig.mode==="bridge"){status("Radios Wi-Fi non modifiables en mode Bridge.",true);return;}
   const next=copy(wifi);
   for(const band of WIFI_RADIO_BANDS){
    const raw=read(form,"channel-"+band);
    next.radios[band]={enabled:form.elements.namedItem("enabled-"+band).checked,
     channel:raw==="auto"?"auto":Number(raw)};
   }
   const result=registry.setBoxWifiConfig(id,next);
   if(result.success){wifi=copy(result.wifi);onChange?.();}
    wifiStatus("radio",result.success?"Configuration radio enregistrée":result.message||"Enregistrement radio refusé.",!result.success);
  }
 }
 function click(e){
  const passwordToggle=e.target.closest("[data-toggle-ssid-password]");
  if(passwordToggle){
   if(get().boxConfig.mode==="bridge")return;
   const input=root.querySelector('form[data-form="box-ssid"] input[name="password"]');
   if(input)input.type=passwordToggle.checked?"text":"password";
   return;
  }
  const save=e.target.closest("[data-save-ssid], [data-save-radios]");
  if(save){
   const form=save.closest("form[data-form]");
   if(!form)return;
   if(typeof form.reportValidity==="function"&&!form.reportValidity())return;
   submit({target:{closest:selector=>selector==="form[data-form]"?form:null},preventDefault(){}});
   return;
  }
  const tab=e.target.closest("[data-page]");if(tab){page=tab.dataset.page;feedback="";render();return;}
  const pat=e.target.closest("[data-pat-action]");
  if(pat){
   const result=actionPatAdmin({registry,assetId:id,kind:"box",action:pat.dataset.patAction,ruleId:pat.dataset.patId});
   if(result.success){editingPatId=result.editingRuleId??null;if(!["new","edit"].includes(pat.dataset.patAction))onChange?.();}
   status(result.message??(result.success?"Règle PAT mise à jour.":"Action PAT refusée."),!result.success);return;
  }
  const action=e.target.closest("[data-action]");if(!action)return;
  if(get().boxConfig.mode==="bridge"){status("SSID non modifiables en mode Bridge.",true);return;}
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
    if(get().boxConfig.mode==="bridge")return;
   const newMode=e.target.value;
   wan=newMode==="dhcp"?{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]}:
    {...wan,mode:"static",address:wan.address||registry.getBoxWanEffective?.(id)?.address||"",
     prefix:wan.prefix??registry.getBoxWanEffective?.(id)?.prefix??24,
     gateway:wan.gateway||registry.getBoxWanEffective?.(id)?.gateway||"",
     dns:wan.dns?.length?wan.dns:(registry.getBoxWanEffective?.(id)?.dns??[])};
   feedback="";render();return;
  }
  if(e.target.matches("[data-ssid-select]")){
   if(get().boxConfig.mode==="bridge")return;
   ssidIndex=Number(e.target.value);feedback="";ssidFeedback="";render();
  }
  if(e.target.matches("[data-global-wifi]")){
   if(get().boxConfig.mode==="bridge"){status("Wi-Fi désactivé en mode Bridge.",true);return;}
   const next={...wifi,enabled:e.target.checked},r=registry.setBoxWifiConfig(id,next);
   if(r.success){wifi=copy(r.wifi);onChange?.();}
   status(r.message,!r.success);
  }
 }
 root.addEventListener("click",click);root.addEventListener("change",change);root.addEventListener("submit",submit);
 render();
 return {render,setAssetId(next){id=next;page="overview";ssidIndex=0;editingPatId=null;feedback="";ssidFeedback="";radioFeedback="";lan=copy(get().boxConfig.lan);wifi=copy(get().boxConfig.wifi);wan=copy(get().boxConfig.wan);render();},
  destroy(){root.removeEventListener("click",click);root.removeEventListener("change",change);root.removeEventListener("submit",submit);root.replaceChildren();}};
}

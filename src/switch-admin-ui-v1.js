/*
 * Administration graphique des commutateurs L2/L3.
 * Vue et commandes seulement : aucun état métier propre à l'interface.
 * Les ports, VLAN et paramètres IPv4 proviennent du registre R2 et des adaptateurs communs.
 */
import {addSwitchVlan,updateSwitchVlan,removeSwitchVlan,setSwitchAccessPort,setSwitchTrunkPort} from "./vlan-v1.js";
import {configureSwitchManagementStatic,configureSwitchManagementDhcp} from "./switch-management-ip-v01.js";
import {getSwitchRoutingConfig,setSwitchInterVlanRouting,setSwitchVlanInterface} from "./inter-vlan-routing-v1.js";
import {getAssetIpHelperConfig,setVlanIpHelper} from "./ip-helper-v1.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const opts=(list,value)=>list.map(([id,title])=>'<option value="'+esc(id)+'"'+(String(value)===String(id)?' selected':'')+'>'+esc(title)+'</option>').join("");
const message=r=>r?.message||r?.reason||r?.code||"Configuration refusée";
export function mountSwitchAdmin({root,registry,assetId}){
 if(!root||!registry?.getAsset||!registry?.listCables)throw Error("Interface ou registre réseau indisponible");
 let id=assetId,page="overview",selectedPort=null,selectedVlanId=null,selectedRoutingVlan=null,feedback="",feedbackType="ok";
 const pages={overview:"Vue d’ensemble",ports:"Ports",vlans:"VLAN",management:"IPv4 de gestion",routing:"Routage inter-VLAN"};
 const get=()=>{const a=registry.getAsset(id);if(!a?.networkCapabilities?.includes("vlan"))throw Error("Commutateur administrable introuvable");return a;};
 const report=r=>{feedback=message(r);feedbackType=r?.success?"ok":"error";render();};
 const portInfo=(a,p)=>{
  const config=a.vlanConfig.ports[p.id],vlan=a.vlanConfig.vlans;
  const linked=registry.listCables().some(c=>c.ends.some(end=>end?.portId===p.id));
  const mode=config.mode==="access"?"Access":"Trunk";
  const number=config.mode==="access"?vlan.find(v=>v.id===config.vlanId)?.number:
   config.allowedVlanIds.map(x=>vlan.find(v=>v.id===x)?.number).join(", ");
  return {linked,mode,number};
 };
 const portGrid=(a,ports)=>'<section class="port-panel" aria-label="Ports Ethernet"><div class="port-panel-head">'+
   '<strong>Ports</strong><span>'+ports.length+' × RJ45</span></div>'+
   '<div class="port-bank" role="group" aria-label="Sélection d’un port">'+ports.map((p,i)=>{
     const info=portInfo(a,p),current=selectedPort===p.id;
     return '<button type="button" class="mini-port'+(current?' chosen':'')+(info.linked?' linked':'')+
       '" data-port="'+esc(p.id)+'" aria-label="'+esc(p.name)+', '+(info.linked?'raccordé':'libre')+', '+info.mode+
       ' VLAN '+esc(info.number)+'" aria-pressed="'+current+'" title="'+esc(p.name+' · '+info.mode+' VLAN '+info.number)+'">'+
       '<span class="mini-label">'+esc(p.name.replace(/^GE0?/,""))+'</span><span class="mini-socket" aria-hidden="true"><span></span></span></button>';
   }).join("")+'</div>'+
   '<div class="port-legend"><span><i class="legend-dot up"></i>Câblé</span><span><i class="legend-dot down"></i>Non câblé</span></div></section>';
 const table=(heads,rows)=>'<div class="table-scroll"><table class="admin-table"><thead><tr>'+
  heads.map(h=>'<th scope="col">'+h+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';
 const render=()=>{
  const a=get(),ports=a.ports.filter(p=>p.type==="ethernet-rj45");
  const vlans=a.vlanConfig.vlans,mg=a.managementConfig,l3=a.networkCapabilities.includes("inter-vlan-routing");
  if(!ports.some(p=>p.id===selectedPort))selectedPort=ports[0]?.id??null;
  const menu=Object.entries(pages).filter(([key])=>key!=="routing"||l3).map(([key,label])=>'<button type="button" data-page="'+key+
   '" class="menu-item'+(key===page?' active':'')+'" aria-current="'+(key===page?'page':'false')+'">'+label+'</button>').join("");
  let content="";
  if(page==="overview"){
   const details=[
    ["Type",l3?"Switch L3":"Switch L2"],
    ["IPv4 de gestion",mg.address?mg.address+"/"+mg.prefix:mg.mode==="dhcp"?"En attente (DHCP)":"Non configurée"],
    ["Adressage",mg.mode==="static"?"Statique":"DHCP"],["PoE",a.poe?"Oui":"Non"],
    ["Ports",String(ports.length)],["VLAN",String(vlans.length)]
   ];
   content=portGrid(a,ports)+'<section class="admin-panel"><h3>Informations</h3>'+
    '<dl class="device-details">'+details.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join("")+'</dl></section>';
  }else if(page==="ports"){
   const p=ports.find(x=>x.id===selectedPort),state=p&&a.vlanConfig.ports[p.id];
   const info=p?portInfo(a,p):null;
   const all=ports.map(port=>{
    const z=portInfo(a,port);
    return '<tr class="'+(port.id===selectedPort?'row-selected':'')+'"><td><button type="button" class="table-port" data-port="'+esc(port.id)+'">'+esc(port.name)+'</button></td>'+
     '<td><span class="connection '+(z.linked?'on':'off')+'">'+(z.linked?'Raccordé':'Libre')+'</span></td><td>'+z.mode+'</td><td>'+esc(z.number)+'</td></tr>';
   });
   const chosen=state.mode==="access"?[vlans.find(v=>v.id===state.vlanId)?.number]:
    state.allowedVlanIds.map(v=>vlans.find(x=>x.id===v)?.number);
   content=portGrid(a,ports)+
    '<section class="admin-panel ports-table"><h3>Configuration des ports</h3>'+table(["Port","Câblage","Mode","VLAN"],all)+'</section>'+
    (p?'<section class="admin-panel edit-panel"><h3>Port '+esc(p.name)+'</h3>'+
     '<form data-form="port" class="form-grid"><input type="hidden" name="portId" value="'+esc(p.id)+'">'+
     '<label>Mode<select name="mode">'+opts([["access","Access"],["trunk","Trunk"]],state.mode)+'</select></label>'+
     '<label>VLAN autorisés<input name="vlans" required value="'+esc(chosen.join(", "))+'"></label>'+
     '<div class="form-actions"><button type="submit" class="primary">Appliquer</button></div></form></section>':'');
  }else if(page==="vlans"){
   if(!vlans.some(v=>v.id===selectedVlanId))selectedVlanId=vlans[0]?.id??null;
   const current=vlans.find(v=>v.id===selectedVlanId);
   content='<section class="admin-panel"><h3>VLAN configurés</h3>'+
    '<p class="routing-table-hint">Sélectionnez un VLAN pour modifier ses paramètres.</p>'+
    table(["Identifiant","Nom"],vlans.map(v=>'<tr class="routing-data-row '+(v.id===selectedVlanId?'row-selected':'')+'" data-edit-vlan="'+esc(v.id)+'"><td><button type="button" class="table-port" data-edit-vlan="'+esc(v.id)+'" aria-pressed="'+(v.id===selectedVlanId)+'">'+esc(v.number)+'</button></td><td>'+esc(v.name)+'</td></tr>'))+
    '</section><section class="admin-panel edit-panel"><h3>Modifier un VLAN</h3>'+
    (current?'<form data-form="vlan-edit" class="form-grid"><input type="hidden" name="vlanId" value="'+esc(current.id)+'">'+
     '<label>Identifiant VLAN<input type="number" name="number" min="1" max="4094" required value="'+esc(current.number)+'"'+(current.number===1?' readonly':'')+'></label>'+
     '<label>Nom<input name="name" maxlength="50" required value="'+esc(current.name)+'"></label>'+
     '<div class="form-actions vlan-edit-actions"><button class="primary" type="submit" name="vlanAction" value="save">Enregistrer les modifications</button>'+
     (current.number!==1?'<button class="secondary-danger" type="submit" name="vlanAction" value="delete" formnovalidate>Supprimer ce VLAN</button>':'')+
     '</div></form>':'')+'</section>'+
    '<section class="admin-panel edit-panel"><h3>Ajouter un VLAN</h3>'+
    '<form data-form="vlan" class="form-grid"><label>Identifiant VLAN<input type="number" name="number" min="2" max="4094" required></label>'+
    '<label>Nom<input name="name" maxlength="50" required></label>'+
    '<div class="form-actions"><button class="primary" type="submit">Ajouter</button></div></form></section>';
  }else if(page==="routing"&&l3){
   const routing=getSwitchRoutingConfig(registry,a.id);
   const hasHelper=a.networkCapabilities.includes("ip-helper");
   const helper=hasHelper?getAssetIpHelperConfig(registry,a.id):null;
   const listedVlans=[...vlans].sort((x,y)=>x.number-y.number);
   if(!vlans.some(v=>v.number===selectedRoutingVlan))selectedRoutingVlan=vlans[0]?.number;
   const initialVlan=selectedRoutingVlan;
   const initialInterface=routing.interfaces[String(initialVlan)];
   const currentHelper=helper?.helpers["vlan:"+initialVlan];
   content='<section class="admin-panel"><h3>Routage inter-VLAN</h3>'+
    '<form data-form="routing" class="routing-switch"><label class="check-label"><input type="checkbox" name="routing"'+
    (routing.routingEnabled?' checked':'')+'><span>Activer le routage inter-VLAN</span></label>'+
    '<button type="submit" class="primary">Appliquer le routage</button></form></section>'+
    '<section class="admin-panel edit-panel"><div class="routing-heading"><h3>Interfaces VLAN</h3></div>'+
    '<p class="routing-table-hint">Sélectionnez un VLAN dans le tableau pour modifier ses paramètres ci-dessous.</p>'+
    table(["VLAN à modifier","Adresse IPv4","Préfixe","État",...(hasHelper?["IP Helper","IP serveur DHCP"]:[])],listedVlans.map(v=>{
      const number=v.number,i=routing.interfaces[String(number)];
      const h=helper?.helpers["vlan:"+number];
      return '<tr class="routing-data-row '+(Number(number)===selectedRoutingVlan?'row-selected':'')+'" data-routing-vlan="'+esc(number)+'"><td>'+
       '<button type="button" class="table-port routing-select" data-routing-vlan="'+esc(number)+'" aria-pressed="'+(Number(number)===selectedRoutingVlan)+'" aria-label="Modifier l’interface VLAN '+esc(number)+'">'+esc(number)+' <span class="routing-select-label">'+(Number(number)===selectedRoutingVlan?'Sélectionné':'Modifier')+'</span></button></td>'+
       '<td>'+(i?esc(i.address):'Non configurée')+'</td><td>'+(i?'/'+esc(i.prefix):'')+'</td><td>'+(i?(i.enabled?'Activée':'Désactivée'):'')+'</td>'+
       (hasHelper?'<td>'+(h?(h.enabled?'Activé':'Désactivé'):'Non configuré')+'</td><td>'+esc(h?.serverAddress??"")+'</td>':'')+
       '</tr>';
    }))+
    '<form id="switch-routing-interface" data-form="interface" class="routing-form grouped-routing-form">'+
    '<input type="hidden" name="vlan" value="'+esc(initialVlan)+'">'+
    '<div class="routing-field-group"><h4>Interface VLAN</h4><div class="routing-fields">'+
    '<label class="check-label"><input name="enabled" type="checkbox"'+(initialInterface?.enabled===false?'':' checked')+'>Interface activée</label>'+
    '<label>Adresse IPv4<input name="address" inputmode="decimal" required value="'+esc(initialInterface?.address??"")+'"></label>'+
    '<label>Préfixe réseau<input name="prefix" type="number" min="1" max="30" required value="'+esc(initialInterface?.prefix??"")+'"></label>'+
    '</div><div class="form-actions"><button class="primary" type="submit" name="applySection" value="interface">Appliquer au VLAN</button></div></div>'+
    (hasHelper?'<div class="routing-field-group helper-field-group"><h4>Relais DHCP (IP Helper)</h4><div class="routing-fields">'+
    '<label class="check-label"><input name="helperEnabled" type="checkbox"'+(currentHelper?.enabled?' checked':'')+'>Relais activé</label>'+
    '<label>Serveur DHCP (IPv4)<input name="helperServer" inputmode="decimal" value="'+esc(currentHelper?.serverAddress??"")+'"></label>'+
    '</div><div class="form-actions"><button class="primary" type="submit" name="applySection" value="helper" formnovalidate>Appliquer le relais</button></div></div>':'')+
    '</form></section>';
  }else{
   const fixed=mg.mode==="static",dns=mg.dns??[];
   content='<section class="admin-panel edit-panel"><h3>Configuration IPv4</h3>'+
    '<form data-form="management" class="form-grid" id="switch-management">'+
    '<label>Mode d’adressage<select name="mode">'+opts([["dhcp","DHCP"],["static","Statique"]],mg.mode)+'</select></label>'+
    '<label>Adresse IPv4<input name="address" value="'+esc(fixed?mg.address:"")+'"'+(!fixed?' disabled':'')+'></label>'+
    '<label>Préfixe réseau<input name="prefix" type="number" min="1" max="30" value="'+esc(fixed?mg.prefix:"")+'"'+(!fixed?' disabled':'')+'></label>'+
    '<label>Passerelle<input name="gateway" value="'+esc(fixed?mg.gateway:"")+'"'+(!fixed?' disabled':'')+'></label>'+
    '<label>DNS principal<input name="dns1" value="'+esc(fixed?(dns[0]??""):"")+'"'+(!fixed?' disabled':'')+'></label>'+
    '<label>DNS secondaire<input name="dns2" value="'+esc(fixed?(dns[1]??""):"")+'"'+(!fixed?' disabled':'')+'></label>'+
    '<div class="form-actions"><button type="submit" class="primary">Appliquer</button></div></form></section>'+
    '<section class="admin-panel compact-panel"><h3>Paramètres appliqués</h3>'+
    '<dl class="device-details"><div><dt>Mode</dt><dd>'+esc(fixed?"Statique":"DHCP")+'</dd></div>'+
    '<div><dt>Adresse</dt><dd>'+esc(mg.address?mg.address+"/"+mg.prefix:"Non attribuée")+'</dd></div>'+
    '<div><dt>DNS</dt><dd>'+esc(dns.length?dns.join(" · "):"Aucun")+'</dd></div></dl></section>';
  }
  root.innerHTML='<div class="switch-admin v4">'+
    '<div class="network-topbar"><span class="network-symbol" aria-hidden="true">◈</span><span class="network-product">Administration réseau</span></div>'+
    '<header class="device-bar"><div class="device-ident"><span class="device-glyph" aria-hidden="true">▤</span><div class="device-label"><h2>'+esc(a.name)+'</h2><span>'+esc(l3?"Switch administrable L3":"Switch administrable L2")+
    '</span></div></div></header>'+
    '<nav class="device-tabs" aria-label="Rubriques d’administration">'+menu+'</nav>'+
    '<main class="admin-content">'+
    (feedback?'<div role="status" class="feedback '+feedbackType+'">'+esc(feedback)+'</div>':"")+content+
    '</main></div>';
 };
 const onClick=e=>{
  const nav=e.target.closest("[data-page]");
  if(nav&&root.contains(nav)){page=nav.dataset.page;feedback="";render();return;}
  const interfaceRow=e.target.closest("[data-routing-vlan]");
  if(interfaceRow&&root.contains(interfaceRow)){
   selectedRoutingVlan=Number(interfaceRow.dataset.routingVlan);
   feedback="";render();
   root.querySelector?.('form[data-form="interface"] input[name="enabled"]')?.focus();
   return;
  }
  const vlanRow=e.target.closest("[data-edit-vlan]");
  if(vlanRow&&root.contains(vlanRow)){selectedVlanId=vlanRow.dataset.editVlan;feedback="";render();return;}
  const port=e.target.closest("[data-port]");
  if(port&&root.contains(port)){selectedPort=port.dataset.port;page="ports";feedback="";render();}
 };
 const onChange=e=>{
  const field=e.target.closest('select[name="mode"]');
  if(!field||!root.contains(field)||!field.closest('form[data-form="management"]'))return;
  const form=field.closest("form");
  for(const name of ["address","prefix","gateway","dns1","dns2"]){
   const input=form.elements.namedItem(name);
   if(input)input.disabled=field.value==="dhcp";
  }
 };
 const onSubmit=e=>{
  const form=e.target.closest("form[data-form]");
  if(!form||!root.contains(form))return;
  e.preventDefault();
  const d=new FormData(form),a=get();let response;
  if(form.dataset.form==="vlan"){
   response=addSwitchVlan(registry,a.id,Number(d.get("number")),String(d.get("name")).trim());
   if(response?.success){
    const newlyAdded=registry.getAsset(a.id).vlanConfig.vlans.find(v=>v.number===Number(d.get("number")));
    selectedVlanId=newlyAdded?.id??null;
   }
  }else if(form.dataset.form==="vlan-edit"){
   const vlanId=String(d.get("vlanId"));
   if(e.submitter?.value==="delete"){
    response=removeSwitchVlan(registry,a.id,vlanId);
    if(response?.success)selectedVlanId=null;
   }else response=updateSwitchVlan(registry,a.id,vlanId,Number(d.get("number")),String(d.get("name")).trim());
  }else if(form.dataset.form==="port"){
   const tokens=String(d.get("vlans")).split(",").map(v=>v.trim());
   if(!tokens.length||tokens.some(v=>!/^[0-9]{1,4}$/.test(v)||Number(v)<1||Number(v)>4094)){
     report({success:false,message:"Liste des VLAN incorrecte."});return;
   }
   const numbers=tokens.map(Number);
   response=d.get("mode")==="trunk"?
     setSwitchTrunkPort(registry,a.id,String(d.get("portId")),numbers):
     numbers.length===1?setSwitchAccessPort(registry,a.id,String(d.get("portId")),numbers[0]):
      {success:false,message:"Le mode Access accepte un seul VLAN."};
  }else if(form.dataset.form==="routing"){
   response=setSwitchInterVlanRouting(registry,a.id,d.get("routing")==="on");
  }else if(form.dataset.form==="interface"){
   selectedRoutingVlan=Number(d.get("vlan"));
   const action=e.submitter?.value==="helper"?"helper":"interface";
   if(action==="interface"){
    response=setSwitchVlanInterface(registry,a.id,selectedRoutingVlan,String(d.get("address")??"").trim(),
      Number(d.get("prefix")),d.get("enabled")==="on");
   }else{
    if(!a.networkCapabilities.includes("ip-helper")){
     report({success:false,message:"Relais DHCP indisponible sur ce switch."});return;
    }
    const previous=getAssetIpHelperConfig(registry,a.id)?.helpers["vlan:"+selectedRoutingVlan];
    const active=d.get("helperEnabled")==="on";
    const entered=String(d.get("helperServer")??"").trim();
    const server=entered||(!active?previous?.serverAddress:"")||"";
    const validIp=value=>typeof value==="string"&&value.split(".").length===4&&
      value.split(".").every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255);
    if(!validIp(server)){
     report({success:false,message:"Saisir une adresse IPv4 valide pour le serveur DHCP."});return;
    }
    response=setVlanIpHelper(registry,a.id,selectedRoutingVlan,server,active);
   }
  }else if(form.dataset.form==="management"){
   response=d.get("mode")==="dhcp"?configureSwitchManagementDhcp(registry,a.id):
    configureSwitchManagementStatic(registry,a.id,String(d.get("address")??"").trim(),
     Number(d.get("prefix")),String(d.get("gateway")??"").trim()||null,
     [String(d.get("dns1")??"").trim(),String(d.get("dns2")??"").trim()].filter(Boolean));
  }
  report(response);
 };
 root.addEventListener("click",onClick);root.addEventListener("change",onChange);root.addEventListener("submit",onSubmit);
 render();
 return {
  refresh:render,
  setAssetId(nextId){id=nextId;page="overview";selectedPort=null;selectedVlanId=null;selectedRoutingVlan=null;feedback="";render();},
  destroy(){root.removeEventListener("click",onClick);root.removeEventListener("change",onChange);
   root.removeEventListener("submit",onSubmit);root.replaceChildren();}
 };
}

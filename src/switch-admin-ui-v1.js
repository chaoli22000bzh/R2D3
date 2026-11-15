/*
 * Administration graphique des commutateurs L2/L3.
 * Vue et commandes seulement : aucun état métier propre à l'interface.
 * Les ports, VLAN et paramètres IPv4 proviennent du registre R2 et des adaptateurs communs.
 */
import {addSwitchVlan,setSwitchAccessPort,setSwitchTrunkPort} from "./vlan-v1.js";
import {configureSwitchManagementStatic,configureSwitchManagementDhcp} from "./switch-management-ip-v01.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const opts=(list,value)=>list.map(([id,title])=>'<option value="'+esc(id)+'"'+(String(value)===String(id)?' selected':'')+'>'+esc(title)+'</option>').join("");
const message=r=>r?.message||r?.reason||r?.code||"Configuration refusée";
export function mountSwitchAdmin({root,registry,assetId}){
 if(!root||!registry?.getAsset||!registry?.listCables)throw Error("Interface ou registre réseau indisponible");
 let id=assetId,page="overview",selectedPort=null,feedback="",feedbackType="ok";
 const pages={overview:"Vue d’ensemble",ports:"Ports",vlans:"VLAN",management:"IPv4 de gestion"};
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
   '<strong>Ports Ethernet</strong><span>'+ports.length+' ports RJ45</span></div>'+
   '<div class="port-bank" role="group" aria-label="Sélection d’un port">'+ports.map((p,i)=>{
     const info=portInfo(a,p),current=selectedPort===p.id;
     return '<button type="button" class="mini-port'+(current?' chosen':'')+(info.linked?' linked':'')+
       '" data-port="'+esc(p.id)+'" aria-label="'+esc(p.name)+', '+(info.linked?'raccordé':'libre')+', '+info.mode+
       ' VLAN '+esc(info.number)+'" aria-pressed="'+current+'" title="'+esc(p.name+' · '+info.mode+' VLAN '+info.number)+'">'+
       '<span class="mini-label">'+esc(p.name)+'</span><span class="mini-socket" aria-hidden="true"><span></span></span></button>';
   }).join("")+'</div>'+
   '<div class="port-legend"><span><i class="legend-dot up"></i>Raccordé</span><span><i class="legend-dot down"></i>Libre</span></div></section>';
 const table=(heads,rows)=>'<div class="table-scroll"><table class="admin-table"><thead><tr>'+
  heads.map(h=>'<th scope="col">'+h+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';
 const render=()=>{
  const a=get(),ports=a.ports.filter(p=>p.type==="ethernet-rj45");
  const vlans=a.vlanConfig.vlans,mg=a.managementConfig,l3=a.networkCapabilities.includes("inter-vlan-routing");
  if(!ports.some(p=>p.id===selectedPort))selectedPort=ports[0]?.id??null;
  const menu=Object.entries(pages).map(([key,label])=>'<button type="button" data-page="'+key+
   '" class="menu-item'+(key===page?' active':'')+'" aria-current="'+(key===page?'page':'false')+'">'+label+'</button>').join("");
  let content="";
  if(page==="overview"){
   const details=[
    ["Nom",a.name],["Type",l3?"Switch administrable L3":"Switch administrable L2"],
    ["État",a.status],["Adresse IPv4",mg.address?mg.address+"/"+mg.prefix:mg.mode==="dhcp"?"DHCP · non attribuée":"Non configurée"],
    ["Mode IPv4",mg.mode==="static"?"Statique":"DHCP"],["PoE",a.poe?"Oui":"Non"],
    ["Ports RJ45",String(ports.length)],["VLAN",String(vlans.length)]
   ];
   content=portGrid(a,ports)+'<section class="admin-panel"><h3>Informations générales</h3>'+
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
    '<section class="admin-panel"><h3>Liste des ports</h3>'+table(["Port","Connexion","Mode","VLAN"],all)+'</section>'+
    (p?'<section class="admin-panel edit-panel"><h3>Port '+esc(p.name)+'</h3>'+
     '<form data-form="port" class="form-grid"><input type="hidden" name="portId" value="'+esc(p.id)+'">'+
     '<label>Mode<select name="mode">'+opts([["access","Access"],["trunk","Trunk"]],state.mode)+'</select></label>'+
     '<label>VLAN autorisés<input name="vlans" required value="'+esc(chosen.join(", "))+'" placeholder="1 ou 10, 20"></label>'+
     '<div class="form-actions"><button type="submit" class="primary">Appliquer</button></div></form></section>':'');
  }else if(page==="vlans"){
   content='<section class="admin-panel"><h3>VLAN configurés</h3>'+
    table(["Identifiant","Nom"],vlans.map(v=>'<tr><td>'+esc(v.number)+'</td><td>'+esc(v.name)+'</td></tr>'))+
    '</section><section class="admin-panel edit-panel"><h3>Ajouter un VLAN</h3>'+
    '<form data-form="vlan" class="form-grid"><label>Identifiant VLAN<input type="number" name="number" min="2" max="4094" required placeholder="10"></label>'+
    '<label>Nom<input name="name" maxlength="50" required placeholder="Bureaux"></label>'+
    '<div class="form-actions"><button class="primary" type="submit">Ajouter</button></div></form></section>';
  }else{
   const fixed=mg.mode==="static",dns=mg.dns??[];
   content='<section class="admin-panel edit-panel"><h3>Configuration IPv4</h3>'+
    '<form data-form="management" class="form-grid" id="switch-management">'+
    '<label>Mode d’adressage<select name="mode">'+opts([["dhcp","DHCP"],["static","Statique"]],mg.mode)+'</select></label>'+
    '<label>Adresse IPv4<input name="address" value="'+esc(fixed?mg.address:"")+'" placeholder="192.168.1.2"'+(!fixed?' disabled':'')+'></label>'+
    '<label>Préfixe réseau<input name="prefix" type="number" min="1" max="30" value="'+esc(fixed?mg.prefix:"")+'" placeholder="24"'+(!fixed?' disabled':'')+'></label>'+
    '<label>Passerelle<input name="gateway" value="'+esc(fixed?mg.gateway:"")+'" placeholder="192.168.1.1"'+(!fixed?' disabled':'')+'></label>'+
    '<label>DNS principal<input name="dns1" value="'+esc(fixed?(dns[0]??""):"")+'" placeholder="192.168.1.10"'+(!fixed?' disabled':'')+'></label>'+
    '<label>DNS secondaire<input name="dns2" value="'+esc(fixed?(dns[1]??""):"")+'" placeholder="192.168.1.11"'+(!fixed?' disabled':'')+'></label>'+
    '<div class="form-actions"><button type="submit" class="primary">Appliquer</button></div></form></section>'+
    '<section class="admin-panel compact-panel"><h3>État actuel</h3>'+
    '<dl class="device-details"><div><dt>Mode</dt><dd>'+esc(fixed?"Statique":"DHCP")+'</dd></div>'+
    '<div><dt>Adresse</dt><dd>'+esc(mg.address?mg.address+"/"+mg.prefix:"Non attribuée")+'</dd></div>'+
    '<div><dt>DNS</dt><dd>'+esc(dns.length?dns.join(" · "):"Aucun")+'</dd></div></dl></section>';
  }
  root.innerHTML='<div class="switch-admin v2"><div class="admin-shell">'+
    '<aside class="admin-side"><div class="side-title">Équipement</div><nav aria-label="Rubriques d’administration">'+menu+'</nav></aside>'+
    '<div class="admin-main"><header class="device-bar"><div><h2>'+esc(a.name)+'</h2>'+
    '<span>'+esc(l3?"Switch L3":"Switch L2")+'</span></div><span class="device-state">'+esc(a.status)+'</span></header>'+
    '<main class="admin-content"><div class="content-title"><h2>'+esc(pages[page])+'</h2></div>'+
    (feedback?'<div role="status" class="feedback '+feedbackType+'">'+esc(feedback)+'</div>':"")+content+
    '</main></div></div></div>';
 };
 const onClick=e=>{
  const nav=e.target.closest("[data-page]");
  if(nav&&root.contains(nav)){page=nav.dataset.page;feedback="";render();return;}
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
  setAssetId(nextId){id=nextId;page="overview";selectedPort=null;feedback="";render();},
  destroy(){root.removeEventListener("click",onClick);root.removeEventListener("change",onChange);
   root.removeEventListener("submit",onSubmit);root.replaceChildren();}
 };
}

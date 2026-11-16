/*
 * Administration graphique du routeur : même langage visuel que switch-admin.
 * Aucun état réseau dupliqué hors registre R2.
 */
import {getRouterConfig,configureRouterPort,configureRouterWanPing} from "./router-interfaces-v1.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const opt=(id,text,selected)=>'<option value="'+esc(id)+'"'+(String(id)===String(selected)?" selected":"")+'>'+esc(text)+'</option>';
export function mountRouterAdmin({root,registry,assetId}){
 if(!root||!registry?.getAsset)throw Error("Registre ou interface manquante");
 let id=assetId,page="overview",selectedPort=null,feedback="",error=false;
 const get=()=>{const a=registry.getAsset(id);if(!a?.networkCapabilities.includes("ipv4-router"))throw Error("Routeur indisponible");return a;};
 const report=r=>{feedback=r.message||"Opération refusée";error=!r.success;render();};
 const connected=p=>registry.listCables().some(c=>c.ends.some(e=>e?.portId===p.id));
 const row=(k,v)=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>';
 const ports=a=>'<section class="port-panel"><div class="port-panel-head"><strong>Ports Ethernet</strong></div><div class="port-bank">'+a.ports.map(p=>{
  const current=selectedPort===p.id,linked=connected(p);
  return '<button type="button" class="mini-port'+(current?' chosen':'')+(linked?' linked':'')+'" data-port="'+esc(p.id)+'" title="'+esc(p.name)+'" aria-label="'+esc(p.name)+(linked?', raccordé':', libre')+'" aria-pressed="'+current+'"><span class="mini-label">'+esc(p.name)+'</span><span class="mini-socket"><span></span></span></button>';
 }).join("")+'</div><div class="port-legend"><span>Gris : libre</span><span>Vert : raccordé</span></div></section>';
 const table=a=>'<div class="table-scroll"><table class="admin-table"><thead><tr><th>Port</th><th>Rôle</th><th>IPv4</th><th>Adresse</th><th>Ping du routeur</th></tr></thead><tbody>'+
 a.ports.map(p=>{const i=a.routerConfig.interfaces[p.id];return '<tr><td><button type="button" class="table-port" data-port="'+esc(p.id)+'">'+esc(p.name)+'</button></td><td>'+esc(i.role.toUpperCase())+'</td><td>'+esc(i.mode==="dhcp"?"DHCP":"Statique")+'</td><td>'+esc(i.mode==="dhcp"?"Non attribuée":i.address+"/"+i.prefix)+'</td><td>'+esc(i.respondToPing?"Autorisé":"Bloqué")+'</td></tr>';}).join("")+'</tbody></table></div>';
 function render(){
  const a=get(),cfg=getRouterConfig(registry,id);
  if(!selectedPort||!cfg.interfaces[selectedPort])selectedPort=a.ports[0]?.id;
  const p=a.ports.find(p=>p.id===selectedPort),v=cfg.interfaces[selectedPort];
  const tabs='<nav class="device-tabs">'+[['overview',"Vue d’ensemble"],['ports',"Ports et IPv4"]].map(([key,label])=>'<button type="button" class="menu-item'+(page===key?' active':'')+'" data-page="'+key+'">'+label+'</button>').join("")+'</nav>';
  const overview='<section class="admin-panel"><h3>Équipement</h3><dl class="device-details">'+row("Nom",a.name)+row("Type","Routeur générique")+row("Interfaces Ethernet",a.ports.length)+row("WAN",Object.values(cfg.interfaces).filter(i=>i.role==="wan").length)+row("LAN",Object.values(cfg.interfaces).filter(i=>i.role==="lan").length)+row("DMZ",Object.values(cfg.interfaces).filter(i=>i.role==="dmz").length)+'</dl></section>'+table(a);
  const editor='<section class="admin-panel"><h3>Configurer '+esc(p.name)+'</h3><form data-form="router-port" class="form-grid" style="max-width:530px;grid-template-columns:repeat(2,minmax(0,1fr))">'+
   '<label>Rôle<select name="role">'+[["wan","WAN"],["lan","LAN"],["dmz","DMZ"]].map(x=>opt(...x,v.role)).join("")+'</select></label>'+
   '<label>Mode IPv4<select name="mode">'+opt("dhcp","Client DHCP",v.mode)+opt("static","Statique",v.mode)+'</select></label>'+
   '<label>Adresse IPv4<input name="address" value="'+esc(v.address)+'" placeholder="192.168.10.1" '+(v.mode==="dhcp"?'disabled':'')+'></label>'+
   '<label>Préfixe réseau<input name="prefix" type="number" min="0" max="32" value="'+esc(v.prefix??"")+'" '+(v.mode==="dhcp"?'disabled':'')+'></label>'+
   '<label>Passerelle IPv4<input name="gateway" value="'+esc(v.gateway)+'" placeholder="Facultatif" '+(v.mode==="dhcp"?'disabled':'')+'></label>'+
   '<div class="form-actions"><button class="primary" type="submit">Appliquer au port</button></div></form>'+
   '<div class="router-ping" style="margin-top:15px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><label style="display:flex;align-items:center;gap:8px"><input style="width:auto;min-height:auto" type="checkbox" name="respondToPing"'+(v.respondToPing?' checked':'')+(v.role==="wan"?'':' disabled')+'> Répondre au ping sur ce WAN</label>'+(v.role==="wan"?'<button class="primary" type="button" data-action="ping">Appliquer</button>':'<span>Option disponible uniquement sur les ports WAN</span>')+'</div>'+
   '</section>';
  root.innerHTML='<div class="switch-admin v4 router-admin"><header class="device-bar"><div class="device-ident"><h2>'+esc(a.name)+'</h2><span>Routeur générique</span><span class="device-state">En service</span></div></header>'+tabs+'<main class="admin-content">'+(page==="overview"?overview:ports(a)+editor+table(a))+(feedback?'<p role="status" style="color:'+(error?'#aa2532':'#087b5e')+'">'+esc(feedback)+'</p>':'')+'</main></div>';
 }
 const click=e=>{
  const button=e.target.closest("[data-port],[data-page],[data-action]");
  if(!button||!root.contains(button))return;
  if(button.dataset.page){page=button.dataset.page;feedback="";render();}
  if(button.dataset.port){selectedPort=button.dataset.port;page="ports";feedback="";render();}
  if(button.dataset.action==="ping"){const v=root.querySelector('[name="respondToPing"]');report(configureRouterWanPing(registry,id,selectedPort,v.checked));}
 };
 const change=e=>{if(e.target?.name==="mode"){const disabled=e.target.value==="dhcp";for(const k of ["address","prefix","gateway"]){const input=root.querySelector('[name="'+k+'"]');input.disabled=disabled;}}};
 const submit=e=>{if(!e.target.matches('form[data-form="router-port"]'))return;e.preventDefault();const f=e.target.elements;
  report(configureRouterPort(registry,id,selectedPort,{role:f.role.value,mode:f.mode.value,address:f.address.value,prefix:f.prefix.value,gateway:f.gateway.value}));
 };
 root.addEventListener("click",click);root.addEventListener("change",change);root.addEventListener("submit",submit);
 render();
 return {setAssetId(next){id=next;page="overview";selectedPort=null;feedback="";render();},destroy(){root.removeEventListener("click",click);root.removeEventListener("change",change);root.removeEventListener("submit",submit);root.replaceChildren();}};
}

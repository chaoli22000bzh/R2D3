/*
 * Administration graphique du routeur : même langage visuel que switch-admin.
 * Aucun état réseau dupliqué hors registre R2.
 */
import {getRouterConfig,configureRouterPort,configureRouterWanPing} from "./router-interfaces-v1.js";
import {configureRemoteVpn,getRemoteVpnConfig} from "./router-vpn-remote-v1.js";
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
  const tabs='<nav class="device-tabs">'+[['overview',"Vue d’ensemble"],['ports',"Ports et IPv4"],['vpn',"VPN nomade"]].map(([key,label])=>'<button type="button" class="menu-item'+(page===key?' active':'')+'" data-page="'+key+'">'+label+'</button>').join("")+'</nav>';
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
  const vpn=cfg.remoteVpn||{},ifs=cfg.interfaces;
  const wanPorts=a.ports.filter(p=>ifs[p.id].role==="wan");
  const lanPorts=a.ports.filter(p=>ifs[p.id].role==="lan");
  const accounts=vpn.accounts??(vpn.username?[{username:vpn.username,password:vpn.password,enabled:true}]:[]);
  const vpnPanel='<section class="admin-panel"><h3>Serveur VPN nomade</h3>'+
   '<form data-form="vpn" class="form-grid" style="max-width:530px;grid-template-columns:repeat(2,minmax(0,1fr))">'+
   '<label>Port WAN<select name="wanPortId">'+wanPorts.map(p=>opt(p.id,p.name,vpn.wanPortId)).join("")+'</select></label>'+
   '<label>Port LAN<select name="lanPortId">'+lanPorts.map(p=>opt(p.id,p.name,vpn.lanPortId)).join("")+'</select></label>'+
   '<label>Réseau VPN<input name="vpnNetwork" value="'+esc(vpn.vpnNetwork||"10.8.0.0")+'" inputmode="decimal"></label>'+
   '<label>Préfixe VPN<input name="vpnPrefix" type="number" min="1" max="30" value="'+esc(vpn.vpnPrefix??24)+'"></label>'+
   '<label>DNS 1<input name="dns1" inputmode="decimal" placeholder="192.168.10.10" value="'+esc((vpn.dnsServers??[vpn.dnsServer||""])[0]||"")+'"></label>'+
   '<label>DNS 2<input name="dns2" inputmode="decimal" placeholder="Facultatif" value="'+esc((vpn.dnsServers??[])[1]||"")+'"></label>'+
   '<label style="display:flex;align-items:center;gap:8px"><input name="enabled" type="checkbox" style="width:auto;min-height:auto"'+(vpn.enabled?' checked':'')+'> Activer le VPN</label>'+
   '<div class="form-actions"><button class="primary" type="submit">Enregistrer les paramètres</button></div></form>'+
   '<h3 style="margin-top:18px">Comptes nomades ('+accounts.length+'/100)</h3>'+
   '<div style="display:grid;gap:7px;max-width:530px">'+accounts.map((u,i)=>'<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;border:1px solid #9aafb966;border-radius:6px;padding:7px">'+
    '<strong style="flex:1;min-width:100px">'+esc(u.username)+'</strong>'+
    '<span>'+ (u.enabled?"Autorisé":"Bloqué") +'</span>'+
    '<button type="button" data-vpn-user-action="toggle" data-vpn-user-index="'+i+'">'+(u.enabled?"Bloquer":"Autoriser")+'</button>'+
    '<button type="button" data-vpn-user-action="remove" data-vpn-user-index="'+i+'">Supprimer</button></div>').join("")+'</div>'+
   '<form data-form="vpn-add" class="form-grid" style="max-width:530px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px">'+
   '<label>Nouvel identifiant<input name="username" autocomplete="off" required></label>'+
   '<label>Mot de passe fictif<input name="password" type="password" autocomplete="new-password" required></label>'+
   '<div class="form-actions"><button type="submit" class="primary">Ajouter un nomade</button></div></form>'+
   '<p>Un compte peut se connecter depuis un PC nomade. Les mots de passe sont fictifs.</p></section>';
  root.innerHTML='<div class="switch-admin v4 router-admin"><header class="device-bar"><div class="device-ident"><h2>'+esc(a.name)+'</h2><span>Routeur générique</span><span class="device-state">En service</span></div></header>'+tabs+'<main class="admin-content">'+(page==="overview"?overview:page==="vpn"?vpnPanel:ports(a)+editor+table(a))+(feedback?'<p role="status" style="color:'+(error?'#aa2532':'#087b5e')+'">'+esc(feedback)+'</p>':'')+'</main></div>';
 }
 const click=e=>{
  const button=e.target.closest("[data-port],[data-page],[data-action],[data-vpn-user-action]");
  if(!button||!root.contains(button))return;
  if(button.dataset.page){page=button.dataset.page;feedback="";render();}
  if(button.dataset.port){selectedPort=button.dataset.port;page="ports";feedback="";render();}
  if(button.dataset.action==="ping"){const v=root.querySelector('[name="respondToPing"]');report(configureRouterWanPing(registry,id,selectedPort,v.checked));}
  if(button.dataset.vpnUserAction){
   const old=getRemoteVpnConfig(registry,id)||{},accounts=(old.accounts??[]).map(u=>({...u}));
   const i=Number(button.dataset.vpnUserIndex);
   if(i<0||i>=accounts.length)return;
   if(button.dataset.vpnUserAction==="remove"){
    if(accounts.length<=1){report({success:false,message:"Conserver au moins un compte"});return;}
    accounts.splice(i,1);
   }else accounts[i].enabled=!accounts[i].enabled;
   const r=saveVpn({accounts});
   report({...r,message:r.success?"Liste mise à jour":r.message});
  }

 };
 const change=e=>{if(e.target?.name==="mode"){const disabled=e.target.value==="dhcp";for(const k of ["address","prefix","gateway"]){const input=root.querySelector('[name="'+k+'"]');input.disabled=disabled;}}};
 const saveVpn=(overrides={})=>{
  const old=getRemoteVpnConfig(registry,id)||{},panel=root.querySelector('form[data-form="vpn"]');
  const f=panel?.elements;
  if(!f)return {success:false,message:"Ouvrir les paramètres VPN"};
  const dns=[f.dns1.value.trim(),f.dns2.value.trim()].filter(Boolean);
  return configureRemoteVpn(registry,id,{
   wanPortId:f.wanPortId.value,lanPortId:f.lanPortId.value,
   vpnNetwork:f.vpnNetwork.value.trim(),vpnPrefix:Number(f.vpnPrefix.value),
   dnsServers:dns,accounts:overrides.accounts??old.accounts??(old.username?[{username:old.username,password:old.password,enabled:true}]:[]),
   enabled:f.enabled.checked
  });
 };
 const submit=e=>{
  if(e.target.matches('form[data-form="vpn"]')){
   e.preventDefault();const result=saveVpn();
   report({...result,message:result.success?"VPN enregistré":result.message});return;
  }
  if(e.target.matches('form[data-form="vpn-add"]')){
   e.preventDefault();const f=e.target.elements,old=getRemoteVpnConfig(registry,id)||{};
   const accounts=old.accounts??(old.username?[{username:old.username,password:old.password,enabled:true}]:[]);
   const result=saveVpn({accounts:[...accounts,{username:f.username.value.trim(),password:f.password.value,enabled:true}]});
   report({...result,message:result.success?"Nomade ajouté":result.message});return;
  }
  if(!e.target.matches('form[data-form="router-port"]'))return;e.preventDefault();const f=e.target.elements;
  report(configureRouterPort(registry,id,selectedPort,{role:f.role.value,mode:f.mode.value,address:f.address.value,prefix:f.prefix.value,gateway:f.gateway.value}));
 };
 root.addEventListener("click",click);root.addEventListener("change",change);root.addEventListener("submit",submit);
 render();
 return {setAssetId(next){id=next;page="overview";selectedPort=null;feedback="";render();},destroy(){root.removeEventListener("click",click);root.removeEventListener("change",change);root.removeEventListener("submit",submit);root.replaceChildren();}};
}

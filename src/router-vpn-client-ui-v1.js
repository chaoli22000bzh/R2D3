/*
 * Client VPN nomade réutilisable, sans stockage local ni accès réseau réel.
 * Utilise le registre R2, le moteur VPN et, si fourni, le Core DNS existant.
 * Le composant conserve seulement l'état de session simulée.
 */
import {connectRemoteVpn,disconnectRemoteVpn,observeRemoteVpnPing,observeRemoteVpnPingName} from "./router-vpn-remote-v1.js";
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
export function mountRemoteVpnClient({root,registry,routerId,clientId,addresses,targetId,dnsEngine,dnsClientId,dnsAssetId}={}){
 if(!root||!registry?.getAsset||typeof addresses!=="function")throw Error("Client VPN : paramètres manquants");
 let session=null,message="VPN déconnecté",error=false;
 const router=()=>registry.getAsset(routerId);
 const running=()=>router()?.status==="En service";
 const active=()=>router()?.routerConfig?.remoteVpn?.enabled===true;
 const connected=()=>session?.connected===true;
 const check=()=>{
  if(connected()&&(!running()||!active())){session=null;message="VPN coupé. Reconnecte le PC.";error=true;}
 };
 function render({clearPassword=false}={}){
  // Les formulaires sont reconstruits à chaque résultat : mémoriser les saisies.
  const prior=root.querySelector('form[data-vpn="connect"]');
  const values=prior?Object.fromEntries(["serverAddress","username","password"].map(
   name=>[name,prior.elements.namedItem(name)?.value??""])):null;
  check();
  root.innerHTML='<section class="r2d3-vpn-client" style="max-width:460px;width:100%;color:inherit">'+
   '<h3>Client VPN</h3>'+
   '<form data-vpn="connect" style="display:grid;grid-template-columns:1fr;gap:9px">'+
   '<label>Serveur VPN<input name="serverAddress" inputmode="decimal" placeholder="203.0.113.10" style="width:100%" required></label>'+
   '<label>Identifiant<input name="username" autocomplete="off" style="width:100%" required></label>'+
   '<label>Mot de passe<input name="password" type="password" autocomplete="off" style="width:100%" required></label>'+
   '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit">Se connecter</button>'+
   '<button type="button" data-vpn-action="disconnect">Se déconnecter</button></div></form>'+
   '<p>État : <strong>'+ (connected()?"Connecté":"Déconnecté")+'</strong></p>'+
   '<p>IPv4 VPN : <strong>'+esc(connected()?session.vpnAddress:"Aucune")+'</strong></p>'+
   '<p>DNS reçu : <strong>'+esc(connected()?((session.dnsServers??(session.dnsServer?[session.dnsServer]:[])).join(" / ")||"Aucun"):"Aucun")+'</strong></p>'+
   (targetId?'<form data-vpn="ping" style="display:grid;gap:8px">'+
    '<label>Machine à tester<select name="mode"><option value="ipv4">Par adresse IPv4</option><option value="name">Par nom DNS</option></select></label>'+
    '<label>Nom DNS<input name="name" placeholder="srv-local.entreprise.test" style="width:100%"></label>'+
    '<button type="submit">Tester le ping</button></form>':'')+
   '<p role="status" style="color:'+(error?"#ba3636":"inherit")+'">'+esc(message)+'</p></section>';
  if(values){
   const form=root.querySelector('form[data-vpn="connect"]');
   for(const [name,value] of Object.entries(values)){
    form.elements.namedItem(name).value=(name==="password"&&clearPassword)?"":value;
   }
  }
 }
 const doConnect=e=>{
  e.preventDefault();const f=e.target.elements;
  const result=connectRemoteVpn(registry,routerId,clientId,addresses(),{
   serverAddress:f.serverAddress.value.trim(),username:f.username.value.trim(),password:f.password.value
  });
  session=result.success?result.session:null;
  message=result.success?"VPN connecté":result.message;error=!result.success;render({clearPassword:result.success});
 };
 const doPing=e=>{
  e.preventDefault();check();const f=e.target.elements;
  const result=f.mode.value==="name"?
   observeRemoteVpnPingName(registry,session,f.name.value.trim(),targetId,addresses(),{dnsEngine,dnsClientId,dnsAssetId}):
   observeRemoteVpnPing(registry,session,targetId,addresses());
  message=result.success?"Ping réussi"+(result.resolvedAddress?" : "+result.resolvedAddress:""):
   "Ping échoué : "+(result.message||result.reason||"réseau indisponible");
  error=!result.success;render();
 };
 const onSubmit=e=>{
  if(!root.contains(e.target))return;
  if(e.target.matches('form[data-vpn="connect"]'))doConnect(e);
  if(e.target.matches('form[data-vpn="ping"]'))doPing(e);
 };
 const onClick=e=>{
  if(!root.contains(e.target)||!e.target.closest('[data-vpn-action="disconnect"]'))return;
  session=disconnectRemoteVpn(session);message="VPN déconnecté";error=false;render();
 };
 root.addEventListener("submit",onSubmit);root.addEventListener("click",onClick);render();
 return {
  refresh:render,
  getSession:()=>session?{...session}:null,
  disconnect(){session=disconnectRemoteVpn(session);message="VPN déconnecté";error=false;render();},
  destroy(){root.removeEventListener("submit",onSubmit);root.removeEventListener("click",onClick);root.replaceChildren();}
 };
}

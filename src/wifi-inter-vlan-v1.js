/* Wi-Fi inter-VLAN : liaison métier réutilisable entre SSID/Trunk et L3 partagé.
 * Aucune règle L3 ni attribution DHCP locale ; chemins vérifiés dans R2D3.
 * Portée initiale : deux clients Wi-Fi, une borne, un switch L3 avec DHCP.
 */
import {requestWifiVlanDhcp,validateWifiVlanPath} from "./wifi-vlan-dhcp-v1.js";
import {getSwitchRoutingConfig} from "./inter-vlan-routing-v1.js";
import {evaluateInterVlanLogicalEndpoints} from "./inter-vlan-routing-v01.js";
const fail=(code,message)=>({success:false,status:"ok",code,message});
export function createWifiInterVlanSession({registry,apId,switchId,clients}={}){
 if(!registry?.getAsset||!Array.isArray(clients)||clients.length!==2||
   clients.some(c=>!c?.clientId||!c?.ssidId||typeof c.password!=="string")||
   clients[0].clientId===clients[1].clientId)
  return fail("invalid_clients","Deux clients Wi-Fi distincts avec leurs SSID sont requis.");
 // Vérification réutilisée : association, RJ45 réel, Trunk, VLAN et interface L3.
 const paths=clients.map(c=>validateWifiVlanPath({registry,apId,switchId,...c}));
 const broken=paths.find(p=>!p.success);if(broken)return broken;
 if(paths[0].vlanNumber===paths[1].vlanNumber)
  return fail("same_vlan","Ce scénario teste deux VLAN différents ; le même VLAN relève du moteur L2.");
 const leases=clients.map(c=>requestWifiVlanDhcp({registry,apId,switchId,...c}));
 const failure=leases.find(l=>!l.success);if(failure)return failure;
 const addresses=leases.map(l=>l.address);
 const ping=()=>{
  // Relecture des états réels à chaque observation. Les baux déjà acquis ne
  // sont pas redemandés lorsque l'on modifie le routage du switch.
  const current=clients.map(c=>validateWifiVlanPath({registry,apId,switchId,...c}));
  const bad=current.find(x=>!x.success);
  if(bad)return {success:false,status:"ok",code:bad.code,message:bad.message};
  if(current.some((p,i)=>p.vlanNumber!==paths[i].vlanNumber))
   return fail("vlan_changed","Le VLAN du SSID a changé : reconnecter le client et renouveler son adressage.");
  const routing=getSwitchRoutingConfig(registry,switchId);
  if(!routing)return fail("routing_missing","Configuration L3 introuvable.");
  const result=evaluateInterVlanLogicalEndpoints(routing,current.map(p=>p.vlanNumber),
   leases.map(l=>({address:l.address,prefix:l.prefix,gateway:l.gateway})));
  return result.success?
   {success:true,status:"ok",code:"reply",message:result.reason,source:addresses[0],target:addresses[1]}:
   {success:false,status:result.status,code:"routing_blocked",message:result.reason};
 };
 return {success:true,code:"ready",clients:clients.map((c,i)=>({
   clientId:c.clientId,ssidId:c.ssidId,ssid:leases[i].ssid,vlanNumber:leases[i].vlanNumber,
   address:leases[i].address,prefix:leases[i].prefix,gateway:leases[i].gateway
 })),ping};
}

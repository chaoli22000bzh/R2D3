/* Roaming Wi-Fi V1 : sélection de borne sur un même réseau logique.
 * Couverture radio et association reposent exclusivement sur les moteurs R2D3 partagés.
 * Pas de DHCP fictif : ipv4 est un état fourni par le scénario hôte.
 */
import {radioSignalAt} from "./radio-coverage-core-v1.js";
import {WIFI_CHANNEL_PROFILE} from "./wifi-channel-diagnostic-v1.js";
import {associateWifiClient} from "./wifi-ap-v1.js";
const fail=(code,message,extra={})=>({success:false,code,message,...extra});
const compatibleNetwork=(ssid,previous)=>ssid.name===previous.ssid&&
 (ssid.vlanNumber??null)===(previous.vlanNumber??null)&&ssid.security===previous.security;
function simulatedBssid(apId,ssidId){
 const input=String(apId)+":"+String(ssidId);
 let h=2166136261;
 for(const ch of input){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
 const bytes=[0x02,0x52,0x32,0x44,(h>>>8)&255,h&255];
 return bytes.map(x=>x.toString(16).padStart(2,"0")).join(":").toUpperCase();
}
export function updateWifiRoaming({registry,accessPoints=[],client,previous=null,ssid,password="",bands=["2.4","5"],security=["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"],site={},profile=WIFI_CHANNEL_PROFILE,hysteresisDb=5}={}){
 if(!registry?.getAsset||!Array.isArray(accessPoints)||!client||typeof ssid!=="string"||!ssid||!Number.isFinite(hysteresisDb)||hysteresisDb<0)
  return fail("invalid_inputs","Paramètres de roaming invalides.");
 const candidates=[];
 for(const place of accessPoints){
  if(!place?.id)continue;
  const asset=registry.getAsset(place.id);
  if(!asset?.wifiConfig?.enabled||asset.status!=="En service")continue;
  for(const network of asset.wifiConfig.ssids.filter(s=>s.enabled&&s.name===ssid)){
   if(previous?.connected&&!compatibleNetwork(network,previous))continue;
   const association=associateWifiClient(registry,{apId:asset.id,ssidId:network.id,password,bands,security});
   if(!association.success)continue;
   const signal=radioSignalAt({transmitter:place,receiver:client,site,profile});
   if(!signal.success||!signal.covered)continue;
   candidates.push({apId:asset.id,apName:asset.name,ssidId:network.id,ssid:network.name,
    vlanNumber:network.vlanNumber??null,security:network.security,band:association.band,
    bssid:simulatedBssid(asset.id,network.id),rssi:signal.strength,quality:signal.quality});
  }
 }
 candidates.sort((a,b)=>b.rssi-a.rssi||String(a.apId).localeCompare(String(b.apId)));
 const current=previous?.connected?candidates.find(x=>x.apId===previous.apId&&x.ssidId===previous.ssidId):null;
 const best=candidates[0]??null;
 let chosen=best;
 if(current&&best&&best.apId!==current.apId&&best.rssi-current.rssi<hysteresisDb)chosen=current;
 if(!chosen)return {success:true,code:"wifi_out_of_range",connected:false,changed:!!previous?.connected,
  reason:"Aucune borne compatible ne couvre la position du client.",ipv4:null,candidates};
 const changed=!!previous?.connected&&(previous.apId!==chosen.apId||previous.ssidId!==chosen.ssidId);
 const first=!previous?.connected;
 const ipv4=first?previous?.ipv4??null:previous.ipv4??null;
 return {success:true,code:first?"wifi_associated":changed?"wifi_roamed":"wifi_unchanged",
  connected:true,changed,apId:chosen.apId,apName:chosen.apName,ssidId:chosen.ssidId,
  ssid:chosen.ssid,vlanNumber:chosen.vlanNumber,security:chosen.security,
  band:chosen.band,bssid:chosen.bssid,rssi:chosen.rssi,quality:chosen.quality,
  ipv4,candidates,
  reason:first?"Association à la borne couvrant le mieux le client."
   :changed?"Roaming vers une borne du même réseau logique : adresse IPv4 conservée."
   :"Association maintenue sur la borne actuelle."};
}

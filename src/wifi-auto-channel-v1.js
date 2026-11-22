/* Attribution pédagogique déterministe des canaux en mode Automatique.
 * Les réglages du registre restent "auto" ; seul le canal opérationnel est calculé.
 * Les canaux manuels sont conservés, les bornes désactivées sont ignorées.
 * Minimisation de la couverture commune avec les bornes déjà attribuées,
 * sans mesure de bruit, simulation d'interférences ni panne automatique.
 */
import {radioSignalAt} from "./radio-coverage-core-v1.js";
import {WIFI_RADIO_OPTIONS,effectiveWifiRadios} from "./wifi-radio-config-v1.js";
import {WIFI_CHANNEL_PROFILE} from "./wifi-channel-diagnostic-v1.js";
export function resolveWifiAutoChannels({accessPoints=[],receivers=[],band="2.4",site={},profile=WIFI_CHANNEL_PROFILE}={}){
 if(!Array.isArray(accessPoints)||!Array.isArray(receivers)||!WIFI_RADIO_OPTIONS[band])
  return {success:false,code:"invalid_inputs"};
 const active=accessPoints.filter(ap=>ap&&ap.id!=null&&ap.enabled!==false&&ap.wifiConfig?.enabled!==false&&effectiveWifiRadios(ap.wifiConfig)[band]?.enabled);
 const items=active.map(ap=>({
  ap,
  setting:effectiveWifiRadios(ap.wifiConfig)[band].channel,
  covered:new Set(receivers.map((receiver,index)=>
   radioSignalAt({transmitter:ap,receiver,site,profile}).covered?index:null).filter(index=>index!==null))
 }));
 const allocations=new Map();
 // Les configurations manuelles doivent être prioritaires.
 for(const item of items)if(Number.isInteger(item.setting))
  allocations.set(item.ap.id,item.setting);
 // Tri stable pour ne pas faire dépendre le résultat de l'ordre d'entrée.
 const automatic=items.filter(item=>item.setting==="auto")
  .sort((a,b)=>String(a.ap.id).localeCompare(String(b.ap.id),"fr",{numeric:true}));
 for(const item of automatic){
  const candidates=WIFI_RADIO_OPTIONS[band].channels;
  let chosen=candidates[0],minimum=Infinity;
  for(const channel of candidates){
   let score=0;
   for(const other of items){
    if(other===item||allocations.get(other.ap.id)!==channel)continue;
    for(const index of item.covered)if(other.covered.has(index))score++;
   }
   if(score<minimum){minimum=score;chosen=channel;}
  }
  allocations.set(item.ap.id,chosen);
 }
 return {success:true,code:"channels_resolved",band,
  assignments:items.map(item=>({apId:item.ap.id,configuredChannel:item.setting,
   channel:allocations.get(item.ap.id),mode:item.setting==="auto"?"automatic":"manual"}))};
}

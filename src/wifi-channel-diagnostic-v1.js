/* Diagnostic pédagogique de réutilisation des canaux Wi-Fi.
 * Ni panne automatique ni calcul de brouillage : on détecte uniquement
 * si deux bornes configurées sur le même canal couvrent les mêmes points.
 * Un canal automatique non encore résolu n'est pas supposé identique.
 */
import {radioSignalAt} from "./radio-coverage-core-v1.js";
import {effectiveWifiRadios} from "./wifi-radio-config-v1.js";
export const WIFI_CHANNEL_PROFILE={baseline:-39,decay:25,floorLoss:25,obstacleLoss:{light:5,solid:20,metal:24}};
export function diagnoseWifiChannels({accessPoints=[],receivers=[],band="2.4",site={},profile=WIFI_CHANNEL_PROFILE,resolvedChannels=null}={}){
 if(!Array.isArray(accessPoints)||!Array.isArray(receivers))return {success:false,code:"invalid_inputs"};
 const aps=accessPoints.filter(ap=>ap&&ap.enabled!==false&&effectiveWifiRadios(ap.wifiConfig)[band]?.enabled&&ap.wifiConfig?.enabled!==false);
 const data=aps.map(ap=>({ap,radio:effectiveWifiRadios(ap.wifiConfig)[band]}));
 const pairs=[];
 for(let i=0;i<data.length;i++)for(let j=i+1;j<data.length;j++){
  const a=data[i],b=data[j];
  const channel=resolvedChannels?.[a.ap.id]??a.radio.channel;
  const otherChannel=resolvedChannels?.[b.ap.id]??b.radio.channel;
  const commonReceivers=receivers.filter(receiver=>{
   const ra=radioSignalAt({transmitter:a.ap,receiver,site,profile});
   const rb=radioSignalAt({transmitter:b.ap,receiver,site,profile});
   return ra.success&&rb.success&&ra.covered&&rb.covered;
  });
  const channelKnown=Number.isInteger(channel)&&Number.isInteger(otherChannel);
  const sameChannel=channelKnown&&channel===otherChannel;
  const classification=!channelKnown?"canal_automatique":sameChannel&&commonReceivers.length?"partage_canal":sameChannel?"reuse_distance":"canaux_distincts";
  pairs.push({aId:a.ap.id,bId:b.ap.id,aName:a.ap.name,bName:b.ap.name,
   channelA:channel,channelB:otherChannel,overlapPoints:commonReceivers.length,
   totalPoints:receivers.length,classification,
   message:classification==="partage_canal"?"Les deux bornes couvrent une zone commune sur le même canal : partage de temps d'émission possible, performances à surveiller."
    :classification==="reuse_distance"?"Même canal, mais aucune zone commune détectée aux points étudiés : réutilisation possible."
    :classification==="canaux_distincts"?"Les canaux sont différents : pas de partage de ce même canal entre ces deux bornes."
    :"Canal automatique : le canal réellement choisi n'est pas résolu. Impossible de conclure sur le partage de canal."});
 }
 return {success:true,code:"channel_diagnostic",band,pairs};
}

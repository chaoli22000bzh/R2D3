/* R2D3 : couverture radio pédagogique multi-bornes en 3D.
 * Coordonnées en mètres, étages séparés par une hauteur donnée.
 * Modèle volontairement simplifié : aucun lancer de rayons, mur ou DFS.
 * Module pur et partageable, aucun état propre au laboratoire.
 */
const BANDS=["2.4","5","6"];
const CHANNELS={"2.4":[1,6,11],"5":[36,40,44,48,149,153,157,161],"6":[5,21,37,53,69,85]};
const WIDTHS={"2.4":[20,40],"5":[20,40,80,160],"6":[20,40,80,160]};
export const WIFI_RADIO_BANDS=Object.freeze([...BANDS]);
export const WIFI_RADIO_GENERATIONS=Object.freeze(["wifi4","wifi5","wifi6","wifi6e","wifi7"]);
export function radioCapabilities(generation="wifi6e"){
 const bands=({"wifi4":["2.4","5"],"wifi5":["5"],"wifi6":["2.4","5"],"wifi6e":BANDS,"wifi7":BANDS})[generation];
 return bands?{generation,bands:[...bands]}:null;
}
export function validateWifiRadio({generation="wifi6e",radios={}}={}){
 const capabilities=radioCapabilities(generation);
 if(!capabilities)return {success:false,code:"invalid_generation",message:"Génération Wi-Fi inconnue."};
 if(!radios||typeof radios!=="object"||Array.isArray(radios))return {success:false,code:"invalid_radios",message:"Configuration radio invalide."};
 for(const [band,r] of Object.entries(radios)){
  if(!capabilities.bands.includes(band)||!r||typeof r.enabled!=="boolean")return {success:false,code:"invalid_band",message:"Bande indisponible sur cette borne."};
  if(!["auto",...CHANNELS[band]].includes(r.channel)||!WIDTHS[band].includes(r.width))
   return {success:false,code:"invalid_channel",message:"Canal ou largeur non pris en charge sur cette bande."};
  if(r.width===160&&generation==="wifi4")return {success:false,code:"invalid_width",message:"Largeur non prise en charge par cette génération."};
 }
 return {success:true,code:"radio_valid"};
}
export function radioChannel(band,requested="auto"){
 if(!CHANNELS[band])return null;
 return requested==="auto"?CHANNELS[band][0]:CHANNELS[band].includes(requested)?requested:null;
}
const distance3D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
export function wifiSignalAt({ap,client,band="5",floorHeight=3}={}){
 if(!ap||!client||!BANDS.includes(band)||![ap.x,ap.y,ap.z,client.x,client.y,client.z].every(Number.isFinite))
  return {success:false,code:"invalid_position",message:"Position 3D invalide."};
 if(!Number.isFinite(floorHeight)||floorHeight<=0)return {success:false,code:"invalid_floor_height"};
 const d=distance3D(ap,client);
 const floors=Math.floor((Math.abs(ap.z-client.z)+1e-6)/floorHeight);
 // Valeurs pédagogiques en dBm, pas une prédiction ni mesure de propagation réelle.
 const base={"2.4":-36,"5":-41,"6":-44}[band];
 const attenuation=base-21*Math.log10(1+d)-floors*8;
 const rssi=Math.max(-105,Math.min(-30,Math.round(attenuation)));
 const quality=rssi>=-65?"bonne":rssi>=-78?"faible":"insuffisante";
 return {success:true,code:"signal_calculated",distance:Math.round(d*10)/10,rssi,quality,covered:rssi>=-78,floors};
}
export function wifiCoverageAt({accessPoints=[],checkpoints=[],bands=["2.4","5"],floorHeight=3}={}){
 const points=checkpoints.map(client=>{
  const candidates=[];
  for(const ap of accessPoints){
   if(ap.enabled===false)continue;
   for(const band of bands){
    if(!ap.bands?.includes(band))continue;
    const signal=wifiSignalAt({ap,client,band,floorHeight});
    if(signal.success)candidates.push({apId:ap.id,band,...signal});
   }
  }
  candidates.sort((a,b)=>b.rssi-a.rssi);
  const best=candidates[0]??null;
  return {id:client.id,position:{x:client.x,y:client.y,z:client.z},covered:!!best?.covered,
   best,candidates};
 });
 return {success:true,code:"coverage_calculated",points,coveredCount:points.filter(p=>p.covered).length,
  totalCount:points.length,allCovered:points.length>0&&points.every(p=>p.covered)};
}

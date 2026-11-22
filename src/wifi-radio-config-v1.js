/* Configuration radio pédagogique V1, indépendante de la représentation graphique.
 * Les listes de canaux sont volontairement représentatives, sans domaine réglementaire.
 */
export const WIFI_RADIO_BANDS=["2.4","5","6"];
export const WIFI_RADIO_OPTIONS={
 "2.4":{label:"2,4 GHz",channels:[1,6,11],widths:[20,40]},
 "5":{label:"5 GHz",channels:[36,44,52,100,149,157],widths:[20,40,80,160]},
 "6":{label:"6 GHz",channels:[5,21,37,53,69,85],widths:[20,40,80,160]}
};
export const defaultWifiRadios=()=>({
 "2.4":{enabled:true,channel:"auto",width:20},
 "5":{enabled:true,channel:"auto",width:20},
 "6":{enabled:false,channel:"auto",width:20}
});
export function validWifiRadios(radios){
 if(!radios||typeof radios!=="object"||Array.isArray(radios))return false;
 if(Object.keys(radios).sort().join("|")!==WIFI_RADIO_BANDS.slice().sort().join("|"))return false;
 return WIFI_RADIO_BANDS.every(band=>{
  const radio=radios[band],options=WIFI_RADIO_OPTIONS[band];
  return radio&&typeof radio==="object"&&typeof radio.enabled==="boolean"&&
   (radio.channel==="auto"||Number.isInteger(radio.channel)&&options.channels.includes(radio.channel))&&
   Number.isInteger(radio.width)&&options.widths.includes(radio.width);
 });
}
export function effectiveWifiRadios(config){
 const defaults=defaultWifiRadios();
 return Object.fromEntries(WIFI_RADIO_BANDS.map(band=>[band,{...defaults[band],...(config?.radios?.[band]||{})}]));
}

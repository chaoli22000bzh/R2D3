/* Filtrage MAC métier partagé, par SSID ; neutralité vis-à-vis du DHCP. */
const mac=/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/;
export function normalizeWifiMac(value){
 const raw=String(value??"").trim().toLowerCase().replace(/[-.]/g,"");
 return /^[0-9a-f]{12}$/.test(raw)?raw.match(/.{2}/g).join(":"):null;
}
export function checkWifiMacFilter(config,clientMac){
 const mode=config?.mode??"disabled";
 if(mode==="disabled")return {success:true,code:"mac_filter_disabled"};
 const address=normalizeWifiMac(clientMac);
 if(!address)return {success:false,code:"mac_missing",message:"Adresse MAC du client absente ou invalide."};
 const listed=(config.addresses||[]).includes(address);
 const allowed=mode==="allow"?listed:!listed;
 return allowed?{success:true,code:"mac_allowed",macAddress:address}:
  {success:false,code:"mac_denied",message:"Adresse MAC refusée par le filtrage du SSID."};
}
export function validWifiMacFilter(config){
 if(config===undefined)return true;
 if(!config||!["disabled","allow","deny"].includes(config.mode)||!Array.isArray(config.addresses)||config.addresses.length>128)return false;
 return config.addresses.every(a=>typeof a==="string"&&mac.test(a))&&new Set(config.addresses).size===config.addresses.length;
}

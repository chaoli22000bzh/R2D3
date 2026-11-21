/* Négociation de sécurité Wi-Fi V1, comportement métier partagé.
 * Modèle pédagogique : vérification de compatibilité, pas de handshake
 * WPA ni simulation cryptographique.
 */
export const WIFI_SECURITY_MODES=Object.freeze(["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal","wpa2-enterprise"]);
const DEFAULT_CLIENT_MODES=["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"];
export function negotiateWifiSecurity(apMode,clientModes=DEFAULT_CLIENT_MODES,band="5"){
 if(!WIFI_SECURITY_MODES.includes(apMode)||!Array.isArray(clientModes))
  return {success:false,code:"security_incompatible",message:"Mode de sécurité Wi-Fi incompatible."};
 // Le mode mixte annonce WPA2 et WPA3 ; on choisit le meilleur mode
 // commun. Sur 6 GHz, seul WPA3-Personal est autorisé dans cette V1.
 const advertised=apMode==="wpa2-wpa3-personal"?["wpa3-personal","wpa2-personal"]:[apMode];
 const clientSupports=mode=>clientModes.includes(mode)||(mode!=="open"&&clientModes.includes("wpa2-wpa3-personal"));
 const mode=advertised.find(m=>clientSupports(m)&&(band!=="6"||m==="wpa3-personal"));
 return mode?{success:true,code:"security_compatible",negotiatedSecurity:mode}:
  {success:false,code:"security_incompatible",message:"Aucun protocole de sécurité commun sur cette bande."};
}

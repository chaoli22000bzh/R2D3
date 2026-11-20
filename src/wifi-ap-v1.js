/* Wi-Fi R2D3 : premier lot, association simulée et capacité de borne.
   Ne remplace pas les moteurs Ethernet, DHCP, VLAN ou routage. */
const fail=(code,message)=>({success:false,code,message});
const ok=(code,message,extra={})=>({success:true,code,message,...extra});
export function createWifiAccessPoint(registry,{name="AP-01"}={}){
 if(!registry?.createProfile)return fail("invalid_registry","Registre R2 absent.");
 const p=registry.createProfile("Point d'accès Wi-Fi");if(!p.success)return p;
 for(const g of [{type:"ethernet-rj45",prefix:"ETH",start:1,count:1},{type:"wifi",prefix:"RADIO",start:1,count:1}]){
  const r=registry.addPortGroup(p.profile.id,g);if(!r.success)return r;
 }
 const cap=registry.setProfileNetworkCapability(p.profile.id,"wifi-ap",true);if(!cap.success)return cap;
 return registry.createAsset(p.profile.id,{name});
}
export function getWifiConfig(registry,apId){
 const a=registry?.getAsset?.(apId);
 return a?.networkCapabilities?.includes("wifi-ap")?a.wifiConfig:null;
}
export function configureWifiAp(registry,apId,{enabled,ssids}={}){
 const config=getWifiConfig(registry,apId);
 if(!config)return fail("ap_missing","Point d'accès introuvable.");
 return registry.setAssetWifiConfig(apId,{...config,enabled:enabled??config.enabled,ssids:ssids??config.ssids});
}
export function scanWifiNetworks(registry,{bands=["2.4","5"],security=["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"]}={}){
 const out=[];
 for(const ap of registry.listAssets().filter(a=>a.networkCapabilities?.includes("wifi-ap")&&a.wifiConfig?.enabled&&a.status==="En service")){
  for(const ssid of ap.wifiConfig.ssids.filter(s=>s.enabled)){
   const common=ssid.bands.filter(b=>bands.includes(b));
   if(common.length&&security.includes(ssid.security))out.push({apId:ap.id,apName:ap.name,ssidId:ssid.id,ssid:ssid.name,security:ssid.security,bands:common});
  }
 }
 return out;
}
export function associateWifiClient(registry,{apId,ssidId,password="",bands=["2.4","5"],security=["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"]}={}){
 const ap=registry?.getAsset?.(apId);
 if(!ap?.networkCapabilities?.includes("wifi-ap"))return fail("ap_missing","Borne introuvable.");
 if(ap.status!=="En service"||!ap.wifiConfig?.enabled)return fail("ap_disabled","Borne Wi-Fi désactivée.");
 const ssid=ap.wifiConfig.ssids.find(x=>x.id===ssidId);
 if(!ssid?.enabled)return fail("ssid_unavailable","Réseau Wi-Fi non disponible.");
 if(!ssid.bands.some(x=>bands.includes(x)))return fail("band_incompatible","Aucune bande radio compatible.");
 if(!security.includes(ssid.security))return fail("security_incompatible","Sécurité non prise en charge par le client.");
 if(ssid.security!=="open"&&(!ssid.password||ssid.password!==password))return fail("authentication_failed","Mot de passe incorrect ou absent.");
 return ok("associated","Client associé au Wi-Fi. L'adressage IP et la connectivité Ethernet doivent être testés séparément.",{apId:ap.id,ssid:ssid.name,ssidId:ssid.id,band:ssid.bands.find(x=>bands.includes(x)),clientIsolation:ssid.clientIsolation});
}

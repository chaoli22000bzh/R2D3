import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,scanWifiNetworks,getWifiConfig} from "../src/wifi-ap-v1.js";
import {mountWifiAdmin} from "../src/wifi-admin-ui-v1.js";
const $=id=>document.getElementById(id);
let registry,ap;
function requireSuccess(r){if(!r?.success)throw Error(r?.message||r?.code||"Opération refusée");return r;}
function setup(){
 try{
  registry=createAssetRegistry();
  ap=requireSuccess(createWifiAccessPoint(registry,{name:"AP-CIEL"})).asset;
  const c=getWifiConfig(registry,ap.id);
  requireSuccess(configureWifiAp(registry,ap.id,{ssids:[
   {...c.ssids[0],name:"LYCEE-CIEL",security:"wpa3-personal",password:"Ciel2026!",bands:["2.4","5","6"]}
  ]}));
  mountWifiAdmin({root:$("ap-admin"),registry,assetId:ap.id,onChange:r=>{
   if(r.success)show("Configuration enregistrée. Lance une recherche sur la bande de ton choix.",true);
   else show(r.message||"Enregistrement refusé.",false);
  }});
  $("test-band").value="2.4";
  show("Borne prête. Les radios 2,4 et 5 GHz sont actives, la radio 6 GHz est désactivée.",true);
 }catch(e){show(e.message,false)}
}
function show(message,ok){$("result").textContent=message;$("result").dataset.ok=String(ok)}
$("scan").onclick=()=>{
 const band=$("test-band").value;
 const networks=scanWifiNetworks(registry,{bands:[band],security:["wpa3-personal"]});
 show(networks.length
  ?"SSID visible : "+networks.map(n=>n.ssid).join(", ")+" sur "+band+" GHz."
  :"Aucun SSID visible sur "+band+" GHz avec ce client.",networks.length>0);
};
$("reset").onclick=setup;
setup();

import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,getWifiConfig,configureWifiAp,scanWifiNetworks,associateWifiClient} from "../src/wifi-ap-v1.js";
const $=id=>document.getElementById(id);
let registry,ap;
const report=(id,message,good=null)=>{const el=$(id);el.textContent=message;el.dataset.result=good===null?"":good?"ok":"fail";};
function initialize(){
 registry=createAssetRegistry();
 const r=createWifiAccessPoint(registry,{name:"AP-CIEL-01"});
 if(!r.success)throw Error(r.message);
 ap=r.asset;
 $("enabled").checked=true;$("ssid").value="LYCEE-CIEL";$("security").value="wpa2-personal";
 $("password").value="Ciel2026!";$("band").value="5";$("isolated").checked=false;
 $("client-band").value="5";$("client-password").value="Ciel2026!";
 save();
 report("client-status","Client Wi-Fi prêt.");
}
function save(){
 const security=$("security").value,password=security==="open"?"":$("password").value;
 const bands=[$("band").value];
 const ssid={id:"ssid-1",name:$("ssid").value.trim(),enabled:true,security,password,bands,clientIsolation:$("isolated").checked};
 const r=configureWifiAp(registry,ap.id,{enabled:$("enabled").checked,ssids:[ssid]});
 report("ap-status",r.success?"Configuration Wi-Fi enregistrée dans le registre R2D3.":r.message,r.success);
 return r.success;
}
$("save").addEventListener("click",save);
$("reset").addEventListener("click",initialize);
$("scan").addEventListener("click",()=>{
 const networks=scanWifiNetworks(registry,{bands:[$("client-band").value]});
 report("client-status",networks.length?networks.map(n=>n.ssid+" ("+n.security+", "+n.bands.join("/")+" GHz)").join(" ; "):"Aucun SSID compatible détecté.",networks.length>0);
});
$("connect").addEventListener("click",()=>{
 const r=associateWifiClient(registry,{apId:ap.id,ssidId:"ssid-1",password:$("client-password").value,bands:[$("client-band").value]});
 report("client-status",r.message,r.success);
});
$("security").addEventListener("change",()=>{
 if($("security").value==="open")$("password").value="";
});
initialize();

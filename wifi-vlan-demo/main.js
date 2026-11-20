import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,getWifiConfig} from "../src/wifi-ap-v1.js";
import {addSwitchVlan,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {configureSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
import {requestWifiVlanDhcp} from "../src/wifi-vlan-dhcp-v1.js";
const $=id=>document.getElementById(id);
const report=(id,msg,ok=null)=>{const el=$(id);el.textContent=msg;el.dataset.result=ok===null?"":ok?"ok":"fail";};
const required=r=>{if(!r.success)throw Error(r.message||r.reason||r.code);return r;};
let reg,ap,sw,client,cableId,pools;
function init(){
 reg=createAssetRegistry();
 const p=required(reg.createProfile("Switch L3")).profile;
 required(reg.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}));
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
  required(reg.setProfileNetworkCapability(p.id,cap,true));
 sw=required(reg.createAsset(p.id,{name:"SW-L3"})).asset;
 ap=required(createWifiAccessPoint(reg,{name:"AP-CIEL"})).asset;
 const cp=required(reg.createProfile("PC Wi-Fi")).profile;
 required(reg.addPortGroup(cp.id,{type:"wifi",prefix:"WLAN",start:1,count:1}));
 client=required(reg.createAsset(cp.id,{name:"PC Wi-Fi"})).asset;
 const cable=required(reg.createCable()).cable;cableId=cable.id;
 required(reg.connectCableEnd(cableId,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
 required(reg.connectCableEnd(cableId,1,sw.ports[0].id));
 for(const v of [10,20]){
  required(addSwitchVlan(reg,sw.id,v,"VLAN "+v));
  required(setSwitchVlanInterface(reg,sw.id,v,"192.168."+v+".1",24,true));
 }
 required(setSwitchTrunkPort(reg,sw.id,sw.ports[0].id,[10,20]));
 pools=[10,20].map(v=>({id:"vlan"+v,vlanNumber:v,start:"192.168."+v+".100",end:"192.168."+v+".110",
  prefix:24,gateway:"192.168."+v+".1",dns:["1.1.1.1"],leaseSeconds:3600}));
 required(configureSwitchDhcp(reg,sw.id,{enabled:true,pools}));
 $("ssid-10").value="LYCEE-CIEL";$("vlan-10").value="10";
 $("ssid-20").value="LYCEE-INVITES";$("vlan-20").value="20";
 $("isolation").checked=true;$("trunk").value="10,20";$("dhcp").checked=true;
 $("client-ssid").value="ssid-10";$("client-password").value="Ciel2026!";
 $("link").textContent="Couper le câble Ethernet";
 save();
 report("client-status","Client prêt.");
 report("switch-status","Trunk actif : VLAN 10 et 20 autorisés, DHCP actif.");
}
function save(){
 const ssids=[{id:"ssid-10",name:$("ssid-10").value.trim(),enabled:true,security:"wpa2-personal",
  password:"Ciel2026!",bands:["5"],clientIsolation:false,vlanNumber:Number($("vlan-10").value)},
  {id:"ssid-20",name:$("ssid-20").value.trim(),enabled:true,security:"wpa2-personal",
  password:"Invites2026!",bands:["2.4"],clientIsolation:$("isolation").checked,vlanNumber:Number($("vlan-20").value)}];
 const r=configureWifiAp(reg,ap.id,{ssids});
 report("ap-status",r.success?"Deux SSID enregistrés dans le registre R2D3.":r.message,r.success);
 if(r.success){$("client-ssid").options[0].textContent=ssids[0].name+" (VLAN "+ssids[0].vlanNumber+")";
  $("client-ssid").options[1].textContent=ssids[1].name+" (VLAN "+ssids[1].vlanNumber+")";}
 return r.success;
}
$("save").addEventListener("click",save);
$("reset").addEventListener("click",init);
$("trunk").addEventListener("change",()=>{
 const allowed=$("trunk").value.split(",").map(Number);
 const r=setSwitchTrunkPort(reg,sw.id,sw.ports[0].id,allowed);
 report("switch-status",r.success?"Trunk : VLAN "+allowed.join(" et ")+" autorisé(s).":r.message||r.reason,r.success);
});
$("dhcp").addEventListener("change",()=>{
 const r=configureSwitchDhcp(reg,sw.id,{enabled:$("dhcp").checked,pools});
 report("switch-status",r.success?($("dhcp").checked?"DHCP du switch L3 activé.":"DHCP du switch L3 arrêté."):r.message,r.success);
});
$("link").addEventListener("click",()=>{
 const connected=!!reg.getCable(cableId).ends[1];
 const r=connected?reg.disconnectCableEnd(cableId,1):reg.connectCableEnd(cableId,1,sw.ports[0].id);
 if(!r.success)return report("switch-status",r.message,false);
 $("link").textContent=connected?"Rétablir le câble Ethernet":"Couper le câble Ethernet";
 report("switch-status",connected?"Câble Ethernet coupé.":"Câble Ethernet raccordé.",!connected);
});
$("client-ssid").addEventListener("change",()=>{
 $("client-password").value=$("client-ssid").value==="ssid-10"?"Ciel2026!":"Invites2026!";
});
$("request").addEventListener("click",()=>{
 const id=$("client-ssid").value;
 const r=requestWifiVlanDhcp({registry:reg,apId:ap.id,switchId:sw.id,clientId:client.id,
  ssidId:id,password:$("client-password").value,bands:id==="ssid-10"?["5"]:["2.4"]});
 report("client-status",r.success?
  "SSID "+r.ssid+" | VLAN "+r.vlanNumber+" | IPv4 "+r.address+"/"+r.prefix+" | Passerelle "+r.gateway:
  r.address?"SSID associé, aucun bail DHCP : "+r.address+" ("+r.message+")":r.message,r.success);
});
init();

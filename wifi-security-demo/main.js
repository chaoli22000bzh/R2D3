import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,scanWifiNetworks,associateWifiClient} from "../src/wifi-ap-v1.js";
import {requestWifiVlanDhcp} from "../src/wifi-vlan-dhcp-v1.js";
import {addSwitchVlan,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {configureSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
import {mountWifiAdmin} from "../src/wifi-admin-ui-v1.js";
import "https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/button-feedback.js";
const $=id=>document.getElementById(id);
const good=r=>{if(!r?.success)throw Error(r?.message||r?.reason||r?.code||"Opération refusée");return r;};
let registry,ap,sw,client,wifiUi;
const show=(id,message,success)=>{const el=$(id);el.textContent=message;el.dataset.result=success?"ok":"fail";};
function capabilities(){
 const mode=$("client-mode").value;
 return mode==="both"?["wpa2-personal","wpa3-personal"]:mode==="open"?["open"]:[mode];
}
const bands=()=>[$("client-band").value];
function setup(){
 try{
  registry=createAssetRegistry();
  const sp=good(registry.createProfile("Switch L3")).profile;
  good(registry.addPortGroup(sp.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}));
  for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
   good(registry.setProfileNetworkCapability(sp.id,cap,true));
  sw=good(registry.createAsset(sp.id,{name:"SW-L3"})).asset;
  ap=good(createWifiAccessPoint(registry,{name:"AP-CIEL"})).asset;
  const cp=good(registry.createProfile("PC Wi-Fi")).profile;
  good(registry.addPortGroup(cp.id,{type:"wifi",prefix:"WLAN",start:1,count:1}));
  client=good(registry.createAsset(cp.id,{name:"PC-CIEL"})).asset;
  const cable=good(registry.createCable()).cable;
  good(registry.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
  good(registry.connectCableEnd(cable.id,1,sw.ports[0].id));
  good(addSwitchVlan(registry,sw.id,10,"VLAN 10"));
  good(setSwitchVlanInterface(registry,sw.id,10,"192.168.10.1",24,true));
  good(setSwitchTrunkPort(registry,sw.id,sw.ports[0].id,[10]));
  good(configureSwitchDhcp(registry,sw.id,{enabled:true,pools:[{
   id:"vlan10",vlanNumber:10,start:"192.168.10.100",end:"192.168.10.110",
   prefix:24,gateway:"192.168.10.1",dns:["1.1.1.1"],leaseSeconds:3600}]}));
  good(configureWifiAp(registry,ap.id,{ssids:[{
   id:"ssid-10",name:"LYCEE-CIEL",enabled:true,security:"wpa2-personal",
   password:"Ciel2026!",bands:["2.4","5"],vlanNumber:10,clientIsolation:false}]}));
  wifiUi=mountWifiAdmin({root:$("ap-admin"),registry,assetId:ap.id});
  $("client-mode").value="wpa2-personal";$("client-band").value="5";$("client-password").value="Ciel2026!";
  show("init-status","Borne et switch prêts. Réseau initial WPA2-Personal, VLAN 10, DHCP actif.",true);
  $("result").textContent="Choisis un client puis recherche le réseau.";$("result").dataset.result="";
 }catch(e){show("init-status",e.message,false);}
}
$("scan").addEventListener("click",()=>{
 const networks=scanWifiNetworks(registry,{bands:bands(),security:capabilities()});
 if(networks.length){
  show("result","Réseau détecté : "+networks.map(x=>x.ssid+" ("+x.security+")").join(", ")+".",true);
 }else show("result","Aucun réseau compatible visible sur cette bande avec ce profil de sécurité.",false);
});
$("connect").addEventListener("click",()=>{
 const opts={registry,apId:ap.id,switchId:sw.id,clientId:client.id,ssidId:"ssid-10",
   password:$("client-password").value,bands:bands(),security:capabilities(),macAddress:"02-00-00-00-10-01"};
 const auth=associateWifiClient(registry,opts);
 if(!auth.success){show("result","Association refusée : "+auth.message+" ("+auth.code+").",false);return;}
 const lease=requestWifiVlanDhcp(opts);
 if(!lease.success){show("result","Association acceptée en "+auth.negotiatedSecurity+", mais DHCP impossible : "+(lease.message||lease.code),false);return;}
 show("result","Association acceptée en "+auth.negotiatedSecurity+" sur "+auth.band+" GHz.\nBail DHCP Core : "+lease.address+"/"+lease.prefix+", passerelle "+lease.gateway+".",true);
});
$("reset").addEventListener("click",setup);
setup();

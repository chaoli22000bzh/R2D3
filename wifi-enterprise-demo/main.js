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
let registry,ap,sw,client;
const show=(id,message,success)=>{const el=$(id);el.textContent=message;el.dataset.result=success?"ok":"fail";};
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
   id:"ssid-10",name:"LYCEE-CIEL",enabled:true,security:"wpa2-enterprise",
   password:"",radius:{address:"192.168.10.2",port:1812,secret:"RADIUS-CIEL"},
   macFilter:{mode:"disabled",addresses:[]},
   bands:["2.4","5"],vlanNumber:10,clientIsolation:false}]}));
  mountWifiAdmin({root:$("ap-admin"),registry,assetId:ap.id});
  $("server-address").value="192.168.10.2";$("server-port").value="1812";$("server-secret").value="RADIUS-CIEL";$("server-enabled").value="on";
  $("client-mode").value="wpa2-enterprise";$("client-band").value="5";
  $("username").value="eleve01";$("password").value="Eleve2026!";$("mac").value="02:00:00:00:10:01";
  show("init-status","WPA2-Enterprise prêt. VLAN 10 et DHCP du Core actifs.",true);
  $("result").textContent="Recherche et association disponibles."; $("result").dataset.result="";
 }catch(e){show("init-status",e.message,false);}
}
function clientOpts(){
 return {apId:ap.id,ssidId:"ssid-10",security:[$("client-mode").value],bands:[$("client-band").value],
  username:$("username").value,password:$("password").value,macAddress:$("mac").value,
  radiusService:{address:$("server-address").value.trim(),port:Number($("server-port").value),
   secret:$("server-secret").value,enabled:$("server-enabled").value==="on",
   users:[{username:"eleve01",password:"Eleve2026!",enabled:true},
    {username:"eleve02",password:"Eleve2026!",enabled:false}]}};
}
$("scan").addEventListener("click",()=>{
 const options=clientOpts();
 const networks=scanWifiNetworks(registry,{bands:options.bands,security:options.security});
 show("result",networks.length?"Réseau compatible détecté : "+networks.map(n=>n.ssid+" ("+n.security+")").join(", ")+".":"Aucun réseau compatible.",networks.length>0);
});
$("connect").addEventListener("click",()=>{
 const opts=clientOpts();
 const auth=associateWifiClient(registry,opts);
 if(!auth.success){show("result","Association refusée : "+auth.message+" ("+auth.code+").",false);return;}
 const lease=requestWifiVlanDhcp({registry,apId:ap.id,switchId:sw.id,clientId:client.id,ssidId:"ssid-10",macAddress:opts.macAddress,bands:opts.bands});
 if(!lease.success){show("result","Association acceptée mais DHCP refusé : "+(lease.message||lease.code),false);return;}
 show("result","Utilisateur "+opts.username+" accepté en "+auth.negotiatedSecurity+".\nBail DHCP : "+lease.address+"/"+lease.prefix+", passerelle "+lease.gateway+".",true);
});
$("reset").addEventListener("click",setup);
setup();

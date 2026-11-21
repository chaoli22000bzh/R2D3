import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp} from "../src/wifi-ap-v1.js";
import {addSwitchVlan,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {configureSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
import {createWifiInterVlanSession} from "../src/wifi-inter-vlan-v1.js";
import {mountWifiAdmin} from "../src/wifi-admin-ui-v1.js";
import {mountSwitchAdmin} from "../src/switch-admin-ui-v1.js";
import {createPingAnimator} from "https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/ping-animation.js";
import "https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/button-feedback.js";
const $=id=>document.getElementById(id);
const ok=r=>{if(!r?.success)throw Error(r?.message||r?.reason||r?.code||"Opération refusée");return r;};
const display=(id,message,success)=>{const el=$(id);el.textContent=message;el.dataset.result=success?"ok":"fail";};
let registry,ap,sw,session,switchUi;
const animator=createPingAnimator($("ping-console"));
function initialize(){
 try{
  switchUi?.destroy();animator.cancel("C:\\Users\\technicien>");
  registry=createAssetRegistry();
  const profile=ok(registry.createProfile("Switch L3")).profile;
  ok(registry.addPortGroup(profile.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}));
  for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])ok(registry.setProfileNetworkCapability(profile.id,cap,true));
  sw=ok(registry.createAsset(profile.id,{name:"SW-L3"})).asset;
  ap=ok(createWifiAccessPoint(registry,{name:"AP-CIEL"})).asset;
  const clientProfile=ok(registry.createProfile("Client Wi-Fi")).profile;
  ok(registry.addPortGroup(clientProfile.id,{type:"wifi",prefix:"WLAN",start:1,count:1}));
  const clients=["PC-01","PC-02"].map(name=>ok(registry.createAsset(clientProfile.id,{name})).asset);
  const cable=ok(registry.createCable()).cable;
  ok(registry.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
  ok(registry.connectCableEnd(cable.id,1,sw.ports[0].id));
  for(const n of [10,20]){
   ok(addSwitchVlan(registry,sw.id,n,"VLAN "+n));
   ok(setSwitchVlanInterface(registry,sw.id,n,"192.168."+n+".1",24,true));
  }
  ok(setSwitchTrunkPort(registry,sw.id,sw.ports[0].id,[10,20]));
  ok(configureSwitchDhcp(registry,sw.id,{enabled:true,pools:[10,20].map(n=>({
   id:"vlan"+n,vlanNumber:n,start:"192.168."+n+".100",end:"192.168."+n+".110",
   prefix:24,gateway:"192.168."+n+".1",dns:["1.1.1.1"],leaseSeconds:3600
  }))}));
  ok(configureWifiAp(registry,ap.id,{ssids:[
   {id:"ssid-10",name:"LYCEE-CIEL",enabled:true,security:"wpa2-personal",password:"Ciel2026!",bands:["5"],clientIsolation:false,vlanNumber:10},
   {id:"ssid-20",name:"LYCEE-INVITES",enabled:true,security:"wpa2-personal",password:"Invites2026!",bands:["2.4"],clientIsolation:true,vlanNumber:20}
  ]}));
  session=ok(createWifiInterVlanSession({registry,apId:ap.id,switchId:sw.id,clients:[
   {clientId:clients[0].id,ssidId:"ssid-10",password:"Ciel2026!",bands:["5"],macAddress:"02-00-00-00-10-01"},
   {clientId:clients[1].id,ssidId:"ssid-20",password:"Invites2026!",bands:["2.4"],macAddress:"02-00-00-00-20-01"}
  ]}));
  $("ip-10").textContent=session.clients[0].address;
  $("ip-20").textContent=session.clients[1].address;
  mountWifiAdmin({root:$("ap-admin"),registry,assetId:ap.id});
  switchUi=mountSwitchAdmin({root:$("switch-admin"),registry,assetId:sw.id});
  display("init-status","Clients associés, baux reçus du Core DHCP commun.",true);
  $("ping-status").textContent="Lance un diagnostic.";$("ping-status").dataset.result="";
 }catch(e){display("init-status",e.message,false);}
}
$("ping").addEventListener("click",()=>{
 if(!session?.ping)return;
 const r=session.ping();
 display("ping-status",r.message,r.success);
 animator.run({sourceName:"PC-01",sourceAddress:session.clients[0].address,
  targetAddress:session.clients[1].address,targetInput:session.clients[1].address,outcome:r});
});
$("reset").addEventListener("click",initialize);
initialize();

import {mountWifiAdmin} from "../src/wifi-admin-ui-v1.js";
import {createPingAnimator} from "https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/ping-animation.js";
import "https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/button-feedback.js";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,getWifiConfig} from "../src/wifi-ap-v1.js";
import {addSwitchVlan,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {configureSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
import {createWifiIsolationSession} from "../src/wifi-isolation-v1.js";
const $=id=>document.getElementById(id);
const good=r=>{if(!r?.success)throw Error(r?.message||r?.reason||r?.code||"Erreur réseau");return r;};
const report=(id,r)=>{const el=$(id);el.textContent=r.message;el.dataset.result=r.success?"ok":"fail";};
let registry,ap,sw,session;
const animator=createPingAnimator($("ping-console"));
let wifiAdmin;
function initialize(){
 registry=createAssetRegistry();
 const swProfile=good(registry.createProfile("Switch L3")).profile;
 good(registry.addPortGroup(swProfile.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}));
 for(const capability of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
  good(registry.setProfileNetworkCapability(swProfile.id,capability,true));
 sw=good(registry.createAsset(swProfile.id,{name:"SW-L3"})).asset;
 ap=good(createWifiAccessPoint(registry,{name:"AP-CIEL"})).asset;
 const clientProfile=good(registry.createProfile("Client Wi-Fi")).profile;
 good(registry.addPortGroup(clientProfile.id,{type:"wifi",prefix:"WLAN",start:1,count:1}));
 const clients=[good(registry.createAsset(clientProfile.id,{name:"PC-01"})).asset,
   good(registry.createAsset(clientProfile.id,{name:"PC-02"})).asset];
 const cable=good(registry.createCable()).cable;
 good(registry.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
 good(registry.connectCableEnd(cable.id,1,sw.ports[0].id));
 good(addSwitchVlan(registry,sw.id,10,"VLAN 10"));
 good(setSwitchVlanInterface(registry,sw.id,10,"192.168.10.1",24,true));
 good(setSwitchTrunkPort(registry,sw.id,sw.ports[0].id,[10]));
 good(configureSwitchDhcp(registry,sw.id,{enabled:true,pools:[{
  id:"vlan10",vlanNumber:10,start:"192.168.10.100",end:"192.168.10.110",
  prefix:24,gateway:"192.168.10.1",dns:["1.1.1.1"],leaseSeconds:3600
 }]}));
 good(configureWifiAp(registry,ap.id,{ssids:[{
  id:"lycee",name:"LYCEE-CIEL",enabled:true,security:"wpa2-personal",
  password:"Ciel2026!",bands:["5"],clientIsolation:false,vlanNumber:10
 }]}));
 const associations=clients.map((pc,i)=>({clientId:pc.id,password:"Ciel2026!",
  bands:["5"],macAddress:"02-00-00-00-10-0"+(i+1)}));
 session=createWifiIsolationSession({registry,apId:ap.id,switchId:sw.id,ssidId:"lycee",clients:associations});
 good(session);
 $("ip-1").textContent=session.addresses[0];$("ip-2").textContent=session.addresses[1];
 wifiAdmin=mountWifiAdmin({root:$("wifi-admin"),registry,assetId:ap.id,onChange:r=>report("ap-status",r)});
 report("leases-status",{success:true,message:"Deux baux IPv4 distincts attribués : "+session.addresses.join(" et ")+"/24."});
 report("ap-status",{success:true,message:"Isolation mode désactivé : communication directe autorisée."});
 animator.cancel("C:\\\\Users\\\\technicien>");
 $("ping-status").textContent="Choisis un test ping.";$("ping-status").dataset.result="";
}
function runPing(target,call){
 const result=call();
 report("ping-status",result);
 animator.run({sourceName:"PC-01",sourceAddress:session.addresses[0],
  targetAddress:target,targetInput:target,outcome:result});
}
$("peer-ping").addEventListener("click",()=>runPing(session.addresses[1],session.pingPeers));
$("gateway-ping").addEventListener("click",()=>runPing("192.168.10.1",session.pingGateway));
$("reset").addEventListener("click",initialize);
initialize();

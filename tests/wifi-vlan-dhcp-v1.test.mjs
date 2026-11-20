import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,getWifiConfig} from "../src/wifi-ap-v1.js";
import {addSwitchVlan,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {configureSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
import {requestWifiVlanDhcp} from "../src/wifi-vlan-dhcp-v1.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function fixture(){
 const registry=createAssetRegistry(),p=registry.createProfile("Switch L3").profile;
 good(registry.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}));
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])good(registry.setProfileNetworkCapability(p.id,cap,true));
 const sw=registry.createAsset(p.id,{name:"SW-L3"}).asset;
 const ap=createWifiAccessPoint(registry,{name:"AP-CIEL"}).asset;
 const cp=registry.createProfile("Client Wi-Fi").profile;
 good(registry.addPortGroup(cp.id,{type:"wifi",prefix:"WLAN",start:1,count:1}));
 const client=registry.createAsset(cp.id,{name:"PC-Wi-Fi"}).asset;
 const cable=registry.createCable().cable;
 good(registry.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
 good(registry.connectCableEnd(cable.id,1,sw.ports[0].id));
 const ssids=[
  {id:"ssid-10",name:"LYCEE-CIEL",enabled:true,security:"wpa2-personal",password:"Ciel2026!",bands:["5"],clientIsolation:false,vlanNumber:10},
  {id:"ssid-20",name:"LYCEE-INVITES",enabled:true,security:"wpa2-personal",password:"Invites2026!",bands:["2.4"],clientIsolation:true,vlanNumber:20}
 ];
 good(configureWifiAp(registry,ap.id,{ssids}));
 for(const n of [10,20]){good(addSwitchVlan(registry,sw.id,n,"VLAN "+n));
  good(setSwitchVlanInterface(registry,sw.id,n,"192.168."+n+".1",24,true));}
 good(setSwitchTrunkPort(registry,sw.id,sw.ports[0].id,[10,20]));
 const pools=[10,20].map(n=>({id:"vlan"+n,vlanNumber:n,start:"192.168."+n+".100",end:"192.168."+n+".110",
   prefix:24,gateway:"192.168."+n+".1",dns:["1.1.1.1"],leaseSeconds:3600}));
 good(configureSwitchDhcp(registry,sw.id,{enabled:true,pools}));
 const args={registry,apId:ap.id,switchId:sw.id,clientId:client.id,ssidId:"ssid-10",password:"Ciel2026!",bands:["5"]};
 return {registry,sw,ap,client,cable,ssids,pools,args};
}
test("Wi-Fi multi-SSID : VLAN 10 et 20 reçoivent chacun la plage du Core DHCP L3",()=>{
 const f=fixture(),a=requestWifiVlanDhcp(f.args),b=requestWifiVlanDhcp({...f.args,ssidId:"ssid-20",password:"Invites2026!",bands:["2.4"]});
 good(a);good(b);assert.equal(a.address,"192.168.10.100");assert.equal(b.address,"192.168.20.100");
 assert.equal(a.vlanNumber,10);assert.equal(b.vlanNumber,20);
});
test("Wi-Fi multi-SSID : Trunk requis et VLAN réellement autorisé",()=>{
 const f=fixture();
 good(setSwitchTrunkPort(f.registry,f.sw.id,f.sw.ports[0].id,[10]));
 assert.equal(requestWifiVlanDhcp({...f.args,ssidId:"ssid-20",password:"Invites2026!",bands:["2.4"]}).code,"vlan_blocked");
 good(setSwitchTrunkPort(f.registry,f.sw.id,f.sw.ports[0].id,[10,20]));
 assert.equal(requestWifiVlanDhcp({...f.args,ssidId:"ssid-20",password:"Invites2026!",bands:["2.4"]}).address,"192.168.20.100");
});
test("Wi-Fi multi-SSID : mauvais mot de passe et câble coupé refusés",()=>{
 const f=fixture();
 assert.equal(requestWifiVlanDhcp({...f.args,password:"incorrect"}).code,"authentication_failed");
 good(f.registry.disconnectCableEnd(f.cable.id,1));
 assert.equal(requestWifiVlanDhcp(f.args).code,"link_down");
 good(f.registry.connectCableEnd(f.cable.id,1,f.sw.ports[0].id));
 good(requestWifiVlanDhcp(f.args));
});
test("Wi-Fi multi-SSID : DHCP désactivé génère APIPA du Core, puis rétablit",()=>{
 const f=fixture();good(configureSwitchDhcp(f.registry,f.sw.id,{enabled:false,pools:f.pools}));
 const r=requestWifiVlanDhcp(f.args);assert.equal(r.code,"apipa",JSON.stringify(r));assert.match(r.address,/^169\.254\./);
 good(configureSwitchDhcp(f.registry,f.sw.id,{enabled:true,pools:f.pools}));
 assert.equal(requestWifiVlanDhcp(f.args).address,"192.168.10.100");
});
test("Wi-Fi : VLAN de SSID persistant et validation atomique du numéro",()=>{
 const f=fixture();
 const state=f.registry.exportState();assert.deepEqual(restoreAssetRegistry(state).exportState(),state);
 const c=getWifiConfig(f.registry,f.ap.id);c.ssids[0].vlanNumber=4095;
 assert.equal(f.registry.setAssetWifiConfig(f.ap.id,c).success,false);
 assert.deepEqual(f.registry.exportState(),state);
});

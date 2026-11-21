import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp} from "../src/wifi-ap-v1.js";
import {addSwitchVlan,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface,setSwitchInterVlanRouting} from "../src/inter-vlan-routing-v1.js";
import {configureSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
import {createWifiInterVlanSession} from "../src/wifi-inter-vlan-v1.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function fixture(){
 const registry=createAssetRegistry(),p=registry.createProfile("Switch L3").profile;
 good(registry.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}));
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
  good(registry.setProfileNetworkCapability(p.id,cap,true));
 const sw=registry.createAsset(p.id,{name:"SW-L3"}).asset;
 const ap=createWifiAccessPoint(registry,{name:"AP-CIEL"}).asset;
 const cp=registry.createProfile("Client Wi-Fi").profile;
 good(registry.addPortGroup(cp.id,{type:"wifi",prefix:"WLAN",start:1,count:1}));
 const ids=["PC-01","PC-02"].map(name=>registry.createAsset(cp.id,{name}).asset.id);
 const cable=registry.createCable().cable;
 good(registry.connectCableEnd(cable.id,0,ap.ports.find(x=>x.type==="ethernet-rj45").id));
 good(registry.connectCableEnd(cable.id,1,sw.ports[0].id));
 for(const n of [10,20]){
  good(addSwitchVlan(registry,sw.id,n,"VLAN "+n));
  good(setSwitchVlanInterface(registry,sw.id,n,"192.168."+n+".1",24,true));
 }
 good(setSwitchTrunkPort(registry,sw.id,sw.ports[0].id,[10,20]));
 good(configureSwitchDhcp(registry,sw.id,{enabled:true,pools:[10,20].map(n=>({
  id:"vlan"+n,vlanNumber:n,start:"192.168."+n+".100",end:"192.168."+n+".110",
  prefix:24,gateway:"192.168."+n+".1",dns:["1.1.1.1"],leaseSeconds:3600
 }))}));
 good(configureWifiAp(registry,ap.id,{ssids:[
  {id:"ssid-10",name:"LYCEE-CIEL",enabled:true,security:"wpa2-personal",password:"Ciel2026!",bands:["5"],clientIsolation:false,vlanNumber:10},
  {id:"ssid-20",name:"LYCEE-INVITES",enabled:true,security:"wpa2-personal",password:"Invites2026!",bands:["2.4"],clientIsolation:true,vlanNumber:20}
 ]}));
 const clients=[
  {clientId:ids[0],ssidId:"ssid-10",password:"Ciel2026!",bands:["5"],macAddress:"02-00-00-00-10-01"},
  {clientId:ids[1],ssidId:"ssid-20",password:"Invites2026!",bands:["2.4"],macAddress:"02-00-00-00-20-01"}
 ];
 const start=()=>createWifiInterVlanSession({registry,apId:ap.id,switchId:sw.id,clients});
 return {registry,sw,ap,cable,clients,start};
}
test("Deux SSID, deux VLAN, vraies plages DHCP, routage coupé puis activé sans renouvellement",()=>{
 const f=fixture(),session=f.start();good(session);
 assert.deepEqual(session.clients.map(c=>c.address),["192.168.10.100","192.168.20.100"]);
 assert.equal(session.ping().success,false);
 assert.match(session.ping().message,/désactivé/);
 good(setSwitchInterVlanRouting(f.registry,f.sw.id,true));
 assert.equal(session.ping().success,true);
 assert.deepEqual(session.clients.map(c=>c.address),["192.168.10.100","192.168.20.100"]);
 good(setSwitchInterVlanRouting(f.registry,f.sw.id,false));
 assert.equal(session.ping().success,false);
});
test("SSID invités en isolation mode ne remplace pas le routage inter-VLAN",()=>{
 const f=fixture();good(setSwitchInterVlanRouting(f.registry,f.sw.id,true));
 const session=f.start();good(session);
 assert.equal(session.ping().success,true);
});
test("VLAN non autorisé, câble coupé et mot de passe incorrect",()=>{
 const f=fixture();
 good(setSwitchTrunkPort(f.registry,f.sw.id,f.sw.ports[0].id,[10]));
 assert.equal(f.start().code,"vlan_blocked");
 good(setSwitchTrunkPort(f.registry,f.sw.id,f.sw.ports[0].id,[10,20]));
 good(f.registry.disconnectCableEnd(f.cable.id,1));
 assert.equal(f.start().code,"link_down");
 good(f.registry.connectCableEnd(f.cable.id,1,f.sw.ports[0].id));
 const clients=f.clients.map(x=>({...x}));clients[1].password="Erreur";
 assert.equal(createWifiInterVlanSession({registry:f.registry,apId:f.ap.id,switchId:f.sw.id,clients}).code,"authentication_failed");
});
test("Coupure physique après les baux empêche le ping ; rétablissement restaure",()=>{
 const f=fixture();good(setSwitchInterVlanRouting(f.registry,f.sw.id,true));
 const session=f.start();good(session);assert.equal(session.ping().success,true);
 good(f.registry.disconnectCableEnd(f.cable.id,1));
 assert.equal(session.ping().success,false);
 good(f.registry.connectCableEnd(f.cable.id,1,f.sw.ports[0].id));
 assert.equal(session.ping().success,true);
});
test("Désactivation interface VLAN et passerelle incorrecte sont détectées par le moteur L3",()=>{
 const f=fixture();good(setSwitchInterVlanRouting(f.registry,f.sw.id,true));
 const session=f.start();good(session);
 good(setSwitchVlanInterface(f.registry,f.sw.id,20,"192.168.20.1",24,false));
 assert.equal(session.ping().success,false);
 good(setSwitchVlanInterface(f.registry,f.sw.id,20,"192.168.20.1",24,true));
 assert.equal(session.ping().success,true);
 good(setSwitchVlanInterface(f.registry,f.sw.id,20,"192.168.20.254",24,true));
 assert.equal(session.ping().success,false);
});

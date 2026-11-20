import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,getWifiConfig} from "../src/wifi-ap-v1.js";
import {addSwitchVlan,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {configureSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
import {createWifiIsolationSession} from "../src/wifi-isolation-v1.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function fixture(){
 const registry=createAssetRegistry(),p=registry.createProfile("Switch L3").profile;
 good(registry.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}));
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
  good(registry.setProfileNetworkCapability(p.id,cap,true));
 const sw=registry.createAsset(p.id,{name:"SW-L3"}).asset;
 const ap=createWifiAccessPoint(registry,{name:"AP-CIEL"}).asset;
 const cp=registry.createProfile("Portable Wi-Fi").profile;
 good(registry.addPortGroup(cp.id,{type:"wifi",prefix:"WLAN",start:1,count:1}));
 const pc1=registry.createAsset(cp.id,{name:"PC-01"}).asset,pc2=registry.createAsset(cp.id,{name:"PC-02"}).asset;
 const cable=registry.createCable().cable;
 good(registry.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
 good(registry.connectCableEnd(cable.id,1,sw.ports[0].id));
 good(addSwitchVlan(registry,sw.id,10,"Interne"));
 good(setSwitchVlanInterface(registry,sw.id,10,"192.168.10.1",24,true));
 good(setSwitchTrunkPort(registry,sw.id,sw.ports[0].id,[10]));
 good(configureSwitchDhcp(registry,sw.id,{enabled:true,pools:[{id:"vlan10",vlanNumber:10,
  start:"192.168.10.100",end:"192.168.10.110",prefix:24,gateway:"192.168.10.1",
  dns:["1.1.1.1"],leaseSeconds:3600}]}));
 const ssid={id:"lycee",name:"LYCEE-CIEL",enabled:true,security:"wpa2-personal",
  password:"Ciel2026!",bands:["5"],clientIsolation:false,vlanNumber:10};
 good(configureWifiAp(registry,ap.id,{ssids:[ssid]}));
 const clients=[pc1,pc2].map((pc,i)=>({clientId:pc.id,password:"Ciel2026!",bands:["5"],
  macAddress:"02-00-00-00-10-0"+(i+1)}));
 const start=()=>createWifiIsolationSession({registry,apId:ap.id,switchId:sw.id,ssidId:"lycee",clients});
 const isolation=enabled=>{const config=getWifiConfig(registry,ap.id);config.ssids[0].clientIsolation=enabled;good(registry.setAssetWifiConfig(ap.id,config));};
 return {registry,sw,ap,pc1,pc2,cable,clients,start,isolation};
}
test("Wi-Fi isolation : deux baux réellement distincts, ping entre clients sans isolation",()=>{
 const f=fixture(),session=f.start();
 good(session);assert.deepEqual(session.addresses,["192.168.10.100","192.168.10.101"]);
 assert.equal(session.pingPeers().code,"reply");
 assert.equal(session.pingGateway().code,"reply");
});
test("Wi-Fi isolation : blocage entre clients, accès à la passerelle conservé, retour normal",()=>{
 const f=fixture(),session=f.start();good(session);
 f.isolation(true);
 assert.equal(session.pingPeers().code,"client_isolation");
 assert.equal(session.pingGateway().code,"reply");
 f.isolation(false);
 assert.equal(session.pingPeers().code,"reply");
});
test("Wi-Fi isolation : mauvais mot de passe et absence de câble refusent la session",()=>{
 const f=fixture();const badClients=[...f.clients];badClients[1]={...badClients[1],password:"erreur"};
 const result=createWifiIsolationSession({registry:f.registry,apId:f.ap.id,switchId:f.sw.id,ssidId:"lycee",clients:badClients});
 assert.equal(result.code,"authentication_failed");
 good(f.registry.disconnectCableEnd(f.cable.id,1));
 assert.equal(f.start().code,"link_down");
});
test("Wi-Fi isolation : VLAN interdit sur le Trunk empêche les deux baux",()=>{
 const f=fixture();good(setSwitchTrunkPort(f.registry,f.sw.id,f.sw.ports[0].id,[1]));
 assert.equal(f.start().code,"vlan_blocked");
});
test("Wi-Fi isolation : DHCP arrêté ne produit aucune session avec deux baux",()=>{
 const f=fixture(),config=f.registry.getAsset(f.sw.id).dhcpServerConfig;
 good(configureSwitchDhcp(f.registry,f.sw.id,{enabled:false,pools:config.pools}));
 assert.equal(f.start().code,"apipa");
});

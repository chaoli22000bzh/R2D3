import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,installNetCamProfile,restoreAssetRegistry} from "../src/asset-profiles.js";
import {requestAssetInterfaceDhcp} from "../src/network-client-dhcp-v1.js";
import {mountNetCamAdmin} from "../src/netcam-admin-ui-v1.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function fixture(){
 const registry=createAssetRegistry(),p=installNetCamProfile(registry).profile;
 good(registry.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}));
 good(registry.addPortGroup(p.id,{type:"wifi",prefix:"WIFI",start:1,count:1}));
 const cam=registry.createAsset(p.id,{name:"NETCAM-01"});good(cam);
 const eth=cam.asset.ports.find(p=>p.type==="ethernet-rj45"),wifi=cam.asset.ports.find(p=>p.type==="wifi");
 return {registry,cam:cam.asset,eth,wifi};
}
test("DHCP client : deux interfaces NetCam isolées reçoivent des APIPA distinctes du Core",()=>{
 const f=fixture();
 const e=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.eth.id});
 const w=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.wifi.id});
 good(e);good(w);
 assert.equal(e.code,"apipa");assert.equal(w.code,"apipa");
 assert.match(e.address,/^169\.254\./);assert.match(w.address,/^169\.254\./);
 assert.notEqual(e.address,w.address);
 assert.equal(e.prefix,16);assert.equal(e.gateway,null);assert.deepEqual(e.dns,[]);
 assert.equal(f.registry.getAsset(f.cam.id).interfaceIpv4[f.eth.id].address,e.address);
 assert.equal(f.registry.getAsset(f.cam.id).interfaceIpv4[f.wifi.id].address,w.address);
 assert.deepEqual(restoreAssetRegistry(f.registry.exportState()).exportState(),f.registry.exportState());
});
test("DHCP client : APIPA non raccordée puis bail DHCP via box au branchement",()=>{
 const f=fixture();
 const first=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.eth.id});
 good(first);assert.equal(first.code,"apipa");
 const box=f.registry.createBoxComposite("BOX-01");good(box);
 const cable=f.registry.createCable();good(cable);
 good(f.registry.connectCableEnd(cable.cable.id,0,f.eth.id));
 good(f.registry.connectCableEnd(cable.cable.id,1,box.config.ports.lanPortIds[0]));
 const next=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.eth.id});
 good(next);assert.equal(next.code,"lease");assert.equal(next.address,"192.168.1.100");
 assert.equal(f.registry.getAsset(f.cam.id).interfaceIpv4[f.eth.id].address,next.address);
});
test("DHCP client : serveur indisponible sans bail actif puis liaison Wi-Fi",()=>{
 const f=fixture(),box=f.registry.createBoxComposite("BOX-01");good(box);
 const c=f.registry.createCable();good(c);
 good(f.registry.connectCableEnd(c.cable.id,0,f.eth.id));
 good(f.registry.connectCableEnd(c.cable.id,1,box.config.ports.lanPortIds[0]));
 const lan=f.registry.getAsset(box.asset.id).boxConfig.lan;
 good(f.registry.setBoxLanConfig(box.asset.id,{...lan,dhcpEnabled:false}));
 const apipa=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.eth.id});
 good(apipa);assert.equal(apipa.code,"apipa");
 assert.match(apipa.address,/^169\.254\./);
 assert.equal(f.registry.getAsset(f.cam.id).interfaceIpv4[f.eth.id].status,"connected");
 const updatedLan=f.registry.getAsset(box.asset.id).boxConfig.lan;
 good(f.registry.setBoxLanConfig(box.asset.id,{...updatedLan,dhcpEnabled:true}));
 good(f.registry.setAssetClientWifi(f.cam.id,f.wifi.id,{ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
 const result=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.wifi.id});
 good(result);assert.equal(result.code,"lease");assert.equal(result.address,"192.168.1.100");
});

test("DHCP client : 30 interfaces Wi-Fi génériques obtiennent 30 baux uniques, persistants et renouvelables",()=>{
 const registry=createAssetRegistry();
 const box=registry.createBoxComposite("BOX-30");good(box);
 const profile=registry.createProfile("Client DHCP générique");good(profile);
 good(registry.addPortGroup(profile.profile.id,{type:"wifi",prefix:"WIFI",start:1,count:1}));
 const clients=[];
 for(let i=0;i<30;i++){
  const a=registry.createAsset(profile.profile.id,{name:"CLIENT-"+(i+1)});good(a);
  const port=a.asset.ports[0];
  good(registry.setAssetClientWifi(a.asset.id,port.id,{
   ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
  clients.push({assetId:a.asset.id,portId:port.id});
 }
 const first=clients.map(c=>requestAssetInterfaceDhcp({registry,...c}));
 first.forEach(good);
 assert.equal(first.every(r=>r.code==="lease"),true);
 assert.equal(new Set(first.map(r=>r.address)).size,30);
 assert.equal(registry.getAsset(box.asset.id).boxConfig.dhcpState.clients.length,30);
 for(let i=clients.length-1;i>=0;i--){
  const renewed=requestAssetInterfaceDhcp({registry,...clients[i]});good(renewed);
  assert.equal(renewed.address,first[i].address);
 }
 const restored=restoreAssetRegistry(registry.exportState());
 const afterRestore=requestAssetInterfaceDhcp({registry:restored,...clients[14]});
 good(afterRestore);
 assert.equal(afterRestore.address,first[14].address);
 assert.equal(new Set(restored.getAsset(box.asset.id).boxConfig.dhcpState.clients.map(c=>c.address)).size,30);
});

test("DHCP client : Ethernet conserve une IPv4 ancienne sans bail et Wi-Fi reçoit un bail différent",()=>{
 const f=fixture(),box=f.registry.createBoxComposite("BOX-01");good(box);
 const cable=f.registry.createCable();good(cable);
 good(f.registry.connectCableEnd(cable.cable.id,0,f.eth.id));
 good(f.registry.connectCableEnd(cable.cable.id,1,box.config.ports.lanPortIds[0]));
 good(f.registry.setAssetInterfaceIpv4(f.cam.id,f.eth.id,{
  mode:"dhcp",status:"connected",address:"192.168.1.100",prefix:24,
  gateway:"192.168.1.1",dns:["192.168.1.1"]}));
 good(f.registry.setAssetClientWifi(f.cam.id,f.wifi.id,{
  ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
 const wifi=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.wifi.id});
 good(wifi);assert.equal(wifi.code,"lease");
 const state=f.registry.getAsset(f.cam.id).interfaceIpv4;
 assert.equal(state[f.eth.id].address,"192.168.1.100");
 assert.equal(state[f.wifi.id].address,"192.168.1.101");
 assert.equal(f.registry.getAsset(box.asset.id).boxConfig.dhcpState.clients.length,2);
});

test("DHCP partagé : 30 Ethernet via switch L2 et 30 Wi-Fi sur la même box",()=>{
 const registry=createAssetRegistry(),box=registry.createBoxComposite("BOX-60");good(box);
 const swp=registry.createProfile("Switch simple 32 ports");good(swp);
 good(registry.addPortGroup(swp.profile.id,{type:"ethernet-rj45",prefix:"P",start:1,count:32}));
 good(registry.setProfileNetworkCapability(swp.profile.id,"ethernet-switching",true));
 const sw=registry.createAsset(swp.profile.id,{name:"SW-01"});good(sw);
 const ethernetProfile=registry.createProfile("Client Ethernet");good(ethernetProfile);
 const wifiProfile=registry.createProfile("Client Wi-Fi");good(wifiProfile);
 good(registry.addPortGroup(ethernetProfile.profile.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}));
 good(registry.addPortGroup(wifiProfile.profile.id,{type:"wifi",prefix:"WIFI",start:1,count:1}));
 function cable(portA,portB){
  const c=registry.createCable();good(c);
  good(registry.connectCableEnd(c.cable.id,0,portA));
  good(registry.connectCableEnd(c.cable.id,1,portB));
 }
 cable(sw.asset.ports[0].id,box.config.ports.lanPortIds[0]);
 const clients=[];
 for(let i=0;i<30;i++){
  const wired=registry.createAsset(ethernetProfile.profile.id,{name:"ETH-"+(i+1)});good(wired);
  const wifi=registry.createAsset(wifiProfile.profile.id,{name:"WIFI-"+(i+1)});good(wifi);
  cable(wired.asset.ports[0].id,sw.asset.ports[i+1].id);
  good(registry.setAssetClientWifi(wifi.asset.id,wifi.asset.ports[0].id,{
   ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
  clients.push({assetId:wired.asset.id,portId:wired.asset.ports[0].id});
  clients.push({assetId:wifi.asset.id,portId:wifi.asset.ports[0].id});
 }
 const initial=clients.map(c=>requestAssetInterfaceDhcp({registry,...c}));
 initial.forEach(good);
 assert.equal(initial.every(r=>r.code==="lease"),true);
 assert.equal(new Set(initial.map(r=>r.address)).size,60);
 assert.equal(registry.getAsset(box.asset.id).boxConfig.dhcpState.clients.length,60);
 for(let i=59;i>=0;i--){
  const response=requestAssetInterfaceDhcp({registry,...clients[i]});good(response);
  assert.equal(response.address,initial[i].address);
 }
 const restored=restoreAssetRegistry(registry.exportState());
 const response=requestAssetInterfaceDhcp({registry:restored,...clients[35]});good(response);
 assert.equal(response.address,initial[35].address);
});

test("NetCam : ouvrir l'administration ne renouvelle pas deux baux déjà obtenus",()=>{
 const f=fixture(),box=f.registry.createBoxComposite("BOX-01");good(box);
 const c=f.registry.createCable();good(c);
 good(f.registry.connectCableEnd(c.cable.id,0,f.eth.id));
 good(f.registry.connectCableEnd(c.cable.id,1,box.config.ports.lanPortIds[0]));
 good(f.registry.setAssetClientWifi(f.cam.id,f.wifi.id,{
  ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
 good(requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.eth.id}));
 good(requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.wifi.id}));
 const previousState=f.registry.exportState();
 const root={innerHTML:"",addEventListener(){},removeEventListener(){},replaceChildren(){}};
 const admin=mountNetCamAdmin({root,registry:f.registry,assetId:f.cam.id});
 assert.deepEqual(f.registry.exportState(),previousState);
 assert.match(root.innerHTML,/192\.168\.1\.100/);
 assert.match(root.innerHTML,/192\.168\.1\.101/);
 admin.destroy();
});

test("DHCP client : bail Wi-Fi orphelin réconcilié avant une demande Ethernet",()=>{
 const f=fixture(),box=f.registry.createBoxComposite("BOX-01");good(box);
 const c=f.registry.createCable();good(c);
 good(f.registry.connectCableEnd(c.cable.id,0,f.eth.id));
 good(f.registry.connectCableEnd(c.cable.id,1,box.config.ports.lanPortIds[0]));
 good(f.registry.setAssetClientWifi(f.cam.id,f.wifi.id,{
  ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
 good(f.registry.setAssetInterfaceIpv4(f.cam.id,f.wifi.id,{
  mode:"dhcp",status:"connected",address:"192.168.1.100",prefix:24,
  gateway:"192.168.1.1",dns:["192.168.1.1"]}));
 const ethernet=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.eth.id});
 good(ethernet);
 const current=f.registry.getAsset(f.cam.id).interfaceIpv4;
 assert.equal(current[f.wifi.id].address,"192.168.1.100");
 assert.equal(current[f.eth.id].address,"192.168.1.101");
 assert.equal(f.registry.getAsset(box.asset.id).boxConfig.dhcpState.clients.length,2);
});


test("DHCP NetCam : bail Wi-Fi valide conservé lorsque serveur box désactivé",()=>{
 const f=fixture(),box=f.registry.createBoxComposite("BOX-01");good(box);
 const c=f.registry.createCable();good(c);
 good(f.registry.connectCableEnd(c.cable.id,0,f.eth.id));
 good(f.registry.connectCableEnd(c.cable.id,1,box.config.ports.lanPortIds[0]));
 good(f.registry.setAssetClientWifi(f.cam.id,f.wifi.id,{
  ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
 const ethernet=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.eth.id});
 good(ethernet);assert.equal(ethernet.code,"lease");
 const wifi=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.wifi.id});
 good(wifi);assert.equal(wifi.code,"lease");
 assert.notEqual(ethernet.address,wifi.address);
 const before=f.registry.getAsset(box.asset.id).boxConfig.dhcpState;
 const persisted=before.clients.find(c=>c.assetId===f.cam.id&&c.portId===f.wifi.id);
 assert.ok(persisted?.lease,"Bail Wi-Fi présent dans BOX-01 avant arrêt");
 assert.equal(persisted.address,wifi.address);
 assert.ok(persisted.lease.expires>before.clock,"Bail Wi-Fi encore valide");
 const prior=f.registry.getAsset(f.cam.id).interfaceIpv4;
 const lan=f.registry.getAsset(box.asset.id).boxConfig.lan;
 good(f.registry.setBoxLanConfig(box.asset.id,{...lan,dhcpEnabled:false}));
 assert.deepEqual(f.registry.getAsset(box.asset.id).boxConfig.dhcpState,before,
  "Arrêter DHCP ne doit pas effacer la table des baux");
 const renewed=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.wifi.id});
 good(renewed);
 assert.equal(renewed.code,"lease-retained");
 assert.equal(renewed.address,wifi.address);
 assert.equal(renewed.prefix,wifi.prefix);
 assert.equal(renewed.gateway,wifi.gateway);
 const after=f.registry.getAsset(f.cam.id).interfaceIpv4;
 assert.equal(after[f.wifi.id].address,prior[f.wifi.id].address);
 assert.equal(after[f.eth.id].address,prior[f.eth.id].address);
 const saved=f.registry.getAsset(box.asset.id).boxConfig.dhcpState.clients.find(
  c=>c.assetId===f.cam.id&&c.portId===f.wifi.id);
 assert.ok(saved?.lease,"Bail valide toujours présent après renouvellement impossible");
 assert.equal(saved.address,wifi.address);
});
test("DHCP NetCam : Wi-Fi sans bail valide passe en APIPA si serveur box désactivé",()=>{
 const f=fixture(),box=f.registry.createBoxComposite("BOX-01");good(box);
 good(f.registry.setAssetClientWifi(f.cam.id,f.wifi.id,{
  ssid:"BOX-WIFI",security:"wpa2-personal",password:"12345678"}));
 const lan=f.registry.getAsset(box.asset.id).boxConfig.lan;
 good(f.registry.setBoxLanConfig(box.asset.id,{...lan,dhcpEnabled:false}));
 const res=requestAssetInterfaceDhcp({registry:f.registry,assetId:f.cam.id,portId:f.wifi.id});
 good(res);assert.equal(res.code,"apipa");
 assert.match(res.address,/^169\\.254\\./);
 assert.equal(res.gateway,null);
});

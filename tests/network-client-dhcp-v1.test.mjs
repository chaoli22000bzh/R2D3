import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,installNetCamProfile,restoreAssetRegistry} from "../src/asset-profiles.js";
import {requestAssetInterfaceDhcp} from "../src/network-client-dhcp-v1.js";
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

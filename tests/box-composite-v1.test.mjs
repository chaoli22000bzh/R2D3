import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";

const good=r=>assert.equal(r.success,true,JSON.stringify(r));
const failed=(r,code)=>{assert.equal(r.success,false,JSON.stringify(r));assert.equal(r.code,code);};
const fixture=()=>{
 const reg=createAssetRegistry();
 const created=reg.createBoxComposite("BOX-01");
 good(created);
 return {reg,asset:created.asset,config:created.config};
};

test("Box composition 01 : profil unique, routeur 2 ports, switch 6 et borne Wi-Fi",()=>{
 const {reg,asset,config}=fixture();
 assert.deepEqual(asset.networkCapabilities,["box-internet"]);
 assert.equal(reg.listAssets().length,1);
 assert.equal(reg.listProfiles().length,1);
 assert.equal(asset.ports.length,10);
 assert.equal(config.components.switch.lanPortIds.length,6);
 assert.equal(config.components.router.wanPortId,config.ports.wanPortId);
 assert.equal(config.components.wifi.radioPortId,asset.ports.find(p=>p.type==="wifi").id);
 assert.deepEqual(config.ports.lanPortIds,config.components.switch.lanPortIds.slice(0,4));
 assert.deepEqual(config.internalPortIds,[
  ...config.components.switch.lanPortIds.slice(4),
  config.components.router.lanPortId,config.components.wifi.ethernetPortId
 ]);
});
test("Box composition 02 : câblage interne fixe sur ports LAN 5 et LAN 6",()=>{
 const {reg,config}=fixture();
 const internal=reg.exportState().cables;
 assert.equal(internal.length,2);
 assert.deepEqual(internal.map(c=>c.ends.map(e=>e.portId)),[
  [config.components.switch.lanPortIds[4],config.components.wifi.ethernetPortId],
  [config.components.switch.lanPortIds[5],config.components.router.lanPortId]
 ]);
 assert.equal(reg.explorePhysicalPath(config.components.router.lanPortId,config.components.switch.lanPortIds[5]).connected,true);
 assert.equal(reg.explorePhysicalPath(config.components.wifi.ethernetPortId,config.components.switch.lanPortIds[4]).connected,true);
 assert.equal(reg.explorePhysicalPath(config.components.router.lanPortId,config.components.wifi.ethernetPortId).connected,false);
});
test("Box composition 03 : seuls LAN 1 à 4 sont accessibles au brassage",()=>{
 const {reg,config}=fixture();
 assert.deepEqual(reg.listCablePoints().map(x=>x.portName),["LAN1","LAN2","LAN3","LAN4"]);
 assert.equal(reg.listCables().length,0);
 assert.equal(reg.getCable(config.internalCableIds[0]),null);
 const cable=reg.createCable().cable;
 failed(reg.connectCableEnd(cable.id,0,config.internalPortIds[0]),"internal_connection");
 good(reg.connectCableEnd(cable.id,0,config.ports.lanPortIds[0]));
 assert.equal(reg.listCables().length,1);
 failed(reg.disconnectCableEnd(config.internalCableIds[0],0),"internal_connection");
 failed(reg.deleteCable(config.internalCableIds[1]),"internal_connection");
 failed(reg.updateCableConnectors(config.internalCableIds[0],["rj45-male","rj45-male"]),"internal_connection");
});
test("Box composition 04 : nouveau profil réutilisé et configurations indépendantes",()=>{
 const {reg,asset,config}=fixture();
 const second=reg.createAsset(asset.profileId,{name:"BOX-02"});
 good(second);
 assert.equal(reg.listProfiles().length,1);
 assert.equal(reg.listAssets().length,2);
 assert.equal(second.asset.profileId,asset.profileId);
 assert.notEqual(second.config.ports.wanPortId,config.ports.wanPortId);
 assert.notEqual(second.config.internalCableIds[0],config.internalCableIds[0]);
});
test("Box composition 05 : sauvegarde/restauration conserve identité et liens",()=>{
 const {reg,config}=fixture();
 const saved=reg.exportState();
 const restored=restoreAssetRegistry(saved);
 assert.deepEqual(restored.exportState(),saved);
 assert.equal(Object.hasOwn(saved.assets[0],"processors"),false);
 assert.equal(Object.hasOwn(saved.assets[0],"ramModules"),false);
 assert.equal(Object.hasOwn(saved.assets[0],"disks"),false);
 assert.equal(Object.hasOwn(saved.profiles[0],"processorInventory"),false);
 assert.equal(restored.listCables().length,0);
 assert.equal(restored.explorePhysicalPath(config.components.switch.lanPortIds[4],config.components.wifi.ethernetPortId).connected,true);
});
test("Box composition 06 : déplacement sans câble externe, suppression protégée",()=>{
 const {reg,asset,config}=fixture();
 const place=reg.createPlace({name:"Bâtiment A"});good(place);
 good(reg.moveAssetToPlace(asset.id,place.place.id));
 const cable=reg.createCable().cable;
 good(reg.connectCableEnd(cable.id,0,config.ports.lanPortIds[0]));
 failed(reg.moveAssetToPlace(asset.id,null),"asset_connected");
 failed(reg.removeAsset(asset.id),"asset_connected");
 good(reg.disconnectCableEnd(cable.id,0));
 good(reg.removeAsset(asset.id));
 assert.equal(reg.exportState().cables.filter(c=>c.internalBoxId).length,0);
 assert.equal(reg.getAsset(asset.id),null);
});
test("Box composition 07 : anciens profils et routeurs inchangés",()=>{
 const reg=createAssetRegistry();
 const p=reg.createProfile("Routeur").profile;
 good(reg.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:2}));
 good(reg.setProfileNetworkCapability(p.id,"ipv4-router",true));
 failed(reg.setProfileNetworkCapability(p.id,"ethernet-switching",true),"router_dependency");
 const created=reg.createAsset(p.id,{name:"RTR01"});good(created);
 assert.equal(created.asset.routerConfig.interfaces[created.asset.ports[0].id].role,"wan");
});

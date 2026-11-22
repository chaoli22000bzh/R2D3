import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint} from "../src/wifi-ap-v1.js";

const setup=()=>{
 const registry=createAssetRegistry();
 const result=createWifiAccessPoint(registry,{name:"AP01"});
 assert.equal(result.success,true);
 return {registry,id:result.asset.id};
};

test("Wi-Fi : IPv4 de gestion disponible sans capacités switch ni serveur DHCP",()=>{
 const {registry,id}=setup(),asset=registry.getAsset(id);
 assert.deepEqual(asset.networkCapabilities,["wifi-ap"]);
 assert.equal(asset.managementConfig.mode,"dhcp");
 assert.equal(asset.managementConfig.address,null);
 assert.equal(asset.dhcpServerConfig,undefined);
});

test("Wi-Fi : IPv4 statique, masque, passerelle et deux DNS persistés",()=>{
 const {registry,id}=setup();
 const conf={assetId:id,mode:"static",address:"192.168.10.12",prefix:24,
  gateway:"192.168.10.1",dns:["1.1.1.1","8.8.8.8"],lease:null};
 assert.equal(registry.setAssetManagementConfig(id,conf).success,true);
 assert.deepEqual(registry.getAsset(id).managementConfig,conf);
 const saved=restoreAssetRegistry(registry.exportState());
 assert.deepEqual(saved.getAsset(id).managementConfig,conf);
 assert.equal(saved.getAsset(id).wifiConfig.ssids[0].name,"WIFI-01");
});

test("Wi-Fi : refus d'une IPv4 ou d'une passerelle invalide sans altérer l'état",()=>{
 const {registry,id}=setup();
 const conf={assetId:id,mode:"static",address:"192.168.10.12",prefix:24,
  gateway:"192.168.10.1",dns:["1.1.1.1","8.8.8.8"],lease:null};
 assert.equal(registry.setAssetManagementConfig(id,conf).success,true);
 for(const bad of [{...conf,address:"999.168.10.12"},
   {...conf,prefix:33},{...conf,gateway:"10.0.0.1"},
   {...conf,dns:["1.1.1.1","8.8.8.8","9.9.9.9"]}]){
   assert.equal(registry.setAssetManagementConfig(id,bad).success,false);
   assert.deepEqual(registry.getAsset(id).managementConfig,conf);
 }
});

test("Wi-Fi : passage au mode DHCP sans modifier les SSID",()=>{
 const {registry,id}=setup();
 const staticConf={assetId:id,mode:"static",address:"192.168.10.12",prefix:24,
  gateway:"192.168.10.1",dns:["1.1.1.1"],lease:null};
 assert.equal(registry.setAssetManagementConfig(id,staticConf).success,true);
 const before=registry.getAsset(id).wifiConfig;
 const dhcp={assetId:id,mode:"dhcp",address:null,prefix:null,gateway:null,dns:[],lease:null};
 assert.equal(registry.setAssetManagementConfig(id,dhcp).success,true);
 assert.deepEqual(registry.getAsset(id).managementConfig,dhcp);
 assert.deepEqual(registry.getAsset(id).wifiConfig,before);
});

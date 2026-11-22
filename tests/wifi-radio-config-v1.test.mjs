import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,getWifiConfig,configureWifiAp,scanWifiNetworks,associateWifiClient} from "../src/wifi-ap-v1.js";
const setup=()=>{
 const registry=createAssetRegistry();
 const ap=createWifiAccessPoint(registry,{name:"AP-CIEL"});
 assert.equal(ap.success,true);
 return {registry,apId:ap.asset.id};
};
test("Wi-Fi radios : configuration initiale et sauvegarde multibande",()=>{
 const {registry,apId}=setup();
 const initial=getWifiConfig(registry,apId);
 assert.equal(initial.radios["2.4"].enabled,true);
 assert.equal(initial.radios["5"].enabled,true);
 assert.equal(initial.radios["6"].enabled,false);
 const radios={...initial.radios,"2.4":{enabled:true,channel:6,width:20},"5":{enabled:true,channel:44,width:80},"6":{enabled:true,channel:21,width:160}};
 assert.equal(configureWifiAp(registry,apId,{radios}).success,true);
 const stored=getWifiConfig(registry,apId);
 assert.deepEqual(stored.radios,radios);
 const restored=restoreAssetRegistry(registry.exportState());
 assert.deepEqual(getWifiConfig(restored,apId).radios,radios);
});
test("Wi-Fi radios : canal invalide refusé sans altérer la configuration",()=>{
 const {registry,apId}=setup();
 const before=getWifiConfig(registry,apId);
 const radios={...before.radios,"2.4":{enabled:true,channel:999,width:20}};
 const rejected=configureWifiAp(registry,apId,{radios});
 assert.equal(rejected.success,false);
 assert.deepEqual(getWifiConfig(registry,apId),before);
});
test("Wi-Fi radios : désactivation d'une bande interdit scan et association sur cette bande",()=>{
 const {registry,apId}=setup();
 const initial=getWifiConfig(registry,apId);
 const ssids=[{...initial.ssids[0],security:"wpa3-personal",password:"Ciel2026!",bands:["2.4","5","6"]}];
 assert.equal(configureWifiAp(registry,apId,{ssids}).success,true);
 assert.equal(scanWifiNetworks(registry,{bands:["6"],security:["wpa3-personal"]}).length,0);
 let result=associateWifiClient(registry,{apId,ssidId:initial.ssids[0].id,password:"Ciel2026!",bands:["6"],security:["wpa3-personal"]});
 assert.equal(result.success,false);
 const radios={...initial.radios,"6":{enabled:true,channel:"auto",width:20}};
 assert.equal(configureWifiAp(registry,apId,{radios}).success,true);
 assert.equal(scanWifiNetworks(registry,{bands:["6"],security:["wpa3-personal"]}).length,1);
 result=associateWifiClient(registry,{apId,ssidId:initial.ssids[0].id,password:"Ciel2026!",bands:["6"],security:["wpa3-personal"]});
 assert.equal(result.success,true);
});

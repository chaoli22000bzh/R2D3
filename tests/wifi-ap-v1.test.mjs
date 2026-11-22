import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,getWifiConfig,configureWifiAp,scanWifiNetworks,associateWifiClient} from "../src/wifi-ap-v1.js";
const setup=()=>{const reg=createAssetRegistry(),r=createWifiAccessPoint(reg,{name:"AP-CIEL"});assert.equal(r.success,true);return {reg,ap:r.asset};};
test("Borne Wi-Fi : capacité, ports radio et Ethernet, état initial",()=>{
 const {reg,ap}=setup();assert.equal(ap.ports.filter(p=>p.type==="wifi").length,1);
 assert.equal(ap.ports.filter(p=>p.type==="ethernet-rj45").length,1);
 assert.ok(ap.networkCapabilities.includes("wifi-ap"));assert.equal(getWifiConfig(reg,ap.id).ssids[0].name,"WIFI-01");
});
test("Wi-Fi : SSID WPA2 et association acceptée ou refusée",()=>{
 const {reg,ap}=setup(),c=getWifiConfig(reg,ap.id);
 c.ssids[0]={...c.ssids[0],name:"LYCEE-CIEL",security:"wpa2-personal",password:"MotDePasse2026",bands:["2.4","5"]};
 assert.equal(reg.setAssetWifiConfig(ap.id,c).success,true);
 assert.equal(scanWifiNetworks(reg).find(x=>x.ssid==="LYCEE-CIEL").apId,ap.id);
 assert.equal(associateWifiClient(reg,{apId:ap.id,ssidId:"ssid-1",password:"incorrect"}).code,"authentication_failed");
 assert.equal(associateWifiClient(reg,{apId:ap.id,ssidId:"ssid-1",password:"MotDePasse2026"}).success,true);
});
test("Wi-Fi : bande incompatible, sécurité incompatible, désactivation",()=>{
 const {reg,ap}=setup(),c=getWifiConfig(reg,ap.id);
 c.ssids[0]={...c.ssids[0],security:"wpa3-personal",password:"Secret2026!",bands:["6"]};
 assert.equal(configureWifiAp(reg,ap.id,{ssids:c.ssids}).success,true);
 assert.equal(associateWifiClient(reg,{apId:ap.id,ssidId:"ssid-1",password:"Secret2026!"}).code,"band_incompatible");
 const radios={...getWifiConfig(reg,ap.id).radios,"6":{enabled:true,channel:"auto"}};
 assert.equal(configureWifiAp(reg,ap.id,{radios}).success,true);
 assert.equal(associateWifiClient(reg,{apId:ap.id,ssidId:"ssid-1",password:"Secret2026!",bands:["6"],security:["wpa2-personal"]}).code,"security_incompatible");
 assert.equal(associateWifiClient(reg,{apId:ap.id,ssidId:"ssid-1",password:"Secret2026!",bands:["6"],security:["wpa3-personal"]}).success,true);
 assert.equal(configureWifiAp(reg,ap.id,{enabled:false}).success,true);
 assert.equal(scanWifiNetworks(reg).length,0);
 assert.equal(associateWifiClient(reg,{apId:ap.id,ssidId:"ssid-1"}).code,"ap_disabled");
});
test("Wi-Fi : validations atomiques et sauvegarde/restauration du registre",()=>{
 const {reg,ap}=setup(),c=getWifiConfig(reg,ap.id);
 assert.equal(configureWifiAp(reg,ap.id,{ssids:[{...c.ssids[0],name:""}]}).success,false);
 assert.deepEqual(getWifiConfig(reg,ap.id),c);
 assert.equal(configureWifiAp(reg,ap.id,{ssids:[{...c.ssids[0],security:"wpa2-personal",password:"Secret2026!"}]}).success,true);
 const restored=restoreAssetRegistry(reg.exportState());
 assert.deepEqual(restored.getAsset(ap.id).wifiConfig,getWifiConfig(reg,ap.id));
});

import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,getWifiConfig,configureWifiAp,scanWifiNetworks,associateWifiClient} from "../src/wifi-ap-v1.js";
import {negotiateWifiSecurity} from "../src/wifi-security-v1.js";
function setup(){
 const registry=createAssetRegistry(),ap=createWifiAccessPoint(registry,{name:"AP-CIEL"}).asset;
 const configure=(mode,password="Motdepasse2026",bands=["2.4","5"])=>
  configureWifiAp(registry,ap.id,{ssids:[{...getWifiConfig(registry,ap.id).ssids[0],
   id:"ssid-1",name:"LYCEE-CIEL",security:mode,password:mode==="open"?"":password,bands}]});
 const connect=(security,password="",bands=["2.4","5"])=>associateWifiClient(registry,
  {apId:ap.id,ssidId:"ssid-1",security,bands,password});
 return {registry,ap,configure,connect};
}
test("Réseau ouvert : aucune clé exigée, client ouvert uniquement",()=>{
 const f=setup();assert.equal(f.configure("open").success,true);
 assert.equal(f.connect(["open"]).success,true);
 assert.equal(f.connect(["wpa2-personal"]).code,"security_incompatible");
 assert.equal(f.connect(["open"],"clé quelconque").success,true);
});
test("WPA2-Personal : client et mot de passe corrects obligatoires",()=>{
 const f=setup();assert.equal(f.configure("wpa2-personal").success,true);
 assert.equal(f.connect(["wpa2-personal"],"Motdepasse2026").negotiatedSecurity,"wpa2-personal");
 assert.equal(f.connect(["wpa2-personal"],"Erreur").code,"authentication_failed");
 assert.equal(f.connect(["wpa3-personal"],"Motdepasse2026").code,"security_incompatible");
});
test("WPA3-Personal : client ancien refusé, client compatible accepté",()=>{
 const f=setup();assert.equal(f.configure("wpa3-personal").success,true);
 assert.equal(f.connect(["wpa2-personal"],"Motdepasse2026").code,"security_incompatible");
 assert.equal(f.connect(["wpa3-personal"],"Motdepasse2026").negotiatedSecurity,"wpa3-personal");
});
test("Mode mixte : WPA2 ancien et WPA3 récent avec même clé, WPA3 privilégié",()=>{
 const f=setup();assert.equal(f.configure("wpa2-wpa3-personal").success,true);
 assert.equal(f.connect(["wpa2-personal"],"Motdepasse2026").negotiatedSecurity,"wpa2-personal");
 assert.equal(f.connect(["wpa3-personal"],"Motdepasse2026").negotiatedSecurity,"wpa3-personal");
 assert.equal(f.connect(["wpa2-personal","wpa3-personal"],"Motdepasse2026").negotiatedSecurity,"wpa3-personal");
 assert.equal(f.connect(["wpa2-personal"],"MauvaiseCle").code,"authentication_failed");
});
test("Scan : SSID mixte annoncé aux clients WPA2 et WPA3",()=>{
 const f=setup();f.configure("wpa2-wpa3-personal");
 assert.equal(scanWifiNetworks(f.registry,{security:["wpa2-personal"]}).length,1);
 assert.equal(scanWifiNetworks(f.registry,{security:["wpa3-personal"]}).length,1);
 assert.equal(scanWifiNetworks(f.registry,{security:["open"]}).length,0);
});
test("6 GHz : WPA2 interdit par négociation, WPA3 accepté",()=>{
 assert.equal(negotiateWifiSecurity("wpa2-wpa3-personal",["wpa2-personal"],"6").success,false);
 assert.equal(negotiateWifiSecurity("wpa2-wpa3-personal",["wpa3-personal"],"6").negotiatedSecurity,"wpa3-personal");
 const f=setup();assert.equal(f.configure("wpa3-personal","Motdepasse2026",["6"]).success,true);
 assert.equal(f.connect(["wpa3-personal"],"Motdepasse2026",["6"]).success,true);
 assert.equal(f.connect(["wpa2-personal"],"Motdepasse2026",["6"]).code,"security_incompatible");
});
test("Configuration : mauvaise configuration refusée, restauration de la sécurité",()=>{
 const f=setup();f.configure("wpa2-personal");
 const before=f.registry.exportState();
 assert.equal(f.configure("wpa3-personal","court").success,false);
 assert.deepEqual(f.registry.exportState(),before);
 const restored=restoreAssetRegistry(before);
 assert.equal(associateWifiClient(restored,{apId:f.ap.id,ssidId:"ssid-1",
  security:["wpa2-personal"],password:"Motdepasse2026"}).success,true);
});

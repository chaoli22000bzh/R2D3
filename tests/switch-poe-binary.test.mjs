import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function profile(registry,name,capabilities=["ethernet-switching"]){
 const p=registry.createProfile(name).profile;
 good(registry.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}));
 for(const c of capabilities)good(registry.setProfileNetworkCapability(p.id,c,true));
 return p;
}
test("PoE 01 : option non par défaut sur switch non administrable, L2 et L3",()=>{
 const r=createAssetRegistry();
 const a=profile(r,"Simple");
 const b=profile(r,"L2",["ethernet-switching","vlan"]);
 const c=profile(r,"L3",["ethernet-switching","vlan","inter-vlan-routing"]);
 for(const p of [a,b,c]){
  assert.equal(r.getProfile(p.id).poe,false);
  assert.equal(r.createAsset(p.id,{name:p.name}).asset.poe,false);
 }
});
test("PoE 02 : propriété oui commune à un switch non administrable",()=>{
 const r=createAssetRegistry(),p=profile(r,"Simple");
 good(r.setProfilePoe(p.id,true));
 const sw=r.createAsset(p.id,{name:"SW01"}).asset;
 assert.equal(sw.poe,true);
 assert.equal(sw.ports.length,4);
 assert.equal(Object.keys(sw).includes("poePorts"),false);
});
test("PoE 03 : PoE disponible indépendamment sur L2 et L3",()=>{
 const r=createAssetRegistry();
 const a=profile(r,"L2",["ethernet-switching","vlan"]);
 const b=profile(r,"L3",["ethernet-switching","vlan","inter-vlan-routing"]);
 good(r.setProfilePoe(a.id,true));
 good(r.setProfilePoe(b.id,true));
 assert.equal(r.createAsset(a.id,{name:"SW02"}).asset.poe,true);
 assert.equal(r.createAsset(b.id,{name:"SW03"}).asset.poe,true);
});
test("PoE 04 : modification du modèle seulement pour les futurs équipements",()=>{
 const r=createAssetRegistry(),p=profile(r,"Switch");
 const old=r.createAsset(p.id,{name:"SW01"}).asset;
 good(r.setProfilePoe(p.id,true));
 const newer=r.createAsset(p.id,{name:"SW02"}).asset;
 assert.equal(r.getAsset(old.id).poe,false);
 assert.equal(r.getAsset(newer.id).poe,true);
 good(r.setProfilePoe(p.id,false));
 assert.equal(r.getAsset(newer.id).poe,true);
});
test("PoE 05 : profils dupliqués, export/restauration et anciens registres",()=>{
 const r=createAssetRegistry(),p=profile(r,"Switch");
 good(r.setProfilePoe(p.id,true));
 const duplicate=r.duplicateProfile(p.id,"Switch copie").profile;
 assert.equal(duplicate.poe,true);
 const sw=r.createAsset(duplicate.id,{name:"SW02"}).asset;
 const state=r.exportState();
 assert.deepEqual(restoreAssetRegistry(state).exportState(),state);
 const legacy=JSON.parse(JSON.stringify(state));
 for(const p of legacy.profiles)delete p.poe;
 for(const a of legacy.assets)delete a.poe;
 const recovered=restoreAssetRegistry(legacy);
 assert.equal(recovered.getAsset(sw.id).poe,false);
 assert.equal(recovered.getProfile(duplicate.id).poe,false);
});
test("PoE 06 : matériel non switch, types invalides et dépendances refusés",()=>{
 const r=createAssetRegistry(),p=r.createProfile("PC").profile;
 assert.equal(r.setProfilePoe(p.id,true).success,false);
 assert.equal(r.setProfilePoe(p.id,"oui").success,false);
 const sw=profile(r,"SW");
 good(r.setProfilePoe(sw.id,true));
 assert.equal(r.setProfileNetworkCapability(sw.id,"ethernet-switching",false).success,false);
 const a=r.createAsset(sw.id,{name:"SW01"}).asset;
 const saved=r.exportState();
 assert.equal(r.updateAsset(a.id,{poe:false}).success,true);
 assert.equal(r.getAsset(a.id).poe,true);
 assert.equal(r.getProfile(sw.id).poe,true);
 assert.equal(saved.profiles.find(p=>p.id===sw.id).poe,true);
});

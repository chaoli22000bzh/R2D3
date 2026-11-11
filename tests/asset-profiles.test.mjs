import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
test("Créer, dupliquer et étendre un profil existant",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Caméra réseau").profile,a=e.createAsset(p.id,{name:"CAM-01"}).asset;
 assert.equal(e.addField(p.id,{key:"resolution",label:"Résolution",type:"text"}).success,true);
 assert.equal(e.getAsset(a.id).values.resolution,null);
 e.setAssetField(a.id,"resolution","1920 × 1080");
 assert.equal(e.duplicateProfile(p.id,"Caméra PTZ").profile.fields[0].key,"resolution");
});
test("Un champ rempli ne peut pas être détruit ni changer de type",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Switch").profile;
 e.addField(p.id,{key:"ports",label:"Nombre de ports",type:"number"});
 const a=e.createAsset(p.id,{name:"SW01"}).asset;
 e.setAssetField(a.id,"ports",0);
 assert.equal(e.removeField(p.id,"ports").code,"field_in_use");
 assert.equal(e.editField(p.id,"ports",{type:"text"}).code,"field_in_use");
 e.setAssetField(a.id,"ports",null);
 assert.equal(e.editField(p.id,"ports",{type:"text"}).success,true);
 assert.equal(e.removeField(p.id,"ports").success,true);
});
test("Valeurs typées et reprise inchangée",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Netcam").profile;
 e.addField(p.id,{key:"poe",label:"PoE",type:"boolean"});
 e.addField(p.id,{key:"orientation",label:"Orientation",type:"select",options:["Fixe","PTZ"]});
 const a=e.createAsset(p.id,{name:"CAM01"}).asset;
 assert.equal(e.setAssetField(a.id,"poe","oui").success,false);
 assert.equal(e.setAssetField(a.id,"poe",false).success,true);
 assert.equal(e.setAssetField(a.id,"orientation","inconnu").success,false);
 e.setAssetField(a.id,"orientation","PTZ");
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
});
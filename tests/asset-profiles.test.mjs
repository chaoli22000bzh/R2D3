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
test("Édition du profil et des valeurs communes de fiche",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Caméra réseau").profile;
 assert.equal(e.renameProfile(p.id,"Caméra IP").success,true);
 e.addField(p.id,{key:"resolution",label:"Résolution",type:"text"});
 const a=e.createAsset(p.id,{name:"CAM-01"}).asset;
 assert.equal(e.editField(p.id,"resolution",{label:"Définition",unit:"pixels"}).success,true);
 assert.equal(e.setAssetField(a.id,"resolution","1920 x 1080").success,true);
 assert.equal(e.editField(p.id,"resolution",{type:"number"}).code,"field_in_use");
 assert.equal(e.updateAsset(a.id,{manufacturer:"Netcam",model:"NC-200",serialNumber:"SER-01",status:"En stock",location:"Bureau",reservable:true}).success,true);
 assert.deepEqual({manufacturer:e.getAsset(a.id).manufacturer,model:e.getAsset(a.id).model,serialNumber:e.getAsset(a.id).serialNumber,status:e.getAsset(a.id).status,location:e.getAsset(a.id).location,reservable:e.getAsset(a.id).reservable},{manufacturer:"Netcam",model:"NC-200",serialNumber:"SER-01",status:"En stock",location:"Bureau",reservable:true});
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
});
test("Édition d'une liste sans effacer les valeurs existantes",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Camera").profile;
 e.addField(p.id,{key:"type_camera",label:"Type",type:"select",options:["Fixe","PTZ"]});
 const a=e.createAsset(p.id,{name:"CAM-01"}).asset;e.setAssetField(a.id,"type_camera","PTZ");
 assert.equal(e.editField(p.id,"type_camera",{options:["Fixe","Dôme"]}).code,"field_in_use");
 assert.equal(e.getAsset(a.id).values.type_camera,"PTZ");
 assert.equal(e.editField(p.id,"type_camera",{options:["Fixe","PTZ","Dôme"]}).success,true);
 assert.equal(e.getAsset(a.id).values.type_camera,"PTZ");
 assert.equal(e.updateAsset(a.id,{status:"En réparation"}).success,false);
});

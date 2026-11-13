import test from "node:test";
import assert from "node:assert/strict";
import {inspectAssetRaid} from "../src/raid-r2d3-adapter.js";
const configuration={format:"raid-configuration",schemaVersion:1,level:"10",
  disks:[1,2,3,4].map(i=>({id:"d"+i,capacityTB:2,role:"active"}))};
test("adaptateur facultatif R2D3 sans moteur",()=>{
 const r=inspectAssetRaid("nas-01",configuration,["d1","d3"]);
 assert.equal(r.ok,true);
 assert.equal(r.value.assetId,"nas-01");
 assert.equal(r.value.calculated.capacitiesTB.usable,4);
 assert.equal(r.value.failures.available,true);
 assert.deepEqual(r.value.configuration,configuration);
});
test("erreur structurée sans mutation",()=>{
 const before=JSON.stringify(configuration);
 const r=inspectAssetRaid("nas-01",configuration,["absent"]);
 assert.equal(r.ok,false);
 assert.equal(r.errors[0].code,"INVALID_FAILURES");
 assert.equal(JSON.stringify(configuration),before);
});
test("identifiant R2D3 obligatoire",()=>{
 assert.equal(inspectAssetRaid("",configuration).errors[0].code,"INVALID_ASSET_ID");
});

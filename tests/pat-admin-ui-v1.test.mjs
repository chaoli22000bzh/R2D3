import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter} from "../src/router-interfaces-v1.js";
import {renderPatAdmin,submitPatAdmin,actionPatAdmin} from "../src/pat-admin-ui-v1.js";
const ok=r=>assert.equal(r.success,true,JSON.stringify(r));
const bad=r=>assert.equal(r.success,false,JSON.stringify(r));
function setup(kind){
 const registry=createAssetRegistry();
 const asset=kind==="box"?registry.createBoxComposite("BOX-01").asset:createRouter(registry,{name:"RTR-01"}).asset;
 const wan=kind==="box"?registry.getAsset(asset.id).boxConfig.ports.wanPortId:asset.ports[0].id;
 const form=(values={})=>{
  const src={wanPortId:wan,protocol:"tcp",externalPort:"8080",internalAddress:kind==="box"?"192.168.1.110":"192.168.10.110",internalPort:"80",enabled:true,...values};
  return {elements:{namedItem:key=>({value:String(src[key]),checked:src[key]===true})}};
 };
 return {registry,asset,form,kind};
}
for(const kind of ["box","router"]){
 test("PAT UI "+kind+" : ajout, modification, activation et suppression",()=>{
  const f=setup(kind);
  assert.match(renderPatAdmin({registry:f.registry,assetId:f.asset.id,kind}),/data-form="pat-rule"/);
  const added=submitPatAdmin({registry:f.registry,assetId:f.asset.id,kind,form:f.form()});ok(added);
  const state=kind==="box"?f.registry.getAsset(f.asset.id).boxConfig.patRules:f.registry.getAsset(f.asset.id).routerConfig.patRules;
  const id=state[0].id;
  assert.match(renderPatAdmin({registry:f.registry,assetId:f.asset.id,kind}),/Modifier/);
  const edited=submitPatAdmin({registry:f.registry,assetId:f.asset.id,kind,editingRuleId:id,form:f.form({externalPort:"8443",internalPort:"443"})});ok(edited);
  let rules=kind==="box"?f.registry.getAsset(f.asset.id).boxConfig.patRules:f.registry.getAsset(f.asset.id).routerConfig.patRules;
  assert.equal(rules[0].id,id);
  assert.equal(rules[0].externalPort,8443);
  ok(actionPatAdmin({registry:f.registry,assetId:f.asset.id,kind,action:"toggle",ruleId:id}));
  rules=kind==="box"?f.registry.getAsset(f.asset.id).boxConfig.patRules:f.registry.getAsset(f.asset.id).routerConfig.patRules;
  assert.equal(rules[0].enabled,false);
  const restored=restoreAssetRegistry(f.registry.exportState());
  assert.deepEqual(kind==="box"?restored.getAsset(f.asset.id).boxConfig.patRules:restored.getAsset(f.asset.id).routerConfig.patRules,rules);
  ok(actionPatAdmin({registry:f.registry,assetId:f.asset.id,kind,action:"remove",ruleId:id}));
  assert.match(renderPatAdmin({registry:f.registry,assetId:f.asset.id,kind}),/Aucune règle PAT entrante/);
 });
 test("PAT UI "+kind+" : conflit et ports hors limites refusés",()=>{
  const f=setup(kind);
  ok(submitPatAdmin({registry:f.registry,assetId:f.asset.id,kind,form:f.form()}));
  const saved=f.registry.exportState();
  bad(submitPatAdmin({registry:f.registry,assetId:f.asset.id,kind,form:f.form()}));
  bad(submitPatAdmin({registry:f.registry,assetId:f.asset.id,kind,form:f.form({externalPort:"65536"})}));
  bad(submitPatAdmin({registry:f.registry,assetId:f.asset.id,kind,form:f.form({internalPort:"0"})}));
  assert.deepEqual(f.registry.exportState(),saved);
 });
}

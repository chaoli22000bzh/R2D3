import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
const bad=(r,code)=>{assert.equal(r.success,false);assert.equal(r.code,code);};
const fixture=()=>{const registry=createAssetRegistry(),created=registry.createBoxComposite("BOX-01");good(created);return {registry,id:created.asset.id};};
const staticWan={mode:"static",address:"203.0.113.10",prefix:24,gateway:"203.0.113.1",dns:["1.1.1.1","8.8.8.8"]};
test("Box WAN 01 : DHCP initial, aucun bail WAN inventé",()=>{
 const {registry,id}=fixture();
 assert.deepEqual(registry.getAsset(id).boxConfig.wan,{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]});
});
test("Box WAN 02 : adresse statique WAN validée et exportée",()=>{
 const {registry,id}=fixture();
 good(registry.setBoxWanConfig(id,staticWan));
 assert.deepEqual(restoreAssetRegistry(registry.exportState()).getAsset(id).boxConfig.wan,staticWan);
});
test("Box WAN 03 : conflit WAN/LAN ou passerelle externe au sous-réseau refusé",()=>{
 const {registry,id}=fixture();
 bad(registry.setBoxWanConfig(id,{...staticWan,address:"192.168.1.42",gateway:"192.168.1.1"}),"invalid_box_wan");
 bad(registry.setBoxWanConfig(id,{...staticWan,address:"192.168.2.42",prefix:16,gateway:"192.168.2.1"}),"invalid_box_wan");
 bad(registry.setBoxWanConfig(id,{...staticWan,gateway:"198.51.100.1"}),"invalid_box_wan");
 assert.equal(registry.getAsset(id).boxConfig.wan.mode,"dhcp");
});
test("Box WAN 04 : passage DHCP supprime l'adressage statique",()=>{
 const {registry,id}=fixture();
 good(registry.setBoxWanConfig(id,staticWan));
 good(registry.setBoxWanConfig(id,{mode:"dhcp",address:"",prefix:null,gateway:"",dns:[]}));
 assert.equal(registry.getAsset(id).boxConfig.wan.address,"");
 bad(registry.setBoxWanConfig(id,{mode:"dhcp",address:"203.0.113.10",prefix:24,gateway:"",dns:[]}),"invalid_box_wan");
});
test("Box WAN 05 : deux box ne partagent ni leurs WAN ni leurs LAN",()=>{
 const f=fixture();const other=f.registry.createBoxComposite("BOX-02");good(other);
 good(f.registry.setBoxWanConfig(f.id,staticWan));
 assert.equal(f.registry.getAsset(other.asset.id).boxConfig.wan.mode,"dhcp");
 assert.equal(f.registry.listAssets().length,2);
});

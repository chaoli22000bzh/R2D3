import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {observeStpV01} from "../src/stp-v01.js";

function fixture(managed=false){
 const r=createAssetRegistry();
 const pcProfile=r.createProfile("Poste").profile;
 r.addPortGroup(pcProfile.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const swProfile=r.createProfile("Switch").profile;
 r.addPortGroup(swProfile.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5});
 assert.ok(r.setProfileNetworkCapability(swProfile.id,"ethernet-switching",true).success);
 if(managed)assert.ok(r.setProfileNetworkCapability(swProfile.id,"vlan",true).success);
 const pc1=r.createAsset(pcProfile.id,{name:"PC1"}).asset;
 const pc2=r.createAsset(pcProfile.id,{name:"PC2"}).asset;
 const sw1=r.createAsset(swProfile.id,{name:"SW01"}).asset;
 const sw2=r.createAsset(swProfile.id,{name:"SW02"}).asset;
 const addresses={
  [pc1.id]:{address:"192.168.10.11",prefix:24},
  [pc2.id]:{address:"192.168.10.12",prefix:24}
 };
 function wire(a,b){
  const c=r.createCable().cable;
  assert.ok(r.connectCableEnd(c.id,0,a).success);
  assert.ok(r.connectCableEnd(c.id,1,b).success);
  return c;
 }
 const observe=()=>observeStpV01(r,pc1.id,pc2.id,addresses);
 return {r,pc1,pc2,sw1,sw2,wire,observe,addresses};
}
function oneSwitch(f){
 f.wire(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.wire(f.pc2.ports[0].id,f.sw1.ports[1].id);
}
function twoSwitches(f){
 f.wire(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.wire(f.pc2.ports[0].id,f.sw2.ports[0].id);
 return f.wire(f.sw1.ports[1].id,f.sw2.ports[1].id);
}
test("STP V0.1-01 : réseau initial sans boucle",()=>{
 const f=fixture();oneSwitch(f);
 const o=f.observe();assert.equal(o.success,true,JSON.stringify(o));
 assert.equal(o.loop,false);assert.equal(o.storm,false);
});
test("STP V0.1-02 : boucle sur switch non administrable, tempête et correction",()=>{
 const f=fixture();oneSwitch(f);
 const extra=f.wire(f.sw1.ports[2].id,f.sw1.ports[3].id);
 const before=f.observe();assert.equal(before.success,false);assert.equal(before.storm,true);
 assert.equal(before.loop,true);assert.deepEqual(before.loopCableIds,[extra.id]);
 assert.ok(f.r.disconnectCableEnd(extra.id,1).success);
 const after=f.observe();assert.equal(after.success,true,JSON.stringify(after));
 assert.equal(after.loop,false);
});
test("STP V0.1-03 : boucle locale sur switch administrable, STP bloque logiquement un port",()=>{
 const f=fixture(true);oneSwitch(f);
 const extra=f.wire(f.sw1.ports[2].id,f.sw1.ports[3].id);
 const before=f.r.exportState();
 const o=f.observe();assert.equal(o.success,true,JSON.stringify(o));
 assert.equal(o.loop,true);assert.equal(o.stpActive,true);
 assert.deepEqual(o.blockedCableIds,[extra.id]);assert.equal(o.storm,false);
 assert.deepEqual(f.r.exportState(),before,"le STP logique n'altère pas les câbles physiques");
});
test("STP V0.1-04 : deux câbles entre switchs non administrables, tempête et correction",()=>{
 const f=fixture();twoSwitches(f);
 const extra=f.wire(f.sw1.ports[2].id,f.sw2.ports[2].id);
 assert.equal(f.observe().storm,true);
 assert.ok(f.r.disconnectCableEnd(extra.id,1).success);
 assert.equal(f.observe().success,true);
 assert.equal(f.observe().loop,false);
});
test("STP V0.1-05 : deux câbles administrables, un lien bloqué et reprise après coupure",()=>{
 const f=fixture(true);const first=twoSwitches(f);
 const extra=f.wire(f.sw1.ports[2].id,f.sw2.ports[2].id);
 const before=f.observe();
 assert.equal(before.success,true,JSON.stringify(before));
 assert.equal(before.loop,true);assert.deepEqual(before.blockedCableIds,[extra.id]);
 assert.ok(f.r.disconnectCableEnd(first.id,1).success);
 const after=f.observe();
 assert.equal(after.success,true,JSON.stringify(after));
 assert.equal(after.loop,false);assert.deepEqual(after.blockedCableIds,[]);
});
test("STP V0.1 : IP incohérente n'est pas réparée par STP",()=>{
 const f=fixture(true);oneSwitch(f);
 f.wire(f.sw1.ports[2].id,f.sw1.ports[3].id);
 f.addresses[f.pc2.id]={address:"192.168.20.12",prefix:24};
 assert.equal(f.observe().success,false);
 assert.equal(f.observe().loop,true);
});
test("STP V0.1 : mélange administrable et non administrable ne donne pas un faux succès",()=>{
 const f=fixture();
 const mp=f.r.createProfile("Administrable").profile;
 f.r.addPortGroup(mp.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5});
 f.r.setProfileNetworkCapability(mp.id,"ethernet-switching",true);
 f.r.setProfileNetworkCapability(mp.id,"vlan",true);
 const admin=f.r.createAsset(mp.id,{name:"SW admin"}).asset;
 f.wire(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.wire(f.pc2.ports[0].id,admin.ports[0].id);
 f.wire(f.sw1.ports[1].id,admin.ports[1].id);
 f.wire(f.sw1.ports[2].id,admin.ports[2].id);
 assert.equal(f.observe().storm,true);
});

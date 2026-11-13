import test from "node:test";
import assert from "node:assert/strict";
import {calculateRaid,assessRaidFailures,exportRaidConfiguration,importRaidConfiguration} from "../src/raid-core.js";
const make=(level,sizes,spares=[])=>({format:"raid-configuration",schemaVersion:1,level,disks:[
  ...sizes.map((capacityTB,i)=>({id:"d"+(i+1),capacityTB,role:"active"})),
  ...spares.map((capacityTB,i)=>({id:"s"+(i+1),capacityTB,role:"spare"}))
]});
const value=c=>{const r=calculateRaid(c);assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
for(const [level,n,usable,redundancy] of [
 ["0",2,4,0],["1",2,2,2],["1",3,2,4],["5",3,4,2],
 ["6",4,4,4],["10",4,4,4],["01",4,4,4],["10",6,6,6],["01",6,6,6]
]){
 test("capacity RAID "+level+" / "+n,()=>{
  const r=value(make(level,Array(n).fill(2)));
  assert.equal(r.capacitiesTB.usable,usable);
  assert.equal(r.capacitiesTB.redundancy,redundancy);
  assert.equal(r.capacitiesTB.rawTotal,2*n);
 });
}
test("heterogeneous disks and spare accounting",()=>{
 const r=value(make("5",[2,3,4],[5]));
 assert.deepEqual(r.capacitiesTB,{rawTotal:14,rawActive:9,usable:4,redundancy:2,unused:3,spare:5});
 assert.equal(r.counts.active,3);
 assert.equal(r.counts.spare,1);
});
test("spare never counts as active",()=>{
 const r=calculateRaid(make("5",[2,2],[3]));
 assert.equal(r.ok,false);assert.equal(r.errors[0].code,"TOO_FEW_ACTIVE_DISKS");
});
test("minimum, parity and incompatible layouts",()=>{
 for(const c of [make("0",[1]),make("6",[1,1,1]),make("10",[1,1,1,1,1]),make("01",[1,1,1])])
  assert.equal(calculateRaid(c).ok,false);
});
test("invalid capacity and too-small spare",()=>{
 for(const n of [0,-1,Infinity,NaN])assert.equal(calculateRaid(make("1",[1,n])).ok,false);
 assert.equal(calculateRaid(make("1",[2,2],[1])).errors[0].code,"SPARE_TOO_SMALL");
});
test("the calculator does not mutate input",()=>{
 const c=make("10",[2,2,2,2],[3]),before=JSON.stringify(c);value(c);assert.equal(JSON.stringify(c),before);
});
test("versioned export and restoration are consistent",()=>{
 const c=make("6",[2,3,4,5],[5]);
 const e=exportRaidConfiguration(c);assert.equal(e.ok,true);
 const i=importRaidConfiguration(e.value);assert.equal(i.ok,true);
 assert.deepEqual(i.value,c);
 assert.equal(value(i.value).capacitiesTB.usable,4);
 assert.equal(importRaidConfiguration("{").ok,false);
 assert.equal(importRaidConfiguration({...c,schemaVersion:99}).ok,false);
});
test("RAID 10 distinguishes same-pair and cross-pair failures",()=>{
 const c=make("10",[1,1,1,1]);
 assert.equal(assessRaidFailures(c,["d1","d3"]).value.available,true);
 assert.equal(assessRaidFailures(c,["d1","d2"]).value.available,false);
});
test("RAID 01 distinguishes whole-group survival",()=>{
 const c=make("01",[1,1,1,1]);
 assert.equal(assessRaidFailures(c,["d1","d2"]).value.available,true);
 assert.equal(assessRaidFailures(c,["d1","d3"]).value.available,false);
});
test("spare failure does not degrade active RAID",()=>{
 const a=assessRaidFailures(make("5",[2,2,2],[2]),["s1"]);
 assert.equal(a.ok,true);assert.equal(a.value.available,true);assert.equal(a.value.degraded,false);
});
test("results are stable and contain separate units",()=>{
 const c=make("5",[1.25,1.5,2.5]);
 assert.deepEqual(calculateRaid(c),calculateRaid(c));
 assert.equal(value(c).units.capacity,"TB");
 assert.equal(value(c).capacitiesTB.usable,2.5);
});

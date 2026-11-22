import test from "node:test";
import assert from "node:assert/strict";
import {radioSampleGrid} from "../src/radio-coverage-core-v1.js";
import {diagnoseWifiChannels} from "../src/wifi-channel-diagnostic-v1.js";
const receivers=radioSampleGrid({width:140,height:55,step:2.5});
const make=(id,x,channel)=>({id,name:id,x,y:27.5,z:0,wifiConfig:{enabled:true,radios:{
 "2.4":{enabled:true,channel},"5":{enabled:false,channel:"auto"},"6":{enabled:false,channel:"auto"}
}}});
const run=(first,second)=>diagnoseWifiChannels({accessPoints:[first,second],receivers,band:"2.4"});
test("Deux bornes proches sur le même canal : recouvrement, pas de panne automatique",()=>{
 const result=run(make("A",55,6),make("B",75,6));
 assert.equal(result.success,true);
 assert.equal(result.pairs[0].classification,"partage_canal");
 assert.ok(result.pairs[0].overlapPoints>0);
});
test("Même canal éloigné : réutilisation possible",()=>{
 const result=run(make("A",12,6),make("B",128,6));
 assert.equal(result.pairs[0].classification,"reuse_distance");
 assert.equal(result.pairs[0].overlapPoints,0);
});
test("Canaux distincts : pas de partage du même canal",()=>{
 const result=run(make("A",55,1),make("B",75,11));
 assert.equal(result.pairs[0].classification,"canaux_distincts");
 assert.ok(result.pairs[0].overlapPoints>0);
});
test("Canal automatique : ne pas déduire un canal ni un conflit",()=>{
 const result=run(make("A",55,"auto"),make("B",75,6));
 assert.equal(result.pairs[0].classification,"canal_automatique");
});
test("Radio désactivée : exclue du diagnostic",()=>{
 const b=make("B",75,6);b.wifiConfig.radios["2.4"].enabled=false;
 const result=run(make("A",55,6),b);
 assert.equal(result.pairs.length,0);
});

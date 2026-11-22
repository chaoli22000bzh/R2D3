import test from "node:test";
import assert from "node:assert/strict";
import {radioSampleGrid} from "../src/radio-coverage-core-v1.js";
import {resolveWifiAutoChannels} from "../src/wifi-auto-channel-v1.js";
import {diagnoseWifiChannels} from "../src/wifi-channel-diagnostic-v1.js";
const receivers=radioSampleGrid({width:140,height:55,step:2.5});
const make=(id,x,channel,enabled=true)=>({id,name:"Borne "+id,x,y:27.5,z:0,
 wifiConfig:{enabled:true,radios:{"2.4":{enabled,channel},"5":{enabled:false,channel:"auto"},"6":{enabled:false,channel:"auto"}}}});
const run=(...aps)=>resolveWifiAutoChannels({accessPoints:aps,receivers,band:"2.4"});
const map=result=>Object.fromEntries(result.assignments.map(a=>[a.apId,a.channel]));
test("Canal automatique proche d'un canal manuel : évite le canal occupé",()=>{
 const a=make("A",55,"auto"),b=make("B",75,6),result=run(a,b);
 assert.equal(result.success,true);
 assert.equal(map(result).A,1);
 assert.equal(map(result).B,6);
 assert.equal(a.wifiConfig.radios["2.4"].channel,"auto");
 const diagnosis=diagnoseWifiChannels({accessPoints:[a,b],receivers,band:"2.4",resolvedChannels:map(result)});
 assert.equal(diagnosis.pairs[0].classification,"canaux_distincts");
});
test("Deux bornes proches automatiques : canaux différents",()=>{
 const result=run(make("A",55,"auto"),make("B",75,"auto"));
 assert.equal(result.success,true);
 assert.equal(map(result).A,1);
 assert.equal(map(result).B,6);
});
test("Deux bornes éloignées automatiques : réutilisation du même canal",()=>{
 const result=run(make("A",12,"auto"),make("B",128,"auto"));
 assert.equal(map(result).A,1);
 assert.equal(map(result).B,1);
});
test("Canal manuel préservé et ordre d'entrée sans effet",()=>{
 const a=make("A",55,"auto"),b=make("B",75,6);
 assert.deepEqual(map(run(a,b)),map(run(b,a)));
});
test("Radio désactivée ignorée",()=>{
 const result=run(make("A",55,"auto"),make("B",75,6,false));
 assert.equal(result.assignments.length,1);
 assert.equal(map(result).A,1);
});
test("Paramètres invalides refusés",()=>{
 assert.equal(resolveWifiAutoChannels({band:"incorrect"}).success,false);
});

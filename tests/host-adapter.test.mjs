import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openHostedEngine,createMemoryTestHost} from "../adapters/host-test.js";
const scenario = JSON.parse(readFileSync(new URL("../scenarios/atelier-ipv4-v1.json",import.meta.url),"utf8"));
const ip=(id,address)=>({commandVersion:1,id,type:"network.setIPv4",targetId:"pc-01",params:{interfaceId:"eth0",mode:"static",address,prefix:24}});
const wire=(id,connected)=>({commandVersion:1,id,type:"network.setLinkConnected",targetId:"cable-printer",params:{connected}});
const ping=e=>e.query({type:"network.ping",sourceId:"pc-01",targetId:"printer-01"});
const start=(host,key)=>openHostedEngine({scenario,host,copyKey:key});

test("LOT-C-01 : état sauvegardé et réhydraté sans rejeu",async()=>{
 const host=createMemoryTestHost();
 const first=await start(host,"copie-A");
 assert.equal((await first.dispatch(ip("a","192.168.22.20"))).persisted,true);
 assert.equal((await first.dispatch(wire("b",false))).persisted,true);
 const previous=first.exportState();
 const resumed=await start(host,"copie-A");
 assert.deepEqual(resumed.exportState(),previous);
 assert.equal(resumed.getSnapshot().revision,2);
 assert.equal(ping(resumed).success,false);
 assert.equal(resumed.getSnapshot().technicalEvidence.length,0);
});
test("LOT-C-02 : échec d'enregistrement, aucun faux succès ni mutation visible",async()=>{
 const host=createMemoryTestHost();
 const exercise=await start(host,"copie-A");
 let count=0;exercise.subscribe(()=>count++);
 host.failNextSave();
 const response=await exercise.dispatch(wire("a",false));
 assert.equal(response.status,"failed");
 assert.equal(response.persisted,undefined);
 assert.equal(exercise.getSnapshot().revision,0);
 assert.equal(count,0);
 assert.equal(ping(exercise).success,true);
 const reopened=await start(host,"copie-A");
 assert.equal(ping(reopened).success,true);
});
test("LOT-C-03 : deux copies avec mêmes identifiants locaux restent isolées",async()=>{
 const host=createMemoryTestHost();
 const a=await start(host,"eleve-1/TP-1"),b=await start(host,"eleve-2/TP-1");
 await a.dispatch(wire("a",false));
 assert.equal(ping(a).success,false);
 assert.equal(ping(b).success,true);
 const reopenedB=await start(host,"eleve-2/TP-1");
 assert.equal(reopenedB.getSnapshot().revision,0);
});
test("LOT-C-04 : versions concurrentes, refus sans écrasement",async()=>{
 const host=createMemoryTestHost();
 const a=await start(host,"copie-A"),b=await start(host,"copie-A");
 assert.equal((await a.dispatch(wire("a",false))).status,"applied");
 const rejected=await b.dispatch(ip("b","192.168.20.15"));
 assert.equal(rejected.status,"failed");
 assert.equal(rejected.code,"revision_conflict");
 assert.equal(b.getSnapshot().revision,0);
 const resumed=await start(host,"copie-A");
 assert.equal(resumed.getSnapshot().revision,1);
 assert.equal(resumed.getSnapshot().linksById["cable-printer"].connected,false);
});
test("LOT-C-05 : rejet Core sans écriture hôte",async()=>{
 let saves=0;
 const host={async load(){return null;},async save(){saves++;return {ok:true}}};
 const engine=await start(host,"copie-A");
 const result=await engine.dispatch(ip("bad","999.0.0.1"));
 assert.equal(result.status,"rejected");
 assert.equal(saves,0);
});
test("LOT-C-06 : vues informées après validation de sauvegarde",async()=>{
 const host=createMemoryTestHost();
 const engine=await start(host,"copie-A");
 const revisions=[];
 const off=engine.subscribe(rev=>revisions.push(rev));
 const result=await engine.dispatch(wire("c",false));
 off();
 assert.equal(result.persisted,true);
 assert.deepEqual(revisions,[1]);
 assert.equal(ping(engine).success,false);
});
test("LOT-C-07 : appels concurrents à un même adaptateur sans perte",async()=>{
 const host=createMemoryTestHost();const engine=await start(host,"copie-A");
 const [a,b]=await Promise.all([engine.dispatch(wire("a",false)),engine.dispatch(ip("b","192.168.22.20"))]);
 assert.equal([a,b].filter(x=>x.status==="applied").length,1);
 assert.equal([a,b].filter(x=>x.status==="rejected").length,1);
 assert.equal(engine.getSnapshot().revision,1);
});
test("LOT-C-08 : sauvegarde rejetée si hôte lève une exception",async()=>{
 const host={async load(){return null;},async save(){throw Error("I/O fail")}};
 const engine=await start(host,"copie-A");
 assert.equal((await engine.dispatch(wire("a",false))).status,"failed");
 assert.equal(engine.getSnapshot().revision,0);
});

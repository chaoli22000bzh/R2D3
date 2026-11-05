import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-ipv4-v1.json",import.meta.url),"utf8"));
const ping=e=>e.query({type:"network.ping",sourceId:"pc-01",targetId:"printer-01"});
const c=(id,type,targetId,params,expectedRevision)=>({commandVersion:1,id,type,targetId,params,expectedRevision});
const ip=(id,address,rev)=>c(id,"network.setIPv4","pc-01",{interfaceId:"eth0",mode:"static",address,prefix:24},rev);
const wire=(id,connected,rev)=>c(id,"network.setLinkConnected","cable-printer",{connected},rev);
test("CORE-01: 30 instances indépendantes",()=>{
 const copies=Array.from({length:30},()=>createEngine(scenario));
 copies[0].dispatch(wire("a",false));assert.equal(ping(copies[0]).success,false);
 assert.ok(copies.slice(1).every(e=>ping(e).success));
});
test("CORE-02: mauvaise IP admise et conséquence",()=>{
 const e=createEngine(scenario);assert.equal(e.dispatch(ip("a","192.168.22.20")).status,"applied");
 assert.equal(ping(e).success,false);
});
test("CORE-03 adapté: deux pannes indépendantes",()=>{
 const e=createEngine(scenario);
 e.dispatch(ip("a","192.168.22.20"));e.dispatch(wire("b",false));
 e.dispatch(ip("c","192.168.10.20"));assert.equal(ping(e).success,false);
 e.dispatch(wire("d",true));assert.equal(ping(e).success,true);
});
test("CORE-04: notification et nouvelle vue",()=>{
 const e=createEngine(scenario);let n=0;
 const off=e.subscribe(()=>{n++;assert.equal(ping(e).success,false)});
 e.dispatch(ip("a","192.168.22.20"));off();
 assert.equal(n,1);assert.equal(e.getSnapshot().revision,1);
});
test("CORE-05: port absent et câble absent refusés",()=>{
 const e=createEngine(scenario);const before=e.exportState();
 assert.equal(e.dispatch(c("a","network.setIPv4","pc-01",{interfaceId:"inconnu",mode:"static",address:"192.168.10.30",prefix:24})).status,"rejected");
 assert.equal(e.dispatch(wire("b",false,99)).status,"rejected");
 assert.deepEqual(e.exportState(),before);
});
test("CORE-06: déconnexion réseau et perte de service",()=>{
 const e=createEngine(scenario);e.dispatch(wire("a",false));assert.equal(ping(e).success,false);
});
test("export et restauration stricts",()=>{
 const e=createEngine(scenario);e.dispatch(wire("a",false));
 const saved=e.exportState(),restored=restoreEngine(scenario,saved);
 assert.deepEqual(restored.exportState(),saved);assert.equal(ping(restored).success,false);
 saved.schemaVersion=2;assert.throws(()=>restoreEngine(scenario,saved));
});
test("snapshot défensif et révision obsolète",()=>{
 const e=createEngine(scenario);const snapshot=e.getSnapshot();
 snapshot.objectsById["pc-01"].config.ipv4.address="1.2.3.4";
 assert.equal(e.getSnapshot().objectsById["pc-01"].config.ipv4.address,"192.168.10.20");
 e.dispatch(wire("a",false,0));assert.equal(e.dispatch(wire("b",true,0)).status,"rejected");
});
test("rechargement logique = état initial",()=>{
 const e=createEngine(scenario);e.dispatch(wire("a",false));
 const next=createEngine(scenario);assert.equal(next.getSnapshot().revision,0);
 assert.equal(ping(next).success,true);
});

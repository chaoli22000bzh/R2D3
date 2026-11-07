import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-conflit-ipv4-v1.json",import.meta.url),"utf8"));
const conflicts=e=>e.query({type:"network.ipv4Conflicts"});
const ping=(e,source,target)=>e.query({type:"network.ping",sourceId:source,targetId:target});
const set=(e,id,target,address)=>e.dispatch({commandVersion:1,id,type:"network.setIPv4",targetId:target,params:{interfaceId:"eth0",mode:"static",address,prefix:24}});
test("CONFLIT-01: détecter deux postes ayant la même adresse sur le même switch",()=>{
 const e=createEngine(scenario);const q=conflicts(e);
 assert.equal(q.status,"ok");assert.equal(q.conflicts.length,1);
 assert.equal(q.conflicts[0].address,"192.168.10.20");
 assert.deepEqual(q.conflicts[0].ids.sort(),["pc-dhcp-01","pc-dhcp-02"]);
 assert.equal(ping(e,"pc-dhcp-01","printer-dhcp").conflict,true);
 assert.equal(ping(e,"pc-dhcp-02","printer-dhcp").conflict,true);
});
test("CONFLIT-02: une configuration manuelle correcte résout le conflit",()=>{
 const e=createEngine(scenario);
 assert.equal(set(e,"fix","pc-dhcp-02","192.168.10.21").status,"applied");
 assert.deepEqual(conflicts(e).conflicts,[]);
 assert.equal(ping(e,"pc-dhcp-01","printer-dhcp").success,true);
 assert.equal(ping(e,"pc-dhcp-02","printer-dhcp").success,true);
 assert.equal(ping(e,"pc-dhcp-01","pc-dhcp-02").success,true);
 assert.deepEqual(restoreEngine(scenario,e.exportState()).exportState(),e.exportState());
});
test("CONFLIT-03: attribuer l'adresse imprimante crée un autre conflit",()=>{
 const e=createEngine(scenario);
 set(e,"fix1","pc-dhcp-02","192.168.10.21");
 set(e,"bad","pc-dhcp-02","192.168.10.50");
 assert.equal(conflicts(e).conflicts.length,1);
 assert.deepEqual(conflicts(e).conflicts[0].ids.sort(),["pc-dhcp-02","printer-dhcp"]);
 assert.equal(ping(e,"pc-dhcp-01","printer-dhcp").conflict,true);
});
test("CONFLIT-04: un équipement isolé n'entraîne pas de conflit accessible",()=>{
 const e=createEngine(scenario);
 e.dispatch({commandVersion:1,id:"cut",type:"network.setLinkConnected",targetId:"cable-dhcp-pc-02",params:{connected:false}});
 assert.deepEqual(conflicts(e).conflicts,[]);
 assert.equal(ping(e,"pc-dhcp-01","printer-dhcp").success,true);
});
test("CONFLIT-05: refus atomique d'une adresse manuelle invalide",()=>{
 const e=createEngine(scenario),old=e.exportState();
 assert.equal(set(e,"invalid","pc-dhcp-02","192.168.10.999").status,"rejected");
 assert.deepEqual(e.exportState(),old);
});

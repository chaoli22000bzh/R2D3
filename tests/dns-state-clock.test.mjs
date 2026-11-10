import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dns-cache-v1.json",import.meta.url),"utf8"));
const clone=x=>JSON.parse(JSON.stringify(x));
let id=0;
const cmd=(e,type,targetId,params={})=>e.dispatch({id:"clock-audit-"+(++id),commandVersion:1,type,targetId,params});
const ready=()=>{const e=createEngine(scenario);assert.equal(cmd(e,"dhcp.request","pc-dhcp-01").status,"applied");assert.equal(cmd(e,"dns.clientResolve","pc-dhcp-01",{name:"www.atelier.test"}).status,"applied");return e;};
test("CLOCK-01 : simulation.advanceTime fait expirer les caches DNS",()=>{
 const e=ready();assert.equal(cmd(e,"simulation.advanceTime","simulation-clock",{seconds:300}).status,"applied");
 assert.equal(e.getSnapshot().simulationClock,300);assert.equal(e.query({type:"dns.cache",sourceId:"pc-dhcp-01"}).entries.length,0);
});
test("CLOCK-02 : ancienne horloge DHCP reste utilisable",()=>{
 const e=ready();assert.equal(cmd(e,"dhcp.advanceTime","srv-dhcp",{seconds:60}).status,"applied");
 assert.equal(e.query({type:"dns.cache",sourceId:"pc-dhcp-01"}).entries[0].remainingTtl,240);
});
test("CLOCK-03 : horloge disponible sans serveur DHCP",()=>{
 const isolated=clone(scenario);isolated.objects=isolated.objects.filter(o=>o.id!=="srv-dhcp");
 isolated.links=isolated.links.filter(l=>!l.endpoints.some(ep=>ep.objectId==="srv-dhcp"));
 const e=createEngine(isolated);assert.equal(cmd(e,"simulation.advanceTime","simulation-clock",{seconds:25}).status,"applied");
 assert.equal(e.getSnapshot().simulationClock,25);
});
test("CLOCK-04 : progression invalide ne modifie pas l'etat",()=>{
 const e=ready(),before=e.getSnapshot();
 for(const [targetId,seconds] of [["simulation-clock",0],["simulation-clock",604801],["unknown",20]]){
  assert.equal(cmd(e,"simulation.advanceTime",targetId,{seconds}).status,"rejected");
  assert.deepEqual(e.getSnapshot(),before);
 }
});
test("RESTORE-01 : cache valide restaurable et conservé",()=>{
 const e=ready();cmd(e,"simulation.advanceTime","simulation-clock",{seconds:20});
 const saved=e.exportState(),restored=restoreEngine(scenario,saved);
 assert.deepEqual(restored.exportState(),saved);
 assert.equal(restored.query({type:"dns.cache",sourceId:"pc-dhcp-01"}).entries[0].remainingTtl,280);
});
test("RESTORE-02 : types, expiration et identités de cache corrompus rejetés",()=>{
 const state=ready().exportState();
 const cases=[
  s=>{s.domainState.dnsCaches["pc-dhcp-01"]["www.atelier.test"].expires="tomorrow";},
  s=>{s.domainState.dnsCaches["pc-dhcp-01"]["www.atelier.test"].ttl=-1;},
  s=>{s.domainState.dnsCaches["pc-dhcp-01"]["www.atelier.test"].chain[0].type="MX";},
  s=>{s.domainState.dnsCaches["unknown"]=s.domainState.dnsCaches["pc-dhcp-01"];},
  s=>{s.domainState.dnsCaches["pc-dhcp-01"]["www.atelier.test"].address="999.999.1.1";},
  s=>{s.domainState.dnsCaches["pc-dhcp-01"]["www.atelier.test"].name="other.atelier.test";},
  s=>{s.domainState.dnsCaches["pc-dhcp-01"]="incorrect";},
  s=>{s.domainState.dnsLastResults["pc-dhcp-01"].status="corrupted";}
 ];
 for(const corrupt of cases){const copy=clone(state);corrupt(copy);assert.throws(()=>restoreEngine(scenario,copy));}
});
test("RESTORE-03 : anciens états sans caches restent compatibles",()=>{
 const e=createEngine(scenario),saved=e.exportState();
 assert.deepEqual(restoreEngine(scenario,saved).exportState(),saved);
});

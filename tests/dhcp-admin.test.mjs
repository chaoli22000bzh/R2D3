import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dhcp-admin-v1.json",import.meta.url),"utf8"));
const cmd=(e,id,type,targetId,params={})=>e.dispatch({id,type,targetId,params,commandVersion:1});
const renew=(e,id,pc)=>cmd(e,id,"dhcp.request",pc);
const release=(e,id,pc)=>cmd(e,id,"dhcp.release",pc);
const configure=(e,id,settings)=>cmd(e,id,"dhcp.configurePool","srv-dhcp",settings);
const addr=(e,id)=>e.getSnapshot().objectsById[id].config.ipv4.address;
test("ADMIN-01 plage configurable affecte les nouvelles attributions",()=>{
 const e=createEngine(scenario);
 assert.equal(configure(e,"cfg",{start:"192.168.10.105",end:"192.168.10.108"}).status,"applied");
 renew(e,"r1","pc-dhcp-01");renew(e,"r2","pc-dhcp-02");
 assert.equal(addr(e,"pc-dhcp-01"),"192.168.10.105");
 assert.equal(addr(e,"pc-dhcp-02"),"192.168.10.106");
});
test("ADMIN-02 exclusions sautées pour tout client",()=>{
 const e=createEngine(scenario);
 assert.equal(configure(e,"cfg",{exclusions:["192.168.10.100","192.168.10.102"]}).status,"applied");
 renew(e,"r1","pc-dhcp-01");renew(e,"r2","pc-dhcp-02");
 assert.equal(addr(e,"pc-dhcp-01"),"192.168.10.101");
 assert.equal(addr(e,"pc-dhcp-02"),"192.168.10.103");
});
test("ADMIN-03 réservation MAC PC 2 prioritaire même si PC 1 demande avant",()=>{
 const e=createEngine(scenario);
 assert.equal(configure(e,"cfg",{reservations:[{mac:"02-52-32-44-33-02",address:"192.168.10.105"}]}).status,"applied");
 renew(e,"r1","pc-dhcp-01");renew(e,"r2","pc-dhcp-02");
 assert.equal(addr(e,"pc-dhcp-01"),"192.168.10.100");
 assert.equal(addr(e,"pc-dhcp-02"),"192.168.10.105");
 release(e,"rel2","pc-dhcp-02");renew(e,"again","pc-dhcp-02");
 assert.equal(addr(e,"pc-dhcp-02"),"192.168.10.105");
 assert.deepEqual(restoreEngine(scenario,e.exportState()).exportState(),e.exportState());
});
test("ADMIN-04 IP réservée exclue de l'attribution ordinaire",()=>{
 const e=createEngine(scenario);
 configure(e,"cfg",{start:"192.168.10.105",end:"192.168.10.106",reservations:[{mac:"02-52-32-44-33-02",address:"192.168.10.105"}]});
 renew(e,"r1","pc-dhcp-01");renew(e,"r2","pc-dhcp-02");
 assert.equal(addr(e,"pc-dhcp-01"),"192.168.10.106");
 assert.equal(addr(e,"pc-dhcp-02"),"192.168.10.105");
});
test("ADMIN-05 configurations invalides refusées sans altérer état",()=>{
 const e=createEngine(scenario),before=e.exportState();
 for(const [i,settings] of [
  {start:"192.168.10.110",end:"192.168.10.100"},
  {exclusions:["192.168.10.111"]},
  {exclusions:["192.168.10.101","192.168.10.101"]},
  {reservations:[{mac:"02-52-32-44-33-02",address:"192.168.10.200"}]},
  {exclusions:["192.168.10.105"],reservations:[{mac:"02-52-32-44-33-02",address:"192.168.10.105"}]},
  {reservations:[{mac:"BAD",address:"192.168.10.105"}]}
 ].entries()){
  assert.equal(configure(e,"bad-"+i,settings).status,"rejected");
  assert.deepEqual(e.exportState(),before);
 }
});
test("ADMIN-06 changement serveur ne supprime pas automatiquement bail existant",()=>{
 const e=createEngine(scenario);
 renew(e,"r1","pc-dhcp-01");
 configure(e,"cfg",{start:"192.168.10.105",end:"192.168.10.110"});
 assert.equal(addr(e,"pc-dhcp-01"),"192.168.10.100");
 release(e,"rel","pc-dhcp-01");renew(e,"r2","pc-dhcp-01");
 assert.equal(addr(e,"pc-dhcp-01"),"192.168.10.105");
});

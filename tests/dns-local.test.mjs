import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";

const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dns-local-v1.json",import.meta.url),"utf8"));
const engine=()=>createEngine(scenario);
const command=(e,id,type,targetId,params={})=>e.dispatch({id,commandVersion:1,type,targetId,params});
const query=(e,name,sourceId="pc-dhcp-01")=>e.query({type:"dns.resolve",sourceId,name});
const ready=()=>{const e=engine();assert.equal(command(e,"dhcp","dhcp.request","pc-dhcp-01").status,"applied");return e;};
test("DNS-01 : nom A avec serveur reçu en DHCP",()=>{
 const e=ready(),result=query(e,"atelier.test");
 assert.equal(result.found,true);assert.equal(result.address,"192.168.10.50");
 assert.equal(result.serverAddress,"192.168.10.10");
 assert.deepEqual(result.chain.map(r=>r.type),["A"]);
});
test("DNS-02 : CNAME puis A, nom inconnu et zone externe",()=>{
 const e=ready();
 const result=query(e,"www.atelier.test");
 assert.equal(result.address,"192.168.10.50");
 assert.deepEqual(result.chain.map(r=>r.type),["CNAME","A"]);
 assert.equal(query(e,"absent.atelier.test").reason,"name_not_found");
 assert.equal(query(e,"example.org").reason,"name_outside_zone");
});
test("DNS-03 : absence de DNS configure et serveur incorrect",()=>{
 const e=engine();
 assert.equal(query(e,"atelier.test").status,"unavailable");
 assert.equal(command(e,"options","network.setNetworkOptions","pc-dhcp-01",{gateway:null,dns:["8.8.8.8"]}).status,"applied");
 assert.equal(query(e,"atelier.test").status,"unavailable");
});
test("DNS-04 : serveur arrete, debranche ou conflit IPv4",()=>{
 const e=ready();
 assert.equal(command(e,"off","dns.setServerEnabled","srv-dns",{enabled:false}).status,"applied");
 assert.equal(query(e,"atelier.test").status,"unavailable");
 command(e,"on","dns.setServerEnabled","srv-dns",{enabled:true});
 assert.equal(command(e,"disconnect","network.setLinkConnected","cable-dns-server",{connected:false}).status,"applied");
 assert.equal(query(e,"atelier.test").status,"unavailable");
 command(e,"reconnect","network.setLinkConnected","cable-dns-server",{connected:true});
 assert.equal(query(e,"atelier.test").found,true);
});
test("DNS-05 : modification et suppression A rendent la resolution dynamique",()=>{
 const e=ready();
 assert.equal(command(e,"edit","dns.upsertRecord","srv-dns",{record:{name:"atelier.test",type:"A",value:"192.168.10.70"}}).status,"applied");
 assert.equal(query(e,"www.atelier.test").address,"192.168.10.70");
 assert.equal(command(e,"delete","dns.removeRecord","srv-dns",{name:"atelier.test"}).status,"applied");
 assert.equal(query(e,"www.atelier.test").reason,"name_not_found");
});
test("DNS-06 : boucle CNAME detectee sans blocage",()=>{
 const e=ready();
 assert.equal(command(e,"one","dns.upsertRecord","srv-dns",{record:{name:"alias.atelier.test",type:"CNAME",value:"autre.atelier.test"}}).status,"applied");
 assert.equal(command(e,"two","dns.upsertRecord","srv-dns",{record:{name:"autre.atelier.test",type:"CNAME",value:"alias.atelier.test"}}).status,"applied");
 assert.equal(query(e,"alias.atelier.test").reason,"alias_loop");
});
test("DNS-07 : administration invalide refusee sans mutation",()=>{
 const e=ready(),before=e.exportState();
 for(const [id,record] of [
  ["bad-ip",{name:"atelier.test",type:"A",value:"999.2.3.4"}],
  ["bad-type",{name:"atelier.test",type:"SRV",value:"mail.atelier.test"}],
  ["bad-zone",{name:"www.example.org",type:"A",value:"192.168.10.20"}],
  ["bad-alias",{name:"www.atelier.test",type:"CNAME",value:"example.org"}]
 ]){assert.equal(command(e,id,"dns.upsertRecord","srv-dns",{record}).status,"rejected");assert.deepEqual(e.exportState(),before);}
});
test("DNS-08 : etat DNS exporte puis restaure",()=>{
 const e=ready();
 command(e,"edit","dns.upsertRecord","srv-dns",{record:{name:"fichiers.atelier.test",type:"A",value:"192.168.10.80"}});
 const saved=e.exportState();
 const restored=restoreEngine(scenario,saved);
 assert.deepEqual(restored.exportState(),saved);
 assert.equal(query(restored,"fichiers.atelier.test").address,"192.168.10.80");
});

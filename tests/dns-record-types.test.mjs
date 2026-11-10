import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";

const base=JSON.parse(readFileSync(new URL("../scenarios/atelier-dns-local-v1.json",import.meta.url),"utf8"));
const original=()=>JSON.parse(JSON.stringify(base));
const fresh=()=>{
  const scenario=original();
  const zone=scenario.objects.find(o=>o.id==="srv-dns").config.dnsZone;
  zone.records.push(
    {name:"mail.atelier.test",type:"A",value:"192.168.10.70"},
    {name:"atelier.test",type:"AAAA",value:"2001:db8::50"},
    {name:"atelier.test",type:"MX",priority:20,value:"backup.atelier.test"},
    {name:"atelier.test",type:"MX",priority:10,value:"mail.atelier.test"},
    {name:"atelier.test",type:"TXT",value:"v=spf1 mx -all"},
    {name:"atelier.test",type:"TXT",value:"verification=demo"},
    {name:"50.10.168.192.in-addr.arpa",type:"PTR",value:"atelier.test"}
  );
  return scenario;
};
const cmd=(e,id,type,targetId,params={})=>e.dispatch({id,commandVersion:1,type,targetId,params});
const setup=()=>{
 const scenario=fresh(),e=createEngine(scenario);
 assert.equal(cmd(e,"dhcp-1","dhcp.request","pc-dhcp-01").status,"applied");
 return {e,scenario};
};
const lookup=(e,name,recordType)=>e.query({type:"dns.resolve",sourceId:"pc-dhcp-01",name,recordType});

test("DNS-EXT-01 : A et CNAME restent compatibles",()=>{
 const {e}=setup();
 assert.equal(lookup(e,"atelier.test").address,"192.168.10.50");
 assert.deepEqual(lookup(e,"www.atelier.test").chain.map(r=>r.type),["CNAME","A"]);
});
test("DNS-EXT-02 : AAAA normalise enregistrement et type",()=>{
 const {e}=setup(),res=lookup(e,"atelier.test","AAAA");
 assert.equal(res.found,true);assert.equal(res.records[0].value,"2001:db8::50");
 assert.equal(res.recordType,"AAAA");
 assert.equal(lookup(e,"atelier.test","A").address,"192.168.10.50");
});
test("DNS-EXT-03 : MX par priorité avec plusieurs valeurs du même nom",()=>{
 const {e}=setup(),res=lookup(e,"atelier.test","MX");
 assert.deepEqual(res.records.map(x=>[x.priority,x.value]),[[10,"mail.atelier.test"],[20,"backup.atelier.test"]]);
});
test("DNS-EXT-04 : plusieurs TXT indépendants, aucune vérification SPF réelle",()=>{
 const {e}=setup(),res=lookup(e,"atelier.test","TXT");
 assert.deepEqual(res.records.map(x=>x.value),["v=spf1 mx -all","verification=demo"]);
});
test("DNS-EXT-05 : PTR inverse en forme IPv4 ou in-addr.arpa",()=>{
 const {e}=setup();
 assert.equal(lookup(e,"192.168.10.50","PTR").records[0].value,"atelier.test");
 assert.equal(lookup(e,"50.10.168.192.in-addr.arpa","PTR").records[0].value,"atelier.test");
});
test("DNS-EXT-06 : cache distingue A, MX et TXT",()=>{
 const {e}=setup();
 for(const [i,t] of ["A","MX","TXT"].entries())assert.equal(cmd(e,"resolve-"+i,"dns.clientResolve","pc-dhcp-01",{name:"atelier.test",recordType:t}).status,"applied");
 const cache=e.query({type:"dns.cache",sourceId:"pc-dhcp-01"}).entries;
 assert.equal(cache.length,3);
 assert.deepEqual(new Set(cache.map(x=>x.recordType??"A")),new Set(["A","MX","TXT"]));
 const response=cmd(e,"cached-mx","dns.clientResolve","pc-dhcp-01",{name:"atelier.test",recordType:"MX"});
 assert.equal(response.dnsResult.fromCache,true);
});
test("DNS-EXT-07 : expiration TTL par type et purge",()=>{
 const {e}=setup();
 cmd(e,"first","dns.clientResolve","pc-dhcp-01",{name:"atelier.test",recordType:"TXT"});
 const old=e.query({type:"dns.cache",sourceId:"pc-dhcp-01"}).entries.find(x=>x.recordType==="TXT");
 assert.ok(old);
 assert.equal(cmd(e,"clock","simulation.advanceTime","simulation-clock",{seconds:old.ttl+1}).status,"applied");
 assert.equal(cmd(e,"again","dns.clientResolve","pc-dhcp-01",{name:"atelier.test",recordType:"TXT"}).dnsResult.fromCache,false);
 assert.equal(cmd(e,"flush","dns.flushCache","pc-dhcp-01").status,"applied");
 assert.equal(e.query({type:"dns.cache",sourceId:"pc-dhcp-01"}).entries.length,0);
});
test("DNS-EXT-08 : validation invalide atomique et CNAME exclusif",()=>{
 const {e}=setup(),before=e.exportState();
 for(const [i,record] of [
   {name:"atelier.test",type:"AAAA",value:"xyz::"},
   {name:"atelier.test",type:"MX",value:"mail.atelier.test",priority:70000},
   {name:"atelier.test",type:"TXT",value:""},
   {name:"atelier.test",type:"CNAME",value:"mail.atelier.test"},
   {name:"outside.example",type:"TXT",value:"foo"}
 ].entries()){
   assert.equal(cmd(e,"bad-"+i,"dns.upsertRecord","srv-dns",{record}).status,"rejected");
   assert.deepEqual(e.exportState(),before);
 }
});
test("DNS-EXT-09 : ajout, retrait précis d'un MX sans supprimer les autres",()=>{
 const {e}=setup();
 const res=cmd(e,"remove","dns.removeRecord","srv-dns",{name:"atelier.test",recordType:"MX",value:"mail.atelier.test"});
 assert.equal(res.status,"applied");
 assert.deepEqual(lookup(e,"atelier.test","MX").records.map(x=>x.value),["backup.atelier.test"]);
 const added=cmd(e,"add","dns.upsertRecord","srv-dns",{record:{name:"atelier.test",type:"MX",value:"mail.atelier.test",priority:5}});
 assert.equal(added.status,"applied");
 assert.equal(lookup(e,"atelier.test","MX").records[0].priority,5);
});
test("DNS-EXT-10 : sauvegarde et restauration des caches types",()=>{
 const {e,scenario}=setup();
 cmd(e,"txt","dns.clientResolve","pc-dhcp-01",{name:"atelier.test",recordType:"TXT"});
 cmd(e,"ptr","dns.clientResolve","pc-dhcp-01",{name:"192.168.10.50",recordType:"PTR"});
 const saved=e.exportState();
 const restored=restoreEngine(scenario,saved);
 assert.deepEqual(restored.exportState(),saved);
 assert.equal(cmd(restored,"again","dns.clientResolve","pc-dhcp-01",{name:"atelier.test",recordType:"TXT"}).dnsResult.fromCache,true);
});

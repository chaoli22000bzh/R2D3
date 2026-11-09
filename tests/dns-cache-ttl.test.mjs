import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dns-local-v1.json",import.meta.url),"utf8"));
const pc1="pc-dhcp-01",pc2="pc-dhcp-02",server="srv-dns";
const setup=()=>{const e=createEngine(scenario);apply(e,"dhcp.request",pc1);apply(e,"dhcp.request",pc2);return e};
let serial=0;
const apply=(e,type,target,params={})=>{const r=e.dispatch({id:"dns-cache-test-"+(++serial),commandVersion:1,type,targetId:target,params});assert.equal(r.status,"applied",JSON.stringify(r));return r};
const windows=(e,name,pc=pc1)=>apply(e,"dns.clientResolve",pc,{name}).dnsResult;
const direct=(e,name,pc=pc1)=>e.query({type:"dns.resolve",name,sourceId:pc});
const cached=(e,pc=pc1)=>e.query({type:"dns.cache",sourceId:pc}).entries;
const tick=(e,seconds)=>apply(e,"dhcp.advanceTime","srv-dhcp",{seconds});
test("CACHE-01 : cache cree apres resolution Windows",()=>{
 const e=setup(),r=windows(e,"atelier.test");
 assert.equal(r.address,"192.168.10.50");assert.equal(r.fromCache,false);
 assert.equal(cached(e).length,1);assert.equal(cached(e)[0].remainingTtl,300);
});
test("CACHE-02 : nouvelle resolution retourne le cache et pas le serveur",()=>{
 const e=setup();windows(e,"atelier.test");apply(e,"dns.upsertRecord",server,{record:{name:"atelier.test",type:"A",value:"192.168.10.80"}});
 assert.equal(windows(e,"atelier.test").address,"192.168.10.50");assert.equal(windows(e,"atelier.test").fromCache,true);
 assert.equal(direct(e,"atelier.test").address,"192.168.10.80");
});
test("CACHE-03 : consultation non destructive sans avancement du temps",()=>{
 const e=setup();windows(e,"www.atelier.test");
 assert.deepEqual(cached(e),cached(e));assert.equal(cached(e)[0].remainingTtl,300);
});
test("CACHE-04 : chaque PC possede son propre cache",()=>{
 const e=setup();windows(e,"atelier.test",pc1);
 assert.equal(cached(e,pc2).length,0);
 apply(e,"dns.upsertRecord",server,{record:{name:"atelier.test",type:"A",value:"192.168.10.80"}});
 assert.equal(windows(e,"atelier.test",pc2).address,"192.168.10.80");
 assert.equal(windows(e,"atelier.test",pc1).address,"192.168.10.50");
});
test("CACHE-05 : TTL diminue avec l'horloge simulee",()=>{
 const e=setup();windows(e,"atelier.test");tick(e,120);
 assert.equal(cached(e)[0].remainingTtl,180);
});
test("CACHE-06 : TTL expire et ancien enregistrement ne persiste pas",()=>{
 const e=setup();windows(e,"atelier.test");
 apply(e,"dns.upsertRecord",server,{record:{name:"atelier.test",type:"A",value:"192.168.10.80"}});
 tick(e,300);assert.equal(cached(e).length,0);
 const r=windows(e,"atelier.test");assert.equal(r.address,"192.168.10.80");assert.equal(r.fromCache,false);
});
test("CACHE-07 : TTL A configurable et valide",()=>{
 const e=setup();
 apply(e,"dns.upsertRecord",server,{record:{name:"atelier.test",type:"A",value:"192.168.10.50",ttl:90}});
 assert.equal(windows(e,"atelier.test").ttl,90);
 tick(e,89);assert.equal(cached(e)[0].remainingTtl,1);tick(e,1);assert.equal(cached(e).length,0);
});
test("CACHE-08 : chaine CNAME limitee par TTL minimal",()=>{
 const e=setup();
 apply(e,"dns.upsertRecord",server,{record:{name:"www.atelier.test",type:"CNAME",value:"atelier.test",ttl:40}});
 apply(e,"dns.upsertRecord",server,{record:{name:"atelier.test",type:"A",value:"192.168.10.50",ttl:120}});
 assert.equal(windows(e,"www.atelier.test").ttl,40);
 tick(e,40);assert.equal(cached(e).length,0);
});
test("CACHE-09 : purge manuelle du cache conserve les autres PC",()=>{
 const e=setup();windows(e,"atelier.test",pc1);windows(e,"atelier.test",pc2);
 apply(e,"dns.flushCache",pc1);
 assert.equal(cached(e,pc1).length,0);assert.equal(cached(e,pc2).length,1);
});
test("CACHE-10 : cache positif utilise quand serveur arrete, nslookup echoue",()=>{
 const e=setup();windows(e,"atelier.test");
 apply(e,"dns.setServerEnabled",server,{enabled:false});
 assert.equal(windows(e,"atelier.test").address,"192.168.10.50");
 assert.equal(direct(e,"atelier.test").status,"unavailable");
 tick(e,300);assert.equal(windows(e,"atelier.test").status,"unavailable");
});
test("CACHE-11 : cache negatif et TTL expire",()=>{
 const e=setup();
 assert.equal(windows(e,"inconnu.atelier.test").reason,"name_not_found");
 assert.equal(cached(e)[0].remainingTtl,60);
 apply(e,"dns.upsertRecord",server,{record:{name:"inconnu.atelier.test",type:"A",value:"192.168.10.88"}});
 assert.equal(windows(e,"inconnu.atelier.test").found,false);
 assert.equal(direct(e,"inconnu.atelier.test").address,"192.168.10.88");
 tick(e,60);
 assert.equal(windows(e,"inconnu.atelier.test").address,"192.168.10.88");
});
test("CACHE-12 : sauvegarde et remise a zero de scenario",()=>{
 const e=setup();windows(e,"atelier.test");tick(e,60);
 const saved=e.exportState(),restored=restoreEngine(scenario,saved);
 assert.equal(cached(restored)[0].remainingTtl,240);
 const fresh=createEngine(scenario);
 assert.equal(cached(fresh).length,0);
});

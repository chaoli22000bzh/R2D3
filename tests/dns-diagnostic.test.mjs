import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine} from "../src/r2d3-core.js";

const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-diagnostic-dns-v1.json",import.meta.url),"utf8"));
const p1="pc-dhcp-01",p2="pc-dhcp-02",dns="srv-dns";
let serial=0;
const engine=()=>createEngine(scenario);
function cmd(e,type,targetId,params={}){
 const r=e.dispatch({id:"diag-"+(++serial),commandVersion:1,type,targetId,params});
 assert.equal(r.status,"applied",JSON.stringify(r));return r;
}
const setup=()=>{const e=engine();cmd(e,"dhcp.request",p1);cmd(e,"dhcp.request",p2);return e};
const direct=(e,pc=p1)=>e.query({type:"dns.resolve",sourceId:pc,name:"www.atelier.test"});
const win=(e,pc=p1)=>cmd(e,"dns.clientResolve",pc,{name:"www.atelier.test"}).dnsResult;
const cache=(e,pc=p1)=>e.query({type:"dns.cache",sourceId:pc}).entries;
const opts=(e,pc)=>e.getSnapshot().objectsById[pc].config.networkOptions;
const pc=(e,id)=>e.getSnapshot().objectsById[id].config.ipv4;
const wrong=(e,ip)=>cmd(e,"dns.upsertRecord",dns,{record:{name:"atelier.test",type:"A",value:ip,ttl:300}});

test("DIAG-01 initialisation et attribution DHCP sur deux PC",()=>{
 const e=setup();assert.equal(pc(e,p1).address,"192.168.10.100");assert.equal(pc(e,p2).address,"192.168.10.101");
 assert.deepEqual(opts(e,p1).dns,["192.168.10.10","1.1.1.1"]);
});
test("DIAG-02 resolutions normales directes et Windows, deux caches distincts",()=>{
 const e=setup();
 for(const id of [p1,p2]){assert.equal(direct(e,id).address,"192.168.10.50");const r=win(e,id);assert.equal(r.address,"192.168.10.50");assert.equal(r.fromCache,false);}
 assert.equal(cache(e,p1).length,1);assert.equal(cache(e,p2).length,1);
});
test("DIAG-03 DNS incorrect sur PC1, cache conserve et PC2 independant",()=>{
 const e=setup();win(e,p1);
 cmd(e,"network.setNetworkOptions",p1,{gateway:"192.168.10.1",dns:["192.168.10.99","1.1.1.1"]});
 assert.equal(direct(e).status,"unavailable");assert.equal(win(e).address,"192.168.10.50");assert.equal(win(e).fromCache,true);
 assert.equal(direct(e,p2).address,"192.168.10.50");
});
test("DIAG-04 correction DNS et purge : nouvelle requete serveur",()=>{
 const e=setup();win(e);
 cmd(e,"network.setNetworkOptions",p1,{gateway:"192.168.10.1",dns:["192.168.10.99","1.1.1.1"]});
 cmd(e,"network.setNetworkOptions",p1,{gateway:"192.168.10.1",dns:["192.168.10.10","1.1.1.1"]});
 cmd(e,"dns.flushCache",p1);assert.equal(cache(e).length,0);assert.equal(win(e).fromCache,false);assert.equal(win(e).address,"192.168.10.50");
});
test("DIAG-05 service DNS arrete, cache actif, reprise",()=>{
 const e=setup();win(e);cmd(e,"dns.setServerEnabled",dns,{enabled:false});
 assert.equal(direct(e).status,"unavailable");assert.equal(win(e).fromCache,true);
 cmd(e,"dns.setServerEnabled",dns,{enabled:true});assert.equal(direct(e).address,"192.168.10.50");
});
test("DIAG-06 liaison coupee puis retablie, ping IPv4 et DNS",()=>{
 const e=setup();cmd(e,"network.setLinkConnected","cable-dns-server",{connected:false});
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:"192.168.10.10"}).success,false);
 assert.equal(direct(e).status,"unavailable");
 cmd(e,"network.setLinkConnected","cable-dns-server",{connected:true});
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:"192.168.10.10"}).success,true);
 assert.equal(direct(e).address,"192.168.10.50");
});
test("DIAG-07 zone incorrecte, cache reste ancien puis purge et correction",()=>{
 const e=setup();win(e);wrong(e,"192.168.10.99");
 assert.equal(direct(e).address,"192.168.10.99");assert.equal(win(e).address,"192.168.10.50");
 cmd(e,"dns.flushCache",p1);assert.equal(win(e).address,"192.168.10.99");
 wrong(e,"192.168.10.50");assert.equal(direct(e).address,"192.168.10.50");
});
test("DIAG-08 ancien cache expire, nouvelle valeur rechargee",()=>{
 const e=setup();wrong(e,"192.168.10.99");assert.equal(win(e).address,"192.168.10.99");
 wrong(e,"192.168.10.50");assert.equal(win(e).address,"192.168.10.99");
 cmd(e,"simulation.advanceTime","simulation-clock",{seconds:301});
 assert.equal(cache(e).length,0);const renewed=win(e);assert.equal(renewed.address,"192.168.10.50");assert.equal(renewed.fromCache,false);
});
test("DIAG-09 modifications PC1 sans mutation PC2",()=>{
 const e=setup(),before=JSON.stringify(e.getSnapshot().objectsById[p2]);
 assert.equal(cache(e,p2).length,0);
 cmd(e,"network.setNetworkOptions",p1,{gateway:"192.168.10.1",dns:["192.168.10.99","1.1.1.1"]});
 cmd(e,"network.setNetworkOptions",p1,{gateway:"192.168.10.1",dns:["192.168.10.10","1.1.1.1"]});
 assert.equal(JSON.stringify(e.getSnapshot().objectsById[p2]),before);assert.equal(cache(e,p2).length,0);
});
test("DIAG-10 nouveau scenario remet zone, horloge, caches et DHCP a zero",()=>{
 let e=setup();win(e);wrong(e,"192.168.10.99");cmd(e,"simulation.advanceTime","simulation-clock",{seconds:301});
 e=engine();assert.equal(e.getSnapshot().simulationClock,0);assert.equal(pc(e,p1).address,null);assert.equal(pc(e,p2).address,null);
 assert.equal(cache(e,p1).length,0);assert.equal(cache(e,p2).length,0);
 cmd(e,"dhcp.request",p1);cmd(e,"dhcp.request",p2);
 assert.equal(direct(e).address,"192.168.10.50");assert.equal(direct(e,p2).address,"192.168.10.50");
 assert.equal(win(e).fromCache,false);assert.equal(win(e,p2).fromCache,false);
});
test("PING-ADDRESS-01 IPv4 explicite, adresse absente et validation",()=>{
 const e=setup();
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:"192.168.10.10"}).success,true);
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:"999.1.1.1"}).status,"unavailable");
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:"192.168.10.250"}).success,false);
});
test("PING-DNS-02 resolution Windows utilise cache avant ping IPv4",()=>{
 const e=setup();const first=win(e);
 assert.equal(first.fromCache,false);
 wrong(e,"192.168.10.99");
 const cached=win(e);assert.equal(cached.fromCache,true);assert.equal(cached.address,"192.168.10.50");
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:cached.address}).success,true);
 cmd(e,"dns.flushCache",p1);
 const newResolution=win(e);assert.equal(newResolution.address,"192.168.10.99");
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:newResolution.address}).success,false);
});
test("PING-DNS-03 serveur DNS inaccessible sans cache empeche resolution par nom",()=>{
 const e=setup();cmd(e,"network.setLinkConnected","cable-dns-server",{connected:false});
 assert.equal(win(e).status,"unavailable");assert.equal(cache(e).length,0);
 assert.equal(e.query({type:"network.pingAddress",sourceId:p1,address:"192.168.10.2"}).success,true);
});

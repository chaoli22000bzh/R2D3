import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dhcp-v1.json",import.meta.url),"utf8"));
const command=(id,type,targetId,params={})=>({commandVersion:1,id,type,targetId,params});
const req=(e,id)=>e.dispatch(command(id,"dhcp.request","pc-dhcp"));
const pc=e=>e.getSnapshot().objectsById["pc-dhcp"];
const ping=e=>e.query({type:"network.ping",sourceId:"pc-dhcp",targetId:"printer-dhcp"});
test("DHCP-01: requête valide, passerelle, 2 DNS, bail 24h et ping",()=>{
 const e=createEngine(scenario);
 assert.equal(pc(e).config.ipv4.address,null);
 assert.equal(req(e,"init").status,"applied");
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
 assert.equal(pc(e).config.ipv4.prefix,24);
 assert.equal(pc(e).config.ipv4.lease.expires,86400);
 assert.deepEqual(pc(e).config.networkOptions,{gateway:"192.168.10.1",dns:["192.168.10.10","1.1.1.1"]});
 assert.equal(ping(e).success,true);
});
test("DHCP-02: serveur inactif avant premier bail donne APIPA sans passerelle",()=>{
 const e=createEngine(scenario);
 assert.equal(e.dispatch(command("off","dhcp.setServerEnabled","srv-dhcp",{enabled:false})).status,"applied");
 req(e,"first");
 assert.equal(pc(e).config.ipv4.address,"169.254.10.20");
 assert.equal(pc(e).config.ipv4.prefix,16);
 assert.equal(pc(e).config.ipv4.lease,null);
 assert.deepEqual(pc(e).config.networkOptions,{gateway:null,dns:[]});
 assert.equal(ping(e).success,false);
});
test("DHCP-03: interruption câble provoque APIPA sans offre",()=>{
 const e=createEngine(scenario);
 e.dispatch(command("unplug","network.setLinkConnected","cable-dhcp-server",{connected:false}));
 req(e,"first");assert.equal(pc(e).config.ipv4.address,"169.254.10.20");
 e.dispatch(command("plug","network.setLinkConnected","cable-dhcp-server",{connected:true}));
 req(e,"again");assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
});
test("DHCP-04: serveur coupé après bail, conserver bail au renouvellement infructueux",()=>{
 const e=createEngine(scenario);
 req(e,"first");const old=structuredClone(pc(e).config);
 e.dispatch(command("off","dhcp.setServerEnabled","srv-dhcp",{enabled:false}));
 req(e,"renew");
 assert.deepEqual(pc(e).config,old);
 assert.equal(e.getSnapshot().runtime["pc-dhcp"].dhcpStatus,"lease-retained");
 assert.equal(ping(e).success,true);
});
test("DHCP-05: restauration conserve bail et révision",()=>{
 const e=createEngine(scenario);req(e,"init");
 const save=e.exportState();
 assert.deepEqual(restoreEngine(scenario,save).exportState(),save);
});
test("DHCP-06: refus atomiques du serveur et client erronés",()=>{
 const e=createEngine(scenario),before=e.exportState();
 assert.equal(e.dispatch(command("bad","dhcp.setServerEnabled","srv-dhcp",{enabled:"non"})).status,"rejected");
 assert.equal(e.dispatch(command("bad2","dhcp.request","printer-dhcp")).status,"rejected");
 assert.deepEqual(e.exportState(),before);
});
test("DHCP-07: fonctionnement du laboratoire IPv4 statique préservé",()=>{
 const e=createEngine(scenario);
 assert.equal(e.query({type:"network.ping",sourceId:"srv-dhcp",targetId:"printer-dhcp"}).success,true);
});


test("DHCP-08: release supprime IPv4, bail, passerelle et DNS",()=>{
 const e=createEngine(scenario);
 req(e,"init");
 assert.equal(e.dispatch(command("release","dhcp.release","pc-dhcp")).status,"applied");
 assert.equal(pc(e).config.ipv4.address,null);
 assert.equal(pc(e).config.ipv4.prefix,null);
 assert.equal(pc(e).config.ipv4.lease,null);
 assert.deepEqual(pc(e).config.networkOptions,{gateway:null,dns:[]});
 assert.equal(e.getSnapshot().runtime["pc-dhcp"].dhcpStatus,"released");
 assert.equal(ping(e).success,false);
 assert.deepEqual(restoreEngine(scenario,e.exportState()).exportState(),e.exportState());
});
test("DHCP-09: renew seul conserve bail valide si serveur éteint",()=>{
 const e=createEngine(scenario);
 req(e,"first");e.dispatch(command("stop","dhcp.setServerEnabled","srv-dhcp",{enabled:false}));
 req(e,"renew");
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
 assert.equal(e.getSnapshot().runtime["pc-dhcp"].dhcpStatus,"lease-retained");
});
test("DHCP-10: release puis renew sans serveur donne APIPA",()=>{
 const e=createEngine(scenario);
 req(e,"first");
 e.dispatch(command("stop","dhcp.setServerEnabled","srv-dhcp",{enabled:false}));
 e.dispatch(command("release","dhcp.release","pc-dhcp"));
 req(e,"renew");
 assert.equal(pc(e).config.ipv4.address,"169.254.10.20");
 assert.equal(pc(e).config.ipv4.prefix,16);
 assert.equal(pc(e).config.ipv4.lease,null);
 assert.equal(ping(e).success,false);
});
test("DHCP-11: release puis renew avec serveur actif donne un nouveau bail",()=>{
 const e=createEngine(scenario);req(e,"first");
 e.dispatch(command("release","dhcp.release","pc-dhcp"));
 req(e,"renew");
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
 assert.ok(pc(e).config.ipv4.lease);
});
test("DHCP-12: release d'un équipement statique refusé sans effet",()=>{
 const e=createEngine(scenario),before=e.exportState();
 assert.equal(e.dispatch(command("bad-release","dhcp.release","printer-dhcp")).status,"rejected");
 assert.deepEqual(e.exportState(),before);
});


const advance=(e,id,seconds)=>e.dispatch(command(id,"dhcp.advanceTime","srv-dhcp",{seconds}));
test("DHCP-TIME-01 : renouvellement automatique à T1, nouvelle échéance",()=>{
 const e=createEngine(scenario);
 req(e,"init");
 assert.equal(advance(e,"t1",43200).status,"applied");
 const snap=e.getSnapshot(),lease=pc(e).config.ipv4.lease;
 assert.equal(snap.simulationClock,43200);
 assert.equal(lease.start,43200);
 assert.equal(lease.expires,129600);
 assert.equal(snap.runtime["pc-dhcp"].dhcpLeasePhase,"renewed-t1");
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
});
test("DHCP-TIME-02 : T1 et T2 échouent sans serveur, bail conservé jusqu'à l'expiration",()=>{
 const e=createEngine(scenario);
 req(e,"init");
 e.dispatch(command("off","dhcp.setServerEnabled","srv-dhcp",{enabled:false}));
 advance(e,"t1",43200);
 assert.equal(e.getSnapshot().runtime["pc-dhcp"].dhcpLeasePhase,"t1-failed");
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
 advance(e,"t2",32400);
 assert.equal(e.getSnapshot().runtime["pc-dhcp"].dhcpLeasePhase,"t2-failed");
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
 advance(e,"preexpiry",10799);
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
 advance(e,"expiry",1);
 assert.equal(e.getSnapshot().runtime["pc-dhcp"].dhcpStatus,"expired");
 assert.equal(pc(e).config.ipv4.address,null);
 assert.equal(pc(e).config.ipv4.lease,null);
 assert.deepEqual(pc(e).config.networkOptions,{gateway:null,dns:[]});
 assert.equal(ping(e).success,false);
 req(e,"retry");
 assert.equal(pc(e).config.ipv4.address,"169.254.10.20");
});
test("DHCP-TIME-03 : reconnexion serveur avant T2 renouvelle le bail",()=>{
 const e=createEngine(scenario);req(e,"init");
 e.dispatch(command("off","dhcp.setServerEnabled","srv-dhcp",{enabled:false}));
 advance(e,"t1",43200);
 e.dispatch(command("on","dhcp.setServerEnabled","srv-dhcp",{enabled:true}));
 advance(e,"t2",32400);
 assert.equal(pc(e).config.ipv4.lease.start,75600);
 assert.equal(e.getSnapshot().runtime["pc-dhcp"].dhcpLeasePhase,"renewed-t2");
 assert.equal(pc(e).config.ipv4.address,"192.168.10.100");
});
test("DHCP-TIME-04 : avancement invalide rejeté sans mutation",()=>{
 const e=createEngine(scenario),before=e.exportState();
 assert.equal(advance(e,"zero",0).status,"rejected");
 assert.equal(advance(e,"negative",-50).status,"rejected");
 assert.equal(advance(e,"fraction",12.5).status,"rejected");
 assert.equal(advance(e,"too-big",604801).status,"rejected");
 assert.deepEqual(e.exportState(),before);
});
test("DHCP-TIME-05 : restauration du temps simulé et du bail",()=>{
 const e=createEngine(scenario);req(e,"init");
 advance(e,"t1",43200);
 const saved=e.exportState();
 assert.deepEqual(restoreEngine(scenario,saved).exportState(),saved);
});

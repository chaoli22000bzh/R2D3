import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine, restoreEngine} from "../src/r2d3-core.js";

const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dhcp-admin-v1.json",import.meta.url),"utf8"));
const issue=(e,id,type,targetId,params={})=>e.dispatch({id,commandVersion:1,type,targetId,params});
const configure=(e,id,params)=>issue(e,id,"dhcp.configurePool","srv-dhcp",params);
const request=(e,id,pc)=>issue(e,id,"dhcp.request",pc);
const advance=(e,id,hours)=>issue(e,id,"dhcp.advanceTime","srv-dhcp",{seconds:hours*3600});
const lease=(e,pc)=>e.getSnapshot().objectsById[pc].config.ipv4.lease;
const address=(e,pc)=>e.getSnapshot().objectsById[pc].config.ipv4.address;

test("CONSOL-DHCP-01 : modification de duree conserve les anciens baux et regle les nouveaux",()=>{
 const e=createEngine(scenario);
 assert.equal(request(e,"initial","pc-dhcp-01").status,"applied");
 const before=structuredClone(lease(e,"pc-dhcp-01"));
 assert.equal(configure(e,"change-duration",{leaseSeconds:3600}).status,"applied");
 assert.deepEqual(lease(e,"pc-dhcp-01"),before);
 assert.equal(request(e,"new-client","pc-dhcp-02").status,"applied");
 assert.equal(lease(e,"pc-dhcp-02").expires-lease(e,"pc-dhcp-02").start,3600);
 assert.equal(request(e,"renew-old","pc-dhcp-01").status,"applied");
 assert.equal(lease(e,"pc-dhcp-01").expires-lease(e,"pc-dhcp-01").start,3600);
});
test("CONSOL-DHCP-02 : bail une heure, renouvellement T1 au bout de 30 minutes",()=>{
 const e=createEngine(scenario);
 configure(e,"one-hour",{leaseSeconds:3600});
 request(e,"initial","pc-dhcp-01");
 assert.equal(issue(e,"half-hour","dhcp.advanceTime","srv-dhcp",{seconds:1800}).status,"applied");
 assert.equal(e.getSnapshot().runtime["pc-dhcp-01"].dhcpLeasePhase,"renewed-t1");
 assert.deepEqual(lease(e,"pc-dhcp-01"),{serverId:"srv-dhcp",start:1800,expires:5400});
});
test("CONSOL-DHCP-03 : changement de plage ne supprime pas le bail ancien, mais empeche son renouvellement automatique",()=>{
 const e=createEngine(scenario);
 request(e,"initial","pc-dhcp-01");
 configure(e,"move-range",{start:"192.168.10.105",end:"192.168.10.110"});
 assert.equal(address(e,"pc-dhcp-01"),"192.168.10.100");
 advance(e,"t1",12);
 assert.equal(address(e,"pc-dhcp-01"),"192.168.10.100");
 assert.equal(e.getSnapshot().runtime["pc-dhcp-01"].dhcpLeasePhase,"t1-failed");
 assert.equal(lease(e,"pc-dhcp-01").expires,86400);
});
test("CONSOL-DHCP-04 : reservation differente empeche le renouvellement T1 de l'ancienne IP",()=>{
 const e=createEngine(scenario);
 request(e,"initial","pc-dhcp-02");
 assert.equal(address(e,"pc-dhcp-02"),"192.168.10.100");
 configure(e,"reserve-new",{reservations:[{mac:"02-52-32-44-33-02",address:"192.168.10.105"}]});
 advance(e,"t1",12);
 assert.equal(e.getSnapshot().runtime["pc-dhcp-02"].dhcpLeasePhase,"t1-failed");
 assert.equal(address(e,"pc-dhcp-02"),"192.168.10.100");
});
test("CONSOL-DHCP-05 : configuration invalide et restauration sans mutation implicite",()=>{
 const e=createEngine(scenario);
 request(e,"initial","pc-dhcp-01");
 const before=e.exportState();
 assert.equal(configure(e,"bad",{leaseSeconds:0}).status,"rejected");
 assert.deepEqual(e.exportState(),before);
 assert.deepEqual(restoreEngine(scenario,e.exportState()).exportState(),e.exportState());
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dhcp-deux-pc-v1.json",import.meta.url),"utf8"));
const issue=(e,id,type,targetId,params={})=>e.dispatch({id,commandVersion:1,type,targetId,params});
const renew=(e,id,pc)=>issue(e,id,"dhcp.request",pc);
const release=(e,id,pc)=>issue(e,id,"dhcp.release",pc);
const address=(e,id)=>e.getSnapshot().objectsById[id].config.ipv4.address;
const ping=(e,id)=>e.query({type:"network.ping",sourceId:id,targetId:"printer-dhcp"}).success;
test("MULTI-01: deux PC reçoivent .100 et .101 sans duplication",()=>{
 const e=createEngine(scenario);
 assert.equal(renew(e,"r1","pc-dhcp-01").status,"applied");
 assert.equal(renew(e,"r2","pc-dhcp-02").status,"applied");
 assert.equal(address(e,"pc-dhcp-01"),"192.168.10.100");
 assert.equal(address(e,"pc-dhcp-02"),"192.168.10.101");
 assert.equal(ping(e,"pc-dhcp-01"),true);
 assert.equal(ping(e,"pc-dhcp-02"),true);
});
test("MULTI-02: renouvellement d'un PC n'écrase pas l'autre",()=>{
 const e=createEngine(scenario);
 renew(e,"r1","pc-dhcp-01");renew(e,"r2","pc-dhcp-02");
 const snapshot=e.getSnapshot().objectsById["pc-dhcp-02"];
 renew(e,"renew-again","pc-dhcp-01");
 assert.deepEqual(e.getSnapshot().objectsById["pc-dhcp-02"],snapshot);
 assert.equal(address(e,"pc-dhcp-01"),"192.168.10.100");
});
test("MULTI-03: câble PC 2 débranché, lease PC 1 conservé",()=>{
 const e=createEngine(scenario);
 renew(e,"r1","pc-dhcp-01");renew(e,"r2","pc-dhcp-02");
 issue(e,"cut","network.setLinkConnected","cable-dhcp-pc-02",{connected:false});
 release(e,"release2","pc-dhcp-02");
 renew(e,"renew2","pc-dhcp-02");
 assert.equal(address(e,"pc-dhcp-02"),"169.254.10.21");
 assert.equal(address(e,"pc-dhcp-01"),"192.168.10.100");
 assert.equal(ping(e,"pc-dhcp-01"),true);
 assert.equal(ping(e,"pc-dhcp-02"),false);
 issue(e,"plug","network.setLinkConnected","cable-dhcp-pc-02",{connected:true});
 renew(e,"recover","pc-dhcp-02");
 assert.equal(address(e,"pc-dhcp-02"),"192.168.10.101");
});
test("MULTI-04: panne service puis release+renew donne deux APIPA distinctes",()=>{
 const e=createEngine(scenario);
 renew(e,"r1","pc-dhcp-01");renew(e,"r2","pc-dhcp-02");
 issue(e,"off","dhcp.setServerEnabled","srv-dhcp",{enabled:false});
 renew(e,"renew-only","pc-dhcp-01");
 assert.equal(address(e,"pc-dhcp-01"),"192.168.10.100");
 release(e,"release1","pc-dhcp-01");release(e,"release2","pc-dhcp-02");
 renew(e,"apipa1","pc-dhcp-01");renew(e,"apipa2","pc-dhcp-02");
 assert.equal(address(e,"pc-dhcp-01"),"169.254.10.20");
 assert.equal(address(e,"pc-dhcp-02"),"169.254.10.21");
 assert.deepEqual(restoreEngine(scenario,e.exportState()).exportState(),e.exportState());
});
test("MULTI-05: allocation dans l'ordre des demandes, PC 2 puis PC 1",()=>{
 const e=createEngine(scenario);
 renew(e,"r2","pc-dhcp-02");renew(e,"r1","pc-dhcp-01");
 assert.equal(address(e,"pc-dhcp-02"),"192.168.10.100");
 assert.equal(address(e,"pc-dhcp-01"),"192.168.10.101");
});

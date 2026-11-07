import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-arp-windows-v1.json",import.meta.url),"utf8"));
function cmd(e,id,type,targetId,params={}){return e.dispatch({id,type,targetId,params,commandVersion:1});}
const arp=(e,id)=>e.query({type:"network.arpTable",sourceId:id}).entries;
test("ARP-01 les caches demarrent vides et sont distincts",()=>{
 const e=createEngine(scenario);
 assert.deepEqual(arp(e,"pc-dhcp-01"),[]);assert.deepEqual(arp(e,"pc-dhcp-02"),[]);
 assert.equal(e.query({type:"network.ping",sourceId:"pc-dhcp-01",targetId:"printer-dhcp"}).success,true);
 assert.equal(cmd(e,"learn","network.arpLearn","pc-dhcp-01",{peerId:"printer-dhcp"}).status,"applied");
 assert.deepEqual(arp(e,"pc-dhcp-01"),[{address:"192.168.10.50",mac:"02-52-32-41-00-50",type:"dynamique"}]);
 assert.deepEqual(arp(e,"pc-dhcp-02"),[]);
});
test("ARP-02 apprend imprimante et PC sans doublons",()=>{
 const e=createEngine(scenario);
 cmd(e,"a","network.arpLearn","pc-dhcp-01",{peerId:"printer-dhcp"});
 cmd(e,"b","network.arpLearn","pc-dhcp-01",{peerId:"pc-dhcp-02"});
 cmd(e,"c","network.arpLearn","pc-dhcp-01",{peerId:"printer-dhcp"});
 assert.equal(arp(e,"pc-dhcp-01").length,2);
 assert.equal(arp(e,"pc-dhcp-01")[0].address,"192.168.10.21");
 assert.deepEqual(restoreEngine(scenario,e.exportState()).exportState(),e.exportState());
});
test("ARP-03 arp -d * vide uniquement le cache du poste choisi",()=>{
 const e=createEngine(scenario);
 cmd(e,"a","network.arpLearn","pc-dhcp-01",{peerId:"printer-dhcp"});
 cmd(e,"b","network.arpLearn","pc-dhcp-02",{peerId:"printer-dhcp"});
 assert.equal(cmd(e,"clear","network.arpClear","pc-dhcp-01").status,"applied");
 assert.deepEqual(arp(e,"pc-dhcp-01"),[]);
 assert.equal(arp(e,"pc-dhcp-02").length,1);
});
test("ARP-04 changement IPv4 concurrent empeche un nouvel apprentissage",()=>{
 const e=createEngine(scenario);
 cmd(e,"duplicate","network.setIPv4","pc-dhcp-02",{interfaceId:"eth0",mode:"static",address:"192.168.10.50",prefix:24});
 assert.equal(e.query({type:"network.ping",sourceId:"pc-dhcp-01",targetId:"printer-dhcp"}).success,false);
 const before=e.exportState();
 assert.equal(cmd(e,"learn","network.arpLearn","pc-dhcp-01",{peerId:"printer-dhcp"}).status,"rejected");
 assert.deepEqual(e.exportState(),before);
});
test("ARP-05 commandes ARP invalides refusees sans mutation",()=>{
 const e=createEngine(scenario),before=e.exportState();
 assert.equal(cmd(e,"bad","network.arpLearn","pc-dhcp-01",{peerId:"sw-dhcp"}).status,"rejected");
 assert.equal(cmd(e,"bad2","network.arpClear","ghost").status,"rejected");
 assert.deepEqual(e.exportState(),before);
});

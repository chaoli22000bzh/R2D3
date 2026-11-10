import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dns-cache-v1.json",import.meta.url),"utf8"));
let sequence=0;
function send(e,type,targetId,params={}){
 const result=e.dispatch({id:"dhcp-apipa-"+(++sequence),commandVersion:1,type,targetId,params});
 assert.equal(result.status,"applied",JSON.stringify(result));
}
function setup(){
 const e=createEngine(scenario);
 send(e,"dhcp.request","pc-dhcp-01");
 return e;
}
const pc=e=>e.getSnapshot().objectsById["pc-dhcp-01"].config;
test("EXPIRY-01 : bail encore valide apres echec T1 T2",()=>{
 const e=setup();
 send(e,"dhcp.setServerEnabled","srv-dhcp",{enabled:false});
 send(e,"simulation.advanceTime","simulation-clock",{seconds:75600});
 assert.equal(pc(e).ipv4.address,"192.168.10.100");
 assert.equal(pc(e).ipv4.lease.expires,86400);
 assert.equal(e.getSnapshot().runtime["pc-dhcp-01"].dhcpLeasePhase,"t2-failed");
});
test("EXPIRY-02 : expiration sans serveur donne APIPA et efface DNS/passerelle",()=>{
 const e=setup();
 send(e,"dhcp.setServerEnabled","srv-dhcp",{enabled:false});
 send(e,"simulation.advanceTime","simulation-clock",{seconds:86400});
 const c=pc(e);
 assert.match(c.ipv4.address,/^169\.254\./);
 assert.equal(c.ipv4.prefix,16);
 assert.equal(c.ipv4.lease,null);
 assert.deepEqual(c.networkOptions,{gateway:null,dns:[]});
 assert.equal(e.getSnapshot().runtime["pc-dhcp-01"].dhcpLeasePhase,"expired-apipa");
});
test("EXPIRY-03 : apres redemarrage DHCP, demande obtient IPv4 normale",()=>{
 const e=setup();
 send(e,"dhcp.setServerEnabled","srv-dhcp",{enabled:false});
 send(e,"simulation.advanceTime","simulation-clock",{seconds:86400});
 send(e,"dhcp.setServerEnabled","srv-dhcp",{enabled:true});
 send(e,"dhcp.request","pc-dhcp-01");
 assert.equal(pc(e).ipv4.address,"192.168.10.100");
 assert.deepEqual(pc(e).networkOptions.dns,["192.168.10.10","1.1.1.1"]);
});
test("EXPIRY-04 : serveur actif renouvelle T1 et ne passe pas en APIPA",()=>{
 const e=setup();
 send(e,"simulation.advanceTime","simulation-clock",{seconds:86400});
 assert.equal(pc(e).ipv4.address,"192.168.10.100");
 assert.ok(pc(e).ipv4.lease);
 assert.ok(pc(e).ipv4.lease.expires>86400);
});
test("EXPIRY-05 : commande historique DHCP garde même comportement",()=>{
 const e=setup();
 send(e,"dhcp.setServerEnabled","srv-dhcp",{enabled:false});
 send(e,"dhcp.advanceTime","srv-dhcp",{seconds:86400});
 assert.match(pc(e).ipv4.address,/^169\.254\./);
});

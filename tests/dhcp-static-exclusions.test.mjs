import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine} from "../src/r2d3-core.js";

const base=JSON.parse(readFileSync(new URL("../scenarios/atelier-dhcp-admin-v1.json",import.meta.url),"utf8"));
function scenarioSixClients(){
 const s=structuredClone(base);
 const robot=s.objects.find(o=>o.id==="printer-dhcp");
 robot.name="Robot industriel";
 robot.config.ipv4.address="192.168.10.105";
 const sw=s.objects.find(o=>o.id==="sw-dhcp");
 const template=s.objects.find(o=>o.id==="pc-dhcp-02");
 for(let number=3;number<=6;number++){
   const id="pc-dhcp-0"+number;
   const pc=structuredClone(template);
   pc.id=id;pc.name="PC"+number;pc.config.macAddress="02-52-32-44-33-0"+number;
   pc.config.ipv4.address=null;pc.config.ipv4.prefix=null;pc.config.ipv4.lease=null;
   s.objects.push(pc);
   sw.ports.push({id:String(number+1),type:"rj45"});
   s.links.push({id:"cable-dhcp-"+id,kind:"ethernet-cable",endpoints:[
     {objectId:id,portId:"eth0"},{objectId:"sw-dhcp",portId:String(number+1)}
   ],connected:true});
 }
 return s;
}
const clients=Array.from({length:6},(_,i)=>"pc-dhcp-0"+(i+1));
const command=(engine,id,type,targetId,params={})=>engine.dispatch({id,commandVersion:1,type,targetId,params});
const obtainSix=(engine)=>clients.map((client,i)=>{
 assert.equal(command(engine,"client-"+i,"dhcp.request",client).status,"applied");
 return engine.getSnapshot().objectsById[client].config.ipv4.address;
});
test("STATIC-01 : sans exclusion, une IP statique n'est pas connue du DHCP",()=>{
 const e=createEngine(scenarioSixClients());
 assert.deepEqual(obtainSix(e),[100,101,102,103,104,105].map(n=>"192.168.10."+n));
 assert.equal(e.query({type:"network.ipv4Conflicts"}).conflicts.length,1);
 assert.equal(e.query({type:"network.ping",sourceId:"pc-dhcp-06",targetId:"printer-dhcp"}).success,false);
});
test("STATIC-02 : exclusion explicite de .105 fait passer le sixieme PC a .106",()=>{
 const e=createEngine(scenarioSixClients());
 assert.equal(command(e,"exclude","dhcp.configurePool","srv-dhcp",{exclusions:["192.168.10.105"]}).status,"applied");
 assert.deepEqual(obtainSix(e),[100,101,102,103,104,106].map(n=>"192.168.10."+n));
 assert.equal(e.query({type:"network.ipv4Conflicts"}).conflicts.length,0);
});
test("STATIC-03 : aucun bail DHCP actif n'est attribue deux fois",()=>{
 const e=createEngine(scenarioSixClients());
 const addresses=obtainSix(e);
 assert.equal(new Set(addresses).size,6);
 assert.equal(e.query({type:"dhcp.leases",serverId:"srv-dhcp"}).leases.length,6);
});
test("STATIC-04 : conflit statique ajoute apres bail et renouvellement T1",()=>{
 const s=scenarioSixClients();s.objects.find(o=>o.id==="printer-dhcp").config.ipv4.address="192.168.10.50";
 const e=createEngine(s);
 assert.equal(command(e,"first","dhcp.request","pc-dhcp-01").status,"applied");
 assert.equal(command(e,"static","network.setIPv4","printer-dhcp",{mode:"static",interfaceId:"eth0",address:"192.168.10.100",prefix:24}).status,"applied");
 assert.equal(e.query({type:"network.ipv4Conflicts"}).conflicts.length,1);
 assert.equal(command(e,"time","dhcp.advanceTime","srv-dhcp",{seconds:43200}).status,"applied");
 assert.equal(e.getSnapshot().runtime["pc-dhcp-01"].dhcpLeasePhase,"renewed-t1");
 assert.equal(e.query({type:"network.ipv4Conflicts"}).conflicts.length,1);
});
test("STATIC-05 : reservation MAC et exclusion restent prioritaires",()=>{
 const e=createEngine(scenarioSixClients());
 assert.equal(command(e,"reserve","dhcp.configurePool","srv-dhcp",{reservations:[{mac:"02-52-32-44-33-02",address:"192.168.10.110"}],exclusions:["192.168.10.105"]}).status,"applied");
 assert.equal(command(e,"first","dhcp.request","pc-dhcp-01").status,"applied");
 assert.equal(command(e,"second","dhcp.request","pc-dhcp-02").status,"applied");
 assert.equal(e.getSnapshot().objectsById["pc-dhcp-02"].config.ipv4.address,"192.168.10.110");
});

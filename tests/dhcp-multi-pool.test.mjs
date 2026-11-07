import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
const scenario=JSON.parse(readFileSync(new URL("../scenarios/atelier-dhcp-multi-pool-v1.json",import.meta.url),"utf8"));
const issue=(e,id,type,targetId,params={})=>e.dispatch({id,commandVersion:1,type,targetId,params});
const request=(e,id,client,poolId)=>issue(e,id,"dhcp.request",client,{serverId:"srv-dhcp",poolId});
const pc=(e,id)=>e.getSnapshot().objectsById[id].config.ipv4;
const pools=e=>e.getSnapshot().objectsById["srv-dhcp"].config.dhcpPools;
test("MULTIPOOL-01 : deux pools, deux allocations et durees distinctes",()=>{
 const e=createEngine(scenario);
 assert.equal(issue(e,"duration","dhcp.updatePool","srv-dhcp",{poolId:"reseau-b",changes:{leaseSeconds:3600}}).status,"applied");
 assert.equal(request(e,"pc1","pc-dhcp-01","reseau-a").status,"applied");
 assert.equal(request(e,"pc2","pc-dhcp-02","reseau-b").status,"applied");
 assert.equal(pc(e,"pc-dhcp-01").address,"192.168.10.100");
 assert.equal(pc(e,"pc-dhcp-02").address,"192.168.20.100");
 assert.equal(pc(e,"pc-dhcp-01").lease.poolId,"reseau-a");
 assert.equal(pc(e,"pc-dhcp-02").lease.poolId,"reseau-b");
 assert.equal(pc(e,"pc-dhcp-01").lease.expires,86400);
 assert.equal(pc(e,"pc-dhcp-02").lease.expires,3600);
});
test("MULTIPOOL-02 : sans choix explicite, aucun pool invente",()=>{
 const e=createEngine(scenario),before=e.exportState();
 assert.equal(issue(e,"no-pool","dhcp.request","pc-dhcp-01").code,"dhcp_pool_required");
 assert.deepEqual(e.exportState(),before);
});
test("MULTIPOOL-03 : modifier B ne change pas A ni les anciens baux",()=>{
 const e=createEngine(scenario);
 request(e,"pc1","pc-dhcp-01","reseau-a");request(e,"pc2","pc-dhcp-02","reseau-b");
 const a=structuredClone(pc(e,"pc-dhcp-01").lease),b=structuredClone(pc(e,"pc-dhcp-02").lease);
 assert.equal(issue(e,"update","dhcp.updatePool","srv-dhcp",{poolId:"reseau-b",changes:{leaseSeconds:7200}}).status,"applied");
 assert.deepEqual(pc(e,"pc-dhcp-01").lease,a);
 assert.deepEqual(pc(e,"pc-dhcp-02").lease,b);
 assert.equal(request(e,"renew-b","pc-dhcp-02","reseau-b").status,"applied");
 assert.equal(pc(e,"pc-dhcp-02").lease.expires,7200);
 assert.deepEqual(pc(e,"pc-dhcp-01").lease,a);
});
test("MULTIPOOL-04 : supprimer B laisse le bail client jusqu'a expiration",()=>{
 const e=createEngine(scenario);
 request(e,"pc1","pc-dhcp-01","reseau-a");request(e,"pc2","pc-dhcp-02","reseau-b");
 assert.equal(issue(e,"remove","dhcp.removePool","srv-dhcp",{poolId:"reseau-b"}).status,"applied");
 assert.equal(pools(e).length,1);
 assert.equal(pc(e,"pc-dhcp-02").address,"192.168.20.100");
 assert.equal(issue(e,"advance","dhcp.advanceTime","srv-dhcp",{seconds:86400}).status,"applied");
 assert.equal(pc(e,"pc-dhcp-02").lease,null);
 assert.equal(pc(e,"pc-dhcp-01").lease.start,86400);
});
test("MULTIPOOL-05 : ajout et validation atomique, pas de recouvrement",()=>{
 const e=createEngine(scenario),before=e.exportState();
 assert.equal(issue(e,"overlap","dhcp.addPool","srv-dhcp",{pool:{...pools(e)[0],id:"copie"}}).status,"rejected");
 assert.deepEqual(e.exportState(),before);
 assert.equal(issue(e,"duplicate","dhcp.addPool","srv-dhcp",{pool:{...pools(e)[0],id:"reseau-b",start:"192.168.30.100",end:"192.168.30.110"}}).status,"rejected");
 assert.deepEqual(e.exportState(),before);
 assert.equal(issue(e,"new","dhcp.addPool","srv-dhcp",{pool:{...pools(e)[0],id:"reseau-c",start:"192.168.30.100",end:"192.168.30.110"}}).status,"applied");
 assert.equal(pools(e).length,3);
});
test("MULTIPOOL-06 : reservations par pool et export restauration",()=>{
 const e=createEngine(scenario);
 assert.equal(issue(e,"reserve","dhcp.updatePool","srv-dhcp",{poolId:"reseau-b",changes:{reservations:[{mac:"02-52-32-44-33-02",address:"192.168.20.105"}]}}).status,"applied");
 request(e,"pc2","pc-dhcp-02","reseau-b");
 assert.equal(pc(e,"pc-dhcp-02").address,"192.168.20.105");
 const saved=e.exportState();
 assert.deepEqual(restoreEngine(scenario,saved).exportState(),saved);
});

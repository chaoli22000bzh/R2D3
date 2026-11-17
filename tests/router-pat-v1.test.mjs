import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {createEngine} from "../src/r2d3-core.js";
import {addRouterPatRule,setRouterPatRuleEnabled,removeRouterPatRule,getRouterPatRules,observeInboundPat} from "../src/router-pat-v1.js";
function fixture(){
 const r=createAssetRegistry(),router=createRouter(r,{name:"RTR-01"}).asset;
 const p=r.createProfile("Poste RJ45").profile;
 assert.ok(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"NIC",start:1,count:1}).success);
 const outside=r.createAsset(p.id,{name:"CLIENT-EXT"}).asset,server=r.createAsset(p.id,{name:"SRV-HTTP"}).asset;
 const cable=(x,y)=>{const c=r.createCable().cable;assert.ok(r.connectCableEnd(c.id,0,x).success);assert.ok(r.connectCableEnd(c.id,1,y).success);return c.id;};
 const extCable=cable(outside.ports[0].id,router.ports[0].id);
 const internalCable=cable(server.ports[0].id,router.ports[1].id);
 assert.ok(configureRouterPort(r,router.id,router.ports[0].id,{role:"wan",mode:"static",address:"203.0.113.10",prefix:24}).success);
 assert.ok(configureRouterPort(r,router.id,router.ports[1].id,{role:"lan",mode:"static",address:"192.168.10.1",prefix:24}).success);
 const ips={
  [outside.id]:{address:"203.0.113.20",prefix:24,gateway:"203.0.113.10"},
  [server.id]:{address:"192.168.10.10",prefix:24,gateway:"192.168.10.1"}
 };
 const engine=createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"pat-service",scenarioVersion:"1.0.0",capabilities:{network:true},objects:[{id:server.id,kind:"ethernet-endpoint",name:server.name,ports:[{id:server.ports[0].id,type:"rj45"}],config:{ipv4:{interfaceId:server.ports[0].id,mode:"static",address:"192.168.10.10",prefix:24},applicationServices:{http:true}},runtime:{}}],links:[]});
 const request={wanAddress:"203.0.113.10",protocol:"tcp",port:8080,service:"http"};
 const rule={wanPortId:router.ports[0].id,protocol:"tcp",externalPort:8080,internalAddress:"192.168.10.10",internalPort:80,enabled:true};
 const probe=()=>observeInboundPat(r,router.id,outside.id,server.id,ips,request,engine);
 return {r,router,outside,server,ips,engine,request,rule,probe,extCable,internalCable};
}
test("PAT-01 règle HTTP active : accès autorisé",()=>{
 const f=fixture();assert.equal(f.probe().success,false);
 assert.ok(addRouterPatRule(f.r,f.router.id,f.rule).success);
 assert.equal(f.probe().success,true);
});
test("PAT-02 désactivation de règle coupe l'accès, réactivation rétablit",()=>{
 const f=fixture(),added=addRouterPatRule(f.r,f.router.id,f.rule);
 assert.ok(added.success);assert.ok(setRouterPatRuleEnabled(f.r,f.router.id,added.rule.id,false).success);
 assert.equal(f.probe().success,false);
 assert.ok(setRouterPatRuleEnabled(f.r,f.router.id,added.rule.id,true).success);
 assert.equal(f.probe().success,true);
});
test("PAT-03 même WAN protocole port = conflit atomique ; UDP distinct autorisé",()=>{
 const f=fixture();assert.ok(addRouterPatRule(f.r,f.router.id,f.rule).success);
 const snapshot=f.r.exportState();
 assert.equal(addRouterPatRule(f.r,f.router.id,{...f.rule,internalPort:81}).success,false);
 assert.deepEqual(f.r.exportState(),snapshot);
 assert.ok(addRouterPatRule(f.r,f.router.id,{...f.rule,protocol:"udp"}).success);
});
test("PAT-04 mauvais port externe, mauvais protocole et service arrêté",()=>{
 const f=fixture();assert.ok(addRouterPatRule(f.r,f.router.id,f.rule).success);
 assert.equal(observeInboundPat(f.r,f.router.id,f.outside.id,f.server.id,f.ips,{...f.request,port:8081},f.engine).success,false);
 assert.equal(observeInboundPat(f.r,f.router.id,f.outside.id,f.server.id,f.ips,{...f.request,protocol:"udp"},f.engine).success,false);
 const d=f.engine.dispatch({commandVersion:1,id:"stop-http",type:"network.setApplicationService",targetId:f.server.id,params:{service:"http",enabled:false}});
 assert.equal(d.status,"applied");assert.equal(f.probe().success,false);
});
test("PAT-05 câblage, passerelle et réseau interne ont un effet",()=>{
 const f=fixture();assert.ok(addRouterPatRule(f.r,f.router.id,f.rule).success);
 f.ips[f.server.id].gateway="192.168.10.254";assert.equal(f.probe().success,false);
 f.ips[f.server.id].gateway="192.168.10.1";
 assert.ok(f.r.disconnectCableEnd(f.internalCable,1).success);
 assert.equal(f.probe().success,false);
 assert.ok(f.r.connectCableEnd(f.internalCable,1,f.router.ports[1].id).success);
 assert.equal(f.probe().success,true);
});
test("PAT-06 règles conservées après restauration et suppression effective",()=>{
 const f=fixture(),added=addRouterPatRule(f.r,f.router.id,f.rule);
 assert.ok(added.success);
 const restored=restoreAssetRegistry(f.r.exportState());
 assert.deepEqual(getRouterPatRules(restored,f.router.id),getRouterPatRules(f.r,f.router.id));
 assert.ok(removeRouterPatRule(f.r,f.router.id,added.rule.id).success);
 assert.equal(f.probe().success,false);
});
test("PAT-07 règle WAN ne crée pas un accès sans service pris en charge",()=>{
 const f=fixture();assert.ok(addRouterPatRule(f.r,f.router.id,{...f.rule,internalPort:22}).success);
 const result=f.probe();assert.equal(result.status,"unavailable");assert.equal(result.success,false);
});

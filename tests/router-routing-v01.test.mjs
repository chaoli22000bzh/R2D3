import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {observeRouterPing} from "../src/router-routing-v01.js";
function fixture(){
 const r=createAssetRegistry(),router=createRouter(r,{name:"RTR-01"}).asset;
 const profile=r.createProfile("PC Ethernet").profile;
 assert.equal(r.addPortGroup(profile.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success,true);
 const pc1=r.createAsset(profile.id,{name:"PC1"}).asset,pc2=r.createAsset(profile.id,{name:"PC2"}).asset;
 const cable=(p,q)=>{const c=r.createCable().cable;assert.ok(r.connectCableEnd(c.id,0,p).success);assert.ok(r.connectCableEnd(c.id,1,q).success);return c;};
 const c1=cable(pc1.ports[0].id,router.ports[1].id),c2=cable(pc2.ports[0].id,router.ports[2].id);
 const change=(port,address)=>assert.ok(configureRouterPort(r,router.id,port.id,{role:"lan",mode:"static",address,prefix:24,gateway:""}).success);
 change(router.ports[1],"192.168.10.1");
 change(router.ports[2],"192.168.20.1");
 const addresses={
  [pc1.id]:{address:"192.168.10.10",prefix:24,gateway:"192.168.10.1"},
  [pc2.id]:{address:"192.168.20.10",prefix:24,gateway:"192.168.20.1"}
 };
 const ping=()=>observeRouterPing(r,router.id,pc1.id,pc2.id,addresses);
 return {r,router,pc1,pc2,c1,c2,addresses,ping};
}
test("ROUTER-01 : deux LAN directs, aller et retour valides",()=>{
 const f=fixture();assert.equal(f.ping().success,true);
 assert.equal(observeRouterPing(f.r,f.router.id,f.pc2.id,f.pc1.id,f.addresses).success,true);
});
test("ROUTER-02 : mauvaise passerelle du PC coupe le ping",()=>{
 const f=fixture();
 f.addresses[f.pc1.id].gateway="192.168.10.254";
 assert.equal(f.ping().success,false);
 f.addresses[f.pc1.id].gateway="192.168.10.1";
 assert.equal(f.ping().success,true);
 f.addresses[f.pc2.id].gateway="192.168.20.254";
 assert.equal(f.ping().success,false);
});
test("ROUTER-03 : débranchement d'un câble coupe puis rétablit",()=>{
 const f=fixture();assert.equal(f.ping().success,true);
 assert.ok(f.r.disconnectCableEnd(f.c2.id,1).success);
 assert.equal(f.ping().success,false);
 assert.ok(f.r.connectCableEnd(f.c2.id,1,f.router.ports[2].id).success);
 assert.equal(f.ping().success,true);
});
test("ROUTER-04 : masque ou adresse incompatibles coupent le ping",()=>{
 const f=fixture();
 f.addresses[f.pc1.id].address="192.168.30.10";
 assert.equal(f.ping().success,false);
 f.addresses[f.pc1.id].address="192.168.10.10";
 assert.equal(f.ping().success,true);
 f.addresses[f.pc2.id].prefix=25;
 assert.equal(f.ping().success,false);
});
test("ROUTER-05 : réseaux qui se chevauchent => non simulé, jamais faux succès",()=>{
 const f=fixture();
 assert.ok(configureRouterPort(f.r,f.router.id,f.router.ports[2].id,{role:"lan",mode:"static",address:"192.168.10.2",prefix:24}).success);
 const o=f.ping();assert.equal(o.status,"unavailable");assert.equal(o.success,false);
});
test("ROUTER-06 : interface sans IP statique, DMZ, PC éteint, pas de faux succès",()=>{
 const f=fixture();
 assert.ok(configureRouterPort(f.r,f.router.id,f.router.ports[2].id,{role:"lan",mode:"dhcp"}).success);
 assert.equal(f.ping().success,false);
 assert.ok(configureRouterPort(f.r,f.router.id,f.router.ports[2].id,{role:"dmz",mode:"static",address:"192.168.20.1",prefix:24}).success);
 assert.equal(f.ping().status,"unavailable");
 assert.ok(f.r.updateAsset(f.pc1.id,{status:"Hors service"}).success);
 assert.equal(f.ping().success,false);
});
test("ROUTER-07 : export-restauration et absence de topologie parallèle",()=>{
 const f=fixture(),before=f.ping(),snapshot=f.r.exportState();
 const restored=restoreAssetRegistry(snapshot);
 const after=observeRouterPing(restored,f.router.id,f.pc1.id,f.pc2.id,f.addresses);
 assert.deepEqual(after,before);
 assert.deepEqual(f.r.exportState(),snapshot);
});

test("ROUTER-08 : LAN/WAN direct, ping dans les deux sens",()=>{
 const f=fixture();
 assert.ok(f.r.disconnectCableEnd(f.c2.id,1).success);
 assert.ok(f.r.connectCableEnd(f.c2.id,1,f.router.ports[0].id).success);
 assert.ok(configureRouterPort(f.r,f.router.id,f.router.ports[0].id,{role:"wan",mode:"static",address:"192.168.20.1",prefix:24}).success);
 assert.equal(f.ping().success,true);
 assert.match(f.ping().reason,/LAN et WAN/);
 assert.equal(observeRouterPing(f.r,f.router.id,f.pc2.id,f.pc1.id,f.addresses).success,true);
});
test("ROUTER-09 : mauvaise passerelle WAN ou coupure de câble",()=>{
 const f=fixture();
 assert.ok(f.r.disconnectCableEnd(f.c2.id,1).success);
 assert.ok(f.r.connectCableEnd(f.c2.id,1,f.router.ports[0].id).success);
 assert.ok(configureRouterPort(f.r,f.router.id,f.router.ports[0].id,{role:"wan",mode:"static",address:"192.168.20.1",prefix:24}).success);
 assert.equal(f.ping().success,true);
 f.addresses[f.pc2.id].gateway="192.168.20.254";
 assert.equal(f.ping().success,false);
 f.addresses[f.pc2.id].gateway="192.168.20.1";
 assert.ok(f.r.disconnectCableEnd(f.c2.id,1).success);
 assert.equal(f.ping().success,false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan,setSwitchAccessPort} from "../src/vlan-v1.js";
import {createDefaultInterVlanRoutingConfig,configureInterVlanRouting,configureInterVlanInterface,observeInterVlanPing} from "../src/inter-vlan-routing-v01.js";
function setup(){
 const r=createAssetRegistry();
 const pp=r.createProfile("PC").profile;
 assert.ok(r.addPortGroup(pp.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success);
 const sp=r.createProfile("Switch L3 prototype").profile;
 assert.ok(r.addPortGroup(sp.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5}).success);
 assert.ok(r.setProfileNetworkCapability(sp.id,"ethernet-switching",true).success);
 assert.ok(r.setProfileNetworkCapability(sp.id,"vlan",true).success);
 const a=r.createAsset(pp.id,{name:"PC1"}).asset,b=r.createAsset(pp.id,{name:"PC2"}).asset,
       sw=r.createAsset(sp.id,{name:"SW-L3"}).asset;
 const wire=(p1,p2)=>{const c=r.createCable().cable;assert.ok(r.connectCableEnd(c.id,0,p1).success);assert.ok(r.connectCableEnd(c.id,1,p2).success);return c;};
 wire(a.ports[0].id,sw.ports[0].id);
 const second=wire(b.ports[0].id,sw.ports[1].id);
 for(const n of [10,20])assert.ok(addSwitchVlan(r,sw.id,n,"VLAN "+n).success);
 assert.ok(setSwitchAccessPort(r,sw.id,sw.ports[0].id,10).success);
 assert.ok(setSwitchAccessPort(r,sw.id,sw.ports[1].id,20).success);
 const addresses={
  [a.id]:{address:"192.168.10.20",prefix:24,gateway:"192.168.10.1"},
  [b.id]:{address:"192.168.20.30",prefix:24,gateway:"192.168.20.1"}
 };
 let config=createDefaultInterVlanRoutingConfig(sw);
 const svi=(n,address,prefix=24,enabled=true)=>{
  const o=configureInterVlanInterface(config,n,address,prefix,enabled);
  assert.ok(o.success);config=o.config;
 };
 const enable=flag=>{const o=configureInterVlanRouting(config,flag);assert.ok(o.success);config=o.config;};
 const ping=()=>observeInterVlanPing(r,sw.id,config,a.id,b.id,addresses);
 return {r,a,b,sw,addresses,second,svi,enable,ping,getConfig:()=>config};
}
test("V0.1-01 : VLAN différents sans routage, ping impossible",()=>{
 const f=setup();f.svi(10,"192.168.10.1");f.svi(20,"192.168.20.1");
 assert.equal(f.ping().success,false);
 assert.match(f.ping().reason,/désactivé/);
});
test("V0.1-02 : routage activé mais interfaces absentes, ping impossible",()=>{
 const f=setup();f.enable(true);
 assert.equal(f.ping().success,false);
 assert.match(f.ping().reason,/Interface/);
});
test("V0.1-03 : routage, deux interfaces et passerelles, ping réussi",()=>{
 const f=setup();f.svi(10,"192.168.10.1");f.svi(20,"192.168.20.1");f.enable(true);
 assert.equal(f.ping().success,true);
 assert.equal(f.r.getAsset(f.sw.id).ports.length,5,"interfaces VLAN non physiques");
});
test("V0.1-04 : passerelle incorrecte et interface désactivée",()=>{
 const f=setup();f.svi(10,"192.168.10.1");f.svi(20,"192.168.20.1");f.enable(true);
 f.addresses[f.a.id].gateway="192.168.10.254";
 assert.equal(f.ping().success,false);
 f.addresses[f.a.id].gateway="192.168.10.1";
 assert.equal(f.ping().success,true);
 f.svi(20,"192.168.20.1",24,false);
 assert.equal(f.ping().success,false);
});
test("V0.1-05 : débranchement du câble coupe le routage",()=>{
 const f=setup();f.svi(10,"192.168.10.1");f.svi(20,"192.168.20.1");f.enable(true);
 assert.equal(f.ping().success,true);
 assert.ok(f.r.disconnectCableEnd(f.second.id,1).success);
 assert.equal(f.ping().success,false);
 assert.ok(f.r.connectCableEnd(f.second.id,1,f.sw.ports[1].id).success);
 assert.equal(f.ping().success,true);
});
test("V0.1 : les sous-réseaux chevauchants ne produisent pas de faux succès",()=>{
 const f=setup();f.svi(10,"192.168.10.1",24);f.svi(20,"192.168.10.2",24);f.enable(true);
 const o=f.ping();assert.equal(o.success,false);assert.equal(o.status,"unavailable");
});
test("V0.1 : mauvaises adresses de postes ne produisent pas de succès",()=>{
 const f=setup();f.svi(10,"192.168.10.1");f.svi(20,"192.168.20.1");f.enable(true);
 f.addresses[f.b.id].address="192.168.30.20";
 assert.equal(f.ping().success,false);
});
test("V0.1 : interface VLAN n'ajoute aucun port physique ni câble",()=>{
 const f=setup();const snapshot=f.r.exportState();
 f.svi(10,"192.168.10.1");f.svi(20,"192.168.20.1");f.enable(true);
 assert.deepEqual(f.r.exportState(),snapshot);
});

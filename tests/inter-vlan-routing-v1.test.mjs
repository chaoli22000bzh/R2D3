import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan,setSwitchAccessPort} from "../src/vlan-v1.js";
import {getSwitchRoutingConfig,setSwitchInterVlanRouting,setSwitchVlanInterface,observeRegisteredInterVlanPing} from "../src/inter-vlan-routing-v1.js";

function setup(){
 const r=createAssetRegistry(),p=r.createProfile("PC").profile,s=r.createProfile("Switch administrable L3").profile;
 assert.ok(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success);
 assert.ok(r.addPortGroup(s.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5}).success);
 for(const c of ["ethernet-switching","vlan","inter-vlan-routing"])
  assert.ok(r.setProfileNetworkCapability(s.id,c,true).success);
 const pc1=r.createAsset(p.id,{name:"PC1"}).asset,pc2=r.createAsset(p.id,{name:"PC2"}).asset;
 const sw1=r.createAsset(s.id,{name:"SW01"}).asset,sw2=r.createAsset(s.id,{name:"SW02"}).asset;
 const wire=(a,b)=>{const c=r.createCable().cable;
  assert.ok(r.connectCableEnd(c.id,0,a).success);
  assert.ok(r.connectCableEnd(c.id,1,b).success);return c;};
 wire(pc1.ports[0].id,sw1.ports[0].id);
 const cable=wire(pc2.ports[0].id,sw1.ports[1].id);
 for(const sw of [sw1,sw2])for(const n of [10,20])
  assert.ok(addSwitchVlan(r,sw.id,n,"VLAN "+n).success);
 assert.ok(setSwitchAccessPort(r,sw1.id,sw1.ports[0].id,10).success);
 assert.ok(setSwitchAccessPort(r,sw1.id,sw1.ports[1].id,20).success);
 const addresses={[pc1.id]:{address:"192.168.10.20",prefix:24,gateway:"192.168.10.1"},
  [pc2.id]:{address:"192.168.20.30",prefix:24,gateway:"192.168.20.1"}};
 const setSvi=(sw,n,ip,enabled=true)=>setSwitchVlanInterface(r,sw.id,n,ip,24,enabled);
 const enable=(sw,flag)=>setSwitchInterVlanRouting(r,sw.id,flag);
 const ping=(reg=r)=>observeRegisteredInterVlanPing(reg,sw1.id,pc1.id,pc2.id,addresses);
 return {r,p,s,pc1,pc2,sw1,sw2,cable,wire,addresses,setSvi,enable,ping};
}
test("V1-01 : le profil produit une capacité L3 et un routage désactivé par défaut",()=>{
 const f=setup();
 assert.deepEqual(f.r.getProfile(f.s.id).networkCapabilities,["ethernet-switching","vlan","inter-vlan-routing"]);
 const c=getSwitchRoutingConfig(f.r,f.sw1.id);
 assert.equal(c.routingEnabled,false);
 assert.deepEqual(c.interfaces,{});
 assert.equal(f.ping().success,false);
 assert.equal(f.sw1.ports.length,5);
});
test("V1-02 : configuration des interfaces logiques et activation L3",()=>{
 const f=setup();
 assert.equal(f.setSvi(f.sw1,10,"192.168.10.1").success,true);
 assert.equal(f.setSvi(f.sw1,20,"192.168.20.1").success,true);
 assert.equal(f.enable(f.sw1,true).success,true);
 assert.equal(f.ping().success,true);
 assert.equal(f.r.getAsset(f.sw1.id).ports.length,5);
});
test("V1-03 : chaque switch conserve son propre routage",()=>{
 const f=setup();
 for(const [n,ip] of [[10,"192.168.10.1"],[20,"192.168.20.1"]])
  assert.equal(f.setSvi(f.sw1,n,ip).success,true);
 f.enable(f.sw1,true);
 assert.equal(getSwitchRoutingConfig(f.r,f.sw2.id).routingEnabled,false);
 assert.deepEqual(getSwitchRoutingConfig(f.r,f.sw2.id).interfaces,{});
 assert.equal(f.ping().success,true);
 assert.equal(f.setSvi(f.sw2,10,"192.168.10.254").success,true);
 assert.equal(getSwitchRoutingConfig(f.r,f.sw1.id).interfaces["10"].address,"192.168.10.1");
});
test("V1-04 : mauvaises passerelles, désactivation et câble débranché",()=>{
 const f=setup();
 f.setSvi(f.sw1,10,"192.168.10.1");
 f.setSvi(f.sw1,20,"192.168.20.1");
 f.enable(f.sw1,true);
 assert.equal(f.ping().success,true);
 f.addresses[f.pc1.id].gateway="192.168.10.254";
 assert.equal(f.ping().success,false);
 f.addresses[f.pc1.id].gateway="192.168.10.1";
 assert.equal(f.setSvi(f.sw1,20,"192.168.20.1",false).success,true);
 assert.equal(f.ping().success,false);
 f.setSvi(f.sw1,20,"192.168.20.1",true);
 f.r.disconnectCableEnd(f.cable.id,1);
 assert.equal(f.ping().success,false);
});
test("V1-05 : export et restauration incluent la configuration L3 et câbles",()=>{
 const f=setup();
 f.setSvi(f.sw1,10,"192.168.10.1");
 f.setSvi(f.sw1,20,"192.168.20.1");
 f.enable(f.sw1,true);
 const exported=f.r.exportState(),restored=restoreAssetRegistry(exported);
 assert.deepEqual(restored.exportState(),exported);
 assert.equal(f.ping(restored).success,true);
 const bad=f.enable(f.sw1,false);
 assert.equal(bad.success,true);
 assert.equal(f.ping().success,false);
 assert.equal(f.ping(restored).success,true);
});
test("V1 : dépendances des capacités L3",()=>{
 const r=createAssetRegistry(),p=r.createProfile("Switch").profile;
 r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:2});
 const before=r.createAsset(p.id,{name:"Avant"}).asset;
 assert.equal(r.setProfileNetworkCapability(p.id,"inter-vlan-routing",true).code,"capability_dependency");
 r.setProfileNetworkCapability(p.id,"ethernet-switching",true);
 assert.equal(r.setProfileNetworkCapability(p.id,"inter-vlan-routing",true).code,"capability_dependency");
 r.setProfileNetworkCapability(p.id,"vlan",true);
 assert.equal(r.setProfileNetworkCapability(p.id,"inter-vlan-routing",true).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"vlan",false).code,"capability_dependency");
 const after=r.createAsset(p.id,{name:"Après"}).asset;
 assert.equal(r.getAsset(before.id).routingConfig,undefined);
 assert.deepEqual(r.getAsset(after.id).routingConfig,{assetId:after.id,routingEnabled:false,interfaces:{}});
 const duplicate=r.duplicateProfile(p.id,"Copie").profile;
 assert.ok(duplicate.networkCapabilities.includes("inter-vlan-routing"));
});
test("V1 : invalidation d'une interface erronée sans mutation",()=>{
 const f=setup();
 const before=f.r.exportState();
 assert.equal(f.setSvi(f.sw1,40,"192.168.40.1").success,false);
 assert.deepEqual(f.r.exportState(),before);
 const c=getSwitchRoutingConfig(f.r,f.sw1.id);
 c.interfaces["10"]={address:"invalid",prefix:24,enabled:true};
 assert.equal(f.r.setAssetRoutingConfig(f.sw1.id,c).success,false);
 assert.deepEqual(f.r.exportState(),before);
});
test("V1 : inventaire ancien Ethernet/VLAN sans L3 restaurable",()=>{
 const r=createAssetRegistry(),p=r.createProfile("Switch L2").profile;
 r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:3});
 r.setProfileNetworkCapability(p.id,"ethernet-switching",true);
 r.setProfileNetworkCapability(p.id,"vlan",true);
 const a=r.createAsset(p.id,{name:"SW"}).asset;
 const snapshot=r.exportState();
 assert.deepEqual(restoreAssetRegistry(snapshot).exportState(),snapshot);
 assert.equal(r.getAsset(a.id).routingConfig,undefined);
});
test("V1 : restauration refuse une configuration L3 corrompue",()=>{
 const f=setup(),snapshot=f.r.exportState();
 snapshot.assets.find(a=>a.id===f.sw1.id).routingConfig.interfaces["10"]={
  address:"192.168.10.1",prefix:99,enabled:true};
 assert.throws(()=>restoreAssetRegistry(snapshot),/routage inter-VLAN invalide/);
});
test("V1 : client du même VLAN communique même si le routage est désactivé",()=>{
 const f=setup();
 assert.ok(setSwitchAccessPort(f.r,f.sw1.id,f.sw1.ports[1].id,10).success);
 f.addresses[f.pc2.id]={address:"192.168.10.30",prefix:24,gateway:"192.168.10.254"};
 assert.equal(f.ping().success,true);
});

import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan,setSwitchAccessPort,setSwitchTrunkPort} from "../src/vlan-v1.js";
import {observeStpV1} from "../src/stp-v1.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function fixture(managed=true,count=3){
 const r=createAssetRegistry();
 const p=r.createProfile("Poste").profile;
 good(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}));
 const sp=r.createProfile("Switch").profile;
 good(r.addPortGroup(sp.id,{type:"ethernet-rj45",prefix:"P",start:1,count:7}));
 good(r.setProfileNetworkCapability(sp.id,"ethernet-switching",true));
 if(managed)good(r.setProfileNetworkCapability(sp.id,"vlan",true));
 const pc1=r.createAsset(p.id,{name:"PC1"}).asset;
 const pc2=r.createAsset(p.id,{name:"PC2"}).asset;
 const sw=Array.from({length:count},(_,i)=>r.createAsset(sp.id,{name:"SW0"+(i+1)}).asset);
 const addresses={[pc1.id]:{address:"192.168.10.11",prefix:24},
                  [pc2.id]:{address:"192.168.10.12",prefix:24}};
 function wire(a,b){const c=r.createCable().cable;good(r.connectCableEnd(c.id,0,a));good(r.connectCableEnd(c.id,1,b));return c;}
 const pcWire=(left=sw[0],right=sw.at(-1))=>{
  wire(pc1.ports[0].id,left.ports[0].id);wire(pc2.ports[0].id,right.ports[0].id);
 };
 const route=(registry=r)=>observeStpV1(registry,pc1.id,pc2.id,addresses);
 const vlan=(n,which=sw)=>{for(const a of which)good(addSwitchVlan(r,a.id,n,"VLAN "+n));};
 const access=(a,port,n)=>good(setSwitchAccessPort(r,a.id,a.ports[port].id,n));
 const trunk=(a,port,nums)=>good(setSwitchTrunkPort(r,a.id,a.ports[port].id,nums));
 return {r,pc1,pc2,sw,addresses,wire,pcWire,route,vlan,access,trunk};
}
test("STP V1 01 : anneau de trois switchs administrables, blocage sans panne",()=>{
 const f=fixture();const [a,b,c]=f.sw;f.pcWire();
 f.wire(a.ports[1].id,b.ports[1].id);
 f.wire(b.ports[2].id,c.ports[1].id);
 const redundant=f.wire(c.ports[2].id,a.ports[2].id);
 const before=f.r.exportState(),o=f.route();
 assert.equal(o.success,true,JSON.stringify(o));assert.equal(o.loop,true);
 assert.deepEqual(o.blockedCableIds,[redundant.id]);
 assert.equal(o.storm,false);
 assert.deepEqual(f.r.exportState(),before);
});
test("STP V1 02 : anneau sans STP, tempête puis suppression d'un câble",()=>{
 const f=fixture(false),[a,b,c]=f.sw;f.pcWire();
 f.wire(a.ports[1].id,b.ports[1].id);
 f.wire(b.ports[2].id,c.ports[1].id);
 const redundant=f.wire(c.ports[2].id,a.ports[2].id);
 assert.equal(f.route().storm,true);
 good(f.r.disconnectCableEnd(redundant.id,1));
 assert.equal(f.route().success,true);
});
test("STP V1 03 : basculement après perte de la liaison principale",()=>{
 const f=fixture(),[a,b,c]=f.sw;f.pcWire();
 const first=f.wire(a.ports[1].id,b.ports[1].id);
 f.wire(b.ports[2].id,c.ports[1].id);
 const backup=f.wire(c.ports[2].id,a.ports[2].id);
 assert.deepEqual(f.route().blockedCableIds,[backup.id]);
 good(f.r.disconnectCableEnd(first.id,1));
 const restored=f.route();assert.equal(restored.success,true,JSON.stringify(restored));
 assert.deepEqual(restored.blockedCableIds,[]);assert.equal(restored.loop,false);
});
test("STP V1 04 : anneau Trunk sur VLAN 10, chemin conservé",()=>{
 const f=fixture(),[a,b,c]=f.sw;
 f.vlan(10);f.pcWire();
 f.access(a,0,10);f.access(c,0,10);
 f.trunk(a,1,[10]);f.trunk(b,1,[10]);
 f.trunk(b,2,[10]);f.trunk(c,1,[10]);
 f.trunk(c,2,[10]);f.trunk(a,2,[10]);
 f.wire(a.ports[1].id,b.ports[1].id);
 f.wire(b.ports[2].id,c.ports[1].id);
 f.wire(c.ports[2].id,a.ports[2].id);
 const o=f.route();assert.equal(o.success,true,JSON.stringify(o));
 assert.equal(o.vlan,10);assert.equal(o.blockedCableIds.length,1);
});
test("STP V1 05 : VLAN différents restent isolés, même avec STP",()=>{
 const f=fixture(),[a,b,c]=f.sw;
 f.vlan(10);f.vlan(20);f.pcWire();
 f.access(a,0,10);f.access(c,0,20);
 f.trunk(a,1,[10,20]);f.trunk(b,1,[10,20]);
 f.trunk(b,2,[10,20]);f.trunk(c,1,[10,20]);
 f.wire(a.ports[1].id,b.ports[1].id);
 f.wire(b.ports[2].id,c.ports[1].id);
 const o=f.route();assert.equal(o.success,false);assert.equal(o.status,"ok");
 assert.match(o.reason,/VLAN différents/);
});
test("STP V1 : Trunk ne transporte que les VLAN communs",()=>{
 const f=fixture(),[a,b,c]=f.sw;
 f.vlan(10);f.vlan(20);f.pcWire(a,b);
 f.access(a,0,10);f.access(b,0,10);
 f.trunk(a,1,[10]);f.trunk(b,1,[20]);
 f.wire(a.ports[1].id,b.ports[1].id);
 const o=f.route();assert.equal(o.success,false);assert.equal(o.loop,false);
});
test("STP V1 : disparition du câble bloqué n'altère pas les vrais câbles",()=>{
 const f=fixture(),[a,b,c]=f.sw;f.pcWire(a,b);
 f.wire(a.ports[1].id,b.ports[1].id);
 const extra=f.wire(a.ports[2].id,b.ports[2].id);
 const before=f.r.exportState();
 assert.deepEqual(f.route().blockedCableIds,[extra.id]);
 assert.deepEqual(f.r.exportState(),before);
 const restored=restoreAssetRegistry(before);
 assert.deepEqual(restored.exportState(),before);
 assert.deepEqual(f.route(restored).blockedCableIds,[extra.id]);
 good(f.r.disconnectCableEnd(extra.id,1));
 assert.deepEqual(f.route().blockedCableIds,[]);
 assert.deepEqual(observeStpV1(restored,f.pc1.id,f.pc2.id,f.addresses).blockedCableIds,[extra.id]);
});
test("STP V1 : Access/Trunk non pris en charge, sans faux ping",()=>{
 const f=fixture(),[a,b]=f.sw;f.vlan(10);f.pcWire(a,b);
 f.access(a,0,10);f.access(b,0,10);
 f.access(a,1,10);f.trunk(b,1,[10]);f.wire(a.ports[1].id,b.ports[1].id);
 const o=f.route();assert.equal(o.success,false);assert.equal(o.status,"unavailable");
});
test("STP V1 : sous-réseaux différents ne communiquent pas malgré STP",()=>{
 const f=fixture();const [a,b,c]=f.sw;f.pcWire();
 f.wire(a.ports[1].id,b.ports[1].id);f.wire(b.ports[2].id,c.ports[1].id);
 f.addresses[f.pc2.id]={address:"192.168.20.12",prefix:24};
 assert.equal(f.route().success,false);
});

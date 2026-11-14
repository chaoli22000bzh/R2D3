import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {observeSimpleEthernetSwitch} from "../src/ethernet-switching-v01.js";

function setup() {
 const r=createAssetRegistry();
 const pcProfile=r.createProfile("PC Ethernet").profile;
 assert.equal(r.addPortGroup(pcProfile.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success,true);
 const switchProfile=r.createProfile("Switch non administrable").profile;
 assert.equal(r.addPortGroup(switchProfile.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5}).success,true);
 const pc1=r.createAsset(pcProfile.id,{name:"PC1"}).asset;
 const pc2=r.createAsset(pcProfile.id,{name:"PC2"}).asset;
 const sw=r.createAsset(switchProfile.id,{name:"SW01"}).asset;
 const addresses={[pc1.id]:{address:"192.168.10.20",prefix:24},[pc2.id]:{address:"192.168.10.30",prefix:24}};
 const cable=(a,b)=>{
   const c=r.createCable().cable;
   assert.equal(r.connectCableEnd(c.id,0,a).success,true);
   assert.equal(r.connectCableEnd(c.id,1,b).success,true);
   return c;
 };
 const c1=cable(pc1.ports[0].id,sw.ports[0].id);
 const c2=cable(pc2.ports[0].id,sw.ports[1].id);
 const ping=()=>observeSimpleEthernetSwitch(r,pc1.id,pc2.id,sw.id,addresses);
 return {r,pc1,pc2,sw,c1,c2,addresses,ping,cable};
}
test("V0.1-01 : ping à travers deux ports du switch",()=>{
 const f=setup();assert.equal(f.ping().success,true);
 assert.equal(f.r.explorePhysicalPath(f.pc1.ports[0].id,f.pc2.ports[0].id).connected,false);
});
test("V0.1-02 : débrancher le PC2 coupe le ping",()=>{
 const f=setup();assert.equal(f.r.disconnectCableEnd(f.c2.id,1).success,true);assert.equal(f.ping().success,false);
});
test("V0.1-03 : rebrancher PC2 rétablit le ping",()=>{
 const f=setup();f.r.disconnectCableEnd(f.c2.id,1);
 assert.equal(f.r.connectCableEnd(f.c2.id,1,f.sw.ports[1].id).success,true);
 assert.equal(f.ping().success,true);
});
test("V0.1-04 : IPv4 autre sous-réseau empêche le ping",()=>{
 const f=setup();f.addresses[f.pc2.id]={address:"192.168.20.30",prefix:24};assert.equal(f.ping().success,false);
});
test("V0.1-05 : débrancher puis changer de port rétablit le ping",()=>{
 const f=setup();f.r.disconnectCableEnd(f.c2.id,1);
 assert.equal(f.r.connectCableEnd(f.c2.id,1,f.sw.ports[4].id).success,true);
 assert.equal(f.ping().success,true);
});
test("V0.1 : aucun câble ajouté au registre par le diagnostic",()=>{
 const f=setup(),before=f.r.exportState();
 f.ping();assert.deepEqual(f.r.exportState(),before);
});
test("V0.1 : switch hors service ne transmet pas",()=>{
 const f=setup();f.r.updateAsset(f.sw.id,{status:"Hors service"});assert.equal(f.ping().success,false);
});
test("V0.1 : port physique non Ethernet refusé",()=>{
 const f=setup();const p=f.r.createProfile("USB").profile;
 f.r.addPortGroup(p.id,{type:"usb-c",prefix:"USB",start:1,count:1});
 const usb=f.r.createAsset(p.id,{name:"USB01"}).asset;
 const result=observeSimpleEthernetSwitch(f.r,f.pc1.id,usb.id,f.sw.id,{
 ...f.addresses,[usb.id]:{address:"192.168.10.40",prefix:24}
 });
 assert.equal(result.status,"unavailable");
});

import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan,setSwitchAccessPort} from "../src/vlan-v1.js";
import {getSwitchRoutingConfig,setSwitchInterVlanRouting,setSwitchVlanInterface,observeRegisteredInterVlanPing} from "../src/inter-vlan-routing-v1.js";
import {setSwitchAccessRule,getSwitchAccessRules} from "../src/inter-vlan-access-policy-v1.js";

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
test("Ethernet Access : même règle L3 que les clients Wi-Fi, direction initiée",()=>{
 const f=setup();
 assert.equal(f.setSvi(f.sw1,10,"192.168.10.1").success,true);
 assert.equal(f.setSvi(f.sw1,20,"192.168.20.1").success,true);
 assert.equal(f.enable(f.sw1,true).success,true);
 assert.equal(f.ping().success,true);
 assert.equal(setSwitchAccessRule(f.r,f.sw1.id,{id:"guest-to-lan",sourceVlan:20,targetVlan:10,enabled:true}).success,true);
 const fromGuest=observeRegisteredInterVlanPing(f.r,f.sw1.id,f.pc2.id,f.pc1.id,f.addresses);
 assert.equal(fromGuest.code,"access_denied");
 assert.equal(f.ping().success,true);
 const rules=getSwitchAccessRules(f.r,f.sw1.id);
 assert.equal(rules.length,1);
 assert.equal(rules[0].sourceVlan,20);
});
test("Persistance : règle L3 rétablie avec l'inventaire, sans changement des câbles",()=>{
 const f=setup();
 f.setSvi(f.sw1,10,"192.168.10.1");f.setSvi(f.sw1,20,"192.168.20.1");
 f.enable(f.sw1,true);
 assert.equal(setSwitchAccessRule(f.r,f.sw1.id,{id:"guest-to-lan",sourceVlan:20,targetVlan:10,enabled:true}).success,true);
 const before=f.r.exportState();
 const restored=restoreAssetRegistry(before);
 assert.deepEqual(restored.exportState(),before);
 assert.equal(observeRegisteredInterVlanPing(restored,f.sw1.id,f.pc2.id,f.pc1.id,f.addresses).code,"access_denied");
 assert.equal(observeRegisteredInterVlanPing(restored,f.sw1.id,f.pc1.id,f.pc2.id,f.addresses).success,true);
});

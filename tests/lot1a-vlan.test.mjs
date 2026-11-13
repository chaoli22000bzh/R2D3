import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {observeVlanPing} from "../src/lot1a-vlan.js";

function fixture(){
  const registry=createAssetRegistry();
  const pcProfile=registry.createProfile("PC Ethernet").profile;
  const swProfile=registry.createProfile("Switch L2").profile;
  assert.equal(registry.addPortGroup(pcProfile.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success,true);
  assert.equal(registry.addPortGroup(swProfile.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:2}).success,true);
  const pc1=registry.createAsset(pcProfile.id,{name:"PC1"}).asset;
  const pc2=registry.createAsset(pcProfile.id,{name:"PC2"}).asset;
  const sw=registry.createAsset(swProfile.id,{name:"SW01"}).asset;
  const cable=(a,b)=>{
    const c=registry.createCable().cable;
    assert.equal(registry.connectCableEnd(c.id,0,a).success,true);
    assert.equal(registry.connectCableEnd(c.id,1,b).success,true);
    return c;
  };
  const c1=cable(pc1.ports[0].id,sw.ports[0].id),c2=cable(pc2.ports[0].id,sw.ports[1].id);
  const scenario={pc1Id:pc1.id,pc2Id:pc2.id,switchId:sw.id,
    vlans:{[sw.ports[0].id]:10,[sw.ports[1].id]:10},
    addresses:{[pc1.id]:{address:"192.168.10.20",prefix:24},
      [pc2.id]:{address:"192.168.10.30",prefix:24}}};
  return {registry,pc1,pc2,sw,c1,c2,scenario};
}
const ping=f=>observeVlanPing(f.registry,f.scenario);

test("LOT1A-01 : deux PC sur le même VLAN et réseau, ping possible",()=>{
  const f=fixture();assert.equal(ping(f).success,true);
});
test("LOT1A-02 : VLAN du port de PC2 modifié, ping échoue",()=>{
  const f=fixture();f.scenario.vlans[f.sw.ports[1].id]=20;
  assert.deepEqual(ping(f),{status:"ok",success:false,reason:"Ports Access affectés à des VLAN différents"});
});
test("LOT1A-03 : restaurer le VLAN rétablit le service",()=>{
  const f=fixture();f.scenario.vlans[f.sw.ports[1].id]=20;assert.equal(ping(f).success,false);
  f.scenario.vlans[f.sw.ports[1].id]=10;assert.equal(ping(f).success,true);
});
test("LOT1A-04 : mauvaise IPv4 reste un incident indépendant",()=>{
  const f=fixture();f.scenario.addresses[f.pc2.id]={address:"192.168.20.30",prefix:24};
  assert.equal(ping(f).success,false);
  f.scenario.vlans[f.sw.ports[1].id]=20;assert.equal(ping(f).success,false);
  f.scenario.vlans[f.sw.ports[1].id]=10;assert.equal(ping(f).success,false);
  f.scenario.addresses[f.pc2.id]={address:"192.168.10.30",prefix:24};assert.equal(ping(f).success,true);
});
test("LOT1A-05 : câbles R2 seuls, débranchement entraîne échec",()=>{
  const f=fixture(),before=f.registry.listCables().length;
  assert.equal(ping(f).success,true);
  assert.equal(f.registry.disconnectCableEnd(f.c2.id,1).success,true);
  assert.equal(ping(f).success,false);
  assert.equal(f.registry.listCables().length,before);
});
test("LOT1A-06 : le switch n'est pas traversé par le chemin physique R2",()=>{
  const f=fixture();
  const path=f.registry.explorePhysicalPath(f.pc1.ports[0].id,f.pc2.ports[0].id);
  assert.equal(path.connected,false);
  assert.equal(ping(f).success,true);
});
test("LOT1A-07 : état R2 restauré, observation conservée",()=>{
  const f=fixture();
  const copy={...f,registry:restoreAssetRegistry(f.registry.exportState())};
  assert.deepEqual(ping(copy),ping(f));
});
test("LOT1A-08 : absence de VLAN, pas de succès inventé",()=>{
  const f=fixture();delete f.scenario.vlans[f.sw.ports[1].id];
  assert.equal(ping(f).status,"unavailable");
});
test("LOT1A-09 : deux copies indépendantes",()=>{
  const f=fixture();
  const copy={registry:restoreAssetRegistry(f.registry.exportState()),
    scenario:structuredClone(f.scenario)};
  copy.scenario.vlans[f.sw.ports[1].id]=20;
  assert.equal(ping(f).success,true);
  assert.equal(ping(copy).success,false);
});

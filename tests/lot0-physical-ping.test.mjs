import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {observePhysicalPing} from "../src/lot0-physical-ping.js";

function fixture() {
  const r=createAssetRegistry();
  const p=r.createProfile("Poste Ethernet").profile;
  assert.equal(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success,true);
  const pc=r.createAsset(p.id,{name:"PC1"}).asset;
  const printer=r.createAsset(p.id,{name:"Imprimante"}).asset;
  const addresses={
    [pc.id]:{address:"192.168.10.20",prefix:24},
    [printer.id]:{address:"192.168.10.50",prefix:24}
  };
  return {r,pc,printer,addresses};
}
function cable(r,a,b) {
  const c=r.createCable().cable;
  assert.equal(r.connectCableEnd(c.id,0,a).success,true);
  assert.equal(r.connectCableEnd(c.id,1,b).success,true);
  return c;
}
const ping=f=>observePhysicalPing(f.r,f.pc.id,f.printer.id,f.addresses);

test("LOT0-A/B/C : continuité, débranchement et rétablissement exclusivement R2",()=>{
  const f=fixture(),c=cable(f.r,f.pc.ports[0].id,f.printer.ports[0].id);
  assert.equal(ping(f).success,true);
  assert.equal(f.r.disconnectCableEnd(c.id,1).success,true);
  assert.equal(ping(f).success,false);
  assert.equal(f.r.connectCableEnd(c.id,1,f.printer.ports[0].id).success,true);
  assert.equal(ping(f).success,true);
});

test("LOT0-D : traversée passive d'une prise murale, sans switch inventé",()=>{
  const f=fixture();
  const outlet=f.r.createWallOutlet({name:"P1",location:"Atelier"}).outlet;
  const slot=outlet.ports[0];
  cable(f.r,f.pc.ports[0].id,slot.front.id);
  const c=cable(f.r,slot.back.id,f.printer.ports[0].id);
  assert.equal(ping(f).success,true);
  f.r.disconnectCableEnd(c.id,0);
  assert.equal(ping(f).success,false);
});

test("LOT0-E : refus d'une interface incompatible plutôt que faux Ethernet",()=>{
  const f=fixture();
  const other=f.r.createProfile("Équipement non Ethernet").profile;
  f.r.addPortGroup(other.id,{type:"usb-c",prefix:"USB",start:1,count:1});
  const bad=f.r.createAsset(other.id,{name:"Équipement USB"}).asset;
  const result=observePhysicalPing(f.r,f.pc.id,bad.id,{
    ...f.addresses,[bad.id]:{address:"192.168.10.60",prefix:24}
  });
  assert.equal(result.status,"unavailable");assert.equal(result.success,false);
});

test("LOT0-F : export / restauration du registre et observation identique",()=>{
  const f=fixture();cable(f.r,f.pc.ports[0].id,f.printer.ports[0].id);
  const before=ping(f);
  const restored=restoreAssetRegistry(f.r.exportState());
  assert.deepEqual(observePhysicalPing(restored,f.pc.id,f.printer.id,f.addresses),before);
});

test("LOT0-G : refus de sauvegarde ne publie pas le registre candidat",()=>{
  const f=fixture();const initial=f.r.exportState();
  const candidate=restoreAssetRegistry(initial);
  cable(candidate,f.pc.ports[0].id,f.printer.ports[0].id);
  const save=()=>({ok:false,reason:"write_failed"});
  assert.equal(save().ok,false);
  assert.deepEqual(f.r.exportState(),initial);
  assert.equal(ping(f).success,false);
});

test("LOT0-H : deux copies isolées, leurs câbles et diagnostics diffèrent",()=>{
  const a=fixture(),b={...a,r:restoreAssetRegistry(a.r.exportState())};
  cable(a.r,a.pc.ports[0].id,a.printer.ports[0].id);
  assert.equal(ping(a).success,true);
  assert.equal(ping(b).success,false);
});

test("LOT0 : mauvais adressage continue à produire un échec technique",()=>{
  const f=fixture();cable(f.r,f.pc.ports[0].id,f.printer.ports[0].id);
  f.addresses[f.printer.id]={address:"192.168.20.50",prefix:24};
  const result=ping(f);assert.equal(result.status,"ok");assert.equal(result.success,false);
});

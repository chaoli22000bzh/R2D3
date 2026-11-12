import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {openPhysicalPingProbe} from "../adapters/physical-ping-lot0.js";
import {createMemoryTestHost} from "../adapters/host-test.js";

function fixture({passive=false,otherMedium=false}={}) {
  const r=createAssetRegistry();
  const profile=r.createProfile("Équipements de test").profile;
  assert.equal(r.addPortGroup(profile.id,{type:otherMedium?"usb-a":"ethernet-rj45",prefix:"P",start:1,count:1}).success,true);
  const a=r.createAsset(profile.id,{name:"PC"}).asset;
  const b=r.createAsset(profile.id,{name:"Imprimante"}).asset;
  const connectors=otherMedium?["usb-a-plug","usb-a-plug"]:["rj45-male","rj45-male"];
  const attach=(start,end)=>{
    const cable=r.createCable({connectors}).cable;
    assert.equal(r.connectCableEnd(cable.id,0,start).success,true);
    assert.equal(r.connectCableEnd(cable.id,1,end).success,true);
    return cable.id;
  };
  let cableId,terminalId;
  if(passive) {
    const o=r.createWallOutlet({name:"Prise 01",location:"Salle"}).outlet;
    const rack=r.createRack({name:"Baie A",location:"Salle",count:1,start:1}).rack;
    cableId=attach(a.ports[0].id,o.ports[0].front.id);
    attach(o.ports[0].back.id,rack.ports[0].back.id);
    attach(rack.ports[0].front.id,b.ports[0].id);
    terminalId=o.ports[0].front.id;
  }else {
    cableId=attach(a.ports[0].id,b.ports[0].id);
    terminalId=b.ports[0].id;
  }
  return {physicalState:r.exportState(),a:a.id,b:b.id,cableId,terminalId,
    addressing:{[a.id]:{address:"192.168.10.20",prefix:24},[b.id]:{address:"192.168.10.50",prefix:24}}};
}
const open=(f,host=null,copyKey=null)=>openPhysicalPingProbe({...f,host,copyKey});

test("LOT0-A/B/C : lien physique, débranchement et rétablissement",async()=>{
  const f=fixture(),e=await open(f);
  assert.equal(e.queryPing(f.a,f.b).success,true);
  assert.equal((await e.physicalAction("disconnectCableEnd",{cableId:f.cableId,end:1})).status,"applied");
  assert.equal(e.queryPing(f.a,f.b).success,false);
  assert.equal((await e.physicalAction("connectCableEnd",{cableId:f.cableId,end:1,portId:f.terminalId})).status,"applied");
  assert.equal(e.queryPing(f.a,f.b).success,true);
  assert.equal(e.getSnapshot().physical.cables.length,1,"Pas de câble supplémentaire enregistré");
});
test("LOT0-D : passage passif prise et panneau",async()=>{
  const f=fixture({passive:true}),e=await open(f);
  assert.equal(e.queryPing(f.a,f.b).success,true);
  assert.equal((await e.physicalAction("disconnectCableEnd",{cableId:f.cableId,end:1})).status,"applied");
  assert.equal(e.queryPing(f.a,f.b).success,false);
});
test("LOT0-E : autre type de port, aucun faux Ethernet",async()=>{
  const f=fixture({otherMedium:true}),e=await open(f);
  const q=e.queryPing(f.a,f.b);
  assert.equal(q.status,"unavailable");
  assert.equal(q.success,false);
});
test("LOT0-F : export et restauration conservent réseau et câbles",async()=>{
  const f=fixture(),host=createMemoryTestHost();
  const a=await open(f,host,"copie-a");
  assert.equal((await a.physicalAction("disconnectCableEnd",{cableId:f.cableId,end:1})).status,"applied");
  const b=await open(f,host,"copie-a");
  assert.deepEqual(b.exportState(),a.exportState());
  assert.equal(b.queryPing(f.a,f.b).success,false);
  assert.equal((await b.physicalAction("connectCableEnd",{cableId:f.cableId,end:1,portId:f.terminalId})).status,"applied");
  const c=await open(f,host,"copie-a");
  assert.equal(c.queryPing(f.a,f.b).success,true);
});
test("LOT0-G : échec de sauvegarde, aucune publication partielle",async()=>{
  const f=fixture(),host=createMemoryTestHost(),e=await open(f,host,"copie-a");
  const old=e.exportState();let updates=0;e.subscribe(()=>updates++);
  host.failNextSave();
  const result=await e.physicalAction("disconnectCableEnd",{cableId:f.cableId,end:1});
  assert.equal(result.status,"failed");
  assert.deepEqual(e.exportState(),old);
  assert.equal(e.queryPing(f.a,f.b).success,true);
  assert.equal(updates,0);
});
test("LOT0-H : copies indépendantes",async()=>{
  const f=fixture(),host=createMemoryTestHost();
  const a=await open(f,host,"élève-1"),b=await open(f,host,"élève-2");
  await a.physicalAction("disconnectCableEnd",{cableId:f.cableId,end:1});
  assert.equal(a.queryPing(f.a,f.b).success,false);
  assert.equal(b.queryPing(f.a,f.b).success,true);
  assert.deepEqual(b.getSnapshot().physical,f.physicalState);
});
test("LOT0 : refus action inconnue, sans modification",async()=>{
 const f=fixture(),e=await open(f),before=e.exportState();
 assert.equal((await e.physicalAction("deleteCable",{cableId:f.cableId})).status,"rejected");
 assert.deepEqual(e.exportState(),before);
});
test("LOT0 : modification concurrente refusée par l'hôte",async()=>{
  const f=fixture(),host=createMemoryTestHost();
  const a=await open(f,host,"copie"),b=await open(f,host,"copie");
  assert.equal((await a.physicalAction("disconnectCableEnd",{cableId:f.cableId,end:1})).status,"applied");
  const old=b.exportState();
  assert.equal((await b.physicalAction("disconnectCableEnd",{cableId:f.cableId,end:1})).code,"revision_conflict");
  assert.deepEqual(b.exportState(),old);
});

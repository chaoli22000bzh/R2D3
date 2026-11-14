import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createDefaultVlanSwitchConfig,createVlan,configureVlanAccess,configureVlanTrunk,observeVlanPing} from "../src/vlan-v01.js";

function fixture(){
 const r=createAssetRegistry(),pcProfile=r.createProfile("PC").profile;
 r.addPortGroup(pcProfile.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const swProfile=r.createProfile("Switch L2").profile;
 r.addPortGroup(swProfile.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5});
 assert.equal(r.setProfileNetworkCapability(swProfile.id,"ethernet-switching",true).success,true);
 const pc1=r.createAsset(pcProfile.id,{name:"PC1"}).asset;
 const pc2=r.createAsset(pcProfile.id,{name:"PC2"}).asset;
 const sw1=r.createAsset(swProfile.id,{name:"SW01"}).asset;
 const sw2=r.createAsset(swProfile.id,{name:"SW02"}).asset;
 const configs={
  [sw1.id]:createDefaultVlanSwitchConfig(sw1),
  [sw2.id]:createDefaultVlanSwitchConfig(sw2)
 };
 const addresses={[pc1.id]:{address:"192.168.10.11",prefix:24},
 [pc2.id]:{address:"192.168.10.12",prefix:24}};
 const cable=(a,b)=>{
  const c=r.createCable().cable;
  assert.equal(r.connectCableEnd(c.id,0,a).success,true);
  assert.equal(r.connectCableEnd(c.id,1,b).success,true);
  return c;
 };
 const ping=()=>observeVlanPing(r,configs,pc1.id,pc2.id,addresses);
 const vlan=(sw,num)=>{
  const x=createVlan(configs[sw.id],num,"VLAN "+num);
  assert.equal(x.success,true);configs[sw.id]=x.config;return x.vlanId;
 };
 const access=(sw,p,vlanId)=>{
  const x=configureVlanAccess(configs[sw.id],sw.ports[p].id,vlanId);
  assert.equal(x.success,true);configs[sw.id]=x.config;
 };
 const trunk=(sw,p,ids)=>{
  const x=configureVlanTrunk(configs[sw.id],sw.ports[p].id,ids);
  assert.equal(x.success,true);configs[sw.id]=x.config;
 };
 return {r,pc1,pc2,sw1,sw2,configs,addresses,cable,ping,vlan,access,trunk};
}
test("VLAN 01 : VLAN 1 et ports Access par défaut transmettent",()=>{
 const f=fixture();
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.pc2.ports[0].id,f.sw1.ports[1].id);
 assert.equal(f.ping().success,true);
});
test("VLAN 02 : création de VLAN 10/20 et isolation des ports Access",()=>{
 const f=fixture(),a=f.vlan(f.sw1,10),b=f.vlan(f.sw1,20);
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.pc2.ports[0].id,f.sw1.ports[1].id);
 f.access(f.sw1,0,a);f.access(f.sw1,1,b);
 assert.equal(f.ping().success,false);
 assert.equal(createVlan(f.configs[f.sw1.id],10,"Autre").success,false);
});
test("VLAN 03 : changement d'affectation rétablit le ping",()=>{
 const f=fixture(),a=f.vlan(f.sw1,10),b=f.vlan(f.sw1,20);
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.pc2.ports[0].id,f.sw1.ports[1].id);
 f.access(f.sw1,0,a);f.access(f.sw1,1,b);
 assert.equal(f.ping().success,false);
 f.access(f.sw1,1,a);assert.equal(f.ping().success,true);
});
test("VLAN 04 : Trunk/Trunk avec VLAN autorisé sur les deux switchs",()=>{
 const f=fixture(),a=f.vlan(f.sw1,10),b=f.vlan(f.sw2,10);
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.sw1.ports[1].id,f.sw2.ports[1].id);
 f.cable(f.pc2.ports[0].id,f.sw2.ports[0].id);
 f.access(f.sw1,0,a);f.access(f.sw2,0,b);
 f.trunk(f.sw1,1,[a]);f.trunk(f.sw2,1,[b]);
 assert.equal(f.ping().success,true);
});
test("VLAN 05 : VLAN non autorisé coupe le Trunk",()=>{
 const f=fixture(),a=f.vlan(f.sw1,10),b=f.vlan(f.sw2,10);
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.sw1.ports[1].id,f.sw2.ports[1].id);
 f.cable(f.pc2.ports[0].id,f.sw2.ports[0].id);
 f.access(f.sw1,0,a);f.access(f.sw2,0,b);
 f.trunk(f.sw1,1,[a]);f.trunk(f.sw2,1,["vlan-1"]);
 assert.equal(f.ping().success,false);
 f.trunk(f.sw2,1,[b]);assert.equal(f.ping().success,true);
});
test("Access/Access transporte une trame non étiquetée même avec VLAN locaux différents",()=>{
 const f=fixture(),a=f.vlan(f.sw1,10),b=f.vlan(f.sw2,20);
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.sw1.ports[1].id,f.sw2.ports[1].id);
 f.cable(f.pc2.ports[0].id,f.sw2.ports[0].id);
 f.access(f.sw1,0,a);f.access(f.sw1,1,a);
 f.access(f.sw2,0,b);f.access(f.sw2,1,b);
 assert.equal(f.ping().success,true);
});
test("Access/Trunk non garanti : ne pas inventer de succès",()=>{
 const f=fixture(),a=f.vlan(f.sw1,10),b=f.vlan(f.sw2,10);
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.sw1.ports[1].id,f.sw2.ports[1].id);
 f.cable(f.pc2.ports[0].id,f.sw2.ports[0].id);
 f.access(f.sw1,0,a);f.access(f.sw1,1,a);
 f.access(f.sw2,0,b);f.trunk(f.sw2,1,[b]);
 assert.equal(f.ping().status,"unavailable");
});
test("Débranchement du Trunk interrompt sans mutation du diagnostic",()=>{
 const f=fixture(),a=f.vlan(f.sw1,10),b=f.vlan(f.sw2,10);
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 const trunkCable=f.cable(f.sw1.ports[1].id,f.sw2.ports[1].id);
 f.cable(f.pc2.ports[0].id,f.sw2.ports[0].id);
 f.access(f.sw1,0,a);f.access(f.sw2,0,b);
 f.trunk(f.sw1,1,[a]);f.trunk(f.sw2,1,[b]);
 const before=f.r.exportState();
 assert.equal(f.ping().success,true);
 assert.deepEqual(f.r.exportState(),before);
 f.r.disconnectCableEnd(trunkCable.id,1);
 assert.equal(f.ping().success,false);
});
test("Adresses IPv4 incompatibles n'obtiennent pas de réussite VLAN",()=>{
 const f=fixture();
 f.cable(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.cable(f.pc2.ports[0].id,f.sw1.ports[1].id);
 f.addresses[f.pc2.id]={address:"192.168.20.12",prefix:24};
 assert.equal(f.ping().success,false);
});

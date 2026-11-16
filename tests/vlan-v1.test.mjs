import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan,updateSwitchVlan,removeSwitchVlan,setSwitchAccessPort,setSwitchTrunkPort,observeRegisteredVlanPing,vlanSwitchConfig} from "../src/vlan-v1.js";
function setup(){
 const r=createAssetRegistry();
 const p=r.createProfile("PC").profile;
 r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const sw=r.createProfile("Switch administrable L2").profile;
 r.addPortGroup(sw.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5});
 assert.equal(r.setProfileNetworkCapability(sw.id,"ethernet-switching",true).success,true);
 assert.equal(r.setProfileNetworkCapability(sw.id,"vlan",true).success,true);
 const pc1=r.createAsset(p.id,{name:"PC1"}).asset;
 const pc2=r.createAsset(p.id,{name:"PC2"}).asset;
 const s1=r.createAsset(sw.id,{name:"SW01"}).asset;
 const s2=r.createAsset(sw.id,{name:"SW02"}).asset;
 const addresses={[pc1.id]:{address:"192.168.10.11",prefix:24},
                  [pc2.id]:{address:"192.168.10.12",prefix:24}};
 const wire=(a,b)=>{
  const c=r.createCable().cable;
  assert.equal(r.connectCableEnd(c.id,0,a).success,true);
  assert.equal(r.connectCableEnd(c.id,1,b).success,true);
  return c;
 };
 const ping=(registry=r)=>observeRegisteredVlanPing(registry,pc1.id,pc2.id,addresses);
 const vlan=(sw,n)=>assert.equal(addSwitchVlan(r,sw.id,n,"VLAN "+n).success,true);
 const access=(sw,n,port)=>assert.equal(setSwitchAccessPort(r,sw.id,sw.ports[port].id,n).success,true);
 const trunk=(sw,nums,port)=>assert.equal(setSwitchTrunkPort(r,sw.id,sw.ports[port].id,nums).success,true);
 return {r,p,sw,pc1,pc2,s1,s2,addresses,wire,ping,vlan,access,trunk};
}
test("V1-01 : capacité VLAN propre au profil et configuration par défaut",()=>{
 const f=setup(),a=vlanSwitchConfig(f.r,f.s1.id),b=vlanSwitchConfig(f.r,f.s2.id);
 assert.deepEqual(f.r.getProfile(f.sw.id).networkCapabilities,["ethernet-switching","vlan"]);
 assert.deepEqual(a.vlans.map(v=>v.number),[1]);
 assert.equal(Object.keys(a.ports).length,5);
 assert.deepEqual(a.ports[f.s1.ports[0].id],{mode:"access",vlanId:"vlan-1"});
 assert.notDeepEqual(Object.keys(a.ports),Object.keys(b.ports));
});
test("V1-02 : chaque switch configure ses VLAN et ports indépendamment",()=>{
 const f=setup();f.vlan(f.s1,10);f.vlan(f.s1,20);f.vlan(f.s2,10);
 assert.deepEqual(vlanSwitchConfig(f.r,f.s1.id).vlans.map(x=>x.number),[1,10,20]);
 assert.deepEqual(vlanSwitchConfig(f.r,f.s2.id).vlans.map(x=>x.number),[1,10]);
 assert.equal(setSwitchAccessPort(f.r,f.s2.id,f.s2.ports[0].id,20).success,false);
});
test("V1-03 : isolation et modification Access réellement appliquées",()=>{
 const f=setup();f.wire(f.pc1.ports[0].id,f.s1.ports[0].id);f.wire(f.pc2.ports[0].id,f.s1.ports[1].id);
 f.vlan(f.s1,10);f.vlan(f.s1,20);f.access(f.s1,10,0);f.access(f.s1,20,1);
 assert.equal(f.ping().success,false);
 f.access(f.s1,10,1);assert.equal(f.ping().success,true);
});
test("V1-04 : Trunk entre deux switchs et perte de connectivité",()=>{
 const f=setup();f.wire(f.pc1.ports[0].id,f.s1.ports[0].id);
 const c=f.wire(f.s1.ports[1].id,f.s2.ports[1].id);
 f.wire(f.pc2.ports[0].id,f.s2.ports[0].id);
 f.vlan(f.s1,10);f.vlan(f.s2,10);f.access(f.s1,10,0);f.access(f.s2,10,0);
 f.trunk(f.s1,[10],1);f.trunk(f.s2,[10],1);
 assert.equal(f.ping().success,true);
 f.trunk(f.s2,[1],1);assert.equal(f.ping().success,false);
 f.trunk(f.s2,[10],1);assert.equal(f.ping().success,true);
 f.r.disconnectCableEnd(c.id,1);assert.equal(f.ping().success,false);
});
test("V1-05 : sauvegarde et restauration des VLAN, ports et câbles",()=>{
 const f=setup();f.wire(f.pc1.ports[0].id,f.s1.ports[0].id);f.wire(f.pc2.ports[0].id,f.s1.ports[1].id);
 f.vlan(f.s1,10);f.access(f.s1,10,0);f.access(f.s1,10,1);
 const snapshot=f.r.exportState(),restored=restoreAssetRegistry(snapshot);
 assert.deepEqual(restored.exportState(),snapshot);
 assert.equal(f.ping(restored).success,true);
 assert.equal(f.ping().success,true);
});
test("V1 : refus d'activation VLAN sans commutation Ethernet et héritage non rétroactif",()=>{
 const r=createAssetRegistry(),p=r.createProfile("Switch").profile;
 r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:2});
 const a=r.createAsset(p.id,{name:"SW01"}).asset;
 assert.equal(r.setProfileNetworkCapability(p.id,"vlan",true).code,"capability_dependency");
 r.setProfileNetworkCapability(p.id,"ethernet-switching",true);
 r.setProfileNetworkCapability(p.id,"vlan",true);
 assert.equal(r.getAsset(a.id).vlanConfig,undefined);
 const b=r.createAsset(p.id,{name:"SW02"}).asset;
 assert.ok(r.getAsset(b.id).vlanConfig);
 assert.equal(r.setProfileNetworkCapability(p.id,"ethernet-switching",false).code,"capability_dependency");
 const cloned=r.duplicateProfile(p.id,"Switch-2").profile;
 assert.deepEqual(cloned.networkCapabilities,["ethernet-switching","vlan"]);
});
test("V1 : invalidation d'une configuration ne doit jamais muter l'état",()=>{
 const f=setup(),original=f.r.exportState(),config=vlanSwitchConfig(f.r,f.s1.id);
 config.ports[f.s1.ports[0].id]={mode:"access",vlanId:"vlan-inconnu"};
 assert.equal(f.r.setAssetVlanConfig(f.s1.id,config).success,false);
 assert.deepEqual(f.r.exportState(),original);
});
test("V1 : extension Ethernet synchronisée avec VLAN 1, puis supprimée",()=>{
 const f=setup();
 const ext=f.r.addExtension(f.s1.id,{type:"ethernet-rj45",prefix:"SFP",start:1,count:1});
 assert.equal(ext.success,true);
 assert.deepEqual(vlanSwitchConfig(f.r,f.s1.id).ports[ext.ports[0].id],{mode:"access",vlanId:"vlan-1"});
 const snapshot=f.r.exportState();
 assert.deepEqual(restoreAssetRegistry(snapshot).exportState(),snapshot);
 assert.equal(f.r.removeExtension(f.s1.id,ext.extensionId).success,true);
 assert.equal(vlanSwitchConfig(f.r,f.s1.id).ports[ext.ports[0].id],undefined);
});
test("V1 : anciens inventaires sans VLAN restaurables",()=>{
 const r=createAssetRegistry(),p=r.createProfile("ancien").profile;
 r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:2});
 const a=r.createAsset(p.id,{name:"SW"}).asset,old=r.exportState();
 delete old.profiles[0].networkCapabilities;
 delete old.assets[0].networkCapabilities;
 const restored=restoreAssetRegistry(old);
 assert.deepEqual(restored.getAsset(a.id).networkCapabilities,[]);
});

test("VLAN édition : renommer et renuméroter conserve les ports Access et Trunk",()=>{
 const f=setup();f.vlan(f.s1,10);f.vlan(f.s1,20);
 f.access(f.s1,10,0);f.trunk(f.s1,[10,20],1);
 const before=vlanSwitchConfig(f.r,f.s1.id),v=before.vlans.find(x=>x.number===10);
 const accessBefore=before.ports[f.s1.ports[0].id];
 const trunkBefore=before.ports[f.s1.ports[1].id];
 assert.equal(updateSwitchVlan(f.r,f.s1.id,v.id,30,"Comptabilité").success,true);
 const after=vlanSwitchConfig(f.r,f.s1.id);
 assert.equal(after.vlans.find(x=>x.id===v.id).number,30);
 assert.equal(after.vlans.find(x=>x.id===v.id).name,"Comptabilité");
 assert.deepEqual(after.ports[f.s1.ports[0].id],accessBefore);
 assert.deepEqual(after.ports[f.s1.ports[1].id],trunkBefore);
 assert.equal(vlanSwitchConfig(f.r,f.s2.id).vlans.length,1);
 assert.deepEqual(restoreAssetRegistry(f.r.exportState()).exportState(),f.r.exportState());
});
test("VLAN édition : refus atomiques et suppression avec protection des ports",()=>{
 const f=setup();f.vlan(f.s1,10);f.vlan(f.s1,20);
 const id=vlanSwitchConfig(f.r,f.s1.id).vlans.find(v=>v.number===10).id;
 f.access(f.s1,10,0);
 const before=f.r.exportState();
 for(const action of [
  ()=>updateSwitchVlan(f.r,f.s1.id,id,20,"Doublon"),
  ()=>updateSwitchVlan(f.r,f.s1.id,id,5000,"Invalide"),
  ()=>updateSwitchVlan(f.r,f.s1.id,"vlan-1",2,"Défaut"),
  ()=>removeSwitchVlan(f.r,f.s1.id,id),
  ()=>removeSwitchVlan(f.r,f.s1.id,"vlan-1")
 ]){
  assert.equal(action().success,false);
  assert.deepEqual(f.r.exportState(),before);
 }
 f.access(f.s1,1,0);
 assert.equal(removeSwitchVlan(f.r,f.s1.id,id).success,true);
 assert.equal(vlanSwitchConfig(f.r,f.s1.id).vlans.some(v=>v.id===id),false);
});
test("VLAN L3 : report atomique des interfaces, IP Helper et plages DHCP",()=>{
 const r=createAssetRegistry(),p=r.createProfile("Switch L3").profile;
 assert.equal(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}).success,true);
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","ip-helper","dhcp-server"])
  assert.equal(r.setProfileNetworkCapability(p.id,cap,true).success,true);
 const sw=r.createAsset(p.id,{name:"L3"}).asset;
 assert.equal(addSwitchVlan(r,sw.id,10,"Compta").success,true);
 const v=r.getAsset(sw.id).vlanConfig.vlans.find(x=>x.number===10);
 const routing=r.getAsset(sw.id).routingConfig;
 routing.interfaces["10"]={address:"192.168.10.1",prefix:24,enabled:true};
 assert.equal(r.setAssetRoutingConfig(sw.id,routing).success,true);
 const helpers=r.getAsset(sw.id).ipHelperConfig;
 helpers.helpers["vlan:10"]={enabled:true,serverAddress:"192.168.20.2"};
 assert.equal(r.setAssetIpHelperConfig(sw.id,helpers).success,true);
 const dhcp=r.getAsset(sw.id).dhcpServerConfig;
 dhcp.pools=[{id:"pool10",vlanNumber:10,start:"192.168.10.100",end:"192.168.10.109",prefix:24,gateway:"192.168.10.1",dns:["1.1.1.1"],leaseSeconds:3600}];
 assert.equal(r.setAssetDhcpServerConfig(sw.id,dhcp).success,true);
 const before=r.exportState();
 assert.equal(removeSwitchVlan(r,sw.id,v.id).success,false);
 assert.deepEqual(r.exportState(),before);
 assert.equal(updateSwitchVlan(r,sw.id,v.id,20,"Comptabilité").success,true);
 const after=r.getAsset(sw.id);
 assert.equal(after.vlanConfig.vlans.find(x=>x.id===v.id).number,20);
 assert.deepEqual(after.routingConfig.interfaces["20"],routing.interfaces["10"]);
 assert.equal(after.routingConfig.interfaces["10"],undefined);
 assert.deepEqual(after.ipHelperConfig.helpers["vlan:20"],helpers.helpers["vlan:10"]);
 assert.equal(after.ipHelperConfig.helpers["vlan:10"],undefined);
 assert.equal(after.dhcpServerConfig.pools[0].vlanNumber,20);
 assert.deepEqual(restoreAssetRegistry(r.exportState()).exportState(),r.exportState());
});

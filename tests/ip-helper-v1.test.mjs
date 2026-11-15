import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan,setSwitchAccessPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface,setSwitchInterVlanRouting} from "../src/inter-vlan-routing-v1.js";
import {createEngine} from "../src/r2d3-core.js";
import {getAssetIpHelperConfig,setVlanIpHelper,setInterfaceIpHelper,observeRegisteredRelayedDhcp} from "../src/ip-helper-v1.js";

function fixture(){
 const reg=createAssetRegistry();
 const pcProfile=reg.createProfile("Poste").profile;
 const srvProfile=reg.createProfile("Serveur").profile;
 const l3Profile=reg.createProfile("Switch L3").profile;
 for(const p of [pcProfile,srvProfile])
  assert.equal(reg.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success,true);
 assert.equal(reg.addPortGroup(l3Profile.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}).success,true);
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","ip-helper"])
  assert.equal(reg.setProfileNetworkCapability(l3Profile.id,cap,true).success,true);
 const pc=reg.createAsset(pcProfile.id,{name:"PC1"}).asset;
 const srv=reg.createAsset(srvProfile.id,{name:"DHCP"}).asset;
 const sw=reg.createAsset(l3Profile.id,{name:"SW1"}).asset;
 const sw2=reg.createAsset(l3Profile.id,{name:"SW2"}).asset;
 const cable=(a,b)=>{
  const c=reg.createCable().cable;
  assert.equal(reg.connectCableEnd(c.id,0,a).success,true);
  assert.equal(reg.connectCableEnd(c.id,1,b).success,true);
  return c;
 };
 const c1=cable(pc.ports[0].id,sw.ports[0].id);
 const c2=cable(srv.ports[0].id,sw.ports[1].id);
 for(const a of [sw,sw2])for(const n of [10,20])
  assert.equal(addSwitchVlan(reg,a.id,n,"VLAN "+n).success,true);
 assert.equal(setSwitchAccessPort(reg,sw.id,sw.ports[0].id,10).success,true);
 assert.equal(setSwitchAccessPort(reg,sw.id,sw.ports[1].id,20).success,true);
 assert.equal(setSwitchVlanInterface(reg,sw.id,10,"192.168.10.1",24).success,true);
 assert.equal(setSwitchVlanInterface(reg,sw.id,20,"192.168.20.1",24).success,true);
 assert.equal(setSwitchInterVlanRouting(reg,sw.id,true).success,true);
 const pools=[20,10].map(n=>({id:"plage"+n,start:"192.168."+n+".100",
  end:"192.168."+n+".110",prefix:24,gateway:"192.168."+n+".1",dns:[],leaseSeconds:3600}));
 const scenario={format:"r2d3-scenario",schemaVersion:1,scenarioId:"helper-v1",
  scenarioVersion:"1",capabilities:{network:true},
  objects:[
   {id:pc.id,kind:"pc-windows",name:"PC",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"dhcp",address:null,prefix:null,lease:null},
     networkOptions:{gateway:null,dns:[]}}},
   {id:srv.id,kind:"dhcp-server",name:"SRV",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.20.2",prefix:24},
     dhcpEnabled:true,dhcpPools:pools}}
  ],
  links:[{id:"service-relay",kind:"relay-service",
   endpoints:[{objectId:pc.id,portId:"eth0"},{objectId:srv.id,portId:"eth0"}],
   connected:true}]};
 const engine=createEngine(scenario);
 const request=(r=reg)=>observeRegisteredRelayedDhcp({
  registry:r,switchId:sw.id,clientId:pc.id,serverId:srv.id,serverAddress:"192.168.20.2",
  dhcpEngine:engine});
 return {reg,pc,srv,sw,sw2,c1,c2,engine,request,l3Profile};
}
test("V1-01 : capacité IP Helper copiée aux nouveaux équipements, désactivée par défaut",()=>{
 const f=fixture(),a=f.reg.getAsset(f.sw.id);
 assert.ok(a.networkCapabilities.includes("ip-helper"));
 assert.deepEqual(getAssetIpHelperConfig(f.reg,f.sw.id),{assetId:f.sw.id,helpers:{}});
 assert.equal(f.request().success,false);
 assert.equal(f.engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,null);
});
test("V1-02 : activation d'un relais sur VLAN 10 et plage client plutôt que serveur",()=>{
 const f=fixture();
 assert.equal(setVlanIpHelper(f.reg,f.sw.id,10,"192.168.20.2",true).success,true);
 const r=f.request();
 assert.equal(r.success,true,JSON.stringify(r));
 assert.equal(r.poolId,"plage10");
 assert.equal(r.address,"192.168.10.100");
});
test("V1-03 : réglages par VLAN et par équipement indépendants",()=>{
 const f=fixture();
 assert.equal(setVlanIpHelper(f.reg,f.sw.id,10,"192.168.20.2",true).success,true);
 assert.equal(setVlanIpHelper(f.reg,f.sw.id,20,"192.168.10.2",false).success,true);
 assert.equal(setVlanIpHelper(f.reg,f.sw2.id,10,"192.168.20.55",false).success,true);
 assert.equal(getAssetIpHelperConfig(f.reg,f.sw.id).helpers["vlan:20"].enabled,false);
 assert.equal(getAssetIpHelperConfig(f.reg,f.sw2.id).helpers["vlan:10"].serverAddress,"192.168.20.55");
 assert.equal(getAssetIpHelperConfig(f.reg,f.sw.id).helpers["vlan:10"].serverAddress,"192.168.20.2");
 assert.equal(f.request().success,true);
});
test("V1-04 : désactivation du relais et coupure physique empêchent l'acquisition",()=>{
 const f=fixture();
 setVlanIpHelper(f.reg,f.sw.id,10,"192.168.20.2",false);
 assert.equal(f.request().success,false);
 setVlanIpHelper(f.reg,f.sw.id,10,"192.168.20.2",true);
 f.reg.disconnectCableEnd(f.c2.id,1);
 assert.equal(f.request().success,false);
 assert.equal(f.engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,null);
 f.reg.connectCableEnd(f.c2.id,1,f.sw.ports[1].id);
 assert.equal(f.request().success,true);
});
test("V1-05 : export et restauration conservent les IP Helper",()=>{
 const f=fixture();
 setVlanIpHelper(f.reg,f.sw.id,10,"192.168.20.2",true);
 setVlanIpHelper(f.reg,f.sw.id,20,"192.168.10.2",false);
 const state=f.reg.exportState();
 const restored=restoreAssetRegistry(state);
 assert.deepEqual(restored.exportState(),state);
 assert.equal(f.request(restored).success,true);
 setVlanIpHelper(f.reg,f.sw.id,10,"192.168.20.2",false);
 assert.equal(getAssetIpHelperConfig(restored,f.sw.id).helpers["vlan:10"].enabled,true);
});
test("V1 : profil sans IP Helper, vieux inventaire, activation ultérieure non rétroactive",()=>{
 const reg=createAssetRegistry(),p=reg.createProfile("Routeur de test").profile;
 reg.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"P",start:1,count:2});
 const before=reg.createAsset(p.id,{name:"Avant"}).asset;
 assert.equal(reg.setProfileNetworkCapability(p.id,"ip-helper",true).success,true);
 const after=reg.createAsset(p.id,{name:"Après"}).asset;
 assert.equal(reg.getAsset(before.id).ipHelperConfig,undefined);
 assert.deepEqual(getAssetIpHelperConfig(reg,after.id),{assetId:after.id,helpers:{}});
 assert.deepEqual(restoreAssetRegistry(reg.exportState()).exportState(),reg.exportState());
 assert.equal(setInterfaceIpHelper(reg,after.id,after.ports[0].id,"10.0.0.2").success,true);
});
test("V1 : configuration rejetée sans mutation",()=>{
 const f=fixture(),snapshot=f.reg.exportState();
 assert.equal(setVlanIpHelper(f.reg,f.sw.id,99,"192.168.20.2").success,false);
 assert.equal(setVlanIpHelper(f.reg,f.sw.id,10,"bad").success,false);
 assert.equal(setInterfaceIpHelper(f.reg,f.sw.id,"fake-port","192.168.20.2").success,false);
 assert.deepEqual(f.reg.exportState(),snapshot);
});
test("V1 : état exporté invalide est refusé",()=>{
 const f=fixture(),state=f.reg.exportState();
 state.assets.find(a=>a.id===f.sw.id).ipHelperConfig.helpers["vlan:99"]=
  {serverAddress:"192.168.20.2",enabled:true};
 assert.throws(()=>restoreAssetRegistry(state),/IP Helper invalide/);
});
test("V1 : capacité IP Helper n'est pas autorisée sans port Ethernet",()=>{
 const reg=createAssetRegistry(),p=reg.createProfile("Sans réseau").profile;
 assert.equal(reg.setProfileNetworkCapability(p.id,"ip-helper",true).code,"insufficient_ethernet_ports");
});


test("IP Helper : refus sur switch non administrable et L2, autorisé sur L3",()=>{
 const r=createAssetRegistry(),p=r.createProfile("Switch").profile;
 assert.equal(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"ethernet-switching",true).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"ip-helper",true).code,"capability_dependency");
 assert.equal(r.setProfileNetworkCapability(p.id,"vlan",true).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"ip-helper",true).code,"capability_dependency");
 assert.equal(r.setProfileNetworkCapability(p.id,"inter-vlan-routing",true).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"ip-helper",true).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"inter-vlan-routing",false).code,"capability_dependency");
 assert.equal(r.setProfileNetworkCapability(p.id,"ip-helper",false).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"inter-vlan-routing",false).success,true);
});
test("IP Helper : futur routeur non-switch avec Ethernet reste autorisé",()=>{
 const r=createAssetRegistry(),p=r.createProfile("Routeur générique futur").profile;
 assert.equal(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:4}).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"ip-helper",true).success,true);
 assert.equal(r.setProfileNetworkCapability(p.id,"ethernet-switching",true).code,"capability_dependency");
 assert.equal(r.createAsset(p.id,{name:"Routeur"}).asset.networkCapabilities.includes("ip-helper"),true);
});

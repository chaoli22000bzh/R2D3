import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createEngine} from "../src/r2d3-core.js";
import {getSwitchManagement,configureSwitchManagementStatic,configureSwitchManagementDhcp,acquireSwitchManagementDhcp,syncSwitchManagementDhcp} from "../src/switch-management-ip-v01.js";
const good=x=>assert.equal(x.success,true,JSON.stringify(x));
function setup(){
 const r=createAssetRegistry();
 const p=r.createProfile("Switch L2").profile;
 good(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}));
 good(r.setProfileNetworkCapability(p.id,"ethernet-switching",true));
 good(r.setProfileNetworkCapability(p.id,"vlan",true));
 const basic=r.createProfile("Switch non administrable").profile;
 good(r.addPortGroup(basic.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}));
 good(r.setProfileNetworkCapability(basic.id,"ethernet-switching",true));
 const srvp=r.createProfile("Serveur").profile;
 good(r.addPortGroup(srvp.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}));
 const sw=r.createAsset(p.id,{name:"SW01"}).asset;
 const sw2=r.createAsset(p.id,{name:"SW02"}).asset;
 const unmanaged=r.createAsset(basic.id,{name:"SW03"}).asset;
 const server=r.createAsset(srvp.id,{name:"DHCP"}).asset;
 const c=r.createCable().cable;
 good(r.connectCableEnd(c.id,0,sw.ports[0].id));
 good(r.connectCableEnd(c.id,1,server.ports[0].id));
 const scenario={format:"r2d3-scenario",schemaVersion:1,
  scenarioId:"mgmt-ip-tests",scenarioVersion:"1",capabilities:{network:true},
  objects:[
   {id:sw.id,kind:"pc-windows",name:"Gestion SW01",
    ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"dhcp",address:null,prefix:null,lease:null},
     networkOptions:{gateway:null,dns:[]}}},
   {id:server.id,kind:"dhcp-server",name:"SRV-DHCP",
    ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.1.2",prefix:24},
     dhcpEnabled:true,dhcpPools:[{id:"mgmt",start:"192.168.1.100",
      end:"192.168.1.110",prefix:24,gateway:"192.168.1.1",dns:[],leaseSeconds:3600}]}}
  ],links:[{id:"service-mgmt",kind:"ethernet-cable",
   endpoints:[{objectId:sw.id,portId:"eth0"},{objectId:server.id,portId:"eth0"}],connected:true}]};
 const engine=createEngine(scenario);
 const acquire=()=>acquireSwitchManagementDhcp({
  registry:r,switchId:sw.id,serverId:server.id,dhcpEngine:engine,poolId:"mgmt"});
 return {r,p,sw,sw2,unmanaged,server,c,engine,acquire};
}
test("IP gestion 01 : switch L2 créé client DHCP, non administrable sans IP de gestion",()=>{
 const f=setup();
 assert.deepEqual(getSwitchManagement(f.r,f.sw.id),{assetId:f.sw.id,mode:"dhcp",address:null,prefix:null,gateway:null,lease:null});
 assert.equal(getSwitchManagement(f.r,f.unmanaged.id),null);
 assert.equal(configureSwitchManagementStatic(f.r,f.unmanaged.id,"192.168.1.10",24).success,false);
});
test("IP gestion 02 : IP statique IPv4 masque passerelle, sans affecter VLAN",()=>{
 const f=setup(),before=f.r.getAsset(f.sw.id).vlanConfig;
 good(configureSwitchManagementStatic(f.r,f.sw.id,"192.168.1.10",24,"192.168.1.1"));
 const c=getSwitchManagement(f.r,f.sw.id);
 assert.equal(c.mode,"static");assert.equal(c.address,"192.168.1.10");
 assert.equal(c.gateway,"192.168.1.1");
 assert.deepEqual(f.r.getAsset(f.sw.id).vlanConfig,before);
 assert.deepEqual(getSwitchManagement(f.r,f.sw2.id).address,null);
});
test("IP gestion 03 : configuration invalide refusée sans mutation",()=>{
 const f=setup(),state=f.r.exportState();
 assert.equal(configureSwitchManagementStatic(f.r,f.sw.id,"999.1.1.1",24).success,false);
 assert.equal(configureSwitchManagementStatic(f.r,f.sw.id,"192.168.1.10",33).success,false);
 assert.equal(configureSwitchManagementStatic(f.r,f.sw.id,"192.168.1.10",24,"192.168.2.1").success,false);
 assert.deepEqual(f.r.exportState(),state);
});
test("IP gestion 04 : bail attribué par vrai Core DHCP sur VLAN 1",()=>{
 const f=setup(),r=f.acquire();
 good(r);assert.equal(r.address,"192.168.1.100");
 assert.equal(getSwitchManagement(f.r,f.sw.id).lease.poolId,"mgmt");
 assert.equal(getSwitchManagement(f.r,f.sw.id).gateway,"192.168.1.1");
 assert.equal(getSwitchManagement(f.r,f.sw2.id).address,null);
});
test("IP gestion 05 : déconnexion du DHCP, absence de faux bail",()=>{
 const f=setup();good(f.r.disconnectCableEnd(f.c.id,1));
 assert.equal(f.acquire().success,false);
 assert.equal(getSwitchManagement(f.r,f.sw.id).address,null);
 assert.equal(f.engine.getSnapshot().objectsById[f.sw.id].config.ipv4.address,null);
});
test("IP gestion 06 : passage statique vers DHCP efface l'ancienne configuration",()=>{
 const f=setup();
 good(configureSwitchManagementStatic(f.r,f.sw.id,"10.0.0.10",24,"10.0.0.1"));
 good(configureSwitchManagementDhcp(f.r,f.sw.id));
 assert.equal(getSwitchManagement(f.r,f.sw.id).address,null);
 assert.equal(f.acquire().success,true);
});
test("IP gestion 07 : export et restauration indépendante",()=>{
 const f=setup();
 good(configureSwitchManagementStatic(f.r,f.sw.id,"192.168.1.10",24,"192.168.1.1"));
 const state=f.r.exportState();
 const restored=restoreAssetRegistry(state);
 assert.deepEqual(restored.exportState(),state);
 good(configureSwitchManagementDhcp(f.r,f.sw.id));
 assert.equal(getSwitchManagement(restored,f.sw.id).address,"192.168.1.10");
});
test("IP gestion 08 : anciennes sauvegardes VLAN sans champ IP de gestion restent lisibles",()=>{
 const f=setup(),state=f.r.exportState();
 for(const a of state.assets)delete a.managementConfig;
 const restored=restoreAssetRegistry(state);
 assert.equal(getSwitchManagement(restored,f.sw.id).mode,"dhcp");
 assert.equal(getSwitchManagement(restored,f.unmanaged.id),null);
});
test("IP gestion 09 : refus du mode DHCP statique et serveur arrêté",()=>{
 const f=setup();
 good(configureSwitchManagementStatic(f.r,f.sw.id,"192.168.1.10",24));
 assert.equal(f.acquire().success,false);
 good(configureSwitchManagementDhcp(f.r,f.sw.id));
 const result=f.engine.dispatch({commandVersion:1,id:"stop",type:"dhcp.setServerEnabled",
  targetId:f.server.id,params:{enabled:false}});
 assert.equal(result.status,"applied");
 assert.equal(f.acquire().success,false);
});

test("IP gestion 10 : sans réponse DHCP, le vrai Core place le switch en APIPA",()=>{
 const f=setup();
 const stop=f.engine.dispatch({commandVersion:1,id:"initial-stop",type:"dhcp.setServerEnabled",
  targetId:f.server.id,params:{enabled:false}});
 assert.equal(stop.status,"applied");
 const command=f.engine.dispatch({commandVersion:1,id:"initial-boot",type:"dhcp.request",
  targetId:f.sw.id,params:{}});
 assert.equal(command.status,"applied");
 good(syncSwitchManagementDhcp(f.r,f.sw.id,f.engine));
 const state=getSwitchManagement(f.r,f.sw.id);
 assert.equal(state.mode,"dhcp");
 assert.match(state.address,/^169\\.254\\./);
 assert.equal(state.prefix,16);
 assert.equal(state.lease,null);
 assert.equal(f.engine.getSnapshot().runtime[f.sw.id].dhcpStatus,"apipa");
});
test("IP gestion 11 : câble coupé conserve bail à T1/T2 et APIPA à expiration",()=>{
 const f=setup();
 good(f.acquire());
 const initial=getSwitchManagement(f.r,f.sw.id);
 assert.equal(initial.address,"192.168.1.100");
 good(f.r.disconnectCableEnd(f.c.id,1));
 const disconnect=f.engine.dispatch({commandVersion:1,id:"cut-link",type:"network.setLinkConnected",
  targetId:"service-mgmt",params:{connected:false}});
 assert.equal(disconnect.status,"applied");
 good(syncSwitchManagementDhcp(f.r,f.sw.id,f.engine));
 assert.equal(getSwitchManagement(f.r,f.sw.id).address,initial.address);
 for(const [seconds,phase] of [[1800,"t1-failed"],[1350,"t2-failed"]]){
  const result=f.engine.dispatch({commandVersion:1,id:"clock-"+phase,type:"simulation.advanceTime",
   targetId:"simulation-clock",params:{seconds}});
  assert.equal(result.status,"applied");
  good(syncSwitchManagementDhcp(f.r,f.sw.id,f.engine));
  assert.equal(getSwitchManagement(f.r,f.sw.id).address,initial.address);
  assert.equal(f.engine.getSnapshot().runtime[f.sw.id].dhcpLeasePhase,phase);
 }
 const expiry=f.engine.dispatch({commandVersion:1,id:"clock-expiry",type:"simulation.advanceTime",
  targetId:"simulation-clock",params:{seconds:450}});
 assert.equal(expiry.status,"applied");
 good(syncSwitchManagementDhcp(f.r,f.sw.id,f.engine));
 const state=getSwitchManagement(f.r,f.sw.id);
 assert.equal(state.mode,"dhcp");assert.match(state.address,/^169\\.254\\./);
 assert.equal(state.prefix,16);assert.equal(state.lease,null);
 assert.equal(f.engine.getSnapshot().runtime[f.sw.id].dhcpLeasePhase,"expired-apipa");
});

import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint} from "../src/wifi-ap-v1.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureRouterDhcp} from "../src/router-dhcp-service-v1.js";
import {requestWifiManagementDhcp,syncWifiManagementDhcp} from "../src/wifi-management-dhcp-v1.js";

const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function fixture(){
 const registry=createAssetRegistry();
 const ap=createWifiAccessPoint(registry,{name:"AP01"}).asset;
 const router=createRouter(registry,{name:"RTR01",ports:2}).asset;
 const port=router.ports[1];
 good(configureRouterPort(registry,router.id,port.id,{role:"lan",mode:"static",address:"192.168.40.1",prefix:24}));
 const pools=[{id:"mgmt",portId:port.id,start:"192.168.40.100",end:"192.168.40.105",prefix:24,
  gateway:"192.168.40.1",dns:["1.1.1.1","8.8.8.8"],leaseSeconds:3600}];
 good(configureRouterDhcp(registry,router.id,{enabled:true,pools}));
 const cable=registry.createCable().cable;
 good(registry.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
 good(registry.connectCableEnd(cable.id,1,port.id));
 return {registry,ap,router,port,pools,cable};
}
test("Borne DHCP/APIPA : bail réel par le moteur commun avec deux DNS",()=>{
 const f=fixture();
 const r=requestWifiManagementDhcp({registry:f.registry,apId:f.ap.id});
 good(r);assert.equal(r.code,"lease");assert.equal(r.address,"192.168.40.100");
 assert.deepEqual(r.dns,["1.1.1.1","8.8.8.8"]);
 assert.equal(f.registry.getAsset(f.ap.id).managementConfig.lease.serverId,f.router.id);
 const restore=restoreAssetRegistry(f.registry.exportState());
 assert.equal(restore.getAsset(f.ap.id).managementConfig.address,"192.168.40.100");
});
test("Borne DHCP/APIPA : serveur arrêté, APIPA réellement attribuée par le Core",()=>{
 const f=fixture();good(configureRouterDhcp(f.registry,f.router.id,{enabled:false,pools:f.pools}));
 const r=requestWifiManagementDhcp({registry:f.registry,apId:f.ap.id});
 good(r);assert.equal(r.code,"apipa");assert.match(r.address,/^169\.254\./);
 assert.equal(r.prefix,16);assert.equal(r.gateway,null);
 assert.deepEqual(r.dns,[]);
 assert.equal(f.registry.getAsset(f.ap.id).managementConfig.lease,null);
});
test("Borne DHCP/APIPA : sans câble, APIPA ; après raccordement, bail DHCP",()=>{
 const f=fixture();good(f.registry.disconnectCableEnd(f.cable.id,1));
 let r=requestWifiManagementDhcp({registry:f.registry,apId:f.ap.id});
 good(r);assert.equal(r.code,"apipa");
 good(f.registry.connectCableEnd(f.cable.id,1,f.port.id));
 r=requestWifiManagementDhcp({registry:f.registry,apId:f.ap.id});
 good(r);assert.equal(r.code,"lease");
});
test("Borne DHCP/APIPA : IPv4 statique non écrasée par une requête DHCP",()=>{
 const f=fixture(),c={assetId:f.ap.id,mode:"static",address:"192.168.40.12",prefix:24,
  gateway:"192.168.40.1",dns:[],lease:null};
 good(f.registry.setAssetManagementConfig(f.ap.id,c));
 assert.equal(requestWifiManagementDhcp({registry:f.registry,apId:f.ap.id}).code,"not_dhcp");
 assert.deepEqual(f.registry.getAsset(f.ap.id).managementConfig,c);
});
test("Borne DHCP/APIPA : horloge Core et bail expiré synchronisés via le même moteur",()=>{
 const f=fixture(),initial=requestWifiManagementDhcp({registry:f.registry,apId:f.ap.id});
 good(initial);assert.equal(initial.code,"lease");
 const disconnected=initial.engine.dispatch({commandVersion:1,id:"coupure",
  type:"network.setLinkConnected",targetId:"wifi-management-link",params:{connected:false}});
 assert.equal(disconnected.status,"applied");
 let sync=syncWifiManagementDhcp({registry:f.registry,apId:f.ap.id,engine:initial.engine});
 good(sync);assert.equal(sync.address,initial.address);
 const tick=initial.engine.dispatch({commandVersion:1,id:"fin-bail",
  type:"simulation.advanceTime",targetId:"simulation-clock",params:{seconds:3601}});
 assert.equal(tick.status,"applied");
 sync=syncWifiManagementDhcp({registry:f.registry,apId:f.ap.id,engine:initial.engine});
 good(sync);assert.equal(sync.code,"apipa");assert.equal(sync.prefix,16);
});

test("Borne DHCP/APIPA : plusieurs bornes obtiennent des APIPA distinctes sans serveur",()=>{
 const f=fixture();good(f.registry.disconnectCableEnd(f.cable.id,1));
 const second=createWifiAccessPoint(f.registry,{name:"AP02"}).asset;
 const a=requestWifiManagementDhcp({registry:f.registry,apId:f.ap.id});
 const b=requestWifiManagementDhcp({registry:f.registry,apId:second.id});
 good(a);good(b);
 assert.equal(a.code,"apipa");assert.equal(b.code,"apipa");
 assert.notEqual(a.address,b.address);
});
test("Borne DHCP/APIPA : deux bornes connectées au même switch L3 reçoivent deux baux différents",()=>{
 const r=createAssetRegistry();
 const ap1=createWifiAccessPoint(r,{name:"AP01"}).asset;
 const ap2=createWifiAccessPoint(r,{name:"AP02"}).asset;
 const profile=r.createProfile("Switch L3").profile;
 good(r.addPortGroup(profile.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:3}));
 for(const capability of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
  good(r.setProfileNetworkCapability(profile.id,capability,true));
 const sw=r.createAsset(profile.id,{name:"SWL3"}).asset;
 const routing=r.getAsset(sw.id).routingConfig;
 routing.routingEnabled=true;routing.interfaces={"1":{address:"192.168.50.1",prefix:24,enabled:true}};
 good(r.setAssetRoutingConfig(sw.id,routing));
 good(r.setAssetDhcpServerConfig(sw.id,{assetId:sw.id,enabled:true,pools:[{
  id:"gestion",vlanNumber:1,start:"192.168.50.100",end:"192.168.50.105",prefix:24,
  gateway:"192.168.50.1",dns:["1.1.1.1"],leaseSeconds:3600}]}));
 for(const [i,ap] of [ap1,ap2].entries()){
  const cable=r.createCable().cable;
  good(r.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id));
  good(r.connectCableEnd(cable.id,1,sw.ports[i].id));
 }
 const a=requestWifiManagementDhcp({registry:r,apId:ap1.id});
 const b=requestWifiManagementDhcp({registry:r,apId:ap2.id});
 good(a);good(b);
 assert.equal(a.code,"lease");assert.equal(b.code,"lease");
 assert.equal(a.address,"192.168.50.100");
 assert.equal(b.address,"192.168.50.101");
 assert.deepEqual(b.dns,["1.1.1.1"]);
});

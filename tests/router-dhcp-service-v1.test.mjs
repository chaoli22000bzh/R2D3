import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {createEngine} from "../src/r2d3-core.js";
import {setInterfaceIpHelper,getAssetIpHelperConfig} from "../src/ip-helper-v1.js";
import {configureRouterDhcp,getRouterDhcpConfig,createRouterDhcpCoreObject,requestRouterDhcp,requestRouterRelayedDhcp} from "../src/router-dhcp-service-v1.js";
const ok=r=>assert.equal(r.success,true,JSON.stringify(r));
function fixture(){
 const reg=createAssetRegistry(),rt=createRouter(reg,{name:"Routeur DHCP",ports:4}).asset;
 const profile=reg.createProfile("PC/serveur").profile;
 ok(reg.addPortGroup(profile.id,{type:"ethernet-rj45",prefix:"NIC",start:1,count:1}));
 const pc=reg.createAsset(profile.id,{name:"PC LAN"}).asset;
 const srv=reg.createAsset(profile.id,{name:"Serveur DHCP"}).asset;
 const wire=(x,y)=>{const c=reg.createCable().cable;
  ok(reg.connectCableEnd(c.id,0,x));ok(reg.connectCableEnd(c.id,1,y));return c;};
 const clientCable=wire(pc.ports[0].id,rt.ports[1].id);
 const serverCable=wire(srv.ports[0].id,rt.ports[2].id);
 for(const [p,role,ip] of [[rt.ports[0],"wan","203.0.113.1"],[rt.ports[1],"lan","192.168.10.1"],
    [rt.ports[2],"lan","192.168.20.1"]])
  ok(configureRouterPort(reg,rt.id,p.id,{role,mode:"static",address:ip,prefix:24}));
 const local={id:"local10",portId:rt.ports[1].id,start:"192.168.10.100",end:"192.168.10.110",
  prefix:24,gateway:"192.168.10.1",dns:["192.168.20.2"],leaseSeconds:3600};
 const remote={id:"remote10",start:"192.168.10.120",end:"192.168.10.130",
  prefix:24,gateway:"192.168.10.1",dns:["192.168.20.2"],leaseSeconds:3600};
 const mkClient=()=>({id:pc.id,kind:"pc-windows",name:"PC LAN",ports:[{id:pc.ports[0].id,type:"rj45"}],
  config:{macAddress:"02-00-00-00-10-01",ipv4:{interfaceId:pc.ports[0].id,
   mode:"dhcp",address:null,prefix:null,lease:null},networkOptions:{gateway:null,dns:[]}}});
 const mkServer=()=>({id:srv.id,kind:"dhcp-server",name:"SRV DHCP",ports:[{id:srv.ports[0].id,type:"rj45"}],
  config:{ipv4:{interfaceId:srv.ports[0].id,mode:"static",address:"192.168.20.2",prefix:24},
   dhcpEnabled:true,dhcpPools:[remote]}});
 const coreLocal=()=>createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"router-dhcp",
  scenarioVersion:"1",capabilities:{network:true},
  objects:[mkClient(),createRouterDhcpCoreObject(reg,rt.id)],
  links:[{id:clientCable.id,kind:"ethernet-cable",connected:true,
   endpoints:[{objectId:pc.id,portId:pc.ports[0].id},{objectId:rt.id,portId:rt.ports[1].id}]}]});
 const coreRelay=()=>createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"router-helper",
  scenarioVersion:"1",capabilities:{network:true},objects:[mkClient(),mkServer()],
  links:[{id:"relay",kind:"relay-service",connected:true,
   endpoints:[{objectId:pc.id,portId:pc.ports[0].id},{objectId:srv.id,portId:srv.ports[0].id}]}]});
 const relay=engine=>requestRouterRelayedDhcp({registry:reg,routerId:rt.id,clientId:pc.id,
  serverId:srv.id,serverAddress:"192.168.20.2",dhcpEngine:engine});
 return {reg,rt,pc,srv,clientCable,serverCable,local,remote,coreLocal,coreRelay,relay};
}
test("ROUTER-DHCP01 : capacités et service arrêté par défaut",()=>{
 const f=fixture(),a=f.reg.getAsset(f.rt.id);
 assert.ok(a.networkCapabilities.includes("dhcp-server"));
 assert.ok(a.networkCapabilities.includes("ip-helper"));
 assert.deepEqual(getRouterDhcpConfig(f.reg,f.rt.id),{assetId:f.rt.id,enabled:false,pools:[]});
 assert.deepEqual(getAssetIpHelperConfig(f.reg,f.rt.id),{assetId:f.rt.id,helpers:{}});
});
test("ROUTER-DHCP02 : bail via même moteur Core, DNS et passerelle",()=>{
 const f=fixture();ok(configureRouterDhcp(f.reg,f.rt.id,{enabled:true,pools:[f.local]}));
 const engine=f.coreLocal();
 const r=requestRouterDhcp({registry:f.reg,routerId:f.rt.id,clientId:f.pc.id,dhcpEngine:engine});
 ok(r);assert.equal(r.address,"192.168.10.100");
 const client=engine.getSnapshot().objectsById[f.pc.id];
 assert.equal(client.config.networkOptions.gateway,"192.168.10.1");
 assert.deepEqual(client.config.networkOptions.dns,["192.168.20.2"]);
 assert.equal(engine.query({type:"dhcp.leases",serverId:f.rt.id}).leases.length,1);
});
test("ROUTER-DHCP03 : serveur arrêté produit APIPA du Core",()=>{
 const f=fixture();ok(configureRouterDhcp(f.reg,f.rt.id,{enabled:false,pools:[f.local]}));
 const r=requestRouterDhcp({registry:f.reg,routerId:f.rt.id,clientId:f.pc.id,dhcpEngine:f.coreLocal()});
 assert.equal(r.success,false);assert.equal(r.code,"apipa");assert.match(r.address,/^169\.254\./);
});
test("ROUTER-DHCP04 : câble coupé, erreurs et configuration conservée",()=>{
 const f=fixture();ok(configureRouterDhcp(f.reg,f.rt.id,{enabled:true,pools:[f.local]}));
 const engine=f.coreLocal();ok(requestRouterDhcp({registry:f.reg,routerId:f.rt.id,clientId:f.pc.id,dhcpEngine:engine}));
 ok(f.reg.disconnectCableEnd(f.clientCable.id,1));
 assert.equal(requestRouterDhcp({registry:f.reg,routerId:f.rt.id,clientId:f.pc.id,dhcpEngine:engine}).code,"link_down");
 assert.equal(engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,"192.168.10.100");
});
test("ROUTER-DHCP05 : plages liées au port, pas aux VLAN, sauvegarde et refus atomique",()=>{
 const f=fixture();ok(configureRouterDhcp(f.reg,f.rt.id,{enabled:true,pools:[f.local]}));
 const state=f.reg.exportState(),restored=restoreAssetRegistry(state);
 assert.deepEqual(restored.exportState(),state);
 const wrong={...f.local,portId:f.rt.ports[0].id};
 assert.equal(configureRouterDhcp(f.reg,f.rt.id,{enabled:true,pools:[wrong]}).success,false);
 assert.deepEqual(f.reg.exportState(),state);
 const badPort=configureRouterPort(f.reg,f.rt.id,f.rt.ports[1].id,{role:"dmz",mode:"static",address:"192.168.99.1",prefix:24});
 assert.equal(badPort.success,false);assert.deepEqual(f.reg.exportState(),state);
});
test("ROUTER-HELPER01 : relais par interface vers serveur distant",()=>{
 const f=fixture();ok(setInterfaceIpHelper(f.reg,f.rt.id,f.rt.ports[1].id,"192.168.20.2",true));
 const engine=f.coreRelay(),r=f.relay(engine);
 assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.poolId,"remote10");
 assert.equal(r.address,"192.168.10.120");
});
test("ROUTER-HELPER02 : arrêt, IP erronée et coupure empêchent l'attribution",()=>{
 const f=fixture();const engine=f.coreRelay();
 assert.equal(f.relay(engine).success,false);
 ok(setInterfaceIpHelper(f.reg,f.rt.id,f.rt.ports[1].id,"192.168.20.99",true));
 assert.equal(f.relay(engine).success,false);
 ok(setInterfaceIpHelper(f.reg,f.rt.id,f.rt.ports[1].id,"192.168.20.2",true));
 ok(f.reg.disconnectCableEnd(f.serverCable.id,1));
 assert.equal(f.relay(engine).success,false);
 ok(f.reg.connectCableEnd(f.serverCable.id,1,f.rt.ports[2].id));
 assert.equal(f.relay(engine).success,true);
});
test("ROUTER-HELPER03 : relais DMZ et états persistants",()=>{
 const f=fixture();ok(configureRouterPort(f.reg,f.rt.id,f.rt.ports[1].id,
  {role:"dmz",mode:"static",address:"192.168.10.1",prefix:24}));
 ok(setInterfaceIpHelper(f.reg,f.rt.id,f.rt.ports[1].id,"192.168.20.2",true));
 const snapshot=f.reg.exportState(),restored=restoreAssetRegistry(snapshot);
 assert.deepEqual(restored.exportState(),snapshot);
 assert.equal(f.relay(f.coreRelay()).success,true);
});

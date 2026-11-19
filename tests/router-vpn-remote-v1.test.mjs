import test from "node:test";
import assert from "node:assert/strict";
import {createEngine} from "../src/r2d3-core.js";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureRemoteVpn,getRemoteVpnConfig,setRemoteVpnEnabled,connectRemoteVpn,disconnectRemoteVpn,observeRemoteVpnPing,observeRemoteVpnPingName} from "../src/router-vpn-remote-v1.js";

function fixture(){
 const registry=createAssetRegistry(),router=createRouter(registry,{name:"RTR-01"}).asset;
 const profile=registry.createProfile("PC RJ45").profile;
 assert.ok(registry.addPortGroup(profile.id,{type:"ethernet-rj45",prefix:"NIC",start:1,count:1}).success);
 const nomad=registry.createAsset(profile.id,{name:"PC-NOMADE"}).asset;
 const server=registry.createAsset(profile.id,{name:"SRV-LOCAL"}).asset;
 const cable=(a,b)=>{
  const c=registry.createCable().cable;
  assert.ok(registry.connectCableEnd(c.id,0,a).success);
  assert.ok(registry.connectCableEnd(c.id,1,b).success);
  return c.id;
 };
 const wan=router.ports[0].id,lan=router.ports[1].id;
 const wanCable=cable(nomad.ports[0].id,wan),lanCable=cable(server.ports[0].id,lan);
 assert.ok(configureRouterPort(registry,router.id,wan,{role:"wan",mode:"static",address:"203.0.113.10",prefix:24}).success);
 assert.ok(configureRouterPort(registry,router.id,lan,{role:"lan",mode:"static",address:"192.168.10.1",prefix:24}).success);
 const addresses={
  [nomad.id]:{address:"203.0.113.20",prefix:24,gateway:"203.0.113.10"},
  [server.id]:{address:"192.168.10.10",prefix:24,gateway:"192.168.10.1"}
 };
 const settings={wanPortId:wan,lanPortId:lan,vpnNetwork:"10.8.0.0",vpnPrefix:24,username:"eleve",password:"demo",enabled:true};
 const credentials={serverAddress:"203.0.113.10",username:"eleve",password:"demo"};
 const configure=()=>configureRemoteVpn(registry,router.id,settings);
 const connect=(options=credentials)=>connectRemoteVpn(registry,router.id,nomad.id,addresses,options);
 return {registry,router,nomad,server,wan,lan,wanCable,lanCable,addresses,settings,credentials,configure,connect};
}
test("VPN-N01 : connexion, adresse VPN et ping du LAN",()=>{
 const f=fixture();assert.equal(f.configure().success,true);
 const c=f.connect();assert.equal(c.success,true);
 assert.equal(c.session.vpnAddress,"10.8.0.10");
 assert.equal(observeRemoteVpnPing(f.registry,c.session,f.server.id,f.addresses).success,true);
});
test("VPN-N02 : authentification et adresse WAN incorrectes",()=>{
 const f=fixture();f.configure();
 assert.equal(f.connect({...f.credentials,password:"mauvais"}).code,"wrong_credentials");
 assert.equal(f.connect({...f.credentials,serverAddress:"203.0.113.99"}).code,"wrong_server");
});
test("VPN-N03 : serveur arrêté et déconnexion empêchent le ping",()=>{
 const f=fixture();f.configure();const c=f.connect();assert.equal(c.success,true);
 assert.equal(setRemoteVpnEnabled(f.registry,f.router.id,false).success,true);
 assert.equal(observeRemoteVpnPing(f.registry,c.session,f.server.id,f.addresses).success,false);
 assert.equal(f.connect().code,"vpn_off");
 assert.equal(setRemoteVpnEnabled(f.registry,f.router.id,true).success,true);
 const d=disconnectRemoteVpn(c.session);
 assert.equal(observeRemoteVpnPing(f.registry,d,f.server.id,f.addresses).code,"disconnected");
});
test("VPN-N04 : câble WAN ou LAN coupé",()=>{
 const f=fixture();f.configure();const c=f.connect();assert.equal(c.success,true);
 assert.ok(f.registry.disconnectCableEnd(f.lanCable,1).success);
 assert.equal(observeRemoteVpnPing(f.registry,c.session,f.server.id,f.addresses).success,false);
 assert.ok(f.registry.connectCableEnd(f.lanCable,1,f.lan).success);
 assert.equal(observeRemoteVpnPing(f.registry,c.session,f.server.id,f.addresses).success,true);
 assert.ok(f.registry.disconnectCableEnd(f.wanCable,1).success);
 assert.equal(observeRemoteVpnPing(f.registry,c.session,f.server.id,f.addresses).success,false);
 assert.equal(f.connect().success,false);
});
test("VPN-N05 : destination hors LAN, mauvais adressage et configuration refusée",()=>{
 const f=fixture();f.configure();const c=f.connect();
 const bad={...f.addresses,[f.server.id]:{address:"192.168.50.10",prefix:24,gateway:"192.168.10.1"}};
 assert.equal(observeRemoteVpnPing(f.registry,c.session,f.server.id,bad).code,"wrong_destination");
 const original=f.registry.exportState();
 assert.equal(configureRemoteVpn(f.registry,f.router.id,{...f.settings,vpnNetwork:"192.168.10.0"}).success,false);
 assert.deepEqual(f.registry.exportState(),original);
});
test("VPN-N06 : configuration VPN conservée après restauration du registre R2",()=>{
 const f=fixture();f.configure();
 const restored=restoreAssetRegistry(f.registry.exportState());
 assert.deepEqual(getRemoteVpnConfig(restored,f.router.id),getRemoteVpnConfig(f.registry,f.router.id));
});


function dnsCore({up=true,record=true,configured=true}={}){
 const clientId="dns-proxy",serverId="dns-local";
 return {clientId,engine:createEngine({
  format:"r2d3-scenario",schemaVersion:1,scenarioId:"vpn-dns-tests",
  scenarioVersion:"1.0.0",capabilities:{network:true},
  objects:[
   {id:clientId,kind:"ethernet-endpoint",name:"Relais DNS du LAN",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.10.1",prefix:24},
    networkOptions:{gateway:null,dns:configured?["192.168.10.10"]:[]}},runtime:{}},
   {id:serverId,kind:"ethernet-endpoint",name:"DNS",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.10.10",prefix:24},
     dnsEnabled:up,dnsZone:{domain:"entreprise.test",negativeTtl:60,records:record?
      [{name:"srv-local.entreprise.test",type:"A",value:"192.168.10.10",ttl:300}]:[]}},runtime:{}}
  ],
  links:[{id:"dns-lan",kind:"ethernet-cable",connected:true,
   endpoints:[{objectId:clientId,portId:"eth0"},{objectId:serverId,portId:"eth0"}]}]
 })};
}
test("VPN-DNS01 : serveur DNS fourni par le routeur à la connexion et ping par nom",()=>{
 const f=fixture();f.settings.dnsServer="192.168.10.10";
 assert.equal(f.configure().success,true);
 const c=f.connect();assert.equal(c.success,true);
 assert.equal(c.session.dnsServer,"192.168.10.10");
 const d=dnsCore();
 const result=observeRemoteVpnPingName(f.registry,c.session,"srv-local.entreprise.test",f.server.id,f.addresses,
  {dnsEngine:d.engine,dnsClientId:d.clientId,dnsAssetId:f.server.id});
 assert.equal(result.success,true,JSON.stringify(result));
 assert.equal(result.resolvedAddress,"192.168.10.10");
});
test("VPN-DNS02 : serveur DNS arrêté et nom absent",()=>{
 const f=fixture();f.settings.dnsServer="192.168.10.10";f.configure();const c=f.connect();
 for(const [opts,expected] of [[{up:false},"dns_error"],[{record:false},"dns_not_found"],[{configured:false},"dns_error"]]){
  const d=dnsCore(opts);
  const r=observeRemoteVpnPingName(f.registry,c.session,"srv-local.entreprise.test",f.server.id,f.addresses,
   {dnsEngine:d.engine,dnsClientId:d.clientId,dnsAssetId:f.server.id});
  assert.equal(r.code,expected,JSON.stringify(r));
 }
});
test("VPN-DNS03 : coupure du VPN ou du LAN bloque la résolution",()=>{
 const f=fixture();f.settings.dnsServer="192.168.10.10";f.configure();const c=f.connect(),d=dnsCore();
 const probe=()=>observeRemoteVpnPingName(f.registry,c.session,"srv-local.entreprise.test",f.server.id,f.addresses,
  {dnsEngine:d.engine,dnsClientId:d.clientId,dnsAssetId:f.server.id});
 assert.equal(probe().success,true);
 f.registry.disconnectCableEnd(f.lanCable,1);
 assert.equal(probe().code,"dns_unreachable");
 f.registry.connectCableEnd(f.lanCable,1,f.lan);
 assert.equal(setRemoteVpnEnabled(f.registry,f.router.id,false).success,true);
 assert.equal(probe().code,"dns_unreachable");
});
test("VPN-DNS04 : DNS absent, DNS invalide et restauration",()=>{
 const f=fixture();
 assert.equal(f.configure().success,true);
 const c=f.connect();assert.equal(c.session.dnsServer,"");
 assert.equal(observeRemoteVpnPingName(f.registry,c.session,"srv-local.entreprise.test",f.server.id,f.addresses,{}).code,"dns_not_configured");
 const before=f.registry.exportState();
 assert.equal(configureRemoteVpn(f.registry,f.router.id,{...f.settings,dnsServer:"999.1.1.1"}).success,false);
 assert.deepEqual(f.registry.exportState(),before);
 assert.equal(configureRemoteVpn(f.registry,f.router.id,{...f.settings,dnsServer:"192.168.10.10"}).success,true);
 const restored=restoreAssetRegistry(f.registry.exportState());
 assert.deepEqual(getRemoteVpnConfig(restored,f.router.id).dnsServers,["192.168.10.10"]);
});

test("VPN-ACCOUNTS01 : plusieurs nomades, IPv4 distinctes et comptes désactivés",()=>{
 const f=fixture();
 const accounts=[{username:"alice",password:"a1",enabled:true},{username:"bob",password:"b2",enabled:true},{username:"carol",password:"c3",enabled:false}];
 assert.equal(configureRemoteVpn(f.registry,f.router.id,{...f.settings,accounts,dnsServers:["192.168.10.10","192.168.10.11"]}).success,true);
 const alice=f.connect({...f.credentials,username:"alice",password:"a1"});
 const bob=f.connect({...f.credentials,username:"bob",password:"b2"});
 assert.equal(alice.success,true);assert.equal(bob.success,true);
 assert.notEqual(alice.session.vpnAddress,bob.session.vpnAddress);
 assert.deepEqual(alice.session.dnsServers,["192.168.10.10","192.168.10.11"]);
 assert.equal(f.connect({...f.credentials,username:"carol",password:"c3"}).code,"wrong_credentials");
 const restored=restoreAssetRegistry(f.registry.exportState());
 assert.equal(getRemoteVpnConfig(restored,f.router.id).accounts.length,3);
});
test("VPN-ACCOUNTS02 : comptes en doublon et plus de 100 refusés",()=>{
 const f=fixture(),user={username:"alice",password:"demo",enabled:true};
 assert.equal(configureRemoteVpn(f.registry,f.router.id,{...f.settings,accounts:[user,{...user,username:"ALICE"}]}).success,false);
 assert.equal(configureRemoteVpn(f.registry,f.router.id,{...f.settings,accounts:Array.from({length:101},(_,i)=>({...user,username:"u"+i}))}).success,false);
});

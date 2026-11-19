import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureRemoteVpn,getRemoteVpnConfig,setRemoteVpnEnabled,connectRemoteVpn,disconnectRemoteVpn,observeRemoteVpnPing} from "../src/router-vpn-remote-v1.js";

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

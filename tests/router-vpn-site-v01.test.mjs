import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureSiteVpn,getSiteVpnConfig,observeSiteVpnPing,observeSiteVpnPingName} from "../src/router-vpn-site-v01.js";
import {createEngine} from "../src/r2d3-core.js";
function fixture(){
 const registry=createAssetRegistry();
 const a=createRouter(registry,{name:"SITE-A"}).asset;
 const b=createRouter(registry,{name:"SITE-B"}).asset;
 const profile=registry.createProfile("PC VPN RJ45").profile;
 assert.ok(registry.addPortGroup(profile.id,{type:"ethernet-rj45",prefix:"NIC",start:1,count:1}).success);
 const pcA=registry.createAsset(profile.id,{name:"PC-A"}).asset;
 const pcB=registry.createAsset(profile.id,{name:"PC-B"}).asset;
 const ports={aw:a.ports[0].id,al:a.ports[1].id,bw:b.ports[0].id,bl:b.ports[1].id};
 const cable=(x,y)=>{
  const c=registry.createCable().cable;
  assert.ok(registry.connectCableEnd(c.id,0,x).success);
  assert.ok(registry.connectCableEnd(c.id,1,y).success);
  return c.id;
 };
 const cableA=cable(pcA.ports[0].id,ports.al);
 const cableWAN=cable(ports.aw,ports.bw);
 const cableB=cable(pcB.ports[0].id,ports.bl);
 for(const [r,id,role,address] of [
  [a,ports.aw,"wan","203.0.113.1"],[a,ports.al,"lan","192.168.10.1"],
  [b,ports.bw,"wan","203.0.113.2"],[b,ports.bl,"lan","192.168.20.1"]
 ])assert.ok(configureRouterPort(registry,r.id,id,{role,mode:"static",address,prefix:24}).success);
 const ca={wanPortId:ports.aw,lanPortId:ports.al,peerAddress:"203.0.113.2",remoteNetwork:"192.168.20.0",remotePrefix:24,enabled:true};
 const cb={wanPortId:ports.bw,lanPortId:ports.bl,peerAddress:"203.0.113.1",remoteNetwork:"192.168.10.0",remotePrefix:24,enabled:true};
 const configure=()=>{assert.ok(configureSiteVpn(registry,a.id,ca).success);assert.ok(configureSiteVpn(registry,b.id,cb).success)};
 const addresses={[pcA.id]:{address:"192.168.10.10",prefix:24,gateway:"192.168.10.1"},
  [pcB.id]:{address:"192.168.20.10",prefix:24,gateway:"192.168.20.1"}};
 const ping=()=>observeSiteVpnPing(registry,a.id,b.id,pcA.id,pcB.id,addresses);
 return {registry,a,b,pcA,pcB,ports,cableA,cableB,cableWAN,ca,cb,configure,addresses,ping};
}
test("SITE01 : deux configurations miroir et ping inter-LAN",()=>{
 const f=fixture();f.configure();
 assert.equal(f.ping().success,true,JSON.stringify(f.ping()));
});
test("SITE02 : un tunnel désactivé bloque le passage",()=>{
 const f=fixture();f.configure();
 assert.ok(configureSiteVpn(f.registry,f.b.id,{...f.cb,enabled:false}).success);
 assert.equal(f.ping().code,"tunnel_off");
 assert.ok(configureSiteVpn(f.registry,f.b.id,f.cb).success);
 assert.equal(f.ping().success,true);
});
test("SITE03 : adresse du routeur pair incorrecte",()=>{
 const f=fixture();f.configure();
 assert.ok(configureSiteVpn(f.registry,f.a.id,{...f.ca,peerAddress:"203.0.113.99"}).success);
 assert.equal(f.ping().code,"mirror_mismatch");
});
test("SITE04 : coupures WAN et LAN sans faux positif",()=>{
 const f=fixture();f.configure();
 assert.ok(f.registry.disconnectCableEnd(f.cableWAN,1).success);
 assert.equal(f.ping().code,"link_down");
 assert.ok(f.registry.connectCableEnd(f.cableWAN,1,f.ports.bw).success);
 assert.equal(f.ping().success,true);
 assert.ok(f.registry.disconnectCableEnd(f.cableB,1).success);
 assert.equal(f.ping().code,"link_down");
 assert.ok(f.registry.connectCableEnd(f.cableB,1,f.ports.bl).success);
 assert.equal(f.ping().success,true);
});
test("SITE05 : passerelle incorrecte, routeur arrêté",()=>{
 const f=fixture();f.configure();
 f.addresses[f.pcB.id].gateway="192.168.20.99";
 assert.equal(f.ping().code,"address_invalid");
 f.addresses[f.pcB.id].gateway="192.168.20.1";
 assert.ok(f.registry.updateAsset(f.b.id,{status:"Hors service"}).success);
 assert.equal(f.ping().code,"device_down");
});
test("SITE06 : réseau distant incorrect refusé et export/restauration",()=>{
 const f=fixture();f.configure();
 const original=f.registry.exportState();
 assert.equal(configureSiteVpn(f.registry,f.a.id,{...f.ca,remoteNetwork:"192.168.10.0"}).success,false);
 assert.deepEqual(f.registry.exportState(),original);
 const restored=restoreAssetRegistry(original);
 assert.deepEqual(getSiteVpnConfig(restored,f.a.id),f.ca);
});

function siteDns(){
 const engine=createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"site-dns-test",
 scenarioVersion:"1.0.0",capabilities:{network:true},objects:[
 {id:"dns-proxy",kind:"ethernet-endpoint",name:"Relais vers DNS site B",ports:[{id:"eth0",type:"rj45"}],
  config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.20.1",prefix:24},
   networkOptions:{gateway:null,dns:["192.168.20.10"]}},runtime:{}},
 {id:"dns-server",kind:"ethernet-endpoint",name:"DNS PC B",ports:[{id:"eth0",type:"rj45"}],
  config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.20.10",prefix:24},
   dnsEnabled:true,dnsZone:{domain:"entreprise.test",negativeTtl:60,
    records:[{name:"pc-b.entreprise.test",type:"A",value:"192.168.20.10",ttl:300}]}},runtime:{}}
 ],links:[{id:"dns-link",kind:"ethernet-cable",connected:true,
  endpoints:[{objectId:"dns-proxy",portId:"eth0"},{objectId:"dns-server",portId:"eth0"}]}]});
 return {dnsEngine:engine,dnsClientId:"dns-proxy"};
}
test("SITE-DNS01 : ping par nom depuis le DNS du PC A, sans DNS dans le tunnel",()=>{
 const f=fixture();f.configure();
 f.addresses[f.pcA.id].dns=["192.168.20.10"];
 const query=()=>observeSiteVpnPingName(f.registry,f.a.id,f.b.id,f.pcA.id,f.pcB.id,f.addresses,
  "pc-b.entreprise.test",{...siteDns(),dnsAssetId:f.pcB.id});
 const result=query();
 assert.equal(result.success,true,JSON.stringify(result));
 assert.equal(result.resolvedAddress,"192.168.20.10");
 assert.equal(getSiteVpnConfig(f.registry,f.a.id).dnsServers,undefined);
});
test("SITE-DNS02 : absence ou erreur DNS sur PC A interdit la résolution sans bloquer IPv4",()=>{
 const f=fixture();f.configure();
 const opts={...siteDns(),dnsAssetId:f.pcB.id};
 const query=()=>observeSiteVpnPingName(f.registry,f.a.id,f.b.id,f.pcA.id,f.pcB.id,f.addresses,"pc-b.entreprise.test",opts);
 assert.equal(query().code,"dns_missing");
 f.addresses[f.pcA.id].dns=["192.168.20.99"];
 assert.equal(query().code,"dns_wrong_server");
 assert.equal(f.ping().success,true);
 f.addresses[f.pcA.id].dns=["192.168.20.10"];
 assert.equal(query().success,true);
 assert.equal(observeSiteVpnPingName(f.registry,f.a.id,f.b.id,f.pcA.id,f.pcB.id,f.addresses,"inconnu.entreprise.test",opts).code,"dns_not_found");
});
test("SITE-DNS03 : coupure du VPN interdit le DNS distant et sa remise en service le rétablit",()=>{
 const f=fixture();f.configure();f.addresses[f.pcA.id].dns=["192.168.20.10"];
 const opts={...siteDns(),dnsAssetId:f.pcB.id};
 const query=()=>observeSiteVpnPingName(f.registry,f.a.id,f.b.id,f.pcA.id,f.pcB.id,f.addresses,"pc-b.entreprise.test",opts);
 assert.equal(query().success,true);
 assert.ok(configureSiteVpn(f.registry,f.b.id,{...f.cb,enabled:false}).success);
 assert.equal(query().code,"dns_unreachable");
 assert.ok(configureSiteVpn(f.registry,f.b.id,f.cb).success);
 assert.equal(query().success,true);
});

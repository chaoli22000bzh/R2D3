import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createBoxInternetSession,createBoxBridgeInternetSession} from "../src/box-internet-v1.js";
const yes=r=>assert.equal(r.success,true,JSON.stringify(r));
const no=(r,code)=>{assert.equal(r.success,false,JSON.stringify(r));assert.equal(r.code,code);};
function fixture(){
 const registry=createAssetRegistry(),box=registry.createBoxComposite("BOX-01");yes(box);
 const p=registry.createProfile("PC RJ45");yes(p);
 yes(registry.addPortGroup(p.profile.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:1}));
 const a=registry.createAsset(p.profile.id,{name:"PC-A"}),b=registry.createAsset(p.profile.id,{name:"PC-B"});yes(a);yes(b);
 const cables=[];
 for(const [client,index] of [[a.asset,0],[b.asset,1]]){
  const c=registry.createCable();yes(c);cables.push(c.cable.id);
  yes(registry.connectCableEnd(c.cable.id,0,client.ports[0].id));
  yes(registry.connectCableEnd(c.cable.id,1,box.config.ports.lanPortIds[index]));
 }
 const services=[{id:"web-public",address:"80.10.246.50",kind:"http",available:true},
  {id:"dns-orange",address:"80.10.246.2",kind:"dns",available:true}];
 const start=()=>createBoxInternetSession({registry,boxId:box.asset.id,clients:[
  {assetId:a.asset.id,medium:"ethernet"},{assetId:b.asset.id,medium:"ethernet"}],services});
 return {registry,box,a:a.asset,b:b.asset,cables,services,start};
}
test("Internet 01 : deux PC sortent avec la même IPv4 publique, PAT différent",()=>{
 const f=fixture(),s=f.start();yes(s);
 const a=s.request({clientId:f.a.id,targetAddress:"80.10.246.50"});
 const b=s.request({clientId:f.b.id,targetAddress:"80.10.246.50"});yes(a);yes(b);
 assert.equal(a.nat.externalAddress,"90.14.10.20");
 assert.equal(b.nat.externalAddress,"90.14.10.20");
 assert.notEqual(a.nat.externalPort,b.nat.externalPort);
 assert.deepEqual([a.nat.internalAddress,b.nat.internalAddress],["192.168.1.100","192.168.1.101"]);
 assert.equal(a.route.wanGateway,"90.14.10.1");
 assert.equal(s.listNat().length,2);
});
test("Internet 02 : deuxième requête conserve sa translation",()=>{
 const f=fixture(),s=f.start();yes(s);
 const req={clientId:f.a.id,targetAddress:"80.10.246.50"};
 const a=s.request(req),b=s.request(req);yes(a);yes(b);
 assert.equal(a.nat.externalPort,b.nat.externalPort);
 assert.equal(s.listNat().length,1);
});
test("Internet 03 : DNS distant joignable, service arrêté bloqué",()=>{
 const f=fixture(),s=f.start();yes(s);
 yes(s.request({clientId:f.a.id,targetAddress:"80.10.246.2",service:"dns"}));
 f.services[1].available=false;
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.2",service:"dns"}),"service_offline");
});
test("Internet 04 : service Internet absent refusé",()=>{
 const f=fixture(),s=f.start();yes(s);
 no(s.request({clientId:f.a.id,targetAddress:"8.8.8.8",service:"dns"}),"service_unknown");
});
test("Internet 05 : débranchement LAN interdit Internet malgré bail conservé",()=>{
 const f=fixture(),s=f.start();yes(s);
 yes(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}));
 yes(f.registry.disconnectCableEnd(f.cables[0],1));
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"link_down");
 yes(s.request({clientId:f.b.id,targetAddress:"80.10.246.50"}));
});
test("Internet 06 : box arrêtée et changement WAN bloquent les communications",()=>{
 const f=fixture(),s=f.start();yes(s);
 yes(f.registry.updateAsset(f.box.asset.id,{status:"Hors service"}));
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"box_offline");
 yes(f.registry.updateAsset(f.box.asset.id,{status:"En service"}));
 yes(f.registry.setBoxWanConfig(f.box.asset.id,{mode:"static",address:"90.14.10.99",prefix:24,
  gateway:"90.14.10.1",dns:["80.10.246.2","80.10.246.129"]}));
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"out_of_sync");
});
test("Internet 07 : DHCP LAN inactif ne donne pas d'accès Internet",()=>{
 const f=fixture(),lan=f.registry.getAsset(f.box.asset.id).boxConfig.lan;
 yes(f.registry.setBoxLanConfig(f.box.asset.id,{...lan,dhcpEnabled:false}));
 const s=f.start();yes(s);
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"client_network");
});

test("Internet 08 : PC avec plusieurs ports Ethernet, seul le port réellement câblé est utilisé",()=>{
 const f=fixture();
 const p=f.registry.createProfile("PC multports");yes(p);
 yes(f.registry.addPortGroup(p.profile.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:3}));
 const pc=f.registry.createAsset(p.profile.id,{name:"PC-MULTI"});yes(pc);
 const cable=f.registry.createCable();yes(cable);
 yes(f.registry.connectCableEnd(cable.cable.id,0,pc.asset.ports[2].id));
 yes(f.registry.connectCableEnd(cable.cable.id,1,f.box.config.ports.lanPortIds[2]));
 const session=createBoxInternetSession({registry:f.registry,boxId:f.box.asset.id,
  clients:[{assetId:pc.asset.id,medium:"ethernet"}],services:f.services});yes(session);
 const result=session.request({clientId:pc.asset.id,targetAddress:"80.10.246.50"});yes(result);
 assert.equal(result.nat.externalAddress,"90.14.10.20");
 assert.equal(session.lanSession.clients[0].lanPortId,f.box.config.ports.lanPortIds[2]);
});
test("Internet 09 : plusieurs connexions LAN d'un même PC refusées sans ambiguïté",()=>{
 const f=fixture(),p=f.registry.createProfile("PC multports");yes(p);
 yes(f.registry.addPortGroup(p.profile.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:2}));
 const pc=f.registry.createAsset(p.profile.id,{name:"PC-DOUBLE"});yes(pc);
 for(let i=0;i<2;i++){
  const cable=f.registry.createCable();yes(cable);
  yes(f.registry.connectCableEnd(cable.cable.id,0,pc.asset.ports[i].id));
  yes(f.registry.connectCableEnd(cable.cable.id,1,f.box.config.ports.lanPortIds[i+2]));
 }
 const session=createBoxInternetSession({registry:f.registry,boxId:f.box.asset.id,
  clients:[{assetId:pc.asset.id,medium:"ethernet"}],services:f.services});
 no(session,"ambiguous_lan");
});

test("Internet bridge : routage et PAT sortant refusés sans effacer la configuration",()=>{
 const f=fixture(),s=f.start();yes(s);
 const request={clientId:f.a.id,targetAddress:"80.10.246.50"};
 yes(s.request(request));
 const before=f.registry.getAsset(f.box.asset.id).boxConfig;
 yes(f.registry.setBoxMode(f.box.asset.id,"bridge"));
 no(s.request(request),"bridge_mode");
 no(f.start(),"bridge_mode");
 yes(f.registry.setBoxMode(f.box.asset.id,"router"));
 assert.deepEqual(f.registry.getAsset(f.box.asset.id).boxConfig.lan,before.lan);
 yes(f.start().request(request));
});

test("Bridge DHCP : PC LAN 1 reçoit son bail Internet via le Core, aucun PAT",()=>{
 const f=fixture(),id=f.box.asset.id,wan=f.registry.getBoxWanEffective(id);
 yes(f.registry.setBoxMode(id,"bridge"));
 const session=createBoxBridgeInternetSession({registry:f.registry,boxId:id,
  clients:[{assetId:f.a.id}],services:f.services});yes(session);
 assert.ok(session.dhcpEngine?.dispatch,"Core DHCP commun attendu");
 const result=session.request({clientId:f.a.id,targetAddress:"80.10.246.50"});yes(result);
 assert.equal(result.client.mode,"dhcp");
 assert.equal(result.client.address,wan.address);
 assert.equal(result.client.prefix,wan.prefix);
 assert.equal(result.client.gateway,wan.gateway);
 assert.deepEqual(result.client.dns,wan.dns);
 assert.ok(result.client.lease);
 assert.equal(result.nat,null);
 assert.deepEqual(session.listNat(),[]);
 const lease=session.dhcpEngine.query({type:"dhcp.leases",serverId:id+"/internet-dhcp"});
 assert.equal(lease.status,"ok");
 assert.equal(lease.leases.length,1);
 assert.equal(lease.leases[0].address,wan.address);
 yes(session.request({clientId:f.a.id,targetAddress:"80.10.246.2",service:"dns"}));
 assert.equal(session.dhcpEngine.query({type:"dhcp.leases",serverId:id+"/internet-dhcp"}).leases.length,1);
});

test("Bridge statique : PC reprend paramètres WAN saisis manuellement",()=>{
 const f=fixture(),id=f.box.asset.id,wan={
  mode:"static",address:"90.14.10.99",prefix:24,gateway:"90.14.10.1",
  dns:["80.10.246.2","80.10.246.129"]};
 yes(f.registry.setBoxWanConfig(id,wan));
 yes(f.registry.setBoxMode(id,"bridge"));
 const session=createBoxBridgeInternetSession({registry:f.registry,boxId:id,
  clients:[{assetId:f.a.id}],services:f.services});yes(session);
 assert.equal(session.dhcpEngine,null);
 no(session.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"client_ipv4_invalid");
 no(session.request({clientId:f.a.id,targetAddress:"80.10.246.50",
  clientIpv4:{mode:"dhcp"}}),"client_mode");
 const req={clientId:f.a.id,targetAddress:"80.10.246.50",clientIpv4:{
  mode:"static",address:wan.address,prefix:wan.prefix,gateway:wan.gateway,dns:wan.dns}};
 const reached=session.request(req);yes(reached);
 assert.equal(reached.client.mode,"static");assert.equal(reached.client.address,wan.address);
 assert.equal(reached.nat,null);
 no(session.request({...req,clientIpv4:{...req.clientIpv4,dns:["8.8.8.8"]}}),"client_dns");
});

test("Bridge DHCP : refuse PC sur LAN 2, câble débranché et saisie statique",()=>{
 const f=fixture(),id=f.box.asset.id;yes(f.registry.setBoxMode(id,"bridge"));
 const other=createBoxBridgeInternetSession({registry:f.registry,boxId:id,
  clients:[{assetId:f.b.id}],services:f.services});yes(other);
 no(other.request({clientId:f.b.id,targetAddress:"80.10.246.50"}),"bridge_port_inactive");
 const s=createBoxBridgeInternetSession({registry:f.registry,boxId:id,
  clients:[{assetId:f.a.id}],services:f.services});yes(s);
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50",
  clientIpv4:{mode:"static",address:"90.14.10.20"}}),"client_mode");
 yes(f.registry.disconnectCableEnd(f.cables[0],1));
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"link_down");
});

test("Bridge DHCP : services arrêtés, retour Routeur et sauvegarde WAN",()=>{
 const f=fixture(),id=f.box.asset.id,wan=f.registry.getBoxWanEffective(id);
 yes(f.registry.setBoxMode(id,"bridge"));
 const s=createBoxBridgeInternetSession({registry:f.registry,boxId:id,
  clients:[{assetId:f.a.id}],services:f.services});yes(s);
 f.services[0].available=false;
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"service_offline");
 f.services[0].available=true;yes(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}));
 yes(f.registry.setBoxMode(id,"router"));
 no(s.request({clientId:f.a.id,targetAddress:"80.10.246.50"}),"bridge_mode_changed");
 assert.deepEqual(f.registry.getBoxWanEffective(id),wan);
 assert.equal(f.registry.getBoxWanRuntime(id).owner,"box");
 yes(f.start().request({clientId:f.a.id,targetAddress:"80.10.246.50"}));
});

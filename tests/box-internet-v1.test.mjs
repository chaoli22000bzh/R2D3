import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createBoxInternetSession} from "../src/box-internet-v1.js";
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

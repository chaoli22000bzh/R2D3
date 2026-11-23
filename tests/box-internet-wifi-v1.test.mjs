import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createBoxInternetSession} from "../src/box-internet-v1.js";

const yes=r=>assert.equal(r.success,true,JSON.stringify(r));
const no=(r,code)=>{assert.equal(r.success,false,JSON.stringify(r));assert.equal(r.code,code);};
function fixture({mixed=false}={}){
 const registry=createAssetRegistry(),box=registry.createBoxComposite("BOX-01");yes(box);
 const p=registry.createProfile("PC Wi-Fi");yes(p);
 yes(registry.addPortGroup(p.profile.id,{type:"wifi",prefix:"WIFI",start:1,count:1}));
 if(mixed)yes(registry.addPortGroup(p.profile.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:1}));
 const pc=registry.createAsset(p.profile.id,{name:"PC-WIFI"});yes(pc);
 const s=[{id:"internet-http",address:"80.10.246.50",kind:"http",available:true}];
 const start=(extra={})=>createBoxInternetSession({registry,boxId:box.asset.id,
  clients:[{assetId:pc.asset.id,medium:"wifi",ssidId:"ssid-1",password:"12345678",...extra}],services:s});
 return {registry,box,pc:pc.asset,start};
}
test("Box Wi-Fi Internet 01 : PC Wi-Fi du parc obtient DHCP puis PAT sortant",()=>{
 const f=fixture(),session=f.start();yes(session);
 const result=session.request({clientId:f.pc.id,targetAddress:"80.10.246.50"});yes(result);
 assert.equal(result.nat.internalAddress,"192.168.1.100");
 assert.equal(result.route.gateway,"192.168.1.1");
 assert.equal(result.nat.externalAddress,"90.14.10.20");
 assert.equal(session.lanSession.clients[0].medium,"wifi");
 assert.equal(session.lanSession.clients[0].association.ssidId,"ssid-1");
});
test("Box Wi-Fi Internet 02 : PC mixte RJ45 et Wi-Fi fonctionne sans câble Ethernet",()=>{
 const f=fixture({mixed:true}),session=f.start();yes(session);
 yes(session.request({clientId:f.pc.id,targetAddress:"80.10.246.50"}));
});
test("Box Wi-Fi Internet 03 : isolation mode n'empêche pas Internet",()=>{
 const f=fixture(),config=f.registry.getAsset(f.box.asset.id).boxConfig.wifi;
 const wifi=structuredClone(config);wifi.ssids[0].clientIsolation=true;
 yes(f.registry.setBoxWifiConfig(f.box.asset.id,wifi));
 const session=f.start();yes(session);
 assert.equal(session.lanSession.clients[0].association.clientIsolation,true);
 yes(session.request({clientId:f.pc.id,targetAddress:"80.10.246.50"}));
});
test("Box Wi-Fi Internet 04 : mauvaise authentification bloque DHCP et Internet",()=>{
 const f=fixture(),wifi=structuredClone(f.registry.getAsset(f.box.asset.id).boxConfig.wifi);
 wifi.ssids[0].security="wpa2-personal";wifi.ssids[0].password="SecretWifi123";
 yes(f.registry.setBoxWifiConfig(f.box.asset.id,wifi));
 no(f.start({password:"mauvais"}),"authentication_failed");
 const good=f.start({password:"SecretWifi123"});yes(good);
 yes(good.request({clientId:f.pc.id,targetAddress:"80.10.246.50"}));
});
test("Box Wi-Fi Internet 05 : Wi-Fi coupé après association bloque une nouvelle requête",()=>{
 const f=fixture(),session=f.start();yes(session);
 yes(session.request({clientId:f.pc.id,targetAddress:"80.10.246.50"}));
 const wifi=structuredClone(f.registry.getAsset(f.box.asset.id).boxConfig.wifi);
 wifi.enabled=false;yes(f.registry.setBoxWifiConfig(f.box.asset.id,wifi));
 no(session.request({clientId:f.pc.id,targetAddress:"80.10.246.50"}),"ap_disabled");
});
test("Box Wi-Fi Internet 06 : SSID inactif refuse l'association",()=>{
 const f=fixture(),wifi=structuredClone(f.registry.getAsset(f.box.asset.id).boxConfig.wifi);
 wifi.ssids[0].enabled=false;yes(f.registry.setBoxWifiConfig(f.box.asset.id,wifi));
 no(f.start(),"ssid_unavailable");
});

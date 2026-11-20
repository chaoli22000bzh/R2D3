import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureRouterDhcp} from "../src/router-dhcp-service-v1.js";
import {createWifiAccessPoint,configureWifiAp,getWifiConfig} from "../src/wifi-ap-v1.js";
import {requestWifiRouterDhcp} from "../src/wifi-dhcp-v1.js";
function fixture(){
 const registry=createAssetRegistry(),ap=createWifiAccessPoint(registry,{name:"AP-01"}).asset;
 const router=createRouter(registry,{name:"RTR-01",ports:2}).asset;
 const profile=registry.createProfile("PC Wi-Fi").profile;
 assert.equal(registry.addPortGroup(profile.id,{type:"wifi",prefix:"WLAN",start:1,count:1}).success,true);
 const client=registry.createAsset(profile.id,{name:"PC portable"}).asset;
 const cable=registry.createCable().cable;
 assert.equal(registry.connectCableEnd(cable.id,0,ap.ports.find(p=>p.type==="ethernet-rj45").id).success,true);
 assert.equal(registry.connectCableEnd(cable.id,1,router.ports[1].id).success,true);
 assert.equal(configureRouterPort(registry,router.id,router.ports[1].id,{role:"lan",mode:"static",address:"192.168.10.1",prefix:24}).success,true);
 const pools=[{id:"wifi10",portId:router.ports[1].id,start:"192.168.10.100",end:"192.168.10.110",prefix:24,gateway:"192.168.10.1",dns:["192.168.10.1"],leaseSeconds:3600}];
 assert.equal(configureRouterDhcp(registry,router.id,{enabled:true,pools}).success,true);
 const ssids=[{...getWifiConfig(registry,ap.id).ssids[0],security:"wpa2-personal",password:"Ciel2026!",bands:["5"]}];
 assert.equal(configureWifiAp(registry,ap.id,{ssids}).success,true);
 const args={registry,apId:ap.id,routerId:router.id,clientId:client.id,password:"Ciel2026!",bands:["5"]};
 return {registry,ap,router,client,cable,pools,args};
}
test("Wi-Fi : attribution par le Core DHCP après vérification du câble physique",()=>{
 const f=fixture(),r=requestWifiRouterDhcp(f.args);
 assert.equal(r.success,true,JSON.stringify(r));
 assert.equal(r.address,"192.168.10.100");
 assert.equal(r.prefix,24);assert.equal(r.gateway,"192.168.10.1");
 assert.deepEqual(r.dns,["192.168.10.1"]);
});
test("Wi-Fi : câble débranché, aucune attribution, service restauré",()=>{
 const f=fixture();assert.equal(f.registry.disconnectCableEnd(f.cable.id,1).success,true);
 assert.equal(requestWifiRouterDhcp(f.args).code,"link_down");
 assert.equal(f.registry.connectCableEnd(f.cable.id,1,f.router.ports[1].id).success,true);
 assert.equal(requestWifiRouterDhcp(f.args).address,"192.168.10.100");
});
test("Wi-Fi : arrêt du DHCP, APIPA par moteur partagé, puis réactivation",()=>{
 const f=fixture();
 assert.equal(configureRouterDhcp(f.registry,f.router.id,{enabled:false,pools:f.pools}).success,true);
 const fail=requestWifiRouterDhcp(f.args);
 assert.equal(fail.code,"apipa",JSON.stringify(fail));assert.match(fail.address,/^169\.254\./);
 assert.equal(configureRouterDhcp(f.registry,f.router.id,{enabled:true,pools:f.pools}).success,true);
 assert.equal(requestWifiRouterDhcp(f.args).address,"192.168.10.100");
});
test("Wi-Fi : une authentification refusée n'attribue aucun bail",()=>{
 const f=fixture();assert.equal(requestWifiRouterDhcp({...f.args,password:"incorrect"}).code,"authentication_failed");
 assert.equal(configureWifiAp(f.registry,f.ap.id,{enabled:false}).success,true);
 assert.equal(requestWifiRouterDhcp(f.args).code,"ap_disabled");
});

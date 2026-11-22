import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,getWifiConfig} from "../src/wifi-ap-v1.js";
import {updateWifiRoaming} from "../src/wifi-roaming-v1.js";
function setup(){
 const registry=createAssetRegistry(),aps=[];
 for(const [name,x] of [["A",24],["B",96]]){
  const created=createWifiAccessPoint(registry,{name});
  assert.equal(created.success,true);
  const id=created.asset.id,c=getWifiConfig(registry,id);
  assert.equal(configureWifiAp(registry,id,{ssids:[{...c.ssids[0],name:"LYCEE-CIEL",vlanNumber:10,bands:["2.4"]}]}).success,true);
  aps.push({id,x,y:25,z:0});
 }
 return {registry,aps};
}
const move=({registry,aps},x,previous=null)=>updateWifiRoaming({registry,accessPoints:aps,client:{x,y:25,z:0},ssid:"LYCEE-CIEL",bands:["2.4"],previous});
test("Association initiale : borne la plus proche et BSSID déterministe",()=>{
 const env=setup(),s=move(env,24,{ipv4:"192.168.10.100"});
 assert.equal(s.success,true);assert.equal(s.code,"wifi_associated");
 assert.equal(s.apId,env.aps[0].id);assert.match(s.bssid,/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
 assert.equal(s.ipv4,"192.168.10.100");
 assert.equal(s.bssid,move(env,24,{ipv4:"192.168.10.100"}).bssid);
});
test("Roaming vers B : BSSID change, adresse IPv4 conservée",()=>{
 const env=setup(),first=move(env,24,{ipv4:"192.168.10.100"}),second=move(env,96,first);
 assert.equal(second.code,"wifi_roamed");
 assert.equal(second.apId,env.aps[1].id);
 assert.notEqual(second.bssid,first.bssid);
 assert.equal(second.ipv4,first.ipv4);
});
test("Client immobile : pas de basculement parasite",()=>{
 const env=setup(),first=move(env,24,{ipv4:"192.168.10.100"}),second=move(env,24,first);
 assert.equal(second.code,"wifi_unchanged");assert.equal(second.changed,false);
});
test("Borne avec VLAN différent : roaming refusé vers un autre réseau logique",()=>{
 const env=setup(),first=move(env,24,{ipv4:"192.168.10.100"});
 const conf=getWifiConfig(env.registry,env.aps[1].id);
 assert.equal(configureWifiAp(env.registry,env.aps[1].id,{ssids:[{...conf.ssids[0],vlanNumber:20}]}).success,true);
 const second=move(env,96,first);
 assert.notEqual(second.apId,env.aps[1].id);
});
test("Mot de passe incorrect : association impossible",()=>{
 const env=setup();
 for(const ap of env.aps){
  const c=getWifiConfig(env.registry,ap.id);
  assert.equal(configureWifiAp(env.registry,ap.id,{ssids:[{...c.ssids[0],security:"wpa2-personal",password:"MonSecret2026"}]}).success,true);
 }
 const rejected=updateWifiRoaming({registry:env.registry,accessPoints:env.aps,client:{x:24,y:25,z:0},ssid:"LYCEE-CIEL",password:"erreur"});
 assert.equal(rejected.connected,false);
});

test("Radio désactivée : borne exclue de l'association",()=>{
 const env=setup();
 for(const ap of env.aps){
  const c=getWifiConfig(env.registry,ap.id);
  const radios={...c.radios,"2.4":{...c.radios["2.4"],enabled:false}};
  assert.equal(configureWifiAp(env.registry,ap.id,{radios}).success,true);
 }
 const result=move(env,24,{ipv4:"192.168.10.100"});
 assert.equal(result.success,true);
 assert.equal(result.connected,false);
 assert.equal(result.code,"wifi_out_of_range");
});
test("Au centre : stabilité sur la borne B, IPv4 et BSSID conservés",()=>{
 const env=setup(),initial=move(env,24,{ipv4:"192.168.10.100"});
 const nearB=move(env,96,initial),center=move(env,60,nearB);
 assert.equal(center.code,"wifi_unchanged");
 assert.equal(center.apId,nearB.apId);
 assert.equal(center.bssid,nearB.bssid);
 assert.equal(center.ipv4,"192.168.10.100");
});
test("Roaming retour B vers A : IPv4 maintenue",()=>{
 const env=setup(),initial=move(env,24,{ipv4:"192.168.10.100"});
 const nearB=move(env,96,initial),back=move(env,24,nearB);
 assert.equal(back.code,"wifi_roamed");
 assert.equal(back.apId,initial.apId);
 assert.equal(back.bssid,initial.bssid);
 assert.equal(back.ipv4,initial.ipv4);
});

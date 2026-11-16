import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,getRouterConfig,configureRouterPort,configureRouterWanPing} from "../src/router-interfaces-v1.js";
test("Routeur : quatre ports indépendants, WAN + trois LAN, DHCP",()=>{
 const r=createAssetRegistry(),a=createRouter(r,{name:"RTR-01"}).asset;
 assert.equal(a.ports.length,4);
 assert.deepEqual(a.ports.map(p=>a.routerConfig.interfaces[p.id].role),["wan","lan","lan","lan"]);
 assert.ok(a.ports.every(p=>a.routerConfig.interfaces[p.id].mode==="dhcp"));
 assert.deepEqual(a.ports.map(p=>a.routerConfig.interfaces[p.id].respondToPing),[false,true,true,true]);
 assert.equal(a.vlanConfig,undefined);
 assert.equal(a.networkCapabilities.includes("ethernet-switching"),false);
});
test("Routeur : port 3 en DMZ, port 2 statique, configuration séparée et reprise",()=>{
 const r=createAssetRegistry(),a=createRouter(r,{name:"RTR-01"}).asset;
 const [p1,p2,p3,p4]=a.ports.map(p=>p.id);
 assert.equal(configureRouterPort(r,a.id,p3,{role:"dmz",mode:"dhcp"}).success,true);
 assert.equal(configureRouterPort(r,a.id,p2,{role:"lan",mode:"static",address:"192.168.10.1",prefix:24,gateway:""}).success,true);
 assert.equal(configureRouterWanPing(r,a.id,p1,true).success,true);
 const c=getRouterConfig(r,a.id);
 assert.equal(c.interfaces[p3].role,"dmz");
 assert.equal(c.interfaces[p2].address,"192.168.10.1");
 assert.equal(c.interfaces[p4].mode,"dhcp");
 assert.equal(c.interfaces[p1].respondToPing,true);
 const restored=restoreAssetRegistry(r.exportState());
 assert.deepEqual(getRouterConfig(restored,a.id),c);
});
test("Routeur : rejets atomiques et dépendances des profils",()=>{
 const r=createAssetRegistry(),a=createRouter(r,{ports:3}).asset,port=a.ports[1].id;
 const before=r.exportState();
 assert.equal(configureRouterPort(r,a.id,port,{role:"lan",mode:"static",address:"999.1.1.1",prefix:24}).success,false);
 assert.deepEqual(r.exportState(),before);
 assert.equal(configureRouterWanPing(r,a.id,port,true).success,false);
 assert.equal(r.setProfileNetworkCapability(a.profileId,"ethernet-switching",true).success,false);
 assert.equal(r.addExtension(a.id,{type:"ethernet-rj45",prefix:"EXT",start:1,count:1}).success,false);
 assert.equal(createRouter(r,{ports:1}).success,false);
 const other=r.createProfile("Sans ports").profile;
 assert.equal(r.setProfileNetworkCapability(other.id,"ipv4-router",true).success,false);
});
test("Routeur : configuration sauvegardée rejetée si incohérente",()=>{
 const r=createAssetRegistry(),a=createRouter(r).asset;
 const bad=r.exportState();
 bad.assets[0].routerConfig.interfaces[a.ports[0].id].role="incorrect";
 assert.throws(()=>restoreAssetRegistry(bad));
});

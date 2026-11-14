import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {createR2D3IdentityHost} from "../src/identity-access-host.js";
const original=JSON.parse(readFileSync(new URL("../scenarios/atelier-ipv4-v1.json",import.meta.url),"utf8"));
function setup(){
 const registry=createAssetRegistry();
 const profile=registry.createProfile("Poste réseau");
 const a=registry.createAsset(profile.profile.id,{name:"PC01"});
 const b=registry.createAsset(profile.profile.id,{name:"SRV01"});
 assert.equal(a.success,true);assert.equal(b.success,true);
 const scenario=structuredClone(original);
 scenario.objects.find(o=>o.id==="pc-01").assetId=a.asset.id;
 const server=scenario.objects.find(o=>o.id==="printer-01");
 server.assetId=b.asset.id;server.kind="windows-server";
 const engine=createEngine(scenario);
 const mapping={[a.asset.id]:"pc-01",[b.asset.id]:"printer-01"};
 const kinds={[a.asset.id]:"computer",[b.asset.id]:"server"};
 const host=createR2D3IdentityHost({assetRegistry:registry,networkEngine:engine,assetToNetworkId:mapping,assetKinds:kinds});
 return {registry,scenario,engine,host,a:a.asset.id,b:b.asset.id,mapping,kinds};
}
const action=(engine,id,targetId,type,params)=>engine.dispatch({commandVersion:1,id,targetId,type,params,expectedRevision:engine.getSnapshot().revision});
const service=(host,id,name="smb")=>host.getServiceStatus(id,name).status;
const access=(host,from,to,purpose="smb")=>host.getReachability(from,to,purpose).status;

test("R3-01 : aucun service implicitement actif, ping OK ne suffit pas",()=>{
 const x=setup();
 assert.equal(x.engine.query({type:"network.ping",sourceId:"pc-01",targetId:"printer-01"}).success,true);
 assert.equal(service(x.host,x.b),"unknown");
 assert.equal(access(x.host,x.a,x.b),"unknown");
 assert.equal(x.host.getMachine(x.a).machine.id,x.a);
});
test("R3-02 : service activé, arrêté et redémarré sur la machine réseau",()=>{
 const x=setup();
 assert.equal(action(x.engine,"start","printer-01","network.setApplicationService",{service:"smb",enabled:true}).status,"applied");
 assert.equal(service(x.host,x.b),"available");
 assert.equal(access(x.host,x.a,x.b),"reachable");
 assert.equal(action(x.engine,"stop","printer-01","network.setApplicationService",{service:"smb",enabled:false}).status,"applied");
 assert.equal(service(x.host,x.b),"unavailable");
 assert.equal(access(x.host,x.a,x.b),"unreachable");
 assert.equal(action(x.engine,"restart","printer-01","network.setApplicationService",{service:"smb",enabled:true}).status,"applied");
 assert.equal(access(x.host,x.a,x.b),"reachable");
});
test("R3-03 : câble débranché bloque SMB, sans arrêter le service",()=>{
 const x=setup();
 action(x.engine,"start","printer-01","network.setApplicationService",{service:"smb",enabled:true});
 assert.equal(action(x.engine,"cut","cable-printer","network.setLinkConnected",{connected:false}).status,"applied");
 assert.equal(service(x.host,x.b),"available");
 assert.equal(access(x.host,x.a,x.b),"unreachable");
 assert.equal(action(x.engine,"repair","cable-printer","network.setLinkConnected",{connected:true}).status,"applied");
 assert.equal(access(x.host,x.a,x.b),"reachable");
});
test("R3-04 : commandes invalides refusées sans mutation",()=>{
 const x=setup(),before=x.engine.exportState();
 assert.equal(action(x.engine,"invalid","printer-01","network.setApplicationService",{service:"rdp",enabled:true}).status,"rejected");
 assert.equal(action(x.engine,"invalid2","printer-01","network.setApplicationService",{service:"smb",enabled:"yes"}).status,"rejected");
 assert.equal(action(x.engine,"invalid3","ghost","network.setApplicationService",{service:"smb",enabled:true}).status,"rejected");
 assert.deepEqual(x.engine.exportState(),before);
});
test("R3-05 : restauration maintient état service et correspondance d'actifs",()=>{
 const x=setup();
 action(x.engine,"start","printer-01","network.setApplicationService",{service:"smb",enabled:true});
 const saved=x.engine.exportState();
 const restored=restoreEngine(x.scenario,saved);
 const host=createR2D3IdentityHost({assetRegistry:x.registry,networkEngine:restored,assetToNetworkId:x.mapping,assetKinds:x.kinds});
 assert.deepEqual(restored.exportState(),saved);
 assert.equal(access(host,x.a,x.b),"reachable");
});
test("R3-06 : mapping réseau incohérent refusé et ne donne pas d'accès",()=>{
 const x=setup();
 const h=createR2D3IdentityHost({assetRegistry:x.registry,networkEngine:x.engine,
 assetToNetworkId:{[x.a]:"printer-01",[x.b]:"pc-01"},assetKinds:x.kinds});
 assert.equal(h.getMachine(x.a).status,"unknown");
 assert.equal(h.getReachability(x.a,x.b,"smb").status,"unknown");
 assert.throws(()=>createR2D3IdentityHost({assetRegistry:x.registry,networkEngine:x.engine,
 assetToNetworkId:{[x.a]:"pc-01",[x.b]:"pc-01"},assetKinds:x.kinds}),/injective/);
});
test("R3-07 : état de service déclaratif invalide rejeté à l'initialisation et restauration",()=>{
 const x=setup();
 const bad=structuredClone(x.scenario);
 bad.objects.find(o=>o.id==="printer-01").config.applicationServices={smb:"yes"};
 assert.throws(()=>createEngine(bad),/Services applicatifs invalides/);
 const corrupt=x.engine.exportState();
 corrupt.objectsById["printer-01"].config.applicationServices={"ad-ds":"up"};
 assert.throws(()=>restoreEngine(x.scenario,corrupt),/Services applicatifs invalides/);
});

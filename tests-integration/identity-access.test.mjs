import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createEngine,restoreEngine} from "../src/r2d3-core.js";
import {createR2D3IdentityIntegration} from "../src/identity-access-host.js";
// Dépendance GitHub distincte et figée, jamais une copie du moteur d'identités.
const identityRoot=resolve(process.env.IDENTITY_ACCESS_SOURCE_ROOT||"../identity-source/identity-access-v1");
const identityModule=await import(pathToFileURL(resolve(identityRoot,"src/identity-access-core.js")).href);
const identityTemplate=JSON.parse(readFileSync(resolve(identityRoot,"scenarios/cybernet.json"),"utf8"));
const networkTemplate=JSON.parse(readFileSync(new URL("../scenarios/atelier-2pc-imprimante-exp.json",import.meta.url),"utf8"));
const names=["PC01","PC02","SRV-FICHIERS","DC01","DC02"];
const netIds=["pc-01","pc-02","srv-files","dc-01","dc-02"];
const templateIds=["asset-pc01","asset-pc02","asset-files","asset-dc01","asset-dc02"];
const ip=["192.168.10.20","192.168.10.30","192.168.10.40","192.168.10.41","192.168.10.42"];
function fixture(){
 const registry=createAssetRegistry(),pc=registry.createProfile("PC Windows"),server=registry.createProfile("Serveur Windows");
 assert.equal(pc.success,true);assert.equal(server.success,true);
 const assetIds=names.map((name,i)=>{
  const r=registry.createAsset(i<2?pc.profile.id:server.profile.id,{name});assert.equal(r.success,true);return r.asset.id;
 });
 const networkScenario=structuredClone(networkTemplate);
 const existing=networkScenario.objects.find(o=>o.id==="pc-01");
 networkScenario.objects=networkScenario.objects.filter(o=>o.id!=="printer-01");
 networkScenario.links=networkScenario.links.filter(l=>l.id!=="cable-printer");
 for(let i=0;i<netIds.length;i++){
  const obj=i<2?networkScenario.objects.find(o=>o.id===netIds[i]):{
   ...structuredClone(existing),id:netIds[i],kind:i===2?"file-server":"domain-controller",
   config:{ipv4:{interfaceId:"eth0",mode:"static",address:ip[i],prefix:24}}
  };
  obj.name=names[i];obj.assetId=assetIds[i];
  if(i>=2){obj.config.applicationServices=i===2?{smb:true}:{"ad-ds":true};networkScenario.objects.push(obj);}
 }
 const sw=networkScenario.objects.find(o=>o.id==="sw-01");
 sw.ports.push({id:"3",type:"rj45"},{id:"4",type:"rj45"});
 for(const [i,port]of [[2,"1"],[3,"3"],[4,"4"]])networkScenario.links.push({
  id:"cable-"+netIds[i],kind:"ethernet-cable",
  endpoints:[{objectId:netIds[i],portId:"eth0"},{objectId:"sw-01",portId:port}],connected:true
 });
 const network=createEngine(networkScenario);
 const assetToNetworkId=Object.fromEntries(assetIds.map((id,i)=>[id,netIds[i]]));
 const assetKinds=Object.fromEntries(assetIds.map((id,i)=>[id,i<2?"computer":"server"]));
 let raw=JSON.stringify(identityTemplate);
 for(let i=0;i<assetIds.length;i++)raw=raw.replaceAll('"'+templateIds[i]+'"','"'+assetIds[i]+'"');
 const scenario=JSON.parse(raw);
 const settings={identityModule,scenario,assetRegistry:registry,networkEngine:network,assetToNetworkId,assetKinds};
 const integration=createR2D3IdentityIntegration(settings);
 return {registry,network,networkScenario,scenario,assetToNetworkId,assetKinds,assetIds,...integration};
}
const modify=(network,id,targetId,type,params)=>{
 const result=network.dispatch({commandVersion:1,id,targetId,type,params,expectedRevision:network.getSnapshot().revision});
 assert.equal(result.status,"applied",JSON.stringify(result));
};
const smb={type:"access.evaluateSmb",sessionId:"session-1",credentialAccountId:"account-2",shareId:"share-1",operation:"write"};
test("R2/R3 : accès SMB natif sans aucune observation applicative injectée",()=>{
 const x=fixture();
 assert.equal(x.host.getMachine(x.assetIds[2]).status,"ok");
 assert.equal(x.host.getServiceStatus(x.assetIds[2],"smb").status,"available");
 assert.equal(x.host.getReachability(x.assetIds[0],x.assetIds[2],"smb").status,"reachable");
 const result=x.engine.query(smb);assert.equal(result.success,true,JSON.stringify(result));
 modify(x.network,"stop-smb","srv-files","network.setApplicationService",{service:"smb",enabled:false});
 assert.equal(x.engine.query(smb).code,"service_unavailable");
 modify(x.network,"start-smb","srv-files","network.setApplicationService",{service:"smb",enabled:true});
 assert.equal(x.engine.query(smb).success,true);
});
test("R2/R3 : coupure physique du serveur SMB et retour de l'accès",()=>{
 const x=fixture();const before=JSON.stringify(x.engine.exportState());
 assert.equal(x.engine.query(smb).success,true);
 modify(x.network,"cut-smb","cable-srv-files","network.setLinkConnected",{connected:false});
 assert.equal(x.host.getServiceStatus(x.assetIds[2],"smb").status,"available");
 assert.equal(x.engine.query(smb).code,"server_unreachable");
 assert.equal(JSON.stringify(x.engine.exportState()),before);
 modify(x.network,"repair-smb","cable-srv-files","network.setLinkConnected",{connected:true});
 assert.equal(x.engine.query(smb).success,true);
});
test("R2/R3 : indisponibilité des DC, bascule et coupure du second contrôleur",()=>{
 const x=fixture(),domain=()=>x.engine.query({type:"domain.status",sourceMachineId:x.assetIds[0]});
 assert.equal(domain().success,true);
 modify(x.network,"stop-dc1","dc-01","network.setApplicationService",{service:"ad-ds",enabled:false});
 assert.equal(domain().data.controllerAssetId,x.assetIds[4]);
 modify(x.network,"cut-dc2","cable-dc-02","network.setLinkConnected",{connected:false});
 const refused=x.engine.command({type:"session.open",params:{machineId:x.assetIds[1],accountId:"account-2"}});
 assert.equal(refused.code,"domain_controller_unavailable");
 modify(x.network,"repair-dc2","cable-dc-02","network.setLinkConnected",{connected:true});
 assert.equal(domain().data.controllerAssetId,x.assetIds[4]);
});
test("R2/R3 : restauration des trois états métier sans duplication des identités",()=>{
 const x=fixture();
 assert.equal(x.engine.query(smb).success,true);
 const savedAssets=structuredClone(x.registry.exportState());
 const savedNetwork=structuredClone(x.network.exportState());
 const savedIdentity=structuredClone(x.engine.exportState());
 const assetRegistry=restoreAssetRegistry(savedAssets);
 const networkEngine=restoreEngine(x.networkScenario,savedNetwork);
 const restored=createR2D3IdentityIntegration({identityModule,scenario:x.scenario,savedState:savedIdentity,
  assetRegistry,networkEngine,assetToNetworkId:x.assetToNetworkId,assetKinds:x.assetKinds});
 assert.deepEqual(assetRegistry.exportState(),savedAssets);
 assert.deepEqual(networkEngine.exportState(),savedNetwork);
 assert.deepEqual(restored.engine.exportState(),savedIdentity);
 assert.equal(restored.engine.query(smb).success,true);
});

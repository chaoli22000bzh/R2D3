import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createEngine} from "../src/r2d3-core.js";
import {addBoxPatRule,getBoxPatRules,setBoxPatRuleEnabled,removeBoxPatRule,observeBoxInboundPat} from "../src/box-pat-v1.js";
const yes=r=>assert.equal(r.success,true,JSON.stringify(r));
const no=(r,code)=>{assert.equal(r.success,false,JSON.stringify(r));assert.equal(r.code,code);};
function setup(){
 const r=createAssetRegistry(),box=r.createBoxComposite("BOX-01");yes(box);
 const p=r.createProfile("Serveur HTTP");yes(p);
 yes(r.addPortGroup(p.profile.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:1}));
 const server=r.createAsset(p.profile.id,{name:"SRV-HTTP"});yes(server);
 const cable=r.createCable();yes(cable);
 yes(r.connectCableEnd(cable.cable.id,0,server.asset.ports[0].id));
 yes(r.connectCableEnd(cable.cable.id,1,box.config.ports.lanPortIds[0]));
 const core=createEngine({format:"r2d3-scenario",schemaVersion:1,
  scenarioId:"box-pat-web",scenarioVersion:"1.0.0",capabilities:{network:true},
  objects:[{id:server.asset.id,kind:"ethernet-endpoint",name:server.asset.name,
   ports:[{id:server.asset.ports[0].id,type:"rj45"}],
   config:{ipv4:{interfaceId:server.asset.ports[0].id,mode:"static",address:"192.168.1.110",prefix:24},
    applicationServices:{http:true}},runtime:{}}],links:[]});
 const rule={protocol:"tcp",externalPort:8080,internalAddress:"192.168.1.110",internalPort:80,enabled:true};
 const request={externalAddress:"90.14.20.22",wanAddress:"90.14.10.20",
   protocol:"tcp",port:8080,service:"http",targetId:server.asset.id,
   targetAddress:"192.168.1.110",targetGateway:"192.168.1.1"};
 const probe=(patch={})=>observeBoxInboundPat(r,box.asset.id,{...request,...patch},core);
 return {r,box,server,cable,core,rule,request,probe};
}
test("Box PAT 01 : règle HTTP via moteur générique et Internet implicite",()=>{
 const f=setup();
 no(f.probe(),"pat_rule_missing");
 const added=addBoxPatRule(f.r,f.box.asset.id,f.rule);yes(added);
 const connected=f.probe();yes(connected);
 assert.equal(connected.public.address,"90.14.10.20");
 assert.equal(connected.public.port,8080);
 assert.equal(connected.destination.address,"192.168.1.110");
 assert.equal(connected.destination.port,80);
 assert.equal(f.r.listCablePoints().some(p=>p.portId===f.box.config.ports.wanPortId),false);
});
test("Box PAT 02 : règle désactivée puis réactivée",()=>{
 const f=setup(),added=addBoxPatRule(f.r,f.box.asset.id,f.rule);yes(added);
 yes(setBoxPatRuleEnabled(f.r,f.box.asset.id,added.rule.id,false));
 no(f.probe(),"pat_rule_missing");
 yes(setBoxPatRuleEnabled(f.r,f.box.asset.id,added.rule.id,true));
 yes(f.probe());
});
test("Box PAT 03 : port ou protocole externe incorrect",()=>{
 const f=setup();yes(addBoxPatRule(f.r,f.box.asset.id,f.rule));
 no(f.probe({port:80}),"pat_rule_missing");
 no(f.probe({protocol:"udp"}),"pat_rule_missing");
});
test("Box PAT 04 : service HTTP arrêté par moteur commun",()=>{
 const f=setup();yes(addBoxPatRule(f.r,f.box.asset.id,f.rule));
 const d=f.core.dispatch({commandVersion:1,id:"stop-http",type:"network.setApplicationService",
  targetId:f.server.asset.id,params:{service:"http",enabled:false}});
 assert.equal(d.status,"applied");
 no(f.probe(),"service_offline");
});
test("Box PAT 05 : câble serveur LAN débranché coupe l'accès",()=>{
 const f=setup();yes(addBoxPatRule(f.r,f.box.asset.id,f.rule));
 yes(f.r.disconnectCableEnd(f.cable.cable.id,1));
 no(f.probe(),"link_down");
});
test("Box PAT 06 : mauvaise passerelle du serveur et WAN erroné refusés",()=>{
 const f=setup();yes(addBoxPatRule(f.r,f.box.asset.id,f.rule));
 no(f.probe({targetGateway:"192.168.1.254"}),"target_network");
 no(f.probe({wanAddress:"90.14.10.21"}),"wan_mismatch");
});
test("Box PAT 07 : règles persistées et suppression effective",()=>{
 const f=setup(),added=addBoxPatRule(f.r,f.box.asset.id,f.rule);yes(added);
 const restored=restoreAssetRegistry(f.r.exportState());
 assert.deepEqual(getBoxPatRules(restored,f.box.asset.id),getBoxPatRules(f.r,f.box.asset.id));
 yes(removeBoxPatRule(f.r,f.box.asset.id,added.rule.id));
 no(f.probe(),"pat_rule_missing");
});
test("Box PAT 08 : conflit WAN protocole port et adresse hors LAN rejetés sans écriture",()=>{
 const f=setup();yes(addBoxPatRule(f.r,f.box.asset.id,f.rule));
 const before=f.r.exportState();
 no(addBoxPatRule(f.r,f.box.asset.id,{...f.rule,internalAddress:"192.168.1.111"}),"pat_conflict");
 assert.deepEqual(f.r.exportState(),before);
 no(addBoxPatRule(f.r,f.box.asset.id,{...f.rule,externalPort:8081,internalAddress:"10.0.0.12"}),"invalid_box_pat");
 assert.deepEqual(f.r.exportState(),before);
});
test("Box PAT 09 : le serveur sans état de service Core ne répond pas",()=>{
 const f=setup();yes(addBoxPatRule(f.r,f.box.asset.id,f.rule));
 no(observeBoxInboundPat(f.r,f.box.asset.id,f.request,null),"service_engine_missing");
});

test("Box bridge : PAT entrant refusé, règle conservée après retour routeur",()=>{
 const f=setup();yes(addBoxPatRule(f.r,f.box.asset.id,f.rule));
 yes(f.probe());
 yes(f.r.setBoxMode(f.box.asset.id,"bridge"));
 no(f.probe(),"bridge_mode");
 assert.equal(getBoxPatRules(f.r,f.box.asset.id).length,1);
 yes(f.r.setBoxMode(f.box.asset.id,"router"));
 yes(f.probe());
});

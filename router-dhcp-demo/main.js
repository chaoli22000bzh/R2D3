import {createAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {mountRouterAdmin} from "../src/router-admin-ui-v1.js";
import {configureRouterDhcp,createRouterDhcpCoreObject,requestRouterDhcp,requestRouterRelayedDhcp} from "../src/router-dhcp-service-v1.js";
import {createEngine} from "../src/r2d3-core.js";
const $=id=>document.getElementById(id);
let reg,router,pc,server,pcCable,serverCable,admin;
const errorIf=r=>{if(!r.success)throw Error(r.message||r.reason||r.code||"Erreur R2D3");return r;};
function wire(a,b){
 const c=errorIf(reg.createCable()).cable;
 errorIf(reg.connectCableEnd(c.id,0,a));
 errorIf(reg.connectCableEnd(c.id,1,b));
 return c.id;
}
function feedback(message,success=null){
 $("status").textContent=message;
 $("status").dataset.result=success===null?"":success?"ok":"fail";
}
function initialize(){
 admin?.destroy();
 reg=createAssetRegistry();
 router=errorIf(createRouter(reg,{name:"Routeur R2D3",ports:4})).asset;
 const p=errorIf(reg.createProfile("Hôte Ethernet")).profile;
 errorIf(reg.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"NIC",start:1,count:1}));
 pc=errorIf(reg.createAsset(p.id,{name:"PC client"})).asset;
 server=errorIf(reg.createAsset(p.id,{name:"SRV DHCP"})).asset;
 pcCable=wire(pc.ports[0].id,router.ports[1].id);
 serverCable=wire(server.ports[0].id,router.ports[2].id);
 for(const [port,role,address] of [[router.ports[0],"wan","203.0.113.1"],
  [router.ports[1],"lan","192.168.10.1"],[router.ports[2],"lan","192.168.20.1"]])
  errorIf(configureRouterPort(reg,router.id,port.id,{role,mode:"static",address,prefix:24}));
 // Plage prête mais service arrêté : le professeur peut commencer par l'activer.
 errorIf(configureRouterDhcp(reg,router.id,{enabled:false,pools:[{
  id:"lan10",portId:router.ports[1].id,
  start:"192.168.10.100",end:"192.168.10.110",
  prefix:24,gateway:"192.168.10.1",dns:["192.168.20.2"],leaseSeconds:86400
 }]}));
 admin=mountRouterAdmin({root:$("admin"),registry:reg,assetId:router.id});
 $("client-link").textContent="Couper le câble PC";
 $("server-link").textContent="Couper le câble serveur";
 feedback("Prêt : DHCP routeur désactivé et IP Helper non configuré.");
}
function pcObject(){
 return {id:pc.id,kind:"pc-windows",name:pc.name,ports:[{id:pc.ports[0].id,type:"rj45"}],
  config:{macAddress:"02-00-00-00-10-01",ipv4:{interfaceId:pc.ports[0].id,
   mode:"dhcp",address:null,prefix:null,lease:null},networkOptions:{gateway:null,dns:[]}}};
}
function localEngine(){
 const obj=createRouterDhcpCoreObject(reg,router.id);
 return createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"router-local-dhcp",
  scenarioVersion:"1",capabilities:{network:true},
  objects:[pcObject(),obj],links:[{id:"pc-cable",kind:"ethernet-cable",connected:true,
   endpoints:[{objectId:pc.id,portId:pc.ports[0].id},{objectId:router.id,portId:router.ports[1].id}]}]});
}
function relayEngine(){
 const srv={id:server.id,kind:"dhcp-server",name:server.name,
  ports:[{id:server.ports[0].id,type:"rj45"}],
  config:{ipv4:{interfaceId:server.ports[0].id,mode:"static",address:"192.168.20.2",prefix:24},
   dhcpEnabled:true,dhcpPools:[{id:"client10",start:"192.168.10.120",end:"192.168.10.130",
     prefix:24,gateway:"192.168.10.1",dns:["192.168.20.2"],leaseSeconds:3600}]}};
 return createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"router-helper",
  scenarioVersion:"1",capabilities:{network:true},objects:[pcObject(),srv],
  links:[{id:"relayed-request",kind:"relay-service",connected:true,
   endpoints:[{objectId:pc.id,portId:pc.ports[0].id},{objectId:server.id,portId:server.ports[0].id}]}]});
}
function testLocal(){
 try{
  const engine=localEngine();
  const r=requestRouterDhcp({registry:reg,routerId:router.id,clientId:pc.id,dhcpEngine:engine});
  feedback(r.success?"Bail DHCP du routeur : "+r.address+" /"+r.prefix+" attribué.":"DHCP routeur : échec, "+(r.message||r.code||"aucun bail")+(r.address?" ("+r.address+")":""),r.success);
 }catch(e){feedback("Erreur de recette : "+e.message,false);}
}
function testRelay(){
 try{
  const engine=relayEngine();
  const r=requestRouterRelayedDhcp({registry:reg,routerId:router.id,clientId:pc.id,
   serverId:server.id,serverAddress:"192.168.20.2",dhcpEngine:engine});
  feedback(r.success?"Relais DHCP : "+r.address+" attribué par le serveur du réseau 192.168.20.0/24.":
   "Relais DHCP : échec, "+(r.reason||r.message||r.code||"aucun bail"),r.success);
 }catch(e){feedback("Erreur de recette : "+e.message,false);}
}
function toggleCable(id,port,button,noun){
 const c=reg.getCable(id),down=!!c.ends[1];
 const r=down?reg.disconnectCableEnd(id,1):reg.connectCableEnd(id,1,port);
 if(!r.success){feedback(r.message,false);return;}
 $(button).textContent=(down?"Rétablir":"Couper")+" le câble "+noun;
 feedback("Câble "+noun+(down?" coupé.":" rétabli."));
}
$("test-local").addEventListener("click",testLocal);
$("test-relay").addEventListener("click",testRelay);
$("client-link").addEventListener("click",()=>toggleCable(pcCable,router.ports[1].id,"client-link","PC"));
$("server-link").addEventListener("click",()=>toggleCable(serverCable,router.ports[2].id,"server-link","serveur"));
$("reset").addEventListener("click",initialize);
initialize();

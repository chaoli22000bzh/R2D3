import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan,setSwitchAccessPort} from "../src/vlan-v1.js";
import {setSwitchInterVlanRouting,setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {createEngine} from "../src/r2d3-core.js";
import {createDefaultIpHelperConfig,configureIpHelper,requestRelayedDhcp} from "../src/ip-helper-v01.js";
import {relayDhcpViaCommonEngine} from "../src/dhcp-relay-common-v01.js";

function setup(){
 const r=createAssetRegistry();
 const pcProfile=r.createProfile("PC").profile,serverProfile=r.createProfile("Serveur").profile,
  switchProfile=r.createProfile("Switch L3").profile;
 for(const p of [pcProfile,serverProfile])assert.ok(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success);
 assert.ok(r.addPortGroup(switchProfile.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}).success);
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing"])
  assert.ok(r.setProfileNetworkCapability(switchProfile.id,cap,true).success);
 const pc=r.createAsset(pcProfile.id,{name:"PC1"}).asset,
  sw=r.createAsset(switchProfile.id,{name:"SW L3"}).asset,
  server=r.createAsset(serverProfile.id,{name:"Serveur DHCP"}).asset;
 const wire=(a,b)=>{const c=r.createCable().cable;assert.ok(r.connectCableEnd(c.id,0,a).success);assert.ok(r.connectCableEnd(c.id,1,b).success);return c;};
 const pcCable=wire(pc.ports[0].id,sw.ports[0].id);
 const serverCable=wire(server.ports[0].id,sw.ports[1].id);
 for(const n of [10,20])assert.ok(addSwitchVlan(r,sw.id,n,"VLAN "+n).success);
 assert.ok(setSwitchAccessPort(r,sw.id,sw.ports[0].id,10).success);
 assert.ok(setSwitchAccessPort(r,sw.id,sw.ports[1].id,20).success);
 assert.ok(setSwitchVlanInterface(r,sw.id,10,"192.168.10.1",24).success);
 assert.ok(setSwitchVlanInterface(r,sw.id,20,"192.168.20.1",24).success);
 assert.ok(setSwitchInterVlanRouting(r,sw.id,true).success);
 const pool=(id,subnet)=>({
  id,start:"192.168."+subnet+".100",end:"192.168."+subnet+".110",
  prefix:24,gateway:"192.168."+subnet+".1",dns:[],leaseSeconds:86400
 });
 const scenario={
  format:"r2d3-scenario",schemaVersion:1,scenarioId:"ip-helper-tests",
  scenarioVersion:"1",capabilities:{network:true},
  objects:[
   {id:pc.id,kind:"pc-windows",name:"Client",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"dhcp",address:null,prefix:null,lease:null},
    networkOptions:{gateway:null,dns:[]}}},
   {id:server.id,kind:"dhcp-server",name:"Serveur",ports:[{id:"eth0",type:"rj45"}],
    config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.20.2",prefix:24},
     dhcpEnabled:true,dhcpPools:[pool("pool20",20),pool("pool10",10)]}}
  ],
  // Chemin logique uniquement pour le service DHCP : le câble réel
  // et les domaines VLAN sont évalués par le registre R2 avant la requête.
  links:[{id:"relay-service",kind:"relay-service",
   endpoints:[{objectId:pc.id,portId:"eth0"},{objectId:server.id,portId:"eth0"}],connected:true}]
 };
 const engine=createEngine(scenario);
 let config=createDefaultIpHelperConfig(sw);
 const setHelper=(ip,enabled=true)=>{
  const o=configureIpHelper(config,10,ip,enabled);assert.ok(o.success);config=o.config;
 };
 const request=()=>requestRelayedDhcp({
  registry:r,switchId:sw.id,clientId:pc.id,serverId:server.id,
  serverAddress:"192.168.20.2",helperConfig:config,dhcpEngine:engine
 });
 return {r,pc,sw,server,pcCable,serverCable,engine,request,setHelper,
  getConfig:()=>config,scenario};
}
test("IP Helper V0.1-01 : relais absent, aucun bail créé",()=>{
 const f=setup();const result=f.request();
 assert.equal(result.success,false);
 assert.match(result.reason,/IP Helper/);
 assert.equal(f.engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,null);
});
test("IP Helper V0.1-02 : mauvaise adresse de serveur, aucun bail",()=>{
 const f=setup();f.setHelper("192.168.20.99");
 assert.equal(f.request().success,false);
 assert.equal(f.engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,null);
});
test("IP Helper V0.1-03 : bonne adresse, plage VLAN 10 choisie par moteur commun",()=>{
 const f=setup();f.setHelper("192.168.20.2");
 const o=f.request();assert.equal(o.success,true,JSON.stringify(o));
 assert.equal(o.poolId,"pool10");
 assert.equal(o.address,"192.168.10.100");
 assert.equal(f.engine.query({type:"dhcp.leases",serverId:f.server.id}).leases[0].poolId,"pool10");
});
test("IP Helper V0.1-04 : mauvaise interface ou câblage refuse l'acquisition",()=>{
 const f=setup();f.setHelper("192.168.20.2");
 assert.ok(f.r.disconnectCableEnd(f.serverCable.id,1).success);
 assert.equal(f.request().success,false);
 assert.equal(f.engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,null);
 assert.ok(f.r.connectCableEnd(f.serverCable.id,1,f.sw.ports[1].id).success);
 assert.ok(setSwitchVlanInterface(f.r,f.sw.id,10,"192.168.10.1",24,false).success);
 assert.equal(f.request().success,false);
});
test("IP Helper V0.1-05 : DHCP arrêté, aucun faux bail",()=>{
 const f=setup();f.setHelper("192.168.20.2");
 const x=f.engine.dispatch({commandVersion:1,id:"disable",type:"dhcp.setServerEnabled",targetId:f.server.id,params:{enabled:false}});
 assert.equal(x.status,"applied");
 assert.equal(f.request().success,false);
 assert.equal(f.engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,null);
});
test("IP Helper commun : les transports VPN et DMZ utilisent la même sélection réseau",()=>{
 for(const kind of ["vpn","dmz"]){
  const f=setup();
  const opt={dhcpEngine:f.engine,clientId:f.pc.id,serverId:f.server.id,
   serverAddress:"192.168.20.2",clientNetwork:{address:"192.168.10.1",prefix:24},
   helper:{enabled:true,serverAddress:"192.168.20.2"},
   transport:{kind,reachable:true}};
  const o=relayDhcpViaCommonEngine(opt);
  assert.equal(o.success,true,JSON.stringify(o));
  assert.equal(o.poolId,"pool10");
 }
});
test("IP Helper commun : VPN coupé ou DMZ refusée interdit un bail",()=>{
 for(const kind of ["vpn","dmz"]){
  const f=setup();
  const o=relayDhcpViaCommonEngine({
   dhcpEngine:f.engine,clientId:f.pc.id,serverId:f.server.id,
   serverAddress:"192.168.20.2",clientNetwork:{address:"192.168.10.1",prefix:24},
   helper:{enabled:true,serverAddress:"192.168.20.2"},
   transport:{kind,reachable:false,reason:"Transport interrompu"}
  });
  assert.equal(o.success,false);
  assert.equal(f.engine.getSnapshot().objectsById[f.pc.id].config.ipv4.address,null);
 }
});

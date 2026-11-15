import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createEngine} from "../src/r2d3-core.js";
import {addSwitchVlan,setSwitchAccessPort} from "../src/vlan-v1.js";
import {setSwitchVlanInterface} from "../src/inter-vlan-routing-v1.js";
import {getSwitchDhcpConfig,configureSwitchDhcp,createSwitchDhcpCoreObject,requestSwitchDhcp} from "../src/switch-dhcp-service-v1.js";
const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function setup(){
 const r=createAssetRegistry();
 const swp=r.createProfile("Switch L3").profile;
 good(r.addPortGroup(swp.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}));
 for(const cap of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
  good(r.setProfileNetworkCapability(swp.id,cap,true));
 const cp=r.createProfile("PC").profile;
 good(r.addPortGroup(cp.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}));
 const sw=r.createAsset(swp.id,{name:"SW-L3"}).asset;
 const pc1=r.createAsset(cp.id,{name:"PC-VLAN10"}).asset;
 const pc2=r.createAsset(cp.id,{name:"PC-VLAN20"}).asset;
 const wire=(pc,port)=>{const c=r.createCable().cable;
  good(r.connectCableEnd(c.id,0,pc.ports[0].id));
  good(r.connectCableEnd(c.id,1,sw.ports[port].id));return c;};
 const c1=wire(pc1,0),c2=wire(pc2,1);
 for(const [v,ip] of [[10,"192.168.10.1"],[20,"192.168.20.1"]]){
  good(addSwitchVlan(r,sw.id,v,"VLAN "+v));
  good(setSwitchVlanInterface(r,sw.id,v,ip,24,true));
 }
 good(setSwitchAccessPort(r,sw.id,sw.ports[0].id,10));
 good(setSwitchAccessPort(r,sw.id,sw.ports[1].id,20));
 const pools=[10,20].map(v=>({id:"vlan"+v,vlanNumber:v,
  start:"192.168."+v+".100",end:"192.168."+v+".105",prefix:24,
  gateway:"192.168."+v+".1",dns:["1.1.1.1","8.8.8.8"],leaseSeconds:3600}));
 const config=enabled=>good(configureSwitchDhcp(r,sw.id,{enabled,pools}));
 const build=()=>{
  const client=x=>({id:x.id,kind:"pc-windows",name:x.name,ports:[{id:x.ports[0].id,type:"rj45"}],
   config:{macAddress:x.id===pc1.id?"02-00-00-00-10-01":"02-00-00-00-20-01",ipv4:{interfaceId:x.ports[0].id,mode:"dhcp",address:null,prefix:null,lease:null},
    networkOptions:{gateway:null,dns:[]}}});
  const scenario={format:"r2d3-scenario",schemaVersion:1,scenarioId:"dhcp-switch-l3",
   scenarioVersion:"1",capabilities:{network:true},
   objects:[client(pc1),client(pc2),createSwitchDhcpCoreObject(r,sw.id)],
   links:[{id:c1.id,kind:"ethernet-cable",connected:true,endpoints:[
    {objectId:pc1.id,portId:pc1.ports[0].id},{objectId:sw.id,portId:sw.ports[0].id}]},
    {id:c2.id,kind:"ethernet-cable",connected:true,endpoints:[
    {objectId:pc2.id,portId:pc2.ports[0].id},{objectId:sw.id,portId:sw.ports[1].id}]}]};
  return createEngine(scenario);
 };
 const request=(e,id)=>requestSwitchDhcp({registry:r,switchId:sw.id,clientId:id,dhcpEngine:e});
 return {r,swp,sw,pc1,pc2,pools,c1,c2,config,build,request};
}
test("DHCP L3 01 : seulement sur switch L3, inactif par défaut",()=>{
 const f=setup();
 assert.equal(getSwitchDhcpConfig(f.r,f.sw.id).enabled,false);
 assert.deepEqual(getSwitchDhcpConfig(f.r,f.sw.id).pools,[]);
 const p=f.r.createProfile("Switch L2").profile;
 good(f.r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"P",start:1,count:4}));
 good(f.r.setProfileNetworkCapability(p.id,"ethernet-switching",true));
 good(f.r.setProfileNetworkCapability(p.id,"vlan",true));
 assert.equal(f.r.setProfileNetworkCapability(p.id,"dhcp-server",true).success,false);
 const old=f.r.createAsset(p.id,{name:"L2"}).asset;
 assert.equal(old.dhcpServerConfig,undefined);
});
test("DHCP L3 02 : deux VLAN, deux bonnes plages, même Core DHCP",()=>{
 const f=setup();f.config(true);const e=f.build();
 const a=f.request(e,f.pc1.id),b=f.request(e,f.pc2.id);
 good(a);good(b);
 assert.equal(a.address,"192.168.10.100");assert.equal(b.address,"192.168.20.100");
 assert.equal(e.query({type:"dhcp.leases",serverId:f.sw.id}).leases.length,2);
 assert.equal(e.query({type:"dhcp.pools",serverId:f.sw.id}).pools.length,2);
});
test("DHCP L3 03 : serveur arrêté, aucune attribution et APIPA du Core",()=>{
 const f=setup();f.config(false);const e=f.build();
 const out=f.request(e,f.pc1.id);
 assert.equal(out.success,false);
 assert.equal(out.code,"apipa");
 assert.match(out.address,/^169\.254\./);
});
test("DHCP L3 04 : coupure de câble, bail préservé, pas de succès artificiel",()=>{
 const f=setup();f.config(true);const e=f.build();
 const first=f.request(e,f.pc1.id);good(first);
 good(f.r.disconnectCableEnd(f.c1.id,1));
 const cut=e.dispatch({commandVersion:1,id:"disconnect",type:"network.setLinkConnected",
  targetId:f.c1.id,params:{connected:false}});
 assert.equal(cut.status,"applied");
 assert.equal(f.request(e,f.pc1.id).success,false);
 assert.equal(e.getSnapshot().objectsById[f.pc1.id].config.ipv4.address,"192.168.10.100");
});
test("DHCP L3 05 : configuration R2 persistante, indépendance et contrôles",()=>{
 const f=setup();f.config(true);
 const other=f.r.createAsset(f.swp.id,{name:"SW-L3-02"}).asset;
 assert.deepEqual(getSwitchDhcpConfig(f.r,other.id),{assetId:other.id,enabled:false,pools:[]});
 const snapshot=f.r.exportState(),rr=restoreAssetRegistry(snapshot);
 assert.deepEqual(rr.exportState(),snapshot);
 assert.equal(getSwitchDhcpConfig(rr,f.sw.id).pools.length,2);
 const invalid=getSwitchDhcpConfig(f.r,f.sw.id);invalid.pools[0].start="999.1.1.1";
 assert.equal(f.r.setAssetDhcpServerConfig(f.sw.id,invalid).success,false);
 assert.deepEqual(f.r.exportState(),snapshot);
});
test("DHCP L3 : mauvais VLAN, IP passerelle et absence de synchro Core refusés",()=>{
 const f=setup();f.config(true);const e=f.build();
 good(setSwitchAccessPort(f.r,f.sw.id,f.sw.ports[0].id,1));
 const wrong=f.request(e,f.pc1.id);
 assert.equal(wrong.code,"missing_pool");
 good(setSwitchAccessPort(f.r,f.sw.id,f.sw.ports[0].id,10));
 good(setSwitchVlanInterface(f.r,f.sw.id,10,"192.168.10.254",24,true));
 assert.equal(f.request(e,f.pc1.id).code,"invalid_interface");
 good(setSwitchVlanInterface(f.r,f.sw.id,10,"192.168.10.1",24,true));
 f.config(false);
 assert.equal(f.request(e,f.pc1.id).code,"out_of_sync");
});

test("DHCP L3 : exclusions et réservations restent celles du Core commun",()=>{
 const f=setup();
 f.pools[0].exclusions=["192.168.10.100"];
 f.pools[0].reservations=[{mac:"02-00-00-00-10-01",address:"192.168.10.103"}];
 f.config(true);const e=f.build();
 assert.equal(f.request(e,f.pc1.id).address,"192.168.10.103");
 const leases=e.query({type:"dhcp.leases",serverId:f.sw.id});
 assert.equal(leases.leases.length,1);
 assert.equal(leases.leases[0].address,"192.168.10.103");
});
test("DHCP L3 : un bail déjà attribué reste conservé à T1/T2",()=>{
 const f=setup();f.config(true);const e=f.build();
 const first=f.request(e,f.pc1.id);good(first);
 const cut=e.dispatch({commandVersion:1,id:"cut",type:"network.setLinkConnected",
  targetId:f.c1.id,params:{connected:false}});
 assert.equal(cut.status,"applied");
 for(const seconds of [1800,1350]){
  assert.equal(e.dispatch({commandVersion:1,id:"advance-"+seconds,type:"simulation.advanceTime",
   targetId:"simulation-clock",params:{seconds}}).status,"applied");
  assert.equal(e.getSnapshot().objectsById[f.pc1.id].config.ipv4.address,first.address);
 }
 assert.equal(e.getSnapshot().runtime[f.pc1.id].dhcpLeasePhase,"t2-failed");
 assert.equal(e.dispatch({commandVersion:1,id:"expire",type:"simulation.advanceTime",
  targetId:"simulation-clock",params:{seconds:450}}).status,"applied");
 assert.match(e.getSnapshot().objectsById[f.pc1.id].config.ipv4.address,/^169\.254\./);
});

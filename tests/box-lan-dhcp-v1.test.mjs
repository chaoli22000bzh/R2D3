import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createBoxLanDhcpSession} from "../src/box-lan-dhcp-v1.js";

const good=r=>assert.equal(r.success,true,JSON.stringify(r));
const err=(r,code)=>{assert.equal(r.success,false,JSON.stringify(r));assert.equal(r.code,code);};
function fixture(){
 const registry=createAssetRegistry();
 const box=registry.createBoxComposite("BOX-01");good(box);
 function client(name,type){
  const p=registry.createProfile("Profil "+name);good(p);
  good(registry.addPortGroup(p.profile.id,{type,prefix:"P",start:1,count:1}));
  const a=registry.createAsset(p.profile.id,{name});good(a);
  return a.asset;
 }
 const wire1=client("PC-LAN-1","ethernet-rj45"),
  wire2=client("PC-LAN-2","ethernet-rj45"),wifi=client("PC-WIFI","wifi");
 const wires=[];
 for(const [pc,i] of [[wire1,0],[wire2,1]]){
  const cable=registry.createCable();good(cable);
  good(registry.connectCableEnd(cable.cable.id,0,pc.ports[0].id));
  good(registry.connectCableEnd(cable.cable.id,1,box.config.ports.lanPortIds[i]));
  wires.push(cable.cable.id);
 }
 const clients=[{assetId:wire1.id,medium:"ethernet"},
  {assetId:wire2.id,medium:"ethernet"},
  {assetId:wifi.id,medium:"wifi",ssidId:"ssid-1",password:"12345678"}];
 return {registry,box,wire1,wire2,wifi,wires,clients};
}
test("Box DHCP 01 : deux PC filaires et un Wi-Fi loués par un seul routeur",()=>{
 const f=fixture(),session=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients});
 good(session);
 const leases=[f.wire1,f.wire2,f.wifi].map(pc=>session.request(pc.id));
 leases.forEach(good);
 assert.deepEqual(leases.map(r=>r.address),["192.168.1.100","192.168.1.101","192.168.1.102"]);
 assert.deepEqual(leases.map(r=>r.gateway),["192.168.1.1","192.168.1.1","192.168.1.1"]);
 assert.equal(new Set(leases.map(r=>r.serverId)).size,1);
 const core=session.engine.query({type:"dhcp.leases",serverId:session.routerId});
 assert.equal(core.status,"ok");
 assert.equal(core.leases.length,3);
 assert.equal(f.registry.listAssets().filter(a=>a.boxConfig).length,1);
});
test("Box DHCP 02 : aucun bail si le client filaire n'est pas connecté",()=>{
 const f=fixture();
 good(f.registry.disconnectCableEnd(f.wires[0],1));
 err(createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients}),"link_down");
});
test("Box DHCP 03 : rupture de câble détectée après ouverture de session",()=>{
 const f=fixture(),s=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients});good(s);
 good(f.registry.disconnectCableEnd(f.wires[0],1));
 const apipa=s.request(f.wire1.id);good(apipa);
 assert.equal(apipa.code,"apipa");
 assert.match(apipa.address,/^169\.254\./);
 assert.equal(apipa.gateway,null);
 good(s.request(f.wire2.id));
});
test("Box DHCP 04 : mot de passe Wi-Fi incorrect refusé par le moteur AP",()=>{
 const f=fixture();
 const clients=f.clients.map(c=>c.medium==="wifi"?{...c,password:"incorrect"}:c);
 err(createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients}),"authentication_failed");
});
test("Box DHCP 05 : serveur désactivé, attribution APIPA par le Core",()=>{
 const f=fixture(),config=f.registry.getAsset(f.box.asset.id).boxConfig.lan;
 good(f.registry.setBoxLanConfig(f.box.asset.id,{...config,dhcpEnabled:false}));
 const session=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients});
 good(session);
 const result=session.request(f.wire1.id);good(result);
 assert.equal(result.code,"apipa");
 assert.match(result.address,/^169\.254\./);
 assert.equal(result.gateway,null);
});
test("Box DHCP 06 : reconfiguration LAN après session exige recréation",()=>{
 const f=fixture(),s=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients});good(s);
 const config=f.registry.getAsset(f.box.asset.id).boxConfig.lan;
 good(f.registry.setBoxLanConfig(f.box.asset.id,{...config,dhcpEnabled:false}));
 err(s.request(f.wire1.id),"out_of_sync");
});
test("Box DHCP 07 : refuse config hors réseau ou plage hors segment",()=>{
 const f=fixture(),config=f.registry.getAsset(f.box.asset.id).boxConfig.lan;
 err(f.registry.setBoxLanConfig(f.box.asset.id,{...config,address:"10.10.10.1"}),"invalid_box_lan");
 err(f.registry.setBoxLanConfig(f.box.asset.id,{...config,pools:[{...config.pools[0],gateway:"10.10.10.1"}]}),"invalid_box_lan");
});
test("Box DHCP 08 : sauvegarde/rechargement des paramètres LAN et Wi-Fi",()=>{
 const f=fixture();
 const saved=f.registry.exportState(),reg=restoreAssetRegistry(saved);
 assert.deepEqual(reg.getAsset(f.box.asset.id).boxConfig.lan,f.box.asset.boxConfig.lan);
 assert.deepEqual(reg.getAsset(f.box.asset.id).boxConfig.wifi,f.box.asset.boxConfig.wifi);
 const session=createBoxLanDhcpSession({registry:reg,boxId:f.box.asset.id,clients:f.clients});good(session);
 good(session.request(f.wifi.id));
});
test("Box DHCP 09 : aucun VLAN sur switch, routeur ou SSID",()=>{
 const f=fixture(),asset=f.registry.getAsset(f.box.asset.id);
 assert.deepEqual(asset.networkCapabilities,["box-internet"]);
 assert.equal(asset.vlanConfig,undefined);
 assert.equal(asset.routerConfig,undefined);
 assert.equal(asset.boxConfig.wifi.ssids.some(s=>Object.hasOwn(s,"vlanNumber")),false);
 const wifi=structuredClone(asset.boxConfig.wifi);
 wifi.ssids[0].vlanNumber=10;
 err(f.registry.setBoxWifiConfig(asset.id,wifi),"invalid_box_wifi");
});

test("Box DHCP 10 : reconnexion LAN, APIPA remplacée par bail du même routeur",()=>{
 const f=fixture(),s=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients});good(s);
 good(f.registry.disconnectCableEnd(f.wires[0],1));
 const noLink=s.request(f.wire1.id);good(noLink);assert.equal(noLink.code,"apipa");
 good(f.registry.connectCableEnd(f.wires[0],1,f.box.config.ports.lanPortIds[0]));
 const recovered=s.request(f.wire1.id);good(recovered);
 assert.equal(recovered.code,"lease");
 assert.equal(recovered.address,"192.168.1.100");
});
test("Box DHCP 11 : bail encore valide maintenu après coupure LAN",()=>{
 const f=fixture(),s=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients});good(s);
 const initial=s.request(f.wire1.id);good(initial);
 good(f.registry.disconnectCableEnd(f.wires[0],1));
 const retained=s.request(f.wire1.id);good(retained);
 assert.equal(retained.code,"lease-retained");
 assert.equal(retained.address,initial.address);
});

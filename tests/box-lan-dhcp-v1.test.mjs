import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry,installDesktopProfile} from "../src/asset-profiles.js";
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

test("Box bridge : le DHCP LAN et le Wi-Fi sont neutralisés, y compris en session ouverte",()=>{
 const f=fixture(),session=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients});good(session);
 good(f.registry.setBoxMode(f.box.asset.id,"bridge"));
 err(session.request(f.wire1.id),"bridge_mode");
 err(session.request(f.wifi.id),"bridge_mode");
 err(createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients}),"bridge_mode");
 good(f.registry.setBoxMode(f.box.asset.id,"router"));
 good(createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:f.clients}));
});

test("Box DHCP multi-interface : Ethernet et Wi-Fi du même ordinateur reçoivent deux baux",()=>{
 const registry=createAssetRegistry(),box=registry.createBoxComposite("BOX-01");good(box);
 const p=installDesktopProfile(registry).profile;
 const pc=registry.createAsset(p.id,{name:"PORTABLE-01"});good(pc);
 const lan=registry.addExtension(pc.asset.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const wifi=registry.addExtension(pc.asset.id,{type:"wifi",prefix:"WIFI",start:1,count:1});
 good(lan);good(wifi);
 const c=registry.createCable();good(c);
 good(registry.connectCableEnd(c.cable.id,0,lan.ports[0].id));
 good(registry.connectCableEnd(c.cable.id,1,box.config.ports.lanPortIds[0]));
 const clients=[
  {assetId:pc.asset.id,portId:lan.ports[0].id,medium:"ethernet"},
  {assetId:pc.asset.id,portId:wifi.ports[0].id,medium:"wifi",ssidId:"ssid-1",password:"12345678"}
 ];
 const session=createBoxLanDhcpSession({registry,boxId:box.asset.id,clients});good(session);
 err(session.request(pc.asset.id),"ambiguous_interface");
 const first=session.request(pc.asset.id,lan.ports[0].id),second=session.request(pc.asset.id,wifi.ports[0].id);
 good(first);good(second);
 assert.deepEqual([first.address,second.address],["192.168.1.100","192.168.1.101"]);
 assert.notEqual(first.address,second.address);
 assert.equal(first.interfaceId,lan.ports[0].id);
 assert.equal(second.interfaceId,wifi.ports[0].id);
 const core=session.engine.query({type:"dhcp.leases",serverId:session.routerId});
 assert.equal(core.status,"ok");assert.equal(core.leases.length,2);
 const configs=[
  {portId:lan.ports[0].id,address:first.address},
  {portId:wifi.ports[0].id,address:second.address}
 ];
 for(const {portId,address} of configs){
  good(registry.setAssetInterfaceIpv4(pc.asset.id,portId,{mode:"dhcp",status:"connected",
   address,prefix:24,gateway:"192.168.1.1",dns:["192.168.1.1"]}));
 }
 assert.equal(Object.keys(registry.getAsset(pc.asset.id).interfaceIpv4).length,2);
 assert.deepEqual(restoreAssetRegistry(registry.exportState()).exportState(),registry.exportState());
 const duplicates=createBoxLanDhcpSession({registry,boxId:box.asset.id,
  clients:[clients[0],clients[0]]});
 err(duplicates,"duplicate_client");
});

test("Box DHCP persistant 01 : deux sessions distinctes ne réutilisent jamais le même bail",()=>{
 const f=fixture();
 const one=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,
  clients:[f.clients[0]]});good(one);
 const first=one.request(f.wire1.id);good(first);
 assert.equal(first.address,"192.168.1.100");
 const two=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,
  clients:[f.clients[1]]});good(two);
 const second=two.request(f.wire2.id);good(second);
 assert.equal(second.address,"192.168.1.101");
 const leases=f.registry.getAsset(f.box.asset.id).boxConfig.dhcpState.clients;
 assert.equal(leases.length,2);
 assert.deepEqual(leases.map(x=>x.address).sort(),["192.168.1.100","192.168.1.101"]);
 const again=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,
  clients:[f.clients[0]]});good(again);
 const renewed=again.request(f.wire1.id);good(renewed);
 assert.equal(renewed.address,first.address);
 assert.equal(f.registry.getAsset(f.box.asset.id).boxConfig.dhcpState.clients.length,2);
});
test("Box DHCP persistant 02 : sauvegarde R2D3 et restauration sans perte de baux",()=>{
 const f=fixture();
 for(const c of [f.clients[0],f.clients[1]]){
  const session=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:[c]});
  good(session);good(session.request(c.assetId));
 }
 const stored=f.registry.exportState();
 const restored=restoreAssetRegistry(stored);
 assert.deepEqual(restored.exportState(),stored);
 const next=createBoxLanDhcpSession({registry:restored,boxId:f.box.asset.id,clients:[f.clients[2]]});
 good(next);
 const third=next.request(f.wifi.id);good(third);
 assert.equal(third.address,"192.168.1.102");
 assert.equal(restored.getAsset(f.box.asset.id).boxConfig.dhcpState.clients.length,3);
 const all=next.engine.query({type:"dhcp.leases",serverId:next.routerId});
 assert.equal(all.status,"ok");
 assert.equal(all.leases.length,3);
});
test("Box DHCP persistant 03 : les deux interfaces d'un même PC conservent leurs IPv4 après nouvelle session",()=>{
 const f=fixture();
 const p=f.registry.createProfile("Ordinateur double interface");good(p);
 good(f.registry.addPortGroup(p.profile.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}));
 good(f.registry.addPortGroup(p.profile.id,{type:"wifi",prefix:"WIFI",start:1,count:1}));
 const pc=f.registry.createAsset(p.profile.id,{name:"PORTABLE"});good(pc);
 const cable=f.registry.createCable();good(cable);
 good(f.registry.connectCableEnd(cable.cable.id,0,pc.asset.ports[0].id));
 good(f.registry.connectCableEnd(cable.cable.id,1,f.box.config.ports.lanPortIds[2]));
 const eth={assetId:pc.asset.id,medium:"ethernet",portId:pc.asset.ports[0].id};
 const wireless={assetId:pc.asset.id,medium:"wifi",portId:pc.asset.ports[1].id,ssidId:"ssid-1",password:"12345678"};
 const first=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:[eth]});
 good(first);assert.equal(first.request(pc.asset.id).address,"192.168.1.100");
 const second=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:[wireless]});
 good(second);assert.equal(second.request(pc.asset.id).address,"192.168.1.101");
 const third=createBoxLanDhcpSession({registry:f.registry,boxId:f.box.asset.id,clients:[eth,wireless]});
 good(third);
 const e=third.request(pc.asset.id,pc.asset.ports[0].id),w=third.request(pc.asset.id,pc.asset.ports[1].id);
 good(e);good(w);
 assert.deepEqual([e.address,w.address],["192.168.1.100","192.168.1.101"]);
 assert.equal(f.registry.getAsset(f.box.asset.id).boxConfig.dhcpState.clients.length,2);
});

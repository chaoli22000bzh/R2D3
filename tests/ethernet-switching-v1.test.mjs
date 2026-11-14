import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {observeEthernetNetworkPing} from "../src/ethernet-switching-v1.js";

function fixture(){
 const r=createAssetRegistry(),p=r.createProfile("PC Ethernet").profile;
 assert.equal(r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success,true);
 const swp=r.createProfile("Switch non administrable").profile;
 assert.equal(r.addPortGroup(swp.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5}).success,true);
 assert.equal(r.setProfileNetworkCapability(swp.id,"ethernet-switching",true).success,true);
 const pc1=r.createAsset(p.id,{name:"PC1"}).asset;
 const pc2=r.createAsset(p.id,{name:"PC2"}).asset;
 const pc3=r.createAsset(p.id,{name:"PC3"}).asset;
 const sw1=r.createAsset(swp.id,{name:"SW01"}).asset;
 const sw2=r.createAsset(swp.id,{name:"SW02"}).asset;
 const addresses={
  [pc1.id]:{address:"192.168.10.20",prefix:24},
  [pc2.id]:{address:"192.168.10.30",prefix:24},
  [pc3.id]:{address:"192.168.10.40",prefix:24}
 };
 const wire=(a,b)=>{
  const c=r.createCable().cable;
  assert.equal(r.connectCableEnd(c.id,0,a).success,true);
  assert.equal(r.connectCableEnd(c.id,1,b).success,true);
  return c;
 };
 const ping=(a,b,registry=r)=>observeEthernetNetworkPing(registry,a.id,b.id,addresses);
 return {r,p,swp,pc1,pc2,pc3,sw1,sw2,addresses,wire,ping};
}
const initial=f=>{
 f.wire(f.pc1.ports[0].id,f.sw1.ports[0].id);
 return f.wire(f.pc2.ports[0].id,f.sw1.ports[1].id);
};
test("V1-01 : PC1 communique avec PC2 via deux switchs en série",()=>{
 const f=fixture();
 f.wire(f.pc1.ports[0].id,f.sw1.ports[0].id);
 f.wire(f.sw1.ports[1].id,f.sw2.ports[0].id);
 f.wire(f.pc2.ports[0].id,f.sw2.ports[1].id);
 assert.equal(f.ping(f.pc1,f.pc2).success,true);
 assert.equal(f.r.explorePhysicalPath(f.pc1.ports[0].id,f.pc2.ports[0].id).connected,false,
  "le registre physique ne doit pas inventer de continuité interne au switch");
});
test("V1-02 : trois PC, déconnexion isolée de PC2",()=>{
 const f=fixture(),c=initial(f);
 f.wire(f.pc3.ports[0].id,f.sw1.ports[2].id);
 assert.equal(f.ping(f.pc1,f.pc2).success,true);
 assert.equal(f.ping(f.pc1,f.pc3).success,true);
 assert.equal(f.r.disconnectCableEnd(c.id,1).success,true);
 assert.equal(f.ping(f.pc1,f.pc2).success,false);
 assert.equal(f.ping(f.pc1,f.pc3).success,true);
});
test("V1-03 : sans capacité de commutation, le switch ne relaie rien",()=>{
 const f=fixture();
 const plain=f.r.createProfile("Équipement réseau sans commutation").profile;
 f.r.addPortGroup(plain.id,{type:"ethernet-rj45",prefix:"P",start:1,count:5});
 const dummy=f.r.createAsset(plain.id,{name:"NON-SW"}).asset;
 f.wire(f.pc1.ports[0].id,dummy.ports[0].id);
 f.wire(f.pc2.ports[0].id,dummy.ports[1].id);
 assert.equal(f.ping(f.pc1,f.pc2).success,false);
 assert.equal(f.r.setProfileNetworkCapability(plain.id,"ethernet-switching",true).success,true);
 assert.equal(f.ping(f.pc1,f.pc2).success,false,
  "modifier le modèle ne transforme pas rétroactivement le matériel existant");
 const next=f.r.createAsset(plain.id,{name:"NOUVEAU-SW"}).asset;
 assert.deepEqual(next.networkCapabilities,["ethernet-switching"]);
});
test("V1-04 : débranchement coupe seulement le chemin affecté",()=>{
 const f=fixture();
 f.wire(f.pc1.ports[0].id,f.sw1.ports[0].id);
 const trunk=f.wire(f.sw1.ports[1].id,f.sw2.ports[0].id);
 f.wire(f.pc2.ports[0].id,f.sw2.ports[1].id);
 f.wire(f.pc3.ports[0].id,f.sw1.ports[2].id);
 assert.equal(f.ping(f.pc1,f.pc2).success,true);
 assert.equal(f.ping(f.pc1,f.pc3).success,true);
 f.r.disconnectCableEnd(trunk.id,1);
 assert.equal(f.ping(f.pc1,f.pc2).success,false);
 assert.equal(f.ping(f.pc1,f.pc3).success,true);
});
test("V1-05 : export et restauration conservent câbles et capacités",()=>{
 const f=fixture();initial(f);
 const before=f.r.exportState(),restored=restoreAssetRegistry(before);
 assert.deepEqual(restored.exportState(),before);
 assert.deepEqual(restored.getAsset(f.sw1.id).networkCapabilities,["ethernet-switching"]);
 assert.equal(f.ping(f.pc1,f.pc2,restored).success,true);
 const cable=restored.listCables()[1];
 restored.disconnectCableEnd(cable.id,1);
 assert.equal(f.ping(f.pc1,f.pc2,restored).success,false);
 assert.equal(f.ping(f.pc1,f.pc2).success,true,"restauration indépendante de l'original");
});
test("V1 : mauvais sous-réseau échoue sans routage",()=>{
 const f=fixture();initial(f);
 f.addresses[f.pc2.id]={address:"192.168.20.30",prefix:24};
 assert.equal(f.ping(f.pc1,f.pc2).success,false);
});
test("V1 : profil cloné conserve ses capacités, matériel indépendant",()=>{
 const f=fixture();
 const cloned=f.r.duplicateProfile(f.swp.id,"Switch 8 ports").profile;
 assert.deepEqual(cloned.networkCapabilities,["ethernet-switching"]);
 const a=f.r.createAsset(cloned.id,{name:"SW03"}).asset;
 assert.deepEqual(a.networkCapabilities,["ethernet-switching"]);
 assert.equal(f.r.setProfileNetworkCapability(cloned.id,"ethernet-switching",false).success,true);
 assert.deepEqual(f.r.getAsset(a.id).networkCapabilities,["ethernet-switching"]);
});
test("V1 : profil sans ports Ethernet suffisants refuse la capacité",()=>{
 const r=createAssetRegistry(),p=r.createProfile("Autre matériel").profile;
 assert.equal(r.setProfileNetworkCapability(p.id,"ethernet-switching",true).code,"insufficient_ethernet_ports");
 r.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:2});
 assert.equal(r.setProfileNetworkCapability(p.id,"ethernet-switching",true).success,true);
 assert.equal(r.removePortGroup(p.id,r.getProfile(p.id).portGroups[0].id).code,"capability_requires_ports");
});
test("V1 : profil ancien sans capacités reste compatible",()=>{
 const f=fixture(),saved=f.r.exportState();
 for(const p of saved.profiles)delete p.networkCapabilities;
 for(const a of saved.assets)delete a.networkCapabilities;
 const restored=restoreAssetRegistry(saved);
 assert.deepEqual(restored.getProfile(f.swp.id).networkCapabilities,[]);
 assert.equal(restored.getAsset(f.sw1.id).networkCapabilities.length,0);
});
test("V1 : échec de connexion USB ne crée pas de réseau",()=>{
 const f=fixture(),usbProfile=f.r.createProfile("Périphérique USB").profile;
 f.r.addPortGroup(usbProfile.id,{type:"usb-c",prefix:"USB",start:1,count:1});
 const usb=f.r.createAsset(usbProfile.id,{name:"USB01"}).asset;
 const addresses={...f.addresses,[usb.id]:{address:"192.168.10.99",prefix:24}};
 assert.equal(observeEthernetNetworkPing(f.r,f.pc1.id,usb.id,addresses).status,"unavailable");
});

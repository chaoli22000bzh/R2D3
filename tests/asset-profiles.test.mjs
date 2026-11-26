import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry,installScreenProfile,displayFieldDefinitions,screenSpecificFieldDefinitions,installDesktopProfile,computingFieldDefinitions,desktopFieldDefinitions,computerTypeFieldDefinition} from "../src/asset-profiles.js";

const panelAt=(e,name,location,count,start,prefix="")=>{
 const place=e.listPlaces().find(p=>p.name===location&&p.parentId===null)||
   e.createPlace({name:location}).place;
 return e.createPanel({name,placeId:place.id,count,start,prefix});
};
test("Créer, dupliquer et étendre un profil existant",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Caméra réseau").profile,a=e.createAsset(p.id,{name:"CAM-01"}).asset;
 assert.equal(e.addField(p.id,{key:"resolution",label:"Résolution",type:"text"}).success,true);
 assert.equal(e.getAsset(a.id).values.resolution,null);
 e.setAssetField(a.id,"resolution","1920 × 1080");
 assert.equal(e.duplicateProfile(p.id,"Caméra PTZ").profile.fields[0].key,"resolution");
});
test("Un champ rempli ne peut pas être détruit ni changer de type",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Switch").profile;
 e.addField(p.id,{key:"ports",label:"Nombre de ports",type:"number"});
 const a=e.createAsset(p.id,{name:"SW01"}).asset;
 e.setAssetField(a.id,"ports",0);
 assert.equal(e.removeField(p.id,"ports").code,"field_in_use");
 assert.equal(e.editField(p.id,"ports",{type:"text"}).code,"field_in_use");
 e.setAssetField(a.id,"ports",null);
 assert.equal(e.editField(p.id,"ports",{type:"text"}).success,true);
 assert.equal(e.removeField(p.id,"ports").success,true);
});
test("Valeurs typées et reprise inchangée",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Netcam").profile;
 e.addField(p.id,{key:"poe",label:"PoE",type:"boolean"});
 e.addField(p.id,{key:"orientation",label:"Orientation",type:"select",options:["Fixe","PTZ"]});
 const a=e.createAsset(p.id,{name:"CAM01"}).asset;
 assert.equal(e.setAssetField(a.id,"poe","oui").success,false);
 assert.equal(e.setAssetField(a.id,"poe",false).success,true);
 assert.equal(e.setAssetField(a.id,"orientation","inconnu").success,false);
 e.setAssetField(a.id,"orientation","PTZ");
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
});
test("Édition du profil et des valeurs communes de fiche",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Caméra réseau").profile;
 assert.equal(e.renameProfile(p.id,"Caméra IP").success,true);
 e.addField(p.id,{key:"resolution",label:"Résolution",type:"text"});
 const a=e.createAsset(p.id,{name:"CAM-01"}).asset;
 assert.equal(e.editField(p.id,"resolution",{label:"Définition",unit:"pixels"}).success,true);
 assert.equal(e.setAssetField(a.id,"resolution","1920 x 1080").success,true);
 assert.equal(e.editField(p.id,"resolution",{type:"number"}).code,"field_in_use");
 assert.equal(e.updateAsset(a.id,{manufacturer:"Netcam",model:"NC-200",serialNumber:"SER-01",status:"En stock",location:"Bureau",reservable:true}).success,true);
 assert.deepEqual({manufacturer:e.getAsset(a.id).manufacturer,model:e.getAsset(a.id).model,serialNumber:e.getAsset(a.id).serialNumber,status:e.getAsset(a.id).status,location:e.getAsset(a.id).location,reservable:e.getAsset(a.id).reservable},{manufacturer:"Netcam",model:"NC-200",serialNumber:"SER-01",status:"En stock",location:"Bureau",reservable:true});
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
});
test("Édition d'une liste sans effacer les valeurs existantes",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Camera").profile;
 e.addField(p.id,{key:"type_camera",label:"Type",type:"select",options:["Fixe","PTZ"]});
 const a=e.createAsset(p.id,{name:"CAM-01"}).asset;e.setAssetField(a.id,"type_camera","PTZ");
 assert.equal(e.editField(p.id,"type_camera",{options:["Fixe","Dôme"]}).code,"field_in_use");
 assert.equal(e.getAsset(a.id).values.type_camera,"PTZ");
 assert.equal(e.editField(p.id,"type_camera",{options:["Fixe","PTZ","Dôme"]}).success,true);
 assert.equal(e.getAsset(a.id).values.type_camera,"PTZ");
 assert.equal(e.updateAsset(a.id,{status:"En réparation"}).success,false);
});

test("Ports intégrés générés et figés sur chaque équipement",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Switch non administrable").profile;
 assert.equal(e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:5,digits:2}).success,true);
 const a=e.createAsset(p.id,{name:"SW01"}).asset;
 assert.deepEqual(a.ports.map(x=>x.name),["LAN01","LAN02","LAN03","LAN04","LAN05"]);
 assert.ok(a.ports.every(x=>x.medium==="ethernet"&&x.connector==="RJ45"&&x.origin==="integrated"));
 const portIds=a.ports.map(x=>x.id);
 assert.equal(e.addPortGroup(p.id,{type:"wifi",prefix:"WLAN",start:1,count:1}).success,true);
 assert.equal(e.getAsset(a.id).ports.length,5,"pas de modification rétroactive du matériel");
 const b=e.createAsset(p.id,{name:"SW02"}).asset;
 assert.equal(b.ports.length,6);
 assert.notDeepEqual(b.ports.slice(0,5).map(x=>x.id),portIds);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).getAsset(a.id).ports.map(x=>x.id),portIds);
});
test("Ports nommés, doublons et types sans fil",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Point d'accès").profile;
 assert.equal(e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:0,count:2}).success,true);
 assert.equal(e.addPortGroup(p.id,{type:"ethernet-fibre",prefix:"LAN",start:1,count:1}).code,"port_name_exists");
 assert.equal(e.addPortGroup(p.id,{type:"wifi",prefix:"WIFI",start:1,count:1}).success,true);
 const a=e.createAsset(p.id,{name:"AP01"}).asset;
 assert.equal(a.ports[2].connector,null);
 assert.equal(a.ports[2].medium,"wireless");
 assert.equal(e.removePortGroup(p.id,p.portGroups?.[0]?.id||e.getProfile(p.id).portGroups[0].id).success,true);
 assert.equal(e.getAsset(a.id).ports.length,3);
});
test("Extension indépendante et retrait protégé",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Serveur").profile;
 e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:1});
 const a=e.createAsset(p.id,{name:"SRV01"}).asset;
 assert.equal(e.addExtension(a.id,{type:"ethernet-fibre",prefix:"SFP",start:1,count:2}).success,true);
 assert.equal(e.getAsset(a.id).ports.length,3);
 assert.equal(e.addExtension(a.id,{type:"usb-c",prefix:"ETH",start:1,count:1}).code,"port_name_exists");
 const ext=e.getAsset(a.id).ports[1].groupId;
 assert.equal(e.removeExtension(a.id,ext).success,true);
 assert.equal(e.getAsset(a.id).ports.length,1);
 assert.equal(e.removeExtension(a.id,e.getAsset(a.id).ports[0].groupId).code,"not_found");
});


test("Câble inventorié, raccordement de deux équipements et débranchement partiel",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Machine").profile;
 assert.equal(e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1}).success,true);
 const a=e.createAsset(p.id,{name:"PC01"}).asset,b=e.createAsset(p.id,{name:"SW01"}).asset;
 const c=e.createCable().cable;
 assert.deepEqual(c.connectors,["rj45-male","rj45-male"]);
 assert.deepEqual(c.ends,[null,null]);
 assert.equal(e.connectCableEnd(c.id,0,a.ports[0].id).success,true);
 assert.equal(e.connectCableEnd(c.id,1,b.ports[0].id).success,true);
 assert.equal(e.listCablePoints().filter(p=>p.occupied).length,2);
 assert.equal(e.disconnectCableEnd(c.id,0).success,true);
 assert.equal(e.getCable(c.id).ends[0],null);
 assert.equal(e.getCable(c.id).ends[1].portId,b.ports[0].id);
 assert.equal(e.getAsset(a.id).ports[0].connectedCableIds.length,0);
 assert.equal(e.getAsset(b.id).ports[0].connectedCableIds[0],c.id);
 const restored=restoreAssetRegistry(e.exportState());
 assert.equal(restored.getCable(c.id).ends[1].portId,b.ports[0].id);
 assert.equal(restored.getAsset(b.id).ports[0].connectedCableIds[0],c.id);
 assert.equal(restored.connectCableEnd(c.id,0,a.ports[0].id).success,true);
 assert.equal(restored.deleteCable(c.id).success,true);
 assert.equal(restored.listCables().length,0);
 assert.equal(restored.listCablePoints().filter(p=>p.occupied).length,0);
});
test("Refuser port occupé, connecteur incompatible et double branchement",()=>{
 const e=createAssetRegistry(),p=e.createProfile("PC").profile;
 e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:2});
 const a=e.createAsset(p.id,{name:"PC1"}).asset;
 const c=e.createCable().cable,d=e.createCable().cable;
 assert.equal(e.connectCableEnd(c.id,0,a.ports[0].id).success,true);
 assert.equal(e.connectCableEnd(d.id,0,a.ports[0].id).code,"port_occupied");
 assert.equal(e.connectCableEnd(c.id,1,a.ports[0].id).code,"same_port");
 assert.equal(e.updateCableConnectors(c.id,["rj45-female","rj45-male"]).code,"incompatible_connector");
 assert.equal(e.connectCableEnd(c.id,0,a.ports[1].id).code,"end_connected");
 assert.equal(e.connectCableEnd(d.id,0,a.ports[1].id).success,true);
 assert.equal(e.connectCableEnd(d.id,1,a.ports[0].id).code,"port_occupied");
 assert.equal(e.getCable(d.id).ends[1],null);
});
test("Connecteurs arbitraires, ports sans fil non raccordables et extension protégée",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Serveur").profile;
 e.addPortGroup(p.id,{type:"wifi",prefix:"WLAN",start:1,count:1});
 const a=e.createAsset(p.id,{name:"SRV"}).asset;
 const c=e.createCable({connectors:["db9-female","rj45-male"]}).cable;
 assert.deepEqual(c.connectors,["db9-female","rj45-male"]);
 assert.equal(e.connectCableEnd(c.id,0,a.ports[0].id).code,"unsupported_port");
 assert.equal(e.addExtension(a.id,{type:"ethernet-rj45",prefix:"ETH",start:1,count:1}).success,true);
 const port=e.getAsset(a.id).ports[1],ext=port.groupId;
 assert.equal(e.connectCableEnd(c.id,0,port.id).code,"incompatible_connector");
 assert.equal(e.connectCableEnd(c.id,1,port.id).success,true);
 assert.equal(e.removeExtension(a.id,ext).code,"extension_connected");
 assert.equal(e.disconnectCableEnd(c.id,1).success,true);
 assert.equal(e.removeExtension(a.id,ext).success,true);
});


test("Prise murale et panneau : occupation indépendante des faces avant et arrière",()=>{
 const e=createAssetRegistry();
 const outlet=e.createWallOutlet({name:"B12",location:"Salle 101"}).outlet;
 const rack=panelAt(e,"Baie A","Local réseau",24,1,"P").panel;
 assert.equal(outlet.ports.length,1);
 assert.equal(rack.ports.length,24);
 assert.equal(rack.ports[11].label,"P12");
 const outletFront=outlet.ports[0].front.id,outletBack=outlet.ports[0].back.id;
 const panelFront=rack.ports[11].front.id,panelBack=rack.ports[11].back.id;
 const fixed=e.createCable({connectors:["rj45-male","rj45-male"]}).cable;
 const patch=e.createCable().cable;
 assert.equal(e.connectCableEnd(fixed.id,0,outletBack).success,true);
 assert.equal(e.connectCableEnd(fixed.id,1,panelBack).success,true);
 assert.equal(e.connectCableEnd(patch.id,0,panelFront).success,true);
 assert.equal(e.connectCableEnd(patch.id,1,outletFront).success,true);
 assert.equal(e.listCablePoints().filter(p=>p.occupied).length,4);
 const second=e.createCable().cable;
 assert.equal(e.connectCableEnd(second.id,0,panelFront).code,"port_occupied");
 assert.equal(e.disconnectCableEnd(patch.id,0).success,true);
 assert.equal(e.getCable(fixed.id).ends[1].portId,panelBack);
 assert.equal(e.getCable(patch.id).ends[0],null);
 assert.equal(e.getCable(patch.id).ends[1].portId,outletFront);
 assert.equal(e.deleteCable(patch.id).success,true);
 assert.equal(e.getCable(fixed.id).ends[1].portId,panelBack);
 const restored=restoreAssetRegistry(e.exportState());
 assert.equal(restored.getCable(fixed.id).ends[0].portId,outletBack);
 assert.equal(restored.listCablePoints().find(p=>p.portId===panelBack).occupied,true);
 assert.equal(restored.listCablePoints().find(p=>p.portId===panelFront).occupied,false);
});
test("Panneaux indépendants, noms et ports individuels libres",()=>{
 const e=createAssetRegistry();
 const a=panelAt(e,"A","Rennes",3,0,"").panel;
 const b=panelAt(e,"B","Redon",1,1,"").panel;
 assert.deepEqual(a.ports.map(x=>x.label),["0","1","2"]);
 assert.equal(panelAt(e,"A","Rennes",3,1,"").code,"duplicate_name");
 assert.equal(panelAt(e,"A","Bruz",1,1,"").success,true);
 assert.equal(e.createWallOutlet({name:"B12",location:"Salle 1"}).success,true);
 assert.equal(e.createWallOutlet({name:"B12",location:"Salle 1"}).code,"duplicate_name");
 const c=e.createCable({connectors:["rj45-female","rj45-female"]}).cable;
 assert.equal(e.connectCableEnd(c.id,0,a.ports[0].back.id).code,"incompatible_connector");
 assert.equal(e.updateCableConnectors(c.id,["rj45-male","rj45-male"]).success,true);
 assert.equal(e.connectCableEnd(c.id,0,a.ports[0].back.id).success,true);
 assert.equal(e.connectCableEnd(c.id,1,b.ports[0].back.id).success,true);
 assert.equal(e.getCable(c.id).ends[1].portId,b.ports[0].back.id);
});


test("Chemin physique PC vers switch via prise et panneau, sans émulation IP",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Équipement").profile;
 e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const pc=e.createAsset(p.id,{name:"PC01"}).asset;
 const sw=e.createAsset(p.id,{name:"SW01"}).asset;
 const socket=e.createWallOutlet({name:"B12",location:"Salle 101"}).outlet.ports[0];
 const panel=panelAt(e,"Baie A","Local réseau",12,1,"P").panel.ports[11];
 const connect=(a,b)=>{
  const c=e.createCable().cable;
  assert.equal(e.connectCableEnd(c.id,0,a).success,true);
  assert.equal(e.connectCableEnd(c.id,1,b).success,true);
  return c;
 };
 const pcCable=connect(pc.ports[0].id,socket.front.id);
 const permanent=connect(socket.back.id,panel.back.id);
 const patch=connect(panel.front.id,sw.ports[0].id);
 let r=e.explorePhysicalPath(pc.ports[0].id,sw.ports[0].id);
 assert.equal(r.success,true);assert.equal(r.connected,true);
 assert.deepEqual(r.segments.map(x=>x.kind),["cable","passage","cable","passage","cable"]);
 assert.deepEqual(r.segments.filter(x=>x.kind==="cable").map(x=>x.id),[pcCable.id,permanent.id,patch.id]);
 assert.equal(r.path.length,6);
 const reverse=e.explorePhysicalPath(sw.ports[0].id,pc.ports[0].id);
 assert.equal(reverse.connected,true);
 assert.deepEqual(reverse.path.map(x=>x.portId),r.path.map(x=>x.portId).reverse());
 assert.equal(e.disconnectCableEnd(permanent.id,1).success,true);
 r=e.explorePhysicalPath(pc.ports[0].id,sw.ports[0].id);
 assert.equal(r.connected,false);
 assert.equal(r.path.length,0);
 assert.equal(r.fromReachable.some(x=>x.portId===socket.back.id),true);
 assert.equal(r.toReachable.some(x=>x.portId===panel.back.id),true);
 assert.equal(r.fromReachable.some(x=>x.portId===panel.back.id),false);
 assert.equal(r.toReachable.some(x=>x.portId===socket.back.id),false);
 assert.ok(r.fromReachable.some(x=>x.assetName.includes("B12")));
 assert.ok(r.toReachable.some(x=>x.assetName.includes("Baie A")));
 assert.equal(e.connectCableEnd(permanent.id,1,panel.back.id).success,true);
 assert.equal(e.explorePhysicalPath(pc.ports[0].id,sw.ports[0].id).connected,true);
 const restored=restoreAssetRegistry(e.exportState());
 assert.equal(restored.explorePhysicalPath(pc.ports[0].id,sw.ports[0].id).connected,true);
});
test("Chemins : branchement incomplet, cycles, bornes invalides et aucun passage via un switch",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Switch").profile;
 e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:2});
 const sw=e.createAsset(p.id,{name:"SW01"}).asset;
 let r=e.explorePhysicalPath(sw.ports[0].id,sw.ports[1].id);
 assert.equal(r.connected,false,"Le moteur ne traverse pas arbitrairement un switch");
 assert.equal(e.explorePhysicalPath("nulle-part",sw.ports[0].id).code,"not_found");
 const rack=panelAt(e,"Baie","Salle",3,1,"").panel;
 const ports=rack.ports;
 const connect=(a,b)=>{
  const c=e.createCable().cable;
  e.connectCableEnd(c.id,0,a);e.connectCableEnd(c.id,1,b);return c;
 };
 connect(ports[0].front.id,ports[1].front.id);
 connect(ports[1].back.id,ports[2].front.id);
 connect(ports[2].back.id,ports[0].back.id);
 r=e.explorePhysicalPath(ports[0].front.id,ports[2].front.id);
 assert.equal(r.connected,true);
 assert.ok(r.path.length<=6,"Exploration bornée même avec une boucle physique");
 const dangling=e.createCable().cable;
 e.connectCableEnd(dangling.id,0,sw.ports[0].id);
 assert.equal(e.explorePhysicalPath(sw.ports[0].id,rack.ports[0].front.id).connected,false);
});


test("Remplacement de switch : interdiction de suppression branchée, câbles conservés et réutilisables",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Switch").profile;
 assert.equal(e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:2}).success,true);
 const old=e.createAsset(p.id,{name:"SW01"}).asset;
 const wall=e.createWallOutlet({name:"B12",location:"Salle 101"}).outlet;
 const cable=e.createCable().cable;
 assert.equal(e.connectCableEnd(cable.id,0,old.ports[0].id).success,true);
 assert.equal(e.connectCableEnd(cable.id,1,wall.ports[0].front.id).success,true);
 assert.equal(e.removeAsset(old.id).code,"asset_connected");
 assert.equal(e.getAsset(old.id).name,"SW01");
 assert.equal(e.disconnectCableEnd(cable.id,0).success,true);
 assert.equal(e.removeAsset(old.id).success,true);
 assert.equal(e.getAsset(old.id),null);
 assert.equal(e.getCable(cable.id).ends[0],null);
 assert.equal(e.getCable(cable.id).ends[1].portId,wall.ports[0].front.id);
 const replacement=e.createAsset(p.id,{name:"SW02",serialNumber:"NEW-02"}).asset;
 assert.notEqual(replacement.ports[0].id,old.ports[0].id);
 assert.equal(e.connectCableEnd(cable.id,0,replacement.ports[0].id).success,true);
 assert.equal(e.getCable(cable.id).ends[1].portId,wall.ports[0].front.id);
 assert.equal(e.listCables().length,1);
 const restored=restoreAssetRegistry(e.exportState());
 assert.equal(restored.getAsset(old.id),null);
 assert.equal(restored.getCable(cable.id).ends[0].portId,replacement.ports[0].id);
 assert.equal(restored.getAsset(replacement.id).serialNumber,"NEW-02");
});
test("Suppression appareil : une seule extrémité branchée suffit à refuser, renommage permis",()=>{
 const e=createAssetRegistry(),p=e.createProfile("PC").profile;
 e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const a=e.createAsset(p.id,{name:"PC01"}).asset,c=e.createCable().cable;
 assert.equal(e.connectCableEnd(c.id,1,a.ports[0].id).success,true);
 assert.equal(e.removeAsset(a.id).code,"asset_connected");
 assert.equal(e.updateAsset(a.id,{name:"PC-RENOMMÉ"}).success,true);
 assert.equal(e.listCablePoints().find(x=>x.portId===a.ports[0].id).assetName,"PC-RENOMMÉ");
 assert.equal(e.disconnectCableEnd(c.id,1).success,true);
 assert.equal(e.removeAsset(a.id).success,true);
 assert.equal(e.listCables().length,1);
 assert.equal(e.removeAsset(a.id).code,"not_found");
});

test("Lieux hiérarchiques facultatifs, unicité locale et restauration",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Switch").profile;
 const sw=e.createAsset(p.id,{name:"SW01",location:"Ancien texte libre"}).asset;
 assert.equal(sw.placeId,null);
 const us=e.createPlace({name:"États-Unis"}).place;
 const la=e.createPlace({name:"Los Angeles",parentId:us.id}).place;
 const fr=e.createPlace({name:"France"}).place;
 const ren=e.createPlace({name:"Rennes",parentId:fr.id}).place;
 const web=e.createPlace({name:"Internet"}).place;
 assert.equal(e.createPlace({name:"Rennes",parentId:fr.id}).code,"duplicate_name");
 assert.equal(e.createPlace({name:"Rennes",parentId:us.id}).success,true);
 assert.equal(e.createPlace({name:"Inconnu",parentId:"place-999"}).code,"not_found");
 assert.equal(e.moveAssetToPlace(sw.id,ren.id).success,true);
 assert.equal(e.getAsset(sw.id).placeId,ren.id);
 assert.equal(e.getAsset(sw.id).location,"Ancien texte libre");
 assert.equal(e.moveAssetToPlace(sw.id,la.id).success,true);
 assert.equal(e.moveAssetToPlace(sw.id,web.id).success,true);
 assert.equal(e.moveAssetToPlace(sw.id,null).success,true);
 assert.equal(e.moveAssetToPlace(sw.id,"place-999").code,"not_found");
 assert.equal(e.getAsset(sw.id).placeId,null);
 const restored=restoreAssetRegistry(e.exportState());
 assert.deepEqual(restored.listPlaces(),e.listPlaces());
 assert.equal(restored.moveAssetToPlace(sw.id,ren.id).success,true);
 assert.equal(restored.getAsset(sw.id).id,sw.id);
 assert.deepEqual(restored.getAsset(sw.id).ports,sw.ports);
});
test("Déplacement d'un équipement raccordé refusé sans effacer les câbles",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Switch").profile;
 e.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const sw=e.createAsset(p.id,{name:"SW01"}).asset;
 const rennes=e.createPlace({name:"Rennes"}).place;
 const la=e.createPlace({name:"Los Angeles"}).place;
 assert.equal(e.moveAssetToPlace(sw.id,rennes.id).success,true);
 const wall=e.createWallOutlet({name:"B12",location:"Rennes"}).outlet;
 const cable=e.createCable().cable;
 assert.equal(e.connectCableEnd(cable.id,0,sw.ports[0].id).success,true);
 assert.equal(e.connectCableEnd(cable.id,1,wall.ports[0].front.id).success,true);
 const before=e.exportState();
 assert.equal(e.moveAssetToPlace(sw.id,la.id).code,"asset_connected");
 assert.deepEqual(e.exportState(),before);
 assert.equal(e.disconnectCableEnd(cable.id,0).success,true);
 assert.equal(e.moveAssetToPlace(sw.id,la.id).success,true);
 assert.equal(e.getAsset(sw.id).placeId,la.id);
 assert.equal(e.getCable(cable.id).ends[0],null);
 assert.equal(e.getCable(cable.id).ends[1].portId,wall.ports[0].front.id);
 const restored=restoreAssetRegistry(e.exportState());
 assert.equal(restored.getAsset(sw.id).placeId,la.id);
 assert.equal(restored.getCable(cable.id).ends[1].portId,wall.ports[0].front.id);
});
test("Anciennes données sans liste de lieux restaurables ; parents et cycles invalides refusés",()=>{
 const e=createAssetRegistry(),p=e.createProfile("PC").profile,a=e.createAsset(p.id,{name:"PC01"}).asset;
 const old=e.exportState();delete old.places;delete old.nextPlace;delete old.assets[0].placeId;
 const restored=restoreAssetRegistry(old);
 assert.equal(restored.getAsset(a.id).placeId,null);
 assert.deepEqual(restored.listPlaces(),[]);
 const broken=e.exportState();broken.assets[0].placeId="place-999";
 assert.throws(()=>restoreAssetRegistry(broken));
 const cyclic=e.exportState();cyclic.places=[{id:"place-1",name:"A",parentId:"place-2"},{id:"place-2",name:"B",parentId:"place-1"}];
 assert.throws(()=>restoreAssetRegistry(cyclic));
});

test("Deux panneaux dans un lieu ordinaire, sans objet baie ni ports du lieu",()=>{
 const e=createAssetRegistry(),room=e.createPlace({name:"Salle technique"}).place;
 const bay=e.createPlace({name:"Baie 01",parentId:room.id}).place;
 const p1=e.createPanel({name:"P1",placeId:bay.id,count:12,start:1}).panel;
 const p2=e.createPanel({name:"P2",placeId:bay.id,count:24,start:1}).panel;
 assert.equal(e.listPanels().length,2);
 assert.equal(e.listPlaces().find(p=>p.id===bay.id).name,"Baie 01");
 assert.equal(e.exportState().racks,undefined);
 assert.equal(e.createPanel({name:"P1",placeId:bay.id,count:1,start:1}).code,"duplicate_name");
 assert.equal(e.createPanel({name:"P1",placeId:room.id,count:1,start:1}).success,true);
 const c=e.createCable().cable;
 assert.equal(e.connectCableEnd(c.id,0,p1.ports[0].back.id).success,true);
 assert.equal(e.connectCableEnd(c.id,1,p2.ports[0].back.id).success,true);
 assert.equal(e.explorePhysicalPath(p1.ports[0].front.id,p2.ports[0].front.id).connected,true);
 const state=e.exportState(),restored=restoreAssetRegistry(state);
 assert.deepEqual(restored.exportState(),state);
 assert.equal(restored.explorePhysicalPath(p1.ports[0].front.id,p2.ports[0].front.id).connected,true);
 assert.equal(e.movePanelToPlace(p1.id,room.id).code,"panel_connected");
 assert.deepEqual(e.exportState(),state);
 assert.equal(e.removePanel(p1.id).code,"panel_connected");
 assert.equal(e.disconnectCableEnd(c.id,0).success,true);
 assert.equal(e.movePanelToPlace(p1.id,room.id).success,true);
 assert.equal(e.getPanel(p1.id).placeId,room.id);
 assert.equal(e.getPanel(p1.id).ports[0].front.id,p1.ports[0].front.id);
 assert.equal(e.removePanel(p1.id).success,true);
 assert.equal(e.listCables().length,1);
 assert.equal(e.getCable(c.id).ends[0],null);
});

test("Connectique V1 : 11 types physiques, raccordements compatibles, débranchement et restauration",()=>{
 const families=[
  ["ethernet-rj45","rj45-male","rj45-female"],
  ["ethernet-fibre","lc-plug","lc-socket"],
  ["usb-a","usb-a-plug","usb-a-socket"],
  ["usb-b","usb-b-plug","usb-b-socket"],
  ["usb-c","usb-c-plug","usb-c-socket"],
  ["hdmi","hdmi-plug","hdmi-socket"],
  ["vga","vga-male","vga-female"],
  ["dvi","dvi-male","dvi-female"],
  ["displayport","displayport-plug","displayport-socket"],
  ["mini-displayport","mini-displayport-plug","mini-displayport-socket"],
  ["db9","db9-female","db9-male"]
 ];
 const e=createAssetRegistry(),p=e.createProfile("PC et périphériques").profile;
 for(let i=0;i<families.length;i++){
  const [type]=families[i];
  assert.equal(e.addPortGroup(p.id,{type,prefix:"P"+i,start:1,count:1}).success,true,type);
 }
 const a=e.createAsset(p.id,{name:"PC01"}).asset;
 const b=e.createAsset(p.id,{name:"PERIPH01"}).asset;
 assert.equal(a.ports.length,11);
 const cables=[];
 for(let i=0;i<families.length;i++){
  const [type,plug,socket]=families[i];
  const ca=e.createCable({connectors:[plug,plug]}).cable;
  cables.push(ca);
  assert.equal(e.listCablePoints().find(x=>x.portId===a.ports[i].id).socket,socket,type);
  assert.equal(e.connectCableEnd(ca.id,0,a.ports[i].id).success,true,type);
  assert.equal(e.connectCableEnd(ca.id,1,b.ports[i].id).success,true,type);
  assert.equal(e.updateCableConnectors(ca.id,["rj45-male",plug]).code,i===0?"cable_updated":"incompatible_connector",type);
 }
 assert.equal(e.connectCableEnd(cables[10].id,0,a.ports[6].id).code,"end_connected");
 const wrong=e.createCable({connectors:["db9-female","vga-male"]}).cable;
 assert.equal(e.connectCableEnd(wrong.id,0,a.ports[6].id).code,"port_occupied");
 assert.equal(e.disconnectCableEnd(cables[6].id,0).success,true);
 assert.equal(e.connectCableEnd(wrong.id,0,a.ports[6].id).code,"incompatible_connector",
  "Un câble DB9 ne doit pas rentrer dans un port VGA");
 assert.equal(e.connectCableEnd(wrong.id,1,a.ports[6].id).success,true);
 assert.equal(e.disconnectCableEnd(wrong.id,1).success,true);
 assert.equal(e.connectCableEnd(cables[6].id,0,a.ports[6].id).success,true);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
 for(const ca of cables)assert.equal(e.disconnectCableEnd(ca.id,0).success,true);
 assert.equal(e.listCables().length,12,"Les câbles restent inventoriés après débranchement");
});

test("Profil Écran : six champs Affichage, quatre champs autonomes, réutilisation et ports indépendants",()=>{
 const registry=createAssetRegistry();
 assert.equal(registry.listProfiles().length,0,"Un registre vierge ne change pas sans installation explicite");
 const installed=installScreenProfile(registry);
 assert.equal(installed.success,true);
 const p=registry.getProfile(installed.profile.id);
 assert.equal(p.name,"Écran");
 assert.deepEqual(p.fields.map(f=>f.key),
  [...displayFieldDefinitions,...screenSpecificFieldDefinitions].map(f=>f.key));
 assert.equal(p.fields.length,10);
 assert.equal(p.portGroups.length,0,"Aucun port imposé à tous les écrans");
 assert.equal(p.networkCapabilities.length,0);
 assert.equal(installScreenProfile(registry).code,"already_present");
 assert.equal(registry.listProfiles().length,1,"Installation idempotente");
 const screen=registry.createAsset(p.id,{name:"ECRAN-01"}).asset;
 assert.equal(screen.ports.length,0);
 assert.equal(registry.setAssetField(screen.id,"diagonale",27).success,true);
 assert.equal(registry.setAssetField(screen.id,"resolution","2560 × 1440").success,true);
 assert.equal(registry.setAssetField(screen.id,"type_dalle","IPS").success,true);
 assert.equal(registry.setAssetField(screen.id,"type_ecran","Moniteur").success,true);
 assert.equal(registry.getProfile(p.id).fields.find(f=>f.key==="format_image").label,"Ratio");
 assert.equal(registry.getProfile(p.id).fields.find(f=>f.key==="diagonale").unit,"pouces");
 assert.equal(registry.getProfile(p.id).fields.find(f=>f.key==="vesa").type,"text");
 assert.equal(registry.getProfile(p.id).fields.find(f=>f.key==="pied_reglable").type,"text");
 for(const [key,good,bad] of [
  ["resolution","1920 × 1080","1920"],
  ["haut_parleurs","2x3W","oui"],
  ["vesa","150x150mm","true"],
  ["pied_reglable","150mm","oui"]
 ]){
  assert.equal(registry.setAssetField(screen.id,key,good).success,true,key+" accepte la mesure");
  assert.equal(registry.setAssetField(screen.id,key,bad).success,false,key+" rejette le format");
  assert.equal(registry.setAssetField(screen.id,key,"Non").success,key!=="resolution",key+" accepte Non hors résolution");
 }
 assert.equal(registry.setAssetField(screen.id,"resolution","2560 x 1440").success,true);

 assert.equal(registry.setAssetField(screen.id,"tactile",false).success,true);
 assert.equal(registry.setAssetField(screen.id,"type_dalle","Inconnu").success,false);
 assert.equal(registry.addExtension(screen.id,{type:"hdmi",prefix:"HDMI",start:1,count:2}).success,true);
 assert.equal(registry.addExtension(screen.id,{type:"displayport",prefix:"DP",start:1,count:1}).success,true);
 assert.equal(registry.getAsset(screen.id).ports.length,3);
 const save=registry.exportState();
 assert.deepEqual(restoreAssetRegistry(save).exportState(),save);
 const portable=registry.createProfile("PC portable").profile;
 for(const f of displayFieldDefinitions)assert.equal(registry.addField(portable.id,f).success,true);
 assert.equal(registry.getProfile(portable.id).fields.length,6);
 assert.equal(registry.getProfile(portable.id).fields.some(f=>f.key==="vesa"),false);
});

test("Création de champs : clé interne automatique, accents, doublons et compatibilité",()=>{
 const e=createAssetRegistry(),p=e.createProfile("Profil pédagogique").profile;
 for(const [label,key] of [
  ["Consommation électrique","consommation_electrique"],
  ["Consommation électrique","consommation_electrique_2"],
  ["Nom","nom"],
  ["name","name_2"],
  ["name","name_3"],
  ["123 ###","champ"],
  ["123 ###","champ_2"]
 ]){
  const r=e.addField(p.id,{label,type:"text"});
  assert.equal(r.success,true,label);
  assert.equal(r.field.key,key);
 }
 const manual=e.addField(p.id,{key:"code_fabricant",label:"Code fabricant",type:"text"});
 assert.equal(manual.field.key,"code_fabricant");
 assert.equal(e.addField(p.id,{label:"",type:"text"}).success,false);
 const a=e.createAsset(p.id,{name:"ACTIF-01"}).asset;
 assert.equal(e.setAssetField(a.id,"consommation_electrique","42").success,true);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
});

test("Ordinateur standard : socle Informatique commun, profil léger et registre inchangé",()=>{
 const e=createAssetRegistry();
 assert.equal(e.listProfiles().length,0);
 const created=installDesktopProfile(e);
 assert.equal(created.success,true);
 const p=e.getProfile(created.profile.id);
 assert.deepEqual(p.fields.map(f=>f.key),[computerTypeFieldDefinition,...computingFieldDefinitions,...desktopFieldDefinitions].map(f=>f.key));
 assert.equal(p.fields.length,7);
 assert.equal(p.fields.some(f=>["chassis","raid","volumes","frequence_cpu","architecture_os"].includes(f.key)),false);
 assert.equal(p.portGroups.length,0);
 assert.equal(p.name,"Ordinateur");
 assert.equal(installDesktopProfile(e).code,"already_present");
 assert.equal(e.listProfiles().length,1);
 const a=e.createAsset(p.id,{name:"REN-PC-01",manufacturer:"ASUS",model:"NUC12WSKi7",serialNumber:"BTWS333007EX"}).asset;
 assert.equal(e.setAssetField(a.id,"processeur_marque","Intel").success,true);
 assert.equal(e.setAssetField(a.id,"processeur_modele","Core i7-1260P").success,true);
 assert.equal(e.setAssetField(a.id,"ram_go",64).success,true);
 assert.equal(e.setAssetField(a.id,"stockage_go",2000).success,true);
 assert.equal(e.setAssetField(a.id,"systeme_exploitation","Windows 11 Professionnel").success,true);
 assert.equal(e.setAssetField(a.id,"version_os","25H2").success,true);
 const saved=e.exportState();
 assert.deepEqual(restoreAssetRegistry(saved).exportState(),saved);
 const mobile=e.createProfile("Smartphone").profile;
 for(const f of computingFieldDefinitions)assert.equal(e.addField(mobile.id,f).success,true);
 assert.equal(e.getProfile(mobile.id).fields.length,4);
 assert.equal(e.getProfile(mobile.id).fields.some(f=>f.key==="systeme_exploitation"),false);
 assert.equal(e.getProfile(p.id).fields.length,7);
});

test("Inventaire processeurs détaillés : répétition, validation, copie et compatibilité",()=>{
 const e=createAssetRegistry();
 const base=installDesktopProfile(e).profile;
 const detailed=e.duplicateProfile(base.id,"PC fixe - Inventaire détaillé").profile;
 assert.equal(e.getProfile(base.id).processorInventory,true);
 assert.equal(e.setProfileProcessorInventory(detailed.id,true).success,true);
 const a=e.createAsset(detailed.id,{name:"REN-PC-01"}).asset;
 assert.equal(e.addAssetProcessor(a.id,{quantite:1,marque:"Intel",modele:"Core i7-1260P",frequenceMHz:2079,coeurs:12,threads:16}).success,true);
 assert.equal(e.addAssetProcessor(a.id,{quantite:1,marque:"AMD",modele:"EPYC",frequenceMHz:2400,coeurs:16,threads:32}).success,true);
 assert.equal(e.getAsset(a.id).processors.length,2);
 assert.equal(e.addAssetProcessor(a.id,{quantite:1,marque:"Intel",modele:"X",coeurs:2.5}).success,false);
 assert.equal(e.updateAssetProcessor(a.id,"cpu-1",{quantite:1,marque:"Intel",modele:"Core i7-1260P",frequenceMHz:2200,coeurs:12,threads:16}).success,true);
 assert.equal(e.getAsset(a.id).processors[0].frequenceMHz,2200);
 assert.equal(e.setProfileProcessorInventory(detailed.id,false).success,false);
 const save=e.exportState();
 assert.deepEqual(restoreAssetRegistry(save).exportState(),save);
 assert.equal(e.removeAssetProcessor(a.id,"cpu-1").success,true);
 assert.equal(e.removeAssetProcessor(a.id,"cpu-2").success,true);
 assert.equal(e.setProfileProcessorInventory(detailed.id,false).success,true);
 const standard=e.createAsset(base.id,{name:"PC-STD"}).asset;
 assert.equal(e.addAssetProcessor(standard.id,{quantite:1,marque:"Intel",modele:"i5"}).success,true);
 const previous=e.exportState();
 for(const a of previous.assets)delete a.processors;
 for(const p of previous.profiles)delete p.processorInventory;
 const restored=restoreAssetRegistry(previous);
 assert.equal(restored.getAsset(standard.id).processors,undefined);
 assert.equal(restored.getProfile(base.id).processorInventory,undefined);
});

test("CPU : seule la quantité est requise, valeurs préservées",()=>{
 const e=createAssetRegistry();
 const p=installDesktopProfile(e).profile;
 const asset=e.createAsset(p.id,{name:"PC-CPU-01"}).asset;
 const id=asset.id;
 assert.equal(e.addAssetProcessor(id,{quantite:2}).success,true);
 assert.equal(e.getAsset(id).processors[0].quantite,2);
 assert.equal(e.addAssetProcessor(id,{modele:"Core i5"}).success,false);
 assert.equal(e.addAssetProcessor(id,{quantite:0}).success,false);
 assert.equal(e.addAssetProcessor(id,{quantite:1.5}).success,false);
 assert.equal(e.updateAssetProcessor(id,"cpu-1",{quantite:3}).success,true);
 assert.equal(e.getAsset(id).processors[0].quantite,3);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
 const legacy=e.exportState();
 delete legacy.assets.find(a=>a.id===id).processors[0].quantite;
 assert.equal(restoreAssetRegistry(legacy).getAsset(id).processors[0].quantite,1);
});
test("Disques : quantité et capacité seules obligatoires",()=>{
 const e=createAssetRegistry(),p=installDesktopProfile(e).profile,a=e.createAsset(p.id,{name:"PC-DISK"}).asset;
 assert.equal(e.addAssetComponent(a.id,"disk",{capaciteGo:500,quantite:2}).success,true);
 assert.equal(e.getAsset(a.id).disks[0].quantite,2);
 assert.equal(e.addAssetComponent(a.id,"disk",{capaciteGo:500}).success,false);
 assert.equal(e.addAssetComponent(a.id,"disk",{quantite:1}).success,false);
 assert.equal(e.addAssetComponent(a.id,"disk",{capaciteGo:500,quantite:0}).success,false);
 assert.equal(e.updateAssetComponent(a.id,"disk","disk-1",{capaciteGo:1000,quantite:1}).success,true);
 assert.equal(e.getAsset(a.id).disks[0].capaciteGo,1000);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
 assert.equal(e.removeAssetComponent(a.id,"disk","disk-1").success,true);
});
test("RAM et disques : ajout, modification, suppression, quantités et restauration",()=>{
 const e=createAssetRegistry();
 const p=installDesktopProfile(e).profile;
 const a=e.createAsset(p.id,{name:"PC-01"}).asset;
 const ram={marque:"Crucial",modele:"SODIMM 3200",type:"DDR4",frequenceMHz:3200,capaciteGo:32,quantite:2};
 const disk={marque:"Crucial",modele:"CT2000T500SSD8",type:"SSD",interface:"NVMe",capaciteGo:2000,quantite:1,numeroSerie:"233643B25DED"};
 assert.equal(e.addAssetComponent(a.id,"ram",{capaciteGo:16,quantite:1}).success,true);
 assert.equal(e.getAsset(a.id).ramModules[0].marque,"");
 assert.equal(e.getAsset(a.id).ramModules[0].modele,"");
 assert.equal(e.removeAssetComponent(a.id,"ram","ram-1").success,true);
 assert.equal(e.addAssetComponent(a.id,"ram",{quantite:1}).success,false);
 assert.equal(e.addAssetComponent(a.id,"ram",{capaciteGo:16,quantite:""}).success,false);
 assert.equal(e.addAssetComponent(a.id,"ram",ram).success,true);
 assert.equal(e.addAssetComponent(a.id,"disk",disk).success,true);
 assert.equal(e.getAsset(a.id).ramModules[0].quantite,2);
 assert.equal(e.getAsset(a.id).disks[0].capaciteGo,2000);
 assert.equal(e.updateAssetComponent(a.id,"ram","ram-1",{...ram,quantite:3}).success,true);
 assert.equal(e.getAsset(a.id).ramModules[0].quantite,3);
 assert.equal(e.addAssetComponent(a.id,"ram",{...ram,quantite:0}).success,false);
 assert.equal(e.addAssetComponent(a.id,"disk",{...disk,capaciteGo:-1}).success,false);
 const save=e.exportState();
 assert.deepEqual(restoreAssetRegistry(save).exportState(),save);
 assert.equal(e.removeAssetComponent(a.id,"ram","ram-1").success,true);
 assert.equal(e.removeAssetComponent(a.id,"disk","disk-1").success,true);
 assert.equal(e.getAsset(a.id).ramModules.length,0);
 assert.equal(e.getAsset(a.id).disks.length,0);
});

test("Isolation informatique : box, switch, écran et profil générique sans inventaire",()=>{
 const e=createAssetRegistry();
 const pc=installDesktopProfile(e).profile;
 const sw=e.createProfile("Switch L2").profile;
 const screen=installScreenProfile(e).profile;
 const swAsset=e.createAsset(sw.id,{name:"SW-01"}).asset;
 const screenAsset=e.createAsset(screen.id,{name:"ECR-01"}).asset;
 const box=e.createBoxComposite("BOX-01").asset;
 const pcAsset=e.createAsset(pc.id,{name:"PC-01"}).asset;
 const saved=e.exportState();
 for(const asset of [swAsset,screenAsset,box]){
  const current=saved.assets.find(a=>a.id===asset.id);
  for(const key of ["processors","ramModules","disks"])
   assert.equal(Object.hasOwn(current,key),false,asset.name+" "+key);
  assert.equal(Object.hasOwn(saved.profiles.find(p=>p.id===asset.profileId),"processorInventory"),false);
  assert.equal(e.addAssetProcessor(asset.id,{quantite:1}).success,false);
  assert.equal(e.addAssetComponent(asset.id,"ram",{capaciteGo:8,quantite:1}).success,false);
 }
 for(const key of ["processors","ramModules","disks"])assert.deepEqual(e.getAsset(pcAsset.id)[key],[]);
 assert.equal(e.getProfile(pc.id).processorInventory,true);
 assert.deepEqual(restoreAssetRegistry(saved).exportState(),saved);
});
test("Anciennes sauvegardes polluées : effacer uniquement les inventaires vides",()=>{
 const e=createAssetRegistry(),pc=installDesktopProfile(e).profile,sw=e.createProfile("Switch").profile;
 const switchAsset=e.createAsset(sw.id,{name:"SW"}).asset;
 const computer=e.createAsset(pc.id,{name:"PC"}).asset;
 assert.equal(e.addAssetComponent(computer.id,"ram",{quantite:2,capaciteGo:16}).success,true);
 const old=e.exportState();
 for(const p of old.profiles)if(p.id===sw.id)p.processorInventory=false;
 for(const asset of old.assets)if(asset.id===switchAsset.id){
  asset.processors=[];asset.ramModules=[];asset.disks=[];
 }
 const restored=restoreAssetRegistry(old);
 const state=restored.exportState();
 const restoredSwitch=state.assets.find(x=>x.id===switchAsset.id);
 for(const key of ["processors","ramModules","disks"])assert.equal(Object.hasOwn(restoredSwitch,key),false);
 assert.equal(Object.hasOwn(state.profiles.find(x=>x.id===sw.id),"processorInventory"),false);
 assert.equal(restored.getAsset(computer.id).ramModules[0].capaciteGo,16);
 assert.deepEqual(restoreAssetRegistry(state).exportState(),state);
 const broken=structuredClone(old);
 broken.assets.find(x=>x.id===switchAsset.id).disks=[{id:"disk-1",capaciteGo:1000,quantite:1}];
 assert.throws(()=>restoreAssetRegistry(broken),/non habilité/);
});
test("Inventaire sur un profil PC activé après création : aller-retour strict",()=>{
 const e=createAssetRegistry(),p=e.createProfile("PC de laboratoire").profile;
 const pc=e.createAsset(p.id,{name:"PC-01"}).asset;
 assert.equal(e.getAsset(pc.id).processors,undefined);
 assert.equal(e.setProfileProcessorInventory(p.id,true).success,true);
 for(const key of ["processors","ramModules","disks"])assert.deepEqual(e.getAsset(pc.id)[key],[]);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
 assert.equal(e.setProfileProcessorInventory(p.id,false).success,true);
 for(const key of ["processors","ramModules","disks"])assert.equal(e.getAsset(pc.id)[key],undefined);
 assert.equal(e.getProfile(p.id).processorInventory,undefined);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
});

test("Renommage PC fixe vers Ordinateur : identité, composants et liens conservés",()=>{
 const e=createAssetRegistry(),p=installDesktopProfile(e).profile;
 const asset=e.createAsset(p.id,{name:"PC-EXISTANT"}).asset;
 assert.equal(e.addAssetProcessor(asset.id,{quantite:1,modele:"Intel"}).success,true);
 assert.equal(e.addAssetComponent(asset.id,"ram",{quantite:2,capaciteGo:16}).success,true);
 assert.equal(e.addAssetComponent(asset.id,"disk",{quantite:1,capaciteGo:512,type:"SSD NVMe"}).success,true);
 const before=e.exportState();
 before.profiles.find(x=>x.id===p.id).name="PC fixe";
 const registry=restoreAssetRegistry(before);
 const migrated=installDesktopProfile(registry);
 assert.equal(migrated.code,"renamed");
 assert.equal(migrated.profile.name,"Ordinateur");
 assert.equal(migrated.profile.id,p.id);
 assert.equal(registry.listProfiles().length,1);
 assert.equal(registry.getAsset(asset.id).profileId,p.id);
 assert.deepEqual(registry.getAsset(asset.id).processors,before.assets[0].processors);
 assert.deepEqual(registry.getAsset(asset.id).ramModules,before.assets[0].ramModules);
 assert.deepEqual(registry.getAsset(asset.id).disks,before.assets[0].disks);
 assert.deepEqual(registry.getAsset(asset.id).ports,before.assets[0].ports);
 assert.deepEqual(registry.exportState().cables,before.cables);
 assert.deepEqual(restoreAssetRegistry(registry.exportState()).exportState(),registry.exportState());
 assert.equal(installDesktopProfile(registry).code,"already_present");
});

test("Type d'ordinateur : ordre de la liste, sélection facultative et compatibilité",()=>{
 const e=createAssetRegistry(),profile=installDesktopProfile(e).profile;
 const f=e.getProfile(profile.id).fields.find(x=>x.key==="type_ordinateur");
 assert.deepEqual(f.options,["PC fixe","Serveur","Smartphone","PC portable","Tout-en-un","Tablette"]);
 assert.equal(f.type,"select");
 const asset=e.createAsset(profile.id,{name:"PC-01"}).asset;
 assert.equal(e.getAsset(asset.id).values.type_ordinateur,null);
 assert.equal(e.setAssetField(asset.id,"type_ordinateur","Smartphone").success,true);
 assert.equal(e.setAssetField(asset.id,"type_ordinateur","inconnu").success,false);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
 const saved=e.exportState();
 saved.profiles[0].fields=saved.profiles[0].fields.filter(x=>x.key!=="type_ordinateur");
 delete saved.assets[0].values.type_ordinateur;
 const old=restoreAssetRegistry(saved);
 const again=installDesktopProfile(old);
 assert.equal(again.code,"already_present");
 assert.equal(old.getAsset(asset.id).id,asset.id);
 assert.equal(old.getAsset(asset.id).values.type_ordinateur,null);
 assert.equal(old.getProfile(profile.id).fields[0].key,"type_ordinateur");
 assert.equal(installDesktopProfile(old).code,"already_present");
 assert.equal(old.getProfile(profile.id).fields.filter(f=>f.key==="type_ordinateur").length,1);
 assert.deepEqual(restoreAssetRegistry(old.exportState()).exportState(),old.exportState());
});

test("Type Ordinateur : ancienne liste remplacée sans perdre de valeur existante",()=>{
 const e=createAssetRegistry(),p=installDesktopProfile(e).profile;
 const a=e.createAsset(p.id,{name:"PC-01"}).asset;
 const prior=e.exportState();
 const field=prior.profiles[0].fields.find(f=>f.key==="type_ordinateur");
 field.options=["PC fixe","PC portable","Smartphone","Tablette","Serveur","PC tout-en-un","Station de travail","NAS","Autre"];
 const restored=restoreAssetRegistry(prior);
 assert.equal(installDesktopProfile(restored).success,true);
 assert.deepEqual(restored.getProfile(p.id).fields.find(f=>f.key==="type_ordinateur").options,computerTypeFieldDefinition.options);
 const incompatible=restoreAssetRegistry(prior);
 assert.equal(incompatible.setAssetField(a.id,"type_ordinateur","Station de travail").success,true);
 assert.equal(installDesktopProfile(incompatible).success,false);
 assert.equal(incompatible.getAsset(a.id).values.type_ordinateur,"Station de travail");
});

test("Interface cellulaire unique 4G/5G/6G : descriptive et compatible",()=>{
 const e=createAssetRegistry(),p=installDesktopProfile(e).profile;
 const pc=e.createAsset(p.id,{name:"PC-CELLULAIRE"}).asset;
 const cell=e.addExtension(pc.id,{type:"cellular",prefix:"CELL",start:1,count:1});
 assert.equal(cell.success,true);
 assert.equal(cell.ports[0].type,"cellular");
 assert.equal(cell.ports[0].medium,"wireless");
 assert.equal(cell.ports[0].connector,null);
 assert.equal(e.addExtension(pc.id,{type:"4g",prefix:"OLD",start:1,count:1}).success,false);
 assert.equal(e.addExtension(pc.id,{type:"5g",prefix:"OLD",start:1,count:1}).success,false);
 assert.equal(e.addExtension(pc.id,{type:"6g",prefix:"OLD",start:1,count:1}).success,false);
 const wifi=e.addExtension(pc.id,{type:"wifi",prefix:"WIFI",start:1,count:1});
 const ethernet=e.addExtension(pc.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 assert.equal(wifi.success,true);assert.equal(ethernet.success,true);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
 const archived=e.exportState();
 archived.assets[0].ports.find(x=>x.type==="cellular").type="5g";
 // Compatibilité d'un profil sauvegardé qui utilisait encore une des anciennes entrées.
 const oldGroup=e.addPortGroup(p.id,{type:"cellular",prefix:"MOBILE",start:1,count:1});
 assert.equal(oldGroup.success,true);
 archived.profiles[0].portGroups.push({...oldGroup.group,type:"4g"});
 const migrated=restoreAssetRegistry(archived);
 assert.equal(migrated.getAsset(pc.id).ports.find(x=>x.name==="CELL01").type,"cellular");
 assert.equal(migrated.getProfile(p.id).portGroups.some(g=>g.type==="4g"),false);
 assert.equal(migrated.getProfile(p.id).portGroups.some(g=>g.type==="cellular"),true);
 assert.equal(migrated.getAsset(pc.id).ports.find(x=>x.name==="LAN01").type,"ethernet-rj45");
 assert.equal(e.removeExtension(pc.id,cell.extensionId).success,true);
 assert.equal(e.getAsset(pc.id).ports.some(x=>x.type==="cellular"),false);
});

test("IPv4 multi-interface Ordinateur : deux adresses persistées et aucune collision locale",()=>{
 const e=createAssetRegistry(),profile=installDesktopProfile(e).profile;
 const pc=e.createAsset(profile.id,{name:"PORTABLE"}).asset;
 const lan=e.addExtension(pc.id,{type:"ethernet-rj45",prefix:"LAN",start:1,count:1});
 const wifi=e.addExtension(pc.id,{type:"wifi",prefix:"WIFI",start:1,count:1});
 assert.equal(lan.success,true);assert.equal(wifi.success,true);
 const config=(address,status="connected")=>({mode:"dhcp",status,address,prefix:24,gateway:"192.168.1.1",dns:["192.168.1.1"]});
 assert.equal(e.setAssetInterfaceIpv4(pc.id,lan.ports[0].id,config("192.168.1.100")).success,true);
 assert.equal(e.setAssetInterfaceIpv4(pc.id,wifi.ports[0].id,config("192.168.1.101")).success,true);
 const v=e.getAsset(pc.id).interfaceIpv4;
 assert.deepEqual(Object.keys(v),[lan.ports[0].id,wifi.ports[0].id]);
 assert.equal(v[lan.ports[0].id].address,"192.168.1.100");
 assert.equal(v[wifi.ports[0].id].address,"192.168.1.101");
 const duplicate=e.setAssetInterfaceIpv4(pc.id,wifi.ports[0].id,config("192.168.1.100"));
 assert.equal(duplicate.code,"duplicate_ipv4");
 assert.equal(e.getAsset(pc.id).interfaceIpv4[wifi.ports[0].id].address,"192.168.1.101");
 const previous=e.exportState();
 assert.deepEqual(restoreAssetRegistry(previous).exportState(),previous);
 assert.equal(e.removeExtension(pc.id,wifi.extensionId).success,true);
 assert.equal(e.getAsset(pc.id).interfaceIpv4[wifi.ports[0].id],undefined);
 assert.equal(e.getAsset(pc.id).interfaceIpv4[lan.ports[0].id].address,"192.168.1.100");
 const box=e.createBoxComposite("BOX-01").asset;
 assert.equal(box.interfaceIpv4,undefined);
 assert.equal(e.setAssetInterfaceIpv4(box.id,box.ports[0].id,config("192.168.1.105")).success,false);
 assert.equal(e.getAsset(box.id).interfaceIpv4,undefined);
});

test("Écran intégré : composant unique, quatre caractéristiques et contrôles",()=>{
 const e=createAssetRegistry(),p=installDesktopProfile(e).profile;
 const a=e.createAsset(p.id,{name:"PORTABLE-01"}).asset;
 assert.equal(e.getAsset(a.id).integratedScreen,undefined);
 assert.equal(e.getProfile(p.id).fields.some(f=>f.key==="ecran_integre"),false);
 const created=e.addAssetComponent(a.id,"screen",{diagonale:15.6,resolution:"1920 × 1080",tactile:false,typeDalle:"IPS"});
 assert.equal(created.success,true);
 assert.deepEqual(e.getAsset(a.id).integratedScreen,{id:"screen-1",diagonale:15.6,resolution:"1920 × 1080",tactile:false,typeDalle:"IPS"});
 assert.equal(e.addAssetComponent(a.id,"screen",{}).code,"screen_exists");
 assert.equal(e.updateAssetComponent(a.id,"screen","screen-1",{resolution:"non valide"}).code,"invalid_screen");
 assert.equal(e.updateAssetComponent(a.id,"screen","screen-1",{diagonale:14,resolution:"2560x1440",tactile:true,typeDalle:"OLED"}).success,true);
 assert.equal(e.getAsset(a.id).integratedScreen.diagonale,14);
 assert.equal(e.listAssets().length,1);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
 assert.equal(e.removeAssetComponent(a.id,"screen","screen-1").success,true);
 assert.equal(e.getAsset(a.id).integratedScreen,undefined);
 assert.equal(e.addAssetComponent(a.id,"screen",{}).success,true);
 assert.deepEqual(restoreAssetRegistry(e.exportState()).exportState(),e.exportState());
});

test("Écran intégré : anciens champs migrés sans perte et sans second équipement",()=>{
 const e=createAssetRegistry(),p=installDesktopProfile(e).profile;
 const a=e.createAsset(p.id,{name:"PC-EXISTANT"}).asset;
 assert.equal(e.addAssetComponent(a.id,"ram",{quantite:2,capaciteGo:8}).success,true);
 const legacy=[
  {key:"ecran_integre",label:"Écran intégré",type:"boolean"},
  {key:"ecran_integre_diagonale",label:"Diagonale",type:"number",unit:"pouces"},
  {key:"ecran_integre_resolution",label:"Résolution",type:"text"},
  {key:"ecran_integre_type_dalle",label:"Type de dalle",type:"select",options:["IPS","TN","VA","OLED","Autre"]},
  {key:"ecran_integre_tactile",label:"Tactile",type:"boolean"},
  {key:"ecran_integre_format_image",label:"Ratio",type:"select",options:["16:9","16:10"]},
  {key:"ecran_integre_forme",label:"Forme",type:"select",options:["Plat","Incurvé"]}
 ];
 for(const f of legacy)assert.equal(e.addField(p.id,f).success,true);
 for(const [key,value] of [["ecran_integre",true],["ecran_integre_diagonale",15.6],
  ["ecran_integre_resolution","1920 × 1080"],["ecran_integre_tactile",false],
  ["ecran_integre_type_dalle","IPS"],["ecran_integre_format_image","16:9"],
  ["ecran_integre_forme","Plat"]])assert.equal(e.setAssetField(a.id,key,value).success,true);
 const old=e.exportState(),restored=restoreAssetRegistry(old);
 assert.equal(installDesktopProfile(restored).success,true);
 const screen=restored.getAsset(a.id).integratedScreen;
 assert.deepEqual(screen,{id:"screen-1",diagonale:15.6,resolution:"1920 × 1080",tactile:false,typeDalle:"IPS"});
 assert.equal(restored.getAsset(a.id).ramModules[0].capaciteGo,8);
 assert.equal(restored.getProfile(p.id).fields.some(f=>f.key.startsWith("ecran_integre")),false);
 assert.equal(restored.listAssets().length,1);
 assert.equal(installDesktopProfile(restored).success,true);
 assert.deepEqual(restoreAssetRegistry(restored.exportState()).exportState(),restored.exportState());
});

test("Écran intégré : validation à la restauration et isolation des équipements",()=>{
 const e=createAssetRegistry(),pc=installDesktopProfile(e).profile,sw=e.createProfile("Switch").profile;
 const a=e.createAsset(pc.id,{name:"PORTABLE"}).asset,b=e.createAsset(sw.id,{name:"SW"}).asset;
 assert.equal(e.addAssetComponent(b.id,"screen",{}).code,"not_supported");
 assert.equal(e.addAssetComponent(a.id,"screen",{typeDalle:"Inconnue"}).code,"invalid_screen");
 assert.equal(e.addAssetComponent(a.id,"screen",{diagonale:-1}).code,"invalid_screen");
 assert.equal(e.addAssetComponent(a.id,"screen",{tactile:"false"}).code,"invalid_screen");
 assert.equal(e.addAssetComponent(a.id,"screen",{}).success,true);
 assert.equal(e.setProfileProcessorInventory(pc.id,false).success,false);
 const saved=e.exportState();saved.assets.find(x=>x.id===a.id).integratedScreen.resolution="abc";
 assert.throws(()=>restoreAssetRegistry(saved),/Écran intégré invalide/);
 assert.equal(e.getAsset(b.id).integratedScreen,undefined);
});

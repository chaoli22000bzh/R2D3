import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {mountBoxAdmin} from "../src/box-admin-ui-v1.js";

const good=r=>assert.equal(r.success,true,JSON.stringify(r));

test("Box bridge lot 1 : défaut, bascule, refus et conservation des réglages",()=>{
 const reg=createAssetRegistry(),created=reg.createBoxComposite("BOX-01");good(created);
 const id=created.asset.id,initial=reg.getAsset(id).boxConfig;
 assert.equal(initial.mode,"router");
 assert.equal(reg.setBoxMode(id,"bad").success,false);
 assert.equal(reg.getAsset(id).boxConfig.mode,"router");
 good(reg.setBoxMode(id,"bridge"));
 const bridge=reg.getAsset(id).boxConfig;
 assert.equal(bridge.mode,"bridge");
 assert.deepEqual(bridge.lan,initial.lan);
 assert.deepEqual(bridge.wifi,initial.wifi);
 assert.deepEqual(bridge.patRules,initial.patRules);
 assert.deepEqual(bridge.internalCableIds,initial.internalCableIds);
 const restored=restoreAssetRegistry(reg.exportState());
 assert.equal(restored.getAsset(id).boxConfig.mode,"bridge");
 good(restored.setBoxMode(id,"router"));
 assert.deepEqual(restored.getAsset(id).boxConfig.lan,initial.lan);
 assert.deepEqual(restored.getAsset(id).boxConfig.wifi,initial.wifi);
});

test("Box bridge lot 1 : migration d'une sauvegarde précédente",()=>{
 const reg=createAssetRegistry(),created=reg.createBoxComposite("BOX-01");good(created);
 const previous=reg.exportState();
 delete previous.assets[0].boxConfig.mode;
 const restored=restoreAssetRegistry(previous);
 assert.equal(restored.getAsset(created.asset.id).boxConfig.mode,"router");
});

test("Box bridge lot 1 : interface d'administration du mode",()=>{
 const reg=createAssetRegistry(),created=reg.createBoxComposite("BOX-01");good(created);
 const handlers=new Map(),root={innerHTML:"",
  addEventListener:(name,fn)=>handlers.set(name,fn),
  removeEventListener:(name)=>handlers.delete(name),
  replaceChildren(){this.innerHTML="";}
 };
 const ui=mountBoxAdmin({root,registry:reg,assetId:created.asset.id});
 assert.match(root.innerHTML,/data-form="box-mode"/);
 assert.match(root.innerHTML,/value="router" selected/);
 const form={dataset:{form:"box-mode"},elements:{namedItem:()=>({value:"bridge"})}};
 handlers.get("submit")({target:{closest:()=>form},preventDefault(){}});
 assert.equal(reg.getAsset(created.asset.id).boxConfig.mode,"bridge");
 assert.match(root.innerHTML,/value="bridge" selected/);
 assert.match(root.innerHTML,/Mode Bridge activé/);
 assert.match(root.innerHTML,/Inactif \(bridge\)/);
 assert.match(root.innerHTML,/LAN 2 à 5 inactifs/);
 ui.destroy();
});

test("Box bridge : onglet LAN et DHCP désactivé, restauration de la case au retour Routeur",()=>{
 const reg=createAssetRegistry(),created=reg.createBoxComposite("BOX-01");good(created);
 const id=created.asset.id,stored=reg.getAsset(id).boxConfig.lan;
 const handlers=new Map(),root={innerHTML:"",
  addEventListener:(event,callback)=>handlers.set(event,callback),
  removeEventListener:(event)=>handlers.delete(event),
  replaceChildren(){this.innerHTML="";}
 };
 const ui=mountBoxAdmin({root,registry:reg,assetId:id});
 const goToLan=()=>handlers.get("click")({target:{closest:selector=>
  selector==="[data-page]"?{dataset:{page:"lan"}}:null}});
 goToLan();
 assert.match(root.innerHTML,/name="enabled" checked/);
 good(reg.setBoxMode(id,"bridge"));ui.render();
 assert.match(root.innerHTML,/<p class="box-feedback" role="status">Serveur DHCP désactivé en mode Bridge/);
 assert.match(root.innerHTML,/<fieldset[^>]* disabled/);
 assert.doesNotMatch(root.innerHTML,/name="enabled" checked/);
 assert.match(root.innerHTML,/type="submit" disabled>Enregistrer LAN et DHCP/);
 const form={dataset:{form:"box-lan"},elements:{namedItem:()=>({value:"",checked:false})}};
 handlers.get("submit")({target:{closest:()=>form},preventDefault(){}});
 assert.deepEqual(reg.getAsset(id).boxConfig.lan,stored);
 good(reg.setBoxMode(id,"router"));ui.render();
 assert.doesNotMatch(root.innerHTML,/<fieldset[^>]* disabled/);
 assert.match(root.innerHTML,/name="enabled" checked/);
 assert.doesNotMatch(root.innerHTML,/type="submit" disabled>Enregistrer LAN et DHCP/);
 ui.destroy();
});

test("Box bridge WAN : l'adresse est présentée comme transmise à LAN 1",()=>{
 const reg=createAssetRegistry(),box=reg.createBoxComposite("BOX-WAN");good(box);
 const handlers=new Map(),root={innerHTML:"",
  addEventListener:(event,cb)=>handlers.set(event,cb),
  removeEventListener:(event)=>handlers.delete(event),
  replaceChildren(){this.innerHTML="";}
 };
 const ui=mountBoxAdmin({root,registry:reg,assetId:box.asset.id});
 const wanTab=()=>handlers.get("click")({target:{closest:selector=>
  selector==="[data-page]"?{dataset:{page:"wan"}}:null}});
 wanTab();
 assert.match(root.innerHTML,/Adresse WAN de la box/);
 good(reg.setBoxMode(box.asset.id,"bridge"));ui.render();
 assert.match(root.innerHTML,/WAN en mode Bridge/);
 assert.match(root.innerHTML,/IPv4 destinée au PC LAN 1/);
 assert.match(root.innerHTML,/Routage et NAT\/PAT/);
 assert.match(root.innerHTML,/<fieldset[^>]* disabled/);
 assert.match(root.innerHTML,/type="submit" class="primary" disabled/);
 const before=reg.getAsset(box.asset.id).boxConfig.wan;
 const form={dataset:{form:"box-wan"},elements:{namedItem:()=>({value:"static"})}};
 handlers.get("submit")({target:{closest:()=>form},preventDefault(){}});
 assert.deepEqual(reg.getAsset(box.asset.id).boxConfig.wan,before);
 good(reg.setBoxMode(box.asset.id,"router"));ui.render();
 assert.match(root.innerHTML,/Adresse WAN de la box/);
 assert.doesNotMatch(root.innerHTML,/<fieldset[^>]* disabled/);
 ui.destroy();
});

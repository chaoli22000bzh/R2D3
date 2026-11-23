import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {mountBoxAdmin} from "../src/box-admin-ui-v1.js";

const good=r=>assert.equal(r.success,true,JSON.stringify(r));
function setup(){
 const registry=createAssetRegistry(),created=registry.createBoxComposite("BOX-01");good(created);
 const handlers=new Map(),root={
  innerHTML:"",
  addEventListener:(event,callback)=>handlers.set(event,callback),
  removeEventListener:(event,callback)=>{if(handlers.get(event)===callback)handlers.delete(event);},
  replaceChildren(){this.innerHTML="";}
 };
 const ui=mountBoxAdmin({root,registry,assetId:created.asset.id});
 const click=dataset=>handlers.get("click")({target:{closest:selector=>
  selector==="[data-page]"&&dataset.page?{dataset:{page:dataset.page}}:
  selector==="[data-action]"&&dataset.action?{dataset:{action:dataset.action}}:null}});
 const change=(selector,value)=>handlers.get("change")({target:{
  value,checked:!!value,matches:q=>q===selector
 }});
 const submit=(name,values)=>{
  const inputs=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{
   value:String(value),checked:!!value
  }]));
  const form={dataset:{form:name},elements:{namedItem:key=>inputs[key]}};
  handlers.get("submit")({target:{closest:q=>q==="form[data-form]"?form:null},preventDefault(){}});
 };
 return {registry,assetId:created.asset.id,root,ui,click,change,submit};
}
test("Box UI 01 : une administration unifiée sans VLAN ni switch administrable",()=>{
 const f=setup();
 assert.match(f.root.innerHTML,/LAN et DHCP/);
 assert.match(f.root.innerHTML,/data-page="wifi"[^>]*>Wi-Fi<\/button>/);
 assert.doesNotMatch(f.root.innerHTML,/data-page="radios"/);
 assert.doesNotMatch(f.root.innerHTML,/data-page="vlan"/);
 assert.match(f.root.innerHTML,/LAN 1 à 6 appartiennent au même réseau/);
 assert.match(f.root.innerHTML,/modem/i);
 f.click({page:"wifi"});
 assert.match(f.root.innerHTML,/data-form="box-ssid"/);
 assert.match(f.root.innerHTML,/data-form="box-radios"/);
 assert.match(f.root.innerHTML,/Interfaces radio/);
 f.ui.destroy();
 assert.equal(f.root.innerHTML,"");
});
test("Box UI 02 : LAN et DHCP enregistrés dans le même actif",()=>{
 const f=setup();f.click({page:"lan"});
 assert.match(f.root.innerHTML,/data-form="box-lan"/);
 f.submit("box-lan",{
  address:"192.168.50.1",prefix:"24",start:"192.168.50.100",
  end:"192.168.50.150",leaseSeconds:"7200",dns1:"1.1.1.1",dns2:"8.8.8.8",enabled:true
 });
 const box=f.registry.getAsset(f.assetId);
 assert.equal(box.boxConfig.lan.address,"192.168.50.1");
 assert.equal(box.boxConfig.lan.pools[0].gateway,"192.168.50.1");
 assert.equal(box.boxConfig.lan.pools[0].leaseSeconds,7200);
 assert.deepEqual(box.boxConfig.lan.pools[0].dns,["1.1.1.1","8.8.8.8"]);
 assert.match(f.root.innerHTML,/enregistrés/);
});
test("Box UI 03 : configuration LAN invalide rejetée",()=>{
 const f=setup();f.click({page:"lan"});
 f.submit("box-lan",{
  address:"192.168.1.1",prefix:"24",start:"10.0.0.100",
  end:"10.0.0.150",leaseSeconds:"3600",dns1:"1.1.1.1",dns2:"",enabled:true
 });
 assert.equal(f.registry.getAsset(f.assetId).boxConfig.lan.address,"192.168.1.1");
 assert.equal(f.registry.getAsset(f.assetId).boxConfig.lan.pools[0].start,"192.168.1.100");
 assert.match(f.root.innerHTML,/invalide/);
});
test("Box UI 04 : SSID ajouté sans VLAN et Wi-Fi désactivable",()=>{
 const f=setup();f.click({page:"wifi"});
 f.click({action:"ssid-add"});
 const box=f.registry.getAsset(f.assetId);
 assert.equal(box.boxConfig.wifi.ssids.length,2);
 assert.equal(box.boxConfig.wifi.ssids[1].enabled,false);
 assert.equal(Object.hasOwn(box.boxConfig.wifi.ssids[1],"vlanNumber"),false);
 f.change("[data-global-wifi]",false);
 assert.equal(f.registry.getAsset(f.assetId).boxConfig.wifi.enabled,false);
});

test("Box UI 05 : SSID et radios ont des enregistrements indépendants sur la même page",()=>{
 const f=setup();f.click({page:"wifi"});
 assert.equal((f.root.innerHTML.match(/data-page=/g)||[]).length,3);
 const original=f.registry.getAsset(f.assetId).boxConfig.wifi;
 f.submit("box-radios",{
  "enabled-2.4":true,"channel-2.4":"6",
  "enabled-5":true,"channel-5":"36",
  "enabled-6":false,"channel-6":"auto"
 });
 const after=f.registry.getAsset(f.assetId).boxConfig.wifi;
 assert.equal(after.radios["2.4"].channel,6);
 assert.equal(after.radios["5"].channel,36);
 assert.deepEqual(after.ssids,original.ssids);
 assert.match(f.root.innerHTML,/data-form="box-ssid"/);
 assert.match(f.root.innerHTML,/data-form="box-radios"/);
});

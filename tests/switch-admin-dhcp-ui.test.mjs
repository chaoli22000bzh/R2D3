import test from "node:test";
import assert from "node:assert/strict";
import {createAssetRegistry} from "../src/asset-profiles.js";
import {addSwitchVlan} from "../src/vlan-v1.js";
import {mountSwitchAdmin} from "../src/switch-admin-ui-v1.js";
import {getSwitchDhcpConfig} from "../src/switch-dhcp-service-v1.js";

test("Interface DHCP L3 : disponibilité, deux DNS, exclusions, réservations et persistance",()=>{
 const registry=createAssetRegistry();
 const p=registry.createProfile("Switch L3").profile;
 assert.equal(registry.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:4}).success,true);
 for(const capability of ["ethernet-switching","vlan","inter-vlan-routing","dhcp-server"])
  assert.equal(registry.setProfileNetworkCapability(p.id,capability,true).success,true);
 const sw=registry.createAsset(p.id,{name:"SW-L3"}).asset;
 assert.equal(addSwitchVlan(registry,sw.id,10,"Compta").success,true);
 const events=new Map();
 const root={innerHTML:"",addEventListener(type,fn){events.set(type,fn);},
  removeEventListener(type){events.delete(type);},contains(){return true;},replaceChildren(){this.innerHTML="";}};
 const view=mountSwitchAdmin({root,registry,assetId:sw.id});
 assert.match(root.innerHTML,/Serveur DHCP/);
 const click=(selector,data)=>{
  const target={dataset:data,closest(query){return query===selector?this:null;}};
  events.get("click")({target});
 };
 click("[data-page]",{page:"dhcp"});
 assert.match(root.innerHTML,/Serveur DHCP local/);
 assert.match(root.innerHTML,/Aucune plage configurée/);
 click("[data-dhcp-new]",{});
 for(const label of ["DNS 1","DNS 2","Exclusions","Réservations","Bail (secondes)"])
  assert.ok(root.innerHTML.includes(label),label);
 const originalFormData=globalThis.FormData;
 globalThis.FormData=class {constructor(form){this.data=form.values;}get(key){return this.data[key]??null;}};
 try{
  const submit=(type,values,action="save")=>{
   const form={dataset:{form:type},values};
   events.get("submit")({target:{closest(query){return query==="form[data-form]"?form:null;}},
    preventDefault(){},submitter:{value:action}});
  };
  submit("dhcp-pool",{
   vlanNumber:"10",start:"192.168.10.100",end:"192.168.10.120",prefix:"24",
   gateway:"192.168.10.1",dns1:"1.1.1.1",dns2:"8.8.8.8",leaseSeconds:"86400",
   exclusions:"192.168.10.105-192.168.10.106",
   reservations:"02-00-00-00-10-01 ; 192.168.10.110"
  });
  const pool=getSwitchDhcpConfig(registry,sw.id).pools[0];
  assert.deepEqual(pool.dns,["1.1.1.1","8.8.8.8"]);
  assert.deepEqual(pool.exclusions,["192.168.10.105","192.168.10.106"]);
  assert.deepEqual(pool.reservations,[{mac:"02-00-00-00-10-01",address:"192.168.10.110"}]);
  assert.equal(pool.leaseSeconds,86400);
  submit("dhcp-service",{enabled:"on"});
  assert.equal(getSwitchDhcpConfig(registry,sw.id).enabled,true);
  submit("dhcp-pool",{},"delete");
  assert.equal(getSwitchDhcpConfig(registry,sw.id).pools.length,1,"cannot delete last pool while enabled");
  submit("dhcp-service",{enabled:null});
  assert.equal(getSwitchDhcpConfig(registry,sw.id).enabled,false);
  submit("dhcp-pool",{},"delete");
  assert.equal(getSwitchDhcpConfig(registry,sw.id).pools.length,0);
 } finally {globalThis.FormData=originalFormData;view.destroy();}
});

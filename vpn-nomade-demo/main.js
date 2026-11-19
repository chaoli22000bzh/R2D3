import {createAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureRemoteVpn} from "../src/router-vpn-remote-v1.js";
import {mountRouterAdmin} from "../src/router-admin-ui-v1.js";
import {mountRemoteVpnClient} from "../src/router-vpn-client-ui-v1.js";
import {createEngine} from "../src/r2d3-core.js";
const $=id=>document.getElementById(id);
let registry,router,pc,server,ports,cables,routerUi,clientUi,dnsEngine;
function cable(a,b){
 const c=registry.createCable().cable;
 for(const [i,p] of [[0,a],[1,b]])if(!registry.connectCableEnd(c.id,i,p).success)throw Error("Câblage impossible");
 return c.id;
}
function addressMap(){return {
 [pc.id]:{address:"203.0.113.20",prefix:24,gateway:"203.0.113.10"},
 [server.id]:{address:"192.168.10.10",prefix:24,gateway:"192.168.10.1"}
};}
function dns(){
 return createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"vpn-integration-dns",
 scenarioVersion:"1.0.0",capabilities:{network:true},objects:[
  {id:"dns-proxy",kind:"ethernet-endpoint",name:"Proxy DNS LAN",ports:[{id:"eth0",type:"rj45"}],
   config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.10.1",prefix:24},
    networkOptions:{gateway:null,dns:["192.168.10.10"]}},runtime:{}},
  {id:"dns-local",kind:"ethernet-endpoint",name:"DNS interne",ports:[{id:"eth0",type:"rj45"}],
   config:{ipv4:{interfaceId:"eth0",mode:"static",address:"192.168.10.10",prefix:24},
    dnsEnabled:true,dnsZone:{domain:"entreprise.test",negativeTtl:60,
     records:[{name:"srv-local.entreprise.test",type:"A",value:"192.168.10.10",ttl:300}]}},runtime:{}}
 ],links:[{id:"dns-cable",kind:"ethernet-cable",connected:true,
  endpoints:[{objectId:"dns-proxy",portId:"eth0"},{objectId:"dns-local",portId:"eth0"}]}]});
}
function status(message){$("lab-state").textContent=message;}
function setup(){
 routerUi?.destroy();clientUi?.destroy();
 registry=createAssetRegistry();
 router=createRouter(registry,{name:"RTR-01",ports:4}).asset;
 const p=registry.createProfile("PC RJ45").profile;
 registry.addPortGroup(p.id,{type:"ethernet-rj45",prefix:"NIC",start:1,count:1});
 pc=registry.createAsset(p.id,{name:"PC-NOMADE"}).asset;
 server=registry.createAsset(p.id,{name:"SRV-LOCAL"}).asset;
 ports={wan:router.ports[0].id,lan:router.ports[1].id};
 cables={wan:cable(pc.ports[0].id,ports.wan),lan:cable(server.ports[0].id,ports.lan)};
 configureRouterPort(registry,router.id,ports.wan,{role:"wan",mode:"static",address:"203.0.113.10",prefix:24});
 configureRouterPort(registry,router.id,ports.lan,{role:"lan",mode:"static",address:"192.168.10.1",prefix:24});
 configureRemoteVpn(registry,router.id,{wanPortId:ports.wan,lanPortId:ports.lan,
  vpnNetwork:"10.8.0.0",vpnPrefix:24,dnsServer:"192.168.10.10",username:"eleve",password:"demo",enabled:true});
 dnsEngine=dns();
 routerUi=mountRouterAdmin({root:$("router-admin"),registry,assetId:router.id,onVpnChange:()=>clientUi?.refresh()});
 clientUi=mountRemoteVpnClient({root:$("vpn-client"),registry,routerId:router.id,clientId:pc.id,
  addresses:addressMap,targetId:server.id,dnsEngine,dnsClientId:"dns-proxy",dnsAssetId:server.id});
 for(const side of ["wan","lan"])$("cut-"+side).textContent="Couper "+side.toUpperCase();
 $("stop-router").textContent="Arrêter routeur";$("stop-server").textContent="Arrêter serveur";
 status("Prêt. Ouvre l'onglet VPN nomade sur le routeur.");
}
for(const [id,device] of [["stop-router","router"],["stop-server","server"]]){
 $(id).addEventListener("click",()=>{
  const a=device==="router"?router:server,old=registry.getAsset(a.id);
  const on=old.status==="En service",next=on?"Hors service":"En service";
  const result=registry.updateAsset(a.id,{status:next});
  if(result.success){
   // La session doit être supprimée pendant la panne, avant tout redémarrage.
   if(device==="router"&&on)clientUi.disconnect();
   clientUi.refresh();routerUi.setAssetId(router.id);
  }
  $(id).textContent=(on?"Redémarrer ":"Arrêter ")+device;
  status((device==="router"?"Routeur":"Serveur")+(on?" arrêté":" redémarré"));
 });
}
for(const side of ["wan","lan"])$("cut-"+side).addEventListener("click",()=>{
 const c=registry.getCable(cables[side]),connected=!!c.ends[1];
 const r=connected?registry.disconnectCableEnd(c.id,1):registry.connectCableEnd(c.id,1,ports[side]);
 if(r.success)$("cut-"+side).textContent=(connected?"Rétablir ":"Couper ")+side.toUpperCase();
 status(r.message||"Liaison modifiée");
});
$("reset").addEventListener("click",setup);
setup();

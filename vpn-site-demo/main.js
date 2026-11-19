import {createAssetRegistry} from "../src/asset-profiles.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureSiteVpn,observeSiteVpnPing,getSiteVpnConfig} from "../src/router-vpn-site-v01.js";
const $=id=>document.getElementById(id);
let registry,a,b,pcA,pcB,links,port,addresses;
function wire(x,y){
 const c=registry.createCable().cable;
 for(const [i,p] of [[0,x],[1,y]])if(!registry.connectCableEnd(c.id,i,p).success)throw Error("Câble invalide");
 return c.id;
}
function initial(){
 registry=createAssetRegistry();
 a=createRouter(registry,{name:"Routeur SITE A",ports:4}).asset;
 b=createRouter(registry,{name:"Routeur SITE B",ports:4}).asset;
 const profile=registry.createProfile("PC LAN").profile;
 registry.addPortGroup(profile.id,{type:"ethernet-rj45",prefix:"NIC",start:1,count:1});
 pcA=registry.createAsset(profile.id,{name:"PC A"}).asset;
 pcB=registry.createAsset(profile.id,{name:"PC B"}).asset;
 port={aw:a.ports[0].id,al:a.ports[1].id,bw:b.ports[0].id,bl:b.ports[1].id};
 links={lanA:wire(pcA.ports[0].id,port.al),wan:wire(port.aw,port.bw),lanB:wire(pcB.ports[0].id,port.bl)};
 for(const [r,id,role,address] of [[a,port.aw,"wan","203.0.113.1"],[a,port.al,"lan","192.168.10.1"],[b,port.bw,"wan","203.0.113.2"],[b,port.bl,"lan","192.168.20.1"]]){
  const done=configureRouterPort(registry,r.id,id,{role,mode:"static",address,prefix:24});
  if(!done.success)throw Error(done.message||"Configuration impossible");
 }
 addresses={[pcA.id]:{address:"192.168.10.10",prefix:24,gateway:"192.168.10.1"},
  [pcB.id]:{address:"192.168.20.10",prefix:24,gateway:"192.168.20.1"}};
 for(const [key,r,wan,lan,peer,remote] of [
  ["a",a,port.aw,port.al,"203.0.113.2","192.168.20.0"],
  ["b",b,port.bw,port.bl,"203.0.113.1","192.168.10.0"]]){
  const result=configureSiteVpn(registry,r.id,{wanPortId:wan,lanPortId:lan,peerAddress:peer,remoteNetwork:remote,remotePrefix:24,enabled:true});
  if(!result.success)throw Error(result.message||"VPN impossible");
  const f=$(key+"-form").elements;
  f.peer.value=peer;f.remote.value=remote;f.prefix.value=24;f.enabled.checked=true;
 }
 for(const name of Object.keys(links))$(name+"-link").textContent="Couper "+(name==="wan"?"WAN":name==="lanA"?"LAN A":"LAN B");
 for(const [key,r] of [["a",a],["b",b]])$(key+"-power").textContent="Arrêter routeur "+key.toUpperCase();
 $("pc-a-gateway").value="192.168.10.1";$("pc-b-gateway").value="192.168.20.1";
 feedback("Prêt : deux routeurs et deux réseaux locaux configurés.");
}
function feedback(message,ok=null){
 $("status").textContent=message;
 $("status").dataset.result=ok===null?"":ok?"ok":"fail";
}
function apply(key){
 const r=key==="a"?a:b,f=$(key+"-form").elements;
 const result=configureSiteVpn(registry,r.id,{wanPortId:port[key+"w"],lanPortId:port[key+"l"],peerAddress:f.peer.value.trim(),remoteNetwork:f.remote.value.trim(),remotePrefix:Number(f.prefix.value),enabled:f.enabled.checked});
 feedback(result.success?"Paramètres VPN du site "+key.toUpperCase()+" enregistrés.":result.message,result.success);
}
function ping(){
 addresses[pcA.id].gateway=$("pc-a-gateway").value.trim();
 addresses[pcB.id].gateway=$("pc-b-gateway").value.trim();
 const result=observeSiteVpnPing(registry,a.id,b.id,pcA.id,pcB.id,addresses);
 feedback(result.success?"Ping PC A vers PC B : réussi.":"Ping PC A vers PC B : échec. "+(result.message||"Réseau inaccessible"),result.success);
}
for(const key of ["a","b"]){
 $(key+"-form").addEventListener("submit",e=>{e.preventDefault();apply(key)});
 $(key+"-power").addEventListener("click",()=>{
  const r=key==="a"?a:b,old=registry.getAsset(r.id),down=old.status==="En service";
  registry.updateAsset(r.id,{status:down?"Hors service":"En service"});
  $(key+"-power").textContent=(down?"Redémarrer":"Arrêter")+" routeur "+key.toUpperCase();
  feedback("Routeur "+key.toUpperCase()+(down?" arrêté.":" redémarré."));
 });
}
for(const [name,end] of [["lanA",1],["wan",1],["lanB",1]]){
 $(name+"-link").addEventListener("click",()=>{
  const c=registry.getCable(links[name]);
  const connected=!!c.ends[end];
  const destination=name==="lanA"?port.al:name==="wan"?port.bw:port.bl;
  const result=connected?registry.disconnectCableEnd(c.id,end):registry.connectCableEnd(c.id,end,destination);
  if(result.success)$(name+"-link").textContent=(connected?"Rétablir ":"Couper ")+(name==="wan"?"WAN":name==="lanA"?"LAN A":"LAN B");
  feedback(result.success?"Liaison "+name+(connected?" coupée.":" rétablie."):(result.message||"Erreur"),result.success);
 });
}
$("test-ping").addEventListener("click",ping);
$("reset").addEventListener("click",initial);
initial();

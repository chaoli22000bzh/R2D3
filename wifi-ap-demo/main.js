import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,getWifiConfig,configureWifiAp,scanWifiNetworks,associateWifiClient} from "../src/wifi-ap-v1.js";
import {createRouter,configureRouterPort} from "../src/router-interfaces-v1.js";
import {configureRouterDhcp} from "../src/router-dhcp-service-v1.js";
import {requestWifiRouterDhcp} from "../src/wifi-dhcp-v1.js";
const $=id=>document.getElementById(id);
let registry,ap,router,client,cableId;
const report=(id,message,good=null)=>{const el=$(id);el.textContent=message;el.dataset.result=good===null?"":good?"ok":"fail";};
function initialize(){
 registry=createAssetRegistry();
 const r=createWifiAccessPoint(registry,{name:"AP-CIEL-01"});
 if(!r.success)throw Error(r.message);
 ap=r.asset;
 const rt=createRouter(registry,{name:"RTR-CIEL",ports:2});
 if(!rt.success)throw Error(rt.message);router=rt.asset;
 const cp=registry.createProfile("Client Wi-Fi simulé").profile;
 registry.addPortGroup(cp.id,{type:"wifi",prefix:"WLAN",start:1,count:1});
 client=registry.createAsset(cp.id,{name:"PC Wi-Fi"}).asset;
 cableId=registry.createCable().cable.id;
 const uplink=ap.ports.find(p=>p.type==="ethernet-rj45");
 const lan=router.ports[1];
 for(const [end,id] of [[0,uplink.id],[1,lan.id]]){
  const link=registry.connectCableEnd(cableId,end,id);
  if(!link.success)throw Error(link.message);
 }
 const ip=configureRouterPort(registry,router.id,lan.id,{role:"lan",mode:"static",address:"192.168.10.1",prefix:24});
 if(!ip.success)throw Error(ip.message);
 const dhcp=configureRouterDhcp(registry,router.id,{enabled:true,pools:[{id:"wifi10",portId:lan.id,
  start:"192.168.10.100",end:"192.168.10.110",prefix:24,gateway:"192.168.10.1",dns:["192.168.10.1"],leaseSeconds:3600}]});
 if(!dhcp.success)throw Error(dhcp.message);
 $("link").textContent="Couper le câble Ethernet";
 $("dhcp-enabled").checked=true;
 $("enabled").checked=true;$("ssid").value="LYCEE-CIEL";$("security").value="wpa2-personal";
 $("password").value="Ciel2026!";$("band").value="5";$("isolated").checked=false;
 $("client-band").value="5";$("client-password").value="Ciel2026!";
 save();
 report("client-status","Client Wi-Fi prêt.");
 report("network-status","Borne reliée par Ethernet au routeur, DHCP actif.");
}
function save(){
 const security=$("security").value,password=security==="open"?"":$("password").value;
 const bands=[$("band").value];
 const ssid={id:"ssid-1",name:$("ssid").value.trim(),enabled:true,security,password,bands,clientIsolation:$("isolated").checked};
 const r=configureWifiAp(registry,ap.id,{enabled:$("enabled").checked,ssids:[ssid]});
 report("ap-status",r.success?"Configuration Wi-Fi enregistrée dans le registre R2D3.":r.message,r.success);
 return r.success;
}
$("save").addEventListener("click",save);
$("reset").addEventListener("click",initialize);
$("scan").addEventListener("click",()=>{
 const networks=scanWifiNetworks(registry,{bands:[$("client-band").value]});
 report("client-status",networks.length?networks.map(n=>n.ssid+" ("+n.security+", "+n.bands.join("/")+" GHz)").join(" ; "):"Aucun SSID compatible détecté.",networks.length>0);
});
$("connect").addEventListener("click",()=>{
 const r=associateWifiClient(registry,{apId:ap.id,ssidId:"ssid-1",password:$("client-password").value,bands:[$("client-band").value]});
 report("client-status",r.message,r.success);
});
$("security").addEventListener("change",()=>{
 if($("security").value==="open")$("password").value="";
});

$("link").addEventListener("click",()=>{
 const cable=registry.getCable(cableId),connected=!!cable.ends[1];
 const r=connected?registry.disconnectCableEnd(cableId,1):registry.connectCableEnd(cableId,1,router.ports[1].id);
 if(!r.success)return report("network-status",r.message,false);
 $("link").textContent=connected?"Rétablir le câble Ethernet":"Couper le câble Ethernet";
 report("network-status",connected?"Câble Ethernet débranché.":"Câble Ethernet raccordé.",!connected);
});
$("dhcp-enabled").addEventListener("change",()=>{
 const a=registry.getAsset(router.id);
 const r=configureRouterDhcp(registry,router.id,{enabled:$("dhcp-enabled").checked,pools:a.dhcpServerConfig.pools});
 report("network-status",r.success?($("dhcp-enabled").checked?"DHCP du routeur activé.":"DHCP du routeur arrêté."):r.message,r.success);
});
$("request-ip").addEventListener("click",()=>{
 const r=requestWifiRouterDhcp({registry,apId:ap.id,routerId:router.id,clientId:client.id,
  password:$("client-password").value,bands:[$("client-band").value]});
 report("network-status",r.success?"Adresse IPv4 : "+r.address+" /"+r.prefix+" ; passerelle "+r.gateway+" ; DNS "+r.dns.join(", "):
  r.address?"Aucun bail DHCP : "+r.address+" ("+r.message+")":r.message,r.success);
});
initialize();

import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp,getWifiConfig} from "../src/wifi-ap-v1.js";
import {updateWifiRoaming} from "../src/wifi-roaming-v1.js";
import {radioSignalAt} from "../src/radio-coverage-core-v1.js";
import {WIFI_CHANNEL_PROFILE} from "../src/wifi-channel-diagnostic-v1.js";
const $=id=>document.getElementById(id);
const registry=createAssetRegistry();
function create(name,x){
 const made=createWifiAccessPoint(registry,{name});
 if(!made.success)throw Error(made.message);
 const id=made.asset.id,config=getWifiConfig(registry,id);
 const saved=configureWifiAp(registry,id,{ssids:[{...config.ssids[0],name:"LYCEE-CIEL",vlanNumber:10,bands:["2.4"]}]});
 if(!saved.success)throw Error(saved.message);
 return {id,name,x,y:25,z:0};
}
const aps=[create("Borne A",24),create("Borne B",96)];
let state={ipv4:"192.168.10.100"},position={x:24,y:25,z:0};
function draw(){
 const canvas=$("canvas"),ctx=canvas.getContext("2d"),scale=6;
 ctx.clearRect(0,0,720,300);
 ctx.fillStyle=getComputedStyle($("map")).backgroundColor;ctx.fillRect(0,0,720,300);
 for(let x=0;x<120;x+=2)for(let y=0;y<50;y+=2){
  const p={x:x+1,y:y+1,z:0};
  const strength=aps.map(ap=>radioSignalAt({transmitter:ap,receiver:p,profile:WIFI_CHANNEL_PROFILE}));
  const yes=strength.map(s=>s.covered);
  ctx.fillStyle=yes[0]&&yes[1]?"rgba(139,102,177,.38)":yes[0]?"rgba(65,145,202,.30)":yes[1]?"rgba(230,171,69,.30)":"rgba(120,120,120,.04)";
  ctx.fillRect(x*scale,y*scale,2*scale,2*scale);
 }
 aps.forEach((ap,i)=>{const x=ap.x*scale,y=ap.y*scale;
  ctx.beginPath();ctx.arc(x,y,17,0,2*Math.PI);ctx.fillStyle=i?"#ac741e":"#236b9a";ctx.fill();
  ctx.lineWidth=state.apId===ap.id?5:2;ctx.strokeStyle=state.apId===ap.id?"#38b67c":"#fff";ctx.stroke();
  ctx.fillStyle="#fff";ctx.font="bold 17px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(i?"B":"A",x,y);
 });
 const x=position.x*scale,y=position.y*scale;
 ctx.beginPath();ctx.arc(x,y+28,11,0,2*Math.PI);ctx.fillStyle="#cf4242";ctx.fill();
 ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();
 ctx.fillStyle="#fff";ctx.font="bold 11px Arial";ctx.fillText("PC",x,y+28);
}
function move(x){
 position={x,y:25,z:0};
 const result=updateWifiRoaming({registry,accessPoints:aps,client:position,previous:state,ssid:"LYCEE-CIEL",bands:["2.4"]});
 if(!result.success){$("result").textContent=result.message;return;}
 state=result;
 const details=result.candidates.map(x=>x.apName+" : "+x.rssi+" dBm").join(" | ");
 $("result").textContent=result.connected?
  "État : "+(result.code==="wifi_roamed"?"Roaming effectué":result.code==="wifi_associated"?"Association initiale":"Association maintenue")+
  "\nBorne associée : "+result.apName+" · BSSID : "+result.bssid+
  "\nSSID : "+result.ssid+" · Bande : "+result.band+" GHz · VLAN : "+result.vlanNumber+
  "\nSignal : "+result.rssi+" dBm ("+result.quality+") · IPv4 : "+(result.ipv4??"non attribuée")+
  "\n"+details+"\n"+result.reason:
  result.reason;
 draw();
}
$("left").onclick=()=>move(24);
$("center").onclick=()=>move(60);
$("right").onclick=()=>move(96);
$("reset").onclick=()=>{state={ipv4:"192.168.10.100"};move(24);};
move(24);

import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,getWifiConfig,configureWifiAp} from "../src/wifi-ap-v1.js";
import {WIFI_RADIO_OPTIONS} from "../src/wifi-radio-config-v1.js";
import {radioSampleGrid,radioSignalAt} from "../src/radio-coverage-core-v1.js";
import {diagnoseWifiChannels,WIFI_CHANNEL_PROFILE} from "../src/wifi-channel-diagnostic-v1.js";
import {resolveWifiAutoChannels} from "../src/wifi-auto-channel-v1.js";
const $=id=>document.getElementById(id);
const WIDTH=140,HEIGHT=55,STEP=2.5;
const receivers=radioSampleGrid({width:WIDTH,height:HEIGHT,step:STEP});
const registry=createAssetRegistry();
const a=createWifiAccessPoint(registry,{name:"Borne A"});
const b=createWifiAccessPoint(registry,{name:"Borne B"});
if(!a.success||!b.success)throw Error("Impossible de créer les bornes.");
const ids=[a.asset.id,b.asset.id];
function populateChannels(){
 const band=$("band").value;
 const channels=WIFI_RADIO_OPTIONS[band].channels;
 for(const id of ["channel-a","channel-b"]){
  const select=$(id),wanted=channels[0];
  select.replaceChildren();
  for(const channel of ["auto",...channels]){
   const opt=document.createElement("option");
   opt.value=String(channel);opt.textContent=channel==="auto"?"Automatique":String(channel);
   select.append(opt);
  }
  select.value=String(wanted);
 }
 for(let i=0;i<ids.length;i++){
  const active=getWifiConfig(registry,ids[i]).radios?.[band]?.enabled;
  $(i===0?"enabled-a":"enabled-b").checked=active??false;
 }
}
function position(index){
 const close=$("layout").value==="near";
 return close
  ?{x:index===0?55:75,y:27.5,z:0}
  :{x:index===0?12:128,y:27.5,z:0};
}
function save(){
 const band=$("band").value;
 for(let i=0;i<ids.length;i++){
  const config=getWifiConfig(registry,ids[i]),radios={...config.radios};
  const selected=$(i===0?"channel-a":"channel-b").value;
  radios[band]={enabled:$(i===0?"enabled-a":"enabled-b").checked,channel:selected==="auto"?"auto":Number(selected)};
  const result=configureWifiAp(registry,ids[i],{radios});
  if(!result.success){$("result").textContent=result.message;return;}
 }
 show();
}
function show(){
 const band=$("band").value;
 const aps=ids.map((id,i)=>({id,name:i===0?"Borne A":"Borne B",...position(i),wifiConfig:getWifiConfig(registry,id)}));
 const ctx=$("canvas").getContext("2d"),scale=5;
 ctx.clearRect(0,0,700,275);
 ctx.fillStyle=getComputedStyle($("map")).backgroundColor;
 ctx.fillRect(0,0,700,275);
 let common=0;
 for(const p of receivers){
  const signal=aps.map(ap=>radioSignalAt({transmitter:ap,receiver:p,profile:WIFI_CHANNEL_PROFILE}));
  const yes=signal.map((s,i)=>aps[i].wifiConfig.radios?.[band]?.enabled===true&&aps[i].wifiConfig.enabled!==false&&s.covered);
  if(yes[0]&&yes[1])common++;
  ctx.fillStyle=yes[0]&&yes[1]?"rgba(140,104,186,.75)":yes[0]?"rgba(59,149,209,.65)":yes[1]?"rgba(230,171,69,.65)":"rgba(120,120,120,.08)";
  ctx.fillRect((p.x-STEP/2)*scale,(p.y-STEP/2)*scale,STEP*scale+.3,STEP*scale+.3);
 }
 ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 15px system-ui,Arial";
 aps.forEach((ap,i)=>{
  const active=ap.wifiConfig.radios?.[band]?.enabled===true;
  const x=ap.x*scale,y=ap.y*scale;
  ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fillStyle=!active?"#777":i===0?"#2673aa":"#b27b20";ctx.fill();
  ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle="#fff";ctx.fillText(i===0?"A":"B",x,y);
  if(!active){ctx.beginPath();ctx.moveTo(x-9,y-9);ctx.lineTo(x+9,y+9);ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();}
 });
 const selection=resolveWifiAutoChannels({accessPoints:aps,receivers,band,profile:WIFI_CHANNEL_PROFILE});
 const resolvedChannels=Object.fromEntries(selection.assignments.map(item=>[item.apId,item.channel]));
 const channelLabel=ap=>{
  const setting=ap.wifiConfig.radios?.[band];
  if(!setting?.enabled)return "désactivée";
  return setting.channel==="auto"
   ?"Automatique → canal "+(resolvedChannels[ap.id]??"indéterminé")
   :"canal "+setting.channel+" (manuel)";
 };
 const channelsText="Borne A : "+channelLabel(aps[0])+" | Borne B : "+channelLabel(aps[1]);
 const diagnosis=diagnoseWifiChannels({accessPoints:aps,receivers,band,profile:WIFI_CHANNEL_PROFILE,resolvedChannels});
 const pair=diagnosis.pairs[0];
 if(!pair){
  const enabled=aps.filter(ap=>ap.wifiConfig.enabled!==false&&ap.wifiConfig.radios?.[band]?.enabled===true);
  $("result").textContent=channelsText+"\n"+(enabled.length===0
   ?"Les deux radios sont désactivées sur "+band+" GHz. Aucune couverture et aucun partage de canal."
   :"Une seule radio est active sur "+band+" GHz. La borne désactivée n'émet pas ; aucun partage de canal entre les deux bornes.");
  $("result").dataset.classification="radio_inactive";
  return;
 }
 $("result").textContent=channelsText+
  "\nPoints de réception couverts par les deux bornes : "+pair.overlapPoints+" / "+pair.totalPoints+
  "\n"+pair.message;
 $("result").dataset.classification=pair.classification;
}
$("band").onchange=()=>{populateChannels();save();};
$("apply").onclick=save;
$("layout").onchange=show;
populateChannels();
save();

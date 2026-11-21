import {createAssetRegistry} from "../src/asset-profiles.js";
import {createWifiAccessPoint,configureWifiAp} from "../src/wifi-ap-v1.js";
import {wifiCoverageAt} from "../src/wifi-radio-coverage-v1.js";
const $=id=>document.getElementById(id),H=3;
let registry,aps,positions,selected=0,armed=true;
const checkpoints=[
 {id:"RDC-01",x:8,y:9,z:0},{id:"RDC-02",x:32,y:9,z:0},{id:"RDC-03",x:55,y:9,z:0},
 {id:"R+1-01",x:8,y:9,z:3},{id:"R+1-02",x:32,y:9,z:3},{id:"R+1-03",x:55,y:9,z:3},
 {id:"R+2-01",x:8,y:9,z:6},{id:"R+2-02",x:32,y:9,z:6},{id:"R+2-03",x:55,y:9,z:6}
];
const initial=[{x:6,y:3,z:0},{x:9,y:5,z:0},{x:5,y:4,z:3}];
function init(){
 registry=createAssetRegistry();aps=[];
 for(let i=0;i<3;i++){
  const created=createWifiAccessPoint(registry,{name:"AP-0"+(i+1)});
  if(!created.success)throw Error(created.message);
  const ap=created.asset;
  const changed=configureWifiAp(registry,ap.id,{ssids:[{
   id:"ssid-1",name:"LYCEE-CIEL",enabled:true,security:"wpa3-personal",password:"Ciel2026!",
   bands:["2.4","5","6"],clientIsolation:false,vlanNumber:10
  }]});
  if(!changed.success)throw Error(changed.message);
  aps.push(ap);
 }
 positions=initial.map(p=>({...p}));selected=0;armed=true;$("selected-ap").value="0";
 $("floor").value="1";$("band").value="5";draw();
}
function currentCoverage(){
 const band=$("band").value;
 return wifiCoverageAt({accessPoints:aps.map((ap,i)=>({
  id:ap.id,enabled:registry.getAsset(ap.id).wifiConfig.enabled,
  bands:registry.getAsset(ap.id).wifiConfig.ssids[0].bands,...positions[i]
 })),checkpoints,bands:[band],floorHeight:H});
}
const pctX=x=>x/64*100,pctY=y=>y/20*100;
function marker(kind,text,x,y,covered,selectedMarker){
 const el=document.createElement("div");el.className=kind+(kind==="client-dot"?(covered?" good":" bad"):(selectedMarker?" selected":""));
 el.style.left=pctX(x)+"%";el.style.top=pctY(y)+"%";el.textContent=text;
 return el;
}
function draw(){
 const floor=Number($("floor").value),plan=$("plan"),coverage=currentCoverage();
 plan.replaceChildren();
 const title=document.createElement("span");title.className="room-label";title.textContent=["Rez-de-chaussée","Premier étage","Deuxième étage"][floor];plan.append(title);
 for(const x of [21,43]){const wall=document.createElement("div");wall.className="wall";wall.style.cssText="left:"+pctX(x)+"%;top:0;height:100%";plan.append(wall)}
 positions.forEach((p,i)=>{
  if(p.z!==floor*H)return;
  plan.append(marker("ap-dot","AP"+(i+1),p.x,p.y,true,i===selected));
 });
 const all=coverage.points;
 for(const point of all.filter(c=>c.position.z===floor*H)){
  const cp=checkpoints.find(c=>c.id===point.id);
  plan.append(marker("client-dot",point.id.split("-").pop(),cp.x,cp.y,point.covered,false));
 }
 const floorPts=all.filter(c=>c.position.z===floor*H);
 const rows=floorPts.map(p=>p.id+": "+(p.covered?"couvert":"NON couvert")+
  (p.best?" ("+aps.find(a=>a.id===p.best.apId)?.name+", "+p.best.rssi+" dBm)":""));
 const report=$("report");
 report.dataset.ok=coverage.allCovered?"yes":"no";
 report.textContent="Bilan du bâtiment : "+coverage.coveredCount+" / "+coverage.totalCount+" points couverts."+
  "\nÉtage affiché : "+floorPts.filter(p=>p.covered).length+" / "+floorPts.length+" points couverts."+
  "\n"+rows.join("\n");
 $("instruction").textContent="AP-0"+(selected+1)+" : clique sur le plan pour déplacer cette borne à l'étage affiché.";
}
$("selected-ap").addEventListener("change",()=>{selected=Number($("selected-ap").value);draw()});
$("floor").addEventListener("change",draw);$("band").addEventListener("change",draw);
$("place").addEventListener("click",()=>{$("instruction").textContent="Clique sur le plan pour placer la borne choisie.";armed=true;});
$("plan").addEventListener("click",e=>{
 if(!armed)return;
 const r=$("plan").getBoundingClientRect();
 positions[selected]={x:Math.max(0,Math.min(64,((e.clientX-r.left)/r.width)*64)),
  y:Math.max(0,Math.min(20,((e.clientY-r.top)/r.height)*20)),z:Number($("floor").value)*H};
 draw();
});
$("reset").addEventListener("click",init);
init();

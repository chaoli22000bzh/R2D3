import {radioCoverageAt,radioSampleGrid} from "../src/radio-coverage-core-v1.js";
const $=id=>document.getElementById(id),NS="http://www.w3.org/2000/svg";
const scenarios={
 offices:{label:"Bureaux sur 3 niveaux",width:60,height:30,levels:3,step:1.5,
  walls:[{x1:0,y1:11,x2:60,y2:11,material:"light"},{x1:0,y1:19,x2:60,y2:19,material:"light"},
   ...[15,30,45].flatMap(x=>[{x1:x,y1:0,x2:x,y2:11,material:"light"},{x1:x,y1:19,x2:x,y2:30,material:"light"}])],
  areas:[{x:0,y:0,width:60,height:30,type:"building",label:"BUREAUX"},{x:0,y:11,width:60,height:8,type:"corridor",label:"COULOIR CENTRAL"}],
  positions:[{x:6,y:5,z:0},{x:9,y:6,z:0},{x:8,y:5,z:3}]},
 workshop:{label:"Atelier et parking",width:120,height:65,levels:1,step:2.5,
  walls:[{x1:0,y1:8,x2:120,y2:8,material:"metal"},{x1:0,y1:45,x2:120,y2:45,material:"metal"},{x1:20,y1:8,x2:20,y2:45,material:"solid"}],
  areas:[{x:0,y:0,width:120,height:8,type:"outdoor",label:"ACCÈS EXTÉRIEUR"},
         {x:0,y:8,width:120,height:37,type:"building",label:"ATELIER"},
         {x:0,y:45,width:120,height:20,type:"parking",label:"PARKING"},
         {x:0,y:8,width:20,height:37,type:"officeWing",label:"BUREAUX"}],
  positions:[{x:12,y:18,z:0},{x:18,y:20,z:0},{x:24,y:18,z:0}]}
};
const profiles={
 neutral:{label:"Radio pédagogique",baseline:-38,decay:24,floorLoss:9},
 wifi:{label:"Wi-Fi (illustration)",baseline:-39,decay:25,floorLoss:9},
 dect:{label:"DECT (illustration)",baseline:-35,decay:22,floorLoss:8},
 cellular:{label:"Réseau mobile (illustration)",baseline:-34,decay:21,floorLoss:8},
 mesh:{label:"Mesh (illustration)",baseline:-39,decay:24,floorLoss:9}
};
let positions=[],scenario;
function reset(){
 scenario=scenarios[$("site").value];positions=scenario.positions.map(p=>({...p}));
 $("floor").replaceChildren();
 for(let i=0;i<scenario.levels;i++){
  const o=document.createElement("option");o.value=i;o.textContent=i===0?"RDC":"R+"+i;$("floor").append(o);
 }
 render();
}
function el(cls,text,x,y){
 const n=document.createElement("div");n.className=cls;n.textContent=text??"";
 n.style.left=x/scenario.width*100+"%";n.style.top=y/scenario.height*100+"%";return n;
}
function planAreas(panel){
 const layer=document.createElement("div");layer.className="area-layer";
 for(const a of scenario.areas){
  const part=document.createElement("div");part.className="area "+a.type;
  part.style.left=a.x/scenario.width*100+"%";
  part.style.top=a.y/scenario.height*100+"%";
  part.style.width=a.width/scenario.width*100+"%";
  part.style.height=a.height/scenario.height*100+"%";
  layer.append(part);
 }
 panel.append(layer);
}
function drawings(panel){
 const drawing=document.createElementNS(NS,"svg");
 drawing.setAttribute("viewBox",`0 0 ${scenario.width} ${scenario.height}`);
 drawing.setAttribute("preserveAspectRatio","none");
 drawing.classList.add("plan-lines");
 const make=(tag,attrs,cls)=>{const n=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))n.setAttribute(key,String(value));
  if(cls)n.setAttribute("class",cls);drawing.append(n);return n;};
 for(const area of scenario.areas){
  if(area.type==="building"||area.type==="officeWing"||area.type==="parking")
   make("rect",{x:area.x,y:area.y,width:area.width,height:area.height},"outline "+area.type);
 }
 for(const wall of scenario.walls)
  make("line",{x1:wall.x1,y1:wall.y1,x2:wall.x2,y2:wall.y2},"partition "+wall.material);
 if(scenario===scenarios.workshop){
  for(let x=6;x<120;x+=10)make("line",{x1:x,y1:48,x2:x,y2:57},"parking-mark");
  make("line",{x1:0,y1:57,x2:120,y2:57},"parking-mark");
 }else{
  make("rect",{x:27,y:12,width:6,height:6},"stairs");
  make("path",{d:"M28 13 L32 13 M28 14 L32 14 M28 15 L32 15 M28 16 L32 16 M28 17 L32 17"},"stair-line");
 }
 panel.append(drawing);
 const captions=document.createElement("div");captions.className="plan-labels";
 for(const a of scenario.areas){
  const posX=a.x+a.width/2,posY=a.y+a.height/2;
  if(a.type==="building"&&scenario===scenarios.offices){captions.append(el("room-title",a.label,8,3));continue;}
  if(a.type==="corridor"){captions.append(el("room-title corridor-title",a.label,7,15));continue;}
  if(a.type==="officeWing"){captions.append(el("room-title",a.label,10,28));continue;}
  if(a.type==="outdoor")continue;
  captions.append(el("room-title",a.label,posX,posY));
 }
 panel.append(captions);
}
function render(){
 const floor=Number($("floor").value),profile=profiles[$("profile").value];
 const site={floorHeight:3,walls:scenario.walls.map(w=>({...w,zMin:0,zMax:scenario.levels*3}))};
 const panel=$("plan");panel.replaceChildren();panel.style.aspectRatio=scenario.width+"/"+scenario.height;
 planAreas(panel);
 const grid=radioSampleGrid({width:scenario.width,height:scenario.height,z:floor*3,step:scenario.step});
 const result=radioCoverageAt({transmitters:positions.map((p,i)=>({...p,id:"E"+(i+1)})),receivers:grid,site,profile});
 const sizes={good:0,weak:0,bad:0};
 const heat=document.createElement("div");heat.className="coverage-layer";
 for(const point of result.points){
  const kind=point.quality==="bonne"?"good":point.quality==="faible"?"weak":"bad";sizes[kind]++;
  const cell=el("cell "+kind,"",point.position.x,point.position.y);
  cell.style.width=scenario.step/scenario.width*101+"%";
  cell.style.height=scenario.step/scenario.height*101+"%";
  heat.append(cell);
 }
 panel.append(heat);
 drawings(panel);
 for(const [i,p] of positions.entries())if(p.z===floor*3)
  panel.append(el("tx"+(Number($("tx-select").value)===i?" selected":""),String(i+1),p.x,p.y));
 $("map-title").textContent=scenario.label;
 $("map-subtitle").textContent="Plan simplifié · couverture radio détaillée";
 $("floor-chip").textContent=floor===0?"RDC":"R+"+floor;
 const percent=Math.round(result.coveredCount/Math.max(1,result.totalCount)*100);
 $("percent").replaceChildren(document.createTextNode(String(percent)),Object.assign(document.createElement("span"),{textContent:"%"}));
 for(const key of ["good","weak","bad"]){
  $("count-"+key).textContent=String(sizes[key]);
  $("bar-"+key).style.width=(sizes[key]/Math.max(1,result.totalCount)*100)+"%";
 }
 $("sample-count").textContent="Points calculés : "+result.totalCount;
 $("report").textContent="Couverture "+percent+" %. "+sizes.good+" points bons, "+sizes.weak+" faibles, "+sizes.bad+" insuffisants.";
 $("details").textContent="Les murs et les parois sont visibles par-dessus la couverture. Profil : "+profile.label+". Modèle pédagogique simplifié.";
}
$("site").onchange=reset;$("profile").onchange=render;$("floor").onchange=render;$("tx-select").onchange=render;
$("reset").onclick=reset;
$("plan").onclick=e=>{
 const r=e.currentTarget.getBoundingClientRect(),i=Number($("tx-select").value);
 positions[i]={x:Math.max(0,Math.min(scenario.width,(e.clientX-r.left)/r.width*scenario.width)),
 y:Math.max(0,Math.min(scenario.height,(e.clientY-r.top)/r.height*scenario.height)),z:Number($("floor").value)*3};
 render();
};
reset();

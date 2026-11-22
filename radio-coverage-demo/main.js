import {radioCoverageAt,radioSampleGrid} from "../src/radio-coverage-core-v1.js";
const $=id=>document.getElementById(id),NS="http://www.w3.org/2000/svg";
const line=(x1,y1,x2,y2,material)=>({x1,y1,x2,y2,material});
function splitHorizontal(y,start,end,openings,material){
 const segments=[];let x=start;
 for(const [left,right] of openings){
  if(left>x)segments.push(line(x,y,left,y,material));x=right;
 }
 if(x<end)segments.push(line(x,y,end,y,material));
 return segments;
}
const officeDoors=[13.5,28.5,43.5,58.5];
const openings=officeDoors.map(x=>[x-1.05,x+1.05]);
const officeWalls=[
 ...splitHorizontal(17,6,66,openings,"light"),
 ...splitHorizontal(25,6,66,openings,"light"),
 ...[21,36,51].flatMap(x=>[line(x,6,x,17,"light"),line(x,25,x,36,"light")]),
 line(6,6,66,6,"solid"),line(6,6,6,36,"solid"),line(66,6,66,36,"solid"),
 ...splitHorizontal(36,6,66,[[34,38]],"solid")
];
const scenarios={
 offices:{label:"Bureaux sur 3 niveaux",width:72,height:42,levels:3,step:0.5,
  walls:officeWalls,
  areas:[
   {x:0,y:0,width:72,height:42,type:"outdoor"},
   {x:6,y:6,width:60,height:30,type:"building",label:"BUREAUX"},
   {x:6,y:17,width:60,height:8,type:"corridor",label:"COULOIR CENTRAL"},
   {x:6,y:36,width:60,height:6,type:"parking",label:"PARKING EXTÉRIEUR"}
  ],
  positions:[{x:12,y:12,z:0},{x:15,y:13,z:0},{x:14,y:12,z:3}]},
 workshop:{label:"Atelier et parking",width:120,height:65,levels:1,step:0.75,
  walls:[line(0,8,120,8,"metal"),line(0,45,120,45,"metal"),line(20,8,20,45,"solid")],
  areas:[
   {x:0,y:0,width:120,height:8,type:"outdoor",label:"ACCÈS EXTÉRIEUR"},
   {x:0,y:8,width:120,height:37,type:"building",label:"ATELIER"},
   {x:0,y:45,width:120,height:20,type:"parking",label:"PARKING"},
   {x:0,y:8,width:20,height:37,type:"officeWing",label:"BUREAUX"}
  ],
  positions:[{x:12,y:18,z:0},{x:18,y:20,z:0},{x:24,y:18,z:0}]}
};
const profiles={
 neutral:{label:"Radio pédagogique",baseline:-38,decay:24,floorLoss:9},
 wifi:{label:"Wi-Fi (illustration)",baseline:-39,decay:25,floorLoss:25,obstacleLoss:{light:5,solid:20,metal:24}},
 dect:{label:"DECT (illustration)",baseline:-35,decay:22,floorLoss:8},
 cellular:{label:"Réseau mobile (illustration)",baseline:-34,decay:21,floorLoss:8},
 mesh:{label:"Mesh (illustration)",baseline:-39,decay:24,floorLoss:9}
};
let positions=[],scenario,selectedId=null,placing=false,nextId=1;
function reset(){
 scenario=scenarios[$("site").value];positions=[];selectedId=null;placing=false;nextId=1;
 $("floor").replaceChildren();
 for(let i=0;i<scenario.levels;i++){
  const option=document.createElement("option");option.value=i;option.textContent=i===0?"RDC":"R+"+i;$("floor").append(option);
 }
 render();
}
function updateControls(){
 const floor=Number($("floor").value);
 const local=positions.filter(p=>p.z===floor*3);
 const select=$("tx-select");
 select.replaceChildren();
 const empty=document.createElement("option");empty.value="";empty.textContent=local.length?"Choisir une borne":"Aucune borne à cet étage";select.append(empty);
 for(const p of local){
  const option=document.createElement("option");option.value=String(p.id);option.textContent="Borne "+p.id;select.append(option);
 }
 if(!local.some(p=>p.id===selectedId))selectedId=null;
 select.value=selectedId===null?"":String(selectedId);
 select.disabled=local.length===0;
 $("remove-tx").disabled=selectedId===null;
 $("add-tx").textContent=placing?"Annuler le placement":"+ Ajouter une borne";
 $("add-tx").setAttribute("aria-pressed",String(placing));
 $("tx-count").textContent=local.length+" borne"+(local.length===1?"":"s")+" sur cet étage · "+positions.length+" au total";
 $("plan").classList.toggle("placing",placing);
 $("instruction").textContent=placing
  ?"Clique sur le plan pour placer la nouvelle borne au niveau affiché."
  :selectedId!==null
   ?"Borne "+selectedId+" sélectionnée. Clique sur le plan pour la déplacer, ou supprime-la."
   :"Clique sur « Ajouter une borne », puis sur le plan pour choisir son emplacement.";
}
function el(cls,text,x,y){
 const n=document.createElement("div");n.className=cls;n.textContent=text??"";
 n.style.left=x/scenario.width*100+"%";n.style.top=y/scenario.height*100+"%";
 return n;
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
function coverageCanvas(panel,points,step){
 const canvas=document.createElement("canvas");canvas.className="coverage-canvas";
 const scale=8;
 canvas.width=Math.ceil(scenario.width*scale);canvas.height=Math.ceil(scenario.height*scale);
 const context=canvas.getContext("2d");
 const colors={bonne:"rgba(53,163,119,.52)",faible:"rgba(221,174,61,.48)",insuffisante:"rgba(200,101,105,.43)"};
 // Bords des cellules alignés sur les pixels réels du canvas :
 // aucun trait de séparation ni chevauchement semi-transparent.
 for(const point of points){
  const x0=Math.round((point.position.x-step/2)*scale);
  const y0=Math.round((point.position.y-step/2)*scale);
  const x1=Math.round((point.position.x+step/2)*scale);
  const y1=Math.round((point.position.y+step/2)*scale);
  context.fillStyle=colors[point.quality];
  context.fillRect(x0,y0,x1-x0,y1-y0);
 }
 panel.append(canvas);
}

function drawings(panel){
 const svg=document.createElementNS(NS,"svg");
 svg.setAttribute("viewBox",`0 0 ${scenario.width} ${scenario.height}`);
 svg.setAttribute("preserveAspectRatio","none");
 svg.classList.add("plan-lines");
 const make=(tag,attrs,cls)=>{const node=document.createElementNS(NS,tag);
  for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
  if(cls)node.setAttribute("class",cls);svg.append(node);return node;};
 for(const a of scenario.areas){
  if(a.type==="building"||a.type==="officeWing"||a.type==="parking")
   make("rect",{x:a.x,y:a.y,width:a.width,height:a.height},"outline "+a.type);
 }
 for(const wall of scenario.walls)
  make("line",{x1:wall.x1,y1:wall.y1,x2:wall.x2,y2:wall.y2},"partition "+wall.material);
 if(scenario===scenarios.offices){
  // Portes des bureaux : vrais passages dans les segments de cloisons.
  for(const x of officeDoors){
   make("path",{d:`M ${x-1.05} 17 v -2.1 A 2.1 2.1 0 0 1 ${x+1.05} 17`},"door");
   make("path",{d:`M ${x+1.05} 25 v 2.1 A 2.1 2.1 0 0 1 ${x-1.05} 25`},"door");
  }
  make("path",{d:"M34 36 V32 A4 4 0 0 1 38 36"},"door entrance");
  // Escalier en U : deux volées, palier, marches et flèches.
  make("rect",{x:32.2,y:18,width:7.6,height:6},"stair-frame");
  make("rect",{x:35.7,y:18.3,width:.6,height:5.4},"stair-divider");
  for(let y=18.8;y<=22.7;y+=.78){
   make("line",{x1:32.6,y1:y,x2:35.35,y2:y},"stair-step");
   make("line",{x1:36.65,y1:y,x2:39.35,y2:y},"stair-step");
  }
  make("path",{d:"M33.85 23 V19.25 l-.65 .85 M33.85 19.25 l.65 .85 M38 19.25 V23 l-.65 -.85 M38 23 l.65 -.85"},"stair-arrow");
  make("rect",{x:32.6,y:23.15,width:6.75,height:.45},"stair-landing");
  // Quelques marquages pour que le parking soit immédiatement identifiable.
  for(let x=10;x<=62;x+=6)make("line",{x1:x,y1:37.5,x2:x,y2:41.3},"parking-mark");
 }else{
  for(let x=6;x<120;x+=10)make("line",{x1:x,y1:48,x2:x,y2:57},"parking-mark");
  make("line",{x1:0,y1:57,x2:120,y2:57},"parking-mark");
 }
 panel.append(svg);
 const labels=document.createElement("div");labels.className="plan-labels";
 if(scenario===scenarios.offices){
  labels.append(el("room-title", "BUREAUX",12,9));
  labels.append(el("room-title corridor-title","COULOIR",12,21));
  labels.append(el("room-title","PARKING",56,39));
  labels.append(el("room-title exterior-title","EXTÉRIEUR",36,3));
 }else{
  for(const a of scenario.areas){
   if(a.type==="outdoor")continue;
   const x=a.type==="officeWing"?10:a.x+a.width/2;
   const y=a.type==="officeWing"?28:a.y+a.height/2;
   labels.append(el("room-title",a.label,x,y));
  }
 }
 panel.append(labels);
}
function render(){
 const floor=Number($("floor").value),profile=profiles[$("profile").value];
 const site={floorHeight:3,walls:scenario.walls.map(w=>({...w,zMin:0,zMax:scenario.levels*3}))};
 const panel=$("plan");panel.replaceChildren();panel.style.aspectRatio=scenario.width+"/"+scenario.height;
 planAreas(panel);
 const receivers=radioSampleGrid({width:scenario.width,height:scenario.height,z:floor*3,step:scenario.step});
 const result=radioCoverageAt({transmitters:positions.map(p=>({...p,id:"E"+p.id})),receivers,site,profile});
 if(positions.length)coverageCanvas(panel,result.points,scenario.step);
 drawings(panel);
 for(const p of positions)if(p.z===floor*3)
  panel.append(el("tx"+(selectedId===p.id?" selected":""),String(p.id),p.x,p.y));
 const counts={good:0,weak:0,bad:0};
 for(const p of result.points)counts[p.quality==="bonne"?"good":p.quality==="faible"?"weak":"bad"]++;
 $("map-title").textContent=scenario.label;
 $("map-subtitle").textContent="Plan simplifié · murs, portes et couverture radio";
 $("floor-chip").textContent=floor===0?"RDC":"R+"+floor;
 const percentage=Math.round(result.coveredCount/Math.max(1,result.totalCount)*100);
 $("percent").replaceChildren(document.createTextNode(String(percentage)),Object.assign(document.createElement("span"),{textContent:"%"}));
 for(const key of ["good","weak","bad"]){
  $("count-"+key).textContent=String(counts[key]);
  $("bar-"+key).style.width=(counts[key]/Math.max(1,result.totalCount)*100)+"%";
 }
 $("sample-count").textContent="Points calculés : "+result.totalCount;
 $("report").textContent="Couverture "+percentage+" %. "+counts.good+" points bons, "+counts.weak+" faibles, "+counts.bad+" insuffisants.";
 $("details").textContent="Les cloisons comportent des passages et les murs extérieurs atténuent la propagation. Profil : "+profile.label+". Modèle pédagogique simplifié.";
 updateControls();
}
$("site").onchange=reset;
$("profile").onchange=render;
$("floor").onchange=()=>{placing=false;selectedId=null;render();};
$("tx-select").onchange=()=>{selectedId=$("tx-select").value?Number($("tx-select").value):null;placing=false;render();};
$("add-tx").onclick=()=>{placing=!placing;selectedId=null;render();};
$("remove-tx").onclick=()=>{
 if(selectedId===null)return;
 positions=positions.filter(p=>p.id!==selectedId);
 selectedId=null;placing=false;render();
};
$("reset").onclick=reset;
$("plan").onclick=e=>{
 const rect=e.currentTarget.getBoundingClientRect();
 const x=Math.max(0,Math.min(scenario.width,(e.clientX-rect.left)/rect.width*scenario.width));
 const y=Math.max(0,Math.min(scenario.height,(e.clientY-rect.top)/rect.height*scenario.height));
 const z=Number($("floor").value)*3;
 if(placing){
  const id=nextId++;positions.push({id,x,y,z});selectedId=id;placing=false;
 }else if(selectedId!==null){
  const p=positions.find(p=>p.id===selectedId&&p.z===z);
  if(!p)return;
  p.x=x;p.y=y;
 }else return;
 render();
};
reset();

import {radioCoverageAt,radioSampleGrid} from "../src/radio-coverage-core-v1.js";
const $=id=>document.getElementById(id);
const scenarios={
 offices:{label:"Bureaux sur 3 niveaux",width:60,height:30,levels:3,step:5,
  walls:[{x1:0,y1:11,x2:60,y2:11,material:"light"},{x1:0,y1:19,x2:60,y2:19,material:"light"},
   ...[15,30,45].flatMap(x=>[{x1:x,y1:0,x2:x,y2:11,material:"light"},{x1:x,y1:19,x2:x,y2:30,material:"light"}])],
  positions:[{x:6,y:5,z:0},{x:9,y:6,z:0},{x:8,y:5,z:3}]},
 workshop:{label:"Atelier et parking",width:120,height:65,levels:1,step:7,
  walls:[{x1:0,y1:6,x2:120,y2:6,material:"metal"},{x1:0,y1:45,x2:120,y2:45,material:"metal"},{x1:20,y1:6,x2:20,y2:45,material:"solid"}],
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
function reset(){scenario=scenarios[$("site").value];positions=scenario.positions.map(p=>({...p}));$("floor").replaceChildren();
 for(let i=0;i<scenario.levels;i++){const o=document.createElement("option");o.value=i;o.textContent=i===0?"RDC":"R+"+i;$("floor").append(o);}
 render();}
function el(cls,text,x,y){const n=document.createElement("div");n.className=cls;n.textContent=text??"";n.style.left=x/scenario.width*100+"%";n.style.top=y/scenario.height*100+"%";return n;}
function render(){
 const floor=Number($("floor").value),profile=profiles[$("profile").value],site={floorHeight:3,walls:scenario.walls.map(w=>({...w,zMin:0,zMax:scenario.levels*3}))};
 const panel=$("plan");panel.replaceChildren();panel.style.aspectRatio=scenario.width+"/"+scenario.height;
 for(const wall of scenario.walls){const dx=wall.x2-wall.x1,dy=wall.y2-wall.y1;
  const n=el("wall "+wall.material,"",wall.x1,wall.y1);n.style.width=Math.hypot(dx,dy)/scenario.width*100+"%";
  n.style.transform="rotate("+Math.atan2(dy/scenario.height,dx/scenario.width)*180/Math.PI+"deg)";
  panel.append(n);
 }
 const grid=radioSampleGrid({width:scenario.width,height:scenario.height,z:floor*3,step:scenario.step});
 const result=radioCoverageAt({transmitters:positions.map((p,i)=>({...p,id:"E"+(i+1)})),receivers:grid,site,profile});
 const sizes={good:0,weak:0,bad:0};
 for(const p of result.points){const kind=p.quality==="bonne"?"good":p.quality==="faible"?"weak":"bad";sizes[kind]++;
  const n=el("cell "+kind,"",p.position.x,p.position.y);n.style.width=scenario.step/scenario.width*98+"%";n.style.height=scenario.step/scenario.height*98+"%";panel.append(n);}
 for(const [i,p] of positions.entries())if(p.z===floor*3)panel.append(el("tx",String(i+1),p.x,p.y));
 $("report").textContent="Zones échantillonnées : "+result.totalCount+" | Bonne : "+sizes.good+" | Faible : "+sizes.weak+" | Non couverte : "+sizes.bad+" | Couverture suffisante : "+Math.round(result.coveredCount/Math.max(1,result.totalCount)*100)+" %";
 $("details").textContent="Profil : "+profile.label+". Valeurs purement pédagogiques. Les obstacles visibles influencent le calcul. Cliquer sur le plan déplace l'émetteur sélectionné.";
}
$("site").onchange=reset;$("profile").onchange=render;$("floor").onchange=render;
$("reset").onclick=reset;
$("plan").onclick=e=>{const r=e.currentTarget.getBoundingClientRect(),i=Number($("tx-select").value);
 positions[i]={x:Math.max(0,Math.min(scenario.width,(e.clientX-r.left)/r.width*scenario.width)),y:Math.max(0,Math.min(scenario.height,(e.clientY-r.top)/r.height*scenario.height)),z:Number($("floor").value)*3};render();};
reset();

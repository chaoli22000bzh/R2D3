/* R2D3 - moteur de couverture radio pedagogique commun.
 * Aucun SSID, protocole, bande ou equipement specifique dans ce module.
 * Coordonnees arbitraires coherentes, obstacles simplifies, sans pretention metrologique.
 */
const finite=p=>p&&[p.x,p.y,p.z??0].every(Number.isFinite);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const defaultLoss={light:5,solid:13,metal:24};
function crossesWall(a,b,w){
 if(!finite(a)||!finite(b)||!w||![w.x1,w.y1,w.x2,w.y2].every(Number.isFinite))return false;
 const za=a.z??0,zb=b.z??0,zmin=w.zMin??-Infinity,zmax=w.zMax??Infinity;
 if(Math.max(za,zb)<zmin||Math.min(za,zb)>zmax)return false;
 const dx=b.x-a.x,dy=b.y-a.y,ex=w.x2-w.x1,ey=w.y2-w.y1;
 const cross=(x,y,u,v)=>x*v-y*u;
 const den=cross(dx,dy,ex,ey);
 if(Math.abs(den)<1e-9)return false;
 const t=cross(w.x1-a.x,w.y1-a.y,ex,ey)/den;
 const u=cross(w.x1-a.x,w.y1-a.y,dx,dy)/den;
 if(t<=0.00001||t>=0.99999||u<0||u>1)return false;
 const z=za+(zb-za)*t;
 return z>=zmin&&z<=zmax;
}
export function radioSignalAt({transmitter,receiver,site={},profile={}}={}){
 if(!finite(transmitter)||!finite(receiver))return {success:false,code:"invalid_position"};
 const floorHeight=site.floorHeight??3;
 if(!Number.isFinite(floorHeight)||floorHeight<=0)return {success:false,code:"invalid_floor_height"};
 const d=dist(transmitter,receiver);
 const floorCount=Math.max(0,Math.floor((Math.abs((transmitter.z??0)-(receiver.z??0))+0.00001)/floorHeight));
 const walls=Array.isArray(site.walls)?site.walls:[];
 const crossed=walls.filter(w=>crossesWall(transmitter,receiver,w));
 const loss=crossed.reduce((n,w)=>n+(profile.obstacleLoss?.[w.material]??defaultLoss[w.material]??8),0);
 const floorLoss=floorCount*(profile.floorLoss??9);
 const baseline=profile.baseline??-38,decay=profile.decay??24;
 const strength=Math.round(clamp(baseline-decay*Math.log10(1+d)-loss-floorLoss,-110,-25));
 const good=profile.goodThreshold??-65,weak=profile.weakThreshold??-79;
 return {success:true,code:"signal_calculated",distance:Math.round(d*10)/10,strength,quality:strength>=good?"bonne":strength>=weak?"faible":"insuffisante",covered:strength>=weak,floors:floorCount,obstacles:crossed.length};
}
export function radioCoverageAt({transmitters=[],receivers=[],site={},profile={}}={}){
 if(!Array.isArray(transmitters)||!Array.isArray(receivers))return {success:false,code:"invalid_inputs"};
 const points=receivers.map(receiver=>{
  const signals=transmitters.filter(t=>t.enabled!==false).map(t=>({...radioSignalAt({transmitter:t,receiver,site,profile}),transmitterId:t.id})).filter(s=>s.success).sort((a,b)=>b.strength-a.strength);
  const best=signals[0]??null;
  return {id:receiver.id,position:{x:receiver.x,y:receiver.y,z:receiver.z??0},quality:best?.quality??"insuffisante",covered:!!best?.covered,best};
 });
 return {success:true,code:"coverage_calculated",points,totalCount:points.length,coveredCount:points.filter(p=>p.covered).length,allCovered:points.length>0&&points.every(p=>p.covered)};
}
export function radioSampleGrid({width,height,z=0,step=8,zones=[]}={}){
 if(![width,height,z,step].every(Number.isFinite)||width<=0||height<=0||step<=0)return [];
 const out=[];
 for(let y=step/2;y<height;y+=step)for(let x=step/2;x<width;x+=step){
  if(zones.length&&!zones.some(q=>x>=q.x&&x<=q.x+q.width&&y>=q.y&&y<=q.y+q.height))continue;
  out.push({id:"p"+out.length,x,y,z});
 }
 return out;
}

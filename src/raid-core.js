/**
 * Calculateur RAID pédagogique indépendant.
 * Capacités en To décimaux (1 To = 10^12 octets), sans métadonnées ni formatage.
 * Convention : les disques actifs sont ramenés à la capacité du plus petit.
 * RAID 1 est un miroir de 2 disques ou plus ; RAID 10 est un stripe de miroirs
 * de 2 disques ; RAID 01 est un miroir de deux groupes stripe égaux.
 */
export const RAID_FORMAT = "raid-configuration";
export const RAID_SCHEMA_VERSION = 1;
const LEVELS = Object.freeze(["0","1","5","6","10","01"]);
const minimum = { "0": 2, "1": 2, "5": 3, "6": 4, "10": 4, "01": 4 };
const own = (o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const object = o=>o!==null && typeof o==="object" && !Array.isArray(o);
const round = n=>Math.round((n+Number.EPSILON)*1e9)/1e9;
const fail = (code,message,field)=>({ok:false,errors:[{code,message,field}]});
const success = value=>({ok:true,value});
function validate(input){
  if(!object(input))return fail("INVALID_CONFIG","La configuration doit être un objet.","configuration");
  if(input.format!==RAID_FORMAT||input.schemaVersion!==RAID_SCHEMA_VERSION)
    return fail("INVALID_VERSION","Format ou version RAID non reconnu.","schemaVersion");
  if(!LEVELS.includes(input.level))return fail("INVALID_LEVEL","Choisis un niveau RAID proposé.","level");
  if(!Array.isArray(input.disks)||input.disks.length>128)return fail("INVALID_DISKS","Indique de 2 à 128 disques.","disks");
  const ids=new Set(),active=[],spares=[];
  for(let i=0;i<input.disks.length;i++){
    const d=input.disks[i];
    if(!object(d)||typeof d.id!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(d.id)||ids.has(d.id))
      return fail("INVALID_DISK_ID","Chaque disque doit avoir un identifiant unique.","disks["+i+"].id");
    ids.add(d.id);
    if(typeof d.capacityTB!=="number"||!Number.isFinite(d.capacityTB)||d.capacityTB<=0||d.capacityTB>1e6)
      return fail("INVALID_CAPACITY","La capacité du disque doit être positive et exprimée en To.","disks["+i+"].capacityTB");
    if(d.role==="active")active.push(d);else if(d.role==="spare")spares.push(d);
    else return fail("INVALID_ROLE","Choisis disque actif ou disque de secours.","disks["+i+"].role");
  }
  if(active.length<minimum[input.level])return fail("TOO_FEW_ACTIVE_DISKS",
    "RAID "+input.level+" nécessite au moins "+minimum[input.level]+" disques actifs.","disks");
  if(["10","01"].includes(input.level)&&active.length%2)
    return fail("EVEN_ACTIVE_DISKS","RAID "+input.level+" nécessite un nombre pair de disques actifs.","disks");
  const minTB=Math.min(...active.map(d=>d.capacityTB));
  if(spares.some(d=>d.capacityTB<minTB))
    return fail("SPARE_TOO_SMALL","Chaque disque de secours doit avoir au moins la capacité du plus petit disque actif.","disks");
  return success({active,spares,minTB});
}
export function calculateRaid(input){
  const v=validate(input);if(!v.ok)return v;
  const {active,spares,minTB}=v.value,n=active.length,level=input.level;
  const factors={"0":n,"1":1,"5":n-1,"6":n-2,"10":n/2,"01":n/2};
  const usable=round(factors[level]*minTB),activeRaw=round(active.reduce((s,d)=>s+d.capacityTB,0));
  const spareRaw=round(spares.reduce((s,d)=>s+d.capacityTB,0));
  const allocated=round(n*minTB),unused=round(activeRaw-allocated),redundancy=round(allocated-usable);
  const groups=level==="10"
    ? Array.from({length:n/2},(_,i)=>[active[i*2].id,active[i*2+1].id])
    : level==="01" ? [active.slice(0,n/2).map(d=>d.id),active.slice(n/2).map(d=>d.id)] : [];
  const tolerance=level==="0"?{guaranteed:0,maximum:0,description:"Une seule panne provoque la perte du volume."}
    : level==="1"?{guaranteed:n-1,maximum:n-1,description:"Le miroir reste accessible tant qu'un disque actif fonctionne."}
    : level==="5"?{guaranteed:1,maximum:1,description:"Une panne de disque actif peut être tolérée."}
    : level==="6"?{guaranteed:2,maximum:2,description:"Deux pannes de disques actifs peuvent être tolérées."}
    : level==="10"?{guaranteed:1,maximum:n/2,description:"Plusieurs pannes sont possibles si elles ne touchent pas les deux disques d'une même paire."}
    : {guaranteed:1,maximum:1,description:"Une panne sur chaque groupe stripe détruit les deux copies du volume."};
  return success({
    format:"raid-result",schemaVersion:1,level,
    units:{capacity:"TB",base:1000,kind:"theoretical"},
    counts:{minimumActive:minimum[level],active:n,spare:spares.length,total:n+spares.length},
    capacitiesTB:{rawTotal:round(activeRaw+spareRaw),rawActive:activeRaw,usable,
      redundancy,unused,spare:spareRaw},
    tolerance,groups,activeDiskIds:active.map(d=>d.id),spareDiskIds:spares.map(d=>d.id)
  });
}
export function assessRaidFailures(input,failedDiskIds){
  const v=calculateRaid(input);if(!v.ok)return v;
  if(!Array.isArray(failedDiskIds)||new Set(failedDiskIds).size!==failedDiskIds.length||
    failedDiskIds.some(id=>typeof id!=="string"||!input.disks.some(d=>d.id===id)))
    return fail("INVALID_FAILURES","Indique des disques défaillants existants, sans doublon.","failedDiskIds");
  const r=v.value,failed=new Set(failedDiskIds);
  const f=r.activeDiskIds.filter(id=>failed.has(id)),count=f.length;
  let available=false;
  if(r.level==="0")available=count===0;
  if(r.level==="1")available=count<r.counts.active;
  if(r.level==="5")available=count<=1;
  if(r.level==="6")available=count<=2;
  if(r.level==="10")available=r.groups.every(g=>g.some(id=>!failed.has(id)));
  if(r.level==="01")available=r.groups.some(g=>g.every(id=>!failed.has(id)));
  return success({available,activeFailures:f,spareFailures:r.spareDiskIds.filter(id=>failed.has(id)),
    degraded:count>0&&available,level:r.level});
}
export function exportRaidConfiguration(input){
  const v=validate(input);if(!v.ok)return v;
  return success(JSON.stringify({format:RAID_FORMAT,schemaVersion:RAID_SCHEMA_VERSION,
    level:input.level,disks:input.disks.map(d=>({id:d.id,capacityTB:d.capacityTB,role:d.role}))}));
}
export function importRaidConfiguration(serialized){
  let value;
  try{value=typeof serialized==="string"?JSON.parse(serialized):serialized;}
  catch{return fail("INVALID_JSON","Le fichier JSON n'est pas valide.","configuration");}
  const v=calculateRaid(value);if(!v.ok)return v;
  return success({format:RAID_FORMAT,schemaVersion:RAID_SCHEMA_VERSION,
    level:value.level,disks:value.disks.map(d=>({id:d.id,capacityTB:d.capacityTB,role:d.role}))});
}

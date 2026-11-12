/* R2D3 : profils descriptifs R2, sans simulation de protocoles. */
const clone=x=>JSON.parse(JSON.stringify(x));
const trim=x=>String(x??"").trim();
const result=(success,code,message,extra={})=>({success,code,message,...extra});
const types=["text","number","boolean","select","date"];
const common=["name","manufacturer","model","serialNumber","status","location","reservable"];
const empty=v=>v===undefined||v===null||v==="";
const cableConnectors=[
 "rj45-male","rj45-female","usb-a-plug","usb-a-socket",
 "usb-b-plug","usb-b-socket","usb-c-plug","usb-c-socket",
 "hdmi-plug","hdmi-socket","vga-male","vga-female",
 "dvi-male","dvi-female","displayport-plug","displayport-socket",
 "mini-displayport-plug","mini-displayport-socket",
 "db9-male","db9-female","db25-male","db25-female",
 "lc-plug","lc-socket","sc-plug","sc-socket"
];
const connectorInfo=code=>{
 const suffix=code?.match(/-(male|female|plug|socket)$/)?.[1];
 return suffix?{family:code.slice(0,-suffix.length-1),gender:suffix}:null;
};
const isCompatible=(cableEnd,portEnd)=>{
 const a=connectorInfo(cableEnd),b=connectorInfo(portEnd);
 return !!a&&!!b&&a.family===b.family&&(
 (a.gender==="male"&&b.gender==="female")||
 (a.gender==="female"&&b.gender==="male")||
 (a.gender==="plug"&&b.gender==="socket")||
 (a.gender==="socket"&&b.gender==="plug")
 );
};
const physicalPortConnector={"ethernet-rj45":"rj45-female","usb-a":"usb-a-socket","usb-c":"usb-c-socket","hdmi":"hdmi-socket"};

const portTypes={
 "ethernet-rj45":{medium:"ethernet",connector:"RJ45"},
 "ethernet-fibre":{medium:"ethernet",connector:"Fibre"},
 "usb-a":{medium:"usb",connector:"USB-A"},
 "usb-c":{medium:"usb",connector:"USB-C"},
 "hdmi":{medium:"video",connector:"HDMI"},
 "wifi":{medium:"wireless",connector:null},
 "bluetooth":{medium:"wireless",connector:null}
};
const portGroupValid=g=>g&&Object.hasOwn(portTypes,g.type)&&/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(g.prefix||"")&&Number.isInteger(g.count)&&g.count>=1&&g.count<=128&&Number.isInteger(g.start)&&g.start>=0&&g.start<=9999;
const portNames=g=>Array.from({length:g.count},(_,i)=>g.prefix+String(g.start+i).padStart(g.digits,"0"));

const fieldValid=f=>f&&/^[a-z][a-z0-9_]*$/.test(f.key||"")&&trim(f.label)&&types.includes(f.type)&&(f.type!=="select"||Array.isArray(f.options)&&f.options.length>0&&f.options.every(x=>typeof x==="string"&&trim(x)));
function valueValid(f,v){
 if(empty(v))return true;
 if(f.type==="text")return typeof v==="string";
 if(f.type==="number")return typeof v==="number"&&Number.isFinite(v);
 if(f.type==="boolean")return typeof v==="boolean";
 if(f.type==="select")return typeof v==="string"&&f.options.includes(v);
 if(f.type==="date")return typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"));
 return false;
}
export function createAssetRegistry(saved){
 const s=saved?clone(saved):{revision:0,nextProfile:1,nextAsset:1,nextPortGroup:1,nextPort:1,nextCable:1,cables:[],nextInfrastructure:1,nextInfrastructurePort:1,wallOutlets:[],racks:[],profiles:[],assets:[]};
 if(!Array.isArray(s.profiles)||!Array.isArray(s.assets)||!Number.isInteger(s.revision)||!Number.isInteger(s.nextProfile)||!Number.isInteger(s.nextAsset))throw Error("État R2 invalide");
 s.nextPortGroup??=1;s.nextPort??=1;s.nextCable??=1;s.cables??=[];
 s.nextInfrastructure??=1;s.nextInfrastructurePort??=1;s.wallOutlets??=[];s.racks??=[];
 for(const p of s.profiles)p.portGroups??=[];
 for(const a of s.assets)a.ports??=[];
 // Les occupations sont déduites de la liste canonique des câbles, jamais d’une seconde source de vérité.
 for(const a of s.assets)for(const p of a.ports)p.connectedCableIds=s.cables.flatMap(c=>c.ends.some(e=>e?.portId===p.id)?[c.id]:[]);
 for(const infra of [...s.wallOutlets,...s.racks])for(const slot of infra.ports)for(const p of [slot.front,slot.back])p.connectedCableIds=s.cables.flatMap(c=>c.ends.some(e=>e?.portId===p.id)?[c.id]:[]);
 const getP=id=>s.profiles.find(x=>x.id===id),getA=id=>s.assets.find(x=>x.id===id);
 const occupied=(id,key)=>s.assets.some(a=>a.profileId===id&&!empty(a.values[key]));
 function createProfile(name){
  name=trim(name);if(!name)return result(false,"invalid_name","Nom de profil obligatoire.");
  const p={id:"profile-"+s.nextProfile++,name,fields:[],portGroups:[]};s.profiles.push(p);s.revision++;
  return result(true,"created","Profil créé.",{profile:clone(p)});
 }
 function duplicateProfile(id,name){
  const p=getP(id);if(!p)return result(false,"not_found","Profil introuvable.");
  const r=createProfile(name||p.name+" (copie)");if(!r.success)return r;
  const target=getP(r.profile.id);target.fields=clone(p.fields);target.portGroups=clone(p.portGroups).map(g=>({...g,id:"portgroup-"+s.nextPortGroup++}));s.revision++;
  return result(true,"duplicated","Profil dupliqué.",{profile:clone(target)});
 }
 function renameProfile(id,name){
  const p=getP(id);if(!p)return result(false,"not_found","Profil introuvable.");
  if(!trim(name))return result(false,"invalid_name","Nom de profil obligatoire.");
  p.name=trim(name);s.revision++;return result(true,"renamed","Profil renommé.");
 }
 function addField(id,raw){
  const p=getP(id);if(!p)return result(false,"not_found","Profil introuvable.");
  const f={key:trim(raw?.key),label:trim(raw?.label),type:raw?.type,unit:trim(raw?.unit)};
  if(raw?.type==="select")f.options=clone(raw.options||[]);
  if(!fieldValid(f)||common.includes(f.key)||p.fields.some(x=>x.key===f.key))return result(false,"invalid_field","Champ invalide ou déjà présent.");
  p.fields.push(f);for(const a of s.assets.filter(a=>a.profileId===id))a.values[f.key]=null;
  s.revision++;return result(true,"field_added","Champ ajouté aux équipements existants.",{field:clone(f)});
 }
 function editField(id,key,patch){
  const p=getP(id),index=p?.fields.findIndex(f=>f.key===key)??-1;
  if(index<0)return result(false,"not_found","Champ introuvable.");
  const changes=patch||{};
  const old=p.fields[index],f={...old,label:changes.label===undefined?old.label:trim(changes.label),type:changes.type??old.type,unit:changes.unit===undefined?old.unit:trim(changes.unit)};
  if(f.type==="select")f.options=changes.options===undefined?old.options:clone(changes.options);
  else delete f.options;
  if(!fieldValid(f))return result(false,"invalid_field","Champ invalide.");
  if(occupied(id,key)&&f.type!==old.type)return result(false,"field_in_use","Vider toutes les valeurs avant de changer le type.");
  if(s.assets.some(a=>a.profileId===id&&!valueValid(f,a.values[key])))return result(false,"field_in_use","Les valeurs existantes sont incompatibles.");
  p.fields[index]=f;s.revision++;return result(true,"field_updated","Champ modifié.");
 }
 function removeField(id,key){
  const p=getP(id),i=p?.fields.findIndex(f=>f.key===key)??-1;
  if(i<0)return result(false,"not_found","Champ introuvable.");
  if(occupied(id,key))return result(false,"field_in_use","Vider toutes les valeurs avant suppression.");
  p.fields.splice(i,1);for(const a of s.assets.filter(x=>x.profileId===id))delete a.values[key];
  s.revision++;return result(true,"field_removed","Champ supprimé.");
 }
 function moveField(id,key,position){
  const p=getP(id),i=p?.fields.findIndex(f=>f.key===key)??-1;
  if(i<0||!Number.isInteger(position)||position<0||position>=p.fields.length)return result(false,"invalid_position","Position incorrecte.");
  const [f]=p.fields.splice(i,1);p.fields.splice(position,0,f);s.revision++;return result(true,"field_moved","Champ déplacé.");
 }

 function addPortGroup(profileId,raw){
  const p=getP(profileId);
  if(!p)return result(false,"not_found","Profil introuvable.");
  const g={type:raw?.type,prefix:trim(raw?.prefix),start:Number(raw?.start),count:Number(raw?.count),digits:Number(raw?.digits??2)};
  if(!portGroupValid(g)||!Number.isInteger(g.digits)||g.digits<1||g.digits>5)return result(false,"invalid_port_group","Type, préfixe ou quantité de ports invalide.");
  const taken=new Set(p.portGroups.flatMap(portNames));
  if(portNames(g).some(name=>taken.has(name)))return result(false,"port_name_exists","Un port porte déjà ce nom dans ce profil.");
  const group={id:"portgroup-"+s.nextPortGroup++,...g};
  p.portGroups.push(group);s.revision++;
  return result(true,"port_group_added","Groupe de ports ajouté au profil pour les futurs équipements.",{group:clone(group)});
 }
 function removePortGroup(profileId,groupId){
  const p=getP(profileId),i=p?.portGroups.findIndex(g=>g.id===groupId)??-1;
  if(i<0)return result(false,"not_found","Groupe de ports introuvable.");
  p.portGroups.splice(i,1);s.revision++;
  return result(true,"port_group_removed","Groupe retiré du profil. Les ports des actifs existants restent inchangés.");
 }
 function buildPorts(groups,origin){
  return groups.flatMap(g=>portNames(g).map(name=>({
   id:"port-"+s.nextPort++,groupId:g.id,name,type:g.type,
   medium:portTypes[g.type].medium,connector:portTypes[g.type].connector,
   origin,connectedCableIds:[]
  })));
 }
 function addExtension(assetId,raw){
  const a=getA(assetId);
  if(!a)return result(false,"not_found","Équipement introuvable.");
  const g={type:raw?.type,prefix:trim(raw?.prefix),start:Number(raw?.start),count:Number(raw?.count),digits:Number(raw?.digits??2)};
  if(!portGroupValid(g)||!Number.isInteger(g.digits)||g.digits<1||g.digits>5)return result(false,"invalid_port_group","Type, préfixe ou quantité invalides.");
  const names=portNames(g),used=new Set(a.ports.map(p=>p.name));
  if(names.some(n=>used.has(n)))return result(false,"port_name_exists","Un port de cet équipement porte déjà ce nom.");
  const extensionId="extension-"+s.nextPortGroup++;
  const ports=buildPorts([{...g,id:extensionId}],"extension");
  a.ports.push(...ports);s.revision++;
  return result(true,"extension_added","Carte ou interface d’extension ajoutée.",{extensionId,ports:clone(ports)});
 }
 function removeExtension(assetId,extensionId){
  const a=getA(assetId);
  if(!a)return result(false,"not_found","Équipement introuvable.");
  const ports=a.ports.filter(p=>p.origin==="extension"&&p.groupId===extensionId);
  if(!ports.length)return result(false,"not_found","Extension introuvable.");
  if(ports.some(p=>p.connectedCableIds?.length))return result(false,"extension_connected","Débrancher les câbles avant de retirer l’extension.");
  a.ports=a.ports.filter(p=>p.groupId!==extensionId);s.revision++;
  return result(true,"extension_removed","Extension retirée.");
 }

 const findPort=portId=>{
  for(const asset of s.assets){
   const port=asset.ports.find(p=>p.id===portId);
   if(port)return {asset,port};
  }
  for(const infrastructure of [...s.wallOutlets,...s.racks])
   for(const slot of infrastructure.ports)
    for(const side of ["front","back"])
     if(slot[side].id===portId)return {infrastructure,slot,side,port:slot[side]};
  return null;
 };
 function makeTermination(name){
  return {id:"termination-"+s.nextInfrastructurePort++,name,type:"ethernet-rj45",connectedCableIds:[]};
 }
 function makeSlot(label){
  return {id:"slot-"+s.nextInfrastructurePort++,label,front:makeTermination("avant"),back:makeTermination("arrière")};
 }
 function createWallOutlet(raw={}){
  const name=trim(raw.name),location=trim(raw.location);
  if(!name||!location)return result(false,"invalid_infrastructure","Nom et lieu obligatoires.");
  if(s.wallOutlets.some(p=>p.location===location&&p.name===name))return result(false,"duplicate_name","Cette prise existe déjà dans ce lieu.");
  const outlet={id:"outlet-"+s.nextInfrastructure++,name,location,ports:[makeSlot(name)]};
  s.wallOutlets.push(outlet);s.revision++;
  return result(true,"outlet_created","Prise murale créée avec terminaison avant et arrière.",{outlet:clone(outlet)});
 }
 function createRack(raw={}){
  const name=trim(raw.name),location=trim(raw.location),count=Number(raw.count),start=Number(raw.start),prefix=trim(raw.prefix??"");
  if(!name||!location||!Number.isInteger(count)||count<1||count>512||
     !Number.isInteger(start)||start<0||start>9999||
     !/^[A-Za-z0-9_-]{0,20}$/.test(prefix)||start+count>10000)
   return result(false,"invalid_infrastructure","Nom, lieu, numérotation ou capacité du panneau incorrects.");
  if(s.racks.some(r=>r.location===location&&r.name===name))return result(false,"duplicate_name","Cette baie existe déjà dans ce lieu.");
  const labels=Array.from({length:count},(_,i)=>prefix+String(start+i));
  const rack={id:"rack-"+s.nextInfrastructure++,name,location,ports:labels.map(makeSlot)};
  s.racks.push(rack);s.revision++;
  return result(true,"rack_created","Baie et panneau de brassage unique créés.",{rack:clone(rack)});
 }

 const cablePoint=(cableId,end)=>s.cables.find(c=>c.id===cableId)?.ends[end]??null;
 const occupiedBy=portId=>s.cables.find(c=>c.ends.some(x=>x?.portId===portId));
 function createCable(raw={}){
  const ends=raw.connectors??["rj45-male","rj45-male"];
  if(!Array.isArray(ends)||ends.length!==2||ends.some(x=>!cableConnectors.includes(x)))
   return result(false,"invalid_connector","Connecteur inconnu. Choisir un connecteur pour chaque extrémité.");
  const c={id:"cable-"+s.nextCable++,connectors:[...ends],ends:[null,null]};
  s.cables.push(c);s.revision++;
  return result(true,"cable_created","Câble créé, ses deux extrémités sont libres.",{cable:clone(c)});
 }
 function connectCableEnd(cableId,end,portId){
  const c=s.cables.find(x=>x.id===cableId),found=findPort(portId);
  if(!c)return result(false,"not_found","Câble introuvable.");
  if(end!==0&&end!==1)return result(false,"invalid_end","Extrémité A ou B attendue.");
  if(!found)return result(false,"not_found","Port introuvable.");
  if(c.ends[end]?.portId===portId)return result(true,"already_connected","Extrémité déjà raccordée.");
  if(c.ends[end])return result(false,"end_connected","Débrancher cette extrémité avant de la raccorder ailleurs.");
  if(c.ends[1-end]?.portId===portId)return result(false,"same_port","Un câble ne peut pas relier un port à lui-même.");
  if(occupiedBy(portId))return result(false,"port_occupied","Ce port possède déjà un câble.");
  const socket=found.infrastructure?"rj45-female":physicalPortConnector[found.port.type];
  if(!socket)return result(false,"unsupported_port","Ce type de port n'a pas encore de connecteur physique défini pour le raccordement.");
  if(!isCompatible(c.connectors[end],socket))
   return result(false,"incompatible_connector","Le connecteur du câble est incompatible avec ce port.");
  c.ends[end]={portId};found.port.connectedCableIds=[c.id];s.revision++;
  return result(true,"connected","Extrémité raccordée.",{cable:clone(c)});
 }
 function disconnectCableEnd(cableId,end){
  const c=s.cables.find(x=>x.id===cableId);
  if(!c)return result(false,"not_found","Câble introuvable.");
  if(end!==0&&end!==1)return result(false,"invalid_end","Extrémité A ou B attendue.");
  if(!c.ends[end])return result(false,"end_free","Extrémité déjà libre.");
  const p=findPort(c.ends[end].portId)?.port;
  if(p)p.connectedCableIds=p.connectedCableIds.filter(x=>x!==c.id);
  c.ends[end]=null;s.revision++;
  return result(true,"disconnected","Extrémité débranchée. Le câble reste inventorié.",{cable:clone(c)});
 }
 function updateCableConnectors(cableId,connectors){
  const c=s.cables.find(x=>x.id===cableId);
  if(!c)return result(false,"not_found","Câble introuvable.");
  if(!Array.isArray(connectors)||connectors.length!==2||connectors.some(x=>!cableConnectors.includes(x)))return result(false,"invalid_connector","Connecteur inconnu.");
  for(let i=0;i<2;i++)if(c.ends[i]){
   const found=findPort(c.ends[i].portId),socket=found?.infrastructure?"rj45-female":physicalPortConnector[found?.port?.type];
   if(!socket||!isCompatible(connectors[i],socket))
    return result(false,"incompatible_connector","Débrancher ou choisir un connecteur compatible avec le port raccordé.");
  }
  c.connectors=[...connectors];s.revision++;
  return result(true,"cable_updated","Connecteurs modifiés.",{cable:clone(c)});
 }
 function deleteCable(cableId){
  const i=s.cables.findIndex(x=>x.id===cableId);
  if(i<0)return result(false,"not_found","Câble introuvable.");
  const c=s.cables[i];for(const end of c.ends){
   if(!end)continue;
   const p=findPort(end.portId)?.port;
   if(p)p.connectedCableIds=p.connectedCableIds.filter(x=>x!==c.id);
  }
  s.cables.splice(i,1);s.revision++;
  return result(true,"cable_deleted","Câble supprimé de l’inventaire.");
 }
 function listCablePoints(){
  return clone([
   ...s.assets.flatMap(a=>a.ports.filter(p=>p.connector!==null).map(p=>({
    portId:p.id,assetId:a.id,assetName:a.name,portName:p.name,portType:p.type,
    socket:physicalPortConnector[p.type]||null,occupied:!!occupiedBy(p.id)
   }))),
   ...[...s.wallOutlets,...s.racks].flatMap(obj=>obj.ports.flatMap(slot=>
    ["front","back"].map(side=>({
     portId:slot[side].id,infrastructureId:obj.id,assetName:obj.name+" ("+obj.location+")",
     portName:slot.label+" / "+(side==="front"?"avant":"arrière"),
     portType:"ethernet-rj45",socket:"rj45-female",occupied:!!occupiedBy(slot[side].id),
     side,slotId:slot.id
    }))
   ))
  ]);
 }
 function createAsset(profileId,info){
  const p=getP(profileId);if(!p)return result(false,"not_found","Profil introuvable.");
  const name=trim(info?.name);if(!name)return result(false,"invalid_name","Nom de matériel obligatoire.");
  const status=info.status||"En service";
  if(!["En service","Hors service","En stock"].includes(status))return result(false,"invalid_status","Statut incorrect.");
  const a={id:"asset-"+s.nextAsset++,profileId,name,manufacturer:trim(info.manufacturer),model:trim(info.model),serialNumber:trim(info.serialNumber),status,location:trim(info.location),reservable:!!info.reservable,values:Object.fromEntries(p.fields.map(f=>[f.key,null])),ports:buildPorts(p.portGroups,"integrated")};
  s.assets.push(a);s.revision++;return result(true,"asset_created","Matériel créé.",{asset:clone(a)});
 }
 function setAssetField(id,key,value){
  const a=getA(id),f=a&&getP(a.profileId)?.fields.find(f=>f.key===key);
  if(!f)return result(false,"not_found","Matériel ou champ introuvable.");
  if(!valueValid(f,value))return result(false,"invalid_value","Type de valeur incorrect.");
  a.values[key]=empty(value)?null:value;s.revision++;return result(true,"value_updated","Valeur enregistrée.");
 }
 function updateAsset(id,info){
  const a=getA(id);if(!a)return result(false,"not_found","Matériel introuvable.");
  if(!info||typeof info!=="object")return result(false,"invalid_asset","Données de matériel invalides.");
  if(info.name!==undefined&&!trim(info.name))return result(false,"invalid_name","Nom obligatoire.");
  if(info.status!==undefined&&!["En service","Hors service","En stock"].includes(info.status))return result(false,"invalid_status","Statut incorrect.");
  for(const key of common)if(info[key]!==undefined)a[key]=key==="reservable"?!!info[key]:trim(info[key]);
  s.revision++;return result(true,"asset_updated","Matériel modifié.");
 }
 return {createProfile,duplicateProfile,renameProfile,addField,editField,removeField,moveField,addPortGroup,removePortGroup,addExtension,removeExtension,createWallOutlet,createRack,createCable,connectCableEnd,disconnectCableEnd,updateCableConnectors,deleteCable,listCablePoints,createAsset,setAssetField,updateAsset,
 listWallOutlets:()=>clone(s.wallOutlets),listRacks:()=>clone(s.racks),listCables:()=>clone(s.cables),getCable:id=>clone(s.cables.find(x=>x.id===id)||null),cableConnectors:()=>[...cableConnectors],listProfiles:()=>clone(s.profiles),listAssets:()=>clone(s.assets),getProfile:id=>clone(getP(id)||null),getAsset:id=>clone(getA(id)||null),exportState:()=>clone(s)};
}
export const restoreAssetRegistry=saved=>createAssetRegistry(saved);

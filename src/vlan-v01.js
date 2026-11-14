/*
 * VLAN L2 V0.1 : comportements pédagogiques Access / Access et Trunk / Trunk.
 * Aucun VLAN natif, routage, STP ou émulation 802.1Q.
 * Les câbles restent exclusivement dans le registre R2.
 */
import {createEngine} from "./r2d3-core.js";

const clone=x=>JSON.parse(JSON.stringify(x));
const fail=(reason,status="unavailable")=>({status,success:false,reason});
const ethernet=p=>p?.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45";
const validNumber=n=>Number.isInteger(n)&&n>=1&&n<=4094;

export function createDefaultVlanSwitchConfig(asset){
 if(!asset||!Array.isArray(asset.ports)||asset.ports.filter(ethernet).length<2)
  throw Error("Switch Ethernet RJ45 à deux ports minimum requis");
 return {
  assetId:asset.id,
  vlans:[{id:"vlan-1",number:1,name:"Défaut"}],
  nextVlanId:2,
  ports:Object.fromEntries(asset.ports.filter(ethernet).map(p=>[p.id,{mode:"access",vlanId:"vlan-1"}]))
 };
}
export function createVlan(config,number,name){
 if(!validNumber(number)||typeof name!=="string"||!name.trim()||config.vlans.some(v=>v.number===number))
  return {success:false,reason:"Numéro de VLAN invalide, déjà utilisé ou nom absent"};
 const next=clone(config),id="vlan-"+next.nextVlanId++;
 next.vlans.push({id,number,name:name.trim()});
 return {success:true,config:next,vlanId:id};
}
export function configureVlanAccess(config,portId,vlanId){
 if(!Object.hasOwn(config.ports,portId)||!config.vlans.some(v=>v.id===vlanId))
  return {success:false,reason:"Port ou VLAN absent sur ce switch"};
 const next=clone(config);next.ports[portId]={mode:"access",vlanId};
 return {success:true,config:next};
}
export function configureVlanTrunk(config,portId,allowedVlanIds){
 if(!Object.hasOwn(config.ports,portId)||!Array.isArray(allowedVlanIds)||!allowedVlanIds.length||
    new Set(allowedVlanIds).size!==allowedVlanIds.length||
    allowedVlanIds.some(id=>!config.vlans.some(v=>v.id===id)))
  return {success:false,reason:"Port ou VLAN autorisés invalides"};
 const next=clone(config);next.ports[portId]={mode:"trunk",allowedVlanIds:[...allowedVlanIds]};
 return {success:true,config:next};
}
function validConfig(asset,c){
 if(!c||c.assetId!==asset.id||!Array.isArray(c.vlans)||!Array.isArray(asset.ports)||
    !c.vlans.some(v=>v.number===1)||!c.ports||typeof c.ports!=="object")return false;
 const ids=new Set(),nums=new Set();
 for(const v of c.vlans){
  if(typeof v.id!=="string"||ids.has(v.id)||!validNumber(v.number)||nums.has(v.number)||!v.name)return false;
  ids.add(v.id);nums.add(v.number);
 }
 const ports=asset.ports.filter(ethernet).map(p=>p.id);
 if(Object.keys(c.ports).length!==ports.length||ports.some(p=>!Object.hasOwn(c.ports,p)))return false;
 return ports.every(p=>{
  const state=c.ports[p];
  return state?.mode==="access"?ids.has(state.vlanId):
   state?.mode==="trunk"&&Array.isArray(state.allowedVlanIds)&&state.allowedVlanIds.length>0&&
   state.allowedVlanIds.every(id=>ids.has(id))&&
   new Set(state.allowedVlanIds).size===state.allowedVlanIds.length;
 });
}

export function observeVlanPing(registry,switchConfigs,sourceId,targetId,addresses){
 if(!registry||["getAsset","listAssets","listCables","listWallOutlets","listPanels","listCablePoints"].some(fn=>typeof registry[fn]!=="function"))
  return fail("Registre R2 invalide");
 if(sourceId===targetId)return fail("Postes source et cible identiques");
 const assets=registry.listAssets(),byAsset=new Map(assets.map(a=>[a.id,a]));
 const source=byAsset.get(sourceId),target=byAsset.get(targetId);
 if(!source||!target)return fail("Poste absent");
 if(source.status!=="En service"||target.status!=="En service")
  return fail("Poste hors service","ok");
 const sources=[source,target].map(a=>a.ports.filter(ethernet));
 if(sources.some(p=>p.length!==1))return fail("V0.1 : un port Ethernet par poste");
 if(!addresses?.[sourceId]||!addresses?.[targetId])return fail("IPv4 absente");
 if(!switchConfigs||typeof switchConfigs!=="object")return fail("Configuration VLAN absente");

 const activeSwitches=new Map();
 for(const asset of assets){
  if(asset.networkCapabilities?.includes("ethernet-switching")&&Object.hasOwn(switchConfigs,asset.id)){
   if(!validConfig(asset,switchConfigs[asset.id]))return fail("Configuration VLAN invalide sur "+asset.name);
   if(asset.status==="En service")activeSwitches.set(asset.id,switchConfigs[asset.id]);
  }
 }
 for(const id of Object.keys(switchConfigs))
  if(!activeSwitches.has(id)&&byAsset.get(id)?.status==="En service")
   return fail("Switch non autorisé ou sans capacité Ethernet : "+id);
 const terminal=new Map();
 for(const asset of assets){
  for(const port of asset.ports.filter(ethernet)){
   terminal.set(port.id,{asset,port,config:activeSwitches.get(asset.id)});
  }
 }
 // Graphe de câbles et de traversées passives uniquement : jamais de passage implicite dans un switch.
 const points=registry.listCablePoints().filter(p=>p.portType==="ethernet-rj45");
 const neighbors=new Map(points.map(p=>[p.portId,new Set()]));
 const wire=(a,b)=>{if(neighbors.has(a)&&neighbors.has(b)){neighbors.get(a).add(b);neighbors.get(b).add(a);}};
 for(const c of registry.listCables())
  if(c.ends[0]?.portId&&c.ends[1]?.portId)wire(c.ends[0].portId,c.ends[1].portId);
 for(const infra of [...registry.listWallOutlets(),...registry.listPanels()])
  for(const slot of infra.ports)wire(slot.front.id,slot.back.id);

 const graph=new Map(),add=(a,b)=>{
  if(!graph.has(a))graph.set(a,new Set());
  if(!graph.has(b))graph.set(b,new Set());
  graph.get(a).add(b);graph.get(b).add(a);
 };
 const node=e=>e.config?null:"pc:"+e.asset.id;
 const vlannode=(e,vlanId)=>"vlan:"+e.asset.id+":"+vlanId;
 let unsupported=false;
 const seen=new Set();
 for(const start of neighbors.keys()){
  if(seen.has(start))continue;
  const queue=[start],ends=[];seen.add(start);
  for(let i=0;i<queue.length;i++){
   const id=queue[i];
   if(terminal.has(id))ends.push(terminal.get(id));
   for(const next of neighbors.get(id))
    if(!seen.has(next)){seen.add(next);queue.push(next);}
  }
  if(ends.length>2){unsupported=true;continue;}
  if(ends.length!==2)continue;
  const [a,b]=ends;
  if([a,b].some(e=>e.asset.status!=="En service"))continue;
  const pa=a.config?.ports[a.port.id],pb=b.config?.ports[b.port.id];
  if(!pa&&!pb){add(node(a),node(b));continue;}
  if(!pa&&pb||pa&&!pb){
   const host=pa?b:a,port=pa?pa:pb,sw=pa?a:b;
   if(port.mode!=="access"){unsupported=true;continue;}
   add(node(host),vlannode(sw,port.vlanId));continue;
  }
  if(pa.mode==="access"&&pb.mode==="access"){
   // Des VLAN locaux de numéros différents peuvent être réunis par un lien non étiqueté.
   add(vlannode(a,pa.vlanId),vlannode(b,pb.vlanId));
  }else if(pa.mode==="trunk"&&pb.mode==="trunk"){
   for(const va of pa.allowedVlanIds){
    const number=a.config.vlans.find(v=>v.id===va).number;
    const vb=pb.allowedVlanIds.find(id=>b.config.vlans.find(v=>v.id===id)?.number===number);
    if(vb)add(vlannode(a,va),vlannode(b,vb));
   }
  }else unsupported=true;
 }
 if(unsupported)return fail("Montage VLAN non simulé en V0.1 (Access/Trunk ou topologie complexe)");
 const first="pc:"+sourceId,last="pc:"+targetId;
 const reached=new Set([first]),queue=[first];
 for(let i=0;i<queue.length&&!reached.has(last);i++)
  for(const neighbor of graph.get(queue[i])||[])
   if(!reached.has(neighbor)){reached.add(neighbor);queue.push(neighbor);}
 const connected=reached.has(last);

 // Réutiliser les règles IP du Core ; la liaison n'est qu'une observation dérivée.
 const objects=[source,target].map((asset,i)=>({
  id:asset.id,name:asset.name,kind:"vlan-v01-endpoint",
  ports:[{id:sources[i][0].id,type:"rj45"}],
  config:{ipv4:{interfaceId:sources[i][0].id,mode:"static",
    address:addresses[asset.id].address,prefix:addresses[asset.id].prefix}},
  runtime:{}
 }));
 const scenario={format:"r2d3-scenario",schemaVersion:1,scenarioId:"vlan-v01",
  scenarioVersion:"0.1.0",capabilities:{network:true},objects,
  links:connected?[{id:"derived-vlan-domain",kind:"ethernet-cable",
   endpoints:objects.map(o=>({objectId:o.id,portId:o.ports[0].id})),connected:true}]:[]};
 try{return createEngine(scenario).query({type:"network.ping",sourceId,targetId});}
 catch{return fail("Configuration IPv4 non valide");}
}

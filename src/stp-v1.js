/*
 * STP V1 : calcul de chemins L2 dérivés du registre R2.
 * Recalcule la forêt sans persister de ports bloqués. Les VLAN sont des
 * domaines indépendants pour cette convention pédagogique simplifiée.
 * Aucune BPDU, élection de root bridge ni convergence temporisée.
 * Portée : RJ45, câbles directs, ports Access/Access ou Trunk/Trunk.
 */
import {createEngine} from "./r2d3-core.js";
const error=(reason,status="unavailable")=>({status,success:false,reason});
const ethernet=p=>p?.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45";
const live=a=>a?.status==="En service";
const switcher=a=>a?.networkCapabilities?.includes("ethernet-switching");
const managed=a=>a?.networkCapabilities?.includes("vlan");
const compare=(a,b)=>String(a).localeCompare(String(b),"en");
const ordered=(a,b)=>compare(a,b)<=0?[a,b]:[b,a];
function configurePort(asset,portId){
 if(!managed(asset))return {mode:"access",vlans:[1],unmanaged:true};
 const config=asset.vlanConfig,state=config?.ports?.[portId];
 if(!state)return null;
 const number=id=>config.vlans.find(v=>v.id===id)?.number;
 if(state.mode==="access"){
  const v=number(state.vlanId);
  return v?{mode:"access",vlans:[v]}:null;
 }
 if(state.mode==="trunk"){
  const nums=state.allowedVlanIds?.map(number);
  return Array.isArray(nums)&&nums.length&&nums.every(Number.isInteger)?
   {mode:"trunk",vlans:nums}:null;
 }
 return null;
}
function ipv4Ping(source,target,addresses,connected){
 const src=addresses?.[source.id],dst=addresses?.[target.id];
 if(!src||!dst)return error("Adresse IPv4 absente");
 const ports=[source,target].map(a=>a.ports.filter(ethernet)[0]);
 const objects=[source,target].map((a,i)=>({
  id:a.id,name:a.name,kind:"ethernet-endpoint",
  ports:[{id:ports[i].id,type:"rj45"}],
  config:{ipv4:{interfaceId:ports[i].id,mode:"static",
   address:addresses[a.id].address,prefix:addresses[a.id].prefix}},
  runtime:{}
 }));
 const scenario={format:"r2d3-scenario",schemaVersion:1,scenarioId:"stp-v1",
  scenarioVersion:"1.0.0",capabilities:{network:true},objects,
  links:connected?[{id:"derived-stp-path",kind:"ethernet-cable",
   endpoints:objects.map(o=>({objectId:o.id,portId:o.ports[0].id})),connected:true}]:[]};
 try{return createEngine(scenario).query({type:"network.ping",sourceId:source.id,targetId:target.id});}
 catch{return error("Configuration IPv4 non prise en charge");}
}
/*
 * L'observation peut porter sur n'importe quel VLAN commun aux ports des
 * postes ; jamais sur un VLAN arbitrairement choisi pour rendre un ping réussi.
 * Retourne aussi la liste des câbles bloqués logiquement pour ce VLAN.
 */
export function observeStpV1(registry,sourceId,targetId,addresses){
 if(!registry||["getAsset","listAssets","listCables"].some(k=>typeof registry[k]!=="function"))
  return error("Registre R2 indisponible");
 if(sourceId===targetId)return error("Deux postes distincts requis");
 const source=registry.getAsset(sourceId),target=registry.getAsset(targetId);
 if(!source||!target||switcher(source)||switcher(target))
  return error("Deux équipements clients RJ45 sont requis");
 const sourcePorts=source.ports?.filter(ethernet)||[],targetPorts=target.ports?.filter(ethernet)||[];
 if(sourcePorts.length!==1||targetPorts.length!==1)
  return error("Un port RJ45 par équipement client requis");
 if(!live(source)||!live(target))
  return {status:"ok",success:false,reason:"Poste hors service",blockedCableIds:[]};
 const assets=registry.listAssets();
 const ports=new Map(assets.flatMap(a=>a.ports.filter(ethernet).map(p=>[p.id,{asset:a,port:p}])));
 const cables=registry.listCables().filter(c=>c.ends?.[0]?.portId&&c.ends?.[1]?.portId)
  .map(c=>({id:c.id,a:ports.get(c.ends[0].portId),b:ports.get(c.ends[1].portId)}))
  .filter(c=>c.a&&c.b&&live(c.a.asset)&&live(c.b.asset));
 // Les équipements intermédiaires non commutateurs sont hors périmètre.
 const hostCables=cables.filter(c=>!switcher(c.a.asset)||!switcher(c.b.asset));
 const attachment=id=>hostCables.filter(c=>c.a.asset.id===id||c.b.asset.id===id);
 const srcLinks=attachment(sourceId),dstLinks=attachment(targetId);
 if(srcLinks.length!==1||dstLinks.length!==1)return error("Postes reliés directement chacun à un port de switch");
 const attachSwitch=c=>switcher(c.a.asset)&&!switcher(c.b.asset)?c.a:
  switcher(c.b.asset)&&!switcher(c.a.asset)?c.b:null;
 const srcSwitch=attachSwitch(srcLinks[0]),dstSwitch=attachSwitch(dstLinks[0]);
 if(!srcSwitch||!dstSwitch)return error("Raccordement client vers switch requis");
 // Eviter qu'une liaison client-client ou une dérivation parasite soit utilisée.
 if(hostCables.some(c=>!attachSwitch(c)))return error("Montage avec liaisons clientes non pris en charge");
 const sPort=configurePort(srcSwitch.asset,srcSwitch.port.id);
 const tPort=configurePort(dstSwitch.asset,dstSwitch.port.id);
 if(!sPort||!tPort||sPort.mode!=="access"||tPort.mode!=="access")
  return error("Les ports des postes doivent être en Access");
 const srcVlan=sPort.vlans[0],dstVlan=tPort.vlans[0];
 const switches=new Map(assets.filter(a=>switcher(a)&&live(a)).map(a=>[a.id,a]));
 const edges=[];
 for(const c of cables){
  if(!switcher(c.a.asset)||!switcher(c.b.asset))continue;
  const pa=configurePort(c.a.asset,c.a.port.id),pb=configurePort(c.b.asset,c.b.port.id);
  if(!pa||!pb)return error("Configuration des ports de switch invalide");
  if(pa.mode!==pb.mode)return error("Montage Access/Trunk non garanti en STP V1");
  if(pa.mode==="access"){
   if(!pa.unmanaged&&!pb.unmanaged&&pa.vlans[0]!==pb.vlans[0]){
    // Access/Access de numéros locaux distincts peut être communicant,
    // mais cette convention n'est pas intégrée à la recette STP V1.
    return error("Access/Access de VLAN différents hors recette STP V1");
   }
  }
  const common=pa.vlans.filter(n=>pb.vlans.includes(n));
  if(!common.length)continue;
  edges.push({...c,vlans:common});
 }
 if(srcVlan!==dstVlan)return {
  status:"ok",success:false,reason:"Postes isolés dans des VLAN différents",
  vlan:srcVlan,loop:false,storm:false,blockedCableIds:[],loopCableIds:[]
 };
 const vlan=srcVlan;
 const domainEdges=edges.filter(e=>e.vlans.includes(vlan)).sort((a,b)=>compare(a.id,b.id));
 const neighbors=new Map([...switches.keys()].map(id=>[id,new Set()]));
 for(const e of domainEdges){
  neighbors.get(e.a.asset.id)?.add(e.b.asset.id);
  neighbors.get(e.b.asset.id)?.add(e.a.asset.id);
 }
 const reachable=new Set([srcSwitch.asset.id]),queue=[srcSwitch.asset.id];
 for(let i=0;i<queue.length;i++){
  for(const nxt of neighbors.get(queue[i])||[])if(!reachable.has(nxt)){
   reachable.add(nxt);queue.push(nxt);
  }
 }
 const component=domainEdges.filter(e=>reachable.has(e.a.asset.id)&&reachable.has(e.b.asset.id));
 const involved=[...reachable].map(id=>switches.get(id));
 const protection=involved.every(managed);
 // Une forêt déterministe suffit pour l'exercice. Les liens conservés
 // s'ordonnent par identifiant, sans prétendre simuler une élection STP.
 const parent=new Map([...reachable].map(id=>[id,id]));
 function find(x){while(parent.get(x)!==x){x=parent.get(x)}return x;}
 const union=(a,b)=>{const x=find(a),y=find(b);if(x===y)return false;parent.set(y,x);return true;};
 const blocked=[],cycles=[];
 for(const e of component){
  if(!union(e.a.asset.id,e.b.asset.id)){
   cycles.push(e.id);
   if(protection)blocked.push(e.id);
  }
 }
 const loop=cycles.length>0,storm=loop&&!protection;
 if(storm)return {
  status:"ok",success:false,reason:"Tempête de broadcast simulée : boucle sans protection STP",
  vlan,loop,storm:true,stpActive:false,loopCableIds:cycles,
  blockedCableIds:[],sourceSwitchId:srcSwitch.asset.id,targetSwitchId:dstSwitch.asset.id
 };
 const activeEdges=component.filter(e=>!blocked.includes(e.id));
 const used=new Set([srcSwitch.asset.id]),work=[srcSwitch.asset.id];
 for(let i=0;i<work.length;i++)for(const e of activeEdges){
  const a=e.a.asset.id,b=e.b.asset.id;
  const next=a===work[i]?b:b===work[i]?a:null;
  if(next&&!used.has(next)){used.add(next);work.push(next);}
 }
 const connected=used.has(dstSwitch.asset.id);
 const ping=ipv4Ping(source,target,addresses,connected);
 return {status:ping.status,success:ping.success,reason:!ping.success?
  ping.reason:loop?"STP bloque les liens redondants ; communication maintenue":
   "Chemin Ethernet valide",vlan,loop,storm:false,
  stpActive:protection,loopCableIds:cycles,blockedCableIds:blocked,
  sourceSwitchId:srcSwitch.asset.id,targetSwitchId:dstSwitch.asset.id};
}

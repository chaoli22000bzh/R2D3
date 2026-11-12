/* Lot 0 : preuve de jonction physique R2 / ping IPv4 existant.
 * Aucun câble ni port n'est copié dans un second inventaire éditable.
 * Seule une liaison de test éphémère est produite pour createEngine().
 */
import {createAssetRegistry,restoreAssetRegistry} from "../src/asset-profiles.js";
import {createEngine} from "../src/r2d3-core.js";

const clone=value=>JSON.parse(JSON.stringify(value));
const ethernetPorts=asset=>asset.ports.filter(p=>p.type==="ethernet-rj45");

function pingFromRegistry(physical,addressing,sourceId,targetId) {
  const registry=restoreAssetRegistry(physical);
  const source=registry.getAsset(sourceId),target=registry.getAsset(targetId);
  if(!source||!target)return {status:"unavailable",success:false,reason:"Équipement absent du parc"};
  const a=ethernetPorts(source),b=ethernetPorts(target);
  if(!a.length||!b.length)
    return {status:"unavailable",success:false,reason:"Observation Ethernet non prise en charge sur ces interfaces"};
  if(!addressing[sourceId]||!addressing[targetId])
    return {status:"unavailable",success:false,reason:"Adressage IPv4 absent du scénario"};
  let selected=null;
  for(const left of a){
    for(const right of b){
      const path=registry.explorePhysicalPath(left.id,right.id);
      if(path.success&&path.connected){selected=[left,right];break;}
    }
    if(selected)break;
  }
  const left=selected?.[0]??a[0],right=selected?.[1]??b[0];
  const objects=[[source,left],[target,right]].map(([asset,port])=>({
    id:asset.id,kind:"lot0-ethernet",name:asset.name,
    ports:[{id:port.id,type:"rj45"}],
    config:{ipv4:{interfaceId:port.id,mode:"static",...clone(addressing[asset.id])}},
    runtime:{}
  }));
  // Lien virtuel créé uniquement pendant la lecture du diagnostic.
  // Il n'est jamais sauvegardé ni modifiable : les câbles R2 sont seuls propriétaires.
  const links=selected?[{id:"lot0-observation",kind:"ethernet-cable",
    endpoints:[{objectId:source.id,portId:left.id},{objectId:target.id,portId:right.id}],
    connected:true}]:[];
  const scenario={format:"r2d3-scenario",schemaVersion:1,scenarioId:"lot0-observation",
    scenarioVersion:"1.0.0",capabilities:{network:true},objects,links};
  return createEngine(scenario).query({type:"network.ping",sourceId,targetId});
}

/** L'hôte facultatif reprend la convention load/save du banc existant.
 * Pour un TP de production, l'hôte C² reste à concevoir séparément.
 */
export async function openPhysicalPingProbe({physicalState,addressing,host=null,copyKey=null}) {
  if(!physicalState||!addressing)throw new TypeError("État physique et adressages requis");
  if(host&&(!host.load||!host.save||copyKey==null))
    throw new TypeError("Hôte ou clé de copie invalide");
  // Validation précoce par les API R2 existantes.
  createAssetRegistry(physicalState);
  const initial={revision:0,physical:clone(physicalState),addressing:clone(addressing)};
  const loaded=host?await host.load(copyKey):null;
  let current=loaded===null?initial:clone(loaded);
  if(!Number.isSafeInteger(current.revision)||current.revision<0||!current.physical||!current.addressing)
    throw new Error("Copie de démonstration invalide");
  restoreAssetRegistry(current.physical);
  const listeners=new Set();
  let inflight=false;
  return {
    getSnapshot:()=>clone(current),
    exportState:()=>clone(current),
    queryPing:(sourceId,targetId)=>pingFromRegistry(current.physical,current.addressing,sourceId,targetId),
    subscribe(listener){
      if(typeof listener!=="function")throw new TypeError("Abonné invalide");
      listeners.add(listener);return ()=>listeners.delete(listener);
    },
    async physicalAction(type,params) {
      if(inflight)return {status:"rejected",code:"operation_in_progress"};
      if(!["connectCableEnd","disconnectCableEnd"].includes(type))
        return {status:"rejected",code:"unsupported_action"};
      inflight=true;
      try {
        const candidate=restoreAssetRegistry(current.physical);
        const r=type==="connectCableEnd"
          ?candidate.connectCableEnd(params.cableId,params.end,params.portId)
          :candidate.disconnectCableEnd(params.cableId,params.end);
        if(!r.success)return {status:"rejected",code:r.code,message:r.message};
        if(r.code==="already_connected")return {status:"unchanged",code:r.code};
        const next={...current,revision:current.revision+1,physical:candidate.exportState()};
        if(host) {
          let saved;
          try {saved=await host.save(copyKey,clone(next),current.revision);}
          catch(_){return {status:"failed",code:"save_failed"};}
          if(!saved?.ok)return {status:"failed",code:saved?.reason==="conflict"?"revision_conflict":"save_failed"};
        }
        current=next;
        for(const listener of listeners){try{listener(current.revision)}catch(_){}}
        return {status:"applied",revision:current.revision};
      } finally {inflight=false}
    }
  };
}

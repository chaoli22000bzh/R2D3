/* Lot 0 : observation IPv4 ponctuelle depuis le registre physique R2.
 * Ne conserve AUCUN câble ni lien réseau : le scénario du cœur est dérivé à chaque lecture.
 * Périmètre volontaire : deux équipements Ethernet RJ45, sans switch actif à traverser.
 */
import {createEngine} from "./r2d3-core.js";

export function observePhysicalPing(registry, sourceId, targetId, addresses) {
  const source=registry.getAsset(sourceId),target=registry.getAsset(targetId);
  if(!source||!target||sourceId===targetId)
    return {status:"unavailable",success:false,reason:"Équipement inconnu ou identique"};
  const port=a=>a.ports.filter(p=>p.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45");
  const src=port(source),dst=port(target);
  // Une interface RJ45 non Ethernet ne doit jamais être inférée comme compatible.
  if(src.length!==1||dst.length!==1)
    return {status:"unavailable",success:false,reason:"Interface Ethernet RJ45 unique requise pour ce prototype"};
  const ipv4=addresses||{};
  const a=ipv4[sourceId],b=ipv4[targetId];
  if(!a||!b)return {status:"unavailable",success:false,reason:"Configuration IPv4 absente"};
  const path=registry.explorePhysicalPath(src[0].id,dst[0].id);
  if(!path.success)return {status:"unavailable",success:false,reason:"Chemin physique non déterminé"};
  // Une unique arête calculée suffit au moteur V1 : elle n'est ni éditable ni sauvegardée.
  // Le registre détermine la continuité, y compris via prises et panneaux passifs.
  const scenario={
    format:"r2d3-scenario",schemaVersion:1,scenarioId:"lot0-physical-observation",
    scenarioVersion:"1.0.0",capabilities:{network:true},
    objects:[[source,src[0],a],[target,dst[0],b]].map(([asset,physical,ip])=>({
      id:asset.id,kind:"lot0-endpoint",name:asset.name,
      ports:[{id:physical.id,type:"rj45"}],
      config:{ipv4:{interfaceId:physical.id,mode:"static",address:ip.address,prefix:ip.prefix}},
      runtime:{}
    })),
    links:path.connected?[{id:"derived-physical-continuity",kind:"ethernet-cable",
      endpoints:[{objectId:source.id,portId:src[0].id},{objectId:target.id,portId:dst[0].id}],
      connected:true}]:[]
  };
  return createEngine(scenario).query({type:"network.ping",sourceId,targetId});
}

/* R2D3, micro-lot 1A : deux terminaux et un switch L2 à ports Access.
 * Aucune trame ni réseau Ethernet généraliste. Aucun état de câble dupliqué.
 */
import {createEngine} from "./r2d3-core.js";

const ethernet=p=>p?.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45";
const unavailable=reason=>({status:"unavailable",success:false,reason});
const failure=reason=>({status:"ok",success:false,reason});

export function observeVlanPing(registry,{pc1Id,pc2Id,switchId,vlans,addresses}) {
  const pc1=registry.getAsset(pc1Id),pc2=registry.getAsset(pc2Id),sw=registry.getAsset(switchId);
  if(!pc1||!pc2||!sw||new Set([pc1Id,pc2Id,switchId]).size!==3)
    return unavailable("Équipements du scénario absents ou identiques");
  const endpoints=[pc1,pc2].map(pc=>pc.ports.filter(ethernet));
  const switchPorts=sw.ports.filter(ethernet);
  if(endpoints.some(p=>p.length!==1)||switchPorts.length<2)
    return unavailable("Interfaces Ethernet incompatibles avec le lot 1A");
  // Le registre R2 ne traverse pas un switch comme un câble passif.
  const selected=endpoints.map(ports=>switchPorts.filter(p=>{
    const path=registry.explorePhysicalPath(ports[0].id,p.id);
    return path.success&&path.connected;
  }));
  if(selected.some(p=>p.length!==1)||selected[0][0].id===selected[1][0].id)
    return unavailable("Raccordement physique absent ou ambigu");
  const [p1,p2]=selected.map(p=>p[0]);
  const v1=vlans?.[p1.id],v2=vlans?.[p2.id];
  if(!Number.isInteger(v1)||!Number.isInteger(v2)||v1<1||v1>4094||v2<1||v2>4094)
    return unavailable("VLAN Access non renseigné");
  // Deux VLAN distincts sur le même L2 restent isolés sans routage.
  if(v1!==v2)return failure("Ports Access affectés à des VLAN différents");
  const ip1=addresses?.[pc1Id],ip2=addresses?.[pc2Id];
  if(!ip1||!ip2)return unavailable("Configuration IPv4 manquante");
  const objects=[[pc1,endpoints[0][0],ip1],[pc2,endpoints[1][0],ip2]].map(([asset,port,ip])=>({
    id:asset.id,kind:"lot1a-client",name:asset.name,ports:[{id:port.id,type:"rj45"}],
    config:{ipv4:{interfaceId:port.id,mode:"static",address:ip.address,prefix:ip.prefix}},runtime:{}
  }));
  // Lien de calcul éphémère seulement : aucun câble inventorié n'est ajouté.
  const scenario={format:"r2d3-scenario",schemaVersion:1,
    scenarioId:"lot1a-access",scenarioVersion:"1.0.0",capabilities:{network:true},
    objects,links:[{id:"derived-access",kind:"ethernet-cable",connected:true,
      endpoints:[{objectId:pc1Id,portId:endpoints[0][0].id},
        {objectId:pc2Id,portId:endpoints[1][0].id}]}]};
  return createEngine(scenario).query({type:"network.ping",sourceId:pc1Id,targetId:pc2Id});
}

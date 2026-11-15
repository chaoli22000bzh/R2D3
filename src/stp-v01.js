/*
 * STP V0.1, observation en lecture seule des boucles Ethernet.
 * Deux situations prises en charge : câble entre deux ports d'un switch,
 * ou deux câbles directs entre deux switchs. Aucun STP réel, BPDU,
 * priorité, élection, temporisation ou nouvelle topologie persistante.
 * Dans ce lot, "administrable" = capacité VLAN existante du profil.
 */
import {observeEthernetNetworkPing} from "./ethernet-switching-v1.js";
const no=(reason)=>({status:"unavailable",success:false,reason});
const eth=p=>p?.type==="ethernet-rj45"&&p.medium==="ethernet"&&p.connector==="RJ45";
const active=a=>a?.status==="En service";
const managed=a=>a.networkCapabilities?.includes("vlan");
const switcher=a=>a.networkCapabilities?.includes("ethernet-switching");
const cmp=(a,b)=>String(a).localeCompare(String(b), "en");
export function observeStpV01(registry,sourceId,targetId,addresses){
 if(!registry||["getAsset","listAssets","listCables"].some(fn=>typeof registry[fn]!=="function"))
  return no("Registre physique R2 indisponible");
 const source=registry.getAsset(sourceId),target=registry.getAsset(targetId);
 if(!source||!target||sourceId===targetId||switcher(source)||switcher(target))
  return no("Deux postes Ethernet distincts requis");
 if(!active(source)||!active(target))
  return {status:"ok",success:false,reason:"Poste hors service",loop:false,blockedCableIds:[]};
 const sp=source.ports.filter(eth),tp=target.ports.filter(eth);
 if(sp.length!==1||tp.length!==1)return no("Un port RJ45 par poste requis en V0.1");
 const assets=registry.listAssets(),byPort=new Map();
 for(const asset of assets)for(const port of asset.ports.filter(eth))
  byPort.set(port.id,{asset,port});
 const connected=registry.listCables().filter(c=>c.ends?.[0]?.portId&&c.ends?.[1]?.portId)
  .map(c=>({c,a:byPort.get(c.ends[0].portId),b:byPort.get(c.ends[1].portId)}))
  .filter(x=>x.a&&x.b&&active(x.a.asset)&&active(x.b.asset));
 // V0.1 exclut les panneaux intermédiaires, les topologies multi-sauts
 // et les montages VLAN/Trunk mixtes. Une panne non observable n'est pas "ok".
 const swLinks=connected.filter(x=>switcher(x.a.asset)&&switcher(x.b.asset));
 const hostLinks=connected.filter(x=>switcher(x.a.asset)!==switcher(x.b.asset));
 const sourceAttach=hostLinks.filter(x=>x.a.asset.id===sourceId||x.b.asset.id===sourceId);
 const targetAttach=hostLinks.filter(x=>x.a.asset.id===targetId||x.b.asset.id===targetId);
 if(sourceAttach.length!==1||targetAttach.length!==1)
  return no("Les deux postes doivent être raccordés directement chacun à un switch");
 const swAt=x=>switcher(x.a.asset)?x.a.asset:x.b.asset;
 const a=swAt(sourceAttach[0]),b=swAt(targetAttach[0]);
 const swIds=new Set([a.id,b.id]);
 // Ajouter les switchs de la composante, sans dépasser deux.
 for(let changed=true;changed;){
  changed=false;
  for(const x of swLinks){
   if(swIds.has(x.a.asset.id)&&!swIds.has(x.b.asset.id)){swIds.add(x.b.asset.id);changed=true;}
   if(swIds.has(x.b.asset.id)&&!swIds.has(x.a.asset.id)){swIds.add(x.a.asset.id);changed=true;}
  }
 }
 if(swIds.size>2)return no("V0.1 limitée à un ou deux switchs");
 const links=swLinks.filter(x=>swIds.has(x.a.asset.id)&&swIds.has(x.b.asset.id))
  .sort((x,y)=>cmp(x.c.id,y.c.id));
 if(links.some(x=>!active(x.a.asset)||!active(x.b.asset)))
  return no("Switch indisponible");
 if(links.some(x=>x.a.asset.id!==x.b.asset.id&&swIds.size!==2))
  return no("Topologie de switchs incohérente");
 if(links.length>2)return no("V0.1 : plus de deux câbles entre switchs");
 if(swIds.size===2&&links.some(x=>x.a.asset.id===x.b.asset.id))
  return no("V0.1 : boucles imbriquées non prises en charge");
 if(swIds.size===1&&links.length>1)
  return no("V0.1 : plusieurs boucles locales non prises en charge");
 if(swIds.size===2&&links.length===2&&links.some(x=>x.a.asset.id===x.b.asset.id))
  return no("Boucles complexes non prises en charge");
 // V0.1 : le cycle ne peut être qu'un lien local ou deux liens parallèles.
 const loop=swIds.size===1?links.length===1:links.length===2;
 const switches=[...swIds].map(id=>registry.getAsset(id));
 const protectedByStp=loop&&switches.every(managed);
 const storm=loop&&!protectedByStp;
 // Politique déterministe : parmi les liens redondants, bloquer le dernier
 // câble, sans toucher aux connexions physiques du registre.
 const blockedCableIds=protectedByStp?[links[links.length-1].c.id]:[];
 const affected=swIds.has(a.id)&&swIds.has(b.id);
 if(storm&&affected)return {
  status:"ok",success:false,loop:true,storm:true,stpActive:false,
  blockedCableIds:[],loopCableIds:links.map(x=>x.c.id),
  reason:"Tempête de broadcast simulée : boucle Ethernet sans STP",
  sourceSwitchId:a.id,targetSwitchId:b.id
 };
 const pass=a.id===b.id || links.some(x=>!blockedCableIds.includes(x.c.id));
 if(!pass)return {status:"ok",success:false,loop,storm:false,
  stpActive:switches.every(managed),blockedCableIds,loopCableIds:links.map(x=>x.c.id),
  sourceSwitchId:a.id,targetSwitchId:b.id,reason:"Aucun chemin Ethernet actif"};
 const ping=observeEthernetNetworkPing(registry,sourceId,targetId,addresses);
 return {status:ping.status,success:ping.success,loop,storm:false,
  stpActive:switches.every(managed),blockedCableIds,loopCableIds:links.map(x=>x.c.id),
  sourceSwitchId:a.id,targetSwitchId:b.id,
  reason:!ping.success?ping.reason:protectedByStp?
   "STP bloque logiquement un lien redondant ; communication maintenue":
   "Aucune boucle perturbatrice ; communication possible"
 };
}

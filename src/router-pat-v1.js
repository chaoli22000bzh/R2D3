/*
 * PAT entrant routeur V1 : règles TCP/UDP persistées sur le registre R2.
 * Observation d'un accès HTTP/HTTPS seulement : connectivité par le moteur
 * de routage existant ; service actif lu par le Core R2D3.
 * Pas d'émulation de sockets, NAT sortant, suivi d'état ni pare-feu complet.
 */
import {observeRouterPing} from "./router-routing-v01.js";
const bad=(code,message)=>({success:false,code,message});
const validPort=n=>Number.isInteger(n)&&n>=1&&n<=65535;
const validIp=s=>typeof s==="string"&&/^\d{1,3}(\.\d{1,3}){3}$/.test(s)&&s.split(".").every(v=>Number(v)<=255);
const copy=x=>JSON.parse(JSON.stringify(x));
export function getRouterPatRules(registry,routerId){
 const a=registry?.getAsset?.(routerId);
 return a?.networkCapabilities?.includes("ipv4-router")?copy(a.routerConfig?.patRules||[]):null;
}
export function addRouterPatRule(registry,routerId,{wanPortId,protocol,externalPort,internalAddress,internalPort,enabled=true}){
 const a=registry?.getAsset?.(routerId);
 if(!a?.networkCapabilities?.includes("ipv4-router"))return bad("router_missing","Routeur absent");
 const cfg=copy(a.routerConfig),port=Number(externalPort),targetPort=Number(internalPort);
 if(!cfg.interfaces?.[wanPortId]||cfg.interfaces[wanPortId].role!=="wan")return bad("wan_required","Choisir une interface WAN");
 if(!["tcp","udp"].includes(protocol)||!validPort(port)||!validPort(targetPort)||!validIp(internalAddress)||typeof enabled!=="boolean")
  return bad("invalid_pat_rule","Protocole, ports, IPv4 ou état invalide");
 const rules=cfg.patRules||[];
 if(rules.some(r=>r.wanPortId===wanPortId&&r.protocol===protocol&&r.externalPort===port))
  return bad("pat_conflict","Port externe déjà réservé sur ce WAN et ce protocole");
 const id="pat-"+(Math.max(0,...rules.map(r=>Number(r.id.slice(4))||0))+1);
 const rule={id,wanPortId,protocol,externalPort:port,internalAddress,internalPort:targetPort,enabled};
 cfg.patRules=[...rules,rule];
 const result=registry.setAssetRouterConfig(routerId,cfg);
 return result.success?{success:true,rule}:result;
}
export function setRouterPatRuleEnabled(registry,routerId,ruleId,enabled){
 if(typeof enabled!=="boolean")return bad("invalid_state","État invalide");
 const a=registry?.getAsset?.(routerId);
 if(!a?.networkCapabilities?.includes("ipv4-router"))return bad("router_missing","Routeur absent");
 const cfg=copy(a.routerConfig),rule=(cfg.patRules||[]).find(r=>r.id===ruleId);
 if(!rule)return bad("rule_missing","Règle inexistante");
 rule.enabled=enabled;
 return registry.setAssetRouterConfig(routerId,cfg);
}
export function removeRouterPatRule(registry,routerId,ruleId){
 const a=registry?.getAsset?.(routerId);
 if(!a?.networkCapabilities?.includes("ipv4-router"))return bad("router_missing","Routeur absent");
 const cfg=copy(a.routerConfig),rules=cfg.patRules||[];
 if(!rules.some(r=>r.id===ruleId))return bad("rule_missing","Règle inexistante");
 cfg.patRules=rules.filter(r=>r.id!==ruleId);
 return registry.setAssetRouterConfig(routerId,cfg);
}
const notAvailable=reason=>({status:"unavailable",success:false,reason});
const blocked=reason=>({status:"ok",success:false,reason});
/*
 * sourceId: client externe raccordé au WAN.
 * targetId: serveur hébergeant le service publié sur LAN ou DMZ.
 * serviceEngine: Core R2D3 possédant l'état explicite HTTP/HTTPS du serveur.
 */
export function observeInboundPat(registry,routerId,sourceId,targetId,addresses,request,serviceEngine){
 const a=registry?.getAsset?.(routerId),src=registry?.getAsset?.(sourceId),dst=registry?.getAsset?.(targetId);
 if(!a?.routerConfig||!src||!dst||src.id===dst.id)return notAvailable("Équipements invalides");
 if(!request||!["tcp","udp"].includes(request.protocol)||!validPort(Number(request.port))||!validIp(request.wanAddress))
  return notAvailable("Connexion entrante invalide");
 const wanPorts=a.ports.filter(p=>a.routerConfig.interfaces?.[p.id]?.role==="wan"&&a.routerConfig.interfaces[p.id].mode==="static"&&a.routerConfig.interfaces[p.id].address===request.wanAddress);
 if(wanPorts.length!==1)return blocked("Adresse IPv4 WAN non attribuée à une interface unique");
 const wan=wanPorts[0],rules=a.routerConfig.patRules||[];
 const rule=rules.find(r=>r.wanPortId===wan.id&&r.protocol===request.protocol&&r.externalPort===Number(request.port));
 if(!rule||!rule.enabled)return blocked("Aucune redirection PAT active pour cette connexion");
 const targetConfig=addresses?.[targetId];
 if(!targetConfig||targetConfig.address!==rule.internalAddress)return blocked("Destination interne introuvable à l'IPv4 publiée");
 const service=request.service;
 const known={http:{protocol:"tcp",port:80},https:{protocol:"tcp",port:443}};
 if(!known[service]||rule.protocol!==known[service].protocol||rule.internalPort!==known[service].port)
  return notAvailable("Observation de service non prise en charge par ce premier laboratoire");
 if(!serviceEngine?.query)return notAvailable("Moteur de services R2D3 indisponible");
 const reach=observeRouterPing(registry,routerId,sourceId,targetId,addresses);
 if(reach.status==="unavailable")return notAvailable(reach.reason);
 if(!reach.success)return blocked("Réseau inaccessible : "+reach.reason);
 // L'entrée WAN est vérifiée à nouveau contre le port effectivement utilisé.
 const sourcePorts=src.ports.filter(p=>p.type==="ethernet-rj45");
 if(sourcePorts.length!==1||!registry.explorePhysicalPath(sourcePorts[0].id,wan.id).connected)
  return blocked("Source non raccordée à l'interface WAN ciblée");
 const targetPorts=dst.ports.filter(p=>p.type==="ethernet-rj45");
 const internalPorts=a.ports.filter(p=>["lan","dmz"].includes(a.routerConfig.interfaces?.[p.id]?.role));
 if(targetPorts.length!==1||!internalPorts.some(p=>registry.explorePhysicalPath(targetPorts[0].id,p.id).connected))
  return blocked("Serveur non raccordé au LAN ou à la DMZ");
 const observed=serviceEngine.query({type:"network.applicationService",targetId,service});
 if(observed.status==="unknown")return notAvailable("État du service non défini dans le Core");
 if(observed.status!=="available")return blocked("Service "+service.toUpperCase()+" arrêté");
 return {status:"ok",success:true,reason:"Accès "+service.toUpperCase()+" autorisé via PAT "+rule.externalPort+" → "+rule.internalAddress+":"+rule.internalPort,ruleId:rule.id};
}

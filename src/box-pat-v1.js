/* Adaptation du PAT entrant du routeur générique à la box R2D3.
 * Réutilise les opérations et validations du moteur router-pat-v1.js.
 * L'arrivée Internet est virtuelle : aucune liaison WAN câblée ou FAI.
 * Observation HTTP/HTTPS à partir du service Core et du brassage LAN réel.
 */
import {getRouterPatRules,addRouterPatRule,setRouterPatRuleEnabled,removeRouterPatRule} from "./router-pat-v1.js";
const fail=(code,message)=>({success:false,code,message});
const copy=x=>JSON.parse(JSON.stringify(x));
const ipv4=x=>typeof x==="string"&&/^(\d{1,3}\.){3}\d{1,3}$/.test(x)&&x.split(".").every(o=>Number(o)<=255);
const port=x=>Number.isInteger(x)&&x>=1&&x<=65535;
function routerAdapter(registry,boxId){
 const box=registry?.getAsset?.(boxId);
 if(!box?.boxConfig||!registry.setBoxPatRules)return null;
 const wanPortId=box.boxConfig.ports.wanPortId;
 return {
  getAsset:id=>{
   if(id!==boxId)return null;
   const current=registry.getAsset(boxId);
   if(!current?.boxConfig)return null;
   return {...current,networkCapabilities:["ipv4-router"],
    routerConfig:{interfaces:{[wanPortId]:{role:"wan"}},patRules:copy(current.boxConfig.patRules??[])}};
  },
  setAssetRouterConfig:(id,config)=>{
   if(id!==boxId)return fail("box_missing","Box introuvable.");
   return registry.setBoxPatRules(id,config.patRules);
  }
 };
}
export function getBoxPatRules(registry,boxId){
 const a=routerAdapter(registry,boxId);
 return a?getRouterPatRules(a,boxId):null;
}
export function addBoxPatRule(registry,boxId,{protocol="tcp",externalPort,internalAddress,internalPort,enabled=true}={}){
 const a=routerAdapter(registry,boxId);
 if(!a)return fail("box_missing","Box Internet introuvable.");
 const box=registry.getAsset(boxId);
 return addRouterPatRule(a,boxId,{wanPortId:box.boxConfig.ports.wanPortId,
  protocol,externalPort,internalAddress,internalPort,enabled});
}
export function setBoxPatRuleEnabled(registry,boxId,ruleId,enabled){
 const a=routerAdapter(registry,boxId);
 return a?setRouterPatRuleEnabled(a,boxId,ruleId,enabled):fail("box_missing","Box Internet introuvable.");
}
export function removeBoxPatRule(registry,boxId,ruleId){
 const a=routerAdapter(registry,boxId);
 return a?removeRouterPatRule(a,boxId,ruleId):fail("box_missing","Box Internet introuvable.");
}
/* externalAddress : IPv4 du demandeur Internet simulé (sans actif FAI).
 * targetId : serveur du parc réellement câblé à un LAN de la box.
 * targetAddress : configuration IPv4 explicite de ce serveur, non inférée du nom.
 * serviceEngine : moteur de services R2D3 portant son état HTTP/HTTPS.
 */
export function observeBoxInboundPat(registry,boxId,request,serviceEngine){
 const box=registry?.getAsset?.(boxId),target=registry?.getAsset?.(request?.targetId);
 if(!box?.boxConfig)return fail("box_missing","Box introuvable.");
 if(box.status!=="En service")return fail("box_offline","Box hors service.");
 if(box.boxConfig.mode==="bridge")return fail("bridge_mode","PAT entrant désactivé en mode bridge.");
 if(!target||target.status!=="En service"||target.id===box.id)
  return fail("target_missing","Serveur interne absent ou hors service.");
 if(!request||!ipv4(request.externalAddress)||!ipv4(request.wanAddress)||
    !port(Number(request.port))||!["tcp","udp"].includes(request.protocol)||
    !["http","https"].includes(request.service))
  return fail("invalid_request","Demande Internet invalide.");
 const wan=registry.getBoxWanEffective?.(boxId);
 if(!wan||wan.address!==request.wanAddress)return fail("wan_mismatch","IPv4 WAN incorrecte.");
 const rule=(getBoxPatRules(registry,boxId)||[]).find(r=>r.enabled&&
  r.protocol===request.protocol&&r.externalPort===Number(request.port));
 if(!rule)return fail("pat_rule_missing","Aucune règle PAT active sur ce port.");
 const servicePort=request.service==="http"?80:443;
 if(rule.protocol!=="tcp"||rule.internalPort!==servicePort)
  return fail("service_unsupported","Règle incompatible avec le service HTTP/HTTPS demandé.");
 const address=request.targetAddress;
 if(!ipv4(address)||address!==rule.internalAddress)
  return fail("target_mismatch","Adresse IPv4 du serveur interne différente de la redirection.");
 const lan=box.boxConfig.lan,mask=(0xffffffff<<(32-lan.prefix))>>>0;
 const ip=x=>x.split(".").reduce((n,o)=>(n*256+Number(o))>>>0,0);
 if((ip(address)&mask)!==(ip(lan.address)&mask)||address===lan.address||
    request.targetGateway!==lan.address)
  return fail("target_network","Adresse LAN ou passerelle du serveur incorrecte.");
 const ports=target.ports.filter(p=>p.type==="ethernet-rj45");
 const reachable=ports.flatMap(p=>box.boxConfig.ports.lanPortIds.filter(lanId=>
  registry.explorePhysicalPath(p.id,lanId).connected).map(lanPortId=>({portId:p.id,lanPortId})));
 if(reachable.length!==1)return fail(reachable.length?"ambiguous_lan":"link_down",
  reachable.length?"Plusieurs liaisons LAN du serveur détectées.":"Serveur non raccordé au LAN de la box.");
 if(!serviceEngine?.query)return fail("service_engine_missing","Moteur de services R2D3 indisponible.");
 const observed=serviceEngine.query({type:"network.applicationService",targetId:target.id,service:request.service});
 if(observed.status==="unknown")return fail("service_unknown","État du service non déclaré dans le Core.");
 if(observed.status!=="available")return fail("service_offline","Service Web interne arrêté.");
 return {success:true,code:"inbound_pat_reached",ruleId:rule.id,service:request.service,
  source:{address:request.externalAddress},
  public:{address:wan.address,port:rule.externalPort,protocol:rule.protocol},
  destination:{assetId:target.id,address,port:rule.internalPort},
  reason:"Redirection PAT entrante vers le service Web interne disponible."};
}

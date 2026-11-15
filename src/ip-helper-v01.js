import {relayDhcpViaCommonEngine} from "./dhcp-relay-common-v01.js";
/*
 * IP Helper V0.1 : relais DHCP entre deux VLAN Access d'un même switch L3.
 * Ne contient aucun allocateur DHCP : l'attribution et les baux sont gérés
 * exclusivement par le moteur R2D3 Core passé en argument.
 * Le banc d'essai fournit au Core une liaison logique de service entre
 * le client et le serveur ; elle n'ajoute aucun câble au registre physique R2.
 */
const copy=x=>JSON.parse(JSON.stringify(x));
const reject=(reason,status="ok")=>({status,success:false,reason});
const unsupported=reason=>reject(reason,"unavailable");
const ipv4=value=>{
 if(typeof value!=="string")return null;
 const parts=value.split(".");
 if(parts.length!==4||parts.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))return null;
 return parts.reduce((value,octet)=>(value*256+Number(octet))>>>0,0);
};
const network=(ip,prefix)=>{
 const n=ipv4(ip);
 if(n===null||!Number.isInteger(prefix)||prefix<1||prefix>30)return null;
 const mask=(0xffffffff<<(32-prefix))>>>0;
 return {ip:n,mask,base:(n&mask)>>>0};
};
const same=(a,b)=>a&&b&&a.base===b.base&&a.mask===b.mask;
const rj45=p=>p?.type==="ethernet-rj45"&&p?.medium==="ethernet";
export function createDefaultIpHelperConfig(sw){
 if(!sw?.networkCapabilities?.includes("inter-vlan-routing"))
  throw Error("Switch L3 nécessaire");
 return {assetId:sw.id,helpers:{}};
}
export function configureIpHelper(config,vlanNumber,serverAddress,enabled=true){
 if(!config||typeof config.assetId!=="string"||!config.helpers||typeof config.helpers!=="object"||
  !Number.isInteger(vlanNumber)||vlanNumber<1||vlanNumber>4094||
  ipv4(serverAddress)===null||typeof enabled!=="boolean")
  return {success:false,reason:"VLAN, adresse du serveur ou état du relais invalide"};
 return {success:true,config:{...config,helpers:{...config.helpers,
  [String(vlanNumber)]:{serverAddress,enabled}}}};
}
export function requestRelayedDhcp({
 registry,switchId,clientId,serverId,serverAddress,helperConfig,dhcpEngine,commandId
}){
 if(!registry?.getAsset||!registry?.explorePhysicalPath||
  !dhcpEngine?.query||!dhcpEngine?.dispatch||!dhcpEngine?.getSnapshot)
  return unsupported("Registre ou moteur DHCP indisponible");
 const sw=registry.getAsset(switchId),client=registry.getAsset(clientId),server=registry.getAsset(serverId);
 if(!sw||!client||!server||new Set([switchId,clientId,serverId]).size!==3)
  return unsupported("Équipements invalides");
 if([sw,client,server].some(x=>x.status!=="En service"))
  return reject("Équipement hors service");
 if(!sw.networkCapabilities?.includes("inter-vlan-routing")||
  !sw.vlanConfig||!sw.routingConfig)return unsupported("Switch L3 non configuré");
 if(!sw.routingConfig.routingEnabled)return reject("Routage L3 désactivé");
 if(!helperConfig||helperConfig.assetId!==switchId||!helperConfig.helpers)
  return unsupported("Configuration IP Helper absente");
 const portFor=asset=>{
  const ports=asset.ports.filter(rj45);
  if(ports.length!==1)return {invalid:true};
  const attached=sw.ports.filter(rj45)
   .filter(p=>registry.explorePhysicalPath(ports[0].id,p.id).connected);
  if(attached.length!==1)return {missing:attached.length===0,invalid:attached.length>1};
  const pc=sw.vlanConfig.ports[attached[0].id];
  const vlan=pc?.mode==="access"?sw.vlanConfig.vlans.find(v=>v.id===pc.vlanId):null;
  return vlan?{number:vlan.number}: {invalid:true};
 };
 const c=portFor(client),s=portFor(server);
 if(c.missing||s.missing)return reject("Chemin Ethernet interrompu");
 if(c.invalid||s.invalid)return unsupported("V0.1 nécessite des ports Access directs et uniques");
 if(c.number===s.number)return unsupported("IP Helper V0.1 traite des VLAN différents");
 const clientSvi=sw.routingConfig.interfaces[String(c.number)];
 const serverSvi=sw.routingConfig.interfaces[String(s.number)];
 if(!clientSvi?.enabled||!serverSvi?.enabled)
  return reject("Interface VLAN absente ou désactivée");
 const clientNet=network(clientSvi.address,clientSvi.prefix);
 const serverNet=network(serverSvi.address,serverSvi.prefix);
 const remote=network(serverAddress,serverSvi.prefix);
 if(!clientNet||!serverNet||!remote||!same(serverNet,remote))
  return reject("Serveur hors du sous-réseau de son VLAN");
 const helper=helperConfig.helpers[String(c.number)];
 if(!helper?.enabled)return reject("IP Helper absent ou désactivé sur le VLAN client");
 if(helper.serverAddress!==serverAddress)return reject("Adresse IP Helper incorrecte");
 return relayDhcpViaCommonEngine({
  dhcpEngine,clientId,serverId,serverAddress,commandId,
  clientNetwork:{address:clientSvi.address,prefix:clientSvi.prefix},
  helper,
  transport:{kind:"vlan",reachable:true}
 });
}

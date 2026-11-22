import {defaultWifiRadios,validWifiRadios} from "./wifi-radio-config-v1.js";
/* R2D3 : profils descriptifs R2, sans simulation de protocoles. */
const clone=x=>JSON.parse(JSON.stringify(x));
const trim=x=>String(x??"").trim();
const result=(success,code,message,extra={})=>({success,code,message,...extra});
const types=["text","number","boolean","select","date"];
const common=["name","manufacturer","model","serialNumber","status","location","reservable"];
// Capacités métier connues. Les champs descriptifs ne déclenchent jamais une simulation.
const supportedNetworkCapabilities=["ethernet-switching","vlan","inter-vlan-routing","ip-helper","dhcp-server","ipv4-router","wifi-ap"];
const wifiDefault=a=>({assetId:a.id,enabled:true,radios:defaultWifiRadios(),ssids:[{id:"ssid-1",name:"WIFI-01",enabled:true,security:"open",password:"",bands:["2.4","5"],clientIsolation:false}]});
const validWifiConfig=(a,c)=>!!a.networkCapabilities?.includes("wifi-ap")&&c?.assetId===a.id&&typeof c.enabled==="boolean"&&(c.radios===undefined||validWifiRadios(c.radios))&&a.ports.some(p=>p.type==="ethernet-rj45")&&a.ports.some(p=>p.type==="wifi")&&Array.isArray(c.ssids)&&c.ssids.length<=16&&new Set(c.ssids.map(x=>x.id)).size===c.ssids.length&&c.ssids.every(x=>typeof x.id==="string"&&x.id.length>0&&typeof x.name==="string"&&x.name.length>=1&&x.name.length<=32&&typeof x.enabled==="boolean"&&["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"].includes(x.security)&&typeof x.password==="string"&&(x.security==="open"?x.password==="":x.password===""||x.password.length>=8&&x.password.length<=63)&&typeof x.clientIsolation==="boolean"&&(x.vlanNumber===undefined||x.vlanNumber===null||Number.isInteger(x.vlanNumber)&&x.vlanNumber>=1&&x.vlanNumber<=4094)&&Array.isArray(x.bands)&&x.bands.length>0&&new Set(x.bands).size===x.bands.length&&x.bands.every(b=>["2.4","5","6"].includes(b))&&(!x.bands.includes("6")||x.security==="wpa3-personal"));
const empty=v=>v===undefined||v===null||v==="";
const routerPorts=a=>a.ports.filter(p=>p.type==="ethernet-rj45"||p.type==="ethernet-fibre");
const routerIpv4=v=>typeof v==="string"&&/^\d{1,3}(\.\d{1,3}){3}$/.test(v)&&v.split(".").every(x=>Number(x)<=255);
const routerDefaults=a=>({assetId:a.id,patRules:[],interfaces:Object.fromEntries(routerPorts(a).map((p,i)=>[p.id,{role:i===0?"wan":"lan",mode:"dhcp",address:"",prefix:null,gateway:"",respondToPing:i!==0}]))});
const validPatRules=(a,c)=>c.patRules===undefined||(Array.isArray(c.patRules)&&new Set(c.patRules.map(r=>r.id)).size===c.patRules.length&&c.patRules.every(r=>r&&typeof r.id==="string"&&r.id.length>0&&typeof r.wanPortId==="string"&&a.ports.some(p=>p.id===r.wanPortId)&&c.interfaces?.[r.wanPortId]?.role==="wan"&&["tcp","udp"].includes(r.protocol)&&Number.isInteger(r.externalPort)&&r.externalPort>=1&&r.externalPort<=65535&&routerIpv4(r.internalAddress)&&Number.isInteger(r.internalPort)&&r.internalPort>=1&&r.internalPort<=65535&&typeof r.enabled==="boolean")&&new Set(c.patRules.map(r=>r.wanPortId+":"+r.protocol+":"+r.externalPort)).size===c.patRules.length);
const routerValid=(a,c)=>!!c&&c.assetId===a.id&&validPatRules(a,c)&&c.interfaces&&typeof c.interfaces==="object"&&!Array.isArray(c.interfaces)&&Object.keys(c.interfaces).length===routerPorts(a).length&&routerPorts(a).every(p=>{
 const i=c.interfaces[p.id];return !!i&&["wan","lan","dmz"].includes(i.role)&&["dhcp","static"].includes(i.mode)&&typeof i.respondToPing==="boolean"&&(i.mode==="dhcp"?(i.address===""&&i.prefix===null&&i.gateway===""):(routerIpv4(i.address)&&Number.isInteger(i.prefix)&&i.prefix>=0&&i.prefix<=32&&(i.gateway===""||routerIpv4(i.gateway))));
});
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
const isRj45=p=>p?.type==="ethernet-rj45"&&p?.medium==="ethernet";
const vlanDefault=asset=>({
 assetId:asset.id,vlans:[{id:"vlan-1",number:1,name:"Défaut"}],nextVlanId:2,
 ports:Object.fromEntries(asset.ports.filter(isRj45).map(p=>[p.id,{mode:"access",vlanId:"vlan-1"}]))
});
function validVlanConfiguration(asset,config){
 if(!asset.networkCapabilities?.includes("vlan")||!asset.networkCapabilities.includes("ethernet-switching")||
    !config||config.assetId!==asset.id||!Array.isArray(config.vlans)||
    !Number.isInteger(config.nextVlanId)||config.nextVlanId<2||
    !config.ports||typeof config.ports!=="object"||Array.isArray(config.ports))return false;
 const ids=new Set(),numbers=new Set();
 for(const v of config.vlans){
  if(!v||typeof v.id!=="string"||!v.id||ids.has(v.id)||
     !Number.isInteger(v.number)||v.number<1||v.number>4094||numbers.has(v.number)||
     typeof v.name!=="string"||!trim(v.name))return false;
  ids.add(v.id);numbers.add(v.number);
 }
 if(!numbers.has(1))return false;
 const ports=asset.ports.filter(isRj45).map(p=>p.id);
 if(ports.length<2||Object.keys(config.ports).length!==ports.length||
    ports.some(p=>!Object.hasOwn(config.ports,p)))return false;
 return ports.every(id=>{
  const v=config.ports[id];
  if(!v)return false;
  if(v.mode==="access")return ids.has(v.vlanId);
  return v.mode==="trunk"&&Array.isArray(v.allowedVlanIds)&&v.allowedVlanIds.length>0&&
   new Set(v.allowedVlanIds).size===v.allowedVlanIds.length&&
   v.allowedVlanIds.every(x=>ids.has(x));
 });
}

const validIPv4=value=>typeof value==="string"&&value.split(".").length===4&&value.split(".").every(o=>/^\d{1,3}$/.test(o)&&Number(o)<=255);
function validRoutingConfiguration(asset,config){
 if(!asset.networkCapabilities?.includes("inter-vlan-routing")||!asset.networkCapabilities.includes("vlan")||
    !config||config.assetId!==asset.id||typeof config.routingEnabled!=="boolean"||
    !config.interfaces||typeof config.interfaces!=="object"||Array.isArray(config.interfaces))return false;
 const vlanNumbers=new Set(asset.vlanConfig?.vlans?.map(v=>v.number));
 for(const [key,v] of Object.entries(config.interfaces)){
  const number=Number(key);
  if(!/^(?:[1-9]\d{0,3})$/.test(key)||number>4094||!vlanNumbers.has(number)||!v||
     !validIPv4(v.address)||!Number.isInteger(v.prefix)||v.prefix<1||v.prefix>30||
     typeof v.enabled!=="boolean")return false;
 }
 // Règles L3 directionnelles persistées sur le switch. Anciennes sauvegardes compatibles.
 if(config.accessRules!==undefined){
  if(!Array.isArray(config.accessRules)||config.accessRules.length>64)return false;
  const ids=new Set();
  for(const rule of config.accessRules){
   if(!rule||typeof rule.id!=="string"||!/^[-a-zA-Z0-9_]{1,40}$/.test(rule.id)||ids.has(rule.id)||
    !Number.isInteger(rule.sourceVlan)||!vlanNumbers.has(rule.sourceVlan)||
    !Number.isInteger(rule.targetVlan)||!vlanNumbers.has(rule.targetVlan)||
    rule.sourceVlan===rule.targetVlan||rule.action!=="deny"||typeof rule.enabled!=="boolean")return false;
   ids.add(rule.id);
  }
 }
 return true;
}
// La configuration IP Helper appartient à l'actif, et non à son profil ni au scénario.
function validIpHelperConfiguration(asset,config){
 if(!asset.networkCapabilities?.includes("ip-helper")||
    !config||config.assetId!==asset.id||
    !config.helpers||typeof config.helpers!=="object"||Array.isArray(config.helpers))return false;
 for(const [key,entry] of Object.entries(config.helpers)){
  if(!entry||typeof entry.enabled!=="boolean"||
     typeof entry.serverAddress!=="string"||!validIPv4(entry.serverAddress))return false;
  if(key.startsWith("vlan:")){
   const value=key.slice(5),number=Number(value);
   if(!/^[1-9][0-9]{0,3}$/.test(value)||number>4094||
      !asset.networkCapabilities.includes("vlan")||
      !asset.vlanConfig?.vlans.some(v=>v.number===number))return false;
  }else if(key.startsWith("interface:")){
   const id=key.slice(10);
   if(!asset.ports.some(p=>p.id===id&&p.medium==="ethernet"))return false;
  }else return false;
 }
 return true;
}
// Adresse d'administration propre aux switchs L2/L3.

function validAssetDhcpServer(asset,conf){
 if(!asset.networkCapabilities?.includes("dhcp-server")||
    !(asset.networkCapabilities.includes("inter-vlan-routing")||asset.networkCapabilities.includes("ipv4-router"))||
    !conf||conf.assetId!==asset.id||typeof conf.enabled!=="boolean"||
    !Array.isArray(conf.pools)||(conf.enabled&&conf.pools.length===0))return false;
 const seen=new Set(),ranges=[];
 const val=x=>validIPv4(x)?x.split(".").reduce((a,n)=>(a*256+Number(n))>>>0,0):null;
 for(const p of conf.pools){
  if(!p||typeof p.id!=="string"||!/^[a-zA-Z0-9_-]+$/.test(p.id)||
   seen.has(p.id)||(asset.networkCapabilities.includes("ipv4-router")
     ? typeof p.portId!=="string"||p.vlanNumber!==undefined||
       !asset.routerConfig?.interfaces?.[p.portId]||!["lan","dmz"].includes(asset.routerConfig.interfaces[p.portId].role)
     : !Number.isInteger(p.vlanNumber)||p.vlanNumber<1||p.vlanNumber>4094||
       !asset.vlanConfig?.vlans.some(v=>v.number===p.vlanNumber)||p.portId!==undefined)||
   val(p.start)===null||val(p.end)===null||
   val(p.start)>val(p.end)||val(p.end)-val(p.start)>254||
   !Number.isInteger(p.prefix)||p.prefix<1||p.prefix>30||
   !sameNet(p.start,p.end,p.prefix)||
   !validIPv4(p.gateway)||!sameNet(p.start,p.gateway,p.prefix)||
   !Array.isArray(p.dns)||p.dns.length>2||p.dns.some(x=>!validIPv4(x))||
   !Number.isInteger(p.leaseSeconds)||p.leaseSeconds<60||p.leaseSeconds>2592000||
   (p.exclusions!==undefined&&(!Array.isArray(p.exclusions)||new Set(p.exclusions).size!==p.exclusions.length||
    p.exclusions.some(x=>val(x)===null||val(x)<val(p.start)||val(x)>val(p.end))))||
   (p.reservations!==undefined&&(!Array.isArray(p.reservations)||
     p.reservations.some(r=>!r||typeof r.mac!=="string"||!/^([0-9A-F]{2}-){5}[0-9A-F]{2}$/i.test(r.mac)||
      val(r.address)===null||val(r.address)<val(p.start)||val(r.address)>val(p.end)||
      p.exclusions?.includes(r.address))||
     new Set(p.reservations.map(r=>r.mac.toUpperCase())).size!==p.reservations.length||
     new Set(p.reservations.map(r=>r.address)).size!==p.reservations.length)))
   return false;
  if(asset.networkCapabilities.includes("ipv4-router")){
    const iface=asset.routerConfig.interfaces[p.portId];
    if(iface.mode!=="static"||iface.address!==p.gateway||iface.prefix!==p.prefix)return false;
  }
  if(ranges.some(r=>val(p.start)<=r.end&&r.start<=val(p.end)))return false;
  seen.add(p.id);ranges.push({start:val(p.start),end:val(p.end)});
 }
 return true;
}

const managementDefault=asset=>({assetId:asset.id,mode:"dhcp",address:null,prefix:null,gateway:null,dns:[],lease:null});
const sameNet=(a,b,prefix)=>{
 const parse=x=>x.split(".").reduce((n,v)=>((n<<8)|Number(v))>>>0,0);
 const mask=(0xffffffff<<(32-prefix))>>>0;
 return (parse(a)&mask)===(parse(b)&mask);
};
function validManagement(asset,c){
 if(!(asset.networkCapabilities?.includes("vlan")||asset.networkCapabilities?.includes("wifi-ap"))||!c||c.assetId!==asset.id||
    !["static","dhcp"].includes(c.mode))return false;
 // Accepter les anciennes sauvegardes sans champ DNS.
 const dns=c.dns??[];
 if(!Array.isArray(dns)||dns.length>2||dns.some(address=>!validIPv4(address)))return false;
 if(c.mode==="static")return validIPv4(c.address)&&Number.isInteger(c.prefix)&&
   c.prefix>=1&&c.prefix<=30&&
   (c.gateway===null||validIPv4(c.gateway)&&sameNet(c.address,c.gateway,c.prefix))&&c.lease===null;
 return (c.address===null&&c.prefix===null&&c.gateway===null&&c.lease===null)||
   (typeof c.address==="string"&&/^169\.254\./.test(c.address)&&validIPv4(c.address)&&
    c.prefix===16&&c.gateway===null&&c.lease===null)||
   (validIPv4(c.address)&&Number.isInteger(c.prefix)&&c.prefix>=1&&c.prefix<=30&&
    (c.gateway===null||validIPv4(c.gateway))&&c.lease&&typeof c.lease==="object"&&
    typeof c.lease.serverId==="string"&&typeof c.lease.poolId==="string"&&
    Number.isFinite(c.lease.expires));
}
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
 const s=saved?clone(saved):{revision:0,nextProfile:1,nextAsset:1,nextPortGroup:1,nextPort:1,nextCable:1,cables:[],nextInfrastructure:1,nextInfrastructurePort:1,wallOutlets:[],panels:[],places:[],nextPlace:1,profiles:[],assets:[]};
 if(!Array.isArray(s.profiles)||!Array.isArray(s.assets)||!Number.isInteger(s.revision)||!Number.isInteger(s.nextProfile)||!Number.isInteger(s.nextAsset))throw Error("État R2 invalide");
 s.nextPortGroup??=1;s.nextPort??=1;s.nextCable??=1;s.cables??=[];
 s.nextInfrastructure??=1;s.nextInfrastructurePort??=1;s.wallOutlets??=[];s.panels??=[];
 if(!Array.isArray(s.panels))throw Error("Panneaux invalides");
 s.places??=[];s.nextPlace??=1;
 if(!Array.isArray(s.places)||!Number.isInteger(s.nextPlace)||s.nextPlace<1)throw Error("État des lieux R2 invalide");
 const placeIds=new Set();
 for(const place of s.places){
  if(!place||typeof place.id!=="string"||!trim(place.name)||placeIds.has(place.id))throw Error("Lieu R2 invalide");
  placeIds.add(place.id);
 }
 for(const place of s.places){
  if(place.parentId!=null&&!placeIds.has(place.parentId))throw Error("Parent de lieu inconnu");
  const seen=new Set([place.id]);let current=place;
  while(current.parentId!=null){if(seen.has(current.parentId))throw Error("Cycle dans les lieux");seen.add(current.parentId);current=s.places.find(p=>p.id===current.parentId)}
 }
 for(const asset of s.assets){asset.placeId??=null;if(asset.placeId!==null&&!placeIds.has(asset.placeId))throw Error("Localisation d'équipement inconnue");}
 for(const p of s.profiles){
   p.poe??=false;
   if(typeof p.poe!=="boolean")throw Error("Propriété PoE du profil invalide");
   p.portGroups??=[];
  p.networkCapabilities??=[];
  if(!Array.isArray(p.networkCapabilities)||new Set(p.networkCapabilities).size!==p.networkCapabilities.length||
      p.networkCapabilities.some(x=>!supportedNetworkCapabilities.includes(x)))throw Error("Capacités réseau de profil invalides");
   if(p.poe&&!p.networkCapabilities.includes("ethernet-switching"))throw Error("PoE réservé à un profil switch");
    if(p.networkCapabilities.includes("wifi-ap")&&(!p.portGroups.some(g=>g.type==="wifi")||!p.portGroups.some(g=>g.type==="ethernet-rj45")))throw Error("Profil Wi-Fi sans port Ethernet ou radio");
    if(p.networkCapabilities.includes("ipv4-router")&&(p.networkCapabilities.includes("ethernet-switching")||p.portGroups.filter(g=>g.type==="ethernet-rj45"||g.type==="ethernet-fibre").reduce((n,g)=>n+g.count,0)<2))throw Error("Profil routeur invalide");
 }
 for(const a of s.assets){
   if(a.networkCapabilities?.includes("dhcp-server")&&a.dhcpServerConfig===undefined)
    a.dhcpServerConfig={assetId:a.id,enabled:false,pools:[]};
   if(a.networkCapabilities?.includes("dhcp-server")&&!validAssetDhcpServer(a,a.dhcpServerConfig))
    throw Error("Configuration du service DHCP invalide");
   if(!a.networkCapabilities?.includes("dhcp-server")&&a.dhcpServerConfig!==undefined)
    throw Error("Service DHCP sur un équipement incompatible");
   a.poe??=false;
   if(typeof a.poe!=="boolean")throw Error("Propriété PoE de l'équipement invalide");
   if(a.poe&&!a.networkCapabilities?.includes("ethernet-switching"))
    throw Error("PoE réservé à un switch Ethernet");
   a.networkCapabilities??=[]; // Compatibilité avec les inventaires précédents.
    if(a.networkCapabilities.includes("wifi-ap")&&a.wifiConfig===undefined)a.wifiConfig=wifiDefault(a);
    if(a.networkCapabilities.includes("wifi-ap")&&!validWifiConfig(a,a.wifiConfig))throw Error("Configuration de borne Wi-Fi invalide");
    if(!a.networkCapabilities.includes("wifi-ap")&&a.wifiConfig!==undefined)throw Error("Configuration Wi-Fi sans capacité");
    if(a.networkCapabilities.includes("ipv4-router")&&!routerValid(a,a.routerConfig))throw Error("Configuration routeur invalide");
    if(!a.networkCapabilities.includes("ipv4-router")&&a.routerConfig!==undefined)throw Error("Configuration routeur sans capacité");
  if(!Array.isArray(a.networkCapabilities)||new Set(a.networkCapabilities).size!==a.networkCapabilities.length||
     a.networkCapabilities.some(x=>!supportedNetworkCapabilities.includes(x)))throw Error("Capacités réseau d’équipement invalides");
  if(a.networkCapabilities.includes("vlan")&&(!a.networkCapabilities.includes("ethernet-switching")||!validVlanConfiguration(a,a.vlanConfig)))throw Error("Configuration VLAN d’équipement invalide");
  if(!a.networkCapabilities.includes("vlan")&&a.vlanConfig!==undefined)throw Error("VLAN présent sans capacité");
  if(a.networkCapabilities.includes("inter-vlan-routing")&&!validRoutingConfiguration(a,a.routingConfig))
   throw Error("Configuration de routage inter-VLAN invalide");
  if(!a.networkCapabilities.includes("inter-vlan-routing")&&a.routingConfig!==undefined)
   throw Error("Routage inter-VLAN présent sans capacité");
  if(a.networkCapabilities.includes("ip-helper")&&!validIpHelperConfiguration(a,a.ipHelperConfig))
   throw Error("Configuration IP Helper invalide");
  if(!a.networkCapabilities.includes("ip-helper")&&a.ipHelperConfig!==undefined)
   throw Error("IP Helper présent sans capacité");
  // Les anciens inventaires VLAN restent rechargeables après l'ajout de cette fonction.
  if((a.networkCapabilities.includes("vlan")||a.networkCapabilities.includes("wifi-ap"))&&a.managementConfig===undefined)
   a.managementConfig=managementDefault(a);
  if((a.networkCapabilities.includes("vlan")||a.networkCapabilities.includes("wifi-ap"))&&!validManagement(a,a.managementConfig))
   throw Error("Adresse IPv4 de gestion invalide");
  if(!a.networkCapabilities.includes("vlan")&&!a.networkCapabilities.includes("wifi-ap")&&a.managementConfig!==undefined)
   throw Error("Gestion IP interdite sur équipement non administrable");
 }
 for(const panel of s.panels){
  if(!panel||typeof panel.id!=="string"||!trim(panel.name)||!placeIds.has(panel.placeId)||
     !Array.isArray(panel.ports)||!panel.ports.every(slot=>slot&&slot.front&&slot.back&&
       typeof slot.front.id==="string"&&typeof slot.back.id==="string"))
   throw Error("Panneau de brassage invalide");
 }
 if(new Set(s.panels.map(p=>p.id)).size!==s.panels.length)throw Error("Identifiants de panneaux en doublon");
 for(const a of s.assets)a.ports??=[];
 // Les occupations sont déduites de la liste canonique des câbles, jamais d’une seconde source de vérité.
 for(const a of s.assets)for(const p of a.ports)p.connectedCableIds=s.cables.flatMap(c=>c.ends.some(e=>e?.portId===p.id)?[c.id]:[]);
 for(const infra of [...s.wallOutlets,...s.panels])for(const slot of infra.ports)for(const p of [slot.front,slot.back])p.connectedCableIds=s.cables.flatMap(c=>c.ends.some(e=>e?.portId===p.id)?[c.id]:[]);
 const getP=id=>s.profiles.find(x=>x.id===id),getA=id=>s.assets.find(x=>x.id===id);
 const placePath=id=>{
  const names=[],seen=new Set();let p=s.places.find(x=>x.id===id);
  while(p&&!seen.has(p.id)){names.unshift(p.name);seen.add(p.id);p=s.places.find(x=>x.id===p.parentId);}
  return names.join(" / ");
 };
 function createPlace(raw={}){
  const name=trim(raw.name),parentId=raw.parentId||null;
  if(!name)return result(false,"invalid_name","Nom du lieu obligatoire.");
  if(parentId!==null&&!s.places.some(p=>p.id===parentId))return result(false,"not_found","Lieu parent introuvable.");
  if(s.places.some(p=>p.parentId===parentId&&p.name===name))return result(false,"duplicate_name","Un lieu de ce nom existe déjà à cet emplacement.");
  const place={id:"place-"+s.nextPlace++,name,parentId};s.places.push(place);s.revision++;
  return result(true,"place_created","Lieu créé.",{place:clone(place)});
 }
 function moveAssetToPlace(assetId,placeId=null){
  const asset=getA(assetId);if(!asset)return result(false,"not_found","Équipement introuvable.");
  if(placeId!==null&&!s.places.some(p=>p.id===placeId))return result(false,"not_found","Lieu introuvable.");
  if((asset.placeId??null)===placeId)return result(true,"unchanged","L'équipement est déjà à cet emplacement.",{asset:clone(asset)});
  const ports=new Set(asset.ports.map(p=>p.id));
  if(s.cables.some(c=>c.ends.some(end=>end&&ports.has(end.portId))))
   return result(false,"asset_connected","Débrancher tous les câbles de l'équipement avant de changer son lieu.");
  asset.placeId=placeId;s.revision++;
  return result(true,"asset_moved","Localisation de l'équipement modifiée.",{asset:clone(asset)});
 }
 const occupied=(id,key)=>s.assets.some(a=>a.profileId===id&&!empty(a.values[key]));
 function createProfile(name){
  name=trim(name);if(!name)return result(false,"invalid_name","Nom de profil obligatoire.");
  const p={id:"profile-"+s.nextProfile++,name,fields:[],portGroups:[],networkCapabilities:[],poe:false};s.profiles.push(p);s.revision++;
  return result(true,"created","Profil créé.",{profile:clone(p)});
 }
 function duplicateProfile(id,name){
  const p=getP(id);if(!p)return result(false,"not_found","Profil introuvable.");
  const r=createProfile(name||p.name+" (copie)");if(!r.success)return r;
  const target=getP(r.profile.id);target.fields=clone(p.fields);target.portGroups=clone(p.portGroups).map(g=>({...g,id:"portgroup-"+s.nextPortGroup++}));target.networkCapabilities=clone(p.networkCapabilities);target.poe=p.poe;s.revision++;
  return result(true,"duplicated","Profil dupliqué.",{profile:clone(target)});
 }
 function renameProfile(id,name){
  const p=getP(id);if(!p)return result(false,"not_found","Profil introuvable.");
  if(!trim(name))return result(false,"invalid_name","Nom de profil obligatoire.");
  p.name=trim(name);s.revision++;return result(true,"renamed","Profil renommé.");
 }
 function setProfileNetworkCapability(id,capability,enabled){
  const p=getP(id);
  if(!p)return result(false,"not_found","Profil introuvable.");
  if(!supportedNetworkCapabilities.includes(capability)||typeof enabled!=="boolean")
   return result(false,"invalid_network_capability","Capacité ou état réseau invalide.");
  if(!enabled&&capability==="vlan"&&p.networkCapabilities.includes("inter-vlan-routing"))
   return result(false,"capability_dependency","Désactiver d’abord la capacité de routage inter-VLAN.");
  if(enabled&&capability==="wifi-ap"&&(!p.portGroups.some(g=>g.type==="wifi")||!p.portGroups.some(g=>g.type==="ethernet-rj45")))return result(false,"wifi_requires_ports","Un point d’accès exige un port Wi-Fi et un port Ethernet.");
   if(enabled&&capability==="ipv4-router"&&(p.networkCapabilities.includes("ethernet-switching")||p.portGroups.filter(g=>g.type==="ethernet-rj45"||g.type==="ethernet-fibre").reduce((n,g)=>n+g.count,0)<2))return result(false,"router_dependency","Un routeur exige deux ports Ethernet et ne contient pas de switch LAN intégré.");
   if(enabled&&capability==="ethernet-switching"&&p.networkCapabilities.includes("ipv4-router"))return result(false,"router_dependency","Routeur et commutation incompatibles.");
   if(enabled&&capability==="dhcp-server"&&!p.networkCapabilities.includes("inter-vlan-routing")&&
     !p.networkCapabilities.includes("ipv4-router"))
   return result(false,"capability_dependency","Serveur DHCP nécessite un switch L3 ou un routeur.");
  if(!enabled&&capability==="ipv4-router"&&p.networkCapabilities.includes("dhcp-server"))
   return result(false,"capability_dependency","Retirer d'abord le serveur DHCP du routeur.");
  if(!enabled&&capability==="inter-vlan-routing"&&p.networkCapabilities.includes("dhcp-server"))
   return result(false,"capability_dependency","Retirer d'abord la capacité serveur DHCP.");
  if(enabled&&capability==="inter-vlan-routing"&&!p.networkCapabilities.includes("vlan"))
   return result(false,"capability_dependency","Le routage inter-VLAN nécessite la capacité VLAN.");
  if(!enabled&&capability==="ethernet-switching"&&p.poe)
   return result(false,"capability_dependency","Désactiver d'abord PoE sur le modèle de switch.");
  if(!enabled&&capability==="ethernet-switching"&&p.networkCapabilities.includes("vlan"))
   return result(false,"capability_dependency","Désactiver d’abord la capacité VLAN.");
  if(enabled&&capability==="vlan"&&!p.networkCapabilities.includes("ethernet-switching"))
   return result(false,"capability_dependency","La capacité VLAN nécessite la commutation Ethernet.");
  // Un switch ne peut relayer DHCP que s'il possède le routage L3.
  // Les profils non-switch conservent IP Helper pour les futurs routeurs.
  if(enabled&&capability==="ethernet-switching"&&p.networkCapabilities.includes("ip-helper")&&
     !p.networkCapabilities.includes("inter-vlan-routing"))
   return result(false,"capability_dependency","Retirer IP Helper avant de créer un switch sans capacité L3.");
  if(enabled&&capability==="ip-helper"&&p.networkCapabilities.includes("ethernet-switching")&&
     !p.networkCapabilities.includes("inter-vlan-routing"))
   return result(false,"capability_dependency","IP Helper sur un switch nécessite un modèle L3.");
  if(!enabled&&capability==="inter-vlan-routing"&&p.networkCapabilities.includes("ethernet-switching")&&
     p.networkCapabilities.includes("ip-helper"))
   return result(false,"capability_dependency","Retirer d'abord IP Helper avant de supprimer le routage L3.");
  if(enabled&&capability==="ip-helper"&&
     p.portGroups.filter(g=>g.type==="ethernet-rj45"||g.type==="ethernet-fibre").reduce((n,g)=>n+g.count,0)<1)
   return result(false,"insufficient_ethernet_ports","IP Helper nécessite une interface Ethernet.");
  if(enabled && (capability==="ethernet-switching"||capability==="vlan") &&
     p.portGroups.filter(g=>g.type==="ethernet-rj45").reduce((n,g)=>n+g.count,0)<2)
   return result(false,"insufficient_ethernet_ports","Deux ports Ethernet RJ45 au minimum sont nécessaires.");
  const active=p.networkCapabilities.includes(capability);
  if(active===enabled)return result(true,"unchanged","Capacité déjà dans cet état.");
  p.networkCapabilities=enabled?[...p.networkCapabilities,capability]:p.networkCapabilities.filter(x=>x!==capability);
  s.revision++;
  return result(true,"capability_updated","Capacité du profil modifiée pour les futurs équipements.",{profile:clone(p)});
 }
 // Caractéristique matérielle du switch, jamais un réglage de port.
 function setProfilePoe(id,enabled){
  const p=getP(id);
  if(!p)return result(false,"not_found","Profil introuvable.");
  if(typeof enabled!=="boolean")return result(false,"invalid_poe","PoE doit être oui ou non.");
  if(!p.networkCapabilities.includes("ethernet-switching"))
   return result(false,"not_switch","PoE réservé aux profils de switch.");
  if(p.poe===enabled)return result(true,"unchanged","PoE déjà dans cet état.",{profile:clone(p)});
  p.poe=enabled;s.revision++;
  return result(true,"poe_updated","Propriété matérielle PoE du modèle enregistrée.",{profile:clone(p)});
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
   if(p.networkCapabilities.includes("ipv4-router")&&p.portGroups.filter((g,j)=>j!==i&&(g.type==="ethernet-rj45"||g.type==="ethernet-fibre")).reduce((n,g)=>n+g.count,0)<2)return result(false,"router_requires_ports","Il faut conserver deux ports Ethernet au minimum.");
  if(p.networkCapabilities.includes("ethernet-switching") &&
     p.portGroups.filter((g,j)=>j!==i&&g.type==="ethernet-rj45").reduce((n,g)=>n+g.count,0)<2)
   return result(false,"capability_requires_ports","Désactiver la commutation avant de retirer ces ports.");
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
  if(a.networkCapabilities.includes("ipv4-router")&&(g.type==="ethernet-rj45"||g.type==="ethernet-fibre"))return result(false,"router_ports_fixed","Nombre de ports Ethernet du routeur figé.");
   const extensionId="extension-"+s.nextPortGroup++;
  const ports=buildPorts([{...g,id:extensionId}],"extension");
  a.ports.push(...ports);
  if(a.vlanConfig)for(const p of ports.filter(isRj45))a.vlanConfig.ports[p.id]={mode:"access",vlanId:"vlan-1"};
  s.revision++;
  return result(true,"extension_added","Carte ou interface d’extension ajoutée.",{extensionId,ports:clone(ports)});
 }
 function removeExtension(assetId,extensionId){
  const a=getA(assetId);
  if(!a)return result(false,"not_found","Équipement introuvable.");
  const ports=a.ports.filter(p=>p.origin==="extension"&&p.groupId===extensionId);
  if(!ports.length)return result(false,"not_found","Extension introuvable.");
  if(ports.some(p=>p.connectedCableIds?.length))return result(false,"extension_connected","Débrancher les câbles avant de retirer l’extension.");
  a.ports=a.ports.filter(p=>p.groupId!==extensionId);
  if(a.vlanConfig)for(const p of ports.filter(isRj45))delete a.vlanConfig.ports[p.id];
  s.revision++;
  return result(true,"extension_removed","Extension retirée.");
 }

 const findPort=portId=>{
  for(const asset of s.assets){
   const port=asset.ports.find(p=>p.id===portId);
   if(port)return {asset,port};
  }
  for(const infrastructure of [...s.wallOutlets,...s.panels])
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
 function createPanel(raw={}){
  const name=trim(raw.name),placeId=raw.placeId,count=Number(raw.count),start=Number(raw.start),prefix=trim(raw.prefix??"");
  if(!name||typeof placeId!=="string"||!s.places.some(p=>p.id===placeId)||
     !Number.isInteger(count)||count<1||count>512||!Number.isInteger(start)||start<0||start>9999||
     !/^[A-Za-z0-9_-]{0,20}$/.test(prefix)||start+count>10000)
   return result(false,"invalid_panel","Nom, lieu, numérotation ou capacité du panneau incorrects.");
  if(s.panels.some(p=>p.placeId===placeId&&p.name===name))
   return result(false,"duplicate_name","Un panneau de ce nom existe déjà dans ce lieu.");
  const labels=Array.from({length:count},(_,i)=>prefix+String(start+i));
  const panel={id:"panel-"+s.nextInfrastructure++,name,placeId,ports:labels.map(makeSlot)};
  s.panels.push(panel);s.revision++;
  return result(true,"panel_created","Panneau de brassage créé.",{panel:clone(panel)});
 }
 function movePanelToPlace(panelId,placeId){
  const panel=s.panels.find(p=>p.id===panelId);
  if(!panel)return result(false,"not_found","Panneau introuvable.");
  if(typeof placeId!=="string"||!s.places.some(p=>p.id===placeId))
   return result(false,"not_found","Lieu introuvable.");
  if(panel.placeId===placeId)return result(true,"unchanged","Le panneau est déjà dans ce lieu.",{panel:clone(panel)});
  const ports=new Set(panel.ports.flatMap(slot=>[slot.front.id,slot.back.id]));
  if(s.cables.some(c=>c.ends.some(e=>e&&ports.has(e.portId))))
   return result(false,"panel_connected","Débrancher les câbles du panneau avant de le déplacer.");
  panel.placeId=placeId;s.revision++;
  return result(true,"panel_moved","Panneau déplacé.",{panel:clone(panel)});
 }
 function removePanel(panelId){
  const index=s.panels.findIndex(p=>p.id===panelId);
  if(index<0)return result(false,"not_found","Panneau introuvable.");
  const panel=s.panels[index],ports=new Set(panel.ports.flatMap(slot=>[slot.front.id,slot.back.id]));
  if(s.cables.some(c=>c.ends.some(e=>e&&ports.has(e.portId))))
   return result(false,"panel_connected","Débrancher les câbles du panneau avant de le supprimer.");
  s.panels.splice(index,1);s.revision++;
  return result(true,"panel_removed","Panneau supprimé.",{panelId});
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
   ...[...s.wallOutlets,...s.panels].flatMap(obj=>obj.ports.flatMap(slot=>
    ["front","back"].map(side=>({
     portId:slot[side].id,infrastructureId:obj.id,assetName:obj.name+" ("+(obj.placeId?placePath(obj.placeId):obj.location)+")",
     portName:slot.label+" / "+(side==="front"?"avant":"arrière"),
     portType:"ethernet-rj45",socket:"rj45-female",occupied:!!occupiedBy(slot[side].id),
     side,slotId:slot.id
    }))
   ))
  ]);
 }
 // Graphe de continuité strictement physique. Une prise et un port de panneau
 // relient leurs deux faces, mais un switch ne crée aucun lien automatique entre ports.
 function explorePhysicalPath(fromPortId,toPortId){
  const points=listCablePoints(),byId=new Map(points.map(p=>[p.portId,p]));
  if(!byId.has(fromPortId)||!byId.has(toPortId))
   return result(false,"not_found","Point de raccordement introuvable.");
  const neighbors=new Map(points.map(p=>[p.portId,[]]));
  const link=(a,b,kind,id)=>{
   if(!neighbors.has(a)||!neighbors.has(b))return;
   neighbors.get(a).push({to:b,kind,id});
   neighbors.get(b).push({to:a,kind,id});
  };
  // Continuité interne passive de la prise ou du connecteur du panneau.
  for(const obj of [...s.wallOutlets,...s.panels])
   for(const slot of obj.ports)link(slot.front.id,slot.back.id,"passage",slot.id);
  // Les deux bouts doivent être raccordés : câble à bout libre = pas de liaison.
  for(const cable of s.cables)
   if(cable.ends[0]?.portId&&cable.ends[1]?.portId)
    link(cable.ends[0].portId,cable.ends[1].portId,"cable",cable.id);
  const scan=start=>{
   const queue=[start],previous=new Map([[start,null]]),links=new Map();
   for(let index=0;index<queue.length;index++){
    const current=queue[index];
    for(const edge of neighbors.get(current)){
     if(previous.has(edge.to))continue;
     previous.set(edge.to,current);links.set(edge.to,edge);queue.push(edge.to);
    }
   }
   return {queue,previous,links};
  };
  const left=scan(fromPortId),right=scan(toPortId);
  const describe=id=>({
   ...byId.get(id),
   // Le statut de terminaison libre/occupée est celui du point de câble,
   // non la disponibilité de passage interne avant/arrière.
  });
  let path=[],segments=[];
  if(left.previous.has(toPortId)){
   const reverse=[];let cursor=toPortId;
   while(cursor!==null){reverse.push(cursor);cursor=left.previous.get(cursor);}
   const ids=reverse.reverse();
   path=ids.map(describe);
   segments=ids.slice(1).map((id,i)=>({
    fromPortId:ids[i],toPortId:id,
    kind:left.links.get(id).kind,id:left.links.get(id).id
   }));
  }
  const terminalPoints=scanResult=>scanResult.queue.filter(id=>
   !(neighbors.get(id)||[]).some(edge=>!scanResult.previous.has(edge.to))
   && (neighbors.get(id)||[]).filter(edge=>scanResult.previous.has(edge.to)).length<=1
  );
  return result(true,"explored",path.length?"Chemin physique continu trouvé.":"Aucun chemin physique continu entre ces deux points.",{
   connected:path.length>0,path,segments,
   fromReachable:left.queue.map(describe),
   toReachable:right.queue.map(describe),
   // Ces bornes décrivent les parcours observés ; elles ne suggèrent aucun câble à ajouter.
   fromEnds:terminalPoints(left).map(describe),
   toEnds:terminalPoints(right).map(describe)
  });
 }
 function createAsset(profileId,info){
  const p=getP(profileId);if(!p)return result(false,"not_found","Profil introuvable.");
  const name=trim(info?.name);if(!name)return result(false,"invalid_name","Nom de matériel obligatoire.");
  const status=info.status||"En service";
  if(!["En service","Hors service","En stock"].includes(status))return result(false,"invalid_status","Statut incorrect.");
  const a={id:"asset-"+s.nextAsset++,profileId,name,manufacturer:trim(info.manufacturer),model:trim(info.model),serialNumber:trim(info.serialNumber),status,location:trim(info.location),placeId:null,reservable:!!info.reservable,values:Object.fromEntries(p.fields.map(f=>[f.key,null])),ports:buildPorts(p.portGroups,"integrated"),networkCapabilities:clone(p.networkCapabilities),poe:p.poe};
  if(a.networkCapabilities.includes("vlan")){
   a.vlanConfig=vlanDefault(a);
   a.managementConfig=managementDefault(a);
  }
  if(a.networkCapabilities.includes("inter-vlan-routing"))
   a.routingConfig={assetId:a.id,routingEnabled:false,interfaces:{}};
  if(a.networkCapabilities.includes("ip-helper"))
   a.ipHelperConfig={assetId:a.id,helpers:{}};
  if(a.networkCapabilities.includes("dhcp-server"))
   a.dhcpServerConfig={assetId:a.id,enabled:false,pools:[]};
  if(a.networkCapabilities.includes("ipv4-router"))a.routerConfig=routerDefaults(a);
   if(a.networkCapabilities.includes("wifi-ap")){a.wifiConfig=wifiDefault(a);a.managementConfig??=managementDefault(a);}
   s.assets.push(a);s.revision++;return result(true,"asset_created","Matériel créé.",{asset:clone(a)});
 }
 function setAssetWifiConfig(id,config){
  const a=getA(id);if(!a?.networkCapabilities.includes("wifi-ap"))return result(false,"capability_missing","Point d’accès Wi-Fi introuvable.");
  if(!validWifiConfig(a,config))return result(false,"invalid_wifi_config","Configuration Wi-Fi refusée sans modification.");
  a.wifiConfig=clone(config);s.revision++;return result(true,"wifi_config_updated","Configuration Wi-Fi enregistrée.",{config:clone(config)});
 }
 function setAssetRouterConfig(id,config){
  const a=getA(id);if(!a?.networkCapabilities.includes("ipv4-router"))return result(false,"capability_missing","Routeur introuvable.");
  if(!routerValid(a,config))return result(false,"invalid_router_config","Configuration des interfaces refusée.");
  const candidate={...a,routerConfig:config};
  if(a.dhcpServerConfig&&!validAssetDhcpServer(candidate,a.dhcpServerConfig))
   return result(false,"dhcp_pool_references_interface","Plage DHCP liée à une interface : corriger la plage avant de modifier le port.");
  if(a.ipHelperConfig&&!validIpHelperConfiguration(candidate,a.ipHelperConfig))
   return result(false,"helper_references_interface","IP Helper incompatible avec la nouvelle interface.");
  a.routerConfig=clone(config);s.revision++;return result(true,"router_updated","Interfaces enregistrées.",{config:clone(a.routerConfig)});
 }
 function setAssetDhcpServerConfig(id,config){
  const a=getA(id);
  if(!a)return result(false,"not_found","Équipement introuvable.");
  if(!validAssetDhcpServer(a,config))
   return result(false,"invalid_dhcp_config","Configuration du serveur DHCP refusée.");
  a.dhcpServerConfig=clone(config);s.revision++;
  return result(true,"dhcp_config_updated","Configuration DHCP enregistrée.",{config:clone(config)});
 }
 function setAssetManagementConfig(id,config){
  const a=getA(id);
  if(!a)return result(false,"not_found","Équipement introuvable.");
  if(!validManagement(a,config))
   return result(false,"invalid_management","Configuration IP de gestion refusée.");
  a.managementConfig=clone(config);s.revision++;
  return result(true,"management_updated","Adresse IP de gestion enregistrée.",{config:clone(a.managementConfig)});
 }
 function setAssetVlanConfig(id,config){
  const a=getA(id);if(!a)return result(false,"not_found","Équipement introuvable.");
  if(!validVlanConfiguration(a,config))return result(false,"invalid_vlan_config","Configuration VLAN refusée sans modification.");
  const candidate={...a,vlanConfig:config};
  if(a.dhcpServerConfig&&!validAssetDhcpServer(candidate,a.dhcpServerConfig))
   return result(false,"dhcp_pool_references_vlan","Configuration DHCP liée au VLAN.");
  if(a.routingConfig&&!validRoutingConfiguration(candidate,a.routingConfig))
   return result(false,"routing_references_vlan","Interface L3 liée au VLAN : utiliser la renumérotation avec report.");
  if(a.ipHelperConfig&&!validIpHelperConfiguration(candidate,a.ipHelperConfig))
   return result(false,"helper_references_vlan","IP Helper lié au VLAN : utiliser la renumérotation avec report.");
  a.vlanConfig=clone(config);s.revision++;
  return result(true,"vlan_config_updated","Configuration VLAN enregistrée.",{config:clone(a.vlanConfig)});
 }
 // Modifier un VLAN et ses références métier ensemble, ou ne rien changer.
 function updateAssetVlanDefinition(id,vlanId,number,name){
  const a=getA(id);
  if(!a?.vlanConfig)return result(false,"not_found","Switch administrable introuvable.");
  const current=a.vlanConfig.vlans.find(v=>v.id===vlanId);
  if(!current)return result(false,"vlan_missing","VLAN introuvable.");
  if(!Number.isInteger(number)||number<1||number>4094||
     typeof name!=="string"||!trim(name))
   return result(false,"invalid_vlan","Numéro ou nom de VLAN invalide.");
  if(current.number===1&&number!==1)
   return result(false,"default_vlan","Le VLAN 1 ne peut pas être renuméroté.");
  if(a.vlanConfig.vlans.some(v=>v.id!==vlanId&&v.number===number))
   return result(false,"vlan_number_exists","Ce numéro de VLAN est déjà utilisé.");
  const oldNumber=current.number,draft=clone(a);
  const selected=draft.vlanConfig.vlans.find(v=>v.id===vlanId);
  selected.number=number;selected.name=trim(name);
  if(oldNumber!==number){
   const from=String(oldNumber),to=String(number),oldHelper="vlan:"+from,newHelper="vlan:"+to;
   if(draft.routingConfig&&Object.hasOwn(draft.routingConfig.interfaces,from)){
    if(Object.hasOwn(draft.routingConfig.interfaces,to))
     return result(false,"routing_conflict","Une interface utilise déjà le nouveau numéro de VLAN.");
    draft.routingConfig.interfaces[to]=draft.routingConfig.interfaces[from];
    delete draft.routingConfig.interfaces[from];
   }
   if(draft.ipHelperConfig&&Object.hasOwn(draft.ipHelperConfig.helpers,oldHelper)){
    if(Object.hasOwn(draft.ipHelperConfig.helpers,newHelper))
     return result(false,"helper_conflict","Un IP Helper utilise déjà le nouveau numéro de VLAN.");
    draft.ipHelperConfig.helpers[newHelper]=draft.ipHelperConfig.helpers[oldHelper];
    delete draft.ipHelperConfig.helpers[oldHelper];
   }
   for(const pool of draft.dhcpServerConfig?.pools??[])
    if(pool.vlanNumber===oldNumber)pool.vlanNumber=number;
  }
  if(!validVlanConfiguration(draft,draft.vlanConfig)||
     draft.routingConfig&&!validRoutingConfiguration(draft,draft.routingConfig)||
     draft.ipHelperConfig&&!validIpHelperConfiguration(draft,draft.ipHelperConfig)||
     draft.dhcpServerConfig&&!validAssetDhcpServer(draft,draft.dhcpServerConfig))
   return result(false,"vlan_update_invalid","Modification VLAN refusée sans changement.");
  a.vlanConfig=draft.vlanConfig;
  if(draft.routingConfig)a.routingConfig=draft.routingConfig;
  if(draft.ipHelperConfig)a.ipHelperConfig=draft.ipHelperConfig;
  if(draft.dhcpServerConfig)a.dhcpServerConfig=draft.dhcpServerConfig;
  s.revision++;
  return result(true,"vlan_updated","VLAN mis à jour et références associées conservées.",{vlan:clone(selected)});
 }
 function removeAssetVlanDefinition(id,vlanId){
  const a=getA(id);
  if(!a?.vlanConfig)return result(false,"not_found","Switch administrable introuvable.");
  const v=a.vlanConfig.vlans.find(x=>x.id===vlanId);
  if(!v)return result(false,"vlan_missing","VLAN introuvable.");
  if(v.number===1)return result(false,"default_vlan","Le VLAN 1 ne peut pas être supprimé.");
  if(Object.values(a.vlanConfig.ports).some(p=>
    p.mode==="access"?p.vlanId===v.id:p.allowedVlanIds?.includes(v.id)))
   return result(false,"vlan_used_by_ports","VLAN utilisé par un port : modifier d’abord son affectation.");
  if(a.routingConfig&&Object.hasOwn(a.routingConfig.interfaces,String(v.number)))
   return result(false,"vlan_used_by_routing","VLAN utilisé par une interface IPv4 L3.");
  if(a.ipHelperConfig&&Object.hasOwn(a.ipHelperConfig.helpers,"vlan:"+v.number))
   return result(false,"vlan_used_by_helper","VLAN utilisé par IP Helper.");
  if(a.dhcpServerConfig?.pools.some(pool=>pool.vlanNumber===v.number))
   return result(false,"vlan_used_by_dhcp","VLAN utilisé par une plage DHCP.");
  const next=clone(a.vlanConfig);
  next.vlans=next.vlans.filter(x=>x.id!==v.id);
  if(!validVlanConfiguration({...a,vlanConfig:next},next))
   return result(false,"invalid_vlan_config","Suppression VLAN refusée.");
  a.vlanConfig=next;s.revision++;
  return result(true,"vlan_removed","VLAN supprimé.",{vlanId});
 }
 function setAssetRoutingConfig(id,config){
  const asset=getA(id);
  if(!asset)return result(false,"not_found","Équipement introuvable.");
  if(!validRoutingConfiguration(asset,config))
   return result(false,"invalid_routing_config","Configuration du routage refusée sans modification.");
  asset.routingConfig=clone(config);s.revision++;
  return result(true,"routing_config_updated","Configuration du routage enregistrée.",{config:clone(asset.routingConfig)});
 }
 function setAssetIpHelperConfig(id,config){
  const a=getA(id);
  if(!a)return result(false,"not_found","Équipement introuvable.");
  if(!validIpHelperConfiguration(a,config))
   return result(false,"invalid_ip_helper_config","Configuration IP Helper refusée sans modification.");
  a.ipHelperConfig=clone(config);s.revision++;
  return result(true,"ip_helper_config_updated","Configuration IP Helper enregistrée.",{config:clone(a.ipHelperConfig)});
 }
 function removeAsset(id){
  const index=s.assets.findIndex(a=>a.id===id);
  if(index<0)return result(false,"not_found","Équipement introuvable.");
  const asset=s.assets[index];
  const ports=new Set(asset.ports.map(p=>p.id));
  // Les câbles sont la source de vérité. Une ancienne copie de
  // connectedCableIds ne doit pas permettre une suppression dangereuse.
  if(s.cables.some(c=>c.ends.some(e=>e&&ports.has(e.portId))))
   return result(false,"asset_connected","Débrancher tous les câbles des ports de cet équipement avant de le supprimer.");
  s.assets.splice(index,1);s.revision++;
  return result(true,"asset_removed","Équipement supprimé. Les câbles restent dans l’inventaire.",{assetId:id});
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
 return {createPlace,moveAssetToPlace,listPlaces:()=>clone(s.places),getPlace:id=>clone(s.places.find(p=>p.id===id)||null),createProfile,duplicateProfile,renameProfile,setProfileNetworkCapability,setProfilePoe,addField,editField,removeField,moveField,addPortGroup,removePortGroup,addExtension,removeExtension,createWallOutlet,createPanel,movePanelToPlace,removePanel,createCable,connectCableEnd,disconnectCableEnd,updateCableConnectors,deleteCable,listCablePoints,explorePhysicalPath,createAsset,setAssetWifiConfig,setAssetRouterConfig,setAssetDhcpServerConfig,setAssetManagementConfig,setAssetVlanConfig,updateAssetVlanDefinition,removeAssetVlanDefinition,setAssetRoutingConfig,setAssetIpHelperConfig,removeAsset,setAssetField,updateAsset,
 listWallOutlets:()=>clone(s.wallOutlets),listPanels:()=>clone(s.panels),getPanel:id=>clone(s.panels.find(p=>p.id===id)||null),listCables:()=>clone(s.cables),getCable:id=>clone(s.cables.find(x=>x.id===id)||null),cableConnectors:()=>[...cableConnectors],listProfiles:()=>clone(s.profiles),listAssets:()=>clone(s.assets),getProfile:id=>clone(getP(id)||null),getAsset:id=>clone(getA(id)||null),exportState:()=>clone(s)};
}
export const restoreAssetRegistry=saved=>createAssetRegistry(saved);

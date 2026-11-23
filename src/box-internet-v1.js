/* R2D3 box Internet : chemin LAN -> routeur -> WAN avec PAT sortant V1.
 * Infrastructure opérateur implicite ; aucun câble WAN ni FAI matériel.
 * Clients DHCP issus du Core partagé ; endpoints Internet explicitement fournis
 * par le scénario, jamais supposés répondre.
 */
import {createBoxLanDhcpSession} from "./box-lan-dhcp-v1.js";
const fail=(code,message)=>({success:false,code,message});
const ipNumber=v=>{
 if(typeof v!=="string"||!/^\d{1,3}(\.\d{1,3}){3}$/.test(v))return null;
 const octets=v.split(".").map(Number);
 return octets.some(x=>x>255)?null:octets.reduce((n,x)=>((n*256+x)>>>0),0);
};
const sameSubnet=(a,b,prefix)=>{
 const x=ipNumber(a),y=ipNumber(b);
 return x!==null&&y!==null&&Number.isInteger(prefix)&&prefix>=1&&prefix<=30&&
  (x&((0xffffffff<<(32-prefix))>>>0))===(y&((0xffffffff<<(32-prefix))>>>0));
};
const ports={http:80,https:443,dns:53};
const clone=x=>JSON.parse(JSON.stringify(x));
export function createBoxInternetSession({registry,boxId,clients=[],services=[]}={}){
 const box=registry?.getAsset?.(boxId);
 if(!box?.boxConfig)return fail("box_missing","Box introuvable.");
 if(box.status!=="En service")return fail("box_offline","Box hors service.");
 if(box.boxConfig.mode==="bridge")return fail("bridge_mode","Routage et PAT sortant désactivés en mode bridge.");
 if(!registry.getBoxWanEffective)return fail("wan_missing","Adressage WAN non disponible.");
 const lan=createBoxLanDhcpSession({registry,boxId,clients});
 if(!lan.success)return lan;
 if(!Array.isArray(services)||services.some(s=>!s||typeof s.id!=="string"||
   !s.id||ipNumber(s.address)===null||!["http","https","dns"].includes(s.kind)||
   typeof s.available!=="boolean"))
   return fail("service_catalog","Services Internet invalides.");
 const keys=services.map(s=>s.address+":"+s.kind);
 if(new Set(keys).size!==keys.length)return fail("service_duplicate","Services Internet ambigus.");
 const nat=new Map();
 let nextPort=40000;
 function request({clientId,targetAddress,service="http",sourcePort=50000}={}){
  const current=registry.getAsset(boxId);
  if(!current||current.status!=="En service")return fail("box_offline","Box hors service.");
  if(current.boxConfig.mode==="bridge")return fail("bridge_mode","Routage et PAT sortant désactivés en mode bridge.");
  const wan=registry.getBoxWanEffective(boxId);
  if(!wan||ipNumber(wan.address)===null||ipNumber(wan.gateway)===null||
     !sameSubnet(wan.address,wan.gateway,wan.prefix))
    return fail("wan_invalid","WAN sans IPv4/passerelle valide.");
  if(JSON.stringify(current.boxConfig.wan)!==JSON.stringify(box.boxConfig.wan)||
     JSON.stringify(current.boxConfig.lan)!==JSON.stringify(box.boxConfig.lan))
    return fail("out_of_sync","Configuration de la box modifiée : recréer la session.");
  if(!["http","https","dns"].includes(service)||ipNumber(targetAddress)===null||
     !Number.isInteger(sourcePort)||sourcePort<1024||sourcePort>65535)
    return fail("request_invalid","Destination, service ou port source invalide.");
  const obtained=lan.request(clientId);
  if(!obtained.success)return obtained;
  if(!sameSubnet(obtained.address,current.boxConfig.lan.address,current.boxConfig.lan.prefix)||
     obtained.gateway!==current.boxConfig.lan.address||
     !["lease","lease-retained"].includes(obtained.code))
    return fail("client_network","PC sans adresse LAN et passerelle DHCP valides.");
  const client=registry.getAsset(clientId);
  if(!client||client.status!=="En service")return fail("client_offline","PC hors service.");
  // Le Core peut conserver un bail après déconnexion : il ne donne pas un accès Internet.
  const admission=lan.clients.find(x=>x.assetId===clientId);
  if(!admission)return fail("client_missing","PC absent de la session LAN.");
  // Un PC peut disposer simultanément de RJ45 et de Wi-Fi : seul le
  // support choisi pour cette session doit servir à valider son accès.
  if(admission.medium==="ethernet"){
   const cp=client.ports.filter(p=>p.type==="ethernet-rj45");
   const linked=cp.flatMap(port=>current.boxConfig.ports.lanPortIds.filter(p=>
     registry.explorePhysicalPath(port.id,p).connected).map(lanPortId=>({port,lanPortId})));
   if(linked.length!==1)
    return fail(linked.length?"ambiguous_lan":"link_down",
     linked.length?"Plusieurs ports Ethernet du PC sont raccordés au LAN.":"PC non raccordé au LAN.");
  }
  const endpoint=services.find(s=>s.address===targetAddress&&s.kind===service);
  if(!endpoint)return fail("service_unknown","Aucun service Internet simulé à cette destination.");
  if(!endpoint.available)return fail("service_offline","Service Internet simulé arrêté.");
  const key=[clientId,obtained.address,sourcePort,targetAddress,service].join("|");
  if(!nat.has(key))nat.set(key,nextPort++);
  const externalPort=nat.get(key);
  return {success:true,code:"internet_service_reached",clientId,service,
    target:{id:endpoint.id,address:targetAddress,port:ports[service]},
    route:{gateway:obtained.gateway,wanGateway:wan.gateway},
    nat:{protocol:service==="dns"?"udp":"tcp",internalAddress:obtained.address,
      internalPort:sourcePort,externalAddress:wan.address,externalPort},
    reason:"Service distant atteint par routage IPv4 et PAT sortant simulés."};
 }
 return {success:true,code:"internet_session",boxId,
  request,lanSession:lan,listNat:()=>[...nat].map(([key,externalPort])=>({key,externalPort}))};
}

/* Accès Internet en mode bridge : passage logique strict LAN 1 <-> WAN.
 * L'IPv4 du PC est une configuration explicite du scénario, sans DHCP de box,
 * sans adresse inventée et sans traduction NAT/PAT.
 */
export function createBoxBridgeInternetSession({registry,boxId,clients=[],services=[]}={}){
 const box=registry?.getAsset?.(boxId);
 if(!box?.boxConfig)return fail("box_missing","Box introuvable.");
 if(box.status!=="En service")return fail("box_offline","Box hors service.");
 if(box.boxConfig.mode!=="bridge")return fail("router_mode","La box doit être en mode Bridge.");
 if(!Array.isArray(clients)||clients.length!==1||!clients[0]?.assetId)
  return fail("clients_invalid","Indiquer un seul PC ou routeur sur LAN 1.");
 if(!Array.isArray(services)||services.some(s=>!s||typeof s.id!=="string"||!s.id||
    ipNumber(s.address)===null||!["http","https","dns"].includes(s.kind)||
    typeof s.available!=="boolean"))
  return fail("service_catalog","Services Internet invalides.");
 if(new Set(services.map(s=>s.address+":"+s.kind)).size!==services.length)
  return fail("service_duplicate","Services Internet ambigus.");
 const {assetId:clientId}=clients[0];
 const firstWan=registry.getBoxWanEffective?.(boxId);
 const firstLan1=box.boxConfig.ports.lanPortIds[0];
 function request({clientId:requestedId=clientId,targetAddress,service="http",
   sourcePort=50000,clientIpv4}={}){
  const current=registry.getAsset(boxId);
  if(!current||current.status!=="En service")return fail("box_offline","Box hors service.");
  if(current.boxConfig.mode!=="bridge")return fail("bridge_mode_changed","Box repassée en mode Routeur.");
  if(requestedId!==clientId)return fail("client_missing","Client absent de la session Bridge.");
  const wan=registry.getBoxWanEffective?.(boxId);
  if(!wan||ipNumber(wan.address)===null||ipNumber(wan.gateway)===null||
      !sameSubnet(wan.address,wan.gateway,wan.prefix))
   return fail("wan_invalid","WAN sans adressage valide.");
  if(JSON.stringify(wan)!==JSON.stringify(firstWan))
   return fail("out_of_sync","Adressage WAN modifié : recréer la session.");
  if(!["http","https","dns"].includes(service)||ipNumber(targetAddress)===null||
      !Number.isInteger(sourcePort)||sourcePort<1024||sourcePort>65535)
   return fail("request_invalid","Service, destination ou port source invalide.");
  const client=registry.getAsset(clientId);
  if(!client||client.status!=="En service"||client.id===boxId)
   return fail("client_offline","PC ou routeur absent ou hors service.");
  const cp=client.ports.filter(p=>p.type==="ethernet-rj45");
  if(!cp.length)return fail("client_port","Équipement sans port Ethernet.");
  const matches=cp.flatMap(port=>current.boxConfig.ports.lanPortIds.filter(id=>
    registry.explorePhysicalPath(port.id,id).connected).map(lanPortId=>({port,lanPortId})));
  if(matches.length!==1)return fail(matches.length?"ambiguous_lan":"link_down",
    matches.length?"Plusieurs raccordements Ethernet vers la box.":"Aucun lien LAN valide.");
  if(matches[0].lanPortId!==firstLan1)
   return fail("bridge_port_inactive","Seul LAN 1 est actif en mode Bridge.");
  if(!clientIpv4||ipNumber(clientIpv4.address)===null||
     !Number.isInteger(clientIpv4.prefix)||clientIpv4.prefix<1||clientIpv4.prefix>30||
     ipNumber(clientIpv4.gateway)===null)
   return fail("client_ipv4_invalid","Configuration IPv4 statique du client invalide.");
  if(clientIpv4.prefix!==wan.prefix||
     !sameSubnet(clientIpv4.address,wan.address,wan.prefix)||
     clientIpv4.address!==wan.address||clientIpv4.address===wan.gateway||
     clientIpv4.gateway!==wan.gateway)
   return fail("client_network","Le PC doit reprendre l’adresse WAN de la box, son préfixe et sa passerelle.");
  if(!Array.isArray(clientIpv4.dns)||clientIpv4.dns.length!==wan.dns.length||
      clientIpv4.dns.some((x,i)=>ipNumber(x)===null||x!==wan.dns[i]))
   return fail("client_dns","Le PC doit reprendre les serveurs DNS WAN de la box.");
  // En mode bridge, l’IPv4 WAN est transmise au client : la box ne la consomme pas.
  // Le DNS est vérifié comme paramètre statique ; aucun échange DNS réel n’est inventé.
  const endpoint=services.find(s=>s.address===targetAddress&&s.kind===service);
  if(!endpoint)return fail("service_unknown","Service Internet simulé inconnu.");
  if(!endpoint.available)return fail("service_offline","Service Internet simulé arrêté.");
  return {success:true,code:"bridge_internet_service_reached",clientId,service,
    target:{id:endpoint.id,address:targetAddress,port:ports[service]},
    client:{address:clientIpv4.address,prefix:clientIpv4.prefix,sourcePort,dns:[...clientIpv4.dns]},
    route:{gateway:clientIpv4.gateway,wanGateway:wan.gateway,lanPortId:firstLan1},
    nat:null,reason:"Service Internet atteint par passage LAN 1 vers WAN sans routage ni NAT/PAT de la box."};
 }
 return {success:true,code:"bridge_internet_session",boxId,request,
  listNat:()=>[]};
}

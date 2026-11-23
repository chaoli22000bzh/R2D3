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

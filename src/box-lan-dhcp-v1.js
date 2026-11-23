/* Box Internet R2D3, session DHCP du LAN commun.
 * Un actif composite; routeur/borne projetés vers les moteurs existants.
 * Les liens Core sont dérivés seulement après vérification du brassage ou de
 * l'association Wi-Fi. Le Core DHCP conserve tous les baux d'une session.
 */
import {createEngine} from "./r2d3-core.js";
import {createRouterDhcpCoreObject} from "./router-dhcp-service-v1.js";
import {associateWifiClient} from "./wifi-ap-v1.js";

const fail=(code,message)=>({success:false,code,message});
const copy=x=>JSON.parse(JSON.stringify(x));
const ethernet=a=>a?.ports.filter(p=>p.type==="ethernet-rj45")??[];
const live=a=>a?.status==="En service";
const mac=id=>{
 const n=Number(String(id).match(/\d+$/)?.[0]??0);
 return [2,0,0,(n>>>16)&255,(n>>>8)&255,n&255]
  .map(x=>x.toString(16).padStart(2,"0").toUpperCase()).join("-");
};
const routerId=id=>id+"/router";
const wifiId=id=>id+"/wifi";

function projectedRouter(box){
 const c=box.boxConfig,wan=c.components.router.wanPortId,lan=c.components.router.lanPortId;
 return {id:routerId(box.id),name:box.name+" · Routeur",status:box.status,
  networkCapabilities:["ipv4-router","dhcp-server"],
  ports:box.ports.filter(p=>p.id===wan||p.id===lan),
  routerConfig:{assetId:routerId(box.id),interfaces:{
   [wan]:{role:"wan",mode:"dhcp",address:"",prefix:null,gateway:"",respondToPing:false},
   [lan]:{role:"lan",mode:"static",address:c.lan.address,prefix:c.lan.prefix,
    gateway:"",respondToPing:true}}},
  dhcpServerConfig:{assetId:routerId(box.id),enabled:c.lan.dhcpEnabled,
   pools:copy(c.lan.pools)}};
}
function projectedAp(box){
 const c=box.boxConfig;
 return {id:wifiId(box.id),name:box.name+" · Wi-Fi",status:box.status,
  networkCapabilities:["wifi-ap"],
  wifiConfig:{assetId:wifiId(box.id),...copy(c.wifi)}};
}
function admitClient(registry,box,entry){
 const client=registry.getAsset(entry.assetId),c=box.boxConfig;
 if(!client||!live(client))return fail("client_offline","Client absent ou hors service.");
 if(client.id===box.id)return fail("invalid_client","La box ne peut pas être son propre client.");
 const medium=entry.medium;
 if(medium==="ethernet"){
  const cp=ethernet(client);
  if(!cp.length)return fail("client_port","Le client ne possède aucun port Ethernet RJ45.");
  const matched=cp.flatMap(port=>c.ports.lanPortIds.filter(id=>
   registry.explorePhysicalPath(port.id,id).connected).map(lanPortId=>({port,lanPortId})));
  if(matched.length!==1)return fail(matched.length?"ambiguous_lan":"link_down",
   matched.length?"Plusieurs prises Ethernet du client sont raccordées au LAN de la box.":"Client non raccordé au LAN.");
  return {success:true,client,port:matched[0].port,medium,lanPortId:matched[0].lanPortId};
 }
 if(medium==="wifi"){
  if(!client.ports.some(p=>p.type==="wifi"))return fail("wifi_port_missing","Client sans interface Wi-Fi.");
  const ap=projectedAp(box),association=associateWifiClient({
   getAsset:id=>id===ap.id?ap:null
  },{apId:ap.id,ssidId:entry.ssidId,password:entry.password??"",
   bands:entry.bands??["2.4","5"],security:entry.security??["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"]});
  if(!association.success)return association;
  return {success:true,client,port:client.ports.find(p=>p.type==="wifi"),medium,
   association};
 }
 return fail("invalid_medium","Type de raccordement inconnu.");
}
function coreClient(entry){
 const a=entry.client;
 // Le lien radio/L2 est projeté comme un lien IP Core logique après validation
 // par les composants Wi-Fi et câblage. Aucun faux câble n'est enregistré.
 return {id:a.id,kind:"pc-windows",name:a.name,
  ports:[{id:entry.port.id,type:"rj45"}],
  config:{macAddress:mac(a.id),
   ipv4:{interfaceId:entry.port.id,mode:"dhcp",address:null,prefix:null,lease:null},
   networkOptions:{gateway:null,dns:[]}}};
}

export function createBoxLanDhcpSession({registry,boxId,clients=[]}={}){
 const box=registry?.getAsset?.(boxId);
 if(!box?.boxConfig)return fail("box_missing","Box composite introuvable.");
 if(!live(box))return fail("box_offline","Box hors service.");
 if(!Array.isArray(clients)||!clients.length)return fail("clients_missing","Indiquer les clients du LAN.");
 const ids=clients.map(x=>x.assetId);
 if(new Set(ids).size!==ids.length)return fail("duplicate_client","Client présent plusieurs fois.");
 const accepted=[];
 for(const entry of clients){
  const attempt=admitClient(registry,box,entry);
  if(!attempt.success)return {...attempt,clientId:entry.assetId};
  accepted.push(attempt);
 }
 const router=projectedRouter(box),source={
  getAsset:id=>id===router.id?router:null
 };
 const server=createRouterDhcpCoreObject(source,router.id);
 if(!server)return fail("router_projection","Projection du serveur DHCP impossible.");
 // Chaque client reçoit un point de liaison Core virtuel sur le même
 // serveur DHCP. Cela ne crée aucun port physique ni câble supplémentaire.
 const links=accepted.map((item,i)=>{
  const id="box-core-lan-"+(i+1);
  server.ports.push({id,type:"rj45"});
  return {id:"box-lan-link-"+(i+1),kind:"ethernet-cable",connected:true,
   endpoints:[{objectId:item.client.id,portId:item.port.id},
    {objectId:router.id,portId:id}]};
 });
 let engine;
 try{
  engine=createEngine({format:"r2d3-scenario",schemaVersion:1,
   scenarioId:"box-lan-"+box.id,scenarioVersion:"1.0.0",
   capabilities:{network:true},objects:[server,...accepted.map(coreClient)],links});
 }catch(e){return fail("core_scenario_invalid",e.message);}
 return {success:true,code:"session_created",boxId,routerId:router.id,engine,
  clients:accepted.map(x=>({assetId:x.client.id,medium:x.medium,lanPortId:x.lanPortId??null,
   association:x.association??null})),
  request(clientId){
   const initial=accepted.find(x=>x.client.id===clientId);
   if(!initial)return fail("client_missing","Client absent de la session.");
   const currentBox=registry.getAsset(boxId);
   if(!currentBox||!live(currentBox))return fail("box_offline","Box indisponible.");
   const current=admitClient(registry,currentBox,
    clients.find(x=>x.assetId===clientId));
   // Convention pédagogique R2D3 : un client DHCP débranché sans bail
   // actif reçoit l'APIPA du Core, plutôt qu'un refus de simulation.
   // Un bail encore valide reste conservé conformément au Core.
   const disconnected=current.code==="link_down"&&initial.medium==="ethernet";
   if(!current.success&&!disconnected)return current;
   // Si le LAN est reconfiguré après la création de session, refuser
   // plutôt que d'attribuer un bail provenant d'une ancienne configuration.
   if(JSON.stringify(currentBox.boxConfig.lan)!==JSON.stringify(box.boxConfig.lan))
    return fail("out_of_sync","Configuration LAN modifiée : recréer la session.");
   let snap=engine.getSnapshot();
   const linkId="box-lan-link-"+(accepted.indexOf(initial)+1);
   const linked=!disconnected;
   if(snap.linksById[linkId]?.connected!==linked){
    const transition=engine.dispatch({commandVersion:1,
     id:"box-link-"+clientId+"-"+(snap.revision+1),
     type:"network.setLinkConnected",targetId:linkId,params:{connected:linked}});
    if(transition.status!=="applied")return fail("core_link_error","État du lien Core non synchronisé.");
    snap=engine.getSnapshot();
   }
   const result=engine.dispatch({commandVersion:1,id:"box-dhcp-"+(snap.revision+1),
    type:"dhcp.request",targetId:clientId,
    params:linked&&currentBox.boxConfig.lan.dhcpEnabled?
     {serverId:router.id,poolId:currentBox.boxConfig.lan.pools[0].id}:{}});
   if(result.status!=="applied")return fail("core_rejected",result.message||result.code||"Demande DHCP refusée.");
   const updated=engine.getSnapshot(),ip=updated.objectsById[clientId].config.ipv4;
   const status=updated.runtime?.[clientId]?.dhcpStatus??"unassigned";
   return {success:true,code:status,address:ip.address,prefix:ip.prefix,
    gateway:updated.objectsById[clientId].config.networkOptions?.gateway??null,
    dns:copy(updated.objectsById[clientId].config.networkOptions?.dns??[]),
    lease:copy(ip.lease),serverId:router.id,clientId};
  }
 };
}

/* Box Internet R2D3, session DHCP du LAN commun.
 * Un actif composite; routeur/borne projetés vers les moteurs existants.
 * Les liens Core sont dérivés seulement après vérification du brassage ou de
 * l'association Wi-Fi. Le Core DHCP conserve tous les baux d'une session.
 */
import {createEngine,restoreEngine} from "./r2d3-core.js";
import {createRouterDhcpCoreObject} from "./router-dhcp-service-v1.js";
import {associateWifiClient} from "./wifi-ap-v1.js";

const fail=(code,message)=>({success:false,code,message});
const copy=x=>JSON.parse(JSON.stringify(x));
const ethernet=a=>a?.ports.filter(p=>p.type==="ethernet-rj45")??[];
const live=a=>a?.status==="En service";
const mac=(id)=>{
 const n=Number(String(id).match(/\d+$/)?.[0]??0);
 return [2,0,1,(n>>>16)&255,(n>>>8)&255,n&255]
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
  const cp=ethernet(client).filter(p=>!entry.portId||p.id===entry.portId);
  if(!cp.length)return fail("client_port","Le client ne possède aucun port Ethernet RJ45.");
  const matched=cp.flatMap(port=>c.ports.lanPortIds.filter(id=>
   registry.explorePhysicalPath(port.id,id).connected).map(lanPortId=>({port,lanPortId})));
  if(matched.length!==1)return fail(matched.length?"ambiguous_lan":"link_down",
   matched.length?"Plusieurs prises Ethernet du client sont raccordées au LAN de la box.":"Client non raccordé au LAN.");
  return {success:true,client,port:matched[0].port,medium,lanPortId:matched[0].lanPortId};
 }
 if(medium==="wifi"){
  if(!client.ports.some(p=>p.type==="wifi"&&(!entry.portId||p.id===entry.portId)))return fail("wifi_port_missing","Client sans interface Wi-Fi.");
  const ap=projectedAp(box),association=associateWifiClient({
   getAsset:id=>id===ap.id?ap:null
  },{apId:ap.id,ssidId:entry.ssidId,password:entry.password??"",
   bands:entry.bands??["2.4","5"],security:entry.security??["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"]});
  if(!association.success)return association;
  return {success:true,client,port:client.ports.find(p=>p.type==="wifi"&&(!entry.portId||p.id===entry.portId)),medium,
   association};
 }
 return fail("invalid_medium","Type de raccordement inconnu.");
}
function coreClient(entry){
 const a=entry.client;
 // Le lien radio/L2 est projeté comme un lien IP Core logique après validation
 // par les composants Wi-Fi et câblage. Aucun faux câble n'est enregistré.
 return {id:entry.clientId,kind:"pc-windows",name:a.name+(entry.clientId!==a.id?" · "+entry.port.name:""),
  ports:[{id:entry.port.id,type:"rj45"}],
  config:{macAddress:mac(entry.port.id),
   ipv4:{interfaceId:entry.port.id,mode:"dhcp",address:null,prefix:null,lease:null},
   networkOptions:{gateway:null,dns:[]}}};
}

export function createBoxLanDhcpSession({registry,boxId,clients=[]}={}){
 const box=registry?.getAsset?.(boxId);
 if(!box?.boxConfig)return fail("box_missing","Box composite introuvable.");
 if(!live(box))return fail("box_offline","Box hors service.");
 if(box.boxConfig.mode==="bridge")return fail("bridge_mode","Serveur DHCP LAN et Wi-Fi désactivés en mode bridge.");
 if(!Array.isArray(clients)||!clients.length)return fail("clients_missing","Indiquer les clients du LAN.");
 const ids=clients.map(x=>x.assetId);
 const repeated=new Set(ids.filter((id,i)=>ids.indexOf(id)!==i));
 const accepted=[];
 for(const entry of clients){
  const attempt=admitClient(registry,box,entry);
  if(!attempt.success)return {...attempt,clientId:entry.assetId};
  accepted.push({...attempt,requested:entry,
   clientId:repeated.has(entry.assetId)?entry.assetId+"/interface/"+attempt.port.id:entry.assetId});
 }
 if(new Set(accepted.map(x=>x.clientId)).size!==accepted.length)
  return fail("duplicate_client","Interface réseau présente plusieurs fois dans la session.");
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
   endpoints:[{objectId:item.clientId,portId:item.port.id},
    {objectId:router.id,portId:id}]};
 });
 // Baux antérieurs conservés dans l'actif box, y compris lorsqu'un
 // client n'est pas présent dans cette nouvelle session. Le Core reste
 // l'unique autorité pour leur validité et les nouvelles allocations.
 const persisted=box.boxConfig.dhcpState??{clock:0,clients:[]};
 let expectedDhcpState=JSON.stringify(persisted);
 const known=new Map(persisted.clients.map(c=>[c.assetId+"|"+c.portId,c]));
 const activeKeys=new Set(accepted.map(a=>a.client.id+"|"+a.port.id));
 const holders=persisted.clients.filter(c=>!activeKeys.has(c.assetId+"|"+c.portId)&&
  c.lease.expires>persisted.clock);
 const holderId=c=>"dhcp-holder/"+c.assetId+"/"+c.portId;
 const priorObjects=holders.map(c=>({
  id:holderId(c),kind:"pc-windows",name:"Bail DHCP réservé",
  ports:[{id:c.portId,type:"rj45"}],
  config:{macAddress:mac(c.portId),
   ipv4:{interfaceId:c.portId,mode:"dhcp",address:null,prefix:null,lease:null},
   networkOptions:{gateway:null,dns:[]}}
 }));
 const objects=[server,...accepted.map(coreClient),...priorObjects];
 const scenario={format:"r2d3-scenario",schemaVersion:1,
  scenarioId:"box-lan-"+box.id,scenarioVersion:"1.0.0",
  capabilities:{network:true},objects,links};
 let engine;
 try{
  const base=createEngine(scenario);
  const snapshot=base.exportState();
  snapshot.simulationClock=persisted.clock;
  const saved=[...accepted.map(a=>({
   id:a.clientId,key:a.client.id+"|"+a.port.id
  })),...holders.map(c=>({id:holderId(c),key:c.assetId+"|"+c.portId}))];
  for(const {id,key} of saved){
   const previous=known.get(key);
   if(!previous||previous.lease.expires<=persisted.clock)continue;
   const target=snapshot.objectsById[id];
   target.config.macAddress=mac(key.slice(key.indexOf("|")+1));
   target.config.ipv4={interfaceId:target.config.ipv4.interfaceId,mode:"dhcp",
    address:previous.address,prefix:previous.prefix,lease:copy(previous.lease)};
   target.config.networkOptions={gateway:previous.gateway,dns:copy(previous.dns)};
   snapshot.runtime[id]={dhcpStatus:"lease-retained"};
  }
  engine=restoreEngine(scenario,snapshot);
 }catch(e){return fail("core_scenario_invalid",e.message);}
 // L'état persisté contient uniquement les baux effectivement produits par le Core.
 function saveLeases(){
  if(typeof registry.setBoxDhcpState!=="function")return {success:true};
  const snap=engine.exportState(),mapped=new Map();
  for(const a of accepted)mapped.set(a.clientId,{assetId:a.client.id,portId:a.port.id});
  for(const c of holders)mapped.set(holderId(c),{assetId:c.assetId,portId:c.portId});
  const clients=[];
  for(const [id,identity] of mapped){
   const object=snap.objectsById[id],ip=object?.config.ipv4;
   if(!ip?.lease||ip.lease.expires<=snap.simulationClock)continue;
   clients.push({...identity,mac:object.config.macAddress,address:ip.address,
    prefix:ip.prefix,gateway:object.config.networkOptions.gateway,
    dns:copy(object.config.networkOptions.dns),lease:copy(ip.lease)});
  }
  const saved={clock:snap.simulationClock,clients};
  const result=registry.setBoxDhcpState(boxId,saved);
  if(result.success)expectedDhcpState=JSON.stringify(saved);
  return result;
 }
 return {success:true,code:"session_created",boxId,routerId:router.id,engine,
  clients:accepted.map(x=>({assetId:x.client.id,clientId:x.clientId,portId:x.port.id,
   medium:x.medium,lanPortId:x.lanPortId??null,association:x.association??null})),
  request(clientId,portId){
   const matches=accepted.filter(x=>(x.client.id===clientId||x.clientId===clientId)&&
    (!portId||x.port.id===portId));
   if(matches.length>1)return fail("ambiguous_interface","Préciser l'interface réseau du client.");
   const initial=matches[0];
   if(!initial)return fail("client_missing","Client ou interface absent de la session.");
   const coreId=initial.clientId;
   const currentBox=registry.getAsset(boxId);
   if(!currentBox||!live(currentBox))return fail("box_offline","Box indisponible.");
    if(currentBox.boxConfig.mode==="bridge")return fail("bridge_mode","Serveur DHCP LAN et Wi-Fi désactivés en mode bridge.");
   const current=admitClient(registry,currentBox,initial.requested);
   // Convention pédagogique R2D3 : un client DHCP débranché sans bail
   // actif reçoit l'APIPA du Core, plutôt qu'un refus de simulation.
   // Un bail encore valide reste conservé conformément au Core.
   const disconnected=current.code==="link_down"&&initial.medium==="ethernet";
   if(!current.success&&!disconnected)return current;
   // Si le LAN est reconfiguré après la création de session, refuser
   // plutôt que d'attribuer un bail provenant d'une ancienne configuration.
   if(JSON.stringify(currentBox.boxConfig.dhcpState??{clock:0,clients:[]})!==expectedDhcpState)
    return fail("dhcp_state_changed","La table DHCP de la box a changé : recréer la session.");
   if(JSON.stringify(currentBox.boxConfig.lan)!==JSON.stringify(box.boxConfig.lan))
    return fail("out_of_sync","Configuration LAN modifiée : recréer la session.");
   let snap=engine.getSnapshot();
   const linkId="box-lan-link-"+(accepted.indexOf(initial)+1);
   const linked=!disconnected;
   if(snap.linksById[linkId]?.connected!==linked){
    const transition=engine.dispatch({commandVersion:1,
     id:"box-link-"+coreId+"-"+(snap.revision+1),
     type:"network.setLinkConnected",targetId:linkId,params:{connected:linked}});
    if(transition.status!=="applied")return fail("core_link_error","État du lien Core non synchronisé.");
    snap=engine.getSnapshot();
   }
   const result=engine.dispatch({commandVersion:1,id:"box-dhcp-"+(snap.revision+1),
    type:"dhcp.request",targetId:coreId,
    params:linked&&currentBox.boxConfig.lan.dhcpEnabled?
     {serverId:router.id,poolId:currentBox.boxConfig.lan.pools[0].id}:{}});
   if(result.status!=="applied")return fail("core_rejected",result.message||result.code||"Demande DHCP refusée.");
   const updated=engine.getSnapshot(),ip=updated.objectsById[coreId].config.ipv4;
   const status=updated.runtime?.[coreId]?.dhcpStatus??"unassigned";
   const persist=saveLeases();
   if(!persist.success)return fail("lease_persist_failed",persist.message||"Sauvegarde des baux impossible.");
   // Une NetCam est un équipement réseau : conserver l'IPv4 par interface
   // directement dans le registre partagé, sans inventaire informatique fictif.
   if(registry.getProfile(initial.client.profileId)?.netcamProfile===true&&
      ["lease","lease-retained"].includes(status)&&ip.address){
    const saved=registry.setAssetInterfaceIpv4(initial.client.id,initial.port.id,{
     mode:"dhcp",status:linked?"connected":"disconnected",
     address:ip.address,prefix:ip.prefix,
     gateway:updated.objectsById[coreId].config.networkOptions?.gateway??null,
     dns:copy(updated.objectsById[coreId].config.networkOptions?.dns??[])
    });
    if(!saved.success)return fail("interface_ipv4_rejected",saved.message||"IPv4 de la NetCam refusée.");
   }
   return {success:true,code:status,address:ip.address,prefix:ip.prefix,
    gateway:updated.objectsById[coreId].config.networkOptions?.gateway??null,
    dns:copy(updated.objectsById[coreId].config.networkOptions?.dns??[]),
    lease:copy(ip.lease),serverId:router.id,clientId:initial.client.id,interfaceId:initial.port.id};
  }
 };
}

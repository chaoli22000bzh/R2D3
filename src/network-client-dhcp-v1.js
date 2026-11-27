/* R2D3 : demande DHCP d'une interface réseau cliente, indépendante de la
 * catégorie matérielle. La décision DHCP et l'APIPA appartiennent au Core.
 * Aucun bail ni adresse de secours n'est créé directement par cet adaptateur.
 */
import {createEngine} from "./r2d3-core.js";
import {createBoxLanDhcpSession} from "./box-lan-dhcp-v1.js";

const fail=(code,message)=>({success:false,code,message});
const mac=id=>{
 const n=Number(String(id).match(/\d+$/)?.[0]??0);
 return [2,0,1,(n>>>16)&255,(n>>>8)&255,n&255].map(x=>x.toString(16).padStart(2,"0").toUpperCase()).join("-");
};
const isLive=a=>a?.status==="En service";
const isWifi=p=>p?.type==="wifi";
const clientId=(assetId,portId)=>assetId+"/interface/"+portId;
function noServer(registry,asset,port){
 // Un même scénario Core contient les deux interfaces, afin de produire des
 // adresses APIPA distinctes pour Ethernet et Wi-Fi de l'actif.
 const ports=registry.listAssetNetworkInterfaces(asset.id);
 const objects=ports.map(p=>({
  id:clientId(asset.id,p.id),kind:"pc-windows",name:asset.name+" / "+p.name,
  ports:[{id:p.id,type:"rj45"}],
  config:{macAddress:mac(p.id),ipv4:{interfaceId:p.id,mode:"dhcp",address:null,prefix:null,lease:null},
   networkOptions:{gateway:null,dns:[]}}
 }));
 const scenario={format:"r2d3-scenario",schemaVersion:1,
  scenarioId:"client-dhcp-"+asset.id,scenarioVersion:"1.0.0",
  capabilities:{network:true},objects,links:[]};
 let engine;
 try{engine=createEngine(scenario);}catch(e){return fail("core_scenario_invalid",e.message);}
 const snap=engine.getSnapshot();
 const res=engine.dispatch({commandVersion:1,id:"client-dhcp-"+(snap.revision+1),
  type:"dhcp.request",targetId:clientId(asset.id,port.id),params:{}});
 if(res.status!=="applied")return fail("core_rejected",res.message||res.code||"Demande DHCP refusée.");
 const state=engine.getSnapshot(),target=state.objectsById[clientId(asset.id,port.id)];
 const ip=target.config.ipv4,status=state.runtime[clientId(asset.id,port.id)]?.dhcpStatus;
 return {success:true,code:status,address:ip.address,prefix:ip.prefix,
  gateway:target.config.networkOptions.gateway,dns:target.config.networkOptions.dns};
}
function ethernetBox(registry,port){
 const candidates=[];
 for(const box of registry.listAssets().filter(a=>a.boxConfig&&isLive(a)&&a.boxConfig.mode!=="bridge")){
  for(const lanPortId of box.boxConfig.ports.lanPortIds){
   if(registry.explorePhysicalPath(port.id,lanPortId).connected)candidates.push(box);
  }
 }
 return [...new Map(candidates.map(b=>[b.id,b])).values()];
}
function wifiBox(registry,config){
 if(!config?.ssid)return [];
 const matches=[];
 for(const box of registry.listAssets().filter(a=>a.boxConfig&&isLive(a)&&a.boxConfig.mode!=="bridge"&&a.boxConfig.wifi?.enabled)){
  const ssids=box.boxConfig.wifi.ssids.filter(s=>s.enabled&&s.name===config.ssid&&s.security===config.security);
  for(const ssid of ssids)matches.push({box,ssidId:ssid.id});
 }
 return matches;
}
export function requestAssetInterfaceDhcp({registry,assetId,portId}={}){
 if(!registry?.getAsset||!registry?.listAssetNetworkInterfaces||!registry?.setAssetInterfaceIpv4)
  return fail("registry_missing","Registre matériel indisponible.");
 const asset=registry.getAsset(assetId);
 if(!asset)return fail("not_found","Équipement introuvable.");
 if(!isLive(asset))return fail("client_offline","Équipement hors service.");
 const port=registry.listAssetNetworkInterfaces(assetId).find(p=>p.id===portId);
 if(!port)return fail("unsupported_interface","Interface Ethernet ou Wi-Fi introuvable.");
 if(port.ipv4?.mode==="static")return fail("static_mode","Cette interface est configurée en IPv4 fixe.");
 let candidates=[];
 if(port.type==="ethernet-rj45"){
  candidates=ethernetBox(registry,port).map(box=>({
   box,entry:{assetId,portId,medium:"ethernet"}
  }));
 }else if(isWifi(port)){
  candidates=wifiBox(registry,port.clientWifi).map(({box,ssidId})=>({
   box,entry:{assetId,portId,medium:"wifi",ssidId,password:port.clientWifi.password}
  }));
 }
 if(candidates.length>1)return fail("ambiguous_dhcp","Plusieurs réseaux possibles pour cette interface.");
 let result;
 if(candidates.length===1){
  const {box,entry}=candidates[0];
  const session=createBoxLanDhcpSession({registry,boxId:box.id,clients:[entry]});
  if(!session.success)return session;
  result=session.request(assetId,portId);
  if(!result.success)return result;
 }else{
  result=noServer(registry,asset,port);
  if(!result.success)return result;
 }
 // Le Core (ou la session box qui s'appuie sur lui) est l'autorité.
 // Réutiliser l'API IPv4 commune pour tous les équipements.
 const saved=registry.setAssetInterfaceIpv4(assetId,portId,{
  mode:"dhcp",status:result.code==="apipa"?"disconnected":"connected",
  address:result.address,prefix:result.prefix,
  gateway:result.gateway??null,dns:result.dns??[]
 });
 if(!saved.success)return fail("interface_ipv4_rejected",saved.message);
 return {...result,interfaceId:portId,clientId:assetId};
}

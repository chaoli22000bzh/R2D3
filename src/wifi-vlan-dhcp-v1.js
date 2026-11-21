/*
 * R2D3 Wi-Fi multi-SSID/VLAN : pont vers la commutation et le DHCP L3 existants.
 * Aucun moteur d'allocation ni état VLAN parallèle.
 * Le lien Core virtuel représente une association radio autorisée après
 * vérification du câble réel et du Trunk R2 ; ce n'est pas un câble R2.
 * Première recette : un switch L3 avec service DHCP local et une borne RJ45.
 */
import {createEngine} from "./r2d3-core.js";
import {createSwitchDhcpCoreObject,getSwitchDhcpConfig} from "./switch-dhcp-service-v1.js";
import {associateWifiClient} from "./wifi-ap-v1.js";
const fail=(code,message)=>({success:false,code,message});
const ipNumber=x=>typeof x==="string"&&/^\d{1,3}(\.\d{1,3}){3}$/.test(x)&&x.split(".").every(n=>+n<=255)?x.split(".").reduce((a,n)=>(a*256+(+n))>>>0,0):null;
const sameNetwork=(a,b,p)=>{const x=ipNumber(a),y=ipNumber(b);return x!==null&&y!==null&&Number.isInteger(p)&&p>0&&p<=30&&(x&((0xffffffff<<(32-p))>>>0))===(y&((0xffffffff<<(32-p))>>>0));};
export function validateWifiVlanPath({registry,apId,switchId,clientId,ssidId,password="",bands=["2.4","5"],security=["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"],macAddress="02-00-00-00-10-01"}={}){
 const association=associateWifiClient(registry,{apId,ssidId,password,bands,security});
 if(!association.success)return association;
 const ap=registry.getAsset(apId),sw=registry.getAsset(switchId),client=registry.getAsset(clientId);
 if(!client||!sw?.networkCapabilities?.includes("vlan")||!sw.networkCapabilities.includes("inter-vlan-routing")||!sw.networkCapabilities.includes("dhcp-server"))
  return fail("missing_assets","Switch L3 VLAN/DHCP ou client introuvable.");
 if(client.status!=="En service"||sw.status!=="En service")return fail("offline","Client ou switch hors service.");
 const selected=ap.wifiConfig.ssids.find(x=>x.id===ssidId),vlanNumber=selected.vlanNumber;
 if(!Number.isInteger(vlanNumber)||vlanNumber<1||vlanNumber>4094)return fail("ssid_vlan_missing","Aucun VLAN affecté au SSID.");
 const uplinks=ap.ports.filter(p=>p.type==="ethernet-rj45");
 if(uplinks.length!==1)return fail("unsupported_ap_ports","Un unique port Ethernet montant est requis.");
 const candidate=sw.ports.filter(p=>p.type==="ethernet-rj45")
  .filter(p=>registry.explorePhysicalPath(uplinks[0].id,p.id).connected);
 if(candidate.length!==1)return fail(candidate.length?"ambiguous_path":"link_down",
  candidate.length?"Plusieurs ports du switch atteignables.":"Câble entre borne et switch interrompu.");
 const port=candidate[0],portConfig=sw.vlanConfig?.ports?.[port.id];
 if(portConfig?.mode!=="trunk")return fail("trunk_required","Le port du switch doit être configuré en Trunk.");
 const vlan=sw.vlanConfig.vlans.find(v=>v.number===vlanNumber);
 if(!vlan)return fail("vlan_missing","VLAN "+vlanNumber+" absent sur le switch.");
 if(!portConfig.allowedVlanIds.includes(vlan.id))return fail("vlan_blocked","Le VLAN "+vlanNumber+" n'est pas autorisé sur le Trunk.");
 const conf=getSwitchDhcpConfig(registry,switchId),pools=conf?.pools?.filter(p=>p.vlanNumber===vlanNumber)??[];
 if(pools.length!==1)return fail(pools.length?"ambiguous_pool":"missing_pool","Une plage DHCP unique est requise pour le VLAN "+vlanNumber+".");
 const pool=pools[0],svi=sw.routingConfig?.interfaces?.[String(vlanNumber)];
 if(!svi?.enabled||pool.gateway!==svi.address||pool.prefix!==svi.prefix||!sameNetwork(pool.start,svi.address,pool.prefix))
  return fail("invalid_interface","Interface VLAN et plage DHCP incompatibles.");
 if(typeof macAddress!=="string"||!/^([0-9a-f]{2}-){5}[0-9a-f]{2}$/i.test(macAddress))
  return fail("invalid_mac","Adresse MAC du client invalide.");
 return {success:true,code:"path_ok",association,ssid:selected.name,ap,sw,client,vlanNumber,portId:port.id,pool,svi};
}

export function requestWifiVlanDhcp({registry,apId,switchId,clientId,ssidId,password="",bands=["2.4","5"],security=["open","wpa2-personal","wpa3-personal","wpa2-wpa3-personal"],macAddress="02-00-00-00-10-01"}={}){
 const path=validateWifiVlanPath({registry,apId,switchId,clientId,ssidId,password,bands,security,macAddress});
 if(!path.success)return path;
 const {client,ssid,vlanNumber,portId,pool}=path;
 const server=createSwitchDhcpCoreObject(registry,switchId);
 if(!server)return fail("missing_core_asset","Switch absent du Core DHCP.");
 // Le Core utilise une IPv4 par objet. Projeter ici la véritable SVI du VLAN
 // du client permet de tester le ping de sa passerelle, même sur VLAN 20.
 // Cette projection n'altère ni le registre R2D3 ni les plages DHCP.
 server.config.ipv4={interfaceId:portId,mode:"static",address:path.svi.address,prefix:path.svi.prefix};
 const clientObject={id:clientId,kind:"pc-windows",name:client.name,ports:[{id:"wifi-logical",type:"rj45"}],
  config:{macAddress,ipv4:{interfaceId:"wifi-logical",mode:"dhcp",address:null,prefix:null,lease:null},networkOptions:{gateway:null,dns:[]}}};
 let engine;
 try{
  engine=createEngine({format:"r2d3-scenario",schemaVersion:1,scenarioId:"wifi-vlan-l3",scenarioVersion:"1",
   capabilities:{network:true},objects:[clientObject,server],links:[{id:"wifi-bridge-logical",kind:"ethernet-cable",connected:true,
    endpoints:[{objectId:clientId,portId:"wifi-logical"},{objectId:switchId,portId}]}]});
 }catch(e){return fail("core_scenario_invalid",e.message);}
 const response=engine.dispatch({commandVersion:1,id:"wifi-vlan-dhcp-request",type:"dhcp.request",
  targetId:clientId,params:{serverId:switchId,poolId:pool.id}});
 if(response.status!=="applied")return fail("core_rejected",response.message||response.code||"DHCP refusé.");
 const state=engine.getSnapshot(),c=state.objectsById[clientId],ip=c.config.ipv4,lease=state.runtime?.[clientId]?.dhcpStatus==="lease";
 const gatewayPing=engine.query({type:"network.ping",sourceId:clientId,targetId:switchId});
 return {success:lease,code:lease?"lease":"apipa",message:lease?"Bail attribué par le Core DHCP du VLAN.":"Aucun bail DHCP : APIPA.",
  address:ip.address,prefix:ip.prefix,gateway:c.config.networkOptions.gateway,dns:c.config.networkOptions.dns,
  lease:ip.lease,vlanNumber,ssid,portId,
  gatewayReachable:gatewayPing.status==="ok"&&gatewayPing.success};
}

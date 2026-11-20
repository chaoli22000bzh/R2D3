/*
 * Service commun de relais DHCP V0.1.
 * Transport validé par l'adaptateur concerné : VLAN, VPN ou DMZ.
 * Attribution, exclusions, réservations, baux et APIPA restent dans R2D3 Core.
 * L'exception DHCP DMZ ne constitue jamais une autorisation de trafic ordinaire.
 */
const fail=(reason,status="ok")=>({status,success:false,reason});
const ipNumber=s=>{
 if(typeof s!=="string")return null;
 const a=s.split(".");
 if(a.length!==4||a.some(x=>!/^\d{1,3}$/.test(x)||+x>255))return null;
 return a.reduce((v,x)=>(v*256+ +x)>>>0,0);
};
const net=(address,prefix)=>{
 const ip=ipNumber(address);
 if(ip===null||!Number.isInteger(prefix)||prefix<1||prefix>30)return null;
 const mask=(0xffffffff<<(32-prefix))>>>0;
 return {ip,mask,base:(ip&mask)>>>0};
};
const same=(a,b)=>!!a&&!!b&&a.base===b.base&&a.mask===b.mask;
export function relayDhcpViaCommonEngine({
 dhcpEngine,clientId,serverId,serverAddress,clientNetwork,helper,
 transport,commandId
}){
 if(!dhcpEngine?.query||!dhcpEngine?.dispatch||!dhcpEngine?.getSnapshot)
  return fail("Moteur DHCP commun indisponible","unavailable");
 if(!clientNetwork||!net(clientNetwork.address,clientNetwork.prefix))
  return fail("Réseau client inconnu","unavailable");
 if(!transport||!["vlan","vpn","dmz","router"].includes(transport.kind)||
    typeof transport.reachable!=="boolean")
  return fail("État de transport non déterminé","unavailable");
 if(!transport.reachable)return fail(transport.reason||"Chemin réseau interrompu");
 if(helper?.enabled!==true)return fail("IP Helper absent ou désactivé sur le réseau client");
 if(helper.serverAddress!==serverAddress)return fail("Adresse IP Helper incorrecte");
 const snapshot=dhcpEngine.getSnapshot();
 const client=snapshot.objectsById?.[clientId],server=snapshot.objectsById?.[serverId];
 if(!client||!server)return fail("Client ou serveur absent du moteur DHCP","unavailable");
 if(client.config?.ipv4?.mode!=="dhcp")return fail("Client non configuré en DHCP","unavailable");
 if(server.config?.ipv4?.address!==serverAddress)return fail("Adresse réelle du serveur DHCP différente de l'IP Helper");
 const pools=dhcpEngine.query({type:"dhcp.pools",serverId});
 if(pools.status!=="ok"||!pools.enabled)return fail("Service DHCP indisponible");
 const source=net(clientNetwork.address,clientNetwork.prefix);
 const matching=pools.pools.filter(p=>same(net(p.start,p.prefix),source)&&same(net(p.end,p.prefix),source));
 if(matching.length!==1)return fail(matching.length===0?
  "Aucune plage DHCP pour le réseau client":"Plusieurs plages DHCP candidates ambiguës");
 // Toujours choisir d'après l'origine de la requête (giaddr simulé),
 // et non d'après l'adresse du serveur ou la première plage.
 const pool=matching[0];
 const dispatched=dhcpEngine.dispatch({
  commandVersion:1,id:commandId||"relay-"+String(snapshot.revision+1),
  type:"dhcp.request",targetId:clientId,params:{serverId,poolId:pool.id}
 });
 if(dispatched.status!=="applied")
  return fail(dispatched.message||dispatched.code||"Requête DHCP refusée","unavailable");
 const state=dhcpEngine.getSnapshot();
 const lease=state.objectsById[clientId].config.ipv4.lease;
 const status=state.runtime?.[clientId]?.dhcpStatus;
 return {status:"ok",success:status==="lease",reason:status==="lease"?
  "Bail attribué par le moteur DHCP commun":
  "Échec DHCP : "+(state.runtime?.[clientId]?.error||status||"aucun bail"),
  dhcpStatus:status,address:state.objectsById[clientId].config.ipv4.address,
  poolId:pool.id,lease:lease?JSON.parse(JSON.stringify(lease)):null,
  transport:transport.kind};
}

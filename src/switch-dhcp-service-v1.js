/*
 * Adaptateur DHCP du switch L3. Aucune attribution ni gestion de bail ici.
 * Le registre R2 est la source de vérité de la configuration du service.
 * Le Core DHCP est la source de vérité des attributions, baux et APIPA.
 */
const copy=x=>JSON.parse(JSON.stringify(x));
const bad=(code,message)=>({success:false,code,message});
const ipInt=x=>typeof x==="string"&&x.split(".").length===4&&x.split(".").every(n=>/^\d{1,3}$/.test(n)&&Number(n)<=255)?
 x.split(".").reduce((a,n)=>(a*256+Number(n))>>>0,0):null;
const subnet=(a,b,p)=>{const x=ipInt(a),y=ipInt(b);if(x===null||y===null||!Number.isInteger(p)||p<1||p>30)return false;
 const mask=(0xffffffff<<(32-p))>>>0;return (x&mask)===(y&mask);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function getSwitchDhcpConfig(registry,switchId){
 const sw=registry?.getAsset?.(switchId);
 return sw?.networkCapabilities?.includes("dhcp-server")?copy(sw.dhcpServerConfig):null;
}
export function configureSwitchDhcp(registry,switchId,{enabled,pools}){
 const sw=registry?.getAsset?.(switchId);
 if(!sw||!sw.networkCapabilities?.includes("inter-vlan-routing")||
    !sw.networkCapabilities.includes("dhcp-server"))
  return bad("unsupported","Service DHCP réservé aux switchs L3 compatibles");
 if(typeof enabled!=="boolean"||!Array.isArray(pools))
  return bad("invalid_config","État ou plages DHCP invalides");
 return registry.setAssetDhcpServerConfig(switchId,{assetId:switchId,enabled,pools:copy(pools)});
}
const corePools=pools=>pools.map(({vlanNumber,...pool})=>copy(pool));
export function createSwitchDhcpCoreObject(registry,switchId){
 const sw=registry?.getAsset?.(switchId),conf=getSwitchDhcpConfig(registry,switchId);
 if(!sw||!conf)return null;
 const svis=Object.values(sw.routingConfig?.interfaces??{});
 const svi=svis.find(x=>x.enabled)??svis[0];
 return {
  id:sw.id,kind:"switch-l3",name:sw.name,
  ports:sw.ports.filter(p=>p.medium==="ethernet").map(p=>({id:p.id,type:"rj45"})),
  config:{
   ...(svi?{ipv4:{interfaceId:sw.ports.find(p=>p.medium==="ethernet")?.id,mode:"static",address:svi.address,prefix:svi.prefix}}:{}),
   ...(conf.pools.length?{dhcpPools:corePools(conf.pools),dhcpEnabled:conf.enabled}:{})
  }
 };
}
function clientVlan(registry,sw,client){
 if(client.status!=="En service"||sw.status!=="En service")
  return bad("offline","Un équipement est hors service");
 const clientPorts=client.ports.filter(p=>p.type==="ethernet-rj45");
 if(clientPorts.length!==1)return bad("unsupported_topology","Un port RJ45 client unique est nécessaire");
 const found=sw.ports.filter(p=>p.type==="ethernet-rj45").filter(p=>
  registry.explorePhysicalPath(clientPorts[0].id,p.id).connected);
 if(found.length!==1)return bad(found.length?"unsupported_topology":"disconnected",
  found.length?"Topologie ambiguë":"Client non raccordé au switch L3");
 const port=sw.vlanConfig?.ports?.[found[0].id];
 if(port?.mode!=="access")return bad("unsupported_topology","Port Access requis sur le switch");
 const vlan=sw.vlanConfig.vlans.find(v=>v.id===port.vlanId);
 return vlan?{success:true,number:vlan.number}:bad("invalid_vlan","VLAN inexistant");
}
export function requestSwitchDhcp({
 registry,switchId,clientId,dhcpEngine,commandId
}){
 if(!dhcpEngine?.getSnapshot||!dhcpEngine?.dispatch||!dhcpEngine?.query)
  return bad("missing_core","Moteur DHCP commun indisponible");
 const sw=registry?.getAsset?.(switchId),client=registry?.getAsset?.(clientId);
 const conf=getSwitchDhcpConfig(registry,switchId);
 if(!sw||!client||!conf)return bad("missing_asset","Switch DHCP ou client introuvable");
 const vlan=clientVlan(registry,sw,client);if(!vlan.success)return vlan;
 const pool=conf.pools.find(p=>p.vlanNumber===vlan.number);
 if(!pool)return bad("missing_pool","Aucune plage DHCP du VLAN "+vlan.number);
 if(conf.pools.filter(p=>p.vlanNumber===vlan.number).length!==1)
  return bad("ambiguous_pool","Plusieurs plages associées au VLAN : configuration ambiguë");
 const svi=sw.routingConfig?.interfaces?.[String(vlan.number)];
 if(!svi?.enabled||!subnet(pool.start,svi.address,pool.prefix)||
    svi.prefix!==pool.prefix||pool.gateway!==svi.address)
  return bad("invalid_interface","Interface VLAN et plage DHCP incompatibles");
 const state=dhcpEngine.getSnapshot();
 const actual=state.objectsById[sw.id],current=state.objectsById[client.id];
 if(!actual||!current?.config?.ipv4||current.config.ipv4.mode!=="dhcp")
  return bad("missing_core_asset","Client ou switch absent du Core DHCP");
 const pools=dhcpEngine.query({type:"dhcp.pools",serverId:sw.id});
 if(pools.status!=="ok"||pools.enabled!==conf.enabled||
    !same(pools.pools,corePools(conf.pools)))
  return bad("out_of_sync","Configuration du Core DHCP et du registre R2 non synchronisée");
 const response=dhcpEngine.dispatch({
  commandVersion:1,id:commandId??"l3-dhcp-"+(state.revision+1),
  type:"dhcp.request",targetId:clientId,params:{serverId:switchId,poolId:pool.id}
 });
 if(response.status!=="applied")return bad("core_rejected",response.message||"Requête DHCP refusée");
 const updated=dhcpEngine.getSnapshot();
 const currentIp=updated.objectsById[clientId].config.ipv4;
 return {success:updated.runtime?.[clientId]?.dhcpStatus==="lease",
  code:updated.runtime?.[clientId]?.dhcpStatus??"unknown",
  address:currentIp.address,prefix:currentIp.prefix,lease:copy(currentIp.lease),
  vlanNumber:vlan.number,serverId:switchId};
}

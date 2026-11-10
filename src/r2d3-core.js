/* R2D3 Core V1 - moteur autonome, sans DOM ni stockage. */
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (code, message) => ({status:"rejected", code, message});
const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
function ipv4ToInt(s) {
  if (typeof s !== "string" || !/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return null;
  const a = s.split(".").map(Number);
  if (a.some(n => n > 255)) return null;
  return a.reduce((v,n) => ((v << 8) | n) >>> 0, 0);
}
function sameSubnet(a,b,p) {
  const x=ipv4ToInt(a), y=ipv4ToInt(b);
  if (x===null || y===null || !Number.isInteger(p) || p<0 || p>32) return false;
  const mask = p===0 ? 0 : (0xffffffff << (32-p)) >>> 0;
  return (x & mask) === (y & mask);
}
function validNetworkOptions(v) {
  return isObj(v) && (v.gateway===null || ipv4ToInt(v.gateway)!==null) &&
    Array.isArray(v.dns) && v.dns.length<=2 &&
    v.dns.every(address=>ipv4ToInt(address)!==null) &&
    new Set(v.dns).size===v.dns.length;
}
function validDhcpPool(p) {
  return isObj(p) && ipv4ToInt(p.start)!==null && ipv4ToInt(p.end)!==null &&
    ipv4ToInt(p.start)<=ipv4ToInt(p.end) && (ipv4ToInt(p.end)-ipv4ToInt(p.start))<=254 &&
    Number.isInteger(p.prefix) && p.prefix>=1 && p.prefix<=30 &&
    sameSubnet(p.start,p.end,p.prefix) &&
    validNetworkOptions({gateway:p.gateway,dns:p.dns}) &&
    Number.isInteger(p.leaseSeconds) && p.leaseSeconds>=60 && p.leaseSeconds<=2592000 &&
    (p.exclusions===undefined || Array.isArray(p.exclusions) && new Set(p.exclusions).size===p.exclusions.length &&
      p.exclusions.every(ip=>ipv4ToInt(ip)!==null && ipv4ToInt(ip)>=ipv4ToInt(p.start) && ipv4ToInt(ip)<=ipv4ToInt(p.end))) &&
    (p.reservations===undefined || Array.isArray(p.reservations) &&
      p.reservations.every(r=>isObj(r) && typeof r.mac==="string" && /^([0-9A-F]{2}-){5}[0-9A-F]{2}$/i.test(r.mac) &&
        ipv4ToInt(r.address)!==null && ipv4ToInt(r.address)>=ipv4ToInt(p.start) && ipv4ToInt(r.address)<=ipv4ToInt(p.end) &&
        !(p.exclusions??[]).includes(r.address)) &&
      new Set(p.reservations.map(r=>r.mac.toUpperCase())).size===p.reservations.length &&
      new Set(p.reservations.map(r=>r.address)).size===p.reservations.length);
}
function dhcpPools(config){return Array.isArray(config.dhcpPools)?config.dhcpPools:(config.dhcpPool?[{id:"default",...config.dhcpPool}]:[]);}
function selectedPool(config,id){const ps=dhcpPools(config);return id===undefined?(ps.length===1?ps[0]:null):ps.find(p=>p.id===id)??null;}
function validPools(config){
 if(config.dhcpPools===undefined)return config.dhcpPool===undefined||validDhcpPool(config.dhcpPool);
 if(config.dhcpPool!==undefined||!Array.isArray(config.dhcpPools)||!config.dhcpPools.length)return false;
 const ids=new Set();
 for(const p of config.dhcpPools){if(typeof p.id!=="string"||!/^[a-zA-Z0-9_-]+$/.test(p.id)||ids.has(p.id)||!validDhcpPool(p))return false;ids.add(p.id);}
 for(let i=0;i<config.dhcpPools.length;i++)for(let j=i+1;j<config.dhcpPools.length;j++){const a=config.dhcpPools[i],b=config.dhcpPools[j];if(ipv4ToInt(a.start)<=ipv4ToInt(b.end)&&ipv4ToInt(b.start)<=ipv4ToInt(a.end))return false;}
 return true;
}
function validIpv4(v){
  return isObj(v) && (v.mode==="static"
    ? ipv4ToInt(v.address)!==null && Number.isInteger(v.prefix) && v.prefix>=0 && v.prefix<=32
    : v.mode==="dhcp" && (v.address===null || ipv4ToInt(v.address)!==null) &&
      (v.prefix===null || Number.isInteger(v.prefix) && v.prefix>=0 && v.prefix<=32) &&
      (v.lease===null || isObj(v.lease) && typeof v.lease.serverId==="string" &&
       Number.isInteger(v.lease.start) && Number.isInteger(v.lease.expires) && v.lease.expires>v.lease.start && (v.lease.poolId===undefined || typeof v.lease.poolId==="string" && v.lease.poolId.length>0)));
}

function validDnsName(value) {
  return typeof value==="string" && value.length<=253 &&
    /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(value);
}
function dnsTtl(value,defaultValue=300) {return value===undefined?defaultValue:value;}
function validDnsTtl(value) {return value===undefined || Number.isInteger(value) && value>=1 && value<=86400;}
function dnsCacheEntries(current,clientId) {
  const cache=current.domainState.dnsCaches?.[clientId]??{};
  return Object.values(cache).filter(entry=>entry.expires>current.simulationClock)
    .map(entry=>({...clone(entry),remainingTtl:entry.expires-current.simulationClock}));
}
function dnsCacheKey(name){return name.trim().toLowerCase().replace(/\\.$/,"");}
const dnsTypes=["A","AAAA","CNAME","MX","TXT","PTR"];
const dnsRecordType=type=>typeof type==="string"?type.toUpperCase():"A";
const dnsTypedCacheKey=(name,type)=>type==="A"?name:type+"|"+name;
function dnsQueryName(name,type){
  if(typeof name!=="string")return null;
  const plain=dnsCacheKey(name);
  if(type==="PTR"&&ipv4ToInt(plain)!==null)return plain.split(".").reverse().join(".")+".in-addr.arpa";
  return plain;
}
function validIpv6(value){
  if(typeof value!=="string" || !/^[0-9a-f:]+$/i.test(value) || value.includes(":::"))return false;
  const parts=value.split("::");
  if(parts.length>2)return false;
  const left=parts[0]?parts[0].split(":"):[],right=parts.length===2&&parts[1]?parts[1].split(":"):[];
  if([...left,...right].some(x=>!/^[0-9a-f]{1,4}$/i.test(x)))return false;
  return parts.length===2?left.length+right.length<8:left.length===8;
}
function validDnsRecord(record,domain){
  if(!isObj(record)||!validDnsName(record.name)||!dnsTypes.includes(record.type)||
     typeof record.value!=="string"||!validDnsTtl(record.ttl))return false;
  const name=record.name.toLowerCase();
  if(name!==domain&&!name.endsWith("."+domain)&&!(record.type==="PTR"&&name.endsWith(".in-addr.arpa")))return false;
  if(record.type==="A")return ipv4ToInt(record.value)!==null;
  if(record.type==="AAAA")return validIpv6(record.value);
  if(record.type==="TXT")return record.value.length>0&&record.value.length<=255;
  if(record.type==="MX")return validDnsName(record.value)&&Number.isInteger(record.priority)&&record.priority>=0&&record.priority<=65535;
  if(record.type==="PTR")return name.endsWith(".in-addr.arpa")&&validDnsName(record.value);
  return validDnsName(record.value)&&(record.value.toLowerCase()===domain||record.value.toLowerCase().endsWith("."+domain));
}
function validDnsConfig(c) {
  if(c.dnsZone===undefined && c.dnsEnabled===undefined)return true;
  if(typeof c.dnsEnabled!=="boolean"||!isObj(c.dnsZone)||
     !validDnsName(c.dnsZone.domain)||!Array.isArray(c.dnsZone.records)||!validDnsTtl(c.dnsZone.negativeTtl))return false;
  const domain=c.dnsZone.domain.toLowerCase(),keys=new Set(),cnames=new Set(),ordinary=new Set();
  for(const record of c.dnsZone.records){
    if(!validDnsRecord(record,domain))return false;
    const name=record.name.toLowerCase();
    if(record.type==="CNAME")cnames.add(name);else ordinary.add(name);
    const key=name+"|"+record.type+"|"+(["MX","TXT"].includes(record.type)?(record.priority??"")+"|"+record.value:"");
    if(keys.has(key))return false;
    keys.add(key);
    // Only MX and TXT can repeat with the same name and type in this pedagogical model.
    if(!["MX","TXT"].includes(record.type)&&c.dnsZone.records.filter(r=>r.name.toLowerCase()===name&&r.type===record.type).length>1)return false;
  }
  return ![...cnames].some(name=>ordinary.has(name));
}
function checkScenario(s) {
  if (!isObj(s) || s.format!=="r2d3-scenario" || s.schemaVersion!==1 ||
      typeof s.scenarioId!=="string" || !s.scenarioId ||
      typeof s.scenarioVersion!=="string" || !s.scenarioVersion ||
      !Array.isArray(s.objects) || !Array.isArray(s.links) || !isObj(s.capabilities))
    throw new Error("Scénario R2D3 V1 incompatible");
  const ids=new Set(), ports=new Set(), occupied=new Set();
  for (const o of s.objects) {
    if (!o.id || ids.has(o.id) || !Array.isArray(o.ports) || !isObj(o.config)) throw new Error("Objet ou identifiant invalide");
    ids.add(o.id);
    if(o.config.networkOptions!==undefined && !validNetworkOptions(o.config.networkOptions)) throw new Error("Paramètres réseau invalides");
    if(o.config.ipv4!==undefined && !validIpv4(o.config.ipv4))throw new Error("Configuration IPv4 invalide");
    if(!validDnsConfig(o.config))throw new Error("Configuration DNS invalide");
    if((o.config.dhcpPool!==undefined || o.config.dhcpPools!==undefined) && (!validPools(o.config) || typeof o.config.dhcpEnabled!=="boolean"))
      throw new Error("Serveur DHCP invalide");
    for (const p of o.ports) {
      const key=o.id+":"+p.id;
      if (!p.id || ports.has(key)) throw new Error("Port invalide");
      ports.add(key);
    }
  }
  const linkIds=new Set();
  for(const l of s.links) {
    if(!l.id || linkIds.has(l.id) || !Array.isArray(l.endpoints) || l.endpoints.length!==2 || typeof l.connected!=="boolean")
      throw new Error("Liaison invalide");
    linkIds.add(l.id);
    for(const e of l.endpoints) {
      const key=e.objectId+":"+e.portId;
      if(!ports.has(key) || occupied.has(key)) throw new Error("Raccordement impossible");
      occupied.add(key);
    }
  }
}
function initialState(s) {
  return {
    format:"r2d3-state", schemaVersion:1,
    scenario:{scenarioId:s.scenarioId,scenarioVersion:s.scenarioVersion},
    revision:0,
    objectsById:Object.fromEntries(s.objects.map(o=>[o.id,clone(o)])),
    linksById:Object.fromEntries(s.links.map(l=>[l.id,clone(l)])),
    runtime:{}, domainState:{}, simulationClock:0, technicalEvidence:[]
  };
}
function validRestoredDnsState(state) {
  const domain=state.domainState;
  if(domain.dnsCaches!==undefined){
    if(!isObj(domain.dnsCaches))return false;
    for(const [clientId,cache] of Object.entries(domain.dnsCaches)){
      if(!state.objectsById[clientId]?.config.ipv4||!isObj(cache))return false;
      for(const [key,entry] of Object.entries(cache)){
        if(!isObj(entry)||typeof entry.name!=="string"||
           !validDnsName(entry.name)||!["A","AAAA","MX","TXT","PTR"].includes(entry.recordType??"A")||
           key!==dnsTypedCacheKey(entry.name,entry.recordType??"A")||
           typeof entry.found!=="boolean"||
           !Number.isSafeInteger(entry.ttl)||entry.ttl<1||entry.ttl>86400||
           !Number.isSafeInteger(entry.expires)||entry.expires<0||
           !Array.isArray(entry.chain)||entry.chain.some(record=>!isObj(record)||!validDnsName(record.name)||!dnsTypes.includes(record.type)||typeof record.value!=="string"||!validDnsTtl(record.ttl)||
             (record.type==="A"&&ipv4ToInt(record.value)===null)||
             (record.type==="AAAA"&&!validIpv6(record.value))||
             (["CNAME","PTR"].includes(record.type)&&!validDnsName(record.value))||
             (record.type==="MX"&&(!validDnsName(record.value)||!Number.isInteger(record.priority))))||
           (entry.serverAddress!==undefined&&ipv4ToInt(entry.serverAddress)===null))return false;
        if(entry.found){
          if(entry.reason!==null||entry.chain.length===0)return false;
          if((entry.recordType??"A")==="A"&&
             (ipv4ToInt(entry.address)===null||entry.chain.at(-1).type!=="A"||entry.chain.at(-1).value!==entry.address))return false;
          if((entry.recordType??"A")!=="A"&&(!Array.isArray(entry.records)||entry.records.length===0))return false;
        }else if(entry.address!==null||!["name_not_found","name_outside_zone"].includes(entry.reason))return false;
      }
    }
  }
  if(domain.dnsLastResults!==undefined){
    if(!isObj(domain.dnsLastResults))return false;
    for(const [clientId,result] of Object.entries(domain.dnsLastResults)){
      if(!state.objectsById[clientId]?.config.ipv4||!isObj(result)||
         !["ok","unavailable"].includes(result.status)||typeof result.fromCache!=="boolean"||
         (result.found!==undefined&&typeof result.found!=="boolean")||
         (result.address!==undefined&&ipv4ToInt(result.address)===null)||
         (result.ttl!==undefined&&(!Number.isInteger(result.ttl)||result.ttl<0||result.ttl>86400))||
         (result.chain!==undefined&&(!Array.isArray(result.chain)||result.chain.some(record=>!isObj(record)))))return false;
    }
  }
  return true;
}
function validateState(s, state) {
  if (!isObj(state) || state.format!=="r2d3-state" || state.schemaVersion!==1 ||
      state.scenario?.scenarioId!==s.scenarioId || state.scenario?.scenarioVersion!==s.scenarioVersion ||
      !Number.isSafeInteger(state.revision) || state.revision<0 || !isObj(state.objectsById) ||
      !isObj(state.linksById) || !isObj(state.runtime) || !isObj(state.domainState) ||
      !Array.isArray(state.technicalEvidence) || !Number.isFinite(state.simulationClock))
    throw new Error("État exporté incompatible");
  if (Object.keys(state.objectsById).sort().join("|")!==s.objects.map(x=>x.id).sort().join("|") ||
      Object.keys(state.linksById).sort().join("|")!==s.links.map(x=>x.id).sort().join("|"))
    throw new Error("Inventaire incohérent");
  if(!validRestoredDnsState(state))throw new Error("Cache DNS restauré invalide");
  const test={...s,objects:Object.values(state.objectsById),links:Object.values(state.linksById)};
  checkScenario(test);
  for(const o of Object.values(state.objectsById)){
    if(o.config.ipv4){
      const v=o.config.ipv4;
      if(!validIpv4(v))
        throw new Error("IPv4 restaurée invalide");
    }
  }
}
function makeEngine(scenario, existing) {
  const s=clone(scenario);
  checkScenario(s);
  let state=existing ? clone(existing) : initialState(s);
  if(existing) validateState(s,state);
  const listeners=new Set(), seenIds=new Set();
  function getSnapshot(){return clone(state);}
  function networkPing(sourceId,targetId) {
    const a=state.objectsById[sourceId], b=state.objectsById[targetId];
    if(!a || !b) return {status:"unknown",success:false,reason:"Objet inconnu"};
    if(!a.config.ipv4 || !b.config.ipv4) return {status:"unavailable",success:false,reason:"Interface IPv4 absente"};
    const av=a.config.ipv4, bv=b.config.ipv4;
    if(!av.address || !bv.address || av.prefix===null || bv.prefix===null)return {status:"ok",success:false,reason:"Adresse IPv4 non attribuée"};
    const physical=physicalPath(sourceId,targetId);
    if(!physical) return {status:"ok",success:false,reason:"Liaison physique interrompue"};
    const duplicates=ipv4Conflicts().filter(x=>x.ids.includes(sourceId)||x.ids.includes(targetId));
    if(duplicates.length)return {status:"ok",success:false,reason:"Conflit d'adresse IPv4 détecté, communication non fiable dans cette simulation",conflict:true};
    if(!sameSubnet(av.address,bv.address,av.prefix) || !sameSubnet(av.address,bv.address,bv.prefix))
      return {status:"ok",success:false,reason:"Adressage IPv4 incompatible sans routeur"};
    if(av.address===bv.address) return {status:"ok",success:false,reason:"Conflit d'adresse IPv4"};
    return {status:"ok",success:true,reason:"Réponse reçue",source:av.address,target:bv.address};
  }
  function physicalPath(from,to) {
    const visited=new Set([from]), queue=[from];
    while(queue.length) {
      const id=queue.shift();
      if(id===to)return true;
      for(const l of Object.values(state.linksById)){
        if(!l.connected)continue;
        const [x,y]=l.endpoints.map(e=>e.objectId);
        const neighbor=x===id?y:y===id?x:null;
        if(neighbor && !visited.has(neighbor)){
          visited.add(neighbor);queue.push(neighbor);
        }
      }
    }
    return false;
  }
  function ipv4Conflicts() {
    const groups=new Map();
    for(const o of Object.values(state.objectsById)){
      const address=o.config.ipv4?.address;
      if(!address || address.startsWith("169.254."))continue;
      if(!groups.has(address))groups.set(address,[]);
      groups.get(address).push(o.id);
    }
    return [...groups.entries()].flatMap(([address,ids])=>{
      if(ids.length<2)return [];
      // Un doublon sur un segment isolé ne constitue pas un conflit visible.
      const connected=ids.filter(id=>ids.some(other=>other!==id&&physicalPath(id,other)));
      return connected.length>=2?[{address,ids:connected}]:[];
    });
  }
  function query(q){
    if(!isObj(q))return {status:"unavailable",reason:"Requête non prise en charge"};
    if(s.capabilities.network!==true)return {status:"unavailable",reason:"Capacité réseau désactivée"};
    if(q.type==="dhcp.pools" || q.type==="dhcp.leases"){
      const server=state.objectsById[q.serverId];
      if(!server || !dhcpPools(server.config).length)return {status:"unavailable",reason:"Serveur DHCP inconnu"};
      const pools=dhcpPools(server.config);
      if(q.poolId!==undefined && !pools.some(p=>p.id===q.poolId))return {status:"unavailable",reason:"Plage DHCP inconnue"};
      if(q.type==="dhcp.pools")return {status:"ok",enabled:server.config.dhcpEnabled,pools:clone(q.poolId===undefined?pools:pools.filter(p=>p.id===q.poolId))};
      const activeIds=new Set(pools.map(p=>p.id));
      const leases=Object.values(state.objectsById).flatMap(client=>{
        const ip=client.config.ipv4,lease=ip?.lease;
        if(ip?.mode!=="dhcp" || !lease || lease.serverId!==server.id ||
           lease.expires<=state.simulationClock)return [];
        const poolId=lease.poolId??"default";
        if(!activeIds.has(poolId) || q.poolId!==undefined && poolId!==q.poolId)return [];
        return [{clientId:client.id,mac:client.config.macAddress??null,address:ip.address,poolId,
          start:lease.start,expires:lease.expires}];
      });
      return {status:"ok",leases:clone(leases)};
    }
    if(q.type==="dns.cache"){
      const client=state.objectsById[q.sourceId];
      if(!client?.config.ipv4)return {status:"unavailable",reason:"Poste DNS inexistant"};
      return {status:"ok",entries:dnsCacheEntries(state,q.sourceId)};
    }
    if(q.type==="dns.lastResult"){
      if(!state.objectsById[q.sourceId]?.config.ipv4)return {status:"unavailable",reason:"Poste DNS inexistant"};
      return {status:"ok",result:clone(state.domainState.dnsLastResults?.[q.sourceId]??null)};
    }
    if(q.type==="dns.resolve"){
      const client=state.objectsById[q.sourceId],type=dnsRecordType(q.recordType),
        name=dnsQueryName(q.name,type);
      if(!client?.config.ipv4||!validDnsName(name)||!["A","AAAA","MX","TXT","PTR"].includes(type))
        return {status:"unavailable",reason:"Client, nom ou type DNS invalide"};
      const configured=client.config.networkOptions?.dns??[];
      const serverIp=q.serverAddress??configured[0];
      if(!serverIp||!configured.includes(serverIp))return {status:"unavailable",reason:"Serveur DNS non configure sur le poste"};
      const server=Object.values(state.objectsById).find(o=>o.config.dnsEnabled!==undefined&&o.config.ipv4?.address===serverIp);
      if(!server||!server.config.dnsEnabled)return {status:"unavailable",reason:"Serveur DNS indisponible"};
      if(!networkPing(client.id,server.id).success)return {status:"unavailable",reason:"Serveur DNS inaccessible"};
      const zone=server.config.dnsZone,domain=zone.domain.toLowerCase();
      const inZone=name===domain||name.endsWith("."+domain)||(type==="PTR"&&name.endsWith(".in-addr.arpa"));
      if(!inZone)return {status:"ok",found:false,reason:"name_outside_zone",serverId:server.id,serverAddress:serverIp,chain:[],ttl:dnsTtl(zone.negativeTtl,60)};
      let current=name;const visited=new Set(),chain=[];
      while(true){
        if(visited.has(current))return {status:"ok",found:false,reason:"alias_loop",serverId:server.id,serverAddress:serverIp,chain};
        visited.add(current);
        const records=zone.records.filter(r=>r.name.toLowerCase()===current);
        const matching=records.filter(r=>r.type===type);
        if(matching.length){
          const ordered=type==="MX"?matching.slice().sort((a,b)=>a.priority-b.priority):matching;
          const resultRecords=ordered.map(r=>clone(r));
          const ttl=Math.min(...[...chain,...ordered].map(r=>dnsTtl(r.ttl)));
          return {status:"ok",found:true,...(type==="A"?{address:ordered[0].value}:{}),
            records:resultRecords,recordType:type,serverId:server.id,serverAddress:serverIp,
            chain:[...chain,...resultRecords],ttl};
        }
        const cname=records.find(r=>r.type==="CNAME");
        if(!cname||type==="PTR")return {status:"ok",found:false,reason:"name_not_found",serverId:server.id,serverAddress:serverIp,chain,ttl:dnsTtl(zone.negativeTtl,60)};
        chain.push({name:cname.name,type:cname.type,value:cname.value,ttl:dnsTtl(cname.ttl)});
        current=cname.value.toLowerCase();
      }
    }
    if(q.type==="network.arpTable"){
      const pc=state.objectsById[q.sourceId];
      if(!pc?.config.ipv4)return {status:"unavailable",reason:"Poste IPv4 inexistant"};
      return {status:"ok",entries:clone(state.domainState.arpCaches?.[q.sourceId]??[])};
    }
    if(q.type==="network.ipv4Conflicts")return {status:"ok",conflicts:ipv4Conflicts()};
    if(q.type==="network.pingAddress"){
      if(ipv4ToInt(q.address)===null)return {status:"unavailable",success:false,reason:"Adresse IPv4 invalide"};
      const targets=Object.values(state.objectsById).filter(o=>o.config.ipv4?.address===q.address);
      if(!targets.length)return {status:"ok",success:false,reason:"Aucun équipement simulé ne possède cette adresse"};
      if(targets.length>1)return {status:"ok",success:false,reason:"Plusieurs équipements possèdent cette IPv4",conflict:true};
      return networkPing(q.sourceId,targets[0].id);
    }
    if(q.type==="network.ping")return networkPing(q.sourceId,q.targetId);
    return {status:"unavailable",reason:"Requête non prise en charge"};
  }
  function apipaAddress(clientId, current) {
    const clients=Object.values(current.objectsById).filter(o=>o.config.ipv4?.mode==="dhcp").map(o=>o.id).sort();
    // Adresse stable par client pour cette première simulation, sans conflit entre clients.
    return "169.254.10."+(20+clients.indexOf(clientId));
  }
  // Seules les attributions DHCP encore valides sont connues du serveur.
  // Une IPv4 statique d'un autre equipement n'est pas une exclusion implicite.
  function leasedToOther(current, clientId, serverId, poolId, address) {
    return Object.values(current.objectsById).some(o=>{
      if(o.id===clientId || o.config.ipv4?.mode!=="dhcp")return false;
      const lease=o.config.ipv4.lease;
      return o.config.ipv4.address===address && lease &&
        lease.expires>current.simulationClock && lease.serverId===serverId &&
        (lease.poolId??"default")===(poolId??"default");
    });
  }
  function dispatch(c) {
    if(!isObj(c) || c.commandVersion!==1 || typeof c.id!=="string" || !c.id ||
       typeof c.type!=="string" || typeof c.targetId!=="string" || !isObj(c.params))
      return fail("invalid_command","Commande invalide");
    if(seenIds.has(c.id))return {status:"rejected",code:"duplicate_command",revision:state.revision};
    if(c.expectedRevision!==undefined && c.expectedRevision!==state.revision)
      return fail("revision_conflict","Révision obsolète");
    if(s.capabilities.network!==true)return fail("capability_unavailable","Réseau désactivé");
    const next=clone(state);
    if(c.type==="dns.clientResolve"){
      const client=next.objectsById[c.targetId],name=dnsQueryName(c.params.name,dnsRecordType(c.params.recordType)),
        recordType=dnsRecordType(c.params.recordType);
      if(!client?.config.ipv4||!validDnsName(name)||!["A","AAAA","MX","TXT","PTR"].includes(recordType))
        return fail("invalid_dns_request","Poste, nom ou type DNS invalide");
      if(!isObj(next.domainState.dnsCaches))next.domainState.dnsCaches={};
      if(!isObj(next.domainState.dnsCaches[c.targetId]))next.domainState.dnsCaches[c.targetId]={};
      if(!isObj(next.domainState.dnsLastResults))next.domainState.dnsLastResults={};
      const cache=next.domainState.dnsCaches[c.targetId],key=dnsTypedCacheKey(name,recordType);
      const saved=cache[key],valid=saved&&saved.expires>next.simulationClock;
      if(saved&&!valid)delete cache[key];
      let outcome;
      if(valid){
        outcome={status:"ok",found:saved.found,address:saved.address??undefined,records:clone(saved.records??[]),
          recordType,reason:saved.reason??undefined,chain:clone(saved.chain),
          serverAddress:saved.serverAddress,ttl:saved.expires-next.simulationClock,fromCache:true};
      }else{
        const raw=query({type:"dns.resolve",sourceId:c.targetId,name,recordType});
        outcome={...raw,fromCache:false};
        if(raw.status==="ok"&&(raw.found||["name_not_found","name_outside_zone"].includes(raw.reason))){
          const ttl=raw.ttl;
          cache[key]={name,...(recordType!=="A"?{recordType}:{}),found:raw.found,address:raw.address??null,
            records:clone(raw.records??[]),reason:raw.reason??null,chain:clone(raw.chain),
            serverAddress:raw.serverAddress,expires:next.simulationClock+ttl,ttl};
        }
      }
      next.domainState.dnsLastResults[c.targetId]=outcome;
    }else if(c.type==="dns.flushCache"){
      if(!next.objectsById[c.targetId]?.config.ipv4)return fail("invalid_dns_client","Poste DNS inexistant");
      if(!isObj(next.domainState.dnsCaches))next.domainState.dnsCaches={};
      next.domainState.dnsCaches[c.targetId]={};
    }else if(c.type==="network.setIPv4"){
      const o=next.objectsById[c.targetId], p=c.params;
      if(!o || !o.config.ipv4 || !o.ports.some(port=>port.id===p.interfaceId))
        return fail("unsupported_target","Interface inexistante");
      if(p.mode!=="static" || ipv4ToInt(p.address)===null ||
         !Number.isInteger(p.prefix) || p.prefix<0 || p.prefix>32)
        return fail("invalid_ipv4","Adresse IPv4 ou préfixe impossible");
      o.config.ipv4={mode:"static",address:p.address,prefix:p.prefix,interfaceId:p.interfaceId};
    }else if(c.type==="dhcp.setServerEnabled"){
      const o=next.objectsById[c.targetId];
      if(!o || !dhcpPools(o.config).length || typeof c.params.enabled!=="boolean")
        return fail("invalid_dhcp_server","Serveur DHCP ou état invalide");
      o.config.dhcpEnabled=c.params.enabled;
    }else if(c.type==="dhcp.configurePool"){
      const o=next.objectsById[c.targetId];
      if(!o?.config.dhcpPool)return fail("invalid_dhcp_server","Serveur DHCP inexistant");
      const pool={...o.config.dhcpPool,...c.params};
      if(!validDhcpPool(pool))return fail("invalid_dhcp_pool","Plage, exclusions ou réservations invalides");
      o.config.dhcpPool=pool;
    }else if(["dhcp.addPool","dhcp.updatePool","dhcp.removePool"].includes(c.type)){
      const server=next.objectsById[c.targetId],p=c.params;
      if(!server || !Array.isArray(server.config.dhcpPools))return fail("invalid_dhcp_server","Serveur multi-plage inexistant");
      const pools=server.config.dhcpPools;
      if(c.type==="dhcp.addPool"){
        if(!isObj(p.pool)||typeof p.pool.id!=="string")return fail("invalid_dhcp_pool","Nouvelle plage invalide");
        pools.push(clone(p.pool));
      }else{
        const index=pools.findIndex(pool=>pool.id===p.poolId);
        if(index<0)return fail("invalid_dhcp_pool","Plage inconnue");
        if(c.type==="dhcp.removePool"){
          if(pools.length===1)return fail("invalid_dhcp_pool","Derniere plage non supprimable");
          pools.splice(index,1);
        }else{
          if(!isObj(p.changes)||p.changes.id!==undefined)return fail("invalid_dhcp_pool","Modification invalide");
          pools[index]={...pools[index],...p.changes};
        }
      }
      if(!validPools(server.config))return fail("invalid_dhcp_pool","Plages DHCP invalides");
    }else if(c.type==="dhcp.advanceTime" || c.type==="simulation.advanceTime"){
      // Horloge commune. L'ancienne commande DHCP reste compatible.
      const seconds=c.params.seconds;
      if(c.type==="dhcp.advanceTime" && !dhcpPools(next.objectsById[c.targetId]?.config??{}).length)
        return fail("invalid_time_step","Serveur DHCP inconnu");
      if(c.type==="simulation.advanceTime" && c.targetId!=="simulation-clock")
        return fail("invalid_time_target","Horloge de simulation inconnue");
      if(!Number.isSafeInteger(seconds) || seconds<1 || seconds>604800 ||
         !Number.isSafeInteger(next.simulationClock+seconds))
        return fail("invalid_time_step","Progression temporelle invalide");
      const until=next.simulationClock+seconds;
      for(const client of Object.values(next.objectsById)){
        const ip=client.config.ipv4;
        if(ip?.mode!=="dhcp" || !ip.lease)continue;
        const lease=ip.lease;
        const originalDuration=lease.expires-lease.start;
        const checkpoints=[
          {at:lease.start+Math.floor(originalDuration/2),phase:"t1"},
          {at:lease.start+Math.floor(originalDuration*0.875),phase:"t2"},
          {at:lease.expires,phase:"expiry"}
        ];
        // Rejouer les échéances entre l'ancienne et la nouvelle heure.
        // Une réussite à T1/T2 produit un nouveau bail et une nouvelle période.
        let previous=next.simulationClock,cycles=0,working=true;
        while(working){
          if(++cycles>30000)return fail("time_step_too_large","Progression trop importante pour ces baux");
          const currentLease=ip.lease;
          if(!currentLease)break;
          const duration=currentLease.expires-currentLease.start;
          const stages=[
            {at:currentLease.start+Math.floor(duration/2),phase:"t1"},
            {at:currentLease.start+Math.floor(duration*0.875),phase:"t2"},
            {at:currentLease.expires,phase:"expiry"}
          ];
          const event=stages.find(entry=>entry.at>previous && entry.at<=until);
          if(!event)break;
          previous=event.at;
          if(event.phase==="expiry"){
            // Le bail n'est plus utilisable. Sans reponse DHCP, le poste
            // bascule en adressage automatique APIPA dans ce simulateur.
            ip.address=apipaAddress(client.id,next);ip.prefix=16;ip.lease=null;
            client.config.networkOptions={gateway:null,dns:[]};
            next.runtime[client.id]={dhcpStatus:"apipa",dhcpLeasePhase:"expired-apipa",dhcpEventAt:previous};
            break;
          }
          const server=next.objectsById[currentLease.serverId];
          if(server?.config.dhcpEnabled && physicalPath(client.id,server.id)){
            const pool=selectedPool(server.config,currentLease.poolId);
            // Renouveler l'adresse actuelle seulement si elle reste attribuable.
            const excluded=(pool?.exclusions??[]).includes(ip.address);
            const reservations=pool?.reservations??[];
            const mac=client.config.macAddress?.toUpperCase();
            const ownReservation=reservations.find(r=>r.mac.toUpperCase()===mac);
            const reservedOther=reservations.some(r=>r.address===ip.address&&r.mac.toUpperCase()!==mac);
            const occupiedOther=leasedToOther(next,client.id,server.id,currentLease.poolId,ip.address);
            const reservationMatches=!ownReservation || ownReservation.address===ip.address;
            const address=ipv4ToInt(ip.address),lo=pool?ipv4ToInt(pool.start):null,hi=pool?ipv4ToInt(pool.end):null;
            if(pool && address!==null && address>=lo && address<=hi && !excluded && !reservedOther && !occupiedOther && reservationMatches){
              ip.lease={...currentLease,serverId:server.id,start:previous,expires:previous+pool.leaseSeconds};
              client.config.networkOptions={gateway:pool.gateway,dns:[...pool.dns]};
              next.runtime[client.id]={dhcpStatus:"lease",dhcpLeasePhase:"renewed-"+event.phase,dhcpEventAt:previous};
              continue;
            }
          }
          next.runtime[client.id]={dhcpStatus:"lease-retained",dhcpLeasePhase:event.phase+"-failed",dhcpEventAt:previous};
        }
      }
      next.simulationClock=until;
    }else if(c.type==="dhcp.release"){
      const client=next.objectsById[c.targetId], ip=client?.config.ipv4;
      if(!ip || ip.mode!=="dhcp")return fail("not_dhcp_client","Client DHCP inexistant");
      ip.address=null;
      ip.prefix=null;
      ip.lease=null;
      client.config.networkOptions={gateway:null,dns:[]};
      next.runtime[c.targetId]={dhcpStatus:"released"};
    }else if(c.type==="dhcp.request"){
      const client=next.objectsById[c.targetId], ip=client?.config.ipv4;
      if(!ip || ip.mode!=="dhcp")return fail("not_dhcp_client","Client DHCP inexistant");
      const prior=ip.lease!==null && ip.lease.expires>next.simulationClock;
      const servers=Object.values(next.objectsById).filter(o=>dhcpPools(o.config).length && o.config.dhcpEnabled && physicalPath(c.targetId,o.id));
      const server=c.params.serverId?servers.find(o=>o.id===c.params.serverId):servers[0];
      if(server && c.params.poolId===undefined && dhcpPools(server.config).length>1)
        return fail("dhcp_pool_required","Choisir la plage explicitement avant simulation VLAN");
      if(server){
        const pool=selectedPool(server.config,c.params.poolId);
        if(!pool)return fail("invalid_dhcp_pool","Plage DHCP inconnue");
        // Ne pas confondre occupation par un bail DHCP et adresse statique inconnue du serveur.
        const excluded=new Set(pool.exclusions??[]);
        const reservations=pool.reservations??[];
        const ownReservation=reservations.find(r=>r.mac.toUpperCase()===client.config.macAddress?.toUpperCase());
        const otherReservations=new Set(reservations.filter(r=>r!==ownReservation).map(r=>r.address));
        const freeForClient=address=>ipv4ToInt(address)!==null &&
          ipv4ToInt(address)>=ipv4ToInt(pool.start) && ipv4ToInt(address)<=ipv4ToInt(pool.end) &&
          !excluded.has(address) && !otherReservations.has(address) &&
          !leasedToOther(next,c.targetId,server.id,server.config.dhcpPools?pool.id:undefined,address);
        let chosen=null;
        if(ownReservation){
          if(freeForClient(ownReservation.address))chosen=ownReservation.address;
        }else{
          if(prior && ip.lease.serverId===server.id && (ip.lease.poolId===undefined || ip.lease.poolId===pool.id) && freeForClient(ip.address))chosen=ip.address;
          if(!chosen){
            for(let n=ipv4ToInt(pool.start);n<=ipv4ToInt(pool.end);n++){
              const candidate=[24,16,8,0].map(k=>(n>>>k)&255).join(".");
              if(freeForClient(candidate)){chosen=candidate;break;}
            }
          }
        }
        if(chosen){
          ip.address=chosen;ip.prefix=pool.prefix;
          ip.lease={serverId:server.id,...(server.config.dhcpPools?{poolId:pool.id}:{}),start:next.simulationClock,expires:next.simulationClock+pool.leaseSeconds};
          client.config.networkOptions={gateway:pool.gateway,dns:[...pool.dns]};
          next.runtime[c.targetId]={dhcpStatus:"lease"};
        }else if(prior){
          next.runtime[c.targetId]={dhcpStatus:"lease-retained",error:"Plage DHCP épuisée"};
        }else{
          ip.address=apipaAddress(c.targetId,next);ip.prefix=16;ip.lease=null;
          client.config.networkOptions={gateway:null,dns:[]};
          next.runtime[c.targetId]={dhcpStatus:"apipa",error:"Plage DHCP épuisée"};
        }
      }else if(prior){
        next.runtime[c.targetId]={dhcpStatus:"lease-retained",error:"Serveur DHCP inaccessible"};
      }else{
        ip.address=apipaAddress(c.targetId,next);ip.prefix=16;ip.lease=null;
        client.config.networkOptions={gateway:null,dns:[]};
        next.runtime[c.targetId]={dhcpStatus:"apipa",error:"Serveur DHCP inaccessible"};
      }
    }else if(c.type==="dns.setNegativeTtl"){
      const server=next.objectsById[c.targetId],ttl=c.params.negativeTtl;
      if(!server?.config.dnsZone || !Number.isInteger(ttl) || ttl<1 || ttl>86400)
        return fail("invalid_dns_ttl","TTL négatif invalide");
      server.config.dnsZone.negativeTtl=ttl;
    }else if(c.type==="dns.setServerEnabled"){
      const server=next.objectsById[c.targetId];
      if(!server || server.config.dnsZone===undefined || typeof c.params.enabled!=="boolean")
        return fail("invalid_dns_server","Serveur DNS ou etat invalide");
      server.config.dnsEnabled=c.params.enabled;
    }else if(c.type==="dns.upsertRecord"){
      const server=next.objectsById[c.targetId],record=c.params.record;
      if(!server || server.config.dnsZone===undefined || !isObj(record))
        return fail("invalid_dns_record","Enregistrement DNS invalide");
      const records=server.config.dnsZone.records;
      const name=String(record.name??"").toLowerCase();
      const isMulti=["MX","TXT"].includes(record.type);
      const index=records.findIndex(r=>r.name.toLowerCase()===name&&r.type===record.type&&
        (!isMulti||(r.value===record.value&&(r.priority??null)===(record.priority??null))));
      if(index<0)records.push(clone(record));else records[index]=clone(record);
      if(!validDnsConfig(server.config))return fail("invalid_dns_record","Enregistrement DNS invalide");
    }else if(c.type==="dns.removeRecord"){
      const server=next.objectsById[c.targetId];
      if(!server || server.config.dnsZone===undefined || !validDnsName(c.params.name))
        return fail("invalid_dns_record","Enregistrement DNS invalide");
      const records=server.config.dnsZone.records;
      const index=records.findIndex(r=>r.name.toLowerCase()===c.params.name.toLowerCase()&&
        (c.params.recordType===undefined||r.type===c.params.recordType)&&
        (c.params.value===undefined||r.value===c.params.value));
      if(index<0)return fail("dns_record_not_found","Enregistrement DNS inconnu");
      records.splice(index,1);
    }else if(c.type==="network.arpClear"){
      if(!next.objectsById[c.targetId]?.config.ipv4)return fail("invalid_arp_client","Poste IPv4 inexistant");
      if(!isObj(next.domainState.arpCaches))next.domainState.arpCaches={};
      next.domainState.arpCaches[c.targetId]=[];
    }else if(c.type==="network.arpLearn"){
      const client=next.objectsById[c.targetId], peer=next.objectsById[c.params.peerId];
      if(!client?.config.ipv4 || !peer?.config.ipv4 || !peer.config.ipv4.address ||
         !/^([0-9a-f]{2}-){5}[0-9a-f]{2}$/i.test(peer.config.macAddress??""))
        return fail("invalid_arp_peer","Équipement ou adresse MAC incompatible");
      if(!networkPing(c.targetId,peer.id).success)
        return fail("arp_unreachable","Résolution ARP non confirmée sur ce réseau");
      if(!isObj(next.domainState.arpCaches))next.domainState.arpCaches={};
      const entries=next.domainState.arpCaches[c.targetId]??[];
      next.domainState.arpCaches[c.targetId]=[...entries.filter(e=>e.address!==peer.config.ipv4.address),
        {address:peer.config.ipv4.address,mac:peer.config.macAddress.toLowerCase(),type:"dynamique"}];
    }else if(c.type==="network.setNetworkOptions"){
      const o=next.objectsById[c.targetId], p=c.params;
      if(!o || !o.config.ipv4)return fail("unsupported_target","Équipement IPv4 inexistant");
      if(!validNetworkOptions(p))return fail("invalid_network_options","Passerelle ou DNS invalides");
      o.config.networkOptions={gateway:p.gateway,dns:[...p.dns]};
    }else if(c.type==="network.setLinkConnected"){
      const l=next.linksById[c.targetId];
      if(!l || typeof c.params.connected!=="boolean")
        return fail("invalid_link","Câble inconnu ou état impossible");
      l.connected=c.params.connected;
    }else{return fail("unsupported_command","Commande non reconnue");}
    next.revision++;
    state=next; seenIds.add(c.id);
    for(const listener of [...listeners]){try{listener(state.revision);}catch(_){/* Une vue défaillante n'interrompt pas le moteur. */}}
    return {status:"applied",revision:state.revision,changes:[c.targetId],effects:["network-recomputed"],
      ...(c.type==="dns.clientResolve"?{dnsResult:clone(state.domainState.dnsLastResults[c.targetId])}:{})};
  }
  function subscribe(listener){
    if(typeof listener!=="function")throw new TypeError("Abonné invalide");
    listeners.add(listener);return ()=>listeners.delete(listener);
  }
  function exportState(){return getSnapshot();}
  return {getSnapshot,dispatch,query,subscribe,exportState};
}
export function createEngine(scenario,options={}){return makeEngine(scenario);}
export function restoreEngine(scenario,savedState,options={}){return makeEngine(scenario,savedState);}

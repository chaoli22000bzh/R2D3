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
    Number.isInteger(p.leaseSeconds) && p.leaseSeconds>=60 && p.leaseSeconds<=2592000;
}
function validIpv4(v){
  return isObj(v) && (v.mode==="static"
    ? ipv4ToInt(v.address)!==null && Number.isInteger(v.prefix) && v.prefix>=0 && v.prefix<=32
    : v.mode==="dhcp" && (v.address===null || ipv4ToInt(v.address)!==null) &&
      (v.prefix===null || Number.isInteger(v.prefix) && v.prefix>=0 && v.prefix<=32) &&
      (v.lease===null || isObj(v.lease) && typeof v.lease.serverId==="string" &&
       Number.isInteger(v.lease.start) && Number.isInteger(v.lease.expires) && v.lease.expires>v.lease.start));
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
    if(o.config.dhcpPool!==undefined && (!validDhcpPool(o.config.dhcpPool) || typeof o.config.dhcpEnabled!=="boolean"))
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
  function query(q){
    if(!isObj(q) || q.type!=="network.ping")return {status:"unavailable",reason:"Requête non prise en charge"};
    if(s.capabilities.network!==true)return {status:"unavailable",reason:"Capacité réseau désactivée"};
    return networkPing(q.sourceId,q.targetId);
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
    if(c.type==="network.setIPv4"){
      const o=next.objectsById[c.targetId], p=c.params;
      if(!o || !o.config.ipv4 || !o.ports.some(port=>port.id===p.interfaceId))
        return fail("unsupported_target","Interface inexistante");
      if(p.mode!=="static" || ipv4ToInt(p.address)===null ||
         !Number.isInteger(p.prefix) || p.prefix<0 || p.prefix>32)
        return fail("invalid_ipv4","Adresse IPv4 ou préfixe impossible");
      o.config.ipv4={mode:"static",address:p.address,prefix:p.prefix,interfaceId:p.interfaceId};
    }else if(c.type==="dhcp.setServerEnabled"){
      const o=next.objectsById[c.targetId];
      if(!o?.config.dhcpPool || typeof c.params.enabled!=="boolean")
        return fail("invalid_dhcp_server","Serveur DHCP ou état invalide");
      o.config.dhcpEnabled=c.params.enabled;
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
      const servers=Object.values(next.objectsById).filter(o=>o.config.dhcpPool && o.config.dhcpEnabled && physicalPath(c.targetId,o.id));
      const server=servers[0];
      if(server){
        const pool=server.config.dhcpPool;
        const reserved=new Set(Object.values(next.objectsById).filter(o=>o.id!==c.targetId && o.config.ipv4?.address).map(o=>o.config.ipv4.address));
        let chosen=prior && ip.lease.serverId===server.id && sameSubnet(ip.address,pool.start,pool.prefix) ? ip.address:null;
        if(!chosen){
          for(let n=ipv4ToInt(pool.start);n<=ipv4ToInt(pool.end);n++){
            const candidate=[24,16,8,0].map(k=>(n>>>k)&255).join(".");
            if(!reserved.has(candidate)){chosen=candidate;break;}
          }
        }
        if(chosen){
          ip.address=chosen;ip.prefix=pool.prefix;
          ip.lease={serverId:server.id,start:next.simulationClock,expires:next.simulationClock+pool.leaseSeconds};
          client.config.networkOptions={gateway:pool.gateway,dns:[...pool.dns]};
          next.runtime[c.targetId]={dhcpStatus:"lease"};
        }else if(prior){
          next.runtime[c.targetId]={dhcpStatus:"lease-retained",error:"Plage DHCP épuisée"};
        }else{
          ip.address="169.254.10.20";ip.prefix=16;ip.lease=null;
          client.config.networkOptions={gateway:null,dns:[]};
          next.runtime[c.targetId]={dhcpStatus:"apipa",error:"Plage DHCP épuisée"};
        }
      }else if(prior){
        next.runtime[c.targetId]={dhcpStatus:"lease-retained",error:"Serveur DHCP inaccessible"};
      }else{
        ip.address="169.254.10.20";ip.prefix=16;ip.lease=null;
        client.config.networkOptions={gateway:null,dns:[]};
        next.runtime[c.targetId]={dhcpStatus:"apipa",error:"Serveur DHCP inaccessible"};
      }
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
    return {status:"applied",revision:state.revision,changes:[c.targetId],effects:["network-recomputed"]};
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

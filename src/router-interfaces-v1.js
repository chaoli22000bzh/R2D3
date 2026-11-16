/*
 * Configuration des interfaces du routeur générique, lot 1.
 * Ne simule ni transit, ni routage IPv4, ni PAT.
 * Le registre R2 conserve seul les configurations et identifiants de ports.
 */
const bad=(code,message)=>({success:false,code,message});
export function createRouter(registry,{name="RTR-01",ports=4}={}){
 if(!registry?.createProfile)return bad("invalid_registry","Registre R2 indisponible.");
 if(!Number.isInteger(ports)||ports<2||ports>128)return bad("invalid_port_count","Choisir de 2 à 128 ports Ethernet.");
 const p=registry.createProfile("Routeur générique • "+ports+" ports");
 if(!p.success)return p;
 const g=registry.addPortGroup(p.profile.id,{type:"ethernet-rj45",prefix:"GE",start:1,count:ports});
 if(!g.success)return g;
 const cap=registry.setProfileNetworkCapability(p.profile.id,"ipv4-router",true);
 if(!cap.success)return cap;
 return registry.createAsset(p.profile.id,{name});
}
export function getRouterConfig(registry,id){
 const a=registry?.getAsset?.(id);
 return a?.networkCapabilities?.includes("ipv4-router")?a.routerConfig:null;
}
export function configureRouterPort(registry,id,portId,{role,mode,address="",prefix=null,gateway=""}){
 const config=getRouterConfig(registry,id);
 if(!config?.interfaces?.[portId])return bad("port_missing","Interface du routeur introuvable.");
 if(!["wan","lan","dmz"].includes(role)||!["dhcp","static"].includes(mode))return bad("invalid_role","Rôle ou mode IPv4 invalide.");
 const old=config.interfaces[portId];
 const respondToPing=role===old.role?old.respondToPing:role!=="wan";
 config.interfaces[portId]={role,mode,address:mode==="dhcp"?"":String(address).trim(),prefix:mode==="dhcp"?null:Number(prefix),gateway:mode==="dhcp"?"":String(gateway).trim(),respondToPing};
 return registry.setAssetRouterConfig(id,config);
}
export function configureRouterWanPing(registry,id,portId,enabled){
 const config=getRouterConfig(registry,id),i=config?.interfaces?.[portId];
 if(!i||i.role!=="wan")return bad("wan_required","Sélectionner une interface WAN.");
 if(typeof enabled!=="boolean")return bad("invalid_value","La réponse au ping doit être activée ou désactivée.");
 i.respondToPing=enabled;
 return registry.setAssetRouterConfig(id,config);
}

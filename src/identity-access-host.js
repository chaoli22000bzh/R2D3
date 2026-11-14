/**
 * Pont métier R2D3 -> contrat hôte Identity Access Core.
 * Aucun annuaire, aucune ACL, aucun état de services concurrent.
 * Le module d'identités est fourni par l'hôte comme dépendance versionnée.
 */
export function createR2D3IdentityHost({assetRegistry,networkEngine,assetToNetworkId,assetKinds}){
 if(!assetRegistry || typeof assetRegistry.getAsset!=="function")throw Error("Registre R2D3 requis");
 if(!networkEngine || typeof networkEngine.query!=="function" || typeof networkEngine.getSnapshot!=="function")
   throw Error("Moteur réseau R2D3 requis");
 if(!assetToNetworkId || typeof assetToNetworkId!=="object" || Array.isArray(assetToNetworkId) ||
    !assetKinds || typeof assetKinds!=="object" || Array.isArray(assetKinds))
   throw Error("Correspondances explicites requises");
 const pairs=Object.entries(assetToNetworkId);
 if(new Set(pairs.map(([,id])=>id)).size!==pairs.length)
   throw Error("Correspondance réseau non injective");
 const machine=id=>{
   const asset=assetRegistry.getAsset(id);
   if(!asset)return {status:"not_found"};
   const kind=assetKinds[id];
   if(!["computer","server"].includes(kind))return {status:"unknown"};
   const netId=assetToNetworkId[id];
   if(typeof netId!=="string"||!netId)return {status:"unknown"};
   const networkObject=networkEngine.getSnapshot().objectsById?.[netId];
   if(!networkObject || networkObject.assetId!==id)return {status:"unknown"};
   return {status:"ok",machine:{id,kind}};
 };
 const net=id=>assetToNetworkId[id];
 return {
   getMachine:machine,
   getServiceStatus(assetId,service){
     if(machine(assetId).status!=="ok"||!["ad-ds","smb"].includes(service))return {status:"unknown"};
     const observation=networkEngine.query({type:"network.applicationService",targetId:net(assetId),service});
     return {status:["available","unavailable"].includes(observation?.status)?observation.status:"unknown"};
   },
   getReachability(fromId,toId,purpose){
     if(machine(fromId).status!=="ok"||machine(toId).status!=="ok")return {status:"unknown"};
     const service=purpose==="domain"?"ad-ds":purpose==="smb"?"smb":null;
     if(!service)return {status:"unknown"};
     const observation=networkEngine.query({type:"network.applicationReachability",
       sourceId:net(fromId),targetId:net(toId),service});
     return {status:["reachable","unreachable"].includes(observation?.status)?observation.status:"unknown"};
   },
   getSimulationTime(){
     const value=networkEngine.getSnapshot().simulationClock;
     return Number.isFinite(value)?{status:"ok",value}:{status:"unknown"};
   }
 };
}

/**
 * Accouple le moteur autonome, fourni sans copie de sa logique, aux modules R2D3.
 * Le scénario doit référencer les vrais asset.id, l'appelant en assure la cohérence.
 */
export function createR2D3IdentityIntegration({identityModule,scenario,savedState,...hostOptions}){
 if(!identityModule || typeof identityModule.createIdentityAccessEngine!=="function" ||
    typeof identityModule.restoreIdentityAccessEngine!=="function")
   throw Error("Dépendance Identity Access Core explicite requise");
 const host=createR2D3IdentityHost(hostOptions);
 const engine=savedState===undefined
   ? identityModule.createIdentityAccessEngine({scenario,host})
   : identityModule.restoreIdentityAccessEngine({scenario,savedState,host});
 return {host,engine};
}

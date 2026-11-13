import {calculateRaid,assessRaidFailures,importRaidConfiguration,exportRaidConfiguration} from "./raid-core.js";
/**
 * Adaptateur optionnel, sans dépendance au moteur R2D3.
 * Le scénario ou C² conserve l'ID de l'actif et le JSON versionné.
 * La restauration reproduit uniquement une configuration RAID technique.
 */
export function inspectAssetRaid(assetId,configuration,failedDiskIds=[]){
  if(typeof assetId!=="string"||!assetId.trim())
    return {ok:false,errors:[{code:"INVALID_ASSET_ID",message:"Identifiant d'équipement manquant.",field:"assetId"}]};
  const calculated=calculateRaid(configuration);if(!calculated.ok)return calculated;
  const failures=assessRaidFailures(configuration,failedDiskIds);if(!failures.ok)return failures;
  return {ok:true,value:{assetId,configuration:importRaidConfiguration(configuration).value,
    calculated:calculated.value,failures:failures.value}};
}
export {calculateRaid,assessRaidFailures,importRaidConfiguration,exportRaidConfiguration};

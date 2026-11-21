/* Authentification WPA2-Enterprise : modèle métier pédagogique.
 * Aucune simulation cryptographique EAP/RADIUS ni transport UDP.
 * Le service RADIUS est explicitement fourni par le scénario/l'infrastructure.
 */
const failure=(code,message)=>({success:false,code,message});
export function authenticateWifiRadius({endpoint,service,username,password}={}){
 if(!endpoint||!service||service.enabled===false)
  return failure("radius_unavailable","Serveur RADIUS indisponible.");
 const port=Number(endpoint.port??1812);
 if(!endpoint.address||!Number.isInteger(port)||port<1||port>65535||
    service.address!==endpoint.address||Number(service.port)!==port)
  return failure("radius_unavailable","Adresse ou port du serveur RADIUS incorrect.");
 if(!endpoint.secret||endpoint.secret!==service.secret)
  return failure("radius_secret_mismatch","Secret partagé RADIUS incorrect.");
 const account=Array.isArray(service.users)?service.users.find(u=>u.username===username):null;
 if(!account||account.enabled===false||!password||account.password!==password)
  return failure("radius_access_rejected","Identifiant ou mot de passe utilisateur refusé par RADIUS.");
 return {success:true,code:"radius_access_accepted",message:"Utilisateur accepté par le service RADIUS.",username};
}

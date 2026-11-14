# R2D3 : raccordement natif Identity Access Core

**Lot R2/R3, 14 novembre 2026.** Ce document décrit l'implémentation du pont technique, et non un contrat fonctionnel concurrent. La référence métier reste `C2/docs/CAHIER_DES_CHARGES_R2D3.md` (§36.4) et la référence réseau `C2/docs/CONTRAT_COMPORTEMENT_RESEAU_R2D3_V03.md`.

## Sources et frontières

- **R2D3** : `src/asset-profiles.js` conserve les machines et leurs `asset.id` ; `src/r2d3-core.js` conserve la topologie, la configuration IP, l'état applicatif pédagogique et la simulation de joignabilité.
- **Identity Access Core**, dépendance **externe** et **versionnée**, est la seule source des comptes locaux/de domaine, AGDLP, OU, ACL NTFS, droits SMB, dossiers et sessions fictives. Aucun de ces éléments n'est recréé dans R2D3.
- **Pont permanent réutilisable** : `src/identity-access-host.js`, exports `createR2D3IdentityHost` et `createR2D3IdentityIntegration`.
- **Dépendance validée par CI** : code du dépôt `chaoli22000bzh/C2-Lab`, dossier `identity-access-v1`, commit fixé `4405bb6806ef0e93997c7029dc21824b07c73cd6`. Ce pin permet des tests reproductibles ; la publication d'un dépôt/package autonome reste un chantier distinct.

## Modèle des services R2D3

Les objets réseau peuvent définir `config.applicationServices` :

```json
{"applicationServices":{"ad-ds":true,"smb":false}}
```

`true` : service simulé actif ; `false` : service simulé arrêté ; propriété absente : **état inconnu**. Aucune machine ne fournit implicitement un service et aucune disponibilité n'est déduite d'un ping ICMP seul.

- Lire le service : `networkEngine.query({type:"network.applicationService",targetId:"dc-01",service:"ad-ds"})` → `{status:"available"|"unavailable"|"unknown"}`.
- Lire la joignabilité du service : `networkEngine.query({type:"network.applicationReachability",sourceId:"pc-01",targetId:"dc-01",service:"ad-ds"})` → `{status:"reachable"|"unreachable"|"unknown"}`. **Reachable** exige un service explicitement actif **et** une connectivité IPv4 simulée réussie. Une panne physique ou IP certaine entraîne **unreachable** ; une observation non supportée ou indéterminée reste **unknown**.
- Changer l'état : `networkEngine.dispatch({commandVersion:1,id:"action-1",type:"network.setApplicationService",targetId:"dc-01",params:{service:"ad-ds",enabled:false},expectedRevision:0})` (révision à remplacer par celle du moteur). Refus atomique si service, machine ou booléen invalide. Les deux services pris en charge sont `ad-ds` et `smb`.
- Export/restauration : la configuration est incluse dans les objets de l'état réseau et validée lors de `restoreEngine`. Les anciens scénarios sans ces propriétés continuent de fonctionner : le statut est inconnu.

Ce modèle est une **simulation pédagogique**, pas une sonde TCP ni une preuve de fonctionnement d'un véritable serveur Windows. Il ne remplace ni les règles de DMZ/VLAN futures ni la simulation plus générale des services réseau. Il respecte le périmètre IPv4 actuellement simulé.

## Exemple d'intégration

```js
import {createR2D3IdentityIntegration} from "./src/identity-access-host.js";
// La dépendance est importée par le consommateur (pas recopiée).
import * as identityModule from "../identity-access-core/src/identity-access-core.js";

const {engine:identity,host}=createR2D3IdentityIntegration({
  identityModule,
  scenario:identityScenario,
  assetRegistry,
  networkEngine,
  assetToNetworkId:{"asset-pc01":"pc-01","asset-dc01":"dc-01"},
  assetKinds:{"asset-pc01":"computer","asset-dc01":"server"}
});
```

Les IDs de cet exemple sont indicatifs. Chaque `asset.id` et chaque `object.assetId` du scénario doivent correspondre **exactement** ; le pont refuse les correspondances erronées et non injectives. Les commandes d'identités et les permissions ne transitent pas par le moteur réseau : elles restent exécutées dans Identity Access Core.

Pour reprendre une séance, **restaurer le registre d'actifs et le moteur réseau en premier**, puis appeler `createR2D3IdentityIntegration` avec `savedState` pour restaurer le moteur d'identités contre ce même hôte. Les états doivent appartenir au **même TP et à la même copie d'élève** ; l'isolation, la persistance serveur, la sécurité des permissions C² et les migrations restent à réaliser dans le chantier d'intégration C².

## Recette technique

- `tests/identity-services.test.mjs` : 7 tests unitaires de services (inconnu, démarrage/arrêt, rupture/reprise, refus atomiques, restauration, mapping).
- `tests-integration/identity-access.test.mjs` : 4 tests de raccordement **réel** avec le module Identity Access Core externe fixé au commit ci-dessus. Aucun double du moteur d'identités.
- Workflows : `.github/workflows/test.yml` et `.github/workflows/identity-access-integration.yml`.

**Limite :** ce lot ne constitue pas une recette navigateur de l'interface métier R2D3, ni une intégration finale à C²/MariaDB. La disponibilité native signifie ici un **état de service déclaré et modifiable dans le moteur R2D3**, combiné à sa connectivité simulée ; elle ne prétend pas détecter un service réel.

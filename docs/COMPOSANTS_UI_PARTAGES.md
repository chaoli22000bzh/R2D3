# Composants UI partagés - version 1

Date : 7 novembre 2026
Source de référence : `chaoli22000bzh/C2-Lab/main/shared-ui/v1/`.

## Objectif

Partager directement entre les laboratoires R2D3, C² et les cours du portail pédagogique les **mêmes fichiers**, sans réimplémenter leur fonctionnement.

- Ping : `ping-animation.js` : animation des quatre réponses, bilan à la fin, effacement au nouveau ping, sortie Windows sans commentaire inventé.
- Boutons : `buttons.css` et `button-feedback.js` : pression discrète (assombrissement, enfoncement), retour normal au relâchement, tactile, souris, clavier, sans texte de statut inventé.
- Les composants d'affichage ne modifient pas le moteur et ne répondent pas à la place des élèves.

## URL centralisée et versionnement

- `https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/ping-animation.js`
- `https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/buttons.css`
- `https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/button-feedback.js`

Le dossier `v1` doit rester compatible après publication. Une évolution incompatible crée `v2` ; chaque consommateur choisit sa version. Sans cette discipline, un changement de la ressource commune peut casser simultanément plusieurs projets.

## Intégration dans une page HTML

```html
<link rel="stylesheet" href="https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/buttons.css">
<body class="c2-buttons">
  <button type="button">Ping imprimante</button>
  <script type="module" src="https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/button-feedback.js"></script>
</body>
```

L'effet tactile/souris est automatique pour les `button` et les éléments `role="button"` qui ne sont pas désactivés. Il ne change pas la logique de clic existante et n'ajoute aucun message.

## Ping partagé

```javascript
import {createPingAnimator} from "https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/ping-animation.js";

const pingView=createPingAnimator(document.getElementById("ping-console"));
pingView.run({
  sourceName: "REN-PC-01",
  sourceAddress: "192.168.10.20",
  targetAddress: "192.168.10.50",
  outcome: engine.query({type: "network.ping", sourceId: "pc-01", targetId: "printer"})
});
pingView.cancel(); // efface le résultat périmé
```

Les métadonnées `sourceName`/`sourceAddress` sont acceptées par l'API, mais **ne doivent pas apparaître comme des lignes ajoutées dans la sortie Windows**. La source est déterminée par le poste sélectionné dans l'interface. Le composant est une vue : la réussite ou l'échec provient exclusivement du diagnostic du moteur.

## Environnement et restrictions

Les six interfaces de `C2-Lab/r2d3-v1/` sont raccordées à ces ressources avec des chemins relatifs. **C² et les portails ne sont pas encore raccordés** : l'architecture les rend intégrables, pas déjà migrés.

L'utilisation de modules JavaScript hébergés sur un autre domaine implique que le navigateur autorise le chargement CORS. Les environnements sans Internet (C² au lycée, certains TP hors ligne) ne doivent pas devenir dépendants d'une requête distante non garantie : tester le scénario hors ligne, puis prévoir la mise en cache préalable ou l'intégration versionnée dans le déploiement si nécessaire. L'objectif de partage du code est conservé, mais une URL distante ne garantit pas à elle seule le hors ligne.

## Recette d'acceptation

- Sur smartphone : bouton qui s'enfonce et s'assombrit à l'appui, reprend son état au relâchement.
- Sur PC : mêmes effets souris et clavier ; les commandes restent fonctionnelles.
- Ping : lignes successives, quatre réponses, statistiques finales, aucune phrase fictive.
- Nouveau ping : annulation du précédent, aucune sortie mélangée.
- Le rendu des six laboratoires et les tests réseau existants restent fonctionnels.

## Champs `ipconfig` alignés

Un utilitaire central `shared-ui/v1/windows-fields.js` expose `createWindowsFieldFormatter(labels,{indent})`. Il calcule la largeur du plus long libellé et n'ajoute des points que sur les libellés plus courts, jusqu'à l'alignement du caractère `:`.

Exemple :

```javascript
import {createWindowsFieldFormatter} from "../shared-ui/v1/windows-fields.js";
const field=createWindowsFieldFormatter(["Adresse IPv4","Masque de sous-réseau","Passerelle par défaut"]);
const lignes=[field("Adresse IPv4","192.168.10.20"),field("Masque de sous-réseau","255.255.255.0")];
```

Désormais utilisé par les laboratoires IPv4 expérimental, DHCP à un poste, DHCP à deux postes, administration DHCP, conflit IPv4 (laboratoire 4) et ARP (laboratoire 5). Les prochains laboratoires ne doivent pas recréer manuellement un formatage des points. Un changement de règle se fait uniquement dans ce composant versionné.

Dans le laboratoire 5, les équipements portent les noms PC1 et PC2 afin d'éviter toute confusion du préfixe `REN` avec la commande Windows `ren`.

## Composant complet `ipconfig` (sans `/all`)

Le module unique `shared-ui/v1/ipconfig.js` exporte `formatIpconfig({ipv4, connected, gateway, interfaceName})`.

- `ipv4` : objet avec `address` et `prefix` issus du moteur réseau.
- `connected` : état de la liaison (défaut : `true`).
- `gateway` : adresse de la passerelle, facultative.
- `interfaceName` : libellé de l'interface (défaut : `Ethernet`).

Il renvoie une chaîne complète au format invite Windows : commande, en-tête, carte, adresse IPv4, masque calculé depuis le préfixe, passerelle et retour à l'invite. Si le câble est débranché, il affiche l'état du média. Le formatage des points passe lui-même par `windows-fields.js`. Le composant **ne fournit aucun diagnostic**, ne manipule pas le moteur et ne modifie pas le DOM.

Exemple d'appel identique dans R2D3, C² ou un cours :

```javascript
import {formatIpconfig} from "https://chaoli22000bzh.github.io/C2-Lab/shared-ui/v1/ipconfig.js";
sortie.textContent=formatIpconfig({
  ipv4: {address:"192.168.10.20",prefix:24},
  gateway:"192.168.10.1",
  connected:true
});
```

Dans C2-Lab, les laboratoires IPv4 expérimental, DHCP un poste, DHCP deux postes, administration DHCP, conflit d'IPv4 et ARP utilisent ce même module pour la **commande simple**. Leur logique spécifique `ipconfig /all` n'a pas été migrée : elle fera l'objet de l'étape suivante, distincte.

Le composant est utilisable directement par URL dans un navigateur connecté, ou doit être intégré au déploiement hors ligne pour les TP en réseau isolé. Aucun changement n'a encore été apporté à C² ni aux portails pédagogiques.


## Composant complet `ipconfig /all`

Le module `shared-ui/v1/ipconfig-all.js` exporte `formatIpconfigAll(config)`. Il est indépendant du DOM, du moteur R2D3, des laboratoires, des pages GitHub et de tout accès réseau. Il reçoit les caractéristiques réelles du poste sélectionné.

- Obligatoire : `ipv4: {address, prefix, lease?}`.
- Paramètres facultatifs : `hostname`, `dhcp`, `autoconfiguration`, `connected`, `description`, `mac`, `gateway`, `dns`, `dhcpServer`, `leaseStart`, `leaseEnd`, `netbios`, `interfaceName`.
- Les champs non fournis sont omis plutôt que remplacés par de fausses valeurs. Les dates de bail restent sous la responsabilité de l'appelant et doivent provenir du scénario.
- Une IPv4 APIPA attribuée sans bail DHCP est rendue sous « Adresse d'autoconfiguration IPv4 ». Les informations de bail ne sont affichées que si un bail existe.
- La sortie comporte l'invite Windows, l'en-tête, le nom du poste s'il est connu, la carte Ethernet et les valeurs utiles. Les lignes sont alignées via `windows-fields.js`. Pas de message d'aide ou d'indice de diagnostic ajouté.
- Le poste déconnecté reçoit « Statut du média : Média déconnecté ».

Exemple d'intégration :

```javascript
import {formatIpconfigAll} from "../shared-ui/v1/ipconfig-all.js";
consoleElement.textContent = formatIpconfigAll({
  hostname: poste.name,
  ipv4: poste.config.ipv4,
  dhcp: true,
  mac: adresseMacReelle,
  gateway: poste.config.networkOptions?.gateway,
  dns: poste.config.networkOptions?.dns ?? []
});
```

Les laboratoires `experiment`, `dhcp`, `dhcp-deux-pc`, `dhcp-admin` et `conflit-ipv4` consomment ce module commun pour `ipconfig /all`. Le laboratoire ARP utilise uniquement `ipconfig` simple, comme avant. Les deux commandes ont des modules séparés, partageant l'utilitaire de formatage.

Pour le réseau isolé, les trois fichiers `ipconfig.js`, `ipconfig-all.js`, `windows-fields.js` doivent être déployés ensemble. C² et les portails pédagogiques n'ont pas été modifiés.

Précision de compatibilité : le paramètre `connected` sert à afficher explicitement un média déconnecté. Dans les scénarios DHCP qui attribuent une APIPA lors d'une indisponibilité réseau, l'état IPv4 calculé par le moteur reste prioritaire pour le rendu pédagogique de la commande et l'appelant n'impose pas `connected:false`.


## Composant ARP partagé

`shared-ui/v1/arp.js` fournit deux fonctions sans DOM et sans dépendance au moteur :

- `formatArpTable({interfaceAddress,entries})` produit la sortie Windows de `arp -a` avec les colonnes « Adresse Internet », « Adresse physique », « Type » et les entrées fournies pour **le PC courant**. L'identifiant d'interface hexadécimal non pédagogique (`0x2`) est omis.
- `formatArpClear()` produit la sortie silencieuse de `arp -d *`, sans confirmer artificiellement la purge.

Le moteur ou l'application appelante reste responsable de l'apprentissage ARP, de la consultation du cache par poste et de sa suppression réelle. Le composant n'enregistre aucun état, n'invente aucune MAC et ne produit aucun indice de diagnostic.

```javascript
import {formatArpTable,formatArpClear} from "../shared-ui/v1/arp.js";
consoleElement.textContent=formatArpTable({
  interfaceAddress:poste.config.ipv4.address,
  entries:cacheArpDuPoste
});
// Après confirmation de la purge par le moteur :
consoleElement.textContent=formatArpClear();
```

Le laboratoire ARP importe le module partagé et ne contient plus de construction locale des lignes de la table. C² et les portails pourront l'intégrer en copiant le module ou en le servant dans leur déploiement autonome ; ces projets n'ont pas été modifiés.

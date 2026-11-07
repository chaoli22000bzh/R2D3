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

Utilisé à ce stade par les laboratoires 4 et 5. Les prochains laboratoires ne doivent pas recréer manuellement un formatage des points.

Dans le laboratoire 5, les équipements portent les noms PC1 et PC2 afin d'éviter toute confusion du préfixe `REN` avec la commande Windows `ren`.

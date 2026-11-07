# R2D3 : convention commune de sortie Ping

Statut : règle transversale validée par le professeur le 7 novembre 2026.

## Portée

Tout TP ou laboratoire R2D3 qui propose un ping utilise le composant d'animation partagé `r2d3-v1/ping-animation.js` hébergé dans C2-Lab, ou son équivalent déployé avec le moteur R2D3. Cette obligation s'applique aussi aux nouveaux exercices destinés à C². Un TP ne réimplémente pas librement son propre affichage figé de ping.

## Comportement attendu

1. Au clic, effacer immédiatement toute sortie du ping précédent.
2. Afficher clairement le poste source avec son nom, si possible son IPv4, puis la commande `ping` et l'adresse cible.
3. Afficher les quatre lignes de réponse ou d'échec successivement, avec une temporisation courte (réglage de référence : 230 ms par réponse, soit environ une seconde par ping).
4. Ne présenter le bilan (`Statistiques Ping`, reçus/perdus) qu'après la quatrième réponse.
5. En cas de nouvelle demande, abandonner l'animation précédente et redémarrer au début, sans mélanger les sorties.
6. Lors d'un changement de poste ou de cible, d'une réinitialisation ou d'un changement de configuration rendant le résultat obsolète, annuler l'animation précédente et retirer son ancien résultat.
7. Distinguer la simulation technique du comportement exact de Windows : un conflit IPv4 peut donner des réponses réelles variables, donc ne pas afficher une certitude trompeuse.
8. Le rendu n'altère ni le moteur de diagnostic ni le scénario : il consomme le résultat instantané de `network.ping`.

## API

```javascript
import {createPingAnimator} from "./ping-animation.js";
const pingView=createPingAnimator(document.getElementById("ping-console"));
pingView.run({
  sourceName:"REN-PC-02",
  sourceAddress:"192.168.10.101",
  targetAddress:"192.168.10.50",
  outcome:engine.query({type:"network.ping",sourceId:"pc-02",targetId:"printer"})
});
pingView.cancel("Aucun ping effectué depuis ce poste.");
```

Le module utilise `setTimeout` et un numéro de génération pour ignorer les sorties périmées, sans dépendance supplémentaire. Les composants utilisent `textContent`, sans injection HTML.

## Recette obligatoire

Tester au minimum : animation progressive des quatre lignes, bilan absent avant la quatrième, nom du poste source, changement de source, relance rapide d'un ping, ping échoué, réinitialisation avant la fin et résultat non périmé après changement de configuration.

## Périmètre effectivement migré en novembre 2026

- `r2d3-v1/app.js` : démonstrateur IPv4 initial.
- `r2d3-v1/experiment.js` : atelier IPv4 expérimental.
- `r2d3-v1/dhcp.js` : laboratoire DHCP individuel.
- `r2d3-v1/dhcp-deux-pc.js` : deux PC DHCP.
- `r2d3-v1/dhcp-admin.js` : administration DHCP.
- `r2d3-v1/conflit-ipv4.js` : conflit IPv4.

Tous ces fichiers sont dans `chaoli22000bzh/C2-Lab/main`. Les fonctionnalités de calcul réseau restent dans `chaoli22000bzh/R2D3`.

# R2D3 - Bilan de livraison V1

**Date de consolidation :** 6 novembre 2026  
**État :** V1 livrée, critères de réussite vérifiés dans le périmètre du démonstrateur ; limites de couverture explicites.  
**Décision :** arrêt du développement au prototype autonome. Aucune intégration C² ni V2 engagée.

## 1. Livraison

- Moteur technique autonome : `src/r2d3-core.js`.
- Scénario JSON versionné : `scenarios/atelier-ipv4-v1.json`.
- Démonstrateur : https://chaoli22000bzh.github.io/C2-Lab/r2d3-v1/
- Tests métier : `tests/core.test.mjs`.
- Tests Chromium : `tests/browser-smoke.mjs`.
- Exécutions automatiques : `.github/workflows/test.yml` et `.github/workflows/browser.yml`.
- Rapports détaillés : `docs/RECETTE_V1.md` et `docs/SUIVI_DEVELOPPEMENT.md`.

## 2. Confrontation aux dix critères de réussite V1

| Critère demandé | État et justification |
|---|---|
| 1. Moteur dans son dépôt indépendant | Conforme : code `src/r2d3-core.js` dans R2D3 |
| 2. JSON initialisant trois équipements | Conforme : PC, switch, imprimante et deux câbles |
| 3. Deux anomalies coexistantes | Conforme : mauvaise adresse IPv4 + câble débranché |
| 4. Correction avec conséquences cohérentes | Conforme : réparation IP seule insuffisante tant que le câble reste débranché |
| 5. Vues synchronisées | Conforme : deux vues utilisant une instance commune et notifications après mutation |
| 6. Export/restauration sans serveur | Conforme : essais Node.js de sérialisation, restitution et isolation |
| 7. Rechargement = scénario initial | Conforme : vérifié dans Chromium |
| 8. Page accessible et testable | Conforme pour le retour utilisateur ; fichiers C2-Lab testés séparément dans Chromium local |
| 9. Tests principaux exécutés et consignés | Conforme : exécutions documentées et reproductibles |
| 10. Aucun fichier C²/D3 modifié | Conforme au périmètre des modifications effectuées durant ce chantier |

## 3. Résultats effectivement exécutés

- **Node.js : 14/14 réussis**, Ubuntu GitHub Actions et Node.js 22.23.4. https://github.com/chaoli22000bzh/R2D3/actions/runs/42177764780
- **Chromium : 8/8 réussis**, Ubuntu 24.04, Playwright avec copie de C2-Lab servie localement. https://github.com/chaoli22000bzh/R2D3/actions/runs/42178196199
- **Retour humain :** le professeur a indiqué le 6 novembre 2026 que le démonstrateur public fonctionnait dans son navigateur.

Les scripts Chromium contrôlent explicitement l'égalité du code moteur et du scénario dans les deux dépôts, ainsi que l'absence d'écriture dans les stockages du navigateur et de requêtes externes durant le scénario essayé.

## 4. Limitations connues et tests hors périmètre

- Un seul LAN Ethernet simplifié, IPv4 statiques, sans routeur ; le ping est calculé, pas émis sur un vrai réseau.
- Aucun DHCP, DNS, VLAN, VPN, authentification, tickets D3, notation, stockage MariaDB, serveur PHP ou intégration dans C².
- Pas de redémarrage, de remise à zéro d'usine, de coupure électrique collective ni de scénarios complexes de plusieurs équipements.
- Les cas CORE-07 à CORE-09, CORE-11 à CORE-18 correspondant à des fonctions non implémentées ou à des responsabilités C² ne sont **pas** déclarés validés.
- Pas de campagne multi-navigateurs, ni de mesure de performances ou de disponibilité continue de GitHub Pages.
- Le test Chromium exécute les fichiers publics récupérés de C2-Lab sur un serveur statique local. Il ne remplace pas une recette réseau de l'hébergement GitHub Pages lui-même.
- Le moteur et sa copie dans C2-Lab sont actuellement identiques ; les évolutions futures devront maintenir cette synchronisation.

## 5. Décisions après livraison

1. **Geler fonctionnellement la V1** : n'y apporter que des corrections de défauts identifiés, en conservant ses tests.
2. Continuer de documenter toute modification significative dans `docs/SUIVI_DEVELOPPEMENT.md`.
3. Définir le périmètre de la V2 uniquement après décision explicite du professeur.
4. Ne pas amorcer l'intégration dans C² sans une nouvelle autorisation et un chantier dédié.

**Conclusion :** les dix critères du prototype V1 sont satisfaits au niveau de preuve défini ci-dessus. La recette des fonctionnalités non comprises dans la V1 et l'intégration C² restent distinctes.

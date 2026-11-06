# R2D3 V1 - résultat de recette

Date : 2026-11-05

## Vérifications exécutées

Neuf essais du cœur JavaScript ont été exécutés directement sur le code lu dans le dépôt R2D3, avec le scénario JSON versionné :

1. Ping initial PC vers imprimante : réussi.
2. Deux défauts cumulés (IP hors sous-réseau et câble imprimante débranché), puis réparations indépendantes : réussi.
3. Refus atomique d'une interface ou d'un câble inexistants : réussi.
4. Notification d'une modification et désabonnement : réussi.
5. Exportation et restauration fidèle d'un état en panne : réussi.
6. Isolation de 30 moteurs initialisés avec le même scénario : réussi.
7. Refus d'une commande avec révision périmée : réussi.
8. Protection de l'état interne contre la modification d'un instantané renvoyé : réussi.
9. Refus de restaurer un format d'état de version inconnue : réussi.

**Résultat : 9/9 contrôles réussis.**

## Autres vérifications exécutées

- Identité du fichier moteur entre R2D3 et C2-Lab, vérification exacte du contenu : conforme.
- Identité du scénario JSON entre R2D3 et C2-Lab : conforme.
- Vérification syntaxique du module applicatif de démonstration : conforme.

## Vérifications restant à faire

- Exécution de `npm test` dans un environnement Node.js à partir du dépôt GitHub (les tests automatiques sont enregistrés mais leur lancement via CI n'a pas été effectué).
- Ouverture effective de la page GitHub Pages et manipulation dans un navigateur graphique (non confirmées lors de cette recette).
- Vérification manuelle après rechargement et en mode hors connexion une fois tous les fichiers mis en cache par l'hôte, sans CDN.
- Accessibilité et ergonomie par un utilisateur en situation réelle.

## Limites assumées

- Un domaine Ethernet, IPv4 statique, aucun routage, pas de simulation du protocole ARP ou des délais réseau.
- Commandes prises en charge : `network.setIPv4` et `network.setLinkConnected`.
- Requête : `network.ping`.
- Les tests de reprise C², de persistance serveur et des modules avancés ne relèvent pas de la V1.
- Les faits de correction pédagogique restent hors périmètre du démonstrateur.

Aucun fichier du dépôt C2 n'a été modifié par ce chantier.


## Complément de recette du 6 novembre 2026

L'utilisateur confirme que la démonstration GitHub Pages s'ouvre et fonctionne dans son navigateur. Les manipulations détaillées restent distinctes de cette confirmation générale.

Cinq contrôles supplémentaires du moteur ont été exécutés dans un banc JavaScript sur le code récupéré dans R2D3, et ont réussi : commande dupliquée dans une instance, restauration sans mutation supplémentaire, IPv4 hors plage refusée, scénario avec port inexistant rejeté, requêtes ping sans mutation. Les cinq cas ont été ajoutés à `tests/core.test.mjs`.

**Bilan des essais manuels JavaScript sur le moteur : 14 réussites sur 14 contrôles exécutés.**

L'exécution de la suite `npm test` sous Node.js et la vérification manuelle détaillée des différents navigateurs restent à confirmer. Ces contrôles ne sont pas présentés comme exécutés.


## Exécution réelle Node.js du 6 novembre 2026

Une suite GitHub Actions a été créée dans `.github/workflows/test.yml` et exécutée sur le commit `93fb9342e2456a88543f253b76aec75b7a324ee2`.

- Environnement : GitHub Actions Ubuntu, Node.js 22.23.4.
- Commande : `npm test`, exécutant `node --test tests/*.test.mjs`.
- Résultat : **14 tests réussis / 14**, **0 échec**, **0 test ignoré**.
- Journal officiel : https://github.com/chaoli22000bzh/R2D3/actions/runs/42177764780

La réserve précédente relative à l'absence d'exécution Node.js est ainsi levée. Les essais graphiques détaillés (notamment rechargement et absence de stockage persistant) restent à confirmer.


## Recette Chromium du 6 novembre 2026

Workflow : `.github/workflows/browser.yml`. Script : `tests/browser-smoke.mjs`.

- Test automatisé dans Chromium avec Playwright et les fichiers du dépôt C2-Lab récupérés sur GitHub.
- Contrôle de l'identité du moteur et du scénario avec les fichiers de R2D3.
- Scénario simulé sur serveur HTTP local sans dépendance de services externes.
- Résultat du second lancement, après correction d'incompatibilité du système du runner : **8 tests réussis / 8, aucune erreur JavaScript signalée**.
- Journal GitHub : https://github.com/chaoli22000bzh/R2D3/actions/runs/42178196199

Les huit contrôles portent sur : chargement, ping initial, IP incorrecte, cumul des anomalies et réparation partielle, réparation complète, rechargement, absence de stockage navigateur, absence d'erreurs JavaScript et de requêtes externes.

**Bilan des suites automatisées : 14/14 sous Node.js et 8/8 dans Chromium.**

Réserve : la recette Chromium utilise une copie fraîche du dépôt C2-Lab servie localement. Elle démontre le fonctionnement autonome des fichiers testés, mais ne mesure pas les performances ni la disponibilité de GitHub Pages sur Internet. L'URL publique a fait l'objet d'un retour positif du professeur.

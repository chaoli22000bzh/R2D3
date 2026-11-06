# R2D3 - Journal de suivi du développement

**Dépôt :** `chaoli22000bzh/R2D3`  
**Branche de référence :** `main`  
**Dernière mise à jour :** 6 novembre 2026  
**État :** prototype autonome V1 publié ; recette complémentaire en cours.

## 1. Objet du journal

Ce document suit les avancées du **moteur technique autonome R2D3**, les décisions prises, les vérifications réalisées et les prochaines actions. Il sert de point de reprise pour les conversations de développement.

- `README.md` : présentation du projet et mode d'emploi.
- `docs/RECETTE_V1.md` : résultats détaillés et réserves de tests.
- **Ce journal** : chronologie, décisions, état du chantier et travaux à venir.

Les documents normatifs demeurent dans `C2/main/docs`. Le journal ne les remplace pas.

## 2. Périmètre et décisions maintenues

- R2D3 possède son propre dépôt et un moteur JavaScript autonome, indépendant de C², du DOM, du PHP et de MariaDB.
- Un scénario JSON versionné décrit les équipements, leurs configurations et les connexions.
- Une seule instance de moteur possède l'état technique utilisé par plusieurs interfaces.
- Une mauvaise configuration techniquement possible doit être admise et peut coexister avec une autre panne.
- Les changements ne corrigent jamais automatiquement une panne indépendante.
- Les commandes sont atomiques ; les lectures et diagnostics ne doivent pas modifier l'état.
- Exportation et restauration de l'état technique sont possibles sans ajouter de persistance locale.
- Le démonstrateur GitHub Pages est hébergé dans `C2-Lab/r2d3-v1/` et utilise une copie du **même code métier**.
- C² reste responsable des séances, identités, sauvegardes durables, preuves pédagogiques et notes.
- Aucun développement dans C², aucun changement des TP D3, aucune intervention NAS ni lancement de Codex ne sont autorisés dans cette V1.
- **L'intégration C² est explicitement reportée à une nouvelle décision du professeur.**

## 3. Chronologie

### 5 novembre 2026 - Première réalisation de la V1

**Dépôt R2D3**

- Création de `src/r2d3-core.js`.
- Création de `scenarios/atelier-ipv4-v1.json`.
- Scénario initial : un PC Windows, un switch Ethernet et une imprimante réseau, reliés par deux câbles.
- Fonctions du moteur : `createEngine`, `restoreEngine`, `getSnapshot`, `dispatch`, `query`, `subscribe`, `exportState`.
- Commandes : `network.setIPv4`, `network.setLinkConnected`.
- Diagnostic : `network.ping`, calculé à partir de l'état du réseau simulé.
- Ajout d'une suite de tests Node.js dans `tests/core.test.mjs` et d'un `package.json` avec `npm test`.
- Rédaction de `docs/RECETTE_V1.md` et enrichissement du `README.md`.

**Dépôt C2-Lab**

- Publication de `r2d3-v1/index.html`, `app.js`, `r2d3-core.js` et `scenario.json`.
- Deux interfaces : configuration du PC et réseau/imprimante.
- L'état est uniquement conservé en mémoire : pas de `localStorage`, pas d'IndexedDB ni de serveur d'exercice.
- Les modifications déclenchent l'actualisation des vues ; un ping est toujours calculé depuis l'état courant.
- Vérification de l'identité exacte du fichier moteur et du scénario entre les deux dépôts lors de cette livraison.

**Recette initiale :** 9 essais JavaScript du cœur effectués, tous réussis. Voir `docs/RECETTE_V1.md`.

### 6 novembre 2026 - Retour utilisateur et contrôles complémentaires

- Le professeur confirme que **le démonstrateur fonctionne dans son navigateur**. Cela ne vaut pas confirmation de tous les cas détaillés de recette.
- Cinq contrôles supplémentaires du moteur réalisés : commande dupliquée, restauration sans mutation, IPv4 impossible refusée, scénario à port inexistant refusé, diagnostic ping sans mutation.
- **Bilan cumulé : 14 contrôles JavaScript exécutés, 14 réussis.**
- Les cinq nouveaux cas sont ajoutés à `tests/core.test.mjs`.
- Le document `docs/RECETTE_V1.md` est mis à jour.
- À la demande du professeur, création du présent journal directement dans `R2D3/main/docs`.

## 4. État actuel des livrables

| Livrable | Emplacement | Situation |
|---|---|---|
| Moteur autonome | `src/r2d3-core.js` | Développé et contrôlé sur les cas V1 |
| Scénario initial | `scenarios/atelier-ipv4-v1.json` | Développé |
| Suite de tests | `tests/core.test.mjs` | Enregistrée, exécution complète sous Node.js non confirmée |
| Démonstrateur | https://chaoli22000bzh.github.io/C2-Lab/r2d3-v1/ | Publié ; fonctionnement général confirmé par le professeur |
| Rapport de recette | `docs/RECETTE_V1.md` | En cours de consolidation |
| Documentation d'accueil | `README.md` | Présente |

## 5. Points à vérifier avant clôture de la V1

1. Exécuter la suite `npm test` sous Node.js et consigner son résultat exact.
2. Confirmer les manipulations de recette dans un navigateur : double panne, réparations indépendantes, synchronisation et remise à zéro au rechargement.
3. Vérifier le comportement après rechargement de page ainsi que l'absence de sauvegarde persistante.
4. Identifier explicitement les tests du dossier technique non applicables à la V1 et ceux qui restent ouverts.
5. Corriger uniquement les défauts constatés dans le périmètre approuvé, puis consigner le résultat.

**Important :** les contrôles JavaScript déjà exécutés ne doivent pas être assimilés à une exécution de la suite Node.js ou à une recette navigateur complète.

## 6. Limites connues de la V1

- Simulation d'un réseau Ethernet simple avec IPv4 statiques, sans routage.
- Ping logique simulé : aucun paquet réseau réel ; pas d'émulation ARP, DHCP ou DNS.
- Deux types de modification technique : paramètres IPv4 et présence d'une liaison physique.
- Pas de tickets, notation, connexion élève, sauvegarde serveur ou intégration C².
- Pas d'éditeur de scénarios et pas de mécanisme d'annulation globale.

## 7. Suite du chantier

**Priorité immédiate :** terminer et documenter la recette de la V1.

**Après la recette :** proposer séparément les éventuelles priorités V2, sans développer de nouvelles fonctionnalités ni intégrer C² avant décision du professeur.

## 8. Règle de tenue du journal

À chaque étape significative, ajouter ici une entrée datée précisant :

- Ce qui a réellement été créé, modifié ou testé.
- Les dépôts et fichiers concernés.
- Le résultat et les éventuelles réserves.
- Les décisions prises et les actions restant à conduire.

Ne pas déclarer terminé ou testé un travail qui n'a pas été exécuté. Préserver l'historique des étapes précédentes plutôt que de le réécrire.


### 6 novembre 2026 - Automatisation et exécution Node.js des tests

- Ajout de `.github/workflows/test.yml` dans `R2D3/main`.
- Déclenchement automatique sur les modifications du moteur, des scénarios, des tests ou du workflow, ainsi que lors des pull requests concernées ; lancement manuel possible depuis GitHub Actions.
- Premier lancement réel `npm test` avec Node.js 22.23.4 sur GitHub Actions, exécution **42177764780** : **succès, 14 tests réussis, 0 échec, 0 test ignoré**.
- Rapport : https://github.com/chaoli22000bzh/R2D3/actions/runs/42177764780
- Les vérifications approfondies de l'interface dans un navigateur, la recharge de page et l'absence de persistance navigateur restent à confirmer séparément ; une réussite Node.js ne vaut pas recette graphique.
- Aucun changement de fonctionnalités métier et aucune modification de C² ou de C2-Lab pour cette étape.

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


### 6 novembre 2026 - Recette automatisée du démonstrateur dans Chromium

- Création de `tests/browser-smoke.mjs` et de `.github/workflows/browser.yml` dans `R2D3/main`.
- Le workflow récupère séparément les dépôts R2D3 et C2-Lab ; il vérifie que le code métier et le scénario de démonstration correspondent à ceux du moteur, puis sert C2-Lab localement dans Chromium.
- Premier lancement échoué uniquement pendant l'installation du navigateur : le runner Ubuntu par défaut n'était pas compatible avec l'installateur Playwright choisi. Correction du workflow : utilisation d'Ubuntu 24.04. Aucun changement du moteur.
- **Deuxième lancement : succès, 8 essais navigateur réussis sur 8**, exécution GitHub Actions `42178196199`.
- Contrôles : chargement de l'interface, ping initial, mauvaise IPv4, cumul de deux anomalies, réparation indépendante, restauration de l'état initial au rechargement, absence d'utilisation de localStorage/sessionStorage/IndexedDB et absence de requêtes externes ou d'erreurs JavaScript.
- Preuve : https://github.com/chaoli22000bzh/R2D3/actions/runs/42178196199
- L'automatisation navigateur teste les fichiers du dépôt C2-Lab servis localement et non directement la disponibilité publique de GitHub Pages. Le professeur a confirmé séparément le fonctionnement général de l'URL publique.
- **Bilan automatisé V1 : 14 tests Node.js et 8 tests Chromium réussis.**
- Aucun fichier des dépôts C² ou C2-Lab n'a été modifié durant cette étape ; seuls les tests, le workflow et les documents du dépôt R2D3 ont été ajoutés/actualisés.


### 6 novembre 2026 - Consolidation et clôture technique du prototype V1

- Comparaison documentée des dix critères de réussite avec les éléments livrés et testés.
- Création de `docs/BILAN_LIVRAISON_V1.md` : inventaire des livrables, preuves de recette, limites, tests hors périmètre et décision de gel fonctionnel V1.
- **État courant à retenir : V1 livrée et vérifiée sur le périmètre approuvé**, avec 14/14 tests Node.js et 8/8 tests Chromium ; ouverture et fonctionnement général de l'URL publique confirmés par le professeur.
- Les anciennes mentions du présent journal indiquant que l'exécution Node.js ou Chromium « reste à faire » correspondent à des étapes historiques désormais terminées, et ne reflètent plus l'état courant.
- Pas de campagne multi-navigateurs, ni de couverture des fonctionnalités avancées reportées à d'autres lots.
- Aucune modification du moteur, du démonstrateur, de C² ou des TP D3 lors de cette formalisation.
- **Prochaine décision attendue : choix du périmètre de la V2 par le professeur. Ne pas démarrer l'intégration C².**


### 6 novembre 2026 - Lot C : préparation d'un adaptateur hôte fictif

**Autorisation du professeur :** lancement du lot C après clôture de la V1. Le lot D et l'intégration réelle dans C² ne sont pas autorisés.

- Création de `adapters/host-test.js` et `tests/host-adapter.test.mjs` dans `R2D3/main`.
- Banc d'essai hôte entièrement en mémoire : chargement et sauvegarde d'instantanés, clé de copie opaque fournie par l'hôte, contrôle de révision.
- Un changement est calculé dans un moteur provisoire ; il n'est visible et notifié qu'après confirmation de l'hôte fictif. Un refus d'enregistrement n'annonce aucune sauvegarde réussie.
- Export/restauration sans rejeu, isolation entre copies et refus des conflits de révision vérifiés.
- **GitHub Actions : 22/22 tests Node.js réussis**, dont 8 nouveaux tests du lot C. Exécution : https://github.com/chaoli22000bzh/R2D3/actions/runs/42197242201
- Rapport créé : `docs/RECETTE_LOT_C.md`.
- Le Core métier, C2-Lab et le dépôt C² restent inchangés.
- **Lot C livré sur banc d'essai fictif.** Pas de persistance réelle, pas de sécurité serveur ni d'API C². Le lot D attend une nouvelle décision.


### 6 novembre 2026 - Préparation du lot D, sans modification de C²

- À la suite de l'accord de principe du professeur pour poursuivre après le lot C, lecture ciblée des contrats C² et des points d'entrée existants (`ouvrir_tp.php`, `api/session_eleve.php`, `api/reponses_tp.php`, `api/demarrer_seance.php`).
- Constat : les réponses pédagogiques actuelles ne constituent pas un stockage d'état technique avec contrôle de révision ; le lot D doit préserver les responsabilités existantes de C².
- Création de `docs/PREPARATION_LOT_D.md` dans `R2D3/main` avec les points d'ancrage, risques, contraintes de transaction, isolation des copies et ordre recommandé pour une première tranche d'intégration.
- **Aucun fichier du dépôt C² modifié, aucune migration SQL, aucun déploiement et aucun code d'intégration PHP créé.**
- Prochaine décision technique : désigner/autoriser explicitement une branche C² d'intégration après validation du contrat d'architecture, sans modifier `main` ni les branches D3.


### 6 novembre 2026 - Atelier expérimental GitHub Pages à trois terminaux (en attente de retour utilisateur)

- Le professeur souhaite poursuivre les essais sur GitHub Pages pendant que l'intégration C² est reportée à mardi.
- Création de `scenarios/atelier-2pc-imprimante-exp.json` dans R2D3 : PC 1, PC 2, switch trois ports, imprimante, trois liaisons RJ45, sans nouveau type de commande.
- Dans `C2-Lab/main/r2d3-v1/`, ajout isolé de `experiment.html`, `experiment.js` et `experiment-scenario.json`. La page `index.html`, `app.js`, le scénario V1 et la copie du moteur ne sont pas modifiés.
- Manipulations nouvelles proposées : choix du matériel, modification de son IPv4, débranchement individuel des câbles, ping depuis différentes sources, comparaison des conséquences d'une panne sur PC 2 et de la disponibilité de PC 1.
- L'essai expérimental partage le moteur V1 mais ne remplace pas le démonstrateur V1 validé. Les données restent en mémoire ; aucune sauvegarde navigateur ni intégration C².
- Six vérifications Chromium expérimentales ont été ajoutées au banc `tests/browser-smoke.mjs`, déclenchant un nouveau workflow ; le résultat est à compléter après exécution.
- **Aucun fichier C² ou branche d'intégration C² modifié.**


### 6 novembre 2026 - Présentation du ping Windows dans l'atelier expérimental

- Retour du professeur : le scénario expérimental avec deux PC fonctionne ; la seule amélioration demandée porte sur le rendu trop sommaire du ping.
- Dans `C2-Lab/main/r2d3-v1/experiment.js`, la console affiche désormais quatre réponses simulées ou quatre expirations de délai, puis le bilan envoyé/reçu/perdu (0 % ou 100 % pour ce moteur déterministe).
- Une mention explicite « Simulation » différencie cet affichage d'un véritable outil réseau. Les durées `<1ms` et le TTL 128 sont des valeurs **représentatives fixes**, non mesurées. Le moteur de ping n'a pas changé.
- Dans `R2D3/main/tests/browser-smoke.mjs`, des assertions contrôlent les quatre réponses en succès, les quatre expirations en échec et leurs bilans.
- Le démonstrateur V1 classique (`index.html`, `app.js`) reste inchangé, de même que C² et `integration-c2`.


### 6 novembre 2026 - Console ipconfig et ipconfig /all du scénario expérimental

- Retour utilisateur : le ping à quatre réponses est nettement meilleur. Demande de retirer la ligne annonçant la simulation dans l'affichage du ping, puis de pouvoir évaluer l'ergonomie de deux commandes Windows `ipconfig` et `ipconfig /all`.
- `C2-Lab/main/r2d3-v1/experiment.js` : ligne d'annonce de simulation retirée de la console ping ; les quatre réponses et leur bilan restent présents.
- `C2-Lab/main/r2d3-v1/experiment.html` et `experiment.js` : ajout d'une console Windows pour PC 1 ou PC 2, avec `ipconfig` simple et `ipconfig /all`. IPv4 et masque sont calculés à partir du moteur existant, le statut « média déconnecté » suit l'état du câble, et la vue se met à jour après modification.
- Les adresses physiques `02-00-00-00-00-01` et `02-00-00-00-00-02` sont des **valeurs fictives d'affichage** ; le moteur V1 ne gère pas encore les MAC, DNS, passerelles ou DHCP. L'écran ne doit pas inventer un bail, une passerelle ou un serveur DNS.
- Ajout de contrôles `ipconfig`, `ipconfig /all` et relecture de configuration dans `R2D3/main/tests/browser-smoke.mjs`.
- La V1 historique, le Core, les TP C² et la branche `integration-c2` restent inchangés.
- La validation manuelle pédagogique des deux commandes reste à réaliser par le professeur depuis GitHub Pages.

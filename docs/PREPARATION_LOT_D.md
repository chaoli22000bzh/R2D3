# R2D3 - Préparation technique du lot D (intégration C²)

**Date :** 6 novembre 2026  
**Statut :** préparation en lecture seule de C², aucune intégration réalisée.  
**Sources :** `C2/main/docs/PLAN_REALISATION_RECETTE_R2D3.md`, `DOSSIER_TECHNIQUE_MOTEUR_R2D3_V1.md`, `REVUE_COHERENCE_CONTRATS_R2D3.md`, `CONTRAT_TECHNIQUE_TP_NORMALISE.md` et `CAHIER_DES_CHARGES_R2D3.md` (§39 notamment), plus examen ciblé des fichiers C² cités ci-dessous.

## 1. Périmètre du lot D

Raccorder le moteur technique R2D3, déjà validé avec un hôte fictif, à une **copie de TP réellement autorisée par C²** ; préserver l'identité, les séances, la reprise et la correction de C².

Le lot D ne contient **aucun** nouveau gestionnaire de séances, aucune notation R2D3 et aucune conversion massive des TP. Aucun déploiement NAS et aucune migration en production sans autorisation séparée.

## 2. Points d'ancrage C² vérifiés sur main

| Fichier | Rôle actuel pertinent | Conséquence pour R2D3 |
|---|---|---|
| `ouvrir_tp.php` | Contrôle identité et affectation élève/TP/séance ; marque la première ouverture | Réutiliser le contexte autorisé fourni par C², sans l'inférer du navigateur |
| `api/session_eleve.php` | Expose le contexte d'une session élève et des séances associées | Ne pas en faire une source de permission suffisante pour une écriture R2D3 |
| `api/reponses_tp.php` | Lit et écrit des champs de réponses par `tp_id, eleve_id, champ`; vérifie la séance sur écriture | **Ne pas** y entasser les snapshots techniques ; les écritures existantes n'ont pas de révision CAS R2D3 |
| `api/demarrer_seance.php` | Création transactionnelle d'une séance et de ses affectations | C² reste propriétaire de la création et de l'accès aux séances |

Référence documentaire : `docs/AUDIT_EXISTANT_R2D3.md` signale également des particularités de lecture/écriture et de protection des évaluations à prendre en compte. L'inspection porte sur les fichiers `main` lus le 6 novembre, et **ne démontre pas** l'état du NAS ni de toutes les branches.

## 3. Contrat minimal à raccorder, sans inventer une nouvelle API

L'adaptateur du lot C, `adapters/host-test.js`, démontre les opérations logiques :

1. Un hôte C² authentifié choisit la copie et la version du scénario.
2. Il fournit à R2D3 l'état technique sauvegardé (ou l'état initial d'une nouvelle copie autorisée).
3. Une commande produit un état candidat sans modifier l'état visible avant accord serveur.
4. C² vérifie au moment de l'écriture : identité de session, autorisation sur le couple élève/TP, état de séance, restrictions pédagogiques déjà définies et révision attendue.
5. L'écriture d'un snapshot versionné et de ses éventuels faits significatifs est atomique **dans la transaction C²** ; aucun succès n'est annoncé avant confirmation.
6. Si l'écriture échoue, la copie précédente demeure ; l'interface doit signaler clairement l'échec ou le conflit.
7. Une réouverture **autorisée par C²** restaure exactement l'état sans rejouer d'opérations ni générer de faux faits.

L'hôte décide du droit de reprise et du recommencement, et non le moteur. L'identifiant de copie doit être opaque pour le moteur ; éviter de permettre au navigateur de choisir un autre élève ou un autre TP.

## 4. Décisions restant au chantier architecture C²/R2D3

- Forme précise du rattachement de l'état technique aux copies existantes (y compris la version publiée et la génération de travail si applicable).
- Tables et migrations versionnées nécessaires, sans modification opportuniste du schéma lors des requêtes.
- Routes HTTP et schéma de réponse, validation serveur et protection CSRF adaptée à C².
- Concurrence multi-onglet et idempotence serveur, notamment après réponse réseau perdue.
- Protection des copies évaluées, TP papier et autres TP non R2D3.
- Provenance et conservation ciblée des preuves techniques utiles à la correction.
- Stratégie de reprise après interruption et affichage distinct de « modification locale » et « enregistré sur serveur ».

Les anciennes propositions de noms de tables/routes ne constituent **pas** un choix d'implémentation approuvé.

## 5. Réalisation proposée pour une première tranche autorisée

Sur une **branche explicitement désignée par le chantier C²**, et seulement après accord sur le contrat d'intégration :

1. Lire et vérifier le schéma actuel et les chemins d'authentification, sans données réelles d'élèves.
2. Établir l'interface C² minimale pour un scénario de test et une copie fictive.
3. Implémenter un stockage de test isolé, sécurisé et versionné selon l'architecture approuvée.
4. Brancher le **même** moteur R2D3 et son adaptateur, sans réécrire les règles réseau.
5. Exécuter les tests d'isolation, de concurrence, de coupure d'écriture, de reprise et de non-régression des TP papier et historiques.
6. Examiner les résultats avant toute fusion, migration ou déploiement.

## 6. État de sortie

- **Terminé ici :** reconnaissance ciblée de l'architecture et identification des contraintes.
- **Non commencé :** code PHP de C², migration SQL, intégration sur branche C², déploiement NAS.
- **Condition de démarrage :** accord explicite pour écrire dans une branche C² précise et validation de la responsabilité architecture C²/R2D3. Ne jamais modifier `C2/main` ou les branches D3 historiques par défaut.

Le lot C demeure validé avec 22/22 tests Node.js. Ce résultat ne démontre pas encore l'intégration C².

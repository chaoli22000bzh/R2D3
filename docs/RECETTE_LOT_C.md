# R2D3 - Recette du lot C : adaptateur hôte fictif

**Date :** 6 novembre 2026  
**Statut :** lot C réalisé et testé sur banc fictif ; intégration C² non engagée.

## Objectif

Prouver que le même moteur R2D3 utilisé dans la démonstration autonome peut être piloté par un hôte qui charge, confirme l'enregistrement et restitue des états techniques, **sans modifier le moteur, sans stockage durable et sans prise de décision pédagogique par R2D3**.

## Livrables

- `adapters/host-test.js` : adaptateur à validation préalable de sauvegarde, et hôte fictif en mémoire.
- `tests/host-adapter.test.mjs` : huit tests du contrat de reprise et de sauvegarde.
- Les fichiers `src/r2d3-core.js`, `scenarios/atelier-ipv4-v1.json` et C2-Lab restent inchangés.

L'adaptateur accepte un `copyKey` opaque : il ne crée ni identifiant d'élève, ni séance, ni autorisation. L'hôte fictif simule `load` / `save` avec comparaison de révision. Cette interface de banc n'impose **aucune API HTTP/PHP ni structure SQL** à l'intégration future.

## Comportement démontré

1. Ouverture : l'hôte fournit l'état enregistré ou `null` pour un exercice initial.
2. Une commande est calculée sur une instance provisoire du moteur.
3. Si la commande est refusée par le moteur, aucune écriture n'a lieu.
4. Si la commande est applicable, l'hôte fictif tente de stocker l'instantané avec contrôle de révision.
5. Une sauvegarde confirmée rend le nouvel état visible et notifie les abonnés.
6. Une sauvegarde refusée ou une exception ne change pas l'état visible et ne donne aucun succès.
7. Une réouverture restaure l'instantané sans rejouer les actions.

L'hôte de test est volontairement volatil ; fermer le processus de test détruit son stockage. La persistance réelle, les transactions serveur, les permissions et la gestion des séances appartiennent au lot D et à C².

## Tests exécutés

| Test | Résultat |
|---|---|
| LOT-C-01 : état sauvegardé et réhydraté sans rejeu | Réussi |
| LOT-C-02 : échec d'enregistrement sans faux succès ni mutation visible | Réussi |
| LOT-C-03 : deux copies isolées malgré les mêmes identifiants d'objets locaux | Réussi |
| LOT-C-04 : modifications concurrentes, refus sans écrasement | Réussi |
| LOT-C-05 : opération refusée par le Core sans écriture hôte | Réussi |
| LOT-C-06 : notification après confirmation de sauvegarde | Réussi |
| LOT-C-07 : commandes simultanées sur un adaptateur sans perte silencieuse | Réussi |
| LOT-C-08 : exception de l'hôte sans confirmation de sauvegarde | Réussi |

Exécution GitHub Actions : https://github.com/chaoli22000bzh/R2D3/actions/runs/42197242201

**Résultat vérifié : 22/22 tests Node.js réussis (14 V1 + 8 lot C).**

## Réserves et suite

- Ces essais concernent un hôte **fictif**. Ils ne prouvent ni la sécurité ni l'atomicité d'un futur service C².
- Un conflit de révision est **signalé**, sans fusion ni restauration automatique de la copie concurrente : l'hôte réel devra déterminer le parcours utilisateur.
- Le dispositif ne constitue pas un système d'idempotence durable entre deux processus serveurs : à définir côté hôte sécurisé.
- Aucun test d'écriture en base MariaDB, de panne réseau réelle, de NAS, de contrôle d'identité ou de correction pédagogique.
- Les questions d'autorisation, sauvegarde atomique et reprise pédagogique seront traitées séparément par l'architecture C².

**Décision de périmètre :** ne pas engager le lot D (intégration réelle) sans une nouvelle autorisation.

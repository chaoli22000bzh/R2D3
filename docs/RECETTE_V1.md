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

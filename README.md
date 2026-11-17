# R2D3

**Documentation officielle et inventaire des composants :** [C² / main / docs](https://github.com/chaoli22000bzh/C2/tree/main/docs) (dépôt privé). Le dépôt R2D3 ne contient plus de documentation de référence ; ses sources et ses tests restent ici.

Moteur pédagogique de simulation technique


## Moteur V1

Le moteur de simulation fonctionnel se trouve dans `src/r2d3-core.js`. Il est indépendant de C², du DOM et de tout serveur. Le scénario d'exemple est `scenarios/atelier-ipv4-v1.json`.

**API :** `createEngine(scenario)`, `restoreEngine(scenario, savedState)`, puis `getSnapshot()`, `dispatch(command)`, `query(request)`, `subscribe(listener)` et `exportState()`.

**Commandes :** `network.setIPv4` et `network.setLinkConnected`. **Diagnostic :** `network.ping`.

**Tests :** lancer `npm test` avec Node.js 20+ (aucune dépendance à installer).

**Démo autonome :** https://chaoli22000bzh.github.io/C2-Lab/r2d3-v1/

Le laboratoire C2-Lab héberge des démonstrateurs autonomes de plusieurs moteurs et interfaces R2D3 ; les copies du code commun doivent rester synchronisées avec les sources de ce dépôt. Les pages de test ne constituent pas une intégration de production.

**Administration des switchs L2/L3 :** composant partagé `src/switch-admin-ui-v1.js` et `src/switch-admin-ui-v1.css`, utilisant le registre d'actifs et les modules VLAN, IPv4 de gestion, routage inter-VLAN, IP Helper et DHCP L3. [Interface de recette C2-Lab](https://chaoli22000bzh.github.io/C2-Lab/r2d3-v1/switch-admin-ui-v1.html?v=6.11).

**Brassage graphique RJ45 V1.5 :** composant partagé validé en laboratoire par recette manuelle **6/6** le 17 novembre 2026, dans [C2-Lab](https://chaoli22000bzh.github.io/C2-Lab/r2d3-v1/cabling-frontpanel-v1.html?v=1.5). Façades de panneaux, switch et raccordement/déplacement des cordons directement sur les ports. Code : `C2-Lab/shared-ui/v1/cabling-frontpanel.js` et `.css`, reposant sur les actions et sur le registre physique R2D3, sans duplication du moteur. Le composant **n'est pas encore intégré dans un TP hôte** ; une vérification PC → Internet associant câblage et réseau, ainsi qu'une animation finale après résolution APIPA, restent à concevoir. **Référence normative et état de recette :** [C2/docs/COMPOSANTS_UI_PARTAGES.md](https://github.com/chaoli22000bzh/C2/blob/main/docs/COMPOSANTS_UI_PARTAGES.md), [catalogue officiel](https://github.com/chaoli22000bzh/C2/blob/main/docs/CATALOGUE_COMPOSANTS_PARTAGES.json) et [plan de recette](https://github.com/chaoli22000bzh/C2/blob/main/docs/PLAN_REALISATION_RECETTE_R2D3.md).

**État d'intégration :** R2D3 est développé et testé indépendamment de C² ; **le raccordement de R2D3 à C² n'a pas commencé**. Aucune compatibilité de production, persistance des séances ni évaluation C² n'a été recettée.

Pour les spécifications et le statut des recettes, utiliser uniquement les références officielles [C2/docs](https://github.com/chaoli22000bzh/C2/tree/main/docs), notamment `CAHIER_DES_CHARGES_R2D3.md` et `PLAN_REALISATION_RECETTE_R2D3.md`.

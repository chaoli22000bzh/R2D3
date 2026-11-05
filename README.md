# R2D3
Moteur pédagogique de simulation technique


## Moteur V1

Le moteur de simulation fonctionnel se trouve dans `src/r2d3-core.js`. Il est indépendant de C², du DOM et de tout serveur. Le scénario d'exemple est `scenarios/atelier-ipv4-v1.json`.

**API :** `createEngine(scenario)`, `restoreEngine(scenario, savedState)`, puis `getSnapshot()`, `dispatch(command)`, `query(request)`, `subscribe(listener)` et `exportState()`.

**Commandes :** `network.setIPv4` et `network.setLinkConnected`. **Diagnostic :** `network.ping`.

**Tests :** lancer `npm test` avec Node.js 20+ (aucune dépendance à installer).

**Démo autonome :** https://chaoli22000bzh.github.io/C2-Lab/r2d3-v1/

Le démonstrateur C2-Lab embarque une copie du même fichier métier. Il ne conserve aucune donnée dans le navigateur après rechargement. Périmètre technique limité à un LAN Ethernet avec IPv4 statiques, deux câbles et ping simulé.

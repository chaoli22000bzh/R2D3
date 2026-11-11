# Moteur mail simulé V1

Module autonome `src/mail-core.js`, sans DOM, réseau, serveur SMTP/POP3/IMAP, ni authentification Microsoft réelle.

## Contrat

`createMailEngine(scenario[,savedState])` et `restoreMailEngine(scenario,savedState)`.

- `validateAccount(account)` retourne `{success,code,message,testMessageSent:false}` lors d'une réussite. Compatible avec `callbacks.onTestAccount` d'Outlook.
- `send({from,to,subject,body})` retourne `{success,code,message,messageId,receivedIds}`. Compatible avec `callbacks.onSend`. N'ajouter **aucun** `delivered:true` : le moteur crée ses propres copies reçues et l'adaptateur appelle `outlook.update({messages})` pour éviter les doublons.
- `receive({from,to,subject,body})` injecte un courriel de scénario, non lu.
- `markRead(messageId)` reçoit l'événement Outlook `onMessageRead` après résolution de l'identifiant canonique.
- `setFailure(name,enabled)` simule `incomingDown`, `smtpDown`, `m365Down`.
- `getSnapshot()` / `exportState()` permettent la reprise d'état. Aucune configuration ni mot de passe n'est stocké dans l'état exporté.

## Limites et liaison Outlook

Le scénario contient uniquement des identifiants fictifs et doit rester un outil pédagogique, jamais de véritables mots de passe. La configuration des comptes est une **validation simulée** par comparaison. Pour le mode SMTP `same`, les identifiants entrants sont réutilisés, sinon les identifiants sortants explicites sont testés. La simulation n'implémente aucun protocole ni boîte distante.

L'intégration au composant `C2-Lab/shared-ui/v1/outlook.js` exige un adaptateur qui synchronise les messages canoniques et les identifiants d'interface. Les événements Outlook ne doivent pas dupliquer ceux du moteur. Les règles de validation de la page de démonstration Outlook ne sont pas utilisées par ce module. Aucun TP C² n'est modifié.

Tests : `npm test`, dont `tests/mail-core.test.mjs`.

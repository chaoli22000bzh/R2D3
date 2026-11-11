import test from "node:test";
import assert from "node:assert/strict";
import {createMailEngine,restoreMailEngine} from "../src/mail-core.js";
const account=(type,email,extra={})=>({
 email,type,settings:type==="m365"?{username:email,password:"demo-365"}:{
 incomingHost:type==="imap"?"imap.example.test":"pop.example.test",
 incomingPort:type==="imap"?"993":"995",incomingSecurity:"ssl",
 incomingUsername:email,incomingPassword:"incoming-secret",
 outgoingHost:"smtp.example.test",outgoingPort:"587",outgoingSecurity:"starttls",
 outgoingUsername:"smtp-agent",outgoingPassword:"smtp-secret"
 },...extra
});
const scenario={accounts:[account("imap","agent@example.test"),account("pop3","sav@example.test"),
  account("m365","bureau@example.test")],
 messages:[{from:"client@example.test",to:"agent@example.test",subject:"Incident",body:"Bonjour"}]};
const form=email=>{
 const ref=scenario.accounts.find(a=>a.email===email);
 return ref.type==="m365"?{email,type:"m365",...ref.settings}:
  {email,type:ref.type,...ref.settings,smtpAuthMode:"separate"};
};
test("POP3, IMAP et Microsoft 365 : configurations valides",()=>{
 const engine=createMailEngine(scenario);
 for(const a of scenario.accounts)assert.equal(engine.validateAccount(form(a.email)).success,true);
 assert.equal(engine.getSnapshot().configured.length,3);
});
test("SMTP partagé utilise les identifiants entrants et peut échouer",()=>{
 const engine=createMailEngine(scenario);
 const a=form("agent@example.test");a.smtpAuthMode="same";
 assert.equal(engine.validateAccount(a).code,"outgoingUsername");
 a.smtpAuthMode="separate";a.outgoingPort="465";
 assert.equal(engine.validateAccount(a).code,"outgoingPort");
 a.outgoingPort="587";
 assert.equal(engine.validateAccount(a).success,true);
});
test("pannes entrantes, SMTP et Microsoft 365 sont contrôlables",()=>{
 const e=createMailEngine(scenario);
 e.setFailure("incomingDown",true);assert.equal(e.validateAccount(form("agent@example.test")).code,"incoming_unavailable");
 e.setFailure("incomingDown",false);e.setFailure("smtpDown",true);
 assert.equal(e.validateAccount(form("agent@example.test")).code,"smtp_unavailable");
 e.setFailure("m365Down",true);assert.equal(e.validateAccount(form("bureau@example.test")).code,"m365_unavailable");
});
test("envoi, réception locale et lecture restent séparés",()=>{
 const e=createMailEngine(scenario);
 assert.equal(e.send({from:"agent@example.test",to:"agent@example.test",subject:"Test",body:"Bonjour"}).code,"account_not_configured");
 e.validateAccount(form("agent@example.test"));
 const result=e.send({from:"agent@example.test",to:"agent@example.test",subject:"Test",body:"Bonjour"});
 assert.equal(result.success,true);assert.equal(result.receivedIds.length,1);assert.equal(result.delivered,undefined);
 const unread=e.getSnapshot().messages.find(m=>m.id===result.receivedIds[0]);assert.equal(unread.read,false);
 assert.equal(e.markRead(unread.id).success,true);
 assert.equal(e.getSnapshot().messages.find(m=>m.id===unread.id).read,true);
 assert.equal(e.getSnapshot().events.filter(x=>x.type==="mail.read").length,1);
 e.markRead(unread.id);assert.equal(e.getSnapshot().events.filter(x=>x.type==="mail.read").length,1);
});
test("messages initiaux et restauration cohérente",()=>{
 const e=createMailEngine(scenario);
 assert.equal(e.getSnapshot().messages.filter(m=>m.folder==="inbox").length,1);
 const saved=e.exportState();const restored=restoreMailEngine(scenario,saved);
 assert.deepEqual(restored.getSnapshot(),saved);
 assert.equal(restored.receive({from:"client@example.test",to:"inconnu@example.test",subject:"X",body:"Y"}).success,false);
});
test("aucun secret de référence dans l'état sauvegardé",()=>{
 const e=createMailEngine(scenario);e.validateAccount(form("agent@example.test"));
 assert.equal(JSON.stringify(e.exportState()).includes("smtp-secret"),false);
 assert.equal(JSON.stringify(e.exportState()).includes("incoming-secret"),false);
});

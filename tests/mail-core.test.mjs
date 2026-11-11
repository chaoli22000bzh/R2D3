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

test("messages envoyés et reçus horodatés au moment de leur création",()=>{
 const e=createMailEngine(scenario);
 e.validateAccount(form("agent@example.test"));
 const start=Date.now();
 const sent=e.send({from:"agent@example.test",to:"agent@example.test",subject:"Horloge",body:"Bonjour"});
 const end=Date.now();
 assert.equal(sent.success,true);
 const mails=e.getSnapshot().messages.filter(x=>x.subject==="Horloge");
 assert.equal(mails.length,2);
 for(const m of mails){
   assert.match(m.date,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
   assert.ok(Date.parse(m.date)>=start && Date.parse(m.date)<=end);
 }
 assert.equal(e.markRead(sent.receivedIds[0]).success,true);
 assert.deepEqual(e.getSnapshot().messages.filter(x=>x.subject==="Horloge").map(x=>x.date),mails.map(x=>x.date));
});
test("dates relatives des messages initiaux et sauvegarde sans recalcul",()=>{
 const initial={...scenario,messages:[
  {from:"client@example.test",to:"agent@example.test",subject:"Hier",body:"Ancien",minutesAgo:1440},
  {from:"client@example.test",to:"agent@example.test",subject:"Daté",body:"Fixe",date:"2025-02-01T10:20:30.000Z"}]};
 const start=Date.now(),e=createMailEngine(initial),end=Date.now();
 const messages=e.getSnapshot().messages;
 assert.ok(Date.parse(messages[0].date)>=start-86400000 && Date.parse(messages[0].date)<=end-86400000);
 assert.equal(messages[1].date,"2025-02-01T10:20:30.000Z");
 const saved=e.exportState(),restored=restoreMailEngine(initial,saved);
 assert.deepEqual(restored.getSnapshot().messages,messages);
 assert.equal(restored.getSnapshot().messages[0].date,messages[0].date);
});
test("dates invalides dans les scénarios refusées",()=>{
 for(const date of ["demain","2025-13-40T00:00:00.000Z"]){
  assert.throws(()=>createMailEngine({...scenario,messages:[{...scenario.messages[0],date}]}));
 }
 assert.throws(()=>createMailEngine({...scenario,messages:[{...scenario.messages[0],minutesAgo:-2}]}));
});

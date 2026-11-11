import test from "node:test";
import assert from "node:assert/strict";
import {createMailEngine,restoreMailEngine} from "../src/mail-core.js";
const scenario={accounts:[],mailServer:{domain:"atelier-kerwen.fr",
 imap:{host:"imap.atelier-kerwen.fr",port:"993",security:"ssl"},
 pop3:{host:"pop.atelier-kerwen.fr",port:"995",security:"ssl"},
 smtp:{host:"smtp.atelier-kerwen.fr",port:"587",security:"starttls"}}};
function client(email,type,password){const inc=scenario.mailServer[type],smtp=scenario.mailServer.smtp;return {
 email,type,incomingHost:inc.host,incomingPort:inc.port,incomingSecurity:inc.security,
 incomingUsername:email,incomingPassword:password,outgoingHost:smtp.host,outgoingPort:smtp.port,
 outgoingSecurity:smtp.security,smtpAuthMode:"same"};}
test("serveur vide : création obligatoire avant Outlook",()=>{
 const e=createMailEngine(scenario);const a=client("technicien@atelier-kerwen.fr","imap","fictif123");
 assert.equal(e.validateAccount(a).success,false);
 assert.equal(e.createMailbox({email:a.email,password:"fictif123",type:"imap"}).success,true);
 assert.equal(e.validateAccount(a).success,true);
 assert.deepEqual(e.listMailboxes(),[{email:a.email,type:"imap"}]);
});
test("POP3 créé puis configuré, SMTP envoyé et réception locale",()=>{
 const e=createMailEngine(scenario),email="sav@atelier-kerwen.fr";
 assert.equal(e.createMailbox({email,password:"savdemo",type:"pop3"}).success,true);
 assert.equal(e.validateAccount(client(email,"pop3","savdemo")).success,true);
 const result=e.send({from:email,to:email,subject:"Test",body:"Message"});
 assert.equal(result.receivedIds.length,1);
 assert.equal(e.getSnapshot().messages.filter(m=>m.subject==="Test").length,2);
});
test("doublon, domaine étranger, mot de passe erroné et protocole différent sont refusés",()=>{
 const e=createMailEngine(scenario),email="tech@atelier-kerwen.fr";
 assert.equal(e.createMailbox({email:"tech@exemple.fr",password:"test123"}).code,"invalid_domain");
 assert.equal(e.createMailbox({email,password:"test123"}).success,true);
 assert.equal(e.createMailbox({email,password:"test123"}).code,"mailbox_exists");
 assert.equal(e.validateAccount(client(email,"imap","incorrect")).code,"incomingPassword");
 assert.equal(e.validateAccount(client(email,"pop3","test123")).code,"unknown_account");
});
test("nouvelle boîte conservée par export/restauration",()=>{
 const e=createMailEngine(scenario);e.createMailbox({email:"tech@atelier-kerwen.fr",password:"demo123"});
 const saved=e.exportState(),restored=restoreMailEngine(scenario,saved);
 assert.deepEqual(restored.getSnapshot(),saved);
 assert.equal(restored.validateAccount(client("tech@atelier-kerwen.fr","imap","demo123")).success,true);
});
test("ancien scénario à comptes prédéfinis reste compatible",()=>{
 const legacy={accounts:[{email:"a@exemple.fr",type:"m365",settings:{username:"a@exemple.fr",password:"demo"}}]};
 const e=createMailEngine(legacy);assert.equal(e.validateAccount({email:"a@exemple.fr",type:"m365",username:"a@exemple.fr",password:"demo"}).success,true);
 assert.equal(e.createMailbox({email:"b@exemple.fr",password:"demo"}).code,"no_mail_server");
});

test("domaines multiples et serveurs associés, boîtes et sessions indépendantes",()=>{
 const e=createMailEngine(scenario);
 assert.equal(e.createMailbox({email:"toto@cybernet.fr",password:"demo123"}).code,"invalid_domain");
 assert.equal(e.createDomain("cybernet.fr").success,true);
 assert.equal(e.createDomain("CYBERNET.FR").code,"domain_exists");
 assert.equal(e.createDomain("pas un domaine").code,"invalid_domain");
 const server=e.getServerSettings("cybernet.fr");
 assert.equal(server.imap.host,"imap.cybernet.fr");
 assert.equal(server.pop3.host,"pop.cybernet.fr");
 assert.equal(server.smtp.host,"smtp.cybernet.fr");
 assert.equal(e.createMailbox({email:"toto@cybernet.fr",password:"demo123"}).success,true);
 assert.equal(e.createMailbox({email:"tech@atelier-kerwen.fr",password:"demo456"}).success,true);
 assert.equal(e.validateAccount({...client("toto@cybernet.fr","imap","demo123"),incomingHost:"imap.cybernet.fr",outgoingHost:"smtp.cybernet.fr"}).success,true);
 assert.equal(e.validateAccount(client("tech@atelier-kerwen.fr","imap","demo456")).success,true);
 const state=e.exportState(),restore=restoreMailEngine(scenario,state);
 assert.deepEqual(restore.listDomains(),["atelier-kerwen.fr","cybernet.fr"]);
 assert.equal(restore.listMailboxes().length,2);
 assert.equal(restore.getServerSettings("cybernet.fr").smtp.host,"smtp.cybernet.fr");
});

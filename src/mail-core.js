/* Moteur de messagerie pédagogique R2D3 V1 : aucun protocole ni serveur réel. */
const clone = value => JSON.parse(JSON.stringify(value));
const norm = value => String(value ?? "").trim().toLowerCase();
const emailOk = value => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(value ?? "").trim());
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const types = new Set(["pop3", "imap", "m365"]);
const fields = ["incomingHost","incomingPort","incomingSecurity","outgoingHost","outgoingPort","outgoingSecurity"];
const errorText = {
  incomingHost:"Serveur de courrier entrant incorrect.",
  incomingPort:"Port de courrier entrant incorrect.",
  incomingSecurity:"Sécurité du courrier entrant incorrecte.",
  incomingUsername:"Identifiant entrant incorrect.",
  incomingPassword:"Mot de passe entrant incorrect.",
  outgoingHost:"Serveur SMTP incorrect.",
  outgoingPort:"Port SMTP incorrect.",
  outgoingSecurity:"Sécurité SMTP incorrecte.",
  outgoingUsername:"Identifiant SMTP incorrect.",
  outgoingPassword:"Mot de passe SMTP incorrect.",
  username:"Identifiant Microsoft 365 incorrect.",
  password:"Mot de passe Microsoft 365 incorrect."
};
const response = (success,code,message,extra={}) => ({success,code,message,...extra});
function incoming(a){return {user:a.incomingUsername ?? a.username ?? "",pass:a.incomingPassword ?? a.password ?? ""};}
function outgoing(a){
  return a.smtpAuthMode === "separate"
    ? {user:a.outgoingUsername ?? "",pass:a.outgoingPassword ?? ""}
    : incoming(a);
}
function checkScenario(scenario){
  if(!object(scenario)||!Array.isArray(scenario.accounts)||!scenario.accounts.length)
    throw Error("Scénario mail invalide");
  const addresses=new Set();
  for(const a of scenario.accounts){
    if(!object(a)||!emailOk(a.email)||!types.has(a.type)||!object(a.settings)||addresses.has(norm(a.email)))
      throw Error("Compte de référence invalide");
    addresses.add(norm(a.email));
    const required=a.type==="m365"?["username","password"]:
      [...fields,"incomingUsername","incomingPassword","outgoingUsername","outgoingPassword"];
    if(required.some(key=>typeof a.settings[key]!=="string"||!a.settings[key].trim()))
      throw Error("Paramètres de référence incomplets");
  }
  if(scenario.messages!==undefined&&(!Array.isArray(scenario.messages)||scenario.messages.some(m=>!object(m)||!emailOk(m.to)||!emailOk(m.from)||typeof m.subject!=="string"||typeof m.body!=="string")))
    throw Error("Courriel initial invalide");
}
export function createMailEngine(scenario,savedState){
  checkScenario(scenario);
  const reference=clone(scenario);
  let state=savedState===undefined?{revision:0,nextId:1,configured:[],messages:[],events:[],
    failures:{incomingDown:false,smtpDown:false,m365Down:false,...reference.failures}}:clone(savedState);
  if(!object(state)||!Number.isInteger(state.revision)||state.revision<0||!Number.isInteger(state.nextId)||state.nextId<1||
    !Array.isArray(state.configured)||!Array.isArray(state.messages)||!Array.isArray(state.events)||!object(state.failures))
    throw Error("Sauvegarde de messagerie invalide");
  const lookup=email=>reference.accounts.find(a=>norm(a.email)===norm(email));
  function event(type,info){state.revision++;state.events.push({id:state.revision,type,...info});}
  function receive(mail){
    if(!object(mail)||!emailOk(mail.to)||!emailOk(mail.from)||typeof mail.subject!=="string"||typeof mail.body!=="string"||!lookup(mail.to))
      return response(false,"invalid_message","Courriel entrant invalide ou destinataire inconnu.");
    const msg={id:"mail-"+state.nextId++,folder:"inbox",accountEmail:lookup(mail.to).email,from:mail.from,to:mail.to,
      subject:mail.subject,body:mail.body,read:false};
    state.messages.push(msg);event("mail.received",{messageId:msg.id,to:msg.accountEmail});
    return response(true,"received","Courriel reçu.",{message:clone(msg)});
  }
  if(savedState===undefined) for(const mail of reference.messages??[]) receive(mail);
  function validateAccount(a){
    if(!object(a)||!emailOk(a.email)||!types.has(a.type))return response(false,"invalid_account","Compte invalide.");
    const ref=lookup(a.email);
    if(!ref||a.type!==ref.type)return response(false,"unknown_account","Compte ou protocole incorrect.");
    const expected=ref.settings;
    if(a.type==="m365"){
      if(state.failures.m365Down)return response(false,"m365_unavailable","Connexion Microsoft 365 indisponible.");
      for(const key of ["username","password"])
        if(String(a[key]??"")!==expected[key])return response(false,key,errorText[key]);
    }else{
      if(state.failures.incomingDown)return response(false,"incoming_unavailable","Serveur entrant indisponible.");
      for(const key of fields.slice(0,3))
        if(norm(a[key])!==norm(expected[key]))return response(false,key,errorText[key]);
      const actualIn=incoming(a);
      for(const [key,value] of [["incomingUsername",actualIn.user],["incomingPassword",actualIn.pass]])
        if(String(value)!==expected[key])return response(false,key,errorText[key]);
      if(state.failures.smtpDown)return response(false,"smtp_unavailable","Serveur SMTP indisponible.");
      for(const key of fields.slice(3))
        if(norm(a[key])!==norm(expected[key]))return response(false,key,errorText[key]);
      const actualOut=outgoing(a);
      for(const [key,value] of [["outgoingUsername",actualOut.user],["outgoingPassword",actualOut.pass]])
        if(String(value)!==expected[key])return response(false,key,errorText[key]);
    }
    const email=ref.email;
    if(!state.configured.includes(email))state.configured.push(email);
    event("account.validated",{email,type:a.type});
    return response(true,"configured","Le compte a été configuré.",{testMessageSent:false});
  }
  function send(mail){
    if(!object(mail)||!emailOk(mail.from)||typeof mail.to!=="string"||
      typeof mail.subject!=="string"||!mail.subject.trim()||typeof mail.body!=="string")
      return response(false,"invalid_message","Destinataire, objet ou contenu invalide.");
    const sender=lookup(mail.from);
    if(!sender||!state.configured.includes(sender.email))
      return response(false,"account_not_configured","Compte expéditeur non configuré.");
    if((sender.type==="m365"&&state.failures.m365Down)||(sender.type!=="m365"&&state.failures.smtpDown))
      return response(false,"send_unavailable","Envoi impossible : service sortant indisponible.");
    const recipients=mail.to.split(/[;,]/).map(x=>x.trim());
    if(recipients.some(x=>!emailOk(x)))return response(false,"invalid_recipient","Adresse du destinataire incorrecte.");
    const sent={id:"mail-"+state.nextId++,folder:"sent",accountEmail:sender.email,
      from:sender.email,to:mail.to,subject:mail.subject,body:mail.body,read:true};
    state.messages.push(sent);event("mail.sent",{messageId:sent.id,from:sender.email,to:mail.to});
    const received=[];
    for(const recipient of new Set(recipients.map(norm))){
      if(lookup(recipient)){
        const result=receive({from:sender.email,to:recipient,subject:mail.subject,body:mail.body});
        received.push(result.message.id);
      }
    }
    // delivered est volontairement absent : l'interface Outlook ne doit pas créer une deuxième copie.
    return response(true,"sent","Message envoyé (simulation).",{messageId:sent.id,receivedIds:received});
  }
  function markRead(id){
    const m=state.messages.find(x=>x.id===id&&x.folder==="inbox");
    if(!m)return response(false,"message_not_found","Courriel introuvable.");
    if(!m.read){m.read=true;event("mail.read",{messageId:id,accountEmail:m.accountEmail});}
    return response(true,"read","Courriel marqué comme lu.");
  }
  function setFailure(name,enabled){
    if(!["incomingDown","smtpDown","m365Down"].includes(name)||typeof enabled!=="boolean")
      return response(false,"invalid_failure","Panne simulée inconnue.");
    state.failures[name]=enabled;event("mail.failureChanged",{name,enabled});
    return response(true,"updated","État du service modifié.");
  }
  function getSnapshot(){return clone(state);}
  return {validateAccount,send,receive,markRead,setFailure,getSnapshot,exportState:getSnapshot};
}
export const restoreMailEngine=(scenario,state)=>createMailEngine(scenario,state);

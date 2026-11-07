import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";

const demoCore = readFileSync("c2-lab/r2d3-v1/r2d3-core.js", "utf8");
const core = readFileSync("src/r2d3-core.js", "utf8");
assert.equal(demoCore, core, "Le démonstrateur doit embarquer le même moteur");
assert.deepEqual(
  JSON.parse(readFileSync("c2-lab/r2d3-v1/scenario.json", "utf8")),
  JSON.parse(readFileSync("scenarios/atelier-ipv4-v1.json", "utf8")),
  "Scénario du laboratoire différent"
);

const browser = await chromium.launch({headless:true});
let passed = 0;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", request => {
    if (!request.url().startsWith("http://127.0.0.1:8765/")) errors.push("Appel externe : " + request.url());
  });
  const response = await page.goto("http://127.0.0.1:8765/r2d3-v1/", {waitUntil:"networkidle"});
  assert.equal(response.status(), 200);
  await page.locator("#connectivity").getByText("Connectivité disponible", {exact:false}).waitFor();
  console.log("PASS 1 : chargement sans erreur et ping initial possible");passed++;

  await page.locator("#ping").click();
  assert.match(await page.locator("#terminal").innerText(), /simulation réussie/);
  console.log("PASS 2 : ping initial réussi");passed++;

  await page.locator("#wrong-ip").click();
  assert.equal(await page.locator("#address").inputValue(), "192.168.22.20");
  assert.match(await page.locator("#connectivity").innerText(), /Adressage IPv4 incompatible/);
  await page.locator("#ping").click();
  assert.match(await page.locator("#terminal").innerText(), /Échec/);
  console.log("PASS 3 : mauvaise IP et ping échoué");passed++;

  await page.locator("#toggle-wire").click();
  assert.match(await page.locator("#link-summary").innerText(), /débranché/);
  await page.locator("#fix-ip").click();
  assert.match(await page.locator("#connectivity").innerText(), /Liaison physique interrompue/);
  console.log("PASS 4 : deux anomalies cumulées, réparation IP seule insuffisante");passed++;

  await page.locator("#toggle-wire").click();
  assert.match(await page.locator("#connectivity").innerText(), /Connectivité disponible/);
  await page.locator("#ping").click();
  assert.match(await page.locator("#terminal").innerText(), /simulation réussie/);
  console.log("PASS 5 : réparation physique indépendante et ping rétabli");passed++;

  await page.locator("#wrong-ip").click();
  await page.reload({waitUntil:"networkidle"});
  await page.locator("#connectivity").getByText("Connectivité disponible", {exact:false}).waitFor();
  assert.equal(await page.locator("#address").inputValue(), "192.168.10.20");
  assert.match(await page.locator("#link-summary").innerText(), /branché/);
  console.log("PASS 6 : rechargement = état initial");passed++;

  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).length : null
  }));
  assert.equal(storage.local, 0);
  assert.equal(storage.session, 0);
  assert.equal(storage.databases, 0);
  console.log("PASS 7 : aucun stockage navigateur utilisé");passed++;
  assert.deepEqual(errors,[]);
  console.log("PASS 8 : aucune erreur JS ni requête externe");passed++;

  // Nouvelle page expérimentale : elle utilise le moteur V1 sans le modifier.
  assert.deepEqual(
    JSON.parse(readFileSync("c2-lab/r2d3-v1/experiment-scenario.json","utf8")),
    JSON.parse(readFileSync("scenarios/atelier-2pc-imprimante-exp.json","utf8")),
    "Le scénario expérimental GitHub Pages doit être identique au scénario de référence"
  );
  const xp=await browser.newPage();
  const xerrors=[];
  xp.on("pageerror",e=>xerrors.push(e.message));
  const xres=await xp.goto("http://127.0.0.1:8765/r2d3-v1/experiment.html",{waitUntil:"networkidle"});
  assert.equal(xres.status(),200);
  await xp.locator("#feedback").getByText("Scénario chargé.").waitFor();
  assert.match(await xp.locator("#connectivity").innerText(),/Communication possible/);
  console.log("PASS EXP-1 : scénario trois terminaux chargé");passed++;

  await xp.locator("#wrong-ip").click();
  await xp.locator("#source").selectOption("pc-02");
  await xp.locator("#target").selectOption("printer-01");
  assert.match(await xp.locator("#connectivity").innerText(),/Communication impossible/);
  await xp.locator("#ping").click();
  const failedPing=await xp.locator("#terminal").innerText();
  assert.match(failedPing,/Délai d.attente de la demande dépassé/);
  assert.equal((failedPing.match(/Délai d'attente de la demande dépassé/g)||[]).length,4);
  assert.match(failedPing,/envoyés = 4, reçus = 0, perdus = 4/);
  console.log("PASS EXP-2 : panne IP PC 2 et quatre échecs ping détectés");passed++;

  await xp.locator("#source").selectOption("pc-01");
  assert.match(await xp.locator("#connectivity").innerText(),/Communication possible/);
  await xp.locator("#ping").click();
  const successfulPing=await xp.locator("#terminal").innerText();
  assert.equal((successfulPing.match(/Réponse de 192\.168\.10\.50/g)||[]).length,4);
  assert.match(successfulPing,/envoyés = 4, reçus = 4, perdus = 0/);
  console.log("PASS EXP-3 : PC 1 fonctionnel et quatre réponses ping reçues");passed++;

  await xp.locator("#device").selectOption("pc-02");
  await xp.locator("#reset-ip").click();
  await xp.locator("#source").selectOption("pc-02");
  assert.match(await xp.locator("#connectivity").innerText(),/Communication possible/);
  console.log("PASS EXP-4 : restauration de l'IP de PC 2");passed++;

  await xp.locator("#cables button").nth(1).click();
  assert.match(await xp.locator("#connectivity").innerText(),/Communication impossible/);
  await xp.locator("#source").selectOption("pc-01");
  assert.match(await xp.locator("#connectivity").innerText(),/Communication possible/);
  console.log("PASS EXP-5 : débranchement du seul PC 2, PC 1 non affecté");passed++;

  await xp.locator("#console-pc").selectOption("pc-02");
  await xp.locator("#ipconfig").click();
  let iptext=await xp.locator("#windows-console").innerText();
  assert.match(iptext,/ipconfig\b/);
  assert.match(iptext,/Statut du média.*Média déconnecté/);
  await xp.locator("#cables button").nth(1).click();
  await xp.locator("#ipconfig-all").click();
  iptext=await xp.locator("#windows-console").innerText();
  assert.match(iptext,/ipconfig \/all/);
  assert.match(iptext,/192\.168\.10\.30/);
  assert.match(iptext,/255\.255\.255\.0/);
  assert.doesNotMatch(iptext,/Type de nœud|Routage IP|Proxy WINS|Carte Ethernet Ethernet|Adresse physique/);
  assert.match(iptext,/DHCP activé.*Non/);
  console.log("PASS EXP-6 : ipconfig et ipconfig /all du PC 2 cohérents");passed++;

  await xp.locator("#device").selectOption("pc-02");
  await xp.locator("#wrong-ip").click();
  assert.match(await xp.locator("#windows-console").innerText(),/192\.168\.22\.30/);
  await xp.locator("#console-pc").selectOption("pc-01");
  await xp.locator("#ipconfig").click();
  assert.match(await xp.locator("#windows-console").innerText(),/192\.168\.10\.20/);
  console.log("PASS EXP-7 : ipconfig suit les changements et le poste choisi");passed++;

  await xp.locator("#ping").click();
  assert.doesNotMatch(await xp.locator("#terminal").innerText(),/Simulation d'une commande ping Windows/);
  console.log("PASS EXP-8 : mention de simulation retirée du ping");passed++;

  // Nouveaux paramètres statiques : les DNS ne modifient pas un ping sur IP.
  await xp.locator("#device").selectOption("pc-01");
  await xp.locator("#gateway").fill("192.168.10.1");
  await xp.locator("#dns1").fill("192.168.10.10");
  await xp.locator("#dns2").fill("1.1.1.1");
  await xp.locator("#options-form button").click();
  assert.match(await xp.locator("#feedback").innerText(),/Modification appliquée/);
  await xp.locator("#console-pc").selectOption("pc-01");
  await xp.locator("#ipconfig-all").click();
  let optView=await xp.locator("#windows-console").innerText();
  assert.match(optView,/Passerelle.*192\.168\.10\.1/);
  assert.match(optView,/192\.168\.10\.10/);
  assert.match(optView,/1\.1\.1\.1/);
  await xp.locator("#source").selectOption("pc-01");
  assert.match(await xp.locator("#connectivity").innerText(),/Communication possible/);
  console.log("PASS EXP-12 : passerelle, DNS 1 et DNS 2 affichés sans affecter le ping LAN");passed++;

  await xp.locator("#dns1").fill("999.10.1.1");
  await xp.locator("#options-form button").click();
  assert.match(await xp.locator("#feedback").innerText(),/Opération refusée/);
  await xp.locator("#ipconfig-all").click();
  optView=await xp.locator("#windows-console").innerText();
  assert.match(optView,/192\.168\.10\.10/);
  assert.doesNotMatch(optView,/999\.10\.1\.1/);
  await xp.locator("#device").selectOption("pc-02");
  assert.equal(await xp.locator("#gateway").inputValue(),"");
  assert.equal(await xp.locator("#dns1").inputValue(),"");
  console.log("PASS EXP-13 : DNS impossible rejeté et paramètres propres à chaque PC");passed++;

  await xp.reload({waitUntil:"networkidle"});
  await xp.locator("#feedback").getByText("Scénario chargé.").waitFor();
  assert.equal(await xp.locator("#ip-pc2").innerText(),"192.168.10.30/24");
  await xp.locator("#source").selectOption("pc-02");
  assert.match(await xp.locator("#connectivity").innerText(),/Communication possible/);
  assert.deepEqual(xerrors,[]);
  console.log("PASS EXP-9 : rechargement restaure toutes les configurations");passed++;
  // Contrôle complémentaire sur une largeur de téléphone Android.
  const mobile=await browser.newPage({viewport:{width:360,height:740},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await mobile.goto("http://127.0.0.1:8765/r2d3-v1/experiment.html",{waitUntil:"networkidle"});
  await mobile.locator("#feedback").getByText("Scénario chargé.").waitFor();
  await mobile.locator("#ipconfig-all").click();
  const mobileText=await mobile.locator("#windows-console").innerText();
  assert.match(mobileText,/Nom de l'hôte \.+ : PC Windows/);
  assert.match(mobileText,/Adresse IPv4 \.+ : 192\.168\.10\.20/);
  assert.match(mobileText,/Masque de sous-réseau\s+: 255\.255\.255\.0/);
  assert.doesNotMatch(mobileText,/Masque de sous-réseau\s+\./,"Le libellé le plus long ne doit pas avoir de points");
  for(const unwanted of ["Type de nœud","Routage IP","Proxy WINS","Carte Ethernet Ethernet","Adresse physique"]) assert.ok(!mobileText.includes(unwanted),"Champ non validé : "+unwanted);
  const measures=await mobile.evaluate(()=>{
    const consoleElement=document.querySelector("#windows-console");
    return {pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
            consoleWidth:consoleElement.scrollWidth,consoleVisible:consoleElement.clientWidth};
  });
  assert.ok(measures.pageWidth<=measures.viewportWidth+1,"Débordement horizontal de la page sur mobile");
  assert.ok(measures.consoleWidth<=measures.consoleVisible+1,"Débordement horizontal de ipconfig sur mobile");
  console.log("PASS EXP-10 : ipconfig /all mobile compact sans défilement horizontal");passed++;

  // La maquette DHCP est distincte des machines en statique.
  await mobile.locator("#dhcp-preview").click();
  const dhcpText=await mobile.locator("#dhcp-example").innerText();
  assert.ok(dhcpText.includes("C:\\Users\\technicien>ipconfig /all"));
  assert.match(dhcpText,/DHCP activé.*Oui/);
  assert.match(dhcpText,/Passerelle par défaut\s*:\s*192\.168\.1\.1/);
  assert.match(dhcpText,/Serveur DHCP\s*\.+\s*:\s*192\.168\.1\.1/);
  assert.ok(dhcpText.includes("192.168.1.10"));
  assert.ok(dhcpText.includes("1.1.1.1"));
  assert.match(dhcpText,/Bail obtenu/);
  assert.match(dhcpText,/Bail expirant/);
  for(const discarded of ["Type de nœud","Routage IP","Proxy WINS","Carte Ethernet Ethernet"])assert.ok(!dhcpText.includes(discarded),discarded+" indésirable");
  assert.equal(await mobile.locator("#dhcp-preview").getAttribute("aria-expanded"),"true");
  console.log("PASS EXP-11 : maquette DHCP conforme au modèle validé");passed++;
  await mobile.close();
  // Nouvelle page DHCP : indépendante des ateliers IPv4 déjà validés.
  assert.deepEqual(
    JSON.parse(readFileSync("c2-lab/r2d3-v1/dhcp-scenario.json","utf8")),
    JSON.parse(readFileSync("scenarios/atelier-dhcp-v1.json","utf8"))
  );
  const dhcpPage=await browser.newPage({viewport:{width:390,height:844}});
  const dhcpErrors=[];
  dhcpPage.on("pageerror",e=>dhcpErrors.push(e.message));
  const dhcpResponse=await dhcpPage.goto("http://127.0.0.1:8765/r2d3-v1/dhcp.html",{waitUntil:"networkidle"});
  assert.equal(dhcpResponse.status(),200);
  await dhcpPage.locator("#feedback").getByText("Scénario chargé.").waitFor();
  await dhcpPage.locator("#request").click();
  assert.match(await dhcpPage.locator("#client-ip").innerText(),/192\.168\.10\.100/);
  await dhcpPage.locator("#ipconfig-all").click();
  const granted=await dhcpPage.locator("#console").innerText();
  for(const value of ["192.168.10.100","192.168.10.1","192.168.10.10","1.1.1.1","Bail obtenu","Bail expirant"])assert.ok(granted.includes(value),value);
  for(const unwanted of ["Type de nœud","Routage IP","Proxy WINS","Carte Ethernet Ethernet"])assert.ok(!granted.includes(unwanted),unwanted);
  await dhcpPage.locator("#ping").click();
  assert.match(await dhcpPage.locator("#ping-console").innerText(),/reçus = 4/);
  console.log("PASS DHCP-1 : attribution automatique, DNS, bail et ping Windows");passed++;

  await dhcpPage.locator("#toggle-server").click();
  await dhcpPage.locator("#request").click();
  assert.match(await dhcpPage.locator("#client-status").innerText(),/Bail valide conservé/);
  assert.match(await dhcpPage.locator("#client-ip").innerText(),/192\.168\.10\.100/);
  console.log("PASS DHCP-2 : conservation du bail après arrêt du serveur");passed++;

  await dhcpPage.locator("#release").click();
  assert.match(await dhcpPage.locator("#client-status").innerText(),/Adresse DHCP libérée/);
  assert.match(await dhcpPage.locator("#client-ip").innerText(),/Aucune adresse IPv4/);
  await dhcpPage.locator("#ipconfig-all").click();
  const releasedOutput=await dhcpPage.locator("#console").innerText();
  assert.match(releasedOutput,/Adresse IPv4.*Non attribuée/);
  assert.doesNotMatch(releasedOutput,/Bail obtenu|Bail expirant|192\.168\.10\.100/);
  await dhcpPage.locator("#request").click();
  assert.match(await dhcpPage.locator("#client-status").innerText(),/APIPA/);
  assert.match(await dhcpPage.locator("#client-ip").innerText(),/169\.254\.10\.20/);
  console.log("PASS DHCP-2B : release puis renew avec service arrêté donne APIPA");passed++;

  await dhcpPage.locator("#reset").click();
  await dhcpPage.locator("#toggle-cable").click();
  await dhcpPage.locator("#request").click();
  assert.match(await dhcpPage.locator("#client-status").innerText(),/APIPA/);
  assert.match(await dhcpPage.locator("#client-ip").innerText(),/169\.254\.10\.20/);
  await dhcpPage.locator("#ipconfig").click();
  assert.match(await dhcpPage.locator("#console").innerText(),/Adresse IPv4.*169\.254\.10\.20/);
  assert.match(await dhcpPage.locator("#console").innerText(),/255\.255\.0\.0/);
  await dhcpPage.locator("#ipconfig-all").click();
  assert.match(await dhcpPage.locator("#console").innerText(),/Adresse d'autoconfiguration IPv4.*169\.254\.10\.20/);
  const apipaOutput=await dhcpPage.locator("#console").innerText();
  for(const value of ["Description","Intel(R) Ethernet Controller (3) I225-V","Adresse physique","48-21-0B-5F-8C-90","Configuration automatique activée","Adresse d'autoconfiguration IPv4","169.254.10.20 (préféré)","255.255.0.0","NetBIOS sur Tcpip"])assert.ok(apipaOutput.includes(value),value);
  assert.doesNotMatch(apipaOutput,/\(APIPA\)|IPv4 autoconfiguration|Bail obtenu|Bail expirant/);

  assert.match(await dhcpPage.locator("#feedback").innerText(),/adresse APIPA attribuée/);
  await dhcpPage.locator("#ping").click();
  assert.match(await dhcpPage.locator("#ping-console").innerText(),/reçus = 0/);
  await dhcpPage.locator("#toggle-cable").click();
  await dhcpPage.locator("#request").click();
  assert.match(await dhcpPage.locator("#client-ip").innerText(),/192\.168\.10\.100/);
  assert.deepEqual(dhcpErrors,[]);
  console.log("PASS DHCP-3 : panne physique, APIPA puis nouveau bail");passed++;
  await dhcpPage.close();


  // Laboratoire multi-clients : scénario nouveau, sans changement de l'atelier à un PC.
  assert.deepEqual(
    JSON.parse(readFileSync("c2-lab/r2d3-v1/dhcp-deux-pc-scenario.json","utf8")),
    JSON.parse(readFileSync("scenarios/atelier-dhcp-deux-pc-v1.json","utf8")),
    "Scénario DHCP deux PC synchronisé"
  );
  const multi=await browser.newPage({viewport:{width:390,height:844}});
  const multiErrors=[];multi.on("pageerror",e=>multiErrors.push(e.message));
  const multiRes=await multi.goto("http://127.0.0.1:8765/r2d3-v1/dhcp-deux-pc.html",{waitUntil:"networkidle"});
  assert.equal(multiRes.status(),200);
  await multi.locator("#feedback").getByText("Scénario chargé.").waitFor();
  await multi.locator("#renew-pc-dhcp-01").click();
  await multi.locator("#renew-pc-dhcp-02").click();
  assert.match(await multi.locator("#ip-pc-dhcp-01").innerText(),/192\.168\.10\.100/);
  assert.match(await multi.locator("#ip-pc-dhcp-02").innerText(),/192\.168\.10\.101/);
  await multi.locator("#console-pc").selectOption("pc-dhcp-02");
  await multi.locator("#ipconfig-all").click();
  const multiConfig=await multi.locator("#console").innerText();
  assert.match(multiConfig,/REN-PC-02/);
  assert.match(multiConfig,/192\.168\.10\.101/);
  assert.match(multiConfig,/192\.168\.10\.10/);
  await multi.locator("#ping").click();
  assert.match(await multi.locator("#ping-console").innerText(),/reçus = 4/);
  console.log("PASS MULTI-01 : deux baux distincts, paramètres et ping du PC 2");passed++;

  await multi.locator("#wire-pc-dhcp-02").click();
  await multi.locator("#release-pc-dhcp-02").click();
  await multi.locator("#renew-pc-dhcp-02").click();
  assert.match(await multi.locator("#ip-pc-dhcp-02").innerText(),/169\.254\.10\.21/);
  await multi.locator("#ipconfig-all").click();
  assert.match(await multi.locator("#console").innerText(),/Adresse d'autoconfiguration IPv4.*169\.254\.10\.21/);
  assert.match(await multi.locator("#ip-pc-dhcp-01").innerText(),/192\.168\.10\.100/);
  await multi.locator("#console-pc").selectOption("pc-dhcp-01");
  await multi.locator("#ping").click();
  assert.match(await multi.locator("#ping-console").innerText(),/reçus = 4/);
  console.log("PASS MULTI-02 : PC 2 isolé et APIPA, PC 1 inchangé");passed++;

  await multi.locator("#wire-pc-dhcp-02").click();
  await multi.locator("#renew-pc-dhcp-02").click();
  assert.match(await multi.locator("#ip-pc-dhcp-02").innerText(),/192\.168\.10\.101/);
  assert.deepEqual(multiErrors,[]);
  console.log("PASS MULTI-03 : reconnexion, réattribution sans doublon, aucun problème JS");passed++;
  await multi.close();

  // Laboratoire 3 : paramétrage du serveur DHCP, exclusions et réservation MAC.
  assert.deepEqual(
    JSON.parse(readFileSync("c2-lab/r2d3-v1/dhcp-admin-scenario.json","utf8")),
    JSON.parse(readFileSync("scenarios/atelier-dhcp-admin-v1.json","utf8"))
  );
  const admin=await browser.newPage({viewport:{width:390,height:844}});
  const adminErrors=[];admin.on("pageerror",e=>adminErrors.push(e.message));
  const adminResp=await admin.goto("http://127.0.0.1:8765/r2d3-v1/dhcp-admin.html",{waitUntil:"networkidle"});
  assert.equal(adminResp.status(),200);
  await admin.locator("#feedback").getByText("Scénario chargé.").waitFor();
  await admin.locator("#pool-start").fill("192.168.10.100");
  await admin.locator("#pool-end").fill("192.168.10.110");
  await admin.locator("#exclusions").fill("192.168.10.100, 192.168.10.102");
  await admin.locator("#reservation").fill("192.168.10.105");
  await admin.locator("#save-pool").click();
  assert.match(await admin.locator("#pool-feedback").innerText(),/Configuration enregistrée/);
  await admin.locator("#renew-pc-dhcp-01").click();
  await admin.locator("#renew-pc-dhcp-02").click();
  assert.match(await admin.locator("#ip-pc-dhcp-01").innerText(),/192\.168\.10\.101/);
  assert.match(await admin.locator("#ip-pc-dhcp-02").innerText(),/192\.168\.10\.105/);
  await admin.locator("#console-pc").selectOption("pc-dhcp-02");
  await admin.locator("#ipconfig-all").click();
  assert.match(await admin.locator("#console").innerText(),/192\.168\.10\.105/);
  await admin.locator("#release-pc-dhcp-02").click();
  await admin.locator("#renew-pc-dhcp-02").click();
  assert.match(await admin.locator("#ip-pc-dhcp-02").innerText(),/192\.168\.10\.105/);
  await admin.locator("#reservation").fill("192.168.10.102");
  await admin.locator("#save-pool").click();
  assert.match(await admin.locator("#pool-feedback").innerText(),/Configuration refusée/);
  assert.match(await admin.locator("#ip-pc-dhcp-02").innerText(),/192\.168\.10\.105/);
  assert.deepEqual(adminErrors,[]);
  console.log("PASS ADMIN-01 : exclusions, réservation MAC, renouvellement et refus configuration invalide");passed++;
  await admin.close();

  console.log("SUCCÈS : " + passed + " essais navigateur réussis");
} finally {
  await browser.close();
}

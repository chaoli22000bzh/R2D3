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

// Tous les laboratoires affichant ipconfig réutilisent le même formateur Windows.
for(const name of ["experiment","dhcp","dhcp-deux-pc","dhcp-admin","conflit-ipv4","arp-windows"]){
  const script=readFileSync("c2-lab/r2d3-v1/"+name+".js","utf8");
  assert.match(script,/createWindowsFieldFormatter/,"Formateur absent dans "+name);
  assert.match(script,/shared-ui\/v1\/windows-fields\.js/,"Import partagé absent dans "+name);
  assert.match(script,/shared-ui\/v1\/ipconfig\.js/,"Composant ipconfig absent dans "+name);
  assert.match(script,/formatIpconfig\(/,"Appel au composant ipconfig absent dans "+name);
  if(name!=="arp-windows"){
    assert.ok(script.includes('../shared-ui/v1/ipconfig-all.js'),"Composant ipconfig /all absent dans "+name);
    assert.ok(script.includes("formatIpconfigAll("),"Appel au composant ipconfig /all absent dans "+name);
    assert.doesNotMatch(script,/const apipa=.*startsWith/,"Ancien rendu APIPA local restant dans "+name);
  }
}

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
  const sharedIpconfig=await page.evaluate(async()=>{
    const {formatIpconfig}=await import("../shared-ui/v1/ipconfig.js");
    return {
      standard:formatIpconfig({ipv4:{address:"192.168.10.20",prefix:24},gateway:"192.168.10.1"}),
      apipa:formatIpconfig({ipv4:{address:"169.254.10.20",prefix:16}}),
      absent:formatIpconfig({ipv4:{address:null,prefix:null}}),
      cable:formatIpconfig({ipv4:{address:"192.168.10.20",prefix:24},connected:false})
    };
  });
  assert.ok(sharedIpconfig.standard.startsWith("C:\\Users\\technicien>ipconfig"));
  assert.match(sharedIpconfig.standard,/Adresse IPv4\.+ : 192\.168\.10\.20/);
  assert.match(sharedIpconfig.standard,/Masque de sous-réseau : 255\.255\.255\.0/);
  assert.doesNotMatch(sharedIpconfig.standard,/Masque de sous-réseau\.+/);
  assert.match(sharedIpconfig.standard,/Passerelle par défaut : 192\.168\.10\.1/);
  assert.match(sharedIpconfig.apipa,/169\.254\.10\.20/);
  assert.match(sharedIpconfig.apipa,/255\.255\.0\.0/);
  assert.doesNotMatch(sharedIpconfig.absent,/null|undefined/);
  assert.match(sharedIpconfig.cable,/Média déconnecté/);
  assert.doesNotMatch(sharedIpconfig.standard,/DHCP activé|Bail obtenu|Nom de l'hôte/);
  console.log("PASS IPCONFIG-PARTAGE : même sortie Windows, IP fixe, APIPA, sans bail et câble débranché");passed++;

  const sharedAll=await page.evaluate(async()=>{
    const {formatIpconfigAll}=await import("../shared-ui/v1/ipconfig-all.js");
    const base={ipv4:{address:"192.168.10.20",prefix:24},hostname:"PC1",gateway:"192.168.10.1",dns:["192.168.10.10","1.1.1.1"]};
    return {
      staticIp:formatIpconfigAll(base),
      dhcp:formatIpconfigAll({...base,dhcp:true,ipv4:{...base.ipv4,lease:{serverId:"server-1"}},dhcpServer:"192.168.10.2",leaseStart:"06/11/2026 09:15",leaseEnd:"07/11/2026 09:15"}),
      apipa:formatIpconfigAll({...base,dhcp:true,ipv4:{address:"169.254.10.20",prefix:16}}),
      released:formatIpconfigAll({...base,dhcp:true,ipv4:{address:null,prefix:null}}),
      disconnected:formatIpconfigAll({...base,connected:false})
    };
  });
  assert.match(sharedAll.staticIp,/DHCP activé\.+ : Non/);
  assert.match(sharedAll.staticIp,/Adresse IPv4\.+ : 192\.168\.10\.20/);
  assert.doesNotMatch(sharedAll.staticIp,/Bail obtenu|Serveur DHCP/);
  assert.match(sharedAll.dhcp,/Serveur DHCP\.+ : 192\.168\.10\.2/);
  assert.match(sharedAll.dhcp,/Bail obtenu\.+ : 06\/11\/2026/);
  assert.match(sharedAll.apipa,/Adresse d'autoconfiguration IPv4\.* : 169\.254\.10\.20/);
  assert.doesNotMatch(sharedAll.apipa,/Bail obtenu|Serveur DHCP/);
  assert.match(sharedAll.released,/Non attribuée/);
  assert.match(sharedAll.disconnected,/Média déconnecté/);
  assert.doesNotMatch(sharedAll.staticIp,/Carte Ethernet Ethernet|Type de nœud|Routage IP|Proxy WINS/);
  console.log("PASS IPCONFIG-ALL-PARTAGE : fixe, DHCP, APIPA, bail libéré et média déconnecté");passed++;


  // Ressources communes : bouton tactile réellement réactif, ping en import partagé.
  assert.equal(await page.locator('link[href="../shared-ui/v1/buttons.css"]').count(),1);
  assert.equal(await page.locator('script[src="../shared-ui/v1/button-feedback.js"]').count(),1);
  const buttonBox=await page.locator("#ping").boundingBox();
  assert.ok(buttonBox,"bouton Ping visible");
  await page.mouse.move(buttonBox.x+buttonBox.width/2,buttonBox.y+buttonBox.height/2);
  await page.mouse.down();
  assert.equal(await page.locator("#ping").evaluate(el=>el.classList.contains("c2-pressed")),true);
  await page.mouse.up();
  await page.waitForTimeout(210);
  assert.equal(await page.locator("#ping").evaluate(el=>el.classList.contains("c2-pressed")),false);
  console.log("PASS UI-PARTAGEE : CSS et JS communs, appui puis relâchement visibles");passed++;


  await page.locator("#ping").click();
  await page.locator("#terminal").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await page.locator("#terminal").innerText(), /envoyés = 4, reçus = 4/);
  console.log("PASS 2 : ping initial réussi");passed++;

  await page.locator("#wrong-ip").click();
  assert.equal(await page.locator("#address").inputValue(), "192.168.22.20");
  assert.match(await page.locator("#connectivity").innerText(), /Adressage IPv4 incompatible/);
  await page.locator("#ping").click();
  await page.locator("#terminal").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await page.locator("#terminal").innerText(), /envoyés = 4, reçus = 0/);
  console.log("PASS 3 : mauvaise IP et ping échoué");passed++;

  await page.locator("#toggle-wire").click();
  assert.match(await page.locator("#link-summary").innerText(), /débranché/);
  await page.locator("#fix-ip").click();
  assert.match(await page.locator("#connectivity").innerText(), /Liaison physique interrompue/);
  console.log("PASS 4 : deux anomalies cumulées, réparation IP seule insuffisante");passed++;

  await page.locator("#toggle-wire").click();
  assert.match(await page.locator("#connectivity").innerText(), /Connectivité disponible/);
  await page.locator("#ping").click();
  await page.locator("#terminal").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await page.locator("#terminal").innerText(), /envoyés = 4, reçus = 4/);
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
  assert.doesNotMatch(await xp.locator("#terminal").innerText(),/Statistiques Ping/);
  await xp.locator("#terminal").getByText("Statistiques Ping",{exact:false}).waitFor();
  const failedPing=await xp.locator("#terminal").innerText();
  assert.match(failedPing,/Délai d.attente de la demande dépassé/);
  assert.equal((failedPing.match(/Délai d'attente de la demande dépassé/g)||[]).length,4);
  assert.match(failedPing,/envoyés = 4, reçus = 0, perdus = 4/);
  console.log("PASS EXP-2 : panne IP PC 2 et quatre échecs ping détectés");passed++;

  await xp.locator("#source").selectOption("pc-01");
  assert.match(await xp.locator("#connectivity").innerText(),/Communication possible/);
  await xp.locator("#ping").click();
  assert.match(await xp.locator("#terminal").innerText(),/ping 192\.168\.10\.50/);
  assert.doesNotMatch(await xp.locator("#terminal").innerText(),/Ping depuis|Simulation R2D3|Diagnostic :/);
  await xp.locator("#terminal").getByText("Statistiques Ping",{exact:false}).waitFor();
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
  assert.match(mobileText,/Nom de l'hôte\.+ : PC Windows/);
  assert.match(mobileText,/Adresse IPv4\.+ : 192\.168\.10\.20/);
   assert.match(mobileText,/Masque de sous-réseau\.+ : 255\.255\.255\.0/);
   assert.match(mobileText,/Configuration automatique activée : Oui/,"Le libellé le plus long ne comporte aucun point");
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
  assert.doesNotMatch(await dhcpPage.locator("#ping-console").innerText(),/Statistiques Ping/);
  await dhcpPage.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
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
  assert.doesNotMatch(await dhcpPage.locator("#ping-console").innerText(),/Statistiques Ping/);
  await dhcpPage.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
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
  assert.doesNotMatch(await multi.locator("#ping-console").innerText(),/Statistiques Ping/);
  await multi.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await multi.locator("#ping-console").innerText(),/reçus = 4/);
  console.log("PASS MULTI-01 : deux baux distincts, paramètres et ping du PC 2");passed++;
  // Règle partagée : nouveau ping = nouvelle sortie, et interruption si autre PC.
  await multi.locator("#ping").click();
  assert.match(await multi.locator("#ping-console").innerText(),/ping 192\.168\.10\.50/);
  assert.doesNotMatch(await multi.locator("#ping-console").innerText(),/Ping depuis|Simulation R2D3|Diagnostic :|REN-PC-02/);
  assert.doesNotMatch(await multi.locator("#ping-console").innerText(),/Statistiques Ping/);
  await multi.locator("#console-pc").selectOption("pc-dhcp-01");
  assert.equal((await multi.locator("#ping-console").innerText()).trim(),"");
  await multi.locator("#ping").click();
  assert.match(await multi.locator("#ping-console").innerText(),/ping 192\.168\.10\.50/);
  assert.doesNotMatch(await multi.locator("#ping-console").innerText(),/REN-PC-02/);
  await multi.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.equal((await multi.locator("#ping-console").innerText()).split("Réponse de 192.168.10.50").length-1,4);
  console.log("PASS PING-COMMUN : relance, source distincte et annulation du résultat antérieur");passed++;
  await multi.locator("#console-pc").selectOption("pc-dhcp-02");

  await multi.locator("#wire-pc-dhcp-02").click();
  await multi.locator("#release-pc-dhcp-02").click();
  await multi.locator("#renew-pc-dhcp-02").click();
  assert.match(await multi.locator("#ip-pc-dhcp-02").innerText(),/169\.254\.10\.21/);
  await multi.locator("#ipconfig-all").click();
  assert.match(await multi.locator("#console").innerText(),/Adresse d'autoconfiguration IPv4.*169\.254\.10\.21/);
  assert.match(await multi.locator("#ip-pc-dhcp-01").innerText(),/192\.168\.10\.100/);
  await multi.locator("#console-pc").selectOption("pc-dhcp-01");
  assert.equal((await multi.locator("#ping-console").innerText()).trim(),"");
  await multi.locator("#ping").click();
  assert.doesNotMatch(await multi.locator("#ping-console").innerText(),/Statistiques Ping/);
  await multi.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await multi.locator("#ping-console").innerText(),/reçus = 4/);
  // Nouvelle demande depuis PC 2 : une ancienne animation ne doit jamais continuer.
  await multi.locator("#console-pc").selectOption("pc-dhcp-02");
  await multi.locator("#ping").click();
  assert.match(await multi.locator("#ping-console").innerText(),/ping 192\.168\.10\.50/);
  assert.doesNotMatch(await multi.locator("#ping-console").innerText(),/Ping depuis|Simulation R2D3|Diagnostic :|REN-PC-02/);
  assert.doesNotMatch(await multi.locator("#ping-console").innerText(),/Statistiques Ping/);
  await multi.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
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

  // Quatrième laboratoire, conflit entre deux clients en configuration statique.
  assert.deepEqual(
    JSON.parse(readFileSync("c2-lab/r2d3-v1/conflit-ipv4-scenario.json","utf8")),
    JSON.parse(readFileSync("scenarios/atelier-conflit-ipv4-v1.json","utf8"))
  );
  const conflictPage=await browser.newPage({viewport:{width:390,height:844}});
  const conflictErrors=[];
  conflictPage.on("pageerror",e=>conflictErrors.push(e.message));
  const conflictResp=await conflictPage.goto("http://127.0.0.1:8765/r2d3-v1/conflit-ipv4.html",{waitUntil:"networkidle"});
  assert.equal(conflictResp.status(),200);
  await conflictPage.locator("#feedback").getByText("Scénario chargé.").waitFor();
  assert.equal(await conflictPage.locator("#diagnose").count(),0);
  await conflictPage.locator("#ping").click();
  assert.match(await conflictPage.locator("#ping-console").innerText(),/ping 192\.168\.10\.50/);
  assert.doesNotMatch(await conflictPage.locator("#ping-console").innerText(),/Statistiques Ping/);
  await conflictPage.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await conflictPage.locator("#ping-console").innerText(),/envoyés = 4, reçus = 0/);
  assert.doesNotMatch(await conflictPage.locator("#ping-console").innerText(),/Ping depuis|Simulation R2D3|Diagnostic :|REN-PC-01/);
  await conflictPage.locator("#console-pc").selectOption("pc-dhcp-02");
  await conflictPage.locator("#ipconfig-all").click();
  const conflictConfig=await conflictPage.locator("#console").innerText();
  assert.match(conflictConfig,/DHCP activé.*Non/);
  assert.match(conflictConfig,/192\.168\.10\.20/);
  await conflictPage.locator("#new-address").fill("192.168.10.21");
  await conflictPage.locator("#save-address").click();
  await conflictPage.locator("#ping").click();
  assert.match(await conflictPage.locator("#ping-console").innerText(),/ping 192\.168\.10\.50/);
  assert.doesNotMatch(await conflictPage.locator("#ping-console").innerText(),/Statistiques Ping/);
  await conflictPage.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await conflictPage.locator("#ping-console").innerText(),/reçus = 4/);
  assert.doesNotMatch(await conflictPage.locator("#ping-console").innerText(),/Ping depuis|Simulation R2D3|Diagnostic :|REN-PC-02/);
  await conflictPage.locator("#ping-peer").click();
  await conflictPage.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  assert.match(await conflictPage.locator("#ping-console").innerText(),/reçus = 4/);
  await conflictPage.locator("#new-address").fill("192.168.10.999");
  await conflictPage.locator("#save-address").click();
  assert.match(await conflictPage.locator("#feedback").innerText(),/Adresse refusée/);
  assert.match(await conflictPage.locator("#ip-pc-dhcp-02").innerText(),/192\.168\.10\.21/);
  assert.deepEqual(conflictErrors,[]);
  console.log("PASS CONFLIT-01 : détection, correction manuelle et refus d'IPv4 invalide");passed++;
  await conflictPage.close();

  // Laboratoire 5 : apprentissage ARP sur des postes Windows indépendants.
  assert.deepEqual(
    JSON.parse(readFileSync("c2-lab/r2d3-v1/arp-windows-scenario.json","utf8")),
    JSON.parse(readFileSync("scenarios/atelier-arp-windows-v1.json","utf8"))
  );
  // Les commandes ARP ne doivent pas reconstruire leur sortie dans un laboratoire.
  const arpScript=readFileSync("c2-lab/r2d3-v1/arp-windows.js","utf8");
  assert.ok(arpScript.includes('../shared-ui/v1/arp.js'));
  assert.ok(arpScript.includes("formatArpTable("));
  assert.ok(arpScript.includes("formatArpClear("));
  const sharedArp=await page.evaluate(async()=>{
    const {formatArpTable,formatArpClear}=await import("../shared-ui/v1/arp.js");
    return {
      empty:formatArpTable({interfaceAddress:"192.168.10.20",entries:[]}),
      filled:formatArpTable({interfaceAddress:"192.168.10.20",entries:[{address:"192.168.10.50",mac:"02-52-32-41-00-50",type:"dynamique"}]}),
      clear:formatArpClear(),
    };
  });
  assert.ok(sharedArp.empty.includes("Interface : 192.168.10.20"));
  assert.doesNotMatch(sharedArp.empty,/0x2|02-52-32-41-00-50/);
  assert.match(sharedArp.filled,/192\.168\.10\.50\s+02-52-32-41-00-50\s+dynamique/);
  assert.equal(sharedArp.clear,["C:\\Users\\technicien>arp -d *","","C:\\Users\\technicien>"].join("\n"));
  assert.doesNotMatch(sharedArp.clear,/succès|effacé|vidé|simulation/i);
  console.log("PASS ARP-PARTAGE : table vide/remplie et purge Windows sans message ajouté");passed++;

  const arpPage=await browser.newPage({viewport:{width:390,height:844}});
  const arpErrors=[];arpPage.on("pageerror",err=>arpErrors.push(err.message));
  const arpResp=await arpPage.goto("http://127.0.0.1:8765/r2d3-v1/arp-windows.html",{waitUntil:"networkidle"});
  assert.equal(arpResp.status(),200);
  await arpPage.locator("#feedback").getByText("Scénario chargé.").waitFor();
  assert.match(await arpPage.locator("body").innerText(),/PC1/);
  assert.match(await arpPage.locator("body").innerText(),/PC2/);
  assert.doesNotMatch(await arpPage.locator("body").innerText(),/REN-PC-0[12]/);
  await arpPage.locator("#ipconfig").click();
  const ipconfigOutput=await arpPage.locator("#console").innerText();
  assert.match(ipconfigOutput,/Masque de sous-réseau : 255\.255\.255\.0/);
  assert.doesNotMatch(ipconfigOutput,/Masque de sous-réseau\.+/);
  assert.match(ipconfigOutput,/Adresse IPv4\.+ : 192\.168\.10\.20/);
  await arpPage.locator("#arp-a").click();
  assert.doesNotMatch(await arpPage.locator("#console").innerText(),/02-52-32-41-00-50/);
  await arpPage.locator("#ping-printer").click();
  assert.doesNotMatch(await arpPage.locator("#ping-console").innerText(),/Statistiques Ping/);
  await arpPage.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  await arpPage.locator("#arp-a").click();
  assert.match(await arpPage.locator("#console").innerText(),/192\.168\.10\.50\s+02-52-32-41-00-50\s+dynamique/);
  await arpPage.locator("#console-pc").selectOption("pc-dhcp-02");
  await arpPage.locator("#arp-a").click();
  assert.doesNotMatch(await arpPage.locator("#console").innerText(),/02-52-32-41-00-50/);
  await arpPage.locator("#ping-peer").click();
  await arpPage.locator("#ping-console").getByText("Statistiques Ping",{exact:false}).waitFor();
  await arpPage.locator("#arp-a").click();
  assert.match(await arpPage.locator("#console").innerText(),/192\.168\.10\.20\s+02-52-32-41-00-01\s+dynamique/);
  await arpPage.locator("#arp-d").click();
  await arpPage.locator("#arp-a").click();
  assert.doesNotMatch(await arpPage.locator("#console").innerText(),/02-52-32-41-00-01/);
  await arpPage.locator("#console-pc").selectOption("pc-dhcp-01");
  await arpPage.locator("#arp-a").click();
  assert.match(await arpPage.locator("#console").innerText(),/02-52-32-41-00-50/);
  assert.deepEqual(arpErrors,[]);
  console.log("PASS ARP-01 : apprentissage, cache propre à chaque PC, purge et ping animé");passed++;
  await arpPage.close();

  // Le catalogue et la page d'essai utilisent les vrais composants partagés.
  const cataloguePage=await browser.newPage({viewport:{width:390,height:844}});
  const catalogueErrors=[];
  cataloguePage.on("pageerror",error=>catalogueErrors.push(error.message));
  const catalogueResponse=await cataloguePage.goto("http://127.0.0.1:8765/r2d3-v1/composants.html",{waitUntil:"networkidle"});
  assert.equal(catalogueResponse.status(),200);
  assert.match(await cataloguePage.locator("#ip-output").innerText(),/192\.168\.10\.20/);
  await cataloguePage.locator('#ip-modes button[data-mode="apipa"]').click();
  assert.match(await cataloguePage.locator("#ip-output").innerText(),/169\.254\.10\.20/);
  await cataloguePage.locator('#all-modes button[data-mode="dhcp"]').click();
  const allDemo=await cataloguePage.locator("#all-output").innerText();
  assert.match(allDemo,/Serveur DHCP.*192\.168\.10\.2/);
  assert.match(allDemo,/Bail obtenu/);
  await cataloguePage.locator("#arp-ping").click();
  assert.match(await cataloguePage.locator("#arp-output").innerText(),/02-52-32-41-00-50/);
  await cataloguePage.locator("#arp-d").click();
  assert.doesNotMatch(await cataloguePage.locator("#arp-output").innerText(),/02-52-32-41-00-50|succès|vidé/);
  await cataloguePage.locator("#arp-a").click();
  assert.doesNotMatch(await cataloguePage.locator("#arp-output").innerText(),/02-52-32-41-00-50/);
  assert.equal(await cataloguePage.locator("#documentation-heading").count(),1);
  assert.deepEqual(catalogueErrors,[]);
  await cataloguePage.close();
  console.log("PASS BANC-COMPOSANTS : 3 composants partagés testés sans catalogue documentaire local");passed++;

  console.log("SUCCÈS : " + passed + " essais navigateur réussis");
} finally {
  await browser.close();
}

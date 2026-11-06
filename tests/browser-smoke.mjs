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
  console.log("SUCCÈS : " + passed + " essais navigateur réussis");
} finally {
  await browser.close();
}

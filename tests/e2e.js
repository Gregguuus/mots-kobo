// Test de bout en bout : node tests/e2e.js <url avec #k=…> <dossier captures> <faux KoboReader.sqlite>
const { chromium } = require('playwright');
const [url, shots] = process.argv.slice(2);
const fail = m => { console.error('ÉCHEC : ' + m); process.exit(1); };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.speechSynthesis = { speak() {}, cancel() {} }; window.SpeechSynthesisUtterance = function (t) { this.text = t; }; });
  await page.goto(url);
  await page.waitForSelector('.game[data-g="cards"]');
  const tiles = await page.$$eval('.game', b => b.map(x => x.dataset.g));
  console.log('Tuiles :', tiles.join(', '));
  if (!tiles.includes('write') || !tiles.includes('stats')) fail('nouveaux jeux absents');
  await page.screenshot({ path: shots + '/1-accueil.png', fullPage: true });
  // La clé vue une fois suffit : sans #k= dans l'adresse, l'appli la retrouve et la remet dans l'adresse
  await page.goto(url.split('#')[0]); await page.waitForSelector('.game[data-g="cards"]');
  const h = await page.evaluate(() => location.hash); console.log('Adresse après ouverture sans clé :', h.slice(0, 8) + '…'); if (!h.startsWith('#k=')) fail('clé non remise dans l’adresse');

  // Révision du jour : 15 nouveaux mots max
  await page.click('.game[data-g="cards"]');
  const n = +(await page.textContent('.card small:last-of-type')).match(/\d+/)[0];
  console.log('Fiches du jour :', n); if (n !== 15) fail('15 fiches attendues');
  await page.keyboard.press(' ');
  await page.waitForSelector('.grade');
  const labels = await page.$$eval('.grade', b => b.map(x => x.innerText.replace(/\n/g, ' ')));
  console.log('Boutons :', labels.join(' | '));
  await page.screenshot({ path: shots + '/2-fiche.png', fullPage: true });
  await page.keyboard.press('3'); // Bien
  await page.keyboard.press(' '); await page.click('.grade.g1');    // Encore : le mot revient plus loin dans la file
  const left = +(await page.textContent('.card small:last-of-type')).match(/\d+/)[0];
  console.log('Fiches restantes :', left); if (left !== 14) fail('file de révision incorrecte');
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('motsKobo.v2prog')));
  const vals = Object.values(prog); console.log('Mémoire :', JSON.stringify(vals));
  if (!vals.some(p => p.s === 2 && p.reps === 1) || !vals.some(p => p.lapses === 1)) fail('planification incorrecte');

  // Écris-le : faute de frappe tolérée
  await page.click('#home'); await page.click('.game[data-g="write"]');
  const target = await page.evaluate(() => { const q = document.querySelector('.fr-q').textContent; return q; });
  const word = await page.evaluate(q => JSON.parse(localStorage.getItem('motsKobo.v2words')).find(w => w.i === q).w, target);
  await page.click('#hb');
  const typo = word.length > 4 ? word.slice(0, -1) : word;
  await page.fill('#in', typo); await page.press('#in', 'Enter');
  const verdict = await page.textContent('#vd'); console.log('Écris-le « ' + typo + ' » pour « ' + word + ' » →', verdict);
  if (!/Exact|Presque/.test(verdict)) fail('réponse correcte refusée');
  await page.screenshot({ path: shots + '/3-ecris-le.png', fullPage: true });

  // Dictée : mauvaise réponse 3 fois → solution
  await page.click('#home'); await page.click('.game[data-g="dict"]');
  const spoken = await page.evaluate(() => { const ws = JSON.parse(localStorage.getItem('motsKobo.v2words')); return ws.map(w => w.w); });
  for (let i = 0; i < 3; i++) { await page.fill('#in', 'zzzz'); await page.press('#in', 'Enter'); }
  const dv = await page.textContent('#vd'); console.log('Dictée →', dv); if (!/C’était/.test(dv)) fail('dictée');
  await page.screenshot({ path: shots + '/4-dictee.png', fullPage: true });

  // Progrès + sauvegarde aller-retour
  await page.click('#home'); await page.click('.game[data-g="stats"]');
  await page.waitForSelector('.heat i');
  await page.click('#cp');
  await page.waitForFunction(() => document.getElementById('cd').value.length > 10);
  const code = await page.inputValue('#cd'); console.log('Code de sauvegarde :', code.slice(0, 24) + '… (' + code.length + ' car.)');
  await page.screenshot({ path: shots + '/5-progres.png', fullPage: true });
  const before = await page.evaluate(() => localStorage.getItem('motsKobo.v2prog'));
  await page.evaluate(() => localStorage.setItem('motsKobo.v2prog', '{}'));
  await page.reload(); await page.waitForSelector('.game');
  await page.click('.game[data-g="stats"]'); await page.click('#im'); await page.fill('#cd', code); await page.click('#im');
  await page.waitForFunction(() => /fusionnée/.test(document.getElementById('bk')?.textContent || ''));
  const after = await page.evaluate(() => localStorage.getItem('motsKobo.v2prog'));
  console.log('Restauration :', before === after ? 'identique' : 'DIFFÉRENTE'); if (before !== after) fail('restauration');

  // Anciens jeux toujours là
  for (const g of ['flash', 'pairs', 'cloze', 'list']) { await page.click('#home'); await page.click(`.game[data-g="${g}"]`); await page.waitForTimeout(150); }
  await page.click('#home');
  // Mode sombre
  await page.emulateMedia({ colorScheme: 'dark' }); await page.click('.game[data-g="stats"]');
  await page.screenshot({ path: shots + '/6-progres-sombre.png', fullPage: true });
  if (errors.length) fail('erreurs JS : ' + errors.join(' / '));
  // Deux listes : anglais / français
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('#home');
  const langs = await page.$$eval('.langs button', b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
  console.log('Langues :', langs.join(' | ')); if (langs.length !== 2) fail('sélecteur de langue absent');
  await page.click('.langs button[data-l="fr"]');
  await page.click('.game[data-g="list"]');
  const frWords = await page.$$eval('details.item summary b', b => b.map(x => x.textContent));
  console.log('Mots français :', frWords.join(', '));
  if (frWords.length !== 6 || frWords.some(w => /^(to |the )/.test(w) || w === 'wistful')) fail('liste française incorrecte');
  await page.click('#home');
  await page.screenshot({ path: shots + '/7-accueil-francais.png', fullPage: true });
  await page.click('.langs button[data-l="en"]'); await page.click('.game[data-g="list"]');
  const enN = await page.$$eval('details.item', d => d.length); console.log('Mots anglais :', enN); if (enN !== 18) fail('liste anglaise');

  // Annotations : import d'un faux KoboReader.sqlite
  await page.click('#home'); await page.click('.game[data-g="notes"]');
  await page.waitForSelector('#intro:not([hidden])');
  await page.screenshot({ path: shots + '/8-annotations-accueil.png', fullPage: true });
  await page.setInputFiles('#file', process.argv[4]);
  await page.waitForSelector('#app:not([hidden]) .ann');
  const count = await page.textContent('#count'); console.log('Annotations :', count);
  if (!/^5 passages · 3 notes · 3 livres/.test(count)) fail('import des annotations');
  const titles = await page.$$eval('.book h2', h => h.map(x => x.firstChild.textContent)); console.log('Livres :', titles.join(' | '));
  if (!titles.includes('Les choses')) fail('titre déduit du fichier');
  await page.screenshot({ path: shots + '/9-annotations.png', fullPage: true });
  await page.click('#lang button[data-v="fr"]');
  const frCount = await page.textContent('#count'); console.log('Annotations en français :', frCount); if (!/^3 passages/.test(frCount)) fail('filtre langue');
  await page.click('#lang button[data-v="all"]');
  await page.fill('#q', 'evening'); const qc = await page.textContent('#count'); console.log('Recherche « evening » :', qc); if (!/^1 passage /.test(qc)) fail('recherche');
  await page.fill('#q', '');
  await page.reload(); await page.waitForSelector('#app:not([hidden]) .ann');
  console.log('Après rechargement :', await page.textContent('#count'));
  console.log('TOUS LES TESTS PASSENT');
  await browser.close();
})().catch(e => fail(e.message));

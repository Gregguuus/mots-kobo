// Test de bout en bout de l'appli (iPhone émulé) : node tests/ui.test.js <url de app.html avec #k=…> <dossier captures>
const { chromium } = require('playwright');
const [url, shots] = process.argv.slice(2);
const OPEN = '<' + '<', CLOSE = '>' + '>';
const fail = m => { console.error('ÉCHEC : ' + m); process.exit(1); };
const bad = s => /&amp;|&#|&lt;|\[object|undefined|NaN|\bnull\b|\{\}|\[\]/.test(s) || s.includes(OPEN) || s.includes(CLOSE);
(async () => {
  const b = await chromium.launch(), errs = [];
  async function page(scheme) {
    const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
    await p.addInitScript(() => { window.__spoken = []; const ss = { speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onstart && u.onstart(), 20); setTimeout(() => u.onend && u.onend(), 100); }, cancel() {}, getVoices() { return []; }, addEventListener() {} }; Object.defineProperty(window, 'speechSynthesis', { value: ss }); window.SpeechSynthesisUtterance = function (t) { this.text = t; }; });
    await p.route('https://api.mymemory.translated.net/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'bizarre' } }) }));
    await p.route('https://fr.wiktionary.org/w/api.php**', r => { const title = decodeURIComponent((r.request().url().match(/titles=([^&]+)/) || [])[1] || '');
      const ex = '\n== Français ==\n\n\n=== Étymologie ===\nDu latin.\n\n\n=== Nom commun ===\n\n' + title + ' \\a.b\\ masculin\n\nDéfinition de ' + title + ' pour le test.\nExemple. — (Auteur)\n\n\n=== Prononciation ===\n';
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ query: { pages: [{ title, extract: ex }] } }) }); });
    for (const h of ['api.github.com', 'api.dictionaryapi.dev']) await p.route('https://' + h + '/**', r => r.abort());
    return p;
  }
  const p = await page('light'), shot = n => p.screenshot({ path: shots + '/' + n + '.png' }), text = () => p.evaluate(() => document.body.innerText);

  // 1. sans clé : écran de connexion, puis collage du lien
  const base = url.split('#')[0], key = (url.match(/k=([\w-]+)/) || [])[1];
  await p.goto(base); await p.waitForSelector('.hello'); await shot('0-connexion');
  await p.fill('#lnk', 'n’importe quoi'); await p.click('[data-a="connect"]'); if (!/Je ne trouve pas la clé/.test(await text())) fail('message de clé manquante');
  await p.fill('#lnk', base + '#k=' + key); await p.click('[data-a="connect"]'); await p.waitForSelector('.hero');
  console.log('Connexion par lien : OK'); await p.waitForFunction(() => /Synchronisé/.test(document.querySelector('.syncline').innerText), null, { timeout: 15000 });
  console.log('Aujourd’hui :', (await p.textContent('.syncline')).trim());
  await p.waitForSelector('.seg [data-l="fr"]', { timeout: 15000 }); await shot('1-aujourdhui');
  console.log('Langues :', (await p.$$eval('.seg button', b => b.map(x => x.innerText.replace(/\s+/g, ' ')).slice(0, 2))).join(' | '));

  // 2. mots
  await p.click('.tab[data-t="words"]'); await p.waitForSelector('#wlist .row'); await p.fill('#wq', 'wist'); const n1 = (await p.$$('#wlist .row')).length; if (n1 !== 1) fail('recherche de mots : ' + n1); await p.fill('#wq', ''); await shot('2-mots');
  await p.click('#wlist .row'); await p.waitForSelector('.sheet.on'); await p.waitForTimeout(600); await shot('3-mot'); await p.click('.sheet.on [data-sp]'); await p.waitForTimeout(150);
  if (!(await p.evaluate(() => window.__spoken)).length) fail('le mot n’est pas prononcé'); await p.click('.sheet.on [data-sx]'); await p.waitForTimeout(500);

  // 3. annotations : texte lisible, aucun surlignage jaune, entités décodées
  await p.click('.tab[data-t="notes"]'); await p.waitForSelector('.nc');
  const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.nc .q')).backgroundColor); if (bg !== 'rgba(0, 0, 0, 0)') fail('le texte annoté a un fond : ' + bg);
  const body = await text(); if (!/Tom & Jerry 5 %/.test(body)) fail('entités HTML non décodées'); console.log('Annotations :', (await p.$$('.nc')).length, '· entités décodées');
  await p.fill('#nq', 'jerry'); if ((await p.$$('.nc')).length !== 1) fail('recherche d’annotations'); await p.fill('#nq', '&'); if (bad(await p.evaluate(() => document.querySelector('#nlist').innerText))) fail('recherche « & »'); await p.fill('#nq', '');
  await p.click('[data-k="kind"]'); const wn = (await p.$$('.nc')).length; if (wn !== 3) fail('filtre « avec note » : ' + wn); await p.click('[data-k="kind"]'); await shot('4-annotations');
  const order = await p.$$eval('.bt', h => h.map(x => x.firstChild.textContent)); console.log('Livres :', order.join(' | '));
  console.log('Bandeau :', /Annotations en retard/.test(await text()) ? 'affiché' : 'absent');

  // 4. progrès, réglages
  await p.click('.tab[data-t="progress"]'); await p.waitForSelector('.heat'); await shot('5-progres');
  await p.click('[data-a="settings"]'); await p.waitForSelector('.sheet.on'); await p.waitForTimeout(600); await shot('6-reglages');
  const href = await p.getAttribute('.sheet.on #rlink', 'href'); if (href !== 'rappels/1900.ics') fail('lien de rappel : ' + href);
  await p.selectOption('.sheet.on #rtime', '08:30'); if ((await p.getAttribute('.sheet.on #rlink', 'href')) !== 'rappels/0830.ics') fail('heure du rappel');
  await p.click('.sheet.on [data-s="test"]'); await p.waitForTimeout(250); await p.click('.sheet.on [data-sx]'); await p.waitForTimeout(500);

  // 5. révision et jeux, en anglais puis en français
  async function games(lang) {
    await p.click('.tab[data-t="today"]'); await p.click('.seg [data-l="' + lang + '"]'); await p.waitForTimeout(250);
    await p.click('[data-a="review"]'); await p.waitForSelector('#show'); await p.waitForTimeout(450); await shot('7-revision-' + lang); await p.keyboard.press(' '); await p.waitForSelector('.grade'); await p.waitForTimeout(650); await shot('8-verso-' + lang);
    const back = await p.evaluate(() => document.querySelector('.cover.on .face.back').innerText); if (bad(back)) fail('verso parasite : ' + back);
    const labels = await p.$$eval('.grade', b => b.map(x => x.innerText.replace(/\n/g, ' '))); if (labels.length !== 4) fail('boutons de note');
    await p.keyboard.press('3'); await p.waitForSelector('#show'); await p.click('.cover.on [data-x]'); await p.waitForTimeout(600);
    for (const g of ['flash', 'pairs', 'cloze', 'write', 'dict']) {
      if (lang === 'fr' && g === 'cloze') continue;
      await p.click('[data-g="' + g + '"]'); await p.waitForSelector('.cover.on .cover-body > *'); await p.waitForTimeout(600); if (lang === 'en') await shot('9-jeu-' + g);
      const t = await p.evaluate(() => document.querySelector('.cover.on').innerText); if (bad(t)) fail('texte parasite (' + g + ', ' + lang + ') : ' + t.slice(0, 120));
      if (g === 'dict') { if (!/Indice/.test(t)) fail('la dictée n’affiche pas d’indice'); await p.click('.cover.on [data-sp]'); await p.waitForTimeout(150); }
      if (g === 'write') { await p.fill('.cover.on #in', 'zzzzzz'); await p.press('.cover.on #in', 'Enter'); if (!/réessaie/.test(await p.textContent('.cover.on #vd'))) fail('mauvaise réponse non signalée'); }
      await p.click('.cover.on [data-x]'); await p.waitForTimeout(550);
    }
    console.log('Jeux en', lang === 'en' ? 'anglais' : 'français', ': OK');
  }
  await games('en'); await games('fr');
  const frw = await p.evaluate(() => window.__spoken.slice(-1)[0]); console.log('Dernier mot prononcé :', frw);

  // 6. aucun défilement horizontal, aucun texte parasite, mode sombre
  for (const t of ['words', 'notes', 'progress', 'today']) { await p.click('.tab[data-t="' + t + '"]'); await p.waitForTimeout(200); const s = await text(); const l = s.split('\n').filter(bad); if (l.length) fail('texte parasite : ' + l.slice(0, 3)); }
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) fail('défilement horizontal');
  const d = await page('dark'); await d.goto(url); await d.waitForSelector('.hero'); await d.click('.tab[data-t="notes"]'); await d.waitForSelector('.nc'); await d.screenshot({ path: shots + '/10-sombre.png' });
  const col = await d.evaluate(() => [getComputedStyle(document.querySelector('.nc')).backgroundColor, getComputedStyle(document.querySelector('.nc .q')).color]); console.log('Mode sombre : fond', col[0], '· texte', col[1]); if (col[1] === col[0]) fail('texte illisible en mode sombre');
  console.log('Erreurs JS :', errs.length ? errs : 'aucune'); if (errs.length) fail('erreurs JS');
  console.log('TOUS LES TESTS DE L’APPLI PASSENT'); await b.close();
})().catch(e => fail(e.message));

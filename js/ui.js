/* Mots Kobo : écrans, onglets, réglages. */
(() => {
'use strict';
const M = window.M, S = M.S, esc = M.esc, ico = M.ico, $ = M.$, V = M.voice, mean = M.mean;
const screen = $('#screen');
const TABS = [['today', 'Aujourd’hui', 'today'], ['words', 'Mots', 'words'], ['notes', 'Annotations', 'notes'], ['progress', 'Progrès', 'chart']];
const TITLES = { today: 'Aujourd’hui', words: 'Mots', notes: 'Annotations', progress: 'Progrès' };
const F = { q: '', lang: 'all', kind: 'all', book: '', wq: '' };
const UPDATE_CMD = 'curl -fsSL https://raw.githubusercontent.com/gregguuus/mots-kobo/main/kobo/update.sh | sh';
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
S.tab = (location.hash.match(/tab=(today|words|notes|progress)/) || [])[1] || ss.get('mk.tab') || 'today';

/* ---------- barre du haut et barre d'onglets ---------- */
function chrome() {
  document.body.insertAdjacentHTML('afterbegin',
    '<header class="navbar" id="navbar"><div class="navbar-in"><div class="nav-slot"><button class="icon-btn" data-a="sync" aria-label="Synchroniser" id="navsync">' + ico('refresh') + '</button></div><div class="nav-title" id="navtitle"></div><div class="nav-slot"><button class="icon-btn" data-a="settings" aria-label="Réglages">' + ico('sliders') + '</button></div></div></header>');
  document.body.insertAdjacentHTML('beforeend', '<nav class="tabbar" id="tabbar" aria-label="Navigation"><div class="tabbar-in">' +
    TABS.map(([id, label, ic]) => '<button class="tab" data-a="tab" data-t="' + id + '" role="tab" aria-selected="false">' + ico(ic) + '<span>' + label + '</span></button>').join('') + '</div></nav>');
  window.addEventListener('scroll', () => $('#navbar').classList.toggle('on', window.scrollY > 36), { passive: true });
}

/* ---------- petits composants ---------- */
function syncLine() {
  const y = S.sync, n = M.counts(); let cls = '', txt;
  if (y.busy) { cls = 'busy'; txt = 'Synchronisation…'; }
  else if (S.keyState === 'bad') { cls = 'warn'; txt = 'Clé refusée : scanne à nouveau le QR code de ta Kobo'; }
  else if (y.wordsErr) { cls = 'warn'; txt = 'Hors connexion · données ' + (y.words ? 'du ' + M.fmtDate(y.words) : 'enregistrées sur l’appareil'); }
  else if (!y.checked) { cls = 'busy'; txt = 'Synchronisation…'; }
  else txt = 'Synchronisé ' + M.ago(y.checked) + ' · ' + (n.en + n.fr) + ' mots · ' + S.notes.length + ' annotations';
  return '<button class="syncline ' + cls + '" data-a="sync"><span class="dot"></span><span>' + esc(txt) + '</span></button>';
}
const segLang = () => { const n = M.counts(); return n.en && n.fr ? '<div class="seg" role="group" aria-label="Langue des mots"><button data-a="lang" data-l="en" aria-pressed="' + (S.lang === 'en') + '">Anglais<small>' + n.en + '</small></button><button data-a="lang" data-l="fr" aria-pressed="' + (S.lang === 'fr') + '">Français<small>' + n.fr + '</small></button></div>' : ''; };
const dots = p => '<span class="dots" title="Niveau ' + M.lvl(p) + ' sur 6">' + [1, 2, 3, 4, 5, 6].map(i => '<i class="' + (i <= M.lvl(p) ? 'on' : '') + '"></i>').join('') + '</span>';
const row = (o) => '<' + (o.a ? 'button' : 'div') + ' class="row' + (o.ic ? ' ic' : '') + '"' + (o.a ? ' data-a="' + o.a + '"' + (o.d ? ' ' + o.d : '') : '') + '>' +
  (o.ic ? '<span class="ic-sq bg-' + o.bg + '">' + ico(o.ic) + '</span>' : '') + '<span class="row-main"><span class="t">' + o.t + '</span>' + (o.s ? '<span class="s" style="display:block">' + o.s + '</span>' : '') + '</span>' +
  '<span class="row-trail">' + (o.r || '') + (o.a && !o.noChev ? '<span class="chev">' + ico('chev') + '</span>' : '') + '</span></' + (o.a ? 'button' : 'div') + '>';

/* ---------- connexion (aucune clé) ---------- */
function viewHello() {
  const bad = S.keyState === 'bad';
  return '<div class="hello"><img class="logo" src="icon-app-180.png" alt=""><h1>Mots Kobo</h1>' +
    '<p>' + (bad ? 'La clé enregistrée ne correspond plus aux mots envoyés par ta Kobo. Scanne de nouveau son QR code, ou colle le lien ci-dessous.' : 'Retrouve les mots et les passages surlignés de ta Kobo, et révise-les chaque jour.') + '</p>' +
    '<ol class="steps"><li>Sur ta Kobo : <b>Outils › Mots Kobo › Ouvrir l’appli sur mon téléphone</b>.</li><li>Scanne le QR code avec l’appareil photo de ton iPhone.</li><li>Ou colle ici le lien reçu (il se termine par <b>#k=…</b>) :</li></ol>' +
    '<input class="field" id="lnk" placeholder="https://…#k=…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Lien de ton appli"><p class="tip warn" id="lnkerr" aria-live="polite"></p>' +
    '<button class="btn" data-a="connect">Se connecter</button></div>';
}

/* ---------- Aujourd'hui ---------- */
function viewToday() {
  const q = M.dueQueue(), n = q.length, xp = S.st.xp, l = M.level(xp), a = M.lvlXP(l), b = M.lvlXP(l + 1), dt = S.st.days[M.today()] || 0, st = M.streak(), pend = M.counts().pending;
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), C = 2 * Math.PI * 46, g = Math.min(dt / M.GOAL, 1);
  const rec = k => S.st.best[k] ? '<span>' + (k === 'pairs' ? S.st.best[k] + ' s' : S.st.best[k] + ' pts') + '</span>' : '';
  const next = M.nextDue();
  return '<div class="lt"><h1>Aujourd’hui</h1><p class="sub">' + esc(date.charAt(0).toUpperCase() + date.slice(1)) + '</p></div>' + syncLine() +
    '<div class="stack" style="margin-top:14px">' + segLang() +
    (S.words.length ? (n ?
      '<section class="hero"><div class="k">Révision du jour</div><div class="n">' + n + '<small>mot' + (n > 1 ? 's' : '') + '</small></div><p>Tes mots reviennent juste avant que tu les oublies. Quelques minutes suffisent.</p><button class="btn white" data-a="review">Commencer</button></section>' :
      '<section class="hero done"><div class="k">Révision du jour</div><div class="n">À jour</div><p>' + (next ? 'Prochaine révision ' + M.nextText(next) + '.' : 'Bravo, tout est revu.') + '</p><button class="btn white" data-a="more" style="color:#0a8a4a">Revoir 10 mots de plus</button></section>') :
      '<section class="empty card"><span>' + ico('book') + '</span><h2>Aucun mot pour l’instant</h2><p>Surligne des mots sur ta Kobo : ils apparaissent ici dès qu’elle se connecte au Wi-Fi.</p></section>') +
    memoCard() +
    '<section class="stats3"><div class="ring"><svg viewBox="0 0 112 112" aria-hidden="true"><circle cx="56" cy="56" r="46" fill="none" stroke="var(--fill)" stroke-width="12"/><circle cx="56" cy="56" r="46" fill="none" stroke="var(--green)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (C * g) + ' ' + C + '"/></svg><div class="mid"><b>' + Math.min(dt, M.GOAL) + '</b><span>/ ' + M.GOAL + ' XP</span></div></div>' +
    '<div class="col"><div class="stat"><span class="i" style="color:var(--orange)">' + ico('flame') + '</span><div><div class="v">' + st + '</div><div class="l">jour' + (st > 1 ? 's' : '') + ' de suite</div></div></div>' +
    '<div class="stat"><span class="i" style="color:var(--indigo)">' + ico('bolt') + '</span><div><div class="v">Niveau ' + l + '</div><div class="l">' + (b - xp) + ' XP avant le suivant</div></div></div></div></section></div>' +
    '<h2 class="gt">S’entraîner</h2><div class="group">' +
    row({ ic: 'bolt', bg: 'orange', t: 'Défi éclair', s: '60 secondes, un maximum de bonnes réponses', r: rec('flash'), a: 'game', d: 'data-g="flash"' }) +
    row({ ic: 'pairs', bg: 'purple', t: 'Paires', s: 'Associe 5 mots à leur sens', r: rec('pairs'), a: 'game', d: 'data-g="pairs"' }) +
    row({ ic: 'blank', bg: 'teal', t: 'Phrase à trous', s: 'Retrouve le mot dans la phrase du livre', a: 'game', d: 'data-g="cloze"' }) +
    row({ ic: 'pencil', bg: 'green', t: 'Écris-le', s: 'Retrouve le mot et écris-le', a: 'game', d: 'data-g="write"' }) +
    row({ ic: 'wave', bg: 'blue', t: 'Dictée', s: 'Écoute le mot et écris-le', a: 'game', d: 'data-g="dict"' }) + '</div>' +
    '<h2 class="gt">Rappel</h2><div class="group">' + row({ ic: 'bell', bg: 'red', t: 'Rappel quotidien', s: S.set.rappels ? 'Ajouté à l’app Rappels' : 'Une notification chaque jour pour t’entraîner', a: 'remind' }) + '</div>' +
    (pend ? '<p class="gf">' + pend + ' mot' + (pend > 1 ? 's attendent' : ' attend') + ' leur traduction ou définition et ' + (pend > 1 ? 'rejoindront' : 'rejoindra') + ' les jeux dès qu’elle arrive.</p>' : '');
}

/* ---------- Mots ---------- */
function wordRows() {
  const q = F.wq.toLowerCase(), all = S.all.filter(w => w._l === S.lang && (!q || (w.w + ' ' + mean(w) + ' ' + w.t.map(t => t[1]).join(' ')).toLowerCase().includes(q)));
  if (!all.length) return '<div class="empty"><span>' + ico('search') + '</span><h2>' + (q ? 'Aucun résultat' : 'Aucun mot') + '</h2><p>' + (q ? 'Essaie un autre mot.' : 'Les mots que tu surlignes sur ta Kobo arrivent ici.') + '</p></div>';
  all.sort((a, b) => String(b.d).localeCompare(String(a.d)) || a.w.localeCompare(b.w));
  const groups = []; for (const w of all) { const g = groups[groups.length - 1]; if (g && g.d === w.d) g.items.push(w); else groups.push({ d: w.d, items: [w] }); }
  return groups.map(g => '<h2 class="gt">' + esc(M.fmtDay(g.d) || 'Sans date') + '</h2><div class="group">' + g.items.map(w => row({ a: 'word', d: 'data-i="' + S.all.indexOf(w) + '"',
    t: '<span class="word-t">' + esc(w.w) + '</span>', s: M.known(w) ? esc(mean(w)) : w.none ? '<span style="color:var(--label2)">Définition introuvable</span>' : '<span style="color:var(--orange)">' + (w.derived ? 'Définition' : 'Traduction') + ' en attente</span>', r: M.known(w) ? dots(M.P(w)) : '' })).join('') + '</div>').join('');
}
function viewWords() {
  const n = M.counts();
  return '<div class="lt"><h1>Mots</h1><p class="sub">' + (n.en + n.fr + n.pending) + ' mots de tes livres</p></div><div class="stack" style="margin-top:8px"><div class="search">' + ico('search') + '<input id="wq" type="search" placeholder="Rechercher" value="' + esc(F.wq) + '" aria-label="Rechercher un mot" autocomplete="off" autocapitalize="off"></div>' + segLang() + '</div><div id="wlist">' + wordRows() + '</div>';
}
function openWord(i) {
  const w = S.all[i]; if (!w) return; const p = M.P(w);
  V.prep(w);
  sheet(w.w, () => '<div class="card center" style="padding:22px 16px"><p style="font:700 38px/1.1 var(--serif);margin:0;word-break:break-word">' + esc(w.w) + '</p><div style="margin:12px 0 4px;display:flex;justify-content:center"><button class="speak" data-sp aria-label="Écouter">' + ico('speaker') + '<span class="wave"><i></i><i></i><i></i><i></i></span></button></div>' +
    '<p style="font:600 ' + (w.derived ? '19' : '22') + 'px/1.3 var(--sans);margin:10px 0 0">' + (M.known(w) ? esc(mean(w)) : '<span style="color:var(--orange)">' + (w.none ? 'Définition introuvable' : 'En attente') + '</span>') + '</p>' + (w.auto ? '<p style="margin:6px 0 0"><span class="pill o">' + (w.derived ? 'définition du Wiktionnaire' : 'traduction automatique') + '</span></p>' : '') + '</div>' +
    (w.t.length ? '<div class="group">' + w.t.map(t => row({ t: esc(t[1]), r: '<span style="font-size:13px;text-transform:uppercase">' + esc(t[0]) + '</span>' })).join('') + '</div>' : '') +
    (M.ctxPlain(w.c) ? '<div class="card"><p style="font:400 19px/1.55 var(--serif);margin:0" class="ctxw">' + M.ctxHTML(w.c) + '</p></div>' : '') +
    '<div class="group">' + row({ t: 'Livre', r: esc(w.b) }) + row({ t: 'Ajouté', r: esc(M.fmtDay(w.d)) }) + row({ t: 'Mémoire', r: p.reps ? dots(p) : 'Pas encore révisé' }) +
    (p.reps ? row({ t: 'Prochaine révision', r: p.due <= Date.now() ? 'Maintenant' : esc(M.nextText(p.due).replace(/^dans /, 'dans ').replace(/^le /, 'le '))}) + row({ t: 'Oublis', r: String(p.lapses) }) : '') + '</div>',
    root => { const b = root.querySelector('[data-sp]'); b.onclick = () => V.play(w, { start: () => b.classList.add('on'), end: () => b.classList.remove('on'), fail: r => { b.classList.remove('on'); M.toast(r === 'unsupported' ? 'Le son n’est pas disponible ici' : 'Aucun son : vérifie le mode silencieux et le volume'); } }); });
}

/* ---------- Annotations ---------- */
function notesFiltered() {
  const q = F.q.toLowerCase();
  return S.notes.filter(x => (F.lang === 'all' || x.l === F.lang) && (F.kind === 'all' || x.n) && (!F.book || x.b === F.book) && (!q || (x.t + ' ' + x.n + ' ' + x.b + ' ' + x.a).toLowerCase().includes(q)))
    .sort((a, b) => a.b.localeCompare(b.b, 'fr') || (a.ch != null && b.ch != null ? a.ch - b.ch || a.p - b.p : 0) || String(a.d).localeCompare(String(b.d)));
}
function hl(text, q) {
  if (!q) return esc(text); const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return text.split(re).map((p, i) => i % 2 ? '<u>' + esc(p) + '</u>' : esc(p)).join('');
}
const BOOKC = [0, 1, 2, 3];
function notesList() {
  const r = notesFiltered(); if (!r.length) return '<div class="empty"><span>' + ico('search') + '</span><h2>Aucune annotation</h2><p>Aucun passage ne correspond à ces filtres.</p></div>';
  const groups = []; for (const x of r) { let g = groups[groups.length - 1]; if (!g || g.b !== x.b) groups.push(g = { b: x.b, a: x.a, items: [] }); g.items.push(x); }
  return groups.map(g => '<h2 class="bt" data-a="book" data-b="' + esc(g.b) + '">' + esc(g.b) + '<small>' + esc(g.a) + (g.a ? ' · ' : '') + g.items.length + ' passage' + (g.items.length > 1 ? 's' : '') + '</small></h2>' +
    g.items.map(x => '<article class="nc"><span class="bar c' + (BOOKC.includes(x.c) ? x.c : 0) + '"></span>' + (x.t ? '<p class="q">' + hl(x.t, F.q) + '</p>' : '') +
      (x.n ? '<div class="nn"><b>Ma note</b><p>' + hl(x.n, F.q) + '</p></div>' : '') +
      '<footer><span>' + esc(M.fmtDate(x.d)) + '</span><span class="acts"><button class="icon-btn" data-a="ncopy" data-id="' + esc(x.id) + '" aria-label="Copier">' + ico('copy') + '</button><button class="icon-btn" data-a="nshare" data-id="' + esc(x.id) + '" aria-label="Partager">' + ico('share') + '</button></span></footer></article>').join('')).join('');
}
function notesBanner() {
  const nUp = M.parseT(S.sync.notes), wUp = M.parseT(S.sync.words), v = S.sync.kobo && S.sync.kobo.v;
  if (!nUp) return '';
  const gap = wUp ? wUp - nUp : 0;
  if ((!v || v < 2) && gap > 6 * 36e5) return '<div class="banner"><span>' + ico('refresh') + '</span><div><b>Annotations en retard.</b> Tes mots sont arrivés ' + M.ago(wUp) + ', tes annotations ' + M.ago(nUp) + '. Le programme de ta Kobo est une ancienne version.<br><button class="btn sm tint" data-a="settings" data-s="sync" style="margin-top:8px">Voir comment le mettre à jour</button></div></div>';
  if (v >= 2 && gap > 12 * 36e5) return '<div class="banner"><span>' + ico('refresh') + '</span><div><b>Annotations en retard.</b> Ta Kobo n’a pas donné signe de vie depuis ' + M.ago(nUp) + '. Allume son Wi-Fi quelques instants : elle les envoie à chaque connexion.</div></div>';
  return '';
}
function notesSync() {
  const nUp = M.parseT(S.sync.notes), v = S.sync.kobo && S.sync.kobo.v;
  if (S.sync.busy) return '<p class="syncline busy"><span class="dot"></span><span>Synchronisation…</span></p>';
  return nUp ? '<button class="syncline" data-a="sync"><span class="dot"></span><span>Reçues de ta Kobo ' + M.ago(nUp) + (v ? ' · programme v' + v : '') + '</span></button>' : '';
}
function viewNotes() {
  const books = [...new Set(S.notes.filter(x => F.lang === 'all' || x.l === F.lang).map(x => x.b))].sort((a, b) => a.localeCompare(b, 'fr'));
  if (F.book && !books.includes(F.book)) F.book = '';
  const nb = new Set(S.notes.map(x => x.b)).size, withNote = S.notes.filter(x => x.n).length;
  const head = '<div class="lt"><h1>Annotations</h1><p class="sub">' + (S.notes.length ? S.notes.length + ' passages · ' + withNote + ' note' + (withNote > 1 ? 's' : '') + ' · ' + nb + ' livre' + (nb > 1 ? 's' : '') : 'Tes passages surlignés et tes notes') + '</p></div>';
  if (!S.notes.length) return head + notesSync() + '<div class="empty"><span>' + ico('notes') + '</span><h2>Aucune annotation reçue</h2><p>' + (S.sync.busy ? 'Recherche en cours…' : 'Ta Kobo les envoie quand son Wi-Fi est allumé. Tu peux aussi importer le fichier de la liseuse.') + '</p><button class="btn sm tint" data-a="settings" data-s="sync">Réglages de synchronisation</button></div>';
  return head + '<div class="stack" style="margin-top:8px"><div class="search">' + ico('search') + '<input id="nq" type="search" placeholder="Rechercher" value="' + esc(F.q) + '" aria-label="Rechercher" autocomplete="off" autocapitalize="off"></div>' +
    '<div class="chips"><button class="chip" data-a="nf" data-k="lang" data-v="all" aria-pressed="' + (F.lang === 'all') + '">Toutes</button><button class="chip" data-a="nf" data-k="lang" data-v="en" aria-pressed="' + (F.lang === 'en') + '">Anglais</button><button class="chip" data-a="nf" data-k="lang" data-v="fr" aria-pressed="' + (F.lang === 'fr') + '">Français</button>' +
    '<button class="chip" data-a="nf" data-k="kind" data-v="' + (F.kind === 'note' ? 'all' : 'note') + '" aria-pressed="' + (F.kind === 'note') + '">Avec note</button>' +
    '<label class="chip" aria-label="Livre">' + ico('book') + '<select id="nbook"><option value="">Tous les livres</option>' + books.map(b => '<option value="' + esc(b) + '"' + (b === F.book ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>' + ico('down') + '</label></div>' + notesBanner() + notesSync() + '</div>' +
    '<div id="nlist">' + notesList() + '</div>' +
    '<h2 class="gt">Exporter</h2><div class="group">' + row({ ic: 'copy', bg: 'blue', t: 'Copier en Markdown', s: 'Pour Notes, Notion, Obsidian…', a: 'nexport', d: 'data-m="copy"' }) + row({ ic: 'share', bg: 'green', t: 'Partager', a: 'nexport', d: 'data-m="share"' }) + '</div>';
}
const mdOf = list => { let md = '# Mes annotations Kobo\n\n', cur = ''; for (const x of list) { if (x.b !== cur) { cur = x.b; md += '## ' + x.b + (x.a ? ' · ' + x.a : '') + '\n\n'; }
  if (x.t) md += x.t.split('\n').map(l => '> ' + l).join('\n') + '\n\n'; if (x.n) md += '**Ma note :** ' + x.n + '\n\n'; md += '_' + M.fmtDate(x.d) + '_\n\n'; } return md; };
const textOf = x => '« ' + x.t + ' »' + (x.n ? '\n' + x.n : '') + '\n— ' + x.b + (x.a ? ', ' + x.a : '');
async function copyOrShare(text, how) {
  if (how === 'share' && navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); M.toast('Copié'); } catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); M.toast('Copié'); } catch (e2) { M.toast('Copie impossible'); } t.remove(); }
}

/* ---------- Souvenir du jour, lecture, fiche livre ---------- */
const clip = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
function memoCard() {
  const ps = M.passages(); if (!ps.length) return '';
  const q = M.passQueue(), nx = M.nextPass();
  if (!q.length) return '<section class="memo"><div class="k">Souvenirs</div><p class="mb" style="font-size:15px">Tous tes passages sont relus pour aujourd’hui' + (nx ? '. Prochaine relecture ' + M.nextText(nx) : '') + '.</p></section>';
  const n = q[0], t = M.parseT(n.d);
  return '<section class="memo"><div class="k">Souvenir du jour</div><p class="mq">' + esc(clip(n.t, 220)) + '</p><div class="mb">' + esc(n.b) + (t ? ' · surligné ' + esc(M.ago(t)) : '') + '</div><button class="btn tint" data-a="passages">Relire ' + q.length + ' passage' + (q.length > 1 ? 's' : '') + '</button></section>';
}
function readingCards() {
  const R = S.reading, B = S.books; if (!R && !B.length) return ''; let h = '';
  if (R) {
    const days = R.days, now = new Date(), key = i => { const d = new Date(now); d.setDate(d.getDate() - i); return M.ymd(d); };
    const today = days[M.today()] || 0, week = [...Array(7)].map((_, i) => days[key(i)] || 0).reduce((a, b) => a + b, 0);
    const bars = [...Array(30)].map((_, i) => days[key(29 - i)] || 0), max = Math.max(1, ...bars), st = M.readStreak(), any = Object.keys(days).length > 0;
    h += '<section class="card"><h3>Lecture</h3><div class="kpis"><div class="kpi"><b>' + M.dur(today) + '</b><small>aujourd’hui</small></div><div class="kpi"><b>' + M.dur(week) + '</b><small>7 derniers jours</small></div><div class="kpi"><b>' + st + '</b><small>jour' + (st > 1 ? 's' : '') + ' de suite</small></div></div>' +
      (any ? '<div class="bars30" style="margin-top:14px" role="img" aria-label="Temps de lecture des 30 derniers jours">' + bars.map(s => '<i class="' + (s ? '' : 'z') + '" style="height:' + Math.max(3, s / max * 90) + 'px" title="' + M.dur(s) + '"></i>').join('') + '</div><div class="axis"><span>il y a 30 jours</span><span>aujourd’hui</span></div>' :
        '<p class="sub" style="margin-top:10px;font-size:14px">Le temps de lecture par jour se remplit à partir de maintenant : ta Kobo le mesure toutes les minutes' + (R.since ? ' (depuis le ' + esc(M.fmtDay(R.since)) + ')' : '') + '.</p>') + '</section>';
  }
  const cur = B.filter(b => b.s === 1 || (b.s !== 2 && b.p > 0 && b.p < 100)).slice(0, 6), done = B.filter(b => b.s === 2).length;
  if (cur.length || done) h += '<section class="card"><h3>Livres</h3>' + cur.map(b => { const left = M.timeLeft(b);
    return '<button class="bookrow" data-a="book" data-b="' + esc(b.t) + '"><div class="t">' + esc(b.t) + '</div><div class="minibar" style="margin:6px 0 4px"><i style="width:' + Math.min(100, b.p) + '%"></i></div><div class="s">' + Math.round(b.p) + ' %' + (b.sp ? ' · ' + M.dur(b.sp) + ' lues' : '') + (left ? ' · environ ' + M.dur(left) + ' restantes' : '') + '</div></button>'; }).join('') +
    (done ? '<p class="sub" style="margin:10px 0 0;font-size:14px">' + done + ' livre' + (done > 1 ? 's' : '') + ' terminé' + (done > 1 ? 's' : '') + '</p>' : '') + '</section>';
  return h;
}
function openBook(title) {
  const ns = S.notes.filter(n => n.b === title), ws = S.all.filter(w => w.b === title), ps = ns.filter(M.isPassage), bk = M.bookOf(title);
  const author = (ns.find(n => n.a) || {}).a || (bk && bk.a) || '', mast = ws.filter(w => M.mastered(M.P(w))).length, notes = ns.filter(n => n.n).length, left = M.timeLeft(bk);
  sheet('Livre', () => '<div class="card center" style="padding:20px 16px"><p style="font:700 26px/1.2 var(--serif);margin:0;word-break:break-word">' + esc(title) + '</p>' + (author ? '<p class="sub">' + esc(author) + '</p>' : '') + '</div>' +
    (bk ? '<div class="group">' + row({ t: 'Progression', r: Math.round(bk.p) + ' %' }) + (bk.sp ? row({ t: 'Temps de lecture', r: M.dur(bk.sp) }) : '') + (left ? row({ t: 'Temps restant estimé', r: 'environ ' + M.dur(left) }) : '') + (bk.d ? row({ t: 'Dernière lecture', r: esc(M.fmtDate(bk.d)) }) : '') + row({ t: 'État', r: bk.s === 2 ? 'Terminé' : bk.s === 1 ? 'En cours' : 'Commencé' }) + '</div>' : '') +
    '<div class="group">' + row({ t: 'Passages surlignés', r: String(ns.length) }) + row({ t: 'Notes écrites', r: String(notes) }) + row({ t: 'Mots', r: ws.length ? ws.length + ' · ' + mast + ' maîtrisé' + (mast > 1 ? 's' : '') : '0' }) + '</div>' +
    (ps.length ? '<button class="btn" data-sb="rev">Relire les passages de ce livre</button>' : '') + (ns.length ? '<button class="btn tint" data-sb="md">Copier tout en Markdown</button>' : ''),
    sh => { const r = sh.querySelector('[data-sb="rev"]'), m = sh.querySelector('[data-sb="md"]');
      if (r) r.onclick = () => { closeSheet(true); M.games.passages(M.shuffle(ps).slice(0, 15), 'Relecture'); };
      if (m) m.onclick = () => copyOrShare(mdOf(ns.slice().sort((a, b) => String(a.d).localeCompare(String(b.d)))), 'copy'); });
}

/* ---------- Progrès ---------- */
function viewProgress() {
  const ps = S.words.map(M.P), n = S.words.length || 1, news = ps.filter(p => !p.reps).length, mast = ps.filter(M.mastered).length, learn = S.words.length - news - mast;
  const dayEnd = i => { const d = new Date(); d.setHours(23, 59, 59, 999); d.setDate(d.getDate() + i); return d.getTime(); };
  const fc = [...Array(7)].map((_, i) => ({ n: ps.filter(p => p.reps && p.due <= dayEnd(i) && (i === 0 || p.due > dayEnd(i - 1))).length, l: i ? new Date(dayEnd(i)).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') : 'auj.' }));
  const fmax = Math.max(1, ...fc.map(f => f.n));
  const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 19);
  const cells = []; for (const d = new Date(start); M.ymd(d) <= M.today(); d.setDate(d.getDate() + 1)) { const k = M.ymd(d), x = S.st.days[k] || 0; cells.push('<i class="' + (x ? x < 30 ? 'l1' : x < 100 ? 'l2' : x < M.GOAL ? 'l3' : 'l4' : '') + (k === M.today() ? ' now' : '') + '" title="' + k + ' · ' + x + ' XP"></i>'); }
  const active = Object.values(S.st.days).filter(Boolean).length;
  const books = Object.entries(S.words.reduce((m, w, i) => { (m[w.b] = m[w.b] || { n: 0, m: 0 }).n++; if (M.mastered(ps[i])) m[w.b].m++; return m; }, {})).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  const hard = S.words.map((w, i) => [w, ps[i]]).filter(x => x[1].lapses > 0).sort((a, b) => b[1].lapses - a[1].lapses).slice(0, 5);
  const pc = x => (x / n * 100).toFixed(1) + '%';
  return '<div class="lt"><h1>Progrès</h1><p class="sub">' + (S.lang === 'fr' ? 'Mots français' : 'Mots anglais') + '</p></div><div class="stack" style="margin-top:8px">' + segLang() +
    '<section class="card"><h3>Ta mémoire</h3><div class="kpis"><div class="kpi"><b>' + mast + '</b><small>maîtrisés (3 semaines et plus)</small></div><div class="kpi"><b>' + learn + '</b><small>en cours</small></div><div class="kpi"><b>' + news + '</b><small>jamais vus</small></div></div>' +
    '<div class="stackbar" role="img" aria-label="' + mast + ' maîtrisés, ' + learn + ' en cours, ' + news + ' nouveaux"><i style="width:' + pc(mast) + ';background:var(--green)"></i><i style="width:' + pc(learn) + ';background:var(--orange)"></i></div>' +
    '<div class="legend"><span style="--c:var(--green)">Maîtrisés</span><span style="--c:var(--orange)">En cours</span><span style="--c:var(--fill2)">Nouveaux</span></div></section>' +
    readingCards() +
    '<section class="card"><h3>Révisions des 7 prochains jours</h3><div class="fc7">' + fc.map(f => '<div><b>' + f.n + '</b><i style="height:' + Math.max(3, f.n / fmax * 80) + 'px"></i>' + esc(f.l) + '</div>').join('') + '</div><p class="sub" style="margin-top:8px;font-size:13px">En plus, au maximum ' + M.NEW_DAY + ' nouveaux mots par jour.</p></section>' +
    '<section class="card"><h3>Tes jours de jeu</h3><div class="heat-wrap"><div class="heat">' + cells.join('') + '</div></div><p class="sub" style="margin-top:8px;font-size:13px">' + active + ' jour' + (active > 1 ? 's' : '') + ' de jeu · ' + S.st.xp + ' XP · série actuelle ' + M.streak() + ' j</p></section>' +
    (books.length ? '<section class="card"><h3>Par livre</h3>' + books.map(([b, v]) => '<button class="bookrow" data-a="book" data-b="' + esc(b) + '"><div style="display:flex;justify-content:space-between;gap:10px;font-size:15px"><span>' + esc(b) + '</span><span class="muted">' + v.m + ' / ' + v.n + ' maîtrisés</span></div><div class="minibar"><i style="width:' + (v.m / v.n * 100) + '%;background:var(--green)"></i></div></button>').join('') + '</section>' : '') +
    (hard.length ? '<section class="card"><h3>Tes mots les plus coriaces</h3><div class="group" style="background:none">' + hard.map(([w, p]) => row({ t: '<span class="word-t">' + esc(w.w) + '</span>', s: esc(mean(w)), r: 'oublié ' + p.lapses + ' fois' })).join('') + '</div><button class="btn tint" data-a="drill" style="margin-top:12px">Réviser ces mots</button></section>' : '') + '</div>';
}

/* ---------- feuilles ---------- */
let curSheet = null;
function sheet(title, gen, wire) {
  closeSheet(true);
  const sc = document.createElement('div'); sc.className = 'scrim';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
  sh.innerHTML = '<div class="sheet-bar"><span style="width:64px"></span><h2>' + esc(title) + '</h2><button class="btn sm gray" data-sx style="width:64px;padding:0">OK</button></div><div class="sheet-body"></div>';
  document.body.append(sc, sh); const body = sh.querySelector('.sheet-body');
  const draw = () => { const y = body.scrollTop; body.innerHTML = gen(); wire && wire(sh, draw); body.scrollTop = y; };
  draw(); void sh.offsetWidth; sc.classList.add('on'); sh.classList.add('on');
  sc.onclick = sh.querySelector('[data-sx]').onclick = () => closeSheet();
  curSheet = { sc, sh, draw }; return curSheet;
}
function closeSheet(quick) { if (!curSheet) return; const { sc, sh } = curSheet; curSheet = null; V.stop(); sc.classList.remove('on'); sh.classList.remove('on'); setTimeout(() => { sc.remove(); sh.remove(); }, quick ? 0 : 450); }

/* ---------- réglages ---------- */
const APP_URL = 'https://gregguuus.github.io/mots-kobo/app.html';
function settingsHTML(focus) {
  const y = S.sync, k = y.kobo, n = M.counts(), voices = lang => V.forLang(lang);
  const vopt = lang => { const vs = voices(lang); if (!vs.length) return '<option value="">Voix du système</option>'; const cur = (S.set.voice || {})[lang] || (V.pick(lang) || {}).voiceURI; return vs.map(v => '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === cur ? ' selected' : '') + '>' + esc(v.name) + '</option>').join(''); };
  const koboTxt = k ? 'Programme v' + k.v + (k.boot ? ' · actif depuis ' + M.ago(M.parseT(k.boot)) : '') : (S.notes.length ? 'Ancienne version (v1)' : 'Aucun contact');
  const upd = !(k && k.v >= 2);
  return '<h2 class="gt" style="margin-top:6px">Langue</h2>' + (segLang() || '<div class="group">' + row({ t: 'Mots ' + (S.lang === 'fr' ? 'français' : 'anglais'), r: String(S.words.length) }) + '</div>') +
    '<h2 class="gt">Son</h2><div class="group">' +
    '<label class="row"><span class="row-main"><span class="t">Lecture automatique</span><span class="s" style="display:block">Prononce le mot en révision, si l’iPhone l’autorise</span></span><span class="sw"><input type="checkbox" data-s="auto"' + (S.set.auto ? ' checked' : '') + '><i></i></span></label>' +
    '<label class="row"><span class="row-main"><span class="t">Voix anglaise</span></span><select class="field" data-s="voice" data-l="en" style="width:auto;max-width:55%;min-height:36px">' + vopt('en') + '</select></label>' +
    '<label class="row"><span class="row-main"><span class="t">Voix française</span></span><select class="field" data-s="voice" data-l="fr" style="width:auto;max-width:55%;min-height:36px">' + vopt('fr') + '</select></label>' +
    '<label class="row"><span class="row-main"><span class="t">Vitesse</span></span><input type="range" min="0.6" max="1.1" step="0.05" value="' + (S.set.rate || .9) + '" data-s="rate" style="width:46%"></label>' +
    '<button class="row" data-s="test"><span class="row-main"><span class="t" style="color:var(--blue)">Tester le son</span></span></button></div><p class="gf" id="snd">Pas de son ? Vérifie que ton iPhone n’est pas en mode silencieux (interrupteur sur le côté) et que le volume est monté.</p>' +
    '<h2 class="gt">Rappel quotidien</h2><div class="group">' + row({ ic: 'bell', bg: 'red', t: 'Ajouter à mes Rappels', s: S.set.rappels ? 'Déjà ajouté à l’app Rappels' : 'Une notification chaque jour, avec un lien vers l’appli', a: 'remind' }) + '</div>' +
    '<h2 class="gt">Synchronisation</h2><div class="group">' + row({ t: 'Mots', s: y.words ? 'Reçus ' + M.ago(M.parseT(y.words)) : 'Aucun envoi reçu', r: String(n.en + n.fr + n.pending) }) +
    row({ t: 'Annotations', s: y.notes ? 'Reçues ' + M.ago(M.parseT(y.notes)) : 'Aucun envoi reçu', r: String(S.notes.length) }) + row({ t: 'Programme de la Kobo', s: esc(koboTxt) }) +
    '<button class="row" data-s="sync"><span class="row-main"><span class="t" style="color:var(--blue)">' + (y.busy ? 'Synchronisation…' : 'Synchroniser maintenant') + '</span></span></button></div>' +
    (upd ? '<div class="banner" style="margin-top:12px"><span>' + ico('refresh') + '</span><div><b>Mise à jour du programme de la Kobo.</b> Branche la Kobo au Mac (touche « Connecter »), puis colle cette ligne dans le Terminal. C’est la dernière fois : ensuite il se met à jour tout seul.<textarea class="field" readonly rows="3" id="cmd" style="margin-top:8px">' + UPDATE_CMD + '</textarea><button class="btn sm tint" data-s="copycmd" style="margin-top:8px">Copier la commande</button></div></div>' : '<p class="gf">Le programme de ta Kobo est à jour et se met à jour tout seul.</p>') +
    '<h2 class="gt">Sauvegarde</h2><div class="group">' + row({ ic: 'copy', bg: 'blue', t: 'Copier ma progression', s: 'Un code à garder ou à coller sur un autre appareil', a: 'backup', d: 'data-m="copy"' }) + row({ ic: 'cloud', bg: 'gray', t: 'Coller un code', a: 'backup', d: 'data-m="paste"' }) + row({ ic: 'file', bg: 'gray', t: 'Importer KoboReader.sqlite', s: 'Charge les annotations depuis le fichier de la Kobo', a: 'sqlite' }) + '</div>' +
    '<textarea class="field" id="code" hidden aria-label="Code de sauvegarde" style="margin-top:12px"></textarea><p class="verdict" id="bk"></p>' +
    '<h2 class="gt">Connexion</h2><div class="group">' + row({ ic: 'lock', bg: 'red', t: '<span style="color:var(--red)">Oublier la clé de cet appareil</span>', a: 'forget', noChev: true }) + '</div>' +
    '<p class="gf">Prononciations : Wiktionary (CC BY-SA) via dictionaryapi.dev. Traductions automatiques : MyMemory. Tes mots et annotations restent chiffrés avec ta clé sur GitHub.</p>';
}
function openSettings(focus) {
  sheet('Réglages', () => settingsHTML(focus), (sh, draw) => {
    const on = (sel, ev, f) => sh.querySelectorAll(sel).forEach(e => e.addEventListener(ev, f));
    on('[data-s="auto"]', 'change', e => { S.set.auto = e.target.checked; M.saveSettings(); });
    on('[data-s="voice"]', 'change', e => { S.set.voice = S.set.voice || {}; S.set.voice[e.target.dataset.l] = e.target.value; M.saveSettings(); });
    on('[data-s="rate"]', 'input', e => { S.set.rate = +e.target.value; M.saveSettings(); });
    on('[data-s="test"]', 'click', () => { const out = sh.querySelector('#snd'), w = { w: 'hello', _l: 'en' }; out.textContent = 'Lecture…'; V.play(w, { start: () => out.textContent = 'Le son est en cours de lecture. Tu l’entends ?', end: () => {}, fail: r => out.textContent = r === 'unsupported' ? 'Le son n’est pas disponible sur cet appareil.' : 'Aucun son détecté. Vérifie que ton iPhone n’est pas en mode silencieux (interrupteur sur le côté) et que le volume est monté.' }); });
    on('[data-s="sync"]', 'click', async () => { await M.syncAll(); draw(); });
    on('[data-s="copycmd"]', 'click', () => copyOrShare(UPDATE_CMD, 'copy'));
    if (focus === 'sync') setTimeout(() => { const c = sh.querySelector('#cmd'); c && c.scrollIntoView({ block: 'center' }); }, 480);
  });
}
async function backup(m, sh) {
  const code = $('#code'), bk = $('#bk'); bk.style.color = 'var(--green)';
  if (m === 'copy') { const c = await M.exportCode(); code.hidden = false; code.value = c; code.readOnly = true; try { await navigator.clipboard.writeText(c); bk.textContent = 'Code copié. Garde-le dans tes notes.'; } catch (e) { code.select(); bk.style.color = 'var(--label2)'; bk.textContent = 'Sélectionne le code et copie-le.'; } return; }
  if (code.hidden || code.readOnly) { code.hidden = false; code.readOnly = false; code.value = ''; code.placeholder = 'Colle ici ton code MK1…'; code.focus(); bk.textContent = 'Colle ton code, puis touche de nouveau « Coller un code ».'; bk.style.color = 'var(--label2)'; return; }
  try { const k = await M.importCode(code.value.trim()); bk.textContent = 'Progression fusionnée : ' + k + ' mot' + (k > 1 ? 's' : '') + ' mis à jour.'; M.emit(); } catch (e) { bk.style.color = 'var(--red)'; bk.textContent = 'Ce code ne fonctionne pas. Vérifie qu’il est complet.'; }
}
function pickSqlite() {
  const f = document.createElement('input'); f.type = 'file'; f.accept = '.sqlite,.db,application/x-sqlite3,application/octet-stream';
  f.onchange = async () => { const file = f.files[0]; if (!file) return; M.toast('Lecture du fichier…');
    try { const items = await M.parseSqlite(file); M.setNotes(items); M.idbSet('notes2', { notes: items, updated: new Date().toISOString(), kobo: null }); S.sync.notes = new Date().toISOString(); S.sync.kobo = null; M.toast(items.length + ' annotations importées'); M.emit(); }
    catch (e) { M.toast(String(e && e.message) === 'pas-kobo' ? 'Ce n’est pas le fichier de la Kobo (KoboReader.sqlite)' : 'Impossible de lire ce fichier'); } };
  f.click();
}
function openRemind() {
  sheet('Rappel quotidien', () => '<div class="card center" style="padding:22px"><div style="font-size:44px;color:var(--red)">' + ico('bell') + '</div><h3 style="margin:8px 0 4px;font-size:20px">Dans ton app Rappels</h3><p class="muted" style="margin:0">Ton iPhone te prévient chaque jour. Toucher le rappel ouvre directement Mots Kobo.</p></div>' +
    '<ol class="steps"><li>Touche <b>Ajouter à mes Rappels</b> ci-dessous.</li><li>Dans la liste qui s’ouvre, choisis <b>Rappels</b>.</li><li>Règle l’heure, puis <b>Répéter › Tous les jours</b>.</li><li>Touche <b>Ajouter</b>.</li></ol>' +
    '<button class="btn" data-a="remindshare">Ajouter à mes Rappels</button>' +
    '<button class="btn gray" data-a="reminddone">' + (S.set.rappels ? 'Déjà ajouté, retirer la coche' : 'C’est fait') + '</button>' +
    '<p class="gf" style="margin:0">Apple ne laisse pas une appli web créer elle-même un rappel qui se répète : ces quatre touches sont à faire une seule fois.</p>');
}
async function shareReminder() {
  const data = { title: 'Mots Kobo : ta révision du jour', text: 'Mots Kobo : ta révision du jour', url: APP_URL };
  if (navigator.share) { try { await navigator.share(data); } catch (e) { if (!e || e.name !== 'AbortError') M.toast('Partage impossible'); } }
  else { await copyOrShare(data.text + '\n' + APP_URL, 'copy'); M.toast('Lien copié : colle-le dans Rappels'); }
}

/* ---------- actions ---------- */
const A = {
  tab: el => setTab(el.dataset.t),
  passages: () => M.games.passages(),
  book: el => openBook(el.dataset.b),
  sync: async () => { M.toast('Synchronisation…'); await M.syncAll(); M.toast(S.sync.wordsErr ? 'Hors connexion' : 'À jour'); },
  settings: el => openSettings(el && el.dataset && el.dataset.s),
  lang: el => { M.pickLang(el.dataset.l); M.emit(); },
  review: () => M.games.review(),
  more: () => M.games.review(M.weak().slice(0, 10)),
  drill: () => { const hard = S.words.filter(w => M.P(w).lapses > 0).sort((a, b) => M.P(b).lapses - M.P(a).lapses).slice(0, 8); M.games.review(hard); },
  game: el => M.games[el.dataset.g] && M.games[el.dataset.g](),
  remind: () => openRemind(),
  remindshare: () => shareReminder(),
  reminddone: () => { S.set.rappels = !S.set.rappels; M.saveSettings(); closeSheet(); M.emit(); M.toast(S.set.rappels ? 'Rappel noté' : 'Coche retirée'); },
  word: el => openWord(+el.dataset.i),
  nf: el => { F[el.dataset.k] = el.dataset.v; render(); },
  ncopy: el => { const x = S.notes.find(n => n.id === el.dataset.id); x && copyOrShare(textOf(x), 'copy'); },
  nshare: el => { const x = S.notes.find(n => n.id === el.dataset.id); x && copyOrShare(textOf(x), 'share'); },
  nexport: el => copyOrShare(mdOf(notesFiltered()), el.dataset.m),
  backup: el => backup(el.dataset.m),
  sqlite: () => pickSqlite(),
  forget: () => { if (!el_confirm()) return; M.local('key', null); try { history.replaceState(null, '', location.pathname); } catch (e) {} S.keyState = 'none'; closeSheet(true); render(); },
  connect: () => { const k = M.keyFromText($('#lnk').value); if (!k) { $('#lnkerr').textContent = 'Je ne trouve pas la clé dans ce lien. Il doit se terminer par #k=…'; return; } M.setKey(k); S.keyState = 'ok'; render(); M.syncAll(); }
};
let armed = 0; const el_confirm = () => { if (Date.now() - armed < 4000) { armed = 0; return true; } armed = Date.now(); M.toast('Touche une seconde fois pour confirmer'); return false; };
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (!el || !A[el.dataset.a]) return; A[el.dataset.a](el, e); });
document.addEventListener('change', e => { if (e.target.id === 'nbook') { F.book = e.target.value; $('#nlist').innerHTML = notesList(); } });
document.addEventListener('input', e => {
  if (e.target.id === 'wq') { F.wq = e.target.value.trim(); $('#wlist').innerHTML = wordRows(); }
  if (e.target.id === 'nq') { F.q = e.target.value.trim(); $('#nlist').innerHTML = notesList(); }
});

/* ---------- affichage ---------- */
const VIEWS = { today: viewToday, words: viewWords, notes: viewNotes, progress: viewProgress };
function render() {
  const hello = S.keyState !== 'ok' && !S.all.length && !S.notes.length;
  $('#tabbar').hidden = hello; $('#navbar').hidden = hello; document.body.classList.toggle('hello', hello);
  screen.style.paddingTop = hello ? '0' : ''; screen.style.paddingBottom = hello ? '0' : '';
  screen.innerHTML = hello ? viewHello() : VIEWS[S.tab]();
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.t === S.tab)));
  $('#navtitle').textContent = TITLES[S.tab]; $('#navsync').style.animation = S.sync.busy ? 'spin 1s linear infinite' : '';
  const due = M.dueQueue().length; try { navigator.setAppBadge && (due ? navigator.setAppBadge(due) : navigator.clearAppBadge()); } catch (e) {}
}
function setTab(t) { if (t === S.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } S.tab = t; ss.set('mk.tab', t); render(); window.scrollTo(0, 0); }
const st = document.createElement('style'); st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'; document.head.appendChild(st);
M.on(() => {
  if (document.querySelector('.cover.on')) return;
  const a = document.activeElement; if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && screen.contains(a)) return;
  const y = window.scrollY; render(); window.scrollTo(0, y);
  if (curSheet && !document.querySelector('.sheet-body :focus')) curSheet.draw();
});

/* ---------- démarrage ---------- */
(async () => {
  await M.init(); chrome(); render();
  const key = M.getKey(); if (key) M.setKey(key);
  M.syncAll();
  const tick = () => { if (document.visibilityState === 'visible' && !document.querySelector('.cover.on') && !curSheet) M.syncAll(); };
  setInterval(tick, 4 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - S.sync.checked > 30e3) tick(); });
  window.addEventListener('online', tick);
  if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {} }
})();
})();

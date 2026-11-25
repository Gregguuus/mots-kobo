/* Mots Kobo : base commune (données, synchronisation, mémoire, son). */
(() => {
'use strict';
const M = window.M = window.M || {};
M.$ = (s, r = document) => r.querySelector(s);
M.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
M.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const esc = M.esc;
M.obj = x => x && !Array.isArray(x) && typeof x === 'object' ? x : {};
M.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const DAY = M.DAY = 864e5, MIN = 6e4;

/* ---------- état ---------- */
const S = M.S = {
  kw: [], all: [], words: [], lang: 'en', notes: [], prog: {}, st: { xp: 0, days: {}, best: {}, fresh: {} },
  set: { auto: false, rate: 0.9, voice: {}, remind: [] },
  sync: { words: null, notes: null, kobo: null, checked: 0, busy: false, wordsErr: '', notesErr: '', notesState: 'none' },
  keyState: 'none', tab: 'today'
};
M.GOAL = 200; M.NEW_DAY = 15;

/* ---------- dates ---------- */
const ymd = M.ymd = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
M.today = () => ymd(Date.now());
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
M.MOIS = MOIS;
M.fmtDay = d => { const t = Date.parse(String(d).slice(0, 10) + 'T12:00:00'); if (isNaN(t)) return ''; const k = ymd(t);
  if (k === M.today()) return 'Aujourd’hui'; if (k === ymd(Date.now() - DAY)) return 'Hier';
  const x = new Date(t); return x.getDate() + (x.getDate() === 1 ? 'er ' : ' ') + MOIS[x.getMonth()] + (x.getFullYear() !== new Date().getFullYear() ? ' ' + x.getFullYear() : ''); };
M.fmtDate = d => { const t = Date.parse(d); if (isNaN(t)) return ''; const x = new Date(t); return x.getDate() + (x.getDate() === 1 ? 'er ' : ' ') + MOIS[x.getMonth()] + ' ' + x.getFullYear(); };
M.hm = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
M.ago = t => { if (!t || isNaN(t)) return ''; const s = (Date.now() - t) / 1000; if (s < 90) return 'à l’instant'; if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min'; if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h'; const d = Math.round(s / 86400); return d === 1 ? 'hier' : 'il y a ' + d + ' jours'; };
M.parseT = s => { const t = Date.parse(s); return isNaN(t) ? null : t; };

/* ---------- nettoyage des textes : entités HTML, caractères invisibles, espaces ---------- */
const ta = document.createElement('textarea');
M.clean = (s, nl) => {
  s = String(s ?? '');
  if (/&[#a-z0-9]+;/i.test(s)) { ta.innerHTML = s.replace(/&(?![#a-z0-9]+;)/gi, '&amp;').replace(/</g, '&lt;'); s = ta.value; }
  if (/Ã[\u0080-¿]|â€/.test(s)) { try { s = decodeURIComponent(escape(s)); } catch (e) {} }
  if (/%[0-9A-Fa-f]{2}/.test(s) && !/\s/.test(s)) { try { s = decodeURIComponent(s); } catch (e) {} }
  s = s.replace(/[​-‍⁠﻿­]/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[   ]/g, ' ');
  s = nl ? s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n') : s.replace(/\s+/g, ' ');
  return s.trim();
};
/* phrase d'un livre : les mots à retenir sont entre « << » et « >> » */
M.ctxSegs = c => {
  const out = [], re = /<<(.*?)>>/g; let i = 0, m; c = String(c || '');
  while ((m = re.exec(c))) { if (m.index > i) out.push([c.slice(i, m.index), 0]); out.push([m[1], 1]); i = m.index + m[0].length; }
  if (i < c.length) out.push([c.slice(i), 0]);
  return out.map(([t, h]) => [t.replace(/<<|>>/g, ''), h]).filter(x => x[0]);
};
M.ctxHTML = (c, blank) => {
  const segs = M.ctxSegs(c); if (!segs.length) return '';
  return segs.map(([t, h]) => h ? (blank ? '<span class="blank"></span>' : '<mark>' + esc(t) + '</mark>') : esc(t)).join('');
};
M.ctxPlain = c => M.ctxSegs(c).map(x => x[0]).join('');

/* ---------- stockage : localStorage (progression) et IndexedDB (annotations) ---------- */
const LS = 'motsKobo.v2';
M.local = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(LS + k) || 'null'); localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { return null; } };
const idb = (mode, fn) => new Promise((ok, ko) => { try { const r = indexedDB.open('motsKobo', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = () => ko(r.error);
  r.onsuccess = () => { const tx = r.result.transaction('kv', mode), st = tx.objectStore('kv'), q = fn(st); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => ko(tx.error); }; } catch (e) { ko(e); } });
M.idbGet = k => idb('readonly', s => s.get(k)).catch(() => null);
M.idbSet = (k, v) => idb('readwrite', s => s.put(v, k)).catch(() => {});

/* ---------- déchiffrement (même format que words.enc) ---------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64u = s => b64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
const enc = new TextEncoder();
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hmac(k, d) { const key = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, d)); }
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
async function decrypt(box, keyStr) {
  const K = b64u(keyStr), N = b64(box.n), C = b64(box.c), Ke = await hmac(K, enc.encode('enc')), Km = await hmac(K, enc.encode('mac'));
  if (hex(await hmac(Km, cat(N, C))) !== box.m) throw new Error('cle');
  const n = Math.ceil(C.length / 32), ks = await Promise.all(Array.from({ length: n }, (_, i) => hmac(Ke, cat(N, new Uint8Array([i >>> 24 & 255, i >>> 16 & 255, i >>> 8 & 255, i & 255])))));
  const P = new Uint8Array(C.length); for (let i = 0; i < C.length; i++) P[i] = C[i] ^ ks[i >> 5][i & 31];
  const txt = P[0] === 0x1f && P[1] === 0x8b ? await new Response(new Blob([P]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(P);
  return JSON.parse(txt);
}
M.decrypt = decrypt;
M.getKey = () => { const m = location.hash.match(/k=([A-Za-z0-9_-]{20,})/); return m ? m[1] : M.local('key'); };
M.setKey = k => { M.local('key', k); try { history.replaceState(null, '', location.pathname + location.search + '#k=' + k); } catch (e) {} };
M.keyFromText = t => { const m = String(t).match(/k=([A-Za-z0-9_-]{20,})/) || String(t).trim().match(/^([A-Za-z0-9_-]{40,})$/); return m ? m[1] : null; };

let apiOff = 0;
async function fetchBox(file) {
  const t = '?t=' + Date.now(), m = location.hostname.match(/^([^.]+)\.github\.io$/i), repo = location.pathname.split('/').filter(Boolean)[0];
  let r = null;
  if (m && repo && Date.now() > apiOff) { try { r = await fetch('https://api.github.com/repos/' + m[1] + '/' + repo + '/contents/' + file + t, { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw+json' } }); if (r.status === 403 || r.status === 429) apiOff = Date.now() + 10 * MIN; } catch (e) {} }
  if (!r || !r.ok) r = await fetch(file + t, { cache: 'no-store' });
  if (r.status === 404) { const e = new Error('absent'); e.code = 404; throw e; }
  if (!r.ok) throw new Error('http' + r.status);
  return r.json();
}

/* ---------- mots ---------- */
const mean = M.mean = w => w.i || (w.t[0] ? w.t[0][1] : '');
M.known = w => !!mean(w);
const FRW = new Set('le la les un une des du de et est que qui dans pour pas ne il elle je nous vous ils elles sur au aux avec ce cette ces son sa ses mais comme tout était avait sont été lui leur où'.split(' '));
const ENW = new Set('the an and is was that which in for not he she it i we you they at with this his her but as all were had are been of to from by would there their what'.split(' '));
const langOf = M.langOf = t => { const ws = String(t).toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ’']+/g) || []; let f = 0, e = 0; for (const w of ws) { if (FRW.has(w)) f++; if (ENW.has(w)) e++; } if (/[àâçéèêëîïôûùœ]/.test(t)) f += .5; return f > e ? 'fr' : e > f ? 'en' : ''; };
function normWord(r) {
  const w = M.clean(r.w); if (!w) return null;
  const t = Array.isArray(r.t) ? r.t.filter(x => Array.isArray(x) && x.length >= 2).map(x => [M.clean(x[0]), M.clean(x[1])]).filter(x => x[1]) : [];
  return { w, i: M.clean(r.i), t, c: M.clean(r.c), b: M.clean(r.b) || 'Livre sans titre', d: String(r.d || '').slice(0, 10), lang: String(r.lang || '').slice(0, 2).toLowerCase(), _l: '', auto: 0 };
}
function setWords(raw) {
  const ws = raw.map(normWord).filter(Boolean), byBook = {};
  for (const w of ws) (byBook[w.b] = byBook[w.b] || []).push(M.ctxPlain(w.c));
  const bl = {}; for (const [b, cs] of Object.entries(byBook)) bl[b] = langOf(cs.join(' '));
  for (const w of ws) w._l = (w.lang === 'fr' || w.lang === 'en') ? w.lang : (bl[w.b] || langOf(w.w) || 'en');
  const tr = M.obj(M.local('tr')); for (const w of ws) { const k = w._l + ':' + w.w; if (!M.known(w) && tr[k]) { w.i = tr[k]; w.auto = 1; } }
  S.kw = ws; M.rebuildAll();
}
/* mots français : les surlignages d'un seul mot dans les livres français deviennent des mots à réviser (définition du Wiktionnaire) */
function deriveFr() {
  const seen = new Set(), out = [], defs = M.obj(M.local('frdef'));
  for (const n of S.notes) {
    if (n.l !== 'fr' || n.n && n.t.length > 40) continue;
    const t = n.t.replace(/^[\s«»"“”'’(\[]+|[\s«»"“”)\].,;:!?…]+$/g, ''), parts = t.split(/\s+/);
    if (!t || parts.length > 3 || t.length > 34 || /[0-9]/.test(t) || /[.;!?]/.test(t)) continue;
    if (parts.length > 1 && !/^(le|la|les|un|une|des|l’|l'|se|s’|s')$/i.test(parts[0])) continue;
    const key = t.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    const w = { w: t, i: '', t: [], c: '', b: n.b, d: String(n.d || '').slice(0, 10), lang: 'fr', _l: 'fr', auto: 0, derived: 1 };
    const d = defs[key]; if (d && d !== '∅') { w.i = d; w.auto = 1; } else if (d === '∅') w.none = 1;
    out.push(w);
  }
  return out;
}
M.rebuildAll = () => { S.all = S.kw.concat(deriveFr()); M.pickLang(S.lang); };
/* définition d'un mot : première définition de la première partie du discours (extrait texte du Wiktionnaire) */
M.wiktDef = extract => {
  const lines = String(extract || '').split('\n'), skip = /^(Étymologie|Prononciation|Voir aussi|Références|Anagrammes|Traductions|Vocabulaire|Variantes|Dérivés|Apparentés|Homophones|Notes|Forme|Citations|Proverbes|Dérivés)/i;
  let i = lines.findIndex(l => /^== Français ==/.test(l)); if (i < 0) return '';
  for (let j = i + 1; j < lines.length; j++) {
    if (/^== [^=]/.test(lines[j])) break;
    const m = lines[j].match(/^=== (.+?) ===$/); if (!m || skip.test(m[1])) continue;
    let k = j + 1; while (k < lines.length && !lines[k].trim()) k++; k++; while (k < lines.length && !lines[k].trim()) k++;
    let d = lines[k] || ''; if (!d || /^=/.test(d)) continue;
    d = M.clean(d.replace(/\s+—\s+\(.*$/, '').replace(/\s*→.*$/, '')); if (d.length > 120) d = d.slice(0, 117).replace(/[\s,;:(]+\S*$/, '') + '…';
    return d;
  }
  return '';
};
let frBusy = false;
async function fillFr() {
  if (frBusy) return; frBusy = true; const defs = M.obj(M.local('frdef')); let n = 0;
  for (const w of S.all.filter(w => w.derived && !w.i && !w.none).slice(0, 25)) {
    const k = w.w.toLowerCase(); let d = '';
    try {
      for (const title of new Set([w.w, k])) {
        const r = await fetch('https://fr.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&exlimit=1&redirects=1&titles=' + encodeURIComponent(title) + '&format=json&formatversion=2&origin=*');
        const j = await r.json(), pg = ((j.query || {}).pages || [])[0]; if (pg && pg.extract) { d = M.wiktDef(pg.extract); if (d) break; }
      }
    } catch (e) { break; }
    defs[k] = d || '∅'; if (d) { w.i = d; w.auto = 1; n++; } else w.none = 1;
  }
  M.local('frdef', defs); if (n) { M.pickLang(S.lang); M.emit(); } frBusy = false;
}
M.pickLang = l => {
  S.lang = l === 'fr' ? 'fr' : 'en'; M.local('lang', S.lang);
  S.words = S.all.filter(w => w._l === S.lang && M.known(w));
  if (!S.words.length && S.all.some(M.known)) { S.lang = S.all.find(M.known)._l; S.words = S.all.filter(w => w._l === S.lang && M.known(w)); }
};
M.counts = () => ({ en: S.all.filter(w => w._l === 'en' && M.known(w)).length, fr: S.all.filter(w => w._l === 'fr' && M.known(w)).length, pending: S.all.filter(w => !M.known(w)).length });

let trBusy = false;
async function fillTr() {
  if (trBusy) return; trBusy = true; const tr = M.obj(M.local('tr')); let n = 0;
  for (const w of S.all.filter(w => !M.known(w) && w._l === 'en').slice(0, 40)) {
    try { const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(w.w) + '&langpair=en|fr'), j = await r.json(), t = M.clean(j && j.responseData && j.responseData.translatedText || '');
      if (+j.responseStatus === 200 && t && !/MYMEMORY|QUERY LENGTH/i.test(t) && t.toLowerCase() !== w.w.toLowerCase()) { tr[w._l + ':' + w.w] = t; w.i = t; w.auto = 1; n++; } } catch (e) { break; }
  }
  if (n) { M.local('tr', tr); M.pickLang(S.lang); M.emit(); } trBusy = false;
}

async function loadWords() {
  const key = M.getKey();
  if (!key) { S.keyState = 'none'; if (!S.all.length) setWords(M.local('words') || []); return; }
  try {
    const d = await decrypt(await fetchBox('words.enc'), key);
    const raw = (d.words || []).filter(w => w && w.w);
    if (!raw.length && S.all.length) throw new Error('vide');
    M.local('words', raw); M.local('key', key); S.keyState = 'ok'; S.sync.words = d.updated || null; S.sync.wordsErr = '';
    setWords(raw);
  } catch (e) {
    if (e.message === 'cle') { S.keyState = 'bad'; }
    else { S.sync.wordsErr = 'reseau'; if (!S.all.length) setWords(M.local('words') || []); if (S.keyState === 'none' && S.all.length) S.keyState = 'ok'; }
  }
  if (S.all.some(w => !M.known(w))) fillTr();
}

/* ---------- annotations ---------- */
function normNote(x) {
  return { id: String(x.id), t: M.clean(x.t), n: M.clean(x.n, true), d: String(x.d || ''), p: +x.p || 0, ch: x.ch == null ? null : +x.ch, c: +x.c || 0, b: M.clean(x.b) || 'Livre sans titre', a: M.clean(x.a), l: '' };
}
M.setNotes = items => {
  const ns = items.filter(x => x && (x.t || x.n)).map(normNote).filter(n => n.t || n.n), byBook = {};
  for (const n of ns) (byBook[n.b] = byBook[n.b] || []).push(n.t + ' ' + n.n);
  const bl = {}; for (const [b, ts] of Object.entries(byBook)) bl[b] = langOf(ts.join(' ')) || 'en';
  for (const n of ns) n.l = bl[n.b];
  S.notes = ns; M.rebuildAll();
};
async function loadNotes() {
  const key = M.getKey(); if (!key) return;
  try {
    const d = await decrypt(await fetchBox('notes.enc'), key);
    M.setNotes(d.notes || []); S.sync.notes = d.updated || null; S.sync.kobo = d.kobo || null; S.sync.notesErr = ''; S.sync.notesState = 'ok';
    M.idbSet('notes2', { notes: d.notes || [], updated: d.updated || null, kobo: d.kobo || null });
  } catch (e) {
    if (e.code === 404) { S.sync.notesState = S.notes.length ? 'ok' : 'absent'; }
    else if (e.message === 'cle') { S.sync.notesErr = 'cle'; }
    else { S.sync.notesErr = 'reseau'; }
  }
}
M.loadCachedNotes = async () => {
  const c = await M.idbGet('notes2');
  if (c && c.notes) { M.setNotes(c.notes); S.sync.notes = c.updated || null; S.sync.kobo = c.kobo || null; S.sync.notesState = 'ok'; return; }
  const old = await M.idbGet('annotations');   // ancien format (page « Mes annotations » d'avant)
  if (old && old.items) { M.setNotes(old.items); S.sync.notesState = 'ok'; }
};

M.listeners = [];
M.on = f => M.listeners.push(f);
M.emit = () => M.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

M.syncAll = async () => {
  if (S.sync.busy) return; S.sync.busy = true; M.emit();
  await Promise.allSettled([loadWords(), loadNotes()]);
  S.sync.busy = false; S.sync.checked = Date.now(); M.emit();
  if (S.all.some(w => w.derived && !w.i && !w.none)) fillFr();
};

/* ---------- import manuel d'un fichier KoboReader.sqlite ---------- */
let SQLP = null;
M.parseSqlite = async file => {
  if (!window.initSqlJs) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'vendor/sql-wasm.js'; s.onload = ok; s.onerror = () => ko(new Error('sql')); document.head.appendChild(s); });
  SQLP = SQLP || window.initSqlJs({ locateFile: f => 'vendor/' + f }).catch(e => { SQLP = null; throw e; });
  const SQL = await SQLP, db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const cols = new Set((db.exec('PRAGMA table_info(Bookmark)')[0] || { values: [] }).values.map(r => r[1]));
    if (!cols.has('Text')) throw new Error('pas-kobo');
    const c = (k, d) => cols.has(k) ? 'b.' + k : d;
    const res = db.exec(`SELECT b.BookmarkID,b.Text,${c('Annotation', 'NULL')},${c('DateCreated', 'NULL')},${c('ChapterProgress', '0')},${c('Type', "''")},${c('Color', 'NULL')},${c('Hidden', "'false'")},b.VolumeID,c.Title,c.Attribution FROM Bookmark b LEFT JOIN content c ON c.ContentID=b.VolumeID AND c.ContentType=6`)[0];
    const out = [];
    for (const [id, t, n, d, p, ty, col, hid, vol, title, au] of (res ? res.values : [])) {
      if (String(hid) === 'true' || ty === 'dogear') continue;
      const nm = decodeURIComponent(String(vol || '').split('/').pop() || '').replace(/(\.kepub)?\.(epub|pdf|kepub)$/i, '').replace(/[_-]+/g, ' ').replace(/^./, x => x.toUpperCase());
      out.push({ id: String(id), t, n, d: d || '', p: +p || 0, c: +col || 0, b: title || nm || 'Livre sans titre', a: au || '' });
    }
    return out;
  } finally { db.close(); }
};

/* ---------- mémoire : répétition espacée ---------- */
const GAPS = [0, 1, 2, 4, 8, 16, 32];
function P(w) { const p = S.prog[w.w]; if (!p) return { s: 0, e: 2.5, due: 0, reps: 0, lapses: 0, last: 0 };
  if (p.s == null) { const b = p.box || 0; return { s: b ? GAPS[b] : 0, e: 2.5, due: p.due || 0, reps: b, lapses: 0, last: 0 }; } return p; }
M.P = P;
M.lvl = p => !p.reps ? 0 : p.s < 1 ? 1 : p.s < 3 ? 2 : p.s < 7 ? 3 : p.s < 21 ? 4 : p.s < 60 ? 5 : 6;
M.mastered = p => p.reps > 0 && p.s >= 21;
M.schedule = (p, g, now = Date.now()) => {
  p = { ...p, last: now };
  if (g === 1) { p.lapses++; p.e = Math.max(1.3, p.e - .2); p.s = p.reps ? Math.max(.5, p.s * .3) : 0; p.due = now + 10 * MIN; p.reps++; return p; }
  if (!p.reps || p.s < .5) p.s = [0, 0, 1, 2, 4][g];
  else { const base = p.s + Math.max(0, (now - p.due) / DAY) / 2; p.e = Math.min(3.2, Math.max(1.3, p.e + (g === 2 ? -.15 : g === 4 ? .15 : 0))); p.s = g === 2 ? base * 1.2 : g === 3 ? base * p.e : base * p.e * 1.3; }
  p.s = Math.min(p.s, 365); p.reps++; p.due = now + p.s * DAY; return p;
};
M.ivl = s => s < 1 ? Math.max(1, Math.round(s * 24)) + ' h' : s < 30 ? Math.round(s) + ' j' : s < 365 ? Math.round(s / 30) + ' mois' : '1 an';
M.saveProg = () => M.local('prog', S.prog);
M.saveStats = () => M.local('stats', S.st);
M.grade = (w, g) => { const p = P(w); if (!p.reps) { S.st.fresh[M.today()] = (S.st.fresh[M.today()] || 0) + 1; M.saveStats(); } S.prog[w.w] = M.schedule(p, g); M.saveProg(); };
M.setProg = (w, good) => {
  const p = P(w), now = Date.now();
  if (good) { if (p.reps && p.due <= now) M.grade(w, 3); }
  else { S.prog[w.w] = { ...p, s: p.s * .5, due: now, last: now, lapses: p.lapses + 1, e: Math.max(1.3, p.e - .1) }; M.saveProg(); }
};
M.dueQueue = () => {
  const now = Date.now(), rev = S.words.filter(w => { const p = P(w); return p.reps && p.due <= now; }).sort((a, b) => P(a).due - P(b).due);
  const fresh = S.words.filter(w => !P(w).reps).sort((a, b) => String(b.d || '').localeCompare(String(a.d || ''))).slice(0, Math.max(0, M.NEW_DAY - (S.st.fresh[M.today()] || 0)));
  return [...rev, ...fresh];
};
M.nextDue = () => { const ds = S.words.map(P).filter(p => p.reps && p.due > Date.now()).map(p => p.due); return ds.length ? Math.min(...ds) : 0; };
M.weak = () => { const a = M.shuffle(S.words); a.sort((x, y) => M.lvl(P(x)) - M.lvl(P(y))); return a; };
M.pick = (n = 15) => { const a = M.weak(); return a[Math.floor(Math.random() * Math.min(n, a.length))]; };

/* ---------- XP, niveaux, série ---------- */
M.level = xp => Math.floor(Math.sqrt(xp / 40)) + 1;
M.lvlXP = l => 40 * (l - 1) ** 2;
M.streak = () => { let n = 0; const d = new Date(); if (!S.st.days[M.today()]) d.setDate(d.getDate() - 1); while (S.st.days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); } return n; };
M.gain = n => { const before = M.level(S.st.xp); S.st.xp += n; S.st.days[M.today()] = (S.st.days[M.today()] || 0) + n; M.saveStats(); return M.level(S.st.xp) > before; };

/* ---------- sauvegarde par code ---------- */
const gz = async (u8, mode) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(mode ? new CompressionStream('gzip') : new DecompressionStream('gzip'))).arrayBuffer());
M.exportCode = async () => { const raw = enc.encode(JSON.stringify({ v: 1, prog: S.prog, st: S.st })); let b = raw, z = '0'; try { b = await gz(raw, 1); z = '1'; } catch (e) {}
  let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return 'MK1' + z + '.' + btoa(s); };
M.importCode = async code => {
  const m = code.match(/^MK1([01])\.([A-Za-z0-9+/=\s]+)$/); if (!m) throw 0; let b = b64(m[2].replace(/\s/g, '')); if (m[1] === '1') b = await gz(b, 0);
  const d = JSON.parse(new TextDecoder().decode(b)); if (!d || d.v !== 1) throw 0; let k = 0;
  for (const [w, p] of Object.entries(M.obj(d.prog))) { const mine = S.prog[w]; if (!mine || (p.last || 0) > (mine.last || 0) || (mine.s == null && p.s != null)) { S.prog[w] = p; k++; } }
  const s = M.obj(d.st); S.st.xp = Math.max(S.st.xp, s.xp || 0); for (const [x, v] of Object.entries(M.obj(s.days))) S.st.days[x] = Math.max(S.st.days[x] || 0, v);
  for (const [x, v] of Object.entries(M.obj(s.fresh))) S.st.fresh[x] = Math.max(S.st.fresh[x] || 0, v); const bs = M.obj(s.best);
  if (bs.flash) S.st.best.flash = Math.max(S.st.best.flash || 0, bs.flash); if (bs.pairs) S.st.best.pairs = Math.min(S.st.best.pairs || 1e9, bs.pairs);
  M.saveProg(); M.saveStats(); return k;
};

/* ---------- son : voix de l'iPhone, ou vraie prononciation pour l'anglais ---------- */
const V = M.voice = { list: [], aud: null, ready: {}, unlocked: false };
const loadVoices = () => { try { V.list = speechSynthesis.getVoices() || []; } catch (e) { V.list = []; } };
if ('speechSynthesis' in window) { loadVoices(); try { speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch (e) {} }
V.supported = () => 'speechSynthesis' in window;
V.forLang = lang => V.list.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang));
V.pick = lang => {
  const saved = (S.set.voice || {})[lang]; if (saved) { const v = V.list.find(v => v.voiceURI === saved); if (v) return v; }
  const order = lang === 'fr' ? ['fr-fr', 'fr-ca', 'fr-be', 'fr'] : ['en-gb', 'en-us', 'en-au', 'en'];
  const score = v => (/premium|enhanced|siri|améliorée/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  for (const p of order) { const c = V.list.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(p)); if (c.length) return c.sort((a, b) => score(b) - score(a))[0]; }
  return null;
};
V.unlock = () => { if (V.unlocked || !V.supported()) return; V.unlocked = true; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {} };
V.stop = () => { try { speechSynthesis.cancel(); } catch (e) {} if (V.aud) { try { V.aud.pause(); } catch (e) {} V.aud = null; } };
V.say = (text, lang, o = {}) => {
  if (!V.supported()) { o.fail && o.fail('unsupported'); return; }
  try { speechSynthesis.cancel(); } catch (e) {}
  const u = new SpeechSynthesisUtterance(text), v = V.pick(lang); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'fr' ? 'fr-FR' : 'en-GB';
  u.rate = o.rate || S.set.rate || .9; u.volume = 1; let started = false;
  u.onstart = () => { started = true; o.start && o.start(); };
  u.onend = () => o.end && o.end();
  u.onerror = e => { o.end && o.end(); if (!started) o.fail && o.fail((e && e.error) || 'error'); };
  speechSynthesis.speak(u);
  setTimeout(() => { if (!started) { try { speechSynthesis.cancel(); } catch (e) {} o.fail && o.fail('silent'); } }, 1800);
};
/* vraie voix pour l'anglais (Wiktionary via dictionaryapi.dev) : préparée avant le toucher, pour que le son parte tout de suite */
V.prep = w => {
  if (!w || w._l !== 'en' || V.ready[w.w] !== undefined) return; V.ready[w.w] = null;
  const cache = M.obj(M.local('audio')), done = url => { if (!url) { V.ready[w.w] = false; return; } const a = new Audio(); a.preload = 'auto'; a.src = url; V.ready[w.w] = a; };
  if (cache[w.w] !== undefined) return done(cache[w.w]);
  fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w.w.replace(/^to /, '')))
    .then(r => r.ok ? r.json() : []).then(j => { const ph = [].concat(...(Array.isArray(j) ? j : []).map(e => e.phonetics || [])).filter(p => p.audio);
      const pick = ph.find(p => /-uk\./.test(p.audio)) || ph.find(p => /-us\./.test(p.audio)) || ph[0]; const url = pick ? pick.audio : '';
      const c = M.obj(M.local('audio')); c[w.w] = url; M.local('audio', c); done(url); }).catch(() => { V.ready[w.w] = false; });
};
V.play = (w, o = {}) => {
  V.stop(); const lang = w._l || 'en';
  const a = lang === 'en' ? V.ready[w.w] : null;
  const tts = () => V.say(w.w, lang, o);
  if (a && a.src) {
    V.aud = a; a.currentTime = 0; a.onplaying = () => o.start && o.start(); a.onended = () => o.end && o.end(); a.onerror = () => { V.ready[w.w] = false; tts(); };
    const pr = a.play(); if (pr && pr.catch) pr.catch(() => { V.ready[w.w] = false; tts(); }); return;
  }
  V.prep(w); tts();
};
document.addEventListener('pointerdown', V.unlock, { once: true, passive: true });

/* ---------- rappels quotidiens : fichiers calendrier .ics ---------- */
M.icsDaily = (times, name) => {
  const pad = n => String(n).padStart(2, '0'), d = new Date(), day = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const ev = (t, i) => { const [h, m] = t.split(':').map(Number);
    return ['BEGIN:VEVENT', 'UID:motskobo-' + t.replace(':', '') + '-' + i + '@mots-kobo', 'DTSTAMP:' + day + 'T000000Z', 'DTSTART:' + day + 'T' + pad(h) + pad(m) + '00', 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
      'SUMMARY:Mots Kobo : ta révision du jour', 'DESCRIPTION:Quelques minutes suffisent pour garder tes mots en mémoire.', 'URL:https://gregguuus.github.io/mots-kobo/app.html',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Mots Kobo : ta révision du jour', 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT'].join('\r\n'); };
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mots Kobo//FR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + (name || 'Mots Kobo'), ...times.map(ev)].join('\r\n').replace(/\r\n(?=BEGIN:VEVENT)/g, '\r\n') + '\r\nEND:VCALENDAR\r\n';
};

/* ---------- démarrage des données ---------- */
M.init = async () => {
  S.prog = M.obj(M.local('prog')); const ls = M.obj(M.local('stats'));
  S.st = { xp: ls.xp || 0, days: M.obj(ls.days), best: M.obj(ls.best), fresh: M.obj(ls.fresh) };
  S.set = Object.assign({ auto: false, rate: 0.9, voice: {}, remind: [] }, M.obj(M.local('settings')));
  S.lang = M.local('lang') || 'en';
  const key = M.getKey(); if (key) { M.local('key', key); S.keyState = 'ok'; }
  setWords(M.local('words') || []);
  await M.loadCachedNotes();
};
M.saveSettings = () => M.local('settings', S.set);
})();

/* Mots Kobo : révision et jeux (plein écran, comme des feuilles iOS). */
(() => {
'use strict';
const M = window.M, S = M.S, esc = M.esc, ico = M.ico, V = M.voice, mean = M.mean;
let timers = [];
const stopTimers = M.stopTimers = () => { timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers = []; };
const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); return t; };
M.keyH = null;
document.addEventListener('keydown', e => { const t = e.target && e.target.tagName; if (M.keyH && t !== 'INPUT' && t !== 'TEXTAREA' && !e.metaKey && !e.ctrlKey) M.keyH(e); });

/* ---------- plein écran ---------- */
let cur = null;
function cover(title) {
  if (cur) cur.close(true);
  const el = document.createElement('div'); el.className = 'cover'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = '<div class="cover-bar"><div class="cover-in"><button class="icon-btn gray" data-x aria-label="Fermer">' + ico('x') + '</button><h2></h2><div class="slot"></div></div><div class="prog" hidden><i></i></div></div><div class="cover-body"></div>';
  document.body.appendChild(el); void el.offsetWidth; el.classList.add('on');
  const api = {
    el, body: el.querySelector('.cover-body'),
    title(t) { el.querySelector('h2').textContent = t; },
    right(t) { el.querySelector('.slot').innerHTML = t; },
    prog(p) { const b = el.querySelector('.prog'); b.hidden = false; b.firstElementChild.style.width = Math.round(p * 100) + '%'; },
    close(quick) { stopTimers(); V.stop(); M.keyH = null; if (cur === api) cur = null; el.classList.remove('on'); setTimeout(() => el.remove(), quick ? 0 : 450); if (!quick) M.emit(); }
  };
  api.title(title); el.querySelector('[data-x]').onclick = () => api.close();
  cur = api; return api;
}
M.closeGame = () => cur && cur.close();

/* ---------- bouton « écouter » ---------- */
const NOSOUND = 'Aucun son ? Vérifie que ton iPhone n’est pas en mode silencieux (interrupteur sur le côté) et que le volume est monté.';
const speakBtn = (cls) => '<button class="speak ' + (cls || '') + '" data-sp aria-label="Écouter le mot">' + ico('speaker') + '<span class="wave"><i></i><i></i><i></i><i></i></span></button>';
function wireSpeak(root, w, tipEl, o = {}) {
  const b = root.querySelector('[data-sp]'); if (!b) return () => {};
  V.prep(w);
  const play = (rate, quiet) => V.play(w, { rate, start: () => b.classList.add('on'), end: () => b.classList.remove('on'),
    fail: r => { b.classList.remove('on'); if (!quiet && tipEl) { tipEl.textContent = r === 'unsupported' ? 'Le son n’est pas disponible sur cet appareil.' : NOSOUND; tipEl.classList.add('warn'); } } });
  b.onclick = e => { e.stopPropagation(); play(); };
  return play;
}
const css = document.createElement('style');
css.textContent = '.speak .wave{display:none}.speak.on .wave{display:inline-flex}.speak.on .i{display:none}.flipwrap,.q-card,.opts,.pairs{animation:pop .3s ease-out}@keyframes pop{from{opacity:0;transform:scale(.97)}}';
document.head.appendChild(css);

/* ---------- révision du jour ---------- */
M.games = {};
M.games.review = (list) => {
  const queue = (list || M.dueQueue()).slice(); if (!queue.length) { M.toast('Rien à revoir pour le moment'); return; }
  const total = queue.length; let done = 0, good = 0, leveled = false; const c = cover('Révision');
  function show() {
    if (!queue.length) return finish();
    const w = queue[0], p = M.P(w); c.prog(done / total); c.right(done + 1 > total ? total + ' / ' + total : (done + 1) + ' / ' + total);
    const dots = p.reps ? '<span class="dots">' + [1, 2, 3, 4, 5, 6].map(i => '<i class="' + (i <= M.lvl(p) ? 'on' : '') + '"></i>').join('') + '</span>' : '<span class="pill">Nouveau</span>';
    const ctx = M.ctxHTML(w.c);
    c.body.innerHTML = '<div class="flipwrap"><div class="flip" id="flip"><div class="face front"><div class="top"><span>' + esc(w.b) + '</span>' + dots + '</div>' +
      '<p class="big">' + esc(w.w) + '</p><div>' + speakBtn() + '</div>' + (ctx ? '<p class="ctx">' + ctx + '</p>' : '') + '<p class="hint">Touche la carte pour la retourner</p></div>' +
      '<div class="face back"><div class="top"><span>' + esc(w.w) + '</span>' + (w.auto ? '<span class="pill o">' + (w.derived ? 'définition du Wiktionnaire' : 'traduction automatique') + '</span>' : '') + '</div><p class="mean">' + esc(mean(w)) + '</p>' +
      (w.t.length ? '<ul class="senses">' + w.t.map(t => '<li><i>' + esc(t[0]) + '</i>' + esc(t[1]) + '</li>').join('') + '</ul>' : '') + (ctx ? '<p class="ctx">' + ctx + '</p>' : '') + '</div></div></div>' +
      '<div id="dock"><button class="btn" id="show">Afficher la réponse</button></div><p class="tip" id="tip"></p><p class="kbd">Clavier : espace, puis 1 à 4</p>';
    const flip = c.body.querySelector('#flip'), dock = c.body.querySelector('#dock'), tip = c.body.querySelector('#tip');
    const play = wireSpeak(c.body, w, tip);
    if (S.set.auto) later(() => play(null, true), 400);
    const go = g => { M.grade(w, g); if (g > 1) { done++; good += g >= 3 ? 1 : 0; } if (M.gain(g === 1 ? 1 : 5)) leveled = true; queue.shift(); if (g === 1) queue.splice(Math.min(queue.length, 3), 0, w); V.stop(); show(); };
    const reveal = () => {
      if (flip.classList.contains('on')) return; flip.classList.add('on');
      dock.innerHTML = '<div class="grades">' + [[1, 'Encore'], [2, 'Difficile'], [3, 'Bien'], [4, 'Facile']].map(([g, t]) => '<button class="grade g' + g + '" data-g="' + g + '">' + t + '<small>' + (g === 1 ? '10 min' : M.ivl(M.schedule(p, g).s)) + '</small></button>').join('') + '</div>';
      dock.querySelectorAll('.grade').forEach(b => b.onclick = () => go(+b.dataset.g));
      M.keyH = e => { if (/^[1-4]$/.test(e.key)) go(+e.key); };
    };
    c.body.querySelector('#show').onclick = reveal; flip.onclick = reveal;
    M.keyH = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); } };
  }
  function finish() {
    c.prog(1); c.right(''); const ac = total ? Math.round(good / total * 100) : 0; M.saveStats();
    c.body.innerHTML = '<div class="result"><div class="big-n">' + total + '</div><p class="muted">mot' + (total > 1 ? 's' : '') + ' revu' + (total > 1 ? 's' : '') + ' · ' + ac + ' % de réussite</p>' +
      '<p class="muted">' + (M.nextDue() ? 'Prochaine révision ' + nextText(M.nextDue()) + '.' : '') + '</p></div><button class="btn" data-x2>Terminé</button>';
    c.body.querySelector('[data-x2]').onclick = () => c.close(); M.keyH = null; if (leveled) M.confetti('Niveau ' + M.level(S.st.xp) + ' !');
  }
  show();
};
function nextText(t) { const h = (t - Date.now()) / 36e5; return h < 1 ? 'dans moins d’une heure' : h < 24 ? 'dans ' + Math.round(h) + ' h' : 'le ' + new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
M.nextText = nextText;

/* ---------- Défi éclair ---------- */
M.games.flash = () => {
  if (S.words.length < 4) { M.toast('Il faut au moins 4 mots'); return; }
  const c = cover('Défi éclair'); let left = 60, score = 0, combo = 0, missed = [], t0 = Date.now(), cw, locked = false, leveled = false;
  const mult = () => combo >= 6 ? 3 : combo >= 3 ? 2 : 1;
  function q() {
    cw = M.pick(25); locked = false; const dir = Math.random() < .6 ? 'en' : 'fr';
    const others = M.shuffle(S.words.filter(x => x.w.toLowerCase() !== cw.w.toLowerCase() && mean(x) !== mean(cw))).slice(0, 3), opts = M.shuffle([cw, ...others]);
    c.right(score + ' pts');
    c.body.innerHTML = '<div class="timer"><i id="tb" style="width:' + (left / 60 * 100) + '%"></i></div><div class="center" style="min-height:24px">' + (mult() > 1 ? '<span class="combo">× ' + mult() + '</span>' : '') + '</div>' +
      '<div class="q-card">' + (dir === 'en' ? '<p class="w">' + esc(cw.w) + '</p><p class="e">Quel est le sens ?</p>' : '<p class="w fr">' + esc(mean(cw)) + '</p><p class="e">Quel mot ?</p>') + '</div>' +
      '<div class="opts">' + opts.map((o, i) => '<button class="opt" data-i="' + i + '">' + esc(dir === 'en' ? mean(o) : o.w) + '</button>').join('') + '</div>';
    c.body.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (locked) return; locked = true; const good = opts[+b.dataset.i] === cw;
      c.body.querySelectorAll('.opt').forEach(x => { if (opts[+x.dataset.i] === cw) x.classList.add('right'); });
      if (good) { combo++; const pts = 10 * mult(); score += pts; if (M.gain(pts)) leveled = true; } else { combo = 0; b.classList.add('wrong'); left = Math.max(0, left - 3); missed.push(cw); }
      M.setProg(cw, good); later(() => left > 0 && q(), good ? 350 : 900);
    });
  }
  q();
  timers.push(setInterval(() => { left = Math.max(0, 60 - Math.floor((Date.now() - t0) / 1000) - missed.length * 3); const tb = c.el.querySelector('#tb'); if (tb) tb.style.width = (left / 60 * 100) + '%'; if (left <= 0) { stopTimers(); end(); } }, 250));
  function end() {
    const rec = score > (S.st.best.flash || 0); if (rec) { S.st.best.flash = score; M.saveStats(); } c.right('');
    const uniq = [...new Map(missed.map(w => [w.w, w])).values()];
    c.body.innerHTML = '<div class="result"><p class="muted">Score</p><div class="big-n">' + score + '</div><p>' + (rec ? 'Nouveau record !' : 'Record : ' + (S.st.best.flash || 0)) + '</p></div>' +
      (uniq.length ? '<h3 class="gt" style="margin:0 4px">À revoir</h3><ul class="missed">' + uniq.map(w => '<li><b>' + esc(w.w) + '</b> · ' + esc(mean(w)) + '</li>').join('') + '</ul>' : '<p class="center muted">Aucune erreur, bravo.</p>') +
      '<button class="btn" id="re">Rejouer</button><button class="btn gray" data-x2>Terminer</button>';
    c.body.querySelector('#re').onclick = () => { c.close(true); M.games.flash(); }; c.body.querySelector('[data-x2]').onclick = () => c.close();
    if (rec) M.confetti('Nouveau record !'); else if (leveled) M.confetti('Niveau ' + M.level(S.st.xp) + ' !');
  }
};

/* ---------- Paires ---------- */
M.games.pairs = () => {
  const set = []; for (const w of M.weak()) { if (set.length >= 5) break; if (!set.some(s => mean(s) === mean(w) || s.w.toLowerCase() === w.w.toLowerCase())) set.push(w); }
  if (set.length < 3) { M.toast('Il faut au moins 3 mots'); return; }
  const c = cover('Paires'), L = M.shuffle(set), R = M.shuffle(set); let sel = null, done = 0, errors = 0; const t0 = Date.now();
  c.body.innerHTML = '<p class="tip" style="margin-top:4px">Touche un mot, puis sa traduction.</p><div class="pairs">' + L.map((w, i) => '<button class="tile en" data-s="L" data-i="' + i + '">' + esc(w.w) + '</button><button class="tile" data-s="R" data-i="' + i + '">' + esc(mean(R[i])) + '</button>').join('') + '</div>';
  const tick = () => c.right(Math.floor((Date.now() - t0) / 1000) + ' s'); tick(); timers.push(setInterval(tick, 500));
  c.body.querySelectorAll('.tile').forEach(t => t.onclick = () => {
    if (!sel || sel.dataset.s === t.dataset.s) { c.body.querySelectorAll('.tile.sel').forEach(x => x.classList.remove('sel')); sel = t; t.classList.add('sel'); if (t.dataset.s === 'L') V.play(L[+t.dataset.i]); return; }
    const a = sel.dataset.s === 'L' ? L[+sel.dataset.i] : R[+sel.dataset.i], b = t.dataset.s === 'L' ? L[+t.dataset.i] : R[+t.dataset.i];
    if (a === b) { [sel, t].forEach(x => x.classList.add('gone')); done++; M.gain(10); M.setProg(a, true); } else { errors++; [sel, t].forEach(x => { x.classList.add('miss'); setTimeout(() => x.classList.remove('miss'), 400); }); M.setProg(a, false); }
    sel.classList.remove('sel'); sel = null;
    if (done === set.length) { stopTimers(); const s = Math.max(1, Math.round((Date.now() - t0) / 1000)), rec = S.st.best.pairs == null || s < S.st.best.pairs; if (rec) { S.st.best.pairs = s; M.saveStats(); } c.right('');
      later(() => { c.body.innerHTML = '<div class="result"><p class="muted">Temps</p><div class="big-n">' + s + ' s</div><p>' + errors + ' erreur' + (errors > 1 ? 's' : '') + (rec ? ' · nouveau record !' : ' · record ' + S.st.best.pairs + ' s') + '</p></div><ul class="missed">' + set.map(w => '<li><b>' + esc(w.w) + '</b> · ' + esc(mean(w)) + '</li>').join('') + '</ul><button class="btn" id="re">Rejouer</button><button class="btn gray" data-x2>Terminer</button>';
        c.body.querySelector('#re').onclick = () => { c.close(true); M.games.pairs(); }; c.body.querySelector('[data-x2]').onclick = () => c.close(); if (rec) M.confetti('Record : ' + s + ' s'); }, 450); }
  });
};

/* ---------- Phrase à trous ---------- */
M.games.cloze = () => {
  const pool = M.weak().filter(w => M.ctxPlain(w.c) && M.ctxSegs(w.c).some(x => x[1])); if (pool.length < 4) { M.toast('Pas assez de phrases pour ce jeu'); return; }
  const c = cover('Phrase à trous');
  function next() {
    const w = pool[Math.floor(Math.random() * Math.min(12, pool.length))], others = M.shuffle(pool.filter(x => x.w.toLowerCase() !== w.w.toLowerCase())).slice(0, 3), opts = M.shuffle([w, ...others]); let locked = false;
    c.body.innerHTML = '<div class="q-card" style="text-align:left"><p class="e" style="text-align:center">' + esc(w.b) + '</p><p class="ctx" id="cx" style="font:400 20px/1.6 var(--serif);margin:0">' + M.ctxHTML(w.c, true) + '</p><p class="e" style="text-align:center">Indice : ' + esc(mean(w)) + '</p></div>' +
      '<div class="opts">' + opts.map((o, i) => '<button class="opt" data-i="' + i + '">' + esc(o.w) + '</button>').join('') + '</div><div id="af"></div>';
    c.body.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (locked) return; locked = true; const good = opts[+b.dataset.i] === w;
      c.body.querySelectorAll('.opt').forEach(x => { if (opts[+x.dataset.i] === w) x.classList.add('right'); }); if (!good) b.classList.add('wrong'); else M.gain(10);
      M.setProg(w, good); c.body.querySelector('#cx').innerHTML = M.ctxHTML(w.c); V.play(w);
      c.body.querySelector('#af').innerHTML = '<button class="btn" id="nx">Suivante</button>'; c.body.querySelector('#nx').onclick = next; M.keyH = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
    });
  }
  next();
};

/* ---------- Écris-le et Dictée ---------- */
const norm = s => String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();
function lev(a, b) { let r = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { const n = [i]; for (let j = 1; j <= b.length; j++) n[j] = Math.min(r[j] + 1, n[j - 1] + 1, r[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); r = n; } return r[b.length]; }
const bare = s => s.replace(/^(to|le|la|les|un|une|des|se) /, '').replace(/^[lsd]'/, '');
M.checkAnswer = (input, w) => { const a = bare(norm(input)), b = bare(norm(w.w)); if (!a) return 0; if (a === b) return 2; return b.length > 4 && lev(a, b) <= 1 ? 1 : 0; };
function typeGame(mode) {
  const dict = mode === 'dict', c = cover(dict ? 'Dictée' : 'Écris-le'), pool = M.weak(), w = pool[Math.floor(Math.random() * Math.min(15, pool.length))];
  let shown = 0, tries = 0, done = false;
  const letters = [...w.w], nL = letters.filter(ch => /\p{L}/u.test(ch)).length;
  const mask = () => { let k = 0; return letters.map(ch => /\p{L}/u.test(ch) ? (k++ < shown ? ch : '_') : ch).join(' '); };
  c.body.innerHTML = '<div class="q-card">' +
    (dict ? speakBtn('big') + '<p class="e">Écoute, puis écris le mot</p><p class="e"><b>Indice :</b> ' + esc(mean(w)) + '</p>' : '<p class="w fr">' + esc(mean(w)) + '</p>') +
    (M.ctxSegs(w.c).some(x => x[1]) ? '<p class="ctx" style="font:400 18px/1.55 var(--serif);margin:4px 0 0;text-align:left">' + M.ctxHTML(w.c, true) + '</p>' : '') + '</div>' +
    '<p class="hintl" id="hn" aria-label="' + nL + ' lettres">' + esc(mask()) + '</p>' +
    '<form id="fm"><input class="typein" id="in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Ta réponse"></form><p class="verdict" id="vd" aria-live="polite"></p><div id="af"></div>' +
    '<div class="pairs" id="ctl"><button class="btn gray" id="hb" type="button">Une lettre</button><button class="btn" id="ok" type="button">Valider</button></div>' +
    (dict ? '<p class="tip" id="tip">Touche le haut-parleur pour écouter. Pas de son ? Vérifie le mode silencieux et le volume.</p>' : '<p class="tip" id="tip"></p>');
  const inp = c.body.querySelector('#in'), vd = c.body.querySelector('#vd'), tip = c.body.querySelector('#tip');
  let play = () => {};
  if (dict) { play = wireSpeak(c.body, w, tip); later(() => play(null, true), 450); }
  later(() => { try { if (!dict) inp.focus(); } catch (e) {} }, 350);
  c.body.querySelector('#hb').onclick = () => { if (done) return; shown++; c.body.querySelector('#hn').textContent = mask(); if (shown >= nL) finish(0); else inp.focus(); };
  function finish(r) {
    done = true; inp.disabled = true; inp.classList.add(r ? 'ok' : 'ko'); if (!r) inp.value = w.w;
    vd.textContent = r === 2 ? 'Exact !' : r === 1 ? 'Presque ! Ça s’écrit « ' + w.w + ' »' : 'C’était « ' + w.w + ' »'; vd.style.color = r ? 'var(--green)' : 'var(--red)';
    const pts = r ? Math.max(2, (dict ? 15 : 12) - shown * 3 - tries * 3) : 0; if (pts) M.gain(pts); M.setProg(w, r > 0);
    c.body.querySelector('#ctl').hidden = true; if (!dict) V.play(w);
    c.body.querySelector('#af').innerHTML = (M.ctxPlain(w.c) ? '<div class="q-card" style="text-align:left"><p class="ctx" style="font:400 18px/1.55 var(--serif);margin:0">' + M.ctxHTML(w.c) + '</p></div>' : '') + '<button class="btn" id="nx">Suivant</button>';
    c.body.querySelector('#nx').onclick = () => { c.close(true); typeGame(mode); }; M.keyH = e => { if (e.key === 'Enter') { e.preventDefault(); c.close(true); typeGame(mode); } };
  }
  c.body.querySelector('#fm').onsubmit = e => { e.preventDefault(); if (done || !inp.value.trim()) return; const r = M.checkAnswer(inp.value, w); if (r) return finish(r);
    tries++; inp.classList.remove('ko'); void inp.offsetWidth; inp.classList.add('ko'); if (tries >= 3) return finish(0); vd.style.color = 'var(--red)'; vd.textContent = tries === 1 ? 'Pas tout à fait, réessaie.' : 'Encore raté. Une lettre peut t’aider.'; };
  c.body.querySelector('#ok').onclick = () => c.body.querySelector('#fm').requestSubmit();
}
M.games.write = () => { if (S.words.length < 2) { M.toast('Pas assez de mots'); return; } typeGame('write'); };
M.games.dict = () => { if (S.words.length < 2) { M.toast('Pas assez de mots'); return; } typeGame('dict'); };
})();

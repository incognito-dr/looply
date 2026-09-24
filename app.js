/* Padel Brositos: americano / mexicano con Google Sheets de respaldo */
(() => {
'use strict';

const CFG = window.PB_CONFIG || {};
const POLL_MS = 7000;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('pb.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pb.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('pb.' + k); } catch (e) {} }
};
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------- estado ---------------- */
const params = new URLSearchParams(location.search);
if (params.get('sheet')) store.set('scriptUrl', params.get('sheet').trim());
let scriptUrl = (store.get('scriptUrl', '') || CFG.SCRIPT_URL || '').trim();
let S = store.get('state', null);          // { torneo, jugadores, partidos, protegido }
let queue = store.get('queue', []);        // escrituras pendientes hacia el Sheet
let pin = store.get('pin', '');
let net = { status: scriptUrl ? 'wait' : 'local', last: 0, error: '' };
const ui = { tab: store.get('tab', 'partidos'), ronda: null, sheet: null, draft: null, form: null, player: null };

const hasT = () => !!(S && S.torneo && S.torneo.nombre && S.partidos && S.partidos.length);
const done = m => Number.isFinite(m.pa) && Number.isFinite(m.pb);
const maxRound = () => hasT() ? Math.max(...S.partidos.map(m => m.ronda)) : 0;
const roundMatches = r => S.partidos.filter(m => m.ronda === r).sort((a, b) => a.cancha - b.cancha);
const groupRounds = () => { const g = S.partidos.filter(m => !m.fase); return g.length ? Math.max(...g.map(m => m.ronda)) : 0; };
const matchPts = m => m.fase === 'semi' ? (S.torneo.puntosSemi || 24) : m.fase === 'final' ? 0 : S.torneo.puntos;
const faseOf = r => { const m = S.partidos.find(x => x.ronda === r); return m ? m.fase || '' : ''; };
const roundLabel = r => ({ semi: 'Semis', final: 'Final' })[faseOf(r)] || `R${r}`;
const hasFase = f => S.partidos.some(m => m.fase === f);
const faseDone = f => { const ms = S.partidos.filter(m => m.fase === f); return ms.length > 0 && ms.every(done); };
const roundDone = r => { const ms = roundMatches(r); return ms.length > 0 && ms.every(done); };

function save() { store.set('state', S); store.set('queue', queue); }

/* ---------------- cruces ---------------- */
const rnd = n => Math.floor(Math.random() * n);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const mat = n => Array.from({ length: n }, () => new Array(n).fill(0));

function pairUp(players, P) {
  let best = null, bc = Infinity;
  for (let t = 0; t < 30; t++) {
    const left = shuffle(players), pairs = []; let c = 0;
    while (left.length) {
      const a = left.shift(); let bi = 0, bv = Infinity;
      for (let i = 0; i < left.length; i++) { const v = P[a][left[i]] + Math.random() * .1; if (v < bv) { bv = v; bi = i; } }
      const b = left.splice(bi, 1)[0]; c += P[a][b] * P[a][b]; pairs.push([a, b]);
    }
    if (c < bc) { bc = c; best = pairs; if (c === 0) break; }
  }
  return best;
}
function matchUp(pairs, O) {
  const oc = (p, q) => O[p[0]][q[0]] + O[p[0]][q[1]] + O[p[1]][q[0]] + O[p[1]][q[1]];
  let best = null, bc = Infinity;
  for (let t = 0; t < 30; t++) {
    const left = shuffle(pairs), ms = []; let c = 0;
    while (left.length) {
      const p = left.shift(); let bi = 0, bv = Infinity;
      for (let i = 0; i < left.length; i++) { const v = oc(p, left[i]) + Math.random() * .1; if (v < bv) { bv = v; bi = i; } }
      const q = left.splice(bi, 1)[0]; c += oc(p, q) ** 2; ms.push([p, q]);
    }
    if (c < bc) { bc = c; best = ms; if (c === 0) break; }
  }
  return best;
}
function tally(ms, P, O) {
  for (const [a, b] of ms) {
    P[a[0]][a[1]]++; P[a[1]][a[0]]++; P[b[0]][b[1]]++; P[b[1]][b[0]]++;
    for (const x of a) for (const y of b) { O[x][y]++; O[y][x]++; }
  }
}
function planCost(n, rounds) {
  const P = mat(n), O = mat(n), rest = new Array(n).fill(0); let c = 0, prev = new Set();
  for (const rd of rounds) {
    tally(rd.matches, P, O);
    for (const i of rd.rest) { rest[i]++; if (prev.has(i)) c += 40; }
    prev = new Set(rd.rest);
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (P[i][j] > 1) c += (P[i][j] - 1) * 60; c += O[i][j] * O[i][j]; }
  if (n) c += (Math.max(...rest) - Math.min(...rest)) * 600;
  return c;
}
function greedyPlan(n, k, rounds) {
  const per = k * 4, P = mat(n), O = mat(n), rest = new Array(n).fill(0); let last = new Set(); const out = [];
  for (let r = 0; r < rounds; r++) {
    const order = shuffle([...Array(n).keys()]).sort((x, y) => (rest[y] - rest[x]) || ((last.has(y) ? 1 : 0) - (last.has(x) ? 1 : 0)));
    const playing = order.slice(0, per), resting = order.slice(per);
    const ms = matchUp(pairUp(playing, P), O);
    tally(ms, P, O); resting.forEach(i => rest[i]++); last = new Set(resting);
    out.push({ matches: ms, rest: resting });
  }
  return out;
}
function circlePlan(n, k, rounds) {
  const arr = shuffle([...Array(n).keys()]), fixed = arr[0], others = arr.slice(1), O = mat(n), P = mat(n), out = [];
  for (let r = 0; r < rounds; r++) {
    const s = r % (n - 1), rot = others.slice(s).concat(others.slice(0, s)), list = [fixed, ...rot];
    const pairs = []; for (let i = 0; i < n / 2; i++) pairs.push([list[i], list[n - 1 - i]]);
    const ms = matchUp(pairs, O); tally(ms, P, O); out.push({ matches: ms, rest: [] });
  }
  return out;
}
/* Torneo "whist" cíclico sobre Z(n-1) ∪ {∞}: compañero 1 vez y rival exactamente 2 veces con cada uno. */
function whistPlan(n, ms = 700) {
  const m = n - 1, INF = m, half = Math.floor(m / 2), t0 = performance.now();
  const d = (x, y) => { const t = ((x - y) % m + m) % m; return Math.min(t, m - t); };
  while (performance.now() - t0 < ms) {
    const p = shuffle([...Array(n).keys()]), pc = new Array(half + 1).fill(0), oc = new Array(half + 1).fill(0);
    let infP = 0, infO = 0, ok = true;
    for (let t = 0; t < n / 4 && ok; t++) {
      const [a0, a1, b0, b1] = p.slice(t * 4, t * 4 + 4);
      for (const [x, y] of [[a0, a1], [b0, b1]]) { if (x === INF || y === INF) infP++; else if (++pc[d(x, y)] > 1) ok = false; }
      for (const x of [a0, a1]) for (const y of [b0, b1]) { if (x === INF || y === INF) infO++; else if (++oc[d(x, y)] > 2) ok = false; }
    }
    if (!ok || infP !== 1 || infO !== 2) continue;
    let good = true; for (let k = 1; k <= half; k++) if (pc[k] !== 1 || oc[k] !== 2) good = false;
    if (!good) continue;
    const map = shuffle([...Array(n).keys()]), rounds = [];
    for (let r = 0; r < m; r++) {
      const q = p.map(x => map[x === INF ? INF : (x + r) % m]);
      rounds.push({ matches: Array.from({ length: n / 4 }, (_, t) => [[q[t * 4], q[t * 4 + 1]], [q[t * 4 + 2], q[t * 4 + 3]]]), rest: [] });
    }
    return shuffle(rounds);
  }
  return null;
}
function planAmericano(n, courts, rounds) {
  const k = Math.min(courts, Math.floor(n / 4)), per = k * 4, t0 = performance.now();
  if (per === n && n % 4 === 0 && rounds === n - 1) { const w = whistPlan(n); if (w) return w; }
  let best = null, bc = Infinity;
  for (let t = 0; t < 2000 && performance.now() - t0 < 600; t++) {
    const plan = (per === n && n % 2 === 0 && t % 2 === 0) ? circlePlan(n, k, rounds) : greedyPlan(n, k, rounds);
    const c = planCost(n, plan);
    if (c < bc) { bc = c; best = plan; }
  }
  return best;
}
function toPartidos(names, plan, offset = 0) {
  const out = [];
  plan.forEach((rd, ri) => shuffle(rd.matches).forEach((m, ci) => out.push({
    id: `r${ri + 1 + offset}c${ci + 1}`, ronda: ri + 1 + offset, cancha: ci + 1,
    a: m[0].map(i => names[i]), b: m[1].map(i => names[i]), pa: null, pb: null
  })));
  return out;
}
function mexicanoRound(state, r) {
  const names = state.jugadores, n = names.length, k = Math.min(state.torneo.canchas, Math.floor(n / 4)), per = k * 4;
  const rests = restCounts(state), prevIn = new Set(state.partidos.filter(m => m.ronda === r - 1).flatMap(m => [...m.a, ...m.b]));
  const lastRest = x => r > 1 && !prevIn.has(x) ? 1 : 0;
  const order = shuffle(names).sort((x, y) => (rests[y] - rests[x]) || (lastRest(y) - lastRest(x)));
  let playing = order.slice(0, per);
  if (r === 1) playing = shuffle(playing);
  else { const rank = new Map(standings(state).map((x, i) => [x.n, i])); playing.sort((x, y) => rank.get(x) - rank.get(y)); }
  const out = [];
  for (let c = 0; c < k; c++) {
    const [p1, p2, p3, p4] = playing.slice(c * 4, c * 4 + 4);
    out.push({ id: `r${r}c${c + 1}`, ronda: r, cancha: c + 1, a: [p1, p4], b: [p2, p3], pa: null, pb: null });
  }
  return out;
}
function semisFinal(state) {
  const top = standings(state).slice(0, 8).map(x => x.n), p = i => top[i - 1];
  const r = Math.max(...state.partidos.map(m => m.ronda)) + 1;
  return [
    { id: 's1', ronda: r, cancha: 1, fase: 'semi', a: [p(1), p(8)], b: [p(4), p(5)], pa: null, pb: null },
    { id: 's2', ronda: r, cancha: 2, fase: 'semi', a: [p(2), p(7)], b: [p(3), p(6)], pa: null, pb: null }
  ];
}
function finalMatch(state) {
  const ss = state.partidos.filter(m => m.fase === 'semi').sort((a, b) => a.cancha - b.cancha);
  const w = m => m.pa > m.pb ? m.a : m.b;
  const r = Math.max(...state.partidos.map(m => m.ronda)) + 1;
  return [{ id: 'f1', ronda: r, cancha: 1, fase: 'final', a: w(ss[0]).slice(), b: w(ss[1]).slice(), pa: null, pb: null }];
}
function suggestRounds(n, courts, formato) {
  if (n < 4) return 0;
  const k = Math.min(courts, Math.floor(n / 4)), per = k * 4;
  if (formato === 'mexicano') return Math.min(Math.max(n - 1, 4), 7);
  if (per === n) return n - 1;
  return Math.min(Math.ceil((n - 1) * n / per), 15);
}

/* ---------------- tabla ---------------- */
function restCounts(state) {
  const r = {}; state.jugadores.forEach(n => r[n] = 0);
  const rounds = [...new Set(state.partidos.map(m => m.ronda))];
  for (const rd of rounds) {
    const inR = new Set(state.partidos.filter(m => m.ronda === rd).flatMap(m => [...m.a, ...m.b]));
    state.jugadores.forEach(n => { if (!inR.has(n)) r[n]++; });
  }
  return r;
}
function standings(state, upto = Infinity) {
  const rows = new Map(state.jugadores.map(n => [n, { n, pts: 0, pj: 0, g: 0, e: 0, p: 0, dif: 0, pos: 0 }]));
  for (const m of state.partidos) {
    if (m.fase || m.ronda > upto || !done(m)) continue;
    const side = (ps, f, c) => ps.forEach(n => {
      const x = rows.get(n); if (!x) return;
      x.pts += f; x.pj++; x.dif += f - c;
      if (f > c) x.g++; else if (f < c) x.p++; else x.e++;
    });
    side(m.a, m.pa, m.pb); side(m.b, m.pb, m.pa);
  }
  const list = [...rows.values()].sort((x, y) => y.pts - x.pts || y.g - x.g || y.dif - x.dif || x.n.localeCompare(y.n, 'es'));
  list.forEach((x, i) => {
    const p = list[i - 1];
    x.pos = p && p.pts === x.pts && p.g === x.g && p.dif === x.dif ? p.pos : i + 1;
  });
  return list;
}

/* ---------------- sincronización ---------------- */
function applyOp(state, op) {
  if (op.a === 'score') {
    const m = state.partidos.find(p => p.id === op.id);
    if (m) { m.pa = op.pa; m.pb = op.pb; }
  } else if (op.a === 'setup') {
    state = { torneo: clone(op.torneo), jugadores: op.jugadores.slice(), partidos: clone(op.partidos), protegido: state && state.protegido };
  } else if (op.a === 'addRound') {
    const ids = new Set(state.partidos.map(p => p.id));
    op.partidos.forEach(p => { if (!ids.has(p.id)) state.partidos.push(clone(p)); });
  }
  return state;
}
function commit(op) {
  S = applyOp(S ? clone(S) : null, op);
  if (scriptUrl) { queue.push(op); flush(); }
  save(); render();
}
async function post(body) {
  const r = await fetch(scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  return r.json();
}
let flushing = false;
async function flush() {
  if (flushing || !scriptUrl) return;
  flushing = true;
  try {
    while (queue.length) {
      let res;
      try { res = await post({ ...queue[0], pin }); }
      catch (e) { setNet('off', 'Sin conexión, reintentando'); break; }
      if (res && res.ok) {
        queue.shift(); save();
        if (res.data) receive(res.data);
        setNet('on');
      } else if (res && res.error === 'pin') {
        setNet('wait', 'Falta la clave');
        if (ui.sheet !== 'pin') openSheet('pin');
        break;
      } else {
        const op = queue.shift(); save();
        toast('El Sheet rechazó el cambio: ' + ((res && res.error) || 'error'));
        if (op) pull(true);
      }
    }
  } finally { flushing = false; renderLive(); }
}
function receive(data) {
  let next = data;
  for (const op of queue) next = applyOp(clone(next), op);
  const first = !net.loaded; net.loaded = true;
  const lleno = d => !!(d && d.torneo && d.torneo.nombre && d.partidos && d.partidos.length);
  if (!lleno(S) && lleno(next) && (!ui.form || ui.formAuto)) {
    ui.form = null; ui.formAuto = false; ui.ronda = null;
    ui.tab = 'partidos'; store.set('tab', 'partidos');
    S = next; save(); render(); return;
  }
  if (first && JSON.stringify(next) === JSON.stringify(S)) { render(); return; }
  if (JSON.stringify(next) !== JSON.stringify(S)) {
    const before = S;
    S = next; save();
    if (before && hasT() && before.torneo && before.torneo.id !== S.torneo.id) ui.ronda = null;
    if (!ui.sheet || ui.sheet === 'player') render();
    else renderLive();
  }
}
let pulling = false;
async function pull(force) {
  if (!scriptUrl || pulling) return;
  if (queue.length && !force) { flush(); return; }
  pulling = true;
  try {
    const r = await fetch(scriptUrl + (scriptUrl.includes('?') ? '&' : '?') + 'a=state&_=' + Date.now());
    const j = await r.json();
    if (j.ok) { receive(j.data); setNet('on'); }
    else setNet('off', j.error || 'Error del Sheet');
  } catch (e) { setNet('off', 'Sin conexión'); }
  finally { pulling = false; }
}
function setNet(status, error = '') { net.status = status; net.error = error; if (status === 'on') net.last = Date.now(); renderLive(); }
let timerPoll = null;
function startPolling() {
  clearInterval(timerPoll);
  if (!scriptUrl) { setNet('local'); return; }
  pull(); timerPoll = setInterval(() => { if (!document.hidden) pull(); }, POLL_MS);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
window.addEventListener('online', () => { flush(); pull(); });

/* ---------------- render ---------------- */
const view = $('#view');
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  if (!hasT() && ui.tab !== 'torneo') ui.tab = 'torneo';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  view.innerHTML = ui.tab === 'partidos' ? vPartidos() : ui.tab === 'tabla' ? vTabla() : vTorneo();
  renderLive(); renderSheet();
  if (ui.focus) { const el = $(ui.focus); if (el) el.focus(); ui.focus = null; }
  const on = $('.rchip.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 10 ? 'ahora' : s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
}
function renderLive() {
  const el = $('#live');
  const map = { local: ['', 'Modo local'], on: ['on', 'En vivo'], off: ['off', 'Sin conexión'], wait: ['wait', 'Conectando'] };
  let [cls, txt] = map[net.status] || map.local;
  if (queue.length && net.status !== 'local') { cls = 'wait'; txt = `${queue.length} por subir`; }
  el.className = 'live ' + cls;
  el.innerHTML = `<i></i>${esc(txt)}`;
}

const courtSVG = `<svg class="ball" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38" fill="#DCFF3D" stroke="#0B1733" stroke-width="4"/><path d="M14 18c14 10 14 38 0 48M70 18c-14 10-14 38 0 48" fill="none" stroke="#0B1733" stroke-width="3.5" stroke-linecap="round"/></svg>`;

function vPartidos() {
  if (!hasT()) return '';
  const total = maxRound(), G = groupRounds(), planned = S.torneo.rondas || G, po = !!S.torneo.playoff;
  if (!ui.ronda || ui.ronda > total) {
    ui.ronda = 1;
    for (let r = 1; r <= total; r++) { ui.ronda = r; if (!roundDone(r)) break; }
  }
  const r = ui.ronda, ms = roundMatches(r);
  const inR = new Set(ms.flatMap(m => [...m.a, ...m.b]));
  const resting = S.jugadores.filter(n => !inR.has(n));
  const chips = [];
  const ghost = t => `<span class="rchip" style="opacity:.35;border-style:dashed;padding:0 10px" aria-hidden="true">${t}</span>`;
  for (let i = 1; i <= total; i++) chips.push(`<button class="rchip ${i === r ? 'on' : ''} ${roundDone(i) ? 'done' : ''}" data-act="ronda" data-r="${i}" style="padding:0 10px"><span>${roundLabel(i)}</span></button>`);
  for (let i = G + 1; i <= planned && !hasFase('semi'); i++) chips.push(ghost('R' + i));
  if (po && !hasFase('semi')) chips.push(ghost('Semis'));
  if (po && !hasFase('final')) chips.push(ghost('Final'));
  const fase = faseOf(r), pts = ms.length ? matchPts(ms[0]) : S.torneo.puntos;
  const courts = ms.map(m => {
    const d = done(m), wa = d && m.pa > m.pb, wb = d && m.pb > m.pa;
    const sc = (v, w, l) => d ? `<span class="score num ${w ? 'win' : l ? 'lose' : ''}">${v}</span>` : `<span class="score empty">Anotar</span>`;
    return `<article class="court">
      <span class="court-tag">${m.fase === 'final' ? 'Final' : m.fase === 'semi' ? 'Semi ' + m.cancha : 'Cancha ' + m.cancha}</span>
      <button class="side a" data-act="score" data-id="${esc(m.id)}" data-side="a" aria-label="Resultado cancha ${m.cancha}">
        <span class="names"><span>${esc(m.a[0])}</span><span>${esc(m.a[1])}</span></span>${sc(m.pa, wa, wb)}
      </button>
      <span class="net"></span>
      <button class="side b" data-act="score" data-id="${esc(m.id)}" data-side="b" aria-label="Resultado cancha ${m.cancha}">
        <span class="names"><span>${esc(m.b[0])}</span><span>${esc(m.b[1])}</span></span>${sc(m.pb, wb, wa)}
      </button>
    </article>`;
  }).join('');
  let next = '';
  const groupOver = G >= planned && Array.from({ length: G }, (_, i) => i + 1).every(roundDone);
  if (S.torneo.formato === 'mexicano' && !fase && r === G && roundDone(r) && G < planned) {
    next = `<button class="btn primary wide next-round" data-act="nextRound">Armar ronda ${G + 1}</button>
      <p class="hint">Mexicano: la próxima ronda junta al 1.º con el 4.º contra el 2.º y el 3.º de cada grupo según la tabla.</p>`;
  } else if (roundDone(r) && r < total) {
    next = `<button class="btn wide next-round" data-act="ronda" data-r="${r + 1}">Ir a ${faseOf(r + 1) === 'semi' ? 'las semis' : faseOf(r + 1) === 'final' ? 'la final' : 'la ronda ' + (r + 1)}</button>`;
  } else if (po && groupOver && !hasFase('semi')) {
    next = `<button class="btn primary wide next-round" data-act="semis">Armar semifinales</button>
      <p class="hint">Pasan los 8 mejores de la tabla: 1 con 8 contra 4 con 5, y 2 con 7 contra 3 con 6. Semis a ${S.torneo.puntosSemi || 24} puntos.</p>`;
  } else if (po && faseDone('semi') && !hasFase('final')) {
    next = `<button class="btn primary wide next-round" data-act="final">Armar la final</button>
      <p class="hint">Juegan las dos parejas que ganaron las semis, a 1 set.</p>`;
  } else if (allDone()) {
    next = `<button class="btn primary wide next-round" data-act="tab" data-tab="tabla">Ver campeones</button>`;
  }
  return `
    <div class="rounds" role="tablist">${chips.join('')}</div>
    <div class="round-head">
      <div><h1 class="h1">${fase === 'semi' ? 'Semifinales' : fase === 'final' ? 'Final' : 'Ronda ' + r}</h1><p class="sub" style="margin:4px 0 0">${fase === 'final' ? 'A 1 set' : fase === 'semi' ? `A ${pts} puntos` : `de ${planned} · partidos a ${pts ? pts + ' puntos' : 'puntos libres'}`}</p></div>
      ${timerChip()}
    </div>
    ${resting.length ? `<p class="rest">Descansan: <b>${resting.map(esc).join(', ')}</b></p>` : ''}
    ${courts}
    ${next}`;
}
const allDone = () => hasT() && (S.torneo.playoff ? faseDone('final') : groupRounds() >= (S.torneo.rondas || 0) && S.partidos.every(done));

function vTabla() {
  if (!hasT()) return '';
  const st = standings(S);
  const played = [...new Set(S.partidos.filter(m => !m.fase && done(m)).map(m => m.ronda))];
  const L = played.length ? Math.max(...played) : 0;
  const prev = L > 1 ? new Map(standings(S, L - 1).map(x => [x.n, x.pos])) : null;
  const doneN = S.partidos.filter(done).length;
  const perRound = S.partidos.filter(m => m.ronda === 1).length;
  const expected = perRound * (S.torneo.rondas || groupRounds()) + (S.torneo.playoff ? 3 : 0);
  const pct = expected ? Math.round(doneN / expected * 100) : 0;
  const fin = allDone();
  let podium = '';
  if (fin && S.torneo.playoff) {
    const f = S.partidos.find(m => m.fase === 'final'), aw = f.pa > f.pb;
    const champ = aw ? f.a : f.b, sub = aw ? f.b : f.a;
    podium = `<div class="podium">
      <div class="pod p2"><div class="who">${sub.map(esc).join('<br>')}</div><div class="pts">Final</div><div class="block">2</div></div>
      <div class="pod p1"><div class="who">${champ.map(esc).join('<br>')}</div><div class="pts">${Math.max(f.pa, f.pb)}–${Math.min(f.pa, f.pb)}</div><div class="block">1</div></div>
      <div class="pod p3"><div class="who">${esc(st[0].n)}</div><div class="pts">1.º grupos</div><div class="block" style="font-size:22px">★</div></div>
      <div class="podium-base"></div></div>`;
    celebrate();
  } else if (fin && st.length >= 3) {
    const pod = (x, c) => `<div class="pod ${c}"><div class="who">${esc(x.n)}</div><div class="pts">${x.pts} pts</div><div class="block">${x.pos}</div></div>`;
    podium = `<div class="podium">${pod(st[1], 'p2')}${pod(st[0], 'p1')}${pod(st[2], 'p3')}<div class="podium-base"></div></div>`;
    celebrate();
  }
  const rows = st.map(x => {
    let mov = '<span class="mov same">·</span>';
    if (prev) { const d = prev.get(x.n) - x.pos; if (d > 0) mov = `<span class="mov up">▲${d}</span>`; else if (d < 0) mov = `<span class="mov down">▼${-d}</span>`; }
    const dif = x.dif > 0 ? '+' + x.dif : x.dif;
    return `<li><button class="row ${x.pos === 1 && x.pj ? 'top1' : ''}" data-act="player" data-n="${esc(x.n)}">
      <span class="pos num">${x.pos}</span>
      <span class="who"><b>${esc(x.n)}</b><small>${x.pj} ${x.pj === 1 ? 'jugado' : 'jugados'} · ${x.g} ${x.g === 1 ? 'ganado' : 'ganados'} · ${dif}</small></span>
      ${mov}
      <span class="pts num">${x.pts}<small>pts</small></span>
    </button></li>`;
  }).join('');
  return `
    <h1 class="h1">${fin ? 'Campeones' : 'Tabla'}</h1>
    <p class="sub">${esc(S.torneo.nombre)} · ${doneN} de ${expected} partidos</p>
    <div class="progress" aria-hidden="true"><i style="width:${Math.min(pct, 100)}%"></i></div>
    ${podium}
    <ol class="board">${rows}</ol>
    <p class="legend">Orden: puntos, luego partidos ganados, luego diferencia. Las flechas comparan con la ronda anterior. Toca a un jugador para ver sus partidos.</p>
    <div class="stack" style="margin-top:22px"><button class="btn wide" data-act="shareTable">Mandar la tabla por WhatsApp</button></div>`;
}

function vTorneo() {
  const conn = vConexion();
  if (!hasT() && scriptUrl && !net.loaded && !queue.length) return `<div class="empty-state">${courtSVG}<h1 class="h1">Cargando el torneo</h1><p class="sub">Buscando los datos en el Sheet…</p></div>`;
  if (!hasT() || ui.form) return vForm() + conn;
  const t = S.torneo, doneN = S.partidos.filter(done).length;
  return `
    <h1 class="h1">${esc(t.nombre)}</h1>
    <p class="sub">${t.formato === 'mexicano' ? 'Mexicano' : 'Americano'} · ${S.jugadores.length} jugadores</p>
    <div class="panel">
      <dl class="kv">
        <dt>Canchas</dt><dd class="num">${t.canchas}</dd>
        <dt>Rondas</dt><dd class="num">${groupRounds()} de ${t.rondas}</dd>
        <dt>Partidos</dt><dd>${t.puntos ? 'a ' + t.puntos + ' puntos' : 'puntos libres'}</dd>
        <dt>Eliminatoria</dt><dd>${t.playoff ? `semis a ${t.puntosSemi || 24}, final a 1 set` : 'no'}</dd>
        <dt>Resultados</dt><dd class="num">${doneN} de ${S.partidos.length}</dd>
      </dl>
    </div>
    <div class="stack">
      <button class="btn blue wide" data-act="share">Compartir enlace del torneo</button>
      <button class="btn wide" data-act="newForm">Armar torneo nuevo</button>
    </div>
    <h2 class="h2">Jugadores</h2>
    <div class="chips" style="margin:0">${S.jugadores.map(n => `<button class="chip" data-act="player" data-n="${esc(n)}" style="padding-right:12px">${esc(n)}</button>`).join('')}</div>
    ${conn}`;
}

function defaultForm() {
  const prevNames = hasT() ? S.jugadores.slice() : store.get('lastPlayers', []);
  const n = prevNames.length;
  return { nombre: 'Americano Brositos', formato: 'americano', jugadores: prevNames, canchas: hasT() ? S.torneo.canchas : Math.max(1, Math.min(8, Math.floor(n / 4))), puntos: 16, rondas: 0, playoff: true, puntosSemi: 24, rondasTocadas: false, clave: '' };
}
function vForm() {
  if (!ui.form) { ui.form = defaultForm(); ui.formAuto = !hasT(); }
  const f = ui.form;
  const n = f.jugadores.length;
  if (!f.rondasTocadas) f.rondas = suggestRounds(n, f.canchas, f.formato);
  const per = Math.min(f.canchas, Math.floor(n / 4)) * 4, rest = n - per;
  let note = '';
  if (n < 4) note = `Añade al menos 4 jugadores (${f.canchas * 4} para llenar ${f.canchas} ${f.canchas === 1 ? 'cancha' : 'canchas'}).`;
  else if (n < f.canchas * 4) note = `Para ${f.canchas} canchas hacen falta ${f.canchas * 4} jugadores. Con ${n} se juega en ${Math.floor(n / 4)}.`;
  else if (rest > 0) note = `En cada ronda juegan ${per} y descansan ${rest}. Los descansos se reparten parejo.`;
  else if (f.formato === 'americano' && f.rondas >= n - 1) note = `Con ${n - 1} rondas cada uno juega una vez con cada compañero.`;
  else note = 'Todos juegan todas las rondas.';
  const cancel = hasT() ? `<button class="btn ghost" data-act="cancelForm">Cancelar</button>` : '';
  const protegido = S && S.protegido;
  return `
    <h1 class="h1">${hasT() ? 'Torneo nuevo' : 'Arma el torneo'}</h1>
    <p class="sub">${hasT() ? 'El torneo actual se guarda en una pestaña de archivo del Sheet.' : 'Anota a los jugadores, elige canchas y a cuántos puntos se juega.'}</p>
    <div class="field">
      <label class="label" for="fNombre">Nombre</label>
      <input class="input" id="fNombre" data-f="nombre" value="${esc(f.nombre)}" maxlength="40" autocomplete="off">
    </div>
    <div class="field">
      <span class="label">Formato</span>
      <div class="seg">
        <button type="button" class="${f.formato === 'americano' ? 'on' : ''}" data-act="fset" data-k="formato" data-v="americano">Americano</button>
        <button type="button" class="${f.formato === 'mexicano' ? 'on' : ''}" data-act="fset" data-k="formato" data-v="mexicano">Mexicano</button>
      </div>
      <p class="hint">${f.formato === 'americano' ? 'Todas las rondas quedan armadas desde el inicio y rotan las parejas.' : 'Cada ronda se arma según la tabla: los que van arriba juegan entre ellos.'}</p>
    </div>
    <div class="field">
      <label class="label" for="fJug">Jugadores <small>(${n})</small></label>
      <form class="add" data-form="addPlayer">
        <input class="input" id="fJug" placeholder="Nombre" maxlength="24" autocomplete="off" enterkeyhint="done">
        <button class="btn primary" type="submit">Añadir</button>
      </form>
      <div class="chips">${f.jugadores.map((p, i) => `<span class="chip">${esc(p)}<button type="button" data-act="delPlayer" data-i="${i}" aria-label="Quitar ${esc(p)}">×</button></span>`).join('')}</div>
      <p class="chip-count">${note}</p>
    </div>
    <div class="pair field">
      <div><span class="label">Canchas</span>
        <div class="stepper"><button type="button" data-act="fstep" data-k="canchas" data-d="-1" aria-label="Menos canchas">−</button><output>${f.canchas}</output><button type="button" data-act="fstep" data-k="canchas" data-d="1" aria-label="Más canchas">+</button></div></div>
      <div><span class="label">Rondas</span>
        <div class="stepper"><button type="button" data-act="fstep" data-k="rondas" data-d="-1" aria-label="Menos rondas">−</button><output>${f.rondas}</output><button type="button" data-act="fstep" data-k="rondas" data-d="1" aria-label="Más rondas">+</button></div></div>
    </div>
    <div class="field">
      <span class="label">Puntos por partido</span>
      <div class="seg">${[16, 21, 24, 32, 0].map(p => `<button type="button" class="${f.puntos === p ? 'on' : ''}" data-act="fset" data-k="puntos" data-v="${p}">${p || 'Libre'}</button>`).join('')}</div>
      <p class="hint">${f.puntos ? `Se juegan ${f.puntos} puntos en total: si una pareja hace ${Math.ceil(f.puntos * .6)}, la otra hace ${f.puntos - Math.ceil(f.puntos * .6)}. Cada jugador suma los puntos de su pareja.` : 'Cada pareja anota lo que hizo, sin total fijo (por tiempo).'}</p>
    </div>
    <div class="field">
      <span class="label">Semis y final</span>
      <div class="seg">
        <button type="button" class="${f.playoff ? 'on' : ''}" data-act="fset" data-k="playoff" data-v="1">Sí</button>
        <button type="button" class="${f.playoff ? '' : 'on'}" data-act="fset" data-k="playoff" data-v="">No</button>
      </div>
      ${f.playoff ? `<p class="hint">Al terminar las rondas pasan los 8 mejores: 1 con 8 contra 4 con 5, y 2 con 7 contra 3 con 6. Las parejas que ganen juegan la final a 1 set.</p>
      <span class="label" style="margin-top:14px">Semis a</span>
      <div class="seg">${[16, 21, 24, 32].map(p => `<button type="button" class="${f.puntosSemi === p ? 'on' : ''}" data-act="fset" data-k="puntosSemi" data-v="${p}">${p}</button>`).join('')}</div>` : ''}
    </div>
    <div class="field">
      <label class="label" for="fClave">Clave para anotar <small>(opcional)</small></label>
      <input class="input" id="fClave" data-f="clave" value="${esc(f.clave)}" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="${protegido ? 'Deja vacío para mantener la actual' : 'Ej. 1234'}">
      <p class="hint">Con clave, cualquiera ve el torneo pero solo quien la tenga puede anotar resultados.</p>
    </div>
    <div class="stack">
      <button class="btn primary wide" data-act="create" ${n < 4 ? 'disabled' : ''}>Armar ${f.formato === 'americano' ? 'rondas' : 'primera ronda'}</button>
      ${cancel}
    </div>`;
}

function vConexion() {
  const on = !!scriptUrl;
  const cfgLocked = !!CFG.SCRIPT_URL && scriptUrl === CFG.SCRIPT_URL.trim();
  const st = !on ? ['', 'Solo en este teléfono'] : net.status === 'on' ? ['on', `Conectado al Sheet · ${ago(net.last)}`] : net.status === 'off' ? ['off', net.error || 'Sin conexión'] : ['', 'Conectando'];
  return `
    <h2 class="h2">Google Sheet</h2>
    <div class="panel">
      <div class="status-line ${st[0]}"><i></i>${esc(st[1])}</div>
      ${on ? `<p class="mono-url">${esc(scriptUrl)}</p>` : `<p class="hint" style="margin:0 0 12px">Sin Sheet todo se guarda en este teléfono. Conecta uno para que todos vean los resultados en vivo desde sus teléfonos.</p>`}
      ${queue.length ? `<p class="hint" style="margin:0 0 12px"><b>${queue.length}</b> cambios esperando subir. <button class="link" data-act="retry">Reintentar</button> · <button class="link" data-act="dropQueue">Descartar</button></p>` : ''}
      ${cfgLocked ? '' : `
      <form class="stack" data-form="connect">
        <label class="sr" for="fUrl">URL del Apps Script</label>
        <input class="input" id="fUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(on ? scriptUrl : '')}" autocomplete="off" inputmode="url">
        <div class="pair"><button class="btn" type="submit">${on ? 'Guardar' : 'Conectar'}</button>${on ? '<button class="btn ghost" type="button" data-act="disconnect">Desconectar</button>' : ''}</div>
      </form>`}
      ${on ? `<p class="hint" style="margin-top:14px">${pin ? 'Tienes la clave guardada en este teléfono. ' : ''}<button class="link" data-act="askPin">${pin ? 'Cambiar clave' : 'Entrar con clave'}</button></p>` : ''}
    </div>`;
}

/* ---------------- hojas inferiores ---------------- */
function openSheet(kind) { ui.sheet = kind; renderSheet(); }
function closeSheet() { ui.sheet = null; ui.draft = null; renderSheet(); render(); }
function renderSheet() {
  const box = $('#sheet'), panel = $('#sheetPanel');
  if (!ui.sheet) { box.hidden = true; panel.innerHTML = ''; document.body.style.overflow = ''; return; }
  box.hidden = false; document.body.style.overflow = 'hidden';
  panel.innerHTML = ui.sheet === 'score' ? sScore() : ui.sheet === 'player' ? sPlayer() : ui.sheet === 'pin' ? sPin() : ui.sheet === 'timer' ? sTimer() : '';
  const f = panel.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 250);
}
function sScore() {
  const d = ui.draft, m = S.partidos.find(p => p.id === d.id); if (!m) return '';
  const P = matchPts(m), max = m.fase === 'final' ? 7 : P || 30, cur = d['p' + d.side];
  const nums = []; for (let i = 0; i <= max; i++) nums.push(`<button type="button" class="${cur === i ? 'on' : ''}" data-act="pick" data-v="${i}">${i}</button>`);
  const show = v => Number.isFinite(v) ? v : '–';
  return `
    <p class="sheet-title">${m.fase === 'final' ? 'Final' : m.fase === 'semi' ? 'Semi ' + m.cancha : `Ronda ${m.ronda} · Cancha ${m.cancha}`}</p>
    <p class="sheet-sub">${m.fase === 'final' ? 'Anota los games del set de cada pareja.' : P ? `Toca los puntos de una pareja; la otra se completa hasta ${P}.` : 'Toca una pareja y marca sus puntos.'}${m.fase ? ' Tiene que haber ganador.' : ''}</p>
    <div class="dual">
      <button type="button" class="team-pick ${d.side === 'a' ? 'on' : ''}" data-act="side" data-side="a"><span class="tn">${esc(m.a[0])}<br>${esc(m.a[1])}</span><span class="big">${show(d.pa)}</span></button>
      <span class="dash">–</span>
      <button type="button" class="team-pick ${d.side === 'b' ? 'on' : ''}" data-act="side" data-side="b"><span class="tn">${esc(m.b[0])}<br>${esc(m.b[1])}</span><span class="big">${show(d.pb)}</span></button>
    </div>
    <div class="nums">${nums.join('')}</div>
    <div class="sheet-actions">
      ${done(m) ? '<button class="btn danger" data-act="clearScore">Borrar</button>' : '<button class="btn ghost" data-act="close">Cerrar</button>'}
      <button class="btn primary" data-act="saveScore" ${Number.isFinite(d.pa) && Number.isFinite(d.pb) && !(m.fase && d.pa === d.pb) ? '' : 'disabled'}>Guardar resultado</button>
    </div>`;
}
function playerHistory(n) {
  return S.partidos.filter(m => m.a.includes(n) || m.b.includes(n)).sort((x, y) => x.ronda - y.ronda).map(m => {
    const mine = m.a.includes(n) ? 'a' : 'b', team = m[mine], opp = mine === 'a' ? m.b : m.a;
    const f = mine === 'a' ? m.pa : m.pb, c = mine === 'a' ? m.pb : m.pa;
    return { m, partner: team.find(x => x !== n), opp, f, c, d: done(m) };
  });
}
function sPlayer() {
  const n = ui.player, x = standings(S).find(r => r.n === n); if (!x) return '';
  const h = playerHistory(n), rests = restCounts(S)[n];
  const items = h.map(({ m, partner, opp, f, c, d }) => {
    const res = d ? `<span class="res ${f > c ? 'w' : f < c ? 'l' : 't'}">${f}–${c}<small>${f > c ? 'Ganó' : f < c ? 'Perdió' : 'Empate'}</small></span>` : '<span class="res t">—</span>';
    return `<li><span class="r">${m.fase === 'semi' ? 'SF' : m.fase === 'final' ? 'F' : 'R' + m.ronda}</span><span>con <b>${esc(partner)}</b><br><small style="color:var(--muted)">contra ${esc(opp[0])} y ${esc(opp[1])}</small></span>${res}</li>`;
  }).join('');
  return `
    <p class="sheet-title">${esc(n)}</p>
    <p class="sheet-sub">Puesto ${x.pos} de ${S.jugadores.length}${rests ? ` · descansa ${rests} ${rests === 1 ? 'ronda' : 'rondas'}` : ''}</p>
    <div class="statgrid"><div><b>${x.pts}</b><span>puntos</span></div><div><b>${x.g}</b><span>ganados</span></div><div><b>${x.p}</b><span>perdidos</span></div><div><b>${x.dif > 0 ? '+' + x.dif : x.dif}</b><span>diferencia</span></div></div>
    <ul class="hist">${items}</ul>
    <button class="btn wide" style="margin-top:18px" data-act="close">Cerrar</button>`;
}
function sPin() {
  return `
    <p class="sheet-title">Clave del organizador</p>
    <p class="sheet-sub">Este torneo pide clave para anotar resultados. Se guarda en este teléfono.</p>
    <form class="stack" data-form="pin">
      <input class="input" id="fPin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Clave" autofocus>
      <button class="btn primary wide" type="submit">Entrar</button>
      <button class="btn ghost wide" type="button" data-act="close">Ahora no</button>
    </form>`;
}

/* ---------------- reloj ---------------- */
let clock = store.get('clock', null); // { end, min }
function timerChip() {
  if (!clock) return `<button class="timer" data-act="timer"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>Reloj</button>`;
  const left = clock.end - Date.now();
  if (left <= 0) return `<button class="timer over" data-act="timer">Tiempo</button>`;
  const s = Math.ceil(left / 1000);
  return `<button class="timer run" data-act="timer"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</button>`;
}
function sTimer() {
  const mins = [8, 10, 12, 15, 20];
  return `
    <p class="sheet-title">Reloj de ronda</p>
    <p class="sheet-sub">Cuenta atrás en este teléfono. Vibra al terminar.</p>
    <div class="nums" style="grid-template-columns:repeat(5,1fr)">${mins.map(m => `<button data-act="timerStart" data-m="${m}">${m}′</button>`).join('')}</div>
    <div class="sheet-actions">${clock ? '<button class="btn danger" data-act="timerStop">Parar</button>' : '<button class="btn ghost" data-act="close">Cerrar</button>'}<button class="btn" data-act="close">Listo</button></div>`;
}
let buzzed = false;
setInterval(() => {
  if (!clock) return;
  const chip = $('.timer'); if (chip && ui.tab === 'partidos') chip.outerHTML = timerChip();
  if (clock.end <= Date.now() && !buzzed) { buzzed = true; try { navigator.vibrate && navigator.vibrate([400, 150, 400, 150, 600]); } catch (e) {} toast('Se acabó el tiempo de la ronda'); }
}, 1000);

/* ---------------- confeti ---------------- */
function celebrate() {
  const key = 'fiesta.' + (S.torneo.id || S.torneo.nombre);
  if (store.get(key, false)) return; store.set(key, true);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti'), x = c.getContext('2d'), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; x.scale(dpr, dpr);
  const cols = ['#DCFF3D', '#1F4FD1', '#FF5A3C', '#FFFFFF', '#0B1733'];
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .4, c: cols[rnd(cols.length)], ball: Math.random() < .15 }));
  const t0 = performance.now();
  (function f(t) {
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c;
      if (p.ball) { x.beginPath(); x.arc(0, 0, p.r, 0, 7); x.fillStyle = '#DCFF3D'; x.fill(); x.strokeStyle = '#0B1733'; x.lineWidth = 1.5; x.stroke(); }
      else x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      x.restore();
    }
    if (t - t0 < 3500) requestAnimationFrame(f); else x.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

/* ---------------- utilidades ---------------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
function shareUrl() {
  const u = new URL(location.href); u.search = '';
  if (scriptUrl && scriptUrl !== (CFG.SCRIPT_URL || '').trim()) u.searchParams.set('sheet', scriptUrl);
  return u.toString();
}
async function share(text, url) {
  if (navigator.share) { try { await navigator.share({ title: 'Padel Brositos', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n')); toast('Copiado'); }
  catch (e) { prompt('Copia esto:', [text, url].filter(Boolean).join('\n')); }
}
function canWrite() {
  if (!scriptUrl || !S || !S.protegido || pin) return true;
  openSheet('pin'); return false;
}

/* ---------------- eventos ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, f = ui.form;
  switch (act) {
    case 'tab': case 'goto':
      if (el.dataset.tab !== 'torneo' && !hasT()) { toast('Primero arma el torneo'); return; }
      ui.tab = el.dataset.tab; store.set('tab', ui.tab); if (ui.sheet) ui.sheet = null; render(); scrollTo(0, 0); break;
    case 'ronda': ui.ronda = +el.dataset.r; render(); break;
    case 'score': {
      if (!canWrite()) return;
      const m = S.partidos.find(p => p.id === el.dataset.id);
      ui.draft = { id: m.id, side: el.dataset.side, pa: m.pa, pb: m.pb }; openSheet('score'); break;
    }
    case 'side': ui.draft.side = el.dataset.side; renderSheet(); break;
    case 'pick': {
      const d = ui.draft, v = +el.dataset.v, P = matchPts(S.partidos.find(p => p.id === d.id)), o = d.side === 'a' ? 'b' : 'a';
      d['p' + d.side] = v;
      if (P) d['p' + o] = P - v;
      else if (!Number.isFinite(d['p' + o])) d.side = o;
      renderSheet(); break;
    }
    case 'saveScore': { const d = ui.draft; commit({ a: 'score', id: d.id, pa: d.pa, pb: d.pb }); closeSheet(); toast('Resultado guardado'); break; }
    case 'clearScore': { const d = ui.draft; if (!confirm('¿Borrar este resultado?')) return; commit({ a: 'score', id: d.id, pa: null, pb: null }); closeSheet(); break; }
    case 'close': closeSheet(); break;
    case 'player': ui.player = el.dataset.n; openSheet('player'); break;
    case 'nextRound': {
      if (!canWrite()) return;
      const r = maxRound() + 1; commit({ a: 'addRound', partidos: mexicanoRound(S, r) }); ui.ronda = r; render(); break;
    }
    case 'semis': {
      if (!canWrite()) return;
      if (S.jugadores.length < 8) { toast('Hacen falta 8 jugadores para semis'); return; }
      const ps = semisFinal(S); commit({ a: 'addRound', partidos: ps }); ui.ronda = ps[0].ronda; render(); scrollTo(0, 0); break;
    }
    case 'final': {
      if (!canWrite()) return;
      const ps = finalMatch(S); commit({ a: 'addRound', partidos: ps }); ui.ronda = ps[0].ronda; render(); scrollTo(0, 0); break;
    }
    case 'shareTable': {
      const st = standings(S);
      const medal = p => p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `${p}.`;
      const txt = `🎾 ${S.torneo.nombre}\n` + st.map(x => `${medal(x.pos)} ${x.n}  ${x.pts} pts`).join('\n');
      share(txt, shareUrl()); break;
    }
    case 'share': share(`🎾 ${S.torneo.nombre}: rondas y tabla en vivo`, shareUrl()); break;
    case 'newForm': ui.form = defaultForm(); ui.formAuto = false; render(); scrollTo(0, 0); break;
    case 'cancelForm': ui.form = null; render(); break;
    case 'fset': {
      const k = el.dataset.k; f[k] = k === 'puntos' || k === 'puntosSemi' ? +el.dataset.v : k === 'playoff' ? !!el.dataset.v : el.dataset.v;
      if (k === 'formato') f.rondasTocadas = false;
      render(); break;
    }
    case 'fstep': {
      const k = el.dataset.k, d = +el.dataset.d, n = f.jugadores.length;
      if (k === 'canchas') { f.canchas = Math.min(Math.max(1, f.canchas + d), 8); f.rondasTocadas = false; }
      else { f.rondas = Math.min(Math.max(1, f.rondas + d), 30); f.rondasTocadas = true; }
      render(); break;
    }
    case 'delPlayer': f.jugadores.splice(+el.dataset.i, 1); render(); break;
    case 'create': create(); break;
    case 'timer': openSheet('timer'); break;
    case 'timerStart': clock = { end: Date.now() + (+el.dataset.m) * 60000 }; buzzed = false; store.set('clock', clock); closeSheet(); break;
    case 'timerStop': clock = null; store.del('clock'); closeSheet(); break;
    case 'askPin': openSheet('pin'); break;
    case 'retry': flush(); break;
    case 'dropQueue': if (confirm('¿Descartar los cambios que no han subido?')) { queue = []; save(); pull(true); render(); } break;
    case 'disconnect':
      if (!confirm('¿Desconectar el Sheet? El torneo queda guardado en este teléfono.')) return;
      scriptUrl = ''; store.del('scriptUrl'); queue = []; save(); startPolling(); render(); break;
  }
});
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.f;
  if (k && ui.form) ui.form[k] = e.target.value;
});
document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'addPlayer') {
    const inp = $('#fJug'), f = ui.form;
    const names = inp.value.split(/[,\n]/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
    for (const nm of names) {
      if (f.jugadores.some(p => p.toLowerCase() === nm.toLowerCase())) { toast(`${nm} ya está`); continue; }
      if (f.jugadores.length >= 40) { toast('Máximo 40 jugadores'); break; }
      f.jugadores.push(nm.slice(0, 24));
    }
    ui.focus = '#fJug'; render();
  } else if (kind === 'connect') {
    const v = $('#fUrl').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(v)) { toast('Pega la URL que termina en /exec'); return; }
    scriptUrl = v; store.set('scriptUrl', v); setNet('wait');
    try {
      const r = await fetch(v + (v.includes('?') ? '&' : '?') + 'a=state&_=' + Date.now()); const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      if (hasT() && !(j.data.torneo && j.data.torneo.nombre) && confirm('El Sheet está vacío. ¿Subir el torneo de este teléfono?')) {
        queue.push({ a: 'setup', torneo: S.torneo, jugadores: S.jugadores, partidos: S.partidos, nuevaClave: '' });
        save(); await flush();
      } else receive(j.data);
      setNet('on'); toast('Sheet conectado');
    } catch (err) { setNet('off', 'No se pudo leer el Sheet'); toast('No respondió. Revisa que esté implementado para "Cualquier usuario".'); }
    startPolling(); render();
  } else if (kind === 'pin') {
    pin = $('#fPin').value.trim(); store.set('pin', pin);
    try {
      const r = await post({ a: 'ping', pin });
      if (r.ok && r.valida === false) { toast('Clave incorrecta'); pin = ''; store.del('pin'); $('#fPin').value = ''; return; }
    } catch (err) {}
    closeSheet(); toast('Listo, ya puedes anotar'); flush();
  }
});

function create() {
  const f = ui.form, names = f.jugadores.slice();
  if (names.length < 4) return;
  if (hasT() && !confirm('Se reemplaza el torneo actual. ¿Seguimos?')) return;
  if (scriptUrl && S && S.protegido && !pin && !f.clave) { openSheet('pin'); return; }
  const torneo = {
    id: Date.now().toString(36), nombre: (f.nombre || 'Americano Brositos').trim().slice(0, 40), formato: f.formato,
    puntos: f.puntos, canchas: Math.min(f.canchas, Math.floor(names.length / 4)), rondas: f.rondas, creado: new Date().toISOString(),
    playoff: f.playoff ? 1 : 0, puntosSemi: f.puntosSemi || 24
  };
  if (f.playoff && names.length < 8) { toast('Para semis hacen falta al menos 8 jugadores'); return; }
  let partidos;
  if (f.formato === 'americano') partidos = toPartidos(names, planAmericano(names.length, torneo.canchas, torneo.rondas));
  else partidos = mexicanoRound({ torneo, jugadores: names, partidos: [] }, 1);
  const clave = (f.clave || '').trim();
  if (clave) { pin = clave; store.set('pin', pin); }
  store.set('lastPlayers', names);
  const op = { a: 'setup', torneo, jugadores: names, partidos, nuevaClave: clave };
  ui.form = null; ui.formAuto = false; ui.ronda = 1; ui.tab = 'partidos'; store.set('tab', 'partidos');
  commit(op);
  if (clave && S) S.protegido = true;
  scrollTo(0, 0); toast(f.formato === 'americano' ? `${torneo.rondas} rondas armadas` : 'Ronda 1 armada');
}

/* ---------------- arranque ---------------- */
if (!hasT()) ui.tab = 'torneo';
render();
startPolling();
flush();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

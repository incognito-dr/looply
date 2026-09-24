/**
 * Padel Brositos: backend en Google Sheets.
 * Pegar en Extensiones > Apps Script del Sheet, guardar e implementar como
 * aplicación web (Ejecutar como: yo · Acceso: cualquier usuario).
 */
const HOJAS = {
  torneo:    ['clave', 'valor'],
  jugadores: ['jugador'],
  partidos:  ['id', 'ronda', 'cancha', 'a1', 'a2', 'b1', 'b2', 'pts_a', 'pts_b', 'actualizado'],
  tabla:     ['pos', 'jugador', 'pts', 'jugados', 'ganados', 'empates', 'perdidos', 'dif']
};
const CACHE_KEY = 'estado';
const CACHE_SEG = 4;

/* ---------- menú ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Padel Brositos')
    .addItem('Preparar hojas', 'preparar')
    .addItem('Recalcular tabla', 'recalcular')
    .addItem('Cambiar clave de anotar', 'cambiarClave')
    .addToUi();
}
function preparar() { const ss = SpreadsheetApp.getActive(); Object.keys(HOJAS).forEach(n => hoja_(ss, n)); }
function recalcular() { const ss = SpreadsheetApp.getActive(); tabla_(ss, leer_(ss)); limpiarCache_(); }
function cambiarClave() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Clave para anotar', 'Escribe la nueva clave. Vacío = sin clave (cualquiera anota).', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const v = r.getResponseText().trim(), p = PropertiesService.getScriptProperties();
  if (v) p.setProperty('CLAVE', v); else p.deleteProperty('CLAVE');
  limpiarCache_();
  ui.alert(v ? 'Clave guardada.' : 'Clave quitada.');
}

/* ---------- web ---------- */
function doGet(e) {
  const a = (e && e.parameter && e.parameter.a) || 'state';
  if (a === 'state') return out_({ ok: true, data: estado_() });
  return out_({ ok: false, error: 'accion' });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'json' }); }
  const clave = clave_();
  if (b.a === 'ping') return out_({ ok: true, protegido: !!clave, valida: !clave || String(b.pin || '') === clave });
  if (clave && String(b.pin || '') !== clave) return out_({ ok: false, error: 'pin' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return out_({ ok: false, error: 'ocupado' });
  try {
    const ss = SpreadsheetApp.getActive();
    if (b.a === 'score') resultado_(ss, b);
    else if (b.a === 'setup') nuevo_(ss, b);
    else if (b.a === 'addRound') agregar_(ss, b);
    else return out_({ ok: false, error: 'accion' });
    SpreadsheetApp.flush();
    const d = leer_(ss);
    tabla_(ss, d);
    limpiarCache_();
    return out_({ ok: true, data: d });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* Editar resultados a mano en el Sheet también actualiza la tabla y la web. */
function onEdit(e) {
  try {
    const n = e.range.getSheet().getName();
    if (n === 'partidos' || n === 'jugadores' || n === 'torneo') {
      limpiarCache_();
      if (n !== 'torneo') { const ss = e.source; tabla_(ss, leer_(ss)); }
    }
  } catch (x) {}
}

/* ---------- lectura ---------- */
function estado_() {
  const c = CacheService.getScriptCache(), hit = c.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const d = leer_(SpreadsheetApp.getActive());
  try { c.put(CACHE_KEY, JSON.stringify(d), CACHE_SEG); } catch (x) {}
  return d;
}
function leer_(ss) {
  const t = {};
  filas_(hoja_(ss, 'torneo')).forEach(r => { if (r[0] !== '') t[String(r[0])] = r[1] instanceof Date ? r[1].toISOString() : r[1]; });
  ['puntos', 'canchas', 'rondas'].forEach(k => { if (t[k] !== undefined && t[k] !== '') t[k] = Number(t[k]); });
  if (t.id !== undefined) t.id = String(t.id);
  if (t.nombre !== undefined) t.nombre = String(t.nombre);
  const jugadores = filas_(hoja_(ss, 'jugadores')).map(r => String(r[0]).trim()).filter(Boolean);
  const partidos = filas_(hoja_(ss, 'partidos')).filter(r => r[0] !== '').map(r => ({
    id: String(r[0]), ronda: Number(r[1]), cancha: Number(r[2]),
    a: [String(r[3]), String(r[4])], b: [String(r[5]), String(r[6])],
    pa: num_(r[7]), pb: num_(r[8])
  }));
  return { torneo: t, jugadores: jugadores, partidos: partidos, protegido: !!clave_() };
}

/* ---------- escritura ---------- */
function resultado_(ss, b) {
  const pa = b.pa === null ? null : ent_(b.pa), pb = b.pb === null ? null : ent_(b.pb);
  if ((pa === null) !== (pb === null)) throw new Error('resultado incompleto');
  const sh = hoja_(ss, 'partidos'), n = sh.getLastRow() - 1;
  if (n < 1) throw new Error('no hay partidos');
  const ids = sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(b.id));
  if (i < 0) throw new Error('partido no encontrado');
  sh.getRange(i + 2, 8, 1, 3).setValues([[pa === null ? '' : pa, pb === null ? '' : pb, pa === null ? '' : new Date()]]);
}

function nuevo_(ss, b) {
  const t = b.torneo || {};
  const jug = (b.jugadores || []).map(limpio_).filter(Boolean);
  const par = b.partidos || [];
  if (jug.length < 4 || jug.length > 40) throw new Error('jugadores');
  if (par.length > 600) throw new Error('demasiados partidos');

  // archivar el torneo anterior
  const shP = hoja_(ss, 'partidos');
  if (shP.getLastRow() > 1) {
    const viejo = leer_(ss).torneo;
    const nombre = ('archivo ' + (viejo.nombre || 'torneo') + ' ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH.mm')).slice(0, 90);
    const copia = shP.copyTo(ss).setName(nombre);
    copia.setTabColor('#9AA5C4');
    const shT = hoja_(ss, 'tabla');
    if (shT.getLastRow() > 1) {
      const tab = shT.getRange(1, 1, shT.getLastRow(), HOJAS.tabla.length).getValues();
      copia.getRange(1, 12, tab.length, tab[0].length).setValues(tab);
    }
  }

  limpiarHoja_(hoja_(ss, 'torneo'));
  limpiarHoja_(hoja_(ss, 'jugadores'));
  limpiarHoja_(shP);

  const campos = [
    ['id', String(t.id || Date.now())], ['nombre', limpio_(t.nombre) || 'Americano'],
    ['formato', t.formato === 'mexicano' ? 'mexicano' : 'americano'],
    ['puntos', ent_(t.puntos || 0)], ['canchas', ent_(t.canchas || 1)], ['rondas', ent_(t.rondas || 1)],
    ['creado', new Date()]
  ];
  hoja_(ss, 'torneo').getRange(2, 1, campos.length, 2).setValues(campos);
  hoja_(ss, 'jugadores').getRange(2, 1, jug.length, 1).setValues(jug.map(j => [j]));
  escribirPartidos_(shP, par, 2);

  if (typeof b.nuevaClave === 'string' && b.nuevaClave.trim()) PropertiesService.getScriptProperties().setProperty('CLAVE', b.nuevaClave.trim());
}

function agregar_(ss, b) {
  const sh = hoja_(ss, 'partidos'), n = sh.getLastRow() - 1;
  const ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
  const nuevos = (b.partidos || []).filter(p => ids.indexOf(String(p.id)) < 0);
  if (!nuevos.length) return;
  escribirPartidos_(sh, nuevos, sh.getLastRow() + 1);
}

function escribirPartidos_(sh, par, fila) {
  if (!par.length) return;
  const rows = par.map(p => [
    String(p.id), ent_(p.ronda), ent_(p.cancha),
    limpio_(p.a[0]), limpio_(p.a[1]), limpio_(p.b[0]), limpio_(p.b[1]),
    p.pa == null ? '' : ent_(p.pa), p.pb == null ? '' : ent_(p.pb), ''
  ]);
  sh.getRange(fila, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---------- tabla ---------- */
function tabla_(ss, d) {
  const m = {};
  d.jugadores.forEach(n => m[n] = { n: n, pts: 0, pj: 0, g: 0, e: 0, p: 0, dif: 0 });
  d.partidos.forEach(x => {
    if (x.pa === null || x.pb === null) return;
    const lado = (ps, f, c) => ps.forEach(n => {
      const r = m[n]; if (!r) return;
      r.pts += f; r.pj++; r.dif += f - c;
      if (f > c) r.g++; else if (f < c) r.p++; else r.e++;
    });
    lado(x.a, x.pa, x.pb); lado(x.b, x.pb, x.pa);
  });
  const list = Object.keys(m).map(k => m[k]).sort((x, y) => y.pts - x.pts || y.g - x.g || y.dif - x.dif || x.n.localeCompare(y.n));
  let pos = 0;
  const rows = list.map((x, i) => {
    const prev = list[i - 1];
    if (!prev || prev.pts !== x.pts || prev.g !== x.g || prev.dif !== x.dif) pos = i + 1;
    return [pos, x.n, x.pts, x.pj, x.g, x.e, x.p, x.dif];
  });
  const sh = hoja_(ss, 'tabla');
  limpiarHoja_(sh);
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---------- utilidades ---------- */
function hoja_(ss, nombre) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    const h = HOJAS[nombre];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1F4FD1').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function filas_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
}
function limpiarHoja_(sh) { const n = sh.getLastRow() - 1; if (n > 0) sh.getRange(2, 1, n, Math.max(sh.getLastColumn(), 1)).clearContent(); }
function limpiarCache_() { CacheService.getScriptCache().remove(CACHE_KEY); }
function clave_() { return PropertiesService.getScriptProperties().getProperty('CLAVE') || ''; }
function num_(v) { if (v === '' || v === null) return null; const n = Number(v); return isFinite(n) ? n : null; }
function ent_(v) { const n = Math.round(Number(v)); if (!isFinite(n) || n < 0 || n > 999) throw new Error('numero'); return n; }
function limpio_(s) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

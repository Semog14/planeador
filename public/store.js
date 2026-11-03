import { CONFIG } from './config.js';
import { defaultState } from './core.js';

const LS = 'planeador.state.v1';
const LS_FID = 'planeador.fid';
let state = null;
let listeners = [];
let remote = null;
let status = 'local';
let pushTimer = null;

export const getStatus = () => status;
export const getFid = () => remote?.fid || null;
export const onChange = (fn) => listeners.push(fn);
const emit = () => listeners.forEach((f) => f(state));
export const get = () => state;

function migrate(s) { const d = defaultState(); return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}), variety: { ...d.settings.variety, ...((s.settings || {}).variety || {}) } }, child: { ...d.child, ...(s.child || {}) } }; }
function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch {} }
function loadLocal() { try { const s = JSON.parse(localStorage.getItem(LS)); if (s) return migrate(s); } catch {} return null; }

// chaves novas (sb_publishable_...) só vão em 'apikey'; as antigas (JWT) também em Authorization
function authHeaders(k) { const h = { apikey: k, 'Content-Type': 'application/json' }; if (k.startsWith('eyJ')) h.Authorization = `Bearer ${k}`; return h; }
async function rpc(fn, args) {
  const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: authHeaders(CONFIG.supabaseKey), body: JSON.stringify(args) });
  if (!r.ok) { let t = ''; try { t = (await r.text()).slice(0, 160); } catch {} throw new Error(`${fn} (${r.status}) ${t}`); }
  return r.json();
}
function newFid() { const a = new Uint8Array(18); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); }

export async function init() {
  const hashFid = new URLSearchParams(location.hash.slice(1)).get('f');
  state = loadLocal() || defaultState();
  if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
    let fid = hashFid || localStorage.getItem(LS_FID);
    if (hashFid) { localStorage.setItem(LS_FID, hashFid); history.replaceState(null, '', location.pathname); }
    const fresh = !fid;
    if (!fid) { fid = newFid(); localStorage.setItem(LS_FID, fid); }
    remote = { fid, rev: 0 };
    try {
      const row = await rpc('get_state', { fid });
      if (row && row.length && row[0].state && Object.keys(row[0].state).length) { state = migrate(row[0].state); remote.rev = row[0].rev; }
      else { state.rev = 0; const res = await rpc('set_state', { fid, new_state: state, expected_rev: 0 }); remote.rev = res[0]?.rev ?? 1; }
      status = 'sync';
    } catch (e) { status = 'offline'; }
    setInterval(poll, 25000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  }
  saveLocal(); emit();
  return state;
}
async function poll() {
  if (!remote) return;
  try {
    const row = await rpc('get_state', { fid: remote.fid });
    if (row.length && row[0].rev > remote.rev) { state = migrate(row[0].state); remote.rev = row[0].rev; saveLocal(); status = 'sync'; emit(); }
    else status = 'sync';
  } catch { status = 'offline'; }
}
// aplica a alteração sempre sobre o estado mais recente
export async function update(fn, opts = {}) {
  fn(state); state.rev = (state.rev || 0) + 1; saveLocal(); emit();
  if (!remote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(fn), opts.immediate ? 0 : 600);
}
async function push(fn, tries = 0) {
  try {
    const res = await rpc('set_state', { fid: remote.fid, new_state: state, expected_rev: remote.rev });
    const r = res[0];
    if (r.ok) { remote.rev = r.rev; status = 'sync'; }
    else if (tries < 3) { state = migrate(r.state); remote.rev = r.rev; fn(state); state.rev = r.rev + 1; saveLocal(); emit(); return push(fn, tries + 1); }
  } catch { status = 'offline'; }
  emit();
}
export function replaceAll(s) { state = migrate(s); saveLocal(); emit(); if (remote) push(() => {}, 0); }

// ---------- livro de receitas (privado) ----------
const LS_BOOK = 'planeador.book.v1';
export async function loadBook() {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(LS_BOOK)); } catch {}
  if (!b && remote) { try { const r = await rpc('get_book', { fid: remote.fid }); if (r.length) { b = r[0].book; try { localStorage.setItem(LS_BOOK, JSON.stringify(b)); } catch {} } } catch {} }
  return b;
}
export async function saveBook(book) {
  try { localStorage.setItem(LS_BOOK, JSON.stringify(book)); } catch {}
  if (remote) await rpc('set_book', { fid: remote.fid, new_book: book });
}

// ---------- fotos das receitas (privadas, em IndexedDB + base de dados) ----------
function idb() { return new Promise((res, rej) => { const q = indexedDB.open('planeador', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbGet(k) { try { const d = await idb(); return await new Promise((res) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch { return null; } }
async function idbSet(k, v) { try { const d = await idb(); await new Promise((res) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch {} }
export async function loadImgs() {
  const local = await idbGet('imgs'); if (local && Object.keys(local).length) return local;
  const m = {};
  if (remote) for (let i = 0; i < 30; i++) { try { const r = await rpc('get_book', { fid: remote.fid + 'i' + i }); if (!r.length) break; Object.assign(m, r[0].book); } catch { break; } }
  if (Object.keys(m).length) await idbSet('imgs', m);
  return m;
}
export async function saveImgs(m, onProgress) {
  await idbSet('imgs', m);
  if (!remote) return;
  const ids = Object.keys(m); const size = 12;
  for (let i = 0; i * size < ids.length; i++) {
    const chunk = Object.fromEntries(ids.slice(i * size, i * size + size).map((k) => [k, m[k]]));
    await rpc('set_book', { fid: remote.fid + 'i' + i, new_book: chunk });
    onProgress?.(Math.min(100, Math.round(((i + 1) * size / ids.length) * 100)));
  }
}

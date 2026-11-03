// Núcleo partilhado (browser + Node): cálculos, planeador, compras e emails.
export const SLOTS = ['pa', 'sm', 'lu', 'sn', 'di'];
export const SLOT_NAMES = { pa: 'Pequeno-almoço', sm: 'Lanche da manhã', lu: 'Almoço', sn: 'Lanche', di: 'Jantar' };
export const SLOT_CAT = { pa: 'pa', sm: 'sn', lu: 'main', sn: 'sn', di: 'main' };
export const DAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const ACTIVITY = [
  [1.2, 'Sedentário (pouco ou nenhum exercício)'],
  [1.375, 'Ligeiro (1 a 3 treinos por semana)'],
  [1.55, 'Moderado (3 a 5 treinos por semana)'],
  [1.725, 'Intenso (6 a 7 treinos por semana)'],
];
export const RATES = { suave: 0.15, moderado: 0.2, firme: 0.25 };

// ---------- datas (ISO yyyy-mm-dd, sem fusos) ----------
export const toISO = (d) => d.toISOString().slice(0, 10);
export const fromISO = (s) => new Date(s + 'T00:00:00Z');
export const addDays = (s, n) => { const d = fromISO(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
export const dow = (s) => fromISO(s).getUTCDay();
export const diffDays = (a, b) => Math.round((fromISO(a) - fromISO(b)) / 86400000);
export function mondayOf(s) { const w = dow(s); return addDays(s, w === 0 ? -6 : 1 - w); }
export function nextMonday(s) { return addDays(mondayOf(s), 7); }
export function lisbonNow(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
}
export const fmtDate = (s) => { const d = fromISO(s); return `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
export const fmtLong = (s) => { const d = fromISO(s); return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };

// ---------- estado por defeito ----------
export function defaultState() {
  const mk = (id, name, sex) => ({ id, name, email: '', sex, age: 35, height: sex === 'm' ? 176 : 165, weight: sex === 'm' ? 85 : 70, activity: 1.375, rate: 'moderado', kcalOverride: null, split: [25, 10, 30, 10, 25] });
  return {
    v: 1, rev: 0,
    profiles: [mk('p1', 'Ricardo', 'm'), mk('p2', 'Esposa', 'f')],
    child: { name: 'Criança', ageMonths: 24, kcal: 1200, split: [25, 10, 30, 10, 25], excludeAvoid: true },
    settings: { prepDay: 6, freeDay: 0, mailDay: 5, mailHour: 10, thawHour: 20, variety: { pa: 2, sm: 2, lu: 3, sn: 2, di: 3 }, sweetMax: 3, includeSnacks: true },
    recipeEdits: {}, customRecipes: {}, hiddenRecipes: [],
    plans: {}, checked: {}, done: {}, weightLog: {}, pushSubs: [], sent: {},
  };
}

// ---------- calculadora de calorias e macros ----------
export function calcProfile(p) {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * p.activity;
  const pct = RATES[p.rate] ?? 0.2;
  const floor = p.sex === 'm' ? 1500 : 1200;
  let kcal = Math.round((tdee * (1 - pct)) / 10) * 10;
  let floored = false;
  if (kcal < floor) { kcal = floor; floored = true; }
  if (p.kcalOverride) kcal = Math.round(p.kcalOverride);
  const deficit = Math.max(0, tdee - kcal);
  const weekly = (deficit * 7) / 7700;
  const protein = Math.round(Math.min(2.0, 1.6) * p.weight);
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const bmi = p.weight / Math.pow(p.height / 100, 2);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, floored, deficit: Math.round(deficit), weekly: Math.round(weekly * 100) / 100, protein, fat, carbs, bmi: Math.round(bmi * 10) / 10 };
}
export const slotKcal = (kcal, split, i) => (kcal * split[i]) / 100;

// ---------- receitas ----------
export function mergeRecipes(base, state) {
  const out = [];
  for (const r of base) {
    if ((state.hiddenRecipes || []).includes(r.id)) continue;
    const e = state.recipeEdits?.[r.id];
    out.push(e ? applyEdit(r, e) : r);
  }
  for (const r of Object.values(state.customRecipes || {})) out.push(r);
  return out;
}
export function applyEdit(r, e) {
  const m = { ...r, ...e };
  if (e.whole || e.units) {
    const whole = e.whole || r.whole; const units = e.units ?? r.units;
    m.whole = whole; m.units = units;
    m.per = whole && units ? Object.fromEntries(Object.entries(whole).map(([k, v]) => [k, Math.round((v / units) * 10) / 10])) : null;
    m.plan = !!m.per;
  }
  return m;
}
export const recipeById = (rs, id) => rs.find((r) => r.id === id);

// ---------- planeador ----------
function rng(seed) { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function eatDates(state, week) {
  const free = state.settings.freeDay;
  const out = [];
  for (let i = 0; i < 7; i++) { const d = addDays(week, i); if (dow(d) !== free) out.push(d); }
  return out;
}
export function prepDateFor(state, week) {
  // último dia de prep antes (ou igual) ao 1.º dia de refeições da semana
  const first = eatDates(state, week)[0];
  let d = addDays(first, -1);
  for (let i = 0; i < 7; i++) { if (dow(d) === state.settings.prepDay) return d; d = addDays(d, -1); }
  return addDays(first, -1);
}
export function modeFor(r, age) {
  if (r.fridge >= age && r.fridge > 0) return 'fridge';
  if (r.freezer && age > 0) return 'freezer';
  return 'fresh';
}
function scoreRecipe(r, ctx, slot) {
  let s = 0;
  const si = SLOTS.indexOf(slot);
  const avg = ctx.state.profiles.reduce((a, p) => a + calcProfile(p).kcal, 0) / ctx.state.profiles.length;
  const target = (avg * (ctx.state.profiles[0].split[si] || 20)) / 100;
  const ratio = target / Math.max(1, r.per.kcal);
  if (ratio < 0.5 || ratio > 2) s += 40; else s += Math.abs(Math.log(ratio)) * 3;
  if (SLOT_CAT[slot] === 'main') { const dens = (r.per.p * 4) / Math.max(1, r.per.kcal); if (dens < 0.15) s += 2.5; else if (dens > 0.25) s -= 1; }
  const lvl = r.child?.level;
  if (ctx.state.child && ctx.state.child.excludeAvoid !== false) { if (lvl === 'avoid') s += 1000; }
  if (lvl === 'adapt') s += 4; if (lvl === 'tips') s += 1;
  if (r.est) s += 0.5;
  if (r.sweet && SLOT_CAT[slot] !== 'main') s += 2;
  return s;
}
export function generatePlan(state, recipes, week, seed = '') {
  const R = rng(week + seed + (state.rev || 0));
  const dates = eatDates(state, week);
  const prep = prepDateFor(state, week);
  const prev = state.plans?.[addDays(week, -7)];
  const prevIds = new Set(prev ? prev.days.flatMap((d) => Object.values(d.meals).map((m) => m.rid)) : []);
  const used = new Set();
  const pick = {};
  const variety = state.settings.variety;
  let sweetLeft = state.settings.sweetMax;
  for (const slot of ['lu', 'di', 'pa', 'sm', 'sn']) {
    const cat = SLOT_CAT[slot];
    let pool = recipes.filter((r) => r.plan && r.slot === cat && r.per);
    if (cat === 'sn') pool = pool.filter((r) => r.per.kcal >= 60);
    const k = Math.max(1, Math.min(variety[slot] || 2, dates.length));
    const scored = shuffle(pool, R).map((r) => {
      const days = dates.map((d) => modeFor(r, diffDays(d, prep)));
      const fresh = days.filter((m) => m === 'fresh').length / dates.length;
      let s = scoreRecipe(r, { state }, slot) + fresh * (cat === 'main' ? 6 : 2);
      if (prevIds.has(r.id)) s += 3;
      if (used.has(r.id)) s += 50;
      if (cat === 'main') { const kc = r.per.kcal; if (kc < 250) s += 3; if (kc > 900) s += 3; }
      return { r, s: s + R() * 0.8 };
    }).sort((a, b) => a.s - b.s);
    const chosen = [];
    const protSeen = {};
    for (const { r } of scored) {
      if (chosen.length >= k) break;
      const tag = (r.tags && r.tags[0]) || 'x';
      if (cat === 'main' && (protSeen[tag] || 0) >= 2) continue;
      if (r.sweet && cat !== 'main') { if (sweetLeft <= 0) continue; }
      chosen.push(r); used.add(r.id); protSeen[tag] = (protSeen[tag] || 0) + 1;
      if (r.sweet && cat !== 'main') sweetLeft -= Math.ceil(dates.length / k);
    }
    pick[slot] = chosen.length ? chosen : scored.slice(0, 1).map((x) => x.r);
  }
  // atribuir por dia: as receitas mais "frescas" vão para os primeiros dias
  const days = dates.map((d) => ({ date: d, meals: {} }));
  for (const slot of SLOTS) {
    const list = pick[slot];
    const order = list.slice().sort((a, b) => modeRank(b, dates, prep) - modeRank(a, dates, prep));
    days.forEach((day, i) => {
      const per = Math.ceil(days.length / order.length);
      let r = order[Math.min(order.length - 1, Math.floor(i / per))];
      day.meals[slot] = { rid: r.id };
    });
  }
  // lanches: evitar a mesma receita no lanche da manhã e da tarde
  days.forEach((day) => { if (day.meals.sm.rid === day.meals.sn.rid && pick.sn.length > 1) { const alt = pick.sn.find((r) => r.id !== day.meals.sm.rid); if (alt) day.meals.sn = { rid: alt.id }; } });
  const plan = { week, prep, days, gen: 1 };
  return finalizePlan(plan, state, recipes);
}
function modeRank(r, dates, prep) { // mais alto = mais exigente com a idade → vai para os primeiros dias
  return -(r.freezer ? 1 : 0) + (r.fridge || 0) * -0.01 + (r.fridge === 0 ? 5 : 0);
}
// calcula modo (frigorífico/congelador/fresco) e doses para todos
export function finalizePlan(plan, state, recipes) {
  const people = state.profiles.map((p) => ({ id: p.id, kcal: calcProfile(p).kcal, split: p.split }));
  people.push({ id: 'child', kcal: state.child.kcal, split: state.child.split, child: true });
  for (const day of plan.days) {
    const age = diffDays(day.date, plan.prep);
    for (const slot of SLOTS) {
      const m = day.meals[slot]; const r = recipeById(recipes, m.rid);
      if (!r || !r.per) { m.doses = {}; continue; }
      m.mode = modeFor(r, age);
      m.age = age;
      m.doses = {};
    }
    // doses por pessoa, com ajuste final para acertar o total do dia
    for (const pe of people) {
      const items = SLOTS.map((slot, i) => { const m = day.meals[slot]; const r = recipeById(recipes, m.rid); return { slot, i, m, r }; }).filter((x) => x.r && x.r.per);
      const raw = items.map((x, j) => clampDose(slotKcal(pe.kcal, pe.split, x.i) / Math.max(1, x.r.per.kcal), pe.child, x.r));
      let doses = raw.map((d, j) => stepDose(d, pe.child, items[j].r));
      // ajuste em passos de ¼ de porção para o total do dia ficar perto do objetivo
      for (let it = 0; it < 12; it++) {
        const tot = items.reduce((sum, x, j) => sum + doses[j] * x.r.per.kcal, 0);
        const gap = pe.kcal - tot;
        let best = null;
        items.forEach((x, j) => {
          const dir = gap > 0 ? 1 : -1; const nd = Math.round((doses[j] + dir * 0.25) * 100) / 100;
          const [lo, hi] = doseBounds(pe.child);
          if (nd < lo || nd > hi) return;
          const ng = gap - dir * 0.25 * x.r.per.kcal;
          if (Math.abs(ng) < Math.abs(gap) - 1 && (!best || Math.abs(ng) < best.err)) best = { j, nd, err: Math.abs(ng) };
        });
        if (!best) break;
        doses[best.j] = best.nd;
      }
      items.forEach((x, j) => { x.m.doses[pe.id] = doses[j]; });
    }
  }
  return plan;
}
function doseBounds(child) { return child ? [0.25, 1.5] : [0.5, 3]; }
function clampDose(d, child) { const [lo, hi] = doseBounds(child); return Math.max(lo, Math.min(hi, d)); }
function stepDose(d, child) { const [lo, hi] = doseBounds(child); return Math.max(lo, Math.min(hi, Math.round(d * 4) / 4)); }
export function mealNutrition(r, dose) {
  if (!r?.per) return { kcal: 0, p: 0, f: 0, c: 0 };
  return { kcal: Math.round(r.per.kcal * dose), p: Math.round(r.per.p * dose), f: Math.round(r.per.f * dose), c: Math.round(r.per.c * dose) };
}
export function dayTotals(day, recipes, pid) {
  const t = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const slot of SLOTS) { const m = day.meals[slot]; const r = recipeById(recipes, m.rid); const n = mealNutrition(r, m.doses?.[pid] || 0); t.kcal += n.kcal; t.p += n.p; t.f += n.f; t.c += n.c; }
  return t;
}

// ---------- lotes de prep ----------
export function batchesOf(plan, recipes) {
  const map = {};
  for (const day of plan.days) for (const slot of SLOTS) {
    const m = day.meals[slot]; const r = recipeById(recipes, m.rid); if (!r) continue;
    const need = Object.values(m.doses || {}).reduce((a, b) => a + b, 0);
    const b = (map[r.id] ||= { rid: r.id, r, need: 0, meals: [] });
    b.need += need; b.meals.push({ date: day.date, slot, mode: m.mode });
  }
  const out = Object.values(map).map((b) => {
    const mult = Math.max(0.5, Math.ceil((b.need / (b.r.units || 1)) * 2) / 2);
    const fresh = b.meals.every((x) => x.mode === 'fresh');
    const freezeCount = b.meals.filter((x) => x.mode === 'freezer').length;
    return { ...b, mult, fresh, freezeCount, fridgeCount: b.meals.filter((x) => x.mode === 'fridge').length };
  });
  return out.sort((a, b) => (a.fresh - b.fresh) || a.r.title.localeCompare(b.r.title, 'pt'));
}

// ---------- lista de compras ----------
const STAPLES = /^(generos[oa]s? de sal|fios?|toques?|sal|pimenta|azeite|água|agua|óleo|oleo|orégãos?|oregãos?|cominhos?|paprik|pimentão|pimentao|canela|cúrcuma|curcuma|alho em pó|louro|folhas de louro|temperos?|gengibre em pó|noz-moscada|vinagre)/i;
const CAT_RULES = [
  ['Mercearia', /caldo|natas de coco|leite de coco|leite de amêndoa|bebida/],
  ['Talho', /frango|peru|carne|vaca|bife|peito/],
  ['Peixaria', /salmão|pescada|bacalhau|sardinha|atum|camarão|peixe|marisco/],
  ['Frutas e legumes', /maçã|banana|laranja|limão|lima|manga|pêssego|mirtilo|framboesa|morango|frutos vermelhos|abacate|abóbora|batata|cebola|alho|tomate|curgete|cenoura|espinafre|couve|pimento|cogumelo|pepino|rabanete|beterraba|salsa|hortelã|coentro|brócolo|alface|rúcula|feijão-verde|feijão verde|ervilha|abacaxi|pêra|legumes|gengibre|beringela|alho-francês|nabo|cebolinho|manjericão/],
  ['Laticínios e ovos', /ovo|iogurte|queijo|feta|mozz?arella|ricotta|natas|leite|manteiga de vaca|kefir|requeijão/],
  ['Padaria', /pão|wrap|tortilha|tosta|folha de arroz|tapioca/],
  ['Congelados e conservas', /congelad|lata|conserva|azeitona/],
  ['Mercearia', /./],
];
function catOf(name) { const n = name.toLowerCase(); for (const [c, re] of CAT_RULES) if (re.test(n)) return c; return 'Mercearia'; }
const ADJ = /\b(picad[oa]s?|ralad[oa]s?|cozid[oa]s?|descascad[oa]s?|fatiad[oa]s?|cortad[oa]s?|esmagad[oa]s?|batid[oa]s?|triturad[oa]s?|madur[oa]s?|grandes?|pequen[oa]s?|médi[oa]s?|médio-grandes?|fresc[oa]s?|cr[uú]a?s?|sem pele|sem caroço|opcional|finamente|bem)\b/g;
function normName(s) {
  let n = s.toLowerCase().split(/[,(*;]/)[0].replace(/^(de|do|da|dos|das|uns|umas)\s+/, '').replace(ADJ, '').replace(/\s+/g, ' ').trim().replace(/^((mão|mões|mãos)(-| )cheias?|fin[oa]s?|cheias?|generos[oa]s?|fios?|toques?)\s+(de\s+|para\s+servir\s*)?/, '').replace(/\s+para servir$/, '');
  return n.split(' ').map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');
}
function pluralName(n, q) {
  if (q <= 1.01 || /^(espinafre|salsa|coentro|hortelã|rúcula|manjericão|alface|cebolinho|gengibre|sal|azeite|arroz|aveia)/.test(n)) return n;
  const pl = (w) => (/^(limão|feijão|pimentão|melão)$/.test(w) ? w.slice(0, -2) + 'ões' : w.endsWith('ão') ? w + 's' : w.endsWith('l') ? w.slice(0, -1) + 'is' : w.endsWith('s') ? w : w + 's');
  const parts = n.split(' '); parts[0] = parts[0].split('-').map(pl).join('-'); return parts.join(' ');
}
function dispName(s) { return normName(s); }
const UNIT_LABEL = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', chav: 'chávena(s)', csp: 'colher(es) de sopa', cch: 'colher(es) de chá', dente: 'dente(s)', fatia: 'fatia(s)', punhado: 'punhado(s)', lata: 'lata(s)', folha: 'folha(s)', ramo: 'ramo(s)', pitada: 'pitada(s)', '': '' };
export function fmtQty(q, unit) {
  if (unit === 'g' && q >= 1000) { q /= 1000; unit = 'kg'; }
  if (unit === 'ml' && q >= 1000) { q /= 1000; unit = 'l'; }
  if (['', 'chav', 'csp', 'cch', 'dente', 'fatia', 'lata', 'punhado', 'folha'].includes(unit) && q < 10) { const t = doseTxt(Math.max(0.25, q)); return `${t} ${UNIT_LABEL[unit] ?? unit}`.trim(); }
  const r = q >= 10 ? Math.round(q) : Math.round(q * 10) / 10;
  return `${String(r).replace('.', ',')}${unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l' ? ' ' : ' '}${UNIT_LABEL[unit] ?? unit}`.trim();
}
export function shoppingList(plan, recipes, have = {}) {
  const items = {}; const hidden = []; const staples = {}; const notes = {};
  const bad = (n) => !n || n.length < 2 || /^[^a-zà-ú]/i.test(n);
  for (const b of batchesOf(plan, recipes)) {
    for (const ing of b.r.ing || []) {
      const key0 = normName(ing.name || ing.raw);
      if (bad(key0)) continue;
      if (STAPLES.test(key0) || STAPLES.test((ing.raw || '').toLowerCase())) { staples[key0] = (staples[key0] || new Set()).add(b.r.title); continue; }
      if (ing.qty == null) { notes[key0] = (notes[key0] || new Set()).add(b.r.title); continue; }
      const al = key0 === 'alho'; const key = key0 + '|' + (al ? 'dente' : ing.unit);
      const it = (items[key] ||= { key, name: key0, disp: dispName(ing.name || ing.raw), unit: al ? 'dente' : ing.unit, qty: 0, cat: catOf(key0), from: new Set() });
      it.qty += ing.qty * b.mult; it.from.add(b.r.title);
    }
  }
  const byCat = {};
  for (const it of Object.values(items)) { if (have[it.name]) { hidden.push({ name: it.name, label: `${fmtQty(it.qty, it.unit)} ${it.disp}`.replace(/\s+/g, ' ').trim() }); continue; } (byCat[it.cat] ||= []).push({ ...it, from: [...it.from], label: it.unit === 'dente' ? `${fmtQty(it.qty, '')} ${it.qty > 1.01 ? 'dentes' : 'dente'} de alho`.replace(/\s+/g, ' ') : `${fmtQty(it.qty, it.unit)} ${it.unit === '' ? pluralName(it.disp, it.qty) : it.disp}`.replace(/\s+/g, ' ').trim() }); }
  const order = ['Frutas e legumes', 'Talho', 'Peixaria', 'Laticínios e ovos', 'Padaria', 'Mercearia', 'Congelados e conservas'];
  const cats = order.filter((c) => byCat[c]).map((c) => ({ cat: c, items: byCat[c].sort((a, b) => a.name.localeCompare(b.name, 'pt')) }));
  const toCheck = Object.entries(notes).filter(([k]) => !items[k + '|']).map(([k, v]) => k).sort((a, b) => a.localeCompare(b, 'pt'));
  return { hidden: hidden.sort((a, b) => a.name.localeCompare(b.name, 'pt')), cats, staples: Object.keys(staples).sort((a, b) => a.localeCompare(b, 'pt')), toCheck };
}

// ---------- avisos para a criança ----------
export function childAlerts(plan, recipes) {
  const seen = {}; const out = [];
  for (const day of plan.days) for (const slot of SLOTS) {
    const r = recipeById(recipes, day.meals[slot].rid); if (!r || seen[r.id]) continue; seen[r.id] = 1;
    const lvl = r.child?.level;
    if (lvl === 'avoid' || lvl === 'adapt') out.push({ rid: r.id, title: r.title, level: lvl, notes: [...(r.child.avoid || []), ...(r.child.adapt || [])] });
  }
  return out.sort((a, b) => (a.level === 'avoid' ? -1 : 1) - (b.level === 'avoid' ? -1 : 1));
}
export function thawList(plan, recipes, date) {
  const out = [];
  const target = addDays(date, 1);
  for (const day of plan.days) if (day.date === target) for (const slot of SLOTS) {
    const m = day.meals[slot]; if (m.mode === 'freezer') { const r = recipeById(recipes, m.rid); out.push({ slot, title: r.title }); }
  }
  return out;
}
export function lastFridgeDay(plan, recipes, date) {
  const out = [];
  for (const day of plan.days) if (day.date === date) for (const slot of SLOTS) {
    const m = day.meals[slot]; if (m.mode === 'fridge') { const r = recipeById(recipes, m.rid); if (m.age >= r.fridge) out.push({ slot, title: r.title }); }
  }
  return out;
}

// ---------- email da sexta ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const doseTxt = (d) => { d = Math.round(d * 4) / 4; const f = { 0.25: '¼', 0.5: '½', 0.75: '¾' }; const w = Math.floor(d + 1e-9); const fr = Math.round((d - w) * 100) / 100; if (f[fr] !== undefined && (fr > 0)) return (w ? w + ' ' : '') + f[fr]; return String(Math.round(d * 100) / 100).replace('.', ','); };
export function weeklyEmailHTML(state, recipes, plan, appUrl = '') {
  const profs = state.profiles; const rs = recipes;
  const batches = batchesOf(plan, rs); const shop = shoppingList(plan, rs, state.have?.[mondayOf(plan.days[0].date)] || {}); const alerts = childAlerts(plan, rs);
  let h = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:auto;color:#222">`;
  h += `<h1 style="color:#1f6f4a">Compras e plano da próxima semana</h1>`;
  h += `<p>Semana de ${fmtLong(plan.days[0].date)} a ${fmtLong(plan.days[plan.days.length - 1].date)}. Dia de prep: <b>${fmtLong(plan.prep)}</b>. ${appUrl ? `<a href="${appUrl}">Abrir a app</a>` : ''}</p>`;
  if (alerts.length) {
    h += `<div style="background:#fff4e5;border-left:5px solid #e08a00;padding:10px 14px;margin:12px 0"><b>Atenção para a criança</b><ul style="margin:6px 0">`;
    for (const a of alerts) h += `<li><b>${esc(a.title)}</b>${a.level === 'avoid' ? ' <span style="color:#b00020">(evitar)</span>' : ''}<br><span style="font-size:13px">${a.notes.map(esc).join('<br>')}</span></li>`;
    h += `</ul></div>`;
  }
  h += `<h2>Lista de compras</h2>`;
  for (const c of shop.cats) { h += `<h3 style="margin:14px 0 4px;color:#1f6f4a">${c.cat}</h3><ul style="margin:0;padding-left:20px">`; for (const it of c.items) h += `<li>${esc(it.label)}</li>`; h += `</ul>`; }
  if (shop.staples.length) h += `<h3 style="margin:14px 0 4px">Básicos (confirma se tens em casa)</h3><p style="margin:0;font-size:14px">${shop.staples.map(esc).join(', ')}</p>`;
  if (shop.toCheck.length) h += `<h3 style="margin:14px 0 4px">Sem quantidade no livro (ver nas receitas)</h3><p style="margin:0;font-size:14px">${shop.toCheck.map(esc).join(', ')}</p>`;
  h += `<h2>Dia de prep (${fmtLong(plan.prep)})</h2><ol>`;
  for (const b of batches) {
    const where = b.fresh ? 'cozinhar no próprio dia' : [b.fridgeCount ? `${b.fridgeCount} no frigorífico` : '', b.freezeCount ? `${b.freezeCount} no congelador` : ''].filter(Boolean).join(', ');
    h += `<li><b>${esc(b.r.title)}</b>, fazer ${String(b.mult).replace('.', ',')}× a receita (${where})</li>`;
  }
  h += `</ol><h2>Plano da semana</h2>`;
  for (const day of plan.days) {
    h += `<h3 style="margin:14px 0 4px">${fmtLong(day.date)}</h3><table style="border-collapse:collapse;width:100%;font-size:13px">`;
    for (const slot of SLOTS) {
      const m = day.meals[slot]; const r = recipeById(rs, m.rid); if (!r) continue;
      const doses = profs.map((p) => `${esc(p.name)} ${doseTxt(m.doses[p.id] || 0)}`).join(' · ') + ` · ${esc(state.child.name)} ${doseTxt(m.doses.child || 0)}`;
      const tag = m.mode === 'freezer' ? ' ❄ descongelar na véspera' : m.mode === 'fresh' ? ' 🍳 fazer na hora' : '';
      h += `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee;width:120px">${SLOT_NAMES[slot]}</td><td style="padding:3px 6px;border-bottom:1px solid #eee"><b>${esc(r.title)}</b>${tag}<br><span style="color:#666">${doses} (porções)</span></td></tr>`;
    }
    h += `</table>`;
  }
  h += `<p style="color:#888;font-size:12px;margin-top:24px">Valores calculados a partir das macros do livro. Os alertas para a criança são um apoio e não substituem a opinião do pediatra.</p></div>`;
  return h;
}

// ---------- leitura de ingredientes (para receitas editadas/novas) ----------
const U_LIST = [['colheres de sopa', 'csp'], ['colher de sopa', 'csp'], ['colheres de chá', 'cch'], ['colher de chá', 'cch'], ['chávenas', 'chav'], ['chávena', 'chav'], ['kg', 'kg'], ['g', 'g'], ['ml', 'ml'], ['l', 'l'], ['dentes', 'dente'], ['dente', 'dente'], ['fatias', 'fatia'], ['fatia', 'fatia'], ['punhados', 'punhado'], ['punhado', 'punhado'], ['latas', 'lata'], ['lata', 'lata'], ['folhas', 'folha'], ['ramos', 'ramo'], ['pitadas', 'pitada']];
export function parseIngredientLine(line) {
  const t = line.trim();
  const d = { raw: t, qty: null, unit: '', name: t, section: '' };
  let q = null, rest = t, m;
  if ((m = t.match(/^(\d+)\s*\/\s*(\d+)\s+(.*)$/))) { q = +m[1] / +m[2]; rest = m[3]; }
  else if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:[-–]|\sa\s)\s*(\d+(?:[.,]\d+)?)(?![\d])\s*(.*)$/))) { q = (parseFloat(m[1].replace(',', '.')) + parseFloat(m[2].replace(',', '.'))) / 2; rest = m[3]; }
  else if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/))) { q = parseFloat(m[1].replace(',', '.')); rest = m[2]; }
  else if ((m = t.match(/^(Meia|Meio|Um|Uma|Dois|Duas)\s+(.*)$/i))) { q = { meia: .5, meio: .5, um: 1, uma: 1, dois: 2, duas: 2 }[m[1].toLowerCase()]; rest = m[2]; }
  if (q == null) return d;
  let unit = '', name = rest;
  for (const [u, code] of U_LIST) {
    const mu = rest.match(new RegExp('^' + u + '(?![a-zà-ú])\\s*(?:\\([^)]*\\))?\\s*(?:de\\s+)?(.*)$', 'i'));
    if (mu) { unit = code; name = mu[1]; break; }
  }
  if (unit === 'dente') name = 'alho ' + name.replace(/^(alho)?[, ]*/, '');
  return { ...d, qty: q, unit, name: name.trim() };
}

// ---------- doses inteiras para itens contáveis ----------
export const COUNTABLE = new Set(['fatia', 'bolacha', 'tâmara', 'nugget', 'croquete', 'wrap', 'cookie', 'bolinha', 'pote', 'copo', 'tapioca', 'hambúrguer', 'almôndega', 'patanisca', 'unidade', 'bombom']);
export function applyCountable(plan, recipes) {
  for (const day of plan.days) for (const slot of SLOTS) {
    const m = day.meals[slot]; const r = recipeById(recipes, m.rid); if (!r || !COUNTABLE.has(r.unitLabel)) continue;
    for (const k of Object.keys(m.doses || {})) m.doses[k] = k === 'child' ? Math.max(0.5, Math.round(m.doses[k] * 2) / 2) : Math.max(1, Math.round(m.doses[k]));
  }
  return plan;
}
export function buildPlan(state, recipes, week, seed = '') { return applyCountable(generatePlan(state, recipes, week, seed), recipes); }
export function refinalize(plan, state, recipes) { return applyCountable(finalizePlan(plan, state, recipes), recipes); }

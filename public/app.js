import { CONFIG } from './config.js';
import * as S from './store.js';
import * as C from './core.js';
const { SLOTS, SLOT_NAMES } = C;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const doseTxt2 = (n) => C.doseTxt(n);
const fmt = (n, d = 0) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ',');
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

let BASE = [];
let ui = { tab: lsGet('pl.tab', 'hoje'), who: lsGet('pl.who', 'p1'), week: null, day: null, filter: { q: '', slot: '', child: '', plan: '' }, shopWeek: null };
let RS = [];
let IMG = {};
const PLATE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/></svg>';
const photo = (r) => (IMG[r.id] ? `<img alt="" loading="lazy" decoding="async" src="${IMG[r.id]}">` : PLATE);
const SLOT_HOUR = [9.5, 12, 15, 18.5, 99];
function nowSlot() { const t = C.lisbonNow(); const h = t.hour + t.minute / 60; return SLOTS[SLOT_HOUR.findIndex((x) => h < x)]; }
const WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const COUNTABLE = C.COUNTABLE;

// ---------- utilitários ----------
const today = () => C.lisbonNow().date;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600); }
function plural(label, n) { if (Math.abs(n - 1) < 0.01) return label; if (label.endsWith('ão')) return label.slice(0, -2) + 'ões'; if (label.endsWith('m')) return label.slice(0, -1) + 'ns'; return label + 's'; }
function doseLabel(r, d) {
  const lab = r.unitLabel || 'porção';
  if (COUNTABLE.has(lab) && Math.abs(d - Math.round(d)) < 0.01) return `${fmt(d)} ${plural(lab, d)}`;
  if (d <= 1) return `${C.doseTxt(d)} ${lab}`;
  return `${C.doseTxt(d)} ${plural(lab, d)}`;
}
function batchFor(plan, rid) { return plan ? C.batchesOf(plan, RS).find((x) => x.rid === rid) : null; }
function gramsFor(plan, r, dose) { const b = batchFor(plan, r.id); return C.doseGrams(r, dose, b, plan && S.get().prepWeights?.[plan.week + ':' + r.id]); }
function ingLine(i, f) {
  if (i.qty == null) return `<li><span class="mut">${esc(i.raw)}</span></li>`;
  const w = C.ingGrams({ ...i, qty: i.qty * f }); const nm = esc(i.name);
  const count = i.unit === '' && !/^(mão|mãos|punhado)/i.test(i.name);
  if (w && w.g >= 1 && !count && ['g', 'kg', 'ml', 'l', 'chav', 'csp', 'cch', 'punhado'].includes(i.unit)) {
    const liquid = ['ml', 'l'].includes(i.unit); const orig = ['chav', 'csp', 'cch', 'punhado'].includes(i.unit) ? ` <span class="mut small">(${esc(C.fmtQty(i.qty * f, i.unit))})</span>` : '';
    return `<li><span><b>${C.round5(w.g)} ${liquid ? 'ml' : 'g'}</b> ${nm}${orig}</span></li>`;
  }
  return `<li><span><b>${esc(C.fmtQty(i.qty * f, i.unit))}</b> ${nm}${w && w.g >= 1 && count ? ` <span class="mut small">(≈ ${C.round5(w.g)} g)</span>` : ''}</span></li>`;
}
function people() { const s = S.get(); return [...s.profiles.map((p) => ({ id: p.id, name: p.name })), { id: 'child', name: s.child.name || 'Criança' }]; }
function target(pid) { const s = S.get(); if (pid === 'child') return { kcal: s.child.kcal, protein: Math.round(s.child.kcal * 0.15 / 4), fat: Math.round(s.child.kcal * 0.33 / 9), carbs: Math.round(s.child.kcal * 0.52 / 4) }; return C.calcProfile(s.profiles.find((p) => p.id === pid)); }
function planFor(date) { const s = S.get(); for (const p of Object.values(s.plans)) if (p.days.some((d) => d.date === date)) return p; return null; }
function planOfWeek(week) { return S.get().plans[week] || null; }
function refinalizeAll() { const s = S.get(); const t = today(); for (const w of Object.keys(s.plans)) { const p = s.plans[w]; if (p.days[p.days.length - 1].date >= t) C.finalizePlan(p, s, RS); } }
function recompute() { RS = C.mergeRecipes(BASE, S.get()); }
const rec = (id) => RS.find((r) => r.id === id);

function applyCountable(plan) { return C.applyCountable(plan, RS); }
function makePlan(s, week, seed = '') { return C.buildPlan(s, RS, week, seed); }

// ---------- cabeçalho / navegação ----------
function renderWho() {
  const s = S.get(); const list = people();
  if (!list.find((p) => p.id === ui.who)) ui.who = list[0].id;
  $('#who').innerHTML = list.map((p) => `<button data-who="${p.id}" class="${p.id === ui.who ? 'on' : ''}">${esc(p.name)}</button>`).join('');
  const st = S.getStatus(); const el = $('#sync'); el.className = 'sync ' + st; el.title = st === 'sync' ? 'Sincronizado' : st === 'offline' ? 'Sem ligação: guardado neste telemóvel' : 'Modo local (sem sincronização)';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
}
function render() { recompute(); renderWho(); const v = $('#view'); const fn = { hoje: viewHoje, semana: viewSemana, compras: viewCompras, receitas: viewReceitas, perfil: viewPerfil }[ui.tab]; const y = window.scrollY; v.innerHTML = fn(); if (ui.keepScroll) window.scrollTo(0, y); }

// ---------- HOJE ----------
function summary(tot, tgt) {
  const C2 = 2 * Math.PI * 44; const ratio = tot.kcal / tgt.kcal; const off = C2 * (1 - Math.min(1, ratio));
  const bar = (l, v, t, u = 'g') => `<div class="mb2"><div class="l"><span>${l}</span><span><b>${v}</b> / ${t} ${u}</span></div><div class="bar"><i style="width:${Math.min(100, Math.round((v / Math.max(1, t)) * 100))}%"></i></div></div>`;
  return `<div class="card sum"><div class="ring ${ratio > 1.05 ? 'over' : ''}"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" stroke-dasharray="${C2.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="c"><b>${fmt(tot.kcal)}</b><span>de ${fmt(tgt.kcal)} kcal</span></div></div>
  <div class="mbars">${bar('Proteína', tot.p, tgt.protein)}${bar('Gordura', tot.f, tgt.fat)}${bar('Hidratos líq.', tot.c, tgt.carbs)}</div></div>`;
}
function modeBadge(m, r) {
  if (m.mode === 'freezer') return `<span class="badge ice">❄ descongelar na véspera</span>`;
  if (m.mode === 'fresh') return `<span class="badge warn">🍳 fazer na hora</span>`;
  return `<span class="badge">frigorífico${r && r.fridge ? ' · até ' + r.fridge + ' dias' : ''}</span>`;
}
function childBadge(r) {
  const l = r.child?.level; if (l === 'avoid') return `<span class="badge bad">⚠ não p/ criança</span>`; if (l === 'adapt') return `<span class="badge warn">adaptar p/ criança</span>`; return '';
}
function mealCard(date, slot, m, r, pid, o = {}) {
  const dose = m.doses?.[pid] || 0; const n = C.mealNutrition(r, dose);
  const gr = gramsFor(planFor(date), r, dose); const cnt = COUNTABLE.has(r.unitLabel || '');
  const main = cnt ? doseLabel(r, dose) : gr ? `${gr.exact ? '' : '≈ '}${C.round5(gr.g)} g` : doseLabel(r, dose);
  const sub = cnt ? (gr ? `≈ ${C.round5(gr.g)} g` : '') : gr ? doseLabel(r, dose) : '';
  return `<article class="meal ${o.now ? 'now' : ''} ${o.done ? 'is-done' : ''}"><button class="thumb" data-act="recipe" data-id="${r.id}" aria-label="Ver receita">${photo(r)}</button>
  <div class="mbody"><div class="eyebrow">${SLOT_NAMES[slot]}</div><h4 class="mt" data-act="recipe" data-id="${r.id}" style="margin:2px 0 4px">${esc(r.title)}</h4>
  <div class="dose"><b>${esc(main)}</b>${sub ? ` <span class="mut">(${esc(sub)})</span>` : ''} · ${n.kcal} kcal</div><div class="mac"><span>P <b>${n.p}g</b></span><span>G <b>${n.f}g</b></span><span>H <b>${n.c}g</b></span></div>
  <div class="tags">${modeBadge(m, r)}${childBadge(r)}</div>
  <div class="acts"><a href="#" class="chipbtn" data-act="meal" data-d="${date}" data-slot="${slot}">Quantidades</a>${o.swap ? `<button class="chipbtn" style="border:0" data-act="swap" data-d="${date}" data-slot="${slot}">Trocar</button>` : ''}</div></div>
  ${o.check ? `<label class="check"><input type="checkbox" data-act="done" data-slot="${slot}" ${o.done ? 'checked' : ''} aria-label="Marcar como comido"></label>` : ''}</article>`;
}
function emptyState(title, text, btn) { return `<div class="card empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/></svg><h2 style="margin:8px 0 4px;font-size:19px">${title}</h2><p class="mut">${text}</p>${btn || ''}</div>`; }
function viewHoje() {
  const s = S.get(); const date = today(); const plan = planFor(date); const pid = ui.who; const dow = C.dow(date);
  const me = people().find((p) => p.id === pid);
  let h = `<h2>${esc(C.fmtLong(date).replace(/^./, (c) => c.toUpperCase()))}</h2><p class="sub">Plano de ${esc(me.name)}</p>`;
  if (!Object.keys(IMG).length) h += `<div class="alert ice"><b>Dá cor à app com as fotos do livro</b>Em Perfil > Fotos das receitas, importa o ficheiro imagens-livro.json.</div>`;
  const tom = C.addDays(date, 1); const planT = planFor(tom);
  if (planT) { const th = C.thawList(planT, RS, date); if (th.length) h += `<div class="alert ice"><b>❄ Descongelar hoje para amanhã</b>${th.map((t) => `${SLOT_NAMES[t.slot]}: ${esc(t.title)}`).join('<br>')}</div>`; }
  if (plan) { const lf = C.lastFridgeDay(plan, RS, date); if (lf.length) h += `<div class="alert"><b>Último dia de validade no frigorífico</b>${lf.map((t) => `${SLOT_NAMES[t.slot]}: ${esc(t.title)}`).join('<br>')}</div>`; }
  const up = C.nextMonday(date); const upPlan = planOfWeek(up);
  if (dow === s.settings.prepDay) h += `<div class="alert ice"><b>Hoje é dia de prep</b>${upPlan ? 'Vê os lotes a cozinhar no separador Semana.' : 'Ainda não há plano para a próxima semana. Gera-o no separador Semana.'}</div>`;
  if (!plan) return h + (dow === s.settings.freeDay ? emptyState('Dia livre', 'Hoje não há refeições planeadas. Aproveita.') : emptyState('Sem plano para esta semana', 'Gera um plano para começar.', `<button class="btn" data-act="gen" data-week="${C.mondayOf(date)}">Gerar plano desta semana</button>`));
  const day = plan.days.find((d) => d.date === date);
  if (!day) return h + emptyState('Dia livre', 'Hoje não há refeições planeadas. Aproveita.');
  h += summary(C.dayTotals(day, RS, pid), target(pid));
  const alertsToday = SLOTS.map((sl) => rec(day.meals[sl].rid)).filter((r) => r && (r.child?.level === 'avoid' || r.child?.level === 'adapt'));
  if (alertsToday.length) {
    const seen = new Set();
    h += `<div class="alert ${alertsToday.some((r) => r.child.level === 'avoid') ? 'bad' : ''}"><b>Atenção: ${esc(s.child.name)} come estas refeições</b>${alertsToday.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => `<div style="margin-top:6px"><u>${esc(r.title)}</u><br>${[...(r.child.avoid || []), ...(r.child.adapt || [])].map(esc).join('<br>')}</div>`).join('')}</div>`;
  }
  const ns = nowSlot();
  for (const slot of SLOTS) { const m = day.meals[slot]; const r = rec(m.rid); if (!r) continue; const done = !!s.done?.[date]?.[pid]?.[slot]; h += mealCard(date, slot, m, r, pid, { now: slot === ns && !done, done, check: true }); }
  return h + `<p class="mut small">Valores do livro. Hidratos líquidos = hidratos totais menos fibra.</p>`;
}

// ---------- SEMANA ----------
function viewSemana() {
  const s = S.get(); const t = today();
  if (!ui.week) ui.week = planOfWeek(C.mondayOf(t)) && C.dow(t) !== s.settings.prepDay ? C.mondayOf(t) : C.nextMonday(t);
  const week = ui.week; const plan = planOfWeek(week);
  let h = `<div class="wk"><button class="ghost" data-act="wk" data-d="-7" aria-label="Semana anterior">◀</button><h2>Semana de ${esc(C.fmtDate(week))}</h2><button class="ghost" data-act="wk" data-d="7" aria-label="Semana seguinte">▶</button></div>`;
  if (!plan) return h + emptyState('Ainda sem plano', 'Gera o plano desta semana com as tuas receitas.', `<button class="btn" data-act="gen" data-week="${week}">Gerar plano</button>`);
  if (!ui.day || !plan.days.some((d) => d.date === ui.day)) ui.day = plan.days.find((d) => d.date >= t)?.date || plan.days[0].date;
  h += `<div class="days">${plan.days.map((d) => `<button class="dbtn ${d.date === ui.day ? 'on' : ''}" data-act="day" data-d="${d.date}"><small>${WD[C.dow(d.date)].slice(0, 3)}</small><b>${+d.date.slice(8)}</b></button>`).join('')}</div>`;
  const al = C.childAlerts(plan, RS);
  if (al.length) h += `<div class="alert ${al.some((a) => a.level === 'avoid') ? 'bad' : ''}"><b>Alertas para ${esc(s.child.name)} nesta semana</b>${al.map((a) => `${a.level === 'avoid' ? '🚫' : '⚠'} <u>${esc(a.title)}</u>: ${a.notes.map(esc).join(' ')}`).join('<br><br>')}</div>`;
  const day = plan.days.find((d) => d.date === ui.day); const pid = ui.who;
  h += summary(C.dayTotals(day, RS, pid), target(pid));
  for (const slot of SLOTS) { const m = day.meals[slot]; const r = rec(m.rid); if (!r) continue; h += mealCard(day.date, slot, m, r, pid, { swap: true }); }
  h += `<div class="row" style="margin:16px 0 4px;flex-wrap:wrap"><button class="btn sec" data-act="gen" data-week="${week}" data-re="1">🔀 Novo plano</button><button class="btn sec" data-act="email" data-week="${week}">✉ Ver email da sexta</button></div>`;
  const batches = C.batchesOf(plan, RS);
  h += `<h3>Dia de prep · ${esc(C.fmtLong(plan.prep))}</h3><div class="card"><ul class="clean">`;
  for (const b of batches) {
    const where = b.fresh ? '<span class="badge warn">cozinhar no próprio dia</span>' : `${b.fridgeCount ? `<span class="badge">${b.fridgeCount} no frigorífico</span>` : ''}${b.freezeCount ? `<span class="badge ice">${b.freezeCount} no congelador</span>` : ''}`;
    const k = `prep:${week}:${b.rid}`;
    h += `<li class="${s.checked?.[k] ? 'done' : ''}"><input type="checkbox" data-act="chk" data-k="${k}" ${s.checked?.[k] ? 'checked' : ''}><span class="l" style="flex:1"><b data-act="recipe" data-id="${b.rid}" style="cursor:pointer">${esc(b.r.title)}</b><br><span class="mut">${b.meals.length} refeições para os 3 = <b>${doseTxt2(b.need)}</b> ${plural(b.r.unitLabel || 'porção', 2)} (${people().map((p) => esc(p.name) + ' ' + doseTxt2(b.byP?.[p.id === 'child' ? 'child' : p.id] || 0)).join(' · ')})<br>Fazer <b>${fmt(b.mult, 1)}×</b> a receita (cada uma rende ${fmt(b.r.units || 1, 1)}) → ${fmt(b.mult * (b.r.units || 1), 1)}${b.mult * (b.r.units || 1) - b.need > 0.01 ? ', sobra ' + doseTxt2(b.mult * (b.r.units || 1) - b.need) : ''}</span><br>${where}${(() => { const pw = s.prepWeights?.[week + ':' + b.rid]; const est = C.recipeWeight(b.r); const tot = b.mult * (b.r.units || 1); const gp = people().map((p) => { const d = (b.byP?.[p.id] || 0) / b.meals.length; const g = C.doseGrams(b.r, d, b, pw); return g ? `${esc(p.name)} ${C.round5(g.g)} g` : null; }).filter(Boolean); return `<br><span class="small"><b>Por refeição:</b> ${gp.length ? gp.join(' · ') : 'pesa o tacho para saberes'}${pw ? '' : gp.length ? ' (estimado)' : ''}</span><br><input type="number" inputmode="numeric" placeholder="${est.ok ? '≈ ' + C.round5(est.perUnit * tot) + ' g (estimado) · escreve o real' : 'peso do tacho pronto (g)'}" value="${pw || ''}" data-act="pw" data-k="${week}:${b.rid}" style="max-width:300px;margin-top:8px">`; })()}${b.r.bookNote ? `<br><span class="mut small">${esc(b.r.bookNote)}</span>` : ''}</span></li>`;
  }
  return h + `</ul></div>`;
}

// ---------- COMPRAS ----------
function viewCompras() {
  const s = S.get(); const t = today();
  if (!ui.shopWeek) ui.shopWeek = planOfWeek(C.nextMonday(t)) ? C.nextMonday(t) : (planOfWeek(C.mondayOf(t)) ? C.mondayOf(t) : C.nextMonday(t));
  const week = ui.shopWeek; const plan = planOfWeek(week);
  let h = `<div class="wk"><button class="ghost" data-act="shopwk" data-d="-7" aria-label="Semana anterior">◀</button><h2>Compras · ${esc(C.fmtDate(week))}</h2><button class="ghost" data-act="shopwk" data-d="7" aria-label="Semana seguinte">▶</button></div>`;
  if (!plan) return h + emptyState('Ainda sem lista', 'A lista nasce do plano da semana.', `<button class="btn" data-act="gen" data-week="${week}">Gerar plano</button>`);
  const sh = C.shoppingList(plan, RS, s.have?.[week] || {});
  const allK = sh.cats.flatMap((c) => c.items.map((it) => `shop:${week}:${it.key}`)); const got = allK.filter((k) => s.checked?.[k]).length;
  h += `<div class="prog"><div class="bar"><i style="width:${allK.length ? Math.round((got / allK.length) * 100) : 0}%"></i></div><span>${got}/${allK.length}</span><button class="chipbtn" style="border:0" data-act="copyshop">Copiar</button></div>`;
  for (const c of sh.cats) {
    h += `<h3>${esc(c.cat)}</h3><div class="card" style="padding:4px 16px"><ul class="clean">`;
    for (const it of c.items) { const k = `shop:${week}:${it.key}`; h += `<li class="${s.checked?.[k] ? 'done' : ''}"><input type="checkbox" data-act="chk" data-k="${esc(k)}" ${s.checked?.[k] ? 'checked' : ''}><span class="l">${esc(it.label)}<br><span class="mut small">${esc(it.from.slice(0, 3).join(', '))}${it.from.length > 3 ? '…' : ''}</span></span><button class="chipbtn" style="border:0;flex:none" data-act="have" data-n="${esc(it.name)}" aria-label="Já tenho em casa">Já tenho</button></li>`; }
    h += `</ul></div>`;
  }
  if (!sh.cats.length) h += emptyState('Lista vazia', 'Já tens tudo em casa. Boas compras (ou não).');
  if (sh.hidden.length) h += `<h3>Já tenho em casa (${sh.hidden.length})</h3><div class="card" style="padding:4px 16px"><ul class="clean">${sh.hidden.map((i) => `<li><span class="l mut">${esc(i.label)}</span><button class="chipbtn" style="border:0;flex:none" data-act="unhave" data-n="${esc(i.name)}">Repor</button></li>`).join('')}</ul></div>`;
  if (sh.staples.length) h += `<h3>Básicos (confirma se tens em casa)</h3><div class="card small">${sh.staples.map(esc).join(', ')}</div>`;
  if (sh.toCheck.length) h += `<h3>Sem quantidade no livro</h3><div class="card small">${sh.toCheck.map(esc).join(', ')}</div>`;
  h += `<p class="mut small">As quantidades somam as receitas do plano (arredondadas para meias receitas). Confere sempre as embalagens.</p>`;
  return h;
}

// ---------- RECEITAS ----------
function viewReceitas() {
  const f = ui.filter; const q = f.q.toLowerCase();
  let list = RS.filter((r) => (!q || r.title.toLowerCase().includes(q)) && (!f.slot || r.slot === f.slot) && (!f.child || (f.child === 'ok' ? ['ok', 'tips'].includes(r.child?.level) : r.child?.level === f.child)) && (!f.plan || (f.plan === '1' ? r.plan : !r.plan)));
  list = list.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
  const chip = (k, v, l) => `<button data-act="flt" data-k="${k}" data-v="${v}" class="${f[k] === v ? 'on' : ''}">${l}</button>`;
  let h = `<div class="row"><h2 class="sp">Receitas</h2><button class="btn" data-act="newrec">+ Nova</button></div><input id="q" type="search" placeholder="Pesquisar entre ${RS.length} receitas" value="${esc(f.q)}">
  <div class="chips">${chip('slot', 'pa', 'Pequeno-almoço')}${chip('slot', 'main', 'Almoço e jantar')}${chip('slot', 'sn', 'Snacks')}${chip('child', 'ok', 'Boas p/ criança')}${chip('child', 'avoid', 'Não p/ criança')}${chip('plan', '0', 'Fora do planeador')}</div><div class="rgrid">`;
  for (const r of list) {
    const lvl = r.child?.level === 'tips' ? 'ok' : r.child?.level;
    h += `<div class="rc" data-act="recipe" data-id="${r.id}"><div class="ph">${photo(r)}${r.per ? `<span class="k">${fmt(r.per.kcal)} kcal</span>` : ''}<span class="d ${lvl}" title="${lvl === 'ok' ? 'Boa para a criança' : lvl === 'adapt' ? 'Adaptar para a criança' : 'Não indicada para a criança'}"></span></div><div class="tx">${esc(r.title)}<span>${r.plan ? '' : 'fora do planeador · '}${r.freezer ? 'congela' : r.fridge ? 'frigorífico ' + r.fridge + 'd' : 'na hora'}</span></div></div>`;
  }
  return h + '</div>' + (list.length ? '' : emptyState('Nada encontrado', 'Experimenta outra pesquisa ou limpa os filtros.'));
}
function recipeModal(id) {
  const r = rec(id); if (!r) return;
  const s = S.get();
  let h = `<div class="hero">${photo(r)}</div><h2>${esc(r.title)}</h2>`;
  h += `<div class="card"><div class="kv"><span>Rende</span><span>${fmt(r.units || 0, 1)} ${esc(plural(r.unitLabel || 'porção', 2))}${r.est ? ' (estimado)' : ''}</span>
  <span>Por ${esc(r.unitLabel || 'porção')}</span><span>${r.per ? `${fmt(r.per.kcal)} kcal · P ${fmt(r.per.p)}g · G ${fmt(r.per.f)}g · H líq. ${fmt(r.per.c)}g` : 'não indicado no livro'}</span>
  <span>Tempo</span><span>${esc(r.time || '-')}</span>
  <span>Frigorífico</span><span>${r.fridge ? 'até ' + r.fridge + ' dias' : 'comer no próprio dia'}</span>
  <span>Congelador</span><span>${r.freezer ? 'sim (descongelar no frigorífico na véspera)' : 'não recomendado'}</span></div>
  ${r.est ? '<p class="small mut">Número de porções ou conservação estimados: confere e edita se for preciso.</p>' : ''}${r.bookNote ? `<p class="small mut">Livro: ${esc(r.bookNote)}</p>` : ''}</div>`;
  if (r.child && r.child.level !== 'ok') h += `<div class="alert ${r.child.level === 'avoid' ? 'bad' : ''}"><b>Para ${esc(s.child.name)}</b>${[...(r.child.avoid || []), ...(r.child.adapt || []), ...(r.child.tips || [])].map(esc).join('<br>')}</div>`;
  h += `<h3>Ingredientes</h3><div class="card"><ul class="clean">${(r.ing || []).map((i) => `<li>${i.section && !i.section.startsWith('Temperos') ? '' : ''}<span>${esc(i.raw)}</span></li>`).join('')}</ul></div>`;
  h += `<h3>Preparação</h3><div class="card"><ol style="padding-left:20px;margin:0">${(r.steps || []).map((x) => `<li style="margin:6px 0">${esc(x)}</li>`).join('')}</ol></div>`;
  h += `<div class="row" style="margin-top:12px"><button class="btn sec" data-act="editrec" data-id="${r.id}">Editar</button>${r.src === 'book' && s.recipeEdits?.[r.id] ? `<button class="btn danger" data-act="resetrec" data-id="${r.id}">Repor original</button>` : ''}${r.src !== 'book' ? `<button class="btn danger" data-act="delrec" data-id="${r.id}">Apagar</button>` : `<button class="btn danger" data-act="hiderec" data-id="${r.id}">Esconder</button>`}</div>`;
  openModal(h);
}
function editModal(id) {
  const isNew = !id; const base = isNew ? { id: 'c' + Date.now().toString(36), title: '', slot: 'main', units: 1, unitLabel: 'porção', whole: { kcal: 0, p: 0, f: 0, c: 0 }, fridge: 3, freezer: false, ing: [], steps: [], child: { level: 'tips', avoid: [], adapt: [], tips: [] }, tags: [], src: 'custom', plan: true, time: '' } : rec(id);
  const r = base; const w = r.whole || { kcal: 0, p: 0, f: 0, c: 0 };
  const h = `<h2>${isNew ? 'Nova receita' : 'Editar receita'}</h2><form id="recform" data-id="${r.id}" data-new="${isNew ? 1 : 0}">
  <label>Nome</label><input name="title" value="${esc(r.title)}" required>
  <div class="grid2"><div><label>Tipo</label><select name="slot"><option value="pa" ${r.slot === 'pa' ? 'selected' : ''}>Pequeno-almoço</option><option value="main" ${r.slot === 'main' ? 'selected' : ''}>Almoço/jantar</option><option value="sn" ${r.slot === 'sn' ? 'selected' : ''}>Snack/lanche</option></select></div>
  <div><label>Unidade (porção, fatia…)</label><input name="unitLabel" value="${esc(r.unitLabel || 'porção')}"></div></div>
  <div class="grid2"><div><label>Quantas unidades rende</label><input name="units" inputmode="decimal" value="${r.units || ''}"></div><div><label>Tempo</label><input name="time" value="${esc(r.time || '')}"></div></div>
  <label>Valores da RECEITA INTEIRA</label><div class="grid2"><input name="kcal" inputmode="decimal" placeholder="kcal" value="${w.kcal || ''}"><input name="p" inputmode="decimal" placeholder="proteína (g)" value="${w.p || ''}"><input name="f" inputmode="decimal" placeholder="gordura (g)" value="${w.f || ''}"><input name="c" inputmode="decimal" placeholder="hidratos líq. (g)" value="${w.c || ''}"></div>
  <div class="grid2"><div><label>Dias no frigorífico</label><input name="fridge" inputmode="numeric" value="${r.fridge ?? 3}"></div><div><label>Pode congelar?</label><select name="freezer"><option value="1" ${r.freezer ? 'selected' : ''}>Sim</option><option value="0" ${!r.freezer ? 'selected' : ''}>Não</option></select></div></div>
  <label>Ingredientes (um por linha, para a receita inteira)</label><textarea name="ing">${esc((r.ing || []).map((i) => i.raw).join('\n'))}</textarea>
  <label>Passos (um por linha)</label><textarea name="steps">${esc((r.steps || []).join('\n'))}</textarea>
  <label>Entra no planeador automático?</label><select name="plan"><option value="1" ${r.plan ? 'selected' : ''}>Sim</option><option value="0" ${!r.plan ? 'selected' : ''}>Não</option></select>
  <div class="row" style="margin-top:14px"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" data-act="mclose">Cancelar</button></div></form>`;
  openModal(h);
}
function saveRecipe(form) {
  const fd = Object.fromEntries(new FormData(form).entries()); const id = form.dataset.id; const isNew = form.dataset.new === '1';
  const units = num(fd.units, 1) || 1; const whole = { kcal: num(fd.kcal), p: num(fd.p), f: num(fd.f), c: num(fd.c) };
  const ing = fd.ing.split('\n').map((x) => x.trim()).filter(Boolean).map((l) => C.parseIngredientLine(l));
  const steps = fd.steps.split('\n').map((x) => x.trim()).filter(Boolean);
  const patch = { title: fd.title.trim(), slot: fd.slot, unitLabel: fd.unitLabel.trim() || 'porção', units, whole, time: fd.time, fridge: Math.max(0, Math.round(num(fd.fridge, 0))), freezer: fd.freezer === '1', ing, steps, plan: fd.plan === '1' && whole.kcal > 0 };
  patch.per = whole.kcal > 0 ? Object.fromEntries(Object.entries(whole).map(([k, v]) => [k, Math.round((v / units) * 10) / 10])) : null;
  if (!patch.per) patch.plan = false;
  S.update((s) => {
    if (isNew) { s.customRecipes[id] = { id, src: 'custom', num: 0, sweet: false, est: false, bookNote: '', child: { level: 'tips', avoid: [], adapt: [], tips: ['Receita própria: confirma os ingredientes para a idade da criança.'] }, tags: [], ...patch }; }
    else if (s.customRecipes[id]) Object.assign(s.customRecipes[id], patch);
    else s.recipeEdits[id] = { ...(s.recipeEdits[id] || {}), ...patch };
  });
  recompute(); S.update((s) => { for (const p of Object.values(s.plans)) applyCountable(C.finalizePlan(p, s, RS)); });
  closeModal(); toast('Receita guardada'); render();
}

// ---------- PERFIL ----------
function spark(vals) {
  if (vals.length < 2) return '<p class="mut small">Regista o peso para ver a evolução.</p>';
  const w = 300, hgt = 60, min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${hgt - ((v - min) / (max - min)) * hgt}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none"><polyline fill="none" stroke="var(--pri)" stroke-width="2.5" points="${pts}"/></svg>`;
}
function viewPerfil() {
  const s = S.get(); let h = '<h2>Perfis e definições</h2>';
  for (const p of s.profiles) {
    const c = C.calcProfile(p); const log = (s.weightLog?.[p.id] || []).map((x) => x.w);
    h += `<form class="card pf" data-pid="${p.id}"><div class="row"><b class="sp">${esc(p.name)}</b></div>
    <div class="grid2"><div><label>Nome</label><input name="name" value="${esc(p.name)}"></div><div><label>Email (para a lista de compras)</label><input name="email" type="email" value="${esc(p.email)}"></div></div>
    <div class="grid3"><div><label>Sexo</label><select name="sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Homem</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Mulher</option></select></div><div><label>Idade</label><input name="age" inputmode="numeric" value="${p.age}"></div><div><label>Altura (cm)</label><input name="height" inputmode="numeric" value="${p.height}"></div></div>
    <div class="grid2"><div><label>Peso atual (kg)</label><input name="weight" inputmode="decimal" value="${p.weight}"></div><div><label>Ritmo de perda</label><select name="rate"><option value="suave" ${p.rate === 'suave' ? 'selected' : ''}>Suave (−15%)</option><option value="moderado" ${p.rate === 'moderado' ? 'selected' : ''}>Moderado (−20%)</option><option value="firme" ${p.rate === 'firme' ? 'selected' : ''}>Firme (−25%)</option></select></div></div>
    <label>Atividade física</label><select name="activity">${C.ACTIVITY.map(([v, l]) => `<option value="${v}" ${p.activity === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label>Calorias diárias (deixa vazio para usar o cálculo)</label><input name="kcalOverride" inputmode="numeric" placeholder="${c.kcal}" value="${p.kcalOverride || ''}">
    <label>Divisão das calorias pelas 5 refeições (%)</label><div class="grid5">${p.split.map((v, i) => `<div><input name="split${i}" inputmode="numeric" value="${v}" title="${SLOT_NAMES[SLOTS[i]]}"><div class="small mut" style="text-align:center">${['PA', 'LM', 'Alm', 'Lan', 'Jan'][i]}</div></div>`).join('')}</div>
    <div class="kv" style="margin-top:10px"><span>Metabolismo basal</span><span>${c.bmr} kcal</span><span>Gasto diário</span><span>${c.tdee} kcal</span><span>Objetivo diário</span><span><b>${c.kcal} kcal</b> (défice ${c.deficit} kcal)</span><span>Perda estimada</span><span>~${fmt(c.weekly, 2)} kg por semana</span><span>Proteína</span><span>${c.protein} g</span><span>Gordura</span><span>${c.fat} g</span><span>Hidratos líquidos</span><span>${c.carbs} g</span><span>IMC</span><span>${c.bmi}</span></div>
    ${c.floored ? '<p class="small mut">O objetivo foi limitado ao mínimo seguro (' + (p.sex === 'm' ? 1500 : 1200) + ' kcal).</p>' : ''}
    <div class="row" style="margin-top:12px"><button class="btn" type="submit">Guardar e recalcular</button><button class="btn sec" type="button" data-act="logw" data-pid="${p.id}">Registar peso</button></div>${spark(log)}</form>`;
  }
  const c = s.child;
  h += `<form class="card" id="childform"><b>Criança</b><div class="grid2"><div><label>Nome</label><input name="name" value="${esc(c.name)}"></div><div><label>Calorias diárias</label><input name="kcal" inputmode="numeric" value="${c.kcal}"></div></div>
  <p class="small mut">Referência para os 2 anos: cerca de 1000 a 1400 kcal por dia. Confirma o valor com o pediatra.</p>
  <label>Divisão pelas 5 refeições (%)</label><div class="grid5">${c.split.map((v, i) => `<input name="split${i}" inputmode="numeric" value="${v}">`).join('')}</div>
  <label>Evitar receitas com ingredientes não indicados</label><select name="excl"><option value="1" ${c.excludeAvoid !== false ? 'selected' : ''}>Sim, evitar quando possível</option><option value="0" ${c.excludeAvoid === false ? 'selected' : ''}>Não, apenas avisar</option></select>
  <div class="row" style="margin-top:12px"><button class="btn" type="submit">Guardar</button></div></form>`;
  const st = s.settings;
  h += `<form class="card" id="setform"><b>Planeamento e avisos</b><div class="grid2"><div><label>Dia de prep</label><select name="prepDay">${C.DAYS.map((d, i) => `<option value="${i}" ${st.prepDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div><label>Dia livre (sem refeições)</label><select name="freeDay">${C.DAYS.map((d, i) => `<option value="${i}" ${st.freeDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
  <div class="grid2"><div><label>Email da lista (dia)</label><select name="mailDay">${C.DAYS.map((d, i) => `<option value="${i}" ${st.mailDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div><label>Hora do email</label><input name="mailHour" inputmode="numeric" value="${st.mailHour}"></div></div>
  <label>Hora do aviso de descongelar (véspera)</label><input name="thawHour" inputmode="numeric" value="${st.thawHour}">
  <label>Receitas diferentes por semana: PA / Lanche manhã / Almoço / Lanche / Jantar</label><div class="grid5">${SLOTS.map((k) => `<input name="v_${k}" inputmode="numeric" value="${st.variety[k]}">`).join('')}</div>
  <label>Máximo de lanches doces por semana (aprox.)</label><input name="sweetMax" inputmode="numeric" value="${st.sweetMax}">
  <div class="row" style="margin-top:12px"><button class="btn" type="submit">Guardar</button></div></form>`;
  h += `<div class="card"><b>Fotos das receitas</b><p class="mut small">${Object.keys(IMG).length ? Object.keys(IMG).length + ' fotos carregadas.' : 'Ainda sem fotos.'} Escolhe o ficheiro imagens-livro.json (só uma vez, num dos telemóveis).</p><input id="imgfile" type="file" accept="application/json"><p id="imgprog" class="mut small"></p></div><div class="card"><b>Este telemóvel</b><div class="kv" style="margin:8px 0"><span>Sincronização</span><span>${S.getFid() ? 'Ativa' : 'Modo local (não configurada)'}</span>${S.getFid() ? `<span>Código da família</span><span style="word-break:break-all;user-select:all">${S.getFid()}</span>` : ''}</div>
  <label>Notificações deste telemóvel são para</label><select id="pushwho">${people().map((p) => `<option value="${p.id}" ${p.id === ui.who ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
  <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn sec" data-act="push">Ativar notificações</button><button class="btn sec" data-act="pushtest">Testar</button>${S.getFid() ? '<button class="btn sec" data-act="share">Convidar (copiar link)</button>' : ''}</div>
  <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn sec" data-act="export">Exportar cópia</button><button class="btn sec" data-act="import">Importar cópia</button><input id="imp" type="file" accept="application/json" hidden></div></div>
  <p class="mut small">Estimativas calóricas pela fórmula de Mifflin-St Jeor. Não substituem aconselhamento médico ou de um nutricionista, sobretudo na perda de peso.</p>`;
  return h;
}

// ---------- modais ----------
function mealModal(date, slot) {
  const s = S.get(); const plan = planFor(date); if (!plan) return;
  const day = plan.days.find((d) => d.date === date); const m = day.meals[slot]; const r = rec(m.rid); const pid = ui.who;
  const dose = m.doses?.[pid] || 0; const n = C.mealNutrition(r, dose); const f = dose / (r.units || 1);
  const who = people().find((p) => p.id === pid).name;
  const gr = gramsFor(plan, r, dose);
  const list = (r.ing || []).map((i) => ingLine(i, f)).join('');
  const others = people().filter((p) => p.id !== pid).map((p) => { const d = m.doses?.[p.id] || 0; const g = gramsFor(plan, r, d); return `${esc(p.name)} ${g ? (g.exact ? '' : '≈ ') + C.round5(g.g) + ' g' : esc(doseLabel(r, d))}`; }).join(' · ');
  const gbox = gr ? `<div class="alert ice"><b>Prato pronto para ${esc(who)}: ${gr.exact ? '' : '≈ '}${C.round5(gr.g)} g</b>${gr.exact ? 'Calculado a partir do peso do tacho que registaste no dia de prep.' : 'Estimativa a partir dos ingredientes. Para ficar exato, pesa o tacho pronto e escreve o peso em Semana > Dia de prep.'}<br><span class="small">Os outros: ${others}</span></div>` : `<div class="alert ice"><b>Quanto servir do prato pronto?</b>Pesa o tacho todo depois de cozinhar e escreve o peso em Semana > Dia de prep. A app diz-te os gramas para cada pessoa.</div>`;
  openModal(`<div class="hero">${photo(r)}</div><h2>${esc(r.title)}</h2><p class="mut">${esc(SLOT_NAMES[slot])} de ${esc(who)}: <b>${esc(doseLabel(r, dose))}</b> · ${n.kcal} kcal · P ${n.p}g · G ${n.f}g · H ${n.c}g</p>
  ${gbox}
  <h3>Ingredientes em cru, por ingrediente (${esc(who)})</h3><div class="card"><ul class="clean">${list}</ul></div>
  <p class="mut small">Útil quando não fazes tudo no mesmo tacho: pesa cada ingrediente para a tua dose. Medidas caseiras convertidas em gramas são aproximadas. Temperos sem quantidade ficam a gosto.</p>
  <div class="row"><button class="btn sec" data-act="recipe" data-id="${r.id}">Ver receita completa</button></div>`);
}
function openModal(html) { $('#mbody').innerHTML = html; $('#modal').hidden = false; $('.sheet').scrollTop = 0; }
function closeModal() { $('#modal').hidden = true; $('#mbody').innerHTML = ''; }
function swapModal(date, slot) {
  const cat = C.SLOT_CAT[slot]; const pid = ui.who;
  const si = SLOTS.indexOf(slot); const tg = target(pid).kcal * S.get().profiles[0].split[si] / 100;
  const list = RS.filter((r) => r.plan && r.slot === cat && r.per).sort((a, b) => Math.abs(Math.log(tg / a.per.kcal)) - Math.abs(Math.log(tg / b.per.kcal)));
  let h = `<h2>Trocar ${SLOT_NAMES[slot].toLowerCase()}</h2><label><input type="checkbox" id="swapall" checked style="width:auto;display:inline-block;vertical-align:middle"> Trocar em todos os dias em que esta receita aparece</label><input id="swq" type="search" placeholder="Pesquisar" style="margin-top:8px"><div id="swlist">`;
  h += list.map((r) => `<div class="card" data-act="doswap" data-d="${date}" data-slot="${slot}" data-id="${r.id}" data-t="${esc(r.title.toLowerCase())}" style="cursor:pointer"><b>${esc(r.title)}</b><div class="mut small">${fmt(r.per.kcal)} kcal por ${esc(r.unitLabel)} · P ${fmt(r.per.p)}g</div>${childBadge(r)}</div>`).join('');
  openModal(h + '</div>');
}

// ---------- ações ----------
async function sw() { if (!('serviceWorker' in navigator)) return null; try { return await navigator.serviceWorker.ready; } catch { return null; } }
const urlB64 = (b) => { const p = '='.repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
async function enablePush() {
  if (!('Notification' in window)) return toast('Este navegador não suporta notificações');
  const reg = await sw(); if (!reg) return toast('Instala primeiro a app (Adicionar ao ecrã principal)');
  const perm = await Notification.requestPermission(); if (perm !== 'granted') return toast('Permissão recusada');
  if (!CONFIG.vapidPublicKey) return toast('Falta configurar as chaves de notificação (ver LEIA-ME)');
  try {
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(CONFIG.vapidPublicKey) });
    const pid = $('#pushwho').value;
    S.update((s) => { s.pushSubs = (s.pushSubs || []).filter((x) => x.sub.endpoint !== sub.endpoint); s.pushSubs.push({ pid, sub: sub.toJSON(), at: new Date().toISOString() }); }, { immediate: true });
    toast('Notificações ativadas neste telemóvel');
  } catch (e) { toast('Não foi possível ativar: ' + e.message); }
}
function setProfile(form) {
  const fd = Object.fromEntries(new FormData(form).entries()); const pid = form.dataset.pid;
  const split = [0, 1, 2, 3, 4].map((i) => Math.round(num(fd['split' + i], 0)));
  const sum = split.reduce((a, b) => a + b, 0); if (sum !== 100) return toast(`A divisão soma ${sum}%. Tem de somar 100%.`);
  S.update((s) => { const p = s.profiles.find((x) => x.id === pid); Object.assign(p, { name: fd.name.trim() || p.name, email: fd.email.trim(), sex: fd.sex, age: num(fd.age, p.age), height: num(fd.height, p.height), weight: num(fd.weight, p.weight), rate: fd.rate, activity: num(fd.activity, p.activity), kcalOverride: fd.kcalOverride ? num(fd.kcalOverride) : null, split }); });
  recompute(); S.update((s) => { for (const p of Object.values(s.plans)) applyCountable(C.finalizePlan(p, s, RS)); });
  toast('Perfil guardado e plano recalculado'); render();
}
document.addEventListener('submit', (e) => {
  const f = e.target; e.preventDefault();
  if (f.id === 'recform') return saveRecipe(f);
  if (f.classList.contains('pf')) return setProfile(f);
  if (f.id === 'childform') {
    const fd = Object.fromEntries(new FormData(f).entries()); const split = [0, 1, 2, 3, 4].map((i) => Math.round(num(fd['split' + i], 0)));
    if (split.reduce((a, b) => a + b, 0) !== 100) return toast('A divisão tem de somar 100%.');
    S.update((s) => { Object.assign(s.child, { name: fd.name.trim() || 'Criança', kcal: Math.round(num(fd.kcal, 1200)), split, excludeAvoid: fd.excl === '1' }); });
    recompute(); S.update((s) => { for (const p of Object.values(s.plans)) applyCountable(C.finalizePlan(p, s, RS)); }); toast('Guardado'); render();
  }
  if (f.id === 'setform') {
    const fd = Object.fromEntries(new FormData(f).entries());
    S.update((s) => { Object.assign(s.settings, { prepDay: +fd.prepDay, freeDay: +fd.freeDay, mailDay: +fd.mailDay, mailHour: Math.min(23, Math.max(0, Math.round(num(fd.mailHour, 10)))), thawHour: Math.min(23, Math.max(0, Math.round(num(fd.thawHour, 20)))), sweetMax: Math.round(num(fd.sweetMax, 3)) }); for (const k of SLOTS) s.settings.variety[k] = Math.max(1, Math.min(6, Math.round(num(fd['v_' + k], 2)))); });
    toast('Definições guardadas'); render();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { ui.filter.q = e.target.value; const pos = e.target.selectionStart; ui.keepScroll = true; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); ui.keepScroll = false; }
  if (e.target.id === 'swq') { const v = e.target.value.toLowerCase(); document.querySelectorAll('#swlist .card').forEach((c) => (c.style.display = c.dataset.t.includes(v) ? '' : 'none')); }
});
document.addEventListener('change', (e) => {
  if (e.target.dataset?.act === 'pw') { const v = Math.round(num(e.target.value, 0)); S.update((x) => { (x.prepWeights ||= {})[e.target.dataset.k] = v || null; }); toast('Peso guardado'); render(); return; }
  if (e.target.id === 'imgfile') { const f = e.target.files[0]; if (!f) return; const pr = $('#imgprog'); pr.textContent = 'A ler…'; f.text().then(async (t) => { try { const m = JSON.parse(t); if (!m || typeof m !== 'object' || !Object.keys(m).some((k) => /^b\d{3}$/.test(k))) throw new Error('Ficheiro inesperado'); IMG = m; await S.saveImgs(m, (p) => (pr.textContent = `A guardar na conta… ${p}%`)); pr.textContent = 'Fotos guardadas.'; toast('Fotos importadas'); render(); } catch (err) { pr.textContent = 'Erro: ' + err.message; } }); return; }
  if (e.target.id === 'imp') { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { S.replaceAll(JSON.parse(t)); toast('Cópia importada'); render(); } catch { toast('Ficheiro inválido'); } }); }
});
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('#tabs button'); if (tab) { ui.tab = tab.dataset.tab; lsSet('pl.tab', ui.tab); render(); window.scrollTo(0, 0); return; }
  const who = e.target.closest('[data-who]'); if (who) { ui.who = who.dataset.who; lsSet('pl.who', ui.who); render(); return; }
  if (e.target.id === 'mclose' || e.target.id === 'modal') return closeModal();
  if (e.target.closest('a[data-act]')) e.preventDefault();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const d = el.dataset;
  const s = S.get();
  if (a === 'mclose') return closeModal();
  if (a === 'meal') return mealModal(d.d, d.slot);
  if (a === 'recipe') return recipeModal(d.id);
  if (a === 'editrec') return editModal(d.id);
  if (a === 'newrec') return editModal(null);
  if (a === 'resetrec') { S.update((x) => { delete x.recipeEdits[d.id]; }); recompute(); closeModal(); render(); return toast('Receita original reposta'); }
  if (a === 'delrec') { S.update((x) => { delete x.customRecipes[d.id]; }); closeModal(); render(); return; }
  if (a === 'hiderec') { S.update((x) => { x.hiddenRecipes.push(d.id); }); closeModal(); render(); return toast('Receita escondida'); }
  if (a === 'flt') { ui.filter[d.k] = ui.filter[d.k] === d.v ? '' : d.v; return render(); }
  if (a === 'wk') { ui.week = C.addDays(ui.week, +d.d); ui.day = null; return render(); }
  if (a === 'shopwk') { ui.shopWeek = C.addDays(ui.shopWeek, +d.d); return render(); }
  if (a === 'day') { ui.day = d.d; return render(); }
  if (a === 'gen') {
    S.update((x) => { x.plans[d.week] = makePlan(x, d.week, d.re ? String(Date.now()) : ''); }); ui.week = d.week; ui.shopWeek = d.week; toast(d.re ? 'Novo plano gerado' : 'Plano gerado'); return render();
  }
  if (a === 'done') { S.update((x) => { const t = today(); ((x.done[t] ||= {})[ui.who] ||= {})[d.slot] = el.checked; }); return; }
  if (a === 'chk') { S.update((x) => { x.checked[d.k] = el.checked; }); el.closest('li').classList.toggle('done', el.checked); return; }
  if (a === 'swap') return swapModal(d.d, d.slot);
  if (a === 'doswap') {
    const all = $('#swall') || $('#swapall'); const every = all?.checked;
    S.update((x) => {
      const plan = x.plans[ui.week]; const old = plan.days.find((y) => y.date === d.d).meals[d.slot].rid;
      for (const day of plan.days) { if (day.date === d.d || (every && day.meals[d.slot].rid === old)) day.meals[d.slot] = { rid: d.id }; }
      applyCountable(C.finalizePlan(plan, x, RS));
    }); closeModal(); return render();
  }
  if (a === 'have' || a === 'unhave') { S.update((x) => { const w = ((x.have ||= {})[ui.shopWeek] ||= {}); if (a === 'have') w[d.n] = true; else delete w[d.n]; }); return render(); }
  if (a === 'copyshop') {
    const sh = C.shoppingList(planOfWeek(ui.shopWeek), RS, s.have?.[ui.shopWeek] || {});
    const txt = sh.cats.map((c) => c.cat + '\n' + c.items.map((i) => '- ' + i.label).join('\n')).join('\n\n') + '\n\nBásicos: ' + sh.staples.join(', ');
    try { await navigator.clipboard.writeText(txt); toast('Lista copiada'); } catch { toast('Não foi possível copiar'); } return;
  }
  if (a === 'email') { const plan = planOfWeek(d.week); const html = C.weeklyEmailHTML(s, RS, plan, CONFIG.appUrl); return openModal(`<h2>Email da sexta</h2><p class="mut small">Pré-visualização do que é enviado a ${s.profiles.map((p) => esc(p.name)).join(' e ')}.</p><div class="card" style="background:#fff;color:#222">${html}</div>`); }
  if (a === 'logw') {
    const form = el.closest('form'); const w = num(form.elements.weight.value); const pid = d.pid;
    S.update((x) => { (x.weightLog[pid] ||= []).push({ d: today(), w }); x.profiles.find((p) => p.id === pid).weight = w; }); recompute();
    S.update((x) => { for (const p of Object.values(x.plans)) applyCountable(C.finalizePlan(p, x, RS)); }); toast('Peso registado'); return render();
  }
  if (a === 'push') return enablePush();
  if (a === 'pushtest') { const reg = await sw(); if (!reg) return toast('Instala a app primeiro'); if (Notification.permission !== 'granted') return toast('Ativa primeiro as notificações'); reg.showNotification('Planeador de Refeições', { body: 'Teste: amanhã precisas de descongelar o almoço.', icon: 'icon-192.png', badge: 'icon-192.png' }); return; }
  if (a === 'share') { const url = `${location.origin}${location.pathname}#f=${S.getFid()}`; try { await navigator.clipboard.writeText(url); toast('Link copiado: envia-o à tua esposa'); } catch { prompt('Copia este link', url); } return; }
  if (a === 'export') { const blob = new Blob([JSON.stringify(s)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = `planeador-${today()}.json`; l.click(); return; }
  if (a === 'import') return $('#imp').click();
});

// ---------- arranque ----------
async function boot() {
  await S.init();
  BASE = (await S.loadBook()) || [];
  S.loadImgs().then((m) => { IMG = m || {}; if (BASE.length) render(); });
  if (!BASE.length) return importScreen();
  S.onChange(() => { if (!document.activeElement || !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) render(); else renderWho(); });
  recompute(); render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();

function importScreen() {
  $('#who').innerHTML = ''; $('#tabs').hidden = true;
  $('#view').innerHTML = `<h2>Importar as receitas do livro</h2><div class="card"><p>Por respeito pelos direitos de autor, as receitas não estão incluídas na app. Escolhe o ficheiro <b>receitas-livro.json</b> que recebeste (só é preciso fazer isto uma vez, num dos telemóveis).</p><input id="bookfile" type="file" accept="application/json"><p class="mut small">As receitas ficam guardadas na tua conta privada, só acessíveis por esta app.</p></div>`;
  $('#bookfile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let b;
    try { b = JSON.parse(await f.text()); } catch (err) { return toast(`Não consegui ler o ficheiro (${Math.round(f.size / 1024)} KB, ${f.name}). Volta a descarregá-lo.`); }
    if (!Array.isArray(b) || !b[0]?.title) return toast('Este ficheiro não é o receitas-livro.json');
    try { await S.saveBook(b); } catch (err) { $('#view').insertAdjacentHTML('beforeend', `<div class="alert bad"><b>Não consegui guardar na base de dados</b>${esc(err.message)}</div>`); return toast('Falha ao guardar (ver detalhe no ecrã)'); }
    location.reload();
  });
}

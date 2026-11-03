import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as C from '../public/core.js';
const base = JSON.parse(fs.readFileSync(new URL('../private/receitas-livro.json', import.meta.url)));
const st = C.defaultState();
const rs = C.mergeRecipes(base, st);
// calculadora
const c = C.calcProfile(st.profiles[0]);
console.log('perfil1', c);
assert(c.kcal >= 1500 && c.kcal < c.tdee);
const week = C.nextMonday('2026-11-06');
assert.equal(week, '2026-11-09');
const plan = C.generatePlan(st, rs, week);
console.log('dias', plan.days.map((d) => d.date + ' ' + C.DAYS_SHORT[C.dow(d.date)]).join(', '), 'prep', plan.prep);
assert.equal(plan.days.length, 6);
for (const d of plan.days) {
  const t = C.dayTotals(d, rs, 'p1'); const tc = C.dayTotals(d, rs, 'child');
  console.log(d.date, 'p1', t.kcal, '/', c.kcal, ' prot', t.p, ' crianca', tc.kcal);
  assert(Math.abs(t.kcal - c.kcal) < c.kcal * 0.08, 'desvio calórico ' + t.kcal);
}
for (const d of plan.days) console.log(d.date, C.SLOTS.map((s) => (C.recipeById(rs, d.meals[s].rid).title.slice(0, 20) + '[' + ({fridge:'F',freezer:'C',fresh:'H'})[d.meals[s].mode] + ' ' + d.meals[s].doses.p1 + ']')).join(' | '));
const b = C.batchesOf(plan, rs); console.log('lotes', b.map((x) => x.r.title.slice(0, 25) + ' x' + x.mult).join('; '));
const sh = C.shoppingList(plan, rs);
for (const k of sh.cats) console.log(k.cat, k.items.length, k.items.slice(0, 4).map((i) => i.label).join(' | '));
console.log('básicos', sh.staples.join(', '));
console.log('alertas crianca', C.childAlerts(plan, rs).map((a) => a.title + ':' + a.level));
const html = C.weeklyEmailHTML(st, rs, plan, 'https://x'); assert(html.length > 2000); console.log('email bytes', html.length);
console.log('OK');

// Corre de hora a hora no GitHub Actions: envia o email de sexta e os avisos push.
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import * as C from '../public/core.js';

const env = process.env;
const need = ['SUPABASE_URL', 'SUPABASE_KEY', 'FAMILY_ID'];
for (const k of need) if (!env[k]) { console.error('Falta o segredo ' + k); process.exit(1); }
const force = env.FORCE || '';

async function rpc(fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.SUPABASE_KEY, ...(env.SUPABASE_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${env.SUPABASE_KEY}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`);
  return r.json();
}
async function load() { const row = await rpc('get_state', { fid: env.FAMILY_ID }); if (!row.length) throw new Error('Ainda não há dados: abre a app uma vez com a sincronização ligada.'); return { state: row[0].state, rev: row[0].rev }; }
// aplica uma alteração ao estado mais recente, com repetição se houver conflito
async function mutate(fn) {
  for (let i = 0; i < 4; i++) {
    const { state, rev } = await load();
    fn(state);
    const res = await rpc('set_state', { fid: env.FAMILY_ID, new_state: state, expected_rev: rev });
    if (res[0].ok) return state;
  }
  throw new Error('Conflito ao gravar o estado');
}

const bookRow = await rpc('get_book', { fid: env.FAMILY_ID });
if (!bookRow.length) { console.error('As receitas ainda não foram importadas na app.'); process.exit(1); }
const base = bookRow[0].book;
const now = C.lisbonNow();
console.log('Agora em Lisboa:', now.date, now.hour + 'h', force ? '(forçado: ' + force + ')' : '');
const { state } = await load();
const recipes = C.mergeRecipes(base, state);
const st = state.settings;
const summary = [];

// ---------- 1. email da lista de compras ----------
const dueMail = force === 'mail' || (C.dow(now.date) === st.mailDay && now.hour >= st.mailHour);
const week = C.nextMonday(now.date);
if (dueMail && (force === 'mail' || !state.sent?.mail?.[week])) {
  const emails = state.profiles.map((p) => p.email).filter(Boolean);
  if (!emails.length) summary.push('Email: ninguém tem email configurado nos Perfis.');
  else if (!env.SMTP_USER || !env.SMTP_PASS) summary.push('Email: faltam os segredos SMTP_USER e SMTP_PASS.');
  else {
    let plan = state.plans?.[week];
    if (!plan) plan = C.buildPlan(state, recipes, week);
    const html = C.weeklyEmailHTML(state, recipes, plan, env.APP_URL || '');
    const tr = env.DRY_RUN ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport({ service: 'gmail', auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
    const info = await tr.sendMail({ from: `Planeador de Refeições <${env.SMTP_USER}>`, to: emails.join(', '), subject: `Lista de compras e plano da semana de ${C.fmtDate(week)}`, html });
    if (env.DRY_RUN) console.log('DRY email:', JSON.parse(info.message).subject, '->', JSON.parse(info.message).to.map((x) => x.address).join(','));
    await mutate((s) => { s.plans ||= {}; if (!s.plans[week]) s.plans[week] = plan; s.sent ||= {}; (s.sent.mail ||= {})[week] = now.date; });
    summary.push('Email enviado para ' + emails.join(', '));
  }
}

// ---------- 2. avisos push (véspera) ----------
const duePush = force === 'push' || now.hour >= st.thawHour;
if (duePush && (force === 'push' || state.sent?.push !== now.date)) {
  const tomorrow = C.addDays(now.date, 1);
  const lines = [];
  const planT = Object.values(state.plans || {}).find((p) => p.days.some((d) => d.date === tomorrow));
  if (planT) {
    const th = C.thawList(planT, recipes, now.date);
    if (th.length) lines.push('Descongelar para amanhã: ' + th.map((t) => `${C.SLOT_NAMES[t.slot].toLowerCase()} (${t.title})`).join('; ') + '.');
    const day = planT.days.find((d) => d.date === tomorrow);
    const bad = [];
    for (const sl of C.SLOTS) { const r = C.recipeById(recipes, day.meals[sl].rid); if (r && (r.child?.level === 'avoid' || r.child?.level === 'adapt') && !bad.includes(r.title)) bad.push(r.title + (r.child.level === 'avoid' ? ' (evitar)' : '')); }
    if (bad.length) lines.push(`Atenção ${state.child.name}: ${bad.join('; ')}. Vê os avisos na app.`);
  }
  if (C.dow(tomorrow) === st.prepDay) lines.push('Amanhã é dia de prep.');
  if (lines.length) {
    if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) summary.push('Push: faltam as chaves VAPID.');
    else {
      webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:' + (env.SMTP_USER || 'example@example.com'), env.VAPID_PUBLIC, env.VAPID_PRIVATE);
      const dead = [];
      for (const s of state.pushSubs || []) {
        if (env.DRY_RUN) { console.log('DRY push:', lines.join(' | ')); continue; }
        try { await webpush.sendNotification(s.sub, JSON.stringify({ title: 'Planeador de Refeições', body: lines.join('\n'), tag: 'vespera', url: env.APP_URL || './' })); }
        catch (e) { console.log('push falhou', e.statusCode); if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.sub.endpoint); }
      }
      await mutate((s) => { s.sent ||= {}; s.sent.push = now.date; if (dead.length) s.pushSubs = (s.pushSubs || []).filter((x) => !dead.includes(x.sub.endpoint)); });
      summary.push(`Push enviado a ${(state.pushSubs || []).length} dispositivo(s): ${lines.join(' ')}`);
    }
  } else if (!force) await mutate((s) => { s.sent ||= {}; s.sent.push = now.date; });
}
console.log(summary.length ? summary.join('\n') : 'Nada para enviar nesta hora.');

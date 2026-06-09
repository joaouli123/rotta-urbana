import express from 'express';
import session from 'express-session';
import { createClient } from '@supabase/supabase-js';
import { layout, loginPage, esc, brl, fmtDate, badge, kpiCard, table } from './ui.js';

const {
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  SUPABASE_ANON_KEY,
  SESSION_SECRET = 'dev-insecure-secret-change-me',
  PORT = 3000,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY');
  process.exit(1);
}

// service_role client — full access; the panel itself gates by admin session.
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 3600 * 1000 },
}));

const requireAuth = (req, res, next) => (req.session?.userId ? next() : res.redirect('/login'));
const render = (res, html) => res.set('Content-Type', 'text/html; charset=utf-8').send(html);

// ─── Auth ─────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => render(res, loginPage()));

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY ?? SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
    if (error || !data?.user) return render(res, loginPage('E-mail ou senha incorretos.'));

    const { data: profile } = await admin.from('profiles').select('role, full_name').eq('id', data.user.id).single();
    if (profile?.role !== 'admin') return render(res, loginPage('Acesso restrito a administradores.'));

    req.session.userId = data.user.id;
    req.session.email = data.user.email;
    res.redirect('/');
  } catch (e) {
    console.error(e);
    render(res, loginPage('Erro ao entrar. Tente novamente.'));
  }
});

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Dashboard ──────────────────────────────────────────────────────────────
app.get('/', requireAuth, async (req, res) => {
  const { data: k } = await admin.rpc('admin_kpis');
  const kpis = k ?? {};

  // rides per day (last 14 days)
  const since = new Date(Date.now() - 13 * 864e5).toISOString();
  const { data: recent } = await admin.from('rides')
    .select('id,status,price,ride_type,requested_at,passenger_id,driver_id')
    .gte('requested_at', since).order('requested_at', { ascending: false });
  const rides = recent ?? [];

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), n: 0 });
  }
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  rides.forEach((r) => { const key = String(r.requested_at).slice(0, 10); if (byKey[key]) byKey[key].n++; });

  const names = await profileNames(rides.flatMap((r) => [r.passenger_id, r.driver_id]));
  const recentRows = rides.slice(0, 8).map((r) => [
    esc(r.ride_type), badge(r.status), brl(r.price),
    esc(names[r.passenger_id] ?? '—'), esc(names[r.driver_id] ?? '—'), fmtDate(r.requested_at),
  ]);

  const body = `
    <div class="grid">
      ${kpiCard('Passageiros', kpis.passengers ?? 0)}
      ${kpiCard('Motoristas', kpis.drivers_total ?? 0, `${kpis.drivers_verified ?? 0} verificados`)}
      ${kpiCard('Online agora', kpis.drivers_online ?? 0, `${kpis.drivers_on_ride ?? 0} em corrida`)}
      ${kpiCard('Pendentes', kpis.drivers_pending ?? 0, 'aprovação')}
      ${kpiCard('Corridas hoje', kpis.rides_today ?? 0, `${kpis.rides_month ?? 0} no mês`)}
      ${kpiCard('Em andamento', kpis.rides_in_progress ?? 0)}
      ${kpiCard('Concluídas', kpis.rides_completed ?? 0, `${kpis.rides_cancelled ?? 0} canceladas`)}
      ${kpiCard('Assinaturas ativas', kpis.subs_active ?? 0)}
      ${kpiCard('Receita assinaturas', brl(kpis.revenue_subscriptions))}
      ${kpiCard('Tarifas (mês)', brl(kpis.gross_fares_month), 'direto p/ motoristas')}
      ${kpiCard('Suporte aberto', kpis.support_open ?? 0)}
    </div>
    <div class="card"><h2>Corridas nos últimos 14 dias</h2><canvas id="chart" height="90"></canvas></div>
    <div class="card"><h2>Corridas recentes</h2>
      ${table(['Tipo', 'Status', 'Preço', 'Passageiro', 'Motorista', 'Quando'], recentRows)}
    </div>
    <script>
      const ctx = document.getElementById('chart');
      new Chart(ctx, { type:'line', data:{ labels:${JSON.stringify(days.map((d) => d.label))},
        datasets:[{ label:'Corridas', data:${JSON.stringify(days.map((d) => d.n))}, borderColor:'#18b56a', backgroundColor:'#18b56a33', fill:true, tension:.3 }]},
        options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'#23362d'},ticks:{color:'#8a9a93'}}, y:{grid:{color:'#23362d'},ticks:{color:'#8a9a93'},beginAtZero:true} } } });
    </script>`;
  render(res, layout({ title: 'Visão geral', active: '/', email: req.session.email, body }));
});

// ─── Drivers ──────────────────────────────────────────────────────────────
app.get('/drivers', requireAuth, async (req, res) => {
  const [{ data: drivers }, { data: profiles }, { data: subs }, { data: vehicles }] = await Promise.all([
    admin.from('drivers').select('*'),
    admin.from('profiles').select('id,full_name,phone,rating').eq('role', 'driver'),
    admin.from('subscriptions').select('driver_id,status,plan,amount,due_date'),
    admin.from('vehicles').select('driver_id,model,plate'),
  ]);
  const pMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  const sMap = Object.fromEntries((subs ?? []).map((s) => [s.driver_id, s]));
  const vMap = {}; (vehicles ?? []).forEach((v) => { (vMap[v.driver_id] ??= []).push(v); });

  const rows = (drivers ?? []).map((d) => {
    const p = pMap[d.id] ?? {}; const s = sMap[d.id] ?? {}; const v = (vMap[d.id] ?? [])[0] ?? {};
    const verifyBtn = d.is_verified
      ? `<form class="inline" method="post" action="/drivers/${d.id}/unverify"><button class="act gray">Suspender</button></form>`
      : `<form class="inline" method="post" action="/drivers/${d.id}/verify"><button class="act">Aprovar</button></form>`;
    return [
      esc(p.full_name ?? '—'), esc(p.phone ?? '—'),
      `${esc(v.model ?? '—')}<br><small style="color:#8a9a93">${esc(v.plate ?? '')}</small>`,
      badge(d.status), d.is_verified ? badge('approved') : badge(d.documents_status ?? 'pending'),
      esc(d.pix_key ?? '—'),
      s.plan ? `${esc(s.plan)} · ${badge(s.status)}` : '—',
      verifyBtn,
    ];
  });
  const body = `<div class="card"><h2>Motoristas (${rows.length})</h2>
    ${table(['Nome', 'Telefone', 'Veículo', 'Status', 'Documentos', 'Chave PIX', 'Assinatura', 'Ação'], rows)}</div>`;
  render(res, layout({ title: 'Motoristas', active: '/drivers', email: req.session.email, body }));
});

app.post('/drivers/:id/verify', requireAuth, async (req, res) => {
  await admin.from('drivers').update({ is_verified: true, documents_status: 'approved' }).eq('id', req.params.id);
  res.redirect('/drivers');
});
app.post('/drivers/:id/unverify', requireAuth, async (req, res) => {
  await admin.from('drivers').update({ is_verified: false }).eq('id', req.params.id);
  res.redirect('/drivers');
});

// ─── Rides ────────────────────────────────────────────────────────────────
app.get('/rides', requireAuth, async (req, res) => {
  const status = req.query.status;
  let q = admin.from('rides').select('*').order('requested_at', { ascending: false }).limit(100);
  if (status) q = q.eq('status', status);
  const { data: rides } = await q;
  const names = await profileNames((rides ?? []).flatMap((r) => [r.passenger_id, r.driver_id]));
  const rows = (rides ?? []).map((r) => [
    esc(r.ride_type), badge(r.status), brl(r.price),
    `${Number(r.distance_km ?? 0).toFixed(1)} km`,
    esc(names[r.passenger_id] ?? '—'), esc(names[r.driver_id] ?? '—'),
    r.fare_paid ? badge('approved') : badge('pending'), fmtDate(r.requested_at),
  ]);
  const filters = ['', 'searching', 'in_progress', 'completed', 'cancelled'];
  const fbar = `<div class="filters" style="margin-bottom:14px">${filters.map((f) =>
    `<a href="/rides${f ? '?status=' + f : ''}" class="${(status ?? '') === f ? 'on' : ''}">${f || 'todas'}</a>`).join('')}</div>`;
  const body = `${fbar}<div class="card"><h2>Corridas</h2>
    ${table(['Tipo', 'Status', 'Preço', 'Distância', 'Passageiro', 'Motorista', 'Pago', 'Quando'], rows)}</div>`;
  render(res, layout({ title: 'Corridas', active: '/rides', email: req.session.email, body }));
});

// ─── Subscriptions ──────────────────────────────────────────────────────────
app.get('/subscriptions', requireAuth, async (req, res) => {
  const [{ data: subs }, { data: profiles }] = await Promise.all([
    admin.from('subscriptions').select('*').order('due_date', { ascending: true }),
    admin.from('profiles').select('id,full_name').eq('role', 'driver'),
  ]);
  const pMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
  const rows = (subs ?? []).map((s) => [
    esc(pMap[s.driver_id] ?? '—'), esc(s.plan), badge(s.status), brl(s.amount),
    s.due_date ?? '—', fmtDate(s.paid_at),
    `<form class="inline" method="post" action="/subscriptions/${s.driver_id}/activate"><button class="act">Ativar / renovar</button></form>`,
  ]);
  const body = `<div class="card"><h2>Assinaturas dos motoristas</h2>
    ${table(['Motorista', 'Plano', 'Status', 'Valor', 'Vence em', 'Pago em', 'Ação'], rows)}</div>`;
  render(res, layout({ title: 'Assinaturas', active: '/subscriptions', email: req.session.email, body }));
});

app.post('/subscriptions/:driverId/activate', requireAuth, async (req, res) => {
  const { data: s } = await admin.from('subscriptions').select('plan,due_date').eq('driver_id', req.params.driverId).single();
  const base = new Date(Math.max(Date.now(), s?.due_date ? new Date(s.due_date).getTime() : Date.now()));
  base.setDate(base.getDate() + (s?.plan === 'daily' ? 1 : 30));
  await admin.from('subscriptions').update({
    status: 'active', due_date: base.toISOString().slice(0, 10), paid_at: new Date().toISOString(),
  }).eq('driver_id', req.params.driverId);
  res.redirect('/subscriptions');
});

// ─── Payments ─────────────────────────────────────────────────────────────
app.get('/payments', requireAuth, async (req, res) => {
  const { data: payments } = await admin.from('payments').select('*').order('created_at', { ascending: false }).limit(100);
  const names = await profileNames((payments ?? []).map((p) => p.driver_id));
  const rows = (payments ?? []).map((p) => [
    esc(names[p.driver_id] ?? '—'), brl(p.amount), esc(p.method), esc(p.provider), badge(p.status), fmtDate(p.created_at),
    p.status === 'pending'
      ? `<form class="inline" method="post" action="/payments/${p.id}/confirm"><button class="act">Confirmar</button></form>`
      : '—',
  ]);
  const body = `<div class="card"><h2>Pagamentos de assinatura</h2>
    ${table(['Motorista', 'Valor', 'Método', 'Provedor', 'Status', 'Criado', 'Ação'], rows)}</div>`;
  render(res, layout({ title: 'Pagamentos', active: '/payments', email: req.session.email, body }));
});

app.post('/payments/:id/confirm', requireAuth, async (req, res) => {
  await admin.rpc('confirm_payment', { p_payment_id: req.params.id });
  res.redirect('/payments');
});

// ─── Support ──────────────────────────────────────────────────────────────
app.get('/support', requireAuth, async (req, res) => {
  const { data: tickets } = await admin.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(100);
  const names = await profileNames((tickets ?? []).map((t) => t.user_id));
  const rows = (tickets ?? []).map((t) => [
    esc(names[t.user_id] ?? '—'), esc(t.subject), esc((t.message ?? '').slice(0, 80)), badge(t.status), fmtDate(t.created_at),
    t.status !== 'closed'
      ? `<form class="inline" method="post" action="/support/${t.id}/close"><button class="act gray">Fechar</button></form>`
      : '—',
  ]);
  const body = `<div class="card"><h2>Tickets de suporte</h2>
    ${table(['Usuário', 'Assunto', 'Mensagem', 'Status', 'Criado', 'Ação'], rows)}</div>`;
  render(res, layout({ title: 'Suporte', active: '/support', email: req.session.email, body }));
});

app.post('/support/:id/close', requireAuth, async (req, res) => {
  await admin.from('support_tickets').update({ status: 'closed' }).eq('id', req.params.id);
  res.redirect('/support');
});

// ─── Settings ─────────────────────────────────────────────────────────────
app.get('/settings', requireAuth, async (req, res) => {
  const { data: s } = await admin.from('app_settings').select('*').eq('id', 1).single();
  const { data: fares } = await admin.from('fare_config').select('*').order('ride_type');
  const set = s ?? {};
  const okMsg = req.query.ok ? `<div class="ok">Salvo com sucesso.</div>` : '';
  const order = ['economy', 'comfort', 'premium'];
  const fareRows = (fares ?? [])
    .slice().sort((a, b) => order.indexOf(a.ride_type) - order.indexOf(b.ride_type))
    .map((f) => `
    <div style="border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:14px">
      <h3 style="margin:0 0 10px;font-size:14px">${esc(f.display_name || f.ride_type)} <span style="color:var(--mut);font-weight:400">(${esc(f.ride_type)})</span></h3>
      <div class="row2">
        <div><label>Nome exibido</label><input name="name_${f.ride_type}" value="${esc(f.display_name || '')}"></div>
        <div><label>Categoria ativa?</label><select name="active_${f.ride_type}"><option value="1" ${f.active ? 'selected' : ''}>Sim</option><option value="0" ${!f.active ? 'selected' : ''}>Não</option></select></div>
        <div><label>Tarifa base (R$)</label><input name="base_${f.ride_type}" value="${f.base_fare}"></div>
        <div><label>Custo por KM (R$)</label><input name="km_${f.ride_type}" value="${f.per_km}"></div>
        <div><label>Custo por minuto (R$)</label><input name="min_${f.ride_type}" value="${f.per_min}"></div>
        <div><label>Tarifa mínima (R$)</label><input name="minfare_${f.ride_type}" value="${f.min_fare}"></div>
        <div><label>Ano mínimo do veículo</label><input name="year_${f.ride_type}" value="${f.min_year ?? 0}"></div>
        <div><label>Valor FIPE mínimo (R$)</label><input name="fipe_${f.ride_type}" value="${f.min_fipe_value ?? 0}"></div>
        <div><label>Assentos mínimos</label><input name="seats_${f.ride_type}" value="${f.min_seats ?? 4}"></div>
        <div><label>Tipos permitidos (vírgula)</label><input name="types_${f.ride_type}" value="${esc((f.allowed_vehicle_types || []).join(','))}" placeholder="vazio = todos"></div>
        <div><label>Cores exigidas (vírgula)</label><input name="colors_${f.ride_type}" value="${esc((f.require_colors || []).join(','))}" placeholder="vazio = qualquer"></div>
      </div>
    </div>`).join('');
  const body = `${okMsg}
    <div class="card"><h2>Planos e PIX da plataforma</h2>
      <form method="post" action="/settings">
        <div class="row2">
          <div><label>Nome da plataforma</label><input name="platform_name" value="${esc(set.platform_name)}"></div>
          <div><label>Plano padrão</label><select name="default_plan">
            <option value="monthly" ${set.default_plan === 'monthly' ? 'selected' : ''}>Mensal</option>
            <option value="daily" ${set.default_plan === 'daily' ? 'selected' : ''}>Diária</option>
          </select></div>
          <div><label>Valor diária (R$)</label><input name="subscription_daily_amount" value="${set.subscription_daily_amount}"></div>
          <div><label>Valor mensal (R$)</label><input name="subscription_monthly_amount" value="${set.subscription_monthly_amount}"></div>
          <div><label>Chave PIX da plataforma (recebe assinaturas)</label><input name="platform_pix_key" value="${esc(set.platform_pix_key)}"></div>
          <div><label>Nome do recebedor (PIX)</label><input name="platform_pix_name" value="${esc(set.platform_pix_name)}"></div>
          <div><label>Cidade (PIX)</label><input name="platform_pix_city" value="${esc(set.platform_pix_city)}"></div>
        </div>
        <button class="act" style="margin-top:16px" type="submit">Salvar configurações</button>
      </form>
    </div>
    <div class="card"><h2>Tabela de tarifas (corridas)</h2>
      <form method="post" action="/settings/fares">${fareRows}
        <button class="act" style="margin-top:16px" type="submit">Salvar tarifas</button>
      </form>
    </div>`;
  render(res, layout({ title: 'Configurações', active: '/settings', email: req.session.email, body }));
});

app.post('/settings', requireAuth, async (req, res) => {
  const b = req.body;
  await admin.from('app_settings').update({
    platform_name: b.platform_name,
    default_plan: b.default_plan === 'daily' ? 'daily' : 'monthly',
    subscription_daily_amount: num(b.subscription_daily_amount),
    subscription_monthly_amount: num(b.subscription_monthly_amount),
    platform_pix_key: b.platform_pix_key ?? '',
    platform_pix_name: b.platform_pix_name ?? '',
    platform_pix_city: b.platform_pix_city ?? '',
  }).eq('id', 1);
  res.redirect('/settings?ok=1');
});

app.post('/settings/fares', requireAuth, async (req, res) => {
  const b = req.body;
  const arr = (s) => String(s ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  for (const t of ['economy', 'comfort', 'premium']) {
    if (b[`base_${t}`] === undefined) continue;
    await admin.from('fare_config').update({
      display_name: b[`name_${t}`] || null,
      active: b[`active_${t}`] === '1',
      base_fare: num(b[`base_${t}`]), per_km: num(b[`km_${t}`]),
      per_min: num(b[`min_${t}`]), min_fare: num(b[`minfare_${t}`]),
      min_year: Math.round(num(b[`year_${t}`])),
      min_fipe_value: num(b[`fipe_${t}`]),
      min_seats: Math.max(1, Math.round(num(b[`seats_${t}`]))),
      allowed_vehicle_types: arr(b[`types_${t}`]),
      require_colors: arr(b[`colors_${t}`]),
    }).eq('ride_type', t);
  }
  res.redirect('/settings?ok=1');
});

// ─── helpers ────────────────────────────────────────────────────────────────
async function profileNames(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await admin.from('profiles').select('id,full_name').in('id', uniq);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]));
}
const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };

app.use((req, res) => res.redirect(req.session?.userId ? '/' : '/login'));

app.listen(PORT, () => console.log(`Rotta Urbana Admin on :${PORT}`));

import express from 'express';
import session from 'express-session';
import { createClient } from '@supabase/supabase-js';
import { layout, loginPage, managerLoginPage, esc, brl, fmtDate, fmtPhone, badge, kpiCard, table, pagination, iconBtnApprove, iconBtnSuspend, iconBtnDollar, iconBtnClose, iconBtnTrash, iconBtnWhatsApp, iconBtnEdit, iconBtnKey, iconBtnPlan, iconBtnDocs } from './ui.js';
import { landingPage } from './landing.js';
import { privacyPolicyPage, deleteAccountPage } from './policies.js';
import * as emailService from './emailService.js';
import { registerManagerRoutes } from './managerRoutes.js';
import { registerManagerPortalRoutes } from './managerPortalRoutes.js';
import { loadUserBundle, resetUserPassword, updateDriverProfile, updateUserProfile } from './userAdmin.js';

const {
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  SUPABASE_ANON_KEY,
  SESSION_SECRET = 'dev-insecure-secret-change-me',
  PORT = 3000,
} = process.env;

const IS_PROD = process.env.NODE_ENV === 'production';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY');
  process.exit(1);
}

// Fail closed: never run with a guessable session secret in production. The
// default is committed in the repo, so a forged cookie = full service_role panel.
if (IS_PROD && (!process.env.SESSION_SECRET || SESSION_SECRET === 'dev-insecure-secret-change-me')) {
  console.error('Refusing to start: set a strong SESSION_SECRET in production.');
  process.exit(1);
}

// service_role client — full access; the panel itself gates by admin session.
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const app = express();
app.use(express.static('public'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DEFAULT_ADMIN_PANEL_SLUG = 'console-ru-7f3a9c';
const ADMIN_PANEL_SLUG = String(process.env.ADMIN_PANEL_SLUG || DEFAULT_ADMIN_PANEL_SLUG)
  .trim()
  .replace(/^\/+|\/+$/g, '');
if (!/^[a-z0-9][a-z0-9-]{10,63}$/.test(ADMIN_PANEL_SLUG)) {
  console.error('ADMIN_PANEL_SLUG inv?lido: use 11-64 caracteres min?sculos, n?meros e h?fens.');
  process.exit(1);
}
const ADMIN_BASE_PATH = '/' + ADMIN_PANEL_SLUG;
const DEFAULT_MANAGER_PANEL_SLUG = 'painel-gerente-ru-6c4a9e';
const MANAGER_PANEL_SLUG = String(process.env.MANAGER_PANEL_SLUG || DEFAULT_MANAGER_PANEL_SLUG)
  .trim()
  .replace(/^\/+|\/+$/g, '');
if (!/^[a-z0-9][a-z0-9-]{10,63}$/.test(MANAGER_PANEL_SLUG)) {
  console.error('MANAGER_PANEL_SLUG inválido: use 11-64 caracteres minúsculos, números e hífens.');
  process.exit(1);
}
const MANAGER_BASE_PATH = '/' + MANAGER_PANEL_SLUG;
const ADMIN_ROUTE_PREFIXES = ['/admin', '/login', '/logout', '/users', '/drivers', '/managers', '/rides', '/subscriptions', '/payments', '/leads', '/support', '/settings'];
const MANAGER_ROUTE_PREFIXES = ['/login', '/logout', '/drivers', '/rides', '/reports', '/support'];
const adminPath = (value = '') => {
  const raw = String(value || '');
  const match = raw.match(/^([^?#]*)(.*)$/);
  const pathname = match?.[1] || raw;
  const suffix = match?.[2] || '';
  if (pathname === '/admin' || pathname === '') return ADMIN_BASE_PATH + suffix;
  if (ADMIN_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) {
    return ADMIN_BASE_PATH + pathname + suffix;
  }
  return raw;
};
const adminRouter = express.Router();
const managerRouter = express.Router();
const managerPath = (value = '') => {
  const raw = String(value || '');
  const match = raw.match(/^([^?#]*)(.*)$/);
  const pathname = match?.[1] || raw;
  const suffix = match?.[2] || '';
  if (pathname === '/' || pathname === '/manager' || pathname === '') return MANAGER_BASE_PATH + suffix;
  if (MANAGER_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) {
    return MANAGER_BASE_PATH + pathname + suffix;
  }
  return raw;
};

// Baseline security headers (no extra deps).
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 12 * 3600 * 1000 },
}));

// ─── CSRF: same-origin check on every state-changing request ────────────────
// Combined with the SameSite=lax cookie, rejecting cross-origin POSTs blocks
// CSRF without needing a token in every form.
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  if (req.path.startsWith('/api/')) return next();
  const origin = req.get('origin');
  const referer = req.get('referer');
  const host = req.get('host');
  const sameOrigin = (u) => { try { return new URL(u).host === host; } catch { return false; } };
  if (origin ? sameOrigin(origin) : referer ? sameOrigin(referer) : false) return next();
  return res.status(403).send('Origem inválida.');
});

// ─── In-memory login rate limiter (per IP) ──────────────────────────────────
const LOGIN_MAX = 8;            // attempts
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginHits = new Map();    // ip -> { count, resetAt }
const makeLoginLimiter = (page) => (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let e = loginHits.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + LOGIN_WINDOW_MS }; loginHits.set(ip, e); }
  if (e.count >= LOGIN_MAX) return render(res, page('Muitas tentativas. Tente novamente em alguns minutos.'));
  e.count++;
  next();
};
const loginLimiter = makeLoginLimiter(loginPage);
const managerLoginLimiter = makeLoginLimiter(managerLoginPage);
// Opportunistic cleanup so the Map can't grow unbounded.
setInterval(() => { const now = Date.now(); for (const [ip, e] of loginHits) if (now > e.resetAt) loginHits.delete(ip); }, LOGIN_WINDOW_MS).unref?.();

const requireAuth = (req, res, next) => (req.session?.userId ? next() : res.redirect(adminPath('/login')));
const requireManagerAuth = (req, res, next) => (req.session?.managerUserId ? next() : res.redirect(managerPath('/login')));
adminRouter.use((req, res, next) => {
  const originalRedirect = res.redirect.bind(res);
  res.redirect = (target, ...rest) => originalRedirect(typeof target === 'string' ? adminPath(target) : target, ...rest);
  next();
});
managerRouter.use((req, res, next) => {
  const originalRedirect = res.redirect.bind(res);
  res.redirect = (target, ...rest) => originalRedirect(typeof target === 'string' ? managerPath(target) : target, ...rest);
  next();
});
const render = (res, html) => res.set('Content-Type', 'text/html; charset=utf-8').send(html);

// ─── Auth ─────────────────────────────────────────────────────────────────
adminRouter.get('/login', (req, res) => render(res, loginPage()));

adminRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY ?? SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
    if (error || !data?.user) return render(res, loginPage('E-mail ou senha incorretos.'));

    const { data: profile } = await admin.from('profiles').select('role, full_name, is_active').eq('id', data.user.id).single();
    if (profile?.role !== 'admin') return render(res, loginPage('Acesso restrito a administradores.'));
    if (profile.is_active === false) return render(res, loginPage('Este acesso administrativo está inativo.'));

    req.session.userId = data.user.id;
    req.session.email = data.user.email;
    res.redirect('/admin');
  } catch (e) {
    console.error(e);
    render(res, loginPage('Erro ao entrar. Tente novamente.'));
  }
});

adminRouter.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Políticas Públicas (Google Play / App Store) ───────────────────────────
app.get('/politica-de-privacidade', (req, res) => render(res, privacyPolicyPage()));
app.get('/privacy', (req, res) => render(res, privacyPolicyPage()));

app.get('/termos-de-uso', (req, res) => render(res, termsOfServicePage()));
app.get('/terms', (req, res) => render(res, termsOfServicePage()));

app.get('/exclusao-de-conta', (req, res) => render(res, deleteAccountPage()));
app.get('/delete-account', (req, res) => render(res, deleteAccountPage()));

// ─── Armazenamento de Leads ────────────────────────────────────────────────
let localLeads = [];

async function saveLead(leadData) {
  const newLead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    created_at: new Date().toISOString(),
    name: leadData.name || '',
    email: leadData.email || '',
    phone: leadData.phone || '',
    subject: leadData.subject || 'Geral',
    message: leadData.message || '',
    status: 'novo'
  };
  try {
    const { data, error } = await admin.from('leads').insert(newLead).select().single();
    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase leads table insert error, storing locally:', err.message);
  }
  localLeads.unshift(newLead);
  return newLead;
}

async function getLeads() {
  try {
    const { data, error } = await admin.from('leads').select('*').order('created_at', { ascending: false });
    if (!error && data && data.length) {
      // Merge com localLeads se houver
      const dbIds = new Set(data.map(l => l.id));
      const combined = [...data];
      for (const loc of localLeads) {
        if (!dbIds.has(loc.id)) combined.push(loc);
      }
      return combined;
    }
  } catch (err) {}
  return localLeads;
}

// ─── API Disparos de E-mail (Resend) ───────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios.' });
  
  // 1. Salva o Lead no banco de dados / painel admin
  const lead = await saveLead({ name, email, phone, subject, message });

  // 2. Dispara e-mail via Resend
  const emailResult = await emailService.sendContactFormEmail({ name, email, phone, subject, message });
  
  res.json({ success: true, lead, emailResult });
});

app.post('/api/email/welcome', async (req, res) => {
  const { email, name, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email é obrigatório.' });
  const result = await emailService.sendWelcomeEmail({ email, name, role });
  res.json(result);
});

app.post('/api/email/reset-password', async (req, res) => {
  const { email, name, resetUrl } = req.body;
  if (!email) return res.status(400).json({ error: 'Email é obrigatório.' });
  const result = await emailService.sendPasswordResetEmail({ email, name, resetUrl });
  res.json(result);
});

app.post('/api/email/account-deleted', async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email é obrigatório.' });
  const result = await emailService.sendAccountDeletedEmail({ email, name });
  res.json(result);
});

app.post('/api/email/payment-approved', async (req, res) => {
  const { email, name, amount, method, transactionId } = req.body;
  if (!email) return res.status(400).json({ error: 'Email é obrigatório.' });
  const result = await emailService.sendPaymentApprovedEmail({ email, name, amount, method, transactionId });
  res.json(result);
});

app.post('/api/email/ride-completed', async (req, res) => {
  const { email, name, driverName, amount, origin, destination } = req.body;
  if (!email) return res.status(400).json({ error: 'Email é obrigatório.' });
  const result = await emailService.sendRideCompletedEmail({ email, name, driverName, amount, origin, destination });
  res.json(result);
});

// ─── Landing Page pública ───────────────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    const [{ data: s }, { data: fares }] = await Promise.all([
      admin.from('app_settings').select('*').eq('id', 1).single(),
      admin.from('fare_config').select('*').order('ride_type')
    ]);
    const html = landingPage({ settings: s ?? {}, fares: fares ?? [] });
    render(res, html);
  } catch (e) {
    console.error('Error rendering landing page:', e);
    res.status(500).send('Erro interno do servidor.');
  }
});

// ─── Dashboard ──────────────────────────────────────────────────────────────
adminRouter.get('/', requireAuth, async (req, res) => {
  const preset = req.query.preset || '30d';
  let startDate = req.query.startDate;
  let endDate = req.query.endDate;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  if (preset === 'today') {
    startDate = todayStr;
    endDate = todayStr;
  } else if (preset === '7d') {
    const d = new Date(now.getTime() - 6 * 864e5);
    startDate = d.toISOString().slice(0, 10);
    endDate = todayStr;
  } else if (preset === '30d' || (!startDate && !endDate)) {
    const d = new Date(now.getTime() - 29 * 864e5);
    startDate = d.toISOString().slice(0, 10);
    endDate = todayStr;
  } else if (preset === 'this_month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate = d.toISOString().slice(0, 10);
    endDate = todayStr;
  } else if (preset === 'last_month') {
    const d1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const d2 = new Date(now.getFullYear(), now.getMonth(), 0);
    startDate = d1.toISOString().slice(0, 10);
    endDate = d2.toISOString().slice(0, 10);
  }

  // Ensure default fallback if invalid dates
  if (!startDate) startDate = new Date(now.getTime() - 29 * 864e5).toISOString().slice(0, 10);
  if (!endDate) endDate = todayStr;

  const startISO = `${startDate}T00:00:00.000Z`;
  const endISO = `${endDate}T23:59:59.999Z`;

  const [{ data: k }, { data: periodRides }, { data: periodPayments }, { data: leads }] = await Promise.all([
    admin.rpc('admin_kpis'),
    admin.from('rides').select('*').gte('requested_at', startISO).lte('requested_at', endISO).order('requested_at', { ascending: false }),
    admin.from('payments').select('*').gte('created_at', startISO).lte('created_at', endISO),
    getLeads()
  ]);

  const kpis = k ?? {};
  const rides = periodRides ?? [];
  const payments = periodPayments ?? [];

  // Period Calculated Metrics
  const totalRidesPeriod = rides.length;
  const completedRidesPeriod = rides.filter(r => r.status === 'completed');
  const cancelledRidesPeriod = rides.filter(r => r.status === 'cancelled');
  const inProgressRidesPeriod = rides.filter(r => ['in_progress', 'driver_on_way', 'driver_arrived', 'driver_found', 'searching'].includes(r.status));

  const grossFaresPeriod = completedRidesPeriod.reduce((sum, r) => sum + (Number(r.price) || 0), 0);
  const avgTicketPeriod = completedRidesPeriod.length ? grossFaresPeriod / completedRidesPeriod.length : 0;
  const successRate = totalRidesPeriod ? ((completedRidesPeriod.length / totalRidesPeriod) * 100).toFixed(1) : '100.0';

  const subRevenuePeriod = payments.filter(p => p.status === 'approved' || p.status === 'confirmed').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Category breakdown for period
  const catCounts = { moto: 0, economy: 0, comfort: 0, premium: 0 };
  const catRevenue = { moto: 0, economy: 0, comfort: 0, premium: 0 };
  completedRidesPeriod.forEach(r => {
    const t = r.ride_type || 'economy';
    if (catCounts[t] !== undefined) {
      catCounts[t]++;
      catRevenue[t] += Number(r.price) || 0;
    }
  });

  // Daily Chart Data Generator
  const sDate = new Date(startDate);
  const eDate = new Date(endDate);
  const dayList = [];
  const curr = new Date(sDate);
  while (curr <= eDate) {
    const kStr = curr.toISOString().slice(0, 10);
    dayList.push({
      key: kStr,
      label: curr.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      rides: 0,
      revenue: 0
    });
    curr.setDate(curr.getDate() + 1);
  }

  const dayMap = Object.fromEntries(dayList.map(d => [d.key, d]));
  rides.forEach(r => {
    const key = String(r.requested_at).slice(0, 10);
    if (dayMap[key]) {
      dayMap[key].rides++;
      if (r.status === 'completed') {
        dayMap[key].revenue += Number(r.price) || 0;
      }
    }
  });

  const names = await profileNames(rides.slice(0, 10).flatMap(r => [r.passenger_id, r.driver_id]));
  const recentRows = rides.slice(0, 10).map(r => [
    badge(r.ride_type),
    badge(r.status),
    brl(r.price),
    esc(names[r.passenger_id] ?? '—'),
    esc(names[r.driver_id] ?? '—'),
    fmtDate(r.requested_at),
  ]);

  const presetLink = (key, label) => {
    const activeClass = (preset === key) ? 'on' : '';
    return `<a href="/admin?preset=${key}" class="${activeClass}">${label}</a>`;
  };

  const filterBar = `
    <div style="background:#FFFFFF;border:1px solid var(--line);border-radius:16px;padding:16px 20px;margin-bottom:24px;box-shadow:var(--shadow);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div class="filters" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">
        <span style="font-size:13px;font-weight:700;color:var(--mut);margin-right:4px;">Período rápido:</span>
        ${presetLink('today', 'Hoje')}
        ${presetLink('7d', 'Últimos 7 dias')}
        ${presetLink('30d', 'Últimos 30 dias')}
        ${presetLink('this_month', 'Este mês')}
        ${presetLink('last_month', 'Mês passado')}
      </div>
      <form method="get" action="/admin" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0;">
        <input type="hidden" name="preset" value="custom">
        <div style="display:flex;align-items:center;gap:6px;">
          <label style="margin:0;font-size:12px;color:var(--mut);font-weight:600;">De:</label>
          <input type="date" name="startDate" value="${startDate}" style="padding:7px 10px;font-size:13px;width:145px;">
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <label style="margin:0;font-size:12px;color:var(--mut);font-weight:600;">Até:</label>
          <input type="date" name="endDate" value="${endDate}" style="padding:7px 10px;font-size:13px;width:145px;">
        </div>
        <button type="submit" class="act" style="padding:8px 14px;font-size:13px;display:inline-flex;align-items:center;gap:4px;">🔍 Filtrar</button>
      </form>
    </div>
  `;

  const body = `
    ${filterBar}

    <!-- KPIs do Período Selecionado -->
    <div style="margin-bottom:12px;"><h3 style="margin:0 0 12px;font-size:14px;color:var(--mut);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">📊 Métricas do Período (${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')})</h3></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr));">
      ${kpiCard('Corridas no Período', totalRidesPeriod, `${completedRidesPeriod.length} concluídas`)}
      ${kpiCard('Faturamento em Corridas', brl(grossFaresPeriod), `Ticket Médio ${brl(avgTicketPeriod)}`)}
      ${kpiCard('Taxa de Conclusão', `${successRate}%`, `${cancelledRidesPeriod.length} canceladas`)}
      ${kpiCard('Receita de Assinaturas', brl(subRevenuePeriod), 'pagamentos confirmados')}
    </div>

    <!-- KPIs Gerais da Plataforma -->
    <div style="margin:20px 0 12px;"><h3 style="margin:0 0 12px;font-size:14px;color:var(--mut);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">🚗 Visão Geral da Plataforma</h3></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));">
      ${kpiCard('Passageiros', kpis.passengers ?? 0)}
      ${kpiCard('Motoristas', kpis.drivers_total ?? 0, `${kpis.drivers_verified ?? 0} verificados`)}
      ${kpiCard('Online Agora', kpis.drivers_online ?? 0, `${kpis.drivers_on_ride ?? 0} em corrida`)}
      ${kpiCard('Pendentes Aprovação', kpis.drivers_pending ?? 0)}
      ${kpiCard('Assinaturas Ativas', kpis.subs_active ?? 0)}
      ${kpiCard('Leads & Contatos', (leads ?? []).length, `${(leads ?? []).filter(l=>l.status==='novo'||l.status==='new').length} novos`)}
      ${kpiCard('Suporte Aberto', kpis.support_open ?? 0)}
    </div>

    <!-- Gráficos Analíticos -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:24px;" class="charts-row">
      <div class="card" style="margin:0;">
        <h2>📈 Evolução Diária de Corridas &amp; Faturamento</h2>
        <canvas id="ridesChart" height="120"></canvas>
      </div>
      <div class="card" style="margin:0;">
        <h2>🚕 Corridas por Categoria</h2>
        <canvas id="categoryChart" height="180"></canvas>
      </div>
    </div>

    <!-- Tabela por Categoria no Período -->
    <div class="card">
      <h2>Desempenho por Categoria no Período Selecionado</h2>
      ${table(['Categoria', 'Corridas Concluídas', 'Faturamento Gerado', 'Participação %'], (() => {
        const catLabels = { moto: 'Moto', economy: 'Econômico (Rotta Smart)', comfort: 'Conforto', premium: 'Premium' };
        const totalComp = completedRidesPeriod.length || 1;
        return ['moto', 'economy', 'comfort', 'premium'].map(t => {
          const count = catCounts[t] || 0;
          const rev = catRevenue[t] || 0;
          const share = ((count / totalComp) * 100).toFixed(1);
          return [esc(catLabels[t]), String(count), brl(rev), `${share}%`];
        });
      })())}
    </div>

    <!-- Corridas Recentes -->
    <div class="card">
      <h2>Últimas Corridas do Período</h2>
      ${table(['Categoria', 'Status', 'Preço', 'Passageiro', 'Motorista', 'Data/Hora'], recentRows)}
    </div>

    <script>
      // 1. Gráfico de Linha Diário
      const ctxLine = document.getElementById('ridesChart');
      new Chart(ctxLine, {
        type: 'line',
        data: {
          labels: ${JSON.stringify(dayList.map(d => d.label))},
          datasets: [
            {
              label: 'Corridas',
              data: ${JSON.stringify(dayList.map(d => d.rides))},
              borderColor: '#18b56a',
              backgroundColor: 'rgba(24, 181, 106, 0.15)',
              fill: true,
              tension: 0.35,
              yAxisID: 'y'
            },
            {
              label: 'Faturamento (R$)',
              data: ${JSON.stringify(dayList.map(d => d.revenue))},
              borderColor: '#3b9ae0',
              backgroundColor: 'transparent',
              borderDash: [4, 4],
              tension: 0.35,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true, position: 'top' } },
          scales: {
            x: { grid: { color: '#E3E8EE' }, ticks: { color: '#6B7785' } },
            y: { type: 'linear', display: true, position: 'left', grid: { color: '#E3E8EE' }, ticks: { color: '#6B7785' }, beginAtZero: true },
            y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#3b9ae0' }, beginAtZero: true }
          }
        }
      });

      // 2. Gráfico de Rosca de Categoria
      const ctxDonut = document.getElementById('categoryChart');
      new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
          labels: ['Moto', 'Econômico', 'Conforto', 'Premium'],
          datasets: [{
            data: [${catCounts.moto}, ${catCounts.economy}, ${catCounts.comfort}, ${catCounts.premium}],
            backgroundColor: ['#18b56a', '#3b9ae0', '#f0a020', '#8b5cf6'],
            borderWidth: 2,
            borderColor: '#FFFFFF'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
          cutout: '65%'
        }
      });
    </script>
    <style>
      @media (max-width: 900px) {
        .charts-row { grid-template-columns: 1fr !important; }
      }
    </style>
  `;

  render(res, layout({ title: 'Visão geral', active: '/admin', email: req.session.email, body }));
});

// ─── Usuários ────────────────────────────────────────────────────────────────
const userRoleLabel = (role) => ({ admin: 'Administrador', manager: 'Gerente', driver: 'Motorista', passenger: 'Passageiro' }[role] || role || 'Usuário');
const userFormFields = (profile, driver = {}, vehicle = {}, { includeDriver = false } = {}) => `
  <div class="row2">
    <div><label>Nome completo</label><input name="full_name" value="${esc(profile.full_name || '')}" required></div>
    <div><label>E-mail de acesso</label><input name="email" type="email" value="${esc(profile.email || '')}" required></div>
    <div><label>Telefone</label><input name="phone" value="${esc(profile.phone || '')}"></div>
    <div><label>CPF</label><input name="cpf" value="${esc(profile.cpf || '')}"></div>
    <div><label>Gênero</label><select name="gender"><option value="">Não informado</option><option value="female" ${profile.gender === 'female' ? 'selected' : ''}>Feminino</option><option value="male" ${profile.gender === 'male' ? 'selected' : ''}>Masculino</option><option value="other" ${profile.gender === 'other' ? 'selected' : ''}>Outro</option></select></div>
    <div><label>Status da conta</label><select name="is_active"><option value="1" ${profile.is_active !== false ? 'selected' : ''}>Ativa</option><option value="0" ${profile.is_active === false ? 'selected' : ''}>Inativa</option></select></div>
  </div>
  <h3 style="margin:22px 0 12px;font-size:15px;color:var(--txt);">Endereço</h3>
  <div class="row2">
    <div><label>CEP</label><input name="address_cep" value="${esc(profile.address_cep || '')}"></div>
    <div><label>Estado</label><input name="address_state" maxlength="2" value="${esc(profile.address_state || '')}"></div>
    <div><label>Cidade</label><input name="address_city" value="${esc(profile.address_city || '')}"></div>
    <div><label>Bairro</label><input name="address_neighborhood" value="${esc(profile.address_neighborhood || '')}"></div>
    <div><label>Rua</label><input name="address_street" value="${esc(profile.address_street || '')}"></div>
    <div><label>Número</label><input name="address_number" value="${esc(profile.address_number || '')}"></div>
    <div style="grid-column:1/-1"><label>Complemento</label><input name="address_complement" value="${esc(profile.address_complement || '')}"></div>
  </div>
  ${includeDriver ? `<h3 style="margin:22px 0 12px;font-size:15px;color:var(--txt);">Dados do motorista</h3>
  <div class="row2">
    <div><label>Chave PIX</label><input name="pix_key" value="${esc(driver.pix_key || '')}"></div>
    <div><label>Cidade operacional</label><input name="operating_city" value="${esc(driver.operating_city || '')}"></div>
    <div><label>Estado operacional</label><input name="operating_state" maxlength="2" value="${esc(driver.operating_state || '')}"></div>
  </div>
  <h3 style="margin:22px 0 12px;font-size:15px;color:var(--txt);">Veículo principal</h3>
  <div class="row2">
    <div><label>Marca</label><input name="vehicle_brand" value="${esc(vehicle.brand || '')}"></div>
    <div><label>Modelo</label><input name="vehicle_model" value="${esc(vehicle.model || '')}"></div>
    <div><label>Placa</label><input name="vehicle_plate" value="${esc(vehicle.plate || '')}"></div>
    <div><label>Ano</label><input name="vehicle_year" type="number" min="1980" max="2100" value="${esc(vehicle.year || '')}"></div>
    <div><label>Cor</label><input name="vehicle_color" value="${esc(vehicle.color || '')}"></div>
    <div><label>Tipo</label><select name="vehicle_type"><option value="sedan" ${vehicle.type === 'sedan' ? 'selected' : ''}>Sedan</option><option value="hatch" ${vehicle.type === 'hatch' ? 'selected' : ''}>Hatch</option><option value="suv" ${vehicle.type === 'suv' ? 'selected' : ''}>SUV</option><option value="moto" ${vehicle.type === 'moto' ? 'selected' : ''}>Moto</option></select></div>
    <div><label>Valor FIPE</label><input name="vehicle_fipe_value" type="number" min="0" step="0.01" value="${esc(vehicle.fipe_value || '')}"></div>
    <div><label>Assentos</label><input name="vehicle_seats" type="number" min="1" max="9" value="${esc(vehicle.seats || 4)}"></div>
  </div>` : ''}`;

adminRouter.get('/users', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim().toLocaleLowerCase('pt-BR');
  const role = ['admin', 'manager', 'driver', 'passenger'].includes(req.query.role) ? req.query.role : '';
  const { data, error } = await admin.from('profiles').select('id,full_name,email,phone,role,is_active,created_at,updated_at').order('created_at', { ascending: false });
  if (error) return render(res, layout({ title: 'Usuários', active: '/users', email: req.session.email, body: `<div class="err">Erro ao carregar usuários: ${esc(error.message)}</div>` }));
  const users = (data || []).filter((user) => {
    const haystack = [user.full_name, user.email, user.phone].join(' ').toLocaleLowerCase('pt-BR');
    return (!q || haystack.includes(q)) && (!role || user.role === role);
  });
  const rows = users.map((user) => [
    `<strong>${esc(user.full_name || 'Sem nome')}</strong><br><small class="muted">${esc(user.email || '')}</small>`,
    badge(userRoleLabel(user.role)),
    esc(fmtPhone(user.phone)),
    user.is_active === false ? badge('suspended') : badge('active'),
    fmtDate(user.created_at),
    `<div class="actions"><a class="btn-icon gray" href="/users/${user.id}/edit" title="Editar usuário" aria-label="Editar usuário">✎</a><a class="btn-icon gray" href="/users/${user.id}/reset-password" title="Redefinir senha" aria-label="Redefinir senha">🔑</a></div>`,
  ]);
  const body = `
    ${req.query.ok ? '<div class="ok">Operação realizada com sucesso.</div>' : ''}${req.query.error ? `<div class="err">${esc(req.query.error)}</div>` : ''}
    <div class="notice"><strong>Central de usuários.</strong> O administrador pode editar qualquer perfil, inclusive o próprio acesso. A alteração de e-mail é sincronizada com o login e a redefinição de senha é aplicada imediatamente.</div>
    <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><div class="filters"><a href="/users" class="${!role ? 'on' : ''}">Todos</a><a href="/users?role=driver" class="${role === 'driver' ? 'on' : ''}">Motoristas</a><a href="/users?role=passenger" class="${role === 'passenger' ? 'on' : ''}">Passageiros</a><a href="/users?role=manager" class="${role === 'manager' ? 'on' : ''}">Gerentes</a><a href="/users?role=admin" class="${role === 'admin' ? 'on' : ''}">Administradores</a></div><form method="get" action="/users" style="display:flex;gap:8px;min-width:280px;flex:1;max-width:430px;">${role ? `<input type="hidden" name="role" value="${esc(role)}">` : ''}<input name="q" value="${esc(req.query.q || '')}" placeholder="Buscar nome, e-mail ou telefone..."><button class="act" type="submit">Buscar</button></form></div>
    <div class="card"><h2>Usuários cadastrados (${users.length})</h2>${table(['Usuário', 'Perfil', 'Telefone', 'Status', 'Cadastro', 'Ações'], rows)}</div>`;
  render(res, layout({ title: 'Usuários', active: '/users', email: req.session.email, body }));
});

adminRouter.get('/users/:id/edit', requireAuth, async (req, res) => {
  try {
    const { profile, driver, vehicle } = await loadUserBundle(admin, req.params.id);
    const body = `<div style="margin-bottom:16px;"><a href="/users" class="muted">← Voltar para usuários</a></div><div class="card" style="max-width:850px;margin:0 auto;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;"><div><h2 style="margin-bottom:6px;">Editar usuário</h2><p class="muted" style="margin:0;">${esc(profile.full_name || '')} · ${esc(userRoleLabel(profile.role))}</p></div><a class="act gray" href="/users/${profile.id}/reset-password">Redefinir senha</a></div><form method="post" action="/users/${profile.id}/edit">${userFormFields(profile, driver || {}, vehicle || {}, { includeDriver: profile.role === 'driver' })}<p class="muted" style="margin-top:18px;">A função e as permissões são administradas separadamente. Para gerente, use a central de gerentes.</p><div style="margin-top:24px;text-align:right;display:flex;gap:10px;justify-content:flex-end;"><a href="/users" class="act gray">Cancelar</a><button type="submit" class="act">Salvar alterações</button></div></form></div>`;
    render(res, layout({ title: `Editar · ${profile.full_name || 'Usuário'}`, active: '/users', email: req.session.email, body }));
  } catch (error) {
    res.status(404).send(esc(error.message));
  }
});

adminRouter.post('/users/:id/edit', requireAuth, async (req, res) => {
  try {
    const current = await loadUserBundle(admin, req.params.id);
    const updated = current.profile.role === 'driver'
      ? await updateDriverProfile(admin, req.params.id, req.body)
      : await updateUserProfile(admin, req.params.id, req.body);
    if (req.params.id === req.session.userId) {
      req.session.email = updated.profile?.email || updated.email || req.body.email;
      if (updated.is_active === false) return req.session.destroy(() => res.redirect('/login?error=Este acesso foi desativado.'));
    }
    res.redirect('/users?ok=1');
  } catch (error) {
    console.error('[Admin user edit]', error);
    res.redirect(`/users?error=${encodeURIComponent(error.message)}`);
  }
});

adminRouter.get('/users/:id/reset-password', requireAuth, async (req, res) => {
  try {
    const { profile } = await loadUserBundle(admin, req.params.id);
    const body = `<div style="margin-bottom:16px;"><a href="/users/${profile.id}/edit" class="muted">← Voltar para edição</a></div><div class="card" style="max-width:600px;margin:0 auto;"><h2>Redefinir senha</h2><p class="muted">A nova senha será aplicada imediatamente para <strong>${esc(profile.full_name || '')}</strong> (${esc(profile.email || '')}).</p><form method="post" action="/users/${profile.id}/reset-password"><label>Nova senha</label><input name="new_password" type="password" autocomplete="new-password" minlength="8" required placeholder="Mínimo de 8 caracteres"><label>Confirmar nova senha</label><input name="confirm_password" type="password" autocomplete="new-password" minlength="8" required placeholder="Repita a senha"><div style="margin-top:24px;text-align:right;display:flex;gap:10px;justify-content:flex-end;"><a href="/users/${profile.id}/edit" class="act gray">Cancelar</a><button type="submit" class="act">Alterar senha</button></div></form></div>`;
    render(res, layout({ title: 'Redefinir senha', active: '/users', email: req.session.email, body }));
  } catch (error) {
    res.status(404).send(esc(error.message));
  }
});

adminRouter.post('/users/:id/reset-password', requireAuth, async (req, res) => {
  try {
    if (String(req.body.new_password || '') !== String(req.body.confirm_password || '')) throw new Error('As senhas não conferem.');
    await resetUserPassword(admin, req.params.id, req.body.new_password);
    res.redirect('/users?ok=1');
  } catch (error) {
    console.error('[Admin user password]', error);
    res.redirect(`/users?error=${encodeURIComponent(error.message)}`);
  }
});

// ─── Drivers ──────────────────────────────────────────────────────────────
adminRouter.get('/drivers', requireAuth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = 20;
  const searchQuery = (req.query.q || '').trim().toLowerCase();
  const verificationFilter = req.query.verification || '';
  const planFilter = req.query.plan || '';
  const okMsg = req.query.ok ? `<div class="ok">✅ Operação realizada com sucesso!</div>` : req.query.error ? `<div class="err">${esc(req.query.error)}</div>` : '';

  const [{ data: drivers }, { data: profiles }, { data: subs }, { data: vehicles }, { data: docs }] = await Promise.all([
    admin.from('drivers').select('*'),
    admin.from('profiles').select('id,full_name,email,phone,rating,is_active,cpf').eq('role', 'driver'),
    admin.from('subscriptions').select('driver_id,status,plan,amount,due_date'),
    admin.from('vehicles').select('driver_id,model,plate'),
    admin.from('driver_documents').select('driver_id,id'),
  ]);

  const pMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  const sMap = Object.fromEntries((subs ?? []).map((s) => [s.driver_id, s]));
  const vMap = {}; (vehicles ?? []).forEach((v) => { (vMap[v.driver_id] ??= []).push(v); });
  const docCountMap = {}; (docs ?? []).forEach((d) => { docCountMap[d.driver_id] = (docCountMap[d.driver_id] || 0) + 1; });

  let allDrivers = (drivers ?? []).map(d => ({
    ...d,
    profile: pMap[d.id] || {},
    sub: sMap[d.id] || {},
    vehicle: (vMap[d.id] || [])[0] || {},
    docCount: docCountMap[d.id] || 0
  }));

  // Filtering
  if (verificationFilter === 'approved') {
    allDrivers = allDrivers.filter(d => d.is_verified);
  } else if (verificationFilter === 'pending') {
    allDrivers = allDrivers.filter(d => !d.is_verified);
  }

  if (planFilter) {
    allDrivers = allDrivers.filter(d => d.sub && d.sub.plan === planFilter);
  }

  if (searchQuery) {
    allDrivers = allDrivers.filter(d => {
      const name = (d.profile.full_name || '').toLowerCase();
      const email = (d.profile.email || '').toLowerCase();
      const phone = (d.profile.phone || '').toLowerCase();
      const cpf = (d.profile.cpf || '').toLowerCase();
      const model = (d.vehicle.model || '').toLowerCase();
      const plate = (d.vehicle.plate || '').toLowerCase();
      return name.includes(searchQuery) || email.includes(searchQuery) || phone.includes(searchQuery) || cpf.includes(searchQuery) || model.includes(searchQuery) || plate.includes(searchQuery);
    });
  }

  const totalItems = allDrivers.length;
  const pageDrivers = allDrivers.slice((page - 1) * pageSize, page * pageSize);

  // KPIs
  const totalDrivers = drivers?.length || 0;
  const verifiedCount = (drivers ?? []).filter(d => d.is_verified).length;
  const pendingCount = (drivers ?? []).filter(d => !d.is_verified).length;
  const activeSubsCount = (subs ?? []).filter(s => s.status === 'active').length;
  const onlineCount = (drivers ?? []).filter(d => d.status === 'online' || d.status === 'on_ride').length;

  const kpis = `
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px;margin-bottom:20px;">
      ${kpiCard('Total de Motoristas', totalDrivers)}
      ${kpiCard('Verificados / Aprovados', verifiedCount)}
      ${kpiCard('Pendentes de Documentos', pendingCount)}
      ${kpiCard('Online Agora', onlineCount)}
      ${kpiCard('Assinantes Ativos', activeSubsCount)}
    </div>
  `;

  const rows = pageDrivers.map((d) => {
    const p = d.profile; const s = d.sub; const v = d.vehicle; const dc = d.docCount;
    const verifyBtn = d.is_verified
      ? `<form class="inline" method="post" action="/drivers/${d.id}/unverify">${iconBtnSuspend('Suspender / Bloquear Motorista')}</form>`
      : `<form class="inline" method="post" action="/drivers/${d.id}/verify">${iconBtnApprove('Aprovar Motorista')}</form>`;
    
    const docsBtn = iconBtnDocs(`/drivers/${d.id}/documents`, `Ver Documentos Anexados (${dc} arquivos)`);
    const editBtn = iconBtnEdit(`/drivers/${d.id}/edit`, 'Editar Perfil e Veículo');
    const keyBtn = iconBtnKey(`/drivers/${d.id}/reset-password`, 'Redefinir Senha do Motorista');
    const planBtn = iconBtnPlan(`/drivers/${d.id}/plan`, 'Alterar Plano / Assinatura');
    const waBtn = iconBtnWhatsApp(p.phone, 'Conversar no WhatsApp');

    const docBadge = dc > 0 
      ? `<br><small style="color:#047857;font-weight:700;background:#ECFDF5;padding:2px 7px;border-radius:100px;display:inline-block;margin-top:2px;">${dc} documento(s)</small>`
      : `<br><small style="color:#9CA3AF;display:inline-block;margin-top:2px;">Sem anexos</small>`;

    return [
      `<div><strong>${esc(p.full_name ?? '—')}</strong><br><small style="color:var(--mut);">${esc(p.email ?? '')}</small></div>`,
      esc(fmtPhone(p.phone)),
      `${esc(v.model ?? '—')}<br><small style="color:#6B7280;font-weight:600">${esc(v.plate ?? '')}</small>`,
      badge(d.status),
      (d.is_verified ? badge('approved') : badge(d.documents_status ?? 'pending')) + docBadge,
      esc(d.pix_key ?? '—'),
      s.plan ? `${badge(s.plan)}<br><small>${badge(s.status)}</small>` : '<span style="color:var(--mut);font-size:12px;">Sem plano</span>',
      `<div style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap;">${verifyBtn} ${docsBtn} ${editBtn} ${keyBtn} ${planBtn} ${waBtn}</div>`,
    ];
  });

  const filterBar = `
    <div style="background:#FFFFFF;border:1px solid var(--line);border-radius:16px;padding:16px 20px;margin-bottom:20px;box-shadow:var(--shadow);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div class="filters" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">
        <span style="font-size:13px;font-weight:700;color:var(--mut);margin-right:4px;">Documentos:</span>
        <a href="/drivers" class="${!verificationFilter ? 'on' : ''}">Todos</a>
        <a href="/drivers?verification=approved" class="${verificationFilter === 'approved' ? 'on' : ''}">Aprovados</a>
        <a href="/drivers?verification=pending" class="${verificationFilter === 'pending' ? 'on' : ''}">Pendentes</a>
      </div>
      <form method="get" action="/drivers" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0;">
        ${verificationFilter ? `<input type="hidden" name="verification" value="${verificationFilter}">` : ''}
        <select name="plan" style="padding:8px 12px;font-size:13px;width:160px;" onchange="this.form.submit()">
          <option value="">Todos os Planos</option>
          <option value="eco" ${planFilter === 'eco' ? 'selected' : ''}>ECO Flex</option>
          <option value="smart" ${planFilter === 'smart' ? 'selected' : ''}>Rotta Smart</option>
          <option value="pro" ${planFilter === 'pro' ? 'selected' : ''}>Rotta Pro (Semanal)</option>
          <option value="vip" ${planFilter === 'vip' ? 'selected' : ''}>Rotta VIP (Mensal)</option>
        </select>
        <input type="text" name="q" value="${esc(req.query.q || '')}" placeholder="Buscar motorista, e-mail, placa..." style="padding:8px 12px;font-size:13px;width:240px;">
        <button type="submit" class="act" style="padding:8px 14px;font-size:13px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscar</button>
      </form>
    </div>
  `;

  const pageControls = pagination(totalItems, page, pageSize, req.originalUrl);
  const body = `
    ${okMsg}
    ${kpis}
    ${filterBar}
    <div class="card">
      <h2>Gerenciamento de Motoristas (${totalItems})</h2>
      ${table(['Nome & E-mail', 'Telefone', 'Veículo & Placa', 'Status', 'Documentos', 'Chave PIX', 'Plano Atual', 'Ações de Administração'], rows)}
      ${pageControls}
    </div>
  `;
  render(res, layout({ title: 'Motoristas', active: '/drivers', email: req.session.email, body }));
});

adminRouter.post('/drivers/:id/verify', requireAuth, async (req, res) => {
  await admin.from('drivers').update({ is_verified: true, documents_status: 'approved' }).eq('id', req.params.id);
  res.redirect('/drivers?ok=1');
});

adminRouter.post('/drivers/:id/unverify', requireAuth, async (req, res) => {
  await admin.from('drivers').update({ is_verified: false }).eq('id', req.params.id);
  res.redirect('/drivers?ok=1');
});

// ─── Driver Profile Edit ───────────────────────────────────────────────────
adminRouter.get('/drivers/:id/edit', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const { profile, driver, vehicle } = await loadUserBundle(admin, id);
    const body = `<div style="margin-bottom:16px;"><a href="/drivers" class="muted">&larr; Voltar para a lista de motoristas</a></div><div class="card" style="max-width:850px;margin:0 auto;"><h2>Editar Perfil do Motorista: ${esc(profile.full_name || '')}</h2><form method="post" action="/drivers/${id}/edit">${userFormFields(profile, driver || {}, vehicle || {}, { includeDriver: true })}<div style="margin-top:24px;text-align:right;display:flex;gap:10px;justify-content:flex-end;"><a href="/drivers" class="act gray">Cancelar</a><button type="submit" class="act">Salvar alterações</button></div></form></div>`;
    render(res, layout({ title: 'Editar Motorista', active: '/drivers', email: req.session.email, body }));
  } catch (error) {
    res.status(404).send(esc(error.message));
  }
});

adminRouter.post('/drivers/:id/edit', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    await updateDriverProfile(admin, id, req.body);
    res.redirect('/drivers?ok=1');
  } catch (error) {
    console.error('[Admin driver edit]', error);
    res.redirect(`/drivers?error=${encodeURIComponent(error.message)}`);
  }
});

// ─── Driver Password Reset ─────────────────────────────────────────────────
adminRouter.get('/drivers/:id/reset-password', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { data: profile } = await admin.from('profiles').select('*').eq('id', id).single();
  if (!profile) return res.status(404).send('Motorista não encontrado.');

  const body = `
    <div style="margin-bottom:16px;">
      <a href="/drivers" style="color:var(--mut);font-size:14px;font-weight:600;text-decoration:none;">&larr; Voltar para a lista de motoristas</a>
    </div>
    <div class="card" style="max-width:550px;margin:0 auto;">
      <h2>Redefinir Senha do Motorista</h2>
      <p style="color:var(--mut);font-size:14px;margin-bottom:20px;">Altere diretamente a senha de acesso do motorista <strong>${esc(profile.full_name)}</strong> (${esc(profile.email)}).</p>
      
      <form method="post" action="/drivers/${id}/reset-password">
        <label>Nova Senha</label>
        <input name="new_password" type="password" autocomplete="new-password" placeholder="Digite a nova senha (mínimo de 8 caracteres)" required minlength="8" style="font-size:15px;font-weight:600;">
        <label>Confirmar Nova Senha</label>
        <input name="confirm_password" type="password" autocomplete="new-password" placeholder="Repita a nova senha" required minlength="8" style="font-size:15px;font-weight:600;">
        
        <div style="margin-top:20px;text-align:right;display:flex;gap:10px;justify-content:flex-end;">
          <a href="/drivers" class="act gray" style="padding:10px 18px;border-radius:10px;">Cancelar</a>
          <button type="submit" class="act" style="padding:10px 24px;border-radius:10px;">Alterar Senha Agora</button>
        </div>
      </form>
    </div>
  `;
  render(res, layout({ title: 'Redefinir Senha', active: '/drivers', email: req.session.email, body }));
});

adminRouter.post('/drivers/:id/reset-password', requireAuth, async (req, res) => {
  const id = req.params.id;
  const newPass = req.body.new_password;
  try {
    if (String(newPass || '') !== String(req.body.confirm_password || '')) throw new Error('As senhas não conferem.');
    await resetUserPassword(admin, id, newPass);
    res.redirect('/drivers?ok=1');
  } catch (error) {
    console.error('[Admin driver password]', error);
    res.redirect(`/drivers?error=${encodeURIComponent(error.message)}`);
  }
});

// ─── Driver Plan / Subscription Change ──────────────────────────────────────
adminRouter.get('/drivers/:id/plan', requireAuth, async (req, res) => {
  const id = req.params.id;
  const [{ data: profile }, { data: sub }, { data: settings }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', id).single(),
    admin.from('subscriptions').select('*').eq('driver_id', id).maybeSingle(),
    admin.from('app_settings').select('*').eq('id', 1).single(),
  ]);

  if (!profile) return res.status(404).send('Motorista não encontrado.');

  const s = sub ?? {};
  const set = settings ?? {};

  const body = `
    <div style="margin-bottom:16px;">
      <a href="/drivers" style="color:var(--mut);font-size:14px;font-weight:600;text-decoration:none;">&larr; Voltar para a lista de motoristas</a>
    </div>
    <div class="card" style="max-width:600px;margin:0 auto;">
      <h2>Gerenciar Plano do Motorista</h2>
      <p style="color:var(--mut);font-size:14px;margin-bottom:20px;">Altere o plano e o status da assinatura do motorista <strong>${esc(profile.full_name)}</strong>.</p>
      
      <form method="post" action="/drivers/${id}/plan">
        <div class="row2">
          <div>
            <label>Selecione o Plano</label>
            <select name="plan" style="font-weight:600;">
              <option value="eco" ${s.plan === 'eco' ? 'selected' : ''}>ECO Flex (${set.commission_pct ?? 15}% por corrida)</option>
              <option value="smart" ${s.plan === 'smart' ? 'selected' : ''}>Rotta Smart (R$ ${Number(set.subscription_daily_amount || 3).toFixed(2)} por corrida)</option>
              <option value="pro" ${s.plan === 'pro' ? 'selected' : ''}>Rotta Pro (Semanal - R$ ${Number(set.plan_weekly_price || 12.5).toFixed(2)})</option>
              <option value="vip" ${s.plan === 'vip' || !s.plan ? 'selected' : ''}>Rotta VIP (Mensal - R$ ${Number(set.subscription_monthly_amount || 49.9).toFixed(2)})</option>
            </select>
          </div>
          <div>
            <label>Status da Assinatura</label>
            <select name="status" style="font-weight:600;">
              <option value="active" ${s.status === 'active' || !s.status ? 'selected' : ''}>Ativo (Liberado)</option>
              <option value="expired" ${s.status === 'expired' ? 'selected' : ''}>Expirado</option>
              <option value="suspended" ${s.status === 'suspended' ? 'selected' : ''}>Suspenso</option>
            </select>
          </div>
        </div>

        <div style="margin-top:16px;">
          <label>Data de Vencimento da Assinatura</label>
          <input type="date" name="due_date" value="${s.due_date ? String(s.due_date).slice(0,10) : new Date(Date.now() + 30*864e5).toISOString().slice(0,10)}" style="font-weight:600;">
        </div>

        <div style="margin-top:24px;text-align:right;display:flex;gap:10px;justify-content:flex-end;">
          <a href="/drivers" class="act gray" style="padding:10px 18px;border-radius:10px;">Cancelar</a>
          <button type="submit" class="act" style="padding:10px 24px;border-radius:10px;">💾 Atualizar Plano do Motorista</button>
        </div>
      </form>
    </div>
  `;
  render(res, layout({ title: 'Alterar Plano', active: '/drivers', email: req.session.email, body }));
});

adminRouter.post('/drivers/:id/plan', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { plan, status, due_date } = req.body;

  const { data: set } = await admin.from('app_settings').select('*').eq('id', 1).single();
  let amount = 49.9;
  if (plan === 'pro') amount = set?.plan_weekly_price ?? 12.5;
  else if (plan === 'smart') amount = set?.subscription_daily_amount ?? 3.0;
  else if (plan === 'vip') amount = set?.subscription_monthly_amount ?? 49.9;

  await admin.from('subscriptions').upsert({
    driver_id: id,
    plan,
    status,
    amount,
    due_date: due_date || new Date(Date.now() + 30*864e5).toISOString().slice(0,10),
    paid_at: status === 'active' ? new Date().toISOString() : null
  });

  res.redirect('/drivers?ok=1');
});

// ─── Driver Documents View ─────────────────────────────────────────────────
adminRouter.get('/drivers/:id/documents', requireAuth, async (req, res) => {
  const id = req.params.id;
  const [{ data: driver }, { data: profile }, { data: docs }] = await Promise.all([
    admin.from('drivers').select('*').eq('id', id).single(),
    admin.from('profiles').select('*').eq('id', id).single(),
    admin.from('driver_documents').select('*').eq('driver_id', id).order('uploaded_at', { ascending: false }),
  ]);

  if (!profile) return res.status(404).send('Motorista não encontrado.');

  const docList = docs ?? [];

  // Generate signed URLs or public URLs for each document file
  const docsWithUrls = await Promise.all(docList.map(async (doc) => {
    let url = '#';
    try {
      const { data } = await admin.storage.from('driver-docs').createSignedUrl(doc.file_path, 3600);
      if (data?.signedUrl) url = data.signedUrl;
      else url = admin.storage.from('driver-docs').getPublicUrl(doc.file_path).data?.publicUrl || '#';
    } catch (e) {
      url = admin.storage.from('driver-docs').getPublicUrl(doc.file_path).data?.publicUrl || '#';
    }
    return { ...doc, url };
  }));

  const docNames = {
    cnh: 'CNH / Carteira de Habilitação',
    rg: 'RG / Documento de Identidade',
    vehicle_doc: 'CRLV / Documento do Veículo',
    crlv: 'CRLV / Documento do Veículo',
    antecedentes: 'Certidão de Antecedentes Criminais',
    selfie: 'Foto de Perfil / Selfie com Documento',
    photo: 'Foto de Perfil / Selfie com Documento',
    residence: 'Comprovante de Residência',
  };

  const docRows = docsWithUrls.map((d) => [
    `<strong>${esc(docNames[d.doc_type] || d.doc_type)}</strong>`,
    fmtDate(d.uploaded_at),
    d.verified ? badge('approved') : badge('pending'),
    `<a href="${esc(d.url)}" target="_blank" class="act" style="padding:6px 14px;font-size:12.5px;text-decoration:none;border-radius:8px;display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Visualizar Documento</a>`
  ]);

  const verifyBtn = driver?.is_verified
    ? `<form method="post" action="/drivers/${id}/unverify"><button type="submit" class="act gray" style="padding:10px 20px;border-radius:10px;">Suspender / Invalidar Documentos</button></form>`
    : `<form method="post" action="/drivers/${id}/verify"><button type="submit" class="act" style="padding:10px 20px;border-radius:10px;">Aprovar Todos os Documentos</button></form>`;

  const body = `
    <div style="margin-bottom:16px;">
      <a href="/drivers" style="color:var(--mut);font-size:14px;font-weight:600;text-decoration:none;">&larr; Voltar para a lista de motoristas</a>
    </div>
    <div class="card" style="max-width:850px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <h2 style="margin:0;">Documentos Anexados: ${esc(profile.full_name)}</h2>
          <p style="margin:4px 0 0 0;color:var(--mut);font-size:13.5px;">E-mail: ${esc(profile.email)} | CPF: ${esc(profile.cpf || 'Não informado')}</p>
        </div>
        <div>
          ${verifyBtn}
        </div>
      </div>

      ${docList.length > 0
        ? table(['Tipo de Documento', 'Data de Envio', 'Status', 'Ação'], docRows)
        : `<div style="padding:40px;text-align:center;color:var(--mut);background:#F8FAFC;border:1px solid var(--line);border-radius:14px;">
            Nenhum arquivo ou documento anexado no momento para este motorista.
          </div>`
      }
    </div>
  `;
  render(res, layout({ title: 'Documentos do Motorista', active: '/drivers', email: req.session.email, body }));
});

// ─── Rides ────────────────────────────────────────────────────────────────
adminRouter.get('/rides', requireAuth, async (req, res) => {
  const status = req.query.status || '';
  const rideType = req.query.type || '';
  const searchQuery = (req.query.q || '').trim().toLowerCase();
  const page = Number(req.query.page) || 1;
  const pageSize = 20;

  let query = admin.from('rides').select('*').order('requested_at', { ascending: false }).limit(300);
  if (status) query = query.eq('status', status);
  if (rideType) query = query.eq('ride_type', rideType);

  const { data: ridesData } = await query;
  let allRides = ridesData ?? [];

  // Fetch names for filtering/display
  const allUserIds = Array.from(new Set(allRides.flatMap(r => [r.passenger_id, r.driver_id].filter(Boolean))));
  const names = await profileNames(allUserIds);

  // Client-side text search if provided
  if (searchQuery) {
    allRides = allRides.filter(r => {
      const pName = (names[r.passenger_id] || '').toLowerCase();
      const dName = (names[r.driver_id] || '').toLowerCase();
      return pName.includes(searchQuery) || dName.includes(searchQuery);
    });
  }

  const totalItems = allRides.length;
  const pageRides = allRides.slice((page - 1) * pageSize, page * pageSize);

  // KPIs
  const completedCount = allRides.filter(r => r.status === 'completed').length;
  const cancelledCount = allRides.filter(r => r.status === 'cancelled').length;
  const totalRevenue = allRides.filter(r => r.status === 'completed').reduce((sum, r) => sum + (Number(r.price) || 0), 0);

  const rows = pageRides.map((r) => [
    badge(r.ride_type),
    badge(r.status),
    brl(r.price),
    `${Number(r.distance_km ?? 0).toFixed(1)} km`,
    esc(names[r.passenger_id] ?? '—'),
    esc(names[r.driver_id] ?? '—'),
    r.fare_paid ? badge('approved') : badge('pending'),
    fmtDate(r.requested_at),
    (r.status === 'completed' && !r.fare_paid)
      ? `<form class="inline" method="post" action="/rides/${r.id}/mark-paid">${iconBtnDollar('Marcar como Pago')}</form>`
      : '—',
  ]);

  const filterPills = [
    { key: '', label: 'Todas' },
    { key: 'searching', label: 'Procurando' },
    { key: 'in_progress', label: 'Em andamento' },
    { key: 'completed', label: 'Concluídas' },
    { key: 'cancelled', label: 'Canceladas' }
  ];

  const pillBtn = (f) => {
    const isSel = status === f.key;
    const url = new URL(req.originalUrl, 'http://localhost');
    if (f.key) url.searchParams.set('status', f.key);
    else url.searchParams.delete('status');
    url.searchParams.delete('page');
    return `<a href="${url.pathname + url.search}" class="${isSel ? 'on' : ''}">${f.label}</a>`;
  };

  const filterBar = `
    <div style="background:#FFFFFF;border:1px solid var(--line);border-radius:16px;padding:16px 20px;margin-bottom:20px;box-shadow:var(--shadow);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div class="filters" style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
        <span style="font-size:13px;font-weight:700;color:var(--mut);margin-right:4px;">Status:</span>
        ${filterPills.map(pillBtn).join('')}
      </div>
      <form method="get" action="/rides" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0;">
        ${status ? `<input type="hidden" name="status" value="${status}">` : ''}
        <select name="type" style="padding:8px 12px;font-size:13px;width:170px;" onchange="this.form.submit()">
          <option value="">Todas Categorias</option>
          <option value="moto" ${rideType === 'moto' ? 'selected' : ''}>Moto</option>
          <option value="economy" ${rideType === 'economy' ? 'selected' : ''}>Econômico (Smart)</option>
          <option value="comfort" ${rideType === 'comfort' ? 'selected' : ''}>Conforto</option>
          <option value="premium" ${rideType === 'premium' ? 'selected' : ''}>Premium</option>
        </select>
        <input type="text" name="q" value="${esc(req.query.q || '')}" placeholder="Buscar passageiro ou motorista..." style="padding:8px 12px;font-size:13px;width:240px;">
        <button type="submit" class="act" style="padding:8px 14px;font-size:13px;">🔍 Buscar</button>
      </form>
    </div>
  `;

  const kpiSection = `
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:20px;">
      ${kpiCard('Corridas Encontradas', totalItems)}
      ${kpiCard('Faturamento Gerado', brl(totalRevenue))}
      ${kpiCard('Concluídas', completedCount)}
      ${kpiCard('Canceladas', cancelledCount)}
    </div>
  `;

  const pageControls = pagination(totalItems, page, pageSize, req.originalUrl);
  const body = `
    ${kpiSection}
    ${filterBar}
    <div class="card">
      <h2>Listagem de Corridas (${totalItems})</h2>
      ${table(['Categoria', 'Status', 'Preço', 'Distância', 'Passageiro', 'Motorista', 'Pago', 'Quando', 'Ação'], rows)}
      ${pageControls}
    </div>
  `;
  render(res, layout({ title: 'Corridas', active: '/rides', email: req.session.email, body }));
});

adminRouter.post('/rides/:id/mark-paid', requireAuth, async (req, res) => {
  // service_role bypasses RLS; only flip completed rides that aren't paid yet.
  await admin.from('rides').update({ fare_paid: true }).eq('id', req.params.id).eq('status', 'completed');
  res.redirect('/rides');
});

// ─── Subscriptions ──────────────────────────────────────────────────────────
adminRouter.get('/subscriptions', requireAuth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = 20;

  const [{ data: subs }, { data: profiles }] = await Promise.all([
    admin.from('subscriptions').select('*').order('due_date', { ascending: true }),
    admin.from('profiles').select('id,full_name').eq('role', 'driver'),
  ]);

  const allSubs = subs ?? [];
  const totalItems = allSubs.length;
  const pageSubs = allSubs.slice((page - 1) * pageSize, page * pageSize);

  const pMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
  const rows = pageSubs.map((s) => [
    esc(pMap[s.driver_id] ?? '—'), badge(s.plan), badge(s.status), brl(s.amount),
    s.due_date ?? '—', fmtDate(s.paid_at),
    `<form class="inline" method="post" action="/subscriptions/${s.driver_id}/activate">${iconBtnApprove('Renovar / Ativar Assinatura')}</form>`,
  ]);
  const pageControls = pagination(totalItems, page, pageSize, req.originalUrl);
  const body = `<div class="card"><h2>Assinaturas dos motoristas (${totalItems})</h2>
    ${table(['Motorista', 'Plano', 'Status', 'Valor', 'Vence em', 'Pago em', 'Ação'], rows)}
    ${pageControls}</div>`;
  render(res, layout({ title: 'Assinaturas', active: '/subscriptions', email: req.session.email, body }));
});

adminRouter.post('/subscriptions/:driverId/activate', requireAuth, async (req, res) => {
  const { data: s } = await admin.from('subscriptions').select('plan,due_date').eq('driver_id', req.params.driverId).single();
  const base = new Date(Math.max(Date.now(), s?.due_date ? new Date(s.due_date).getTime() : Date.now()));
  base.setDate(base.getDate() + (s?.plan === 'daily' ? 1 : 30));
  await admin.from('subscriptions').update({
    status: 'active', due_date: base.toISOString().slice(0, 10), paid_at: new Date().toISOString(),
  }).eq('driver_id', req.params.driverId);
  res.redirect('/subscriptions');
});

// ─── Payments ─────────────────────────────────────────────────────────────
adminRouter.get('/payments', requireAuth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = 20;

  const { data: payments } = await admin.from('payments').select('*').order('created_at', { ascending: false }).limit(200);

  const allPayments = payments ?? [];
  const totalItems = allPayments.length;
  const pagePayments = allPayments.slice((page - 1) * pageSize, page * pageSize);

  const names = await profileNames(pagePayments.map((p) => p.driver_id));
  const rows = pagePayments.map((p) => [
    esc(names[p.driver_id] ?? '—'), brl(p.amount), esc(p.method), esc(p.provider), badge(p.status), fmtDate(p.created_at),
    p.status === 'pending'
      ? `<form class="inline" method="post" action="/payments/${p.id}/confirm">${iconBtnDollar('Confirmar Pagamento')}</form>`
      : '—',
  ]);
  const pageControls = pagination(totalItems, page, pageSize, req.originalUrl);
  const body = `<div class="card"><h2>Pagamentos de assinatura (${totalItems})</h2>
    ${table(['Motorista', 'Valor', 'Método', 'Provedor', 'Status', 'Criado', 'Ação'], rows)}
    ${pageControls}</div>`;
  render(res, layout({ title: 'Pagamentos', active: '/payments', email: req.session.email, body }));
});

adminRouter.post('/payments/:id/confirm', requireAuth, async (req, res) => {
  await admin.rpc('confirm_payment', { p_payment_id: req.params.id });
  res.redirect('/payments');
});

// ─── Leads / Mensagens da Landing Page ──────────────────────────────────────
adminRouter.get('/leads', requireAuth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = 20;

  const leads = await getLeads();
  const total = leads.length;
  const novos = leads.filter(l => l.status === 'novo' || l.status === 'new').length;
  const contatados = leads.filter(l => l.status === 'contatado' || l.status === 'contacted').length;

  const pageLeads = leads.slice((page - 1) * pageSize, page * pageSize);

  const rows = pageLeads.map(l => {
    const waButton = iconBtnWhatsApp(l.phone, 'Conversar no WhatsApp');
    const toggleStatusBtn = l.status === 'contatado' || l.status === 'contacted'
      ? '—'
      : `<form class="inline" method="post" action="/leads/${l.id}/contacted">${iconBtnApprove('Marcar Contatado')}</form>`;
    const deleteBtn = `<form class="inline" method="post" action="/leads/${l.id}/delete" onsubmit="return confirm('Excluir este lead definitivamente?')">${iconBtnTrash('Excluir Lead')}</form>`;

    return [
      fmtDate(l.created_at),
      esc(l.name),
      `<a href="mailto:${esc(l.email)}" style="color:var(--pri);font-weight:600;">${esc(l.email)}</a>`,
      esc(fmtPhone(l.phone)),
      esc(l.subject || 'Geral'),
      `<span title="${esc(l.message)}">${esc((l.message || '').slice(0, 60))}${ (l.message || '').length > 60 ? '...' : ''}</span>`,
      badge(l.status || 'novo'),
      `<div style="display:flex;gap:6px;align-items:center;">${waButton} ${toggleStatusBtn} ${deleteBtn}</div>`
    ];
  });

  const kpis = `
    <div class="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px;">
      ${kpiCard('Total de Leads', total)}
      ${kpiCard('Novos Leads', novos)}
      ${kpiCard('Contatados', contatados)}
    </div>
  `;

  const exportBtn = `<a href="/leads/export.csv" class="act" style="background:#0F172A;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:8px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar para Excel (CSV)</a>`;
  const pageControls = pagination(total, page, pageSize, req.originalUrl);

  const body = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin:0;">Leads &amp; Mensagens da Landing Page</h2>
          <p style="margin:4px 0 0 0;color:var(--mut);font-size:14px;">Gerencie os contatos recebidos pelo formulário do site.</p>
        </div>
        ${exportBtn}
      </div>
      ${kpis}
      ${table(['Data/Hora', 'Nome', 'E-mail', 'Telefone', 'Assunto', 'Mensagem', 'Status', 'Ações'], rows)}
      ${pageControls}
    </div>
  `;
  render(res, layout({ title: 'Leads / Contatos', active: '/leads', email: req.session.email, body }));
});

// Endpoint de Exportacao CSV para Excel
adminRouter.get('/leads/export.csv', requireAuth, async (req, res) => {
  const leads = await getLeads();
  let csv = 'ID;Data/Hora;Nome;E-mail;Telefone;Assunto;Mensagem;Status\n';
  leads.forEach(l => {
    const cleanMsg = (l.message || '').replace(/[\r\n;]/g, ' ');
    csv += `"${l.id}";"${fmtDate(l.created_at)}";"${l.name || ''}";"${l.email || ''}";"${l.phone || ''}";"${l.subject || ''}";"${cleanMsg}";"${l.status || 'novo'}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads_rotta_urbana.csv"');
  res.send('\uFEFF' + csv); // BOM for Excel UTF-8 recognition
});

adminRouter.post('/leads/:id/contacted', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await admin.from('leads').update({ status: 'contatado' }).eq('id', id);
  } catch (e) {}
  const local = localLeads.find(l => l.id === id);
  if (local) local.status = 'contatado';
  res.redirect('/leads');
});

adminRouter.post('/leads/:id/delete', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await admin.from('leads').delete().eq('id', id);
  } catch (e) {}
  localLeads = localLeads.filter(l => l.id !== id);
  res.redirect('/leads');
});

// ─── Support ──────────────────────────────────────────────────────────────
adminRouter.get('/support', requireAuth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = 20;

  const { data: tickets } = await admin.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(200);

  const allTickets = tickets ?? [];
  const totalItems = allTickets.length;
  const pageTickets = allTickets.slice((page - 1) * pageSize, page * pageSize);

  const names = await profileNames(pageTickets.map((t) => t.user_id));
  const rows = pageTickets.map((t) => [
    esc(names[t.user_id] ?? '—'), esc(t.subject), esc((t.message ?? '').slice(0, 80)), badge(t.status), fmtDate(t.created_at),
    t.status !== 'closed'
      ? `<form class="inline" method="post" action="/support/${t.id}/close">${iconBtnClose('Fechar Ticket')}</form>`
      : '—',
  ]);
  const pageControls = pagination(totalItems, page, pageSize, req.originalUrl);
  const body = `<div class="card"><h2>Tickets de Suporte (${totalItems})</h2>
    ${table(['Usuário', 'Assunto', 'Mensagem', 'Status', 'Criado', 'Ação'], rows)}
    ${pageControls}</div>`;
  render(res, layout({ title: 'Suporte', active: '/support', email: req.session.email, body }));
});

adminRouter.post('/support/:id/close', requireAuth, async (req, res) => {
  await admin.from('support_tickets').update({ status: 'closed' }).eq('id', req.params.id);
  res.redirect('/support');
});

// ─── Settings ─────────────────────────────────────────────────────────────
adminRouter.get('/settings', requireAuth, async (req, res) => {
  const { data: s } = await admin.from('app_settings').select('*').eq('id', 1).single();
  const { data: fares } = await admin.from('fare_config').select('*').order('ride_type');
  const set = s ?? {};
  const okMsg = req.query.ok ? `<div class="ok">Configurações salvas com sucesso! As alterações já estão ativas no App e na Landing Page.</div>` : '';
  const tab = req.query.tab || 'plans';

  const catMeta = {
    moto: { title: 'Moto', color: '#10B981' },
    economy: { title: 'Rotta Smart (Econômico)', color: '#3B82F6' },
    comfort: { title: 'Conforto', color: '#F59E0B' },
    premium: { title: 'Premium (Black)', color: '#8B5CF6' },
  };

  const order = ['moto', 'economy', 'comfort', 'premium'];
  const sortedFares = (fares ?? []).slice().sort((a, b) => order.indexOf(a.ride_type) - order.indexOf(b.ride_type));

  const tabBtn = (key, label) => `
    <a href="/settings?tab=${key}" class="${tab === key ? 'on' : ''}" style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:12px;font-weight:600;font-size:13.5px;text-decoration:none;transition:all 0.15s ease;">
      ${label}
    </a>
  `;

  const tabsHeader = `
    <div class="filters" style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;background:#FFFFFF;padding:8px;border-radius:16px;border:1px solid var(--line);box-shadow:var(--shadow);">
      ${tabBtn('plans', 'Planos & PIX')}
      ${tabBtn('moto', 'Moto')}
      ${tabBtn('economy', 'Econômico')}
      ${tabBtn('comfort', 'Conforto')}
      ${tabBtn('premium', 'Premium')}
    </div>
  `;

  let tabContent = '';

  if (tab === 'plans') {
    tabContent = `
      <form method="post" action="/settings">
        <!-- 1. Configurações Gerais -->
        <div class="card" style="border-left:4px solid var(--pri);">
          <h2 style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">Configurações Gerais da Plataforma</h2>
          <p style="margin:0 0 16px 0;color:var(--mut);font-size:13.5px;">Informações básicas exibidas no painel e aplicativo.</p>
          <div class="row2">
            <div>
              <label>Nome Oficial da Plataforma</label>
              <input name="platform_name" value="${esc(set.platform_name)}" placeholder="Ex: Rotta Urbana">
            </div>
            <div>
              <label>Aprovação de Novos Motoristas</label>
              <select name="driver_approval_mode" style="font-weight:600;color:#047857;">
                <option value="auto" ${set.driver_approval_mode !== 'manual' ? 'selected' : ''}>Automática (Cria e libera o motorista direto sem validação)</option>
                <option value="manual" ${set.driver_approval_mode === 'manual' ? 'selected' : ''}>Manual (Exige validação de documentos no painel)</option>
              </select>
            </div>
            <div>
              <label>Plano Padrão para Novos Cadastros</label>
              <select name="default_plan">
                <option value="monthly" ${set.default_plan === 'monthly' ? 'selected' : ''}>Mensal (Rotta VIP)</option>
                <option value="daily" ${set.default_plan === 'daily' ? 'selected' : ''}>Diária / Semanal (Rotta Pro)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 2. Tabela dos 4 Planos de Motorista -->
        <div class="card" style="border-left:4px solid #3B82F6;">
          <h2 style="margin-0 0 6px 0;">Valores dos Planos de Motoristas (Reflete na LP e no App)</h2>
          <p style="margin:0 0 20px 0;color:var(--mut);font-size:13.5px;">Altere os valores cobrados dos motoristas parceiros. Qualquer alteração aqui é sincronizada instantaneamente na Landing Page e no App.</p>
          
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;">
            <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:14px;padding:16px;">
              <div style="font-weight:800;color:#10B981;font-size:15px;margin-bottom:4px;">1. ECO Flex</div>
              <p style="margin:0 0 12px 0;font-size:12px;color:var(--mut);">Porcentagem de comissão por corrida realizada.</p>
              <label>Comissão (%)</label>
              <input name="commission_pct" value="${fmtVal(set.commission_pct ?? 15)}" style="font-weight:700;">
            </div>

            <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:14px;padding:16px;">
              <div style="font-weight:800;color:#3B82F6;font-size:15px;margin-bottom:4px;">2. Rotta Smart</div>
              <p style="margin:0 0 12px 0;font-size:12px;color:var(--mut);">Taxa fixa cobrada por corrida avulsa.</p>
              <label>Taxa por corrida (R$)</label>
              <input name="subscription_daily_amount" value="${fmtVal(set.subscription_daily_amount ?? 3)}" style="font-weight:700;">
            </div>

            <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:14px;padding:16px;">
              <div style="font-weight:800;color:#F59E0B;font-size:15px;margin-bottom:4px;">3. Rotta Pro</div>
              <p style="margin:0 0 12px 0;font-size:12px;color:var(--mut);">Assinatura semanal com corridas ilimitadas.</p>
              <label>Valor Semanal (R$)</label>
              <input name="plan_weekly_price" value="${fmtVal(set.plan_weekly_price ?? 12.5)}" style="font-weight:700;">
            </div>

            <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:14px;padding:16px;">
              <div style="font-weight:800;color:#8B5CF6;font-size:15px;margin-bottom:4px;">4. Rotta VIP</div>
              <p style="margin:0 0 12px 0;font-size:12px;color:var(--mut);">Assinatura mensal livre para rodar o mês inteiro.</p>
              <label>Valor Mensal (R$)</label>
              <input name="subscription_monthly_amount" value="${fmtVal(set.subscription_monthly_amount ?? 49.9)}" style="font-weight:700;">
            </div>
          </div>
        </div>

        <!-- 3. Dados PIX -->
        <div class="card" style="border-left:4px solid #F59E0B;">
          <h2 style="margin:0 0 6px 0;">Dados de Recebimento PIX da Plataforma</h2>
          <p style="margin:0 0 16px 0;color:var(--mut);font-size:13.5px;">Chave PIX utilizada para receber o pagamento das assinaturas dos motoristas.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
            <div>
              <label>Chave PIX (Telefone, E-mail, CPF/CNPJ)</label>
              <input name="platform_pix_key" value="${esc(set.platform_pix_key)}" placeholder="66996471003">
            </div>
            <div>
              <label>Nome do Recebedor (PIX)</label>
              <input name="platform_pix_name" value="${esc(set.platform_pix_name)}" placeholder="ROTTA URBANA">
            </div>
            <div>
              <label>Cidade Registrada (PIX)</label>
              <input name="platform_pix_city" value="${esc(set.platform_pix_city)}" placeholder="SINOP">
            </div>
          </div>
        </div>

        <!-- 4. Integração Mercado Pago PIX Automático -->
        <div class="card" style="border-left:4px solid #009EE3;">
          <h2 style="margin:0 0 6px 0;">Integração Mercado Pago (PIX Automático &amp; QRCodes)</h2>
          <p style="margin:0 0 16px 0;color:var(--mut);font-size:13.5px;">Credenciais ativas para geração automática de cobranças via PIX com reconciliação instantânea.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
            <div>
              <label>Mercado Pago Public Key</label>
              <input value="${esc(process.env.MERCADOPAGO_PUBLIC_KEY || 'Não configurada')}" readonly style="background:#F8FAFC;font-family:monospace;font-size:12px;">
            </div>
            <div>
              <label>Mercado Pago Client ID</label>
              <input value="${esc(process.env.MERCADOPAGO_CLIENT_ID || 'Não configurado')}" readonly style="background:#F8FAFC;font-family:monospace;font-size:12px;">
            </div>
            <div>
              <label>Status do Access Token</label>
              <input value="${process.env.MERCADOPAGO_ACCESS_TOKEN ? 'Ativo (Produção)' : 'Pendente'}" readonly style="background:#F8FAFC;font-weight:700;color:${process.env.MERCADOPAGO_ACCESS_TOKEN ? '#047857' : '#DC2626'}">
            </div>
          </div>
          <div style="margin-top:14px;background:#EFF6FF;border:1px solid #BFDBFE;padding:12px 16px;border-radius:10px;font-size:12.5px;color:#1E40AF;">
            <strong>URL do Webhook Mercado Pago:</strong> <code>https://${req.get('host')}/api/mercadopago/webhook</code>
          </div>
        </div>

        <div style="text-align:right;">
          <button class="act" style="padding:12px 28px;font-size:14.5px;border-radius:12px;" type="submit">Salvar Configurações dos Planos</button>
        </div>
      </form>
    `;
  } else {
    // Tab for specific fare category
    const f = sortedFares.find(x => x.ride_type === tab) || sortedFares[0];
    const meta = catMeta[f.ride_type] || { title: f.display_name, color: '#10B981' };
    const sampleEst = Math.max(f.min_fare, f.base_fare + (5 * f.per_km) + (10 * f.per_min)).toFixed(2);

    tabContent = `
      <form method="post" action="/settings/fares">
        <input type="hidden" name="tab" value="${esc(f.ride_type)}">
        <div class="card" style="border-left:4px solid ${meta.color};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
            <div>
              <h2 style="margin:0;font-size:18px;">Tarifas &amp; Regras da Categoria: ${esc(f.display_name || f.ride_type)}</h2>
              <p style="margin:4px 0 0 0;color:var(--mut);font-size:13.5px;">Ajuste os preços por KM/minuto e os requisitos para veículos cadastrados nesta categoria.</p>
            </div>
            <div>
              <span class="badge" style="background:${f.active ? '#ECFDF5' : '#FEF2F2'};color:${f.active ? '#047857' : '#DC2626'};padding:6px 14px;font-size:13px;">
                ${f.active ? 'Categoria Ativa' : 'Categoria Inativa'}
              </span>
            </div>
          </div>

          <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:20px;">
            <h3 style="margin:0 0 14px 0;font-size:14px;color:var(--txt);">1. Precificação de Corridas</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">
              <div>
                <label>Nome Exibido no App</label>
                <input name="name_${f.ride_type}" value="${esc(f.display_name || '')}">
              </div>
              <div>
                <label>Categoria Ativa no App?</label>
                <select name="active_${f.ride_type}">
                  <option value="1" ${f.active ? 'selected' : ''}>Sim (Ativa)</option>
                  <option value="0" ${!f.active ? 'selected' : ''}>Não (Inativa)</option>
                </select>
              </div>
              <div>
                <label>Bandeirada / Tarifa Base (R$)</label>
                <input name="base_${f.ride_type}" value="${fmtVal(f.base_fare)}" style="font-weight:700;">
              </div>
              <div>
                <label>Valor por KM Rodado (R$)</label>
                <input name="km_${f.ride_type}" value="${fmtVal(f.per_km)}" style="font-weight:700;">
              </div>
              <div>
                <label>Valor por Minuto em Viagem (R$)</label>
                <input name="min_${f.ride_type}" value="${fmtVal(f.per_min)}" style="font-weight:700;">
              </div>
              <div>
                <label>Tarifa Mínima da Corrida (R$)</label>
                <input name="minfare_${f.ride_type}" value="${fmtVal(f.min_fare)}" style="font-weight:700;">
              </div>
            </div>

            <!-- Simulação de Preço da Corrida -->
            <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:14px 18px;margin-top:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
              <div>
                <strong style="color:#065F46;font-size:13.5px;">Cálculo de Teste para Corrida Padrão (5 km / 10 min):</strong>
                <div style="font-size:12px;color:#047857;margin-top:2px;">Fórmula: max(R$ ${fmtVal(f.min_fare)}, R$ ${fmtVal(f.base_fare)} + (5 km × R$ ${fmtVal(f.per_km)}) + (10 min × R$ ${fmtVal(f.per_min)}))</div>
              </div>
              <div style="font-size:18px;font-weight:800;color:#047857;">
                R$ ${sampleEst}
              </div>
            </div>
          </div>

          <div style="background:#F8FAFC;border:1px solid var(--line);border-radius:14px;padding:18px;">
            <h3 style="margin:0 0 14px 0;font-size:14px;color:var(--txt);">2. Requisitos de Veículos</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">
              <div>
                <label>Ano Mínimo do Veículo</label>
                <input name="year_${f.ride_type}" value="${f.min_year ?? 0}" placeholder="Ex: 2014">
              </div>
              <div>
                <label>Valor FIPE Mínimo (R$)</label>
                <input name="fipe_${f.ride_type}" value="${fmtVal(f.min_fipe_value ?? 0)}" placeholder="Ex: 60000.00">
              </div>
              <div>
                <label>Nº Mínimo de Assentos</label>
                <input name="seats_${f.ride_type}" value="${f.min_seats ?? 4}">
              </div>
              <div>
                <label>Tipos Permitidos (Separado por vírgulas)</label>
                <input name="types_${f.ride_type}" value="${esc((f.allowed_vehicle_types || []).join(','))}" placeholder="sedan, hatch, suv">
              </div>
              <div>
                <label>Cores Exigidas (Separado por vírgulas)</label>
                <input name="colors_${f.ride_type}" value="${esc((f.require_colors || []).join(','))}" placeholder="vazio = qualquer cor">
              </div>
            </div>
          </div>

          <div style="text-align:right;margin-top:20px;">
            <button class="act" style="padding:12px 28px;font-size:14.5px;border-radius:12px;" type="submit">Salvar Tarifas da Categoria ${esc(f.display_name)}</button>
          </div>
        </div>
      </form>
    `;
  }

  const body = `${okMsg} ${tabsHeader} ${tabContent}`;
  render(res, layout({ title: 'Configurações', active: '/settings', email: req.session.email, body }));
});

adminRouter.post('/settings', requireAuth, async (req, res) => {
  const b = req.body;
  await admin.from('app_settings').update({
    platform_name: b.platform_name,
    driver_approval_mode: b.driver_approval_mode === 'manual' ? 'manual' : 'auto',
    default_plan: b.default_plan === 'daily' ? 'daily' : 'monthly',
    commission_pct: num(b.commission_pct),
    subscription_daily_amount: num(b.subscription_daily_amount),
    plan_weekly_price: num(b.plan_weekly_price),
    subscription_monthly_amount: num(b.subscription_monthly_amount),
    platform_pix_key: b.platform_pix_key ?? '',
    platform_pix_name: b.platform_pix_name ?? '',
    platform_pix_city: b.platform_pix_city ?? '',
  }).eq('id', 1);
  res.redirect('/settings?tab=plans&ok=1');
});

adminRouter.post('/settings/fares', requireAuth, async (req, res) => {
  const b = req.body;
  const targetTab = b.tab || 'moto';
  const arr = (s) => String(s ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  for (const t of ['moto', 'economy', 'comfort', 'premium']) {
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
  res.redirect(`/settings?tab=${targetTab}&ok=1`);
});

// ─── Mercado Pago PIX API Endpoints ─────────────────────────────────────────

// 1. Criar Cobrança PIX em Tempo Real (Gera QR Code + Copia e Cola)
registerManagerRoutes({ adminRouter, requireAuth, render, admin });
registerManagerPortalRoutes({ managerRouter, requireManagerAuth, managerLoginLimiter, render, admin });
app.use(MANAGER_BASE_PATH, managerRouter);
app.use(ADMIN_BASE_PATH, adminRouter);

app.post('/api/payments/create-pix', async (req, res) => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const { amount, description, email, driver_id } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valor de pagamento inválido.' });
  }

  const { data: set } = await admin.from('app_settings').select('platform_pix_key,platform_pix_name,platform_pix_city').eq('id', 1).single();
  const fallbackPixKey = set?.platform_pix_key || '66996471003';
  const fallbackPixName = set?.platform_pix_name || 'ROTTA URBANA';

  // Se nao houver token configurado ou for o padrão
  if (!token || token.length < 20) {
    return res.json({
      provider: 'manual_pix',
      status: 'pending',
      pix_key: fallbackPixKey,
      pix_name: fallbackPixName,
      message: 'Utilize a chave PIX informada para realizar a transferência.'
    });
  }

  try {
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pix-${driver_id || 'guest'}-${Date.now()}`
      },
      body: JSON.stringify({
        transaction_amount: Number(amount),
        description: description || 'Assinatura Rotta Urbana',
        payment_method_id: 'pix',
        payer: {
          email: email || 'contato@rottaurbana.com.br',
          first_name: 'Motorista',
          last_name: 'Parceiro'
        },
        external_reference: driver_id || ''
      })
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.warn('[MercadoPago Warning - Fallback to Manual PIX]', data.message);
      return res.json({
        provider: 'manual_pix',
        status: 'pending',
        pix_key: fallbackPixKey,
        pix_name: fallbackPixName,
        message: 'Utilize a chave PIX da plataforma para realizar o pagamento.'
      });
    }

    const pixInfo = data.point_of_interaction?.transaction_data || {};

    // Registra o pagamento pendente no banco
    if (driver_id) {
      await admin.from('payments').insert({
        driver_id,
        amount: Number(amount),
        method: 'pix',
        provider: 'mercadopago',
        status: 'pending',
        external_id: String(data.id)
      });
    }

    res.json({
      provider: 'mercadopago',
      payment_id: data.id,
      status: data.status,
      qr_code: pixInfo.qr_code,
      qr_code_base64: pixInfo.qr_code_base64,
      ticket_url: pixInfo.ticket_url
    });

  } catch (err) {
    console.error('[MercadoPago Exception]', err);
    res.json({
      provider: 'manual_pix',
      status: 'pending',
      pix_key: fallbackPixKey,
      pix_name: fallbackPixName,
      message: 'Utilize a chave PIX da plataforma para realizar o pagamento.'
    });
  }
});

// 2. Webhook Mercado Pago (Reconciliação Automática de Pagamentos)
app.post('/api/mercadopago/webhook', async (req, res) => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const body = req.body;
  const paymentId = body?.data?.id || req.query.id || req.query['data.id'];

  if (!paymentId || !token) {
    return res.status(200).send('Ignored');
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!mpRes.ok) return res.status(200).send('Error fetching payment');
    const data = await mpRes.json();

    if (data.status === 'approved') {
      const driverId = data.external_reference;
      
      if (driverId) {
        // Ativa a assinatura do motorista por 30 dias
        const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
        await admin.from('subscriptions').upsert({
          driver_id: driverId,
          status: 'active',
          due_date: due,
          paid_at: new Date().toISOString()
        });
      }

      // Atualiza tabela de pagamentos
      await admin.from('payments').update({ status: 'approved' }).eq('external_id', String(data.id));
      console.log(`[MercadoPago Webhook Approved] Payment ID: ${data.id} for Driver: ${driverId}`);
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('[MercadoPago Webhook Error]', e);
    res.status(200).send('Error');
  }
});

// ─── helpers ────────────────────────────────────────────────────────────────
async function profileNames(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await admin.from('profiles').select('id,full_name').in('id', uniq);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]));
}

const num = (v) => {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim().replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const fmtVal = (n, dec = 2) => Number(n ?? 0).toFixed(dec);

app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => console.log(`Rotta Urbana Admin on :${PORT}`));

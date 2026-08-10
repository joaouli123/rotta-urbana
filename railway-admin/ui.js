// Server-rendered UI helpers for the admin panel (no build step).

const DEFAULT_ADMIN_PANEL_SLUG = 'console-ru-7f3a9c';
const ADMIN_PANEL_SLUG = String(process.env.ADMIN_PANEL_SLUG || DEFAULT_ADMIN_PANEL_SLUG).trim().replace(/^\/+|\/+$/g, '');
const ADMIN_BASE_PATH = '/' + ADMIN_PANEL_SLUG;
const ADMIN_ROUTE_PREFIXES = ['/admin', '/login', '/logout', '/drivers', '/rides', '/subscriptions', '/payments', '/leads', '/support', '/settings'];
const adminHref = (route = '') => {
  const value = String(route || '');
  if (!value || value === '/') return ADMIN_BASE_PATH;
  return ADMIN_BASE_PATH + (value.startsWith('/') ? value : '/' + value);
};
const rewriteAdminPath = (value) => {
  const raw = String(value || '');
  const match = raw.match(/^([^?#]*)(.*)$/);
  const pathname = match?.[1] || raw;
  const suffix = match?.[2] || '';
  if (pathname === '/admin') return ADMIN_BASE_PATH + suffix;
  if (ADMIN_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) return ADMIN_BASE_PATH + pathname + suffix;
  return raw;
};
const rewriteAdminLinks = (html) => String(html ?? '').replace(/\b(href|action)="(\/[^"']*)"/g, (_match, attr, value) => attr + '="' + rewriteAdminPath(value) + '"');
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const brl = (n) =>
  'R$ ' + Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const fmtPhone = (phone) => {
  if (!phone) return '—';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 11) {
    return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
  }
  return phone;
};

const STATUS_COLORS = {
  online: '#18b56a', on_ride: '#f0a020', offline: '#8a9a93',
  active: '#18b56a', expired: '#e0533d', suspended: '#e0533d',
  completed: '#18b56a', cancelled: '#e0533d', searching: '#f0a020',
  approved: '#18b56a', pending: '#f0a020', rejected: '#e0533d',
  in_progress: '#3b9ae0', driver_on_way: '#3b9ae0', driver_arrived: '#3b9ae0', driver_found: '#3b9ae0',
  open: '#f0a020', closed: '#8a9a93',
  new: '#3b9ae0', novo: '#3b9ae0', contacted: '#18b56a', contatado: '#18b56a', archived: '#8a9a93', arquivado: '#8a9a93',
  monthly: '#3b9ae0', daily: '#f0a020', weekly: '#18b56a', commission: '#8a9a93',
  moto: '#18b56a', economy: '#3b9ae0', comfort: '#f0a020', premium: '#8b5cf6'
};

const STATUS_LABELS = {
  online: 'Online',
  offline: 'Desconectado',
  on_ride: 'Em corrida',
  active: 'Ativo',
  expired: 'Expirado',
  suspended: 'Suspenso',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  searching: 'Procurando',
  approved: 'Pago',
  pending: 'Pendente',
  rejected: 'Recusado',
  in_progress: 'Em andamento',
  driver_on_way: 'A caminho',
  driver_arrived: 'Chegou',
  driver_found: 'Encontrado',
  open: 'Aberto',
  closed: 'Fechado',
  new: 'Novo',
  novo: 'Novo',
  contacted: 'Contatado',
  contatado: 'Contatado',
  archived: 'Arquivado',
  arquivado: 'Arquivado',
  monthly: 'Mensal',
  daily: 'Diário',
  weekly: 'Semanal',
  commission: 'Comissão',
  moto: 'Moto',
  economy: 'Econômico (Smart)',
  comfort: 'Conforto',
  premium: 'Premium'
};

const darken = (hex, f = 0.55) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};

export const badge = (txt) => {
  if (!txt) return '—';
  const raw = String(txt);
  const lower = raw.toLowerCase();
  const label = STATUS_LABELS[raw] ?? STATUS_LABELS[lower] ?? raw;
  const c = STATUS_COLORS[raw] ?? STATUS_COLORS[lower] ?? '#8a9a93';
  return `<span class="badge" style="background:${c}1A;color:${darken(c)};border:1px solid ${c}44">${esc(label)}</span>`;
};

// Sophisticated Icon Buttons
export const iconBtnApprove = (title = 'Aprovar / Ativar') => `
  <button type="submit" title="${esc(title)}" class="btn-icon approve" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  </button>`;

export const iconBtnSuspend = (title = 'Suspender / Bloquear') => `
  <button type="submit" title="${esc(title)}" class="btn-icon suspend" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
  </button>`;

export const iconBtnDollar = (title = 'Confirmar / Marcar Pago') => `
  <button type="submit" title="${esc(title)}" class="btn-icon approve" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  </button>`;

export const iconBtnClose = (title = 'Fechar Ticket') => `
  <button type="submit" title="${esc(title)}" class="btn-icon gray" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  </button>`;

export const iconBtnTrash = (title = 'Excluir') => `
  <button type="submit" title="${esc(title)}" class="btn-icon suspend" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  </button>`;

export const iconBtnEdit = (url, title = 'Editar Motorista') => `
  <a href="${esc(url)}" title="${esc(title)}" class="btn-icon gray" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  </a>`;

export const iconBtnKey = (url, title = 'Redefinir Senha') => `
  <a href="${esc(url)}" title="${esc(title)}" class="btn-icon gray" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.778-7.778zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
  </a>`;

export const iconBtnPlan = (url, title = 'Mudar / Ativar Plano') => `
  <a href="${esc(url)}" title="${esc(title)}" class="btn-icon gray" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  </a>`;

export const iconBtnDocs = (url, title = 'Ver Documentos Anexados') => `
  <a href="${esc(url)}" title="${esc(title)}" class="btn-icon gray" aria-label="${esc(title)}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  </a>`;

export const iconBtnWhatsApp = (phone, title = 'Conversar no WhatsApp') => {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '—';
  const url = `https://wa.me/55${clean}`;
  return `
    <a href="${url}" target="_blank" rel="noopener" title="${esc(title)}" class="btn-icon wa" aria-label="${esc(title)}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    </a>`;
};

export const kpiCard = (label, value, sub = '') =>
  `<div class="kpi"><div class="kpi-val">${esc(value)}</div><div class="kpi-lbl">${esc(label)}</div>${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}</div>`;

export const table = (headers, rows) => `
  <div class="tablewrap"><table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">Nenhum registro encontrado</td></tr>`}</tbody>
  </table></div>`;

export const pagination = (totalItems, currentPage = 1, pageSize = 20, reqUrl = '') => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0 || totalPages <= 1) return '';

  const page = Math.max(1, Math.min(Number(currentPage) || 1, totalPages));

  const makeUrl = (p) => {
    try {
      const u = new URL(reqUrl, 'http://localhost');
      u.searchParams.set('page', p);
      return u.pathname + u.search;
    } catch {
      return `?page=${p}`;
    }
  };

  let pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  const prevBtn = page > 1
    ? `<a href="${makeUrl(page - 1)}" class="page-btn">‹ Anterior</a>`
    : `<span class="page-btn disabled">‹ Anterior</span>`;

  const nextBtn = page < totalPages
    ? `<a href="${makeUrl(page + 1)}" class="page-btn">Próximo ›</a>`
    : `<span class="page-btn disabled">Próximo ›</span>`;

  const numberBtns = pages.map(p => {
    if (p === '...') return `<span class="page-dots">...</span>`;
    if (p === page) return `<span class="page-num active">${p}</span>`;
    return `<a href="${makeUrl(p)}" class="page-num">${p}</a>`;
  }).join('');

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return `
    <div class="pagination-container">
      <div class="pagination-info">Exibindo <strong>${startItem}–${endItem}</strong> de <strong>${totalItems}</strong> registros (20 por página)</div>
      <div class="pagination-controls">
        ${prevBtn}
        ${numberBtns}
        ${nextBtn}
      </div>
    </div>
  `;
};

const NAV = [
  ['/admin', 'Visão Geral', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`],
  ['/drivers', 'Motoristas', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`],
  ['/rides', 'Corridas', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`],
  ['/subscriptions', 'Assinaturas', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`],
  ['/payments', 'Pagamentos', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`],
  ['/leads', 'Leads / Contatos', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`],
  ['/support', 'Suporte', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`],
  ['/settings', 'Configurações', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`],
];

export const layout = ({ title, active, body, email, head = '' }) => `<!doctype html>
<html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Rotta Urbana Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  :root{
    --bg:#F8FAFC;--panel:#FFFFFF;--panel2:#F1F5F9;--line:#E2E8F0;
    --txt:#0F172A;--mut:#64748B;--pri:#10B981;--pri-dark:#047857;
    --side-bg:#090D0B;--side-line:#17241D;--side-txt:#F1F5F9;--side-mut:#8E9CA0;--side-hover:#132019;
    --shadow:0 1px 3px rgba(0,0,0,.04), 0 6px 16px rgba(0,0,0,.02);
  }
  *{box-sizing:border-box} body{margin:0;font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--txt);-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  .app{display:flex;min-height:100vh}
  .side{width:240px;background:var(--side-bg);border-right:1px solid var(--side-line);padding:24px 16px;position:fixed;height:100vh;z-index:10;display:flex;flex-direction:column;justify-content:space-between}
  .brand{font-weight:800;font-size:21px;padding:4px 12px 24px;letter-spacing:-0.4px;color:var(--side-txt);display:flex;align-items:center;gap:8px}
  .brand span{color:var(--pri)}
  .nav a{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;color:var(--side-mut);font-size:14px;font-weight:500;margin-bottom:4px;transition:all 0.15s ease}
  .nav a.on,.nav a:hover{background:var(--side-hover);color:#FFFFFF;font-weight:600}
  .nav a.on{background:rgba(16,185,129,0.14);color:#34D399;border-left:3px solid var(--pri)}
  .nav a svg{opacity:0.8;transition:transform 0.15s ease}
  .side-logout{margin-top:16px;padding-top:16px;border-top:1px solid var(--side-line)}
  .side-logout button{width:100%;display:flex;align-items:center;gap:12px;padding:11px 14px;border:0;border-radius:12px;background:transparent;color:var(--side-mut);font:500 14px inherit;text-align:left;cursor:pointer;transition:all 0.15s ease}
  .side-logout button:hover{background:#2A1515;color:#FCA5A5}
  .side-logout svg{opacity:0.8}
  .nav a:hover svg,.nav a.on svg{opacity:1;transform:scale(1.05)}
  .main{margin-left:240px;flex:1;padding:32px 40px;max-width:1380px}
  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
  .top h1{font-size:24px;font-weight:800;margin:0;letter-spacing:-0.5px;color:#0F172A}
  .who{color:var(--mut);font-size:13.5px;display:flex;align-items:center;gap:14px}
  .who form{display:inline} .who button{background:var(--panel);border:1px solid var(--line);color:var(--mut);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s ease}
  .who button:hover{background:#F1F5F9;color:var(--txt);border-color:#CBD5E1}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px}
  .kpi{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:var(--shadow);transition:transform 0.15s ease}
  .kpi:hover{transform:translateY(-2px)}
  .kpi-val{font-size:30px;font-weight:800;letter-spacing:-0.8px;color:#0F172A} .kpi-lbl{color:var(--mut);font-size:13px;margin-top:4px;font-weight:600} .kpi-sub{color:var(--pri-dark);font-size:12.5px;margin-top:6px;font-weight:700}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:24px;margin-bottom:24px;box-shadow:var(--shadow)}
  .card h2{font-size:17px;font-weight:700;margin:0 0 18px;color:#0F172A;letter-spacing:-0.3px}
  
  /* Modern Minimalist Table Styling */
  .tablewrap{overflow-x:auto;border-radius:14px;border:1px solid var(--line)}
  table{width:100%;border-collapse:collapse;font-size:13.5px;background:#FFFFFF}
  th{text-align:left;color:#64748B;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:0.06em;padding:14px 16px;background:#F8FAFC;border-bottom:1px solid var(--line)}
  td{padding:14px 16px;border-bottom:1px solid var(--line);vertical-align:middle;color:#334155}
  tbody tr{transition:background 0.12s ease}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover{background:#F8FAFC}
  .empty{color:var(--mut);text-align:center;padding:32px;font-weight:500}
  .badge{padding:4px 12px;border-radius:100px;font-size:11.5px;font-weight:700;display:inline-block;white-space:nowrap;letter-spacing:0.02em}
  
  /* Icon Action Buttons */
  .btn-icon{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:#FFFFFF;color:var(--txt);cursor:pointer;transition:all 0.15s ease;padding:0;text-decoration:none}
  .btn-icon:hover{transform:translateY(-1px);box-shadow:0 3px 8px rgba(0,0,0,0.06)}
  .btn-icon.approve{background:#ECFDF5;border-color:#A7F3D0;color:#047857}
  .btn-icon.approve:hover{background:#10B981;border-color:#10B981;color:#FFFFFF}
  .btn-icon.suspend{background:#FEF2F2;border-color:#FECACA;color:#DC2626}
  .btn-icon.suspend:hover{background:#EF4444;border-color:#EF4444;color:#FFFFFF}
  .btn-icon.wa{background:#F0FDF4;border-color:#BBF7D0;color:#15803D}
  .btn-icon.wa:hover{background:#22C55E;border-color:#22C55E;color:#FFFFFF}
  .btn-icon.gray{background:#F8FAFC;border-color:#E2E8F0;color:#475569}
  .btn-icon.gray:hover{background:#64748B;border-color:#64748B;color:#FFFFFF}
  
  button.act,a.act{background:var(--pri);color:#03130c;border:none;border-radius:10px;padding:9px 16px;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all 0.15s ease}
  button.act:hover,a.act:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(16,185,129,0.25)}
  button.act.gray{background:var(--panel2);color:var(--txt);border:1px solid var(--line)}
  button.act.red{background:#EF4444;color:#fff}
  form.inline{display:inline-block;margin:0}
  input,select{background:#fff;border:1px solid var(--line);color:var(--txt);border-radius:10px;padding:10px 14px;font-size:14px;width:100%}
  input:focus,select:focus{outline:none;border-color:var(--pri);box-shadow:0 0 0 3px rgba(16,185,129,0.15)}
  label{display:block;color:var(--mut);font-size:12px;margin:12px 0 5px;font-weight:600}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .filters a{padding:8px 16px;border:1px solid var(--line);border-radius:100px;font-size:13px;font-weight:600;color:var(--mut);margin-right:8px;background:var(--panel);transition:all .15s ease}
  .filters a.on,.filters a:hover{background:var(--pri);color:#03130c;border-color:var(--pri)}
  
  /* Pagination Styling */
  .pagination-container{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:18px;border-top:1px solid var(--line);flex-wrap:wrap;gap:12px}
  .pagination-info{font-size:13.5px;color:var(--mut)}
  .pagination-controls{display:flex;align-items:center;gap:6px}
  .page-btn,.page-num{padding:7px 14px;border:1px solid var(--line);border-radius:9px;background:#FFFFFF;font-size:13px;font-weight:600;color:var(--txt);text-decoration:none;transition:all 0.15s ease;display:inline-flex;align-items:center;justify-content:center}
  .page-btn:hover:not(.disabled),.page-num:hover:not(.active){background:#F1F5F9;border-color:#CBD5E1}
  .page-num.active{background:var(--pri);color:#03130c;border-color:var(--pri);font-weight:700}
  .page-btn.disabled{opacity:0.4;cursor:not-allowed;background:#F8FAFC}
  .page-dots{padding:0 4px;color:var(--mut);font-weight:600}
  .login{max-width:380px;margin:12vh auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:32px;box-shadow:0 12px 36px rgba(16,24,40,.08)}
  .login h1{font-size:22px;font-weight:800;margin:0 0 4px}.login p{color:var(--mut);font-size:14px;margin:0 0 20px}
  .err{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:12px 16px;border-radius:12px;font-size:13.5px;margin-bottom:18px;font-weight:500}
  .ok{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:12px 16px;border-radius:12px;font-size:13.5px;margin-bottom:18px;font-weight:500}
</style>${head}</head>
<body><div class="app">
  <aside class="side">
    <div>
      <div class="brand" style="padding:0 8px 24px;"><img src="/logo.png" alt="Rotta Urbana" style="height:52px;width:auto;max-width:200px;object-fit:contain;display:block;"></div>
      <nav class="nav">${NAV.map(([route, lbl, icon]) => {
        const href = adminHref(route === '/admin' ? '' : route);
        return '<a href="' + href + '" class="' + (active === route ? 'on' : '') + '">' + icon + ' ' + lbl + '</a>';
      }).join('')}</nav>
      <form class="side-logout" method="post" action="${adminHref('/logout')}">
        <button type="submit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>Sair</span></button>
      </form>
    </div>
    <div style="padding:12px;font-size:11.5px;color:var(--side-mut);border-top:1px solid var(--side-line);margin-top:auto;">
      Rotta Urbana v2.4 Admin
    </div>
  </aside>
  <main class="main">
    <div class="top"><h1>${esc(title)}</h1>
      <div class="who">${esc(email || '')}<form method="post" action="${adminHref('/logout')}"><button>Sair</button></form></div>
    </div>
    ${rewriteAdminLinks(body)}
  </main>
</div></body></html>`;

export const loginPage = (error = '') => `<!doctype html><html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login · Rotta Urbana Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>body{margin:0;font-family:'Inter',system-ui,sans-serif;background:#F8FAFC;color:#0F172A;-webkit-font-smoothing:antialiased}
.login{max-width:400px;margin:10vh auto;background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:36px;box-shadow:0 12px 36px rgba(15,23,42,.08);text-align:left}
h1{font-size:22px;font-weight:800;margin:0 0 4px;letter-spacing:-0.5px}p{color:#64748B;font-size:13.5px;margin:0 0 20px}span{color:#10B981}
label{display:block;color:#64748B;font-size:12px;margin:14px 0 5px;font-weight:600}
input{width:100%;background:#fff;border:1px solid #E2E8F0;color:#0F172A;border-radius:10px;padding:11px 14px;font-size:14px;box-sizing:border-box}
input:focus{outline:none;border-color:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,0.18)}
button{width:100%;margin-top:22px;background:#10B981;color:#03130c;border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.15s ease}
button:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(16,185,129,0.25)}
.err{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:11px 14px;border-radius:10px;font-size:13px;margin-bottom:16px;font-weight:500}</style>
</head><body><form class="login" method="post" action="${adminHref('/login')}">
<div style="text-align:center;margin-bottom:24px;">
  <img src="/logo.png" alt="Rotta Urbana" style="height:72px;width:auto;object-fit:contain;display:inline-block;filter:brightness(0);">
</div>
<h1 style="text-align:center;">Painel Administrativo</h1>
<p style="text-align:center;">Acesso exclusivo para administradores</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<label>E-mail de Acesso</label><input name="email" type="email" required autofocus placeholder="admin@rottaurbana.app">
<label>Senha</label><input name="password" type="password" required placeholder="••••••••">
<button type="submit">Acessar Painel</button>
</form></body></html>`;

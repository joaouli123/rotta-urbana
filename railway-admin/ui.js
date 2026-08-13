// Server-rendered UI helpers for the admin panel (no build step).

const DEFAULT_ADMIN_PANEL_SLUG = 'console-ru-7f3a9c';
const ADMIN_PANEL_SLUG = String(process.env.ADMIN_PANEL_SLUG || DEFAULT_ADMIN_PANEL_SLUG).trim().replace(/^\/+|\/+$/g, '');
const ADMIN_BASE_PATH = '/' + ADMIN_PANEL_SLUG;
const DEFAULT_MANAGER_PANEL_SLUG = 'painel-gerente-ru-6c4a9e';
const MANAGER_PANEL_SLUG = String(process.env.MANAGER_PANEL_SLUG || DEFAULT_MANAGER_PANEL_SLUG).trim().replace(/^\/+|\/+$/g, '');
const MANAGER_BASE_PATH = '/' + MANAGER_PANEL_SLUG;
const ADMIN_ROUTE_PREFIXES = ['/admin', '/login', '/logout', '/users', '/drivers', '/managers', '/rides', '/subscriptions', '/payments', '/leads', '/support', '/settings'];
const MANAGER_ROUTE_PREFIXES = ['/login', '/logout', '/drivers', '/users', '/rides', '/reports', '/support'];
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
const managerHref = (route = '') => {
  const value = String(route || '');
  if (!value || value === '/') return MANAGER_BASE_PATH;
  return MANAGER_BASE_PATH + (value.startsWith('/') ? value : '/' + value);
};
const rewriteManagerPath = (value) => {
  const raw = String(value || '');
  const match = raw.match(/^([^?#]*)(.*)$/);
  const pathname = match?.[1] || raw;
  const suffix = match?.[2] || '';
  if (MANAGER_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) return MANAGER_BASE_PATH + pathname + suffix;
  return raw;
};
const rewriteManagerLinks = (html) => String(html ?? '').replace(/\b(href|action)="(\/[^"']*)"/g, (_match, attr, value) => attr + '="' + rewriteManagerPath(value) + '"');
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

const UI_ICON_PATHS = {
  activity: '<path d="M3 12h4l2.2-7 4.1 14 2.2-7H21"/>',
  analytics: '<line x1="4" y1="19" x2="4" y2="10"/><line x1="10" y1="19" x2="10" y2="5"/><line x1="16" y1="19" x2="16" y2="13"/><line x1="22" y1="19" x2="22" y2="8"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  car: '<path d="M5 17h14l1-5-2-5H6l-2 5 1 5Z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/><path d="M6 10h12"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  login: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  message: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.7-.8L4 20l1.5-4.1A7.4 7.4 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/>',
  money: '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  shield: '<path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  save: '<path d="M5 3h12l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-6h8v6"/>',
};

export const uiIcon = (name, size = 16) => {
  const path = UI_ICON_PATHS[name] || UI_ICON_PATHS.dashboard;
  return `<svg class="ui-icon" width="${Number(size) || 16}" height="${Number(size) || 16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
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

const kpiIconFor = (label) => {
  const value = String(label || '').toLocaleLowerCase('pt-BR');
  if (value.includes('corrid')) return 'activity';
  if (value.includes('motorista') || value.includes('passageiro') || value.includes('usuário')) return 'users';
  if (value.includes('faturamento') || value.includes('receita') || value.includes('pagamento')) return 'money';
  if (value.includes('assinatura') || value.includes('plano')) return 'card';
  if (value.includes('online')) return 'activity';
  if (value.includes('pendente') || value.includes('suporte')) return value.includes('suporte') ? 'message' : 'clock';
  if (value.includes('lead') || value.includes('contato')) return 'mail';
  if (value.includes('taxa') || value.includes('evolução')) return 'chart';
  return 'analytics';
};

export const kpiCard = (label, value, sub = '') =>
  `<div class="kpi"><div class="kpi-head"><span class="kpi-icon">${uiIcon(kpiIconFor(label), 16)}</span><div class="kpi-lbl">${esc(label)}</div></div><div class="kpi-val">${esc(value)}</div>${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}</div>`;

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
    ? `<a href="${makeUrl(page - 1)}" class="page-btn">${uiIcon('chevron-left', 14)} Anterior</a>`
    : `<span class="page-btn disabled">${uiIcon('chevron-left', 14)} Anterior</span>`;

  const nextBtn = page < totalPages
    ? `<a href="${makeUrl(page + 1)}" class="page-btn">Próximo ${uiIcon('chevron-right', 14)}</a>`
    : `<span class="page-btn disabled">Próximo ${uiIcon('chevron-right', 14)}</span>`;

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
  ['/managers', 'Gerentes', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>`],  ['/rides', 'Corridas', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`],
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
<link rel="stylesheet" href="/admin-ui.css">
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
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}  .manager-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:24px}
  .manager-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:var(--shadow)}
  .manager-card h3{font-size:15px;margin:0 0 5px;font-weight:800}.manager-card p{margin:4px 0;color:var(--mut);font-size:12.5px}
  .manager-card .metric{font-size:26px;font-weight:800;margin-top:14px}.manager-card .metric-label{font-size:11px;color:var(--mut);font-weight:600}
  .chips{display:flex;gap:6px;flex-wrap:wrap}.chip{display:inline-flex;align-items:center;padding:4px 9px;border-radius:99px;background:#ECFDF5;color:#047857;font-size:11px;font-weight:700}
  .muted{color:var(--mut);font-size:12.5px}.actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.notice{padding:13px 16px;border-radius:12px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1E40AF;font-size:13px;margin-bottom:18px}
  .danger-zone{background:#FFF7F7;border:1px solid #FECACA;border-radius:14px;padding:16px}.driver-picker{max-height:440px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px}.driver-option{display:flex;align-items:center;gap:10px;padding:10px;border-radius:9px;border-bottom:1px solid #F1F5F9}.driver-option:last-child{border-bottom:0}.driver-option:hover{background:#F8FAFC}.driver-option input{width:auto}.driver-option small{display:block;color:var(--mut);margin-top:2px}.split{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:20px}
  .progress{height:7px;background:#E2E8F0;border-radius:99px;overflow:hidden}.progress>span{display:block;height:100%;background:var(--pri);border-radius:99px}
  @media (max-width:900px){.main{margin-left:0;padding:24px 16px}.side{position:relative;width:100%;height:auto;min-height:0}.app{display:block}.side>div:first-child{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.brand{padding-bottom:8px!important}.nav{display:flex;flex-wrap:wrap}.nav a{padding:8px 10px}.side-logout{margin:8px 0 0;padding-top:8px}.side>div:last-child{display:none}.split{grid-template-columns:1fr}.row2{grid-template-columns:1fr}}
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

const AUTH_STYLES = `<style>
  :root{--auth-bg:#f3f7f5;--auth-ink:#12211a;--auth-muted:#6a7972;--auth-line:#dfe8e3;--auth-green:#10b981;--auth-green-dark:#047857}
  *{box-sizing:border-box}html{background:var(--auth-bg)}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;font-family:'Inter',system-ui,sans-serif;color:var(--auth-ink);background:radial-gradient(circle at 12% 8%,rgba(16,185,129,.12),transparent 24rem),radial-gradient(circle at 92% 86%,rgba(4,120,87,.08),transparent 28rem),var(--auth-bg);-webkit-font-smoothing:antialiased}
  .auth-shell{width:min(940px,100%);display:grid;grid-template-columns:minmax(280px,.86fr) minmax(360px,1.14fr);overflow:hidden;background:#fff;border:1px solid var(--auth-line);border-radius:24px;box-shadow:0 24px 70px rgba(21,55,40,.12)}
  .auth-aside{position:relative;overflow:hidden;padding:44px;background:linear-gradient(145deg,#07110c 0%,#0b2418 100%);color:#effcf5}.auth-aside:after{position:absolute;right:-100px;bottom:-100px;width:290px;height:290px;border:1px solid rgba(167,243,208,.16);border-radius:50%;box-shadow:0 0 0 30px rgba(167,243,208,.045),0 0 0 60px rgba(167,243,208,.025);content:""}.auth-aside h2{position:relative;z-index:1;max-width:270px;margin:60px 0 14px;font-size:32px;line-height:1.08;letter-spacing:-1.2px}.auth-aside p{position:relative;z-index:1;max-width:285px;margin:0;color:#b8cec2;font-size:14px;line-height:1.65}.auth-mark{position:relative;z-index:1;display:inline-flex;width:42px;height:42px;align-items:center;justify-content:center;border:1px solid rgba(167,243,208,.28);border-radius:13px;background:rgba(16,185,129,.16);color:#a7f3d0}.auth-eyebrow{position:relative;z-index:1;display:flex;align-items:center;gap:7px;margin-top:18px;color:#a7f3d0;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.auth-points{position:relative;z-index:1;display:grid;gap:12px;margin-top:34px;color:#d4e8dc;font-size:12.5px}.auth-point{display:flex;align-items:center;gap:9px}.auth-point svg{color:#6ee7b7}.auth-form{padding:44px 48px}.auth-logo{height:48px;margin-bottom:30px}.auth-logo img{height:48px;width:auto;max-width:190px;object-fit:contain;filter:brightness(0)}.auth-kicker{display:inline-flex;align-items:center;gap:7px;color:var(--auth-green-dark);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.auth-form h1{margin:12px 0 7px;font-size:26px;line-height:1.15;letter-spacing:-.7px}.auth-form>p{margin:0 0 24px;color:var(--auth-muted);font-size:14px}.auth-error{display:flex;gap:9px;align-items:flex-start;margin-bottom:18px;padding:12px 14px;border:1px solid #fecaca;border-radius:12px;background:#fff5f5;color:#991b1b;font-size:13px;line-height:1.45}.auth-error .ui-icon{margin-top:1px;flex:0 0 auto}.auth-field{position:relative}.auth-form label{display:block;margin:15px 0 6px;color:#52645b;font-size:12px;font-weight:700}.auth-field .ui-icon{position:absolute;left:13px;top:12px;color:#899991}.auth-form input{width:100%;min-height:44px;padding:11px 13px 11px 39px;border:1px solid var(--auth-line);border-radius:11px;background:#fff;color:var(--auth-ink);font-size:14px}.auth-form input:focus{outline:0;border-color:var(--auth-green);box-shadow:0 0 0 3px rgba(16,185,129,.16)}.auth-submit{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:26px;min-height:46px;border:0;border-radius:11px;background:var(--auth-green);color:#052016;font-size:14px;font-weight:800;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}.auth-submit:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(16,185,129,.2)}.auth-footer{display:flex;align-items:center;gap:7px;margin-top:20px;color:#829189;font-size:11.5px}.auth-footer .ui-icon{color:var(--auth-green-dark)}
  @media(max-width:700px){body{padding:14px}.auth-shell{display:block;border-radius:19px}.auth-aside{display:none}.auth-form{padding:31px 25px}.auth-logo{margin-bottom:23px}}
</style>`;

const authAside = (description) => `<section class="auth-aside" style="height:100%" aria-label="Rotta Urbana"><div class="auth-mark">${uiIcon('dashboard', 21)}</div><div class="auth-eyebrow">Rotta Urbana</div><h2>Operação sob controle.</h2><p>${description}</p><div class="auth-points"><div class="auth-point">${uiIcon('shield', 15)} Acesso protegido por sessão</div><div class="auth-point">${uiIcon('analytics', 15)} Dados operacionais em um só lugar</div></div></section>`;

export const loginPage = (error = '') => `<!doctype html><html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login · Rotta Urbana Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">${AUTH_STYLES}
</head><body><main class="auth-shell"><div>${authAside('Administre usuários, motoristas, gerentes, pagamentos e a operação com clareza.')}</div><form class="auth-form" method="post" action="${adminHref('/login')}" aria-labelledby="admin-login-title">
<div class="auth-logo"><img src="/logo.png" alt="Rotta Urbana"></div><div class="auth-kicker">${uiIcon('shield', 14)} Área administrativa</div><h1 id="admin-login-title">Painel Administrativo</h1><p>Entre para acompanhar e operar a plataforma.</p>
${error ? `<div class="auth-error" role="alert">${uiIcon('shield', 16)}<span>${esc(error)}</span></div>` : ''}
<label for="admin-email">E-mail de acesso</label><div class="auth-field">${uiIcon('mail', 17)}<input id="admin-email" name="email" type="email" required autofocus autocomplete="username" placeholder="admin@rottaurbana.app"></div>
<label for="admin-password">Senha</label><div class="auth-field">${uiIcon('shield', 17)}<input id="admin-password" name="password" type="password" required autocomplete="current-password" placeholder="Digite sua senha"></div>
<button class="auth-submit" type="submit">${uiIcon('login', 17)} Acessar painel</button><div class="auth-footer">${uiIcon('shield', 14)} Sessão exclusiva para administradores</div>
</form></main></body></html>`;

const MANAGER_NAV = [
  ['/', 'Visão geral', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`],
  ['/drivers', 'Motoristas', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`],
  ['/subscriptions', 'Assinaturas', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M7 15h3"/></svg>`],
  ['/users', 'Usuários', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`],
  ['/rides', 'Corridas', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`],
  ['/reports', 'Relatórios', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`],
  ['/support', 'Suporte', `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`],
];

export const managerLayout = ({ title, active, body, email, managerName = '' }) => `<!doctype html>
<html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Rotta Urbana Gerência</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/admin-ui.css">
<style>
  :root{--bg:#F8FAFC;--panel:#FFF;--line:#E2E8F0;--txt:#0F172A;--mut:#64748B;--pri:#10B981;--pri-dark:#047857;--side-bg:#07110D;--side-line:#17241D;--side-mut:#8E9CA0;--side-hover:#132019;--shadow:0 1px 3px rgba(0,0,0,.04),0 6px 16px rgba(0,0,0,.02)}
  *{box-sizing:border-box}body{margin:0;font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--txt);-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.app{display:flex;min-height:100vh}.side{width:240px;background:var(--side-bg);border-right:1px solid var(--side-line);padding:24px 16px;position:fixed;height:100vh;z-index:10;display:flex;flex-direction:column;justify-content:space-between}.brand{padding:0 8px 24px}.nav a{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;color:var(--side-mut);font-size:14px;font-weight:500;margin-bottom:4px}.nav a.on,.nav a:hover{background:var(--side-hover);color:#FFF;font-weight:600}.nav a.on{background:rgba(16,185,129,.14);color:#34D399;border-left:3px solid var(--pri)}.nav a svg{opacity:.8}.side-logout{margin-top:16px;padding-top:16px;border-top:1px solid var(--side-line)}.side-logout button{width:100%;display:flex;align-items:center;gap:12px;padding:11px 14px;border:0;border-radius:12px;background:transparent;color:var(--side-mut);font:500 14px inherit;text-align:left;cursor:pointer}.side-logout button:hover{background:#2A1515;color:#FCA5A5}.main{margin-left:240px;flex:1;padding:32px 40px;max-width:1380px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}.top h1{font-size:24px;font-weight:800;margin:0}.who{color:var(--mut);font-size:13.5px;display:flex;align-items:center;gap:14px}.who button{background:var(--panel);border:1px solid var(--line);color:var(--mut);border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:24px}.kpi{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:var(--shadow)}.kpi-val{font-size:30px;font-weight:800}.kpi-lbl{color:var(--mut);font-size:13px;margin-top:4px;font-weight:600}.kpi-sub{color:var(--pri-dark);font-size:12.5px;margin-top:6px;font-weight:700}.card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:24px;margin-bottom:24px;box-shadow:var(--shadow)}.card h2{font-size:17px;margin:0 0 18px}.tablewrap{overflow-x:auto;border-radius:14px;border:1px solid var(--line)}table{width:100%;border-collapse:collapse;font-size:13.5px;background:#FFF}th{text-align:left;color:#64748B;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;padding:14px 16px;background:#F8FAFC;border-bottom:1px solid var(--line)}td{padding:14px 16px;border-bottom:1px solid var(--line);vertical-align:middle;color:#334155}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:#F8FAFC}.empty{color:var(--mut);text-align:center;padding:32px}.badge{padding:4px 12px;border-radius:100px;font-size:11.5px;font-weight:700;display:inline-block;white-space:nowrap}.act{background:var(--pri);color:#03130c;border:0;border-radius:10px;padding:9px 16px;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px}.act.gray{background:#F1F5F9;color:var(--txt);border:1px solid var(--line)}.inline{display:inline-block;margin:0}.notice{padding:13px 16px;border-radius:12px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1E40AF;font-size:13px;margin-bottom:18px}.muted{color:var(--mut);font-size:12.5px}.err{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:12px 16px;border-radius:12px;font-size:13.5px;margin-bottom:18px}.ok{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:12px 16px;border-radius:12px;font-size:13.5px;margin-bottom:18px}.chip{display:inline-flex;padding:4px 9px;border-radius:99px;background:#ECFDF5;color:#047857;font-size:11px;font-weight:700}.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.filters a{padding:8px 14px;border:1px solid var(--line);border-radius:99px;font-size:13px;font-weight:600;color:var(--mut)}.filters a.on,.filters a:hover{background:var(--pri);color:#03130c;border-color:var(--pri)}.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}label{display:block;color:var(--mut);font-size:12px;margin:12px 0 5px;font-weight:600}input,select{background:#FFF;border:1px solid var(--line);color:var(--txt);border-radius:10px;padding:10px 14px;font-size:14px;width:100%}input:focus,select:focus{outline:none;border-color:var(--pri);box-shadow:0 0 0 3px rgba(16,185,129,.15)}
  @media(max-width:900px){.app{display:block}.side{position:relative;width:100%;height:auto;min-height:0}.side>div:first-child{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.brand{padding-bottom:8px}.nav{display:flex;flex-wrap:wrap}.nav a{padding:8px 10px}.side-logout{margin:8px 0 0;padding-top:8px}.side>div:last-child{display:none}.main{margin-left:0;padding:24px 16px}.row2{grid-template-columns:1fr}}
</style></head><body><div class="app"><aside class="side"><div><div class="brand"><img src="/logo.png" alt="Rotta Urbana" style="height:52px;width:auto;max-width:200px;object-fit:contain;display:block"></div><nav class="nav">${MANAGER_NAV.map(([route, label, icon]) => `<a href="${managerHref(route)}" class="${active === route ? 'on' : ''}">${icon} ${label}</a>`).join('')}</nav><form class="side-logout" method="post" action="${managerHref('/logout')}"><button type="submit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>Sair</span></button></form></div><div style="padding:12px;font-size:11.5px;color:var(--side-mut);border-top:1px solid var(--side-line);margin-top:auto">Rotta Urbana · Painel do Gerente</div></aside><main class="main"><div class="top"><h1>${esc(title)}</h1><div class="who">${esc(managerName || email || '')}<form method="post" action="${managerHref('/logout')}"><button>Sair</button></form></div></div>${rewriteManagerLinks(body)}</main></div></body></html>`;

export const managerLoginPage = (error = '') => `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login · Painel do Gerente</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">${AUTH_STYLES}</head><body><main class="auth-shell"><div>${authAside('Acompanhe os motoristas da sua rede, organize a rotina e tome decisões com dados confiáveis.')}</div><form class="auth-form" method="post" action="${managerHref('/login')}" aria-labelledby="manager-login-title"><div class="auth-logo"><img src="/logo.png" alt="Rotta Urbana"></div><div class="auth-kicker">${uiIcon('users', 14)} Área da gerência</div><h1 id="manager-login-title">Painel do Gerente</h1><p>Acompanhe sua equipe e sua operação.</p>${error ? `<div class="auth-error" role="alert">${uiIcon('shield', 16)}<span>${esc(error)}</span></div>` : ''}<label for="manager-email">E-mail de acesso</label><div class="auth-field">${uiIcon('mail', 17)}<input id="manager-email" name="email" type="email" required autofocus autocomplete="username" placeholder="gerente@rottaurbana.app"></div><label for="manager-password">Senha</label><div class="auth-field">${uiIcon('shield', 17)}<input id="manager-password" name="password" type="password" required autocomplete="current-password" placeholder="Digite sua senha"></div><button class="auth-submit" type="submit">${uiIcon('login', 17)} Entrar como gerente</button><div class="auth-footer">${uiIcon('shield', 14)} Acesso ativo e vinculado pelo administrador</div></form></main></body></html>`;

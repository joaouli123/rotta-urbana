// Server-rendered UI helpers for the admin panel (no build step).
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const brl = (n) =>
  'R$ ' + Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const STATUS_COLORS = {
  online: '#18b56a', on_ride: '#f0a020', offline: '#8a9a93',
  active: '#18b56a', expired: '#e0533d', suspended: '#e0533d',
  completed: '#18b56a', cancelled: '#e0533d', searching: '#f0a020',
  approved: '#18b56a', pending: '#f0a020', rejected: '#e0533d',
  in_progress: '#3b9ae0', driver_on_way: '#3b9ae0', driver_arrived: '#3b9ae0', driver_found: '#3b9ae0',
  open: '#f0a020', closed: '#8a9a93',
};

// Darken a hex toward black — used for badge TEXT so colored labels stay legible
// on the light panel (the tint stays light; only the text gets darker for AA).
const darken = (hex, f = 0.55) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};

export const badge = (txt) => {
  const c = STATUS_COLORS[txt] ?? '#8a9a93';
  return `<span class="badge" style="background:${c}22;color:${darken(c)};border:1px solid ${c}55">${esc(txt)}</span>`;
};

export const kpiCard = (label, value, sub = '') =>
  `<div class="kpi"><div class="kpi-val">${esc(value)}</div><div class="kpi-lbl">${esc(label)}</div>${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}</div>`;

export const table = (headers, rows) => `
  <div class="tablewrap"><table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">Nenhum registro</td></tr>`}</tbody>
  </table></div>`;

const NAV = [
  ['/', 'Visão geral'],
  ['/drivers', 'Motoristas'],
  ['/rides', 'Corridas'],
  ['/subscriptions', 'Assinaturas'],
  ['/payments', 'Pagamentos'],
  ['/support', 'Suporte'],
  ['/settings', 'Configurações'],
];

export const layout = ({ title, active, body, email, head = '' }) => `<!doctype html>
<html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Rotta Urbana Admin</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  /* Light panel, dark sidebar. */
  :root{
    --bg:#F4F6F8;--panel:#FFFFFF;--panel2:#EEF1F5;--line:#E3E8EE;
    --txt:#1A2027;--mut:#6B7785;--pri:#18b56a;
    --side-bg:#0E1A14;--side-line:#1c2b24;--side-txt:#E7F0EA;--side-mut:#8FA39A;--side-hover:#16271f;
    --shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);
  }
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--txt)}
  a{color:inherit;text-decoration:none}
  .app{display:flex;min-height:100vh}
  .side{width:220px;background:var(--side-bg);border-right:1px solid var(--side-line);padding:18px 12px;position:fixed;height:100vh}
  .brand{font-weight:800;font-size:18px;padding:8px 12px 18px;letter-spacing:.3px;color:var(--side-txt)}
  .brand span{color:var(--pri)}
  .nav a{display:block;padding:10px 12px;border-radius:9px;color:var(--side-mut);font-size:14px;margin-bottom:2px}
  .nav a.on,.nav a:hover{background:var(--side-hover);color:var(--side-txt)}
  .main{margin-left:220px;flex:1;padding:24px 28px;max-width:1200px}
  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
  .top h1{font-size:22px;margin:0}
  .who{color:var(--mut);font-size:13px}
  .who form{display:inline} .who button{background:var(--panel);border:1px solid var(--line);color:var(--mut);border-radius:8px;padding:6px 10px;cursor:pointer;margin-left:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:22px}
  .kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:var(--shadow)}
  .kpi-val{font-size:26px;font-weight:800} .kpi-lbl{color:var(--mut);font-size:13px;margin-top:4px} .kpi-sub{color:var(--pri);font-size:12px;margin-top:6px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:20px;box-shadow:var(--shadow)}
  .card h2{font-size:15px;margin:0 0 14px}
  .tablewrap{overflow-x:auto} table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--mut);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line)}
  td{padding:9px 10px;border-bottom:1px solid var(--line)}
  tbody tr:hover{background:var(--panel2)}
  .empty{color:var(--mut);text-align:center;padding:18px}
  .badge{padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;text-transform:capitalize}
  button.act,a.act{background:var(--pri);color:#03130c;border:none;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;display:inline-block}
  button.act.gray{background:var(--panel2);color:var(--txt);border:1px solid var(--line)}
  button.act.red{background:#e0533d;color:#fff}
  form.inline{display:inline}
  input,select{background:#fff;border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:9px 11px;font-size:14px;width:100%}
  input:focus,select:focus{outline:none;border-color:var(--pri);box-shadow:0 0 0 3px #18b56a22}
  label{display:block;color:var(--mut);font-size:12px;margin:12px 0 5px}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .filters a{padding:6px 12px;border:1px solid var(--line);border-radius:20px;font-size:12px;color:var(--mut);margin-right:6px;background:var(--panel)}
  .filters a.on{background:var(--pri);color:#03130c;border-color:var(--pri)}
  .login{max-width:360px;margin:12vh auto;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(16,24,40,.10)}
  .login h1{font-size:20px;margin:0 0 4px}.login p{color:var(--mut);font-size:13px;margin:0 0 18px}
  .err{background:#fdecea;border:1px solid #f5b5ad;color:#b42318;padding:10px 12px;border-radius:9px;font-size:13px;margin-bottom:14px}
  .ok{background:#e6f6ee;border:1px solid #a6e2c2;color:#067647;padding:10px 12px;border-radius:9px;font-size:13px;margin-bottom:14px}
</style>${head}</head>
<body><div class="app">
  <aside class="side">
    <div class="brand">Rotta <span>Urbana</span></div>
    <nav class="nav">${NAV.map(([href, lbl]) => `<a href="${href}" class="${active === href ? 'on' : ''}">${lbl}</a>`).join('')}</nav>
  </aside>
  <main class="main">
    <div class="top"><h1>${esc(title)}</h1>
      <div class="who">${esc(email || '')}<form method="post" action="/logout"><button>Sair</button></form></div>
    </div>
    ${body}
  </main>
</div></body></html>`;

export const loginPage = (error = '') => `<!doctype html><html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login · Rotta Urbana Admin</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#F4F6F8;color:#1A2027}
.login{max-width:360px;margin:14vh auto;background:#fff;border:1px solid #E3E8EE;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(16,24,40,.10)}
h1{font-size:20px;margin:0 0 4px}p{color:#6B7785;font-size:13px;margin:0 0 18px}span{color:#18b56a}
label{display:block;color:#6B7785;font-size:12px;margin:12px 0 5px}
input{width:100%;background:#fff;border:1px solid #E3E8EE;color:#1A2027;border-radius:8px;padding:11px;font-size:14px;box-sizing:border-box}
input:focus{outline:none;border-color:#18b56a;box-shadow:0 0 0 3px #18b56a22}
button{width:100%;margin-top:18px;background:#18b56a;color:#03130c;border:none;border-radius:9px;padding:12px;font-size:15px;font-weight:700;cursor:pointer}
.err{background:#fdecea;border:1px solid #f5b5ad;color:#b42318;padding:10px 12px;border-radius:9px;font-size:13px;margin-bottom:14px}</style>
</head><body><form class="login" method="post" action="/login">
<h1>Rotta <span>Urbana</span></h1><p>Painel administrativo</p>
${error ? `<div class="err">${esc(error)}</div>` : ''}
<label>E-mail</label><input name="email" type="email" required autofocus>
<label>Senha</label><input name="password" type="password" required>
<button type="submit">Entrar</button>
</form></body></html>`;

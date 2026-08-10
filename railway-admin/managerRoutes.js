import { layout, esc, fmtDate, fmtPhone, badge, kpiCard, table, brl } from './ui.js';
import { loadManagerWorkspace, findProfileByEmail, configureManager, setManagerActive, removeManager, moveDriver, citiesToInput } from './managerAdmin.js';

const typeLabel = (type) => type === 'network' ? 'Gerente de rede' : 'Gerente por cidade';
const actionLabel = (action) => ({
  configure: 'Configuração atualizada',
  activate: 'Acesso ativado',
  deactivate: 'Acesso desativado',
  remove: 'Acesso removido',
  move_driver: 'Motorista movido',
}[action] || action || 'Ação administrativa');
const asList = (value) => Array.isArray(value) ? value : value ? [value] : [];
const bodyMessage = (req) => {
  if (req.query.ok) return '<div class="ok">Operação realizada com sucesso.</div>';
  if (req.query.error) return `<div class="err">${esc(req.query.error)}</div>`;
  return '';
};
const driverName = (driver) => driver.profile?.full_name || driver.profile?.email || 'Motorista sem nome';
const driverCity = (driver) => driver.operating_city || driver.profile?.address_city || '';
const driverVehicle = (driver) => [driver.vehicle?.model, driver.vehicle?.plate].filter(Boolean).join(' · ') || 'Veículo não informado';
const scopeLabel = (manager) => manager.manager_type === 'network'
  ? '<span class="chip">Toda a rede</span>'
  : manager.cities.length
    ? `<div class="chips">${manager.cities.map((city) => `<span class="chip">${esc(city.city)}${city.state ? ` · ${esc(city.state)}` : ''}</span>`).join('')}</div>`
    : '<span class="muted">Cidade não informada</span>';
const errorRedirect = (res, message) => res.redirect(`/managers?error=${encodeURIComponent(message || 'Não foi possível concluir a operação.')}`);

const managerActions = (manager) => `
  <div class="actions">
    <a class="act" href="/managers/${manager.profile_id}">Acompanhar</a>
    <a class="btn-icon gray" href="/managers/${manager.profile_id}/edit" title="Editar gerente" aria-label="Editar gerente">✎</a>
    <form class="inline" method="post" action="/managers/${manager.profile_id}/toggle" onsubmit="return confirm('${manager.is_active ? 'Desativar o acesso deste gerente?' : 'Reativar o acesso deste gerente?'}')">
      <input type="hidden" name="active" value="${manager.is_active ? '0' : '1'}">
      <button class="btn-icon ${manager.is_active ? 'suspend' : 'approve'}" title="${manager.is_active ? 'Desativar' : 'Ativar'}" aria-label="${manager.is_active ? 'Desativar' : 'Ativar'}">${manager.is_active ? '⏸' : '▶'}</button>
    </form>
    <form class="inline" method="post" action="/managers/${manager.profile_id}/remove" onsubmit="return confirm('Remover o acesso de gerente? Os vínculos serão excluídos e o perfil voltará à função anterior.')">
      <button class="btn-icon suspend" title="Remover acesso" aria-label="Remover acesso">×</button>
    </form>
  </div>`;

const renderManagers = async (req, res, { detailProfileId = null, admin } = {}) => {
  try {
    const workspace = await loadManagerWorkspace(admin);
    const manager = detailProfileId ? workspace.managers.find((item) => item.profile_id === detailProfileId) : null;
    if (detailProfileId && !manager) return errorRedirect(res, 'Gerente não encontrado.');
    return { workspace, manager };
  } catch (error) {
    console.error('[Managers admin]', error);
    render(res, layout({ title: 'Gerentes', active: '/managers', email: req.session.email, body: `<div class="err">Não foi possível carregar a gestão de gerentes. ${esc(error.message)}</div>` }));
    return null;
  }
};

export function registerManagerRoutes({ adminRouter, requireAuth, render, admin }) {
  adminRouter.get('/managers', requireAuth, async (req, res) => {
    const loaded = await renderManagers(req, res, { admin });
    if (!loaded) return;
    const { workspace } = loaded;
    const q = String(req.query.q || '').trim().toLocaleLowerCase('pt-BR');
    const type = req.query.type === 'network' || req.query.type === 'city' ? req.query.type : '';
    const status = req.query.status === 'active' || req.query.status === 'inactive' ? req.query.status : '';
    const managers = workspace.managers.filter((manager) => {
      const haystack = [manager.profile.full_name, manager.profile.email, manager.profile.phone, ...manager.cities.map((city) => city.city)].join(' ').toLocaleLowerCase('pt-BR');
      return (!q || haystack.includes(q)) && (!type || manager.manager_type === type) && (!status || (status === 'active' ? manager.is_active : !manager.is_active));
    });
    const { summary } = workspace;
    const rows = managers.map((manager) => [
      `<div><strong>${esc(manager.profile.full_name || 'Sem nome')}</strong><br><small class="muted">${esc(manager.profile.email || '')}</small>${manager.profile.phone ? `<br><small class="muted">${esc(fmtPhone(manager.profile.phone))}</small>` : ''}</div>`,
      `<div><strong>${esc(typeLabel(manager.manager_type))}</strong>${scopeLabel(manager)}<small class="muted">${manager.manager_type === 'network' ? 'Acesso automático a todos os motoristas' : 'Cidade + vínculos diretos'}</small></div>`,
      `<strong>${manager.effectiveDriverIds.length}</strong> no escopo<br><small class="muted">${manager.explicitDriverIds.length} vínculo(s) direto(s)</small>`,
      `${badge(manager.is_active ? 'active' : 'suspended')}<br><small class="muted">${manager.stats.online} online · ${manager.stats.verified} verificados</small>`,
      `<span class="muted">${fmtDate(manager.created_at)}</span><br><small class="muted">por ${esc(manager.assignedBy.full_name || 'Administrador')}</small>`,
      managerActions(manager),
    ]);
    const unassignedRows = summary.unassignedDrivers.slice(0, 40).map((driver) => [
      `<strong>${esc(driverName(driver))}</strong><br><small class="muted">${esc(driver.profile?.email || '')}</small>`,
      esc(driverCity(driver) || 'Cidade não informada'),
      `${esc(driverVehicle(driver))}<br>${badge(driver.status)}`,
      driver.is_verified ? badge('approved') : badge('pending'),
      `<a class="btn-icon gray" href="/drivers/${driver.id}/edit" title="Abrir motorista" aria-label="Abrir motorista">↗</a>`,
    ]);
    const filterBar = `
      <div class="card" style="padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div class="filters" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <strong style="font-size:13px;color:var(--mut);">Filtros:</strong>
          <a href="/managers" class="${!type && !status ? 'on' : ''}">Todos</a>
          <a href="/managers?type=network" class="${type === 'network' ? 'on' : ''}">Rede</a>
          <a href="/managers?type=city" class="${type === 'city' ? 'on' : ''}">Por cidade</a>
          <a href="/managers?status=active" class="${status === 'active' ? 'on' : ''}">Ativos</a>
          <a href="/managers?status=inactive" class="${status === 'inactive' ? 'on' : ''}">Desativados</a>
        </div>
        <form method="get" action="/managers" style="display:flex;gap:8px;min-width:280px;flex:1;max-width:430px;">
          ${type ? `<input type="hidden" name="type" value="${esc(type)}">` : ''}${status ? `<input type="hidden" name="status" value="${esc(status)}">` : ''}
          <input name="q" value="${esc(req.query.q || '')}" placeholder="Buscar gerente, e-mail ou cidade..."><button class="act" type="submit">Buscar</button>
        </form>
      </div>`;
    const body = `
      ${bodyMessage(req)}
      <div class="notice"><strong>Central de gestão de gerentes.</strong> Aqui o administrador acompanha o escopo efetivo, os vínculos diretos e as métricas dos últimos 30 dias. A conta de acesso é criada no cadastro do app; esta tela administra permissões e equipe.</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">
        ${kpiCard('Gerentes cadastrados', summary.totalManagers, `${summary.activeManagers} ativos`)}
        ${kpiCard('Gerentes de rede', summary.networkManagers, 'visão de toda a operação')}
        ${kpiCard('Gerentes por cidade', summary.cityManagers, 'escopo geográfico')}
        ${kpiCard('Motoristas no escopo', summary.coveredDrivers, `${summary.unassignedDrivers.length} sem gerente`)}
        ${kpiCard('Vínculos diretos', summary.explicitLinks, 'movimentação manual')}
        ${kpiCard('Corridas em 30 dias', summary.rides30d, 'base para os indicadores')}
      </div>
      <div class="split">
        <div class="card">
          <h2>Promover usuário cadastrado</h2>
          <p class="muted">Informe o e-mail de um usuário já existente. O painel não cria senha aqui: ele transforma o perfil cadastrado em gerente e configura seu escopo.</p>
          <form method="post" action="/managers/configure-user">
            <label>E-mail do usuário</label><input type="email" name="email" required placeholder="motorista@rottaurbana.app">
            <div class="row2"><div><label>Tipo de gerente</label><select name="manager_type"><option value="city">Gerente por cidade</option><option value="network">Gerente de rede</option></select></div><div><label>Cidades (separe por vírgula; opcional para rede)</label><input name="cities" placeholder="São Paulo|SP, Guarulhos|SP"></div></div>
            <label>Motoristas para vínculo direto (IDs separados por vírgula, opcional)</label><input name="driver_ids" placeholder="Use a edição do gerente para selecionar com nomes e veículos">
            <button class="act" type="submit" style="margin-top:16px;">Configurar gerente</button>
          </form>
        </div>
        <div class="manager-card">
          <h3>Distribuição da rede</h3><p>Motoristas incluídos em pelo menos um escopo efetivo.</p>
          <div class="metric">${summary.totalDrivers ? Math.round((summary.coveredDrivers / summary.totalDrivers) * 100) : 0}%</div><div class="metric-label">cobertura de motoristas</div>
          <div class="progress" style="margin:12px 0 14px;"><span style="width:${summary.totalDrivers ? Math.min(100, (summary.coveredDrivers / summary.totalDrivers) * 100) : 0}%"></span></div>
          <p><strong>${summary.unassignedDrivers.length}</strong> motorista(s) ainda sem um gerente responsável.</p>
          <a href="#sem-gerente" class="act gray" style="margin-top:10px;">Ver pendências</a>
        </div>
      </div>
      ${filterBar}
      <div class="card"><h2>Gerentes e suas equipes (${managers.length})</h2>${table(['Gerente', 'Escopo', 'Motoristas', 'Status / presença', 'Cadastro', 'Ações'], rows)}</div>
      <div class="card" id="sem-gerente"><h2>Motoristas sem gerente no escopo (${summary.unassignedDrivers.length})</h2><p class="muted">Essa lista ajuda o administrador a identificar quem precisa ser atribuído a uma cidade ou gerente responsável.</p>${table(['Motorista', 'Cidade', 'Veículo / status', 'Verificação', 'Abrir'], unassignedRows)}</div>`;
    render(res, layout({ title: 'Gerenciamento de Gerentes', active: '/managers', email: req.session.email, body }));
  });

  const detailHandler = async (req, res) => {
    const loaded = await renderManagers(req, res, { detailProfileId: req.params.profileId, admin });
    if (!loaded) return;
    const { workspace, manager } = loaded;
    const selected = new Set(manager.explicitDriverIds);
    const driverRows = manager.drivers.map((driver) => {
      const source = selected.has(driver.id) ? '<span class="chip">Vínculo direto</span>' : manager.manager_type === 'network' ? '<span class="chip">Rede</span>' : '<span class="chip">Cidade</span>';
      const move = selected.has(driver.id) ? '<span class="muted">Já vinculado</span>' : `<form class="inline" method="post" action="/managers/${manager.profile_id}/move-driver"><input type="hidden" name="driver_id" value="${driver.id}"><button type="submit" class="act" style="padding:7px 10px;font-size:12px;">Vincular aqui</button></form>`;
      return [`<strong>${esc(driverName(driver))}</strong><br><small class="muted">${esc(driver.profile?.email || '')}</small>`, `${esc(driverCity(driver) || 'Não informada')}<br><small class="muted">${esc(driver.profile?.address_state || driver.operating_state || '')}</small>`, `${esc(driverVehicle(driver))}<br>${badge(driver.status)}`, `${driver.is_verified ? badge('approved') : badge('pending')}<br><small class="muted">${driver.total_rides || 0} corridas totais</small>`, source, move];
    });
    const picker = workspace.drivers.map((driver) => {
      const search = `${driverName(driver)} ${driver.profile?.email || ''} ${driverCity(driver)} ${driverVehicle(driver)}`.toLocaleLowerCase('pt-BR');
      return `<label class="driver-option" data-driver-search="${esc(search)}"><input type="checkbox" name="driver_ids" value="${driver.id}" ${selected.has(driver.id) ? 'checked' : ''}><span style="flex:1"><strong>${esc(driverName(driver))}</strong><small>${esc(driverCity(driver) || 'Cidade não informada')} · ${esc(driverVehicle(driver))} · ${driver.is_verified ? 'verificado' : 'pendente'}</small></span>${badge(driver.status)}</label>`;
    }).join('');
    const auditRows = manager.audit.slice(0, 60).map((audit) => [`<strong>${esc(actionLabel(audit.action))}</strong><br><small class="muted">${esc(audit.details?.driver_id || '')}</small>`, esc(audit.actor?.full_name || 'Administrador'), fmtDate(audit.created_at)]);
    const body = `
      ${bodyMessage(req)}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:20px;"><div><a href="/managers" class="muted">← Voltar para gerentes</a><h2 style="margin:10px 0 4px;font-size:22px;">${esc(manager.profile.full_name || 'Gerente')}</h2><div class="muted">${esc(manager.profile.email || '')} · ${esc(fmtPhone(manager.profile.phone))}</div></div><div class="actions">${badge(manager.is_active ? 'active' : 'suspended')}<form class="inline" method="post" action="/managers/${manager.profile_id}/toggle"><input type="hidden" name="active" value="${manager.is_active ? '0' : '1'}"><button class="act ${manager.is_active ? 'red' : ''}" type="submit">${manager.is_active ? 'Desativar acesso' : 'Reativar acesso'}</button></form></div></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));">${kpiCard('Motoristas no escopo', manager.effectiveDriverIds.length, `${manager.explicitDriverIds.length} vínculos diretos`)}${kpiCard('Online agora', manager.stats.online, `${manager.stats.verified} verificados`)}${kpiCard('Corridas em 30 dias', manager.stats.rides, `${manager.stats.completed} concluídas`)}${kpiCard('Receita em 30 dias', brl(manager.stats.revenue), 'corridas concluídas')}</div>
      <div class="split">
        <div class="card"><h2>Configuração de acesso</h2><p class="muted">O tipo rede inclui todos os motoristas. O tipo cidade inclui quem está na cidade operacional/endereço informado e também os vínculos diretos.</p><form method="post" action="/managers/${manager.profile_id}/configure"><div class="row2"><div><label>Tipo de gerente</label><select name="manager_type"><option value="city" ${manager.manager_type === 'city' ? 'selected' : ''}>Gerente por cidade</option><option value="network" ${manager.manager_type === 'network' ? 'selected' : ''}>Gerente de rede</option></select></div><div><label>Cidades vinculadas</label><input name="cities" value="${esc(citiesToInput(manager.cities))}" placeholder="Cidade|UF, outra cidade|UF"></div></div><label>Buscar motoristas para vínculo direto</label><input id="driver-search" type="search" placeholder="Nome, e-mail, cidade, placa..." oninput="filterManagerDrivers(this.value)"><div class="driver-picker" style="margin-top:8px;">${picker || '<div class="empty">Nenhum motorista cadastrado.</div>'}</div><button class="act" type="submit" style="margin-top:16px;">Salvar escopo e vínculos</button></form></div>
        <div><div class="manager-card"><h3>Escopo atual</h3><p>${esc(manager.manager_type === 'network' ? 'Toda a rede' : 'Cidades e vínculos diretos')}</p><div class="chips" style="margin-top:12px;">${manager.manager_type === 'network' ? '<span class="chip">Todos os motoristas</span>' : (scopeLabel(manager))}</div><p style="margin-top:14px;">Responsável pela criação: <strong>${esc(manager.assignedBy.full_name || 'Administrador')}</strong></p><p>Cadastro: ${esc(fmtDate(manager.created_at))}</p></div><div class="danger-zone"><h3 style="margin:0 0 8px;font-size:15px;color:#991B1B;">Zona de acesso</h3><p class="muted">Remover o gerente exclui cidades e vínculos e restaura o perfil para a função anterior, quando aplicável.</p><form method="post" action="/managers/${manager.profile_id}/remove" onsubmit="return confirm('Confirmar remoção definitiva do acesso de gerente?')"><button class="act red" type="submit">Remover acesso de gerente</button></form></div></div>
      </div>
      <div class="card"><h2>Todos os motoristas dentro deste gerente (${manager.drivers.length})</h2><p class="muted">Use “Vincular aqui” para transformar um motorista do escopo automático em vínculo direto. Ao mover, o vínculo direto ativo em outro gerente é desativado.</p>${table(['Motorista', 'Cidade', 'Veículo / status', 'Verificação', 'Origem no escopo', 'Ação'], driverRows)}</div>
      <div class="card"><h2>Histórico administrativo</h2>${table(['Ação', 'Responsável', 'Data'], auditRows)}</div>
      <script>function filterManagerDrivers(value){const needle=String(value||'').toLocaleLowerCase('pt-BR');document.querySelectorAll('[data-driver-search]').forEach((el)=>{el.style.display=(!needle||el.dataset.driverSearch.includes(needle))?'flex':'none';});}</script>`;
    render(res, layout({ title: `Gerente · ${manager.profile.full_name || ''}`, active: '/managers', email: req.session.email, body }));
  };

  adminRouter.get('/managers/:profileId', requireAuth, detailHandler);
  adminRouter.get('/managers/:profileId/edit', requireAuth, detailHandler);

  adminRouter.post('/managers/configure-user', requireAuth, async (req, res) => {
    try {
      const profile = await findProfileByEmail(admin, req.body.email);
      const id = await configureManager(admin, { profileId: profile.id, actorId: req.session.userId, managerType: req.body.manager_type, cityInput: req.body.cities, driverIds: req.body.driver_ids });
      res.redirect(`/managers/${id}?ok=1`);
    } catch (error) {
      console.error('[Managers configure-user]', error);
      errorRedirect(res, error.message);
    }
  });

  adminRouter.post('/managers/:profileId/configure', requireAuth, async (req, res) => {
    try {
      await configureManager(admin, { profileId: req.params.profileId, actorId: req.session.userId, managerType: req.body.manager_type, cityInput: req.body.cities, driverIds: asList(req.body.driver_ids) });
      res.redirect(`/managers/${req.params.profileId}?ok=1`);
    } catch (error) {
      console.error('[Managers configure]', error);
      errorRedirect(res, error.message);
    }
  });

  adminRouter.post('/managers/:profileId/toggle', requireAuth, async (req, res) => {
    try {
      const active = req.body.active === '1' || req.body.active === 'true';
      await setManagerActive(admin, { profileId: req.params.profileId, actorId: req.session.userId, active });
      res.redirect('/managers?ok=1');
    } catch (error) {
      console.error('[Managers toggle]', error);
      errorRedirect(res, error.message);
    }
  });

  adminRouter.post('/managers/:profileId/remove', requireAuth, async (req, res) => {
    try {
      await removeManager(admin, { profileId: req.params.profileId, actorId: req.session.userId });
      res.redirect('/managers?ok=1');
    } catch (error) {
      console.error('[Managers remove]', error);
      errorRedirect(res, error.message);
    }
  });

  adminRouter.post('/managers/:profileId/move-driver', requireAuth, async (req, res) => {
    try {
      await moveDriver(admin, { profileId: req.params.profileId, driverId: req.body.driver_id, actorId: req.session.userId });
      res.redirect(`/managers/${req.params.profileId}?ok=1`);
    } catch (error) {
      console.error('[Managers move-driver]', error);
      errorRedirect(res, error.message);
    }
  });
}
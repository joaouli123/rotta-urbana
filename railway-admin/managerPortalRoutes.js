import { createClient } from '@supabase/supabase-js';
import { managerLayout, managerLoginPage, esc, fmtDate, fmtPhone, badge, brl, table } from './ui.js';
import { loadManagerPortal } from './managerAdmin.js';
import { loadUserBundle, resetUserPassword, updateDriverProfile } from './userAdmin.js';

const ACTIVE_RIDE_STATUSES = new Set(['searching', 'driver_found', 'driver_on_way', 'driver_arrived', 'in_progress']);
const driverName = (driver) => driver.profile?.full_name || driver.profile?.email || 'Motorista sem nome';
const driverCity = (driver) => driver.operating_city || driver.profile?.address_city || 'Cidade não informada';
const driverVehicle = (driver) => [driver.vehicle?.brand, driver.vehicle?.model].filter(Boolean).join(' ') || 'Veículo não informado';
const rideStatus = (ride) => ride.status || 'unknown';
const typeLabel = (manager) => manager.manager_type === 'network' ? 'Gerente de rede' : 'Gerente por cidade';
const scopeLabel = (manager) => manager.manager_type === 'network'
  ? 'Toda a rede'
  : manager.cities?.map((city) => `${city.city}${city.state ? `/${city.state}` : ''}`).join(', ') || 'Cidades e vínculos diretos';

const effectiveSubscriptionStatus = (subscription) => {
  if (!subscription) return 'pending';
  if (subscription.status === 'active' && subscription.due_date && String(subscription.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) return 'expired';
  return subscription.status || 'pending';
};
const managerKpi = (label, value, detail = '') => `<div class="kpi"><div class="kpi-val">${esc(value)}</div><div class="kpi-lbl">${esc(label)}</div>${detail ? `<div class="kpi-sub">${esc(detail)}</div>` : ''}</div>`;
const card = (title, content, extra = '') => `<section class="card"><h2>${esc(title)}</h2>${extra}${content}</section>`;
const managerContext = (req, portal) => ({
  email: req.session.managerEmail,
  managerName: portal?.manager?.profile?.full_name || req.session.managerName || req.session.managerEmail,
});

const pageError = (req, res, render, active, title, error) => {
  console.error(`[Manager portal] ${active}`, error);
  return render(res, managerLayout({
    title,
    active,
    ...managerContext(req),
    body: `<div class="err">Não foi possível carregar esta área. ${esc(error?.message || 'Tente novamente.')}</div>`,
  }));
};

const getPortal = async (req, res, render, active, title, admin) => {
  try {
    return await loadManagerPortal(admin, req.session.managerUserId);
  } catch (error) {
    pageError(req, res, render, active, title, error);
    return null;
  }
};

const metrics = (portal) => {
  const rides = portal.rides;
  const completed = rides.filter((ride) => ride.status === 'completed');
  const cancelled = rides.filter((ride) => ride.status === 'cancelled');
  const active = rides.filter((ride) => ACTIVE_RIDE_STATUSES.has(ride.status));
  const revenue = completed.reduce((sum, ride) => sum + (Number(ride.price) || 0), 0);
  return {
    total: rides.length,
    completed: completed.length,
    cancelled: cancelled.length,
    active: active.length,
    revenue,
    average: completed.length ? revenue / completed.length : 0,
    successRate: rides.length ? `${((completed.length / rides.length) * 100).toFixed(1)}%` : '0%',
  };
};

const driverStats = (drivers, rides) => {
  const stats = Object.fromEntries(drivers.map((driver) => [driver.id, { total: 0, completed: 0, active: 0, revenue: 0 }]));
  for (const ride of rides) {
    if (!stats[ride.driver_id]) continue;
    stats[ride.driver_id].total++;
    if (ride.status === 'completed') {
      stats[ride.driver_id].completed++;
      stats[ride.driver_id].revenue += Number(ride.price) || 0;
    }
    if (ACTIVE_RIDE_STATUSES.has(ride.status)) stats[ride.driver_id].active++;
  }
  return stats;
};

const recentRideRows = (rides, drivers, limit = 12) => {
  const byId = Object.fromEntries(drivers.map((driver) => [driver.id, driver]));
  return rides.slice().sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at)).slice(0, limit).map((ride) => [
    badge(rideStatus(ride)),
    esc(driverName(byId[ride.driver_id] || {})),
    badge(ride.ride_type || 'economy'),
    brl(ride.price),
    fmtDate(ride.requested_at),
  ]);
};

const driverRows = (drivers, stats, query = '') => {
  const needle = String(query || '').trim().toLocaleLowerCase('pt-BR');
  return drivers.filter((driver) => {
    const haystack = [driverName(driver), driver.profile?.email, driver.profile?.phone, driverCity(driver), driver.vehicle?.plate, driverVehicle(driver)].join(' ').toLocaleLowerCase('pt-BR');
    return !needle || haystack.includes(needle);
  }).sort((a, b) => driverName(a).localeCompare(driverName(b), 'pt-BR')).map((driver) => [
    `<strong>${esc(driverName(driver))}</strong><br><small class="muted">${esc(driver.profile?.email || '')}</small>`,
    `${esc(fmtPhone(driver.profile?.phone))}<br><small class="muted">${esc(driverCity(driver))}</small>`,
    `${esc(driverVehicle(driver))}<br><small class="muted">${esc(driver.vehicle?.plate || 'Placa não informada')}</small>`,
    `${badge(driver.status || 'offline')}<br>${driver.is_verified ? badge('approved') : badge('pending')}`,
    `${stats[driver.id]?.total || 0} total<br><small class="muted">${stats[driver.id]?.completed || 0} concluídas · ${stats[driver.id]?.active || 0} ativas</small>`,
    `<div class="filters"><a class="act" href="/drivers/${driver.id}/edit">Editar</a><a class="act gray" href="/drivers/${driver.id}/reset-password">Senha</a></div>`,
  ]);
};

const userRows = (users, query = '') => {
  const needle = String(query || '').trim().toLocaleLowerCase('pt-BR');
  return users.filter((user) => {
    const haystack = [user.full_name, user.email, user.phone, user.address_city, user.userType].join(' ').toLocaleLowerCase('pt-BR');
    return !needle || haystack.includes(needle);
  }).map((user) => [
    `<strong>${esc(user.full_name || 'Sem nome')}</strong><br><small class="muted">${esc(user.email || '')}</small>`,
    badge(user.userType === 'driver' ? 'driver' : 'passenger'),
    esc(fmtPhone(user.phone)),
    user.userType === 'driver'
      ? `${badge(user.driver?.status || 'offline')}<br><small class="muted">${esc(user.driver?.operating_city || user.address_city || 'Cidade não informada')}</small>`
      : '<small class="muted">Passageiro com corrida no escopo</small>',
    user.userType === 'driver'
      ? `<div class="filters"><a class="act" href="/drivers/${user.id}/edit">Editar</a><a class="act gray" href="/drivers/${user.id}/reset-password">Senha</a></div>`
      : '<small class="muted">Somente acompanhamento</small>',
  ]);
};

const supportScope = async (admin, portal) => {
  const allowedUserIds = portal.allowedUserIds || portal.drivers.map((driver) => driver.id);
  if (!allowedUserIds.length) return { tickets: [], names: {}, roles: {} };
  const [{ data: tickets, error }, { data: profiles, error: profilesError }] = await Promise.all([
    admin.from('support_tickets').select('*').in('user_id', allowedUserIds).order('created_at', { ascending: false }).limit(200),
    admin.from('profiles').select('id,full_name,email,role').in('id', allowedUserIds),
  ]);
  if (error) throw error;
  if (profilesError) throw profilesError;
  return {
    tickets: tickets || [],
    names: Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name || profile.email || 'Usuário'])),
    roles: Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.role])),
  };
};

const managerDriverFormFields = (profile, driver, vehicle) => `
  <div class="row2">
    <div><label>Nome completo</label><input name="full_name" value="${esc(profile.full_name || '')}" required></div>
    <div><label>E-mail de acesso</label><input name="email" type="email" value="${esc(profile.email || '')}" required></div>
    <div><label>Telefone</label><input name="phone" value="${esc(profile.phone || '')}"></div>
    <div><label>CPF</label><input name="cpf" value="${esc(profile.cpf || '')}"></div>
    <div><label>Gênero</label><select name="gender"><option value="">Não informado</option><option value="female" ${profile.gender === 'female' ? 'selected' : ''}>Feminino</option><option value="male" ${profile.gender === 'male' ? 'selected' : ''}>Masculino</option><option value="other" ${profile.gender === 'other' ? 'selected' : ''}>Outro</option></select></div>
  </div>
  <h3 style="margin:22px 0 12px;font-size:15px;">Endereço</h3>
  <div class="row2">
    <div><label>CEP</label><input name="address_cep" value="${esc(profile.address_cep || '')}"></div>
    <div><label>Estado</label><input name="address_state" maxlength="2" value="${esc(profile.address_state || '')}"></div>
    <div><label>Cidade</label><input name="address_city" value="${esc(profile.address_city || '')}"></div>
    <div><label>Bairro</label><input name="address_neighborhood" value="${esc(profile.address_neighborhood || '')}"></div>
    <div><label>Rua</label><input name="address_street" value="${esc(profile.address_street || '')}"></div>
    <div><label>Número</label><input name="address_number" value="${esc(profile.address_number || '')}"></div>
    <div style="grid-column:1/-1"><label>Complemento</label><input name="address_complement" value="${esc(profile.address_complement || '')}"></div>
  </div>
  <h3 style="margin:22px 0 12px;font-size:15px;">Dados operacionais</h3>
  <div class="row2">
    <div><label>Chave PIX</label><input name="pix_key" value="${esc(driver.pix_key || '')}"></div>
    <div><label>Cidade operacional</label><input name="operating_city" value="${esc(driver.operating_city || '')}"></div>
    <div><label>Estado operacional</label><input name="operating_state" maxlength="2" value="${esc(driver.operating_state || '')}"></div>
  </div>
  <h3 style="margin:22px 0 12px;font-size:15px;">Veículo principal</h3>
  <div class="row2">
    <div><label>Marca</label><input name="vehicle_brand" value="${esc(vehicle.brand || '')}"></div>
    <div><label>Modelo</label><input name="vehicle_model" value="${esc(vehicle.model || '')}"></div>
    <div><label>Placa</label><input name="vehicle_plate" value="${esc(vehicle.plate || '')}"></div>
    <div><label>Ano</label><input name="vehicle_year" type="number" min="1980" max="2100" value="${esc(vehicle.year || '')}"></div>
    <div><label>Cor</label><input name="vehicle_color" value="${esc(vehicle.color || '')}"></div>
    <div><label>Tipo</label><select name="vehicle_type"><option value="sedan" ${vehicle.type === 'sedan' ? 'selected' : ''}>Sedan</option><option value="hatch" ${vehicle.type === 'hatch' ? 'selected' : ''}>Hatch</option><option value="suv" ${vehicle.type === 'suv' ? 'selected' : ''}>SUV</option><option value="moto" ${vehicle.type === 'moto' ? 'selected' : ''}>Moto</option></select></div>
    <div><label>Valor FIPE</label><input name="vehicle_fipe_value" type="number" min="0" step="0.01" value="${esc(vehicle.fipe_value || '')}"></div>
    <div><label>Assentos</label><input name="vehicle_seats" type="number" min="1" max="9" value="${esc(vehicle.seats || 4)}"></div>
  </div>`;

export function registerManagerPortalRoutes({ managerRouter, requireManagerAuth, managerLoginLimiter, render, admin }) {
  managerRouter.get('/login', (req, res) => render(res, managerLoginPage(req.query.error || '')));

  managerRouter.post('/login', managerLoginLimiter, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return render(res, managerLoginPage('Informe e-mail e senha.'));

    try {
      const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY } = process.env;
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY ?? SUPABASE_SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error || !data?.user) return render(res, managerLoginPage('E-mail ou senha incorretos.'));

      const { data: profile, error: profileError } = await admin.from('profiles').select('id,role,full_name,email,is_active').eq('id', data.user.id).maybeSingle();
      if (profileError) throw profileError;
      if (profile?.role !== 'manager') return render(res, managerLoginPage('Este usuário ainda não possui perfil de gerente.'));
      if (profile.is_active === false) return render(res, managerLoginPage('Este acesso está inativo. Solicite a ativação ao administrador.'));

      const { data: manager, error: managerError } = await admin.from('managers').select('id,is_active').eq('profile_id', data.user.id).maybeSingle();
      if (managerError) throw managerError;
      if (!manager || manager.is_active === false) return render(res, managerLoginPage('O acesso de gerente está inativo. Solicite a ativação ao administrador.'));

      req.session.managerUserId = data.user.id;
      req.session.managerEmail = profile.email || data.user.email;
      req.session.managerName = profile.full_name || '';
      req.session.save((saveError) => {
        if (saveError) return render(res, managerLoginPage('Não foi possível criar a sessão. Tente novamente.'));
        res.redirect('/');
      });
    } catch (error) {
      console.error('[Manager login]', error);
      render(res, managerLoginPage('Erro ao entrar. Tente novamente.'));
    }
  });

  managerRouter.post('/logout', (req, res) => {
    delete req.session.managerUserId;
    delete req.session.managerEmail;
    delete req.session.managerName;
    req.session.save(() => res.redirect('/login'));
  });

  managerRouter.get('/', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/', 'Visão geral', admin);
    if (!portal) return;
    const m = metrics(portal);
    const stats = driverStats(portal.drivers, portal.rides);
    const topDrivers = portal.drivers.slice().sort((a, b) => (stats[b.id].completed - stats[a.id].completed) || (stats[b.id].total - stats[a.id].total)).slice(0, 8);
    const topRows = topDrivers.map((driver) => [
      `<strong>${esc(driverName(driver))}</strong><br><small class="muted">${esc(driverCity(driver))}</small>`,
      badge(driver.status || 'offline'),
      `${stats[driver.id].total} corridas<br><small class="muted">${stats[driver.id].completed} concluídas</small>`,
      brl(stats[driver.id].revenue),
    ]);
    const body = `
      <div class="notice"><strong>${esc(typeLabel(portal.manager))}.</strong> Escopo: ${esc(scopeLabel(portal.manager))}. Os indicadores abaixo mostram somente os motoristas vinculados a este gerente e as corridas dos últimos 30 dias.</div>
      <div class="grid">${managerKpi('Motoristas no escopo', portal.drivers.length, `${portal.manager.explicitDriverIds.length} vínculo(s) direto(s)`)}${managerKpi('Corridas em 30 dias', m.total, `${m.completed} concluídas`)}${managerKpi('Motoristas online', portal.drivers.filter((driver) => ['online', 'on_ride'].includes(driver.status)).length, `${portal.drivers.filter((driver) => driver.is_verified).length} verificados`)}${managerKpi('Receita concluída', brl(m.revenue), `Ticket médio ${brl(m.average)}`)}</div>
      <div class="row2">${card('Desempenho da operação', `<div class="grid" style="margin:0;grid-template-columns:repeat(2,1fr)">${managerKpi('Taxa de conclusão', m.successRate)}${managerKpi('Em andamento', m.active)}${managerKpi('Canceladas', m.cancelled)}${managerKpi('Ticket médio', brl(m.average))}</div>`)}${card('Atalhos de acompanhamento', `<p class="muted">Acesse rapidamente os detalhes do seu escopo.</p><div class="filters"><a class="act" href="/drivers">Motoristas</a><a class="act gray" href="/rides">Corridas</a><a class="act gray" href="/reports">Relatórios</a><a class="act gray" href="/support">Suporte</a></div>`)}</div>
      ${card('Motoristas com maior movimentação', table(['Motorista', 'Status', 'Corridas', 'Receita'], topRows))}
      ${card('Corridas recentes', table(['Status', 'Motorista', 'Categoria', 'Valor', 'Data'], recentRideRows(portal.rides, portal.drivers)))}
    `;
    render(res, managerLayout({ title: 'Visão geral', active: '/', ...managerContext(req, portal), body }));
  });

  managerRouter.get('/drivers', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/drivers', 'Motoristas', admin);
    if (!portal) return;
    const stats = driverStats(portal.drivers, portal.rides);
    const query = String(req.query.q || '');
    const rows = driverRows(portal.drivers, stats, query);
    const body = `${req.query.ok ? '<div class="ok">Dados do motorista atualizados com sucesso.</div>' : ''}${req.query.error ? `<div class="err">${esc(req.query.error)}</div>` : ''}<div class="notice"><strong>${portal.drivers.length} motorista(s) dentro do seu escopo.</strong> Esta lista é atualizada diretamente do cadastro e mostra status, verificação, veículo e desempenho recente. O gerente pode editar dados cadastrais e veículo, mas não permissões, aprovação ou vínculo.</div><div class="card"><form method="get" action="/drivers" style="display:flex;gap:10px;margin-bottom:18px"><input name="q" value="${esc(query)}" placeholder="Buscar nome, e-mail, cidade ou placa..."><button class="act" type="submit">Buscar</button></form>${table(['Motorista', 'Contato / cidade', 'Veículo', 'Status / verificação', 'Desempenho', 'Ações'], rows)}</div>`;
    render(res, managerLayout({ title: 'Motoristas', active: '/drivers', ...managerContext(req, portal), body }));
  });

  managerRouter.get('/subscriptions', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/subscriptions', 'Assinaturas da rede', admin);
    if (!portal) return;
    const rows = portal.drivers.slice().sort((a, b) => driverName(a).localeCompare(driverName(b), 'pt-BR')).map((driver) => [
      `<strong>${esc(driverName(driver))}</strong><br><small class="muted">${esc(driver.profile?.email || '')}</small>`,
      esc(driverCity(driver)), badge(effectiveSubscriptionStatus(driver.subscription)), brl(driver.subscription?.amount || 0), esc(driver.subscription?.due_date || '—'),
      esc(driver.subscription?.provider_status || '—'), driver.subscription?.paid_at ? fmtDate(driver.subscription.paid_at) : '—',
    ]);
    const current = portal.drivers.filter((driver) => effectiveSubscriptionStatus(driver.subscription) === 'active').length;
    const pending = portal.drivers.filter((driver) => effectiveSubscriptionStatus(driver.subscription) === 'pending').length;
    const expired = portal.drivers.filter((driver) => effectiveSubscriptionStatus(driver.subscription) === 'expired').length;
    const body = `<div class="notice"><strong>VisÃ£o somente leitura.</strong> Esta pÃ¡gina mostra as assinaturas dos motoristas que pertencem ao seu escopo. AlteraÃ§Ãµes financeiras, sincronizaÃ§Ã£o e liberaÃ§Ãµes continuam exclusivas do administrador.</div><div class="grid">${managerKpi('Assinaturas ativas', current)}${managerKpi('Pendentes', pending)}${managerKpi('Vencidas', expired)}</div>${card('Assinaturas dos motoristas da rede', table(['Motorista', 'Cidade', 'Status', 'Valor', 'Vencimento', 'Mercado Pago', 'Pago em'], rows))}`;
    render(res, managerLayout({ title: 'Assinaturas da rede', active: '/subscriptions', ...managerContext(req, portal), body }));
  });

  managerRouter.get('/users', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/users', 'Usuários da rede', admin);
    if (!portal) return;
    const query = String(req.query.q || '');
    const rows = userRows(portal.users || [], query);
    const body = `${req.query.error ? `<div class="err">${esc(req.query.error)}</div>` : ''}<div class="notice"><strong>${portal.users?.length || 0} usuário(s) no escopo.</strong> Motoristas vinculados podem ser editados e ter a senha redefinida. Passageiros aparecem apenas para acompanhamento quando possuem corrida com a rede nos últimos 30 dias.</div><div class="card"><form method="get" action="/users" style="display:flex;gap:10px;margin-bottom:18px"><input name="q" value="${esc(query)}" placeholder="Buscar nome, e-mail ou telefone..."><button class="act" type="submit">Buscar</button></form>${table(['Usuário', 'Tipo', 'Contato', 'Vínculo / status', 'Ações'], rows)}</div>`;
    render(res, managerLayout({ title: 'Usuários da rede', active: '/users', ...managerContext(req, portal), body }));
  });

  managerRouter.get('/drivers/:id/edit', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/drivers', 'Editar motorista', admin);
    if (!portal) return;
    if (!portal.drivers.some((driver) => driver.id === req.params.id)) return res.status(403).send('Motorista fora do escopo deste gerente.');
    try {
      const { profile, driver, vehicle } = await loadUserBundle(admin, req.params.id);
      const body = `<div style="margin-bottom:16px;"><a href="/drivers" class="muted">← Voltar para motoristas</a></div><div class="card" style="max-width:850px;margin:0 auto;"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;"><div><h2 style="margin-bottom:6px;">Editar motorista</h2><p class="muted" style="margin:0;">${esc(profile.full_name || '')} · ${esc(profile.email || '')}</p></div><a class="act gray" href="/drivers/${profile.id}/reset-password">Redefinir senha</a></div><form method="post" action="/drivers/${profile.id}/edit">${managerDriverFormFields(profile, driver || {}, vehicle || {})}<p class="muted" style="margin-top:18px;">O gerente pode editar os dados cadastrais, endereço, dados operacionais e veículo. Permissões, status de verificação e vínculos continuam sob controle do administrador.</p><div style="margin-top:24px;text-align:right;display:flex;gap:10px;justify-content:flex-end;"><a href="/drivers" class="act gray">Cancelar</a><button type="submit" class="act">Salvar alterações</button></div></form></div>`;
      render(res, managerLayout({ title: 'Editar motorista', active: '/drivers', ...managerContext(req, portal), body }));
    } catch (error) {
      pageError(req, res, render, '/drivers', 'Editar motorista', error);
    }
  });

  managerRouter.post('/drivers/:id/edit', requireManagerAuth, async (req, res) => {
    try {
      const portal = await loadManagerPortal(admin, req.session.managerUserId);
      if (!portal.drivers.some((driver) => driver.id === req.params.id)) return res.status(403).send('Motorista fora do escopo deste gerente.');
      await updateDriverProfile(admin, req.params.id, req.body);
      res.redirect('/drivers?ok=1');
    } catch (error) {
      console.error('[Manager driver edit]', error);
      res.redirect(`/drivers?error=${encodeURIComponent(error.message)}`);
    }
  });

  managerRouter.get('/drivers/:id/reset-password', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/drivers', 'Redefinir senha', admin);
    if (!portal) return;
    if (!portal.drivers.some((driver) => driver.id === req.params.id)) return res.status(403).send('Motorista fora do escopo deste gerente.');
    try {
      const { profile } = await loadUserBundle(admin, req.params.id);
      const body = `<div style="margin-bottom:16px;"><a href="/drivers/${profile.id}/edit" class="muted">← Voltar para edição</a></div><div class="card" style="max-width:600px;margin:0 auto;"><h2>Redefinir senha do motorista</h2><p class="muted">A nova senha será aplicada imediatamente para <strong>${esc(profile.full_name || '')}</strong> (${esc(profile.email || '')}).</p><form method="post" action="/drivers/${profile.id}/reset-password"><label>Nova senha</label><input name="new_password" type="password" autocomplete="new-password" minlength="8" required placeholder="Mínimo de 8 caracteres"><label>Confirmar nova senha</label><input name="confirm_password" type="password" autocomplete="new-password" minlength="8" required placeholder="Repita a senha"><div style="margin-top:24px;text-align:right;display:flex;gap:10px;justify-content:flex-end;"><a href="/drivers/${profile.id}/edit" class="act gray">Cancelar</a><button type="submit" class="act">Alterar senha</button></div></form></div>`;
      render(res, managerLayout({ title: 'Redefinir senha', active: '/drivers', ...managerContext(req, portal), body }));
    } catch (error) {
      pageError(req, res, render, '/drivers', 'Redefinir senha', error);
    }
  });

  managerRouter.post('/drivers/:id/reset-password', requireManagerAuth, async (req, res) => {
    try {
      const portal = await loadManagerPortal(admin, req.session.managerUserId);
      if (!portal.drivers.some((driver) => driver.id === req.params.id)) return res.status(403).send('Motorista fora do escopo deste gerente.');
      if (String(req.body.new_password || '') !== String(req.body.confirm_password || '')) throw new Error('As senhas não conferem.');
      await resetUserPassword(admin, req.params.id, req.body.new_password);
      res.redirect('/drivers?ok=1');
    } catch (error) {
      console.error('[Manager driver password]', error);
      res.redirect(`/drivers?error=${encodeURIComponent(error.message)}`);
    }
  });

  managerRouter.get('/rides', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/rides', 'Corridas', admin);
    if (!portal) return;
    const m = metrics(portal);
    const body = `<div class="grid">${managerKpi('Corridas no período', m.total)}${managerKpi('Concluídas', m.completed)}${managerKpi('Em andamento', m.active)}${managerKpi('Canceladas', m.cancelled)}</div>${card('Corridas dos últimos 30 dias', table(['Status', 'Motorista', 'Categoria', 'Valor', 'Solicitada em'], recentRideRows(portal.rides, portal.drivers, 100)))}<p class="muted">A visualização está limitada aos últimos 30 dias e aos motoristas vinculados ao seu gerente.</p>`;
    render(res, managerLayout({ title: 'Corridas', active: '/rides', ...managerContext(req, portal), body }));
  });

  managerRouter.get('/reports', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/reports', 'Relatórios', admin);
    if (!portal) return;
    const m = metrics(portal);
    const stats = driverStats(portal.drivers, portal.rides);
    const byStatus = {};
    const byType = {};
    for (const ride of portal.rides) {
      byStatus[rideStatus(ride)] = (byStatus[rideStatus(ride)] || 0) + 1;
      byType[ride.ride_type || 'economy'] = (byType[ride.ride_type || 'economy'] || 0) + 1;
    }
    const statusRows = Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => [badge(status), count, `${m.total ? ((count / m.total) * 100).toFixed(1) : '0'}%`]);
    const typeRows = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => [badge(type), count, `${m.total ? ((count / m.total) * 100).toFixed(1) : '0'}%`]);
    const performanceRows = portal.drivers.slice().sort((a, b) => (stats[b.id].revenue - stats[a.id].revenue)).map((driver) => [esc(driverName(driver)), esc(driverCity(driver)), stats[driver.id].total, stats[driver.id].completed, brl(stats[driver.id].revenue)]);
    const body = `<div class="notice"><strong>Relatório operacional do seu escopo.</strong> Período padrão: últimos 30 dias. Valores de receita consideram apenas corridas concluídas.</div><div class="grid">${managerKpi('Conclusão', m.successRate)}${managerKpi('Receita', brl(m.revenue))}${managerKpi('Ticket médio', brl(m.average))}${managerKpi('Equipe ativa', portal.drivers.filter((driver) => ['online', 'on_ride'].includes(driver.status)).length)}</div><div class="row2">${card('Distribuição por status', table(['Status', 'Quantidade', 'Participação'], statusRows))}${card('Distribuição por categoria', table(['Categoria', 'Quantidade', 'Participação'], typeRows))}</div>${card('Desempenho por motorista', table(['Motorista', 'Cidade', 'Corridas', 'Concluídas', 'Receita'], performanceRows))}`;
    render(res, managerLayout({ title: 'Relatórios', active: '/reports', ...managerContext(req, portal), body }));
  });

  managerRouter.get('/support', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/support', 'Suporte', admin);
    if (!portal) return;
    let scoped;
    try { scoped = await supportScope(admin, portal); } catch (error) { return pageError(req, res, render, '/support', 'Suporte', error); }
    const { tickets, names, roles } = scoped;
    const rows = (tickets || []).map((ticket) => [
      `${esc(names[ticket.user_id] || 'Usuário')}<br><small class="muted">${esc(roles[ticket.user_id] === 'driver' ? 'Motorista' : 'Passageiro')}</small>`,
      esc(ticket.subject || 'Sem assunto'),
      esc(String(ticket.message || '').slice(0, 110)),
      badge(ticket.status || 'open'),
      fmtDate(ticket.created_at),
      `<a class="act gray" href="/support/${ticket.id}">Abrir</a>`,
    ]);
    const body = `${req.query.ok ? '<div class="ok">Ticket atualizado. O usuário será notificado se tiver permitido notificações.</div>' : ''}${req.query.error ? `<div class="err">${esc(req.query.error)}</div>` : ''}<div class="notice"><strong>Suporte da sua rede.</strong> Aqui aparecem chamados de motoristas e passageiros que tiveram corrida com motoristas do seu escopo nos últimos 30 dias. Ao responder ou mudar o status, o usuário recebe uma notificação no app.</div>${card('Tickets da rede', table(['Usuário', 'Assunto', 'Mensagem', 'Status', 'Criado', 'Ação'], rows))}`;
    render(res, managerLayout({ title: 'Suporte', active: '/support', ...managerContext(req, portal), body }));
  });

  managerRouter.get('/support/:id', requireManagerAuth, async (req, res) => {
    const portal = await getPortal(req, res, render, '/support', 'Detalhes do suporte', admin);
    if (!portal) return;
    try {
      const { tickets, names, roles } = await supportScope(admin, portal);
      const ticket = tickets.find((item) => item.id === req.params.id);
      if (!ticket) return res.status(404).send('Chamado fora do escopo deste gerente.');
      const body = `<div style="margin-bottom:16px"><a href="/support" class="muted">← Voltar para suporte</a></div><div class="card" style="max-width:820px;margin:0 auto"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h2 style="margin-bottom:6px">${esc(ticket.subject || 'Chamado')}</h2><p class="muted" style="margin:0">${esc(names[ticket.user_id] || 'Usuário')} · ${esc(roles[ticket.user_id] === 'driver' ? 'Motorista' : 'Passageiro')} · ${fmtDate(ticket.created_at)}</p></div>${badge(ticket.status || 'open')}</div><div style="margin:22px 0;padding:16px;background:#F8FAFC;border:1px solid var(--line);border-radius:12px;white-space:pre-wrap;line-height:1.6">${esc(ticket.message || '')}</div>${ticket.response ? `<div class="notice"><strong>Resposta registrada:</strong><br>${esc(ticket.response)}</div>` : ''}<form method="post" action="/support/${ticket.id}/status"><label>Resposta ao usuário</label><textarea name="response" rows="6" placeholder="Escreva uma orientação ou atualização para o usuário...">${esc(ticket.response || '')}</textarea><label>Status</label><select name="status"><option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Aberto</option><option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>Em andamento</option><option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Fechado</option></select><div style="margin-top:22px;text-align:right"><button class="act" type="submit">Salvar e notificar usuário</button></div></form></div>`;
      render(res, managerLayout({ title: 'Detalhes do suporte', active: '/support', ...managerContext(req, portal), body }));
    } catch (error) {
      pageError(req, res, render, '/support', 'Detalhes do suporte', error);
    }
  });

  managerRouter.post('/support/:id/status', requireManagerAuth, async (req, res) => {
    try {
      const portal = await loadManagerPortal(admin, req.session.managerUserId);
      const { tickets } = await supportScope(admin, portal);
      if (!tickets.some((ticket) => ticket.id === req.params.id)) return res.status(403).send('Chamado fora do escopo deste gerente.');
      const status = ['open', 'in_progress', 'closed'].includes(req.body.status) ? req.body.status : null;
      if (!status) throw new Error('Status de suporte inválido.');
      const response = String(req.body.response || '').trim() || null;
      const { error } = await admin.from('support_tickets').update({ status, response, updated_at: new Date().toISOString() }).eq('id', req.params.id);
      if (error) throw error;
      res.redirect('/support?ok=1');
    } catch (error) {
      console.error('[Manager support update]', error);
      res.redirect(`/support?error=${encodeURIComponent(error.message)}`);
    }
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ensureUuid = (value, label) => {
  const id = String(value || '').trim();
  if (!UUID_RE.test(id)) throw new Error(`${label} inválido.`);
  return id;
};

const uniqueIds = (value) => [...new Set((Array.isArray(value) ? value : [value])
  .flatMap((item) => String(item || '').split(','))
  .map((item) => item.trim())
  .filter((item) => UUID_RE.test(item)))];

const cleanCities = (value) => {
  const tokens = (Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/))
    .flatMap((item) => String(item || '').split(/[\n,;]+/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set();
  return tokens.map((token) => {
    const parts = token.split('|').map((part) => part.trim());
    const city = parts[0].replace(/\s+/g, ' ');
    const state = parts[1] ? parts[1].toUpperCase().slice(0, 2) : null;
    const key = city.toLocaleLowerCase('pt-BR');
    if (!city || seen.has(key)) return null;
    seen.add(key);
    return { city, state };
  }).filter(Boolean);
};

const throwOnError = (result, label) => {
  if (result?.error) throw new Error(`${label}: ${result.error.message}`);
  return result?.data ?? null;
};

const lower = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');
const driverCity = (driver) => driver.operating_city || driver.profile?.address_city || '';

export const citiesToInput = (cities = []) => cities.map((item) => `${item.city}${item.state ? `|${item.state}` : ''}`).join(', ');

export async function loadManagerWorkspace(admin) {
  const [managersResult, profilesResult, driversResult, vehiclesResult, citiesResult, linksResult, auditResult, ridesResult] = await Promise.all([
    admin.from('managers').select('*').order('created_at', { ascending: false }),
    admin.from('profiles').select('*'),
    admin.from('drivers').select('*'),
    admin.from('vehicles').select('*'),
    admin.from('manager_cities').select('*'),
    admin.from('manager_drivers').select('*'),
    admin.from('manager_audit_log').select('*').order('created_at', { ascending: false }).limit(2000),
    admin.from('rides').select('driver_id,passenger_id,status,price,requested_at').gte('requested_at', new Date(Date.now() - 30 * 864e5).toISOString()).limit(10000),
  ]);

  const managersRaw = throwOnError(managersResult, 'Gerentes');
  const profiles = throwOnError(profilesResult, 'Perfis');
  const driversRaw = throwOnError(driversResult, 'Motoristas');
  const vehicles = throwOnError(vehiclesResult, 'Veículos');
  const cities = throwOnError(citiesResult, 'Cidades dos gerentes');
  const links = throwOnError(linksResult, 'Vínculos dos gerentes');
  const audits = throwOnError(auditResult, 'Auditoria dos gerentes');
  const rides = throwOnError(ridesResult, 'Corridas');

  const profileMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
  const vehicleMap = {};
  for (const vehicle of vehicles) {
    (vehicleMap[vehicle.driver_id] ??= []).push(vehicle);
  }

  const drivers = driversRaw.map((driver) => ({
    ...driver,
    profile: profileMap[driver.id] || {},
    vehicle: (vehicleMap[driver.id] || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0] || {},
  }));
  const driverMap = Object.fromEntries(drivers.map((driver) => [driver.id, driver]));
  const citiesMap = {};
  for (const city of cities.filter((item) => item.is_active !== false)) {
    (citiesMap[city.manager_id] ??= []).push(city);
  }
  const linksMap = {};
  for (const link of links.filter((item) => item.is_active !== false)) {
    (linksMap[link.manager_id] ??= []).push(link.driver_id);
  }
  const auditMap = {};
  for (const audit of audits) {
    (auditMap[audit.manager_id] ??= []).push({ ...audit, actor: profileMap[audit.actor_id] || {} });
  }

  const rideStatsByDriver = {};
  for (const ride of rides) {
    if (!ride.driver_id) continue;
    const stats = (rideStatsByDriver[ride.driver_id] ??= { rides: 0, completed: 0, active: 0, revenue: 0 });
    stats.rides++;
    if (ride.status === 'completed') {
      stats.completed++;
      stats.revenue += Number(ride.price) || 0;
    }
    if (['searching', 'driver_found', 'driver_on_way', 'driver_arrived', 'in_progress'].includes(ride.status)) stats.active++;
  }

  const managers = managersRaw.map((manager) => {
    const profile = profileMap[manager.profile_id] || {};
    const managerCities = citiesMap[manager.id] || [];
    const explicitDriverIds = linksMap[manager.id] || [];
    const cityKeys = new Set(managerCities.map((city) => lower(city.city)));
    const effectiveDrivers = manager.manager_type === 'network'
      ? drivers
      : drivers.filter((driver) => explicitDriverIds.includes(driver.id) || cityKeys.has(lower(driverCity(driver))));
    const effectiveDriverIds = effectiveDrivers.map((driver) => driver.id);
    const stats = effectiveDrivers.reduce((acc, driver) => {
      const rideStats = rideStatsByDriver[driver.id] || { rides: 0, completed: 0, active: 0, revenue: 0 };
      acc.rides += rideStats.rides;
      acc.completed += rideStats.completed;
      acc.active += rideStats.active;
      acc.revenue += rideStats.revenue;
      if (['online', 'on_ride'].includes(driver.status)) acc.online++;
      if (driver.is_verified) acc.verified++;
      return acc;
    }, { rides: 0, completed: 0, active: 0, revenue: 0, online: 0, verified: 0 });
    return {
      ...manager,
      profile,
      assignedBy: profileMap[manager.assigned_by] || {},
      cities: managerCities,
      explicitDriverIds,
      effectiveDriverIds,
      drivers: effectiveDrivers,
      stats,
      audit: auditMap[manager.id] || [],
    };
  });

  const covered = new Set(managers.flatMap((manager) => manager.effectiveDriverIds));
  const summary = {
    totalManagers: managers.length,
    activeManagers: managers.filter((manager) => manager.is_active).length,
    inactiveManagers: managers.filter((manager) => !manager.is_active).length,
    networkManagers: managers.filter((manager) => manager.manager_type === 'network').length,
    cityManagers: managers.filter((manager) => manager.manager_type !== 'network').length,
    explicitLinks: links.filter((link) => link.is_active !== false).length,
    totalDrivers: drivers.length,
    coveredDrivers: covered.size,
    unassignedDrivers: drivers.filter((driver) => !covered.has(driver.id)),
    rides30d: rides.length,
  };

  return { managers, drivers, profiles, rides, summary };
}

export async function loadManagerPortal(admin, profileId) {
  const workspace = await loadManagerWorkspace(admin);
  const manager = workspace.managers.find((item) => item.profile_id === profileId);
  if (!manager) throw new Error('Gerente não encontrado ou ainda não configurado.');
  if (!manager.is_active) throw new Error('O acesso deste gerente está desativado.');

  const allowedDriverIds = new Set(manager.effectiveDriverIds);
  const scopedRides = workspace.rides.filter((ride) => allowedDriverIds.has(ride.driver_id));
  const passengerIds = new Set(scopedRides.map((ride) => ride.passenger_id).filter(Boolean));
  const allowedUserIds = new Set([...allowedDriverIds, ...passengerIds]);
  const driverMap = Object.fromEntries(manager.drivers.map((driver) => [driver.id, driver]));
  const users = workspace.profiles
    .filter((profile) => allowedUserIds.has(profile.id))
    .map((profile) => ({
      ...profile,
      userType: allowedDriverIds.has(profile.id) ? 'driver' : 'passenger',
      driver: driverMap[profile.id] || null,
    }))
    .sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || ''), 'pt-BR'));
  return {
    manager,
    drivers: manager.drivers,
    rides: scopedRides,
    users,
    allowedUserIds: [...allowedUserIds],
  };
}

export async function findProfileByEmail(admin, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) throw new Error('Informe um e-mail válido.');
  const result = await admin.from('profiles').select('*').eq('email', normalized).maybeSingle();
  const profile = throwOnError(result, 'Busca do usuário');
  if (!profile) throw new Error('Usuário não encontrado no cadastro. A conta deve ser criada primeiro no app.');
  return profile;
}

export async function configureManager(admin, { profileId, actorId, managerType, cityInput, driverIds }) {
  const targetId = ensureUuid(profileId, 'Usuário');
  const actor = ensureUuid(actorId, 'Administrador');
  const type = managerType === 'network' ? 'network' : managerType === 'city' ? 'city' : null;
  if (!type) throw new Error('Tipo de gerente inválido.');
  const cities = cleanCities(cityInput);
  const selectedDriverIds = uniqueIds(driverIds);
  if (type === 'city' && !cities.length) throw new Error('Informe pelo menos uma cidade para o gerente local.');

  const profile = throwOnError(await admin.from('profiles').select('id,role,full_name,email').eq('id', targetId).single(), 'Usuário');
  if (profile.role === 'admin') throw new Error('Administrador não pode ser convertido em gerente.');

  if (selectedDriverIds.length) {
    const validDrivers = throwOnError(await admin.from('drivers').select('id').in('id', selectedDriverIds), 'Validação dos motoristas');
    const validIds = new Set(validDrivers.map((driver) => driver.id));
    if (validIds.size !== selectedDriverIds.length) throw new Error('Um ou mais motoristas selecionados não existem mais.');
  }

  const current = throwOnError(await admin.from('managers').select('id,previous_role').eq('profile_id', targetId).maybeSingle(), 'Gerente atual');
  const driverExists = !!throwOnError(await admin.from('drivers').select('id').eq('id', targetId).maybeSingle(), 'Perfil de motorista');
  const previousRole = current?.previous_role || (driverExists ? 'driver' : profile.role === 'manager' ? 'passenger' : profile.role);
  const city = type === 'network' ? 'Toda a rede' : (cities[0]?.city || 'Cidade não informada');

  const manager = throwOnError(await admin.from('managers').upsert({
    profile_id: targetId,
    city,
    assigned_by: actor,
    manager_type: type,
    previous_role: previousRole,
    is_active: true,
  }, { onConflict: 'profile_id' }).select('id').single(), 'Gravação do gerente');

  throwOnError(await admin.from('profiles').update({ role: 'manager', updated_at: new Date().toISOString() }).eq('id', targetId), 'Atualização do perfil');
  throwOnError(await admin.from('manager_cities').delete().eq('manager_id', manager.id), 'Limpeza das cidades');
  throwOnError(await admin.from('manager_drivers').delete().eq('manager_id', manager.id), 'Limpeza dos vínculos');

  if (cities.length) {
    throwOnError(await admin.from('manager_cities').insert(cities.map((item) => ({ manager_id: manager.id, city: item.city, state: item.state }))), 'Gravação das cidades');
  }
  if (selectedDriverIds.length) {
    throwOnError(await admin.from('manager_drivers').insert(selectedDriverIds.map((driverId) => ({ manager_id: manager.id, driver_id: driverId, assigned_by: actor, is_active: true }))), 'Gravação dos motoristas');
  }
  throwOnError(await admin.from('manager_audit_log').insert({
    manager_id: manager.id,
    actor_id: actor,
    action: 'configure',
    details: { manager_type: type, cities: cities.map((item) => item.city), driver_ids: selectedDriverIds },
  }), 'Auditoria');
  return manager.id;
}

export async function setManagerActive(admin, { profileId, actorId, active }) {
  const targetId = ensureUuid(profileId, 'Gerente');
  const actor = ensureUuid(actorId, 'Administrador');
  const manager = throwOnError(await admin.from('managers').select('id').eq('profile_id', targetId).single(), 'Gerente');
  throwOnError(await admin.from('managers').update({ is_active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', manager.id), 'Status do gerente');
  throwOnError(await admin.from('manager_audit_log').insert({ manager_id: manager.id, actor_id: actor, action: active ? 'activate' : 'deactivate', details: {} }), 'Auditoria');
}

export async function removeManager(admin, { profileId, actorId }) {
  const targetId = ensureUuid(profileId, 'Gerente');
  const actor = ensureUuid(actorId, 'Administrador');
  const manager = throwOnError(await admin.from('managers').select('id,previous_role').eq('profile_id', targetId).single(), 'Gerente');
  const hasDriverProfile = !!throwOnError(await admin.from('drivers').select('id').eq('id', targetId).maybeSingle(), 'Perfil de motorista');
  const restoredRole = manager.previous_role === 'driver' && hasDriverProfile ? 'driver' : 'passenger';
  throwOnError(await admin.from('profiles').update({ role: restoredRole, updated_at: new Date().toISOString() }).eq('id', targetId), 'Restauração do perfil');
  throwOnError(await admin.from('manager_audit_log').insert({ manager_id: manager.id, actor_id: actor, action: 'remove', details: { previous_role: manager.previous_role, restored_role: restoredRole } }), 'Auditoria');
  throwOnError(await admin.from('managers').delete().eq('id', manager.id), 'Remoção do gerente');
}

export async function moveDriver(admin, { profileId, driverId, actorId }) {
  const managerProfileId = ensureUuid(profileId, 'Gerente');
  const targetDriverId = ensureUuid(driverId, 'Motorista');
  const actor = ensureUuid(actorId, 'Administrador');
  const manager = throwOnError(await admin.from('managers').select('id').eq('profile_id', managerProfileId).single(), 'Gerente');
  throwOnError(await admin.from('drivers').select('id').eq('id', targetDriverId).single(), 'Motorista');
  throwOnError(await admin.from('manager_drivers').update({ is_active: false }).eq('driver_id', targetDriverId).neq('manager_id', manager.id), 'Vínculos anteriores');
  throwOnError(await admin.from('manager_drivers').upsert({ manager_id: manager.id, driver_id: targetDriverId, assigned_by: actor, is_active: true }, { onConflict: 'manager_id,driver_id' }), 'Novo vínculo');
  throwOnError(await admin.from('manager_audit_log').insert({ manager_id: manager.id, actor_id: actor, action: 'move_driver', details: { driver_id: targetDriverId } }), 'Auditoria');
}

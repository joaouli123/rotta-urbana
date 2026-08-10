const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DRIVER_VEHICLE_TYPES = new Set(['sedan', 'hatch', 'suv', 'moto']);

const clean = (value) => String(value ?? '').trim();
const nullable = (value) => {
  const result = clean(value);
  return result || null;
};
const errorFrom = (result, label) => {
  if (result?.error) throw new Error(`${label}: ${result.error.message}`);
  return result?.data ?? null;
};

export const normalizeEmail = (value) => {
  const email = clean(value).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Informe um e-mail válido.');
  return email;
};

export const validatePassword = (value) => {
  const password = String(value ?? '');
  if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
  return password;
};

const profileFields = (input, current = {}) => {
  const supplied = (name) => Object.prototype.hasOwnProperty.call(input, name);
  const valueOrCurrent = (name) => supplied(name) ? nullable(input[name]) : (current[name] ?? null);
  const fullName = clean(input.full_name);
  if (!fullName) throw new Error('O nome completo é obrigatório.');
  const email = normalizeEmail(input.email);
  const gender = supplied('gender')
    ? (['female', 'male', 'other'].includes(clean(input.gender)) ? clean(input.gender) : null)
    : (current.gender || null);
  return {
    full_name: fullName,
    email,
    phone: valueOrCurrent('phone'),
    cpf: supplied('cpf') ? nullable(input.cpf)?.replace(/\D/g, '') || null : (current.cpf || null),
    gender,
    address_cep: valueOrCurrent('address_cep'),
    address_street: valueOrCurrent('address_street'),
    address_number: valueOrCurrent('address_number'),
    address_neighborhood: valueOrCurrent('address_neighborhood'),
    address_city: valueOrCurrent('address_city'),
    address_state: supplied('address_state') ? nullable(input.address_state)?.toUpperCase().slice(0, 2) || null : (current.address_state || null),
    address_complement: valueOrCurrent('address_complement'),
    ...(Object.prototype.hasOwnProperty.call(input, 'is_active') ? { is_active: input.is_active === '1' || input.is_active === true } : {}),
    updated_at: new Date().toISOString(),
    _previousEmail: current.email || null,
  };
};

export async function loadUserBundle(admin, userId) {
  const profile = errorFrom(await admin.from('profiles').select('*').eq('id', userId).maybeSingle(), 'Usuário');
  if (!profile) throw new Error('Usuário não encontrado.');
  const driver = errorFrom(await admin.from('drivers').select('*').eq('id', userId).maybeSingle(), 'Dados do motorista');
  const vehicle = driver
    ? errorFrom(await admin.from('vehicles').select('*').eq('driver_id', userId).eq('is_primary', true).maybeSingle(), 'Veículo')
    : null;
  return { profile, driver, vehicle };
}

export async function updateUserProfile(admin, userId, input) {
  const current = errorFrom(await admin.from('profiles').select('*').eq('id', userId).single(), 'Usuário');
  const next = profileFields(input, current);
  const { _previousEmail, ...profileUpdate } = next;

  errorFrom(await admin.from('profiles').update(profileUpdate).eq('id', userId), 'Atualização do perfil');
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: next.email,
    email_confirm: true,
    user_metadata: { full_name: next.full_name, phone: next.phone || '' },
  });
  if (authError) {
    await admin.from('profiles').update({ email: _previousEmail, updated_at: new Date().toISOString() }).eq('id', userId);
    throw new Error(`Atualização do acesso: ${authError.message}`);
  }
  return { ...current, ...profileUpdate };
}

export async function updateDriverProfile(admin, userId, input) {
  const bundle = await loadUserBundle(admin, userId);
  if (bundle.profile.role !== 'driver' || !bundle.driver) throw new Error('O usuário informado não é um motorista.');
  const supplied = (name) => Object.prototype.hasOwnProperty.call(input, name);
  const driverValueOrCurrent = (name) => supplied(name) ? nullable(input[name]) : (bundle.driver[name] ?? null);
  const driverUpdate = {
    pix_key: driverValueOrCurrent('pix_key'),
    operating_city: driverValueOrCurrent('operating_city'),
    operating_state: driverValueOrCurrent('operating_state')?.toUpperCase().slice(0, 2) || null,
    updated_at: new Date().toISOString(),
  };
  const currentVehicle = bundle.vehicle || {};
  const model = clean(input.vehicle_model || currentVehicle.model);
  const plate = clean(input.vehicle_plate || currentVehicle.plate);
  const year = Number(input.vehicle_year || currentVehicle.year || new Date().getFullYear());
  const color = clean(input.vehicle_color || currentVehicle.color);
  const type = DRIVER_VEHICLE_TYPES.has(clean(input.vehicle_type)) ? clean(input.vehicle_type) : (currentVehicle.type || 'sedan');
  if (!model || !plate || !color || !Number.isInteger(year) || year < 1980 || year > 2100) {
    throw new Error('Informe modelo, placa, ano válido e cor do veículo.');
  }
  const vehicleUpdate = {
    model,
    plate,
    year,
    color,
    type,
    is_primary: true,
    ...(Object.prototype.hasOwnProperty.call(input, 'vehicle_brand') ? { brand: nullable(input.vehicle_brand) } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'vehicle_fipe_value') ? { fipe_value: Number(input.vehicle_fipe_value) || null } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'vehicle_seats') ? { seats: Math.max(1, Math.min(9, Number(input.vehicle_seats) || 4)) } : {}),
    updated_at: new Date().toISOString(),
  };
  await updateUserProfile(admin, userId, input);
  errorFrom(await admin.from('drivers').update(driverUpdate).eq('id', userId), 'Atualização operacional');

  if (currentVehicle.id) {
    errorFrom(await admin.from('vehicles').update(vehicleUpdate).eq('id', currentVehicle.id), 'Atualização do veículo');
  } else {
    errorFrom(await admin.from('vehicles').insert({ driver_id: userId, ...vehicleUpdate }), 'Cadastro do veículo');
  }
  return loadUserBundle(admin, userId);
}

export async function resetUserPassword(admin, userId, newPassword) {
  const password = validatePassword(newPassword);
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(`Redefinição de senha: ${error.message}`);
}

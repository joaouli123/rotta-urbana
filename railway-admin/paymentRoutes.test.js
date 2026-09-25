import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { createPlanCardPayment, createPlanPassPreference, createPlanPixPayment, mercadopagoDateTime } from './mercadoPago.js';
import {
  amountFromSettings,
  applyAuthorizedPaymentWebhook,
  applyOneTimePlanPaymentWebhook,
  cardFormPage,
  closeAbandonedPasses,
  createPassCheckout,
  keptPreapprovalRenews,
  latestPendingPass,
  ledgerMethod,
  oneTimeStatus,
  parseOneTimeReference,
  payPassWithCard,
  paymentReturnPage,
  refreshDriverSubscription,
  planFromProvider,
  publicPass,
  publicPendingCheckout,
  reminderKind,
  reminderMessage,
  reviewPassIntents,
  reviewPendingCheckouts,
  syncPaymentForAdmin,
  syncSubscriptionForDriver,
} from './paymentRoutes.js';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

test('the recurring schedule decides the plan, not the fallback', () => {
  assert.equal(planFromProvider({ auto_recurring: { frequency: 1, frequency_type: 'days' } }), 'daily');
  assert.equal(planFromProvider({ auto_recurring: { frequency: '7', frequency_type: 'days' } }, 'monthly'), 'weekly');
  assert.equal(planFromProvider({ auto_recurring: { frequency: 1, frequency_type: 'months' } }, 'weekly'), 'monthly');
  assert.equal(planFromProvider({}, 'weekly'), 'weekly');
  assert.equal(planFromProvider(null, 'commission'), 'monthly');
});

test('the pending checkout exposes what the app needs and no provider ids', () => {
  assert.equal(publicPendingCheckout(null), null);
  assert.equal(publicPendingCheckout({ provider_metadata: { pending_checkout: { plan: 'monthly' } } }), null);

  const pending = publicPendingCheckout({
    provider_metadata: {
      pending_checkout: {
        preapproval_id: 'pre-123',
        plan: 'monthly',
        plan_segment: 'economy',
        amount: '350',
        init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre-123',
        created_at: '2026-09-24T10:00:00.000Z',
      },
    },
  });
  assert.deepEqual(pending, {
    plan: 'monthly',
    plan_segment: 'economy',
    amount: 350,
    init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre-123',
    created_at: '2026-09-24T10:00:00.000Z',
    provider_status: 'pending',
  });
  assert.equal('preapproval_id' in pending, false);
});

test('on Android the return page opens the app through an intent with a web fallback', () => {
  const html = paymentReturnPage({
    query: { flow: 'subscription', plan: 'monthly', status: 'authorized', preapproval_id: 'pre-123', unknown: 'x' },
    userAgent: ANDROID_UA,
    host: 'https://rottaurbana.com.br',
  });
  const intent = 'intent://pagamento/retorno?flow=subscription&plan=monthly&status=authorized&preapproval_id=pre-123'
    + '#Intent;scheme=rotta-urbana;package=com.rottaurbana.app;S.browser_fallback_url=';
  assert.ok(html.includes(`window.location.replace(${JSON.stringify(intent)}`.slice(0, -1)), 'redirect script uses the intent');
  assert.ok(html.includes(encodeURIComponent('https://rottaurbana.com.br/pagamento/retorno?flow=subscription')));
  assert.ok(html.includes(encodeURIComponent('noapp=1')));
  assert.ok(!html.includes('unknown'), 'only known return keys are forwarded');
  assert.ok(html.includes('Pagamento aprovado'));
});

test('on iOS the return page uses the app scheme the auth session waits for', () => {
  const html = paymentReturnPage({
    query: { flow: 'daily', collection_status: 'pending', payment_id: '987' },
    userAgent: IPHONE_UA,
    host: 'https://rottaurbana.com.br',
  });
  assert.ok(html.includes('"rotta-urbana://pagamento/retorno?flow=daily&collection_status=pending&payment_id=987"'));
  assert.ok(!html.includes('intent://'));
  assert.ok(html.includes('Pagamento em processamento'));
});

test('without the app the fallback page does not redirect again', () => {
  const html = paymentReturnPage({ query: { noapp: '1', status: 'approved' }, userAgent: ANDROID_UA, host: 'https://rottaurbana.com.br' });
  assert.ok(html.includes('Abra o Rotta Urbana'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('intent://'));
});

test('query values cannot inject markup into the return page', () => {
  const html = paymentReturnPage({
    query: { status: '"><script>alert(1)</script>', plan: "monthly'</a><img src=x onerror=alert(1)>" },
    userAgent: IPHONE_UA,
    host: 'https://rottaurbana.com.br',
  });
  assert.equal((html.match(/<script>/g) || []).length, 1, 'only the page redirect script');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('</script>alert'));
});

const DRIVER = '11111111-2222-3333-4444-555555555555';
const SUB = '99999999-8888-7777-6666-555555555555';
const INTENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('pass references are recognised, including duplicate-charge rows and the older daily format', () => {
  const reference = `ru_plan:weekly:${DRIVER}:${SUB}:${INTENT}`;
  assert.deepEqual(parseOneTimeReference(reference), { reference, plan: 'weekly', driverId: DRIVER });
  assert.deepEqual(parseOneTimeReference(`${reference}#123456`), { reference, plan: 'weekly', driverId: DRIVER });
  assert.deepEqual(parseOneTimeReference(`ru_daily:${DRIVER}:${SUB}:1`), {
    reference: `ru_daily:${DRIVER}:${SUB}:1`, plan: 'daily', driverId: DRIVER,
  });
  // Mensal is a subscription, never a pass; other shapes belong to other flows.
  assert.equal(parseOneTimeReference(`ru_plan:monthly:${DRIVER}:${SUB}:${INTENT}`), null);
  assert.equal(parseOneTimeReference(`ru_plan:daily:${DRIVER}:${SUB}`), null);
  assert.equal(parseOneTimeReference(DRIVER), null);
  assert.equal(parseOneTimeReference(null), null);
});

test('a pass payment status maps to the ledger without confusing an unused Pix with a declined card', () => {
  assert.equal(oneTimeStatus('approved'), 'approved');
  assert.equal(oneTimeStatus('ACCREDITED'), 'approved');
  assert.equal(oneTimeStatus('refunded'), 'refunded');
  assert.equal(oneTimeStatus('charged_back'), 'refunded');
  assert.equal(oneTimeStatus('rejected'), 'rejected');
  assert.equal(oneTimeStatus('cancelled'), 'cancelled');
  assert.equal(oneTimeStatus('expired'), 'cancelled');
  assert.equal(oneTimeStatus('in_process'), 'pending');
  assert.equal(oneTimeStatus(undefined), 'pending');
});

test('every Mercado Pago method fits the ledger enum', () => {
  assert.equal(ledgerMethod({ payment_method_id: 'pix', payment_type_id: 'bank_transfer' }), 'pix');
  assert.equal(ledgerMethod({ payment_method_id: 'master', payment_type_id: 'credit_card' }), 'card');
  assert.equal(ledgerMethod({ payment_method_id: 'debelo', payment_type_id: 'debit_card' }), 'card');
  assert.equal(ledgerMethod({ payment_method_id: 'account_money', payment_type_id: 'account_money' }), 'mercadopago');
  assert.equal(ledgerMethod({ payment_method_id: 'bolbradesco', payment_type_id: 'ticket' }), 'boleto');
  assert.equal(ledgerMethod({}), 'mercadopago');
  assert.equal(ledgerMethod(null), 'mercadopago');
});

test('the pass sent to the app carries only what it needs for each channel', () => {
  const base = { id: INTENT, amount: '12.5', expires_at: '2026-09-24T12:30:00.000Z', provider_payment_id: 'mp-1' };
  const pix = publicPass({
    ...base,
    pix_qr_code: '000201...',
    pix_qr_code_base64: 'iVBOR...',
    pix_ticket_url: 'https://mpago.la/x',
    provider_metadata: { channel: 'pix', plan: 'weekly', plan_segment: 'moto', init_point: 'https://ignored' },
  });
  assert.deepEqual(pix, {
    payment_id: INTENT,
    method: 'pix',
    plan: 'weekly',
    plan_segment: 'moto',
    amount: 12.5,
    expires_at: '2026-09-24T12:30:00.000Z',
    init_point: null,
    pix: { qr_code: '000201...', qr_code_base64: 'iVBOR...', ticket_url: 'https://mpago.la/x', expires_at: '2026-09-24T12:30:00.000Z' },
  });
  assert.equal(JSON.stringify(pix).includes('mp-1'), false, 'no provider payment id');

  const checkout = publicPass({ ...base, provider_metadata: { channel: 'checkout', plan: 'daily', init_point: 'https://mp/checkout' } });
  assert.equal(checkout.method, 'checkout');
  assert.equal(checkout.init_point, 'https://mp/checkout');
  assert.equal(checkout.pix, null);
  // Older intents have no channel: they were Checkout Pro links.
  assert.equal(publicPass({ ...base, provider_metadata: {} }).method, 'checkout');
  assert.equal(publicPass(null), null);
});

test('plan prices follow the category and never fall back to another plan', () => {
  const settings = {
    moto_daily_price: 5, moto_weekly_price: 25, moto_monthly_price: 90,
    car_economy_monthly_price: 350, car_comfort_monthly_price: 400, car_premium_monthly_price: 450,
    subscription_daily_amount: 15, plan_weekly_price: 80, subscription_monthly_amount: 300,
  };
  assert.equal(amountFromSettings(settings, 'daily', 'moto'), 5);
  assert.equal(amountFromSettings(settings, 'weekly', 'moto'), 25);
  assert.equal(amountFromSettings(settings, 'monthly', 'premium'), 450);
  assert.equal(amountFromSettings(settings, 'daily', 'economy'), 15);
  assert.equal(amountFromSettings(settings, 'weekly', 'comfort'), 80);
  assert.equal(amountFromSettings({ subscription_monthly_amount: 300 }, 'weekly', 'economy'), 0);
});

test('renewal reminders follow the plan cut-off at 21:00 in Brasília', () => {
  const due = '2026-09-24';
  const at = (iso) => Date.parse(iso);
  // Cut-off: 2026-09-25T00:00Z.
  assert.equal(reminderKind({ plan: 'weekly', status: 'active', dueDate: due, now: at('2026-09-23T20:00:00Z') }), null);
  assert.equal(reminderKind({ plan: 'weekly', status: 'active', dueDate: due, now: at('2026-09-24T01:00:00Z') }), 'h24');
  assert.equal(reminderKind({ plan: 'daily', status: 'active', dueDate: due, now: at('2026-09-24T01:00:00Z') }), null);
  assert.equal(reminderKind({ plan: 'daily', status: 'active', dueDate: due, now: at('2026-09-24T21:30:00Z') }), 'h3');
  assert.equal(reminderKind({ plan: 'weekly', status: 'active', dueDate: due, now: at('2026-09-25T00:00:00Z') }), 'expired');
  assert.equal(reminderKind({ plan: 'weekly', status: 'expired', dueDate: '2026-09-30', now: at('2026-09-24T12:00:00Z') }), 'expired');
  assert.equal(reminderKind({ plan: 'weekly', status: 'expired', dueDate: due, now: at('2026-09-27T00:00:00Z') }), null);
  assert.equal(reminderKind({ plan: 'weekly', status: 'active', dueDate: null, now: at('2026-09-24T12:00:00Z') }), null);
});

test('reminder copy names the plan and points passes to Pix', () => {
  assert.match(reminderMessage('h3', 'daily').body, /plano Diário.*Pix/);
  assert.match(reminderMessage('expired', 'weekly').title, /venceu/);
  assert.doesNotMatch(reminderMessage('expired', 'monthly').body, /Pix/);
  assert.match(reminderMessage('h24', 'weekly').body, /24 horas/);
});

test('Mercado Pago dates are sent in Brasília time', () => {
  assert.equal(mercadopagoDateTime('2026-09-24T15:00:00.000Z'), '2026-09-24T12:00:00.000-03:00');
  assert.equal(mercadopagoDateTime('2026-09-24T01:30:00.000Z'), '2026-09-23T22:30:00.000-03:00');
  assert.throws(() => mercadopagoDateTime('not a date'));
});

async function captureMercadoPagoRequest(call) {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const calls = [];
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-0000000000000000000000000000';
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: 'x' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await call();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = previousToken;
  }
  assert.equal(calls.length, 1);
  return calls[0];
}

test('the in-app Pix charge expires, is idempotent and identifies the payer', async () => {
  const request = await captureMercadoPagoRequest(() => createPlanPixPayment({
    plan: 'weekly',
    amount: 12.499,
    externalReference: `ru_plan:weekly:${DRIVER}:${SUB}:${INTENT}`,
    notificationUrl: 'https://rottaurbana.com.br/api/payments/webhook',
    payer: { email: ' Motorista@Example.com ', name: 'Ana Maria Souza', cpf: '123.456.789-09' },
    expiresAt: '2026-09-24T15:30:00.000Z',
    idempotencyKey: `plan-pix:${INTENT}`,
  }));
  assert.equal(request.url, 'https://api.mercadopago.com/v1/payments');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['X-Idempotency-Key'], `plan-pix:${INTENT}`);
  assert.equal(request.body.payment_method_id, 'pix');
  assert.equal(request.body.transaction_amount, 12.5);
  assert.equal(request.body.date_of_expiration, '2026-09-24T12:30:00.000-03:00');
  assert.deepEqual(request.body.payer, {
    email: 'motorista@example.com',
    first_name: 'Ana',
    last_name: 'Maria Souza',
    identification: { type: 'CPF', number: '12345678909' },
  });
});

test('the card checkout is a single payment with no boleto and a link that expires', async () => {
  const request = await captureMercadoPagoRequest(() => createPlanPassPreference({
    plan: 'daily',
    driverId: DRIVER,
    amount: 5,
    externalReference: `ru_plan:daily:${DRIVER}:${SUB}:${INTENT}`,
    notificationUrl: 'https://rottaurbana.com.br/api/payments/webhook',
    backUrls: { success: 'https://x/s', pending: 'https://x/p', failure: 'https://x/f' },
    idempotencyKey: `plan-pass:${INTENT}`,
    expiresAt: '2026-09-24T16:00:00.000Z',
  }));
  assert.equal(request.url, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(request.init.headers['X-Idempotency-Key'], `plan-pass:${INTENT}`);
  assert.equal(request.body.items[0].unit_price, 5);
  assert.equal(request.body.items[0].quantity, 1);
  assert.deepEqual(request.body.payment_methods.excluded_payment_types, [{ id: 'ticket' }, { id: 'atm' }]);
  assert.equal(request.body.payment_methods.installments, 1);
  assert.equal(request.body.expires, true);
  assert.equal(request.body.expiration_date_to, '2026-09-24T13:00:00.000-03:00');
  assert.equal('payer' in request.body, false);
});

// ─── Pass flows against an in-memory database and a fake Mercado Pago ──────

// The Supabase calls the plan flows make, over plain arrays.
function fakeAdmin({ payments = [], subscriptions = [], rpc = {} } = {}) {
  const tables = { payments, subscriptions };
  const rpcCalls = [];
  const valueOf = (row, column) => {
    const [base, ...keys] = column.split(/->>?/);
    const value = keys.reduce((node, key) => node?.[key], row[base]);
    return value === undefined ? null : value;
  };
  const same = (a, b) => a !== null && b !== null && String(a) === String(b);
  const query = (table) => {
    const rows = (tables[table] ||= []);
    const filters = [];
    let op = 'select';
    let values = null;
    let limit = Infinity;
    let order = null;
    let onConflict = null;
    const fresh = () => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...structuredClone(values) });
    const run = async (mode) => {
      let data;
      if (op === 'insert') {
        const row = fresh();
        rows.push(row);
        data = [row];
      } else if (op === 'upsert') {
        let row = rows.find((item) => same(item[onConflict], values[onConflict]));
        if (row) Object.assign(row, structuredClone(values));
        else rows.push(row = fresh());
        data = [row];
      } else {
        data = rows.filter((row) => filters.every((keep) => keep(row)));
        if (order) {
          const { column, ascending } = order;
          data.sort((a, b) => (String(valueOf(a, column)) < String(valueOf(b, column)) ? -1 : 1) * (ascending ? 1 : -1));
        }
        data = data.slice(0, limit);
        if (op === 'update') for (const row of data) Object.assign(row, structuredClone(values));
      }
      data = data.map((row) => structuredClone(row));
      if (mode === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: new Error('one row expected') };
      if (mode === 'maybe') return data.length > 1 ? { data: null, error: new Error('several rows') } : { data: data[0] ?? null, error: null };
      return { data, error: null };
    };
    const compare = (test) => (column, value) => {
      filters.push((row) => valueOf(row, column) !== null && test(String(valueOf(row, column)), String(value)));
      return builder;
    };
    const builder = {
      select: () => builder,
      eq: (column, value) => { filters.push((row) => same(valueOf(row, column), value)); return builder; },
      neq: (column, value) => { filters.push((row) => !same(valueOf(row, column), value)); return builder; },
      in: (column, list) => { filters.push((row) => list.some((value) => same(valueOf(row, column), value))); return builder; },
      gt: compare((a, b) => a > b),
      gte: compare((a, b) => a >= b),
      lt: compare((a, b) => a < b),
      not: (column, operator, value) => {
        if (operator === 'is' && value === null) filters.push((row) => valueOf(row, column) !== null);
        return builder;
      },
      order: (column, { ascending = true } = {}) => { order = { column, ascending }; return builder; },
      limit: (count) => { limit = count; return builder; },
      update: (next) => { op = 'update'; values = next; return builder; },
      insert: (next) => { op = 'insert'; values = next; return builder; },
      upsert: (next, options = {}) => { op = 'upsert'; values = next; onConflict = options.onConflict; return builder; },
      maybeSingle: () => run('maybe'),
      single: () => run('single'),
      then: (resolve, reject) => run('many').then(resolve, reject),
    };
    return builder;
  };
  return {
    tables,
    rpcCalls,
    from: query,
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (!rpc[name]) return { data: null, error: new Error(`unexpected rpc ${name}`) };
      return { data: await rpc[name](args, tables), error: null };
    },
  };
}

// What apply_one_time_plan_payment does, enough for these flows.
function applyPassRpc({ p_payment_id: id, p_provider_payment_id: providerId, p_status: status }, tables) {
  const intent = tables.payments.find((row) => row.id === id);
  if (['approved', 'refunded'].includes(intent.status)) return 'unchanged';
  intent.provider_payment_id = providerId || intent.provider_payment_id;
  if (status !== 'approved') {
    intent.status = status;
    return 'updated';
  }
  intent.status = 'approved';
  Object.assign(tables.subscriptions.find((row) => row.driver_id === intent.driver_id), {
    plan: intent.provider_metadata.plan,
    plan_segment: intent.provider_metadata.plan_segment,
    status: 'active',
    provider_status: 'one_time_approved',
    due_date: '2099-01-01',
  });
  return 'credited';
}

// Routes are "METHOD /path"; a handler returns [httpStatus, json].
async function withMercadoPago(routes, call) {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const calls = [];
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-0000000000000000000000000000';
  globalThis.fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method || 'GET';
    const request = { method, path: pathname, searchParams, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(request);
    const handler = routes[`${method} ${pathname}`];
    const [status, payload] = handler ? await handler(request) : [404, { message: 'not_found' }];
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const quiet = { warn: console.warn, error: console.error, log: console.log };
  console.warn = console.error = console.log = () => {};
  try {
    return await call(calls);
  } finally {
    Object.assign(console, quiet);
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = previousToken;
  }
}

let driverSeq = 0;
// A new driver per test: the reconcile on each app request is throttled per driver.
function passFixture({ intents = [] } = {}) {
  driverSeq += 1;
  const driverId = `00000000-0000-4000-8000-${String(driverSeq).padStart(12, '0')}`;
  const subId = `10000000-0000-4000-8000-${String(driverSeq).padStart(12, '0')}`;
  const local = {
    id: subId, driver_id: driverId, plan: 'commission', plan_segment: 'economy', status: 'expired',
    due_date: '2026-01-01', provider: 'mercadopago', provider_status: null, provider_subscription_id: null, provider_metadata: {},
  };
  const now = Date.now();
  const rows = intents.map((intent, index) => {
    const id = intent.id || crypto.randomUUID();
    return {
      id,
      driver_id: driverId,
      subscription_id: subId,
      amount: 25,
      status: 'pending',
      provider: 'mercadopago',
      provider_payment_id: null,
      external_reference: `ru_plan:daily:${driverId}:${subId}:${id}`,
      created_at: new Date(now - (index + 1) * 60e3).toISOString(),
      expires_at: new Date(now + 20 * 60e3).toISOString(),
      ...intent,
      provider_metadata: { billing_model: 'one_time_pass', plan: 'daily', plan_segment: 'economy', ...intent.provider_metadata },
    };
  });
  const admin = fakeAdmin({ payments: rows, subscriptions: [local], rpc: { apply_one_time_plan_payment: applyPassRpc } });
  const checkout = (options) => createPassCheckout(admin, {
    plan: 'daily', segment: 'economy', amount: 25, local: structuredClone(local), driver: { id: driverId },
    email: 'motorista@example.com', name: 'Ana Souza', cpf: '', host: 'https://rotta.test',
    returnUrl: 'https://rotta.test/pagamento/retorno', method: 'pix', extend: false, replaces: null, ...options,
  });
  return { admin, driverId, rows, checkout };
}

const pixIntent = (extra = {}) => ({
  method: 'pix', provider_payment_id: 'mp-pix-1', pix_qr_code: '000201-pix', ...extra, provider_metadata: { channel: 'pix' },
});
const cardIntent = (extra = {}) => ({
  method: 'mercadopago', ...extra, provider_metadata: { channel: 'checkout', init_point: 'https://mp.test/pref-0' },
});
const mpPayment = (id, status, reference, extra = {}) => ({
  id, status, external_reference: reference, transaction_amount: 25, payment_method_id: 'pix', payment_type_id: 'bank_transfer', ...extra,
});
const cardPayment = (id, status, reference) => mpPayment(id, status, reference, { payment_method_id: 'master', payment_type_id: 'credit_card' });

test('choosing card cancels the Pix shown before and opens Checkout Pro', async () => {
  const { rows, checkout } = passFixture({ intents: [pixIntent()] });
  const result = await withMercadoPago({
    'GET /v1/payments/mp-pix-1': () => [200, mpPayment('mp-pix-1', 'pending', rows[0].external_reference)],
    'PUT /v1/payments/mp-pix-1': () => [200, { id: 'mp-pix-1', status: 'cancelled' }],
    'POST /checkout/preferences': () => [201, { id: 'pref-1', init_point: 'https://mp.test/pref-1' }],
  }, () => checkout({ method: 'checkout' }));
  assert.equal(rows[0].status, 'cancelled');
  assert.equal(rows[0].provider_status, 'superseded');
  assert.equal(result.method, 'checkout');
  assert.equal(result.init_point, 'https://mp.test/pref-1');
});

test('a Pix paid while the driver switches to card is reported, not charged again', async () => {
  const { rows, checkout } = passFixture({ intents: [pixIntent()] });
  let reads = 0;
  const result = await withMercadoPago({
    // Still pending on the first look, paid by the time it is cancelled.
    'GET /v1/payments/mp-pix-1': () => [200, mpPayment('mp-pix-1', (reads += 1) === 1 ? 'pending' : 'approved', rows[0].external_reference)],
    'PUT /v1/payments/mp-pix-1': () => [400, { message: 'Payment already approved' }],
  }, async (calls) => {
    const response = await checkout({ method: 'checkout' });
    assert.equal(calls.some((call) => call.path === '/checkout/preferences'), false, 'no card checkout created');
    return response;
  });
  assert.equal(result.already_active, true);
  assert.equal(result.subscription.plan, 'daily');
  assert.equal(rows[0].status, 'approved');
});

test('a Pix that cannot be cancelled and is not paid blocks a second checkout', async () => {
  const { rows, checkout } = passFixture({ intents: [pixIntent()] });
  await withMercadoPago({
    'GET /v1/payments/mp-pix-1': () => [200, mpPayment('mp-pix-1', 'pending', rows[0].external_reference)],
    'PUT /v1/payments/mp-pix-1': () => [502, { message: 'bad gateway' }],
  }, (calls) => assert.rejects(checkout({ method: 'checkout' }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(calls.some((call) => call.path === '/checkout/preferences'), false);
    return true;
  }));
  assert.equal(rows[0].status, 'pending');
});

test('switching back to Pix reports a card checkout paid in the meantime', async () => {
  const cardId = crypto.randomUUID();
  const { rows, checkout } = passFixture({ intents: [cardIntent({ id: cardId })] });
  let searches = 0;
  const result = await withMercadoPago({
    'GET /v1/payments/search': ({ searchParams }) => {
      assert.equal(searchParams.get('external_reference'), rows[0].external_reference);
      searches += 1;
      return [200, { results: searches === 1 ? [] : [cardPayment('mp-card-1', 'approved', rows[0].external_reference)] }];
    },
  }, async (calls) => {
    const response = await checkout({ method: 'pix', replaces: cardId });
    assert.equal(calls.some((call) => call.method === 'POST'), false, 'no Pix created');
    return response;
  });
  assert.equal(searches, 2);
  assert.equal(result.already_active, true);
  assert.equal(rows[0].status, 'approved');
});

test('a card link with a payment under way is shown as under review, and paid again only when asked', async () => {
  const { admin, driverId, rows, checkout } = passFixture({
    intents: [
      cardIntent({ provider_payment_id: 'mp-boleto-1' }),
      pixIntent({ expires_at: new Date(Date.now() - 60e3).toISOString() }),
    ],
  });
  const shown = await latestPendingPass(admin, driverId);
  assert.equal(shown.payment_id, rows[0].id);
  assert.equal(shown.processing, true);
  assert.equal(shown.init_point, 'https://mp.test/pref-0');

  const routes = {
    'GET /v1/payments/search': () => [200, { results: [cardPayment('mp-boleto-1', 'in_process', rows[0].external_reference)] }],
    'GET /v1/payments/mp-pix-1': () => [200, mpPayment('mp-pix-1', 'pending', rows[1].external_reference)],
    'PUT /v1/payments/mp-pix-1': () => [200, { id: 'mp-pix-1', status: 'cancelled' }],
    'POST /checkout/preferences': () => [201, { id: 'pref-2', init_point: 'https://mp.test/pref-2' }],
  };
  // Any plan, any method: the driver is asked before a second charge.
  for (const options of [{ method: 'checkout' }, { method: 'pix' }, { method: 'pix', plan: 'weekly', amount: 120 }]) {
    await withMercadoPago(routes, (calls) => assert.rejects(checkout(options), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'payment_processing');
      assert.equal(calls.some((call) => call.method === 'POST'), false, 'nothing created');
      return true;
    }));
  }

  const result = await withMercadoPago(routes, () => checkout({ method: 'checkout', allowProcessing: true }));
  assert.equal(result.init_point, 'https://mp.test/pref-2');
  assert.notEqual(result.reused, true);
  assert.equal(rows[0].status, 'pending', 'the payment under way still counts when it clears');
});

test('a payment under review that was approved meanwhile is reported, not charged again', async () => {
  const { rows, checkout } = passFixture({ intents: [cardIntent({ provider_payment_id: 'mp-card-9' })] });
  const result = await withMercadoPago({
    'GET /v1/payments/search': () => [200, { results: [cardPayment('mp-card-9', 'approved', rows[0].external_reference)] }],
  }, async (calls) => {
    const response = await checkout({ method: 'pix' });
    assert.equal(calls.some((call) => call.method === 'POST'), false, 'no Pix created');
    return response;
  });
  assert.equal(result.already_active, true);
  assert.equal(rows[0].status, 'approved');
});

test('a payment Mercado Pago no longer has under way does not block a new one', async () => {
  // The webhook that closed it never came: the search shows it was rejected.
  const { rows, checkout } = passFixture({ intents: [cardIntent({ provider_payment_id: 'mp-card-8' })] });
  const result = await withMercadoPago({
    'GET /v1/payments/search': () => [200, { results: [cardPayment('mp-card-8', 'rejected', rows[0].external_reference)] }],
    'POST /v1/payments': ({ body }) => [201, {
      id: 'mp-pix-2', status: 'pending', date_of_expiration: body.date_of_expiration,
      point_of_interaction: { transaction_data: { qr_code: '000201-two', qr_code_base64: null } },
    }],
  }, () => checkout({ method: 'pix' }));
  assert.equal(result.method, 'pix');
  assert.equal(result.pix.qr_code, '000201-two');
});

test('a payment under review older than the window is not shown or asked about', async () => {
  const old = new Date(Date.now() - 5 * 24 * 3600e3).toISOString();
  const { admin, driverId } = passFixture({ intents: [cardIntent({ provider_payment_id: 'mp-card-7', created_at: old })] });
  assert.equal(await latestPendingPass(admin, driverId), null);
});

test('the in-app Pix is created with room above the 30-minute minimum', async () => {
  const { checkout } = passFixture();
  let sentExpiry = null;
  const startedAt = Date.now();
  const result = await withMercadoPago({
    'POST /v1/payments': ({ body }) => {
      sentExpiry = body.date_of_expiration;
      return [201, {
        id: 'mp-pix-new', status: 'pending', date_of_expiration: body.date_of_expiration,
        point_of_interaction: { transaction_data: { qr_code: '000201-new', qr_code_base64: 'iVBOR' } },
      }];
    },
  }, () => checkout({ method: 'pix' }));
  assert.equal(result.method, 'pix');
  assert.equal(result.pix.qr_code, '000201-new');
  const minutes = (Date.parse(sentExpiry) - startedAt) / 60e3;
  assert.ok(minutes >= 35 && minutes <= 45, `expires in ${minutes} min`);
});

test('the admin sync finds a card checkout by its reference and credits it', async () => {
  const cardId = crypto.randomUUID();
  const { admin, rows } = passFixture({ intents: [cardIntent({ id: cardId })] });
  const result = await withMercadoPago({
    'GET /v1/payments/search': ({ searchParams }) => {
      assert.equal(searchParams.get('external_reference'), rows[0].external_reference);
      return [200, { results: [cardPayment('mp-card-9', 'approved', rows[0].external_reference)] }];
    },
  }, () => syncPaymentForAdmin(admin, cardId));
  assert.equal(result.paymentStatus, 'approved');
  assert.equal(rows[0].status, 'approved');
  assert.equal(admin.rpcCalls.some((call) => call.name === 'confirm_payment'), false);
});

test('a charge from a subscription the driver already left is refunded once', async () => {
  const { admin, driverId } = passFixture();
  Object.assign(admin.tables.subscriptions[0], {
    plan: 'daily', status: 'active', provider_status: 'one_time_approved',
    provider_metadata: { replaced_preapproval_ids: ['pre-old'] },
  });
  let refunded = false;
  const notification = {
    id: 'ap-1', preapproval_id: 'pre-old', external_reference: driverId, transaction_amount: 350,
    status: 'processed', payment: { id: 'mp-rec-1', status: 'approved' },
  };
  await withMercadoPago({
    'GET /preapproval/pre-old': () => [200, { id: 'pre-old', status: refunded ? 'cancelled' : 'authorized', external_reference: driverId }],
    'PUT /preapproval/pre-old': () => [200, { id: 'pre-old', status: 'cancelled' }],
    'GET /v1/payments/mp-rec-1': () => [200, { id: 'mp-rec-1', status: refunded ? 'refunded' : 'approved', payment_method_id: 'master', payment_type_id: 'credit_card' }],
    'POST /v1/payments/mp-rec-1/refunds': () => { refunded = true; return [201, { id: 'ref-1' }]; },
  }, async (calls) => {
    const first = await applyAuthorizedPaymentWebhook(admin, notification);
    assert.equal(first.paymentStatus, 'refunded');
    const refunds = () => calls.filter((call) => call.path.endsWith('/refunds'));
    assert.equal(refunds().length, 1);
    assert.equal(refunds()[0].headers['X-Idempotency-Key'], 'retired-mp-rec-1');
    // Mercado Pago repeats the notification: nothing is refunded twice.
    await applyAuthorizedPaymentWebhook(admin, notification);
    assert.equal(refunds().length, 1);
  });
  const ledger = admin.tables.payments.filter((row) => row.provider_authorized_payment_id === 'ap-1');
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, 'refunded');
  assert.equal(ledger[0].provider_metadata.uncredited_reason, 'retired_subscription');
  assert.equal(admin.tables.subscriptions[0].plan, 'daily', 'the pass the driver bought is kept');
  assert.equal(admin.rpcCalls.length, 0, 'no days credited');
});

test('a failed refund is retried on the next notification', async () => {
  const { admin, driverId } = passFixture();
  Object.assign(admin.tables.subscriptions[0], { provider_metadata: { replaced_preapproval_ids: ['pre-gone'] } });
  let attempts = 0;
  const notification = {
    id: 'ap-2', preapproval_id: 'pre-gone', external_reference: driverId, transaction_amount: 350,
    status: 'processed', payment: { id: 'mp-rec-2', status: 'approved', payment_method_id: 'visa', payment_type_id: 'credit_card' },
  };
  await withMercadoPago({
    'GET /preapproval/pre-gone': () => [200, { id: 'pre-gone', status: 'cancelled', external_reference: driverId }],
    'GET /v1/payments/mp-rec-2': () => [200, { id: 'mp-rec-2', status: 'approved' }],
    'POST /v1/payments/mp-rec-2/refunds': () => ((attempts += 1) === 1 ? [500, { message: 'internal_error' }] : [201, { id: 'ref-2' }]),
  }, async () => {
    await assert.rejects(applyAuthorizedPaymentWebhook(admin, notification));
    const row = admin.tables.payments.find((item) => item.provider_authorized_payment_id === 'ap-2');
    assert.equal(row.status, 'approved');
    assert.match(row.provider_metadata.refund_failed, /internal_error/);
    const second = await applyAuthorizedPaymentWebhook(admin, notification);
    assert.equal(second.paymentStatus, 'refunded');
  });
  const row = admin.tables.payments.find((item) => item.provider_authorized_payment_id === 'ap-2');
  assert.equal(attempts, 2);
  assert.equal(row.status, 'refunded');
  assert.equal(row.provider_metadata.refund_failed, null);
});

test('a monthly checkout paid without a webhook is activated by the maintenance', async () => {
  const { admin, driverId } = passFixture();
  const day = 24 * 3600e3;
  const pending = (id, age) => ({
    preapproval_id: id, plan: 'monthly', plan_segment: 'economy', amount: 350,
    init_point: `https://mp.test/${id}`, created_at: new Date(Date.now() - age).toISOString(), provider_status: 'pending',
  });
  Object.assign(admin.tables.subscriptions[0], { provider_metadata: { pending_checkout: pending('pre-paid', 3600e3) } });
  const second = {
    id: '20000000-0000-4000-8000-000000000001', driver_id: '00000000-0000-4000-8000-00000000ffff', plan: 'commission',
    plan_segment: 'economy', status: 'active', due_date: '2036-01-01', provider_status: null, provider_subscription_id: null,
    provider_metadata: { pending_checkout: pending('pre-gone', 3600e3) },
  };
  const abandoned = { ...structuredClone(second), id: '20000000-0000-4000-8000-000000000002', driver_id: '00000000-0000-4000-8000-00000000fffe',
    provider_metadata: { pending_checkout: pending('pre-old', 5 * day) } };
  admin.tables.subscriptions.push(second, abandoned);
  const lookups = [];
  await withMercadoPago({
    'GET /preapproval/pre-paid': () => {
      lookups.push('pre-paid');
      return [200, {
        id: 'pre-paid', status: 'authorized', external_reference: driverId, reason: 'Rotta Urbana - Mensal',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 350 },
        next_payment_date: new Date(Date.now() + 30 * day).toISOString(),
      }];
    },
    'GET /preapproval/pre-gone': () => { lookups.push('pre-gone'); return [404, { message: 'not_found' }]; },
    'GET /preapproval/pre-old': () => { lookups.push('pre-old'); return [200, { id: 'pre-old', status: 'pending' }]; },
    'GET /v1/payments/search': emptySearch,
  }, () => reviewPendingCheckouts(admin));
  const [paid, gone, old] = admin.tables.subscriptions;
  assert.equal(paid.provider_subscription_id, 'pre-paid');
  assert.equal(paid.plan, 'monthly');
  assert.equal(paid.status, 'active');
  assert.equal(paid.provider_metadata.pending_checkout, undefined);
  assert.equal(gone.provider_metadata.pending_checkout, undefined, 'a checkout Mercado Pago no longer has is dropped');
  assert.equal(gone.plan, 'commission');
  assert.ok(old.provider_metadata.pending_checkout, 'an abandoned checkout is left alone');
  assert.deepEqual(lookups.sort(), ['pre-gone', 'pre-paid']);
});

test('an admin override keeps its dates but notes a card subscription that was cancelled', async () => {
  const { admin, driverId } = passFixture();
  Object.assign(admin.tables.subscriptions[0], {
    plan: 'monthly', status: 'active', due_date: '2036-01-01', provider_status: 'manual_admin',
    provider_subscription_id: 'pre-kept', provider_cancelled_at: null,
  });
  let status = 'authorized';
  await withMercadoPago({
    'GET /preapproval/pre-kept': () => [200, { id: 'pre-kept', status, external_reference: driverId }],
    'GET /v1/payments/search': emptySearch,
  }, async () => {
    await refreshDriverSubscription(admin, driverId);
    assert.equal(admin.tables.subscriptions[0].provider_cancelled_at, null);
    status = 'cancelled';
    await refreshDriverSubscription(admin, driverId);
  });
  const row = admin.tables.subscriptions[0];
  assert.ok(row.provider_cancelled_at, 'no longer renews by itself');
  assert.equal(row.provider_status, 'manual_admin');
  assert.equal(row.due_date, '2036-01-01');
  assert.equal(row.status, 'active');
});

test('an admin override renews by itself only while its card subscription is authorized', async () => {
  const kept = (status, extra = {}) => ({
    provider_status: 'manual_admin', provider_cancelled_at: null, provider_metadata: status ? { status } : {}, ...extra,
  });
  assert.equal(keptPreapprovalRenews(kept('authorized')), true);
  assert.equal(keptPreapprovalRenews(kept(null)), true, 'rows without the status count as before');
  assert.equal(keptPreapprovalRenews(kept('pending')), false, 'a checkout never paid charges nothing');
  assert.equal(keptPreapprovalRenews(kept('paused')), false);
  assert.equal(keptPreapprovalRenews(kept('authorized', { provider_cancelled_at: '2026-09-01T00:00:00Z' })), false);
  assert.equal(keptPreapprovalRenews({ ...kept('authorized'), provider_status: 'authorized' }), false);

  // The admin activated a driver whose monthly checkout was never paid; paying
  // it later is noted without touching the admin's dates.
  const { admin, driverId } = passFixture();
  Object.assign(admin.tables.subscriptions[0], {
    plan: 'monthly', status: 'active', due_date: '2036-01-01', provider_status: 'manual_admin',
    provider_subscription_id: 'pre-unpaid', provider_cancelled_at: null, provider_metadata: { status: 'pending' },
  });
  let status = 'pending';
  await withMercadoPago({
    'GET /preapproval/pre-unpaid': () => [200, { id: 'pre-unpaid', status, external_reference: driverId }],
    'GET /v1/payments/search': emptySearch,
  }, async () => {
    await refreshDriverSubscription(admin, driverId);
    assert.equal(keptPreapprovalRenews(admin.tables.subscriptions[0]), false);
    status = 'authorized';
    await refreshDriverSubscription(admin, driverId);
  });
  const row = admin.tables.subscriptions[0];
  assert.equal(row.provider_metadata.status, 'authorized');
  assert.equal(keptPreapprovalRenews(row), true);
  assert.equal(row.provider_status, 'manual_admin');
  assert.equal(row.due_date, '2036-01-01');
});

test('a plan read that lands during a Mercado Pago lookup waits for it', async () => {
  const { admin, driverId, rows } = passFixture({ intents: [pixIntent()] });
  let lookups = 0;
  let release;
  const paid = new Promise((resolve) => { release = resolve; });
  const [first, second] = await withMercadoPago({
    'GET /v1/payments/mp-pix-1': async () => {
      lookups += 1;
      await paid;
      return [200, mpPayment('mp-pix-1', 'approved', rows[0].external_reference)];
    },
  }, () => {
    const reads = [syncSubscriptionForDriver(admin, driverId), syncSubscriptionForDriver(admin, driverId)];
    setTimeout(release, 20);
    return Promise.all(reads);
  });
  assert.equal(lookups, 1, 'one lookup round for both reads');
  assert.equal(first.plan, 'daily');
  assert.equal(second.plan, 'daily', 'the second read does not answer with the plan from before the payment');
});


// ─── Card typed in the app (Card Payment Brick) ────────────────────────────

const PUBLIC_KEY = 'TEST-00000000-0000-0000-0000-000000000000';

async function withCardForm(call, key = PUBLIC_KEY) {
  const previous = process.env.MERCADOPAGO_PUBLIC_KEY;
  if (key === null) delete process.env.MERCADOPAGO_PUBLIC_KEY;
  else process.env.MERCADOPAGO_PUBLIC_KEY = key;
  try {
    return await call();
  } finally {
    if (previous === undefined) delete process.env.MERCADOPAGO_PUBLIC_KEY;
    else process.env.MERCADOPAGO_PUBLIC_KEY = previous;
  }
}

const idleCard = (extra = {}) => ({ method: 'card', ...extra, provider_metadata: { channel: 'card', ...extra.provider_metadata } });

function cardPay(fixture, rowIndex, options = {}) {
  return payPassWithCard(fixture.admin, {
    driver: { id: fixture.driverId },
    profile: { email: 'perfil@example.com', full_name: 'Ana Maria Souza' },
    user: { email: 'login@example.com' },
    paymentId: fixture.rows[rowIndex]?.id || options.paymentId,
    token: options.token || 'tok0123456789abcdef0123456789ab',
    paymentMethodId: 'master',
    issuerId: '24',
    payerEmail: 'brick@example.com',
    identification: { type: 'CPF', number: '12345678909' },
    deviceId: 'armor.abc123',
    host: 'https://rotta.test',
    ...options,
  });
}

const emptySearch = () => [200, { results: [] }];

test('the card charge sends the token once, in one installment, with the device and payer', async () => {
  const request = await captureMercadoPagoRequest(() => createPlanCardPayment({
    plan: 'weekly',
    amount: 119.999,
    externalReference: `ru_plan:weekly:${DRIVER}:${SUB}:${INTENT}`,
    notificationUrl: 'https://rotta.test/api/mercadopago/webhook',
    token: 'card-token-123',
    paymentMethodId: 'visa',
    issuerId: 310,
    payer: { email: ' Brick@Example.com ', name: 'Ana Maria Souza', identification: { type: 'cpf', number: '123.456.789-09' } },
    deviceId: 'armor.1234',
    idempotencyKey: `plan-card:${INTENT}:abc`,
  }));
  assert.equal(request.url, 'https://api.mercadopago.com/v1/payments');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['X-Idempotency-Key'], `plan-card:${INTENT}:abc`);
  assert.equal(request.init.headers['X-meli-session-id'], 'armor.1234');
  assert.match(request.init.headers.Authorization, /^Bearer TEST-/);
  assert.equal(request.body.transaction_amount, 120);
  assert.equal(request.body.token, 'card-token-123');
  assert.equal(request.body.installments, 1);
  assert.equal(request.body.payment_method_id, 'visa');
  assert.equal(request.body.issuer_id, '310');
  assert.equal(request.body.binary_mode, true);
  assert.equal(request.body.statement_descriptor, 'ROTTA URBANA');
  assert.deepEqual(request.body.payer, {
    email: 'brick@example.com',
    first_name: 'Ana',
    last_name: 'Maria Souza',
    identification: { type: 'CPF', number: '12345678909' },
  });
  assert.equal(request.body.additional_info.items[0].unit_price, 120);
  assert.equal(request.body.additional_info.items[0].quantity, 1);
});

test('the card charge leaves out a device id or issuer it cannot trust', async () => {
  const request = await captureMercadoPagoRequest(() => createPlanCardPayment({
    plan: 'daily', amount: 25, externalReference: 'r', notificationUrl: 'https://x', token: 't', paymentMethodId: 'master',
    issuerId: 'abc; drop', payer: { email: 'a@b.co', identification: { type: 'CPF', number: '123' } }, deviceId: 'bad id\nX-Other: 1',
  }));
  assert.equal('X-meli-session-id' in request.init.headers, false);
  assert.equal('issuer_id' in request.body, false);
  assert.equal('identification' in request.body.payer, false);
});

test('the card form page carries only the public key, escaped', () => {
  const page = cardFormPage({ publicKey: 'APP_USR-</script><script>alert(1)</script>' });
  assert.equal(page.includes('APP_USR-</script>'), false);
  assert.match(page, /APP_USR-\\u003c\/script>/);
  assert.match(page, /sdk\.mercadopago\.com\/js\/v2/);
  assert.match(page, /maxInstallments: 1/);
});

test('choosing card opens an in-app card form and cancels the Pix shown before', async () => {
  const fixture = passFixture({ intents: [pixIntent()] });
  const result = await withCardForm(() => withMercadoPago({
    'GET /v1/payments/mp-pix-1': () => [200, mpPayment('mp-pix-1', 'pending', fixture.rows[0].external_reference)],
    'PUT /v1/payments/mp-pix-1': () => [200, { id: 'mp-pix-1', status: 'cancelled' }],
  }, async (calls) => {
    const response = await fixture.checkout({ method: 'card' });
    assert.equal(calls.some((call) => call.path === '/checkout/preferences'), false, 'no Checkout Pro');
    assert.equal(calls.some((call) => call.method === 'POST'), false, 'nothing charged yet');
    return response;
  }));
  assert.equal(fixture.rows[0].status, 'cancelled');
  assert.equal(result.method, 'card');
  assert.equal(result.init_point, null);
  assert.equal(result.pix, null);
  assert.equal(result.payer_email, 'motorista@example.com');
  const row = fixture.admin.tables.payments.find((item) => item.id === result.payment_id);
  assert.equal(row.status, 'pending');
  assert.equal(row.provider_metadata.channel, 'card');
  assert.equal(row.provider_payment_id ?? null, null);
});

test('opening the card form again reuses it; another offer or Pix closes it', async () => {
  const fixture = passFixture();
  const routes = {
    'POST /v1/payments': ({ body }) => [201, {
      id: 'mp-pix-5', status: 'pending', date_of_expiration: body.date_of_expiration,
      point_of_interaction: { transaction_data: { qr_code: '000201-five' } },
    }],
  };
  await withCardForm(() => withMercadoPago(routes, async () => {
    const first = await fixture.checkout({ method: 'card' });
    const again = await fixture.checkout({ method: 'card' });
    assert.equal(again.payment_id, first.payment_id);
    assert.equal(again.reused, true);

    const weekly = await fixture.checkout({ method: 'card', plan: 'weekly', amount: 120 });
    assert.notEqual(weekly.payment_id, first.payment_id);
    const byId = (id) => fixture.admin.tables.payments.find((item) => item.id === id);
    assert.equal(byId(first.payment_id).status, 'cancelled');
    assert.equal(byId(first.payment_id).provider_status, 'superseded');

    const pix = await fixture.checkout({ method: 'pix' });
    assert.equal(pix.method, 'pix');
    assert.equal(byId(weekly.payment_id).status, 'cancelled');
  }));
});

test('without the public key, card falls back to Checkout Pro and says so', async () => {
  const fixture = passFixture();
  const result = await withCardForm(() => withMercadoPago({
    'POST /checkout/preferences': () => [201, { id: 'pref-9', init_point: 'https://mp.test/pref-9' }],
  }, () => fixture.checkout({ method: 'card' })), null);
  assert.equal(result.method, 'checkout');
  assert.equal(result.card_unavailable, true);
  assert.equal(result.init_point, 'https://mp.test/pref-9');
});

test('an approved card credits the plan at once and records the attempt', async () => {
  const fixture = passFixture({ intents: [idleCard()] });
  const reference = fixture.rows[0].external_reference;
  const result = await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'POST /v1/payments': ({ body }) => [201, { ...cardPayment('mp-c-1', 'approved', body.external_reference), status_detail: 'accredited' }],
  }, async (calls) => {
    const response = await cardPay(fixture, 0);
    const charge = calls.find((call) => call.method === 'POST');
    assert.equal(charge.body.external_reference, reference);
    assert.equal(charge.body.transaction_amount, 25);
    assert.equal(charge.body.payer.email, 'brick@example.com');
    assert.equal(charge.headers['X-meli-session-id'], 'armor.abc123');
    assert.match(charge.headers['X-Idempotency-Key'], new RegExp(`^plan-card:${fixture.rows[0].id}:[0-9a-f]{16}$`));
    return response;
  });
  assert.equal(result.status, 'approved');
  assert.equal(result.subscription.plan, 'daily');
  assert.equal(fixture.rows[0].status, 'approved');
  assert.deepEqual(fixture.rows[0].provider_metadata.card_attempts, ['mp-c-1']);
});

test('a declined card explains why, charges nothing and lets the driver try another card', async () => {
  const fixture = passFixture({ intents: [idleCard()] });
  let attempt = 0;
  await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'GET /v1/payments/mp-c-1': () => [200, { ...cardPayment('mp-c-1', 'rejected', fixture.rows[0].external_reference) }],
    'POST /v1/payments': ({ body }) => {
      attempt += 1;
      return attempt === 1
        ? [201, { ...cardPayment('mp-c-1', 'rejected', body.external_reference), status_detail: 'cc_rejected_insufficient_amount' }]
        : [201, { ...cardPayment('mp-c-2', 'approved', body.external_reference), status_detail: 'accredited' }];
    },
  }, async () => {
    const declined = await cardPay(fixture, 0);
    assert.equal(declined.status, 'rejected');
    assert.match(declined.message, /limite/);
    assert.equal(declined.detail, 'cc_rejected_insufficient_amount');
    assert.equal(fixture.rows[0].status, 'rejected');
    assert.equal(fixture.admin.tables.subscriptions[0].plan, 'commission');

    const paid = await cardPay(fixture, 0, { token: 'tok-second-card-0123456789' });
    assert.equal(paid.status, 'approved');
  });
  assert.equal(fixture.rows[0].status, 'approved');
  assert.deepEqual(fixture.rows[0].provider_metadata.card_attempts, ['mp-c-1', 'mp-c-2']);
});

test('a card under review is not charged a second time unless the driver asks', async () => {
  const fixture = passFixture({ intents: [idleCard()] });
  const reference = fixture.rows[0].external_reference;
  let charges = 0;
  const routes = {
    'GET /v1/payments/search': emptySearch,
    // Not in the search yet: found by the attempt recorded on the checkout.
    'GET /v1/payments/mp-c-1': () => [200, cardPayment('mp-c-1', 'in_process', reference)],
    'POST /v1/payments': ({ body }) => {
      charges += 1;
      return [201, { ...cardPayment(`mp-c-${charges}`, charges === 1 ? 'in_process' : 'approved', body.external_reference) }];
    },
  };
  await withMercadoPago(routes, async () => {
    const first = await cardPay(fixture, 0);
    assert.equal(first.status, 'processing');
    assert.equal(fixture.rows[0].status, 'pending');
    assert.equal(fixture.rows[0].provider_payment_id, 'mp-c-1');

    const shown = await latestPendingPass(fixture.admin, fixture.driverId);
    assert.equal(shown.payment_id, fixture.rows[0].id);
    assert.equal(shown.processing, true);

    await assert.rejects(cardPay(fixture, 0, { token: 'tok-again-0123456789abc' }), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'payment_processing');
      return true;
    });
    assert.equal(charges, 1);

    const second = await cardPay(fixture, 0, { token: 'tok-again-0123456789abc', allowProcessing: true });
    assert.equal(second.status, 'approved');
  });
  assert.equal(charges, 2);
});

test('a card form the driver moved on from, or let expire, does not charge', async () => {
  const later = passFixture({ intents: [pixIntent(), idleCard()] });
  // rows[0] (Pix) was created after rows[1] (card).
  await withMercadoPago({ 'GET /v1/payments/search': emptySearch }, (calls) => assert.rejects(cardPay(later, 1), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'payment_superseded');
    assert.equal(calls.some((call) => call.method === 'POST'), false);
    return true;
  }));

  const expired = passFixture({ intents: [idleCard({ expires_at: new Date(Date.now() - 1000).toISOString() })] });
  await withMercadoPago({ 'GET /v1/payments/search': emptySearch }, (calls) => assert.rejects(cardPay(expired, 0), (error) => {
    assert.equal(error.status, 410);
    assert.equal(error.code, 'payment_expired');
    assert.equal(calls.some((call) => call.method === 'POST'), false);
    return true;
  }));

  const closed = passFixture({ intents: [idleCard({ status: 'cancelled' })] });
  await withMercadoPago({}, () => assert.rejects(cardPay(closed, 0), (error) => error.code === 'payment_superseded'));

  const pix = passFixture({ intents: [pixIntent()] });
  await withMercadoPago({}, () => assert.rejects(cardPay(pix, 0), (error) => error.status === 404 && error.code === 'payment_not_found'));

  const other = passFixture({ intents: [idleCard()] });
  const stranger = passFixture();
  await withMercadoPago({}, () => assert.rejects(
    payPassWithCard(other.admin, { driver: { id: stranger.driverId }, paymentId: other.rows[0].id, token: 'x'.repeat(20), paymentMethodId: 'visa', host: 'https://rotta.test' }),
    (error) => error.code === 'payment_not_found',
  ));
});

test('a card form already paid answers approved without charging', async () => {
  const fixture = passFixture({ intents: [idleCard({ provider_metadata: { card_attempts: ['mp-c-7'] } })] });
  const result = await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'GET /v1/payments/mp-c-7': () => [200, cardPayment('mp-c-7', 'approved', fixture.rows[0].external_reference)],
  }, async (calls) => {
    const response = await cardPay(fixture, 0);
    assert.equal(calls.some((call) => call.method === 'POST'), false);
    return response;
  });
  assert.equal(result.status, 'approved');
  assert.equal(fixture.rows[0].status, 'approved');
});

test('no answer from Mercado Pago is reported as unknown; a refused request as declined', async () => {
  const down = passFixture({ intents: [idleCard()] });
  await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'POST /v1/payments': () => [500, { message: 'internal_error' }],
  }, () => assert.rejects(cardPay(down, 0), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.code, 'payment_unknown');
    return true;
  }));
  assert.equal(down.rows[0].status, 'pending');

  const invalid = passFixture({ intents: [idleCard()] });
  const result = await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'POST /v1/payments': () => [400, { message: 'invalid card token', cause: [{ code: 2006 }] }],
  }, () => cardPay(invalid, 0));
  assert.equal(result.status, 'rejected');
  assert.match(result.message, /nada foi cobrado/);
});

test('card attempts are limited per hour', async () => {
  const fixture = passFixture({ intents: [idleCard()] });
  let charges = 0;
  await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'POST /v1/payments': ({ body }) => {
      charges += 1;
      return [201, { ...cardPayment(`mp-r-${charges}`, 'rejected', body.external_reference), status_detail: 'cc_rejected_other_reason' }];
    },
  }, async () => {
    for (let i = 0; i < 8; i += 1) {
      assert.equal((await cardPay(fixture, 0, { token: `tok-${i}-0123456789abcdef` })).status, 'rejected');
    }
    await assert.rejects(cardPay(fixture, 0, { token: 'tok-9-0123456789abcdef' }), (error) => error.status === 429 && error.code === 'too_many_attempts');
  });
  assert.equal(charges, 8);
});

test('a late decline of an older card attempt does not touch the newer one', async () => {
  const fixture = passFixture({
    intents: [idleCard({ provider_payment_id: 'mp-c-2', provider_metadata: { card_attempts: ['mp-c-1', 'mp-c-2'] } })],
  });
  const reference = fixture.rows[0].external_reference;
  const stale = await withMercadoPago({}, () => applyOneTimePlanPaymentWebhook(fixture.admin, cardPayment('mp-c-1', 'rejected', reference)));
  assert.equal(stale.result, 'stale_attempt');
  assert.equal(fixture.rows[0].status, 'pending');
  assert.equal(fixture.rows[0].provider_payment_id, 'mp-c-2');

  // An approval is always applied, whichever attempt it is.
  const late = await withMercadoPago({}, () => applyOneTimePlanPaymentWebhook(fixture.admin, cardPayment('mp-c-1', 'approved', reference)));
  assert.equal(late.result, 'credited');
  assert.equal(fixture.rows[0].status, 'approved');
});

test('a paid pass closes the card form left open, so it cannot charge again', async () => {
  const fixture = passFixture({ intents: [pixIntent(), idleCard()] });
  const result = await withMercadoPago({}, () => applyOneTimePlanPaymentWebhook(fixture.admin, mpPayment('mp-pix-1', 'approved', fixture.rows[0].external_reference)));
  assert.equal(result.result, 'credited');
  assert.equal(fixture.rows[1].status, 'cancelled');
  assert.equal(fixture.rows[1].provider_status, 'superseded');
});

test('the admin sync finds a card attempt the search has not indexed yet', async () => {
  const fixture = passFixture({ intents: [idleCard({ provider_metadata: { card_attempts: ['mp-c-4'] } })] });
  const result = await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'GET /v1/payments/mp-c-4': () => [200, cardPayment('mp-c-4', 'approved', fixture.rows[0].external_reference)],
  }, () => syncPaymentForAdmin(fixture.admin, fixture.rows[0].id));
  assert.equal(result.paymentStatus, 'approved');
  assert.equal(fixture.rows[0].status, 'approved');
});

test('an open card form is offered again; one with a payment under way is shown as under review', async () => {
  const open = passFixture({ intents: [idleCard()] });
  const shown = await latestPendingPass(open.admin, open.driverId);
  assert.equal(shown.method, 'card');
  assert.equal(shown.payment_id, open.rows[0].id);
  assert.equal(shown.processing, undefined);

  const expired = passFixture({ intents: [idleCard({ expires_at: new Date(Date.now() - 1000).toISOString() })] });
  assert.equal(await latestPendingPass(expired.admin, expired.driverId), null);
});

test('a card Mercado Pago did not answer blocks another card until the driver agrees, and the same card can be sent again', async () => {
  const fixture = passFixture({ intents: [idleCard()] });
  const firstToken = 'tok-unanswered-0123456789ab';
  let posts = 0;
  let answer = false;
  const keys = [];
  const routes = {
    'GET /v1/payments/search': emptySearch,
    'POST /v1/payments': ({ headers, body }) => {
      posts += 1;
      keys.push(headers['X-Idempotency-Key']);
      if (!answer) return [500, { message: 'internal_error' }];
      return [201, cardPayment('mp-c-1', 'approved', body.external_reference)];
    },
  };
  await withMercadoPago(routes, async () => {
    await assert.rejects(cardPay(fixture, 0, { token: firstToken }), (error) => error.code === 'payment_unknown');
    const marker = fixture.rows[0].provider_metadata.card_unknown;
    assert.ok(marker?.at, 'the unanswered charge is recorded');
    assert.equal(fixture.rows[0].status, 'pending');

    // The app shows it as under review, and nothing else charges without asking.
    const shown = await latestPendingPass(fixture.admin, fixture.driverId);
    assert.equal(shown.processing, true);
    await assert.rejects(cardPay(fixture, 0, { token: 'tok-another-card-0123456789' }), (error) => error.code === 'payment_processing');
    await assert.rejects(fixture.checkout({ method: 'pix' }), (error) => error.code === 'payment_processing');
    assert.equal(fixture.rows[0].status, 'pending', 'not closed as an idle form');
    assert.equal(posts, 1);

    // The same card again goes through, past the form's time limit, with the
    // same idempotency key, so Mercado Pago answers the first charge.
    fixture.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    answer = true;
    const replay = await cardPay(fixture, 0, { token: firstToken });
    assert.equal(replay.status, 'approved');
  });
  assert.equal(posts, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(fixture.rows[0].status, 'approved');
  assert.equal(fixture.rows[0].provider_metadata.card_unknown, undefined, 'answered now');
  assert.deepEqual(fixture.rows[0].provider_metadata.card_attempts, ['mp-c-1']);
});

test('a declined form whose next card got no answer still counts as under review', async () => {
  const fixture = passFixture({ intents: [idleCard({ status: 'rejected', provider_payment_id: 'mp-c-declined' })] });
  const routes = {
    'GET /v1/payments/search': emptySearch,
    'GET /v1/payments/mp-c-declined': () => [200, cardPayment('mp-c-declined', 'rejected', fixture.rows[0].external_reference)],
    'POST /v1/payments': () => [500, { message: 'internal_error' }],
    'POST /v1/payments/': () => [500, { message: 'internal_error' }],
  };
  await withMercadoPago(routes, async () => {
    await assert.rejects(cardPay(fixture, 0, { token: 'tok-second-card-0123456789' }), (error) => error.code === 'payment_unknown');
    assert.equal(fixture.rows[0].status, 'rejected');
    assert.ok(fixture.rows[0].provider_metadata.card_unknown?.at);

    const shown = await latestPendingPass(fixture.admin, fixture.driverId);
    assert.equal(shown?.processing, true, 'shown as under review after a relaunch');
    await assert.rejects(fixture.checkout({ method: 'pix', replaces: fixture.rows[0].id }), (error) => error.code === 'payment_processing');
    await assert.rejects(fixture.checkout({ method: 'checkout' }), (error) => error.code === 'payment_processing');
    assert.equal(fixture.rows.length, 1, 'no second checkout without asking');
  });
});

test('a declined form is never offered to be paid again', async () => {
  const fixture = passFixture({ intents: [pixIntent({ status: 'rejected' })] });
  assert.equal(await latestPendingPass(fixture.admin, fixture.driverId), null);
});

test('an unanswered card stops counting as under review after a while', async () => {
  const old = new Date(Date.now() - 20 * 60e3).toISOString();
  const fixture = passFixture({ intents: [idleCard({ provider_metadata: { card_unknown: { at: old, token: 'abc' } } })] });
  const shown = await latestPendingPass(fixture.admin, fixture.driverId);
  assert.equal(shown.processing, undefined);
  const result = await withMercadoPago({
    'GET /v1/payments/search': emptySearch,
    'POST /v1/payments': ({ body }) => [201, cardPayment('mp-c-3', 'approved', body.external_reference)],
  }, () => cardPay(fixture, 0));
  assert.equal(result.status, 'approved');
});

test('the daily cleanup leaves a payment under review open and closes the rest', async () => {
  const day = 24 * 3600e3;
  const fixture = passFixture({
    intents: [
      cardIntent({ provider_payment_id: 'mp-review-1', created_at: new Date(Date.now() - 2 * day).toISOString() }),
      idleCard({ created_at: new Date(Date.now() - 2 * day).toISOString() }),
      cardIntent({ provider_payment_id: 'mp-review-2', created_at: new Date(Date.now() - 5 * day).toISOString() }),
      pixIntent({ created_at: new Date(Date.now() - 2 * day).toISOString() }),
      idleCard(),
    ],
  });
  const closed = await closeAbandonedPasses(fixture.admin);
  assert.equal(closed, 3);
  assert.deepEqual(fixture.rows.map((row) => row.status), ['pending', 'cancelled', 'cancelled', 'cancelled', 'pending']);
  assert.equal(fixture.rows[1].provider_status, 'expired_unpaid');

  // The one still under review is checked until it clears.
  const searched = [];
  await withMercadoPago({
    'GET /v1/payments/search': ({ searchParams }) => {
      searched.push(searchParams.get('external_reference'));
      return [200, { results: [cardPayment('mp-review-1', 'approved', fixture.rows[0].external_reference)] }];
    },
  }, () => reviewPassIntents(fixture.admin));
  assert.ok(searched.includes(fixture.rows[0].external_reference));
  assert.equal(fixture.rows[0].status, 'approved');
});

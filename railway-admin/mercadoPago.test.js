import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { buildRecurringSchedule, createDailyPlanPreference } from './mercadoPago.js';
import { applyDailyPlanPaymentWebhook } from './paymentRoutes.js';

const originalFetch = globalThis.fetch;
const originalAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalAccessToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  else process.env.MERCADOPAGO_ACCESS_TOKEN = originalAccessToken;
});

test('daily pass creates a guest Checkout Pro preference for a single Pix/card payment', async () => {
  process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST_ACCESS_TOKEN_FOR_UNIT_TESTS';
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return new Response(JSON.stringify({ id: 'pref-123', init_point: 'https://checkout.example/pay' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };

  const preference = await createDailyPlanPreference({
    driverId: 'driver-123',
    amount: 12.5,
    externalReference: 'ru_daily:driver-123:subscription-456:attempt-789',
    notificationUrl: 'https://app.example/api/mercadopago/webhook',
    backUrls: { success: 'https://app.example/return', pending: 'https://app.example/return', failure: 'https://app.example/return' },
    idempotencyKey: 'daily-attempt-789',
  });

  assert.equal(requestUrl, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(requestOptions.method, 'POST');
  assert.equal(requestOptions.headers['X-Idempotency-Key'], 'daily-attempt-789');
  const body = JSON.parse(requestOptions.body);
  assert.equal(body.items[0].unit_price, 12.5);
  assert.equal(body.items[0].currency_id, 'BRL');
  assert.equal(body.external_reference, 'ru_daily:driver-123:subscription-456:attempt-789');
  assert.equal(body.payer, undefined);
  assert.equal(body.auto_recurring, undefined);
  assert.equal(body.payment_methods.installments, 1);
  assert.deepEqual(body.payment_methods.excluded_payment_types.map(({ id }) => id), ['ticket']);
  assert.equal(preference.init_point, 'https://checkout.example/pay');
});

test('daily is not a recurring billing schedule', () => {
  assert.throws(() => buildRecurringSchedule('daily', 12.5), /Plano não recorrente/);
  assert.equal(buildRecurringSchedule('weekly', 40).frequency, 7);
  assert.equal(buildRecurringSchedule('weekly', 40).frequency_type, 'days');
  assert.equal(buildRecurringSchedule('monthly', 150).frequency, 1);
  assert.equal(buildRecurringSchedule('monthly', 150).frequency_type, 'months');
});

test('approved daily payment activates its recorded intent exactly once', async () => {
  const intent = {
    id: 'payment-intent-123',
    driver_id: 'driver-123',
    subscription_id: 'subscription-456',
    amount: 12.5,
    method: 'mercadopago',
    status: 'pending',
    provider: 'mercadopago',
    external_reference: 'ru_daily:driver-123:subscription-456:attempt-789',
    provider_metadata: { billing_model: 'one_time_daily', plan: 'daily' },
  };
  let savedIntent = { ...intent };
  let confirmCalls = 0;
  const admin = {
    from(table) {
      let filters = {};
      let update;
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        maybeSingle: async () => ({
          data: table === 'payments' && filters.external_reference === savedIntent.external_reference
            ? savedIntent
            : table === 'subscriptions' && filters.driver_id === savedIntent.driver_id
              ? { id: savedIntent.subscription_id, driver_id: savedIntent.driver_id, provider_subscription_id: null }
              : null,
          error: null,
        }),
        update(value) { update = value; return query; },
        then(resolve, reject) {
          savedIntent = { ...savedIntent, ...update };
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'confirm_daily_plan_payment');
      assert.equal(args.p_payment_id, intent.id);
      confirmCalls += 1;
      savedIntent.status = 'approved';
      return { error: null };
    },
  };
  const providerPayment = {
    id: 987654,
    external_reference: intent.external_reference,
    transaction_amount: 12.5,
    status: 'approved',
    payment_method_id: 'pix',
    payment_type_id: 'bank_transfer',
  };

  await applyDailyPlanPaymentWebhook(admin, providerPayment);
  await applyDailyPlanPaymentWebhook(admin, providerPayment);

  assert.equal(savedIntent.status, 'approved');
  assert.equal(savedIntent.method, 'pix');
  assert.equal(savedIntent.provider_payment_id, '987654');
  assert.equal(confirmCalls, 1);
});

test('daily payment with the wrong amount cannot activate the subscription', async () => {
  const admin = {
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({
      data: { id: 'intent', driver_id: 'driver', amount: 12.5, status: 'pending', provider_metadata: {} }, error: null,
    }) }),
    rpc: async () => { throw new Error('must not grant access'); },
  };
  await assert.rejects(
    applyDailyPlanPaymentWebhook(admin, {
      id: 'payment-id',
      external_reference: 'ru_daily:driver:subscription:attempt',
      transaction_amount: 99,
      status: 'approved',
      payment_method_id: 'pix',
      payment_type_id: 'bank_transfer',
    }),
    /valor pago não confere/i,
  );
});

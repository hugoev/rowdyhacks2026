import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { chromium, request, type APIRequestContext } from '@playwright/test';
import { io } from 'socket.io-client';
import pg from 'pg';
import { tigerPoolConfig } from '../server/tiger';
import { vultrConfigSchema } from './vultr-config';
import type { PublicState, Role } from '../lib/types';

// This explicit live check creates and denies one synthetic mock payment.
const env = parse(readFileSync('.env.vultr'));
const config = vultrConfigSchema.parse(env);
assert.ok(env.DATABASE_URL, 'Configure DATABASE_URL in .env.vultr first');
const baseURL = `https://${config.TRIPWIRE_DOMAIN}`;
const clients = new Map<Role, APIRequestContext>();
const pool = new pg.Pool(tigerPoolConfig(env.DATABASE_URL, env.TIGER_CA_CERT));
pool.on('error', () => { process.exitCode = 1; console.error('Tiger connection interrupted during verification.'); });
const browser = await chromium.launch();
let socket: ReturnType<typeof io> | undefined;
let paymentId: string | undefined;
let resolved = false;
let stage = 'paired login';
async function api(role: Role, path: string, data?: unknown) {
  const client = clients.get(role)!;
  const headers = { 'x-tripwire-client': 'web', 'x-tripwire-role': role };
  const response = data === undefined ? await client.get(path, { headers }) : await client.post(path, { headers, data });
  assert.equal(response.status(), 200, `${role} ${path} should succeed`);
  return response.json();
}
async function waitFor(check: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.fail(message);
}
try {
  for (const role of ['protected', 'guardian', 'relative'] as const) {
    const client = await request.newContext({ baseURL, timeout: 15000 });
    clients.set(role, client);
    await api(role, '/api/session', { role, accessCode: env[`${role.toUpperCase()}_ACCESS_CODE`] });
    const cookies = (await client.storageState()).cookies;
    assert.ok(cookies.some(cookie => cookie.name === `tw_${role}` && cookie.secure && cookie.httpOnly), 'Paired sessions require secure HttpOnly cookies');
  }
  stage = 'deployment health';
  const health = await api('guardian', '/api/health');
  assert.equal(health.hosting, 'vultr'); assert.equal(health.mode, 'paired');
  await waitFor(async () => (await api('guardian', '/api/health')).analytics === 'working', 'Vultr Tiger analytics did not become working');
  stage = 'analytics privacy';
  for (const role of ['protected', 'relative'] as const) {
    const response = await clients.get(role)!.get('/api/analytics', { headers: { 'x-tripwire-role': role } });
    assert.equal(response.status(), 403, 'Only guardians may read analytics');
    assert.equal('riskHistory' in await api(role, '/api/state'), false);
  }
  const initial: PublicState = await api('guardian', '/api/state');
  const previousIds = new Set(initial.events.map(event => event.id));
  stage = 'guardian WebSocket';
  const guardianCookies = (await clients.get('guardian')!.storageState()).cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  socket = io(baseURL, { auth: { role: 'guardian' }, transports: ['websocket'], extraHeaders: { Cookie: guardianCookies, Origin: baseURL }, reconnection: false, timeout: 10000 });
  await new Promise<void>((resolve, reject) => {
    socket!.once('connect', resolve);
    socket!.once('connect_error', () => reject(new Error('Guardian WebSocket connection failed')));
  });
  const observedPayments = new Set<string>();
  socket.on('state', (state: PublicState) => { for (const payment of state.payments) if (payment.status === 'held') observedPayments.add(payment.id); });
  stage = 'payment hold and denial';
  const payment = await api('protected', '/api/payments', { payee: `Synthetic Vultr verification ${randomUUID()}`, amount: 2500, rail: 'gift-card', newPayee: true });
  paymentId = payment.id;
  assert.equal(payment.status, 'held', 'Gift-card fixture must be held');
  await waitFor(async () => observedPayments.has(payment.id), 'Guardian did not receive the held payment over WebSocket');
  const denied = await clients.get('protected')!.post('/api/payments/decide', { headers: { 'x-tripwire-client': 'web', 'x-tripwire-role': 'protected' }, data: { id: payment.id, decision: 'approve' } });
  assert.equal(denied.status(), 403, 'Protected role must not approve a held payment');
  const decision = await api('guardian', '/api/payments/decide', { id: payment.id, decision: 'deny' });
  assert.equal(decision.status, 'denied'); resolved = true;
  const state: PublicState = await api('guardian', '/api/state');
  const eventIds = state.events.filter(event => !previousIds.has(event.id) && event.kind === 'payment').map(event => event.id);
  assert.ok(eventIds.length >= 2, 'Creation and denial must generate risk events');
  stage = 'Tiger persistence and guardian chart';
  await waitFor(async () => {
    const analytics = await api('guardian', '/api/analytics');
    return analytics.status.state === 'working' && analytics.status.pendingEvents === 0 && analytics.history.source === 'tiger' && eventIds.every(id => analytics.history.points.some((point: { id: string }) => point.id === id));
  }, 'Vultr risk events did not reach the guardian Tiger chart');
  const raw = await pool.query('SELECT event_id, stream_id FROM tripwire.risk_events WHERE event_id = ANY($1::uuid[])', [eventIds]);
  assert.equal(raw.rowCount, eventIds.length, 'Vultr events must exist once each in Tiger Data');
  const rollup = await pool.query('SELECT sum(samples) AS samples FROM tripwire.risk_minute WHERE stream_id=$1', [raw.rows[0].stream_id]);
  assert.ok(Number(rollup.rows[0].samples) >= eventIds.length, 'Minute aggregate must include Vultr events');
  stage = 'mobile browser views';
  for (const role of ['guardian', 'protected', 'relative'] as const) {
    const context = await browser.newContext({ baseURL, storageState: await clients.get(role)!.storageState(), viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    stage = `${role} mobile navigation`;
    await page.goto(`/${role}`);
    stage = `${role} mobile live connection`;
    // The mobile layout hides this status label; its text still tracks the socket.
    try { await page.getByText('Live connection', { exact: true }).waitFor({ state: 'attached' }); }
    catch (error) {
      await page.screenshot({ path: `test-results/vultr-${role}-failure.png`, fullPage: true });
      throw error;
    }
    stage = `${role} mobile layout`;
    assert.equal(await page.locator('main h1').count(), 1, `${role} view must render`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role} mobile view must fit the viewport`);
    assert.equal(errors.length, 0, `${role} view must have no runtime errors`);
    await context.close();
  }
  console.log(JSON.stringify({ origin: baseURL, release: health.release, pairedLogins: 3, secureCookies: true, webSocket: 'passed', paymentHoldAndDenial: 'passed', analyticsPrivacy: 'passed', tigerEvents: raw.rowCount, minuteAggregate: 'passed', mobileViews: 3 }));
} catch (error) {
  // Driver and browser errors may include credentials; report the stage instead.
  console.error(`Vultr end-to-end verification failed during ${stage}.`);
  if (error instanceof assert.AssertionError) console.error(error.message);
  process.exitCode = 1;
} finally {
  if (paymentId && !resolved) {
    try { await api('guardian', '/api/payments/decide', { id: paymentId, decision: 'deny' }); }
    catch { console.error('Synthetic payment cleanup failed; guardian must deny the verification fixture.'); process.exitCode = 1; }
  }
  socket?.disconnect();
  await browser.close();
  await Promise.all([...clients.values()].map(client => client.dispose()));
  await pool.end();
}

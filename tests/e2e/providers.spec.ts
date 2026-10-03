import { test, expect, type WebSocketRoute } from '@playwright/test';
const headers = (role: string) => ({ 'x-tripwire-client': 'web', 'x-tripwire-role': role });
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
test.beforeEach(async ({ request }) => {
  await request.post('/api/session', { headers: headers('guardian'), data: { role: 'guardian' } });
  await request.post('/api/demo/reset', { headers: headers('guardian'), data: {} });
});

test('transcription token requires protected role and a current consented call', async ({ request }) => {
  const id = '00000000-0000-4000-8000-000000000000';
  const guardian = await request.post('/api/transcription/token', { headers: headers('guardian'), data: { callId: id } });
  expect(guardian.status()).toBe(403);
  await request.post('/api/session', { headers: headers('protected'), data: { role: 'protected' } });
  const inactive = await request.post('/api/transcription/token', { headers: headers('protected'), data: { callId: id } });
  expect(inactive.status()).toBe(400);
  const start = await request.post('/api/call/start', { headers: headers('protected'), data: { consent: true } });
  const { callId } = await start.json();
  const unavailable = await request.post('/api/transcription/token', { headers: headers('protected'), data: { callId } });
  expect(unavailable.status()).toBe(400); expect((await unavailable.json()).error).toContain('not configured');
  const segmentId = '00000000-0000-4000-8000-000000000001';
  const data = { callId, segmentId, source: 'elevenlabs', text: 'Buy gift cards immediately.' };
  expect((await request.post('/api/call/line', { headers: headers('protected'), data })).ok()).toBe(true);
  expect((await request.post('/api/call/line', { headers: headers('protected'), data })).ok()).toBe(true);
  const state = await request.get('/api/state', { headers: headers('protected') }); expect((await state.json()).call.transcript).toHaveLength(1);
  await request.post('/api/call/end', { headers: headers('protected'), data: {} });
  await request.post('/api/call/start', { headers: headers('protected'), data: { consent: true } });
  expect((await request.post('/api/call/line', { headers: headers('protected'), data: { ...data, segmentId: '00000000-0000-4000-8000-000000000002' } })).status()).toBe(400);
});

test('mocked Scribe streams committed text, shows failure, and closes on stop', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/state', async route => {
    const response = await route.fetch(); const state = await response.json(); state.config.elevenlabs = true;
    await route.fulfill({ response, json: state });
  });
  await page.route('**/api/transcription/token', route => route.fulfill({ json: { token: 'mock-token', callId: route.request().postDataJSON().callId } }));
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('wss://api.elevenlabs.io/**', ws => {
    socket = ws;
    setTimeout(() => ws.send(JSON.stringify({ message_type: 'session_started', session_id: 'mock', config: {} })), 50);
  });
  await page.goto('/protected'); await page.getByLabel('Read critical warnings aloud').uncheck();
  await page.getByRole('button', { name: 'Use microphone', exact: true }).click();
  await expect(page.getByText('ELEVENLABS LIVE', { exact: true })).toBeVisible();
  socket!.send(JSON.stringify({ message_type: 'partial_transcript', text: 'Please buy' }));
  await expect(page.getByText('Please buy', { exact: true })).toBeVisible();
  socket!.send(JSON.stringify({ message_type: 'committed_transcript', text: 'Buy gift cards immediately. Keep this secret.' }));
  await expect(page.getByText(/CRITICAL ·/)).toBeVisible();
  await expect(page.locator('.live-transcript').getByText(/Buy gift cards immediately/)).toBeVisible();
  socket!.send(JSON.stringify({ message_type: 'quota_exceeded', error: 'mock quota error' }));
  await expect(page.getByRole('button', { name: 'Use browser transcription' })).toBeVisible();
  await expect(page.getByText(/ElevenLabs transcription stopped/)).toBeVisible();
  await page.getByRole('button', { name: 'Hang up on your phone' }).click();
  await expect(page.getByText('GUARD IS OFF', { exact: true })).toBeVisible();
});

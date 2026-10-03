import test from 'node:test';
import assert from 'node:assert/strict';
import { speak, transcriptionToken } from '../server/elevenlabs';
import { providerStatuses } from '../server/provider-status';
import { LiveTranscription, type CaptureHandlers } from '../lib/live-transcription';
import { Store } from '../server/store';

test('single-use tokens and warning audio keep credentials server-side and report failures', async t => {
  const original = { ...process.env }; t.after(() => { process.env = original; });
  process.env.ELEVENLABS_API_KEY = 'unit-test-only'; process.env.ELEVENLABS_TTS_MODEL = 'eleven_flash_v2_5';
  const mock = t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(new Headers(options?.headers).get('xi-api-key'), 'unit-test-only');
    if (String(url).includes('single-use-token')) return Response.json({ token: 'single-use' });
    assert.equal(JSON.parse(String(options?.body)).model_id, 'eleven_flash_v2_5');
    return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  assert.equal(await transcriptionToken(), 'single-use');
  assert.notEqual(providerStatuses().elevenlabsTranscription?.state, 'working');
  assert.equal((await speak('Pause and call a trusted number.'))?.length, 2);
  assert.equal(providerStatuses().elevenlabsVoice?.state, 'working');
  mock.mock.mockImplementation(async () => new Response('', { status: 429 }));
  await assert.rejects(transcriptionToken(), /quota limited/);
  assert.equal(providerStatuses().elevenlabsTranscription?.state, 'degraded');
  mock.mock.mockImplementation(async () => Response.json({ token: null }));
  await assert.rejects(transcriptionToken(), /invalid token/);
  mock.mock.mockImplementation(async () => new Response('', { headers: { 'Content-Type': 'audio/mpeg' } }));
  await assert.rejects(speak('Warning'), /empty/);
  delete process.env.ELEVENLABS_API_KEY; assert.equal(await speak('Warning'), null);
});
test('capture lifetime stops streams, rejects late events, and supports warning mute', async () => {
  let handlers!: CaptureHandlers; let closed = 0; let muted = 0; let committed = 0;
  const capture = new LiveTranscription((_token, callbacks) => {
    handlers = callbacks;
    return { close: () => { closed++; }, mute: () => { muted++; }, unmute: () => { muted--; } };
  }, 50);
  const callbacks = { ready: () => {}, partial: () => {}, committed: () => { committed++; }, error: () => {}, closed: () => {} };
  const start = capture.start('test', callbacks); handlers.ready(); await start;
  capture.mute(); assert.equal(muted, 1); capture.unmute(); assert.equal(muted, 0);
  handlers.committed('gift cards'); assert.equal(committed, 1);
  capture.stop(); handlers.committed('late segment'); assert.equal(committed, 1); assert.equal(closed, 1);
  const cancelled = capture.start('test', callbacks); capture.stop(); await assert.rejects(cancelled, /cancelled/);
  const timedOut = capture.start('test', callbacks); await assert.rejects(timedOut, /could not start/); assert.equal(closed, 3);
});
test('capture provider error releases resources and does not automatically restart', async () => {
  let handlers!: CaptureHandlers; let starts = 0; let closed = 0; let errors = 0;
  const capture = new LiveTranscription((_token, callbacks) => { starts++; handlers = callbacks; return { close: () => { closed++; }, mute: () => {}, unmute: () => {} }; });
  const start = capture.start('test', { ready: () => {}, partial: () => {}, committed: () => {}, error: () => { errors++; }, closed: () => {} });
  handlers.error(); await assert.rejects(start, /could not start/);
  assert.equal(starts, 1); assert.equal(closed, 1); assert.equal(errors, 1);
});
test('duplicate live segments cannot inflate risk and old sessions cannot submit evidence', () => {
  const store = new Store(':memory:'); store.startCall(); const id = store.state.call.id!;
  store.addLine('Gift cards', 'elevenlabs', id, 'segment-1');
  assert.equal(store.addLine('Gift cards', 'elevenlabs', id, 'segment-1'), null);
  assert.equal(store.state.call.transcript.length, 1);
  assert.throws(() => store.addLine('Different text', 'elevenlabs', id, 'segment-1'), /different text/);
  store.endCall(); store.startCall();
  assert.throws(() => store.addLine('Late', 'elevenlabs', id, 'segment-2'), /different call/);
  assert.equal(store.state.call.transcript.length, 0); store.db.close();
});

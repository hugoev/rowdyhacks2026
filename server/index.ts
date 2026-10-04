import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import next from 'next';
import { Server } from 'socket.io';
import { z } from 'zod';
import { Store } from './store';
import { authenticate, equal, issue, roles } from './auth';
import { configureGemini, GeminiError, mintLiveToken } from './gemini';
import { agentId, agentSignedUrl, configureElevenLabs, speakStream } from './elevenlabs';
import { providerFailure, providerStatuses, providerSuccess } from './provider-status';
import { TigerAnalytics } from './tiger';
import { SolanaVault } from './solana';
import { executeTool } from './live-tools';
import { readEval } from './eval-store';
import { Readable } from 'node:stream';
import type { Role } from '../lib/types';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_BASE_URL || process.env.APP_ORIGIN || `http://localhost:${port}`;
configureGemini();
configureElevenLabs();
const config = { demo: process.env.DEMO_MODE !== 'false', gemini: !!process.env.GEMINI_API_KEY, elevenlabs: !!process.env.ELEVENLABS_API_KEY, agent: !!process.env.ELEVENLABS_API_KEY && !!agentId() };
if (!config.demo) for (const role of roles) if ((process.env[`${role.toUpperCase()}_ACCESS_CODE`] || '').length < 16) throw new Error(`${role.toUpperCase()}_ACCESS_CODE must contain at least 16 characters outside demo mode.`);
const store = new Store(join(process.env.DATA_DIR || './data', 'tripwire.sqlite'));
const tiger = new TigerAnalytics(store, process.env.TIGER_DATABASE_URL || process.env.DATABASE_URL);
const solana = new SolanaVault(store);
const publicConfig = () => ({ ...config, solana: solana.status(), analytics: tiger.status(), providers: providerStatuses() });
function publicSnapshot(role: Role) { return { ...store.snapshot(role, publicConfig()), ...(role === 'guardian' ? { riskHistory: tiger.history(role), eval: readEval() } : {}) }; }
const secret = store.get('sessionSecret')!;
const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const limits = new Map<string, { count: number; until: number }>();
function limit(key: string, max: number) {
  const now = Date.now(); const current = limits.get(key);
  if (!current || now > current.until) { limits.set(key, { count: 1, until: now + 60000 }); return; }
  if (++current.count > max) throw Object.assign(new Error('Too many attempts. Please wait a minute.'), { status: 429 });
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw Object.assign(new Error('Upload must be smaller than 5 MB.'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new Error('Invalid JSON request.'); }
}
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const path = new URL(req.url || '/', origin).pathname;
  if (!path.startsWith('/api/')) { await handle(req, res); return; }
  try {
    if (req.headers.origin && req.headers.origin !== origin) throw Object.assign(new Error('This origin is not allowed. Check APP_ORIGIN.'), { status: 403 });
    if (req.method === 'GET' && path === '/api/config') { json(res, 200, publicConfig()); return; }
    if (req.method === 'GET' && path === '/api/health') { json(res, 200, { ok: true, storage: 'sqlite', analytics: tiger.status().state, solana: solana.status().state, mode: config.demo ? 'demo' : 'paired', hosting: process.env.HOSTING_PROVIDER || 'local', release: process.env.APP_RELEASE || null }); return; }
    if (req.method === 'GET' && path === '/api/speak/stream') {
      // <audio> cannot send custom headers, so the role comes from the query and the cookie proves it.
      const url = new URL(req.url || '/', origin); const viewer = z.enum(roles).parse(url.searchParams.get('role'));
      if (!authenticate(req.headers.cookie, viewer, secret)) throw Object.assign(new Error('Connect your view to continue.'), { status: 401 });
      const speech = store.state.call.speech;
      if (!speech || speech.id !== url.searchParams.get('id')) throw Object.assign(new Error('Nothing to say right now.'), { status: 404 });
      const body = await speakStream(speech.text, speech.language);
      if (!body) { json(res, 200, { fallback: 'browser' }); return; }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
      Readable.fromWeb(body as never).pipe(res); return;
    }
    if (req.method !== 'GET' && (req.method !== 'POST' || req.headers['x-tripwire-client'] !== 'web')) throw Object.assign(new Error('Unsupported request.'), { status: 403 });
    // Public demo mode shares one request budget across repeated multi-view rehearsals.
    const ip = req.socket.remoteAddress || 'local'; limit(ip, config.demo ? 1200 : 240);
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (path === '/api/session' && req.method === 'POST') {
      const input = z.object({ role: z.enum(roles), accessCode: z.string().max(256).optional() }).parse(body);
      // Navigating between views should reuse a valid session, not consume the
      // shared family's login-attempt budget (including React dev-mode remounts).
      if (authenticate(req.headers.cookie, input.role, secret)) { json(res, 200, { ok: true }); return; }
      limit(ip + ':session:' + input.role, config.demo ? 60 : 10);
      if (!config.demo && !equal(input.accessCode || '', process.env[`${input.role.toUpperCase()}_ACCESS_CODE`] || '')) throw Object.assign(new Error('That access code did not match.'), { status: 401 });
      res.setHeader('Set-Cookie', `tw_${input.role}=${issue(input.role, secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
      json(res, 200, { ok: true }); return;
    }
    const role = z.enum(roles).parse(req.headers['x-tripwire-role']);
    if (!authenticate(req.headers.cookie, role, secret)) throw Object.assign(new Error('Connect your view to continue.'), { status: 401 });
    const permit = (...allowed: Role[]) => { if (!allowed.includes(role)) throw Object.assign(new Error('This action requires a different family role.'), { status: 403 }); };
    if (path === '/api/state' && req.method === 'GET') { store.tick(); json(res, 200, publicSnapshot(role)); return; }
    if (path === '/api/analytics' && req.method === 'GET') { permit('guardian'); json(res, 200, { status: tiger.status(), history: tiger.history(role) }); return; }
    if (req.method !== 'POST') { json(res, 404, { error: 'Endpoint not found.' }); return; }
    let result: unknown = { ok: true };
    switch (path) {
      case '/api/call/start': {
        permit('protected');
        const input = z.object({ consent: z.literal(true), live: z.enum(['gemini', 'rules']).default('rules') }).parse(body);
        store.startCall(input.live && config.gemini ? input.live : 'rules'); result = { callId: store.state.call.id }; break;
      }
      case '/api/call/end': permit('protected'); store.endCall(); break;
      case '/api/call/line': {
        permit('protected');
        const input = z.object({ text: z.string().trim().min(1).max(3000), source: z.enum(['gemini', 'agent', 'scripted', 'manual']).default('manual'), callId: z.string().uuid().optional(), segmentId: z.string().uuid().optional() }).parse(body);
        store.addLine(input.text, input.source, input.callId, input.segmentId); break;
      }
      case '/api/call/live-status': {
        permit('protected');
        const input = z.object({ callId: z.string().uuid(), state: z.enum(['gemini', 'rules']), detail: z.string().max(200).default('') }).parse(body);
        if (store.state.call.id !== input.callId) throw new Error('This call has ended.');
        if (input.state === 'gemini') providerSuccess('geminiLive'); else providerFailure('geminiLive', input.detail || 'session interrupted');
        store.setLive(input.state, input.detail || (input.state === 'gemini' ? 'Gemini Live connected' : 'Gemini Live unavailable · rule spotter only')); break;
      }
      case '/api/live/token': {
        permit('protected'); limit(ip + ':live-token', 20);
        const input = z.object({ handle: z.string().max(2000).optional() }).parse(body);
        try { result = await mintLiveToken(store.state.settings.language, input.handle); }
        catch (error) { if (error instanceof GeminiError) throw Object.assign(new Error(error.message), { status: 503 }); throw error; }
        break;
      }
      case '/api/live/tool': {
        permit('protected'); limit(ip + ':live-tool', 600);
        const input = z.object({ callId: z.string().uuid(), name: z.string().max(40), args: z.record(z.string(), z.unknown()).default({}) }).parse(body);
        if (!store.state.call.active || store.state.call.id !== input.callId) { result = { error: 'This call has ended.' }; break; }
        result = await executeTool(store, input.name, input.args); break;
      }
      case '/api/agent/session': { permit('protected'); limit(ip + ':agent', 10); result = { signedUrl: await agentSignedUrl() }; break; }
      case '/api/family-word/asked': permit('protected'); store.familyWordAsked(); break;
      case '/api/safe-word/set': {
        permit('protected', 'guardian');
        if (store.state.settings.safeWordConfigured && role !== 'guardian') throw new Error('Ask your guardian to change the existing family word.');
        limit(ip + ':safe-set', 5);
        await store.setSafeWord(z.object({ word: z.string().trim().min(4).max(100) }).parse(body).word); break;
      }
      case '/api/safe-word/verify': permit('protected'); limit(ip + ':verify', 5); result = { matched: await store.verifyWord(z.object({ word: z.string().trim().max(100) }).parse(body).word) }; break;
      case '/api/guardian/reply': { permit('relative', 'guardian'); const input = z.object({ id: z.string().uuid(), answer: z.enum(['release', 'block']) }).parse(body); result = store.guardianReply(input.id, input.answer); break; }
      case '/api/payments': {
        permit('protected'); const input = z.object({ payee: z.string().trim().min(1).max(100), amount: z.number().positive().max(100000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most two decimal places'), rail: z.enum(['bill', 'bank', 'gift-card', 'crypto', 'wire']), newPayee: z.boolean(), pasted: z.boolean().optional() }).parse(body);
        const payment = store.createPayment(input); if (!store.state.call.active) solana.attach(payment); result = payment; void solana.sync(); break;
      }
      case '/api/payments/review': { permit('protected'); const input = z.object({ id: z.string().uuid(), secret: z.boolean() }).parse(body); const payment = store.reviewPayment(input.id, input.secret); solana.attach(payment); result = payment; void solana.sync(); break; }
      case '/api/solana/prepare': { permit('guardian'); limit(ip + ':solana', 20); const input = z.object({ id: z.string().uuid(), decision: z.enum(['approve', 'deny']) }).parse(body); result = await solana.prepare(input.id, input.decision); break; }
      case '/api/solana/submit': { permit('guardian'); limit(ip + ':solana', 20); const input = z.object({ token: z.string().uuid(), transaction: z.string().max(5000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).parse(body); result = await solana.submit(input.token, input.transaction); break; }
      case '/api/payments/decide': { permit('guardian'); const input = z.object({ id: z.string().uuid(), decision: z.enum(['approve', 'deny']) }).parse(body); result = store.decidePayment(input.id, input.decision); break; }
      case '/api/settings': permit('protected'); store.updateSettings(z.object({ retainFlaggedTranscripts: z.boolean().optional(), coSignLimit: z.number().min(0).max(100000).optional(), language: z.enum(['en', 'es']).optional() }).parse(body)); break;
      case '/api/demo/reset': permit('guardian', 'protected'); if (!config.demo) throw new Error('Reset is available only in demo mode.'); store.reset(); break;
      default: json(res, 404, { error: 'Endpoint not found.' }); return;
    }
    json(res, 200, result);
  } catch (error) {
    const e = error as Error & { status?: number };
    json(res, e.status || 400, { error: error instanceof z.ZodError ? error.issues.map(i => i.message).join('. ') : e.message || 'Request could not be completed.' });
  }
});
const io = new Server(server, { cors: { origin, credentials: true }, maxHttpBufferSize: 10000, allowRequest: (req, cb) => cb(null, !req.headers.origin || req.headers.origin === origin) });
io.use((socket, done) => {
  const role = socket.handshake.auth.role as Role;
  if (!roles.includes(role) || !authenticate(socket.request.headers.cookie, role, secret)) { done(new Error('Connect your view first.')); return; }
  socket.data.role = role; done();
});
io.on('connection', socket => {
  socket.join(socket.data.role); socket.emit('state', publicSnapshot(socket.data.role));
  socket.on('disconnect', () => {});
});
function broadcast() { for (const role of roles) io.to(role).emit('state', publicSnapshot(role)); }
store.onChange = () => { broadcast(); void tiger.flush(); };
tiger.onChange = broadcast;
void tiger.flush();
const analyticsTicker = setInterval(() => void tiger.flush(), 5000);
void solana.sync();
const solanaTicker = setInterval(() => void solana.sync(), 15000);
const ticker = setInterval(() => {
  store.tick();
  for (const [key, value] of limits) if (value.until < Date.now()) limits.delete(key);
  for (const socket of io.sockets.sockets.values()) if (!authenticate(socket.request.headers.cookie, socket.data.role, secret)) socket.disconnect(true);
}, 1000);
server.listen(port, hostname, () => console.log(`Tripwire ready at ${origin} · ${config.demo ? 'DEMO — mock payments, public role switching' : 'paired access'} mode`));
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  solana.stop(); clearInterval(ticker); clearInterval(analyticsTicker); clearInterval(solanaTicker); io.close(); server.close();
  await Promise.race([tiger.close(), new Promise(resolve => setTimeout(resolve, 2000))]);
  store.db.close(); process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

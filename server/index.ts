import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import next from 'next';
import { Server } from 'socket.io';
import { z } from 'zod';
import { Store } from './store';
import { authenticate, equal, issue, roles } from './auth';
import { enrichTranscript, inspect, speak } from './providers';
import { CallScheduler } from './call-scheduler';
import { configureGemini, summarizePayment, GeminiError } from './gemini';
import { providerStatuses } from './provider-status';
import type { Payment, Role } from '../lib/types';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
configureGemini();
const config = { demo: process.env.DEMO_MODE !== 'false', gemini: !!process.env.GEMINI_API_KEY, elevenlabs: !!process.env.ELEVENLABS_API_KEY };
if (!config.demo) for (const role of roles) if ((process.env[`${role.toUpperCase()}_ACCESS_CODE`] || '').length < 16) throw new Error(`${role.toUpperCase()}_ACCESS_CODE must contain at least 16 characters outside demo mode.`);
const store = new Store(join(process.env.DATA_DIR || './data', 'tripwire.sqlite'));
const callScheduler = new CallScheduler();
const publicConfig = () => ({ ...config, providers: providerStatuses() });
const summaryJobs = new Map<string, string>();
function paymentRevision(payment: Payment) { return JSON.stringify([payment.status, payment.score, payment.reasons]); }
function queueSummaries() {
  if (!config.gemini) return;
  for (const payment of store.state.payments.filter(p => p.status === 'held')) {
    const revision = paymentRevision(payment);
    if (summaryJobs.get(payment.id) === revision) continue;
    summaryJobs.set(payment.id, revision);
    const evidence = structuredClone(payment);
    const labels = store.state.call.assessment.tells.map(t => t.label);
    void summarizePayment(evidence, labels).then(summary => {
      const current = store.state.payments.find(p => p.id === evidence.id);
      if (current && current.status === 'held' && paymentRevision(current) === revision) {
        current.summary = summary; current.summarySource = 'gemini'; store.save();
      }
    }).catch(error => { if (!(error instanceof GeminiError)) console.error('Guardian summary failed unexpectedly.'); }).finally(() => broadcast());
  }
}
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
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY');
  const path = new URL(req.url || '/', origin).pathname;
  if (!path.startsWith('/api/')) { await handle(req, res); return; }
  try {
    if (req.headers.origin && req.headers.origin !== origin) throw Object.assign(new Error('This origin is not allowed. Check APP_ORIGIN.'), { status: 403 });
    if (req.method === 'GET' && path === '/api/config') { json(res, 200, publicConfig()); return; }
    if (req.method === 'GET' && path === '/api/health') { json(res, 200, { ok: true, storage: 'sqlite', mode: config.demo ? 'demo' : 'paired' }); return; }
    if (req.method !== 'GET' && (req.method !== 'POST' || req.headers['x-tripwire-client'] !== 'web')) throw Object.assign(new Error('Unsupported request.'), { status: 403 });
    const ip = req.socket.remoteAddress || 'local'; limit(ip, 240);
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (path === '/api/session' && req.method === 'POST') {
      limit(ip + ':session', 30);
      const input = z.object({ role: z.enum(roles), accessCode: z.string().max(256).optional() }).parse(body);
      if (!config.demo && !equal(input.accessCode || '', process.env[`${input.role.toUpperCase()}_ACCESS_CODE`] || '')) throw Object.assign(new Error('That access code did not match.'), { status: 401 });
      res.setHeader('Set-Cookie', `tw_${input.role}=${issue(input.role, secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
      json(res, 200, { ok: true }); return;
    }
    const role = z.enum(roles).parse(req.headers['x-tripwire-role']);
    if (!authenticate(req.headers.cookie, role, secret)) throw Object.assign(new Error('Connect your view to continue.'), { status: 401 });
    const permit = (...allowed: Role[]) => { if (!allowed.includes(role)) throw Object.assign(new Error('This action requires a different family role.'), { status: 403 }); };
    if (path === '/api/state' && req.method === 'GET') { store.tick(); json(res, 200, store.snapshot(role, publicConfig())); return; }
    if (req.method !== 'POST') { json(res, 404, { error: 'Endpoint not found.' }); return; }
    let result: unknown = { ok: true };
    switch (path) {
      case '/api/call/start': permit('protected'); z.object({ consent: z.literal(true) }).parse(body); store.startCall(); break;
      case '/api/call/end': permit('protected'); callScheduler.cancel(); store.endCall(); break;
      case '/api/call/line': {
        permit('protected');
        const input = z.object({ text: z.string().trim().min(1).max(3000), source: z.enum(['scripted', 'browser', 'manual', 'elevenlabs']).default('manual') }).parse(body);
        const id = store.addLine(input.text, input.source);
        const text = store.state.call.transcript.map(l => l.text).join(' ');
        // Deterministic warning is broadcast immediately; AI can only add risk afterward.
        if (config.gemini && id) {
          const labels = store.state.call.assessment.tells.map(t => t.label);
          callScheduler.submit(id, async () => {
            if (store.state.call.id !== id || !store.state.call.active) return;
            const assessment = await enrichTranscript(text, labels);
            if (assessment) store.enrichCall(id, assessment);
            broadcast();
          });
        }
        break;
      }
      case '/api/safe-word/set': {
        permit('protected', 'guardian');
        if (store.state.settings.safeWordConfigured && role !== 'guardian') throw new Error('Ask your guardian to change the existing safe word.');
        limit(ip + ':safe-set', 5);
        await store.setSafeWord(z.object({ word: z.string().trim().min(4).max(100) }).parse(body).word); break;
      }
      case '/api/safe-word/verify': permit('protected'); limit(ip + ':verify', 5); result = { matched: await store.verifyWord(z.object({ word: z.string().trim().min(1).max(100) }).parse(body).word) }; break;
      case '/api/callback/request': permit('protected', 'guardian'); result = store.requestCallback(); break;
      case '/api/callback/answer': { permit('relative'); const input = z.object({ id: z.string().uuid(), answer: z.enum(['yes', 'no']) }).parse(body); store.answerCallback(input.id, input.answer); break; }
      case '/api/payments': {
        permit('protected'); const input = z.object({ payee: z.string().trim().min(1).max(100), amount: z.number().positive().max(100000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most two decimal places'), rail: z.enum(['bill', 'bank', 'gift-card', 'crypto', 'wire']), newPayee: z.boolean(), pasted: z.boolean().optional() }).parse(body);
        result = store.createPayment(input); break;
      }
      case '/api/payments/review': { permit('protected'); const input = z.object({ id: z.string().uuid(), secret: z.boolean() }).parse(body); result = store.reviewPayment(input.id, input.secret); break; }
      case '/api/payments/decide': { permit('guardian'); const input = z.object({ id: z.string().uuid(), decision: z.enum(['approve', 'deny']) }).parse(body); result = store.decidePayment(input.id, input.decision); break; }
      case '/api/settings': permit('protected'); store.updateSettings(z.object({ retainFlaggedTranscripts: z.boolean().optional(), coSignLimit: z.number().min(0).max(100000).optional() }).parse(body)); break;
      case '/api/inspect': {
        permit('protected', 'guardian'); limit(ip + ':inspect', 12);
        const input = z.object({ text: z.string().max(20000).default(''), image: z.object({ data: z.string().max(7000000).regex(/^[A-Za-z0-9+/]*={0,2}$/), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']) }).optional() }).parse(body);
        if (!input.text.trim() && !input.image) throw new Error('Add a message, link, or screenshot first.');
        result = await inspect(input.text, input.image); break;
      }
      case '/api/speak': {
        permit('protected', 'guardian'); limit(ip + ':speak', 10);
        const audio = await speak(z.object({ text: z.string().min(1).max(1500) }).parse(body).text);
        if (!audio) { json(res, 200, { fallback: 'browser' }); return; }
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }); res.end(audio); return;
      }
      case '/api/demo/reset': permit('guardian'); if (!config.demo) throw new Error('Reset is available only in demo mode.'); callScheduler.cancel(); summaryJobs.clear(); store.reset(); break;
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
  socket.join(socket.data.role); socket.emit('state', store.snapshot(socket.data.role, publicConfig()));
  socket.on('disconnect', () => {});
});
function broadcast() { for (const role of roles) io.to(role).emit('state', store.snapshot(role, publicConfig())); }
store.onChange = () => { broadcast(); queueSummaries(); };
const ticker = setInterval(() => {
  store.tick();
  for (const [key, value] of limits) if (value.until < Date.now()) limits.delete(key);
  for (const socket of io.sockets.sockets.values()) if (!authenticate(socket.request.headers.cookie, socket.data.role, secret)) socket.disconnect(true);
}, 1000);
server.listen(port, hostname, () => console.log(`Tripwire ready at ${origin} · ${config.demo ? 'DEMO — mock payments, public role switching' : 'paired access'} mode`));
function shutdown() { callScheduler.cancel(); clearInterval(ticker); io.close(); server.close(); store.db.close(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import next from 'next';
import { z } from 'zod';
import { Demo, fallbackFinish } from './state';
import { Tiger } from './tiger';
import { GeminiError, mintTellerToken } from './gemini';
import { agentId, agentSignedUrl } from './elevenlabs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_BASE_URL || process.env.APP_ORIGIN || `http://localhost:${port}`;
const operatorKey = process.env.OPERATOR_KEY || '';
const tiger = new Tiger();
const config = {
  gemini: !!process.env.GEMINI_API_KEY, elevenlabs: !!process.env.ELEVENLABS_API_KEY,
  scammer: !!process.env.ELEVENLABS_API_KEY && !!agentId('scammer'), verifier: !!process.env.ELEVENLABS_API_KEY && !!agentId('verifier'),
  tiger: tiger.configured,
};
const demo = new Demo(config);
void tiger.caseCount().then(n => demo.setCaseNumberBase(n));

const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();

const limits = new Map<string, { count: number; until: number }>();
function limit(key: string, max: number) {
  const now = Date.now(); const current = limits.get(key);
  if (!current || now > current.until) { limits.set(key, { count: 1, until: now + 60000 }); return; }
  if (++current.count > max) throw Object.assign(new Error('Too many requests. Please wait a minute.'), { status: 429 });
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) throw Object.assign(new Error('Request too large.'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new Error('Invalid JSON request.'); }
}
/** Operator actions ring teammates' phones; when OPERATOR_KEY is set (hosted demo), they require it. */
function requireOperator(req: IncomingMessage) {
  if (!operatorKey) return;
  const given = Buffer.from(String(req.headers['x-operator-key'] || ''));
  const expected = Buffer.from(operatorKey);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw Object.assign(new Error('Operator key required.'), { status: 403 });
}

// ---- Server-sent events: every page gets the whole snapshot on each change ----
const streams = new Set<ServerResponse>();
function broadcast() { const data = `data: ${JSON.stringify(demo.snapshot())}\n\n`; for (const res of streams) res.write(data); }
demo.onChange = broadcast;
setInterval(() => { for (const res of streams) res.write(': keep-alive\n\n'); }, 20000).unref();

const amount = z.number().positive().max(100000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most two decimal places');
const payment = z.object({ payee: z.string().trim().min(1).max(80), amount, rail: z.enum(['instant', 'ach', 'bill-pay']) });

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
  const url = new URL(req.url || '/', origin); const path = url.pathname;
  if (!path.startsWith('/api/')) { await handle(req, res); return; }
  try {
    if (req.headers.origin && req.headers.origin !== origin) throw Object.assign(new Error('This origin is not allowed. Check PUBLIC_BASE_URL.'), { status: 403 });
    if (req.method === 'GET' && path === '/api/health') { json(res, 200, { ok: true, tiger: tiger.state, gemini: config.gemini, agents: { scammer: config.scammer, verifier: config.verifier }, hosting: process.env.HOSTING_PROVIDER || 'local', release: process.env.APP_RELEASE || null }); return; }
    if (req.method === 'GET' && path === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify(demo.snapshot())}\n\n`); streams.add(res);
      req.on('close', () => streams.delete(res)); return;
    }
    if (req.method === 'GET' && path === '/api/state') { json(res, 200, demo.snapshot()); return; }
    if (req.method === 'GET' && path === '/api/cases') {
      // This session's files first, then the family's history from Tiger Data.
      const live = demo.listCases(); const seen = new Set(live.map(c => c.id));
      json(res, 200, [...live, ...(await tiger.recentCases()).filter(c => !seen.has(c.id))]); return;
    }
    if (req.method === 'GET' && path.startsWith('/api/case/')) {
      const file = demo.getCase(decodeURIComponent(path.slice('/api/case/'.length)));
      if (!file) { json(res, 404, { error: 'Case file not found.' }); return; }
      json(res, 200, file); return;
    }
    if (req.method !== 'POST' || req.headers['x-tripwire-client'] !== 'web') throw Object.assign(new Error('Unsupported request.'), { status: 403 });
    const ip = req.socket.remoteAddress || 'local'; limit(ip, 600);
    const body = await readBody(req);
    let result: unknown = { ok: true };
    switch (path) {
      // ---- Rosa's bank app ----
      case '/api/phase': demo.setPhase(z.object({ phase: z.enum(['home', 'send']) }).parse(body).phase); break;
      case '/api/check': { const input = payment.parse(body); result = await tiger.check(input.payee, input.amount, input.rail); break; }
      case '/api/token': {
        limit(ip + ':token', 30);
        const input = payment.extend({ pushToTalk: z.boolean().default(false) }).parse(body);
        const check = await tiger.check(input.payee, input.amount, input.rail);
        if (!check.trigger) { result = { check }; break; }
        try { result = { check, ...(await mintTellerToken(check, demo.state.language, { pushToTalk: input.pushToTalk })) }; }
        catch (error) { if (error instanceof GeminiError) result = { check, error: error.message }; else throw error; }
        break;
      }
      case '/api/send': { const input = payment.parse(body); const check = await tiger.check(input.payee, input.amount, input.rail); demo.sent(check); result = check; break; }
      case '/api/caption': { limit(ip + ':caption', 240); const input = z.object({ who: z.enum(['rosa', 'teller']), text: z.string().max(1000) }).parse(body); demo.caption(input.who, input.text); break; }
      // ---- The teller's tools (run in the browser session, recorded here) ----
      case '/api/ring': {
        const input = z.object({ contact: z.enum(['diego', 'ana']).default('diego'), claim_summary: z.string().max(400).default('') }).parse(body);
        if (demo.state.phase !== 'tripwire') throw new Error('No payment is waiting on a call.');
        limit(ip + ':ring', 20);
        result = demo.callContact(input.contact, input.claim_summary); break;
      }
      case '/api/decision': {
        const input = z.object({ decision: z.enum(['hold', 'release']), reason: z.string().max(400).default(''), source: z.enum(['gemini', 'rules']).default('gemini') }).parse(body);
        result = demo.decide(input.decision, input.reason, input.source); break;
      }
      case '/api/finish': {
        const input = z.object({
          source: z.enum(['gemini', 'rules']).default('gemini'),
          job_name: z.string().max(200).default(''), impersonated: z.string().max(300).default(''),
          pressure_quotes: z.array(z.string().max(200)).max(8).default([]), cover_quote: z.string().max(300).default(''),
          getaway: z.string().max(300).default(''), foiled_by: z.string().max(300).default(''), tip: z.string().max(300).default(''),
          rosa_said: z.string().max(4000).default(''),
        }).parse(body);
        if (!demo.state.check) throw new Error('No payment in progress.');
        const fields = input.source === 'rules' ? fallbackFinish(input.rosa_said, demo.state.check, demo.state.result?.status, demo.state.language) : input;
        const file = demo.finish(fields, input.source);
        void tiger.saveCase(file).then(saved => { if (saved) demo.markStored(file.id); });
        result = file; break;
      }
      // ---- Phones ----
      case '/api/ring/status': { const input = z.object({ id: z.string().uuid(), status: z.enum(['answered', 'ended']) }).parse(body); result = demo.ringStatus(input.id, input.status); break; }
      case '/api/agent/session': {
        limit(ip + ':agent', 30);
        const input = z.object({ id: z.string().uuid() }).parse(body);
        const ring = demo.state.ring;
        if (!ring || ring.id !== input.id || ring.status === 'ended') throw new Error('This call is no longer active.');
        result = { signedUrl: await agentSignedUrl(ring.agent), variables: ring.variables }; break;
      }
      case '/api/result': {
        // The verifier's report_result client tool on Diego's phone.
        const input = z.object({ id: z.string().uuid(), status: z.enum(['not_me', 'confirmed', 'no_answer']), note: z.string().max(300).default('') }).parse(body);
        if (demo.state.ring?.id !== input.id || demo.state.ring.agent !== 'verifier') throw new Error('This verification call is no longer active.');
        result = demo.result(input.status, input.note, 'verifier'); break;
      }
      // ---- Operator (hidden page) ----
      case '/api/operator/scam': requireOperator(req); result = demo.scamCall(); break;
      case '/api/operator/call-diego': requireOperator(req); result = demo.callContact('diego', 'you were arrested and need bail money today'); break;
      case '/api/operator/force': { requireOperator(req); const input = z.object({ status: z.enum(['not_me', 'confirmed', 'no_answer']) }).parse(body); result = demo.result(input.status, input.status === 'not_me' ? 'Diego is safe and did not ask for money.' : input.status === 'confirmed' ? 'Diego confirmed he asked for the money.' : 'Diego did not answer.', 'operator'); break; }
      case '/api/operator/reset': requireOperator(req); demo.reset(); break;
      case '/api/operator/language': requireOperator(req); demo.setLanguage(z.object({ language: z.enum(['en', 'es']) }).parse(body).language); break;
      case '/api/operator/push-to-talk': requireOperator(req); demo.setPushToTalk(z.object({ on: z.boolean() }).parse(body).on); break;
      case '/api/operator/coach': requireOperator(req); demo.setCoach(z.object({ coach: z.boolean() }).parse(body).coach); break;
      default: json(res, 404, { error: 'Endpoint not found.' }); return;
    }
    json(res, 200, result);
  } catch (error) {
    const e = error as Error & { status?: number };
    json(res, e.status || 400, { error: error instanceof z.ZodError ? error.issues.map(i => i.message).join('. ') : e.message || 'Request could not be completed.' });
  }
});
server.listen(port, hostname, () => console.log(`Tripwire ready at ${origin} · Gemini ${config.gemini ? 'on' : 'off'} · agents ${config.scammer ? 'scammer' : '-'}/${config.verifier ? 'verifier' : '-'} · Tiger ${config.tiger ? 'on' : 'local'}`));
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  for (const res of streams) res.end();
  server.close();
  await Promise.race([tiger.close(), new Promise(resolve => setTimeout(resolve, 2000))]);
  process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

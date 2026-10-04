import { z } from 'zod';
import type { Language } from '../lib/types';
import { configureProvider, providerFailure, providerSuccess } from './provider-status';
import type { PhoneAgent } from '../lib/phone-agents';

export function agentId(role: PhoneAgent = 'scammer') {
  return role === 'verifier' ? process.env.EL_AGENT_VERIFIER_ID : process.env.EL_AGENT_SCAMMER_ID || process.env.ELEVENLABS_AGENT_ID;
}

export function voiceModel() { return process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5'; }
export function configureElevenLabs() {
  configureProvider('elevenlabsVoice', !!process.env.ELEVENLABS_API_KEY, voiceModel());
  configureProvider('elevenlabsAgent', !!process.env.ELEVENLABS_API_KEY && !!agentId(), 'scammer agent');
  configureProvider('elevenlabsVerifier', !!process.env.ELEVENLABS_API_KEY && !!agentId('verifier'), 'verifier agent');
}
type Capability = 'elevenlabsVoice' | 'elevenlabsAgent' | 'elevenlabsVerifier';
async function call(path: string, capability: Capability, init: { method?: string; body?: unknown } = {}) {
  configureElevenLabs();
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ElevenLabs is not configured. Use browser voice or the operator microphone.');
  const started = Date.now();
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/' + path, {
      method: init.method || 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'quota limited' : response.status === 401 || response.status === 403 ? 'authentication failed' : 'provider unavailable');
    console.info(JSON.stringify({ provider: 'elevenlabs', capability, latencyMs: Date.now() - started }));
    return response;
  } catch (error) {
    const known = ['quota limited', 'authentication failed', 'provider unavailable'];
    const category = error instanceof Error && known.includes(error.message) ? error.message : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network failure';
    providerFailure(capability, category);
    console.warn(JSON.stringify({ provider: 'elevenlabs', capability, latencyMs: Date.now() - started, error: category }));
    throw new Error(`ElevenLabs ${category}. Use the browser fallback.`);
  }
}
export function voiceFor(language: Language) {
  return (language === 'es' && process.env.ELEVENLABS_VOICE_ID_ES) || process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
}
/** Low-latency streaming TTS: the response body starts flowing before synthesis ends. */
export async function speakStream(text: string, language: Language) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  const response = await call(`text-to-speech/${encodeURIComponent(voiceFor(language))}/stream?output_format=mp3_44100_64&optimize_streaming_latency=3`, 'elevenlabsVoice', { body: { text, model_id: voiceModel(), language_code: language } });
  if (!response.headers.get('content-type')?.startsWith('audio/') || !response.body) { providerFailure('elevenlabsVoice', 'invalid response'); throw new Error('Tripwire voice unavailable. Use browser voice.'); }
  providerSuccess('elevenlabsVoice'); return response.body;
}
/** Only the configured server-side agent IDs are used to mint sessions. */
export async function agentSignedUrl(role: PhoneAgent = 'scammer') {
  const agent = agentId(role);
  const capability = role === 'verifier' ? 'elevenlabsVerifier' : 'elevenlabsAgent';
  if (!agent) throw new Error(`Configure the ${role} agent with npm run setup:agent -- --role=${role}.`);
  const response = await call(`convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent)}`, capability, { method: 'GET' });
  const parsed = z.object({ signed_url: z.string().url() }).safeParse(await response.json());
  if (!parsed.success) { providerFailure(capability, 'invalid response'); throw new Error('ElevenLabs returned an invalid agent session.'); }
  providerSuccess(capability); return parsed.data.signed_url;
}

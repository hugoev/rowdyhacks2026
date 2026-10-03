import { z } from 'zod';
import { configureProvider, providerFailure, providerSuccess } from './provider-status';

export function voiceModel() { return process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5'; }
export function configureElevenLabs() {
  configureProvider('elevenlabsVoice', !!process.env.ELEVENLABS_API_KEY, voiceModel());
  configureProvider('elevenlabsTranscription', !!process.env.ELEVENLABS_API_KEY, 'scribe_v2_realtime');
}
async function call(path: string, capability: 'elevenlabsVoice' | 'elevenlabsTranscription', body?: unknown) {
  configureElevenLabs();
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ElevenLabs is not configured. Choose browser voice or transcription.');
  const started = Date.now();
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/' + path, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'quota limited' : response.status === 401 || response.status === 403 ? 'authentication failed' : 'provider unavailable');
    console.info(JSON.stringify({ provider: 'elevenlabs', capability, latencyMs: Date.now() - started }));
    return response;
  } catch (error) {
    const known = ['quota limited', 'authentication failed', 'provider unavailable'];
    const category = error instanceof Error && known.includes(error.message) ? error.message : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network failure';
    providerFailure(capability, category);
    console.warn(JSON.stringify({ provider: 'elevenlabs', capability, latencyMs: Date.now() - started, error: category }));
    throw new Error(`ElevenLabs ${category}. Choose the browser fallback or scripted demo.`);
  }
}
export async function transcriptionToken() {
  const response = await call('single-use-token/realtime_scribe', 'elevenlabsTranscription');
  const parsed = z.object({ token: z.string().min(1) }).safeParse(await response.json());
  if (!parsed.success) { providerFailure('elevenlabsTranscription', 'invalid response'); throw new Error('ElevenLabs returned an invalid token. Choose browser transcription.'); }
  // Token issuance alone does not prove a live Scribe session works.
  return parsed.data.token;
}
export async function speak(text: string) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  const response = await call(`text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb')}`, 'elevenlabsVoice', { text, model_id: voiceModel() });
  if (!response.headers.get('content-type')?.startsWith('audio/')) { providerFailure('elevenlabsVoice', 'invalid response'); throw new Error('Warning audio unavailable. Use browser voice.'); }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) { providerFailure('elevenlabsVoice', 'invalid response'); throw new Error('Warning audio was empty. Use browser voice.'); }
  providerSuccess('elevenlabsVoice'); return audio;
}

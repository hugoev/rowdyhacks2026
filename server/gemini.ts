import { GoogleGenAI } from '@google/genai';
import { liveModel, tellerConfig } from '../lib/teller-config';
import { scammerConfig } from '../lib/scammer-config';
import type { LiveConnectConfig } from '@google/genai';
import type { Language, RiskCheck } from '../lib/types';

export class GeminiError extends Error {}

/**
 * Mints a short-lived, single-use Live API token with the teller's model and
 * full config (system instruction with Rosa's payment context, tools) locked
 * in. The API key never leaves the server and the browser can't alter the prompt.
 */
export async function mintTellerToken(check: RiskCheck, language: Language, options: { pushToTalk?: boolean } = {}) {
  return mint(tellerConfig(check, language, { pushToTalk: options.pushToTalk, voice: process.env.GEMINI_VOICE || undefined }));
}
/** The demo's scam caller on Rosa's phone (stock voice, prompt locked server-side). */
export async function mintScammerToken(coach: boolean) { return mint(scammerConfig(coach)); }

async function mint(config: LiveConnectConfig) {
  if (!process.env.GEMINI_API_KEY) throw new GeminiError('Gemini is not configured. Set GEMINI_API_KEY.');
  const model = liveModel();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
  const now = Date.now();
  try {
    const token = await ai.authTokens.create({ config: {
      uses: 1,
      expireTime: new Date(now + 15 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
      liveConnectConstraints: { model, config },
      httpOptions: { apiVersion: 'v1alpha' },
    } });
    if (!token.name) throw new Error('empty token');
    return { token: token.name, model, config };
  } catch (error) {
    console.warn(JSON.stringify({ provider: 'gemini', task: 'token', error: (error as Error).message?.slice(0, 120) }));
    throw new GeminiError('Gemini Live token unavailable.');
  }
}

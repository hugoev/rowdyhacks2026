import { GoogleGenAI } from '@google/genai';
import { liveConfig, liveModel } from '../lib/live-config';
import type { Language } from '../lib/types';
import { configureProvider, providerFailure } from './provider-status';

export function configureGemini() { configureProvider('geminiLive', !!process.env.GEMINI_API_KEY, liveModel()); }
export class GeminiError extends Error {
  constructor(public category: string) { super(`Gemini Live ${category}. The rule spotter keeps protecting this call.`); }
}

/**
 * Mints a short-lived, single-use Live API token locked to our model and config.
 * The real API key never leaves the server.
 */
export async function mintLiveToken(language: Language, handle?: string) {
  configureGemini();
  if (!process.env.GEMINI_API_KEY) throw new GeminiError('not configured');
  const model = liveModel();
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
    const now = Date.now();
    const token = await ai.authTokens.create({ config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
      liveConnectConstraints: { model, config: liveConfig(language, handle) },
      httpOptions: { apiVersion: 'v1alpha' },
    } });
    if (!token.name) throw new Error('empty token');
    return { token: token.name, model, expiresAt: now + 30 * 60_000 };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const category = /401|403|permission|api key/i.test(message) ? 'authentication failed' : /429|quota/i.test(message) ? 'quota limited' : 'token unavailable';
    providerFailure('geminiLive', category);
    console.warn(JSON.stringify({ provider: 'gemini', task: 'live-token', error: category }));
    throw new GeminiError(category);
  }
}

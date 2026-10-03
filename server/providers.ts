import { assessTranscript } from '../lib/risk';
import type { Assessment, ScanResult } from '../lib/types';
import { analyzeCall, analyzeScan, GeminiError } from './gemini';

export async function enrichTranscript(text: string, labels: string[] = []): Promise<Assessment | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try { return await analyzeCall(text, labels); }
  catch (error) { if (error instanceof GeminiError) return null; throw error; }
}
export async function inspect(text: string, image?: { data: string; mimeType: string }): Promise<ScanResult> {
  let failure: string | undefined;
  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await analyzeScan(text, image);
      return { ...result, verdict: result.score >= 60 ? 'Strong scam warning signs' : result.score >= 30 ? 'Pause and verify' : 'No red flags found', source: 'gemini' };
    } catch (error) {
      if (!(error instanceof GeminiError)) throw error;
      if (image && !text.trim()) throw new Error('Image analysis is temporarily unavailable. Paste the text from the image to use the rules fallback.');
      failure = error.message;
    }
  }
  if (image && !text.trim()) throw new Error('Screenshot analysis needs GEMINI_API_KEY. You can paste the text from the screenshot to inspect it without an API key.');
  const assessment = assessTranscript(text);
  const redFlags = assessment.tells.map(t => t.label + ': “' + t.phrase + '”');
  for (const match of text.matchAll(/https?:\/\/[^\s]+/g)) {
    try {
      const url = new URL(match[0]);
      if (url.protocol === 'http:') redFlags.push('Link does not use HTTPS');
      if (url.username || /(?:\d{1,3}\.){3}\d{1,3}|xn--|\.example$/.test(url.hostname)) redFlags.push('Unusual or demonstration link: ' + url.hostname);
    } catch { redFlags.push('Malformed link'); }
  }
  const score = Math.min(100, assessment.score + (redFlags.length > assessment.tells.length ? 15 : 0));
  return { score, verdict: score >= 60 ? 'Strong scam warning signs' : score >= 30 ? 'Pause and verify' : 'No red flags found', redFlags, explanation: score >= 30 ? assessment.advice + ' You did nothing wrong by checking.' : 'The local rules did not find a known pattern in this text. That does not verify the sender or the request.', nextStep: 'Contact the person or organization using a number or app you already trust.', source: 'rules', limitations: (failure ? failure + ' ' : '') + (image ? 'The image was not analyzed; this result covers only the text you supplied.' : 'Pattern matching only. Links are inspected as text, never opened or reputation-checked.') };
}
export async function speak(text: string) {
  if (!process.env.ELEVENLABS_API_KEY) return null;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb')}`, {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Warning voice unavailable. Use your browser voice.');
  return Buffer.from(await response.arrayBuffer());
}

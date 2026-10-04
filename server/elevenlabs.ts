import { z } from 'zod';
import type { AgentKind } from '../lib/types';

export function agentId(kind: AgentKind) {
  // ELEVENLABS_AGENT_ID is the pre-v3 name for the scammer agent.
  return kind === 'scammer' ? process.env.EL_AGENT_SCAMMER_ID || process.env.ELEVENLABS_AGENT_ID || '' : process.env.EL_AGENT_VERIFIER_ID || '';
}
/** Signed URL for one ElevenLabs agent conversation; the API key stays on the server. */
export async function agentSignedUrl(kind: AgentKind) {
  const id = agentId(kind);
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ElevenLabs is not configured. Set ELEVENLABS_API_KEY.');
  if (!id) throw new Error(`Configure the ${kind} agent with npm run setup:agent -- --role=${kind} (sets ${kind === 'scammer' ? 'EL_AGENT_SCAMMER_ID' : 'EL_AGENT_VERIFIER_ID'}).`);
  const started = Date.now();
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status === 401 || response.status === 403 ? 'authentication failed' : response.status === 429 ? 'quota limited' : 'unavailable'}.`);
  const parsed = z.object({ signed_url: z.string().url() }).safeParse(await response.json());
  if (!parsed.success) throw new Error('ElevenLabs returned an invalid agent session.');
  console.info(JSON.stringify({ provider: 'elevenlabs', agent: kind, latencyMs: Date.now() - started }));
  return parsed.data.signed_url;
}

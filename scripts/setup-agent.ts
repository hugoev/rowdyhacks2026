import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { z } from 'zod';
import { phoneAgentConfig, type PhoneAgent } from '../lib/phone-agents';

const roleArg = z.enum(['both', 'scammer', 'verifier']).parse(process.argv.find(arg => arg.startsWith('--role='))?.slice(7) || 'both');
const roles: PhoneAgent[] = roleArg === 'both' ? ['verifier', 'scammer'] : [roleArg];
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('Set ELEVENLABS_API_KEY in the private .env.');

function saveAgent(name: string, value: string) {
  const path = '.env';
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const line = `${name}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const updated = pattern.test(source) ? source.replace(pattern, () => line) : source.trimEnd() + '\n' + line + '\n';
  writeFileSync(path, updated, { mode: 0o600 });
  process.env[name] = value;
}

for (const role of roles) {
  const name = role === 'verifier' ? 'EL_AGENT_VERIFIER_ID' : 'EL_AGENT_SCAMMER_ID';
  const existing = parse(existsSync('.env') ? readFileSync('.env') : '')[name] || process.env[name];
  if (existing) { console.log(`${role}: already configured; no duplicate created.`); continue; }
  if (role === 'scammer') {
    const consent = process.env.ELEVENLABS_SCAMMER_CONSENT_PATH;
    if (!consent || !existsSync(consent) || !readFileSync(consent, 'utf8').trim()) {
      throw new Error('Scammer setup needs the voice owner consent note via ELEVENLABS_SCAMMER_CONSENT_PATH. Verifier setup can run independently.');
    }
    if (!process.env.ELEVENLABS_SCAMMER_VOICE_ID) throw new Error('Set ELEVENLABS_SCAMMER_VOICE_ID to the consenting voice owner clone.');
  }
  const voice = role === 'scammer' ? process.env.ELEVENLABS_SCAMMER_VOICE_ID! : process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(phoneAgentConfig(role, voice)), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${role} creation failed (HTTP ${response.status}); no credentials logged.`);
  const { agent_id } = z.object({ agent_id: z.string().min(1) }).parse(await response.json());
  saveAgent(name, agent_id);
  console.log(`${role}: created; saved ${name} to private .env.`);
}

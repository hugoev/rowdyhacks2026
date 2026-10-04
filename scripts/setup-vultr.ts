import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';

if (existsSync('.env.vultr')) throw new Error('.env.vultr already exists; edit it without replacing its access codes.');
const local = existsSync('.env') ? parse(readFileSync('.env')) : {};
let template = readFileSync('deploy/vultr/env.example', 'utf8');
for (const role of ['PROTECTED', 'GUARDIAN', 'RELATIVE']) template = template.replace(`${role}_ACCESS_CODE=`, `${role}_ACCESS_CODE=${randomBytes(24).toString('hex')}`);
for (const key of ['GEMINI_API_KEY', 'GEMINI_LIVE_MODEL', 'ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'EL_AGENT_SCAMMER_ID', 'EL_AGENT_VERIFIER_ID', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_VOICE_ID_ES', 'ELEVENLABS_TTS_MODEL', 'DATABASE_URL', 'TIGER_DATABASE_URL', 'TIGER_CA_CERT', 'SOLANA_PROGRAM_ID', 'SOLANA_GUARDIAN_PUBLIC_KEY', 'SOLANA_RECIPIENT_PUBLIC_KEY', 'SOLANA_RPC_URL']) {
  if (local[key]) template = template.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${JSON.stringify(local[key])}`);
}
writeFileSync('.env.vultr', template, { mode: 0o600, flag: 'wx' });
console.log('Created private .env.vultr with unique role codes and any existing local provider keys. Set TRIPWIRE_DOMAIN and ACME_EMAIL before deploying.');

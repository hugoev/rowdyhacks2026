import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';

if (existsSync('.env.vultr')) throw new Error('.env.vultr already exists; edit it without replacing its access codes.');
const local = existsSync('.env') ? parse(readFileSync('.env')) : {};
let template = readFileSync('deploy/vultr/env.example', 'utf8');
for (const role of ['PROTECTED', 'GUARDIAN', 'RELATIVE']) template = template.replace(`${role}_ACCESS_CODE=`, `${role}_ACCESS_CODE=${randomBytes(24).toString('hex')}`);
for (const key of ['GEMINI_API_KEY', 'ELEVENLABS_API_KEY']) {
  if (local[key]) template = template.replace(`${key}=`, `${key}=${JSON.stringify(local[key])}`);
}
writeFileSync('.env.vultr', template, { mode: 0o600, flag: 'wx' });
console.log('Created private .env.vultr with unique role codes and any existing local provider keys. Set TRIPWIRE_DOMAIN and ACME_EMAIL before deploying.');

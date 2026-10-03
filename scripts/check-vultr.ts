import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { vultrConfigSchema } from './vultr-config';

const result = vultrConfigSchema.safeParse(parse(readFileSync('.env.vultr')));
if (!result.success) {
  console.error(result.error.issues.map(issue => `${issue.path.join('.') || 'configuration'}: ${issue.message}`).join('\n'));
  process.exit(1);
}
if (process.argv.includes('--domain')) console.log(result.data.TRIPWIRE_DOMAIN);
else console.log('Vultr configuration is valid. Credentials were not printed.');

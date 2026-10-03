import test from 'node:test';
import assert from 'node:assert/strict';
import { vultrConfigSchema } from '../scripts/vultr-config';

const config = { TRIPWIRE_DOMAIN: 'tripwire.test', ACME_EMAIL: 'owner@tripwire.test', PROTECTED_ACCESS_CODE: 'protected-code-123456', GUARDIAN_ACCESS_CODE: 'guardian-code-1234567', RELATIVE_ACCESS_CODE: 'relative-code-1234567' };
test('Vultr deployment requires a real hostname, contact, and distinct role codes', () => {
  assert.equal(vultrConfigSchema.safeParse(config).success, true);
  for (const domain of ['https://tripwire.test', 'tripwire.test/path', 'tripwire.test:3000', 'tripwire.your-domain.example', '127.0.0.1', 'tripwire.test\nmalicious']) {
    assert.equal(vultrConfigSchema.safeParse({ ...config, TRIPWIRE_DOMAIN: domain }).success, false);
  }
  assert.equal(vultrConfigSchema.safeParse({ ...config, ACME_EMAIL: 'your-email@example.com' }).success, false);
  assert.equal(vultrConfigSchema.safeParse({ ...config, GUARDIAN_ACCESS_CODE: config.PROTECTED_ACCESS_CODE }).success, false);
  assert.equal(vultrConfigSchema.safeParse({ ...config, RELATIVE_ACCESS_CODE: '' }).success, false);
});

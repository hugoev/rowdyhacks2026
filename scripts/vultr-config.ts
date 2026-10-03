import { z } from 'zod';

export const vultrConfigSchema = z.object({
  TRIPWIRE_DOMAIN: z.string().regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Use a domain name without a scheme, path, or port').refine(value => !value.endsWith('.example'), 'Replace the example domain'),
  ACME_EMAIL: z.email().refine(value => !value.endsWith('@example.com'), 'Set your certificate contact email'),
  PROTECTED_ACCESS_CODE: z.string().min(16),
  GUARDIAN_ACCESS_CODE: z.string().min(16),
  RELATIVE_ACCESS_CODE: z.string().min(16),
}).superRefine((value, ctx) => {
  if (new Set([value.PROTECTED_ACCESS_CODE, value.GUARDIAN_ACCESS_CODE, value.RELATIVE_ACCESS_CODE]).size !== 3) ctx.addIssue({ code: 'custom', message: 'Use different access codes for each role' });
});

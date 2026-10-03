import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Role } from '../lib/types';
export const roles: Role[] = ['protected', 'guardian', 'relative'];
export function equal(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function issue(role: Role, secret: string) {
  const payload = Buffer.from(JSON.stringify({ role, expires: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}
export function authenticate(cookie: string | undefined, role: Role, secret: string): boolean {
  try {
    const token = cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`tw_${role}=`))?.slice(`tw_${role}=`.length);
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!equal(signature, createHmac('sha256', secret).update(payload).digest('base64url'))) return false;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return claims.role === role && claims.expires > Date.now();
  } catch { return false; }
}

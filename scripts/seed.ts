// Creates the Tiger Data schema (transactions hypertable, continuous aggregate,
// cases) and seeds Rosa's 12 months of synthetic payments. Safe to re-run.
import 'dotenv/config';
import { scamPayment, billPayment } from '../lib/demo-data';
import { Tiger, tigerUrl } from '../server/tiger';

if (!tigerUrl()) throw new Error('Set TIGER_DATABASE_URL (or DATABASE_URL) in .env first.');
const tiger = new Tiger();
try {
  const n = await tiger.seed();
  console.log(`Seeded ${n} synthetic payments for Rosa.`);
  for (const p of [scamPayment, billPayment]) {
    const check = await tiger.check(p.payee, p.amount, p.rail);
    console.log(`${check.source.toUpperCase()}  $${p.amount} → ${p.payee}: typical $${check.typical}, ${check.multiple}x, ${check.isNewPayee ? 'new payee' : 'known payee'} → ${check.trigger ? 'TRIPWIRE' : 'sends'}`);
    if (check.source !== 'tiger') throw new Error('The risk query fell back to local data; see the warning above.');
  }
} finally { await tiger.close(); }

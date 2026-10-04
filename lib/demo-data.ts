import type { ContactId, Rail } from './types';

// One user, one payee, one contact. Synthetic data only.
export const rosa = { name: 'Rosa', age: 74, balance: 8412.37, account: 'Checking ···4417' };
export const contacts: Record<ContactId, { name: string; relation: string; relationEs: string; phone: string }> = {
  diego: { name: 'Diego', relation: 'grandson', relationEs: 'nieto', phone: '(210) 555-0182' },
  ana: { name: 'Ana', relation: 'daughter', relationEs: 'hija', phone: '(210) 555-0127' },
};
export const scamPayment = { payee: 'M. Ellis Legal', amount: 2500, rail: 'instant' as Rail };
export const billPayment = { payee: 'City Electric', amount: 40, rail: 'bill-pay' as Rail };
export const railLabels: Record<Rail, string> = { instant: 'Instant transfer', ach: 'Standard transfer (1–3 days)', 'bill-pay': 'Bill pay' };

export type Transaction = { ts: Date; payee: string; amount: number; rail: Rail };

/**
 * Twelve months of Rosa's ordinary payments, deterministic so the demo's
 * "about 29 times what you usually send" line is the same every run.
 * Her typical (median) payment comes out at about $86.
 */
export function seedTransactions(now = new Date('2026-10-04T12:00:00Z')): Transaction[] {
  const monthly: [string, number, number, Rail][] = [
    // payee, day of month, amount, rail
    ['City Electric', 3, 38, 'bill-pay'], ['SAWS Water', 6, 52, 'bill-pay'], ['CPS Energy Gas', 9, 41, 'bill-pay'],
    ['AT&T Phone', 12, 65, 'bill-pay'], ['Walgreens Pharmacy', 14, 86, 'ach'], ['H-E-B Groceries', 5, 112, 'ach'],
    ['H-E-B Groceries', 19, 97, 'ach'], ['St. Mary’s Church', 7, 100, 'ach'], ['Diego Garcia', 1, 50, 'instant'],
    ['Medicare Part B', 15, 175, 'ach'], ['Spectrum Internet', 20, 86, 'ach'], ['Bexar County Tax Office', 25, 140, 'ach'],
  ];
  const out: Transaction[] = [];
  for (let back = 12; back >= 1; back--) {
    for (const [payee, day, amount, rail] of monthly) {
      const ts = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day, 15));
      // Small, deterministic month-to-month variation, like real bills.
      const wobble = ((back * 7 + day * 3) % 9) - 4;
      out.push({ ts, payee, amount: Math.max(5, amount + (rail === 'bill-pay' ? wobble : 0)), rail });
    }
  }
  return out;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

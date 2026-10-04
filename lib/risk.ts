import type { Rail, RiskCheck } from './types';

/** Instant transfers can't be pulled back once sent. */
export const irreversible = (rail: Rail) => rail === 'instant';

/**
 * The whole risk rule, on purpose: no ML, no score. Tripwire opens when the
 * amount is over 5x Rosa's typical payment AND it goes to a new payee or by
 * an irreversible rail. A $40 bill to a known payee never sees Tripwire.
 */
export function riskRule(input: { payee: string; amount: number; rail: Rail; typical: number; knownPayees: Iterable<string> }, source: RiskCheck['source']): RiskCheck {
  const known = new Set([...input.knownPayees].map(p => p.trim().toLowerCase()));
  const isNewPayee = !known.has(input.payee.trim().toLowerCase());
  const typical = Math.round(input.typical * 100) / 100;
  const ratio = typical > 0 ? input.amount / typical : 0;
  const multiple = ratio < 10 ? Math.round(ratio * 10) / 10 : Math.round(ratio);
  const trigger = typical > 0 && input.amount > 5 * typical && (isNewPayee || irreversible(input.rail));
  return { payee: input.payee.trim(), amount: input.amount, rail: input.rail, isNewPayee, typical, multiple, trigger, source };
}

import type { Lever } from './types';

export const levers: Lever[] = ['trust', 'emotion', 'urgency', 'isolation', 'payment'];
export const leverLabels: Record<Lever, string> = { trust: 'Trust', emotion: 'Emotion', urgency: 'Urgency', isolation: 'Isolation', payment: 'Payment pressure' };

// Deterministic backup spotter. It runs on the live input transcription and only
// lights a lever the model has not lit yet; the UI tags these signals "rule".
// Patterns stay narrow so ordinary calls ("Hi Grandma, dinner Sunday?") stay quiet.
const rules: Record<Lever, RegExp> = {
  trust: /\b(this is (?:officer|agent|detective) \w+|from the (?:IRS|internal revenue|social security)|(?:bank['’]?s?|your bank['’]?s?) fraud (?:department|team)|microsoft support|tech support)\b|\b(soy (?:el oficial|del banco))\b/i,
  emotion: /\b(i (?:got|was|have been) arrested|in jail|car accident|a warrant|you will be arrested|computer (?:has|is infected with) a virus|estoy en la cárcel|me arrestaron|tuve un accidente)\b/i,
  urgency: /\b(right now|immediately|hurry|no time|within (?:the next )?\w+ (?:minutes|hours)|act now|ahora mismo|inmediatamente|apúrate|no hay tiempo)\b/i,
  isolation: /\b(don['’]?t tell|do not tell|keep (?:this|it) (?:a )?secret|between (?:you and me|us)|tell no one|don['’]?t call (?:anyone|the bank)|no le digas|no le cuentes|es un secreto)\b/i,
  payment: /\b(gift cards?|card codes?|bail money|for (?:the )?bail|wire (?:the )?(?:money|transfer)|bitcoin|crypto|safe account|move your (?:money|savings)|tarjetas de regalo|la fianza|cuenta segura)\b/i,
};

/** Quotes the caller's whole clause around the match ("don't tell Mom"), not just the keyword. */
function clause(text: string, index: number, length: number) {
  const before = text.slice(0, index); const after = text.slice(index + length);
  // ", " ends a clause; "$2,500" does not.
  const start = Math.max(...['. ', '! ', '? ', '; ', ', ', '¿', '¡'].map(mark => { const at = before.lastIndexOf(mark); return at < 0 ? 0 : at + mark.length; }));
  const endMatch = after.search(/[.!?;](?:\s|$)|, /);
  return (before.slice(start) + text.slice(index, index + length) + (endMatch < 0 ? after : after.slice(0, endMatch))).trim().slice(0, 120);
}
export function spotLevers(text: string): { lever: Lever; quote: string }[] {
  return levers.flatMap(lever => { const match = rules[lever].exec(text); return match ? [{ lever, quote: clause(text, match.index, match[0].length) }] : []; });
}

/** Lever-weighted score: each distinct lever adds pressure; isolation and failed trust are decisive. */
export function leverScore(lit: Set<Lever>, familyWordFailed: boolean, guardianBlocked: boolean) {
  const weights: Record<Lever, number> = { trust: 25, emotion: 20, urgency: 15, isolation: 30, payment: 25 };
  let score = [...lit].reduce((sum, lever) => sum + weights[lever], 0);
  if (lit.has('isolation') && (lit.has('payment') || lit.has('emotion'))) score = Math.max(score, 85);
  if (familyWordFailed) score = Math.max(score, 90);
  if (guardianBlocked) score = 100;
  return Math.min(100, score);
}

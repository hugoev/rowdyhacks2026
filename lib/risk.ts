import type { Assessment, Level, Rail, Tell } from './types';

const patterns = [
  { id: 'government', label: 'Government impostor', regex: /\b(IRS|internal revenue|social security|tax department|federal agent)\b/i, weight: 25, advice: 'An unexpected caller claiming to be a government agency needs independent verification.' },
  { id: 'arrest', label: 'Threat of arrest', regex: /\b(arrest|warrant|police will|deported)\b/i, weight: 25, advice: 'Threats of immediate arrest are a common pressure tactic.' },
  { id: 'urgency', label: 'Artificial urgency', regex: /\b(right now|immediately|urgent|hurry|within .*minutes|act now|today only)\b/i, weight: 20, advice: 'You have time to pause and verify this request.' },
  { id: 'secrecy', label: 'Keep-it-secret request', regex: /\b(don.t tell|keep (?:this |it |a )?secret|between (?:you and me|us)|tell no one)\b/i, weight: 40, advice: 'Someone asking you to keep a money request secret is isolating you from help.' },
  { id: 'family', label: 'Family emergency', regex: /\b(bail|in jail|arrested|car accident)\b/i, weight: 20, advice: 'Ask for your family safe word, then call your relative on a number you already trust.' },
  { id: 'gift-card', label: 'Gift-card payment', regex: /\b(gift cards?|apple cards?|google play cards?|scratch off|card codes?)\b/i, weight: 30, advice: 'Gift-card codes are like cash. Do not share them with a caller.' },
  { id: 'crypto', label: 'Crypto payment pressure', regex: /\b(bitcoin|crypto|cryptocurrency|bitcoin ATM)\b/i, weight: 25, advice: 'Pause before sending cryptocurrency to someone who contacted you.' },
  { id: 'safe-account', label: '“Safe account” story', regex: /\b(safe account|secure account|move your (?:money|savings)|transfer your savings)\b/i, weight: 45, advice: 'Call your bank using the number on your card before moving money.' },
  { id: 'tech', label: 'Remote-access request', regex: /\b(remote access|teamviewer|anydesk|computer.*virus|microsoft support|tech support)\b/i, weight: 30, advice: 'Do not give an unexpected caller remote access to your device.' },
  { id: 'romance', label: 'Online relationship + money', regex: /\b(never met|my love|overseas|deployment|oil rig)\b/i, weight: 15, advice: 'Verify an online relationship independently before sending money.' },
  { id: 'money', label: 'Request for money', regex: /\b(send (?:me |the )?money|wire|pay me|transfer|medical bills|plane ticket)\b/i, weight: 15, advice: 'Talk to someone you trust before sending money to a new contact.' },
  { id: 'check', label: 'Overpayment / fake check', regex: /\b(overpayment|deposit (?:this |the |a )?check|send (?:the |it )?(?:difference|rest|back)|equipment.*check)\b/i, weight: 40, advice: 'A check appearing in your balance does not mean it has cleared. Call your bank.' },
  { id: 'credentials', label: 'Credential request', regex: /\b(password|verification code|one.time (?:code|password)|login.*verify|verify.*login)\b/i, weight: 30, advice: 'Do not share passwords or verification codes. Open the official app yourself.' },
];
export function levelFor(score: number): Level { return score >= 85 ? 'Critical' : score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low'; }
export function assessTranscript(text: string, failedCode = false, callbackDenied = false): Assessment {
  const tells: Tell[] = patterns.flatMap(({ regex, ...rule }) => { const match = text.match(regex); return match ? [{ ...rule, phrase: match[0] }] : []; });
  if (failedCode) tells.push({ id: 'safe-word', label: 'Family safe word failed', phrase: 'Incorrect safe word', weight: 85, advice: 'The caller could not verify your family safe word. Call your relative directly.' });
  if (callbackDenied) tells.push({ id: 'callback', label: 'Relative says it is not them', phrase: 'Not on this call', weight: 100, advice: 'Your relative says they are not on this call. Hang up and call their saved number.' });
  let score = Math.min(100, tells.reduce((sum, tell) => sum + tell.weight, 0));
  if (tells.some(t => t.id === 'secrecy')) score = Math.max(85, score);
  const ids = new Set(tells.map(t => t.id));
  const scamType = ids.has('family') ? 'The Grandson Job' : ids.has('government') ? 'The IRS Job' : ids.has('safe-account') ? 'The Safe Account Job' : ids.has('tech') ? 'The Tech Support Job' : ids.has('romance') && ids.has('money') ? 'The Romance Job' : ids.has('check') ? 'The Fake Check Job' : 'Unverified request';
  const top = [...tells].sort((a, b) => b.weight - a.weight)[0];
  return { score, level: levelFor(score), tells, scamType, source: 'rules', advice: top?.advice ?? 'No red flags found so far. If unsure, hang up and call back on a number you trust.' };
}
export function assessPayment(input: { amount: number; rail: Rail; newPayee: boolean; activeCall: boolean; callScore: number; secret?: boolean; pasted?: boolean }): { score: number; level: Level; reasons: string[] } {
  const reasons: string[] = []; let score = 0;
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };
  if (input.newPayee) add(20, 'First payment to this person');
  if (input.amount > 500) add(20, 'Amount is above the demo’s $500 baseline');
  if (input.rail === 'gift-card') add(35, 'Gift-card payments are difficult to recover');
  if (input.rail === 'crypto' || input.rail === 'wire') add(25, 'An irreversible payment method');
  if (input.activeCall) add(15, 'Payment started during a call');
  if (input.callScore >= 30) add(Math.round(input.callScore * .45), 'The current call contains scam warning signs');
  if (input.pasted) add(5, 'Payment details were pasted');
  if (input.secret) add(85, 'The caller asked you to keep this secret');
  // Confirmed identity failures and Critical call evidence protect every payment,
  // including a small first transfer a scammer might use to test the shield.
  score = Math.min(100, Math.max(score, input.callScore >= 85 ? 85 : 0));
  return { score, level: levelFor(score), reasons };
}

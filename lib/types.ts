export type Language = 'en' | 'es';
export type Rail = 'instant' | 'ach' | 'bill-pay';
export type ContactId = 'diego' | 'ana';
export type Who = 'rosa' | 'diego';
export type AgentKind = 'scammer' | 'verifier';
export type VerifyStatus = 'not_me' | 'confirmed' | 'no_answer';
export type Decision = 'hold' | 'release';

/** Result of the Tiger Data risk query for one attempted payment. */
export type RiskCheck = {
  payee: string; amount: number; rail: Rail;
  isNewPayee: boolean; typical: number; multiple: number; trigger: boolean;
  source: 'tiger' | 'local';
};

/** A "phone call" to one of the /call pages on a teammate's phone. */
export type Ring = {
  id: string; who: Who; agent: AgentKind; callerName: string;
  variables: Record<string, string>;
  status: 'ringing' | 'answered' | 'ended'; at: number;
};

export type CaseFile = {
  id: string; number: number; at: number; language: Language;
  jobName: string; mark: string; impersonated: string;
  pressure: string[]; cover: string; getaway: string; foiledBy: string; tip: string;
  outcome: 'foiled' | 'released'; amount: number; payee: string; multiple: number;
  secondsToStop: number; writtenBy: 'gemini' | 'rules'; stored: 'tiger' | 'memory';
  /** Who supplied the verification result: Diego's verifier call, or the operator's FORCE RESULT. */
  resultSource: 'verifier' | 'operator' | null;
};

export type Phase = 'home' | 'send' | 'tripwire' | 'outcome';

export type DemoState = {
  phase: Phase;
  language: Language;
  coach: boolean;
  /** Expo-noise fallback: Rosa holds a button to talk. */
  pushToTalk: boolean;
  check: RiskCheck | null;
  sentAt: number | null;
  ring: Ring | null;
  /** Latest verification result for the pending call_trusted_contact. */
  result: { status: VerifyStatus; note: string; at: number; source: 'verifier' | 'operator' } | null;
  decision: { decision: Decision; reason: string; at: number; source: 'gemini' | 'rules' } | null;
  caseFile: CaseFile | null;
  /** Finished caption lines from the teller conversation, relayed for the family dashboard. */
  transcript: { at: number; who: 'rosa' | 'teller'; text: string }[];
  log: { at: number; text: string }[];
  config: { gemini: boolean; elevenlabs: boolean; scammer: boolean; verifier: boolean; tiger: boolean };
};

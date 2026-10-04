export type Role = 'protected' | 'guardian' | 'relative';
export type Level = 'Low' | 'Medium' | 'High' | 'Critical';
export type Rail = 'bill' | 'bank' | 'gift-card' | 'crypto' | 'wire';
export type Language = 'en' | 'es';
export type Lever = 'trust' | 'emotion' | 'urgency' | 'isolation' | 'payment';
export type SignalSource = 'gemini' | 'rule';
export type Tell = { id: string; label: string; phrase: string; weight: number; advice: string };
export type Assessment = { score: number; level: Level; tells: Tell[]; advice: string; scamType: string; source: 'rules' | 'gemini' };
export type TranscriptLine = { id: string; text: string; at: number; source: string };
/** One con lever heard on the call, with the caller's own words as evidence. */
export type Signal = { id: string; lever: Lever; quote: string; confidence: number; source: SignalSource; at: number; latencyMs: number | null };
/** Surveillance-log entry for every tool the live agent (or the rule backup) used. */
export type ToolLog = { id: string; at: number; name: string; detail: string; latencyMs: number | null; source: 'gemini' | 'rule' | 'system' };
export type Whisper = { id: string; at: number; text: string; kind: 'family-word' | 'info'; source: SignalSource | 'system' };
export type GuardianAlert = { id: string; at: number; summary: string; recommendedAction: string; source: 'gemini' | 'rules'; reply: 'release' | 'block' | null; repliedAt: number | null };
export type Speech = { id: string; at: number; text: string; language: Language; source: 'gemini' | 'system' };
export type FamilyWord = 'unchecked' | 'asked' | 'matched' | 'failed';
export type Payment = {
  id: string; payee: string; amount: number; rail: Rail; newPayee: boolean;
  status: 'review' | 'held' | 'released' | 'denied'; score: number; reasons: string[];
  createdAt: number; releaseAt: number | null; resolvedAt: number | null; summary: string;
  callId?: string | null; evidence?: { lever: Lever; quote: string }[];
  summarySource?: 'rules' | 'gemini';
  escrow?: { state: 'depositing' | 'held' | 'released' | 'refunded'; address: string; lamports: number; unlock: number; depositSignature?: string; resolutionSignature?: string; error?: string };
};
export type RiskEvent = { id: string; at: number; score: number; label: string; kind: 'call' | 'payment' | 'verification' | 'system' };
export type CaseEducation = { whatHappened: string; clues: string[]; protections: string[]; nextStep: string; source: 'rules' | 'gemini' };
export type CaseLever = { lever: Lever; quote: string; at: number | null };
export type CaseFile = {
  id: string; title: string; openedAt: number; score: number; tells: string[]; paymentId?: string; outcome: 'open' | 'foiled' | 'reviewed';
  evidence?: { callId: string | null; safeWordFailed: boolean; callbackDenied: boolean; held: boolean };
  education?: CaseEducation; levers?: CaseLever[]; lesson?: string; summary?: string; closedBy?: 'gemini' | 'rules';
};
export type CallState = {
  id: string | null; active: boolean; startedAt: number | null; transcript: TranscriptLine[]; assessment: Assessment;
  safeWord: FamilyWord; signals: Signal[]; tools: ToolLog[]; whispers: Whisper[];
  alert: GuardianAlert | null; speech: Speech | null; foiledAt: number | null; live: 'gemini' | 'rules';
};
export type State = {
  call: CallState;
  payments: Payment[]; events: RiskEvent[]; cases: CaseFile[];
  settings: { coSignLimit: number; pendingLimit: { value: number; effectiveAt: number } | null; retainFlaggedTranscripts: boolean; safeWordConfigured: boolean; language: Language };
};
export type ProviderCapability = 'geminiLive' | 'elevenlabsVoice' | 'elevenlabsAgent' | 'elevenlabsVerifier';
export type ProviderStatus = { state: 'unconfigured' | 'configured' | 'working' | 'degraded'; model: string; lastSuccessAt: number | null; error?: string };
export type AnalyticsStatus = { state: 'unconfigured' | 'configured' | 'working' | 'degraded'; source: 'local' | 'tiger'; lastSuccessAt: number | null; pendingEvents: number; error?: string };
export type RiskHistory = { source: 'local' | 'tiger'; points: RiskEvent[]; minutes: { at: number; peak: number; average: number; samples: number }[]; peak: number; total: number };
export type AnalyticsEvent = { id: string; streamId: string; at: number; score: number; kind: RiskEvent['kind']; scamType: string; callId: string | null };
export type SolanaStatus = { state: 'unconfigured' | 'configured' | 'working' | 'degraded'; cluster: 'devnet'; program?: string; guardian?: string; payer?: string; error?: string };
/** Measured red-team results. Only written by scripts/eval-live.ts from real runs. */
export type EvalSummary = { ranAt: number; model: string; total: number; scams: number; benign: number; caught: number; falseAlarms: number; medianFirstFlagMs: number | null; scamTypes: number; languages: string[] };
export type PublicState = State & { riskHistory?: RiskHistory; eval?: EvalSummary | null; config: { demo: boolean; gemini: boolean; elevenlabs: boolean; agent?: boolean; solana?: SolanaStatus; analytics?: AnalyticsStatus; providers?: Partial<Record<ProviderCapability, ProviderStatus>> } };

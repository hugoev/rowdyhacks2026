export type Role = 'protected' | 'guardian' | 'relative';
export type Level = 'Low' | 'Medium' | 'High' | 'Critical';
export type Rail = 'bill' | 'bank' | 'gift-card' | 'crypto' | 'wire';
export type Tell = { id: string; label: string; phrase: string; weight: number; advice: string };
export type Assessment = { score: number; level: Level; tells: Tell[]; advice: string; scamType: string; source: 'rules' | 'gemini' };
export type TranscriptLine = { id: string; text: string; at: number; source: string };
export type Payment = {
  id: string; payee: string; amount: number; rail: Rail; newPayee: boolean;
  status: 'review' | 'held' | 'released' | 'denied'; score: number; reasons: string[];
  createdAt: number; releaseAt: number | null; resolvedAt: number | null; summary: string;
  summarySource?: 'rules' | 'gemini';
};
export type RiskEvent = { id: string; at: number; score: number; label: string; kind: 'call' | 'payment' | 'verification' | 'system' };
export type CaseFile = { id: string; title: string; openedAt: number; score: number; tells: string[]; paymentId?: string; outcome: 'open' | 'foiled' | 'reviewed' };
export type Callback = { id: string; requestedAt: number; answeredAt: number | null; answer: 'yes' | 'no' | null };
export type State = {
  call: { id: string | null; active: boolean; startedAt: number | null; transcript: TranscriptLine[]; assessment: Assessment; safeWord: 'unchecked' | 'matched' | 'failed'; callback: Callback | null };
  payments: Payment[]; events: RiskEvent[]; cases: CaseFile[];
  settings: { coSignLimit: number; pendingLimit: { value: number; effectiveAt: number } | null; retainFlaggedTranscripts: boolean; safeWordConfigured: boolean };
};
export type ProviderCapability = 'geminiCall' | 'geminiScan' | 'geminiSummary' | 'elevenlabsTranscription' | 'elevenlabsVoice';
export type ProviderStatus = { state: 'unconfigured' | 'configured' | 'working' | 'degraded'; model: string; lastSuccessAt: number | null; error?: string };
export type PublicState = State & { config: { demo: boolean; gemini: boolean; elevenlabs: boolean; providers?: Partial<Record<ProviderCapability, ProviderStatus>> } };
export type ScanResult = { score: number; verdict: string; redFlags: string[]; explanation: string; nextStep: string; source: 'rules' | 'gemini'; limitations?: string };

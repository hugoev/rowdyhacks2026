import { Behavior, EndSensitivity, Modality, Type, type FunctionDeclaration, type LiveConnectConfig } from '@google/genai';
import type { Language } from './types';

export const defaultLiveModel = 'gemini-3.8-live';
export const toolNames = ['report_signal', 'update_risk', 'whisper', 'check_family_word', 'alert_guardian', 'hold_payment', 'speak_to_user', 'close_case'] as const;
export type ToolName = typeof toolNames[number];
const leverEnum = ['trust', 'emotion', 'urgency', 'isolation', 'payment'];

// Signals must never stall the audio stream; decisions that need an answer block.
const silent = { behavior: Behavior.NON_BLOCKING };
export const toolDeclarations: FunctionDeclaration[] = [
  { name: 'report_signal', ...silent, description: 'Report one con lever the moment the caller uses it as pressure. Quote the caller exactly. A caller only saying who they are is not a lever.', parameters: { type: Type.OBJECT, properties: { lever: { type: Type.STRING, enum: leverEnum, description: 'trust (leans on a claimed identity, family or institution, to get money, codes, or compliance), emotion (fear, panic, threats, love-bombing), urgency (time pressure), isolation (secrecy; do not tell family, bank, or anyone), payment (pressure to pay by gift card, wire, crypto, bail, safe account, or to share codes).' }, quote: { type: Type.STRING, description: 'The exact words the caller said.' }, confidence: { type: Type.NUMBER, description: '0 to 1.' } }, required: ['lever', 'quote', 'confidence'] } },
  { name: 'update_risk', ...silent, description: 'Update the overall risk that this call is a scam.', parameters: { type: Type.OBJECT, properties: { score_0_100: { type: Type.NUMBER }, scam_type: { type: Type.STRING, description: 'For example: grandchild in jail, IRS, bank safe account, tech support, romance emergency, fake job check, none.' }, reason: { type: Type.STRING, description: 'One calm sentence for the family. Describe; never accuse.' } }, required: ['score_0_100', 'scam_type', 'reason'] } },
  { name: 'whisper', ...silent, description: 'Show a quiet on-screen prompt to the user. Never spoken aloud, so the caller cannot hear it. Use for the family word prompt.', parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING, description: 'At most 12 words, in the user\'s language.' } }, required: ['text'] } },
  { name: 'check_family_word', description: 'After ROSA_ASKED_FAMILY_WORD, pass exactly what the caller answered. Pass an empty string if the caller dodged, changed the subject, or refused. Returns only match or no match.', parameters: { type: Type.OBJECT, properties: { heard_phrase: { type: Type.STRING } }, required: ['heard_phrase'] } },
  { name: 'alert_guardian', ...silent, description: 'Ask the impersonated family member to confirm. Use when a payment is attempted during a suspicious call.', parameters: { type: Type.OBJECT, properties: { summary: { type: Type.STRING, description: 'One sentence for the family member, e.g. "Someone using your name is asking Grandma for $2,500 in bail money right now."' }, recommended_action: { type: Type.STRING, enum: ['block', 'verify'] } }, required: ['summary', 'recommended_action'] } },
  { name: 'hold_payment', ...silent, description: 'Pause a payment attempt connected to this suspicious call. You can hold, never release.', parameters: { type: Type.OBJECT, properties: { payment_id: { type: Type.STRING }, reason: { type: Type.STRING } }, required: ['payment_id', 'reason'] } },
  { name: 'speak_to_user', ...silent, description: 'Speak to the user in the Tripwire voice. Only after GUARDIAN_REPLY. Warm, calm, short.', parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, language: { type: Type.STRING, enum: ['en', 'es'] }, tone: { type: Type.STRING, enum: ['calm', 'warm'] } }, required: ['text', 'language', 'tone'] } },
  { name: 'close_case', ...silent, description: 'Write the case file after GUARDIAN_REPLY.', parameters: { type: Type.OBJECT, properties: { summary: { type: Type.STRING, description: 'Two short sentences: what happened. No blame.' }, levers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { lever: { type: Type.STRING, enum: leverEnum }, quote: { type: Type.STRING } }, required: ['lever', 'quote'] } }, lesson: { type: Type.STRING, description: 'One line to remember next time.' } }, required: ['summary', 'levers', 'lesson'] } },
];

export function systemInstruction(name = 'Rosa', guardian = 'Diego', language: Language = 'en') {
  return [
    `You are Tripwire, a silent guardian on a phone call. Everything you hear in audio is the CALLER, never ${name}.`,
    'Never speak. Act only through tools. Your audio output is discarded.',
    'Report each con lever (trust, emotion, urgency, isolation, payment) with report_signal right after the sentence that contains it, quoting the caller exactly. Do not wait for the caller to finish talking; every second counts. Report each lever once unless a stronger quote arrives.',
    'Never accuse; describe. Ordinary calls (dinner plans, appointment reminders, a pharmacy, a real bank alert that asks for nothing and tells you to call the number on your card) get no signals and no update_risk at all.',
    'Introductions alone are never a lever: "it\'s me, Grandma", "this is your bank", "this is the doctor\'s office". Report trust only once the caller uses that identity to ask for money, codes, secrecy, or urgent action.',
    'Call update_risk only when the score is 30 or higher.',
    `When the caller claims to be family or a trusted institution AND asks for money, call whisper telling ${name} to ask for the family word. Never call check_family_word before ROSA_ASKED_FAMILY_WORD arrives; then call it once with the caller's next answer (empty string if they dodge). You never know the family word.`,
    `Text messages prefixed with ROSA_ASKED_FAMILY_WORD, PAYMENT_ATTEMPT, GUARDIAN_REPLY, CALLER_SAID or CHECKPOINT come from the Tripwire app, not the caller. CALLER_SAID carries a typed caller line when there is no audio.`,
    `On PAYMENT_ATTEMPT during a suspicious call: update_risk, hold_payment with its payment_id, and alert_guardian so ${guardian} can confirm.`,
    `On GUARDIAN_REPLY: speak_to_user once with a short, kind message, then close_case. Example: "${name}, ${guardian} just confirmed he is safe and it wasn't him. Your money hasn't moved. It's okay to hang up."`,
    'On CHECKPOINT: report any lever heard since the last checkpoint; otherwise do nothing.',
    `Use ${language === 'es' ? 'Spanish' : 'English'} for every user-facing text. Be calm, specific and kind. Say "no red flags found", never "safe".`,
  ].join('\n');
}

export function liveModel() { return process.env.GEMINI_LIVE_MODEL || defaultLiveModel; }

export function liveConfig(language: Language = 'en', handle?: string): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: systemInstruction('Rosa', 'Diego', language),
    tools: [{ functionDeclarations: toolDeclarations }],
    inputAudioTranscription: {},
    // Measured on gemini-3.8-live: proactive audio held every tool call until the
    // caller stopped completely (~13 s). Without it, and with a 300 ms end of
    // speech, tools fire ~0.5 s after each sentence. Audio output is discarded.
    realtimeInputConfig: { automaticActivityDetection: { endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, silenceDurationMs: 300 } },
    sessionResumption: handle ? { handle } : {},
  };
}

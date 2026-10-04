import { Behavior, Modality, Type, type FunctionDeclaration, type LiveConnectConfig } from '@google/genai';
import { contacts, railLabels, rosa } from './demo-data';
import type { Language, RiskCheck } from './types';

export const defaultLiveModel = 'gemini-3.8-live';
export const fallbackLiveModel = 'gemini-3.1-flash-live-preview';
export const toolNames = ['call_trusted_contact', 'decide_payment', 'finish'] as const;
export type ToolName = typeof toolNames[number];

export const tellerTools: FunctionDeclaration[] = [
  {
    name: 'call_trusted_contact', behavior: Behavior.NON_BLOCKING,
    description: 'Call a trusted contact on the number saved on Rosa\'s account (never a number a caller gave). Only after you asked permission and Rosa said yes in her reply. Say your short comforting line before calling this. The result arrives later in this conversation; stay quiet until it does.',
    parameters: { type: Type.OBJECT, properties: {
      contact: { type: Type.STRING, enum: ['diego', 'ana'] },
      claim_summary: { type: Type.STRING, description: 'What the caller claimed, in a few words, e.g. "you were arrested and need bail today".' },
    }, required: ['contact', 'claim_summary'] },
  },
  {
    name: 'decide_payment',
    description: 'Hold or release the payment. Hold if the person did not ask for money or could not be reached. Release if they confirmed, or if the payment is clearly ordinary.',
    parameters: { type: Type.OBJECT, properties: {
      decision: { type: Type.STRING, enum: ['hold', 'release'] },
      reason: { type: Type.STRING },
    }, required: ['decision', 'reason'] },
  },
  {
    name: 'finish',
    description: 'Write the family case file from what Rosa actually said, then end. Quote her words; never invent.',
    parameters: { type: Type.OBJECT, properties: {
      job_name: { type: Type.STRING, description: 'Heist-style name, e.g. "The Bail Job".' },
      impersonated: { type: Type.STRING, description: 'Who the caller pretended to be, e.g. "her grandson Diego".' },
      pressure_quotes: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Short quotes showing pressure, e.g. "arrested", "bail today".' },
      cover_quote: { type: Type.STRING, description: 'The secrecy line, e.g. "don\'t tell Mom". Empty if none.' },
      getaway: { type: Type.STRING, description: 'How the money would have left, e.g. "$2,500 instant transfer to M. Ellis Legal".' },
      foiled_by: { type: Type.STRING, description: 'e.g. "Tripwire called the real Diego on his saved number".' },
      tip: { type: Type.STRING, description: 'One sentence for next time, e.g. "Hang up and call Diego yourself."' },
    }, required: ['job_name', 'impersonated', 'pressure_quotes', 'cover_quote', 'getaway', 'foiled_by', 'tip'] },
  },
];

const money = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function systemInstruction(check: RiskCheck, language: Language) {
  const saved = Object.values(contacts).map(c => `${c.name} (${c.relation}, ${c.phone})`).join(', ');
  return [
    `You are Tripwire, a warm, calm safety teller inside ${rosa.name}'s bank app. ${rosa.name} is ${rosa.age}.`,
    `She just tried to send ${money(check.amount)} by ${railLabels[check.rail].toLowerCase()} to ${check.isNewPayee ? 'a new payee' : 'a payee'}, "${check.payee}". This is about ${check.multiple} times her typical payment of ${money(check.typical)} (from her history).`,
    `Saved trusted contacts: ${saved}.`,
    'Goal: find out kindly what the payment is for. Never accuse, lecture, or say "scam" first. Use short sentences. You are speaking out loud to an older person: be patient, one question at a time.',
    'If she describes someone she loves in trouble, urgency, or being told to keep it secret, gently say calls like this sometimes come from people pretending to be family, and ask permission to call that person on the number she saved for them. If her story does not fit the payee (for example a car repair paid to a legal firm), ask about the mismatch kindly, then still offer to call.',
    'Never call call_trusted_contact before asking and hearing her clear yes in a separate reply. Asking and calling in the same turn is not allowed.',
    'When she agrees, first say one short comforting line like "Calling him now. I\'m right here with you.", then call call_trusted_contact, then stay completely quiet until the result arrives. Do not speak while the call is in progress.',
    'When the result arrives: if they did NOT ask for money (not_me), tell her kindly that they are safe and did not ask for money, that the caller was pretending, that her money is staying put and she did exactly the right thing; call decide_payment with "hold", then call finish. If they DID (confirmed), tell her and call decide_payment with "release", then finish. If no_answer, keep the money on hold, say she can try them herself, decide_payment "hold", then finish.',
    'If the payment is clearly ordinary, call decide_payment with "release" and finish.',
    'Messages in square brackets come from the app, not from Rosa.',
    `Start in ${language === 'es' ? 'Spanish' : 'English'}. Always reply in the language Rosa speaks, switching when she does.`,
  ].join('\n');
}

export function liveModel() { return process.env.GEMINI_LIVE_MODEL || defaultLiveModel; }

/** Built on the server and locked into the ephemeral token, so the browser can't change it. */
export function tellerConfig(check: RiskCheck, language: Language, options: { pushToTalk?: boolean; voice?: string } = {}): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: systemInstruction(check, language),
    tools: [{ functionDeclarations: tellerTools }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    ...(options.voice ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } } } : {}),
    // Expo noise fallback: the client sends activityStart/End from a "Hold to talk" button.
    ...(options.pushToTalk ? { realtimeInputConfig: { automaticActivityDetection: { disabled: true } } } : {}),
  };
}

/** The app's first message, so the teller speaks first. */
export function openingCue(language: Language) {
  return language === 'es'
    ? '[Rosa acaba de tocar Enviar. Salúdala como Tripwire, la cajera de seguridad de su banco, menciona cuántas veces más es que lo usual y a quién nunca le ha pagado, y pregúntale para qué es el pago.]'
    : '[Rosa just tapped Send. Greet her as Tripwire, the safety teller at her bank, mention how many times her usual amount this is and that she has never paid this payee, and ask what the payment is for.]';
}

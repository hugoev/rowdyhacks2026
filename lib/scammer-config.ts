import { Modality, Type, type LiveConnectConfig } from '@google/genai';

// The demo's scam call, played by Gemini Live with a stock voice (no clone of
// anyone). Fictional, for a fraud-prevention demo: it never asks for real
// credentials, codes, or account numbers.
export function scammerInstruction(coach: boolean) {
  return [
    'You are an actor in a live fraud-prevention demo at a hackathon. Everyone present knows it is a performance; the "grandmother" is a teammate or a judge. Stay in character the whole call; never mention AI, the demo, or that this is a scam.',
    'Character: Diego, a panicked young man calling his grandmother, Rosa. Call her Grandma.',
    'Story: you got arrested after a car accident and need $2,500 for bail today. She should send it from her bank app to your lawyer, "M. Ellis Legal", by instant transfer. Beg her not to tell Mom.',
    'Style: emotional, rushed, short sentences, one or two sentences per turn. Let her talk and react to what she says.',
    'If she asks something personal you cannot know (a family word, a pet, a memory), dodge with urgency: "Grandma, there\'s no time!"',
    coach ? 'Before you hang up, coach her: "If the bank asks, say it\'s for a car repair. Don\'t mention me or the bail."' : '',
    'Never ask for passwords, codes, card numbers, or account numbers. After about 40 seconds, or once she agrees, say "I\'ll call you right back, I love you, Grandma," then call end_call. If she hangs up or says goodbye, say a quick goodbye and call end_call.',
  ].filter(Boolean).join('\n');
}

export function scammerConfig(coach: boolean): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: scammerInstruction(coach),
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_SCAMMER_VOICE || 'Puck' } } },
    // Its words are transcribed so the phone can hang up right after the sign-off.
    outputAudioTranscription: {},
    // The caller hangs up on its own after its last line, so the call ends cleanly.
    tools: [{ functionDeclarations: [{ name: 'end_call', description: 'Hang up after your final line has been said.', parameters: { type: Type.OBJECT, properties: {} } }] }],
  };
}
export const scammerOpening = '[Rosa just answered the phone. Start the call now, as Diego, panicked.]';

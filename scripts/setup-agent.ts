// Creates the consented demo adversary: an ElevenLabs voice agent that plays the
// "grandson in jail" scammer with a voice clone recorded WITH WRITTEN CONSENT.
// Used only for the live demo and red-teaming. Prints ELEVENLABS_AGENT_ID.
import 'dotenv/config';
import { scammerFirstMessage, scammerPrompt } from '../lib/scammer';

const key = process.env.ELEVENLABS_API_KEY; const voice = process.env.ELEVENLABS_SCAMMER_VOICE_ID;
if (!key || !voice) throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_SCAMMER_VOICE_ID (the consented clone) in .env.');
const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Tripwire demo adversary (consented clone)',
    conversation_config: {
      agent: { first_message: scammerFirstMessage, language: 'en', prompt: { prompt: scammerPrompt.full } },
      tts: { voice_id: voice, model_id: 'eleven_flash_v2', agent_output_audio_format: 'pcm_16000' },
      asr: { user_input_audio_format: 'pcm_16000' },
    },
    // The operator's "short arc" restart overrides the prompt per session.
    platform_settings: { overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true } } } },
  }),
});
const body = await response.json();
if (!response.ok) throw new Error('ElevenLabs agent creation failed: ' + JSON.stringify(body));
console.log(`Created agent. Add to .env:\nELEVENLABS_AGENT_ID=${body.agent_id}`);

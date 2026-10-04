// Creates the two ElevenLabs agents and prints their IDs for .env.
//  - Scammer (demo only): voice = a consented instant clone of our teammate
//    (ELEVENLABS_SCAMMER_VOICE_ID). Written consent lives in docs/CONSENT.md.
//  - Verifier: Tripwire's calm stock voice; reports back with the
//    report_result client tool that runs on Diego's phone.
import 'dotenv/config';

const key = process.env.ELEVENLABS_API_KEY;
const cloneVoice = process.env.ELEVENLABS_SCAMMER_VOICE_ID;
const verifierVoice = process.env.ELEVENLABS_VERIFIER_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
if (!key) throw new Error('Set ELEVENLABS_API_KEY in .env.');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);

const scammerPrompt = `You are role-playing a scammer for a fraud-prevention demo at a hackathon, with everyone's consent. You pretend to be {{grandson_name}} calling his grandmother {{grandma_name}}.
You were "arrested" and need {{amount}} for bail today, sent from her bank app to your lawyer, "{{payee}}". Beg her not to tell Mom. Be emotional and rushed.
{{coach_instructions}}
Keep the whole call under 40 seconds. Then say you'll call her right back and end the call.
If she asks anything personal you can't know (a family word, a pet's name, a memory), dodge with urgency: "Grandma, there's no time!"
Never mention scams, AI, or this demo. Never ask for passwords or codes.`;
const verifierPrompt = `You are Tripwire, calling {{contact_name}} on the number saved on {{grandma_name}}'s bank account, on behalf of her bank.
Say: "Hi {{contact_name}}, this is Tripwire, calling for your grandmother {{grandma_name}}. Someone using your voice just told her {{claim_summary}} and asked for {{amount}}. Are you safe, and did you ask her for money?"
As soon as you know, call report_result: status "not_me" if they did not ask for money, "confirmed" if they did, "no_answer" if you can't tell. Put their words in note.
Then thank them, ask them to give her a call, and end the call. Keep the whole call under 30 seconds. Be calm and brief.`;

async function create(body: unknown) {
  const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', { method: 'POST', headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error('ElevenLabs agent creation failed: ' + JSON.stringify(result).slice(0, 400));
  return result.agent_id as string;
}
const variables = (names: string[]) => ({ dynamic_variable_placeholders: Object.fromEntries(names.map(n => [n, ''])) });

if (only !== 'verifier') {
  if (!cloneVoice) console.log('Skipping the scammer: set ELEVENLABS_SCAMMER_VOICE_ID to the consented clone first.');
  else {
    const id = await create({
      name: 'Tripwire demo scammer (consented clone)',
      conversation_config: {
        agent: { first_message: 'Grandma? Grandma, it’s me, {{grandson_name}}. I’m in trouble.', language: 'en', prompt: { prompt: scammerPrompt, tools: [{ type: 'system', name: 'end_call', description: 'End the call after saying you will call back.' }] }, dynamic_variables: variables(['grandma_name', 'grandson_name', 'amount', 'payee', 'coach_instructions']) },
        tts: { voice_id: cloneVoice, model_id: 'eleven_flash_v2' },
        conversation: { max_duration_seconds: 90 },
      },
    });
    console.log(`EL_AGENT_SCAMMER_ID=${id}`);
  }
}
if (only !== 'scammer') {
  const id = await create({
    name: 'Tripwire verifier',
    conversation_config: {
      agent: {
        first_message: 'Hi {{contact_name}}, this is Tripwire, calling for your grandmother {{grandma_name}}.', language: 'en',
        prompt: { prompt: verifierPrompt, tools: [
          { type: 'client', name: 'report_result', description: 'Report whether the contact asked for money.', expects_response: true, response_timeout_secs: 10,
            parameters: { type: 'object', required: ['status', 'note'], properties: {
              status: { type: 'string', enum: ['not_me', 'confirmed', 'no_answer'], description: 'not_me: they did not ask for money. confirmed: they did. no_answer: unclear.' },
              note: { type: 'string', description: 'What they said, in a few words.' } } } },
          { type: 'system', name: 'end_call', description: 'End the call after thanking them.' },
        ] },
        dynamic_variables: variables(['grandma_name', 'contact_name', 'amount', 'claim_summary']),
      },
      tts: { voice_id: verifierVoice, model_id: 'eleven_flash_v2' },
      conversation: { max_duration_seconds: 60 },
    },
  });
  console.log(`EL_AGENT_VERIFIER_ID=${id}`);
}
console.log('Add the line(s) above to .env and restart the server.');

import test from 'node:test';
import assert from 'node:assert/strict';
import { agentSignedUrl } from '../server/elevenlabs';
import { phoneAgentConfig } from '../lib/phone-agents';

test('verifier has explicit result statuses and cannot silently reuse the scammer', async t => {
  const original = { ...process.env }; t.after(() => { process.env = original; });
  process.env.ELEVENLABS_API_KEY = 'test-key';
  process.env.EL_AGENT_SCAMMER_ID = 'scammer_test';
  delete process.env.EL_AGENT_VERIFIER_ID;
  await assert.rejects(agentSignedUrl('verifier'), /Configure the verifier/);
  process.env.EL_AGENT_VERIFIER_ID = 'verifier_test';
  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    requested.push(String(url));
    return Response.json({ signed_url: 'wss://example.test/session' });
  });
  await agentSignedUrl('verifier'); await agentSignedUrl('scammer');
  assert.ok(requested[0].endsWith('agent_id=verifier_test'));
  assert.ok(requested[1].endsWith('agent_id=scammer_test'));
  const config = phoneAgentConfig('verifier', 'stock_voice');
  const tool = config.conversation_config.agent.prompt.tools![0];
  assert.deepEqual(tool.parameters.properties.status.enum, ['not_me', 'confirmed', 'no_answer']);
  assert.equal(tool.expects_response, true);
  assert.deepEqual(tool.parameters.required, ['status', 'note']);
  assert.equal(config.platform_settings.auth.enable_auth, true);
});

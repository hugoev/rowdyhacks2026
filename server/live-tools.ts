import { z } from 'zod';
import { toolNames, type ToolName } from '../lib/live-config';
import type { Store } from './store';

const lever = z.enum(['trust', 'emotion', 'urgency', 'isolation', 'payment']);
const schemas = {
  report_signal: z.object({ lever, quote: z.string().trim().min(1).max(300), confidence: z.coerce.number().min(0).max(1).catch(0.7) }),
  update_risk: z.object({ score_0_100: z.coerce.number().min(0).max(100), scam_type: z.string().max(100).default(''), reason: z.string().max(400).default('') }),
  whisper: z.object({ text: z.string().trim().min(1).max(200) }),
  check_family_word: z.object({ heard_phrase: z.string().max(100).default('') }),
  alert_guardian: z.object({ summary: z.string().trim().min(1).max(400), recommended_action: z.string().max(40).default('block') }),
  hold_payment: z.object({ payment_id: z.string().max(100).default(''), reason: z.string().trim().max(300).default('Suspicious call in progress') }),
  speak_to_user: z.object({ text: z.string().trim().min(1).max(600), language: z.enum(['en', 'es']).catch('en'), tone: z.string().max(20).optional() }),
  close_case: z.object({ summary: z.string().trim().min(1).max(800), levers: z.array(z.object({ lever, quote: z.string().max(300) })).max(10).default([]), lesson: z.string().trim().min(1).max(300) }),
} satisfies Record<ToolName, z.ZodType>;

export function isToolName(name: string): name is ToolName { return (toolNames as readonly string[]).includes(name); }

/**
 * Executes one Live API function call against the shared store. The model can
 * only add evidence, pause money, or ask family; it can never release a hold.
 * Returned objects become the function response the model sees.
 */
export async function executeTool(store: Store, name: string, rawArgs: unknown): Promise<Record<string, unknown>> {
  if (!isToolName(name)) return { error: `Unknown tool ${name}` };
  const parsed = schemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) return { error: 'Invalid arguments: ' + parsed.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ') };
  const args = parsed.data as never;
  try {
    switch (name) {
      case 'report_signal': { const a = args as z.infer<typeof schemas.report_signal>; store.reportSignal(a.lever, a.quote, a.confidence); return { ok: true }; }
      case 'update_risk': { const a = args as z.infer<typeof schemas.update_risk>; store.updateRisk(a.score_0_100, a.scam_type, a.reason); return { ok: true, score: store.state.call.assessment.score }; }
      case 'whisper': { store.whisper((args as z.infer<typeof schemas.whisper>).text, 'gemini'); return { ok: true }; }
      case 'check_family_word': {
        // Measured: the model sometimes calls this before Rosa has asked, which would
        // record a false dodge. Only an answer to Rosa's question counts.
        if (store.state.call.safeWord === 'unchecked') return { error: 'Rosa has not asked yet. Wait for ROSA_ASKED_FAMILY_WORD, then pass the caller\'s answer.' };
        if (!store.state.settings.safeWordConfigured) return { match: false, note: 'No family word is configured.' };
        // Only the match result returns to the model; the phrase is discarded here.
        return { match: await store.verifyWord((args as z.infer<typeof schemas.check_family_word>).heard_phrase, 'gemini') };
      }
      case 'alert_guardian': { const a = args as z.infer<typeof schemas.alert_guardian>; const alert = store.raiseAlert(a.summary, a.recommended_action, 'gemini'); return { ok: true, status: alert.reply ? `already answered: ${alert.reply}` : 'waiting for Diego' }; }
      case 'hold_payment': {
        const a = args as z.infer<typeof schemas.hold_payment>;
        const target = store.state.payments.find(p => p.id === a.payment_id) || store.state.payments.find(p => p.callId === store.state.call.id && p.status !== 'released' && p.status !== 'denied');
        if (!target) return { error: 'No open payment for this call.' };
        const payment = store.holdPayment(target.id, a.reason); return { ok: true, status: payment.status };
      }
      case 'speak_to_user': { const a = args as z.infer<typeof schemas.speak_to_user>; const speech = store.speakFromModel(a.text, a.language); return { ok: true, spoken: !!speech, note: speech ? undefined : 'Tripwire already spoke for this call.' }; }
      case 'close_case': { const a = args as z.infer<typeof schemas.close_case>; const file = store.closeCaseFile(a.summary, a.levers, a.lesson); return { ok: true, caseId: file.id }; }
    }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Tool failed' }; }
}

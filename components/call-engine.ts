'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceConversation } from '@elevenlabs/client';
import { captureMicrophone, pcmRate } from '@/lib/audio';
import { LiveGuard, type GuardStatus } from '@/lib/live-guard';
import { scammerFirstMessage, scammerPrompt } from '@/lib/scammer';
import { scenarios } from '@/lib/scenarios';
import type { Payment, PublicState } from '@/lib/types';

export type CallerSource = 'agent' | 'agent-short' | 'mic' | 'script';
type Request = <T = unknown>(path: string, body?: unknown) => Promise<T>;

/**
 * Runs the call on Rosa's device: the caller channel (ElevenLabs agent, the
 * operator's mic, or typed lines) feeds one Gemini Live session, and app events
 * are injected into that same session so the model connects call and payment.
 */
export function useCallEngine(state: PublicState | null, request: Request, setError: (message: string) => void) {
  const guard = useRef<LiveGuard | null>(null);
  const agent = useRef<VoiceConversation | null>(null);
  const stopMic = useRef<(() => void) | null>(null);
  const callId = useRef<string | null>(null);
  const [guardStatus, setGuardStatus] = useState<GuardStatus | 'rules'>('rules');
  const [partial, setPartial] = useState('');
  const [source, setSource] = useState<CallerSource | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [scriptKey, setScriptKey] = useState<keyof typeof scenarios>('grandson');
  const [scriptIndex, setScriptIndex] = useState(0);
  const repliedFor = useRef<string | null>(null);

  const line = useCallback((text: string, kind: 'gemini' | 'agent' | 'scripted') => {
    const id = callId.current; if (!id) return;
    void request('/call/line', { callId: id, segmentId: crypto.randomUUID(), text, source: kind }).catch(() => {});
  }, [request]);

  const teardown = useCallback(() => {
    guard.current?.stop(); guard.current = null;
    stopMic.current?.(); stopMic.current = null;
    const conversation = agent.current; agent.current = null;
    void conversation?.endSession().catch(() => {});
    setPartial(''); setSource(null); setAgentSpeaking(false); setScriptIndex(0);
  }, []);
  useEffect(() => teardown, [teardown]);

  const start = useCallback(async (chosen: CallerSource) => {
    teardown();
    const wantsGemini = !!state?.config.gemini;
    const { callId: id } = await request<{ callId: string }>('/call/start', { consent: true, live: wantsGemini ? 'gemini' : 'rules' });
    callId.current = id; setSource(chosen);
    if (wantsGemini) {
      const liveGuard = new LiveGuard({
        token: handle => request('/live/token', { handle }),
        tool: (name, args) => request('/live/tool', { callId: id, name, args }),
        transcript: text => line(text, 'gemini'),
        partial: setPartial,
        status: (status, detail) => {
          setGuardStatus(status);
          if (status === 'live' || status === 'failed') void request('/call/live-status', { callId: id, state: status === 'live' ? 'gemini' : 'rules', detail: detail?.slice(0, 200) }).catch(() => {});
        },
      }, state?.settings.language || 'en');
      guard.current = liveGuard;
      try { await liveGuard.start(); }
      catch (error) {
        guard.current = null; setGuardStatus('rules');
        setError('Gemini Live could not connect. The rule spotter keeps protecting this call.');
        void request('/call/live-status', { callId: id, state: 'rules', detail: (error as Error).message?.slice(0, 200) }).catch(() => {});
      }
    } else setGuardStatus('rules');
    const live = () => !!guard.current?.live;
    if (chosen === 'agent' || chosen === 'agent-short') {
      const { signedUrl } = await request<{ signedUrl: string }>('/agent/session');
      let rate = 16000;
      agent.current = await VoiceConversation.startSession({
        signedUrl, connectionType: 'websocket',
        ...(chosen === 'agent-short' ? { overrides: { agent: { prompt: { prompt: scammerPrompt.short }, firstMessage: scammerFirstMessage } } } : {}),
        onConversationMetadata: metadata => { rate = pcmRate((metadata as { agent_output_audio_format?: string }).agent_output_audio_format) ?? rate; },
        // Only the caller's digital audio reaches Gemini, so stage noise never does.
        onAudio: base64 => guard.current?.sendAudio(base64, rate),
        onMessage: ({ message, role }) => { if (role === 'agent' && !live()) line(message, 'agent'); },
        onModeChange: ({ mode }) => setAgentSpeaking(mode === 'speaking'),
        onDisconnect: () => setAgentSpeaking(false),
        onError: message => setError('Scammer agent: ' + message),
      });
    } else if (chosen === 'mic') {
      stopMic.current = await captureMicrophone((base64, rate) => guard.current?.sendAudio(base64, rate));
    }
  }, [state?.config.gemini, state?.settings.language, request, line, teardown, setError]);

  const nextScripted = useCallback(() => {
    const script = scenarios[scriptKey]; const text = script.lines[scriptIndex]; if (!text) return;
    setScriptIndex(i => i + 1);
    // Typed caller lines go to the rule spotter and, as text, to the same live session.
    line(text, 'scripted'); guard.current?.event(`CALLER_SAID: ${text}`);
    if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); u.lang = script.language === 'es' ? 'es-US' : 'en-US'; u.rate = 1.05; speechSynthesis.speak(u); }
  }, [scriptKey, scriptIndex, line]);

  const askedFamilyWord = useCallback(async () => {
    await request('/family-word/asked');
    guard.current?.event('ROSA_ASKED_FAMILY_WORD: Rosa just asked the caller for the family word. Listen to the answer, then call check_family_word (empty string if they dodge).');
  }, [request]);

  const paymentAttempt = useCallback((payment: Payment) => {
    guard.current?.event(`PAYMENT_ATTEMPT: payment_id=${payment.id}, $${payment.amount}, ${payment.newPayee ? 'new payee' : 'known payee'}, ${payment.rail}, payee "${payment.payee}", call active. Tripwire rules: ${payment.status}, score ${payment.score}/100.`);
  }, []);

  const hangUp = useCallback(async () => { teardown(); callId.current = null; await request('/call/end'); }, [request, teardown]);

  // Diego's answer goes back into the live session the moment it lands.
  const alert = state?.call.alert;
  useEffect(() => {
    if (!alert?.reply || repliedFor.current === alert.id) return;
    repliedFor.current = alert.id;
    const said = state?.call.speech?.text;
    guard.current?.event(`GUARDIAN_REPLY: Diego tapped "${alert.reply === 'block' ? 'Not me, block' : 'It’s me, release'}". The payment is ${alert.reply === 'block' ? 'blocked' : 'released'}.${said ? ` Tripwire already told Rosa: "${said}" Do not speak again.` : ''} Now call close_case.`);
    // The voice agent goes quiet so Tripwire never talks over the caller.
    agent.current?.setVolume({ volume: 0 });
  }, [alert?.id, alert?.reply, state?.call.speech?.text]);

  return { start, hangUp, nextScripted, askedFamilyWord, paymentAttempt, guardStatus, partial, source, agentSpeaking, scriptKey, setScriptKey: (key: keyof typeof scenarios) => { setScriptKey(key); setScriptIndex(0); }, scriptIndex };
}

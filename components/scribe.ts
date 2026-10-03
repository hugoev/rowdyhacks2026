import { CommitStrategy, RealtimeEvents, Scribe } from '@elevenlabs/client';
import type { CaptureFactory } from '../lib/live-transcription';

export const connectScribe: CaptureFactory = (token, handlers) => {
  const capture = Scribe.connect({ token, modelId: 'scribe_v2_realtime', languageCode: 'en', commitStrategy: CommitStrategy.VAD, vadSilenceThresholdSecs: .5, microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, enableLogging: false });
  capture.on(RealtimeEvents.SESSION_STARTED, handlers.ready);
  capture.on(RealtimeEvents.PARTIAL_TRANSCRIPT, data => handlers.partial(data.text));
  capture.on(RealtimeEvents.COMMITTED_TRANSCRIPT, data => handlers.committed(data.text));
  capture.on(RealtimeEvents.ERROR, handlers.error);
  capture.on(RealtimeEvents.CLOSE, handlers.closed);
  return capture;
};

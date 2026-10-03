export type Capture = { close: () => void; mute: () => void; unmute: () => void };
export type CaptureHandlers = { ready: () => void; partial: (text: string) => void; committed: (text: string) => void; error: () => void; closed: () => void };
export type CaptureFactory = (token: string, handlers: CaptureHandlers) => Capture;

// Owns session lifetime, including SDK events arriving after stop/navigation.
export class LiveTranscription {
  private capture: Capture | null = null;
  private generation = 0;
  private cancelStart: (() => void) | null = null;
  constructor(private connect: CaptureFactory, private timeoutMs = 10000) {}
  async start(token: string, handlers: CaptureHandlers) {
    this.stop(); const generation = this.generation;
    await new Promise<void>((resolve, reject) => {
      let started = false;
      const current = () => this.generation === generation;
      const cleanup = () => { clearTimeout(timer); this.cancelStart = null; };
      const fail = () => {
        if (!current()) return;
        cleanup(); this.stop(); handlers.error();
        if (!started) reject(new Error('Live transcription could not start. Choose browser transcription or a scripted demo.'));
      };
      const timer = setTimeout(fail, this.timeoutMs);
      this.cancelStart = () => { cleanup(); reject(new Error('Microphone start was cancelled.')); };
      try {
        const capture = this.connect(token, {
          ready: () => { if (current()) { started = true; cleanup(); handlers.ready(); resolve(); } },
          partial: text => { if (current()) handlers.partial(text); },
          committed: text => { if (current() && text.trim()) handlers.committed(text); },
          error: fail,
          closed: () => {
            if (!current()) return;
            cleanup(); this.stop(); handlers.closed();
            if (!started) reject(new Error('Live transcription disconnected before starting.'));
          },
        });
        if (current()) this.capture = capture; else capture.close();
      } catch { fail(); }
    });
  }
  stop() {
    this.generation++;
    this.cancelStart?.(); this.cancelStart = null;
    const capture = this.capture; this.capture = null; capture?.close();
  }
  mute() { this.capture?.mute(); }
  unmute() { this.capture?.unmute(); }
}

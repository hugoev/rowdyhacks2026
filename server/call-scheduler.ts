export class CallScheduler {
  private pending: { key: string; run: () => Promise<void> } | null = null;
  private inFlight = false;
  private lastStarted = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private interval = 6000) {}
  submit(key: string, run: () => Promise<void>) { this.pending = { key, run }; this.pump(); }
  cancel() { this.pending = null; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private pump() {
    if (this.inFlight || !this.pending || this.timer) return;
    const delay = Math.max(0, this.lastStarted + this.interval - Date.now());
    if (delay) { this.timer = setTimeout(() => { this.timer = null; this.pump(); }, delay); return; }
    const job = this.pending; this.pending = null; this.inFlight = true; this.lastStarted = Date.now();
    void job.run().catch(() => { console.error('Call analysis job failed unexpectedly; rules protection remains active.'); }).finally(() => { this.inFlight = false; this.pump(); });
  }
}

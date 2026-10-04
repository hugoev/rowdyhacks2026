import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalSummary } from '../lib/types';

export const evalPath = () => join(process.env.DATA_DIR || './data', 'eval-results.json');
let cache: { mtime: number; value: EvalSummary | null } | null = null;
/** Latest measured red-team summary, or null when the harness has not run. Never fabricated. */
export function readEval(): EvalSummary | null {
  try {
    const mtime = statSync(evalPath()).mtimeMs;
    if (cache?.mtime === mtime) return cache.value;
    const value = (JSON.parse(readFileSync(evalPath(), 'utf8')) as { summary?: EvalSummary }).summary ?? null;
    cache = { mtime, value }; return value;
  } catch { return null; }
}

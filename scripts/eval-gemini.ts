import 'dotenv/config';
import { chromium } from '@playwright/test';
import { scanSamples, scenarios } from '../lib/scenarios';
import { analyzeCall, analyzeScan, GeminiError } from '../server/gemini';

if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY in your local .env. Evaluation uses synthetic data only.');
const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
try {
for (const model of models) {
  process.env.GEMINI_CALL_MODEL = model; process.env.GEMINI_SCAN_MODEL = model;
  let correct = 0; let completed = 0;
  for (const fixture of scanSamples) {
    const start = Date.now();
    try {
      await page.setContent('<main style="font:24px sans-serif;padding:30px"></main>');
      await page.locator('main').evaluate((element, text) => { element.textContent = text; }, fixture.text);
      const data = (await page.screenshot()).toString('base64');
      const result = await analyzeScan('', { data, mimeType: 'image/png' }); completed++;
      const pass = (result.score >= 30) === fixture.risky; if (pass) correct++;
      console.log(JSON.stringify({ model, fixture: fixture.title, pass, latencyMs: Date.now() - start }));
    } catch (error) { if (!(error instanceof GeminiError)) throw error; console.log(JSON.stringify({ model, fixture: fixture.title, error: error.category })); }
    await new Promise(resolve => setTimeout(resolve, 6500));
  }
  for (const [name, fixture] of Object.entries(scenarios)) {
    try {
      const start = Date.now(); const result = await analyzeCall(fixture.lines.join(' '));
      console.log(JSON.stringify({ model, call: name, score: result.score, tells: result.tells.length, latencyMs: Date.now() - start, pass: name === 'normal' ? result.score < 30 : result.score >= 60 && result.tells.length >= 3 }));
    } catch (error) { if (!(error instanceof GeminiError)) throw error; console.log(JSON.stringify({ model, call: name, error: error.category })); }
    await new Promise(resolve => setTimeout(resolve, 6500));
  }
  console.log(JSON.stringify({ model, correct, completed, scannerAccepted: completed === 10 && correct >= 8 }));
}
} finally { await browser.close(); }

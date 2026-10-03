import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { scanSamples } from '../lib/scenarios';

const directory = 'public/inspector-samples';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1 });
  for (const [index, sample] of scanSamples.entries()) {
    await page.setContent('<html lang="en"><head><style>body{margin:0;background:#ecefe7;font-family:Verdana,sans-serif;color:#293224;padding:44px}article{background:#fffdf7;border:1px solid #bdc5b2;border-radius:20px;padding:36px}h1{font-size:30px;line-height:1.3}p{font-size:28px;line-height:1.65;overflow-wrap:anywhere}.label{font-size:18px;color:#48553d;border-bottom:1px solid #bdc5b2;padding-bottom:20px}footer{font-size:20px;margin-top:28px;line-height:1.5}</style></head><body><article><p class="label">TRIPWIRE PRACTICE MESSAGE</p><h1></h1><p id="message"></p></article><footer>Fictional example for a demo. No real sender or account.</footer></body></html>');
    await page.locator('h1').evaluate((element, title) => { element.textContent = title; }, sample.title);
    await page.locator('#message').evaluate((element, text) => { element.textContent = text; }, sample.text);
    await page.screenshot({ path: `${directory}/${String(index + 1).padStart(2, '0')}.png`, fullPage: true });
  }
} finally { await browser.close(); }
console.log(`Created ${scanSamples.length} fictional screenshot samples in ${directory}. No provider requests were made.`);

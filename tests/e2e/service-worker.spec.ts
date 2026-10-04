import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('a browser stuck on the old offline page recovers after the worker update', async ({ page, context }) => {
  const retirementWorker = await readFile('public/sw.js', 'utf8');
  let updated = false;
  const legacyWorker = `
    self.addEventListener('install', event => {
      event.waitUntil(caches.open('tripwire-shell-v1').then(cache =>
        cache.put('/offline.html', new Response('<h1>Your family view needs a connection.</h1>',
          { headers: { 'Content-Type': 'text/html' } }))));
      self.skipWaiting();
    });
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', event => {
      if (event.request.mode === 'navigate') event.respondWith(fetch(event.request)
        .catch(() => caches.match('/offline.html')));
    });
  `;
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(updated ? retirementWorker : legacyWorker);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<h1>Live demo</h1>');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  try {
    await page.goto(`http://127.0.0.1:${address.port}/demo`);
    await page.evaluate(async () => {
      await caches.open('unrelated-cache');
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your family view needs a connection.' })).toBeVisible();

    updated = true;
    await context.setOffline(false);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('Legacy worker is missing');
      await registration.update();
    });
    await expect(page.getByRole('heading', { name: 'Live demo' })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    expect(await page.evaluate(() => caches.keys())).toEqual(['unrelated-cache']);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Live demo' })).toBeVisible();
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  } finally {
    await context.setOffline(false);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('fresh demo visitors do not install an offline worker and controls need no key', async ({ page }) => {
  const health = await page.request.get('/api/health');
  expect((await health.json()).demoMode).toBe(true);
  await page.goto('/demo');
  await expect(page.getByRole('button', { name: 'Start the demo' })).toBeVisible();
  await expect(page.getByText('Demo controls', { exact: true })).toHaveCount(0);
  const reset = await page.request.post('/api/operator/reset', { headers: { 'x-tripwire-client': 'web' }, data: {} });
  expect(reset.status()).toBe(200);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

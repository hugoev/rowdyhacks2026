import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const picture = { name: 'message.png', mimeType: 'image/png', buffer: readFileSync('public/inspector-samples/01.png') };
const result = { score: 85, verdict: 'Strong scam warning signs', redFlags: ['The sender asks for gift cards.', 'The sender tells you to keep it secret.'], explanation: 'This request has common scam warning signs. You did nothing wrong by checking.', nextStep: 'Call your relative using the number saved in your phone.', source: 'gemini' };

test('Inspector explains unavailable picture checking and rejects unsupported files', async ({ page }) => {
  await page.goto('/inspector');
  await expect(page.getByText(/Picture checking is unavailable right now/)).toBeVisible();
  await page.getByLabel('Upload screenshot').setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a JPG' })).toBeVisible();
  await page.getByLabel('Upload screenshot').setInputFiles(picture);
  await expect(page.getByAltText('Preview of your selected message')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect this message' })).toBeDisabled();
  await page.getByLabel('Paste the message or link').fill('Please buy gift cards immediately. Keep this secret.');
  await expect(page.getByRole('button', { name: 'Inspect this message' })).toBeEnabled();
  await page.getByRole('button', { name: 'Inspect this message' }).click();
  await expect(page.getByRole('heading', { name: 'Strong scam warning signs' })).toBeFocused();
  await page.getByText('How this was checked', { exact: true }).click();
  await expect(page.getByText(/The image was not analyzed/)).toBeVisible();
});

test('mocked picture check shows loading, evidence, and one next step on mobile', async ({ page }) => {
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/state', async route => {
    const response = await route.fetch(); expect(response.ok()).toBe(true);
    const state = await response.json(); state.config.gemini = true;
    await route.fulfill({ response, json: state });
  });
  let finish!: () => void;
  const release = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/inspect', async route => {
    expect(route.request().postDataJSON().image.mimeType).toBe('image/png');
    await release;
    await route.fulfill({ json: result });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inspector');
  await page.getByLabel('Upload screenshot').setInputFiles(picture);
  await expect(page.getByAltText('Preview of your selected message')).toBeVisible();
  const button = page.getByRole('button', { name: 'Inspect this message' });
  await button.click();
  await expect(page.getByRole('heading', { name: 'Checking your message...' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove picture' })).toBeDisabled();
  finish();
  await expect(page.getByRole('heading', { name: result.verdict })).toBeFocused();
  await expect(page.getByText(result.redFlags[0], { exact: true })).toBeVisible();
  await expect(page.getByText(result.nextStep, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/inspector-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: 'test-results/inspector-desktop.png', fullPage: true });
});

test('failed picture check keeps the picture and offers a retry without false reassurance', async ({ page }) => {
  await page.route('**/api/inspect', route => route.fulfill({ status: 400, json: { error: 'Picture checking could not finish. Please try again.' } }));
  await page.goto('/inspector');
  await page.getByLabel('Paste the message or link').fill('Message to check');
  await page.getByLabel('Upload screenshot').setInputFiles(picture);
  await expect(page.getByAltText('Preview of your selected message')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect this message' }).click();
  await expect(page.getByRole('heading', { name: 'We could not finish this check' })).toBeVisible();
  await expect(page.getByAltText('Preview of your selected message')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect this message' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'No red flags found' })).toHaveCount(0);
});

import { test, expect } from '@playwright/test';

test('vault navigation stays in the document and clears after rapid navigation and history changes', async ({ page }) => {
  await page.goto('/guardian');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.vault-transition')).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.dataset.navigationMarker = 'original';
    document.addEventListener('animationstart', event => {
      if (event.animationName.startsWith('vault-door')) document.documentElement.dataset.vaultPlayed = 'true';
      if (event.animationName === 'vault-scan') {
        document.documentElement.dataset.scanPlayed = 'true';
        document.documentElement.dataset.scanPresent = String(!!document.querySelector('.vault-transition .vault-scan-line'));
      }
    });
  });
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'The Inspector' }).click();
  await expect(page).toHaveURL('/inspector');
  await expect(page.locator('html')).toHaveAttribute('data-vault-played', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-scan-played', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-scan-present', 'true');
  await nav.getByRole('link', { name: 'Case files' }).click();
  await expect(page).toHaveURL('/cases');
  await expect(page.locator('.vault-transition')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL('/inspector');
  await page.goForward();
  await expect(page).toHaveURL('/cases');
  await expect(page.locator('.vault-transition')).toHaveCount(0);
  await expect(page.locator('.vault-scan-line')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-navigation-marker', 'original');
  await page.evaluate(() => delete document.documentElement.dataset.vaultPlayed);
  await nav.getByRole('link', { name: 'Case files' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-vault-played');
});

test('family routes use the vault, switch roles and preserve separate-tab presenter links', async ({ page, context }) => {
  const roles: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/session')) roles.push(request.postDataJSON().role); });
  await page.goto('/protected');
  await expect(page.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  await page.evaluate(() => document.addEventListener('animationstart', event => {
    if (event.animationName.startsWith('vault-door')) document.documentElement.dataset.vaultPlayed = 'true';
  }));
  await page.locator('.family-brand').click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('html')).toHaveAttribute('data-vault-played', 'true');
  await expect(page.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Rosa’s shield' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  // Development Strict Mode can repeat each mount's session request.
  expect(roles.filter((role, index) => role !== roles[index - 1])).toEqual(['protected', 'guardian', 'protected']);
  await page.getByText('Practice tools', { exact: true }).click();
  const opened = context.waitForEvent('page');
  await page.getByRole('navigation', { name: 'Family views' }).getByRole('link', { name: 'Guardian', exact: true }).click();
  const guardian = await opened;
  await expect(guardian).toHaveURL('/guardian');
  await expect(page).toHaveURL('/protected');
  await guardian.close();
});

test('reduced motion and mobile keyboard navigation remain immediate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/guardian');
  await expect(page.locator('main h1')).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const inspector = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'The Inspector' });
  await inspector.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/inspector');
  await expect(page.getByRole('heading', { name: 'Something feel off?' })).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await expect(page.locator('.vault-transition, .route-content-calm')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('capture the vault reveal for design review', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/guardian');
  await expect(page.locator('main h1')).toBeVisible();
  // Slow only this visual capture; production navigation still takes 820ms.
  await page.addStyleTag({ content: '.vault-door { animation-duration: 30s !important; } .vault-wheel, .vault-bolts i { animation-duration: 8s !important; }' });
  const captureTime = new Date();
  await page.clock.install({ time: captureTime });
  await page.clock.pauseAt(new Date(captureTime.getTime() + 1000));
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'The Inspector' }).click();
  await expect(page.locator('.vault-transition')).toBeAttached();
  for (const [name, fraction] of [['closed', 0], ['unlocking', .27], ['opening', .65]] as const) {
    await page.locator('.vault-transition').evaluate((element, progress) => {
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.pause();
        const duration = animation.effect?.getTiming().duration;
        if (typeof duration === 'number') animation.currentTime = duration * progress;
      }
    }, fraction);
    await page.screenshot({ path: `test-results/vault-${name}.png` });
  }
  await page.clock.runFor(1200);
  await expect(page.locator('.vault-transition')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/vault-open.png' });
});


test('leaving Rosa stops microphone capture without a document reload', async ({ page }) => {
  await page.addInitScript(() => {
    class Recognition {
      start() { document.documentElement.dataset.microphone = 'listening'; }
      stop() { document.documentElement.dataset.microphone = 'stopped'; }
    }
    Object.assign(window, { SpeechRecognition: Recognition, webkitSpeechRecognition: Recognition });
  });
  await page.goto('/protected');
  await page.getByRole('navigation', { name: 'Rosa’s tasks' }).getByRole('button', { name: 'Check a call' }).click();
  await page.getByLabel('Read critical warnings aloud').uncheck();
  await page.getByRole('button', { name: 'Use microphone', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-microphone', 'listening');
  await page.locator('.family-brand').click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('html')).toHaveAttribute('data-microphone', 'stopped');
  await expect(page.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
});

test('Rosa has an explicit return button on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/protected');
  await expect(page.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  const back = page.getByRole('link', { name: 'Back to command center', exact: true });
  await expect(back).toBeVisible();
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await back.click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
});

test('every app destination receives a vault reveal', async ({ page }) => {
  await page.goto('/guardian');
  await expect(page.getByRole('heading', { name: 'Every second counts.' })).toBeVisible();
  await page.evaluate(() => document.addEventListener('animationstart', event => {
    if (event.animationName === 'vault-door-left') document.documentElement.dataset.vaultDestination = location.pathname;
  }));
  for (const route of ['protected', 'relative', 'settings', 'inspector', 'cases', 'drill', 'weather']) {
    await page.locator(`.sidebar a[href="/${route}"]`).click();
    await expect(page).toHaveURL(`/${route}`);
    await expect(page.locator('html')).toHaveAttribute('data-vault-destination', `/${route}`);
    await expect(page.locator('.vault-transition')).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL('/guardian');
    await expect(page.locator('html')).toHaveAttribute('data-vault-destination', '/guardian');
    await expect(page.locator('.vault-transition')).toHaveCount(0);
  }
});

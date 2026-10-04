import { test, expect } from '@playwright/test';

test('spotlight follows a pointer, changes cards, and clears when the pointer leaves', async ({ page }) => {
  await page.goto('/guardian');
  const board = page.locator('.detective-board');
  const card = page.locator('[data-board-node="lookout"]');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 90);
  await expect(card).toHaveAttribute('data-board-lit', 'true');
  await expect(board).toHaveAttribute('data-spotlight', 'pointer');
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--spot-x'))).toBe('40px');
  const previousBeam = await board.locator('.board-beam polygon').getAttribute('points');
  await page.mouse.move(box.x + 180, box.y + 130);
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--spot-x'))).toBe('180px');
  await expect(board.locator('.board-beam polygon')).not.toHaveAttribute('points', previousBeam!);
  const next = page.locator('[data-board-node="money"]');
  await next.hover();
  await expect(next).toHaveAttribute('data-board-lit', 'true');
  await expect(card).not.toHaveAttribute('data-board-lit');
  await page.screenshot({ path: 'test-results/detective-spotlight.png', fullPage: true });
  await page.mouse.move(1, 1);
  await expect(board).toHaveAttribute('data-spotlight', 'idle');
  await expect(board.locator('[data-board-lit]')).toHaveCount(0);
  await expect(board.locator('.board-thread')).toHaveCount(2);
  await expect(board.locator('.board-strings')).toHaveAttribute('aria-hidden', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(board.locator('.board-beam')).toHaveCSS('display', 'none');
  await expect.poll(async () => Math.abs(Number((await board.locator('.board-strings').getAttribute('viewBox'))!.split(' ')[2]) - (await board.boundingBox())!.width)).toBeLessThan(1);
});

test('keyboard lighting is steady and reduced motion stops cursor tracking', async ({ page }) => {
  await page.goto('/guardian');
  const board = page.locator('.detective-board');
  const card = page.locator('[data-board-node="lookout"]');
  await page.getByRole('button', { name: /Detected signals/ }).focus();
  await expect(board).toHaveAttribute('data-spotlight', 'keyboard');
  await expect(card).toHaveAttribute('data-board-lit', 'true');
  await expect.poll(() => card.evaluate(node => parseFloat(node.style.getPropertyValue('--spot-x')))).toBeCloseTo((await card.boundingBox())!.width / 2, 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.hover({ position: { x: 50, y: 90 } });
  await expect(card).toHaveAttribute('data-board-lit', 'true');
  const centered = await card.evaluate(node => node.style.getPropertyValue('--spot-x'));
  await card.hover({ position: { x: 150, y: 130 } });
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--spot-x'))).toBe(centered);
  await expect(board.locator('.board-beam')).toHaveCSS('display', 'none');
});

test('touch layouts retain readable choices without moving beams', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/protected');
  await expect(page.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  await expect(page.locator('.board-beam')).toHaveCSS('display', 'none');
  const choice = page.locator('[data-board-node="check-call"]');
  await choice.tap();
  await expect(page.locator('.senior-call')).toBeVisible();
  await expect(page.locator('.board-strings .board-paper-pin')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('all boards reflow at phone and 200-percent desktop-equivalent widths', async ({ page }) => {
  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['guardian', 'protected', 'relative', 'inspector', 'settings', 'cases']) {
      await page.goto(`/${route}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('.detective-board')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const visibleCards = await page.locator('[data-board-node]:visible').count();
      await expect(page.locator('.board-paper-pin')).toHaveCount(visibleCards);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}px`).toBe(true);
      await page.screenshot({ path: `test-results/detective-${route}-${width}.png`, fullPage: true });
    }
  }
});

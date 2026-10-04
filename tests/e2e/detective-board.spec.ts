import { test, expect } from '@playwright/test';

test('the lamp follows the cursor across cards, gaps and the window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/guardian');
  const board = page.locator('.detective-board');
  const card = page.locator('[data-board-node="money"]');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 90);
  await expect(card).toHaveAttribute('data-board-lit', 'true');
  await expect(board).toHaveAttribute('data-spotlight', 'pointer');
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--spot-x'))).toBe('40px');
  const previousBeam = await page.locator('.board-beam polygon').getAttribute('points');
  await page.mouse.move(box.x + 180, box.y + 130);
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--spot-x'))).toBe('180px');
  await expect(page.locator('.board-beam polygon')).not.toHaveAttribute('points', previousBeam!);
  const next = page.locator('[data-board-node="attention"]');
  await next.hover();
  await expect(next).toHaveAttribute('data-board-lit', 'true');
  await expect(card).not.toHaveAttribute('data-board-lit');
  const family = page.locator('[data-board-node="inner-circle"]');
  await family.hover();
  await expect(family).toHaveAttribute('data-board-lit', 'true');
  await expect(next).not.toHaveAttribute('data-board-lit');
  await page.screenshot({ path: 'test-results/detective-spotlight.png', fullPage: true });
  const lookout = (await page.locator('[data-board-node="lookout"]').boundingBox())!;
  await page.mouse.move(lookout.x + 40, lookout.y + 20);
  await expect(board).toHaveAttribute('data-spotlight', 'pointer');
  await expect(board.locator('[data-board-lit]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(30, 120);
  await expect(board).toHaveAttribute('data-spotlight', 'pointer');
  await expect.poll(() => page.locator('.board-beam ellipse').getAttribute('cx')).toBe('30');
  await expect(page.locator('.board-beam ellipse')).toHaveAttribute('cy', '120');
  const points = (await page.locator('.board-beam polygon').getAttribute('points'))!.split(' ').slice(0, 2).map(point => point.split(',').map(Number));
  const bulb = (await page.locator('.board-lamp-shade path[fill="#fff2bb"]').boundingBox())!;
  expect((points[0][0] + points[1][0]) / 2).toBeCloseTo(bulb.x + bulb.width / 2, 0);
  expect((points[0][1] + points[1][1]) / 2).toBeCloseTo(bulb.y + bulb.height / 2, 0);
  const boardBounds = (await board.boundingBox())!;
  const clip = await page.locator('.board-beam').evaluate(node => getComputedStyle(node).clipPath);
  const edges = [...clip.matchAll(/(-?[\d.]+)px/g)].map(match => Number(match[1]));
  const expected = [boardBounds.y, 1440 - boardBounds.x - boardBounds.width, 1000 - boardBounds.y - boardBounds.height, boardBounds.x, 7];
  expect(edges).toHaveLength(5);
  edges.forEach((edge, index) => expect(edge).toBeCloseTo(expected[index], 2));
  const sidebarWithLight = await page.locator('.sidebar').screenshot();
  await page.locator('.board-beam').evaluate(node => node.style.visibility = 'hidden');
  expect(await page.locator('.sidebar').screenshot()).toEqual(sidebarWithLight);
  await page.locator('.board-beam').evaluate(node => node.style.visibility = '');
  await page.screenshot({ path: 'test-results/window-lamp.png' });
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null })));
  await expect(board).toHaveAttribute('data-spotlight', 'idle');
  await expect(board.locator('.board-thread')).toHaveCount(2);
  await expect(board.locator('.board-strings')).toHaveAttribute('aria-hidden', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.board-beam')).toHaveCSS('display', 'none');
  await expect.poll(async () => Math.abs(Number((await board.locator('.board-strings').getAttribute('viewBox'))!.split(' ')[2]) - (await board.boundingBox())!.width)).toBeLessThan(1);
});

test('keyboard lighting is steady and reduced motion stops cursor tracking', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/guardian');
  const board = page.locator('.detective-board');
  const card = page.locator('[data-board-node="money"]');
  await card.focus();
  await expect(board).toHaveAttribute('data-spotlight', 'keyboard');
  await expect(card).toHaveAttribute('data-board-lit', 'true');
  await expect.poll(() => card.evaluate(node => parseFloat(node.style.getPropertyValue('--spot-x')))).toBeCloseTo((await card.boundingBox())!.width / 2, 0);
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-board-node="attention"]')).toHaveAttribute('data-board-lit', 'true');
  await page.getByRole('button', { name: /Detected signals/ }).focus();
  await expect(board).toHaveAttribute('data-spotlight', 'idle');
  await expect(board.locator('[data-board-lit]')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.hover({ position: { x: 50, y: 90 } });
  await expect(card).toHaveAttribute('data-board-lit', 'true');
  const centered = await card.evaluate(node => node.style.getPropertyValue('--spot-x'));
  await card.hover({ position: { x: 150, y: 130 } });
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--spot-x'))).toBe(centered);
  await expect(page.locator('.board-beam')).toHaveCSS('display', 'none');
});

test('the light stays on while the bulb is visible and switches off when it scrolls away', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const board = page.locator('.detective-board');
  const card = page.locator('[data-board-node="money"]');
  await card.hover({ position: { x: 50, y: 25 } });
  await expect(card).toHaveAttribute('data-board-lit', 'true');
  const lamp = (await board.locator('.board-lamp').boundingBox())!;
  await page.evaluate(y => window.scrollTo(0, y), lamp.y + 1);
  await expect(board).toHaveAttribute('data-spotlight', 'pointer');
  await expect(page.locator('.board-beam')).toHaveCSS('opacity', '1');
  await page.evaluate(y => window.scrollTo(0, y), lamp.y + lamp.height + 1);
  await expect(board).toHaveAttribute('data-spotlight', 'idle');
  await expect(board.locator('[data-board-lit]')).toHaveCount(0);
  await expect(page.locator('.board-beam')).toHaveCSS('opacity', '0');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(board).toHaveAttribute('data-spotlight', 'pointer');
  await expect(page.locator('.board-beam')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/window-lamp-restored.png' });
});

test('other routes have no lamps or spotlight behavior while keeping their boards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ['protected', 'relative', 'inspector', 'settings', 'cases', 'drill', 'weather']) {
    await page.goto(`/${route}`);
    const board = page.locator('.detective-board');
    await expect(board).toBeVisible();
    await expect(board.locator('.board-lamp, .board-beam')).toHaveCount(0);
    const card = board.locator('[data-board-node]:visible').first();
    if (await card.count()) {
      await card.hover();
      await expect(card).not.toHaveAttribute('data-board-lit');
      await expect(board.locator('.board-paper-pin').first()).toBeVisible();
    }
    await expect(board).toHaveAttribute('data-spotlight', 'idle');
    await expect(board).toHaveCSS('padding-top', '44px');
  }
});

test('touch layouts retain readable choices without moving beams', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/protected');
  await expect(page.getByRole('heading', { name: 'Hello, Rosa.' })).toBeVisible();
  await expect(page.locator('.board-beam, .board-lamp')).toHaveCount(0);
  const choice = page.locator('[data-board-node="check-call"]');
  await choice.tap();
  await expect(page.locator('.senior-call')).toBeVisible();
  await expect(page.locator('.board-strings .board-paper-pin')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/guardian');
  const board = page.locator('.detective-board');
  const summary = page.locator('[data-board-node="money"]');
  await summary.tap();
  await expect(page.locator('.board-beam')).toHaveCSS('display', 'none');
  await expect(summary).toHaveAttribute('data-board-lit', 'true');
  await expect.poll(() => summary.evaluate(node => parseFloat(node.style.getPropertyValue('--spot-x')))).toBeCloseTo((await summary.boundingBox())!.width / 2, 0);
  await context.close();
});

test('all boards reflow at phone and 200-percent desktop-equivalent widths', async ({ page }) => {
  for (const width of [1440, 720, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['guardian', 'protected', 'relative', 'inspector', 'settings', 'cases', 'drill', 'weather']) {
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

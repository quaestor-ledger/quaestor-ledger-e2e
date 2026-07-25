import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTarget } from '../../../src/harness.mjs';

// Puppeteer-specific coverage: CDP runtime metrics the shared interface does
// not expose. Guards against a page that "loads" but renders no real DOM or
// leaks unbounded memory on a simple landing page.
test('puppeteer CDP metrics', async (t) => {
  const { default: puppeteer } = await import('puppeteer');

  const target = await resolveTarget();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: process.env.E2E_HEADED ? false : 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (error) {
    await target.close();
    t.skip(`puppeteer unavailable: ${error?.message ?? error}`);
    return;
  }

  try {
    const page = await browser.newPage();
    await page.goto(target.baseURL, { waitUntil: 'load' });
    const metrics = await page.metrics();

    await t.test('renders a real DOM (node count is sane)', () => {
      assert.ok(metrics.Nodes > 20, `expected > 20 DOM nodes, got ${metrics.Nodes}`);
      assert.ok(metrics.Nodes < 50_000, `unexpectedly huge DOM: ${metrics.Nodes} nodes`);
    });

    await t.test('JS heap is alive and bounded', () => {
      assert.ok(metrics.JSHeapUsedSize > 0, 'expected a non-zero JS heap');
      assert.ok(
        metrics.JSHeapUsedSize < 256 * 1024 * 1024,
        `landing page should not use ${metrics.JSHeapUsedSize} bytes of JS heap`,
      );
    });

    await t.test('no long-task style layout thrash on load (layout count sane)', () => {
      assert.ok(metrics.LayoutCount >= 1, 'expected at least one layout');
      assert.ok(metrics.LayoutCount < 500, `excessive layouts on load: ${metrics.LayoutCount}`);
    });

    await t.test('navigation timing reports a completed, ordered load', async () => {
      const timing = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType('navigation');
        return nav
          ? {
              domContentLoaded: nav.domContentLoadedEventEnd,
              loadEnd: nav.loadEventEnd,
              responseEnd: nav.responseEnd,
            }
          : null;
      });
      assert.ok(timing, 'expected a PerformanceNavigationTiming entry');
      assert.ok(timing.responseEnd > 0, 'expected the response to have completed');
      assert.ok(
        timing.domContentLoaded >= timing.responseEnd,
        'expected DOMContentLoaded to occur after the response finished',
      );
      assert.ok(
        timing.loadEnd >= timing.domContentLoaded,
        'expected the load event to occur no earlier than DOMContentLoaded',
      );
    });
  } finally {
    await browser.close().catch(() => {});
    await target.close();
  }
});

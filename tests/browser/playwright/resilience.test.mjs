import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTarget } from '../../../src/harness.mjs';

// Playwright-specific coverage: request interception and offline emulation that
// the shared driver interface deliberately does not expose. Verifies the page
// degrades sanely when the network misbehaves.
test('playwright network resilience', async (t) => {
  // Playwright routes launch through a Selenium Grid when SELENIUM_REMOTE_URL is
  // set; that variable configures our Selenium suite, not this one.
  delete process.env.SELENIUM_REMOTE_URL;
  const { chromium } = await import('playwright');

  const target = await resolveTarget();
  let browser;
  try {
    browser = await chromium.launch({ headless: !process.env.E2E_HEADED });
  } catch (error) {
    await target.close();
    t.skip(`playwright unavailable: ${error?.message ?? error}`);
    return;
  }

  try {
    await t.test('renders core content even when a subresource is blocked', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      // Abort every image request; the landing page must still render its H1 and
      // feature cards (images are decorative, not load-bearing).
      await page.route('**/*', (route) =>
        route.request().resourceType() === 'image' ? route.abort() : route.continue(),
      );
      await page.goto(target.baseURL, { waitUntil: 'domcontentloaded' });
      assert.match((await page.locator('h1').first().innerText()).trim(), /Quaestor/i);
      assert.ok((await page.locator('.card').count()) >= 4, 'expected cards to render without images');
      await context.close();
    });

    await t.test('navigation fails cleanly when the browser is offline', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await context.setOffline(true);
      await assert.rejects(
        page.goto(target.baseURL, { waitUntil: 'domcontentloaded', timeout: 5000 }),
        /net::ERR_INTERNET_DISCONNECTED|NS_ERROR|Timeout|timeout/i,
        'expected an offline navigation to reject rather than resolve',
      );
      await context.close();
    });

    await t.test('a slow response still loads within the navigation budget', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      // Delay the document slightly to exercise the wait path without flaking.
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'document') {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        await route.continue();
      });
      const response = await page.goto(target.baseURL, { waitUntil: 'load' });
      assert.ok(response && response.status() < 400, 'expected the delayed document to load');
      assert.match(await page.title(), /Quaestor/i);
      await context.close();
    });
  } finally {
    await browser.close().catch(() => {});
    await target.close();
  }
});

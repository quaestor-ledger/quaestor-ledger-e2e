import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTarget } from '../../../src/harness.mjs';

// Playwright-specific coverage: request-level network assertions that the
// shared driver interface deliberately does not expose.
test('playwright network health', async (t) => {
  // Playwright routes chromium.launch through a Selenium Grid when
  // SELENIUM_REMOTE_URL is set; that variable configures our Selenium suite,
  // not this one.
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
    const page = await browser.newPage();
    const failedRequests = [];
    const errorResponses = [];
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${request.url()} (${request.failure()?.errorText})`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && !/favicon/i.test(response.url())) {
        errorResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(target.baseURL, { waitUntil: 'networkidle' });

    await t.test('no failed requests during load', () => {
      assert.deepEqual(failedRequests, []);
    });

    await t.test('no 4xx/5xx responses during load', () => {
      assert.deepEqual(errorResponses, []);
    });

    await t.test('document response is served with an HTML content type', async () => {
      const response = await page.goto(target.baseURL);
      const contentType = response.headers()['content-type'] ?? '';
      assert.match(contentType, /text\/html/);
    });

    await t.test('an unknown path returns a 404 status', async () => {
      const unknown = new URL('this-page-does-not-exist', target.baseURL).href;
      const response = await page.goto(unknown);
      assert.equal(response.status(), 404, `expected 404 for ${unknown}`);
    });

    await t.test('a path-traversal attempt is refused, not served', async () => {
      // The fixture server must reject "../" escapes rather than leak files.
      const escape = `${target.baseURL.replace(/\/$/, '')}/../../../../etc/passwd`;
      const response = await page.goto(escape).catch(() => null);
      // Either the browser/server refuses it outright (null) or answers non-2xx;
      // what must never happen is a 200 that serves a file outside the site root.
      if (response) {
        assert.ok(response.status() >= 400, `expected traversal to be refused, got ${response.status()}`);
      }
    });
  } finally {
    await browser.close().catch(() => {});
    await target.close();
  }
});

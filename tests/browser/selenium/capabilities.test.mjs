import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTarget } from '../../../src/harness.mjs';
import { seleniumRemoteURL, seleniumTargetURL } from '../../../src/config.mjs';

// Selenium-specific coverage: W3C WebDriver session semantics (capabilities,
// window rect, script execution) that the shared interface abstracts away.
// Honors SELENIUM_REMOTE_URL exactly like the shared suite (local Grid,
// cluster Grid via port-forward, or Selenium Manager fallback).
test('selenium W3C session semantics', async (t) => {
  const { Builder } = await import('selenium-webdriver');
  const { default: chrome } = await import('selenium-webdriver/chrome.js');

  const target = await resolveTarget();

  const options = new chrome.Options();
  if (!process.env.E2E_HEADED) {
    options.addArguments('--headless=new');
  }
  options.addArguments('--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800');

  let builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  if (seleniumRemoteURL) {
    builder = builder.usingServer(seleniumRemoteURL);
  }

  let driver;
  try {
    driver = await builder.build();
  } catch (error) {
    await target.close();
    t.skip(`selenium unavailable: ${error?.message ?? error}`);
    return;
  }

  try {
    await t.test('session reports Chromium-family W3C capabilities', async () => {
      const capabilities = await driver.getCapabilities();
      const browserName = String(capabilities.getBrowserName() ?? '').toLowerCase();
      assert.match(browserName, /chrom/);
      assert.ok(capabilities.getBrowserVersion(), 'expected a browser version');
    });

    await t.test('window rect can be set and read back', async () => {
      await driver.manage().window().setRect({ width: 1024, height: 768 });
      const rect = await driver.manage().window().getRect();
      assert.equal(rect.width, 1024);
      assert.equal(rect.height, 768);
    });

    await t.test('navigates and settles to a complete document', async () => {
      await driver.get(seleniumTargetURL(target.baseURL));
      const readyState = await driver.executeScript('return document.readyState;');
      assert.equal(readyState, 'complete');
      const title = await driver.getTitle();
      assert.ok(title.trim().length > 0, 'expected a document title');
    });

    await t.test('executeScript round-trips structured values', async () => {
      const value = await driver.executeScript(
        'return { cards: document.querySelectorAll(".card").length, ua: navigator.userAgent };',
      );
      assert.ok(value.cards >= 4, `expected >= 4 cards, got ${value.cards}`);
      assert.match(String(value.ua), /Chrom/i);
    });
  } finally {
    await driver.quit().catch(() => {});
    await target.close();
  }
});

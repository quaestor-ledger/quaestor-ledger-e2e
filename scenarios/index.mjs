import assert from 'node:assert/strict';

// The canonical Quaestor landing-page contract. Each scenario is written once
// against a driver-agnostic interface (see src/drivers/interface.md) and is run
// identically by the Playwright, Puppeteer, and Selenium suites, so a real
// regression is caught the same way regardless of driver and any cross-driver
// behavioural gap surfaces as a single failing driver.

export const PRODUCT_NAME = 'Quaestor';
export const ORG_URL = 'https://github.com/quaestor-ledger';
export const MIN_FEATURE_CARDS = 4;

export const scenarios = [
  {
    name: 'navigates to the site without an error status',
    async check(driver, { baseURL }) {
      const { status } = await driver.goto(baseURL);
      // Playwright/Puppeteer expose the response status; the W3C WebDriver
      // protocol does not, so Selenium reports `undefined` and we validate the
      // load through the rendered DOM below instead of a numeric status.
      if (status !== undefined) {
        assert.ok(status < 400, `expected a success status, got ${status}`);
      }
      assert.ok(await driver.count('body'), 'expected a <body> to render');
    },
  },
  {
    name: 'has a non-empty <title>',
    async check(driver, { baseURL }) {
      await driver.goto(baseURL);
      const title = (await driver.title()).trim();
      assert.ok(title.length > 0, 'expected a non-empty document title');
    },
  },
  {
    name: `h1 contains the product name "${PRODUCT_NAME}"`,
    async check(driver, { baseURL }) {
      await driver.goto(baseURL);
      const heading = await driver.text('h1');
      assert.match(heading, new RegExp(PRODUCT_NAME, 'i'));
    },
  },
  {
    name: `shows at least ${MIN_FEATURE_CARDS} feature cards`,
    async check(driver, { baseURL }) {
      await driver.goto(baseURL);
      const count = await driver.count('.card');
      assert.ok(
        count >= MIN_FEATURE_CARDS,
        `expected >= ${MIN_FEATURE_CARDS} .card elements, found ${count}`,
      );
      assert.ok(await driver.visible('.card'), 'expected the first card to be visible');
    },
  },
  {
    name: 'footer links to the GitHub org',
    async check(driver, { baseURL }) {
      await driver.goto(baseURL);
      const href = await driver.attribute(`footer a[href="${ORG_URL}"]`, 'href');
      assert.equal(href, ORG_URL);
    },
  },
  {
    name: 'reflects interaction (ping button updates status)',
    async check(driver, { baseURL }) {
      await driver.goto(baseURL);
      assert.equal(await driver.text('[data-testid="status"]'), 'idle');
      await driver.click('[data-testid="ping"]');
      await driver.waitForText('[data-testid="status"]', 'ok');
      assert.equal(await driver.text('[data-testid="status"]'), 'ok');
    },
  },
  {
    name: 'logs no console errors during load',
    async check(driver, { baseURL }) {
      driver.resetConsole();
      await driver.goto(baseURL, { waitUntil: 'load' });
      const errors = driver.consoleErrors().filter((line) => !/favicon/i.test(line));
      assert.deepEqual(errors, [], `unexpected console errors: ${errors.join(' | ')}`);
    },
  },
];

import { chromium } from 'playwright';

import { headed, navigationTimeoutMs } from '../config.mjs';

/** Playwright driver: first-class auto-waiting; the happy-path default. */
export async function createPlaywrightDriver() {
  // Playwright has a legacy feature that routes chromium.launch through a
  // Selenium Grid when SELENIUM_REMOTE_URL is set. That variable is ours (it
  // configures the *Selenium suite*), so clear it here — each test file runs in
  // its own process, so this cannot leak into the Selenium suite.
  delete process.env.SELENIUM_REMOTE_URL;
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext();
  const page = await context.newPage();

  let consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error?.message ?? error));
  });

  page.setDefaultTimeout(navigationTimeoutMs);

  return {
    name: 'playwright',

    async goto(url, { waitUntil = 'domcontentloaded' } = {}) {
      const response = await page.goto(url, { waitUntil, timeout: navigationTimeoutMs });
      return { status: response ? response.status() : undefined };
    },

    async title() {
      return page.title();
    },

    async count(selector) {
      return page.locator(selector).count();
    },

    async text(selector) {
      const value = await page.locator(selector).first().innerText();
      return value.trim();
    },

    async attribute(selector, name) {
      return page.locator(selector).first().getAttribute(name);
    },

    async visible(selector) {
      return page.locator(selector).first().isVisible();
    },

    async click(selector) {
      await page.locator(selector).first().click();
    },

    async waitForText(selector, expected, { timeoutMs = navigationTimeoutMs } = {}) {
      await page.locator(selector).filter({ hasText: expected }).first().waitFor({ timeout: timeoutMs });
    },

    resetConsole() {
      consoleErrors = [];
    },

    consoleErrors() {
      return [...consoleErrors];
    },

    async close() {
      await browser.close();
    },
  };
}

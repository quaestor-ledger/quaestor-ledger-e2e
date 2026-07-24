import puppeteer from 'puppeteer';

import { headed, navigationTimeoutMs } from '../config.mjs';

const WAIT_UNTIL = {
  load: 'load',
  domcontentloaded: 'domcontentloaded',
  networkidle: 'networkidle0',
};

/** Puppeteer driver: closer to raw CDP; reproduces headless-Chrome-specific issues. */
export async function createPuppeteerDriver() {
  const browser = await puppeteer.launch({
    headless: headed ? false : 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(navigationTimeoutMs);

  let consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error?.message ?? error));
  });

  const firstHandle = async (selector) => page.$(selector);

  return {
    name: 'puppeteer',

    async goto(url, { waitUntil = 'domcontentloaded' } = {}) {
      const response = await page.goto(url, {
        waitUntil: WAIT_UNTIL[waitUntil] ?? 'domcontentloaded',
        timeout: navigationTimeoutMs,
      });
      return { status: response ? response.status() : undefined };
    },

    async title() {
      return page.title();
    },

    async count(selector) {
      const handles = await page.$$(selector);
      return handles.length;
    },

    async text(selector) {
      const handle = await firstHandle(selector);
      if (!handle) {
        throw new Error(`no element matched ${selector}`);
      }
      const value = await page.evaluate((element) => element.textContent ?? '', handle);
      return value.trim();
    },

    async attribute(selector, name) {
      const handle = await firstHandle(selector);
      if (!handle) {
        return null;
      }
      return page.evaluate((element, attr) => element.getAttribute(attr), handle, name);
    },

    async visible(selector) {
      const handle = await firstHandle(selector);
      if (!handle) {
        return false;
      }
      return page.evaluate((element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }, handle);
    },

    async click(selector) {
      await page.click(selector);
    },

    async waitForText(selector, expected, { timeoutMs = navigationTimeoutMs } = {}) {
      await page.waitForFunction(
        (sel, text) => {
          const element = document.querySelector(sel);
          return Boolean(element && (element.textContent ?? '').includes(text));
        },
        { timeout: timeoutMs },
        selector,
        expected,
      );
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

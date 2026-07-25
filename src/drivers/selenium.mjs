import { Builder, By, Key, until, logging } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

import { headed, navigationTimeoutMs, seleniumRemoteURL, seleniumTargetURL } from '../config.mjs';

// Maps the cross-driver key names scenarios use (Playwright/Puppeteer naming)
// onto Selenium's Key constants. Single printable characters pass through.
const KEY_MAP = {
  Enter: Key.RETURN,
  Tab: Key.TAB,
  Escape: Key.ESCAPE,
  Backspace: Key.BACK_SPACE,
  Delete: Key.DELETE,
  ArrowDown: Key.ARROW_DOWN,
  ArrowUp: Key.ARROW_UP,
  ArrowLeft: Key.ARROW_LEFT,
  ArrowRight: Key.ARROW_RIGHT,
};

/**
 * Selenium driver: W3C WebDriver behaviour, for parity with Selenium-based
 * suites and features only Selenium implements. When SELENIUM_REMOTE_URL is set
 * it drives a remote Grid (e.g. the cluster's selenium/standalone-chromium);
 * otherwise Selenium Manager resolves a local chromedriver.
 */
export async function createSeleniumDriver() {
  const options = new chrome.Options();
  if (!headed) {
    options.addArguments('--headless=new');
  }
  options.addArguments('--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800');

  // Ask Chrome to surface browser-level logs so we can honour the
  // "no console errors" scenario the same way as the other drivers.
  const prefs = new logging.Preferences();
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  options.setLoggingPrefs(prefs);

  let builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  if (seleniumRemoteURL) {
    builder = builder.usingServer(seleniumRemoteURL);
  }
  const driver = await builder.build();
  await driver.manage().setTimeouts({ pageLoad: navigationTimeoutMs, implicit: 0 });

  const consoleErrors = [];
  const drainBrowserLogs = async () => {
    try {
      const entries = await driver.manage().logs().get(logging.Type.BROWSER);
      for (const entry of entries) {
        if (entry.level && (entry.level.name === 'SEVERE' || entry.level.name === 'ERROR')) {
          consoleErrors.push(entry.message);
        }
      }
    } catch {
      // Some Grid/driver combinations do not support the logging endpoint;
      // treat that as "no captured errors" rather than failing the run.
    }
  };

  const first = async (selector) => {
    const elements = await driver.findElements(By.css(selector));
    return elements[0] ?? null;
  };

  return {
    name: 'selenium',

    async goto(url, _options = {}) {
      await driver.get(seleniumTargetURL(url));
      await drainBrowserLogs();
      // W3C WebDriver has no navigation response status.
      return { status: undefined };
    },

    async back() {
      await driver.navigate().back();
      // navigate().back() does not wait for the document; settle it ourselves so
      // the shared scenarios can read the page immediately, like the other drivers.
      await driver.wait(async () => (await driver.executeScript('return document.readyState;')) === 'complete', navigationTimeoutMs);
      await drainBrowserLogs();
    },

    async forward() {
      await driver.navigate().forward();
      await driver.wait(async () => (await driver.executeScript('return document.readyState;')) === 'complete', navigationTimeoutMs);
      await drainBrowserLogs();
    },

    async title() {
      return driver.getTitle();
    },

    async count(selector) {
      const elements = await driver.findElements(By.css(selector));
      return elements.length;
    },

    async text(selector) {
      const element = await first(selector);
      if (!element) {
        throw new Error(`no element matched ${selector}`);
      }
      const value = await element.getText();
      return value.trim();
    },

    async attribute(selector, name) {
      const element = await first(selector);
      if (!element) {
        return null;
      }
      return element.getAttribute(name);
    },

    async visible(selector) {
      const element = await first(selector);
      if (!element) {
        return false;
      }
      return element.isDisplayed();
    },

    async click(selector) {
      const element = await first(selector);
      if (!element) {
        throw new Error(`no element matched ${selector}`);
      }
      await element.click();
      await drainBrowserLogs();
    },

    async fill(selector, value) {
      const element = await first(selector);
      if (!element) {
        throw new Error(`no element matched ${selector}`);
      }
      await element.clear();
      if (value !== '') {
        await element.sendKeys(value);
      }
      // chromedriver's clear() does not emit an input event, so a listener-driven
      // UI would miss a cleared field. Dispatch input/change so fill() notifies
      // listeners exactly like the Playwright and Puppeteer adapters do.
      await driver.executeScript(
        'arguments[0].dispatchEvent(new Event("input", { bubbles: true }));' +
          'arguments[0].dispatchEvent(new Event("change", { bubbles: true }));',
        element,
      );
    },

    async press(selector, key) {
      const element = await first(selector);
      if (!element) {
        throw new Error(`no element matched ${selector}`);
      }
      await element.sendKeys(KEY_MAP[key] ?? key);
      await drainBrowserLogs();
    },

    async waitForText(selector, expected, { timeoutMs = navigationTimeoutMs } = {}) {
      const element = await first(selector);
      if (!element) {
        throw new Error(`no element matched ${selector}`);
      }
      await driver.wait(until.elementTextContains(element, expected), timeoutMs);
    },

    async setViewport(width, height) {
      // Selenium sizes the OS window; in headless Chromium the window size and
      // the viewport are effectively the same, which is close enough for
      // responsive-layout scenarios.
      await driver.manage().window().setRect({ width, height });
    },

    async evaluate(expression) {
      return driver.executeScript(`return (${expression});`);
    },

    resetConsole() {
      consoleErrors.length = 0;
    },

    consoleErrors() {
      return [...consoleErrors];
    },

    async close() {
      await driver.quit();
    },
  };
}

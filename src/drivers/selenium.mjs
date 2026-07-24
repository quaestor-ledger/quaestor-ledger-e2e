import { Builder, By, until, logging } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

import { headed, navigationTimeoutMs, seleniumRemoteURL, seleniumTargetURL } from '../config.mjs';

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

    async waitForText(selector, expected, { timeoutMs = navigationTimeoutMs } = {}) {
      const element = await first(selector);
      if (!element) {
        throw new Error(`no element matched ${selector}`);
      }
      await driver.wait(until.elementTextContains(element, expected), timeoutMs);
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

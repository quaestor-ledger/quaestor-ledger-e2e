import { createPlaywrightDriver } from '../../../src/drivers/playwright.mjs';
import { defineDriverSuite } from '../../../src/harness.mjs';

// The same shared scenarios, driven on Gecko for cross-browser coverage. Skips
// cleanly (via the harness) when the Firefox binary is not installed.
defineDriverSuite('playwright-firefox', () => createPlaywrightDriver({ browserName: 'firefox' }));

import { createPlaywrightDriver } from '../../../src/drivers/playwright.mjs';
import { defineDriverSuite } from '../../../src/harness.mjs';

// The same shared scenarios, driven on WebKit for cross-browser coverage. Skips
// cleanly (via the harness) when the WebKit binary is not installed.
defineDriverSuite('playwright-webkit', () => createPlaywrightDriver({ browserName: 'webkit' }));

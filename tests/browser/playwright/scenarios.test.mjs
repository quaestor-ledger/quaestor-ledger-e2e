import { createPlaywrightDriver } from '../../../src/drivers/playwright.mjs';
import { defineDriverSuite } from '../../../src/harness.mjs';

defineDriverSuite('playwright', createPlaywrightDriver);

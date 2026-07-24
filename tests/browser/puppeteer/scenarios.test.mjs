import { createPuppeteerDriver } from '../../../src/drivers/puppeteer.mjs';
import { defineDriverSuite } from '../../../src/harness.mjs';

defineDriverSuite('puppeteer', createPuppeteerDriver);

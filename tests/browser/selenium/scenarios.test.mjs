import net from 'node:net';

import { createSeleniumDriver } from '../../../src/drivers/selenium.mjs';
import { defineDriverSuite } from '../../../src/harness.mjs';
import { seleniumRemoteURL } from '../../../src/config.mjs';

// The Selenium suite needs either a reachable remote Grid (SELENIUM_REMOTE_URL)
// or a local chromedriver that Selenium Manager can resolve. To keep `npm test`
// green on a laptop with neither, we probe a configured Grid up front and skip
// the suite with a clear reason when it is unreachable, instead of failing.
async function reachable(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve(false);
      return;
    }
    const socket = net.connect({
      host: parsed.hostname,
      port: Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
    });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

const skip = seleniumRemoteURL && !(await reachable(seleniumRemoteURL))
  ? `SELENIUM_REMOTE_URL (${seleniumRemoteURL}) is not reachable — start a Grid with \`npm run selenium:up\` or \`npm run selenium:cluster\``
  : undefined;

defineDriverSuite('selenium', createSeleniumDriver, { skip });

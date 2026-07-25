# Cross-browser and cross-driver

The suite runs the shared scenarios across a matrix of **drivers** (how the
browser is controlled) and **engines** (which rendering/JS engine runs).

| Driver | Engine(s) | Transport | Notes |
|---|---|---|---|
| Playwright | Chromium, Firefox, WebKit | Playwright protocol | `createPlaywrightDriver({ browserName })` |
| Puppeteer | Chromium | CDP | headless Chrome |
| Selenium | Chromium | W3C WebDriver | local chromedriver or a remote Grid |

`npm run test:playwright` runs all three Playwright engines (`test:firefox` /
`test:webkit` run one). `npm run browsers:install` fetches Chromium, Firefox, and
WebKit. In CI the workflow runs `npx playwright install-deps` so Firefox and
WebKit have their system libraries on Linux (otherwise they skip cleanly).

## Normalisations (why scenarios never branch on `driver.name`)

Adapters absorb the differences so scenarios stay identical:

- **Selenium `clear()` emits no `input` event.** Chromedriver clears an input's
  value without dispatching `input`, so a listener-driven UI (like the fixture's
  feature filter) would not react to a cleared field. The Selenium `fill` adapter
  dispatches `input`/`change` after clearing, matching Playwright and Puppeteer.

- **Selenium `getText()` is unreliable for form-associated elements.** It does
  not always report the rendered text of an `<output>`. Scenarios that need the
  result of an interaction assert the resulting DOM via `evaluate` rather than
  waiting on such an element's text.

- **`press` key names.** Scenarios use Playwright/Puppeteer key names
  (`'Enter'`, `'Tab'`, `'ArrowDown'`, …). The Selenium adapter maps them onto the
  `Key` constants; single printable characters pass through.

- **`back()` / `forward()` settling.** Playwright and Puppeteer wait for the
  document on history navigation; the Selenium adapter explicitly waits for
  `document.readyState === 'complete'` so scenarios can read the page right after.

## Viewport caveat (Selenium)

Playwright and Puppeteer set the **viewport** directly, so they can emulate very
narrow screens (e.g. 360 px). Selenium sizes the **OS window**, and headless
Chrome clamps the window to roughly **500 px minimum width** — so a sub-400 px
layout (like a single-column card reflow) cannot be reproduced there.

The relevant scenario therefore gates on the viewport the driver can actually
deliver — it measures `window.innerWidth` after `setViewport(360, …)` and skips
when the driver could not go narrow enough — instead of branching on the driver
name. This is why the full run shows **one intentional skip** on Selenium.

## The console-error scenario

Each adapter captures browser console errors differently (Playwright/Puppeteer
via `page.on('console'|'pageerror')`; Selenium via the BROWSER log at `SEVERE`).
The "logs no console errors" scenario filters `favicon`-related noise (the
browser's automatic `/favicon.ico` request 404s against the fixture). If a driver
cannot surface console logs at all, it captures none — treated as "no errors"
rather than a failure.

## SELENIUM_REMOTE_URL and Playwright

Playwright has a legacy feature that routes `chromium.launch` through a Selenium
Grid when `SELENIUM_REMOTE_URL` is set. That variable belongs to the Selenium
suite, so the Playwright adapter and Playwright-specific tests **delete it** from
their process env before launching. Each test file runs in its own process
(suites run at `--test-concurrency=1`), so this never leaks into the Selenium
suite.

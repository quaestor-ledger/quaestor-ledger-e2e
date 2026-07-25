# Architecture

The suite is built around one idea: **write a UI check once, run it everywhere.**
A single set of driver-agnostic scenarios executes across three automation
drivers (Playwright, Puppeteer, Selenium) and three browser engines (Chromium,
Firefox, WebKit), so a regression is caught the same way regardless of how the
browser is driven, and a genuine cross-driver or cross-browser gap surfaces as a
single failing context.

## Pieces

```
scenarios/index.mjs        the canonical scenario set (driver-agnostic)
src/drivers/               one adapter per driver, all exposing the same surface
  interface.md             the adapter contract (source of truth)
  playwright.mjs           parameterized by engine: chromium | firefox | webkit
  puppeteer.mjs            headless Chrome over CDP
  selenium.mjs             W3C WebDriver, local chromedriver or a remote Grid
src/harness.mjs            resolves the target, runs every scenario per driver
src/config.mjs             environment resolution (target URL, Grid, timeouts)
src/fixture-server.mjs     serves the bundled fixture site on an ephemeral port
fixtures/site/             the fixture HTML (index.html + ledger.html)
tests/contract.test.mjs    browser-free HTML contract smoke
tests/browser/<driver>/    thin per-driver suites + driver-specific extras
```

## Control flow

1. A per-driver test file (e.g. `tests/browser/playwright/scenarios.test.mjs`)
   calls `defineDriverSuite(name, createDriver)`.
2. `defineDriverSuite` (in `src/harness.mjs`) resolves the **target**
   (`resolveTarget()`): the bundled fixture server, or an external URL when
   `E2E_BASE_URL` is set.
3. It creates **one** driver session and iterates `scenarios`. Each scenario is
   a subtest. If the driver cannot start (binary missing, Grid unreachable) the
   whole suite **skips** with a reason rather than failing the others.
4. Each scenario may declare `applicable(driver, ctx)`; when it returns false the
   scenario skips (this is how fixture-only interactivity avoids failing against
   the deployed marketing site).

## Why one scenario set, many adapters

The alternative — a separate test file per driver — drifts: a check gets fixed in
the Playwright suite and forgotten in Selenium. Here every driver runs the *same*
`scenarios/index.mjs`, so coverage is identical by construction and a driver that
behaves differently is the signal, not noise. The cost is that adapters must
**normalise driver quirks** so scenarios never branch on `driver.name`; see
[cross-browser-and-drivers.md](cross-browser-and-drivers.md) for the specific
normalisations.

## The target: fixture vs. real surface

- **Bundled fixture** (default): `src/fixture-server.mjs` serves `fixtures/site/`
  on `http://127.0.0.1:<ephemeral>`. Self-contained, offline, deterministic.
- **External** (`E2E_BASE_URL=https://…`): the same scenarios run against a
  deployed Quaestor surface. Scenarios that assert fixture-only affordances
  (ping button, filter, second page) skip via their `applicable` gate, so the
  contract that survives is exactly the part a real site must also satisfy.

See [remote-grids.md](remote-grids.md) for running the drivers against remote
browser servers (Selenium Grid / Playwright server / browserless) in the
`k8s-cluster` on AWS and Hetzner.

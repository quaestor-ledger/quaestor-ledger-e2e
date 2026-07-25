# Driver interface

Every driver adapter (`playwright.mjs`, `puppeteer.mjs`, `selenium.mjs`) exposes
the same async surface so the shared scenarios in `scenarios/index.mjs` run
unchanged across all three back-ends.

```
createXDriver(options) -> Promise<Driver>

Driver {
  name: string                                   // 'playwright' | 'puppeteer' | 'selenium'

  goto(url, { waitUntil? }) -> Promise<{ status: number | undefined }>
      // status is undefined for Selenium (W3C WebDriver exposes no response code)
  back() -> Promise<void>                         // history back, settled to a loaded document
  forward() -> Promise<void>                       // history forward, settled to a loaded document

  title() -> Promise<string>
  count(cssSelector) -> Promise<number>
  text(cssSelector) -> Promise<string>           // trimmed text of the first match; throws if none
  attribute(cssSelector, name) -> Promise<string | null>
  visible(cssSelector) -> Promise<boolean>        // first match visible?
  click(cssSelector) -> Promise<void>
  fill(cssSelector, value) -> Promise<void>       // replace an input's value, firing input events ('' clears it)
  press(cssSelector, key) -> Promise<void>        // focus the element and press one key (e.g. 'Enter', 'Tab', 'a')
  waitForText(cssSelector, expected, { timeoutMs? }) -> Promise<void>

  setViewport(width, height) -> Promise<void>     // Selenium sizes the window (≈ viewport headless)
  evaluate(expressionString) -> Promise<unknown>  // evaluate a JS *expression* in the page

  resetConsole() -> void                          // drop console errors captured so far
  consoleErrors() -> string[]                     // SEVERE/error console output since last reset

  close() -> Promise<void>
}
```

Scenarios may also declare `applicable(driver, ctx) -> Promise<boolean>`; the
harness skips the scenario (with a reason) when it returns false, which is how
fixture-only interactivity avoids failing against the deployed site.

Adapters normalise driver-specific quirks (Selenium browser-log capability,
Puppeteer visibility checks, host rewriting for a remote Grid) so scenarios stay
free of `if (driver.name === ...)` branches.

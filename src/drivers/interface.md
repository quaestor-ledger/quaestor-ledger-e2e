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

  title() -> Promise<string>
  count(cssSelector) -> Promise<number>
  text(cssSelector) -> Promise<string>           // trimmed text of the first match; throws if none
  attribute(cssSelector, name) -> Promise<string | null>
  visible(cssSelector) -> Promise<boolean>        // first match visible?
  click(cssSelector) -> Promise<void>
  waitForText(cssSelector, expected, { timeoutMs? }) -> Promise<void>

  resetConsole() -> void                          // drop console errors captured so far
  consoleErrors() -> string[]                     // SEVERE/error console output since last reset

  close() -> Promise<void>
}
```

Adapters normalise driver-specific quirks (Selenium browser-log capability,
Puppeteer visibility checks, host rewriting for a remote Grid) so scenarios stay
free of `if (driver.name === ...)` branches.

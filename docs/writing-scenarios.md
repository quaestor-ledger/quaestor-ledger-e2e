# Writing scenarios

A scenario is one entry in `scenarios/index.mjs`. It runs on every driver and
every engine automatically. Write it once, against the driver interface — never
branch on `driver.name`.

## Shape

```js
{
  name: 'a short, specific description',
  // optional gate: skip this scenario when it does not apply to the target
  async applicable(driver, { baseURL }) {
    await driver.goto(baseURL);
    return (await driver.count('[data-testid="thing"]')) > 0;
  },
  // the check: navigate, then assert with node:assert/strict; throw on failure
  async check(driver, { baseURL }) {
    await driver.goto(baseURL);
    assert.equal(await driver.text('h1'), 'Expected');
  },
}
```

Rules:

- **Self-navigate.** Every `check` should `goto(baseURL)` first. Scenarios share
  one driver session and run sequentially, so a scenario must not depend on where
  a previous one left the page.
- **Restore side effects in `finally`.** The page URL resets on the next
  scenario's `goto`, but the **viewport does not** — a scenario that calls
  `setViewport` must reset it (to `1280×800`) in a `finally`. The same applies to
  anything else durable within the session.
- **Gate fixture-only checks** with `applicable`. The deployed site has no ping
  button, filter, or second page; gating keeps those scenarios green against it.
- **Assert on the DOM, not driver internals.** Use the adapter surface below;
  reach for `evaluate` for anything structural.

## The adapter surface

The full contract lives in [`../src/drivers/interface.md`](../src/drivers/interface.md).
Summary:

| Method | Purpose |
|---|---|
| `goto(url, { waitUntil? })` | navigate; returns `{ status }` (undefined on Selenium) |
| `back()` / `forward()` | history navigation, settled to a loaded document |
| `title()` | document title |
| `count(sel)` | number of matches |
| `text(sel)` | trimmed text of the first match (throws if none) |
| `attribute(sel, name)` | attribute value or null |
| `visible(sel)` | is the first match visible |
| `click(sel)` | click the first match |
| `fill(sel, value)` | replace an input's value, firing input events (`''` clears) |
| `press(sel, key)` | focus and press one key (`'Enter'`, `'Tab'`, `'a'`) |
| `waitForText(sel, text)` | wait until the element contains text |
| `setViewport(w, h)` | resize (Selenium sizes the OS window) |
| `evaluate(expr)` | evaluate a JS **expression** string in the page |
| `resetConsole()` / `consoleErrors()` | console-error capture |

### `evaluate` takes an expression, not a function

Selenium wraps the argument as `return (<expr>);`, so pass a single expression.
For multi-step logic use an IIFE:

```js
const ok = await driver.evaluate(
  `(() => {
     const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
     return new Set(ids).size === ids.length;
   })()`,
);
```

## Adding a capability

If a scenario needs something the interface lacks (e.g. `hover`, `selectOption`,
`screenshot`), add the method to **all three** adapters in `src/drivers/*.mjs`,
document it in `interface.md`, and — critically — make the three implementations
behave identically. When a driver cannot match the others (e.g. Selenium
`clear()` fires no `input` event), the adapter must paper over the difference so
scenarios stay driver-agnostic. See
[cross-browser-and-drivers.md](cross-browser-and-drivers.md) for the existing
normalisations and viewport caveats.

## Driver-specific tests

Some checks are inherently driver-specific (Playwright request interception,
Puppeteer CDP metrics, Selenium W3C capabilities). Those live beside the shared
suite in `tests/browser/<driver>/` as their own `node:test` files and are not
part of `scenarios/index.mjs`.

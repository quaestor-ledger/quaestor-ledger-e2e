# Coverage

What the suite checks today, and where the deliberate gaps are.

## Shared scenarios (34)

Each runs on Playwright (Chromium/Firefox/WebKit), Puppeteer, and Selenium.
Fixture-only scenarios (marked †) skip against an external `E2E_BASE_URL` target.

**Load & document basics**
1. navigates to the site without an error status
2. has a non-empty `<title>`
3. h1 contains the product name "Quaestor"
4. shows at least 4 feature cards
5. footer links to the GitHub org
6. declares a document language
7. has a non-empty meta description
8. every feature card has a heading
11. logs no console errors during load

**Accessibility & semantics**
12. has exactly one `<h1>`
13. uses a heading hierarchy that starts at h1 and skips no level
14. every link has a non-empty, non-javascript href
15. the feature list has an accessible name
16. all images have alt text †(gated on `<img>` presence)
17. every button has an accessible name
18. contains no duplicate element ids
19. renders header, main, and footer landmarks

**Head / metadata**
20. declares a mobile viewport meta
21. declares a UTF-8 character encoding
22. `<title>` contains "Quaestor"

**Content**
23. shows a non-empty tagline
24. every feature card has a body paragraph

**Responsive layout**
9. is responsive at a mobile viewport (no horizontal overflow)
25. has no horizontal overflow across a viewport matrix (320–1440 px)
26. feature cards stack into one column on a narrow viewport † (skips on
    Selenium — see viewport caveat in
    [cross-browser-and-drivers.md](cross-browser-and-drivers.md))

**Interaction** † (fixture-only)
10. reflects interaction (ping button updates status)
27. resetting returns the health status to idle
28. filtering features narrows the visible cards (`fill`)
29. submitting the filter form does not navigate away (`fill` + `press`)
30. the filter input is keyboard focusable

**Navigation & history** † (fixture-only)
31. the primary navigation links home and to the ledger
32. marks the current page in the navigation
33. the ledger page renders its own document
34. browser history back and forward move between pages (`back`/`forward`)

## Browser-free contract smoke (`tests/contract.test.mjs`)

Fetches the target HTML and checks the invariants a real Quaestor surface must
also satisfy: success status, `<title>`, h1 mentions the product, ≥4 cards,
footer GitHub link, document language, meta description, exactly one `<h1>`, and
(fixture-only) that the ledger page is reachable and lists entries. Runs without
any browser, so CI gates on it before the heavier suites.

## Driver-specific tests

- **Playwright** — `network.test.mjs`: no failed requests, no 4xx/5xx, HTML
  content type, 404 for unknown paths, refused path traversal.
  `resilience.test.mjs`: renders with images blocked, offline navigation rejects,
  a slow response still loads.
- **Puppeteer** — `metrics.test.mjs`: CDP metrics (DOM node count, JS heap,
  layout count) and navigation-timing ordering.
- **Selenium** — `capabilities.test.mjs`: W3C capabilities, window rect,
  `document.readyState`, `executeScript` round-trip.

## Totals

`npm test` runs everything: **~200 test executions**, all green except **one
intentional Selenium skip** (the narrow-viewport reflow). Exact counts move as
scenarios are added; the invariant is *zero failures, skips only where a driver
genuinely cannot reach the condition*.

## Known gaps (candidates for future work)

- No accessibility audit engine (e.g. axe-core) — checks are hand-written.
- No visual/screenshot regression.
- `hover`, `selectOption`, and file-upload capabilities are not in the adapter.
- Only one interactive form (the feature filter); no real submit-to-server flow.
- No cookie/localStorage/session persistence assertions.
- External-target (`E2E_BASE_URL`) runs exercise only the non-fixture subset.

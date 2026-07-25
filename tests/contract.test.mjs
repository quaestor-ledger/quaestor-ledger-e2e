import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTarget } from '../src/harness.mjs';
import { ORG_URL, PRODUCT_NAME, MIN_FEATURE_CARDS } from '../scenarios/index.mjs';

// A browser-free smoke of the target's HTML contract. Runs without Playwright,
// Puppeteer, or a Grid, so CI can gate on it before the heavier driver suites.
test('target HTML satisfies the Quaestor landing-page contract', async (t) => {
  const target = await resolveTarget();
  try {
    const response = await fetch(target.baseURL, { redirect: 'follow' });
    assert.ok(response.status < 400, `expected success status, got ${response.status}`);
    const html = await response.text();

    await t.test('has a <title>', () => {
      assert.match(html, /<title>[^<]+<\/title>/i);
    });

    await t.test(`h1 mentions "${PRODUCT_NAME}"`, () => {
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      assert.ok(h1, 'expected an <h1>');
      assert.match(h1[1], new RegExp(PRODUCT_NAME, 'i'));
    });

    await t.test(`has >= ${MIN_FEATURE_CARDS} .card elements`, () => {
      const cards = html.match(/class="[^"]*\bcard\b[^"]*"/g) ?? [];
      assert.ok(
        cards.length >= MIN_FEATURE_CARDS,
        `expected >= ${MIN_FEATURE_CARDS} cards, found ${cards.length}`,
      );
    });

    await t.test('footer links to the GitHub org', () => {
      assert.ok(html.includes(ORG_URL), `expected a link to ${ORG_URL}`);
    });

    await t.test('declares a document language', () => {
      assert.match(html, /<html[^>]*\blang\s*=\s*["'][^"']+["']/i);
    });

    await t.test('has a non-empty meta description', () => {
      const meta = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
      assert.ok(meta && meta[1].trim().length > 0, 'expected a non-empty meta description');
    });

    await t.test('declares exactly one <h1>', () => {
      const count = (html.match(/<h1[\s>]/gi) ?? []).length;
      assert.equal(count, 1, `expected exactly one <h1>, found ${count}`);
    });

    // Fixture-only: the bundled site ships a second page. The deployed target
    // does not, so this is gated on the nav marker and skipped otherwise.
    await t.test('the ledger page is reachable and lists entries', async (st) => {
      if (!html.includes('data-testid="nav-ledger"')) {
        st.skip('target has no ledger page');
        return;
      }
      const ledgerURL = new URL('ledger.html', target.baseURL).href;
      const ledger = await fetch(ledgerURL, { redirect: 'follow' });
      assert.ok(ledger.status < 400, `expected the ledger page to load, got ${ledger.status}`);
      const ledgerHtml = await ledger.text();
      assert.match(ledgerHtml, /Recent entries/i);
      assert.match(ledgerHtml, /<table[\s>]/i);
    });
  } finally {
    await target.close();
  }
});

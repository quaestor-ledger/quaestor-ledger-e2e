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
  } finally {
    await target.close();
  }
});

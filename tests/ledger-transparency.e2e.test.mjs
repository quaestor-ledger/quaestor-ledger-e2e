// Real HTTP fixture acceptance across the Quaestor navigation and balanced
// double-entry journal, without a browser driver or external ledger account.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFixtureServer } from '../src/fixture-server.mjs';

const timeout = () => ({ signal: AbortSignal.timeout(4000) });

function cents(cell) {
  const text = cell.trim();
  if (text === '—') return 0;
  assert.match(text, /^\d{1,3}(?:,\d{3})*\.\d{2}$/, 'journal value must be a decimal amount');
  const [whole, decimal] = text.replaceAll(',', '').split('.');
  return Number(whole) * 100 + Number(decimal);
}

function journal(html) {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1];
  assert.ok(tbody, 'ledger table must have a body');
  const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((match) =>
    [...match[1].matchAll(/<td[^>]*>([^<]*)<\/td>/gi)].map((cell) => cell[1].trim()));
  assert.ok(rows.length >= 4, 'fixture must include multiple balanced journal entries');
  for (const row of rows) assert.equal(row.length, 4, 'every row has four ledger cells');
  return rows.map(([entry, account, debit, credit]) => ({
    entry, account, debit: cents(debit), credit: cents(credit),
  }));
}

test('home-to-ledger navigation crosses a real HTTP listener with a balanced journal',
  { timeout: 12_000 }, async (t) => {
    const fixture = await startFixtureServer();
    t.after(() => fixture.close());
    const home = await fetch(fixture.baseURL + '/', timeout());
    assert.equal(home.status, 200);
    const landing = await home.text();
    assert.match(landing, /<h1>Quaestor Ledger<\/h1>/);
    assert.match(landing, /href="ledger\.html"/, 'landing page must link to the ledger');

    const response = await fetch(fixture.baseURL + '/ledger.html', timeout());
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/i);
    const html = await response.text();
    assert.match(html, /<caption>Every debit has an equal and opposite credit\.<\/caption>/);
    for (const heading of ['Entry', 'Account', 'Debit', 'Credit']) {
      assert.ok(html.includes('>' + heading + '</th>'), 'missing ledger column ' + heading);
    }

    const perEntry = new Map();
    for (const item of journal(html)) {
      assert.ok(item.account.length > 0, 'journal row must identify its account');
      assert.ok(item.debit === 0 || item.credit === 0, 'a posting cannot have both a debit and credit');
      const totals = perEntry.get(item.entry) ?? { debit: 0, credit: 0, postings: 0 };
      totals.debit += item.debit;
      totals.credit += item.credit;
      totals.postings += 1;
      perEntry.set(item.entry, totals);
    }
    assert.equal(perEntry.size, 2, 'fixture has two distinct journal entries');
    for (const [entry, totals] of perEntry) {
      assert.equal(totals.postings, 2, entry + ': missing posting');
      assert.ok(totals.debit > 0, entry + ': entry is empty');
      assert.equal(totals.debit, totals.credit, entry + ': debits must equal credits exactly');
    }
  });

test('parallel readers observe immutable ledger bytes and no reflected query input',
  { timeout: 12_000 }, async (t) => {
    const fixture = await startFixtureServer();
    t.after(() => fixture.close());
    const queries = Array.from({ length: 16 }, (_, i) =>
      '/ledger.html?' + new URLSearchParams({ marker: i % 2 ? '<script>not-trusted</script>' : String(i) }));
    const responses = await Promise.all(queries.map(async (path) => {
      const response = await fetch(fixture.baseURL + path, timeout());
      assert.equal(response.status, 200);
      return response.text();
    }));
    assert.ok(responses.every((html) => html === responses[0]), 'query data changed immutable fixture output');
    assert.equal(responses[0].includes('<script>not-trusted</script>'), false);
    assert.equal(journal(responses[0]).length, 4);
    const missing = await fetch(fixture.baseURL + '/not-a-ledger.html', timeout());
    assert.equal(missing.status, 404);
    assert.equal((await missing.text()).includes('Opening balance'), false);
  });

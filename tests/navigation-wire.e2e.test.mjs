// Browser-independent end-to-end navigation: actual TCP fixture, rendered
// links, HEAD/GET parity, and parallel page reads. No external URL is fetched.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFixtureServer } from '../src/fixture-server.mjs';

const htmlHeaders = /^text\/html(?:;|$)/i;
const fetchBounded = (url, method = 'GET') =>
  fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(5000) });

function links(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

test('every same-origin navigation link resolves through the real HTTP fixture', { timeout: 15000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(() => fixture.close());
  const base = new URL(fixture.baseURL);

  const home = await fetchBounded(new URL('/', base));
  assert.equal(home.status, 200);
  const homeHTML = await home.text();
  const canonical = await fetchBounded(new URL('/index.html', base));
  assert.equal(canonical.status, 200);
  assert.equal(await canonical.text(), homeHTML, 'slash and index.html must serve identical bytes');

  const discovered = new Set(['/']);
  const expected = new Set(['/index.html', '/ledger.html']);
  const pageQueue = [{ url: new URL('/', base), html: homeHTML }];

  for (let index = 0; index < pageQueue.length; index += 1) {
    const { url, html } = pageQueue[index];
    for (const href of links(html)) {
      const destination = new URL(href, url);
      if (destination.origin !== base.origin) {
        assert.equal(destination.protocol, 'https:', 'external navigation must use HTTPS');
        continue;
      }
      assert.equal(destination.username, '');
      assert.equal(destination.password, '');
      assert.ok(expected.has(destination.pathname), 'unexpected internal destination ' + destination.pathname);
      if (discovered.has(destination.pathname)) continue;
      discovered.add(destination.pathname);
      const response = await fetchBounded(destination);
      assert.equal(response.status, 200, href);
      assert.match(response.headers.get('content-type') ?? '', htmlHeaders);
      const body = await response.text();
      assert.match(body, /<main(?:\s|>)/i, 'missing main landmark at ' + href);
      assert.match(body, /<title>[^<]+<\/title>/i, 'missing page title at ' + href);
      pageQueue.push({ url: destination, html: body });
    }
  }
  assert.ok(discovered.has('/ledger.html'), 'home-to-ledger link was not reachable');
  assert.ok(discovered.has('/index.html'), 'ledger-to-home navigation was not reachable');
});

test('parallel GET and HEAD clients cannot corrupt static navigation or reveal query input',
  { timeout: 15000 }, async (t) => {
    const fixture = await startFixtureServer();
    t.after(() => fixture.close());
    const base = new URL(fixture.baseURL);
    const paths = ['/index.html', '/ledger.html'];
    const expectedHTML = await Promise.all(paths.map(async (path) => {
      const response = await fetchBounded(new URL(path, base));
      assert.equal(response.status, 200);
      return response.text();
    }));

    await Promise.all(Array.from({ length: 24 }, async (_, index) => {
      const pathIndex = index % paths.length;
      const url = new URL(paths[pathIndex], base);
      url.searchParams.set('untrusted', '<script>unauthorized()</script>' + index);
      const response = await fetchBounded(url);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', htmlHeaders);
      assert.equal(await response.text(), expectedHTML[pathIndex], 'query modified immutable page bytes');
      const head = await fetchBounded(url, 'HEAD');
      assert.equal(head.status, 200, 'HEAD must match GET status');
      assert.match(head.headers.get('content-type') ?? '', htmlHeaders);
      assert.equal(await head.text(), '', 'HEAD must not return a body');
    }));
    const missing = await fetchBounded(new URL('/not-present.html', base), 'HEAD');
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), '');
  });

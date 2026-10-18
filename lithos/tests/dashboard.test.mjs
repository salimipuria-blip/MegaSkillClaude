// Static contract for the dashboard shell (index.html).
//
// The page is a single minified file, so these checks are deliberately textual: they guard the two
// promises the product makes — "no fabricated numbers" and "only the publishable key in the
// browser". Run them together with the API tests: `node --test tests/*.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

test('every query result is inspected for an error before it is rendered', () => {
  // Previously `const [i,k,l,s] = await Promise.all([...])` was rendered straight away: an RLS or
  // network failure silently produced a dashboard full of "—" and "0", i.e. fake zeros.
  assert.match(script, /failed/);
  assert.match(script, /res\.error/);
  for (const label of ['insights', 'KPI', 'leads', 'sources']) {
    assert.ok(script.includes(`'${label}'`), `the ${label} query must be checked by name`);
  }
});

test('a failed load says so and keeps the last successful timestamp', () => {
  assert.match(script, /asOf/);
  assert.match(script, /last good data/);
  assert.match(script, /Could not load/);
  // the freshness line is in the DOM and is updated on every refresh
  assert.match(html, /id="asOf"/);
  assert.match(script, /\$\('asOf'\)\.textContent/);
});

test('a thrown network error is caught, not left to reject the render promise', () => {
  assert.match(script, /try\{[\s\S]*Promise\.all\([\s\S]*\}catch\(/);
  assert.match(script, /Network error/);
});

test('only the publishable Supabase key ships to the browser', () => {
  assert.doesNotMatch(html, /service_role/);
  assert.doesNotMatch(html, /sb_secret_/);
  assert.match(html, /sb_publishable_/);
});

test('the API key is never referenced from the client', () => {
  assert.doesNotMatch(html, /BUFFER_API_KEY/);
});

test('supabase-js is pinned to an exact file with Subresource Integrity', () => {
  // A floating `@2` tag lets the CDN serve new code to an owner-only dashboard; the hash was taken
  // from the npm tarball of 2.58.0 (dist/umd/supabase.js), so a tampered CDN copy will not run.
  const tag = /<script src="([^"]*supabase-js[^"]*)"([^>]*)>/.exec(html);
  assert.ok(tag, 'supabase-js script tag missing');
  assert.match(tag[1], /@supabase\/supabase-js@\d+\.\d+\.\d+\/dist\/umd\/supabase\.js$/);
  assert.match(tag[2], /integrity="sha384-[A-Za-z0-9+/=]{64}"/);
  assert.match(tag[2], /crossorigin="anonymous"/);
});

test('the lead count is a server-side count, not every lead id downloaded', () => {
  assert.match(script, /from\('lithos_leads'\)\.select\('id',\{count:'exact',head:true\}\)/);
  assert.match(script, /l\.count\?\?0/);
});

test('a failed sync request is reported, not left as an unhandled rejection', () => {
  assert.match(script, /try\{r=await fetch\('\/api\/buffer-sync'/);
  assert.match(script, /Sync network error/);
});

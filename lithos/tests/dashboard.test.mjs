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

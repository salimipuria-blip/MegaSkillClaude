// SSRF guard regressions. Run: node --test supabase/functions/github-llm-verifier/net.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dnsAnswersArePublic, ipIsPublic, isSafePublicHttpsUrl } from './net.mjs';

const host = (url) => new URL(url).hostname;

test('IPv4-mapped / compatible / NAT64 IPv6 forms of private addresses are blocked', () => {
  // Before the fix, [::ffff:127.0.0.1] (parsed as [::ffff:7f00:1]) was classified public.
  for (const url of ['https://[::ffff:127.0.0.1]/v1/models', 'https://[::ffff:169.254.169.254]/', 'https://[::ffff:10.0.0.1]/',
    'https://[::127.0.0.1]/', 'https://[64:ff9b::7f00:1]/', 'https://[::ffff:192.168.1.1]/']) {
    assert.equal(ipIsPublic(host(url)), false, url);
    assert.equal(isSafePublicHttpsUrl(url), false, url);
  }
});

test('private, loopback, link-local, multicast and shorthand IPv4 are blocked', () => {
  for (const url of ['https://127.0.0.1/', 'https://2130706433/', 'https://0x7f.1/', 'https://169.254.169.254/',
    'https://10.1.2.3/', 'https://172.16.0.1/', 'https://192.168.0.1/', 'https://100.64.0.1/', 'https://198.18.0.1/',
    'https://0.0.0.0/', 'https://224.0.0.1/', 'https://[::1]/', 'https://[::]/', 'https://[fe80::1]/', 'https://[fec0::1]/',
    'https://[fd00::1]/', 'https://[ff02::1]/', 'https://[2001:db8::1]/', 'https://localhost/', 'https://api.localhost/',
    'https://metadata.google.internal/', 'https://printer.local/']) {
    assert.equal(isSafePublicHttpsUrl(url), false, url);
  }
});

test('public hosts pass; non-https, credentials and garbage fail', () => {
  for (const url of ['https://api.example.org/v1/models', 'https://8.8.8.8/', 'https://[2606:4700:4700::1111]/', 'https://[::ffff:8.8.8.8]/']) {
    assert.equal(isSafePublicHttpsUrl(url), true, url);
  }
  for (const url of ['http://api.example.org/', 'https://user:pw@api.example.org/', 'not a url', '']) {
    assert.equal(isSafePublicHttpsUrl(url), false, url);
  }
});

test('DNS answers (bare addresses, no brackets) are classified the same way', () => {
  assert.equal(ipIsPublic('::ffff:7f00:1'), false);
  assert.equal(ipIsPublic('10.0.0.5'), false);
  assert.equal(ipIsPublic('93.184.216.34'), true);
  assert.equal(ipIsPublic('2606:2800:220:1:248:1893:25c8:1946'), true);
  assert.equal(ipIsPublic('1:2:3'), false); // malformed IPv6 fails closed
});

// Backlog task 94 — DNS-rebinding guard. The decision rule lives in net.mjs so it can be tested
// without a resolver; these tests pin that a mixed answer set fails closed, and the static checks
// below pin that index.ts still resolves and validates before every outbound request.
test('a resolved answer set is refused unless every address is public', () => {
  assert.equal(dnsAnswersArePublic(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']), true);
  // rebinding: the same name answered public once and private once must not be trusted
  assert.equal(dnsAnswersArePublic(['93.184.216.34', '10.0.0.5']), false);
  assert.equal(dnsAnswersArePublic(['169.254.169.254']), false); // cloud metadata
  assert.equal(dnsAnswersArePublic(['127.0.0.1']), false);
  assert.equal(dnsAnswersArePublic(['fc00::1']), false);
  assert.equal(dnsAnswersArePublic(['::ffff:7f00:1']), false); // IPv4-mapped loopback
  assert.equal(dnsAnswersArePublic(['64:ff9b::7f00:1']), false); // NAT64 loopback
});

test('an unresolved or malformed answer set fails closed', () => {
  for (const answers of [[], null, undefined, '93.184.216.34', [''], [null], [{}], ['93.184.216.34', '']]) {
    assert.equal(dnsAnswersArePublic(answers), false, JSON.stringify(answers));
  }
});

test('the verifier resolves and validates before every outbound request', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

  assert.match(source, /import \{[^}]*\bdnsAnswersArePublic\b[^}]*\} from "\.\/net\.mjs";/,
    'index.ts must take the DNS decision from the tested net.mjs rule');
  assert.match(source, /return dnsAnswersArePublic\(answers\);/,
    'resolveHostPublic must return the tested rule, not an inline copy of it');

  const guarded = source.slice(source.indexOf('async function safeGetJson'));
  const body = guarded.slice(0, guarded.indexOf('\nasync function', 10) > 0
    ? guarded.indexOf('\nasync function', 10)
    : guarded.length);
  assert.ok(body.includes('isSafePublicHttpsUrl(current)') && body.includes('resolveHostPublic(u.hostname)'),
    'safeGetJson must validate the URL and resolve the host');
  assert.ok(body.indexOf('resolveHostPublic') < body.indexOf('fetch('),
    'the DNS guard must run before the request, not after it');
  assert.ok(body.includes('redirect:"manual"'), 'redirects must be re-validated hop by hop');
  assert.match(body, /for\(let i=0;i<\d+;i\+\+\)/, 'the redirect hop count must stay capped');
  assert.ok(!source.includes('method:"POST"'),
    'this mesh issues GETs only; a POST must go through the same guard and be added to this test');

  // Two call sites exist today: fetchText (fixed hosts api.github.com and dns.google) and the
  // guarded request in safeGetJson. A third one is new attack surface and must be reviewed here.
  assert.equal(source.match(/fetch\(/g).length, 2, 'a new outbound call site appeared in index.ts');
});

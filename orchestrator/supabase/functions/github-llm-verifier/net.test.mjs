// SSRF guard regressions. Run: node --test supabase/functions/github-llm-verifier/net.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ipIsPublic, isSafePublicHttpsUrl } from './net.mjs';

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

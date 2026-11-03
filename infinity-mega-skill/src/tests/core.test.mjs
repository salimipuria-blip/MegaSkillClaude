// CI entry point: every core self-test becomes a node:test case, so the browser panel and CI can
// never drift apart. Run: node --test src/tests/*.test.mjs
import test from 'node:test';
import { CASES } from '../core/selftest.js';

for (const c of CASES) {
  test(`${c.group} · ${c.name}`, async () => {
    await c.fn();
  });
}

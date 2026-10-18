// Shape and weight guard for the generated PWA index.
// skills-index.json is produced by mobile/build-index.py from the canonical router; never edit it by
// hand. These tests run against the committed artefact so a bad regeneration fails CI, not the phone.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, statSync} from 'node:fs';
import {isSafeSkillPath, isSkillsPayload} from './search.mjs';

const INDEX = new URL('./skills-index.json', import.meta.url);
const raw = readFileSync(INDEX, 'utf8');
const payload = JSON.parse(raw);

// Keep in sync with SIZE_BUDGET_BYTES in build-index.py.
const BUDGET_BYTES = 3 * 1024 * 1024;

test('the committed index is a valid payload', () => {
  assert.equal(isSkillsPayload(payload), true);
  assert.equal(payload.schema, 'mega-skills-mobile/v1');
  assert.equal(payload.counts.routable_skills, payload.skills.length);
  assert.ok(payload.skills.length > 5000, `expected the full routable set, got ${payload.skills.length}`);
});

test('every entry is complete, unique and points inside the repository', () => {
  const names = new Set();
  for (const skill of payload.skills) {
    assert.ok(skill.n && typeof skill.n === 'string', 'a name is required');
    assert.ok(skill.d && typeof skill.d === 'string', 'a domain is required');
    assert.ok(Array.isArray(skill.t), `${skill.n} needs a trigger array`);
    assert.ok(!names.has(skill.n), `duplicate skill name: ${skill.n}`);
    names.add(skill.n);
    if (skill.p) assert.equal(isSafeSkillPath(skill.p), true, `unsafe path on ${skill.n}: ${skill.p}`);
  }
});

test('the index stays inside the offline weight budget', () => {
  const bytes = statSync(INDEX).size;
  assert.ok(bytes <= BUDGET_BYTES, `${bytes} bytes is over the ${BUDGET_BYTES}-byte budget: split by domain`);
  // payload-level sanity: the projection stays minimal (5 triggers, short keys)
  const biggest = payload.skills.reduce((max, s) => Math.max(max, s.t.length), 0);
  assert.ok(biggest <= 5, `triggers per skill must stay capped at 5, found ${biggest}`);
});

test('search-relevant material is present and Persian-safe', () => {
  const sample = payload.skills.slice(0, 400);
  assert.ok(sample.some((s) => /[؀-ۿ]/.test(s.t.join(' '))), 'Persian triggers must survive the build');
  assert.ok(payload.skills.every((s) => !/<|>|javascript:/i.test(s.n)), 'no markup in skill names');
});

test('the page quotes the plugin total from the canonical router counts', () => {
  const router = JSON.parse(readFileSync(new URL('../.claude/skills/mega-skills-router/references/triggers.json', import.meta.url), 'utf8'));
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const fa = (n) => n.toLocaleString('en-US').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/,/g, '٬');
  assert.ok(html.includes(`${fa(router.counts.skills)} مهارت در دسترس`), `index.html must say ${fa(router.counts.skills)} plugin skills`);
});

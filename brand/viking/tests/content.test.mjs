// Content contract for the Viking post/story templates.
//
// The renderer (render.mjs) needs a browser; these checks do not. They guard the two rules the
// project set itself: the campaign's numbers live in brief.json (never silently in the artwork),
// and every asset is local so a render works offline and reproduces byte-for-byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const post = read('post.html');
const story = read('story.html');
const brief = JSON.parse(read('brief.json'));
const renderer = read('render.mjs');

const claimsFor = (kind) => brief.claims.filter((c) => (c.in || ['post', 'story']).includes(kind));

test('brief.json is well formed and tracks every claim with a source slot', () => {
  assert.equal(brief.schema, 1);
  assert.ok(Array.isArray(brief.claims) && brief.claims.length > 0);
  const keys = new Set();
  for (const claim of brief.claims) {
    assert.ok(claim.key && !keys.has(claim.key), `duplicate or missing key: ${claim.key}`);
    keys.add(claim.key);
    assert.equal(typeof claim.value, 'string', `${claim.key} needs a value`);
    assert.ok('source' in claim, `${claim.key} needs a source field (empty until verified)`);
    assert.ok(Array.isArray(claim.in) && claim.in.length, `${claim.key} needs its template scope`);
  }
});

test('every claim in the brief really appears in the template it belongs to', () => {
  for (const [kind, html] of [['post', post], ['story', story]]) {
    for (const claim of claimsFor(kind)) {
      assert.ok(html.includes(claim.value), `${kind}.html is missing the claim ${claim.key}: ${claim.value}`);
    }
  }
});

test('no claim is published without a recorded source', () => {
  // verified=false is the shipped default on purpose: the numbers came from a human, and the
  // renderer refuses to render until each one carries a source. A test keeps that from rotting.
  assert.equal(brief.verified, false, 'set verified=true only after filling every source');
  assert.ok(brief.claims.every((c) => !c.source), 'sources must be filled together with verified=true');
});

test('the renderer fails closed on an unverified brief and offers a draft flag', () => {
  assert.match(renderer, /assertBrief\(/);
  assert.match(renderer, /--allow-unverified-claims/);
  assert.match(renderer, /brief\.verified !== true/);
});

test('every asset reference is local and exists on disk', () => {
  for (const [name, html] of [['post.html', post], ['story.html', story]]) {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"|url\(([^)]+)\)/g)]
      .map((m) => m[1] || m[2])
      .filter((u) => u && !u.startsWith('#') && !u.startsWith('data:'));
    const external = refs.filter((u) => /^https?:|^file:|^\/\//.test(u));
    assert.deepEqual(external, [], `${name} must not load assets over the network`);
    const missing = refs.filter((u) => !existsSync(new URL(u, root)));
    assert.deepEqual(missing, [], `${name} references missing files`);
  }
});

test('both templates are Persian RTL documents with the documented palettes', () => {
  for (const [name, html] of [['post.html', post], ['story.html', story]]) {
    assert.match(html, /<html[^>]+dir="rtl"/, name);
    assert.match(html, /lang="fa"/, name);
  }
  // the content palette is separate from the sticker palette by design
  for (const colour of ['#f39a2b', '#141414', '#ffd9a8', '#ff4d3d']) {
    assert.ok(`${post}${story}`.toLowerCase().includes(colour), `missing brand colour ${colour}`);
  }
});

test('the post renders exactly three slides and the story exactly one target', () => {
  assert.equal([...post.matchAll(/<section class="sl" id="p\d+">/g)].length, 3);
  assert.equal([...story.matchAll(/id="st"/g)].length, 1);
  assert.match(renderer, /must contain exactly 3 slides/);
  assert.match(renderer, /#st/);
});

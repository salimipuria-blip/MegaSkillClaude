// Spec lock for the motion study.
//
// A real render needs Chromium (npm run render -- --browser-executable=...), so it is not part of
// the fast gate. These checks run everywhere and pin the contract that a render would otherwise be
// the only proof of: composition id, 1080x1920 @ 30fps for 180 frames, the study palette, and the
// "no CSS animation" rule that keeps every frame deterministic.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const root = new URL('..', import.meta.url);
const root_tsx = readFileSync(new URL('src/Root.tsx', root), 'utf8');
const index_ts = readFileSync(new URL('src/index.ts', root), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

const COMPOSITION = /<Composition\b[^>]*>/s.exec(root_tsx);
// Remotion props are JSX expressions (`fps={30}`); the id is a plain string (`id="..."`).
const attr = (name) =>
  new RegExp(`\\b${name}=\\{([^}]+)\\}`).exec(COMPOSITION[0])?.[1]?.trim() ??
  new RegExp(`\\b${name}="([^"]+)"`).exec(COMPOSITION[0])?.[1];

test('the composition is registered with the documented id', () => {
  assert.ok(COMPOSITION, 'src/Root.tsx must declare a <Composition>');
  assert.equal(attr('id').replace(/["'`]/g, ''), 'VikingCommandIntro');
  assert.match(index_ts, /registerRoot\(RemotionRoot\)/);
  assert.match(root_tsx, /export const RemotionRoot/);
});

test('output geometry and duration match the deliverable (1080x1920, 30fps, 180 frames)', () => {
  assert.equal(attr('width'), '1080');
  assert.equal(attr('height'), '1920');
  assert.equal(attr('fps'), '30');
  assert.equal(attr('durationInFrames'), '180'); // 6.0 s
});

test('the study palette is locked and not swapped for another brand palette', () => {
  assert.match(root_tsx, /#FF713C/i, 'the motion study orange belongs to this composition');
  for (const foreign of ['#F39A2B', '#F28A1E']) {
    assert.doesNotMatch(root_tsx, new RegExp(foreign, 'i'), `${foreign} belongs to another Viking asset`);
  }
});

test('every visual state is derived from the frame, not from CSS animation', () => {
  // Remotion renders static frames; a CSS transition/animation would make the output depend on the
  // browser's clock instead of on the frame number.
  assert.doesNotMatch(root_tsx, /transition:|@keyframes|animation:/);
  assert.match(root_tsx, /useCurrentFrame\(\)/);
  assert.match(root_tsx, /interpolate\(/);
});

test('Persian copy is rendered in a right-to-left block', () => {
  assert.match(root_tsx, /dir="rtl"/);
  assert.match(root_tsx, /[؀-ۿ]/);
});

test('the toolchain stays pinned so a render is reproducible', () => {
  assert.equal(pkg.dependencies.remotion, pkg.dependencies['@remotion/cli'], 'cli and runtime must match');
  assert.match(pkg.dependencies.remotion, /^\d+\.\d+\.\d+$/, 'pin Remotion exactly');
  assert.equal(pkg.scripts.render, 'remotion render src/index.ts VikingCommandIntro out/viking-intro.mp4');
  assert.equal(pkg.scripts.check, 'tsc --noEmit');
});

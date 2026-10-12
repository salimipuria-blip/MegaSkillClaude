// Execute the actual browser media routines with a mocked DOM/private Storage, not copied logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../team/app.js', import.meta.url), 'utf8');
const boundary = source.indexOf("$('loginForm').addEventListener");
assert.ok(boundary > 0, 'DOM event wiring boundary must exist');

function fixture(downloadError = null) {
  const urls = [], revoked = [], images = [], anchors = [], storageCalls = [], timeouts = [];
  const placeholder = { textContent: '', replaceWith(image) { images.push(image); } };
  const card = { isConnected: true, querySelector() { return placeholder; } };
  const gallery = { innerHTML: '', querySelector() { return card; } };
  const elements = new Map([['galleryList', gallery], ['galleryTrip', { value: '' }], ['notice', { textContent: '', className: '' }]]);
  const browserURL = {
    createObjectURL(blob) { assert.ok(blob instanceof Blob); const url = `blob:fixture-${urls.length}`; urls.push(url); return url; },
    revokeObjectURL(url) { revoked.push(url); },
  };
  const context = vm.createContext({
    Blob, URL: browserURL, setTimeout(fn, ms) { timeouts.push({ fn, ms }); }, clearTimeout() {},
    document: {
      getElementById(id) { return elements.get(id); },
      createElement(tag) {
        if (tag === 'img') return {};
        if (tag === 'a') { const anchor = { click() { this.clicked = true; } }; anchors.push(anchor); return anchor; }
        throw new Error(`Unexpected element ${tag}`);
      },
    },
    privateStorage: { from(bucket) {
      assert.equal(bucket, 'viking-private');
      return { async download(path) { storageCalls.push(path); return { data: new Blob(['image'], { type: 'image/png' }), error: downloadError }; } };
    } },
  });
  vm.runInContext(source.slice(0, boundary), context);
  vm.runInContext("api = { storage: privateStorage }; session = { user: {} }; selectedView = 'gallery'; photos = [{ id: 'fixture-photo', trip_id: 'fixture-trip', storage_path: 'trips/fixture/image.png', display_name: 'عکس.png', size_bytes: 10 }];", context);
  return { context, urls, revoked, images, anchors, storageCalls, timeouts, placeholder, card, gallery };
}

test('gallery uses the browser URL API after a private image download', async () => {
  const f = fixture();
  await vm.runInContext('renderPhotos()', f.context);
  assert.deepEqual(f.storageCalls, ['trips/fixture/image.png']);
  assert.equal(f.images.length, 1);
  assert.equal(f.images[0].src, f.urls[0]);
  assert.equal(f.images[0].alt, 'عکس.png');
  vm.runInContext('releaseUrls()', f.context);
  assert.deepEqual(f.revoked, f.urls);
});

test('photo download creates/clicks an anchor and revokes its object URL', async () => {
  const f = fixture();
  await vm.runInContext("downloadPhoto('fixture-photo')", f.context);
  assert.equal(f.anchors.length, 1);
  assert.equal(f.anchors[0].clicked, true);
  assert.equal(f.anchors[0].href, f.urls[0]);
  assert.equal(f.anchors[0].download, 'عکس.png');
  assert.equal(f.timeouts[0].ms, 5000);
  f.timeouts[0].fn();
  assert.deepEqual(f.revoked, f.urls);
});

test('storage failures show a placeholder and do not create/download blob URLs', async () => {
  const f = fixture({ message: 'fixture access denied' });
  await vm.runInContext('renderPhotos()', f.context);
  assert.match(f.placeholder.textContent, /ممکن نشد/);
  await vm.runInContext("downloadPhoto('fixture-photo')", f.context);
  assert.equal(f.urls.length, 0);
  assert.equal(f.anchors.length, 0);
});

test('detached gallery cards release the downloaded blob immediately', async () => {
  const f = fixture();
  f.card.isConnected = false;
  await vm.runInContext('renderPhotos()', f.context);
  assert.equal(f.images.length, 0);
  assert.deepEqual(f.revoked, f.urls);
});

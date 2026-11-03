// Regression tests for team/app.js logic (iPhone upload types, trip deletion guard, date rendering),
// executed from the real source with a mocked DOM and Supabase client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../team/app.js', import.meta.url), 'utf8');
const boundary = source.indexOf("$('loginForm').addEventListener");
assert.ok(boundary > 0, 'DOM event wiring boundary must exist');

function load() {
  const calls = [], notice = { textContent: '', className: '' };
  const context = vm.createContext({
    Blob, URL, crypto: { randomUUID: () => 'media-1' }, setTimeout() {}, clearTimeout() {}, confirm: () => true,
    document: { getElementById: (id) => (id === 'notice' ? notice : undefined) },
    fakeApi: {
      storage: { from: (bucket) => ({
        async upload(path, file, opts) { calls.push(['upload', bucket, path, opts.contentType]); return { error: null }; },
        async remove(paths) { calls.push(['remove', paths]); return { error: null }; },
      }) },
      from: (table) => ({
        async insert(row) { calls.push(['insert', table, row]); return { error: null }; },
        delete() { calls.push(['delete', table]); return { eq: async () => ({ error: null }) }; },
      }),
    },
  });
  vm.runInContext(source.slice(0, boundary), context);
  vm.runInContext('api = fakeApi; session = { user: { email: "a@b.c" } };', context);
  return { context, calls, notice };
}

test('mediaKind accepts iPhone HEIC/HEIF with empty or alias MIME types and rejects others', () => {
  const { context } = load();
  const kind = (file) => vm.runInContext(`mediaKind(${JSON.stringify(file)})`, context);
  assert.equal(kind({ type: 'image/heic', name: 'a.heic' }), 'image/heic');
  assert.equal(kind({ type: '', name: 'IMG_0001.HEIC' }), 'image/heic');
  assert.equal(kind({ type: 'image/heif', name: 'x' }), 'image/heic');
  assert.equal(kind({ type: 'application/octet-stream', name: 'p.JPEG' }), 'image/jpeg');
  assert.equal(kind({ type: 'image/jpg', name: 'x' }), 'image/jpeg');
  assert.equal(kind({ type: 'image/gif', name: 'x.jpg' }), null);
  assert.equal(kind({ type: '', name: 'clip.mov' }), null);
  assert.equal(kind({ type: 'image/svg+xml', name: 'x.svg' }), null);
});

test('an iPhone HEIC with an empty MIME type uploads as image/heic with a .heic path', async () => {
  const { context, calls } = load();
  context.file = { type: '', name: 'IMG_0001.HEIC', size: 2048 };
  await vm.runInContext("uploadFile(file, 'trip-1')", context);
  assert.deepEqual(calls[0], ['upload', 'viking-private', 'trips/trip-1/media-1.heic', 'image/heic']);
  assert.equal(calls[1][2].mime_type, 'image/heic');
});

test('uploads over 8 MB or of unsupported types are refused before reaching storage', async () => {
  const { context, calls } = load();
  context.big = { type: 'image/jpeg', name: 'a.jpg', size: 8388609 };
  context.gif = { type: 'image/gif', name: 'a.gif', size: 10 };
  await assert.rejects(vm.runInContext("uploadFile(big, 't')", context), /۸ مگابایت/);
  await assert.rejects(vm.runInContext("uploadFile(gif, 't')", context), /فرمت/);
  assert.equal(calls.length, 0);
});

test('deleting a trip that still has linked tasks shows a Persian guard instead of a raw FK error', async () => {
  const { context, calls, notice } = load();
  vm.runInContext(`records = [{ id: 't1', kind: 'trip', title: 'سفر' }, { id: 'k1', kind: 'task', title: 'کار', trip_id: 't1' }]; photos = [];`, context);
  await vm.runInContext("deleteRecord('t1')", context);
  assert.match(notice.textContent, /وصل است/);
  assert.equal(calls.length, 0);
});

test('invalid dates are returned raw so the caller escapes them exactly once', () => {
  const { context } = load();
  assert.equal(vm.runInContext("shortDate('bad&<x>')", context), 'bad&<x>');
  assert.equal(vm.runInContext("esc(shortDate('a&b'))", context), 'a&amp;b');
});

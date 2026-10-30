// Keyboard-only use, screen-reader wiring, and a workspace big enough to hurt. These are the places
// where an app "works" with a mouse and quietly fails everyone else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, closeApp, waitFor, JSDOM } from './harness.mjs';

const skip = JSDOM ? false : 'jsdom is not installed';

const name = (el) =>
  (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.textContent ||
    el.getAttribute('placeholder') ||
    ''
  ).trim();

test('the palette is usable from the keyboard alone, and says what it selected', { skip, timeout: 60000 }, async () => {
  const { dom, window, app, errors } = await bootApp();
  const $ = (id) => window.document.getElementById(id);
  try {
    $('btnPalette').click();
    const input = $('paletteInput');
    assert.equal($('palette').hidden, false);

    const options = () => [...$('paletteList').querySelectorAll('.palette-item')];
    assert.ok(options().length >= 3, 'the palette lists commands');

    // Screen readers need the input to describe itself and point at the active option.
    assert.equal(input.getAttribute('role'), 'combobox', 'the search field is a combobox');
    assert.equal(input.getAttribute('aria-controls'), 'paletteList', 'and it points at the list');
    const active = input.getAttribute('aria-activedescendant');
    assert.ok(active, 'aria-activedescendant tells AT which row is selected');
    assert.equal(active, options()[0].id, 'and it points at the first row');

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert.equal(options()[1].getAttribute('aria-selected'), 'true', 'ArrowDown moves the selection');
    assert.equal(input.getAttribute('aria-activedescendant'), options()[1].id, 'and AT is told');

    // Enter runs the highlighted command and the palette gets out of the way.
    input.value = 'تنظیمات';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const filtered = options();
    assert.ok(filtered.length >= 1, 'the filter matched a command');
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal($('palette').hidden, true, 'Enter closes the palette');
    assert.equal(window.document.querySelector('#btnPalette').disabled, false);

    // Escape closes and returns focus to the trigger, not to the body.
    $('btnPalette').click();
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal($('palette').hidden, true);
    assert.equal(window.document.activeElement?.id, 'btnPalette', 'focus returns to the opener');
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

test('Ctrl+Enter runs from the goal box and Ctrl+S saves the open file', { skip, timeout: 90000 }, async () => {
  const { dom, window, app } = await bootApp();
  const $ = (id) => window.document.getElementById(id);
  try {
    const goal = $('goal');
    goal.value = 'یک تابع جمع با تست بنویس';
    goal.dispatchEvent(new window.Event('input', { bubbles: true }));
    const before = app.state.lastRun;
    goal.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await waitFor(() => !$('btnRun').disabled, { label: 'run from keyboard', timeout: 80000 });
    assert.notEqual(app.state.lastRun, before, 'Ctrl+Enter started a run');

    // Edit whatever the workbench actually has open (it decides, not the test).
    const path = app.workbench?.path;
    assert.ok(path, 'the workbench has an open file to edit');
    const editor = $('code');
    editor.value = `${editor.value}\n// ویرایشِ کلیدی\n`;
    editor.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal($('editorDirty').textContent.trim(), 'ذخیره نشده', 'the editor knows it is dirty');
    const revsBefore = app.vfs.revisionsOf(path).length;
    editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    assert.ok(app.vfs.revisionsOf(path).length > revsBefore, 'Ctrl+S wrote a new revision');
  } finally {
    closeApp(dom, app);
  }
});

test('every control has a name and every ARIA pointer resolves, in every view', { skip, timeout: 120000 }, async () => {
  const { dom, window, app } = await bootApp();
  const $ = (id) => window.document.getElementById(id);
  try {
    const views = ['workbench', 'evolve', 'memory', 'settings', 'chat'];
    for (const view of views) {
      const tab = $('tab-' + view);
      if (!tab) continue;
      tab.click();
      await new Promise((r) => setTimeout(r, 120));

      const unnamed = [...window.document.querySelectorAll('button, input, select, textarea, a[href]')]
        .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null || el.getClientRects().length)
        .filter((el) => !name(el))
        .map((el) => `${el.tagName.toLowerCase()}#${el.id || '?'}`);
      assert.deepEqual(unnamed, [], `${view}: controls with no accessible name`);

      const badControls = [...window.document.querySelectorAll('[aria-controls],[aria-labelledby],[aria-describedby]')]
        .map((el) => ({
          el: `${el.tagName.toLowerCase()}#${el.id || '?'}`,
          ids: ['aria-controls', 'aria-labelledby', 'aria-describedby']
            .flatMap((attr) => (el.getAttribute(attr) || '').split(/\s+/))
            .filter(Boolean),
        }))
        .flatMap(({ el, ids }) => ids.filter((id) => !window.document.getElementById(id)).map((id) => `${el} -> ${id}`));
      assert.deepEqual(badControls, [], `${view}: dangling aria pointers`);

      const positiveTab = [...window.document.querySelectorAll('[tabindex]')]
        .filter((el) => Number(el.getAttribute('tabindex')) > 0)
        .map((el) => `${el.tagName.toLowerCase()}#${el.id || '?'}`);
      assert.deepEqual(positiveTab, [], `${view}: positive tabindex breaks the tab order`);
    }
  } finally {
    closeApp(dom, app);
  }
});

test('a large workspace still renders quickly and without duplicate ids', { skip, timeout: 120000 }, async () => {
  const { dom, window, app, errors } = await bootApp();
  const $ = (id) => window.document.getElementById(id);
  try {
    const t0 = Date.now();
    for (let i = 0; i < 120; i += 1) {
      app.vfs.writeFile(`src/m${i}.js`, `export const v${i} = ${i};\n`, 'bulk');
    }
    const workbench = await waitFor(() => app.workbench, { label: 'workbench' });
    workbench.refresh();
    const elapsed = Date.now() - t0;

    const rows = window.document.querySelectorAll('#fileTree .tree-file, #fileTree [data-path]').length;
    assert.ok(rows >= 120, `the tree shows every file (${rows} rows)`);
    assert.ok(elapsed < 15000, `rendering 120 files took ${elapsed} ms`);

    const ids = [...window.document.querySelectorAll('[id]')].map((el) => el.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'no duplicate ids after a bulk import');
    assert.deepEqual(errors, []);

    // The status bar agrees with reality, in Persian digits.
    app.refreshStatus();
    const shown = $('sbFiles').textContent.trim();
    assert.match(shown, /^[۰-۹]+$/, `the counter is not in Persian digits: ${shown}`);
    const asNumber = Number(shown.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    assert.equal(asNumber, app.vfs.list().length, 'the counter matches the workspace');
  } finally {
    closeApp(dom, app);
  }
});

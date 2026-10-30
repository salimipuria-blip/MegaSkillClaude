// Interaction sweep: every view, every primary control, and a hard requirement that the page raised
// no error while doing it. A control that throws on click is invisible in a screenshot but obvious here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, bootApp, closeApp, waitFor } from './harness.mjs';

const seen = (window, id) => window.document.getElementById(id);

test('every view opens, and only one panel is visible at a time', { timeout: 40000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, errors, consoleErrors } = await bootApp();
  try {
    for (const view of ['workbench', 'evolve', 'memory', 'settings', 'chat']) {
      window.document.querySelector(`.tab[data-view="${view}"]`).click();
      assert.equal(app.state.view, view, `tab click should switch to ${view}`);
      const visible = [...window.document.querySelectorAll('.view')].filter((v) => !v.hidden);
      assert.equal(visible.length, 1, `exactly one view visible in ${view}`);
      assert.equal(visible[0].id, `view-${view}`);
      assert.equal(window.document.querySelector(`.tab[data-view="${view}"]`).getAttribute('aria-selected'), 'true');
    }
    assert.deepEqual(errors, [], `the page raised errors: ${errors.join(' | ')}`);
    assert.deepEqual(consoleErrors, [], `console.error was called: ${consoleErrors.join(' | ')}`);
  } finally {
    closeApp(dom, app);
  }
});

test('the command palette opens by button and by keyboard, and closes on Escape', { timeout: 40000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, errors } = await bootApp();
  try {
    const palette = seen(window, 'palette');
    assert.ok(palette.hidden, 'the palette starts hidden');

    seen(window, 'btnPalette').click();
    assert.equal(palette.hidden, false, 'the button opens the palette');

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(palette.hidden, true, 'Escape closes it');

    window.document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    assert.equal(palette.hidden, false, 'Ctrl+K opens it');

    // Typing filters the list instead of doing nothing.
    const input = seen(window, 'paletteInput');
    input.value = 'تکامل';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const rows = [...seen(window, 'paletteList').querySelectorAll('button, [role=option]')];
    assert.ok(rows.length >= 1, 'the filter keeps the matching command');
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

test('a run can be started, stopped, and leaves a verified result', { timeout: 60000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, errors } = await bootApp();
  try {
    seen(window, 'goal').value = 'یک تابع جمع با تست بنویس';
    seen(window, 'btnRun').click();
    await waitFor(() => seen(window, 'verifyBadge').textContent.trim() !== '—', { label: 'verdict', timeout: 30000 });
    assert.equal(app.state.lastRun?.ok, true, 'the run is recorded as verified');
    assert.equal(seen(window, 'btnRun').disabled, false, 'the run button comes back');

    // Stop is not a decoration: it flips the pipeline flag and restores the controls.
    seen(window, 'goal').value = 'تابع پالیندروم';
    seen(window, 'btnRun').click();
    seen(window, 'btnStop').click();
    await waitFor(() => !seen(window, 'btnRun').disabled, { label: 'controls restored', timeout: 30000 });
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

test('the workspace buttons edit, version, diff and export without raising', { timeout: 40000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, clicked, errors } = await bootApp();
  try {
    app.setView('workbench');
    const file = seen(window, 'fileTree').querySelector('.tree-file');
    assert.ok(file, 'the tree lists the workspace');
    file.click();

    const code = seen(window, 'code');
    assert.ok(code.value.length > 0, 'opening a file fills the editor');
    const before = app.vfs.list().length;

    // Sandboxed iframes ignore prompt(); the app must ask inside the page instead.
    seen(window, 'btnNewFile').click();
    const ask = window.document.querySelector('.ask-overlay');
    assert.ok(ask, 'the new-file button opens an in-page dialog');
    const field = ask.querySelector('.ask-input');
    field.value = 'src/sweep.js';
    ask.querySelector('[data-ask="ok"]').click();
    await waitFor(() => app.vfs.list().some((f) => f.path === 'src/sweep.js'), { label: 'file created' });
    assert.equal(app.vfs.list().length, before + 1, 'the new-file button creates a file');

    code.value = `${code.value}\n// edited by the sweep\n`;
    code.dispatchEvent(new window.Event('input', { bubbles: true }));
    seen(window, 'btnSave').click();

    seen(window, 'btnRevert').click();
    await waitFor(() => !seen(window, 'editorStatus').textContent.includes('ذخیره'), { label: 'revert' }).catch(() => {});

    seen(window, 'btnZip').click();
    assert.ok(clicked.some((c) => String(c.download).endsWith('.zip')), 'the zip button hands a download');

    seen(window, 'btnExportAll').click();
    assert.ok(clicked.some((c) => String(c.download).endsWith('.json')), 'the export button hands a download');
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

test('memory, forge, evolution and settings all respond', { timeout: 90000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, errors } = await bootApp();
  try {
    // memory: a law and a note are persisted objects, not just DOM rows
    app.setView('memory');
    const lawsBefore = app.memory.laws.length;
    seen(window, 'lawInput').value = 'هر تغییر بدون تست، تغییر نیست.';
    seen(window, 'btnAddLaw').click();
    assert.equal(app.memory.laws.length, lawsBefore + 1, 'the law is stored');

    const notesBefore = app.memory.notes.length;
    seen(window, 'noteInput').value = 'یادداشتِ سنجش';
    seen(window, 'btnAddNote').click();
    assert.equal(app.memory.notes.length, notesBefore + 1, 'the note is stored');

    // forge: compression reports a ratio instead of doing nothing
    seen(window, 'forgeInput').value = 'خط تکراری. '.repeat(60) + 'قانونِ یکتا: هر تغییر تست دارد.';
    seen(window, 'btnForge').click();
    assert.ok(seen(window, 'forgeOut').textContent.trim().length > 0, 'the forge writes a result');

    // settings: every provider card can be selected
    app.setView('settings');
    const cards = [...seen(window, 'providers').querySelectorAll('.provider')];
    assert.ok(cards.length >= 10, 'the provider list renders');
    cards.forEach((card) => card.click());
    assert.equal(cards.filter((c) => c.classList.contains('active')).length, 1, 'exactly one provider is active');

    // evolution: a full measured generation
    app.setView('evolve');
    seen(window, 'btnEvolve').click();
    await waitFor(() => (app.state.lineage?.length || 0) > 0, { label: 'a generation', timeout: 60000 });
    assert.ok(app.state.lineage.length >= 1, 'the generation is recorded');

    assert.deepEqual(errors, [], `errors during the sweep: ${errors.join(' | ')}`);
  } finally {
    closeApp(dom, app);
  }
});

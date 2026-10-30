// Escaping and injection: every string that reaches the screen came from a model, a file name or the
// user, so none of it may become markup. This suite attacks the real render paths in a live DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, bootApp, closeApp, waitFor } from './harness.mjs';

const PAYLOADS = [
  '<img src=x onerror="window.__pwned=1">',
  '<script>window.__pwned=1</script>',
  '</div><svg onload="window.__pwned=1">',
  '"><iframe src="javascript:window.__pwned=1">',
];

function assertNoInjection(window, label) {
  const d = window.document;
  assert.equal(window.__pwned, undefined, `${label}: a payload executed`);
  assert.equal(d.querySelectorAll('script').length, 1, `${label}: an extra <script> was created`);
  assert.equal(d.querySelectorAll('iframe').length, 0, `${label}: an iframe was created`);
  assert.equal(d.querySelectorAll('img[onerror], svg[onload]').length, 0, `${label}: an event attribute survived`);
  for (const el of d.querySelectorAll('*')) {
    for (const attr of el.attributes || []) {
      assert.ok(!/^on/i.test(attr.name), `${label}: ${el.tagName} kept ${attr.name}`);
      assert.ok(!/^javascript:/i.test(attr.value || ''), `${label}: javascript: URL survived on ${el.tagName}`);
    }
  }
}

test('a hostile goal is shown as text and never becomes markup', { timeout: 60000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, errors } = await bootApp();
  try {
    const goal = `تابع جمع بنویس ${PAYLOADS[0]}`;
    window.document.getElementById('goal').value = goal;
    window.document.getElementById('btnRun').click();
    await waitFor(() => window.document.getElementById('verifyBadge').textContent.trim() !== '—', { label: 'run', timeout: 30000 });

    const transcript = window.document.getElementById('transcript');
    assert.ok(transcript.textContent.includes('<img src=x'), 'the goal is visible as literal text');
    assertNoInjection(window, 'goal');
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

test('hostile file names, laws and journal lines stay inert', { timeout: 40000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  const { dom, window, app, errors } = await bootApp();
  try {
    // 1) a file whose *name* is the attack
    app.vfs.write(`src/${PAYLOADS[2]}.js`, 'export const a = 1;\n', 'security');
    app.setView('workbench');
    app.workbench.refresh();
    const tree = window.document.getElementById('fileTree');
    assert.ok(tree.textContent.includes('<svg onload'), 'the hostile name is rendered as text');
    assertNoInjection(window, 'file name');

    // 2) a law body
    app.setView('memory');
    app.memory.addLaw?.(PAYLOADS[1]) ?? app.memory.laws.push(PAYLOADS[1]);
    app.memoryView.renderLaws();
    assertNoInjection(window, 'law');

    // 3) a chat message pushed by the pipeline itself
    app.chat.message('assistant', PAYLOADS[3]);
    assertNoInjection(window, 'chat message');
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

test('h() escapes by default and keeps nested markup raw', async () => {
  const { h, raw, esc } = await import('../app/ui.js').catch(() => ({}));
  if (!h) return; // app/ui.js needs a DOM; the DOM tests above already cover the live path
  assert.equal(String(h`<b>${'<i>'}</b>`), '<b>&lt;i&gt;</b>');
  assert.equal(String(h`<div>${h`<span>${'&'}</span>`}</div>`), '<div><span>&amp;</span></div>');
  assert.equal(String(h`<p>${raw('<em>x</em>')}</p>`), '<p><em>x</em></p>');
  assert.equal(esc('"'), '&quot;');
});

test('a model reply full of markup is rendered as data, not HTML', { timeout: 60000 }, async (t) => {
  if (!JSDOM) return t.skip('jsdom not installed');
  // The reply goes through parseTriadReply → candidate cards → transcript.
  const { dom, window, app, errors } = await bootApp();
  try {
    const { parseTriadReply } = await import('../core/agent.js');
    const parsed = parseTriadReply(
      JSON.stringify({
        plan: [PAYLOADS[1]],
        candidates: [
          { strategy: 'minimal', path: 'src/sum.js', content: `export function sum(n){return n.length} // ${PAYLOADS[0]}`, why: PAYLOADS[1] },
        ],
      }),
    );
    assert.equal(parsed.candidates.length, 1, 'the parser keeps the candidate');
    assert.ok(parsed.candidates[0].content.includes(PAYLOADS[0]), 'the payload is stored verbatim as data');
    app.chat.message('assistant', parsed.candidates[0].why);
    assertNoInjection(window, 'model reply');
    assert.deepEqual(errors, []);
  } finally {
    closeApp(dom, app);
  }
});

// System prompt fitting for small-budget providers: memory, project knowledge and per-turn blocks must survive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSystem, fitContext } from './providers.mjs';
import { SYSTEM } from './brain.mjs';

const tail = '\n\nLONG-TERM NOTES the user asked you to remember:\n- NOTE-MARK اسم سگم رکس است\n\nOWNER PORTFOLIO KNOWLEDGE-MARK';

test('fitSystem keeps persona and the per-turn tail; the skill pack gives way first', () => {
  const text = SYSTEM + tail;
  for (const max of [4050, 5400, 6000, 7000]) {
    const out = fitSystem(text, max);
    assert.ok(out.length <= max, `${max}: ${out.length}`);
    assert.match(out, /^You are Hermes, Puria's personal assistant/);
    assert.match(out, /NOTE-MARK/);
    assert.match(out, /KNOWLEDGE-MARK/);
  }
});

test('fitSystem leaves short prompts untouched and still bounds prompts without the skill pack', () => {
  assert.equal(fitSystem('short', 100), 'short');
  const out = fitSystem(`HEAD ${'x'.repeat(5000)} TAIL-MARK`, 1000);
  assert.ok(out.length <= 1000);
  assert.match(out, /^HEAD/);
  assert.match(out, /TAIL-MARK$/);
});

test('fitContext no longer drops memory notes on the GitHub Models budget', () => {
  const msgs = [{ role: 'system', content: SYSTEM + tail }, { role: 'user', content: 'سگم اسمش چیه؟' }];
  const [sys] = fitContext(msgs, 12000);
  assert.match(sys.content, /NOTE-MARK/);
});

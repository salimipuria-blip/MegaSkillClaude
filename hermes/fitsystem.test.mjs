// System prompt fitting for small-budget providers: memory, project knowledge and per-turn blocks must survive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
import { fitSystem, fitContext, PROVIDERS, FULL_BUDGET, SMALL_BUDGET } from './providers.mjs';
import { SYSTEM } from './brain.mjs';
import { projectKnowledge } from './knowledge.mjs';
import { withNotes } from './conversation.mjs';

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

// Task 21: the acceptance is per provider, over the owner's *real* prompt. The knowledge block is
// built by the real projectKnowledge() against a fake ASSETS binding (the deploy-time pack is not in
// this repo), and the notes block by the real withNotes() that conversation.mjs uses in production.
// Real repository docs, not a synthetic blob: `clip()` cuts at a line boundary, so a fixture made of
// one huge word is stripped wholesale and the test would pass on a 347-char "knowledge" block while
// the real one is ~3.4k chars. Reading the shipped docs keeps the size and the shape honest.
const repoRoot = join(here, '..');
const PORTFOLIO_FIXTURE = `PORTFOLIO-MARK\n${readFileSync(join(repoRoot, 'docs/PORTFOLIO.md'), 'utf8')}`;
const PSK_FIXTURE = `PSK-DOC-MARK\n${readFileSync(join(repoRoot, 'psk/PROGRESS.md'), 'utf8')}`;
const NOTES = ['اسم سگم رکس است (NOTE-MARK)', 'قرارِ جمعه ساعت ۸ جلو دربِ کارگاه'];

function assets(files) {
  return {
    async fetch(request) {
      const name = new URL(request.url).pathname.replace('/knowledge/', '');
      return files[name] ? new Response(files[name]) : new Response('', { status: 404 });
    },
  };
}

test('task 21: every provider budget keeps the owner memory and the project knowledge', async () => {
  const question = 'وضعیت psk چطوره؟';
  const knowledge = await projectKnowledge({ ASSETS: assets({ 'portfolio.md': PORTFOLIO_FIXTURE, 'psk.md': PSK_FIXTURE }) }, question);
  assert.match(knowledge, /OWNER PORTFOLIO KNOWLEDGE/, 'the fixture must produce a real knowledge block');
  assert.match(knowledge, /PORTFOLIO-MARK/);
  assert.ok(knowledge.length > 2500, `the knowledge block is only ${knowledge.length} chars; the test would be vacuous`);
  const system = withNotes(SYSTEM + knowledge, NOTES);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: 'گزارشِ دیروز یادت نره' },
    { role: 'assistant', content: 'حتماً' },
    { role: 'user', content: question },
  ];

  const budgets = new Set([FULL_BUDGET, SMALL_BUDGET]);
  for (const provider of PROVIDERS) budgets.add(provider.budget || FULL_BUDGET);

  for (const provider of PROVIDERS) {
    for (const budget of [provider.budget || FULL_BUDGET, SMALL_BUDGET]) {
      const [fitted] = fitContext(messages, budget);
      const label = `${provider.name} @ ${budget}`;
      assert.ok(fitted.content.length <= budget, `${label}: prompt is ${fitted.content.length} chars`);
      // حافظه — the notes header and the note the owner actually asked to be remembered
      assert.match(fitted.content, /LONG-TERM NOTES/, `${label}: the memory block was dropped`);
      assert.match(fitted.content, /NOTE-MARK/, `${label}: the owner's note was dropped`);
      // دانش پروژه — the knowledge header and the portfolio/project content it carries
      assert.match(fitted.content, /OWNER PORTFOLIO KNOWLEDGE/, `${label}: the project-knowledge block was dropped`);
      assert.match(fitted.content, /PORTFOLIO-MARK/, `${label}: the portfolio content was dropped`);
      assert.match(fitted.content, /^You are Hermes/, `${label}: the persona head was dropped`);
      assert.ok(budgets.has(budget), `${label}: unexpected budget`);
    }
  }
  // the small budget is the one that used to lose the knowledge block: 5000 chars for a ~11k prompt
  const [small] = fitContext(messages, SMALL_BUDGET);
  assert.match(small.content, /PSK-DOC-MARK|PORTFOLIO-MARK/, 'at the small budget at least one project fact must survive');
});

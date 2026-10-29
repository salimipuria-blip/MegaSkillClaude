// The behaviour the tutorial promises, asserted without a browser or a model.
//   node --test docs/guides/ai-projects-3/project-1-browser-summarizer/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TOKENS, DTYPE, MAX_INPUT_CHARS, MODEL, TOKEN_RANGE,
  clampTokens, downloadNotice, generationOptions, humanBytes, normalizeText,
  prepareText, progressPercent, readSummary,
} from './summarizer-core.mjs';

test('the pinned model and dtype are the ones the notice describes', () => {
  assert.equal(MODEL, 'Xenova/distilbart-cnn-6-6');
  assert.equal(DTYPE, 'q8', 'fp32 is ~1.1 GB; the tutorial must not silently download that');
  assert.match(downloadNotice(), /۳۱۰ مگابایت/);
  assert.match(downloadNotice(), /هاگینگ‌فیس/);
});

test('normalizeText collapses layout whitespace but keeps Persian ZWNJ and line breaks', () => {
  assert.equal(normalizeText('  سلام   دنیا \r\nخوبی؟  '), 'سلام دنیا\nخوبی؟');
  assert.equal(normalizeText('می‌روم'), 'می‌روم', 'U+200C must survive');
  assert.equal(normalizeText('a\n\n\n\nb'), 'a\n\nb');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
});

test('prepareText reports empty and too-short instead of calling the model', () => {
  assert.deepEqual(prepareText(''), { text: '', truncated: false, reason: 'empty' });
  assert.deepEqual(prepareText('   \n  '), { text: '', truncated: false, reason: 'empty' });
  const short = prepareText('کوتاه');
  assert.equal(short.reason, 'too-short');
  assert.equal(short.text, 'کوتاه');
});

test('prepareText leaves text under the budget untouched', () => {
  const text = 'این یک جملهٔ کامل است که به اندازهٔ کافی بلند است. '.repeat(20).trim();
  const out = prepareText(text);
  assert.equal(out.truncated, false);
  assert.equal(out.reason, '');
  assert.equal(out.text, text);
});

test('prepareText cuts long input at a sentence boundary, never mid-sentence', () => {
  const sentence = 'این جمله برای آزمون برش ساخته شده است. '; // 39 chars
  const text = sentence.repeat(400).trim();
  const out = prepareText(text, 1000);
  assert.equal(out.truncated, true);
  assert.ok(out.text.length <= 1000, `kept ${out.text.length} chars`);
  assert.ok(out.text.length >= 600, 'a boundary below 60% of the budget must be rejected instead');
  assert.match(out.text, /[.؟!…]$/u, 'the result must end on a terminator');
});

test('prepareText keeps the terminator of a Persian question', () => {
  const text = ('آیا این کار درست است؟ ' + 'توضیح بیشتر. ').repeat(200);
  const out = prepareText(text, 500);
  assert.match(out.text, /[.؟!…]$/u);
});

test('prepareText falls back to a hard cut when no sentence boundary exists', () => {
  const out = prepareText('x'.repeat(MAX_INPUT_CHARS + 500), 1000);
  assert.equal(out.truncated, true);
  assert.equal(out.text.length, 1000);
});

test('clampTokens keeps a legal integer budget', () => {
  assert.equal(clampTokens(0), TOKEN_RANGE[0]);
  assert.equal(clampTokens(9999), TOKEN_RANGE[1]);
  assert.equal(clampTokens(64.6), 65);
  assert.equal(clampTokens('128'), 128);
  assert.equal(clampTokens(undefined), DEFAULT_TOKENS);
  assert.equal(clampTokens(NaN), DEFAULT_TOKENS);
  assert.deepEqual(generationOptions(128), { max_new_tokens: 128 });
});

test('readSummary understands every pipeline shape a learner will meet', () => {
  assert.equal(readSummary([{ summary_text: ' خلاصه ' }]), 'خلاصه');
  assert.equal(readSummary({ summary_text: 'یکی' }), 'یکی');
  assert.equal(readSummary([{ generated_text: 'دومی' }]), 'دومی');
  assert.equal(readSummary(['سه‌می']), 'سه‌می');
  assert.equal(readSummary([{ summary_text: '   ' }]), null);
  assert.equal(readSummary([]), null);
  assert.equal(readSummary(null), null);
  assert.equal(readSummary(undefined), null);
  assert.equal(readSummary([{}]), null);
});

test('progressPercent only answers for real byte progress', () => {
  assert.equal(progressPercent({ status: 'progress', loaded: 50, total: 200 }), 25);
  assert.equal(progressPercent({ status: 'progress', progress: 42.4 }), 42);
  assert.equal(progressPercent({ status: 'progress', loaded: 900, total: 100 }), 100);
  assert.equal(progressPercent({ status: 'initiate' }), null);
  assert.equal(progressPercent({ status: 'done' }), null);
  assert.equal(progressPercent(null), null);
  assert.equal(progressPercent({ status: 'progress' }), null);
});

test('humanBytes formats the model sizes a learner will actually see', () => {
  assert.equal(humanBytes(512), '512 B');
  assert.equal(humanBytes(1536), '1.5 KB');
  assert.equal(humanBytes(310 * 1024 * 1024), '310 MB');
  assert.equal(humanBytes(1.1 * 1024 ** 3), '1.1 GB');
  assert.equal(humanBytes(-1), '—');
  assert.equal(humanBytes('nope'), '—');
});

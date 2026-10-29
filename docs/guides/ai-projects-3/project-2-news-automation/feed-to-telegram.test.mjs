// Offline tests for the news pipeline: no network, no Ollama, no Telegram.
//   node --test docs/guides/ai-projects-3/project-2-news-automation/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMessage, chunkMessage, decodeEntities, escapeHtml, ollamaBody, parseFeed,
  plainText, readOllamaText, run, sendTelegram, summarise, summarisePrompt,
} from './feed-to-telegram.mjs';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>نمونه</title>
  <item>
    <title><![CDATA[خبر اول &amp; مهم]]></title>
    <link>https://example.com/a?x=1&amp;y=2</link>
    <description><![CDATA[<p>متن <b>اول</b> با تگ.</p>]]></description>
    <pubDate>Mon, 27 Oct 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>خبر دوم</title>
    <link>https://example.com/b</link>
    <description>متن دوم</description>
  </item>
  <item><title>بدون لینک</title><description>باید حذف شود</description></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>اتم یک</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
    <summary>خلاصهٔ اتم</summary>
    <updated>2026-10-27T08:00:00Z</updated>
  </entry>
</feed>`;

test('decodeEntities handles named, decimal and hex entities and leaves unknowns alone', () => {
  assert.equal(decodeEntities('a &amp; b'), 'a & b');
  assert.equal(decodeEntities('&lt;p&gt;'), '<p>');
  assert.equal(decodeEntities('&#1610;'), 'ي');
  assert.equal(decodeEntities('&#x627;'), 'ا');
  assert.equal(decodeEntities('&unknown;'), '&unknown;');
  assert.equal(decodeEntities(''), '');
});

test('plainText strips tags, unwraps CDATA, decodes entities and collapses whitespace', () => {
  assert.equal(plainText('<p>متن <b>پررنگ</b></p>'), 'متن پررنگ');
  assert.equal(plainText('<![CDATA[a &amp; b]]>'), 'a & b');
  assert.equal(plainText(null), '');
});

test('parseFeed reads RSS items, unwraps CDATA and drops entries without a title or link', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2, 'the item without a link must be dropped');
  assert.equal(items[0].title, 'خبر اول & مهم');
  assert.equal(items[0].link, 'https://example.com/a?x=1&y=2');
  assert.equal(items[0].summary, 'متن اول با تگ.');
  assert.equal(items[1].title, 'خبر دوم');
  assert.match(items[0].published, /2026/);
});

test('parseFeed respects the limit and reads Atom entries', () => {
  assert.equal(parseFeed(RSS, { limit: 1 }).length, 1);
  assert.equal(parseFeed(RSS, { limit: 0 }).length, 0);
  const [entry] = parseFeed(ATOM);
  assert.equal(entry.title, 'اتم یک');
  assert.equal(entry.link, 'https://example.com/atom-1', 'Atom keeps the link in an attribute');
  assert.equal(entry.summary, 'خلاصهٔ اتم');
});

test('parseFeed never throws on junk', () => {
  assert.deepEqual(parseFeed(''), []);
  assert.deepEqual(parseFeed('<html>not a feed</html>'), []);
  assert.deepEqual(parseFeed(null), []);
});

test('the prompt carries the title and the body, and asks for Persian output', () => {
  const prompt = summarisePrompt({ title: 'عنوان', summary: 'متن' });
  assert.match(prompt, /عنوان/);
  assert.match(prompt, /فارسی/);
  assert.match(prompt, /متن/);
  assert.match(summarisePrompt({ title: 't', summary: '' }), /بدون متن/);
});

test('the Ollama body disables streaming and bounds the answer', () => {
  const body = ollamaBody('llama3.1:8b', 'p');
  assert.equal(body.stream, false);
  assert.equal(body.model, 'llama3.1:8b');
  assert.ok(body.options.num_predict > 0);
});

test('readOllamaText understands both Ollama response shapes', () => {
  assert.equal(readOllamaText({ response: ' پاسخ ' }), 'پاسخ');
  assert.equal(readOllamaText({ message: { content: 'دومی' } }), 'دومی');
  assert.equal(readOllamaText({}), '');
  assert.equal(readOllamaText(null), '');
  assert.equal(readOllamaText({ response: '   ' }), '');
});

test('escapeHtml protects the HTML parse mode', () => {
  assert.equal(escapeHtml('<b>a & b</b>'), '&lt;b&gt;a &amp; b&lt;/b&gt;');
  assert.equal(escapeHtml(null), '');
});

test('buildMessage escapes content, links every item and caps the length on a line boundary', () => {
  const items = [{ title: 'یک <تگ>', link: 'https://e.com/1' }, { title: 'دو', link: 'https://e.com/2' }];
  const message = buildMessage(items, ['خلاصهٔ یک', '']);
  assert.match(message, /یک &lt;تگ&gt;/);
  assert.match(message, /href="https:\/\/e.com\/1"/);
  assert.match(message, /خلاصه‌ای تولید نشد/, 'an empty summary is stated, not hidden');
  assert.ok(message.length <= 3900);

  const many = Array.from({ length: 60 }, (_, i) => ({ title: `خبر شمارهٔ ${i}`, link: `https://e.com/${i}` }));
  const capped = buildMessage(many, many.map(() => 'خ'.repeat(80)));
  assert.ok(capped.length <= 3900);
  assert.match(capped, /ادامه در پیام بعدی/);
  assert.doesNotMatch(capped, /<b>[^<]*$/, 'the cut must not leave an open tag');
});

test('chunkMessage splits long text without losing characters', () => {
  const text = Array.from({ length: 200 }, (_, i) => `خط ${i}`).join('\n');
  const chunks = chunkMessage(text, 300);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 300));
  assert.equal(chunks.join('\n'), text.replace(/\n/g, '\n'));
  assert.deepEqual(chunkMessage('کوتاه'), ['کوتاه']);
});

test('summarise throws a readable error when Ollama is down or empty', async () => {
  await assert.rejects(
    summarise('p', { fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'down' }) }),
    /Ollama 503/,
  );
  await assert.rejects(
    summarise('p', { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    /پاسخ خالی/,
  );
  const ok = await summarise('p', { fetchImpl: async () => ({ ok: true, json: async () => ({ response: 'خوب' }) }) });
  assert.equal(ok, 'خوب');
});

test('sendTelegram refuses a rejected send instead of pretending it worked', async () => {
  await assert.rejects(
    sendTelegram('<b>x</b>', { fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ ok: false, description: 'chat not found' }) }) }),
    /chat not found/,
  );
  const payload = await sendTelegram('<b>x</b>', { token: 't', chatId: '1', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }) });
  assert.equal(payload.ok, true);
});

test('run() end-to-end with a fake feed and a dry run sends nothing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('feed.xml')) return { ok: true, text: async () => RSS };
    if (String(url).includes('/api/generate')) return { ok: true, json: async () => ({ response: 'خلاصهٔ مدل' }) };
    throw new Error(`unexpected fetch ${url} /* ${init?.method || 'GET'} */`);
  };
  const logged = [];
  const result = await run({ feedUrl: 'https://example.com/feed.xml', limit: 2, dryRun: true, fetchImpl, log: (m) => logged.push(m) });
  assert.deepEqual(result, { sent: 0, dryRun: true, items: 2 });
  assert.ok(logged[0].includes('خلاصهٔ مدل'));
  assert.ok(!calls.some((c) => c.includes('api.telegram.org')), 'dry run must not call Telegram');
});

test('run() keeps going when one summary fails, and reports the partial batch', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('feed.xml')) return { ok: true, text: async () => RSS };
    calls += 1;
    if (calls === 1) return { ok: false, status: 500, text: async () => 'boom' };
    return { ok: true, json: async () => ({ response: 'خلاصه' }) };
  };
  const warnings = [];
  const result = await run({ feedUrl: 'https://example.com/feed.xml', limit: 2, dryRun: true, fetchImpl, log: (m) => warnings.push(m) });
  assert.equal(result.items, 2);
  assert.ok(warnings.some((w) => w.includes('شکست خورد')));
});

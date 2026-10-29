// Project 2, dependency-free edition: RSS → local LLM → Telegram, on a timer.
//
// The tutorial's version of this project uses n8n. n8n is *fair-code* (Sustainable Use
// License), not OSI open source, so this file gives the same pipeline with nothing but
// Node's standard library — the parts that are worth learning (parse, prompt, format,
// send) are ordinary functions with tests instead of nodes in a GUI.
//
//   FEED_URL=https://example.com/feed.xml OLLAMA_URL=http://localhost:11434 \
//   OLLAMA_MODEL=llama3.1:8b TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… \
//   node feed-to-telegram.mjs --dry-run
//
// `--dry-run` prints the message and sends nothing. Without TELEGRAM_* it never leaves the machine.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the five XML entities plus numeric ones. Unknown entities are left as-is. */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(ENTITIES, body) ? ENTITIES[body] : whole;
  });
}

/** Strip markup from an RSS description: tags out, entities in, whitespace normalised. */
export function plainText(html) {
  return decodeEntities(String(html ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first capture group of `tag` inside `block`, or ''. CDATA is unwrapped. */
function tag(block, name) {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

/**
 * Parse an RSS 2.0 or Atom feed into `{title, link, summary, published}`.
 * Deliberately small: no XML library, no XPath, no schema. It survives the shapes real
 * news feeds emit (CDATA, attributes on tags, Atom `entry`) and refuses to invent fields.
 */
export function parseFeed(xml, { limit = 5 } = {}) {
  const source = String(xml ?? '');
  const blocks = [...source.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const entries = blocks.length
    ? blocks
    : [...source.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);

  const items = entries.map((block) => {
    const linkTag = tag(block, 'link');
    const href = /<link\b[^>]*href="([^"]+)"/i.exec(block);
    return {
      title: plainText(tag(block, 'title')),
      link: plainText(linkTag) || (href ? href[1] : ''),
      summary: plainText(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content')),
      published: plainText(tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'published')),
    };
  }).filter((item) => item.title && item.link);

  return items.slice(0, Math.max(0, limit));
}

/** The prompt sent to the local model. One item at a time keeps answers short and cheap. */
export function summarisePrompt(item, { lines = 3 } = {}) {
  return `این خبر را در ${lines} خط فارسی خلاصه کن. فقط خلاصه را بنویس، بدون مقدمه و بدون تکرار عنوان.\n\n` +
    `عنوان: ${item.title}\n\nمتن: ${item.summary || '(بدون متن؛ فقط از عنوان استفاده کن)'}`;
}

/** The body Ollama's /api/generate expects. `stream:false` because we need the whole answer. */
export function ollamaBody(model, prompt) {
  return { model, prompt, stream: false, options: { temperature: 0.2, num_predict: 220 } };
}

/** Ollama answers `{response}` for /api/generate and `{message:{content}}` for /api/chat. */
export function readOllamaText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.response === 'string') return payload.response.trim();
  if (payload.message && typeof payload.message.content === 'string') return payload.message.content.trim();
  return '';
}

/** Escape the three characters Telegram's HTML parse mode treats as markup. */
export const escapeHtml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Build the Telegram message for a batch. Truncates on a **line** boundary so the HTML
 * never ends inside a tag, and caps below Telegram's 4096-character limit.
 */
export function buildMessage(items, summaries, { maxLength = 3900 } = {}) {
  const parts = [];
  items.forEach((item, index) => {
    const summary = (summaries[index] || '').trim();
    parts.push(
      `<b>${index + 1}. ${escapeHtml(item.title)}</b>\n` +
      `${escapeHtml(summary || 'خلاصه‌ای تولید نشد.')}\n` +
      `<a href="${escapeHtml(item.link)}">ادامهٔ خبر</a>`,
    );
  });
  const whole = parts.join('\n\n');
  if (whole.length <= maxLength) return whole;

  const kept = [];
  let length = 0;
  for (const part of parts) {
    // +2 for the blank line separator between parts.
    if (length + part.length + 2 > maxLength) break;
    kept.push(part);
    length += part.length + 2;
  }
  if (kept.length) return `${kept.join('\n\n')}\n\n<i>…ادامه در پیام بعدی</i>`;
  // A single oversized item: cut the text, close nothing (the plain part has no tags open).
  return whole.slice(0, maxLength);
}

/** Split a long message into Telegram-sized chunks, preferring newlines. */
export function chunkMessage(text, limit = 3900) {
  const chunks = [];
  let rest = String(text ?? '');
  while (rest.length > limit) {
    const at = rest.lastIndexOf('\n', limit);
    const cut = at > limit * 0.5 ? at : limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}

const withTimeout = (ms) => AbortSignal.timeout(ms);

/** Ask the local model once. No retries: the caller decides what a failure means. */
export async function summarise(prompt, {
  url = process.env.OLLAMA_URL || 'http://localhost:11434',
  model = process.env.OLLAMA_MODEL || 'llama3.1:8b',
  fetchImpl = fetch,
  timeoutMs = 120000,
} = {}) {
  const res = await fetchImpl(`${url.replace(/\/+$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ollamaBody(model, prompt)),
    signal: withTimeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = readOllamaText(await res.json());
  if (!text) throw new Error('Ollama پاسخ خالی داد.');
  return text;
}

/** Send one HTML message. Returns Telegram's parsed answer; throws on a refused send. */
export async function sendTelegram(html, {
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  fetchImpl = fetch,
  timeoutMs = 20000,
} = {}) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: withTimeout(timeoutMs),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.ok !== true) {
    throw new Error(`Telegram refused: ${payload.description || res.status}`);
  }
  return payload;
}

/** One full run. Injectable fetch so the whole pipeline is testable offline. */
export async function run({
  feedUrl = process.env.FEED_URL,
  limit = 3,
  dryRun = process.argv.includes('--dry-run') || !process.env.TELEGRAM_BOT_TOKEN,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  if (!feedUrl) throw new Error('FEED_URL تنظیم نشده است.');
  const feed = await fetchImpl(feedUrl, { signal: withTimeout(20000) });
  if (!feed.ok) throw new Error(`فید ${feed.status} برگرداند.`);
  const items = parseFeed(await feed.text(), { limit });
  if (!items.length) throw new Error('هیچ خبری در فید نبود.');

  const summaries = [];
  for (const item of items) {
    try {
      summaries.push(await summarise(summarisePrompt(item), { fetchImpl }));
    } catch (error) {
      log(`[warn] خلاصه‌سازی «${item.title}» شکست خورد: ${error.message}`);
      summaries.push('');
    }
  }

  const message = buildMessage(items, summaries);
  if (dryRun) {
    log(message);
    return { sent: 0, dryRun: true, items: items.length };
  }
  let sent = 0;
  for (const chunk of chunkMessage(message)) {
    await sendTelegram(chunk, { fetchImpl });
    sent += 1;
  }
  return { sent, dryRun: false, items: items.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run().then((result) => {
    console.log(result.dryRun
      ? `[dry-run] ${result.items} خبر آماده شد؛ چیزی ارسال نشد.`
      : `[ok] ${result.sent} پیام ارسال شد (${result.items} خبر).`);
  }).catch((error) => {
    console.error(`[error] ${error.message}`);
    process.exitCode = 1;
  });
}

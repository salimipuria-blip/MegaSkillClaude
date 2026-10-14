// The text layer: reading the request, the design maths, the drawing plan, the SVG/HTML executors,
// the optional server-side renderer, and the whole flow through the Worker (Telegram + app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  textRequest, designSpec, textLayout, displayList, svgOverlay, composeHtml, renderTextLayer,
  layerCaption, PALETTES, LAYER_POSITIONS, POSITION_LABEL, FONT_STACK, AVG_GLYPH,
} from './textlayer.mjs';
import { imageInfo } from './image-bytes.mjs';
import worker, { webhookSecret } from './worker.mjs';

const OWNER = '123456789';
const baseEnv = () => ({ FREE_TEXT: 'off', TELEGRAM_BOT_TOKEN: '1:abc', GEMINI_API_KEY: 'g', ALLOWED_USER_ID: OWNER, MEMORY: kv() });
function kv() {
  const store = new Map();
  return { store, async get(k, type) { const v = store.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } };
}
const b64 = (s) => Buffer.from(s).toString('base64');
const jsonRes = (o, status = 200) => new Response(JSON.stringify(o), { status });

// Real PNG bytes so the module's own pixel checks have honest input.
const toB64 = (bytes) => Buffer.from(Uint8Array.from(bytes)).toString('base64');
function pngB64(width, height, fill = 0) {
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type, data) => [data.length >>> 24 & 255, data.length >>> 16 & 255, data.length >>> 8 & 255, data.length & 255,
    ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  bytes.push(...chunk('IHDR', [width >>> 24 & 255, width >>> 16 & 255, width >>> 8 & 255, width & 255,
    height >>> 24 & 255, height >>> 16 & 255, height >>> 8 & 255, height & 255, 8, 2, 0, 0, 0]));
  bytes.push(...chunk('IDAT', new Array(1200).fill(fill)));
  bytes.push(...chunk('IEND', []));
  return toB64(bytes);
}
const PNG = pngB64(1024, 1280, 7);

// ---------------------------------------------------------------------------------------
// 1. Reading the request
// ---------------------------------------------------------------------------------------

test('the words, place and style are read from Persian and English requests', () => {
  const a = textRequest('روی این عکس بنویس: کمپ وایکینگ در جنگل');
  assert.equal(a.text, 'کمپ وایکینگ در جنگل');
  assert.equal(a.position, 'bottom', 'bottom is the default');
  assert.equal(a.rtl, true);
  const b = textRequest('متن بذار پایین عکس «تور آفرود دو روزه» با فونت طلایی و نوار');
  assert.equal(b.text, 'تور آفرود دو روزه');
  assert.equal(b.style, 'gold');
  assert.equal(b.bar, true);
  const c = textRequest('تیتر بزن بالای عکس: وایکینگ آفرود');
  assert.equal(c.position, 'top');
  assert.equal(c.text, 'وایکینگ آفرود');
  const d = textRequest('write "Wild camp" on the photo in white');
  assert.equal(d.text, 'Wild camp');
  assert.equal(d.style, 'white');
  assert.equal(d.rtl, false);
  const e = textRequest('متن وسط عکس بنویس که «سفر با ما»');
  assert.equal(e.position, 'middle');
  assert.equal(e.text, 'سفر با ما');
  const big = textRequest('تیتر بزرگ روی عکس: تور زمستانی');
  assert.equal(big.size, 1.25);
});

test('a text request without usable words is not a text layer', () => {
  assert.equal(textRequest('این عکس چیه؟'), null);
  assert.equal(textRequest('متن بذار روی عکس'), null, 'no words to set');
  assert.equal(textRequest('روی عکس متن بنویس'), null);
  assert.equal(textRequest('این عکس رو ریتوش کن'), null);
  assert.equal(textRequest('یک لوگو روی عکس بذار'), null, 'a logo is not text');
  assert.equal(textRequest('x'.repeat(400)), null);
  assert.equal(textRequest(''), null);
});

// ---------------------------------------------------------------------------------------
// 2. The design
// ---------------------------------------------------------------------------------------

test('the design scales with the frame and keeps a single line when it stays readable', () => {
  const story = designSpec({ text: 'کمپ وایکینگ در جنگل', width: 1080, height: 1920 });
  const square = designSpec({ text: 'کمپ وایکینگ در جنگل', width: 1024, height: 1024 });
  assert.ok(story.fontSize > square.fontSize, 'a taller frame allows a bigger headline');
  assert.equal(textLayout(story).lines.length, 1, 'three words still fit one line');
  assert.equal(story.direction, 'rtl');
  assert.equal(story.align, 'center');
  assert.equal(story.font, FONT_STACK);
  assert.ok(story.fontSize < 1920 * 0.1);
  const en = designSpec({ text: 'Wild camp', width: 1024, height: 1024 });
  assert.equal(en.direction, 'ltr');
});

test('long copy wraps inside the safe area and never spills past four lines', () => {
  const spec = designSpec({ text: 'این یک تیتر بلند فارسی است که باید در چند خط بشکند و هیچوقت از کادر بیرون نزند', width: 1080, height: 1080 });
  const lay = textLayout(spec);
  assert.ok(lay.lines.length >= 2 && lay.lines.length <= 4);
  for (const line of lay.lines) assert.ok(line.length * AVG_GLYPH * lay.fontSize <= spec.maxWidth + 1, `line overflows: ${line}`);
  assert.ok(lay.fontSize <= spec.fontSize);
  // a single unbroken wall of characters still ends up inside the frame
  const wall = designSpec({ text: 'الف'.repeat(120), width: 800, height: 800 });
  const wallLay = textLayout(wall);
  assert.ok(wallLay.lines.length <= 4);
  assert.ok(wallLay.lines.every((l) => l.length * AVG_GLYPH * wallLay.fontSize <= wall.maxWidth + 1));
});

test('the palette guarantees legibility and follows the tone when the style is auto', () => {
  assert.equal(designSpec({ text: 'x', tone: 'light' }).style, 'dark');
  assert.equal(designSpec({ text: 'x', tone: 'dark' }).style, 'white');
  assert.equal(designSpec({ text: 'x', tone: 'mixed' }).style, 'white');
  assert.equal(designSpec({ text: 'x', style: 'gold' }).style, 'gold');
  const gold = designSpec({ text: 'برند', style: 'gold', width: 1000, height: 1000 });
  assert.equal(gold.fill, PALETTES.gold.fill);
  assert.ok(gold.stroke.startsWith('rgba('), 'a stroke keeps the text readable on any photo');
  assert.ok(gold.strokeWidth >= 2);
  assert.ok(gold.shadow.blur >= 4 && gold.shadow.color.startsWith('rgba('));
  assert.ok(gold.shadow.dy >= 1);
});

test('the block sits inside the frame at every position and moves with the position', () => {
  const lay = textLayout(designSpec({ text: 'تور آفرود وایکینگ', width: 1000, height: 1000 }));
  for (const pos of LAYER_POSITIONS) {
    const ops = displayList(lay, pos);
    const y = ops.find((o) => o.op === 'text').y;
    assert.ok(y > lay.fontSize && y < 1000 - lay.fontSize, `${pos} text must sit inside the frame`);
  }
  const top = displayList(lay, 'top')[0].y;
  const middle = displayList(lay, 'middle')[0].y;
  const bottom = displayList(lay, 'bottom')[0].y;
  assert.ok(top < middle && middle < bottom);
  assert.equal(displayList(lay).length, lay.lines.length, 'no bar by default');
  const withBar = textLayout(designSpec({ text: 'تیتر', bar: true, width: 1000, height: 1000 }));
  const ops = displayList(withBar);
  assert.equal(ops[0].op, 'bar');
  assert.equal(ops[0].width, 1000);
  assert.ok(ops[0].height > ops[0].height * 0 + withBar.fontSize);
});

test('the drawing plan is portable data the app can execute as-is', () => {
  const lay = textLayout(designSpec({ text: 'کمپ وایکینگ آفرود در جنگل پاییزی شمال', width: 800, height: 1000, style: 'gold', bar: true }));
  assert.ok(lay.lines.length >= 2, 'this frame is narrow enough to wrap');
  const ops = displayList(lay);
  const text = ops.filter((o) => o.op === 'text');
  assert.equal(text.length, lay.lines.length);
  for (const t of text) {
    assert.equal(t.align, 'center');
    assert.equal(t.direction, 'rtl');
    assert.equal(t.font, FONT_STACK);
    assert.equal(t.weight, 600);
    assert.equal(t.fontSize, lay.fontSize);
    assert.equal(t.x, lay.width / 2, 'the block is centred on the frame');
  }
  assert.equal(text[1].y - text[0].y, lay.lineHeight);
  assert.deepEqual(JSON.parse(JSON.stringify(ops)), ops, 'pure JSON: no functions, no class instances');
});

// ---------------------------------------------------------------------------------------
// 3. Executors: SVG, HTML and the optional server render
// ---------------------------------------------------------------------------------------

test('the SVG export is a real overlay document', () => {
  const lay = textLayout(designSpec({ text: 'کمپ <وایکینگ>', width: 800, height: 800, bar: true }));
  const svg = svgOverlay(lay);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="800" height="800"/);
  assert.match(svg, /direction="rtl"/);
  assert.match(svg, /font-size="\d+"/);
  assert.match(svg, /<rect /, 'the banner strip is drawn');
  assert.match(svg, /کمپ &lt;وایکینگ&gt;/, 'markup is escaped');
  assert.equal((svg.match(/<text /g) || []).length >= lay.lines.length * 2, true, 'stroke pass + fill pass');
});

test('the HTML for server-side rendering carries the image, the font and the layer', () => {
  const lay = textLayout(designSpec({ text: 'تور آفرود', width: 640, height: 480, style: 'gold' }));
  const html = composeHtml(lay, 'data:image/png;base64,AAAA');
  assert.match(html, /Vazirmatn-font-face\.css/);
  assert.match(html, /src="data:image\/png;base64,AAAA"/);
  assert.match(html, /width:640px;height:480px/);
  assert.match(html, /direction:rtl/);
  assert.match(html, /color:#f5a623/);
  assert.ok(html.includes('>تور آفرود<'));
});

test('the server-side render is optional and honest about it', async () => {
  const lay = textLayout(designSpec({ text: 'تور آفرود', width: 640, height: 480 }));
  assert.equal(await renderTextLayer({}, PNG, 'image/png', lay), null, 'no binding: no render');
  const calls = [];
  const env = { BROWSER: { async quickAction(action, opts) { calls.push({ action, opts }); return Uint8Array.from(Buffer.from(pngB64(640, 480, 3), 'base64')); } } };
  const out = await renderTextLayer(env, PNG, 'image/png', lay);
  assert.equal(calls[0].action, 'screenshot');
  assert.equal(calls[0].opts.viewport.width, 640);
  assert.match(calls[0].opts.html, /تور آفرود/);
  assert.deepEqual(imageInfo(Buffer.from(out.image, 'base64')), { mime: 'image/png', width: 640, height: 480 });
  assert.equal(out.provider, 'browser');
  // a binding that answers with rubbish is not an image
  const bad = { BROWSER: { async quickAction() { return Uint8Array.from([1, 2, 3, 4]); } } };
  assert.equal(await renderTextLayer(bad, PNG, 'image/png', lay), null);
  const throwing = { BROWSER: { async quickAction() { throw new Error('quota'); } } };
  await assert.rejects(() => renderTextLayer(throwing, PNG, 'image/png', lay), /quota/);
});

test('the caption tells the user the words, the place and how to move them', () => {
  const lay = textLayout(designSpec({ text: 'کمپ وایکینگ', width: 1024, height: 1024, style: 'gold', bar: true }));
  const text = layerCaption(lay, { composed: true });
  assert.match(text, /«کمپ وایکینگ»/);
  assert.match(text, /پایین عکس · رنگ طلایی · با نوار پشت متن/);
  assert.match(text, /فونت واقعی/);
  assert.match(text, /خروجی متن‌دار در همین پیام است/);
  const flat = layerCaption({ ...lay, position: 'top' }, { composed: false });
  assert.match(flat, /بالای عکس/);
  assert.match(flat, /دکمهٔ «متن را بگذار»/);
  assert.equal(POSITION_LABEL.middle, 'وسط عکس');
});

// ---------------------------------------------------------------------------------------
// 4. Real turns through the Worker
// ---------------------------------------------------------------------------------------

function textMock({ browsered = null, brief = null } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init ? init.body : null;
    calls.push({ url: u, body });
    if (u.endsWith('/getFile')) return jsonRes({ ok: true, result: { file_path: 'photos/file_2.jpg' } });
    if (u.includes('/file/bot')) return new Response(Uint8Array.from(Buffer.from(PNG, 'base64')));
    if (u.includes('/models?')) return jsonRes({ models: [{ name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] });
    if (u.includes('generativelanguage')) {
      const text = body.contents.at(-1).parts.filter((p) => p.text).map((p) => p.text).join(' ');
      if (/retoucher request/i.test(text)) return jsonRes({ candidates: [{ content: { parts: [{ text: brief || 'no json' }] } }] });
      if (/Review the edit/i.test(text)) return jsonRes({ candidates: [{ content: { parts: [{ text: '{"instruction":94,"artifacts":94,"light":94,"frame":94,"keep":true}' }] } }] });
      return jsonRes({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: pngB64(1024, 1024, 9) } }] } }] });
    }
    return jsonRes({ ok: true, result: { message_id: 1 } });
  };
  const env = baseEnv();
  if (browsered) env.BROWSER = { async quickAction() { return Uint8Array.from(Buffer.from(browsered, 'base64')); } };
  return { env, calls };
}

async function post(env, update) {
  const pending = [];
  const req = new Request('https://hermes.example.workers.dev/telegram', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': await webhookSecret(env) },
    body: JSON.stringify(update),
  });
  const res = await worker.fetch(req, env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return res;
}
const photoMsg = (caption) => ({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) },
  caption, photo: [{ file_id: 'p1' }] } });

test('Telegram: a pure text request is not refused any more; the photo comes back with the words', async () => {
  const { env, calls } = textMock();
  await post(env, photoMsg('روی این عکس بنویس: کمپ وایکینگ در جنگل'));
  assert.equal(calls.some((c) => c.url.includes(':generateContent')), false, 'no image model is asked to draw text');
  const album = calls.find((c) => c.url.endsWith('/sendMediaGroup'));
  assert.ok(album, 'the picture is delivered');
  const media = JSON.parse(album.body.get('media'));
  assert.match(media[0].caption, /«کمپ وایکینگ در جنگل»/);
  assert.match(media[0].caption, /دکمهٔ «متن را بگذار»/);
  assert.equal(Buffer.from(await album.body.get('after').arrayBuffer()).toString('base64'), PNG, 'the original is delivered untouched');
});

test('Telegram: with Browser Rendering the composed picture is what gets sent', async () => {
  const composed = pngB64(1024, 1280, 4);
  const { env, calls } = textMock({ browsered: composed });
  await post(env, photoMsg('متن بذار پایین عکس «تور آفرود دو روزه» با فونت طلایی'));
  const album = calls.find((c) => c.url.endsWith('/sendMediaGroup'));
  assert.equal(Buffer.from(await album.body.get('after').arrayBuffer()).toString('base64'), composed);
  assert.match(JSON.parse(album.body.get('media'))[0].caption, /خروجی متن‌دار در همین پیام است/);
  assert.match(JSON.parse(album.body.get('media'))[0].caption, /رنگ طلایی/);
});

test('Telegram: a mixed request edits the photo first and then sets the text layer', async () => {
  const { env, calls } = textMock({ browsered: pngB64(1024, 1280, 5), brief: JSON.stringify({ subject: 'a jeep', subject_type: 'scene',
    must_keep: ['the jeep'], problems: ['harsh shadows'], lighting: 'harsh noon', color: 'cold', aspect: 'keep',
    region: 'bottom', change_scale: 'medium', has_text: false, region_tone: 'dark', risks: [] }) });
  await post(env, photoMsg('این عکس رو ریتوش کن و پایینش بنویس: کمپ وایکینگ'));
  const gem = calls.filter((c) => c.url.includes(':generateContent'));
  assert.ok(gem.length >= 2, 'the edit pipeline ran');
  const album = calls.find((c) => c.url.endsWith('/sendMediaGroup'));
  const caption = JSON.parse(album.body.get('media'))[0].caption;
  assert.match(caption, /ویرایش انجام شد/, 'the edit report stays');
  assert.match(caption, /«کمپ وایکینگ»/, 'and the text layer is reported');
  assert.equal(Buffer.from(await album.body.get('after').arrayBuffer()).toString('base64'), pngB64(1024, 1280, 5), 'the composed edit is delivered');
});

test('Telegram: a text wish without the words asks for them instead of guessing', async () => {
  const { env, calls } = textMock();
  await post(env, photoMsg('متن بذار روی این عکس'));
  assert.equal(calls.some((c) => c.url.endsWith('/sendMediaGroup')), false);
  const msgs = calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => c.body.text);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /چه متنی/);
  assert.match(msgs[0], /روی عکس بنویس:/);
});

test('web app: the response carries the layer so the canvas can set the text', async () => {
  const { env } = textMock();
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'روی این عکس بنویس: کمپ وایکینگ', image: `data:image/png;base64,${PNG}` }),
  }), env, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reply, /«کمپ وایکینگ»/);
  assert.ok(body.textLayer, 'the layer travels with the answer');
  assert.equal(body.textLayer.text, 'کمپ وایکینگ');
  assert.equal(body.textLayer.direction, 'rtl');
  assert.deepEqual(body.textLayer.lines, ['کمپ وایکینگ']);
  assert.ok(body.textLayer.positions.bottom > 0);
  assert.equal(body.textLayer.fontSize > 0, true);
  assert.match(body.image, /^data:image\/png;base64,/);
});

test('web app: an edit plus words returns the edited picture AND the layer', async () => {
  const { env, calls } = textMock({ brief: JSON.stringify({ subject: 'a jeep', subject_type: 'scene', must_keep: ['the jeep'],
    problems: ['harsh shadows'], lighting: 'harsh noon', color: 'cold', aspect: 'keep', region: 'bottom',
    change_scale: 'medium', has_text: false, region_tone: 'light', risks: [] }) });
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'این عکس رو ریتوش کن و بنویس: کمپ وایکینگ', image: `data:image/png;base64,${PNG}` }),
  }), env, { waitUntil: () => {} });
  const body = await res.json();
  assert.match(body.reply, /ویرایش انجام شد/, 'the edit report is there');
  assert.match(body.reply, /«کمپ وایکینگ»/, 'so is the layer report');
  assert.ok(body.textLayer);
  assert.equal(body.textLayer.style, undefined, 'the app gets geometry, not server-only fields');
  assert.equal(body.textLayer.fill, PALETTES.dark.fill, 'a light frame gets dark words (tone from the brief)');
  assert.equal(calls.some((c) => c.url.includes(':generateContent')), true, 'the edit pipeline ran');
});

test('the app page ships the text-layer canvas tools', async () => {
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/app'), baseEnv(), {});
  const html = await res.text();
  assert.match(html, /متن را بگذار/);
  assert.match(html, /drawLayerText/);
  assert.match(html, /ctx\.strokeText|g\.strokeText/);
  assert.match(html, /LAYER_LABEL = \{ top: 'بالا', middle: 'وسط', bottom: 'پایین' \}/);
});

async function appHeaders(env) {
  const { appKey } = await import('./security.mjs');
  return { authorization: `Bearer ${await appKey(env)}` };
}

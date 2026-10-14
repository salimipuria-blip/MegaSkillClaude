// The text layer: reading the request, the design maths, the drawing plan, the SVG/HTML executors,
// the optional server-side renderer, and the whole flow through the Worker (Telegram + app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  textRequest, designSpec, textLayout, displayList, svgOverlay, composeHtml, renderTextLayer,
  layerCaption, PALETTES, LAYER_POSITIONS, POSITION_LABEL, FONT_STACK, AVG_GLYPH,
  layerTuneRequest, layerDesign, applyTune, tuneCaption, rememberTextLayer, recallTextLayer, forgetTextLayer,
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

// ---------------------------------------------------------------------------------------
// 5. The layer moves by message: «بالاتر ببر»، «سفیدش کن»، «متن رو عوض کن…»، «متن رو بردار»
// ---------------------------------------------------------------------------------------

test('the tune request reads a move, a nudge and a place', () => {
  assert.deepEqual(layerTuneRequest('بالاتر ببر'), { move: 'up' });
  assert.deepEqual(layerTuneRequest('ببرش پایین'), { move: 'down' });
  assert.deepEqual(layerTuneRequest('کمی بالاتر'), { nudge: 'up' });
  assert.deepEqual(layerTuneRequest('یه کم پایین‌تر'), { nudge: 'down' });
  assert.deepEqual(layerTuneRequest('وسطش بذار'), { position: 'middle' });
  assert.deepEqual(layerTuneRequest('متن رو ببر بالای عکس'), { position: 'top' });
  assert.deepEqual(layerTuneRequest('متن رو بذار ته عکس'), { position: 'bottom' });
  assert.deepEqual(layerTuneRequest('move the text up'), { move: 'up' });
});

test('the tune request reads a colour, a size, a bar and new words', () => {
  assert.deepEqual(layerTuneRequest('سفیدش کن'), { style: 'white' });
  assert.deepEqual(layerTuneRequest('رنگش طلایی کن'), { style: 'gold' });
  assert.deepEqual(layerTuneRequest('متن روی عکس رو تیره کن'), { style: 'dark' });
  assert.deepEqual(layerTuneRequest('درشت‌ترش کن'), { size: 1.15 });
  assert.deepEqual(layerTuneRequest('کوچیکش کن'), { size: 0.85 });
  assert.deepEqual(layerTuneRequest('نوار بذار پشتش'), { bar: true });
  assert.deepEqual(layerTuneRequest('بدون نوار'), { bar: false });
  assert.deepEqual(layerTuneRequest('متن رو عوض کن به «تخفیف ویژه»'), { text: 'تخفیف ویژه' });
  assert.deepEqual(layerTuneRequest('متن رو بردار'), { remove: true });
  // several changes in one message
  const both = layerTuneRequest('بالاتر ببر و سفیدش کن، بدون نوار');
  assert.equal(both.move, 'up');
  assert.equal(both.style, 'white');
  assert.equal(both.bar, false);
  assert.equal(layerTuneRequest('پایین‌تر و درشت‌ترش کن').move, 'down');
  assert.equal(layerTuneRequest('پایین‌تر و درشت‌ترش کن').size, 1.15);
});

test('a quality, crop or photo request is not a tune request', () => {
  assert.equal(layerTuneRequest('کیفیتش رو بالا ببر'), null, 'the photo is the subject, not the words');
  assert.equal(layerTuneRequest('وضوحش رو بیشتر کن'), null);
  assert.equal(layerTuneRequest('پس‌زمینه رو عوض کن'), null);
  assert.equal(layerTuneRequest('عکس رو بالاتر ببر'), null);
  assert.equal(layerTuneRequest('این عکس چیه؟'), null);
  assert.equal(layerTuneRequest('خوبی؟'), null);
  assert.equal(layerTuneRequest(''), null);
  assert.equal(layerTuneRequest('متن رو ' + 'ببر '.repeat(60)), null, 'not a short follow-up');
});

test('a hop walks the block up and down and stops at the frame edge', () => {
  const lay = textLayout(designSpec({ text: 'کمپ وایکینگ', width: 1024, height: 1280 }));
  assert.equal(lay.position, 'bottom');
  const middle = applyTune(lay, layerTuneRequest('بالاتر ببر'));
  assert.equal(middle.position, 'middle');
  assert.ok(middle.positions.middle < lay.positions.bottom);
  const top = applyTune(middle, layerTuneRequest('بالاتر ببر'));
  assert.equal(top.position, 'top');
  assert.ok(top.positions.top < middle.positions.middle);
  // already at the top: it says so instead of pretending it moved
  const edge = applyTune(top, layerTuneRequest('بالاتر ببر'));
  assert.equal(edge.stuck, true);
  assert.match(tuneCaption(top, edge, layerTuneRequest('بالاتر ببر'), {}), /لبهٔ کادر/);
  // and back down two anchors
  const back = applyTune(applyTune(top, layerTuneRequest('پایین‌تر ببر')), layerTuneRequest('پایین‌تر ببر'));
  assert.equal(back.position, 'bottom');
});

test('a nudge moves the block a little and never leaves the safe area', () => {
  const lay = textLayout(designSpec({ text: 'کمپ وایکینگ', width: 1024, height: 1280, position: 'middle' }));
  const up = applyTune(lay, layerTuneRequest('کمی بالاتر'));
  assert.equal(up.position, 'middle', 'a nudge keeps the anchor');
  assert.ok(up.positions.middle < lay.positions.middle, 'but the block really moved up');
  assert.ok(Math.abs(up.positions.middle - lay.positions.middle) > 1280 * 0.04, 'and visibly so');
  assert.ok(Math.abs(layerDesign(up).offset - -0.06) < 0.001, 'the nudge is remembered as an offset');
  // pushing past the edge is clamped, and the layer says it is stuck
  const far = applyTune(applyTune(applyTune(up, layerTuneRequest('کمی بالاتر')), layerTuneRequest('کمی بالاتر')), layerTuneRequest('کمی بالاتر'));
  assert.ok(far.positions.middle >= far.fontSize * 0.5, 'still inside the frame');
  assert.equal(far.stuck, true);
  assert.ok(far.positions.middle - far.blockHeight / 2 >= far.margin - 1, 'the block still sits inside the safe area');
  // a recalled layer keeps its nudge, so the next nudge goes further
  const back = applyTune(far, layerTuneRequest('کمی پایین‌تر'));
  assert.ok(back.positions.middle > far.positions.middle, 'down works again right away');
});

test('a colour, size or bar tune replays the same design with one change', () => {
  const lay = textLayout(designSpec({ text: 'کمپ وایکینگ', width: 1024, height: 1280, style: 'gold', position: 'top' }));
  const white = applyTune(lay, layerTuneRequest('سفیدش کن'));
  assert.equal(white.style, 'white');
  assert.equal(white.fill, PALETTES.white.fill);
  assert.equal(white.text, lay.text, 'the words are untouched');
  assert.equal(white.position, 'top', 'so is the place');
  assert.equal(white.bar, lay.bar);
  const noBar = applyTune(applyTune(lay, layerTuneRequest('نوار بذار پشتش')), layerTuneRequest('بدون نوار'));
  assert.equal(noBar.bar, false);
  assert.equal(displayList(noBar).some((o) => o.op === 'bar'), false, 'the strip is really gone');
  const bigger = applyTune(lay, layerTuneRequest('درشت‌ترش کن'));
  assert.ok(bigger.fontSize > lay.fontSize);
  assert.equal(bigger.style, 'gold', 'the rest of the design survives');
  assert.equal(applyTune(lay, {}), lay, 'a tune that changes nothing leaves the layer alone');
});

test('new words keep the place, the colour and the size of the layer already on the photo', () => {
  const lay = textLayout(designSpec({ text: 'کمپ وایکینگ', width: 1024, height: 1280, style: 'gold', bar: true, position: 'top' }));
  const swapped = applyTune(lay, layerTuneRequest('متن رو عوض کن به «تور آفرود دو روزه»'));
  assert.equal(swapped.text, 'تور آفرود دو روزه');
  assert.equal(swapped.style, 'gold');
  assert.equal(swapped.bar, true);
  assert.equal(swapped.position, 'top');
  assert.ok(swapped.positions.top > 0 && swapped.positions.top < 1280);
  assert.deepEqual(swapped.design, { text: 'تور آفرود دو روزه', position: 'top', style: 'gold', size: 1, bar: true, offset: 0, tone: 'mixed', weight: 600 });
});

test('the tune caption says what changed and what the layer is now', () => {
  const lay = textLayout(designSpec({ text: 'کمپ وایکینگ', width: 1024, height: 1280, style: 'gold' }));
  const tune = layerTuneRequest('بالاتر ببر');
  const moved = tuneCaption(lay, applyTune(lay, tune), tune, { composed: true });
  assert.match(moved, /🔧 رفت بالاتر\./);
  assert.match(moved, /«کمپ وایکینگ»/, 'the state of the layer is repeated');
  assert.match(moved, /وسط عکس/);
  assert.match(moved, /خروجی متن‌دار در همین پیام است/);
  const words = layerTuneRequest('متن رو عوض کن به «تخفیف ویژه»');
  assert.match(tuneCaption(lay, applyTune(lay, words), words, { composed: false }), /متن عوض شد به «تخفیف ویژه»/);
  const drop = layerTuneRequest('متن رو بردار');
  const gone = tuneCaption(lay, lay, drop, { composed: true });
  assert.match(gone, /متن از روی عکس برداشته شد/);
  assert.equal(/✍️/.test(gone), false, 'there is no layer left to describe');
  assert.match(tuneCaption(lay, lay, layerTuneRequest('متن رو بردار'), { composed: false }), /در اپ/);
});

test('the layer and the picture under it are remembered for an hour', async () => {
  const env = baseEnv();
  const layer = textLayout(designSpec({ text: 'تور آفرود', width: 1024, height: 1280, position: 'bottom' }));
  assert.equal(await rememberTextLayer(env, 'chat:1', { image: PNG, mime: 'image/png', layer }), true);
  const back = await recallTextLayer(env, 'chat:1');
  assert.equal(back.image, PNG);
  assert.equal(back.mime, 'image/png');
  assert.equal(back.layer.text, 'تور آفرود');
  assert.equal(back.layer.position, 'bottom');
  assert.ok(back.layer.lines.length >= 1);
  assert.ok(applyTune(back.layer, layerTuneRequest('کمی بالاتر')).positions.bottom < back.layer.positions.bottom,
    'a recalled layer can still be nudged');
  assert.equal(await rememberTextLayer(env, 'chat:1', { image: 'A'.repeat(4_600_000), mime: 'image/png', layer }), false,
    'a picture too big for KV is not remembered (and never half-remembered)');
  assert.equal(await rememberTextLayer({}, 'chat:1', { image: PNG, mime: 'image/png', layer }), false, 'no KV: no memory');
  assert.equal(await rememberTextLayer(env, 'chat:1', { image: PNG, mime: 'image/png', layer: null }), false);
  await env.MEMORY.put('edit:text:chat:2', 'not json at all');
  assert.equal(await recallTextLayer(env, 'chat:2'), null);
  assert.equal(await recallTextLayer(env, 'chat:9'), null);
  assert.equal(await forgetTextLayer(env, 'chat:1'), true);
  assert.equal(await recallTextLayer(env, 'chat:1'), null);
});

const textMsg = (text) => ({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, text } });
const albums = (calls) => calls.filter((c) => c.url.endsWith('/sendMediaGroup'));
const albumBytes = async (album, slot) => Buffer.from(await album.body.get(slot).arrayBuffer()).toString('base64');
const albumCaption = (album) => JSON.parse(album.body.get('media'))[0].caption;

test('Telegram: «بالاتر ببر» moves the words without the photo being sent again', async () => {
  const composed = pngB64(1024, 1280, 4);
  const { env, calls } = textMock();
  const shots = [];
  env.BROWSER = { async quickAction(action, opts) { shots.push(opts); return Uint8Array.from(Buffer.from(composed, 'base64')); } };
  await post(env, photoMsg('روی این عکس بنویس: کمپ وایکینگ'));
  assert.equal(shots.length, 1, 'the first layer was rendered server-side');
  assert.ok(shots[0].html.includes(PNG), 'over the untouched picture');
  await post(env, textMsg('بالاتر ببر'));
  assert.equal(shots.length, 2, 'the follow-up was rendered again');
  assert.ok(shots[1].html.includes(PNG), 'from the clean picture again - never from one with the words baked in');
  assert.equal(albums(calls).length, 2, 'before/after for both turns');
  const after = albums(calls)[1];
  assert.match(albumCaption(after), /رفت بالاتر/);
  assert.match(albumCaption(after), /وسط عکس/);
  assert.equal(await albumBytes(after, 'after'), composed);
  assert.equal(await albumBytes(after, 'before'), PNG, 'the base is the picture without words');
  assert.equal(calls.some((c) => c.url.includes(':generateContent')), false, 'no image model was called');
});

test('Telegram: without a compositor the tune reports the change and points at the app', async () => {
  const { env, calls } = textMock();
  await post(env, photoMsg('روی این عکس بنویس: کمپ وایکینگ'));
  const before = calls.length;
  await post(env, textMsg('سفیدش کن و بدون نوار'));
  const fresh = calls.slice(before);
  assert.equal(albums(fresh).length, 0, 'no album when nothing can be drawn');
  const msg = fresh.find((c) => c.url.endsWith('/sendMessage')).body.text;
  assert.match(msg, /رنگش سفید شد/);
  assert.match(msg, /نوار برداشته شد/);
  assert.match(msg, /در اپ/);
  // a second tune still works: the new state was remembered
  const before2 = calls.length;
  await post(env, textMsg('بالاتر ببر'));
  assert.match(calls.slice(before2).find((c) => c.url.endsWith('/sendMessage')).body.text, /رفت بالاتر/);
});

test('Telegram: «متن رو بردار» puts the picture without words back', async () => {
  const { env, calls } = textMock();
  await post(env, photoMsg('روی این عکس بنویس: کمپ وایکینگ'));
  const before = calls.length;
  await post(env, textMsg('متن رو بردار'));
  const fresh = calls.slice(before);
  const one = fresh.find((c) => c.url.endsWith('/sendPhoto'));
  assert.ok(one, 'a single picture comes back, not a before/after pair of the same shot');
  assert.equal(Buffer.from(await one.body.get('photo').arrayBuffer()).toString('base64'), PNG);
  assert.match(one.body.get('caption'), /متن از روی عکس برداشته شد/);
  assert.match(one.body.get('caption'), /عکس بدون متن در همین پیام است/, 'the picture really is in the message');
  // and the layer is gone: the next tune has nothing to move
  const next = calls.length;
  await post(env, textMsg('بالاتر ببر'));
  assert.equal(albums(calls.slice(next)).length, 0);
  assert.equal(calls.slice(next).some((c) => /رفت بالاتر/.test(String((c.body && c.body.text) || ''))), false);
});

test('Telegram: a tune never lands on a picture that was edited again', async () => {
  const { env, calls } = textMock({ brief: JSON.stringify({ subject: 'a jeep', subject_type: 'scene', must_keep: ['the jeep'],
    problems: ['harsh shadows'], lighting: 'harsh noon', color: 'cold', aspect: 'keep', region: 'bottom',
    change_scale: 'medium', has_text: false, region_tone: 'dark', risks: [] }) });
  await post(env, photoMsg('این عکس رو ریتوش کن'));
  assert.equal(albums(calls).length >= 1, true, 'the edit was delivered');
  const before = calls.length;
  await post(env, textMsg('بالاتر ببر'));
  assert.equal(albums(calls.slice(before)).length, 0, 'no stale layer is replayed over the new picture');
  assert.equal(calls.slice(before).some((c) => /رفت بالاتر/.test(String((c.body && c.body.text) || ''))), false);
});

test('web app: a photo-less tune moves the words and hands back the clean picture', async () => {
  const { env, calls } = textMock();
  await post(env, photoMsg('روی این عکس بنویس: کمپ وایکینگ'));
  const before = calls.filter((c) => c.url.includes(':generateContent')).length;
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'بالاتر ببر' }),
  }), env, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reply, /رفت بالاتر/);
  assert.match(body.reply, /وسط عکس/);
  assert.ok(body.textLayer, 'the canvas gets the moved layer');
  assert.equal(body.textLayer.position, 'middle');
  assert.deepEqual(body.textLayer.lines, ['کمپ وایکینگ']);
  assert.equal(body.textLayer.style, undefined, 'geometry and style, not server-only fields');
  assert.equal(body.image, `data:image/png;base64,${PNG}`, 'the picture itself is untouched');
  assert.equal(calls.filter((c) => c.url.includes(':generateContent')).length, before, 'no model was called');
  // a photo sent along with the words changes nothing about which picture the layer sits on - and says so
  const withPhoto = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'سفیدش کن', image: `data:image/png;base64,${PNG}` }),
  }), env, { waitUntil: () => {} });
  const second = await withPhoto.json();
  assert.match(second.reply, /رنگش سفید شد/);
  assert.match(second.reply, /نیازی به فرستادن دوبارهٔ عکس نبود/);
  assert.equal(second.image, `data:image/png;base64,${PNG}`);
});

test('web app: a tune without a remembered layer says so instead of guessing', async () => {
  const { env, calls } = textMock();
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'بالاتر ببر' }),
  }), env, { waitUntil: () => {} });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /لایهٔ متنی فعالی ندارم/);
  assert.equal(calls.filter((c) => c.url.includes(':generateContent')).length, 0);
});

test('web app: the canvas is handed the clean picture, never one with the words already drawn', async () => {
  const composed = pngB64(1024, 1280, 8);
  const { env } = textMock();
  env.BROWSER = { async quickAction() { return Uint8Array.from(Buffer.from(composed, 'base64')); } };
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'روی این عکس بنویس: کمپ وایکینگ', image: `data:image/png;base64,${PNG}` }),
  }), env, { waitUntil: () => {} });
  const body = await res.json();
  assert.match(body.reply, /خروجی متن‌دار در همین پیام است/, 'the server really did compose the layer');
  assert.equal(body.image, `data:image/png;base64,${PNG}`, 'and the app still gets the clean one to draw on');
  assert.ok(body.textLayer);
});

test('the app page says the layer can be moved by a message too', async () => {
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/app'), baseEnv(), {});
  const html = await res.text();
  assert.match(html, /بالاتر ببر/);
  assert.match(html, /کمی پایین‌تر/);
  assert.match(html, /متن رو بردار/);
  assert.match(html, /متن را بگذار/, 'the canvas tools are still there');
});

async function appHeaders(env) {
  const { appKey } = await import('./security.mjs');
  return { authorization: `Bearer ${await appKey(env)}` };
}

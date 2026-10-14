// Professional photo editing engine: detection, brief, forecast of strength, both prompt dialects,
// execution, rubric review, best-of-N selection, variations, iteration memory, delivery, and the
// real Telegram / web turns driven through the Worker with mocked network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editRequest, editInstruction, cfPrompt, photoBrief, planStrength, geminiEdit, geminiImageList, cfEdit,
  runEdit, reviewEdit, scoreParts, rubricWeights, polishPhoto, editCaption, variationsCaption,
  handlePhotoEdit, continueEdit, followUpRequest, rememberEdit, recallEdit, imageInfo, frameDrift, faDigits,
  band, EDIT_OPS, CF_EDIT_MODELS, TEXT_ASK, QUALITY_BAR, MIN_DELIVER, LADDER, OP_STRENGTH,
  pickRequest, rememberVariations, recallVariations, refineTake,
} from './photo-edit.mjs';
import { upscaleImage, worthUpscaling, UPSCALE_TARGET } from './upscale.mjs';
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

// Real PNG bytes (valid IHDR, big IDAT) so the engine's pixel verification gets honest input.
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
const PNG_160x120 = pngB64(160, 120, 7);
// A photo with the dimensions of a real phone picture (the bytes stay small, the header is honest).
const PNG_BIG = pngB64(2400, 1600, 11);
const PNG_1024 = pngB64(1024, 1024, 9);
// A minimal JPEG whose APP0 segment length matches its payload, then a SOF0 frame header.
const jpegBytes = (w, h) => [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0),
  0xff, 0xfe, 0x04, 0xda, ...new Array(1240).fill(0), // a big comment segment, like real camera bytes
  0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, ...new Array(20).fill(1)];
const jpegB64 = (w, h) => toB64(jpegBytes(w, h));
const EDIT_PNG = PNG_1024;

// ---------------------------------------------------------------------------------------
// 1. Reading the request
// ---------------------------------------------------------------------------------------

test('edit requests are recognised in Persian and English, generation is not', () => {
  const yes = [
    ['این عکس رو ریتوش کن', 'retouch'],
    ['تصویر رو ادیت کن و پس‌زمینه رو عوض کن', 'background'],
    ['عکس رو واضح‌تر کن', 'upscale'],
    ['کیفیت عکس رو ببر بالا', 'upscale'],
    ['این عکس قدیمی رو بازسازی کن', 'restore'],
    ['نور عکس رو بهتر کن', 'relight'],
    ['رنگش رو سینمایی کن', 'color'],
    ['این ظرف رو مثل عکس محصول استودیویی دربیار', 'product'],
    ['این یارو رو از عکس حذف کن', 'erase'],
    ['ماشین رو با موتور عوض کن', 'swap'],
    ['/edit make it warmer', 'relight'],
    ['can you retouch this photo please', 'retouch'],
    ['edit my picture: remove the bin', 'erase'],
    ['make this photo look like a painting', 'restyle'],
    ['روی این عکس متن بذار: وایکینگ آفرود', 'text'],
    ['فونت قشنگ‌تری روی عکس بذار', 'text'],
  ];
  for (const [text, op] of yes) {
    const r = editRequest(text);
    assert.ok(r, `not detected: ${text}`);
    assert.equal(r.op, op, `wrong op for «${text}»: ${r.op}`);
    assert.ok(r.strength > 0 && r.strength <= 0.7);
  }
  const no = ['عکس بساز: کمپ کنار دریاچه', 'این عکس چیه؟ توضیح بده', 'سلام', 'generate an image of a jeep',
    'describe this picture', 'چی توشه', '', 'متن این عکس چیه؟', 'چه متنی روی این عکس نوشته؟'];
  for (const text of no) assert.equal(editRequest(text), null, `false positive: ${text}`);
});

test('the request carries region, aspect, variations and iteration deltas', () => {
  const corner = editRequest('عکس رو در گوشهٔ راست تصویر تیره‌تر کن');
  assert.equal(corner.region.length > 0, true);
  const story = editRequest('این عکس رو برای استوری ۹:۱۶ آماده کن');
  assert.equal(story.aspect, '9:16');
  assert.equal(story.op, 'expand');
  assert.equal(editRequest('سه نسخهٔ مختلف از این عکس بده').variants, true);
  assert.equal(editRequest('چند نسخه بده: عکس رو سینمایی کن').variants, true);
  assert.equal(editRequest('این عکس رو ملایم‌تر ریتوش کن').delta, -1);
  assert.equal(editRequest('این عکس رو قوی‌تر اصلاح کن').delta, 1);
  // «واضح‌تر» is upscale, not an iteration delta
  assert.equal(editRequest('عکس رو واضح‌تر کن').delta, 0);
  assert.equal(editRequest('عکس رو واضح‌تر کن').op, 'upscale');
});

test('Viking post/story edits carry the right aspect and the reference-specific guardrails', () => {
  const post = editRequest('این عکس رو شبیه پست وایکینگ آماده کن');
  assert.equal(post.aspect, '4:5');
  const story = editRequest('این عکس رو مثل استوری وایکینگ آماده کن');
  assert.equal(story.aspect, '9:16');
  const reference = editRequest('این عکس رو شبیه نمونه‌ها کن');
  assert.equal(reference.op, 'restyle');
  assert.match(editInstruction(reference.op, reference.instruction), /Viking Offroad edit/);

  const instruction = editInstruction(post.op, post.instruction, null, { aspect: post.aspect });
  assert.match(instruction, /Viking Offroad edit/);
  assert.match(instruction, /Portrait 4:5 carousel/);
  assert.match(instruction, /Preserve people\/identity/);
  assert.match(instruction, /No generated text/);
  const imagePrompt = cfPrompt(post.op, post.instruction, null, { aspect: post.aspect });
  assert.match(imagePrompt, /final frame aspect 4:5/);
  assert.match(imagePrompt, /No generated text, numbers, logos, ribbons, cards, badges or watermarks/);

  const storyPrompt = editInstruction(story.op, story.instruction, null, { aspect: story.aspect });
  assert.match(storyPrompt, /Portrait 9:16 Story/);
  assert.match(cfPrompt(story.op, story.instruction, null, { aspect: story.aspect }), /final frame aspect 9:16/);
});

test('a compound request keeps the retouch as the headline and carries the other recipes', () => {
  const both = editRequest('این عکس رو ریتوش کن و نور رو هم بهتر کن');
  assert.equal(both.op, 'retouch');
  assert.deepEqual(both.also, ['relight']);
  const prompt = editInstruction(both.op, both.instruction, null, { also: both.also });
  assert.match(prompt, /The same edit must also do: relight the scene/);
  assert.match(cfPrompt(both.op, both.instruction, null, { also: both.also }), /warm cinematic light/);
  // a standalone relight request stays a relight
  assert.equal(editRequest('نور اتاق کمه، عکس رو روشن‌تر کن').also.length, 0);
  assert.equal(editRequest('نور اتاق کمه، عکس رو روشن‌تر کن').op, 'relight');
});

test('a follow-up tweak is recognised without the photo being resent', () => {
  assert.equal(followUpRequest('کمی ملایم‌تر').delta, -1);
  assert.equal(followUpRequest('ملایم‌ترش کن').delta, -1);
  assert.equal(followUpRequest('قوی‌ترش کن').delta, 1);
  assert.equal(followUpRequest('چند نسخه بده').variants, true);
  assert.equal(followUpRequest('سلام خوبی'), null);
  assert.equal(followUpRequest('این کمتر از قبلیه'), null);
  assert.equal(followUpRequest('x'.repeat(200)), null);
});

test('the instruction carries the request, the brief, the region lock and the text ban', () => {
  const out = editInstruction('background', 'پس‌زمینه رو برف کن',
    { problems: ['overexposed sky'], lighting: 'flat', mustKeep: ['the label text'] }, { region: 'گوشهٔ راست', aspect: '9:16' });
  assert.match(out, /پس‌زمینه رو برف کن/);
  assert.match(out, /Fix these specific problems: overexposed sky/);
  assert.match(out, /Lighting: flat/);
  assert.match(out, /Final frame: 9:16/);
  assert.match(out, /Change ONLY this area: گوشهٔ راست/);
  assert.match(out, /Everything outside that area must stay pixel-identical/);
  assert.match(out, /the label text/);
  assert.match(out, /do not add any text, letters, numbers, logos/);
  assert.match(out, /hair, fur, thin details/); // background recipe specifics
});

test('the img2img dialect describes the RESULT image and spells out the negatives', () => {
  const out = cfPrompt('product', 'ظرف سفالی', { subject: 'a clay bowl on a table' });
  assert.match(out, /e-commerce/);
  assert.match(out, /a clay bowl on a table/);
  assert.match(out, /softbox light/);
  assert.match(out, /same composition, same framing/);
  assert.match(out, /no text, no letters, no watermark/);
  assert.ok(out.length <= 1200);
});

test('a text-only request does no image edit at all: the caller sets the font layer', async () => {
  assert.match('متن بذار روی عکس', TEXT_ASK);
  assert.equal(TEXT_ASK.test('رنگش رو متناسب کن'), false, 'متناسب must not look like متن');
  const calls = geminiFetch();
  const out = await handlePhotoEdit(baseEnv(), null, PNG_160x120, 'image/png', 'روی این عکس متن بذار: وایکینگ آفرود');
  assert.equal(out.kind, 'text-only');
  assert.equal(out.image, null, 'no model ever draws the text');
  assert.equal(calls.length, 0, 'not a single model call for words on a photo');
});

test('a mixed request edits the photo and hands the words to the font layer', async () => {
  const env = baseEnv();
  const calls = geminiFetch({ answers: [{ parts: [{ text: 'no brief' }] }, { parts: [{ inlineData: { mimeType: 'image/png', data: EDIT_PNG } }] }] });
  const out = await handlePhotoEdit(env, null, PNG_160x120, 'image/png', 'این عکس رو ریتوش کن و رویش بنویس وایکینگ آفرود');
  assert.equal(out.op, 'retouch');
  assert.equal(out.image, EDIT_PNG);
  assert.match(out.caption, /ویرایش انجام شد/);
  assert.match(out.caption, /متن با فونت واقعی روی عکس نوشته می‌شود/);
  const editCall = calls.filter((c) => c.url.includes(':generateContent')).at(-1);
  assert.match(editCall.body.contents[0].parts[1].text, /do not add any text/, 'the model is still told not to draw text');
});

// ---------------------------------------------------------------------------------------
// 2. Pixels we can prove
// ---------------------------------------------------------------------------------------

test('image dimensions are decoded from JPEG, PNG and WebP without any dependency', async () => {
  assert.deepEqual(imageInfo(Uint8Array.from(jpegBytes(800, 600))), { mime: 'image/jpeg', width: 800, height: 600 });
  assert.deepEqual(imageInfo(Buffer.from(PNG_160x120, 'base64')), { mime: 'image/png', width: 160, height: 120 });
  const vp8 = new Uint8Array(40); vp8.set([0x52, 0x49, 0x46, 0x46]); vp8.set([0x57, 0x45, 0x42, 0x50], 8);
  vp8.set([0x56, 0x50, 0x38, 0x20], 12); vp8.set([0x40, 0x01], 26); vp8.set([0x2c, 0x01], 28);
  assert.deepEqual(imageInfo(vp8), { mime: 'image/webp', width: 320, height: 300 });
  assert.equal(imageInfo(new Uint8Array([1, 2, 3])), null);
  assert.equal(imageInfo(Buffer.from('definitely not an image, just text padding here', 'utf8')), null);
});

test('frame drift is measured, and digits are printed in Persian', async () => {
  assert.equal(frameDrift({ width: 1000, height: 1000 }, { width: 1000, height: 1000 }), 0);
  assert.ok(frameDrift({ width: 1000, height: 1000 }, { width: 1000, height: 500 }) > 90);
  assert.equal(frameDrift(null, { width: 10, height: 10 }), 0);
  assert.equal(faDigits('1024x768 (91/100)'), '۱۰۲۴x۷۶۸ (۹۱/۱۰۰)');
  // the engine, the upscaler and the worker all share one decoder: photo-edit re-exports this module
  const shared = await import('./image-bytes.mjs');
  assert.equal(shared.imageInfo(jpegBytes(320, 240) && Uint8Array.from(jpegBytes(320, 240))).width, 320);
  assert.equal(shared.faDigits(7), '۷');
  assert.equal(shared.EDIT_MAX_BYTES, 8 * 1024 * 1024);
  assert.equal(shared.mimeOf(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), 'image/png');
  assert.equal(typeof shared.bytesToBase64(new Uint8Array([1, 2, 3])), 'string');
});

// ---------------------------------------------------------------------------------------
// 3. The brief and the plan
// ---------------------------------------------------------------------------------------

test('the retoucher brief is parsed from a fenced JSON answer', async () => {
  const ask = async () => '```json\n{"subject":"a jeep at a lake","subject_type":"scene","must_keep":["the jeep"],' +
    '"problems":["harsh shadows"],"lighting":"harsh noon","color":"cold","aspect":"4:3","region":"right side",' +
    '"change_scale":"large","has_text":true,"risks":["over-sharpen"]}\n```';
  const brief = await photoBrief({}, ask, PNG_160x120, 'image/png', 'بهترش کن', 'relight');
  assert.equal(brief.subject, 'a jeep at a lake');
  assert.equal(brief.subjectType, 'scene');
  assert.deepEqual(brief.problems, ['harsh shadows']);
  assert.equal(brief.changeScale, 0.85);
  assert.equal(brief.hasText, true);
  assert.equal(brief.derived, true);
});

test('a broken or unavailable vision model degrades to the recipe, never to an exception', async () => {
  const noise = await photoBrief({}, async () => 'I cannot help with that.', PNG_160x120, 'image/png', 'ریتوش', 'retouch');
  assert.equal(noise.derived, false);
  assert.deepEqual(noise.problems, []);
  const boom = await photoBrief({}, async () => { throw new Error('quota'); }, PNG_160x120, 'image/png', 'ریتوش');
  assert.equal(boom.derived, false);
  assert.equal((await photoBrief({}, null, PNG_160x120, 'image/png', 'ریتوش')).derived, false);
});

test('strength follows the operation, the photo and the iteration delta', () => {
  assert.ok(planStrength('upscale') < planStrength('retouch'), 'upscale must stay closer to the original');
  assert.ok(planStrength('restyle') > planStrength('upscale'));
  assert.ok(planStrength('retouch', { changeScale: 0.9 }) > planStrength('retouch', { changeScale: 0.2 }));
  assert.ok(planStrength('retouch', { delta: -1 }) < planStrength('retouch', { delta: 0 }));
  assert.ok(planStrength('retouch', { delta: 1 }) > planStrength('retouch', { delta: 0 }));
  assert.ok(planStrength('restyle', { delta: 1, changeScale: 1 }) <= 0.8, 'strength stays clamped');
  assert.equal(planStrength('unknown-op') > 0, true);
  assert.equal(OP_STRENGTH.upscale < OP_STRENGTH.restyle, true);
});

// ---------------------------------------------------------------------------------------
// 4. Execution: Gemini and Workers AI
// ---------------------------------------------------------------------------------------

function geminiFetch({ models = null, answers = [] } = {}) {
  const calls = [];
  let i = 0;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init ? init.body : null;
    calls.push({ url: u, body, headers: init && init.headers });
    if (u.includes('/models?')) {
      return jsonRes({ models: models || [
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] },
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.0-pro-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/veo-3-image', supportedGenerationMethods: ['predictLongRunning'] },
      ] });
    }
    const a = answers[Math.min(i++, answers.length - 1)] || {};
    if (a.status && a.status !== 200) return jsonRes({ error: { message: 'nope' } }, a.status);
    return jsonRes({ candidates: [{ content: { parts: a.parts || [{ text: 'done' }] } }] });
  };
  return calls;
}

test('image-capable Gemini models are listed newest-first, cached, with the last good one first', async () => {
  const env = baseEnv();
  const calls = geminiFetch();
  const list = await geminiImageList(env);
  assert.deepEqual(list, ['gemini-3.0-pro-image', 'gemini-2.5-flash-image']);
  assert.equal(calls.length, 1);
  assert.notEqual(await env.MEMORY.get('edit-image-models', 'json'), null);
  assert.deepEqual(await geminiImageList(env), list); // served from KV now
  assert.equal(calls.length, 1);
  await env.MEMORY.put('edit-model', 'gemini-2.5-flash-image');
  assert.deepEqual(await geminiImageList(env), ['gemini-2.5-flash-image', 'gemini-3.0-pro-image']);
});

test('a Gemini edit returns verified pixels and remembers the model that worked', async () => {
  const env = baseEnv();
  const calls = geminiFetch({ answers: [{ parts: [{ inlineData: { mimeType: 'image/png', data: EDIT_PNG } }] }] });
  const out = await geminiEdit(env, PNG_160x120, 'image/png', 'retouch it');
  assert.equal(out.image, EDIT_PNG);
  assert.deepEqual(out.info, { mime: 'image/png', width: 1024, height: 1024 });
  assert.equal(out.provider, 'gemini');
  assert.equal(out.model, 'Gemini gemini-3.0-pro-image');
  const sent = calls.find((c) => c.url.includes(':generateContent'));
  assert.equal(sent.body.contents[0].parts[0].inlineData.data, PNG_160x120);
  assert.equal(sent.body.contents[0].parts[1].text, 'retouch it');
  assert.deepEqual(sent.body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.equal(await env.MEMORY.get('edit-model'), 'gemini-3.0-pro-image');
});

test('garbage or tiny "images" are refused as unusable, not delivered', async () => {
  const env = baseEnv();
  geminiFetch({ answers: [{ parts: [{ inlineData: { mimeType: 'image/png', data: b64('not an image at all, just text') } }] }] });
  await assert.rejects(() => geminiEdit(env, PNG_160x120, 'image/png', 'x'), /unusable pixels|هیچ مدل تصویر جمینی/);
  const env2 = baseEnv();
  geminiFetch({ answers: [{ parts: [{ text: 'I cannot edit that' }] }] });
  await assert.rejects(() => geminiEdit(env2, PNG_160x120, 'image/png', 'x'), /هیچ مدل تصویر جمینی/);
});

test('a refusing Gemini model hands over to the next one', async () => {
  const env = baseEnv();
  geminiFetch({ answers: [{ parts: [{ text: 'I cannot edit that' }] }, { parts: [{ inlineData: { mimeType: 'image/png', data: EDIT_PNG } }] }] });
  const out = await geminiEdit(env, PNG_160x120, 'image/png', 'x');
  assert.equal(out.model, 'Gemini gemini-2.5-flash-image');
});

test('Workers AI img2img accepts base64, streams and raw bytes, and reports which model answered', async () => {
  const mk = (run) => ({ AI: { calls: [], run(model, input) { this.calls.push({ model, input }); return run(model, input); } } });
  const asB64 = mk(() => ({ image: EDIT_PNG }));
  assert.equal((await cfEdit(asB64, new Uint8Array([1, 2, 3]), 'p', 0.3)).model, CF_EDIT_MODELS[0].name);
  assert.equal(asB64.AI.calls[0].input.strength, 0.3);
  assert.equal(Array.isArray(asB64.AI.calls[0].input.image), true);
  const asStream = mk(() => new Response(Buffer.from(PNG_160x120, 'base64')).body);
  assert.equal((await cfEdit(asStream, new Uint8Array([1]), 'p')).mime, 'image/png');
  const asBytes = mk(() => Uint8Array.from(jpegBytes(800, 600)));
  assert.equal((await cfEdit(asBytes, new Uint8Array([1]), 'p')).mime, 'image/jpeg');
  assert.equal((await cfEdit(asBytes, new Uint8Array([1]), 'p')).info.width, 800);
});

test('unsupported advanced parameters degrade instead of failing the edit', async () => {
  const env = { AI: { calls: [], async run(model, input) {
    this.calls.push(input);
    if (input.num_steps || input.negative_prompt) throw new Error('400 Bad Request: unknown parameter num_steps');
    return { image: EDIT_PNG };
  } } };
  const out = await cfEdit(env, new Uint8Array([1, 2]), 'prompt', 0.4);
  assert.equal(out.model, CF_EDIT_MODELS[0].name);
  assert.equal(env.AI.calls.length, 2, 'first attempt with extras, second plain');
  assert.equal(env.AI.calls[1].num_steps, undefined);
  assert.equal(env.AI.calls[1].prompt, 'prompt');
});

test('Workers AI walks the model list and an unusable answer is an error, not a claim', async () => {
  const env = { AI: { calls: [], run(model) { this.calls.push(model); if (model.includes('schnell')) return { image: b64('AAAA') };
    return new Uint8Array(0); } } };
  await assert.rejects(() => cfEdit(env, new Uint8Array([1]), 'p'), /Workers AI img2img/);
  assert.equal(env.AI.calls.length, CF_EDIT_MODELS.length, 'every model is tried once');
});

test('runEdit prefers Gemini, falls back to Workers AI, and never lies about the provider', async () => {
  const ok = { parts: [{ inlineData: { mimeType: 'image/png', data: EDIT_PNG } }] };
  const env = { ...baseEnv(), AI: { run: async () => ({ image: EDIT_PNG }) } };
  geminiFetch({ answers: [{ status: 500 }] });
  const out = await runEdit(env, PNG_160x120, 'image/png', { gemini: 'g-prompt', cf: 'cf-prompt', strength: 0.4 });
  assert.equal(out.provider, 'workers-ai');
  const env2 = { AI: { run: async () => ({ image: EDIT_PNG }) }, MEMORY: kv() };
  const out2 = await runEdit(env2, PNG_160x120, 'image/png', { gemini: 'g', cf: 'cf', strength: 0.4 });
  assert.equal(out2.provider, 'workers-ai');
  const env3 = { ...baseEnv(), AI: { run: async (m, i) => { assert.equal(i.prompt, 'cf-prompt'); return { image: EDIT_PNG }; } } };
  geminiFetch({ answers: [{}] }); // Gemini answers text-only -> unusable
  assert.equal((await runEdit(env3, PNG_160x120, 'image/png', { gemini: 'g-prompt', cf: 'cf-prompt', strength: 0.4 })).provider, 'workers-ai');
  geminiFetch({ answers: [ok] });
  assert.equal((await runEdit(baseEnv(), PNG_160x120, 'image/png', { gemini: 'g', cf: 'c', strength: 0.4 })).provider, 'gemini');
  await assert.rejects(() => runEdit({}, PNG_160x120, 'image/png', { gemini: 'g', cf: 'c', strength: 0.4 }), /کلید جمینی یا Workers AI/);
});

// ---------------------------------------------------------------------------------------
// 5. The rubric
// ---------------------------------------------------------------------------------------

test('the rubric renormalises: identity is only counted when a person is in the frame', () => {
  const person = rubricWeights('person');
  assert.equal(Object.keys(person).length, 5);
  assert.ok(Math.abs(Object.values(person).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const scene = rubricWeights('scene');
  assert.equal(scene.identity, undefined);
  assert.ok(Object.values(scene).reduce((a, b) => a + b, 0) > 0.999);
  assert.equal(scoreParts({ instruction: 100, identity: 100, artifacts: 100, light: 100, frame: 100 }, 'person'), 100);
  assert.equal(scoreParts({ instruction: 0, identity: 0, artifacts: 0, light: 0, frame: 0 }, 'person'), 0);
  // A perfect scene edit without identity data still scores 100.
  assert.equal(scoreParts({ instruction: 90, artifacts: 90, light: 90, frame: 90 }, 'scene'), 90);
  assert.equal(band(95), 'عالی');
  assert.equal(band(QUALITY_BAR), 'حرفه‌ای');
  assert.equal(band(MIN_DELIVER), 'قابل‌قبول');
});

test('reviewEdit scores both images, gates identity, and never throws', async () => {
  const env = baseEnv();
  const good = async () => '{"instruction":95,"identity":97,"artifacts":90,"light":92,"frame":88,"keep":true,"issues":[],"fix":""}';
  const out = await reviewEdit(env, good, PNG_160x120, 'image/png', EDIT_PNG, 'image/png', 'ریتوش', { subjectType: 'person' });
  assert.equal(out.derived, true);
  assert.ok(out.score > 90 && out.score <= 100);
  assert.equal(out.keep, true);
  assert.equal(out.identity, 97);
  const creepy = async () => '{"instruction":95,"identity":20,"artifacts":95,"light":95,"frame":95,"keep":true,"issues":["different face"],"fix":"keep the face"}';
  const bad = await reviewEdit(env, creepy, PNG_160x120, 'image/png', EDIT_PNG, 'image/png', 'ریتوش', { subjectType: 'person' });
  assert.equal(bad.keep, false, 'identity below the floor must reject even a perfect score elsewhere');
  const parsed = await reviewEdit(env, async () => 'sorry, no JSON', PNG_160x120, 'image/png', EDIT_PNG, 'image/png');
  assert.equal(parsed.keep, true);
  assert.equal(parsed.derived, false);
  const boom = await reviewEdit(env, async () => { throw new Error('down'); }, PNG_160x120, 'image/png', EDIT_PNG, 'image/png');
  assert.equal(boom.derived, false);
});

// ---------------------------------------------------------------------------------------
// 6. The pipeline: best-of-N, retry, variations, honest reporting
// ---------------------------------------------------------------------------------------

// A full studio mock. The brief and the reviews come through the multimodal brain (`ask`); the
// pixels come from the provider through fetch. Returns { ask, calls, edits }.
function studio({ brief = 'no json', scores = [], edits = null } = {}) {
  const calls = [];
  const prompts = [];
  let review = 0, edit = 0;
  const answers = scores.length ? scores : [{ instruction: 95, identity: 95, artifacts: 95, light: 95, frame: 95, keep: true }];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init ? init.body : null;
    calls.push({ url: u, body });
    if (u.includes('/models?')) return jsonRes({ models: [{ name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] });
    if (u.includes(':generateContent')) {
      prompts.push(body.contents[0].parts[1].text);
      const mine = edit++;
      return jsonRes({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: edits ? edits[mine] : EDIT_PNG } }] } }] });
    }
    return jsonRes({ ok: true });
  };
  const ask = async (env, contents, system) => {
    const text = contents.at(-1).parts.filter((p) => p.text).map((p) => p.text).join(' ');
    if (/retoucher request/i.test(text)) return brief;
    if (/Review the edit/i.test(text)) return JSON.stringify(answers[Math.min(review++, answers.length - 1)]);
    return '{}';
  };
  return { ask, calls, prompts };
}
const briefJson = (o = {}) => JSON.stringify({ subject: 'a jeep at a lake', subject_type: 'scene', must_keep: ['the jeep'],
  problems: ['harsh shadows'], lighting: 'harsh noon', color: 'cold', aspect: 'keep', region: '', change_scale: 'medium',
  has_text: false, risks: [], ...o });

test('one good version is enough: the studio stops as soon as the bar is cleared', async () => {
  const env = baseEnv();
  const { ask, calls } = studio({ brief: briefJson() });
  const out = await polishPhoto(env, ask, PNG_160x120, 'image/png', 'این عکس رو ریتوش کن', { candidates: 3 });
  assert.equal(out.kind, 'edited');
  assert.equal(out.attempted.length, 1, 'no extra quota spent once the bar is met');
  assert.equal(out.score >= QUALITY_BAR, true);
  assert.equal(out.belowBar, false);
  assert.equal(out.info.width, 1024);
  assert.equal(calls.filter((c) => c.url.includes(':generateContent')).length, 1, 'one edit, brief+review through ask');
  assert.equal(out.repaired, false);
});

test('a rejected first version is replaced by a better one and reported as repaired', async () => {
  const env = baseEnv();
  const { ask, prompts } = studio({ brief: briefJson({ subject_type: 'person' }),
    scores: [{ instruction: 40, identity: 35, artifacts: 60, light: 70, frame: 70, keep: false, issues: ['plastic skin'], fix: 'keep the pores and the original face' },
      { instruction: 92, identity: 93, artifacts: 90, light: 90, frame: 90, keep: true, issues: [], fix: '' }] });
  const out = await polishPhoto(env, ask, PNG_160x120, 'image/png', 'این عکس رو ریتوش کن', { candidates: 2 });
  assert.equal(out.kind, 'repaired');
  assert.equal(out.attempted.length, 2);
  assert.ok(out.score > 85);
  assert.match(prompts[1], /Extra correction from review: keep the pores and the original face/);
  assert.match(prompts[0], /natural skin texture/);
  assert.match(editCaption(out), /نسخهٔ اول از بازبینی رد شد/);
  assert.match(editCaption(out), /بازبینی ریتوشِر/);
});

test('when no version clears the bar the best one is delivered with an honest warning', async () => {
  const env = baseEnv();
  const { ask } = studio({ brief: briefJson(), scores: [{ instruction: 60, artifacts: 50, light: 60, frame: 70, keep: true, issues: ['still soft'], fix: 'sharpen the subject' }] });
  const out = await polishPhoto(env, ask, PNG_160x120, 'image/png', 'عکس رو واضح‌تر کن');
  assert.equal(out.belowBar, true);
  assert.match(editCaption(out), /هنوز حرف‌اول را نزده/);
  assert.equal(out.score < QUALITY_BAR, true);
});

test('variations produce a studio set ranked by score, with a recommendation', async () => {
  const env = baseEnv();
  const { ask } = studio({ brief: briefJson(), scores: [
    { instruction: 70, artifacts: 80, light: 80, frame: 85, keep: true, issues: [], fix: '' },
    { instruction: 90, artifacts: 92, light: 90, frame: 90, keep: true, issues: [], fix: '' },
    { instruction: 80, artifacts: 88, light: 88, frame: 88, keep: true, issues: [], fix: '' },
  ] });
  const out = await handlePhotoEdit(env, ask, PNG_160x120, 'image/png', 'چند نسخه بده: این عکس رو سینمایی کن');
  assert.equal(out.kind, 'variations');
  assert.equal(out.variations.length, 3);
  assert.deepEqual(out.variations.map((v) => v.rank), [1, 2, 3]);
  assert.ok(out.variations[0].review.score >= out.variations[1].review.score);
  assert.equal(out.variations[0].variantLabel, LADDER[1].fa, 'the balanced take won this round');
  const caption = variationsCaption(out);
  assert.match(caption, /۳ نسخهٔ حرفه‌ای آماده شد/);
  assert.match(caption, /پیشنهاد من: نسخهٔ ۱/);
  assert.match(caption, /دست‌نخورده ماند: the jeep/);
  assert.match(await out.caption, /محافظه‌کارانه/);
});

test('the candidate ladder changes strength: safer first, bolder later', async () => {
  const env = baseEnv();
  const { ask } = studio({ brief: briefJson(), scores: [
    { instruction: 60, artifacts: 60, light: 60, frame: 60, keep: true, issues: [], fix: '' },
    { instruction: 62, artifacts: 62, light: 62, frame: 62, keep: true, issues: [], fix: '' },
    { instruction: 64, artifacts: 64, light: 64, frame: 64, keep: true, issues: [], fix: '' },
  ] });
  const out = await polishPhoto(env, ask, PNG_160x120, 'image/png', 'این عکس رو ملایم‌تر ریتوش کن', { candidates: 3 });
  assert.equal(out.attempted.length, 3, 'a below-bar photo makes the studio take all three');
  assert.deepEqual(out.attempted.map((a) => a.variant), ['balanced', 'bold', 'safe'], 'a single request starts balanced, then bold');
  assert.ok(out.attempted[0].strength < out.attempted[1].strength, 'later takes travel further');
  assert.ok(out.attempted[1].strength / out.attempted[0].strength > 1.3);
  assert.equal(out.kind, 'repaired', 'the best of the takes was not the first one');
});

test('polishPhoto refuses an oversized photo and never fabricates a result', async () => {
  studio();
  const also = studio();
  await assert.rejects(() => polishPhoto(baseEnv(), null, 'A'.repeat(9 * 1024 * 1024 * 4 / 3), 'image/png', 'ریتوش'), /حداکثر ۸ مگابایت/);
  await assert.rejects(() => polishPhoto({ GEMINI_API_KEY: undefined }, also.ask, PNG_160x120, 'image/png', 'ریتوش کن'), /هیچ مدلی جواب نداد/);
});

test('handlePhotoEdit returns null for non-edit text and a full delivery for an edit', async () => {
  assert.equal(await handlePhotoEdit(baseEnv(), null, PNG_160x120, 'image/png', 'این عکس چیه؟'), null);
  const env = baseEnv();
  const { ask } = studio({ brief: briefJson() });
  const out = await handlePhotoEdit(env, ask, PNG_160x120, 'image/png', 'کیفیتش رو بالا ببر');
  assert.equal(out.op, 'upscale');
  assert.match(out.caption, /افزایش کیفیت/);
  assert.equal(out.image, EDIT_PNG);
});

test('a wide frame drift is reported honestly in the caption', async () => {
  const env = baseEnv();
  const { ask } = studio({ brief: briefJson(), edits: [jpegB64(1600, 400)] });
  const out = await polishPhoto(env, ask, PNG_160x120, 'image/png', 'این عکس رو ریتوش کن');
  assert.ok(out.drift > 12);
  assert.match(editCaption(out), /کادر حدود/);
});

// ---------------------------------------------------------------------------------------
// 7. Iteration memory
// ---------------------------------------------------------------------------------------

test('the original is remembered for an hour and a follow-up reuses it', async () => {
  const env = baseEnv();
  const stored = await rememberEdit(env, 'k', { original: PNG_160x120, mime: 'image/png', request: 'ریتوش کن', op: 'retouch', strength: 0.28 });
  assert.equal(stored, true);
  const recalled = await recallEdit(env, 'k');
  assert.equal(recalled.image, PNG_160x120);
  assert.equal(recalled.mime, 'image/png');
  assert.equal(recalled.plan.op, 'retouch');
  assert.equal(recalled.plan.request, 'ریتوش کن');
  // a photo too large for KV is not remembered, but the plan still is
  const big = 'A'.repeat(5_000_000);
  assert.equal(await rememberEdit(env, 'big', { original: big, mime: 'image/png', request: 'x', op: 'color', strength: 0.3 }), false);
  assert.equal(await recallEdit(env, 'big'), null);
  assert.equal(JSON.parse(env.MEMORY.store.get('edit:plan:big')).op, 'color');
  assert.equal(await recallEdit(env, 'nothing'), null);
  assert.equal(await recallEdit({}, 'k'), null);
});

test('continueEdit applies the delta to the remembered plan', async () => {
  const env = baseEnv();
  const { ask, prompts } = studio({ brief: briefJson() });
  await rememberEdit(env, 'k', { original: PNG_160x120, mime: 'image/png', request: 'پس‌زمینه رو عوض کن', op: 'background', strength: 0.55 });
  const out = await continueEdit(env, ask, await recallEdit(env, 'k'), 'کمی ملایم‌تر');
  assert.equal(out.followUp, true);
  assert.equal(out.op, 'background', 'the previous operation is kept');
  assert.match(prompts[0], /apply more subtly than the previous attempt/);
  assert.match(prompts[0], /پس‌زمینه رو عوض کن/);
  assert.ok(out.strength < 0.55 * 0.8, 'softer than the original plan');
  assert.match(out.caption, /ویرایش انجام شد/);
});

// ---------------------------------------------------------------------------------------
// 7b. Picking a delivered version, and the final quality pass
// ---------------------------------------------------------------------------------------

test('a pick can be written in Persian or English, with digits or ordinals', () => {
  assert.equal(pickRequest('نسخهٔ ۲').take, 2);
  assert.equal(pickRequest('نسخه 3 رو انتخاب می‌کنم').take, 3);
  assert.equal(pickRequest('شمارهٔ ۱ بهتره').take, 1);
  assert.equal(pickRequest('دومی').take, 2);
  assert.equal(pickRequest('نسخهٔ سوم را ادامه بده').take, 3);
  assert.equal(pickRequest('version 2 please').take, 2);
  assert.equal(pickRequest('take 3').take, 3);
  assert.equal(pickRequest('#2').take, 2);
  assert.equal(pickRequest('سلام خوبی'), null);
  assert.equal(pickRequest('x'.repeat(200)), null);
});

test('the variations set is remembered with its plan, within a size budget', async () => {
  const env = baseEnv();
  const takes = (img) => ({ variations: [{ image: img, mime: 'image/png', variant: 'safe', variantLabel: 'محافظه‌کارانه',
    strength: 0.3, review: { derived: true, score: 85 } }, { image: img, mime: 'image/png', variant: 'balanced',
    variantLabel: 'متعادل', strength: 0.4, review: { derived: true, score: 90 } }], op: 'color', request: 'سینمایی کن' });
  assert.equal(await rememberVariations(env, 'k', takes(PNG_160x120)), true);
  const set = await recallVariations(env, 'k');
  assert.equal(set.takes.length, 2);
  assert.equal(set.takes[1].variantLabel, 'متعادل');
  assert.equal(set.takes[1].score, 90);
  assert.equal(set.op, 'color');
  // a set that cannot fit is simply not remembered (picking is then unavailable, nothing breaks)
  const huge = takes('A'.repeat(7_000_000));
  assert.equal(await rememberVariations(env, 'big', huge), true, 'one take still fits');
  assert.equal((await recallVariations(env, 'big')).takes.length, 1);
  assert.equal(await rememberVariations(env, 'none', { variations: [] }), false);
  assert.equal(await recallVariations({}, 'k'), null);
});

test('refineTake continues the picked version at that version\'s own strength', async () => {
  const env = baseEnv();
  const { ask, prompts } = studio({ brief: briefJson() });
  const recalled = { image: PNG_BIG, mime: 'image/png', request: 'سینمایی کن', op: 'color',
    takes: [{ image: EDIT_PNG, mime: 'image/png', variant: 'safe', variantLabel: 'محافظه‌کارانه', strength: 0.2, score: 85 },
      { image: EDIT_PNG, mime: 'image/png', variant: 'bold', variantLabel: 'جسورانه', strength: 0.6, score: 92 }] };
  const out = await refineTake(env, ask, recalled, 2);
  assert.equal(out.picked, 2);
  assert.equal(out.op, 'color');
  assert.match(out.caption, /نسخهٔ ۲ \(جسورانه\) انتخاب شد/);
  assert.match(out.caption, /دقیق‌ترش کردم/);
  assert.match(prompts[0], /continue the جسورانه take/);
  assert.ok(out.strength > 0.5, 'the picked version\'s strength became the base');
  // an index outside the set is handled by the caller (worker answers with a clear message)
  assert.equal(await refineTake(env, ask, recalled, 9), null);
});

// ---- the final quality pass ----
const stabilityFetch = ({ dims = [2048, 2048], status = 200, finish = 'SUCCESS', b64 = null } = {}) => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init && init.headers, body: init && init.body });
    if (status !== 200) return jsonRes({ errors: ['bad key'] }, status);
    const data = b64 || pngB64(dims[0], dims[1], 3);
    return jsonRes({ image: data, seed: 1, finish_reason: finish });
  };
  return calls;
};

test('the upscaler sends the picture to Stability and returns verified, bigger pixels', async () => {
  const env = { STABILITY_API_KEY: 'sk-test' };
  const calls = stabilityFetch({ dims: [2048, 2048] });
  const out = await upscaleImage(env, PNG_1024, 'image/png', { prompt: 'a jeep at a lake' });
  assert.equal(out.provider, 'stability');
  assert.equal(out.info.width, 2048);
  assert.ok(out.scale > 1.9);
  assert.match(calls[0].url, /stable-image\/upscale\/fast/);
  assert.equal(calls[0].headers.authorization, 'Bearer sk-test');
  assert.equal(calls[0].headers.accept, 'application/json');
  assert.ok(calls[0].body instanceof FormData);
});

test('the upscaler follows the documented endpoint when asked for the conservative mode', async () => {
  // The fast endpoint is tried first; when it refuses, the conservative one (with a prompt) is used.
  const env = { STABILITY_API_KEY: 'sk-test' };
  let first = true;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/fast')) { first = false; return jsonRes({ errors: ['unsupported'] }, 400); }
    return jsonRes({ image: pngB64(4096, 4096, 5), finish_reason: 'SUCCESS' });
  };
  const out = await upscaleImage(env, PNG_1024, 'image/png', { prompt: 'portrait' });
  assert.equal(first, false);
  assert.equal(out.info.width, 4096);
  assert.equal(out.model, 'Stability conservative');
});

test('the upscaler is skipped honestly without a key, and never claims an upgrade', async () => {
  assert.equal(await upscaleImage({}, PNG_1024, 'image/png'), null);
  const env = { STABILITY_API_KEY: 'sk-test' };
  stabilityFetch({ dims: [512, 512] }); // smaller than the input: not an improvement
  const out = await upscaleImage(env, PNG_1024, 'image/png');
  assert.equal(out.failed, true);
  assert.equal(out.image, null);
  assert.match(out.errors.join(' '), /no resolution gain|empty|unusable/);
  stabilityFetch({ status: 401 });
  const bad = await upscaleImage(env, PNG_1024, 'image/png');
  assert.equal(bad.failed, true);
  stabilityFetch({ dims: [4096, 4096], b64: 'A'.repeat(12_000_000) }); // too big to carry
  assert.equal((await upscaleImage(env, PNG_1024, 'image/png')).failed, true);
});

test('worthUpscaling: only small deliveries that lost resolution go through the pass', () => {
  assert.equal(worthUpscaling({ width: 1024, height: 1024 }), true);
  assert.equal(worthUpscaling({ width: UPSCALE_TARGET, height: UPSCALE_TARGET }), false);
  assert.equal(worthUpscaling({ width: 2048, height: 1536 }), false);
  assert.equal(worthUpscaling(null), false);
  assert.equal(worthUpscaling({ width: 900, height: 900 }, { width: 800, height: 800 }), false, 'already better than the original');
  assert.equal(worthUpscaling({ width: 900, height: 900 }, { width: 4000, height: 3000 }), true, 'a 4000px photo came back at 900px');
});

test('the pipeline uses the final pass on the winning take and says so in the caption', async () => {
  const env = { ...baseEnv(), STABILITY_API_KEY: 'sk-test' };
  const { ask } = studio({ brief: briefJson() });
  const providerFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.stability.ai')) { calls.push(String(url)); return jsonRes({ image: pngB64(2048, 2048, 7), finish_reason: 'SUCCESS' }); }
    return providerFetch(url, init);
  };
  const out = await polishPhoto(env, ask, PNG_BIG, 'image/png', 'این عکس رو ریتوش کن');
  assert.equal(out.upscale.image.length > 0, true);
  assert.equal(out.upscale.before.width, 1024, 'the pass starts from the delivered take, not the phone photo');
  assert.equal(out.info.width, 2048, 'the delivered pixels are the upscaled ones');
  assert.match(editCaption(out), /کیفیت نهایی: ۲۰۴۸×۲۰۴۸/);
  assert.equal(calls.length, 1);
});

test('a failed final pass never costs the user their picture', async () => {
  const env = { ...baseEnv(), STABILITY_API_KEY: 'sk-test' };
  const { ask } = studio({ brief: briefJson() });
  const providerFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.stability.ai')) return jsonRes({ errors: ['quota'] }, 429);
    return providerFetch(url, init);
  };
  const out = await polishPhoto(env, ask, PNG_BIG, 'image/png', 'این عکس رو ریتوش کن');
  assert.equal(out.image, EDIT_PNG, 'the edited picture is delivered unchanged');
  assert.equal(out.upscale.failed, true);
  assert.match(editCaption(out), /بزرگ‌کردن نهایی انجام نشد/);
});

test('a variations turn is delivered as-is (no single-quality pass on a set)', async () => {
  const env = { ...baseEnv(), STABILITY_API_KEY: 'sk-test' };
  const { ask } = studio({ brief: briefJson(), scores: [
    { instruction: 90, artifacts: 90, light: 90, frame: 90, keep: true, issues: [], fix: '' },
    { instruction: 80, artifacts: 80, light: 80, frame: 80, keep: true, issues: [], fix: '' },
    { instruction: 70, artifacts: 70, light: 70, frame: 70, keep: true, issues: [], fix: '' },
  ] });
  const providerFetch = globalThis.fetch;
  let stability = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.stability.ai')) { stability++; return jsonRes({ image: pngB64(2048, 2048, 1) }); }
    return providerFetch(url, init);
  };
  const out = await polishPhoto(env, ask, PNG_BIG, 'image/png', 'چند نسخه بده: ریتوش کن');
  assert.equal(out.kind, 'variations');
  assert.equal(stability, 0, 'the set is not upscaled');
  assert.equal(out.upscale, null);
});

// ---------------------------------------------------------------------------------------
// 8. Real turns through the Worker
// ---------------------------------------------------------------------------------------

function editMock({ edits = null, brief = 'no json', scores = [] } = {}) {
  const calls = [];
  let review = 0, edit = 0;
  const answers = scores.length ? scores : [{ instruction: 95, identity: 95, artifacts: 95, light: 95, frame: 95, keep: true }];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init ? init.body : null;
    calls.push({ url: u, body });
    if (u.endsWith('/getFile')) return jsonRes({ ok: true, result: { file_path: 'photos/file_2.jpg' } });
    if (u.includes('/file/bot')) return new Response(Uint8Array.from(jpegBytes(800, 600)));
    if (u.includes('/models?')) return jsonRes({ models: [{ name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] });
    if (u.includes('generativelanguage')) {
      const text = body.contents.at(-1).parts.filter((p) => p.text).map((p) => p.text).join(' ');
      if (/retoucher request/i.test(text)) return jsonRes({ candidates: [{ content: { parts: [{ text: brief }] } }] });
      if (/Review the edit/i.test(text)) return jsonRes({ candidates: [{ content: { parts: [{ text: JSON.stringify(answers[Math.min(review++, answers.length - 1)]) }] } }] });
      const mine = edit++;
      return jsonRes({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: edits ? edits[mine] : EDIT_PNG } }] } }] });
    }
    return jsonRes({ ok: true });
  };
  return calls;
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

test('Telegram: an edited photo comes back as a before/after album with a Persian retoucher note', async () => {
  const env = baseEnv();
  const calls = editMock({ brief: briefJson({ subject_type: 'person' }) });
  await post(env, photoMsg('این عکس رو ریتوش کن و نور رو بهتر کن'));
  const album = calls.find((c) => c.url.endsWith('/sendMediaGroup'));
  assert.ok(album, 'sendMediaGroup called with before/after');
  const media = JSON.parse(album.body.get('media'));
  assert.deepEqual(media.map((m) => m.media), ['attach://before', 'attach://after']);
  assert.match(media[0].caption, /قبل ← بعد/);
  assert.match(media[0].caption, /ویرایش انجام شد/);
  assert.match(media[0].caption, /بازبینی ریتوشِر/);
  assert.match(media[0].caption, /۱۰۲۴×۱۰۲۴/);
  assert.equal(album.body.get('before').type, 'image/jpeg', 'the original is attached as-is');
  assert.equal(Buffer.from(await album.body.get('after').arrayBuffer()).toString('base64'), EDIT_PNG);
  assert.equal(calls.some((c) => c.url.endsWith('/sendPhoto')), false, 'no single-photo fallback needed');
  // the original is remembered so a tweak can follow without resending the picture
  // (the Telegram conversation key is `history:<ALLOWED_USER_ID>`)
  const plan = JSON.parse(env.MEMORY.store.get(`edit:plan:history:${OWNER}`));
  assert.equal(plan.op, 'retouch');
  assert.equal(typeof env.MEMORY.store.get(`edit:orig:history:${OWNER}`), 'string');
});

test('Telegram: «ملایم‌تر» after an edit reuses the remembered photo', async () => {
  const env = baseEnv();
  const calls = editMock({ brief: briefJson() });
  await post(env, photoMsg('پس‌زمینه رو عوض کن'));
  const before = calls.length;
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, text: 'کمی ملایم‌تر' } });
  const turn = calls.slice(before);
  assert.equal(turn.some((c) => c.url.endsWith('/getFile')), false, 'no new download: the stored original is reused');
  const edit = turn.find((c) => c.url.includes(':generateContent') && /Edit this photograph/.test(JSON.stringify(c.body)));
  assert.match(edit.body.contents[0].parts[1].text, /apply more subtly/);
  assert.ok(turn.find((c) => c.url.endsWith('/sendMediaGroup')), 'the softened version is delivered');
});

test('Telegram: a text wish without the words asks for them; with words the layer is set', async () => {
  const env = baseEnv();
  const calls = editMock();
  await post(env, photoMsg('روی این عکس متن بذار'));
  assert.equal(calls.some((c) => c.url.endsWith('/sendMediaGroup')), false);
  const msgs = calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => c.body.text);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /چه متنی بنویسم/);
  const afterAsk = calls.length;
  await post(env, photoMsg('روی این عکس متن بذار: ویِکینگ آفرود'));
  const album = calls.slice(afterAsk).find((c) => c.url.endsWith('/sendMediaGroup'));
  assert.ok(album, 'with the words the picture comes back');
  assert.match(JSON.parse(album.body.get('media'))[0].caption, /«ویِکینگ آفرود»/);
});

test('Telegram: a photo with no edit instruction still goes to the vision brain unchanged', async () => {
  const env = baseEnv();
  const calls = editMock();
  await post(env, photoMsg('چی توشه؟'));
  assert.equal(calls.some((c) => c.url.endsWith('/sendMediaGroup')), false);
  assert.equal(calls.filter((c) => c.url.endsWith('/sendMessage')).length, 1);
});

test('Telegram: «چند نسخه» delivers the whole studio set as one album', async () => {
  const env = baseEnv();
  const calls = editMock({ brief: briefJson(), scores: [
    { instruction: 84, artifacts: 85, light: 85, frame: 85, keep: true, issues: [], fix: '' },
    { instruction: 90, artifacts: 90, light: 90, frame: 90, keep: true, issues: [], fix: '' },
    { instruction: 92, artifacts: 92, light: 92, frame: 92, keep: true, issues: [], fix: '' },
  ] });
  await post(env, photoMsg('چند نسخهٔ مختلف بده: عکس رو سینمایی کن'));
  const album = calls.find((c) => c.url.endsWith('/sendMediaGroup'));
  const media = JSON.parse(album.body.get('media'));
  assert.deepEqual(media.map((m) => m.media), ['attach://before', 'attach://v0', 'attach://v1', 'attach://v2']);
  assert.match(media[0].caption, /اصل ← ۳ نسخه/);
  assert.match(media[0].caption, /پیشنهاد من/);
  assert.equal(album.body.get('v2').type, 'image/png');
});

test('web app: POST /api/chat with a photo and an edit instruction answers with image + caption + score', async () => {
  const env = baseEnv();
  const calls = editMock();
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'پس‌زمینه رو سفید و استودیویی کن', image: `data:image/jpeg;base64,${b64('original-photo')}` }),
  }), env, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reply, /ویرایش انجام شد/);
  assert.match(body.reply, /پس‌زمینه/);
  assert.match(body.image, /^data:image\/png;base64,/);
  assert.ok(body.score >= QUALITY_BAR);
  assert.equal(calls.filter((c) => c.url.includes('generativelanguage') && c.url.includes(':generateContent')).length >= 1, true);
});

test('Telegram: after a variations set, «نسخهٔ ۲» refines exactly that version', async () => {
  const env = baseEnv();
  const calls = editMock({ brief: briefJson(), scores: [
    { instruction: 84, artifacts: 85, light: 85, frame: 85, keep: true, issues: [], fix: '' },
    { instruction: 90, artifacts: 90, light: 90, frame: 90, keep: true, issues: [], fix: '' },
    { instruction: 76, artifacts: 80, light: 80, frame: 80, keep: true, issues: [], fix: '' },
  ] });
  await post(env, photoMsg('چند نسخه بده: عکس رو سینمایی کن'));
  const before = calls.length;
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, text: 'نسخهٔ ۲' } });
  const turn = calls.slice(before);
  assert.equal(turn.some((c) => c.url.endsWith('/getFile')), false, 'the remembered photo is reused');
  const edit = turn.find((c) => c.url.includes(':generateContent') && /Edit this photograph/.test(JSON.stringify(c.body)));
  // takes are ranked by score, so take 2 of this set is the conservative one
  assert.match(edit.body.contents[0].parts[1].text, /continue the محافظه‌کارانه take/);
  const album = turn.find((c) => c.url.endsWith('/sendMediaGroup'));
  assert.ok(album, 'the refined version is delivered');
  assert.match(JSON.parse(album.body.get('media'))[0].caption, /نسخهٔ ۲ \(محافظه‌کارانه\) انتخاب شد و دقیق‌ترش کردم/);
});

test('web app: /api/pick refines the chosen take and 404s when nothing was remembered', async () => {
  const env = baseEnv();
  const calls = editMock({ brief: briefJson(), scores: [
    { instruction: 85, artifacts: 85, light: 85, frame: 85, keep: true, issues: [], fix: '' },
    { instruction: 92, artifacts: 92, light: 92, frame: 92, keep: true, issues: [], fix: '' },
    { instruction: 78, artifacts: 80, light: 80, frame: 80, keep: true, issues: [], fix: '' },
  ] });
  const auth = await appHeaders(env);
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ message: 'چند نسخه بده: ریتوش کن', image: `data:image/png;base64,${PNG_160x120}` }),
  }), env, {}).then((r) => r.json());
  assert.equal(res.images.length, 3);
  assert.deepEqual(res.picks, ['متعادل', 'محافظه‌کارانه', 'جسورانه'], 'picks name the takes in ranked order');
  const pick = await worker.fetch(new Request('https://hermes.example.workers.dev/api/pick', {
    method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ take: 2 }),
  }), env, {});
  assert.equal(pick.status, 200);
  const body = await pick.json();
  assert.equal(body.picked, 2);
  assert.match(body.reply, /نسخهٔ ۲/);
  assert.match(body.image, /^data:image\/png;base64,/);
  const empty = await worker.fetch(new Request('https://hermes.example.workers.dev/api/pick', {
    method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ take: 2 }),
  }), baseEnv(), {});
  assert.equal(empty.status, 404);
});

test('the app page ships the Photo Lab ability and the photo-edit hint', async () => {
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/app'), baseEnv(), {});
  const html = await res.text();
  assert.match(html, /Photo Lab/);
  assert.match(html, /ویرایش حرفه‌ای عکس/);
  assert.match(html, /چه تغییری می‌خواهی/);
  assert.match(html, /قبل از خروج، عکس را یک ریتوشِر بازبینی می‌کند/);
  assert.match(html, /همین را انتخاب کن/, 'the per-version pick button is part of the app');
});

// The web API takes the app key as a bearer token, same as the real app.
async function appHeaders(env) {
  const { appKey } = await import('./security.mjs');
  return { authorization: `Bearer ${await appKey(env)}` };
}

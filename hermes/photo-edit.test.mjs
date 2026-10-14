// Photo editing engine: detection, brief, execution, review, delivery — plus the real Telegram
// and web turns driven through the Worker with mocked network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editRequest, editInstruction, photoBrief, geminiEdit, geminiImageList, cfEdit, runEdit,
  reviewEdit, polishPhoto, editCaption, handlePhotoEdit, EDIT_OPS, CF_EDIT_MODELS, TEXT_ASK,
} from './photo-edit.mjs';
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

// ---------------------------------------------------------------------------------------
// 1. Detection
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
    assert.ok(r.strength > 0 && r.strength <= 0.75);
  }
  const no = ['عکس بساز: کمپ کنار دریاچه', 'این عکس چیه؟ توضیح بده', 'سلام', 'generate an image of a jeep',
    'describe this picture', 'چی توشه', '', 'متن این عکس چیه؟', 'چه متنی روی این عکس نوشته؟'];
  for (const text of no) assert.equal(editRequest(text), null, `false positive: ${text}`);
});

test('the edit instruction carries the user words, the must-keep list and the text ban', () => {
  const out = editInstruction('background', 'پس‌زمینه رو برف کن', { problems: ['overexposed sky'], lighting: 'flat', must_keep: ['the label text'] });
  assert.match(out, /پس‌زمینه رو برف کن/);
  assert.match(out, /Fix these specific problems: overexposed sky/);
  assert.match(out, /Lighting: flat/);
  assert.match(out, /the label text/);
  assert.match(out, /Do not change:/);
  assert.match(out, /do not add any text, letters, numbers, logos/);
  assert.match(out, /hair, fur, thin details/); // background recipe specifics
  assert.match(out, /Avoid:/);
});

test('a text-only request gets an explanation, never a mangled picture', async () => {
  assert.match('متن بذار روی عکس', TEXT_ASK);
  assert.equal(TEXT_ASK.test('رنگش رو متناسب کن'), false, 'متناسب must not look like متن');
  const out = await polishPhoto(baseEnv(), null, b64('img'), 'image/jpeg', 'روی این عکس متن بذار: وایکینگ آفرود');
  assert.equal(out.kind, 'text-refused');
  assert.equal(out.image, null);
  assert.match(out.message, /نوشتن متن/);
  const viaWorker = await handlePhotoEdit(baseEnv(), null, b64('img'), 'image/jpeg', 'فونت قشنگ‌تری روی عکس بذار');
  assert.match(viaWorker.caption, /متن\/لوگو روی عکس/);
});

test('a mixed request (edit + text) edits the photo and says the text was left out', async () => {
  const env = baseEnv();
  const calls = geminiFetch({ answers: [{ parts: [{ text: 'no brief' }] }, { parts: [{ inlineData: { mimeType: 'image/png', data: b64('E') } }] }] });
  const out = await handlePhotoEdit(env, null, b64('o'), 'image/jpeg', 'این عکس رو ریتوش کن و رویش بنویس وایکینگ آفرود');
  assert.equal(out.op, 'retouch');
  assert.equal(Buffer.from(out.image, 'base64').toString(), 'E');
  assert.match(out.caption, /ویرایش انجام شد/);
  assert.match(out.caption, /متن\/لوگو روی عکس اضافه نشد/);
  const editCall = calls.filter((c) => c.url.includes(':generateContent')).at(-1);
  assert.match(editCall.body.contents[0].parts[1].text, /do not add any text/);
});

// ---------------------------------------------------------------------------------------
// 2. Brief
// ---------------------------------------------------------------------------------------

test('the retoucher brief is parsed from a fenced JSON answer', async () => {
  const ask = async () => '```json\n{"subject":"a jeep at a lake","must_keep":["the jeep"],"problems":["harsh shadows"],' +
    '"lighting":"harsh noon","color":"cold","aspect":"4:3, keep it","risks":["over-sharpen"]}\n```';
  const brief = await photoBrief({}, ask, b64('x'), 'image/jpeg', 'بهترش کن', 'relight');
  assert.equal(brief.subject, 'a jeep at a lake');
  assert.deepEqual(brief.problems, ['harsh shadows']);
  assert.equal(brief.lighting, 'harsh noon');
  assert.equal(brief.derived, true);
});

test('a broken or unavailable vision model degrades to the recipe, never to an exception', async () => {
  const noise = await photoBrief({}, async () => 'I cannot help with that.', b64('x'), 'image/jpeg', 'ریتوش', 'retouch');
  assert.equal(noise.derived, false);
  assert.deepEqual(noise.problems, []);
  const boom = await photoBrief({}, async () => { throw new Error('quota'); }, b64('x'), 'image/jpeg', 'ریتوش');
  assert.equal(boom.derived, false);
  const none = await photoBrief({}, null, b64('x'), 'image/jpeg', 'ریتوش');
  assert.equal(none.derived, false);
});

// ---------------------------------------------------------------------------------------
// 3. Execution: Gemini
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
  assert.equal(await env.MEMORY.get('edit-image-models', 'json') === null, false);
  const again = await geminiImageList(env); // served from KV now
  assert.equal(calls.length, 1);
  assert.deepEqual(again, list);
  await env.MEMORY.put('edit-model', 'gemini-2.5-flash-image');
  assert.deepEqual(await geminiImageList(env), ['gemini-2.5-flash-image', 'gemini-3.0-pro-image']);
});

test('a Gemini edit returns real pixels and remembers the model that worked', async () => {
  const env = baseEnv();
  const calls = geminiFetch({ answers: [{ parts: [{ inlineData: { mimeType: 'image/png', data: b64('EDITED') } }] }] });
  const out = await geminiEdit(env, b64('orig'), 'image/jpeg', 'retouch it');
  assert.equal(Buffer.from(out.image, 'base64').toString(), 'EDITED');
  assert.equal(out.mime, 'image/png');
  assert.equal(out.model, 'Gemini gemini-3.0-pro-image');
  const sent = calls.find((c) => c.url.includes(':generateContent'));
  assert.equal(sent.body.contents[0].parts[0].inlineData.data, b64('orig'));
  assert.equal(sent.body.contents[0].parts[1].text, 'retouch it');
  assert.deepEqual(sent.body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.equal(await env.MEMORY.get('edit-model'), 'gemini-3.0-pro-image');
});

test('a refusing Gemini model hands over to the next one and an all-refusal is an honest error', async () => {
  const env = baseEnv();
  geminiFetch({ answers: [{ parts: [{ text: 'I cannot edit that' }] }, { parts: [{ inlineData: { mimeType: 'image/jpeg', data: b64('OK') } }] }] });
  const out = await geminiEdit(env, b64('o'), 'image/jpeg', 'x');
  assert.equal(out.model, 'Gemini gemini-2.5-flash-image');
  const env2 = baseEnv();
  geminiFetch({ answers: [{ parts: [{ text: 'no' }] }] });
  await assert.rejects(() => geminiEdit(env2, b64('o'), 'image/jpeg', 'x'), /هیچ مدل تصویر جمینی/);
});

// ---------------------------------------------------------------------------------------
// 4. Execution: Workers AI (free fallback)
// ---------------------------------------------------------------------------------------

test('Workers AI img2img accepts base64, streams and raw bytes, and reports which model answered', async () => {
  const mk = (run) => ({ AI: { calls: [], run(model, input) { this.calls.push({ model, input }); return run(model, input); } } });
  const asB64 = mk(() => ({ image: b64('A'.repeat(1200)) }));
  assert.equal((await cfEdit(asB64, new Uint8Array([1, 2, 3]), 'p', 0.3)).model, CF_EDIT_MODELS[0].name);
  assert.equal(asB64.AI.calls[0].input.strength, 0.3);
  assert.equal(Array.isArray(asB64.AI.calls[0].input.image), true);
  const asStream = mk(() => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(1200).fill(7)])).body);
  const streamed = await cfEdit(asStream, new Uint8Array([1]), 'p');
  assert.equal(streamed.mime, 'image/png');
  const asBytes = mk(() => new Uint8Array([0xff, 0xd8, 0xff, ...new Array(1200).fill(3)]));
  assert.equal((await cfEdit(asBytes, new Uint8Array([1]), 'p')).mime, 'image/jpeg');
});

test('Workers AI walks the model list and an unusable answer is an error, not a claim', async () => {
  const env = { AI: { calls: [], run(model) { this.calls.push(model); if (model.includes('schnell')) return { image: 'AAAA' }; // 3 bytes -> too small
    return new Uint8Array(0); } } };
  await assert.rejects(() => cfEdit(env, new Uint8Array([1]), 'p'), /Workers AI img2img/);
  assert.equal(env.AI.calls.length, CF_EDIT_MODELS.length);
  assert.match(String((await cfEdit(env, new Uint8Array([1]), 'p').catch((e) => e)).message), /empty|img2img/);
});

// ---------------------------------------------------------------------------------------
// 5. Chain
// ---------------------------------------------------------------------------------------

test('runEdit prefers Gemini and falls back to Workers AI without lying about the provider', async () => {
  const env = { ...baseEnv(), AI: { run: async () => ({ image: b64('C'.repeat(1200)) }) } };
  geminiFetch({ answers: [{ status: 500 }] });
  const out = await runEdit(env, b64('o'), 'image/jpeg', 'p', 0.4);
  assert.equal(out.provider, 'workers-ai');
  const env2 = { AI: { run: async () => ({ image: b64('C'.repeat(1200)) }) } }; // no Gemini key at all
  const out2 = await runEdit(env2, b64('o'), 'image/jpeg', 'p', 0.4);
  assert.equal(out2.provider, 'workers-ai');
  await assert.rejects(() => runEdit({}, b64('o'), 'image/jpeg', 'p', 0.4), /کلید جمینی یا Workers AI/);
});

// ---------------------------------------------------------------------------------------
// 6. Review + repair
// ---------------------------------------------------------------------------------------

test('a rejected edit is retried once with the reviewer note and delivered as repaired', async () => {
  const env = baseEnv();
  const seen = [];
  let review = 0;
  const ask = async (e, contents, system) => {
    if (/reviewing/.test(system)) { seen.push('review'); return ++review === 1
      ? '{"keep":false,"score":40,"issues":["skin looks plastic","left arm duplicated"],"fix":"keep the pores and only one arm"}'
      : '{"keep":true,"score":88,"issues":[],"fix":""}'; }
    seen.push('brief');
    return '{"subject":"portrait","must_keep":["face"],"problems":["flyaway hair"],"lighting":"window light","color":"warm","aspect":"keep"}';
  };
  const edits = [];
  globalThis.fetch = async (url, init) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (String(url).includes('/models?')) return jsonRes({ models: [{ name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] });
    edits.push(body.contents[0].parts[1].text);
    return jsonRes({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64(`EDIT${edits.length}`) } }] } }] });
  };
  const out = await polishPhoto(env, ask, b64('o'), 'image/jpeg', 'این عکس رو ریتوش کن');
  assert.equal(out.kind, 'repaired');
  assert.equal(out.attempted.length, 2);
  assert.equal(Buffer.from(out.image, 'base64').toString(), 'EDIT2');
  assert.match(edits[0], /flyaway hair/);            // brief reached the model
  assert.match(edits[1], /Extra correction from review: keep the pores and only one arm/);
  assert.deepEqual(out.review.issues, []);
  assert.match(editCaption(out), /ریتوش حرفه‌ای/);
  assert.match(editCaption(out), /اصلاح‌ها:/);
  assert.deepEqual(seen, ['brief', 'review', 'review']);
});

test('a review that cannot be parsed accepts the edit instead of blocking the picture', async () => {
  const env = baseEnv();
  const ask = async (e, c, system) => (/reviewing/.test(system) ? 'sorry, no JSON here' : 'garbage');
  geminiFetch({ answers: [{ parts: [{ inlineData: { mimeType: 'image/png', data: b64('E') } }] }] });
  const out = await polishPhoto(env, ask, b64('o'), 'image/jpeg', 'پس‌زمینه رو سفید کن');
  assert.equal(out.kind, 'edited');
  assert.equal(out.review.derived, false);
  assert.equal(out.review.keep, true);
  assert.equal(out.model, 'Gemini gemini-3.0-pro-image');
});

test('reviewEdit never throws when the brain dies mid-review', async () => {
  const out = await reviewEdit({}, async () => { throw new Error('down'); }, b64('a'), 'image/jpeg', b64('b'), 'image/png', 'x');
  assert.equal(out.keep, true);
  assert.equal(out.derived, false);
});

// ---------------------------------------------------------------------------------------
// 7. Delivery
// ---------------------------------------------------------------------------------------

test('polishPhoto refuses an oversized photo and never fabricates a result', async () => {
  geminiFetch({ answers: [{ parts: [{ inlineData: { mimeType: 'image/png', data: b64('E') } }] }] });
  await assert.rejects(() => polishPhoto(baseEnv(), null, 'A'.repeat(9 * 1024 * 1024 * 4 / 3), 'image/jpeg', 'ریتوش'), /حداکثر ۸ مگابایت/);
  const empty = { GEMINI_API_KEY: undefined };
  await assert.rejects(() => polishPhoto(empty, null, b64('o'), 'image/jpeg', 'ریتوش کن'), /هیچ مدلی جواب نداد/);
});

test('handlePhotoEdit returns null for non-edit text and a full delivery for an edit', async () => {
  assert.equal(await handlePhotoEdit(baseEnv(), null, b64('o'), 'image/jpeg', 'این عکس چیه؟'), null);
  const env = baseEnv();
  geminiFetch({ answers: [{ parts: [{ text: 'no brief' }] }, { parts: [{ inlineData: { mimeType: 'image/jpeg', data: b64('E') } }] }] });
  const out = await handlePhotoEdit(env, null, b64('o'), 'image/jpeg', 'کیفیتش رو بالا ببر');
  assert.equal(out.op, 'upscale');
  assert.match(out.caption, /افزایش کیفیت/);
  assert.equal(out.image, b64('E'));
});

// ---------------------------------------------------------------------------------------
// 8. Real turns through the Worker
// ---------------------------------------------------------------------------------------

function editMock({ geminiImage = b64('EDITED'), brief = 'no json' } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : init ? init.body : null;
    calls.push({ url: u, body });
    if (u.endsWith('/getFile')) return jsonRes({ ok: true, result: { file_path: 'photos/file_2.jpg' } });
    if (u.includes('/file/bot')) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(500).fill(9)]));
    if (u.includes('/models?')) return jsonRes({ models: [{ name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] });
    if (u.includes('generativelanguage')) {
      const parts = body.contents.at(-1).parts;
      const text = parts.filter((p) => p.text).map((p) => p.text).join(' ');
      if (/retoucher request/i.test(text)) return jsonRes({ candidates: [{ content: { parts: [{ text: brief }] } }] });
      if (/original, second = edit/i.test(text)) return jsonRes({ candidates: [{ content: { parts: [{ text: '{"keep":true,"score":90,"issues":[],"fix":""}' }] } }] });
      return jsonRes({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: geminiImage } }] } }] });
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

test('Telegram: an edited photo comes back as a before/after album with a Persian caption', async () => {
  const env = baseEnv();
  const calls = editMock({ geminiImage: b64('EDITED-PHOTO') });
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) },
    caption: 'این عکس رو ریتوش کن و نور رو بهتر کن', photo: [{ file_id: 'p1' }] } });
  const album = calls.find((c) => c.url.endsWith('/sendMediaGroup'));
  assert.ok(album, 'sendMediaGroup called with before/after');
  const media = JSON.parse(album.body.get('media'));
  assert.deepEqual(media.map((m) => m.media), ['attach://before', 'attach://after']);
  assert.match(media[0].caption, /قبل ← بعد/);
  assert.match(media[0].caption, /ویرایش انجام شد/);
  assert.match(media[0].caption, /ریتوش|نورپردازی/);
  assert.equal(album.body.get('before').type, 'image/jpeg', 'the original is attached as-is');
  assert.equal(album.body.get('after').type, 'image/png');
  assert.equal(Buffer.from(await album.body.get('after').arrayBuffer()).toString(), 'EDITED-PHOTO');
  assert.equal(calls.some((c) => c.url.endsWith('/sendPhoto')), false, 'no single-photo fallback needed');
  assert.equal(calls.some((c) => c.url.includes('/sendMessage')), false, 'no fallback message when the edit worked');
  const gem = calls.filter((c) => c.url.includes('generativelanguage') && c.url.includes(':generateContent'));
  assert.equal(gem[0].body.contents[0].parts[0].inlineData.data.length > 0, true, 'the original photo was sent as edit input');
});

test('Telegram: a refused album falls back to one edited photo', async () => {
  const env = baseEnv();
  const calls = editMock({ geminiImage: b64('EDITED-PHOTO') });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/sendMediaGroup')) { calls.push({ url: String(url), body: init.body }); return jsonRes({ ok: false, description: 'PHOTO_INVALID_DIMENSIONS' }); }
    return original(url, init);
  };
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) },
    caption: 'کیفیتش رو بالا ببر', photo: [{ file_id: 'p1' }] } });
  const photo = calls.find((c) => c.url.endsWith('/sendPhoto'));
  assert.ok(photo, 'sendPhoto fallback used');
  assert.equal(Buffer.from(await photo.body.get('photo').arrayBuffer()).toString(), 'EDITED-PHOTO');
  assert.match(photo.body.get('caption'), /قبل ← بعد/);
});

test('the app page ships the Photo Lab ability and the photo-edit hint', async () => {
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/app'), baseEnv(), {});
  const html = await res.text();
  assert.match(html, /Photo Lab/);
  assert.match(html, /ویرایش حرفه‌ای عکس/);
  assert.match(html, /چه تغییری می‌خواهی/);
});

test('Telegram: a photo with a text request gets the honest refusal, not a broken image', async () => {
  const env = baseEnv();
  const calls = editMock();
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) },
    caption: 'روی این عکس متن بذار: ویِکینگ', photo: [{ file_id: 'p1' }] } });
  assert.equal(calls.some((c) => c.url.endsWith('/sendPhoto')), false);
  const msgs = calls.filter((c) => c.url.endsWith('/sendMessage')).map((c) => c.body.text);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /نوشتن متن/);
});

test('Telegram: a photo with no edit instruction still goes to the vision brain unchanged', async () => {
  const env = baseEnv();
  const calls = editMock();
  await post(env, { message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) },
    caption: 'چی توشه؟', photo: [{ file_id: 'p1' }] } });
  assert.equal(calls.some((c) => c.url.endsWith('/sendPhoto')), false);
  assert.equal(calls.filter((c) => c.url.endsWith('/sendMessage')).length, 1);
});

test('web app: POST /api/chat with a photo and an edit instruction answers with image + caption', async () => {
  const env = baseEnv();
  const calls = editMock({ geminiImage: b64('WEB-EDIT') });
  const res = await worker.fetch(new Request('https://hermes.example.workers.dev/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(await appHeaders(env)) },
    body: JSON.stringify({ message: 'پس‌زمینه رو سفید و استودیویی کن', image: `data:image/jpeg;base64,${b64('original-photo')}` }),
  }), env, { waitUntil: () => {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reply, /ویرایش انجام شد/);
  assert.match(body.reply, /پس‌زمینه/);
  assert.match(body.image, /^data:image\/png;base64,/);
  assert.equal(Buffer.from(body.image.split(',')[1], 'base64').toString(), 'WEB-EDIT');
  assert.equal(calls.filter((c) => c.url.includes('generativelanguage') && c.url.includes(':generateContent')).length >= 1, true);
});

// The web API takes the app key as a bearer token, same as the real app.
async function appHeaders(env) {
  const { appKey } = await import('./security.mjs');
  return { authorization: `Bearer ${await appKey(env)}` };
}

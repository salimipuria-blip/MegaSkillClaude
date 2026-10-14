// Professional photo editing for Hermes: the user sends THEIR OWN photo with an instruction and
// gets an edited picture back (Cloudflare Workers, no native image libraries needed).
//
// Four stages, the way a retoucher works:
//   1. BRIEF   - a vision model studies the photo and the user's words and writes a strict edit
//                brief (subject, must-keep list, problems, light, colour, crop, risks).
//   2. EDIT    - image-to-image through the best free provider that answers: Gemini image models
//                first (they follow instructions and keep the subject), then Workers AI img2img.
//   3. REVIEW  - the result is compared with the original against the must-keep list; if the review
//                rejects it, one corrective retry is made with the reviewer's fix note.
//   4. DELIVER - a short Persian caption: what changed, what was protected, what to try next.
//
// Craft rules encoded here come from the skill library in this repository:
//   library/github-skills/image-studio      (operation matrix: img2img / inpaint / search-replace /
//                                            erase / upscale / remove-bg, and when to use which)
//   library/github-skills/stability-ai      (strength semantics for img2img edits)
//   library/github-skills/generate-image    (photoreal prompt structure, negatives)
//   library/github-skills/product-photo-studio + ecommerce-listing-image-set (studio product recipes)
//   library/github-skills/ai-photo-restyler (restoration / restyle discipline: keep identity)
//   library/github-skills/prompt-master     (enrich the prompt, never change the concept)
//
// Hard rules (the same honesty rule as the rest of this repo):
//   * No edited image is ever claimed unless real bytes came back from a provider.
//   * Identity is locked: faces, body shape, age and ethnicity are never altered unless the user
//     explicitly asks for a restyle/artistic look.
//   * No text, letters, logos or watermarks are drawn into the image: image models corrupt Persian
//     text, so a request for text is refused with an explanation instead of a broken result.
//   * Images are edited as sent; the original is never destroyed or overwritten on the user's side.

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
export const EDIT_MAX_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// 1. What did the user ask for?
// ---------------------------------------------------------------------------------------------

/** Fold Persian spelling variants (ZWNJ, harakat, Arabic yeh/kaf) so every phrasing matches. */
export const normalizeFa = (s) => String(s || '')
  .replace(/[\u200c\u200e\u200f\u2060]/g, ' ')
  .replace(/[\u064b-\u0652\u0640]/g, '')
  .replace(/[\u064a\u0649]/g, '\u06cc').replace(/\u0643/g, '\u06a9')
  .replace(/\s+/g, ' ');

// Persian and English phrasings that mean "edit the photo I am sending".
const EDIT_VERB = '(?:ویرایش|ادیت|اصلاح|ریتوش|رتوش|retouch|edit|اصلاح\\s*کن|درست\\s*کن|بهبود\\s*بده|بهتر\\s*کن|قشنگ\\s*تر\\s*کن|حرفه\\s*ای\\s*تر|بازسازی|زنده\\s*کن|قوی\\s*تر|شارپ\\s*تر|واضح\\s*تر)';
const EDIT_NOUN = '(?:عکس|تصویر|این|اون|همین|photo|picture|image|it|this)';
const EDIT_INTENT_FA = new RegExp(`${EDIT_NOUN}[^.!؟?\\n]{0,40}?${EDIT_VERB}`, 'i');
const EDIT_EXPLICIT = /^\/(?:edit|polish|retouch)(?:@\w+)?\b/i;
// Changes that are unambiguously edits even without the word "edit".
const EDIT_OPERATIONS = [
  ['background', /(?:پس\s*زمینه|پشت\s*صحنه|بک\s*گراند|background|bg\s*remov|remove\s*bg|حذف\s*پس\s*زمینه|پسزمینه\s*رو\s*عوض|پسزمینه\s*عوض)/i],
  ['relight', /(?:نور|روشنایی|روشن\s*تر|تاریک\s*تر|نورپردازی|golden\s*hour|lighting|relight|نور\s*طلایی|سایه|warm(?:er)?|cool(?:er)?|brighter|darker)/i],
  ['color', /(?:رنگ|کالر|گرید|grade|color\s*grade|سینمایی|cinematic|فیلتر|filter|تن\s*رنگ|جذاب\s*تر\s*کن\s*رنگ)/i],
  ['restore', /(?:بازسازی|قدیمی|خراب|خش\s*افتاده|restore|scratch|denoise|نویز|تار\s*شده|blur|کیفیت\s*قدیم)/i],
  ['upscale', /(?:کیفیت|رزولوشن|دقت|شارپ|واضح|وضوح|upscale|sharpen|hd|4k|کیفیتش\s*رو\s*بالا)/i],
  ['erase', /(?:حذف\s*کن|پاک\s*کن|بردار|erase|remove\s+(?:the|an?)?\s*\w+|clean\s*up|یک\s*چیز\s*رو\s*حذف)/i],
  ['swap', /(?:عوض\s*کن|تغییر\s*بده|جایگزین|تبدیل\s*کن\s*به|swap|replace|بذار\s*جاش|جاش\s*بذار)/i],
  ['expand', /(?:کادر\s*رو\s*بزرگ|بزرگ\s*تر\s*کن\s*کادر|outpaint|expand|افقی\s*تر|بیشتر\s*نشون)/i],
  ['product', /(?:محصول|استودیو|studio|product|کاتالوگ|catalog|فروشگاهی|e-?commerce|تبلیغاتی|برای\s*فروش)/i],
  ['restyle', /(?:سبک|استایل|هنری|نقاشی|کارتونی|anime|style|painting|watercolor|noir|سینمایی\s*کن|طرح\s*کن)/i],
  ['retouch', /(?:ریتوش|رتوش|پوست|جوش|لک|retouch|blemish|skin|آرایش|makeup|صورت|چهره|پوست\s*رو)/i],
];
const NOT_EDIT = /(?:عکس\s*بساز|تصویر\s*بساز|بساز\s*یه\s*عکس|generate\s+(?:an?\s+)?image|draw\s+(?:me\s+)?|چی\s*توشه|چی\s*هست|توضیح\s*بده|describe)/i;
// "What does the text in this photo say" is reading, not editing.
const TEXT_ONLY_READ = /(?:چیه|چی\s*نوشته|چه\s*(?:متن|چیزی|نوشته)|بخون|read\s+(?:the\s+)?text|transcribe|ocr)/i;

/**
 * Detect an edit request for a photo the user just sent.
 * Returns { op, instruction, strength } or null when the text is not an edit request.
 * `strength` follows the skill library's img2img semantics: low keeps the original, high rebuilds it.
 */
export function editRequest(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 800) return null;
  const t = normalizeFa(raw);
  if (NOT_EDIT.test(t)) return null;
  if (TEXT_ONLY_READ.test(t) && TEXT_ASK.test(t)) return null;
  const explicit = EDIT_EXPLICIT.test(t);
  const textAsk = TEXT_ASK.test(t);
  const photoWord = /(?:عکس|تصویر|photo|picture|image)/i.test(t);
  const ops = EDIT_OPERATIONS.filter(([, re]) => re.test(t));
  if (!(explicit || ops.length || EDIT_INTENT_FA.test(t) || (textAsk && photoWord))) return null;
  const clean = raw.replace(EDIT_EXPLICIT, '').replace(/^[\s:：،,.\-]+/, '').trim();
  // Text with no visual operation of its own is its own case: explained, not drawn.
  const op = ops.length ? ops[0][0] : textAsk ? 'text' : 'retouch';
  // A restyle or a box that grows needs more freedom than a corrective retouch.
  const strength = { restyle: 0.65, swap: 0.55, background: 0.6, erase: 0.6, expand: 0.5, color: 0.35,
    relight: 0.4, restore: 0.35, upscale: 0.25, product: 0.45, retouch: 0.3, text: 0.3 }[op];
  return { op, instruction: clean.slice(0, 600), strength, explicit };
}

// Text and logos cannot be drawn by an image model without being mangled (Persian script especially).
export const TEXT_ASK = new RegExp(
  '(?<![\\p{L}])(?:متن|نوشته|نوشتن|فونت|کپشن|تیتر|شعار|بنویس|بنویسی|واترمارک)(?![\\p{L}])' +
  '|(?<![a-z])(?:text|caption|watermark|typography|logo)(?![a-z])', 'iu');

// Words that cannot be drawn without ruining the photo; the honest answer to these is explained below.
const TEXT_REFUSAL = 'نوشتن متن/لوگو روی عکس را انجام نمی‌دهم: مدل‌های تصویر متن فارسی را ناخوانا و خراب می‌کنند و نتیجه بی‌کیفیت می‌شود. ' +
  'اگر بخواهی، همین عکس را بدون متن ویرایش می‌کنم («عکس بساز: ...» هم برای ساخت تصویر بدون متن هست) یا متن را جدا و تایپ‌شده تحویل می‌گیری — بگو کدام.';
const TEXT_NOTE = 'متن/لوگو روی عکس اضافه نشد (مدل تصویر متن را خراب می‌کند)؛ بقیهٔ ویرایش انجام شد.';

// ---------------------------------------------------------------------------------------------
// 2. The brief
// ---------------------------------------------------------------------------------------------

/**
 * Professional edit recipes, one per operation. Each one says what a good retoucher would do,
 * what must survive untouched, and what the result must never contain.
 */
export const EDIT_OPS = {
  text: {
    fa: 'افزودن متن (انجام نمی‌شود)',
    direct: 'improve the photograph professionally, keep every existing detail, and do NOT draw any new text, letters, numbers or logos',
    keep: ['everything already in the frame', 'existing text pixels'],
    avoid: ['drawing new text', 'garbled letters', 'watermark-like marks'],
  },
  retouch: {
    fa: 'ریتوش حرفه‌ای پرتره/سوژه',
    direct: 'retouch like a magazine retoucher: even out temporary blemishes, reduce distracting ' +
      'shine and small flyaway hairs, keep natural skin texture and pores (never plastic skin), ' +
      'keep the existing expression and lighting direction',
    keep: ['facial identity and features', 'natural skin texture', 'clothing', 'background', 'framing'],
    avoid: ['smoothing that erases pores', 'reshaping the face or body', 'changing age or ethnicity'],
  },
  product: {
    fa: 'عکس محصول استودیویی',
    direct: 'turn this into a clean e-commerce studio shot: seamless light-grey or white sweep ' +
      'background, large softbox key light from the upper left, soft fill, subtle rim highlight on ' +
      'the product edges, soft natural contact shadow, label and branding perfectly sharp',
    keep: ['product shape and proportions', 'colours and materials', 'label text and logo', 'packaging details'],
    avoid: ['inventing features the product does not have', 'heavy reflections', 'cropping the product'],
  },
  background: {
    fa: 'تعویض/اصلاح پس‌زمینه',
    direct: 'replace the background cleanly: keep the subject edges (hair, fur, thin details) ' +
      'perfectly intact, match the new background lighting direction and perspective to the subject, ' +
      'add a soft matching contact shadow so the subject sits in the scene instead of floating',
    keep: ['subject edges and hair detail', 'subject lighting', 'subject colours', 'pose'],
    avoid: ['halo or cut-out edges', 'impossible shadows', 'changing the subject itself'],
  },
  relight: {
    fa: 'نورپردازی دوباره',
    direct: 'relight the scene: warm golden-hour side light with soft falloff, lift the shadows so ' +
      'detail is visible, keep highlights unclipped, preserve realistic skin tones and the direction ' +
      'the light appears to come from',
    keep: ['facial identity', 'scene geometry', 'shadows that anchor objects', 'colours of objects'],
    avoid: ['flat grey light', 'blown highlights', 'two contradictory light directions'],
  },
  color: {
    fa: 'اصلاح و گرید رنگ',
    direct: 'apply a professional cinematic grade: lift and balance exposure, white balance correct, ' +
      'gentle teal shadows and warm highlights, protected natural skin tones, mild filmic contrast ' +
      'and slight clarity - no clipping, no blown channels',
    keep: ['natural skin tones', 'true colours of the products', 'detail in shadows and highlights'],
    avoid: ['oversaturation', 'orange skin', 'crushed blacks'],
  },
  restore: {
    fa: 'بازسازی عکس قدیمی',
    direct: 'restore this old photograph: remove dust, scratches, stains and fold marks, reduce ' +
      'compression noise, soften grain without destroying texture, recover faded contrast and colour, ' +
      'keep the honest look of a film photograph',
    keep: ['faces exactly as they are', 'era-accurate clothing and objects', 'film grain character', 'framing'],
    avoid: ['inventing missing faces or hands', 'modernising the scene', 'plastic over-smoothing'],
  },
  upscale: {
    fa: 'افزایش کیفیت و جزئیات',
    direct: 'increase perceived resolution and micro-detail: recover clean edges, sharpen texture ' +
      'sensibly (no halos), reduce noise, keep the image photometrically identical',
    keep: ['composition and framing', 'exact colours', 'any text or logo pixels', 'faces'],
    avoid: ['hallucinated detail on faces or text', 'sharpening halos', 'changing framing'],
  },
  erase: {
    fa: 'حذف شیء از عکس',
    direct: 'remove the unwanted object and rebuild what should be behind it: extend the surrounding ' +
      'texture, perspective lines and lighting seamlessly, so no trace of the removed object remains',
    keep: ['everything else in the frame', 'lighting and perspective', 'texture scale'],
    avoid: ['smudged clone patches', 'repeated patterns that look stamped', 'touching the subject'],
  },
  swap: {
    fa: 'تعویض شیء با شیء دیگر',
    direct: 'replace the object the user names with the requested one: match the original perspective, ' +
      'scale, lighting direction, colour temperature and shadow exactly so the swap looks native',
    keep: ['the rest of the scene', 'lighting direction', 'optical perspective'],
    avoid: ['pasted-on look', 'wrong scale', 'missing shadows'],
  },
  expand: {
    fa: 'بزرگ‌کردن کادر (outpaint)',
    direct: 'extend the frame naturally: continue the existing scene, texture, perspective and ' +
      'lighting into the new area, keeping the original pixels untouched and seamless',
    keep: ['original content unchanged', 'horizon and perspective', 'lighting direction', 'colour balance'],
    avoid: ['duplicated objects', 'visible seams', 'invented people'],
  },
  restyle: {
    fa: 'تغییر سبک هنری',
    direct: 'restyle the image while keeping the composition and subject recognisable: ' +
      'consistent artistic treatment across the whole frame, coherent light and palette, ' +
      'clean edges, no half-photographic artefacts',
    keep: ['composition', 'subject pose and silhouette', 'scene story'],
    avoid: ['muddy colours', 'mismatched styles inside one frame', 'unreadable detail'],
  },
};

export const DEFAULT_OP = 'retouch';

/** The instruction handed to the image model: recipe + user's words + protection + bans. */
export function editInstruction(op, instruction, brief = null) {
  const recipe = EDIT_OPS[op] || EDIT_OPS[DEFAULT_OP];
  const parts = [
    `Edit this photograph: ${recipe.direct}.`,
    instruction ? `The user asked for: ${instruction}.` : '',
    brief && brief.problems && brief.problems.length ? `Fix these specific problems: ${brief.problems.join('; ')}.` : '',
    brief && brief.lighting ? `Lighting: ${brief.lighting}.` : '',
    brief && brief.color ? `Colour: ${brief.color}.` : '',
    brief && brief.aspect ? `Frame: ${brief.aspect}.` : '',
    `Do not change: ${[...recipe.keep, ...((brief && brief.must_keep) || [])].slice(0, 8).join(', ')}.`,
    `Avoid: ${recipe.avoid.join(', ')}.`,
    'Keep it photorealistic and natural; do not add any text, letters, numbers, logos or watermarks.',
    brief && brief.fix ? `Extra correction from review: ${brief.fix}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

const BRIEF_SYSTEM = 'You are a senior photo retoucher preparing an edit plan for another retoucher. ' +
  'Look at the photograph and the user\'s request. Answer with ONE JSON object and nothing else:\n' +
  '{"subject":"what the photo is really about","must_keep":["identity","key objects","text already in the photo"],' +
  '"problems":["concrete flaws worth fixing, at most 4"],"lighting":"one short line","color":"one short line",' +
  '"aspect":"current framing and whether it should change","risks":["what could go wrong"]}\n' +
  'Rules: never plan to change a person\'s identity, age, ethnicity or body; never plan to add text or logos; ' +
  'keep every concrete detail the user asked for; be specific and physical, no marketing words.';

function extractJson(text) {
  const raw = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

/**
 * Stage 1 - study the photo and write the brief. Never throws: if the vision model is unavailable
 * or answers rubbish, the recipe alone is used, so an edit can still be attempted.
 */
export async function photoBrief(env, ask, image, mime, instruction, op = DEFAULT_OP) {
  const fallback = { subject: '', must_keep: [], problems: [], lighting: '', color: '', aspect: '', risks: [], derived: false };
  if (!ask) return fallback;
  try {
    const user = `Retoucher request: ${instruction || EDIT_OPS[op].fa}. Planned operation: ${EDIT_OPS[op].fa}. ` +
      'Write the JSON brief for this photo.';
    const text = await ask(env, [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: image } }, { text: user }] }], BRIEF_SYSTEM, false);
    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6) : []);
    return {
      subject: String(parsed.subject || '').slice(0, 200),
      must_keep: arr(parsed.must_keep),
      problems: arr(parsed.problems),
      lighting: String(parsed.lighting || '').slice(0, 160),
      color: String(parsed.color || '').slice(0, 160),
      aspect: String(parsed.aspect || '').slice(0, 120),
      risks: arr(parsed.risks),
      derived: true,
    };
  } catch (err) {
    console.error('[Hermes] photo brief failed:', err.message);
    return fallback;
  }
}

// ---------------------------------------------------------------------------------------------
// 3. Execution
// ---------------------------------------------------------------------------------------------

const sniff = (bytes) => {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46) return 'image/webp';
  return 'image/jpeg';
};
const toBase64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
export const base64Bytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Gemini image models: the only free chain that both understands an edit instruction and returns pixels. */
export async function geminiEdit(env, image, mime, instruction, models = []) {
  if (!env.GEMINI_API_KEY) throw new Error('no Gemini key');
  const list = models.length ? models : (await geminiImageList(env));
  let last = null;
  for (const model of list) {
    const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: image } }, { text: instruction }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });
    if (!res.ok) { last = new Error(`${model}: ${res.status}`); continue; }
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const img = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!img) { last = new Error(`${model}: no image (probably refused the edit)`); continue; }
    if (env.MEMORY) await env.MEMORY.put('edit-model', model);
    return { image: img.inlineData.data, mime: img.inlineData.mimeType || 'image/png', model: `Gemini ${model}` };
  }
  throw new Error(`هیچ مدل تصویر جمینی برای ویرایش جواب نداد${last ? ` (${last.message})` : ''}.`);
}

/** Image-capable Gemini models for this key, cached a day; the model that last worked goes first. */
export async function geminiImageList(env) {
  const cacheKey = 'edit-image-models';
  let models = env.MEMORY ? await env.MEMORY.get(cacheKey, 'json') : null;
  if (!models) {
    const res = await fetch(`${GEMINI_API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
    if (!res.ok) throw new Error(`فهرست مدل‌های جمینی در دسترس نیست (${res.status}).`);
    const data = await res.json();
    const version = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
    models = (data.models || [])
      .filter((m) => /image/i.test(m.name) && !/imagen/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .sort((a, b) => version(b) - version(a) || /pro/.test(b) - /pro/.test(a) || a.localeCompare(b));
    if (env.MEMORY && models.length) await env.MEMORY.put(cacheKey, JSON.stringify(models), { expirationTtl: 86400 });
  }
  const last = env.MEMORY ? await env.MEMORY.get('edit-model') : null;
  return last && models.includes(last) ? [last, ...models.filter((m) => m !== last)] : models;
}

// Workers AI image-to-image models, best first. `strength` is how far the model may travel from the
// original: low keeps it, high rebuilds it (skill library: img2img strength semantics).
export const CF_EDIT_MODELS = [
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'flux-1-schnell', key: 'image', guidanceKey: null },
  { id: '@cf/runwayml/stable-diffusion-v1-5-img2img', name: 'sd-v1-5-img2img', key: 'image', guidanceKey: 'guidance' },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'sdxl-base', key: 'image', guidanceKey: 'guidance' },
];

/** Free fallback: Workers AI image-to-image with the original pixels as input. */
export async function cfEdit(env, bytes, instruction, strength = 0.4) {
  if (!env.AI) throw new Error('no Workers AI binding');
  const errors = [];
  for (const m of CF_EDIT_MODELS) {
    try {
      const params = { prompt: String(instruction).slice(0, 1800), image: [...bytes], strength };
      if (m.guidanceKey) params[m.guidanceKey] = 7.5;
      const out = await env.AI.run(m.id, params);
      const got = await imageOut(out);
      if (got) return { ...got, model: m.name };
      errors.push(`${m.name}: empty`);
    } catch (err) {
      errors.push(`${m.name}: ${String(err.message).slice(0, 80)}`);
    }
  }
  throw new Error(`Workers AI img2img: ${errors.join('، ')}`);
}

// Workers AI answers as base64, a stream or raw bytes depending on the model.
async function imageOut(out) {
  if (!out) return null;
  if (typeof out.image === 'string' && out.image) {
    const bytes = base64Bytes(out.image);
    if (bytes.length < 1000) return null;
    return { image: out.image, mime: sniff(bytes) };
  }
  let bytes = null;
  if (out instanceof Uint8Array) bytes = out;
  else if (out instanceof ArrayBuffer) bytes = new Uint8Array(out);
  else if (typeof out.getReader === 'function') bytes = new Uint8Array(await new Response(out).arrayBuffer());
  if (!bytes || bytes.length < 1000) return null;
  return { image: toBase64(bytes), mime: sniff(bytes) };
}

/** Provider chain for an edit: Gemini first (instruction-following), Workers AI second (free). */
export async function runEdit(env, image, mime, instruction, strength) {
  const errors = [];
  if (env.GEMINI_API_KEY) {
    try { return { ...(await geminiEdit(env, image, mime, instruction)), provider: 'gemini' }; }
    catch (err) { errors.push(String(err.message)); console.error('[Hermes] Gemini edit failed:', err.message); }
  }
  if (env.AI) {
    try { return { ...(await cfEdit(env, base64Bytes(image), instruction, strength)), provider: 'workers-ai' }; }
    catch (err) { errors.push(String(err.message)); console.error('[Hermes] Workers AI edit failed:', err.message); }
  }
  throw new Error(`ویرایش انجام نشد؛ هیچ مدلی جواب نداد (${errors.join(' | ') || 'کلید جمینی یا Workers AI لازم است'})`);
}

// ---------------------------------------------------------------------------------------------
// 4. Review - a retoucher checks their own work before delivery
// ---------------------------------------------------------------------------------------------

const REVIEW_SYSTEM = 'You are the senior retoucher reviewing a colleague\'s edit. Compare the two images ' +
  '(first = original, second = edit). Answer with ONE JSON object only: ' +
  '{"keep":true|false,"score":0-100,"issues":["concrete problems, empty if none"],"fix":"one sentence instruction to repair the biggest issue"}. ' +
  'Reject the edit (keep=false) when: the person\'s identity/features changed, the composition jumped, ' +
  'text or logos became corrupted, the scene gained objects nobody asked for, or the edit is barely different ' +
  'from the original when a real change was requested. Judge only what is visible.';

/**
 * Compare before/after and decide whether to deliver or repair. Never throws: a review that cannot be
 * parsed accepts the edit (a broken reviewer must not block the user's picture).
 */
export async function reviewEdit(env, ask, before, beforeMime, after, afterMime, request = '') {
  const fallback = { keep: true, score: 0, issues: [], fix: '', derived: false };
  if (!ask) return fallback;
  try {
    const parts = [
      { inlineData: { mimeType: beforeMime, data: before } },
      { inlineData: { mimeType: afterMime, data: after } },
      { text: `The user asked for: ${request || 'a professional edit'}. Review the edit.` },
    ];
    const text = await ask(env, [{ role: 'user', parts }], REVIEW_SYSTEM, false);
    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((x) => typeof x === 'string').slice(0, 5) : [];
    const score = Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(100, Number(parsed.score))) : 0;
    return { keep: parsed.keep !== false, score, issues, fix: String(parsed.fix || '').slice(0, 240), derived: true };
  } catch (err) {
    console.error('[Hermes] photo review failed:', err.message);
    return fallback;
  }
}

// ---------------------------------------------------------------------------------------------
// 5. The whole pipeline
// ---------------------------------------------------------------------------------------------

export const MAX_ATTEMPTS = 2;

/**
 * BRIEF → EDIT → REVIEW (→ one corrective retry) → DELIVER.
 * `ask` is the multimodal brain (brain.mjs `ask`). Returns a delivery object, never a false claim:
 * if no provider produces pixels the promise rejects with the collected reasons.
 */
export async function polishPhoto(env, ask, image, mime, request, { op = null, attempts = MAX_ATTEMPTS } = {}) {
  const detected = op ? { op, instruction: request, strength: 0.4 } : editRequest(request);
  const plan = detected || { op: DEFAULT_OP, instruction: request, strength: 0.35 };
  if (image && image.length > EDIT_MAX_BYTES * 4 / 3) throw new Error('عکس خیلی بزرگ است (حداکثر ۸ مگابایت).');
  if (plan.op === 'text') return { kind: 'text-refused', op: 'text', opLabel: EDIT_OPS.text.fa, model: null, image: null, message: TEXT_REFUSAL };
  const textNote = TEXT_ASK.test(normalizeFa(request || '')) ? TEXT_NOTE : '';
  const brief = await photoBrief(env, ask, image, mime, plan.instruction, plan.op);
  let instruction = editInstruction(plan.op, plan.instruction, brief);
  const tried = [];
  let current = null;
  let review = null;
  let repaired = false;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    current = await runEdit(env, image, mime, instruction, plan.strength);
    tried.push({ attempt, model: current.model, provider: current.provider });
    review = await reviewEdit(env, ask, image, mime, current.image, current.mime, plan.instruction);
    if (review.keep || attempt === attempts) break;
    repaired = true;
    // Repair pass: the reviewer's note becomes a binding correction for the next attempt.
    instruction = editInstruction(plan.op, plan.instruction, { ...brief, fix: review.fix || 'keep the original composition and identity exactly' });
    console.error('[Hermes] edit rejected by review, retrying:', review.issues.join('; '));
  }
  return {
    kind: repaired ? 'repaired' : 'edited',
    op: plan.op, opLabel: EDIT_OPS[plan.op].fa,
    image: current.image, mime: current.mime, model: current.model, provider: current.provider,
    brief, review, attempted: tried, textNote,
  };
}

/** Short Persian delivery caption: what changed, what was protected, what to try next. */
export function editCaption(result) {
  const lines = [`✅ ویرایش انجام شد — ${result.opLabel} (${result.model})`];
  if (result.brief && result.brief.problems && result.brief.problems.length) {
    lines.push('', '🔧 اصلاح‌ها:', ...result.brief.problems.slice(0, 4).map((p) => `• ${p}`));
  }
  if (result.review && result.review.issues && result.review.issues.length) {
    lines.push('', '🔍 نکتهٔ بازبینی:', ...result.review.issues.slice(0, 3).map((i) => `• ${i}`));
  }
  if (result.kind === 'repaired') lines.push('', '(یک بار دیگر با اصلاح بازبینی تلاش شد.)');
  if (result.textNote) lines.push('', `ℹ️ ${result.textNote}`);
  lines.push('', 'اگر بخواهی می‌توانم: روشن‌تر/تاریک‌تر، پس‌زمینهٔ دیگر، نسخهٔ پرتره یا استوری، ' +
    'یا ریتوش سبک‌تر کنم — فقط بگو.');
  return lines.join('\n');
}

/** Everything the worker needs to answer a photo edit turn, in one call. */
export async function handlePhotoEdit(env, ask, image, mime, request) {
  const plan = editRequest(request);
  if (!plan) return null;
  const result = await polishPhoto(env, ask, image, mime, request, { op: plan.op });
  return { ...result, caption: result.kind === 'text-refused' ? result.message : editCaption(result) };
}

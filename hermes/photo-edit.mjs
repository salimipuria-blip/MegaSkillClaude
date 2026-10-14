// Professional photo editing for Hermes: the user sends THEIR OWN photo with an instruction and
// gets an edited picture back (Cloudflare Workers, no native image libraries needed).
//
// The pipeline is the retouching studio loop, not a single model call:
//
//   1. BRIEF    a vision model studies the photo and the words and writes a strict brief
//               (subject + type, must-keep, concrete problems, light, colour, frame, region,
//               how far the change should travel, whether text already exists, risks).
//   2. PLAN     the operation recipe, the img2img strength and both prompt dialects are derived
//               from that brief - a small correction stays small, a restyle is allowed to travel.
//   3. CANDIDATES  up to N versions are generated along a conservative -> balanced -> bold ladder
//               (N=1 by default, 3 when the user asks for variations), stopping early as soon as a
//               version clears the quality bar, so quota is spent where quality is actually missing.
//   4. REVIEW   every version is scored against a weighted rubric in front of the original
//               (instruction fidelity, identity, artefacts, light, frame) with a dedicated
//               identity check for people; the reviewer's note becomes the correction for the retry.
//   5. DELIVER  the best version is measured for real (decoded width/height), then delivered as a
//               before/after album with a Persian retoucher note.
//
// Craft rules encoded here come from the skill library in this repository:
//   library/github-skills/image-studio      (operation matrix: img2img / inpaint / search-replace /
//                                            erase / upscale / remove-bg; when to use which)
//   library/github-skills/stability-ai      (strength semantics for img2img edits)
//   library/github-skills/generate-image    (photoreal prompt structure, negatives)
//   library/github-skills/product-photo-studio + ecommerce-listing-image-set (studio product recipes)
//   library/github-skills/ai-photo-restyler (restoration / restyle discipline: keep identity)
//   library/github-skills/prompt-master     (enrich the prompt, never change the concept)
//
// Hard rules (the same honesty rule as the rest of this repo):
//   * No edited image is ever claimed unless real bytes came back from a provider, and the bytes
//     are decoded to prove they are a real image of a sane size.
//   * Identity is locked: faces, body shape, age and ethnicity are never altered unless the user
//     explicitly asks for a restyle/artistic look.
//   * No text, letters, logos or watermarks are drawn into the image: image models corrupt Persian
//     text, so a request for text is refused with an explanation instead of a broken result.
//   * Quality is only ever stated when the reviewer actually scored the delivered image.

import { imageInfo, frameDrift, faDigits, mimeOf, bytesToBase64, EDIT_MAX_BYTES, base64Bytes as decode64 } from './image-bytes.mjs';
import { upscaleImage, worthUpscaling } from './upscale.mjs';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
export { EDIT_MAX_BYTES, imageInfo, frameDrift, faDigits, base64Bytes } from './image-bytes.mjs';
/** A version that does not reach this score is retried or replaced before delivery. */
export const QUALITY_BAR = 82;
/** Below this a version is considered damaged and is never delivered while another one exists. */
export const MIN_DELIVER = 55;
export const MAX_CANDIDATES = 3;
const MAX_PROMPT = 1200;

// ---------------------------------------------------------------------------------------------
// 0. Reading the pixels we already have (zero dependency image forensics)
// ---------------------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------------------
// 1. What did the user ask for?
// ---------------------------------------------------------------------------------------------

/** Fold Persian spelling variants (ZWNJ, harakat, Arabic yeh/kaf) so every phrasing matches. */
export const normalizeFa = (s) => String(s || '')
  .replace(/[\u200c\u200e\u200f\u2060]/g, ' ')
  .replace(/[\u064b-\u0655\u0640]/g, '')
  .replace(/[\u064a\u0649]/g, '\u06cc').replace(/\u0643/g, '\u06a9')
  .replace(/\s+/g, ' ');

// Persian and English phrasings that mean "edit the photo I am sending".
const EDIT_VERB = '(?:ویرایش|ادیت|اصلاح|ریتوش|رتوش|retouch|edit|اصلاح\\s*کن|درست\\s*کن|بهبود\\s*بده|بهتر\\s*کن|قشنگ\\s*تر\\s*کن|حرفه\\s*ای\\s*تر|بازسازی|زنده\\s*کن|قوی\\s*تر|شارپ\\s*تر|واضح\\s*تر)';
const EDIT_NOUN = '(?:عکس|تصویر|این|اون|همین|photo|picture|image|it|this)';
const EDIT_INTENT_FA = new RegExp(`${EDIT_NOUN}[^.!؟?\\n]{0,40}?${EDIT_VERB}`, 'i');
// "آماده کن / بده" on a photo (a frame change, a variation set) is an edit request as well.
const EDIT_DELIVER = /(?:(?:آماده|اماده|درست|جور|اوکی)\s*کن|(?<![\p{L}])بده(?![\p{L}])|(?<![a-z])ready(?![a-z])|(?<![a-z])make(?![a-z]))/iu;
const EDIT_EXPLICIT = /^\/(?:edit|polish|retouch)(?:@\w+)?\b/i;
// Changes that are unambiguously edits even without the word "edit".
const EDIT_OPERATIONS = [
  ['background', /(?:پس\s*زمینه|پشت\s*صحنه|بک\s*گراند|background|bg\s*remov|remove\s*bg|حذف\s*پس\s*زمینه|پسزمینه\s*رو\s*عوض|پسزمینه\s*عوض)/i],
  ['relight', /(?:نور|روشنایی|روشن\s*تر|تاریک\s*تر|تاریک|تیره|نورپردازی|golden\s*hour|lighting|relight|نور\s*طلایی|سایه|warm(?:er)?|cool(?:er)?|brighter|darker)/i],
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
// Where in the frame the change belongs. Captured so the model changes only that place.
const REGION = /(?:گوشه(?:\s*ی)?\s*\S+|سمت\s*\S+|ناحیهٔ?\s*\S+|بخش\s*\S+|پشت\s*سر|دور\s*و\s*بر|بالا\s*\S*|پایین\s*\S*|وسط|راست|چپ|top|bottom|left|right|corner|center|foreground)/i;
// "چند نسخه / سه حالت" = the studio variations set.
const VARIANTS = /(?:چند\s*(?:نسخه|حالت|فقط\s*نسخه)|سه\s*(?:نسخه|حالت)|واریاسیون|گزینه\s*ها?|variation|versions?|options?|alternatives?|different\s+takes?)/i;
// Iteration deltas: "ملایمترش کن" / "بیشتر" adjust the strength instead of inventing a new edit.
const DELTA_SOFT = /(?:ملایم|کمتر|سبک|آرام|subtle|gentle|softer|less)/i;
const DELTA_BOLD = /(?:بیشتر|قوی\s*تر|شدید|حسابی|جسور|bold|stronger|more\s+intense|heavier)/i;
// Output frames the user asks for.
const ASPECTS = [[/9\s*[:x×]\s*16|استوری|story|ریلز|reels?|عمودی/i, '9:16'], [/1\s*[:x×]\s*1|مربع|square/i, '1:1'],
  [/4\s*[:x×]\s*5|پست\s*اینستا|instagram\s*post/i, '4:5'], [/16\s*[:x×]\s*9|بنر|banner|افقی|lan(d)?scape|wide/i, '16:9']];

export const TEXT_ASK = new RegExp(
  '(?<![\\p{L}])(?:متن|نوشته|نوشتن|فونت|کپشن|تیتر|شعار|بنویس|بنویسی|واترمارک)(?![\\p{L}])' +
  '|(?<![a-z])(?:text|caption|watermark|typography|logo)(?![a-z])', 'iu');

// Text is NOT drawn by the image model (it mangles Persian script) - it is set as a real font layer
// by textlayer.mjs after the edit. A request for a logo/graphic stays unsupported.
const TEXT_NOTE = 'متن با فونت واقعی روی عکس نوشته می‌شود (نه با مدل تصویر)؛ لوگو/گرافیک رسم نمی‌شود.';

/** Base strength per operation: how much freedom the model gets to travel from the original. */
export const OP_STRENGTH = { restyle: 0.6, swap: 0.52, background: 0.55, erase: 0.55, expand: 0.45, color: 0.32,
  relight: 0.38, restore: 0.35, upscale: 0.22, product: 0.42, retouch: 0.28, text: 0.3 };

/**
 * Detect an edit request for a photo the user just sent.
 * Returns null when the text is not an edit request, else:
 * { op, instruction, strength, region, variants, delta, aspect, textAsk, explicit }.
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
  const aspect = (ASPECTS.find(([re]) => re.test(t)) || ['', ''])[1];
  const variants = VARIANTS.test(t);
  const frameOrSet = photoWord && (aspect || variants) && EDIT_DELIVER.test(t);
  if (!(explicit || ops.length || EDIT_INTENT_FA.test(t) || (textAsk && photoWord) || frameOrSet)) return null;
  const clean = raw.replace(EDIT_EXPLICIT, '').replace(/^[\s:：،,.\-]+/, '').trim();
  // Text with no visual operation of its own is its own case: explained, not drawn.
  let op = ops.length ? ops[0][0] : textAsk ? 'text' : aspect ? 'expand' : 'retouch';
  // A request can hold several jobs ("retouch the face AND light it better"): the retouch stays the
  // headline and the other recipes travel with it, so one edit answers the whole sentence.
  if (op !== 'text' && ops.some(([name]) => name === 'retouch')) op = 'retouch';
  const also = ops.map(([name]) => name).filter((name) => name !== op).slice(0, 2);
  const region = (t.match(REGION) || [''])[0].trim().slice(0, 80);
  const soft = DELTA_SOFT.test(t), bold = DELTA_BOLD.test(t);
  const delta = soft && !bold ? -1 : bold && !soft ? 1 : 0;
  return { op, also, instruction: clean.slice(0, 600), strength: OP_STRENGTH[op], region, variants, delta,
    aspect, textAsk: textAsk && !ops.length, explicit };
}

// ---------------------------------------------------------------------------------------------
// 2. The recipe book
// ---------------------------------------------------------------------------------------------

/**
 * Professional edit recipes, one per operation. Each one says what a good retoucher would do,
 * what must survive untouched, and what the result must never contain.
 */
export const EDIT_OPS = {
  text: {
    fa: 'لایهٔ متن (با فونت واقعی)',
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

// ---------------------------------------------------------------------------------------------
// 3. Two prompt dialects (instruction models vs. image-description models)
// ---------------------------------------------------------------------------------------------

/** The instruction handed to an instruction-following image model (Gemini image family). */
export function editInstruction(op, instruction, brief = null, { region = '', aspect = '', extra = '', also = [] } = {}) {
  const recipe = EDIT_OPS[op] || EDIT_OPS[DEFAULT_OP];
  const parts = [
    `Edit this photograph: ${recipe.direct}.`,
    instruction ? `The user asked for: ${instruction}.` : '',
    brief && brief.problems && brief.problems.length ? `Fix these specific problems: ${brief.problems.join('; ')}.` : '',
    brief && brief.lighting ? `Lighting: ${brief.lighting}.` : '',
    brief && brief.color ? `Colour: ${brief.color}.` : '',
    aspect ? `Final frame: ${aspect} (crop or extend as needed, never distort faces).` : (brief && brief.aspect ? `Frame: ${brief.aspect}.` : ''),
    also.length ? `The same edit must also do: ${also.map((o) => (EDIT_OPS[o] || {}).direct).filter(Boolean).join('; ')}.` : '',
    region ? `Change ONLY this area: ${region}. Everything outside that area must stay pixel-identical.` : '',
    `Do not change: ${[...recipe.keep, ...((brief && brief.mustKeep) || [])].slice(0, 8).join(', ')}.`,
    `Avoid: ${recipe.avoid.join(', ')}.`,
    'Keep it photorealistic and natural; do not add any text, letters, numbers, logos or watermarks.',
    extra,
    brief && brief.fix ? `Extra correction from review: ${brief.fix}.` : '',
  ];
  return parts.filter(Boolean).join(' ').slice(0, MAX_PROMPT * 2);
}

/**
 * The same plan written for a prompt-driven img2img model (Stable Diffusion family on Workers AI):
 * those models do not follow instructions, they paint what the prompt describes, so the prompt
 * describes the RESULT image (skill library: image-studio prompt structure) with the negatives
 * spelled out at the end.
 */
export function cfPrompt(op, instruction, brief = null, { region = '', also = [] } = {}) {
  const recipe = EDIT_OPS[op] || EDIT_OPS[DEFAULT_OP];
  const subject = (brief && brief.subject) || (instruction ? instruction.slice(0, 120) : 'the same subject');
  const look = {
    product: 'clean seamless studio background, large softbox light, soft contact shadow, catalogue product photograph',
    background: 'new clean background, subject edges intact, matching light and perspective',
    relight: 'warm golden-hour side light, soft shadows, gentle highlight roll-off',
    color: 'cinematic colour grade, teal shadows, warm highlights, natural skin tones',
    restore: 'restored vintage film photograph, clean and sharp, honest grain',
    upscale: 'sharp, high detail, clean edges, natural texture',
    erase: 'clean seamless area where the object was, matching texture and light',
    swap: 'the requested object in place, matching scale, light and shadow',
    expand: 'wider view of the same scene, seamless continuation',
    restyle: 'consistent artistic styling across the whole frame',
    retouch: 'natural retouched portrait, even skin with visible pores, soft light',
  }[op] || 'professional retouched photograph';
  const alsoLooks = also.map((o) => ({ relight: 'warm cinematic light', color: 'cinematic colour grade',
    product: 'clean studio background and light', background: 'clean new background', restore: 'restored clean detail',
    upscale: 'extra sharpness and detail', retouch: 'natural retouched skin', erase: 'clean seamless areas',
    swap: 'the replaced object matching the light' }[o])).filter(Boolean);
  const parts = [
    `professional ${recipe.fa && op === 'product' ? 'e-commerce' : 'photographic'} edit of ${subject}`,
    instruction ? `showing ${instruction.slice(0, 140)}` : '',
    look, ...alsoLooks,
    region ? `change only ${region}, the rest of the frame stays exactly the same` : 'same composition, same framing, same subject',
    'photorealistic, sharp focus, high detail, correct proportions, natural skin texture',
    'no text, no letters, no watermark, no logo, no extra people, no extra limbs, no blur, no distortion, no oversaturation',
  ];
  return parts.filter(Boolean).join(', ').slice(0, MAX_PROMPT);
}

// ---------------------------------------------------------------------------------------------
// 4. Stage 1 - the brief
// ---------------------------------------------------------------------------------------------

const BRIEF_SYSTEM = 'You are a senior photo retoucher preparing an edit plan for another retoucher. ' +
  'Look at the photograph and the user\'s request. Answer with ONE JSON object and nothing else:\n' +
  '{"subject":"what the photo is really about","subject_type":"person|product|scene|animal|document|other",' +
  '"must_keep":["identity","key objects","text that already exists"],"problems":["concrete flaws worth fixing, at most 4"],' +
  '"lighting":"one short line","color":"one short line","aspect":"current framing","region":"where the change belongs",' +
  '"change_scale":"small|medium|large","has_text":true|false,"region_tone":"light|dark|mixed",' +
  '"risks":["what could go wrong"]}\n' +
  'Rules: never plan to change a person\'s identity, age, ethnicity or body; never plan to add text or logos; ' +
  'keep every concrete detail the user asked for; be specific and physical, no marketing words.';

function extractJson(text) {
  const raw = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

export const emptyBrief = () => ({ subject: '', subjectType: 'other', mustKeep: [], problems: [], lighting: '',
  color: '', aspect: '', region: '', changeScale: 0, hasText: false, regionTone: 'mixed', risks: [], derived: false });

/**
 * Study the photo and write the brief. Never throws: if the vision model is unavailable or answers
 * rubbish, the recipe alone is used, so an edit can still be attempted.
 */
export async function photoBrief(env, ask, image, mime, instruction, op = DEFAULT_OP) {
  if (!ask) return emptyBrief();
  try {
    const user = `Retoucher request: ${instruction || EDIT_OPS[op].fa}. Planned operation: ${EDIT_OPS[op].fa}. ` +
      'Write the JSON brief for this photo.';
    const text = await ask(env, [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: image } }, { text: user }] }], BRIEF_SYSTEM, false);
    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== 'object') return emptyBrief();
    const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6) : []);
    const scale = { small: 0.25, medium: 0.55, large: 0.85 }[String(parsed.change_scale || '').toLowerCase()] ?? 0.55;
    return {
      subject: String(parsed.subject || '').slice(0, 200),
      subjectType: String(parsed.subject_type || 'other').toLowerCase().slice(0, 20),
      mustKeep: arr(parsed.must_keep),
      problems: arr(parsed.problems),
      lighting: String(parsed.lighting || '').slice(0, 160),
      color: String(parsed.color || '').slice(0, 160),
      aspect: String(parsed.aspect || '').slice(0, 120),
      region: String(parsed.region || '').slice(0, 120),
      changeScale: scale,
      hasText: parsed.has_text === true,
      regionTone: ['light', 'dark', 'mixed'].includes(String(parsed.region_tone || '').toLowerCase())
        ? String(parsed.region_tone).toLowerCase() : 'mixed',
      risks: arr(parsed.risks),
      derived: true,
    };
  } catch (err) {
    console.error('[Hermes] photo brief failed:', err.message);
    return emptyBrief();
  }
}

/**
 * Stage 2 - the plan: how far this edit may travel. A corrective retouch on a clean photo stays
 * small; a restyle, or a brief that says the photo needs a lot of work, is allowed to travel.
 */
export function planStrength(op, { delta = 0, changeScale = 0.55 } = {}) {
  const base = OP_STRENGTH[op] ?? 0.3;
  // A problematic photo (quality 0..1 from the brief) may travel further, a clean one stays put.
  const scale = 1 + (changeScale - 0.55) * 0.5;
  const deltaFactor = delta < 0 ? 0.62 : delta > 0 ? 1.45 : 1;
  return Math.max(0.12, Math.min(0.75, base * scale * deltaFactor));
}

// ---------------------------------------------------------------------------------------------
// 5. Stage 3 - execution
// ---------------------------------------------------------------------------------------------

const base64Bytes = decode64;
/** Proven pixels or nothing: base64 -> bytes -> decoded dimensions. */
function verified(imageB64, mime) {
  const bytes = base64Bytes(imageB64);
  const info = imageInfo(bytes);
  if (!info || info.width < 64 || info.height < 64) return null;
  if (bytes.length < 1000) return null;
  return { image: imageB64, mime: info.mime || mime || mimeOf(bytes), info };
}

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
    const out = verified(img.inlineData.data, img.inlineData.mimeType);
    if (!out) { last = new Error(`${model}: unusable pixels`); continue; }
    if (env.MEMORY) await env.MEMORY.put('edit-model', model);
    return { ...out, model: `Gemini ${model}`, provider: 'gemini' };
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
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'flux-1-schnell', steps: 4 },
  { id: '@cf/runwayml/stable-diffusion-v1-5-img2img', name: 'sd-v1-5-img2img', guidance: 7.5, steps: 20 },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'sdxl-base', guidance: 7.5, steps: 20 },
];

/** Workers AI answers as base64, a stream or raw bytes depending on the model. */
async function imageOut(out) {
  if (!out) return null;
  if (typeof out.image === 'string' && out.image) return verified(out.image, null);
  let bytes = null;
  if (out instanceof Uint8Array) bytes = out;
  else if (out instanceof ArrayBuffer) bytes = new Uint8Array(out);
  else if (typeof out.getReader === 'function') bytes = new Uint8Array(await new Response(out).arrayBuffer());
  if (!bytes) return null;
  return verified(bytesToBase64(bytes), mimeOf(bytes));
}

/**
 * Free fallback: Workers AI image-to-image with the original pixels as input. The prompt is the
 * result-description dialect. Advanced parameters are sent optimistically and dropped once if the
 * model rejects them, so an unsupported knob degrades instead of failing the whole edit.
 */
export async function cfEdit(env, bytes, prompt, strength = 0.4) {
  if (!env.AI) throw new Error('no Workers AI binding');
  const errors = [];
  for (const m of CF_EDIT_MODELS) {
    const base = { prompt: String(prompt).slice(0, MAX_PROMPT), image: [...bytes], strength };
    const extras = { ...(m.guidance ? { guidance: m.guidance } : {}), ...(m.steps ? { num_steps: m.steps } : {}),
      negative_prompt: 'text, letters, watermark, logo, extra limbs, distorted face, blurry, low quality, oversaturated' };
    for (const params of [{ ...base, ...extras }, base]) {
      try {
        const out = await imageOut(await env.AI.run(m.id, params));
        if (out) return { ...out, model: m.name, provider: 'workers-ai' };
        errors.push(`${m.name}: empty`);
        break; // an empty answer is not a parameter problem - move to the next model
      } catch (err) {
        errors.push(`${m.name}: ${String(err.message).slice(0, 80)}`);
      }
    }
  }
  throw new Error(`Workers AI img2img: ${errors.join('، ')}`);
}

/** Provider chain for one attempt: Gemini first (instruction-following), Workers AI second (free). */
export async function runEdit(env, image, mime, { gemini, cf, strength }) {
  const errors = [];
  if (env.GEMINI_API_KEY) {
    try { return await geminiEdit(env, image, mime, gemini); }
    catch (err) { errors.push(String(err.message)); console.error('[Hermes] Gemini edit failed:', err.message); }
  }
  if (env.AI) {
    try { return await cfEdit(env, base64Bytes(image), cf || gemini, strength); }
    catch (err) { errors.push(String(err.message)); console.error('[Hermes] Workers AI edit failed:', err.message); }
  }
  throw new Error(`ویرایش انجام نشد؛ هیچ مدلی جواب نداد (${errors.join(' | ') || 'کلید جمینی یا Workers AI لازم است'})`);
}

// ---------------------------------------------------------------------------------------------
// 6. Stage 4 - review: the retoucher checks their own work against a rubric
// ---------------------------------------------------------------------------------------------

/** Weighted rubric. Identity only counts when there is a person to protect, and it gates delivery. */
export const RUBRIC = {
  instruction: { weight: 0.30, fa: 'انجام درخواست' },
  identity: { weight: 0.25, fa: 'حفظ هویت' },
  artifacts: { weight: 0.20, fa: 'نبود آرتیفکت' },
  light: { weight: 0.15, fa: 'نور و رنگ' },
  frame: { weight: 0.10, fa: 'کادر و ترکیب' },
};
export const IDENTITY_FLOOR = 60;

const REVIEW_SYSTEM = 'You are the senior retoucher reviewing a colleague\'s edit. Compare the two images ' +
  '(first = original, second = edit) and answer with ONE JSON object only: ' +
  '{"instruction":0-100,"identity":0-100,"artifacts":0-100,"light":0-100,"frame":0-100,' +
  '"keep":true|false,"issues":["concrete problems, empty if none"],"fix":"one sentence instruction to repair the biggest issue"} ' +
  'Score meaning: instruction = how completely the request was done; identity = how exactly the person, ' +
  'their features, age and body were preserved (100 when there is no person); artifacts = absence of ' +
  'smudges, warped edges, duplicated or invented objects, corrupted text; light = coherent, believable ' +
  'light and colour; frame = composition, crop and horizon quality. ' +
  'Set keep=false when identity drops, the composition jumps, existing text is corrupted, the scene gained ' +
  'objects nobody asked for, or the change is barely visible when a real change was requested. ' +
  'Judge only what is visible.';

/** Weight of each rubric part, renormalised: identity is skipped when no person is in the frame. */
export function rubricWeights(subjectType) {
  const keys = Object.keys(RUBRIC);
  const used = subjectType === 'person' || subjectType === 'people' ? keys : keys.filter((k) => k !== 'identity');
  const total = used.reduce((s, k) => s + RUBRIC[k].weight, 0);
  return Object.fromEntries(used.map((k) => [k, RUBRIC[k].weight / total]));
}

export function scoreParts(parts, subjectType) {
  const weights = rubricWeights(subjectType);
  const num = Object.entries(weights).reduce((s, [k, w]) => s + w * (Number(parts[k]) || 0), 0);
  return Math.round(Math.max(0, Math.min(100, num)));
}
export const band = (score) => (score >= 90 ? 'عالی' : score >= QUALITY_BAR ? 'حرفه‌ای' : score >= 70 ? 'خوب' : 'قابل‌قبول');

/**
 * Compare before/after and decide whether to deliver or repair. Never throws: a review that cannot
 * be parsed accepts the edit (a broken reviewer must not block the user's picture).
 */
export async function reviewEdit(env, ask, before, beforeMime, after, afterMime, request = '', { subjectType = 'other' } = {}) {
  const fallback = { keep: true, score: 0, parts: {}, issues: [], fix: '', derived: false };
  if (!ask) return fallback;
  try {
    const parts = [
      { inlineData: { mimeType: beforeMime, data: before } },
      { inlineData: { mimeType: afterMime, data: after } },
      { text: `The user asked for: ${request || 'a professional edit'}.` +
        (subjectType === 'person' ? ' This photo contains a person: check that the same person is recognisable, same features, same age, same body.' : '') +
        ' Review the edit.' },
    ];
    const text = await ask(env, [{ role: 'user', parts }], REVIEW_SYSTEM, false);
    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((x) => typeof x === 'string').slice(0, 5) : [];
    const nums = {};
    for (const k of Object.keys(RUBRIC)) if (Number.isFinite(Number(parsed[k]))) nums[k] = Math.max(0, Math.min(100, Number(parsed[k])));
    const score = scoreParts(nums, subjectType);
    const identity = subjectType === 'person' && nums.identity !== undefined ? nums.identity : 100;
    return { keep: parsed.keep !== false && score >= MIN_DELIVER && identity >= IDENTITY_FLOOR,
      score, parts: nums, identity, issues, fix: String(parsed.fix || '').slice(0, 240), derived: true };
  } catch (err) {
    console.error('[Hermes] photo review failed:', err.message);
    return fallback;
  }
}

// ---------------------------------------------------------------------------------------------
// 7. Variations: the studio set (conservative → balanced → bold)
// ---------------------------------------------------------------------------------------------

export const LADDER = [
  { id: 'safe', fa: 'محافظه‌کارانه', factor: 0.7, note: 'smallest safe change, everything else identical' },
  { id: 'balanced', fa: 'متعادل', factor: 1, note: 'the requested change done clearly and naturally' },
  { id: 'bold', fa: 'جسورانه', factor: 1.35, note: 'the same request, stronger and more visible' },
];

// ---------------------------------------------------------------------------------------------
// 8. Stage 5 - the whole pipeline
// ---------------------------------------------------------------------------------------------

/**
 * BRIEF → PLAN → CANDIDATES (ladder + quality bar) → BEST + REVIEW → DELIVERY.
 * `ask` is the multimodal brain (brain.mjs `ask`). Returns a delivery object, never a false claim:
 * if no provider produces pixels the promise rejects with the collected reasons.
 */
export async function polishPhoto(env, ask, image, mime, request, { op = null, candidates = null, delta = null, baseStrength = null, upscale = null } = {}) {
  const seen = editRequest(request);
  const detected = op ? { ...(seen || {}), op, also: (seen && seen.also) || [], instruction: request, strength: OP_STRENGTH[op],
    region: (seen && seen.region) || '', variants: !!(seen && seen.variants), delta: (seen && seen.delta) || 0,
    aspect: (seen && seen.aspect) || '', textAsk: false, explicit: true } : seen;
  const plan0 = detected || { op: DEFAULT_OP, also: [], instruction: request, strength: OP_STRENGTH[DEFAULT_OP], region: '',
    variants: false, delta: 0, aspect: '', textAsk: false, explicit: false };
  if (delta !== null) plan0.delta = delta;
  if (image && image.length > EDIT_MAX_BYTES * 4 / 3) throw new Error('عکس خیلی بزرگ است (حداکثر ۸ مگابایت).');
  // op 'text' means: there is nothing to edit - the caller sets the text layer (textlayer.mjs).
  if (plan0.op === 'text' && !(plan0.also || []).length) {
    return { kind: 'text-only', op: 'text', opLabel: EDIT_OPS.text.fa, model: null, image: null, brief: emptyBrief(), attempts: [] };
  }
  const textNote = TEXT_ASK.test(normalizeFa(request || '')) ? TEXT_NOTE : '';

  const brief = await photoBrief(env, ask, image, mime, plan0.instruction, plan0.op);
  const region = plan0.region || brief.region || '';
  const base = baseStrength ? Math.max(0.12, Math.min(0.75, baseStrength))
    : planStrength(plan0.op, { delta: plan0.delta, changeScale: brief.changeScale });
  const order = plan0.variants ? LADDER : [LADDER[1], LADDER[2], LADDER[0]];
  const want = Math.max(1, Math.min(MAX_CANDIDATES, candidates || (plan0.variants ? order.length : 1)));
  const ladder = order.slice(0, want);

  const before = imageInfo(base64Bytes(image));
  const tried = [];
  const attempts = [];
  let repairNote = '';
  let lastError = null;
  for (const step of ladder) {
    const strength = Math.max(0.12, Math.min(0.8, base * step.factor));
    const opts = { region, aspect: plan0.aspect, also: plan0.also || [] };
    const prompts = {
      gemini: editInstruction(plan0.op, plan0.instruction, { ...brief, fix: repairNote }, opts),
      cf: cfPrompt(plan0.op, plan0.instruction, brief, opts),
    };
    let current;
    try {
      current = await runEdit(env, image, mime, { ...prompts, strength });
    } catch (err) {
      tried.push({ variant: step.id, model: null, error: String(err.message).slice(0, 200) });
      lastError = err;
      continue;
    }
    const review = await reviewEdit(env, ask, image, mime, current.image, current.mime, plan0.instruction, { subjectType: brief.subjectType });
    tried.push({ variant: step.id, model: current.model, provider: current.provider, score: review.score,
      keep: review.keep, strength });
    const attempt = { ...current, review, strength, variant: step.id, variantLabel: step.fa,
      drift: frameDrift(before, current.info) };
    attempts.push(attempt);
    // The bar is met: no reason to spend more quota on this photo (except for a variations set,
    // which is meant to show the whole range).
    if (!plan0.variants && review.derived && review.score >= QUALITY_BAR) break;
    // Not good enough: the reviewer's note becomes a binding correction for the next version.
    if (!review.keep && review.fix) repairNote = review.fix;
  }
  if (!attempts.length) throw (lastError || new Error('ویرایش انجام نشد.'));

  const ranked = [...attempts].sort((a, b) => b.review.score - a.review.score || LADDER.findIndex((l) => l.id === a.variant) - LADDER.findIndex((l) => l.id === b.variant));
  const best = ranked[0];
  // Final quality pass: the free editors hand back ~1024px, so a bigger original deserves the
  // upscaler. It is optional, best-effort, and never blocks the delivery.
  let upscaleResult = null;
  if (upscale !== false && worthUpscaling(best.info, before) && !plan0.variants) {
    try {
      upscaleResult = await upscaleImage(env, best.image, best.mime, { prompt: `professional photo edit of ${brief.subject || plan0.instruction}`.slice(0, 300) });
      if (upscaleResult && upscaleResult.image) { best.image = upscaleResult.image; best.mime = upscaleResult.mime; best.info = upscaleResult.info; }
    } catch (err) {
      console.error('[Hermes] final upscale failed:', err.message);
    }
  }
  const repaired = attempts.length > 1 ? ranked[0] !== attempts[0] || !attempts[0].review.keep : false;
  const belowBar = best.review.derived && best.review.score < QUALITY_BAR;
  return {
    kind: plan0.variants ? 'variations' : repaired ? 'repaired' : 'edited',
    op: plan0.op, opLabel: EDIT_OPS[plan0.op].fa,
    image: best.image, mime: best.mime, model: best.model, provider: best.provider, info: best.info,
    before, drift: best.drift, strength: best.strength, variant: best.variant, variantLabel: best.variantLabel,
    brief, review: best.review, score: best.review.score, belowBar, repaired,
    variations: plan0.variants ? ranked.map((a, i) => ({ ...a, rank: i + 1 })) : null,
    attempted: tried, textNote, upscale: upscaleResult,
  };
}

/** Short Persian delivery caption: what changed, what was protected, what to try next. */
export function editCaption(result) {
  const res = result.info ? ` · ${faDigits(result.info.width)}×${faDigits(result.info.height)}` : '';
  const v = result.variantLabel && result.variations ? ` · نسخهٔ ${result.variantLabel}` : '';
  const lines = [`✅ ویرایش انجام شد — ${result.opLabel} (${result.model}${res}${v})`];
  if (result.brief && result.brief.problems && result.brief.problems.length) {
    lines.push('', '🔧 اصلاح‌ها:', ...result.brief.problems.slice(0, 4).map((p) => `• ${p}`));
  }
  if (result.brief && result.brief.mustKeep && result.brief.mustKeep.length) {
    lines.push('', `🛡️ دست‌نخورده ماند: ${result.brief.mustKeep.slice(0, 3).join('، ')}`);
  }
  if (result.review && result.review.derived) {
    lines.push('', `🔍 بازبینی ریتوشِر: ${faDigits(result.score)}/۱۰۰ (${band(result.score)})`);
    if (result.review.issues && result.review.issues.length) lines.push(...result.review.issues.slice(0, 3).map((i) => `• ${i}`));
    if (result.belowBar) lines.push('', '⚠️ هنوز حرف‌اول را نزده؛ اگر بگویی کدام قسمت مهم‌تر است، دقیق‌ترش می‌کنم.');
  }
  if (result.repaired) lines.push('', '(نسخهٔ اول از بازبینی رد شد؛ نسخهٔ بهتر فرستاده شد.)');
  if (result.drift > 12 && result.op !== 'expand') lines.push('', `ℹ️ کادر حدود ${faDigits(Math.round(result.drift))}٪ تغییر کرده است.`);
  if (result.textNote) lines.push('', `ℹ️ ${result.textNote}`);
  if (result.upscale && result.upscale.image) {
    lines.push('', `🔎 کیفیت نهایی: ${faDigits(result.upscale.info.width)}×${faDigits(result.upscale.info.height)}` +
      (result.upscale.scale > 1.05 ? ` (${faDigits(Math.round(result.upscale.scale * 100) / 100)}×)` : ''));
  } else if (result.upscale && result.upscale.failed) {
    lines.push('', 'ℹ️ بزرگ‌کردن نهایی انجام نشد (کیفیت اصلی دست‌نخورده ماند).');
  }
  lines.push('', 'اگر بخواهی می‌توانم: ملایم‌تر/قوی‌تر، پس‌زمینهٔ دیگر، نسخهٔ استوری ۹:۱۶، ' +
    '«چند نسخه» برای انتخاب، یا همان نسخه را دقیق‌تر کنم — فقط بگو.');
  return lines.join('\n');
}

/** Caption for the variations set: which version is which, and which one the studio recommends. */
export function variationsCaption(result) {
  const lines = [`🎨 ${faDigits(result.variations.length)} نسخهٔ حرفه‌ای آماده شد — ${result.opLabel}`];
  for (const v of result.variations) {
    const s = v.review.derived ? ` — کیفیت ${faDigits(v.review.score)}/۱۰۰` : '';
    const size = v.info ? ` (${faDigits(v.info.width)}×${faDigits(v.info.height)})` : '';
    lines.push(`• نسخهٔ ${faDigits(v.rank)}: ${v.variantLabel}${size}${s}`);
  }
  const top = result.variations[0];
  lines.push('', `⭐️ پیشنهاد من: نسخهٔ ${faDigits(top.rank)} (${top.variantLabel})${top.review.derived ? ` با کیفیت ${faDigits(top.review.score)}/۱۰۰` : ''}.`);
  if (result.brief && result.brief.mustKeep && result.brief.mustKeep.length) {
    lines.push('', `🛡️ در همهٔ نسخه‌ها دست‌نخورده ماند: ${result.brief.mustKeep.slice(0, 3).join('، ')}`);
  }
  if (result.textNote) lines.push('', `ℹ️ ${result.textNote}`);
  lines.push('', 'بگو کدام نسخه را انتخاب می‌کنی («نسخهٔ ۲») یا در اپ روی «همین را انتخاب کن» بزن تا همان را دقیق‌تر کنم.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// 9. Iteration memory: «کمی ملایم‌تر» works without re-sending the photo
// ---------------------------------------------------------------------------------------------

const RECALL_TTL = 3600;
const RECALL_MAX = 4_500_000; // base64 characters; larger originals are simply not remembered
const VARS_MAX = 12_000_000;  // the whole variations set has to fit in one KV value

/** Remember the original of the last edit so a follow-up tweak does not need the photo again. */
export async function rememberEdit(env, key, { original, mime, request, op, strength }) {
  if (!env.MEMORY || !key) return false;
  const plan = JSON.stringify({ request: String(request || '').slice(0, 400), op, strength });
  try {
    await env.MEMORY.put(`edit:plan:${key}`, plan, { expirationTtl: RECALL_TTL });
    if (original && original.length <= RECALL_MAX) {
      await env.MEMORY.put(`edit:orig:${key}`, JSON.stringify({ image: original, mime }), { expirationTtl: RECALL_TTL });
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Hermes] rememberEdit failed:', err.message);
    return false;
  }
}

/** The remembered original of the last edit, or null. */
export async function recallEdit(env, key) {
  if (!env.MEMORY || !key) return null;
  try {
    const raw = await env.MEMORY.get(`edit:orig:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.image !== 'string') return null;
    const plan = JSON.parse((await env.MEMORY.get(`edit:plan:${key}`)) || '{}');
    return { image: parsed.image, mime: parsed.mime || 'image/jpeg', plan };
  } catch { return null; }
}

/**
 * A short follow-up like «کمی ملایم‌تر» / «قوی‌ترش کن» / «چند نسخه بده» on the photo that was just
 * edited. Only meaningful together with the remembered original.
 */
export function followUpRequest(text) {
  const t = normalizeFa(String(text || '').trim());
  if (!t || t.length > 140) return null;
  const soft = DELTA_SOFT.test(t), bold = DELTA_BOLD.test(t);
  const delta = soft && !bold ? -1 : bold && !soft ? 1 : 0;
  if (!delta && !VARIANTS.test(t)) return null;
  if (!/(?:کن|بده|بساز|بکن|\bdo\b|\bmake\b|\bagain\b|please)/i.test(t) && t.split(/\s+/).length > 3) return null;
  return { instruction: t.slice(0, 300), delta, variants: VARIANTS.test(t) };
}

const FA_DIGIT = { '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };
const ORDINAL = { 'اول': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, first: 1, second: 2, third: 3, fourth: 4 };

/**
 * «نسخهٔ ۲»، «شماره ۳»، «دومی»، «version 2» - the user choosing one of the delivered takes.
 * Returns 1-based {@link take} or null.
 */
export function pickRequest(text) {
  const t = normalizeFa(String(text || '').trim());
  if (!t || t.length > 140) return null;
  const m = t.match(/(?:نسخه|شماره|نمونه|تک|ورژن|version|take|case|number|#)\s*[ی]?\s*([۱-۹1-9])/i);
  if (m) return { take: FA_DIGIT[m[1]] || Number(m[1]), instruction: t.slice(0, 200) };
  const ord = t.match(/(?:نسخه|شماره|نمونه|تک|ورژن|the)?\s*(اول|دوم|سوم|چهارم|first|second|third|fourth)(?:ی|م)?/i);
  if (ord) return { take: ORDINAL[ord[1].toLowerCase()] || ORDINAL[ord[1]], instruction: t.slice(0, 200) };
  return null;
}

/**
 * Remember a variations set (the ranked takes plus the plan behind them) so the user can pick one
 * later — from the app button or by typing «نسخهٔ ۲». Capped in size: an oversized set is simply not
 * offered for picking instead of eating the whole KV budget.
 */
export async function rememberVariations(env, key, result) {
  if (!env.MEMORY || !key || !result || !result.variations || !result.variations.length) return false;
  const payload = { request: String(result.request || '').slice(0, 400), op: result.op, takes: [] };
  let size = 0;
  for (const v of result.variations) {
    if (!v.image || size + v.image.length > VARS_MAX) continue;
    size += v.image.length;
    payload.takes.push({ image: v.image, mime: v.mime, variant: v.variant, variantLabel: v.variantLabel,
      strength: v.strength, score: v.review && v.review.derived ? v.review.score : 0 });
  }
  if (!payload.takes.length) return false;
  try {
    await env.MEMORY.put(`edit:takes:${key}`, JSON.stringify(payload), { expirationTtl: RECALL_TTL });
    return true;
  } catch (err) {
    console.error('[Hermes] rememberVariations failed:', err.message);
    return false;
  }
}

/** The remembered variations set, or null. */
export async function recallVariations(env, key) {
  if (!env.MEMORY || !key) return null;
  try {
    const raw = await env.MEMORY.get(`edit:takes:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.takes) && parsed.takes.length ? parsed : null;
  } catch { return null; }
}

/**
 * The iteration loop: re-run the last plan on the remembered original with the user's tweak
 * («ملایم‌تر»، «قوی‌تر»، «چند نسخه»), so the user never has to send the photo again.
 */
export async function continueEdit(env, ask, recalled, input) {
  const follow = followUpRequest(input);
  const request = [recalled.plan && recalled.plan.request, input].filter(Boolean).join(' و ');
  const delta = follow ? follow.delta : 0;
  const note = delta < 0 ? ' (apply more subtly than the previous attempt, keep everything else identical)'
    : delta > 0 ? ' (apply more strongly and more visibly than the previous attempt)' : '';
  const result = await polishPhoto(env, ask, recalled.image, recalled.mime, request + note, {
    op: (recalled.plan && recalled.plan.op) || null, delta,
    candidates: follow && follow.variants ? MAX_CANDIDATES : 2,
  });
  const caption = result.kind === 'variations' ? variationsCaption(result) : editCaption(result);
  return { ...result, caption, followUp: true };
}

/**
 * The user picked one take («نسخهٔ ۲» or the app button): keep that version's strength and refine it
 * with a fresh set of candidates, so the promise is "this one, but done better".
 */
export async function refineTake(env, ask, recalled, take, { request = '' } = {}) {
  const chosen = recalled.takes[Number(take) - 1];
  if (!chosen) return null;
  const asked = [recalled.request, request].filter(Boolean).join(' و ').slice(0, 400);
  const result = await polishPhoto(env, ask, recalled.image, recalled.mime,
    `${asked} (continue the ${chosen.variantLabel || 'chosen'} take, keep its look, refine it further)`,
    { op: recalled.op, baseStrength: chosen.strength, candidates: 2 });
  const caption = result.kind === 'variations' ? variationsCaption(result) : editCaption(result);
  const head = `🎯 نسخهٔ ${faDigits(take)} (${chosen.variantLabel || 'انتخابی تو'}) انتخاب شد و دقیق‌ترش کردم.`;
  const merged = { ...result, caption: `${head}\n\n${caption}`, picked: take };
  if (env.MEMORY) await env.MEMORY.put(`edit:picked:${take}`, '1', { expirationTtl: RECALL_TTL }).catch(() => {});
  return merged;
}

/** Everything the worker needs to answer a photo edit turn, in one call. */
export async function handlePhotoEdit(env, ask, image, mime, request) {
  const plan = editRequest(request);
  if (!plan) return null;
  const configured = Number(env.EDIT_CANDIDATES) > 0 ? Math.min(MAX_CANDIDATES, Number(env.EDIT_CANDIDATES)) : 2;
  const result = await polishPhoto(env, ask, image, mime, request, { op: plan.op, delta: plan.delta,
    candidates: plan.variants ? MAX_CANDIDATES : configured });
  const caption = result.kind === 'variations' ? variationsCaption(result) : editCaption(result);
  return { ...result, caption };
}

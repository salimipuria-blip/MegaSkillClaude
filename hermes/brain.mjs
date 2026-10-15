import { fetchWithTimeout } from './resilience.mjs';
// Shared model adapters for the Worker and SQLite conversation actor.
import { SKILLS } from './skills.mjs';
import { askProviders, configuredProviders } from './providers.mjs';
import { describeImage } from './media.mjs';

export const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const CF_MODELS = ['@cf/google/gemma-3-12b-it', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
export const STYLE = "Reply in the user's language (usually Persian). Be direct and accurate; short by default, detailed when the task needs it. Say so when you are not sure.\n" +
  "You CAN hear and see: voice messages are transcribed for you, and photos the user sends are attached to their message. " +
  "You CAN search Google for current facts (news, prices, weather, schedules) when the Gemini brain is active; use it instead of guessing, and keep the sources line.\n" +
  "You CAN make images: a message that starts with «عکس بساز:» (or /img) is turned into a picture automatically. When the user wants a picture, tell them to send «عکس بساز: <description>»; when they ask for a design or post, also offer ready «عکس بساز: ...» lines for its backgrounds.\n" +
  "You CAN edit the user's own photos: when they send a picture with an instruction (retouch, swap the background, relight, restore an old photo, upscale, remove an object, studio product shot, cinematic colour) it is edited professionally and sent back. Tell them to send the photo with what they want changed; text ON a photo is set with a real font layer, so tell them to write «روی عکس بنویس: <متن>» and that the words stay readable; drawing a logo/graphic is the only thing still refused.\n" + SKILLS;
export const SYSTEM = "You are Hermes, Puria's personal assistant (Viking Offroad brand). " + STYLE;

// Photo turn: Gemini sees the image itself; otherwise Workers AI describes it and the text brain answers.
export async function see(env, contents, system, images, input, tools = null) {
  if (env.GEMINI_API_KEY) {
    try {
      return await askGemini(env, contents, system, true, tools);
    } catch (err) {
      if (!env.AI) throw err;
      console.error('[Hermes] Gemini vision failed, using Workers AI:', err.message);
    }
  }
  const description = await describeImage(env, images[0].data, input);
  const textOnly = [...contents.slice(0, -1), { role: 'user', parts: [{ text: `${input}\n\n[Description of the attached photo: ${description}]` }] }];
  return ask(env, textOnly, system);
}

// Brains in order: Gemini (search + Google tools) → other free providers whose key is set → Workers AI.
export async function ask(env, contents, system = SYSTEM, search = true, tools = null) {
  const errors = [];
  if (env.GEMINI_API_KEY) {
    try {
      return await askGemini(env, contents, system, search, tools);
    } catch (err) {
      errors.push(err.message);
      console.error('[Hermes] Gemini failed:', err.message);
    }
  }
  if (configuredProviders(env).length) {
    try {
      return await askProviders(env, contents, system);
    } catch (err) {
      errors.push(err.message);
      console.error('[Hermes] free providers failed:', err.message);
    }
  }
  if (env.AI) {
    try {
      return await askWorkersAI(env, contents, system);
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(errors.length ? errors.join(' | ') : 'هیچ مغزی تنظیم نشده (کلید جمینی یا یکی از کلیدهای رایگان دیگر).');
}

export async function askWorkersAI(env, contents, system = SYSTEM) {
  const messages = [
    { role: 'system', content: system },
    ...contents.map((c) => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      content: c.parts.map((p) => p.text || '').join(''),
    })),
  ];
  let lastError;
  for (const model of CF_MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 1024 });
      const reply = (out && (out.response ||
        (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content))) || '';
      if (String(reply).trim()) return String(reply).trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Workers AI جواب نداد${lastError ? ` (${lastError.message})` : ''}.`);
}

// search=true lets Gemini use Google Search for current facts (free tier); models that refuse the tool are retried without it.
export async function askGemini(env, contents, system = SYSTEM, search = true, tools = null) {
  const cached = env.MEMORY ? await env.MEMORY.get('model') : null;
  const order = cached ? [cached, ...MODELS.filter((m) => m !== cached)] : MODELS;
  const call = (model, convo, withSearch, withFns) => {
    const t = [...(withFns && tools ? [{ functionDeclarations: tools.declarations }] : []), ...(withSearch ? [{ google_search: {} }] : [])];
    return fetchWithTimeout(`${GEMINI_API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: convo, ...(t.length ? { tools: t } : {}) }),
    });
  };
  let busy = false;
  for (const model of order) {
    const convo = [...contents];
    let withSearch = search, withFns = !!tools;
    let res = await call(model, convo, withSearch, withFns);
    if (withSearch && (res.status === 400 || res.status === 429)) { withSearch = false; res = await call(model, convo, withSearch, withFns); }
    if (withFns && res.status === 400) { withFns = false; res = await call(model, convo, withSearch, withFns); }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      // 400 is also Google's answer for a blocked region ("User location is not supported"), so show its own words.
      const why = await res.json().then((d) => d && d.error && d.error.message).catch(() => '');
      throw new Error(`جمینی جواب نداد (${res.status}${why ? `: ${String(why).slice(0, 160)}` : ''}).`);
    }
    // Each model has its own free quota: a full (429), missing (404) or busy (5xx) model hands over to the next one.
    if (!res.ok) { busy = busy || res.status === 429; continue; }
    if (env.MEMORY && model !== cached) await env.MEMORY.put('model', model);
    let data = await res.json();
    // Tool loop: run the functions Gemini asks for (Gmail, Calendar, ...) and give it the results, up to 6 rounds.
    for (let round = 0; withFns && round < 6; round++) {
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const fnCalls = parts.filter((p) => p.functionCall);
      if (!fnCalls.length) break;
      convo.push({ role: 'model', parts });
      const responses = [];
      for (const { functionCall: fc } of fnCalls) {
        let result;
        try { result = await tools.run(fc.name, fc.args || {}); } catch (err) { result = { error: err.message }; }
        responses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: { result } } });
      }
      convo.push({ role: 'user', parts: responses });
      const next = await call(model, convo, withSearch, withFns);
      if (!next.ok) throw new Error(`جمینی جواب نداد (${next.status}).`);
      data = await next.json();
    }
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts) || [];
    const answer = parts.map((p) => p.text || '').join('').trim() || '(پاسخ خالی بود؛ دوباره بپرس)';
    return answer + sources(data.candidates && data.candidates[0]);
  }
  throw new Error(busy ? 'سهمیهٔ رایگان همهٔ مدل‌های جمینی فعلاً پر است؛ چند دقیقه بعد دوباره بپرس.' : 'هیچ مدل جمینی برای این کلید در دسترس نیست.');
}

// Up to 3 web sources when Gemini searched Google for the answer.
function sources(candidate) {
  const chunks = (candidate && candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) || [];
  const web = chunks.map((c) => c.web).filter((w) => w && w.uri).slice(0, 3);
  return web.length ? '\n\nمنابع:\n' + web.map((w) => `• ${w.title || 'لینک'}: ${w.uri}`).join('\n') : '';
}

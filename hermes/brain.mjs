// Model calls are separate from routing/storage so the conversation actor can share the same brain.
import { SKILLS } from './skills.mjs';

export const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const CF_MODELS = ['@cf/google/gemma-3-12b-it', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
export const STYLE = "Reply in the user's language (usually Persian). Be direct and accurate; short by default, detailed when the task needs it. Say so when you are not sure.\n" + SKILLS;
export const SYSTEM = "You are Hermes, Puria's personal assistant (Viking Offroad brand). " + STYLE;

export async function ask(env, contents, system = SYSTEM) {
  if (env.GEMINI_API_KEY) {
    try {
      return await askGemini(env, contents, system);
    } catch (err) {
      if (!env.AI) throw err;
      console.error('[Hermes] Gemini failed, using Workers AI:', err.message);
    }
  }
  if (env.AI) return askWorkersAI(env, contents, system);
  throw new Error('نه کلید جمینی تنظیم شده و نه Workers AI.');
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

export async function askGemini(env, contents, system = SYSTEM) {
  const cached = env.MEMORY ? await env.MEMORY.get('model') : null;
  const order = cached ? [cached, ...MODELS.filter((m) => m !== cached)] : MODELS;
  for (const model of order) {
    const res = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    });
    if (res.status === 404) continue;
    if (res.status === 429) throw new Error('سهمیهٔ رایگان جمینی فعلاً پر است؛ چند دقیقه بعد دوباره بپرس.');
    if (res.status === 400 || res.status === 403) throw new Error(`جمینی کلید را نپذیرفت (${res.status}). کلید را دوباره بساز.`);
    if (!res.ok) throw new Error(`جمینی جواب نداد (${res.status}).`);
    if (env.MEMORY && model !== cached) await env.MEMORY.put('model', model);
    const data = await res.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts) || [];
    return parts.map((p) => p.text || '').join('').trim() || '(پاسخ خالی بود؛ دوباره بپرس)';
  }
  throw new Error('هیچ مدل جمینی برای این کلید در دسترس نیست.');
}

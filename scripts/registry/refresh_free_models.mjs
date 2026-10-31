#!/usr/bin/env node
// Infinity Mega Skill — builds registry/models.json from live provider catalogs.
// Public catalogs (OpenRouter, Hugging Face router) need no key. Keyed catalogs are
// read only when their env var is set; a missing key is recorded as "skipped", never as success.
// Usage: node scripts/registry/refresh_free_models.mjs [--out registry/models.json] [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outPath = resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'registry/models.json');
const TIMEOUT_MS = 20000;

async function getJson(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const isZero = (v) => v === undefined || v === null || Number(v) === 0;

export function fromOpenRouter(json) {
  return (json.data || [])
    .filter((m) => m.id.endsWith(':free') || m.id === 'openrouter/free' ||
      (isZero(m.pricing?.prompt) && isZero(m.pricing?.completion) && m.pricing))
    .map((m) => ({
      provider: 'openrouter', model: m.id, free: true,
      context: m.context_length ?? null,
      input: m.architecture?.input_modalities ?? ['text'],
      tools: (m.supported_parameters || []).includes('tools'),
    }));
}

export function fromHuggingFace(json) {
  const rows = [];
  for (const m of json.data || []) {
    const live = (m.providers || []).filter((p) => p.status === 'live');
    if (!live.length) continue;
    const free = live.filter((p) => p.is_free);
    const fastest = [...live].sort((a, b) => (b.throughput || 0) - (a.throughput || 0))[0];
    rows.push({
      provider: 'huggingface', model: m.id, free: free.length > 0,
      free_via: free.map((p) => p.provider),
      fastest_via: fastest.provider,
      tokens_per_sec: fastest.throughput ? Math.round(fastest.throughput) : null,
      first_token_ms: fastest.first_token_latency_ms ? Math.round(fastest.first_token_latency_ms) : null,
      cheapest_input_usd_per_m: Math.min(...live.map((p) => p.pricing?.input ?? Infinity)),
      context: Math.max(...live.map((p) => p.context_length || 0)) || null,
      input: m.architecture?.input_modalities ?? ['text'],
      tools: live.some((p) => p.supports_tools),
    });
  }
  return rows.map((r) => ({ ...r, cheapest_input_usd_per_m: Number.isFinite(r.cheapest_input_usd_per_m) ? r.cheapest_input_usd_per_m : null }));
}

const keyed = [
  { id: 'groq', env: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/models' },
  { id: 'cerebras', env: 'CEREBRAS_API_KEY', url: 'https://api.cerebras.ai/v1/models' },
  { id: 'mistral', env: 'MISTRAL_API_KEY', url: 'https://api.mistral.ai/v1/models' },
  { id: 'nvidia-nim', env: 'NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1/models' },
  { id: 'sambanova', env: 'SAMBANOVA_API_KEY', url: 'https://api.sambanova.ai/v1/models' },
];

async function main() {
  const sources = {};
  const models = [];
  const run = async (id, fn) => {
    try {
      const rows = await fn();
      models.push(...rows);
      sources[id] = { status: 'ok', models: rows.length };
    } catch (err) {
      sources[id] = { status: 'error', error: String(err.message || err) };
    }
  };
  await run('openrouter', async () => fromOpenRouter(await getJson('https://openrouter.ai/api/v1/models')));
  await run('huggingface', async () => fromHuggingFace(await getJson('https://router.huggingface.co/v1/models')));
  for (const p of keyed) {
    const key = process.env[p.env];
    if (!key) { sources[p.id] = { status: 'skipped', reason: `${p.env} not set` }; continue; }
    await run(p.id, async () => (await getJson(p.url, { Authorization: `Bearer ${key}` })).data
      .map((m) => ({ provider: p.id, model: m.id, free: true, context: m.context_window ?? m.context_length ?? null })));
  }
  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  const out = {
    generated_at: new Date().toISOString(),
    generator: 'scripts/registry/refresh_free_models.mjs',
    sources,
    totals: { models: models.length, free: models.filter((m) => m.free).length },
    models,
  };
  const ok = Object.values(sources).filter((s) => s.status === 'ok').length;
  if (args.includes('--check')) {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    console.log(`previous: ${prev.totals.models} models; live now: ${out.totals.models}`);
  } else {
    writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
    console.log(`wrote ${outPath}`);
  }
  for (const [id, s] of Object.entries(sources)) console.log(`${id}: ${s.status}${s.models !== undefined ? ` (${s.models})` : ''}${s.error ? ` — ${s.error}` : ''}${s.reason ? ` — ${s.reason}` : ''}`);
  console.log(`total ${out.totals.models}, free ${out.totals.free}`);
  if (!ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

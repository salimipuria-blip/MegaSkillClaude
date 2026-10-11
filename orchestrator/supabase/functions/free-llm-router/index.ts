type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type TaskKind = "general" | "reasoning" | "coding" | "agentic" | "vision" | "long_context" | "speed";
type ChatRequest = {
  action?: "chat" | "models" | "health";
  messages?: ChatMessage[];
  prompt?: string;
  provider?: "auto" | "openrouter" | "groq" | "gemini" | "cloudflare" | "huggingface";
  model?: string;
  task?: TaskKind;
  max_tokens?: number;
  temperature?: number;
};

type ProviderResult = {
  provider: string;
  model: string;
  text: string;
  latency_ms: number;
  raw?: unknown;
};

type ModelInfo = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  expiration_date?: string | null;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
  reasoning?: { mandatory?: boolean; default_enabled?: boolean; default_effort?: string };
  benchmarks?: {
    artificial_analysis?: {
      coding_index?: number | null;
      agentic_index?: number | null;
      intelligence_index?: number | null;
    };
  };
};

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function env(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value || undefined;
}

function isZero(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
}

function normalizeMessages(body: ChatRequest): ChatMessage[] {
  if (Array.isArray(body.messages) && body.messages.length) {
    return body.messages.filter((m) => m && typeof m.content === "string" && ["system", "user", "assistant"].includes(m.role));
  }
  if (typeof body.prompt === "string" && body.prompt.trim()) {
    return [{ role: "user", content: body.prompt.trim() }];
  }
  throw new Error("Provide messages[] or prompt");
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 45000): Promise<{ response: Response; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw_text: text.slice(0, 1000) }; }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function isEligibleFreeChatModel(model: ModelInfo): boolean {
  if (!isZero(model?.pricing?.prompt) || !isZero(model?.pricing?.completion)) return false;
  const inputs = model.architecture?.input_modalities || [];
  const outputs = model.architecture?.output_modalities || [];
  if (!inputs.includes("text") || !outputs.includes("text")) return false;

  const text = `${model.id} ${model.name || ""} ${model.description || ""}`.toLowerCase();
  if (/content[- ]safety|guardrail|prompt[- ]guard|moderation|embedding|rerank|speech[- ]to[- ]text|text[- ]to[- ]speech/.test(text)) return false;
  if (/\blyria\b|music generation|song generation/.test(text)) return false;

  if (model.expiration_date) {
    const expiry = Date.parse(model.expiration_date);
    if (Number.isFinite(expiry) && expiry < Date.now()) return false;
  }
  return true;
}

async function getOpenRouterFreeModels(): Promise<ModelInfo[]> {
  const { response, data } = await fetchJson("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } }, 12000);
  if (!response.ok) throw new Error(`OpenRouter catalog HTTP ${response.status}`);
  const models: ModelInfo[] = Array.isArray(data?.data) ? data.data : [];
  return models.filter(isEligibleFreeChatModel);
}

function metric(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function taskScore(model: ModelInfo, task: TaskKind = "general"): number {
  const id = (model.id || "").toLowerCase();
  const name = (model.name || "").toLowerCase();
  const text = `${id} ${name}`;
  const context = Number(model.context_length || 0);
  const inputs = model.architecture?.input_modalities || [];
  const aa = model.benchmarks?.artificial_analysis;
  const coding = metric(aa?.coding_index);
  const agentic = metric(aa?.agentic_index);
  const intelligence = metric(aa?.intelligence_index);
  const hasTools = (model.supported_parameters || []).includes("tools");
  const reasoning = Boolean(model.reasoning?.mandatory || model.reasoning?.default_enabled || /reason|r1/.test(text));

  let score = 0;
  const contextBonus = Math.min(Math.log2(Math.max(context, 32768) / 32768), 5) * 0.25;

  if (task === "coding") {
    score = coding * 0.11 + agentic * 0.035 + intelligence * 0.025 + (hasTools ? 0.5 : 0) + contextBonus;
    if (/code|coder|laguna|north/.test(text)) score += 0.9;
  } else if (task === "agentic") {
    score = agentic * 0.13 + coding * 0.055 + intelligence * 0.03 + (hasTools ? 1.2 : -0.5) + contextBonus;
  } else if (task === "reasoning") {
    score = intelligence * 0.14 + coding * 0.03 + agentic * 0.035 + (reasoning ? 1.0 : 0) + contextBonus;
  } else if (task === "vision") {
    if (!inputs.includes("image")) return -100;
    score = intelligence * 0.1 + coding * 0.04 + agentic * 0.03 + 4 + (hasTools ? 0.35 : 0) + contextBonus;
  } else if (task === "long_context") {
    score = Math.min(context / 131072, 8) + intelligence * 0.045 + (hasTools ? 0.25 : 0);
  } else if (task === "speed") {
    score = intelligence * 0.035 + coding * 0.02 + agentic * 0.015;
    if (/lightning|flash|mini|nano|small|lite|a3b|3b|5\.5b/.test(text)) score += 4;
    if (/ultra|550b|975b/.test(text)) score -= 1.5;
  } else {
    score = intelligence * 0.12 + coding * 0.035 + agentic * 0.04 + (hasTools ? 0.4 : 0) + contextBonus;
    if (reasoning) score += 0.35;
  }

  if (/sante|medical|health-focused|finance-focused|\bfin\b/.test(`${text} ${(model.description || "").toLowerCase()}`)) score -= 3;
  if (model.id === "openrouter/free") score -= 1.5;
  return score;
}

function compactModel(model: ModelInfo & { score: number }) {
  const aa = model.benchmarks?.artificial_analysis;
  return {
    id: model.id,
    name: model.name || model.id,
    score: model.score,
    context_length: model.context_length || null,
    input_modalities: model.architecture?.input_modalities || [],
    supports_tools: (model.supported_parameters || []).includes("tools"),
    supports_structured_outputs: (model.supported_parameters || []).includes("structured_outputs"),
    reasoning: Boolean(model.reasoning?.mandatory || model.reasoning?.default_enabled),
    benchmarks: {
      intelligence: metric(aa?.intelligence_index) || null,
      coding: metric(aa?.coding_index) || null,
      agentic: metric(aa?.agentic_index) || null,
    },
    expires: model.expiration_date || null,
  };
}

async function rankedOpenRouterModels(task: TaskKind = "general", limit = 25) {
  const models = await getOpenRouterFreeModels();
  return models
    .map((m) => ({ ...m, score: Number(taskScore(m, task).toFixed(3)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function callOpenAICompatible(args: {
  provider: string;
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  extraHeaders?: Record<string, string>;
}): Promise<ProviderResult> {
  const started = performance.now();
  const { response, data } = await fetchJson(args.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      ...(args.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      max_tokens: args.maxTokens,
      temperature: args.temperature,
    }),
  });
  if (!response.ok) {
    const message = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 600);
    throw new Error(`${args.provider} HTTP ${response.status}: ${message}`);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error(`${args.provider}: no text response`);
  return { provider: args.provider, model: data?.model || args.model, text, latency_ms: Math.round(performance.now() - started), raw: { usage: data?.usage } };
}

async function callOpenRouter(model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<ProviderResult> {
  const key = env("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return callOpenAICompatible({
    provider: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: key,
    model,
    messages,
    maxTokens,
    temperature,
    extraHeaders: { "X-Title": "Free LLM Router" },
  });
}

async function callGroq(model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<ProviderResult> {
  const key = env("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is not configured");
  return callOpenAICompatible({ provider: "groq", url: "https://api.groq.com/openai/v1/chat/completions", apiKey: key, model, messages, maxTokens, temperature });
}

async function callHuggingFace(model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<ProviderResult> {
  const key = env("HF_TOKEN");
  if (!key) throw new Error("HF_TOKEN is not configured");
  return callOpenAICompatible({ provider: "huggingface", url: "https://router.huggingface.co/v1/chat/completions", apiKey: key, model, messages, maxTokens, temperature });
}

async function callGemini(model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<ProviderResult> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const payload: any = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature } };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  const started = performance.now();
  const { response, data } = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`gemini HTTP ${response.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 600)}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
  if (!text) throw new Error("gemini: no text response");
  return { provider: "gemini", model, text, latency_ms: Math.round(performance.now() - started), raw: { usage: data?.usageMetadata } };
}

async function callCloudflare(model: string, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<ProviderResult> {
  const token = env("CLOUDFLARE_API_TOKEN");
  const account = env("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !account) throw new Error("CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are not configured");
  const started = performance.now();
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`;
  const { response, data } = await fetchJson(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: maxTokens, temperature }),
  });
  if (!response.ok || data?.success === false) throw new Error(`cloudflare HTTP ${response.status}: ${JSON.stringify(data?.errors || data).slice(0, 600)}`);
  const text = data?.result?.response || data?.result?.text;
  if (typeof text !== "string") throw new Error("cloudflare: no text response");
  return { provider: "cloudflare", model, text, latency_ms: Math.round(performance.now() - started), raw: { usage: data?.result?.usage } };
}

function providerHealth() {
  return {
    openrouter: { configured: Boolean(env("OPENROUTER_API_KEY")), cost_mode: "strict_zero_cost_models", default_model: "openrouter/free" },
    groq: { configured: Boolean(env("GROQ_API_KEY")), cost_mode: "free_plan_quota", default_model: env("GROQ_MODEL") || "openai/gpt-oss-120b" },
    gemini: { configured: Boolean(env("GEMINI_API_KEY")), cost_mode: "free_tier_if_key_project_is_free", default_model: env("GEMINI_MODEL") || "gemini-2.5-flash-lite" },
    cloudflare: { configured: Boolean(env("CLOUDFLARE_API_TOKEN") && env("CLOUDFLARE_ACCOUNT_ID")), cost_mode: "daily_free_allocation", default_model: env("CLOUDFLARE_MODEL") || "@cf/google/gemma-4-26b-a4b-it" },
    huggingface: { configured: Boolean(env("HF_TOKEN")), cost_mode: "monthly_free_credit", default_model: env("HF_MODEL") || "openai/gpt-oss-120b:groq" },
  };
}

async function routeChat(body: ChatRequest): Promise<any> {
  const messages = normalizeMessages(body);
  const task: TaskKind = body.task || "general";
  const maxTokens = Math.min(Math.max(Number(body.max_tokens || 1200), 1), 8192);
  const temperature = Math.min(Math.max(Number(body.temperature ?? 0.2), 0), 2);
  const requested = body.provider || "auto";
  const errors: { provider: string; model: string; error: string }[] = [];

  const attempt = async (provider: string, model: string) => {
    try {
      let result: ProviderResult;
      if (provider === "openrouter") result = await callOpenRouter(model, messages, maxTokens, temperature);
      else if (provider === "groq") result = await callGroq(model, messages, maxTokens, temperature);
      else if (provider === "gemini") result = await callGemini(model, messages, maxTokens, temperature);
      else if (provider === "cloudflare") result = await callCloudflare(model, messages, maxTokens, temperature);
      else if (provider === "huggingface") result = await callHuggingFace(model, messages, maxTokens, temperature);
      else throw new Error(`Unknown provider: ${provider}`);
      return result;
    } catch (e) {
      errors.push({ provider, model, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };

  if (requested !== "auto") {
    const defaults: Record<string, string> = {
      openrouter: "openrouter/free",
      groq: env("GROQ_MODEL") || "openai/gpt-oss-120b",
      gemini: env("GEMINI_MODEL") || "gemini-2.5-flash-lite",
      cloudflare: env("CLOUDFLARE_MODEL") || "@cf/google/gemma-4-26b-a4b-it",
      huggingface: env("HF_MODEL") || "openai/gpt-oss-120b:groq",
    };
    const result = await attempt(requested, body.model || defaults[requested]);
    if (result) return { ok: true, routed: result, attempts: errors.length + 1 };
    return { ok: false, error: "Requested provider failed", errors };
  }

  if (env("OPENROUTER_API_KEY")) {
    try {
      const ranked = await rankedOpenRouterModels(task, 3);
      for (const m of ranked) {
        const result = await attempt("openrouter", m.id);
        if (result) return { ok: true, routed: result, selector: { strategy: "live_benchmark_zero_cost", task, score: m.score }, attempts: errors.length + 1 };
      }
      const result = await attempt("openrouter", "openrouter/free");
      if (result) return { ok: true, routed: result, selector: { strategy: "openrouter_free_router_fallback" }, attempts: errors.length + 1 };
    } catch (e) {
      errors.push({ provider: "openrouter", model: "catalog", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const fallbacks: Array<[string, string]> = [
    ["groq", env("GROQ_MODEL") || "openai/gpt-oss-120b"],
    ["gemini", env("GEMINI_MODEL") || "gemini-2.5-flash-lite"],
    ["cloudflare", env("CLOUDFLARE_MODEL") || "@cf/google/gemma-4-26b-a4b-it"],
    ["huggingface", env("HF_MODEL") || "openai/gpt-oss-120b:groq"],
  ];
  const health = providerHealth() as any;
  for (const [provider, model] of fallbacks) {
    if (!health[provider]?.configured) continue;
    const result = await attempt(provider, model);
    if (result) return { ok: true, routed: result, selector: { strategy: "configured_free_tier_fallback", task }, attempts: errors.length + 1 };
  }

  return {
    ok: false,
    error: "No configured inference provider could answer",
    errors,
    next: "Add OPENROUTER_API_KEY first for live zero-cost model routing. Add GROQ_API_KEY, GEMINI_API_KEY, CLOUDFLARE_API_TOKEN+CLOUDFLARE_ACCOUNT_ID, or HF_TOKEN for independent fallback capacity.",
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    const url = new URL(req.url);
    let body: ChatRequest = {};
    if (req.method !== "GET") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const action = body.action || (url.searchParams.get("action") as ChatRequest["action"]) || (req.method === "GET" ? "health" : "chat");

    if (action === "health") {
      return json({ ok: true, service: "free-llm-router", version: "2.0.0", region: env("SB_REGION") || null, providers: providerHealth() });
    }
    if (action === "models") {
      const task = body.task || (url.searchParams.get("task") as TaskKind) || "general";
      const ranked = await rankedOpenRouterModels(task, 25);
      return json({ ok: true, source: "openrouter-live-catalog", task, count: ranked.length, models: ranked.map(compactModel) });
    }
    if (action === "chat") {
      const result = await routeChat(body);
      return json(result, result.ok ? 200 : 503);
    }
    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

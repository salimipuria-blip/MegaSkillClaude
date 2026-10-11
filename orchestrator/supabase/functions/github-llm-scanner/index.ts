import postgres from "postgres";

type Repo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  language?: string | null;
  license?: { spdx_id?: string | null } | null;
  topics?: string[];
  archived?: boolean;
  pushed_at?: string | null;
  updated_at?: string | null;
  readme?: string;
};

type Analysis = {
  score: number;
  capability_class: string;
  has_api: boolean;
  openai_compatible: boolean;
  free_signal: boolean;
  self_hosted: boolean;
  gateway: boolean;
  eligible: boolean;
};

const DB_URL = Deno.env.get("SUPABASE_DB_URL");
if (!DB_URL) throw new Error("SUPABASE_DB_URL missing");
const sql = postgres(DB_URL, { prepare: false, max: 1 });
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")?.trim() || "";
const API_VERSION = "2026-03-10";
const BASE_QUERIES = [
  '"free llm api" in:name,description,readme stars:>20 archived:false',
  '"free inference" llm in:name,description,readme stars:>20 archived:false',
  '"openai compatible" llm in:name,description,readme stars:>50 archived:false',
  '"llm gateway" openai in:name,description,readme stars:>50 archived:false',
  '"inference server" llm openai in:description,readme stars:>100 archived:false'
];
const TOKEN_QUERIES = [
  '"ai gateway" llm in:name,description,readme stars:>50 archived:false',
  'topic:llm topic:inference stars:>100 archived:false',
  '"multi-provider" llm router stars:>20 archived:false'
];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function analyzeRepo(repo: Repo): Analysis {
  const topics = Array.isArray(repo.topics) ? repo.topics.join(" ") : "";
  const haystack = `${repo.name || ""} ${repo.description || ""} ${topics} ${repo.readme || ""}`.toLowerCase();
  const openaiCompatible = includesAny(haystack, [
    "openai-compatible", "openai compatible", "/v1/chat/completions", "chat/completions", "openai api compatible"
  ]);
  const hasApi = openaiCompatible || includesAny(haystack, [
    "rest api", "http api", "inference api", "api endpoint", "hosted api", "gateway api", "proxy api"
  ]);
  const freeSignal = includesAny(haystack, [
    "free tier", "free inference", "free api", "free forever", "no credit card", "anonymous access", "zero cost", "0 cost"
  ]);
  const selfHosted = includesAny(haystack, [
    "self-host", "self host", "selfhost", "docker compose", "docker run", "ollama", "llama.cpp", "vllm", "local inference", "bring your own gpu"
  ]);
  const gateway = includesAny(haystack, [
    "router", "gateway", "proxy", "load balanc", "fallback", "multi-provider", "multi provider"
  ]);
  let score = 0;
  if (hasApi) score += 2.5;
  if (openaiCompatible) score += 2.5;
  if (freeSignal) score += 3.5;
  if (selfHosted) score += 1.5;
  if (gateway) score += 1.25;
  const stars = Number(repo.stargazers_count || 0);
  if (stars > 0) score += Math.min(Math.log10(stars + 1), 5) * 0.6;
  const pushedAt = Date.parse(repo.pushed_at || "");
  if (Number.isFinite(pushedAt)) {
    const ageDays = Math.max(0, (Date.now() - pushedAt) / 86400000);
    if (ageDays <= 30) score += 2;
    else if (ageDays <= 90) score += 1.2;
    else if (ageDays <= 365) score += 0.5;
    else score -= 0.75;
  }
  if (repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION") score += 0.5;
  if (includesAny(haystack, ["deprecated", "unmaintained", "no longer maintained"])) score -= 4;
  if (repo.archived) score -= 100;
  let capabilityClass = "research_only";
  if (freeSignal && hasApi) capabilityClass = "free_api_candidate";
  else if (selfHosted && hasApi) capabilityClass = "self_hosted_gateway";
  else if (hasApi) capabilityClass = "api_candidate";
  else if (selfHosted) capabilityClass = "self_hosted_inference";
  return {
    score: Number(score.toFixed(3)),
    capability_class: capabilityClass,
    has_api: hasApi,
    openai_compatible: openaiCompatible,
    free_signal: freeSignal,
    self_hosted: selfHosted,
    gateway,
    eligible: !repo.archived && score >= 2,
  };
}

function githubHeaders(raw = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "global-free-llm-mesh-scanner"
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

async function githubFetch(url: string, raw = false): Promise<{ response: Response; data: any; remaining: number | null }> {
  const response = await fetch(url, { headers: githubHeaders(raw) });
  const remainingHeader = response.headers.get("x-ratelimit-remaining");
  const remaining = remainingHeader === null ? null : Number(remainingHeader);
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const text = (await response.text()).slice(0, 700);
    throw new Error(`GitHub HTTP ${response.status}${retryAfter ? ` retry-after=${retryAfter}` : ""}: ${text}`);
  }
  if (raw) return { response, data: await response.text(), remaining };
  return { response, data: await response.json(), remaining };
}

function roughScore(repo: Repo): number {
  const base = analyzeRepo(repo).score;
  return base + Math.min(Math.log10((repo.stargazers_count || 0) + 1), 5);
}

async function upsertRepo(repo: Repo, analysis: Analysis) {
  const evidence = {
    source: "github_rest_api",
    scanner_version: "1.0.0",
    signals: {
      has_api: analysis.has_api,
      openai_compatible: analysis.openai_compatible,
      free_signal: analysis.free_signal,
      self_hosted: analysis.self_hosted,
      gateway: analysis.gateway
    }
  };
  await sql`
    insert into private.github_llm_sources (
      repo_id, full_name, html_url, description, stars, forks, language, license_spdx,
      topics, archived, pushed_at, github_updated_at, readme_excerpt, score,
      capability_class, has_api, openai_compatible, free_signal, self_hosted,
      gateway, eligible, evidence, last_seen_at, last_scanned_at
    ) values (
      ${repo.id}, ${repo.full_name}, ${repo.html_url}, ${repo.description || null},
      ${repo.stargazers_count || 0}, ${repo.forks_count || 0}, ${repo.language || null},
      ${repo.license?.spdx_id || null}, ${sql.json(repo.topics || [])}, ${Boolean(repo.archived)},
      ${repo.pushed_at || null}, ${repo.updated_at || null}, ${(repo.readme || "").slice(0, 12000) || null},
      ${analysis.score}, ${analysis.capability_class}, ${analysis.has_api}, ${analysis.openai_compatible},
      ${analysis.free_signal}, ${analysis.self_hosted}, ${analysis.gateway}, ${analysis.eligible},
      ${sql.json(evidence)}, now(), now()
    )
    on conflict (repo_id) do update set
      full_name = excluded.full_name,
      html_url = excluded.html_url,
      description = excluded.description,
      stars = excluded.stars,
      forks = excluded.forks,
      language = excluded.language,
      license_spdx = excluded.license_spdx,
      topics = excluded.topics,
      archived = excluded.archived,
      pushed_at = excluded.pushed_at,
      github_updated_at = excluded.github_updated_at,
      readme_excerpt = excluded.readme_excerpt,
      score = excluded.score,
      capability_class = excluded.capability_class,
      has_api = excluded.has_api,
      openai_compatible = excluded.openai_compatible,
      free_signal = excluded.free_signal,
      self_hosted = excluded.self_hosted,
      gateway = excluded.gateway,
      eligible = excluded.eligible,
      evidence = excluded.evidence,
      last_seen_at = now(),
      last_scanned_at = now()
  `;
}

async function candidates(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  return await sql`
    select repo_id, full_name, html_url, description, stars, language, license_spdx,
           score, capability_class, has_api, openai_compatible, free_signal,
           self_hosted, gateway, eligible, status, pushed_at, last_scanned_at
    from private.github_llm_sources
    where eligible = true and status <> 'rejected'
    order by score desc, stars desc
    limit ${safeLimit}
  `;
}

async function scan(source = "manual") {
  const authenticated = Boolean(GITHUB_TOKEN);
  const queries = authenticated ? [...BASE_QUERIES, ...TOKEN_QUERIES] : BASE_QUERIES;
  const perPage = authenticated ? 25 : 10;
  const readmeLimit = authenticated ? 40 : 12;
  const [run] = await sql`
    insert into private.github_scan_runs (mode, queries, meta)
    values (${authenticated ? "authenticated" : "keyless"}, ${sql.json(queries)}, ${sql.json({ source, scanner_version: "1.0.0" })})
    returning id
  `;
  let lastRemaining: number | null = null;
  try {
    const found = new Map<number, Repo>();
    let searchResults = 0;
    for (const q of queries) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=${perPage}`;
      const { data, remaining } = await githubFetch(url);
      lastRemaining = remaining ?? lastRemaining;
      const items: Repo[] = Array.isArray(data?.items) ? data.items : [];
      searchResults += items.length;
      for (const item of items) found.set(item.id, item);
      if (remaining !== null && remaining <= 1) break;
    }

    const repos = [...found.values()].sort((a, b) => roughScore(b) - roughScore(a));
    let readmesFetched = 0;
    for (const repo of repos.slice(0, readmeLimit)) {
      try {
        const { data, remaining } = await githubFetch(`https://api.github.com/repos/${repo.full_name}/readme`, true);
        lastRemaining = remaining ?? lastRemaining;
        repo.readme = String(data).slice(0, 12000);
        readmesFetched++;
        if (remaining !== null && remaining <= 1) break;
      } catch (e) {
        console.warn(`README ${repo.full_name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    let upserted = 0;
    let eligibleCount = 0;
    const ranked: Array<{ repo: Repo; analysis: Analysis }> = [];
    for (const repo of repos) {
      const analysis = analyzeRepo(repo);
      await upsertRepo(repo, analysis);
      upserted++;
      if (analysis.eligible) eligibleCount++;
      ranked.push({ repo, analysis });
    }

    await sql`
      update private.github_scan_runs
      set finished_at = now(), search_results = ${searchResults}, unique_repos = ${repos.length},
          readmes_fetched = ${readmesFetched}, upserted = ${upserted}, eligible = ${eligibleCount},
          rate_limit_remaining = ${lastRemaining}
      where id = ${run.id}
    `;

    ranked.sort((a, b) => b.analysis.score - a.analysis.score);
    return {
      ok: true,
      run_id: run.id,
      mode: authenticated ? "authenticated" : "keyless",
      queries: queries.length,
      search_results: searchResults,
      unique_repos: repos.length,
      readmes_fetched: readmesFetched,
      upserted,
      eligible: eligibleCount,
      rate_limit_remaining: lastRemaining,
      top_candidates: ranked.filter(x => x.analysis.eligible).slice(0, 10).map(x => ({
        full_name: x.repo.full_name,
        url: x.repo.html_url,
        stars: x.repo.stargazers_count || 0,
        score: x.analysis.score,
        class: x.analysis.capability_class,
        free: x.analysis.free_signal,
        api: x.analysis.has_api,
        openai_compatible: x.analysis.openai_compatible,
        self_hosted: x.analysis.self_hosted
      }))
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sql`
      update private.github_scan_runs
      set finished_at = now(), error = ${message}, rate_limit_remaining = ${lastRemaining}
      where id = ${run.id}
    `;
    throw e;
  }
}

Deno.serve(async (req: Request) => {
  try {
    let body: any = {};
    if (req.method !== "GET") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const url = new URL(req.url);
    const action = body.action || url.searchParams.get("action") || "health";
    if (action === "health") {
      return Response.json({
        ok: true,
        service: "github-llm-scanner",
        version: "1.0.0",
        github_token_configured: Boolean(GITHUB_TOKEN),
        mode: GITHUB_TOKEN ? "authenticated" : "keyless",
        base_queries: BASE_QUERIES.length,
        extra_queries_with_token: TOKEN_QUERIES.length
      });
    }
    if (action === "scan") return Response.json(await scan(body.source || "manual"));
    if (action === "candidates") return Response.json({ ok: true, candidates: await candidates(body.limit || 20) });
    if (action === "selftest") {
      const a = analyzeRepo({ id: 1, name: "free-router", full_name: "x/free-router", html_url: "https://github.com/x/free-router", description: "Free tier OpenAI-compatible inference API gateway", stargazers_count: 1000, topics: ["llm"], pushed_at: new Date().toISOString(), license: { spdx_id: "MIT" } });
      const b = analyzeRepo({ id: 2, name: "paper-list", full_name: "x/paper-list", html_url: "https://github.com/x/paper-list", description: "papers about language models", stargazers_count: 5, topics: [], archived: false });
      const pass = a.free_signal && a.has_api && a.openai_compatible && a.score >= 9 && b.capability_class === "research_only";
      return Response.json({ ok: pass, free_api_case: a, research_case: b });
    }
    return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
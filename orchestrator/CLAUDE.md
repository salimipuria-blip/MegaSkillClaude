# Orchestrator (Omni LLM Orchestrator — تاریخی) — دستور کار Claude

> وضعیت: **تاریخی/نگهداری** — مرجع مهاجرت و ممیزی برای ۱۰ تابع Supabase Edge؛ محصول فعال نیست؛ هیچ استقرار زنده‌ای از این پوشه مجاز نیست مگر با تأیید صریح مالک. آخرین بازبینی: 2026-10-18

```yaml
project:
  name: orchestrator
  purpose: >
    Snapshot (2026-09-12) of the old "Omni / free-llm-router" Supabase project: 10 Deno Edge Functions
    (free-LLM routing mesh, GitHub LLM-provider scanner/verifier, owner-only GitHub admin gateway,
    3000-skill installer/router/orchestrator) + schema snapshot + contract tests. Kept as migration/audit
    reference; skill routing now lives in psk/ (engine) and the mega-skills-router plugin; Hermes is the live assistant.
  active: false            # nothing here is deployed by this repo's CI; live project state is unverified since 2026-09-12
  stack: [Deno 2 (Supabase Edge Functions, TS/MJS), Python 3.12 (pytest, audit), Node 22 (node:test)]
  supabase_project_ref: aupkeramhsufnmhkbihl   # historical; not proof the project still exists
  entrypoints:
    functions: supabase/functions/<slug>/index.ts   # 10 slugs, listed in supabase/FUNCTION_MANIFEST.json
    pure_modules: [github-admin-gateway/handler.mjs, github-llm-verifier/net.mjs, skill-orchestrator/core.mjs]
    audit: scripts/audit/check_repository_contract.py
    local_router: skills/route.py           # needs the materialized registry (external artifact)
    installer: tools/install_mega_skills.py # <raw.zip> <router.zip>; archives are never committed
  commands:               # run from orchestrator/ (tests also work from the monorepo root since 2026-10-18)
    contract: python scripts/audit/check_repository_contract.py          # -> "repository contract: OK"
    pytest: python -m pytest -q -ra tests                                # 21 passed, 3 skipped (documented)
    pytest_strict: python -m pytest -q --require-materialized-skills tests  # fails until skills are materialized
    gateway_node: node --test supabase/functions/github-admin-gateway/*.test.mjs   # 7/7
    ssrf_node: node --test supabase/functions/github-llm-verifier/net.test.mjs     # 4/4 (also run by pytest)
    deno_gateway: deno check --no-remote supabase/functions/github-admin-gateway/index.ts && deno test --no-remote --no-prompt supabase/functions/github-admin-gateway/handler.test.mjs  # 7/7
    deno_all: see CI step "Deno deployability checks" (prepends // @ts-nocheck to each index.ts)  # 10/10
    no_local_deno: npx --yes deno <args>      # works in the cloud sandbox (deno 2.9.6 via npm)
    no_local_pytest: python3 -m venv /tmp/v && /tmp/v/bin/pip install pytest
    monorepo_doctor: node ../scripts/doctor.mjs orchestrator
  ci: .github/workflows/ci.yml job "orchestrator" (root); orchestrator/.github/workflows/baseline-ci.yml must stay (a test reads it)
  deploy: none from CI. Manual `supabase functions deploy <slug>` only after owner approval + SECURITY_NOTES release gate.
  secrets:   # names only; values live in Supabase project secrets, never in Git/chat
    edge: [SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_ANON_KEY, GITHUB_TOKEN, GITHUB_ADMIN_TOKEN, GITHUB_ADMIN_USER_IDS,
           OPENROUTER_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
           MISTRAL_API_KEY, COHERE_API_KEY, NVIDIA_API_KEY, HF_TOKEN, POLLINATIONS_KEY, TOGETHER_API_KEY, FIREWORKS_API_KEY,
           DEEPINFRA_API_KEY, AI_HORDE_API_KEY]   # template: .env.example
  status: {contract: OK, pytest: "21 pass / 3 skip", node: "11/11", deno_check: "10/10", deno_test: "7/7", date: 2026-10-18}
  owner_actions:
    - "Decide: retire the live Supabase project (or redeploy hardened functions). Until then treat it as unknown/unsafe."
    - "If kept live: redeploy github-llm-verifier (SSRF fix) and github-admin-gateway (owner allowlist); set GITHUB_ADMIN_USER_IDS."
    - "Provide the two historical skill archives only if the 3000-skill install must be reproduced."
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `supabase/functions/github-admin-gateway/` | تنها تابعِ با احراز مالک: `handler.mjs` کاربر را از `/auth/v1/user` می‌گیرد و با `GITHUB_ADMIN_USER_IDS` مقایسه می‌کند؛ `index.ts` فقط `Deno.serve`. تست: `handler.test.mjs` (mock، بدون شبکه). |
| `supabase/functions/github-llm-verifier/` | README مخزن‌های GitHub را تحلیل و endpoint رایگان را probe می‌کند؛ گارد SSRF در `net.mjs` (خالص، تست در `net.test.mjs`)؛ نتیجه در `private.github_llm_sources`/`dynamic_llm_providers`. |
| `supabase/functions/github-llm-scanner/` | جست‌وجوی GitHub و درج کاندیدها؛ `eligible: !repo.archived && score >= 2` + تریگر SQL `has_api` (تست قرارداد). |
| `supabase/functions/{free-llm-router,global-free-llm-mesh}/` | مسیریاب مدل‌های رایگان (سیاست صفر دلار، بدون fallback پولی). |
| `supabase/functions/{skill-installer,skill-router,skill-orchestrator,prompt-compiler,task-orchestrator}/` | زنجیرهٔ ۳۰۰۰ مهارت: نصب xz/bundle با SHA → جست‌وجو/rerank → کامپایل پرامپت verbatim → mesh. `skill-orchestrator/core.mjs` منطق خالص. |
| `supabase/migrations/20260912_live_snapshot.sql` | **اسنپ‌شات** اسکیمای `private` — هرگز به‌عنوان migration اجرا نشود. |
| `supabase/FUNCTION_MANIFEST.json`, `SNAPSHOT_MANIFEST.json` | فهرست ۱۰ تابع، `verify_jwt`، SHAهای مستقرشده در ۲۰۲۶-۰۹-۱۲ (کد فعلی gateway و verifier دیگر با این SHAها برابر نیست). |
| `scripts/audit/check_repository_contract.py` | گارد: فایل ممنوع (`.env`، zip، pem…) و الگوهای راز (ghp_, sb_secret_, AKIA, AIza, توکن تلگرام، کلید خصوصی). |
| `scripts/audit/materialization.py` + `tests/conftest.py` | فقط checkout «کاملاً materialize‌نشده» اجازهٔ skip دارد؛ نصب ناقص باید fail شود. |
| `skills/route.py`, `skills/registry/BASELINE_ARTIFACTS.json` | روتر محلی روی manifest خارجی؛ متادیتای SHA/اندازهٔ artifactها. |
| `tools/install_mega_skills.py` | materialize از دو zip خارجی؛ `route.py` را دیگر بازنویسی نمی‌کند. |
| `docs/SECURITY_NOTES.md` | گیت امنیت و انتشار — قبل از هر تغییر SQL/تابع بخوان. |

## قواعد سخت (MUST / NEVER)
```text
MUST  run contract + pytest + node tests before every commit touching orchestrator/ (counts above must not drop).
MUST  keep business logic in pure .mjs modules with node:test regressions; index.ts = wiring only.
MUST  every new tests/*.py resolves paths from Path(__file__).resolve().parents[1] (never cwd-relative).
MUST  perform caller authorization inside each function (verify_jwt=true is NOT authorization; anon JWTs pass it).
MUST  route every outbound fetch of a user/README-derived URL through net.mjs isSafePublicHttpsUrl + DNS check.
NEVER apply 20260912_live_snapshot.sql, deploy, or call the live project without explicit owner approval.
NEVER commit .env, *.zip, keys, the materialized registry, deno.lock files produced by local checks.
NEVER fake the 3 skipped installation tests (placeholder data) — skips are documented, not evidence.
NEVER enable a paid provider fallback (zero-dollar policy).
```

## اشکال‌زدایی
| نشانه | علت | بررسی | رفع |
|---|---|---|---|
| `ModuleNotFoundError: scripts.audit` | pytest قدیمی (<7) یا اجرای بدون `pytest.ini` | `python -m pytest --version` | pytest ≥7؛ `pythonpath = .` در `pytest.ini` هست |
| `No module named pytest` | محیط بدون pytest | `python3 -m pytest --version` | venv موقت (yaml: no_local_pytest) |
| `deno: command not found` | Deno نصب نیست | `which deno` | `npx --yes deno …` |
| `deno check` روی تابع npm-دار کند/خطای دانلود | اولین fetch بستهٔ npm | لاگ `Download https://registry.npmjs.org/...` | شبکه/پراکسی؛ بعد `deno.lock`های ساخته‌شده را پاک کن |
| ۳ تست skip | artifactهای تاریخی مهارت نیستند | `ls skills/registry` | عادی؛ برای گیت سخت `--require-materialized-skills` |
| skip ناگهان fail شد | پوشهٔ `skills/installed|original` یا manifest نیمه‌کاره ساخته شده | `can_skip_materialization` | نصب را کامل کن یا آن پوشه‌ها را حذف کن |
| `route.py: … is not materialized` | registry خارجی موجود نیست | همان پیام | `tools/install_mega_skills.py <raw.zip> <router.zip>` |
| `possible secret in: X` | الگوی راز در فایل | `check_repository_contract.py` | راز را حذف و در Supabase secret بگذار؛ اگر لو رفته rotate |
| gateway → 503 | allowlist/URL/anon key تنظیم نیست | پاسخ `Admin authorization is not configured` | `GITHUB_ADMIN_USER_IDS` (UUID)، `SUPABASE_URL` (https)، `SUPABASE_ANON_KEY` |
| تست قرارداد verifier/scanner بعد از ویرایش قرمز | تست‌ها رشتهٔ فشردهٔ منبع را grep می‌کنند | `tests/test_verifier_hosted_precedence.py` | منطق را حفظ کن یا تست را آگاهانه همراه تغییر به‌روز کن |

## صف کار
- **P0 (مالک):** تصمیم دربارهٔ پروژهٔ زندهٔ `aupkeramhsufnmhkbihl` — بازنشستگی یا redeploy امن. پذیرش: وضعیت live با یک بررسی read-only ثبت شود و در `PROGRESS.md` بیاید.
- **P1:** احراز نقش داخل ۹ تابع غیر-gateway (الگوی `handler.mjs`): پذیرش = تست node برای 401/403/503 هر تابع و هیچ fetch/write پیش از احراز. فقط وقتی پروژه live بماند.
- **P1:** گارد DNS-rebinding در mesh: فراخوانی `chat_url` ارائه‌دهندگان پویا بدون بررسی مجدد آدرس است. پذیرش: resolve + `ipIsPublic` پیش از هر POST و تست.
- **P2:** بازنشستگی توابع تکراری (`skill-router`، `free-llm-router`، `skill-orchestrator`) پس از تأیید جایگزین در `psk/`. پذیرش: هیچ فراخوان زنده‌ای در لاگ ۳۰ روزه.
- **P2:** تست انتها‌به‌انتهای installer با zipهای مصنوعی کوچک (نیازمند پارامتری کردن شمارش ۳۰۰۰).

## پروتکل به‌روزرسانی
1. قبل از کار: همین فایل + `docs/SECURITY_NOTES.md` را بخوان؛ گیت‌ها را اجرا و شمارش‌ها را با yaml مقایسه کن.
2. بعد از هر تغییر: شمارش‌ها و `آخرین بازبینی` همین فایل، ممیزی تاریخ‌دار در `PROFESSIONAL_GUIDE.md` و یک خط تاریخ‌دار در لاگ `PROGRESS.md`.
3. تغییر وضعیت مهم (بازنشستگی/استقرار) → `docs/PORTFOLIO.md` ریشه هم به‌روز شود تا هرمس بداند.

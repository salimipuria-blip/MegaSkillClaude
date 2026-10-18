# Professional Guide — orchestrator (ممیزی فنی)

> ممیزی تاریخ‌دار هر دور. دستور کار ثابت در `CLAUDE.md`؛ لاگ جریان در `PROGRESS.md`.
> آخرین ممیزی: **2026-10-18**.

## گیت‌های کیفیت (اجرا شده در 2026-10-18)
| گیت | قبل | بعد |
|---|---|---|
| `python scripts/audit/check_repository_contract.py` | OK | OK |
| `python -m pytest -q -ra tests` (از `orchestrator/`) | 16 pass / 3 skip | **21 pass / 3 skip** |
| همان pytest از ریشهٔ monorepo (`pytest orchestrator/tests`) | **خطا** (`ModuleNotFoundError: scripts.audit`) | 21 pass / 3 skip |
| `node --test …/github-admin-gateway/*.test.mjs` | 7/7 | 7/7 |
| `node --test …/github-llm-verifier/net.test.mjs` | — | **4/4** (جدید) |
| `deno check` gateway + `deno test` gateway (`npx deno` 2.9.6) | 7/7 | 7/7 |
| CI «Deno deployability» روی ۱۰ `index.ts` | 10/10 | 10/10 |

۳ skip همان artifactهای تاریخی مهارت‌اند (`skills/registry/BASELINE_ARTIFACTS.json`) — مستند و عمدی.

## یافته‌ها و رفع‌ها
1. **SSRF در `github-llm-verifier` (امنیتی، رفع شد).** `ipIsPublic` آدرس‌های IPv6 با IPv4 تعبیه‌شده را عمومی می‌دانست. ورودی شکننده: README با `https://[::ffff:127.0.0.1]/v1/models` — `new URL` آن را `[::ffff:7f00:1]` می‌کند، شاخهٔ `::ffff:` رشتهٔ `7f00:1` را دوباره به تابع می‌داد و چون «:» داشت `true` برمی‌گشت؛ همین برای `[::ffff:169.254.169.254]` (metadata)، `[64:ff9b::…]` (NAT64)، `[::127.0.0.1]` و multicast `ff02::1`. رفع: گارد به `net.mjs` (ماژول خالص) منتقل و بازنویسی شد؛ IPv6 به ۸ hextet باز می‌شود و IPv4 تعبیه‌شده (mapped/compatible/NAT64) با همان قواعد IPv4 بررسی می‌شود؛ unique-local، link/site-local، multicast، documentation و userinfo در URL رد می‌شوند؛ IPv6 خراب fail-closed. رگرسیون: `net.test.mjs` (۴ تست) و `tests/test_verifier_ssrf_guard.py` که آن را در job پایتون CI اجرا می‌کند. اثر روی live فقط پس از redeploy.
2. **تست‌ها وابسته به cwd بودند (رفع شد).** `conftest.py` و سه تست با مسیر نسبی؛ از ریشه `ImportError`، و `test_skill_orchestrator_contract` فایل گم‌شده را به `''` تبدیل می‌کرد (شکست گمراه‌کننده). رفع: `pythonpath = .` در `pytest.ini`، مسیرها از `Path(__file__)`، خواندن بی‌قید فایل.
3. **`skills/route.py` در import کرش می‌کرد (رفع شد).** بدون registry، traceback `FileNotFoundError`. رفع: `load_registry()` تنبل، پیام روشن و exit 1؛ `route()` registry تزریقی می‌گیرد. تست: `tests/test_local_router.py` (۳ تست).
4. **`tools/install_mega_skills.py` (رفع شد).** مسیرهای ثابت `/mnt/data/...` (محیط ChatGPT) و یک کپی جاسازی‌شده از `route.py` با `parents[1]` که registry را در `orchestrator/registry` (اشتباه) می‌جست — اجرای installer روتر را خراب می‌کرد. همچنین پوشه‌ها را قبل از اعتبارسنجی می‌ساخت (skip را به fail تبدیل می‌کرد). رفع: ورودی CLI دو zip با پیام usage، ROOT از مسیر فایل، ساخت پوشه پس از اعتبارسنجی، حذف تولید `route.py`.

## ریسک‌های باز (مستند، نه رفع‌شده — نیازمند تصمیم مالک/استقرار)
- **احراز در ۹ تابع غیر-gateway:** فقط `verify_jwt=true`؛ هر کسی با anon key عمومی می‌تواند سهمیهٔ LLM را مصرف کند، `scan`/`verify` (نوشتن در DB + درخواست خروجی) و `skill-installer` GET را صدا بزند. الگوی رفع: `github-admin-gateway/handler.mjs`.
- **DNS rebinding در mesh:** `chat_url` ارائه‌دهندگان پویا فقط هنگام probe بررسی شده؛ POST بعدی بدون resolve مجدد.
- **fallback ثابت `SUPABASE_URL`** در `skill-orchestrator/index.ts` (`https://aupkeramhsufnmhkbihl.supabase.co`) — در محیط دیگر بی‌صدا به پروژهٔ قدیمی وصل می‌شود.
- **SHAهای مستقرشده** در `FUNCTION_MANIFEST.json` با کد فعلی gateway و verifier برابر نیستند — live نسخهٔ قدیمی (ناامن‌تر) را اجرا می‌کند اگر هنوز روشن باشد.

## راهنمای کارایی
- منطق را در `.mjs` خالص نگه دار تا بدون Deno/DB با `node --test` در کسری از ثانیه تست شود.
- `deno check` روی توابع npm-دار اولین بار بسته دانلود می‌کند؛ `deno.lock` محلی را commit نکن.

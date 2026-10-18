# چام (نسخهٔ قدیمی) — دستور کار Claude

> **بازنشسته.** جانشین: `POINT/fjcod` (Supabase + RLS) روی https://cham-store-os.vercel.app · این پوشه فقط اصلاح امنیتی و ابزار خروجی داده می‌گیرد · آخرین بازبینی: 2026-10-18

```yaml
project:
  name: cham-store-os (legacy)            # package.json "name"
  purpose: POS + growth dashboard for the CHAM store; all data lives in one browser (localStorage)
  status: deprecated                      # no real sales were ever recorded here (owner, 2026-10-17)
  stack: [React 19, TypeScript 5.9, Vite 7, Vitest 5, playwright-core (e2e), jalaali-js, lucide-react]
  entrypoints:
    app: src/main.tsx -> src/App.tsx      # role-based panels after password-only login
    data: src/core/store.ts               # single in-browser DB, permissions, every mutation
    seed: src/core/seed.ts                # demo catalogue/sales; accounts via initial-passwords.ts
  commands:                               # verified 2026-10-18 in this folder
    install: npm ci
    check: npm run check                  # tsc -b + vitest (5 files, 45 tests) + vite build
    e2e: npm run build && E2E_STRICT=1 npm run e2e   # 19/19 steps, Chromium at /opt/pw-browsers
  deploy:
    vercel_project: cham-store-os         # since 2026-10-18 deploys POINT repo, rootDirectory fjcod
    this_folder_deployed: false           # cham-store-os is still git-linked to MegaSkillClaude (rootDirectory fjcod);
                                          # vercel.json ignoreCommand here is `exit 0` so this folder never deploys.
                                          # 2026-10-18: before that, merging PR #90 shipped this OLD app to production (fixed).
  successor:
    repo: salimipuria-blip/point
    path: fjcod/
    url: https://cham-store-os.vercel.app
  data_migration:                         # only if the owner entered real products/customers here
    1: "System & license page -> download backup (exportBackup(): whole DB as JSON)"
    2: "P1 tool to add: scripts/export-for-point.mjs <backup.json> <store_uuid> -> point-import.sql
        products(sku,barcode,name,category,price,cost,stock,min_stock,active) and
        customers(name,phone,note,points) map 1:1 to POINT tables; skip users (hashes never migrate),
        sales history (no shift/RPC trail) and phones failing ^09[0-9]{9}$ (report them)"
    3: "owner pastes point-import.sql in Supabase SQL Editor (no service_role key anywhere)"
  owner_actions:
    - "any device that used the old seeded passwords: change every account's password, or open the
       app once - leaked defaults now rotate automatically to one-time passwords shown on the login screen"
    - "after migration (or confirming nothing to migrate): archive the old FJCod GitHub repo (never delete)"
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `src/core/store.ts` | پایگاه‌دادهٔ مرورگر، `migrate()` (شامل چرخش رمزهای پیش‌فرض افشاشده)، ورود/قفل ۵ تلاش، فروش، مرجوعی، شیفت، پشتیبان |
| `src/core/initial-passwords.ts` | رمزهای ۸ رقمی تصادفی ورود اول؛ فقط در حافظه، یک بار روی صفحهٔ ورود |
| `src/core/seed.ts` | `SEED_USER_IDS`، دادهٔ نمایشی قطعی (mulberry32)، `cleanStart` |
| `src/core/permissions.ts` · `sales.ts` · `growth.ts` | نقش‌ها و مجوزها · حساب سبد/پرداخت/مرجوعی · موتور رشد |
| `src/lib/crypto.ts` | SHA-256 کشیده‌شده (۲۰۰۰ دور) با salt؛ برای HTTP بدون WebCrypto |
| `src/pages/*.tsx` | صفحه‌ها؛ `Login.tsx` جدول رمزهای یک‌بارمصرف را نشان می‌دهد |
| `tests/setup.ts` | رمزهای ثابت `fx-*` فقط برای تست واحد |
| `tests/initial-passwords.test.ts` | تست رگرسیون «هیچ رمز قدیمی در src/scripts/docs/tests/*.md نیست» + چرخش |
| `scripts/e2e-smoke.mjs` | ۱۹ مرحلهٔ مرورگری؛ رمزها را از صفحهٔ ورود می‌خواند |
| `supabase/migrations/20261014000000_cham_schema_rls.sql` | طرح قدیمی؛ **اعمال نشود** — نسخهٔ معتبر در POINT است |

## قواعد سخت (MUST / NEVER)
- NEVER قابلیت جدید اینجا؛ فقط اصلاح امنیتی، اصلاح داده و ابزار خروجی برای انتقال به POINT.
- NEVER رمز، هش رمز جدید یا کلید را در کد/مستند/تست بنویس. تست رگرسیون همین را می‌گیرد.
- NEVER این پوشه را به پروژهٔ Vercel وصل کن؛ `cham-store-os` مال POINT است.
- NEVER این migration را روی Supabase واقعی اجرا کن.
- MUST قبل از هر push: `npm run check` سبز و در صورت تغییر UI، `E2E_STRICT=1 npm run e2e`.
- MUST هر تغییر رفتار → یک خط در `PROGRESS.md` و به‌روزرسانی `PROFESSIONAL_GUIDE.md`.

## اشکال‌زدایی
| نشانه | علت محتمل | بررسی | رفع |
|---|---|---|---|
| ورود با هیچ رمزی ممکن نیست | رمزهای یک‌بارمصرف دیده نشده و صفحه رفرش شده | `localStorage['cham.db.v1']` | «سیستم» → بازگشت به دادهٔ نمایشی (فقط مالک)، یا پاک‌کردن کلید و بازکردن دوباره |
| «صبر کنید» در ورود | ۵ تلاش اشتباه | `getDB().authGuard` | یک دقیقه صبر |
| e2e: `first visit must show the one-time passwords` | پروفایل مرورگر از قبل داده دارد یا Login پنل را نشان نمی‌دهد | `[data-initial-password]` در DOM | context تازه؛ بررسی `peekInitialPasswords` |
| تست‌های واحد با رمز `fx-*` رد می‌شوند | `vi.resetModules()` provider را برگرداند | `tests/setup.ts` | بعد از reset، `await import('./setup')` |
| `E2E skipped` | Chromium پیدا نشد | `/opt/pw-browsers` یا `CHROMIUM_PATH` | `E2E_STRICT=1` برای خطای صریح |

## صف کار
- **P0 (انجام شد 2026-10-18):** حذف رمزهای متنی از کد و README؛ رمز تصادفی یک‌بارمصرف؛ چرخش خودکار پیش‌فرض‌های افشاشده. پذیرش: ۴۵ تست، e2e ۱۹/۱۹، تست رگرسیون.
- **P1:** `scripts/export-for-point.mjs` طبق `data_migration` بالا + تست با یک پشتیبان نمونه. پذیرش: SQL خروجی روی Postgres محلی با اسکیمای POINT بدون خطا اجرا شود و شمار ردیف‌ها برابر باشد.
- **P1 (بیرون این پوشه):** jobهای `fjcod`/`fjcod-e2e` در `.github/workflows/ci.yml` تا پیش از Archive بمانند؛ بعد از انتقال حذف شوند.
- **P2:** بعد از انتقال، این پوشه با یک README کوتاه «منتقل شد به POINT» جایگزین و ریپوی FJCod آرشیو شود.

## پروتکل به‌روزرسانی
1. قبل از کار: همین فایل، بعد `PROGRESS.md` (آخرین ورودی) را بخوان.
2. بعد از هر تغییر: `npm run check` (+ e2e اگر UI)، نتیجهٔ عددی را در `PROGRESS.md` با تاریخ ثبت کن.
3. هر یافتهٔ فنی تازه → `PROFESSIONAL_GUIDE.md`؛ هر تغییر وضعیت/انتشار → بلوک yaml همین فایل و `docs/PORTFOLIO.md` ریشه.

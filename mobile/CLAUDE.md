# کنسول آیفون مگااسکیل (`mobile/`) — دستور کار Claude

> وضعیت: کد سالم و تست‌شده (Node ۱۷/۱۷، Python ۸/۸، doctor سبز)؛ **هنوز روی هیچ هاست HTTPS منتشر نشده** و روی iPhone واقعی تست نشده. آخرین بازبینی: 2026-10-18.

```yaml
project:
  name: mega-mobile-console
  purpose: >
    PWA فارسی و آفلاین برای آیفون: بازکردن همین مخزن در vscode.dev/github.dev،
    جست‌وجوی ۵٬۷۴۵ مهارت قابل‌مسیریابی روی دستگاه، کپی پرامپت آماده و دستور تست هر پروژه.
  stack: [HTML, CSS, "ES modules (no build step)", "Service Worker", "Python 3 generator"]
  backend: none            # هیچ API، کلید، کوکی یا دادهٔ کاربر به سرور نمی‌رود
  entrypoints:
    page: mobile/index.html
    ui: mobile/app.js          # رندر تب‌ها، کارت پروژه‌ها، شیت مهارت، کپی
    search: mobile/search.mjs  # pure؛ نرمال‌سازی، توکن، رتبه‌بندی، escape، اعتبار payload
    worker: mobile/sw.js       # cache-first نسخه‌دار؛ CACHE تولیدی است
    generator: mobile/build-index.py
  source_of_truth: .claude/skills/mega-skills-router/references/triggers.json
  generated: [mobile/skills-index.json, "const CACHE in mobile/sw.js"]   # دستی ویرایش نشوند
  commands:  # همه از ریشهٔ مخزن، در 2026-10-18 اجرا شدند
    rebuild: python3 mobile/build-index.py            # بعد از هر تغییر asset یا مهارت
    check:   python3 mobile/build-index.py --check    # "OK (5745 routable skills; ... 2242635 bytes raw / 409617 gzipped)"
    syntax:  node --check mobile/app.js && node --check mobile/sw.js && node --check mobile/search.mjs
    unit:    node --test mobile/search.test.mjs mobile/index.test.mjs   # 17/17
    repo:    python3 -m unittest discover -s tests -p test_mobile_console.py   # 8/8
    doctor:  node scripts/doctor.mjs mobile          # همان سه گام CI
    local:   python3 -m http.server 8765 --directory mobile   # SW روی localhost هم فعال است
  ci: .github/workflows/ci.yml (job اول: build-index --check + syntax + node --test)
  deploy: NONE   # هیچ vercel.json / Pages برای mobile/ وجود ندارد
  secrets: none
  budgets: {index_raw_bytes_max: 3145728, triggers_per_skill_max: 5}
  status: code-ready, not-hosted, real-Safari-untested
  owner_actions:
    - انتخاب هاست HTTPS (پیشنهاد: پروژهٔ Vercel جدا با Root Directory = mobile، بدون build)
    - نصب روی Home Screen آیفون واقعی و گزارش نتیجهٔ چک‌لیست P0
```

## نقشهٔ کد
| فایل | مسئولیت | نکتهٔ حساس |
|---|---|---|
| `index.html` | پوستهٔ RTL، ۴ تب، متادیتای iOS (`apple-mobile-web-app-*`, `viewport-fit=cover`) | شمارنده‌ها (۵٬۷۴۵ و ۶٬۰۲۹) با تست به منبع canonical قفل‌اند |
| `app.js` | `PROJECTS` (۱۳ کارت)، تب‌ها، کپی/toast، چیپ حوزه، شیت مهارت (Esc می‌بندد) | هر رشتهٔ داده‌ای فقط با `escapeHtml` وارد HTML شود |
| `search.mjs` | `normalizeText` → `tokenize` → `buildSearchIndex` (یک‌بار) → `searchSkills` | مرتب‌سازی: `hits` ↓، `score` ↓، `position` ↑ |
| `sw.js` | precache کامل، cache-first، پاک‌کردن فقط `mega-mobile-*` قدیمی | فقط GET هم‌origin داخل scope؛ fallback پوسته فقط برای navigate |
| `build-index.py` | ساخت ایندکس فشرده (حذف `incomplete`ها، ۵ تریگر) + اثرانگشت محتوایی SW | `PRECACHE_ASSETS` باید با `ASSETS` در `sw.js` یکی بماند |
| `search.test.mjs` / `index.test.mjs` | منطق جست‌وجو / فایل تولیدی کامیت‌شده و شمارنده‌ها | هر باگ جدید = یک تست regression |
| `../tests/test_mobile_console.py` | پوشش کارت‌های doctor، شمارنده، تغییر asset ⇒ تغییر cache | بیرون از `mobile/`؛ با doctor هم‌گام است |

قرارداد جست‌وجو (به‌ترتیب اجرا):
```text
normalize: NFKC → lower → حذف حرکات/تطویل (U+064B–065F, U+0670, U+0640) → ي/ى→ی, ك→ک, ة/ۀ/ە→ه, أ/إ/ٱ→ا
           → ارقام فارسی/عربی→ASCII → حذف ZWNJ → عبارت‌های «برنامه/کد نویسی»→code
tokenize:  split(/[^\p{L}\p{N}]+/u) → len>1 → حذف STOP_WORDS (شامل ها/های/ترین…) → ALIASES (فقط Object.hasOwn)
index:     nameTokens(name با - به فاصله) ؛ triggerTokens = شکل چسبیده + شکل جداشده روی ZWNJ
score:     name=5, trigger=2 ؛ آخرین توکن ≥۳ حرف: prefix روی name=2 / trigger=1
query بی‌توکن ولی غیرخالی (فقط stop word/تک‌حرف) ⇒ [] ؛ query خالی ⇒ مرور همه
```

## قواعد سخت (MUST / NEVER)
- **MUST** بعد از تغییر هر فایل precache‌شده یا triggers.json: `python3 mobile/build-index.py` و کامیت `skills-index.json` + `sw.js` در همان PR؛ وگرنه کاربر نصب‌شده نسخهٔ قدیمی را تا ابد می‌بیند.
- **MUST** هر مقدار ایندکس/پروژه که وارد `innerHTML` یا attribute می‌شود از `escapeHtml` بگذرد؛ مسیر مهارت فقط با `isSafeSkillPath` پذیرفته شود.
- **MUST** هر عدد نمایش‌داده‌شده از منبع canonical تست شود (نه عدد دستی).
- **MUST** asset جدید در هر دو فهرست `ASSETS` (sw.js) و `PRECACHE_ASSETS` (build-index.py) اضافه شود.
- **NEVER** ویرایش دستی `skills-index.json` یا خط `const CACHE`.
- **NEVER** `caches.delete` روی کلیدی که با `mega-mobile-` شروع نمی‌شود (Cache Storage بین اپ‌های یک origin مشترک است).
- **NEVER** افزودن backend، analytics، کلید یا ارسال عبارت جست‌وجو به بیرون.
- **NEVER** lookup روی شیء ساده بدون `Object.hasOwn` (باگ `constructor` در 2026-10-18).

## اشکال‌زدایی
| نشانه | علت محتمل | بررسی | رفع |
|---|---|---|---|
| آیفون نسخهٔ قدیمی را نشان می‌دهد | اثرانگشت بازسازی نشده یا هاست `sw.js` را کش کرده | `python3 mobile/build-index.py --check`؛ هدر `Cache-Control` روی `sw.js` | rebuild + کامیت؛ روی هاست `sw.js` را `no-cache` سرو کن |
| «ایندکس بارگذاری نشد» | JSON ناقص/schema جدید/۴۰۴ | DevTools → Network `skills-index.json`؛ `isSkillsPayload` | rebuild؛ اگر schema عوض شده هر دو سمت را با هم عوض کن |
| عبارت فارسی نتیجه نمی‌دهد | شکل حرف/نشانه/ZWNJ | `node -e "import('./mobile/search.mjs').then(m=>console.log(m.tokenize('…')))"` | قاعده به `normalizeText` + تست؛ یا alias در `ALIASES` |
| همهٔ مهارت‌ها برای یک کلمه می‌آیند | query بعد از توکن خالی شده | `tokenize(query)` خالی است؟ | باید `[]` برگردد (تست موجود) |
| رتبهٔ نامربوط بالا | تک‌کلمهٔ قوی در نام | ترتیب `hits`→`score` | alias یا تریگر بهتر در منبع canonical، نه هک UI |
| آفلاین صفحهٔ سفید | SW نصب نشده (HTTP، نه HTTPS) | `navigator.serviceWorker.controller` | فقط HTTPS یا localhost |
| `--check` می‌گوید budget رد شد | رشد ایندکس > 3 MiB | خروجی bytes raw/gzip | تقسیم دامنه‌ای یا بارگیری تدریجی؛ بودجه را بی‌دلیل بالا نبر |
| سرریز افقی/زیر notch | safe-area | Chromium با `devices['iPhone 13']`، `scrollWidth` | `env(safe-area-inset-*)` در `styles.css` |

## صف کار
- **P0 — انتشار HTTPS** (مالک تصمیم می‌گیرد): پروژهٔ Vercel با Root=`mobile`، Framework=Other، بدون build؛ هدر `Cache-Control: no-cache` برای `sw.js` و `skills-index.json`. پذیرش: باز شدن روی Safari، نصب به Home Screen، `navigator.serviceWorker.controller` غیرتهی.
- **P0 — تست iPhone واقعی**: نصب → حالت هواپیما → جست‌وجوی «طراحی لوگو» نتیجه دهد → rebuild و deploy → reconnect → نسخهٔ جدید (cache name تازه) فعال شود.
- **P1 — زمان شروع سرد**: `buildSearchIndex` روی Node دسکتاپ ۱۵۰–۴۰۰ms است؛ روی آیفون اندازه بگیر. اگر >۳۰۰ms: ساخت در `requestIdleCallback`/Web Worker. پذیرش: input تا ۱۰۰ms پس از بارگذاری پاسخ‌گو.
- **P1 — اعلان نسخهٔ جدید**: وقتی SW جدید activate شد، toast «نسخهٔ تازه — تازه‌سازی» (الان بی‌صدا عوض می‌شود). پذیرش: تست مرورگری با دو build.
- **P2 — دسترس‌پذیری**: focus trap در شیت، `aria-selected` روی تب‌ها، تست VoiceOver.
- **P2 — PROJECTS از منبع واحد**: کارت‌ها از `scripts/doctor.mjs` تولید شوند تا دستی عقب نمانند (چام جدید در مخزن POINT است، نه `fjcod/` این مخزن).

## پروتکل به‌روزرسانی
1. قبل از تغییر: این فایل + `PROGRESS.md` را بخوان؛ `node scripts/doctor.mjs mobile` را اجرا و نتیجه را یادداشت کن.
2. باگ را با یک تست قرمز بازتولید کن، کمترین اصلاح، تست سبز.
3. `python3 mobile/build-index.py` → `--check` → `node --test mobile/*.test.mjs` → `python3 -m unittest discover -s tests -p test_mobile_console.py`.
4. اگر UI عوض شد: smoke با Playwright (پروفایل iPhone 13؛ عرض ۳۹۰، صفر خطای console).
5. ثبت: یک ورودی تاریخ‌دار در `PROGRESS.md` (فرمان + عدد واقعی)، به‌روز کردن `PROFESSIONAL_GUIDE.md` (یافته‌ها) و همین فایل (yaml `status`، صف کار، تاریخ بازبینی).
6. هرگز «انجام شد» برای چیزی که روی iPhone واقعی دیده نشده نگو؛ بنویس «emulation».

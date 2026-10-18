# BISON Brand Book — دستور کار Claude

> وضعیت: ۲۴ تست سبز، بیلد سبز، audit صفر؛ ZIP آفلاین سالم؛ اتصال Vercel به این پوشه تأییدنشده. آخرین بازبینی: 2026-10-18

```yaml
project:
  name: bison-brand-book
  purpose: برندبوک دیجیتال سینمایی BISON (برند پوشاک لوکس outdoor) با دموی زندهٔ دسکتاپ/موبایل و ZIP قابل دانلود
  stack: Vite 6 (base "./") + vanilla JS (ESM) + GSAP 3.13 ScrollTrigger + Lenis 1.3; بدون فریم‌ورک، عمداً
  language_of_page: en (lang="en", LTR) — فقط public/download.html فارسی/RTL است
  entrypoints:
    page: index.html            # همهٔ محتوا؛ تک‌صفحه
    script: src/main.js         # موشن، اسکرول، ناوبری، سواچ‌ها، دیالوگ دمو
    styles: src/styles.css      # توکن‌ها در :root
    download_page: public/download.html
    offline_zip: public/BISON-Brand-Book.zip   # خروجی scripts/build-zip.mjs؛ در Git
  commands:                      # همه در 2026-10-18 اجرا و سبز شدند (cwd = bison-brand-book)
    install: npm ci
    test: npm test               # 24 تست: static 8 + a11y 12 + zip 4 (node:test؛ نیازمند unzip)
    build: npm run build         # dist/index.html 24.89kB, CSS 22.15kB, JS 140.01kB (gzip 52.71kB)
    zip: npm run zip             # ZIP آفلاین را از نو می‌سازد (نیازمند zip)
    audit: npm audit --omit=dev  # 0 vulnerabilities
    doctor: node ../scripts/doctor.mjs bison-brand-book   # contract + build + audit
    dev: npm run dev             # 0.0.0.0:5173
  ci: .github/workflows/ci.yml job "bison-brand-book" → npm ci, npm test, npm run build
  deploy:
    vercel: vercel.json فقط ignoreCommand دارد (اگر پوشه از آخرین استقرار تغییر نکرده، ساخت رد می‌شود؛ فقط exit 0/1)
    legacy: GitHub Pages و raw-linkهای ریپوی قدیمی bison-brand-book مرده‌اند (404/403) — به آن‌ها لینک نده
  secrets: none                  # سایت ایستاست؛ هیچ کلیدی نباید در فرانت باشد (تست دارد)
  status: production-ready برای محتوای فعلی؛ بازبینی بصری روی دستگاه واقعی انجام نشده
  owner_actions:
    - تأیید اینکه پروژهٔ Vercel (bison.brandbook.site.2026) به MegaSkillClaude با Root Directory = bison-brand-book وصل است و دامنهٔ زنده
    - Archive ریپوی قدیمی bison-brand-book (فقط با تأیید مالک)
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `index.html` | ۹ بخش (`#origin` تا `#close`)، ناوبری لنگری، `#overlay` دیالوگ دمو (بیرون از `main`) |
| `src/main.js` | `bootScroll` (Lenis + `gsap.ticker` → `lenis.raf(ms)`)، `bootMotion` (GSAP، با گارد reduced-motion)، `bootNav`، `bootSwatches` (کپی hex)، `bootDevices` (دکمه‌های `aria-pressed` + دیالوگ با `inert` و برگرداندن فوکوس) |
| `src/styles.css` | توکن‌های برند در `:root` (`--iron --hide --stone --dust --bone --snow --gold --ember --ember-ink`)، بدون `@import` |
| `public/images`, `public/logos` | عکس‌ها و مارک‌ها (PNG مارک‌ها ~۶۰۰KB، بهینه نشده) |
| `public/docs/brand-guidelines.md` = `docs/brand-guidelines.md` | راهنمای نوشتاری (دو نسخهٔ یکسان؛ نسخهٔ public داخل ZIP می‌رود) |
| `design-system/bison-brand-book/MASTER.md` | دیزاین‌سیستم تولیدشده (مرجع، در بیلد نیست) |
| `scripts/build-zip.mjs` | بیلد آفلاین: `--base ./`، حذف `crossorigin`، اسکریپت کلاسیک `defer` در IIFE، حذف لینک‌های ZIP از نسخهٔ آفلاین |
| `tests/static.test.mjs` | مسیرهای root-absolute، وجود asset، لنگرها، ZIP واقعی، بدون راز، reduced-motion |
| `tests/a11y.test.mjs` | کنتراست WCAG با آبشار واقعی CSS، alt، `aria-pressed`، دیالوگ modal، لینک‌های بیرونی، فونت، lazy-load، `type="button"`، `lenis.raf` |
| `tests/zip.test.mjs` | محتوای ZIP: بدون module/crossorigin/مسیر مطلق، همهٔ ارجاع‌ها داخل ZIP، اسکریپت IIFE |

## قواعد سخت (MUST / NEVER)
```text
MUST  مسیر asset محلی در index.html با "/" شروع شود (قرارداد public/ در Vite)؛ Vite آن را به "./" بیلد می‌کند.
MUST  هر متن کوچک (<18px) روی bone/snow ≥ 4.5:1؛ روی bone از --ember-ink استفاده کن، نه --gold (1.84:1) یا --ember (3.73:1).
MUST  هر رنگ جدید برای متن، در tests/a11y.test.mjs با finalColor(selector) قفل شود (آخرین قاعدهٔ هم‌specificity برنده است).
MUST  بعد از هر تغییر در index.html / src / public: npm run zip، سپس npm test (تست zip ZIP کهنه را نمی‌گیرد مگر رفتارش خراب باشد).
MUST  تصویر زیر fold: loading="lazy" decoding="async"؛ فقط hero با fetchpriority="high".
MUST  هر انیمیشن/اسکرول جدید پشت گارد `reduced` در main.js.
NEVER لینک به github.com/salimipuria-blip/bison-brand-book یا *.github.io (مرده)؛ ZIP همیشه "/BISON-Brand-Book.zip".
NEVER role="tab" بدون tabpanel و ناوبری با کلید جهت؛ برای سوییچ از aria-pressed استفاده کن.
NEVER aria-label روی div/span بدون role.
NEVER @import فونت در CSS (زنجیرهٔ render-blocking)؛ فونت با <link> + preconnect در <head>.
NEVER API قدیمی Lenis (tick)؛ فقط lenis.raf(time * 1000).
NEVER کلید/توکن در فرانت؛ تغییر پالت برند بدون تأیید مالک.
```

## اشکال‌زدایی
| علامت | علت محتمل | بررسی | رفع |
|---|---|---|---|
| خطای `*.tick is not a function` در هر فریم | API قدیمی Lenis | کنسول مرورگر؛ `grep -n "lenis\." src/main.js` | `lenis.raf(time * 1000)` |
| ZIP بازشده بی‌استایل و بی‌JS | `type="module"`/`crossorigin` از `file://` بلاک می‌شود، یا `/assets/` | `unzip -p public/BISON-Brand-Book.zip index.html \| grep -n "script\|stylesheet"` | `npm run zip` |
| رنگ متن عوض نمی‌شود | قاعدهٔ بعدی با همان specificity برنده است | DevTools → Computed؛ `finalColor` در تست | قاعدهٔ اصلی را ویرایش کن، نه override قبلی |
| Tab از دیالوگ دمو بیرون می‌رود | `inert` روی پس‌زمینه نیست | `document.querySelector('#main').inert` هنگام باز بودن | `setBackgroundInert` در openLive/closeLive |
| لودر دیر محو می‌شود | `load` منتظر همهٔ تصاویر eager است | Network → حجم تصاویر قبل از load | lazy برای زیر fold؛ بهینه‌سازی PNGها |
| فونت‌ها در ایران بار نمی‌شوند | Google Fonts فیلتر/کند | Network → fonts.googleapis.com | fallback سیستمی دارد؛ میزبانی محلی فونت (صف کار) |
| Vercel «Failed» بدون خطای بیلد | ignoreCommand کدی غیر از 0/1 داده | لاگ Vercel | فقط `exit 0` (رد) یا `exit 1` (ساخت) |
| `npm test` در CI قرمز با ENOENT unzip | ابزار unzip نیست | `which unzip` | runner اوبونتو دارد؛ محلی نصب کن |

اجرای مرورگر واقعی (همان روش این دور، Playwright سراسری و Chromium پیش‌نصب):
```bash
npm run build && npx vite preview --port 4179 --strictPort &   # سپس با playwright کنسول را بی‌خطا، دیالوگ و کنتراست را چک کن
```

## صف کار
- **P0** — تأیید استقرار زنده: آدرس Vercel این پوشه پاسخ 200 بدهد و `/BISON-Brand-Book.zip` دانلود شود. پذیرش: `curl -I <domain>/BISON-Brand-Book.zip` → 200 و `content-length` ≈ 4.3MB.
- **P1** — بهینه‌سازی تصاویر: `mark-*.png` و لوگوها (~۶۰۰KB، RGB بدون alpha) به WebP/AVIF با `<picture>`. پذیرش: مجموع تصاویر eager (hero + دو مارک) از ۱٫۴۶MB به < ۴۰۰KB؛ تست lazy/eager سبز.
- **P1** — ابعاد تصاویر (`width`/`height`) برای CLS. پیش‌شرط: هر `img` در CSS `height:auto` یا ابعاد صریح داشته باشد (وگرنه صفحه می‌شکند). پذیرش: CLS < 0.1 در Lighthouse موبایل.
- **P2** — میزبانی محلی فونت‌ها (woff2 زیر `public/fonts`) برای کاربران ایران و ZIP آفلاین. پذیرش: صفر درخواست به fonts.googleapis.com؛ تست فونت به‌روز شود.
- **P2** — لودر بدون JS گیر نکند (fallback انیمیشن CSS یا `noscript`). پذیرش: با JS خاموش محتوا در < ۳s دیده شود.
- **P2** — LCP موبایل < 2.5s (هدف نقشهٔ راه) با Lighthouse ثبت شود.

## پروتکل به‌روزرسانی
1. قبل از تغییر: `npm test && npm run build` و نتیجه را بدان.
2. بعد از تغییر: تست رگرسیون در `tests/` (هر باگ = یک تست که بدون رفع قرمز شود؛ با جهش تأیید کن)، سپس `npm run zip`، `npm test`، `npm run build`، `npm audit --omit=dev`.
3. یک ورودی تاریخ‌دار در `PROGRESS.md` (لاگ فقط اضافه می‌شود)؛ ممیزی فنی در `PROFESSIONAL_GUIDE.md` بازنویسی شود.
4. همین فایل: بلوک yaml (شمار تست، اندازهٔ بیلد، وضعیت)، صف کار و جدول اشکال‌زدایی به‌روز شود؛ تاریخ «آخرین بازبینی».
5. تغییر مهم وضعیت → `docs/PORTFOLIO.md` ریشه هم (منبع دانش هرمس).

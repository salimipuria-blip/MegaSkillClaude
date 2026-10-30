# مِتاکد / APEX-01 (`apex-agent/`) — دستور کار Claude

> وضعیت: کد سالم و تست‌شده (Node ۳۵/۳۵، قرارداد ایستا پاک، زیپ تأییدشده)؛ **در محیطِ بدون مرورگر رندر نشده** و روی Netlify واقعی مستقر نشده. آخرین بازبینی: 2026-10-30.

```yaml
project:
  name: apex-metacode
  purpose: >
    ایجنت کدنویسِ فارسی و خودتکامل که بدون سرور اجرا می‌شود: سه نامزد می‌سازد،
    سه فرضیهٔ شکست را واقعاً اجرا می‌کند، برنده را با روبریکِ وزنی انتخاب می‌کند،
    تغییر را در سندباکس مرورگر اثبات می‌کند و ژنومِ خودش را روی بنچمارک می‌سنجد.
  stack: [HTML, CSS, "ES modules (no build step)", "Web Worker sandbox", "Netlify Functions (optional)"]
  backend: optional   # فقط پروکسی LLM؛ پیش‌فرض خاموش و توکن‌محور
  entrypoints:
    page: apex-agent/index.html
    boot: apex-agent/src/app/boot.js        # اتصال رویدادها، پالت، تم، میدان ذره‌ای
    ui:   apex-agent/src/app/ui.js          # چت، اجرا، رویدادها، تأیید، فایل
    views: apex-agent/src/app/views.js      # کارگاه، تکامل، حافظه، تنظیمات
    state: apex-agent/src/app/state.js      # ذخیره/بازیابی، مهاجرت نسخه، صدور
    self:  apex-agent/src/app/self.js       # خودکاوی: بارگیری و ممیزی کدِ خودِ اپ
    core:  apex-agent/src/core/*.js         # ۱۶ ماژول خالص، بدون DOM
  source_of_truth: apex-agent/src/core
  commands:  # همه در 2026-10-30 اجرا شدند
    check:   node tools/check.mjs                  # "✓ static contract is clean"
    test:    node --test src/tests/*.test.mjs      # 35/35 در ۶٬۴ ثانیه
    core:    node --test src/tests/core.test.mjs   # 30/30
    dom:     node --test src/tests/dom.test.mjs    # 5/5 (نیازمند jsdom)
    zip:     node tools/make_zip.mjs               # release/apex-metacode-netlify.zip
    serve:   python3 -m http.server 8080           # همان پوشه
    doctor:  node scripts/doctor.mjs apex          # check + test
  deploy: netlify.toml (publish = ".", functions = "netlify/functions")
  secrets: APEX_PROXY_TOKEN + APEX_UPSTREAM_KEY (فقط اگر پروکسی روشن شود)
  budgets: {zip_kb_max: 900, dom_per_case_ms: 1500, context_tokens: 2400}
  status: code-ready, browser-render-unverified, not-deployed
  owner_actions:
    - بازکردن پیش‌نمایش و تأیید بصری سه تب اصلی در موبایل واقعی
    - انتخاب یک ارائه‌دهنده و یک اجرای زنده با کلید برای تأیید مسیر مدل
    - انتشار روی Netlify Drop و ثبت URL در README
```

## نقشهٔ کد

| فایل | مسئولیت | نکتهٔ حساس |
|---|---|---|
| `src/core/agent.js` | چرخهٔ اجرا، رویدادها، حلقهٔ ابزار، لغو | هر رویدادِ نمایشی باید از اینجا بگذرد؛ UI نباید وضعیت را حدس بزند |
| `src/core/triad.js` | ۳ استراتژی، ۳ فرضیه، روبریک، انتخاب | وزن‌ها از ژنوم می‌آیند، نه از ثابت |
| `src/core/evaluate.js` | اجرای تست/پروب، امتیازها | تست پنهان هرگز به نامزد نشان داده نمی‌شود |
| `src/core/sandbox.js` | Worker + `node:vm`، مقایسهٔ ساختاری | تنها جای مجازِ `new Function` |
| `src/core/diff.js` | LCS، دیف، اعمال سخت‌گیر | اعمال ناموفق باید صریح خطا بدهد، نه اعمال نصفه |
| `src/core/vfs.js` | فایل، نسخه، عکس فوری | نوشتن بدون نسخه ممنوع |
| `src/core/compress.js` | اتمیزه، حذف تکرار، بسته‌بندی | محافظت‌شده‌ها هرگز حذف نمی‌شوند |
| `src/core/providers.js` | ۴ پروتکل سیم، ۱۳ ارائه‌دهنده | کلید فقط هدر/کوئری |
| `src/core/genome.js` + `evolution.js` | ژن، جهش، تناسب اندام، نسل | پذیرش فقط با ε و بدون رگرسیون |
| `src/core/evals.js` | ۱۰ تسک + تست پنهان | تغییر تسک ⇒ اجرای دوبارهٔ همهٔ تست‌ها |
| `src/core/reflex.js` | مغز بدون کلید | خارج از ۱۰ خانواده ⇒ اسکلتِ صادقانه، نه سبزِ قلابی |
| `src/app/*.js` | رندر، رویداد، ذخیره | هیچ منطق هسته‌ای اینجا تکرار نشود |

## MUST

- بعد از هر تغییر: `node tools/check.mjs && node --test src/tests/*.test.mjs`.
- هر شناسهٔ DOM که در JS استفاده می‌شود باید در `index.html` باشد (تست ایستا می‌گیرد).
- `src/core/**` بدون DOM، بدون `window`، بدون `location` بدون گارد.
- هر رشتهٔ ورودی با `esc`؛ هر آتریبیوت با `h`.
- متنِ رابط فارسی و راست‌به‌چپ؛ کد و دستور انگلیسی.
- آمار و اعداد فقط از اجرای واقعی؛ در گزارش بنویس «اجرا نشد» اگر اجرا نشده.

## NEVER

- ادعای سبز بودن بدون خروجی تست.
- نوشتن کلید در ZIP، صدور JSON، `memory.journal` یا لاگ کنسول.
- `innerHTML` با دادهٔ خامِ مدل.
- حذفِ تست برای سبز شدن؛ اگر تست شکست، کد را درست کن یا تست را با دلیل بازنویسی کن.
- افزودن وابستگی اجرایی؛ پروژه باید بدون `npm install` کار کند.
- تغییر `RELEASE_DATE` یا ساختار ZIP بدون تأیید مالک (خروجی باید تکرارپذیر بماند).

## جدول اشکال‌زدایی

| نشانه | علت | بررسی | رفع |
|---|---|---|---|
| `check.mjs` می‌گوید id گم است | شناسه در `index.html` نیست | پیام دقیق همان id را می‌دهد | به HTML اضافه کن یا در JS به شناسهٔ موجود وصل کن |
| تست DOM تایم‌اوت می‌شود | ماژول کش شده و boot دوباره اجرا نشده | `?case=N` در ایمپورت | شمارندهٔ یکتا |
| `Cannot set property navigator` | `Object.defineProperty` روی گلوبالِ فقط‌خواندنی | Node ≥ 22 | در `try/catch` بگذار |
| `rows.slice is not a function` | شناسهٔ تکرارشده با کلیدِ وضعیت | `grep -n "journal" src/core/memory.js` | نام متد را عوض کن (`journalEntry`) |
| تست‌ها می‌گذرند ولی اجرا بی‌نهایت طول می‌کشد | تایمر/انیمیشن آزاد نشده | `app.dispose()` صدا زده می‌شود؟ | `closeApp` در `finally` |
| `Maximum call stack size exceeded` در تست | `closeApp` خودش را صدا می‌زند | بدنهٔ helper | `dom.window.close()` صریح |
| تأیید قرمز ولی بنچمارک سبز | مسیر اجرا متفاوت است | پنل «اجرای واقعی» | آخرین `error` را بخوان |

## صف کار

- `P1` افزودن پنجرهٔ انتخابگر فایل در حالت مدل (الان یک فایلِ هدف).
- `P1` پشتیبانی استریم برای Anthropic/Gemini با همان قرارداد `onDelta`.
- `P1` تأیید بصری در مرورگر واقعی و ثبت اسکرین‌شات در `docs/`.
- `P2` Service Worker برای اجرای کامل آفلاین.
- `P2` وارد کردن چند فایلِ `self/` در یک چرخهٔ ترمیم.
- `P2` گزارش هزینهٔ توکن به تفکیک اجرا در کارگاه.

## پروتکل به‌روزرسانی

بعد از هر تغییر: این فایل + `PROGRESS.md` (گزارش تاریخ‌دار با دستور و خروجی) + `PROFESSIONAL_GUIDE.md` (ممیزی) — و اگر وضعیت انتشار عوض شد، `README.md` و `docs/PORTFOLIO.md`.

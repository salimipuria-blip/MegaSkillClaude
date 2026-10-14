# PSK — دفتر جریان پروژه (MEGA SKILLS 3000)

> این فایل «توضیح زندهٔ» پروژه است: هر دور کاری، نتایج واقعی و تغییرات همین‌جا اضافه می‌شود تا
> جریان حفظ شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **پوشه:** `psk/` · **انتشار:** Vercel `psk-3000` (از همین مخزن، Root Directory = `psk`)
- **فناوری:** HTML/CSS/JS ایستا + سه تابع Vercel (`api/health.js`, `api/skills.js`, `api/tasks.js`)
- **هسته:** `engine/router.mjs` (مسیریاب واژگانی + تأیید SHA-256 بدنهٔ مهارت‌ها)،
  `engine/providers.mjs` (فقط مدل‌های رایگان)، `engine/telemetry.mjs` (اختیاری، خاموش پیش‌فرض)
- **داده:** `data/skills-registry.json` (۳٬۰۰۰ مهارت، ۱۵٬۰۰۰ trigger) + ۳٬۰۰۰ فایل `SKILL.md`

## ۲) دستور دقیق این پروژه (تنها یک فرمان)
```bash
node scripts/doctor.mjs psk          # از ریشهٔ مخزن: چک سینتکس، تست، golden، دقت، بنچ
```
معادل دستی (همان چیزی که CI هم اجرا می‌کند):
```bash
cd psk
npm run check          # سینتکس همهٔ فایل‌های اجرایی
npm test               # ۴۷ تست
npm run routing:golden # اسنپ‌شات ۱۰۸ موردی مسیریاب
npm run routing:accuracy
npm run bench:routing
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `npm run check` | ✅ (شامل `scripts/routing-accuracy.mjs`) |
| `npm test` | ✅ **۴۷/۴۷** (قبلاً ۴۱؛ ۵ تست دقت + ۱ تست توکن عددی اضافه شد) |
| `routing:golden` | ✅ ۱۰۸ مورد، اسنپ‌شات بازتولید و بازبینی‌شده |
| **دقت مسیریاب (مجموعهٔ طلایی)** | **top-1: ۹۵٪ · top-3: ۱۰۰٪ · safety: ۱۰۰٪** (fa ۹۷.۵/۱۰۰ · en ۹۵/۱۰۰ · mixed ۹۰/۱۰۰) |
| `bench:routing` | p50 ≈ ۱٫۱۷۵ms برای `GET /api/skills` (بدون شبکه) |
| آزمون زندهٔ API (dev-server، پورت ۳۱۱۱) | `/api/health` سالم (۳٬۰۰۰ مهارت، ۲٬۹۹۰ تأیید + ۱۰ تعمیر)؛ `GET /api/skills?q=` درست؛ `POST /api/tasks` حالت `plan` کامل؛ حالت `answer` بدون کلید → `NO_PROVIDER_CONFIGURED` صادقانه؛ ۴۰۵/۴۰۰/۴۱۳/۴۰۴ درست؛ تلاش traversal → ۴۰۴ |

## ۴) دیباگ این دور (مشکل واقعی و اندازه‌گیری‌شده)
**۱. دقت مسیریاب قابل اندازه‌گیری نبود.** `routing-corpus.json` هیچ «پاسخ درست»ی نداشت؛
`routing-golden.json` فقط رفتار را قفل می‌کرد (رگرسیون)، پس معیار نقشهٔ راه («دقت ≥ ۸۰٪ روی
مجموعهٔ طلایی») عملاً سنجیده نمی‌شد.
- `tests/fixtures/routing-labels.json` ساخته شد: برای هر ۱۰۸ مورد، دامنهٔ انتظاری + دامنه‌های
  پذیرفتنی؛ ۸ مورد لبه‌ای با `safety: must-not-match`.
- `scripts/routing-accuracy.mjs` ساخته شد: top-1 / top-N / safety + تفکیک fa-en-mixed،
  بررسی هم‌گامی corpus↔labels، و سقف خطا (کد خروج ۱ زیر آستانه).
- `tests/routing-accuracy.test.mjs` ساخته شد: آستانهٔ ۸۰٪ در CI اجباری شد (top-1 هم ≥ ۹۰٪).

**۲. پنج مسیریابی غلط واقعی که با همین ابزار پیدا شد و اصلاح شد:**
| مورد | پرسش | قبل | بعد |
|---|---|---|---|
| `en-12` | typography pairing for a **web** banner | `web-development` (cookie-consent…) | `graphic-design` (type-pairing) |
| `en-14` | **translate** this paragraph into persian | `graphic-design` (persian-miniature) | `prompt-requirements` (translation-intent-preserver) |
| `en-21` | **90** day roadmap for a startup | `knowledge-research/surya-ocr-**90**-langs` | `business-sales/strategy-workshop` |
| `en-31` | **clean** up **podcast audio noise** | `travel-outdoors/leave-camp-clean-protocol` | `video-ai/podcast-*` |
| `en-34` | product **pricing strategy** for a new item | `social-media/new-follower-thanker` | `business-sales/seasonal-pricing-optimizer` |

**۳. چهار ریشهٔ فنی پشت این خطاها (و اصلاحشان در `engine/router.mjs`):**
- **توکن عددی:** «۹۰» عدد بود ولی به مهارت `…-90-langs` می‌چسبید →
  `tokens()` دیگر توکنِ تماماً عددی برنمی‌دارد (پرسش فقط-عددی هم بدون نتیجه می‌ماند).
- **سیگنال دامنهٔ کم:** برای «پادکست/صدا/نویز»، «ترجمه»، «قیمت/استراتژی» و
  «آفرود/کوهنوردی/کویر/کمپ» سیگنال دامنه اضافه شد.
- **گشادی سیگنال وب:** کلمهٔ «web» در «web banner» کارِ طراحی است نه وب‌سایت →
  وقتی «قلم طراحی» (بنر/پوستر/لوگو/تایپوگرافی/منو/کارت ویزیت) هست و سطحِ سایت ذکر نشده،
  سیگنال `web-development` اعمال نمی‌شود و در عوض `graphic-design` تقویت می‌شود.
- **الگوی نرمال‌نشده:** الگوها روی متن `normalize()`شده اجرا می‌شوند (آ→ا، حذف ZWNJ)؛ الگوهای
  فارسی باید هر دو شکل را داشته باشند (`افرود|آفرود`، `وب‌سایت|وب سایت`).

**۴. اسنپ‌شات golden** بعد از بازبینی تک‌تک ۴۶ موردِ تغییرکرده با `--write` بازتولید شد
(۶۲ مورد بدون تغییر). هیچ رگرسیونی در ۱۰۰ مورد برچسب‌دار دیده نشد.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] افزودن کلید رایگان (Groq یا Google AI Studio) در Vercel تا حالت `answer` فعال شود (P1 نقشهٔ راه).
- [ ] تبدیل برچسب‌ها به «مجموعهٔ طلایی انسانی»: بازبینی ۱۰۸ برچسب توسط پوریا و اضافه‌کردن
      موارد سخت‌تر (پرسش‌های چندمنظوره) تا دقت واقعی سخت‌گیرانه‌تر سنجیده شود.
- [ ] بالا بردن top-1 در دستهٔ `mixed` (۹۰٪؛ ضعیف‌ترین دسته) — بیشترِ خطاها از تساوی امتیاز دو دامنه می‌آید.
- [ ] PWA و تب‌های تاریخچهٔ وظیفه (نیازمند تصمیم دربارهٔ Supabase) — طبق `docs/FEATURE_STATUS.json`.

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — آزمون زندهٔ API روی dev-server؛ ساخت مجموعهٔ طلایی + سنجهٔ دقت؛ پیدا و رفع ۴ ریشهٔ
  خطای مسیریابی؛ دقت از **۸۹٪/۹۵٪** به **۹۵٪/۱۰۰٪** رسید؛ golden بازتولید شد؛ تست‌ها ۴۱→۴۷؛
  `routing:accuracy` به اسکریپت‌ها و آستانهٔ CI اضافه شد.

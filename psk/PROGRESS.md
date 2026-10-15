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
| `npm test` | ✅ **۵۳/۵۳** (۴۷ قبلی + ۶ تست سیگنال‌های نیت) |
| `routing:golden` | ✅ ۱۰۸ مورد، اسنپ‌شات بازتولید و بازبینی‌شده |
| **دقت مسیریاب (مجموعهٔ طلایی)** | **top-1: ۱۰۰٪ · top-3: ۱۰۰٪ · safety: ۱۰۰٪** (fa ۱۰۰ · en ۱۰۰ · mixed ۱۰۰) — پس از اصلاح ۲۰۲۶-۱۰-۱۴ (قبلش ۹۵/۱۰۰/۱۰۰) |
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
- [x] ~~بالا بردن top-1 در دستهٔ `mixed`~~ — با قوانین تضادِ حوزه در ۲۰۲۶-۱۰-۱۴ به ۱۰۰٪ رسید.
- [ ] برچسب‌های انسانی برای مجموعهٔ طلایی (بازبینی ۱۰۸ مورد توسط پوریا) تا دقت روی دادهٔ سخت‌گیرانه‌تر سنجیده شود.
- [ ] PWA و تب‌های تاریخچهٔ وظیفه (نیازمند تصمیم دربارهٔ Supabase) — طبق `docs/FEATURE_STATUS.json`.

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — آزمون زندهٔ API روی dev-server؛ ساخت مجموعهٔ طلایی + سنجهٔ دقت؛ پیدا و رفع ۴ ریشهٔ
  خطای مسیریابی؛ دقت از **۸۹٪/۹۵٪** به **۹۵٪/۱۰۰٪** رسید؛ golden بازتولید شد؛ تست‌ها ۴۱→۴۷؛
  `routing:accuracy` به اسکریپت‌ها و آستانهٔ CI اضافه شد.
- **۲۰۲۶-۱۰-۱۴ (گیت کامل monorepo)** — `node scripts/doctor.mjs psk`: سینتکس، **۴۷ تست**، golden، accuracy و benchmark همگی سبز؛ تغییر کدی در این دور لازم نشد.

- **۲۰۲۶-۱۰-۱۴ (دور سراسری — دقت مسیریاب ۹۵٪ → ۱۰۰٪)** — پنج خطای واقعیِ top-1 با سنجهٔ دقت پیدا و چهار ریشهٔ جدید در `engine/router.mjs` اصلاح شد:
  1. **سیگنال کمپین** (`campaign|کمپین` → social-media ۰٫۳۵ / business-sales ۰٫۱۵): «ramadan campaign ideas» به‌جای کمپین، روی `travel-outdoors/ramadan-travel-etiquette` می‌افتاد چون فقط واژهٔ «ramadan» مشترک بود.
  2. **سیگنال هویت برند** (`brand identity|هویت برند|brand kit|brand book` → graphic-design ۰٫۴۰): «brand identity for a boutique hotel» روی `social-media/personal-brand-voice-sheet` می‌افتاد. واژهٔ تنهای «brand» عمداً بی‌طرف ماند تا برندِ شخصی همچنان social-media بماند.
  3. **سیگنال نقشه‌راه/استارتاپ** (`roadmap|نقشه راه|استارتاپ|startup|business plan` → business-sales ۰٫۴۵): هیچ مهارت هسته‌ای واژهٔ roadmap/startup ندارد، برای همین «نقشه راه ۹۰ روزه» به مهارت‌هایی می‌رفت که فقط توکن «map» را داشتند (`sandbox-permission-map`, `trail-map-illustrator`).
  4. **سیگنال گزارش/تحلیل** (`analytics|تحلیل|گزارش|report|dashboard|kpi` → data-spreadsheets ۰٫۳۰ / business-sales ۰٫۲۲).
  5. **دو قانونِ تضادِ حوزه (scope):** (الف) دامنهٔ `general` دامنهٔ fallback است نه تخصص — جریمه از ۰٫۰۵ به ۰٫۱۸ رسید تا در تساوی‌های نزدیک نبرد (`general/reels-scripting` با اختلاف ۰٫۰۱ از `video-ai/shorts-scheduler-plan` جلو می‌زد). (ب) وقتی پرسش سطح «وب‌سایت» را نام می‌برد و هیچ شبکهٔ اجتماعی‌ای را نه، مهارت‌های اینستاگرام‌محور جریمه می‌شوند (`ig-analytics-reporter` به‌خاطر عبارت دقیق «گزارش هفتگی» می‌برد، در حالی که پرسش «analytics وبسایت» بود)، و مهارت‌های خود-اظهارِ `social-media` به اندازهٔ ۰٫۱۵ عقب می‌روند.
- **نتیجهٔ اندازه‌گیری‌شده:** top-1 **۹۵٪ → ۱۰۰٪**، top-3 ثابت ۱۰۰٪، safety ۱۰۰٪؛ تفکیک: fa **۹۷٫۵→۱۰۰٪**، en **۹۵→۱۰۰٪**، mixed **۹۰→۱۰۰٪**.
- **اسنپ‌شات طلایی بازبینی‌شده:** ۱۹ مورد از ۱۰۸ تغییر کرد؛ تک‌تک بررسی شد: ۵ مورد اصلاح top-1، ۷ مورد عقب‌رفتنِ درستِ دامنهٔ `general`، ۷ مورد فقط جابه‌جاییِ امتیاز بدون تغییر رتبه. سپس با `--write` بازتولید شد.
- **تست‌های جدید:** `tests/routing-signals.test.mjs` (۶ تست) هر سیگنال را با نام و پرسشِ دقیق قفل می‌کند تا خرابیِ آینده مستقیماً به همان قانون اشاره کند. شمار تست‌ها **۴۷ → ۵۳**.
- **دستور تأیید:** `node scripts/doctor.mjs psk` → سینتکس، **۵۳ تست**، golden، accuracy و بنچمارک همگی سبز. بنچمارک: p50 ≈ ۱٫۱۷۵ms.
- **محدودیت:** مجموعهٔ طلاییِ ۱۰۰تایی همچنان ماشین‌ساخته است (برچسب‌های انسانیِ پوریا هنوز اضافه نشده)؛ دقتِ ۱۰۰٪ روی این مجموعه به‌معنای صحتِ مطلق در دنیای واقعی نیست.

## Professional guide
See `PROFESSIONAL_GUIDE.md` in this folder for performance improvements, debugging playbook, and next steps. Update it whenever behavior changes.

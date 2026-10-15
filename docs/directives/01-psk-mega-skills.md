# 01 — MEGA SKILLS 3000 (`psk/`)

## مأموریت و مرزها
سایت فارسی آیفون‌اول + موتور serverless مهارت‌ها روی Vercel: مسیریابی واژگانی روی ۳۰۰۰ مهارت و پاسخ مدل رایگان با failover. **هرگز fallback پولی فعال نشود**؛ نبود کلید باید خطای صادقانه بدهد، نه پاسخ ساختگی.

## وضعیت فعلی (شواهد: `psk/README.md`, `docs/FEATURE_STATUS.json`)
- ✅ Router واژگانی IDF با پل فارسی→انگلیسی و stemming؛ ۳۰۰۰ بدنهٔ `SKILL.md` با بررسی SHA-256 (۲۹۹۰ منطبق + ۱۰ مورد در allowlist تعمیر `data/skills-repaired.json`).
- ✅ Plan Mode (مسیریابی + دستورالعمل تأییدشده) و Answer Mode با failover بین Groq/Cerebras/Google AI Studio/OpenRouter `:free`؛ بدون کلید: `NO_PROVIDER_CONFIGURED`.
- ✅ گارد Bearer Token به‌صورت fail-closed روی Vercel (بدون توکن → 503)؛ قرارداد مسیریابی ۱۰۸ کیس ثابت در `tests/fixtures/routing-golden.json`.
- ❌ انجام‌نشده: نشست کوکی (به‌جای چسباندن توکن)، تاریخچهٔ تسک، PWA، بازسازی سینمایی ۳۰ فریمی، اجرای MCP، ارزیابی gold-set در CI.
- ⚠️ اقدام مالک باقی‌مانده: افزودن `ENGINE_TOKEN` و حداقل یک کلید رایگان در Vercel.

## معماری و فایل‌های کلیدی
`api/{health,skills,tasks}.js` + `api/_core.mjs` (ورودی‌های Vercel) ← `engine/router.mjs` (IDF/پل زبانی) و `engine/providers.mjs` (failover رایگان)؛ `data/skills/` بدنه‌ها؛ `scripts/bench-routing.mjs` بنچمارک آفلاین.

## اجرا و تست
```bash
cd psk && npm run check && npm test                 # syntax + تست‌ها (شامل قرارداد ۱۰۸ کیس)
npm run bench:routing -- --label=before             # قبل از هر تغییر router
ENGINE_TOKEN=<dev-only> npm run dev                 # پورت 3000
curl -H "Authorization: Bearer $ENGINE_TOKEN" localhost:3000/api/health
```

## پروتکل دیباگ حرفه‌ای
- **مسیریابی غلط:** اول `npm run bench:routing` و diff با golden؛ وزن IDF، پل فارسی و stemming را جداگانه با یک query حداقل بازتولید کن. تغییر وزن بدون اجرای کامل golden ممنوع.
- **خطای Provider:** کد خطا را از پاسخ API بگیر (`NO_PROVIDER_CONFIGURED` ≠ خطای شبکه ≠ سهمیه). ترتیب failover و گارد `:free` در `engine/providers.mjs` را با تست mocked بررسی کن؛ هرگز برای «تست واقعی» مسیر پولی را موقتاً روشن نکن.
- **رد شدن بدنهٔ مهارت:** هش فایل را با registry مقایسه کن؛ فایل تغییریافته عمداً رد می‌شود — allowlist را بدون بازبینی دستی گسترش نده.
- **401/503:** اول حضور `ENGINE_TOKEN` در محیط همان deployment؛ fail-closed رفتار درست است، دورش نزن.

## گسترش (اولویت‌بندی)
- **P0 (مالک):** افزودن کلید رایگان Groq یا AI Studio در Vercel و تست زندهٔ Answer Mode از آیفون.
- **P1:** نشست کوکی HttpOnly به‌جای Bearer دستی؛ تاریخچهٔ تسک در Supabase (اسکیمای `psk_*` با RLS)؛ ارزیابی gold-set در CI با هدف دقت ≥ ۸۰٪.
- **P2:** PWA (manifest + آیکون)، نقشهٔ روایی ۳۰ فریمی، اجرای ابزار/MCP با صف مستقل.

## Definition of Done
`npm run check && npm test` سبز، golden بدون تغییر ناخواسته، بنچمارک قبل/بعد در PR، هیچ کلیدی در کد/لاگ، `docs/FEATURE_STATUS.json` به‌روز.

## پرونده‌های واقعی این دور (۲۰۲۶-۱۰-۱۴) — دقت top-1 از ۹۵٪ به ۱۰۰٪

**روش (قابل تکرار):** همیشه اول اندازه بگیر، بعد حدس بزن. پنج خطای باقی‌مانده با این دستور استخراج شدند و تک‌تک بررسی شدند، نه به‌صورت کلی:

```bash
cd psk && node scripts/routing-accuracy.mjs          # خلاصه + تفکیک fa/en/mixed
node -e "...gradeCase..."                            # فقط مواردِ !passTop1 را چاپ کن
node -e "routeSkills(reg, query, {limit:6})"         # امتیازِ تک‌تکِ نامزدها برای همان پرسش
```

**۱. «ramadan campaign ideas» → travel-outdoors.** فقط واژهٔ «ramadan» مشترک بود و مهارتِ `ramadan-travel-etiquette` با تطابقِ نام می‌برد. رفع: سیگنالِ نیتِ کمپین (`campaign|کمپین` → social-media ۰٫۳۵ / business-sales ۰٫۱۵). درس: **نیت** باید از **موضوع** جدا شود؛ موضوع فقط کاندیدا می‌سازد، نیت رتبه را تعیین می‌کند.

**۲. «brand identity for a boutique hotel» → social-media.** واژهٔ «brand» به `personal-brand-voice-sheet` می‌چسبید. رفع: سیگنال روی **عبارت** (`brand identity|هویت برند|brand kit|brand book`) نه روی تک‌واژه؛ واژهٔ تنهای brand عمداً بی‌طرف ماند تا برندِ شخصی همچنان social-media بماند. درس: سیگنال را به اندازهٔ کافی باریک بگیر که برچسبِ همسایه را تقویت نکند.

**۳. «نقشه راه ۹۰ روزه برای استارتاپ» → مهارت‌های «map».** ریشه اینجا متفاوت بود: **هیچ** مهارتِ هسته‌ای واژهٔ roadmap/startup ندارد، پس پرسش به هرچه توکنِ «map» را داشت پخش می‌شد (`sandbox-permission-map`، `trail-map-illustrator`). رفع: سیگنالِ برنامه‌ریزیِ کسب‌وکار (`roadmap|نقشه راه|استارتاپ|startup|business plan` → business-sales ۰٫۴۵). درس: وقتی امتیازِ همهٔ نامزدها نزدیکِ هم و پایین است (≈۰٫۸۴)، مشکل وزن نیست — **نبودِ پوشش** است.

**۴. «reels برای youtube shorts بساز» → دامنهٔ `general`.** `general/reels-scripting` با اختلافِ ۰٫۰۱ از `video-ai/shorts-scheduler-plan` جلو می‌زد. رفع: `general` دامنهٔ fallback است نه تخصص؛ جریمه از ۰٫۰۵ به **۰٫۱۸** رسید. درس: جریمهٔ دامنهٔ پیش‌فرض باید از «نویزِ امتیاز» بزرگ‌تر باشد وگرنه در تساوی‌ها می‌برد.

**۵. «analytics وبسایت و گزارش هفتگی» → مهارتِ اینستاگرامی.** `ig-analytics-reporter` چون عبارتِ دقیقِ «گزارش هفتگی» در تریگرهایش بود، با پاداشِ عبارت (+۲) می‌برد — در حالی که پرسش «وبسایت» می‌گفت. رفعِ دو لایه: (الف) تضادِ سطح در سطح نام (`^ig-|instagram` وقتی پرسش سطحِ سایت را نام می‌برد و هیچ شبکه‌ای را نه: ۰٫۵۵−)؛ (ب) همان تضاد در سطح دامنه برای مهارت‌های خود-اظهارِ `social-media`: ۰٫۱۵−. درس: پاداشِ عبارت کور است؛ **سطح (surface)** را explicit مدل کن، همان‌طور که قبلاً «web banner» را مدل کرده بودیم.

**پروتکلِ اجباری پس از هر تغییرِ مسیریاب:**
```bash
npm run bench:routing                 # قبل/بعد
node scripts/routing-accuracy.mjs     # باید ≥ آستانه بماند
node scripts/routing-golden.mjs --check
# اگر snapshot فرق کرد: هر موردِ تغییرکرده را یکی‌یکی بخوان، بعد:
node scripts/routing-golden.mjs --write
npm test
```
این دور ۱۹ مورد از ۱۰۸ تغییر کرد: ۵ اصلاحِ top-1، ۷ عقب‌رفتنِ درستِ `general`، ۷ جابه‌جاییِ صرفاً امتیازی. **بدون خواندنِ تک‌تک‌شان، `--write` ممنوع.**

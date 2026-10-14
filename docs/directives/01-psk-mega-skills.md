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

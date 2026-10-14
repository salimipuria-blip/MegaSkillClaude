# 12 — Viking Cinematic Motion Study (`viking-team/motion/`)

## مأموریت و مرز
نمونهٔ مستقل Remotion برای کلیپ معرفی وایکینگ؛ **محصول production نیست**، به Auth/دادهٔ سفر/رسانه وصل نیست و هنوز در `/team/` ادغام نشده. قابلیت ورود/همگام‌سازی Viking Team را هرگز از وجود این composition نتیجه نگیر.

## وضعیت و معماری
- `src/Root.tsx`: composition `VikingCommandIntro` و `RemotionRoot`.
- `src/index.ts`: ثبت Remotion root.
- خروجی: ۱۰۸۰×۱۹۲۰، ۳۰fps، ۱۸۰ فریم، ۶ ثانیه.
- پالت motion study `#FF713C`; پالت قالب‌های پست `#F39A2B` و پالت استیکرها `#F28A1E` جدا هستند.
- dependencyها باید دقیق و lockfileدار باشند؛ رندر ویدئو خروجی تولیدی حجیم است و وارد Git نمی‌شود.

## دستورهای اجرا
```bash
npm ci --prefix viking-team/motion --ignore-scripts --no-audit --no-fund
npm run check --prefix viking-team/motion
(cd viking-team/motion && npm run studio)
(cd viking-team/motion && npm run render) # فقط پس از تأیید preview
```

## پروتکل دیباگ
- **TypeScript:** `tsc --noEmit`; خطا را با `any` یا خاموش‌کردن `strict` پنهان نکن.
- **composition پیدا نمی‌شود:** زنجیرهٔ `src/index.ts` → `RemotionRoot` → `VikingCommandIntro` و نام CLI را بررسی کن.
- **فریم غلط/خالی:** `useCurrentFrame`, fps و محدودهٔ `interpolate` را روی فریم‌های ابتدا، میانه و انتها بازبینی کن؛ انیمیشن باید deterministic باشد.
- **Chromium/render:** خطای browser را از خطای TypeScript جدا کن؛ نبود browser به معنی بیلد خراب نیست اما render موفق هم محسوب نمی‌شود.
- **دسترس‌پذیری محصول میزبان:** در حالت `prefers-reduced-motion` از نمای ثابت استفاده شود و animation مانع کنترل‌های عملیاتی نشود.

## گسترش اولویت‌بندی‌شده
- **P1:** CI برای `npm ci` + typecheck و رندر اختیاری روی runner دارای Chromium.
- **P1:** تست ابعاد/مدت خروجی و بررسی وزن MP4 پیش از هر ادغام.
- **P2:** انتقال رنگ‌ها/متن‌ها به props فقط اگر چند سناریوی معرفی واقعاً لازم شد؛ در حال حاضر نمونهٔ تک‌کاربردی را ساده نگه دار.

## Definition of Done
Lockfile با `npm ci` بازتولیدپذیر؛ typecheck سبز؛ خروجی تصویری واقعی در صورت درخواست با ۱۸۰ فریم/ابعاد صحیح بازبینی؛ reduced-motion در میزبان پوشش داده شده؛ هیچ ادعای «قابلیت زنده» یا فایل MP4 حجیم به مخزن اضافه نشده؛ `viking-team/motion/PROGRESS.md` به‌روز است.

## پروندهٔ این دور (۲۰۲۶-۱۰-۱۴) — قفلِ مشخصات + رندرِ تأییدشده

**رندر دوباره اجرا و مستقلاً اندازه‌گیری شد:**
```bash
cd viking-team/motion
LD_LIBRARY_PATH=/path/to/lib npm run render -- --browser-executable=/path/to/chromium --overwrite
```
خروجی `out/viking-intro.mp4` با **۷۸۲٬۱۵۷ بایت** — برابرِ بایت‌به‌بایت با رندرِ دور قبل. این تکرارپذیری خودش یک یافته است: ترکیب واقعاً قطعی است، نه فقط «بالاخره اجرا شد».

**تجزیه‌ی MP4 بدون ffprobe** (در این محیط نبود): باکسِ `tkhd` ابعاد را می‌دهد و `mvhd`+`stts` زمان و تعداد فریم را.
```
ftyp=isom · کدک avc1 (H.264) · 1080x1920 · 180 فریم · 6.059 s
```
نکتهٔ ریز: `tkhd` ابعاد را به‌صورت ۱۶٫۱۶ ثابت نگه می‌دارد و عرض/ارتفاع **هشت بایتِ آخرِ باکس** هستند (اندازهٔ باکس از ۴ بایتِ قبلِ شناسه می‌آید)؛ خواندن با آفستِ ثابت عددِ غلط می‌دهد.

**قفلِ مشخصات (`tests/composition.test.mjs`، ۶ تست):** تا این دور، فقط یک رندرِ سنگین می‌توانست ثابت کند که ترکیب درست است؛ حالا در گیتِ سریع هم قفل است — شناسه و `registerRoot(RemotionRoot)`؛ هندسه و زمان‌بندی (`1080`/`1920`/`30`/`180`، با پشتیبانی از هر دو شکلِ JSX یعنی `id="…"` و `fps={30}`)؛ پالتِ `#FF713C` و نبودِ `#F39A2B`/`#F28A1E`؛ **نبودِ** `transition:`/`@keyframes`/`animation:` با حضورِ `useCurrentFrame()` و `interpolate(`؛ بلوکِ `dir="rtl"` و متنِ فارسی؛ و پین‌بودنِ یکسانِ نسخهٔ cli/runtime برای تکرارپذیریِ رندر.

**چرا «نبودِ انیمیشن CSS» یک تست است:** ریموشن فریم‌های ایستا می‌گیرد؛ یک `transition` یا `@keyframes` خروجی را وابسته به ساعتِ مرورگر می‌کند و همان فریم را در دو اجرا متفاوت می‌اندازد. این تست نگهبانِ قطعیت است، نه سلیقه.

**دیباگ:** پیش‌نمایشِ خالی → شناسه‌ی composition (`VikingCommandIntro`) و `src/index.ts` را چک کن. دانلودِ خودکار از `remotion.media` با `ECONNRESET` شکست خورد → از Chromium نصب‌شده با `--browser-executable` استفاده کن، نه retryِ بی‌پایان. خطای کتابخانهٔ shared → `ldd` و `LD_LIBRARY_PATH`. فایل ساخته شد اما مشکوک است → اول باکس‌ها را بخوان (بالا)، بعد فریم‌های ابتدا/میانه/پایان را استخراج کن؛ typecheck به‌تنهایی رندر یا حرکت را اثبات نمی‌کند.

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

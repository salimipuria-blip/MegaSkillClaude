# Viking Cinematic Motion Study — دفتر جریان زیرپروژه

> پروژهٔ مستقل Remotion درون `viking-team/`؛ بخشی از وب‌اپ `/team/` یا release تولیدی نیست. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴**.

## ۱) پروژه در یک نگاه
- **Composition:** `VikingCommandIntro`، در `src/Root.tsx`.
- **خروجی هدف:** ۱۰۸۰×۱۹۲۰، ۳۰fps، ۱۸۰ فریم (۶ ثانیهٔ اسمی)، نسبت ۹:۱۶.
- **پشته:** React 18 + Remotion 4.0.506 + TypeScript 5.6.
- **مرز:** motion study برای معرفی است؛ فرم‌ها و عملیات روزمرهٔ Viking Team را جایگزین نمی‌کند و هنوز در اپ ادغام نشده است.

## ۲) دستور دقیق این پروژه
```bash
npm ci --prefix viking-team/motion --ignore-scripts --no-audit --no-fund
npm run check --prefix viking-team/motion
# پیش‌نمایش (محیط گرافیکی/مرورگر)
cd viking-team/motion && npm run studio
# رندر با مرورگر خودکار Remotion، پس از تأیید بصری:
cd viking-team/motion && npm run render
# اگر دانلود Chrome Headless Shell از remotion.media مسدود/ناموفق است:
cd viking-team/motion && npm run render -- --browser-executable=/absolute/path/to/chromium
# اگر باینری Chromium به کتابخانه‌های سیستم نیاز دارد:
cd viking-team/motion && LD_LIBRARY_PATH=/path/to/lib npm run render -- --browser-executable=/absolute/path/to/chromium
```

خروجی محلی `viking-team/motion/out/viking-intro.mp4` است؛ پوشهٔ `out/` نادیده‌گرفته می‌شود و ویدئو را commit نکن. پس از رندر می‌توان با `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration,size -of default=noprint_wrappers=1 out/viking-intro.mp4` مشخصات کدک، اندازه و تعداد فریم را مستقل بررسی کرد.

## ۳) وضعیت تأییدشده
| بررسی | نتیجه |
|---|---|
| نصب reproducible | ✅ `npm ci --ignore-scripts --no-audit --no-fund` از lockfile موفق |
| `npm run check` | ✅ `tsc --noEmit` در strict mode سبز |
| `npm audit --omit=dev` | ✅ صفر آسیب‌پذیری در درخت وابستگی‌های runtime |
| رندر واقعی MP4 | ✅ دستور npm با `--browser-executable=/tmp/chromium` و `LD_LIBRARY_PATH=/tmp/al2023/lib`؛ ۱۸۰/۱۸۰ فریم encode شد |
| اعتبارسنجی فایل | ✅ H.264، ۱۰۸۰×۱۹۲۰، ۳۰fps، ۱۸۰ فریم؛ duration ظرف MP4 برابر ۶٫۰۵۹s و اندازه ۷۸۲٬۱۵۷ بایت (حدود ۷۶۴ KiB) |
| بررسی حرکت/تصویر | ✅ نمونه‌های زمانی ۰٫۵ تا ۵٫۸s هش‌های تصویری متفاوت دارند؛ دو فریم ۲٫۵ و ۵٫۸s نیز بصری بازبینی شدند |
| ادغام در محصول | هنوز انجام نشده و نباید در README به‌عنوان قابلیت زنده معرفی شود |

## ۴) مرزها و راهنمای دیباگ
- اگر typecheck خطا داد، props/style یا نسخهٔ typings را اصلاح کن؛ خطا را با `any` خاموش نکن.
- اگر پیش‌نمایش فریم‌ها خالی است، composition ID (`VikingCommandIntro`)، `src/index.ts` و import `RemotionRoot` را بررسی کن.
- اگر دانلود خودکار مرورگر از `remotion.media` با خطای شبکه مثل `ECONNRESET` شکست خورد، از Chromium/Chrome نصب‌شده با `--browser-executable` استفاده کن؛ اتصال شبکه را با retryهای نامحدود دور نزن.
- اگر Chromium با خطای کتابخانهٔ shared اجرا نشد، `ldd /path/to/chromium` را بررسی و مسیر کتابخانه‌های هم‌توزیع آن را به `LD_LIBRARY_PATH` اضافه کن؛ مسیر `/tmp` در این اجرا موقتی است.
- اگر فایل ساخته شد اما مشکوک بود، ابتدا با `ffprobe` ابعاد، نرخ فریم و تعداد فریم را بررسی؛ سپس فریم‌های ابتدا/میانه/پایان را استخراج کن. typecheck به‌تنهایی رندر یا حرکت واقعی را اثبات نمی‌کند.
- پالت `#FF713C` متعلق به همین مطالعه است؛ جایگزینی خودکار با پالت `#F39A2B` قالب پست یا `#F28A1E` استیکرها مجاز نیست.
- این خروجی ویدئوی ازپیش‌رندرشده است؛ اگر به وب‌اپ زنده ادغام شد، poster/کنترل پخش، دسترس‌پذیری، خوانایی فارسی، وزن فایل و مسیر `prefers-reduced-motion` جداگانه طراحی شوند.

## ۵) کارهای باز / پیشنهاد بعدی
- [x] رندر واقعی ۱۸۰ فریم، اعتبارسنجی metadata و بازبینی نمونه‌فریم‌ها.
- [ ] بررسی Safari/iPhone واقعی، safe-area و وضوح متن فارسی؛ Chromium headless جایگزین این آزمون نیست.
- [ ] پس از CI، تأیید job جدید `viking-motion` در GitHub Actions.
- [ ] تصمیم محصول دربارهٔ ادغام؛ پیش از آن اندازه‌گیری روی شبکهٔ موبایل و افزودن تجربهٔ reduced-motion/کنترل پخش.

## ۶) لاگ جریان (افزایشی)
- **۲۰۲۶-۱۰-۱۴** — `check`/`tsconfig` strict، `@types/react`/`@types/react-dom` و lockfile اضافه شد. اولین typecheck خطای واقعی نبود typings React را پیدا کرد؛ وابستگی‌ها اصلاح شدند. `npm ci --ignore-scripts`، `npm run check` و `npm audit --omit=dev` سبز شدند؛ رندر واقعی هنوز اجرا نشده.
- **۲۰۲۶-۱۰-۱۴ (رندر واقعی)** — دانلود Chrome Headless Shell از `remotion.media` با `ECONNRESET` در دسترس نبود؛ گزینهٔ مستند `--browser-executable` با Chromium محلی و `LD_LIBRARY_PATH` سازگار شد. `npm run render -- --browser-executable=/tmp/chromium --overwrite` موفق شد؛ `out/viking-intro.mp4` با H.264، ۱۰۸۰×۱۹۲۰، ۳۰fps و ۱۸۰ فریم ساخته و با `ffprobe` بررسی شد. فریم‌های نمونه در `build/validation/motion/` بازبینی شدند؛ Safari/iPhone و ادغام محصول هنوز باز است.

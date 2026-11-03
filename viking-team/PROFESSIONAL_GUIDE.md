# ممیزی فنی — viking-team

> دستور کار دائمی: `CLAUDE.md`. این فایل گزارش ممیزی هر دور است؛ هر دور یک بخش تاریخ‌دار تازه بالای قبلی اضافه کن.

## دور 2026-10-18 — ممیزی کامل کلاینت، SQL، PWA و آپلود آیفون

### گیت‌ها
| فرمان (از `viking-team/`) | قبل | بعد |
|---|---|---|
| `node --test tests/*.test.mjs` | 4 pass | **11 pass** |
| `python3 -m unittest discover -s tests` | 15 OK | 15 OK |
| `node --check --input-type=module < team/app.js` | OK | OK |
| `! grep -R -E 'service_role\|sb_secret_' team` | OK | OK |
| `node scripts/doctor.mjs viking-team` (ریشه) | OK | OK |

اثبات اعتبار تست‌ها: اجرای تست‌های جدید روی `team/app.js` نسخهٔ قبلی → **۶ از ۱۱ قرمز**؛ روی نسخهٔ جدید → ۱۱ سبز.

### یافته‌ها و اصلاح‌ها
1. **دانلود دوبارهٔ همهٔ عکس‌ها هر ۲۰ ثانیه (کارایی/مصرف داده).** `refresh` → `render` → `renderPhotos` اول `releaseUrls()` همهٔ URLها را revoke و بعد همهٔ فایل‌های خصوصی را دوباره دانلود می‌کرد؛ با ۱۰ عکس ۸ مگابایتی یعنی ~۸۰MB در هر ۲۰ ثانیه روی داده همراه، به‌علاوهٔ چشمک‌زدن تصویرها.
   رفع: `mediaUrls` حالا `Map(storage_path → objectURL)` است و `mediaLoads` دانلودهای هم‌زمان یک مسیر را یکی می‌کند. `renderPhotos` فقط URL عکس‌های حذف‌شده را revoke می‌کند (`releaseUrls(keepSet)`) و `leave()` همه را آزاد می‌کند. اگر نشست بسته شده باشد، URL تازه بلافاصله revoke می‌شود.
   تست: `the 20s refresh reuses cached private images…`، `a deleted photo releases its cached blob…`.
2. **رد شدن HEIC آیفون.** Safari آیفون گاهی `file.type` را خالی یا `image/heif` می‌دهد. `uploadFile` فقط چهار MIME دقیق را می‌پذیرفت و پیام «فرمت پشتیبانی نمی‌شود» می‌داد. فیلد `accept` هم HEIF را نداشت.
   رفع: تابع `mediaKind(file)` نوع را به یکی از چهار MIME مجاز باکت نگاشت می‌کند: `image/heif`→`image/heic`، `image/jpg`/`pjpeg`→`image/jpeg`، و اگر نوع خالی یا `application/octet-stream` باشد، از روی پسوند. `accept` در `team/index.html` و `replacePhoto` به `…,image/heif,.heic,.heif` گسترش یافت.
   تست: `mediaKind accepts iPhone HEIC/HEIF…`، `an iPhone HEIC with an empty MIME type uploads as image/heic…`، `uploads over 8 MB or of unsupported types are refused…`.
3. **خطای خام Postgres هنگام حذف سفرِ دارای وظیفه/گزارش.** FK `trip_id … on delete restrict` حذف را رد می‌کرد و کاربر متن انگلیسی `violates foreign key constraint` می‌دید؛ کلاینت فقط عکس‌ها را پیش‌بررسی می‌کرد.
   رفع: پیش‌بررسی `records.some(r=>r.trip_id===id)` با پیام فارسی. تست: `deleting a trip that still has linked tasks…`.
4. **escape دوباره در تاریخ نامعتبر.** `shortDate` مقدار نامعتبر را `esc` می‌کرد و فراخوان دوباره `esc` می‌زد (`&` → `&amp;amp;`). رفع: مقدار خام برمی‌گردد و فقط فراخوان escape می‌کند. تست: `invalid dates are returned raw…`.
5. **پیش‌نمایش HEIC در مرورگرهای غیر Safari** خالی بود و بی‌توضیح. رفع: `img.onerror` متن alt راهنما می‌گذارد (دانلود همچنان کار می‌کند).

### بررسی‌شده و سالم
- XSS: همهٔ رشته‌های کاربر در `team/app.js` از `esc()` و در `index.html` (legacy) از `safe()` رد می‌شوند. idها در `data-*` از نوع uuid پایگاه‌داده‌اند.
- RLS: هر سه جدول RLS و policy عضو/مدیر دارند. توابع definer `search_path=''` دارند و از anon revoke شده‌اند. سقف ۵ عضو با advisory lock بدون race است. باکت خصوصی ۸MB است.
- `sw.js`: فقط پوستهٔ عمومی legacy را کش می‌کند؛ `/team/`، cross-origin و غیر GET عبور می‌کنند. `vercel.json` روی `/sw.js` هدر `no-cache` دارد. هدرهای امنیتی پایه (nosniff، DENY، Referrer-Policy) برقرارند.

### ریسک‌های باز (نیازمند مالک یا آزمون زنده)
- **Confirm email:** RLS به `auth.jwt()->>'email'` تکیه دارد. اگر تأیید ایمیل در Supabase خاموش باشد، هرکس می‌تواند پیش از عضو واقعی با ایمیلِ دعوت‌شده ثبت‌نام کند و دسترسی بگیرد. باید روشن بماند.
- **زنجیرهٔ تأمین:** supabase-js از esm.sh (`?bundle`) و jsdelivr بدون SRI بارگیری می‌شود. همچنین CSP وجود ندارد. پیشنهاد: vendor کردن کتابخانه و بعد CSP (صف P1 در `CLAUDE.md`).
- **PWA:** `manifest.webmanifest` با `start_url`/`scope` = `/` نسخهٔ legacy را نصب می‌کند. `/team/` manifest ندارد.
- **تناقض مستند:** سرخط `sql/viking_limit_five_active_members.sql` می‌گوید «Applied to the existing Viking tables»، اما اعمال واقعی تأیید نشده است. وضعیت معتبر در `CLAUDE.md` است.
- **آخرین مدیر:** policy به مدیر اجازه می‌دهد خودش را غیرفعال کند و تیم بی‌مدیر بماند.
- **پالت رنگ:** تیم سبز تیره است، نه مشکی + نارنجی `#F28A1E`. این تصمیم طراحی است و باید مالک تأیید کند.

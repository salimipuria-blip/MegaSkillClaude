# Hermes (دستیار ۲۴/۷ تلگرام) — دفتر جریان پروژه

> توضیح زندهٔ پروژه؛ هر دور کاری همین‌جا اضافه می‌شود. آخرین به‌روزرسانی: **۲۰۲۶-۱۰-۱۴ (ویرایش حرفه‌ای عکس)**.

## ۱) پروژه در یک نگاه
- **پوشه:** `hermes/` · **فناوری:** Cloudflare Worker + Gemini + اسکریپت نصب bash (اوراکل Always Free)
- **اجرا:** لایت روی Cloudflare، کامل روی Oracle؛ سرویس `systemd --user` برای بقا پس از reboot
- **قرارداد مهم:** `setup.sh` «تک‌فایلی» است (از طریق `curl -o setup.sh` هم اجرا می‌شود) و
  نباید به فایل‌های همسایه وابسته باشد؛ وقتی از مخزن اجرا شود، `config.sh`/`logger.sh` تست‌شده را ترجیح می‌دهد.

## ۲) دستور دقیق این پروژه
```bash
node scripts/doctor.mjs hermes      # سینتکس shell + سینتکس ماژول‌ها + ۱۱۵ تست + ۹ رگرسیون + ساخت مهارت‌ها
```
معادل دستی (از ریشهٔ مخزن):
```bash
bash -n hermes/setup.sh hermes/config.sh hermes/logger.sh
npm ci --prefix hermes --ignore-scripts --no-audit --no-fund
npm run check --prefix hermes
npm test --prefix hermes               # ۱۱۵ تست (شامل موتور ویرایش عکس)
npm run test:integration --prefix hermes   # ۹ رگرسیون روی workerd محلی، بدون شبکه
node hermes/build-skills.mjs | grep -Eq "\] [0-9]{4,} skills"
```

## ۳) وضعیت تأییدشده (۲۰۲۶-۱۰-۱۴)
| بررسی | نتیجه |
|---|---|
| `bash -n` روی setup/config/logger | ✅ |
| `npm run check --prefix hermes` | ✅ (۱۲ ماژول، شامل `photo-edit.mjs`) |
| `npm test` | ✅ **۱۱۵/۱۱۵** (شامل ۲۳ تست موتور ویرایش عکس) |
| `npm run test:integration` | ✅ **۹/۹** (حافظهٔ توزیع‌شدهٔ SQLite روی workerd محلی، بدون شبکه؛ `photo-edit` به `workerModuleNames` اضافه شد) |
| `npm run test:shell` + `npm run lint:shell` | ✅ بدون خطا |
| `node build-skills.mjs` | ✅ خروجی شامل «… skills» با هزاران مهارت |

## ۴) این دور چه ساخته شد — ویرایش حرفه‌ای عکس (چند پله‌ای)
**فایل‌ها:** `photo-edit.mjs` (جدید، بدون وابستگی)، `photo-edit.test.mjs` (جدید، ۲۳ تست)،
وصل‌شدن در `worker.mjs` (شاخهٔ وب `/api/chat` + شاخهٔ تلگرام + `sendEdited` + متن `/start`)،
`brain.mjs` (STYLE)، `app.mjs` (گرهٔ **Photo Lab** + قاعدهٔ روشن‌شدن + راهنمای placeholder)،
`package.json` (`check`/`test`)، `conversation.test.mjs` (`workerModuleNames`).

**زنجیرهٔ ۴ مرحله‌ای:**
1. **بریف** (`photoBrief`): مدل بینایی عکس + درخواست را می‌خواند و JSON سخت می‌دهد
   (`subject`, `must_keep`, `problems`, `lighting`, `color`, `aspect`, `risks`)؛ اگر مدل نبود/خراب داد،
   فقط «دستور تخصصی» می‌ماند — هرگز استثنا پرتاب نمی‌شود.
2. **ویرایش** (`runEdit`): دستور از کتابخانهٔ مهارت‌ها ساخته می‌شود
   (`EDIT_OPS`: retouch, product, background, relight, color, restore, upscale, erase, swap, expand, restyle, text)
   با `strength` مخصوص هر کدام؛ اول `geminiEdit` (فهرست مدل‌های تصویری از `/v1beta/models`، کش ۲۴ساعته،
   آخرین مدل موفق جلوتر، `responseModalities:['TEXT','IMAGE']`)، بعد `cfEdit` روی Workers AI
   (flux-1-schnell → sd-v1-5-img2img → sdxl-base). پاسخ‌های کوچک‌تر از ۱KB رد می‌شوند.
3. **بازبینی** (`reviewEdit`): عکس اصلی و نتیجه با هم به مدل می‌روند؛ «هویت عوض شده؟ کادر پریده؟
   متن خراب شده؟ چیز اضافه آمده؟ تغییر ناچیز است؟» با `keep/score/issues/fix`. اگر رد شود،
   **یک تلاش اصلاحی** با نکتهٔ بازبینی انجام می‌شود (`kind:'repaired'`).
4. **تحویل** (`editCaption` + `sendEdited`): کپشن فارسی «چه اصلاح شد / نکتهٔ بازبینی / پیشنهاد بعدی»
   و در تلگرام **آلبوم قبل/بعد** (`sendMediaGroup` با `attach://before|after`)؛ اگر تلگرام آلبوم را
   رد کند، تک‌عکس `sendPhoto`.

**تشخیص درخواست (`editRequest`)**: نرمال‌سازی فارسی (`normalizeFa`: ZWNJ، اعراب، ی/ک عربی)، فهرست
۱۱ خانوادهٔ عملیات، `TEXT_ONLY_READ` (پرسش «متن این عکس چیه؟» ویرایش نیست) و نگهبان‌های
`عکس بساز`/`describe`. متن‌خواهی با مرزهای واقعی حروف (`(?<!\p{L})...`) تشخیص داده می‌شود تا
«متناسب» با «متن» قاطی نشود:
- درخواست **فقط متن** → `kind:'text-refused'` با توضیح صادقانه (مدل متن فارسی را خراب می‌کند)؛
- درخواست **ترکیبی** (ویرایش + متن) → عکس ویرایش می‌شود و در کپشن می‌گوید متن عمداً ساخته نشد.

**قواعد سخت:** هویت/چهره/سن دست‌نخورده؛ هیچ متن/لوگو/واترمارکی ساخته نمی‌شود؛ اگر هیچ مدلی
جواب ندهد خطای صادقانه (هرگز ادعای ویرایش نداشتن). **مبدأ مهارت‌ها:**
`library/github-skills/{image-studio, stability-ai, generate-image, product-photo-studio, ai-photo-restyler, prompt-master}`.

## ۵) کارهای باز / پیشنهاد بعدی
- [ ] آزمون روی سرویس واقعی: یک عکس واقعی به بات بفرست و «قبل/بعد» را ببین (اینجا فقط با upstream شبیه‌سازی‌شده تست شده).
- [ ] لایهٔ متن روی عکس (canvas/SVG، جدا از مدل تصویر) — در `hermes/ROADMAP.md` صف شمارهٔ ۴.
- [ ] اجرای `shellcheck -S warning` روی فایل‌های shell به‌صورت محلی در doctor
      (اکنون نصب نیست؛ در CI نصب و اجرا می‌شود) — افزودن به‌عنوان step اختیاری وقتی ابزار موجود بود.
- [ ] آزمون واقعی روی Oracle: `bash hermes/setup.sh --check-only` روی سرور برای بررسی دیسک/شبکه/کلید.
- [ ] افزودن تست واحد برای `sync-secrets.mjs` (تنها ماژول بدون تست اختصاصی در فهرست فعلی).

## ۶) لاگ جریان (فقط اضافه می‌شود)
- **۲۰۲۶-۱۰-۱۴** — بازبینی امنیتی و اجرای کامل گیت‌های پروژه: ۹۲ تست واحد + ۹ رگرسیون یکپارچگی سبز؛
  هیچ نقصی نیازمند اصلاح نبود.
- **۲۰۲۶-۱۰-۱۴ (ویرایش عکس)** — ساخت `photo-edit.mjs` با زنجیرهٔ بریف→ویرایش→بازبینی→تحویل،
  اتصال به تلگرام و اپ، گرهٔ Photo Lab در اپ، آلبوم قبل/بعد، و تست‌های کامل: ۱۱۵/۱۱۵ واحد + ۹/۹
  یکپارچگی + `test:shell`؛ چهار اشکال واقعی در همان تست‌ها پیدا و رفع شد (مرز کلمهٔ «متن»، درست‌شدن
  ترتیب اولویت عملیات، حداقل اندازهٔ پاسخ Workers AI، و زنده‌نگه‌داشتن گزینهٔ متنی در درخواست ترکیبی).

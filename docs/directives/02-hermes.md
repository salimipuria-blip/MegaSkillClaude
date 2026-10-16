# 02 — هرمس (`hermes/`)

## مأموریت و مرزها
دستیار تلگرامی ۲۴/۷ در دو شکل: **Lite** روی Cloudflare Worker (`entry.mjs` → `worker.mjs`، مغز Gemini/Workers AI) و **Full** با نصب‌کنندهٔ تک‌فایلی Oracle (`setup.sh`). رایگان بماند؛ هیچ کلید/توکنی در کد، manifest یا لاگ نیاید. گروه/کانال هرگز پاسخ خصوصی نمی‌گیرد.

## وضعیت فعلی (شواهد: `hermes/ROADMAP.md`, `tasks/hermes_tasks.json`, `docs/REPO_HARDENING.md`)
- ✅ موج W0 از برنامهٔ ۱۰۰ تسکی: ۳۲ تسک `implemented` + ۸ `existing-verified` (از جمله header سخت‌گیرانهٔ شل، loader امن env بدون `eval`، حافظهٔ SQLite در Durable Object، rate-limit رزرو ۵/ساعت/IP با `Retry-After`).
- ✅ سخت‌سازی: فقط چت خصوصیِ فرستندهٔ مجاز، `/setup` فقط POST با کلید مالک، مهاجرت یک‌بارهٔ KV→SQLite بدون حذف مبدأ، گارد `REQUIRE_CONVERSATIONS=true` در انتشار.
- صف بعدی طبق `tasks/README.md`: **W1 (تست و تاب‌آوری)** شامل #019, #020, #026, #038, #052, #057, #063, #075, #077, #078, #086, #091 ← بعد W2 (عملیات).
- ⚠️ انتشار زندهٔ سخت‌سازی روی Worker تأیید نشده؛ اولین انتشار باید در زمان بدون گفتگوی فعال انجام شود.

## معماری و فایل‌های کلیدی
`worker.mjs` (هسته)، `workspaces.mjs` (مشتری‌های Business)، `brain.mjs`/`conversation.mjs`/`memory.mjs`، `rate-limit.mjs`، `health.mjs`/`metrics.mjs`، `setup.sh`+`config.sh`+`logger.sh` (نصب‌کننده)، `wrangler.toml` (binding `CONVERSATIONS`، migration `conversation-sqlite-v1`)، برنامه‌ریزی تسک‌ها در `tasks/` (فقط dry-run/validate؛ بدون skeleton PR و auto-merge).

## اجرا و تست
```bash
npm ci --prefix hermes --ignore-scripts --no-audit --no-fund   # بدون اجرای postinstall/همگام‌سازی راز
npm run check --prefix hermes && npm test --prefix hermes      # unit
npm run test:integration --prefix hermes                       # workerd/SQLite واقعی (محلی)
bash -n hermes/setup.sh hermes/config.sh hermes/logger.sh
bash hermes/tests/setup_validation.sh                          # تست‌های شل
python3 tasks/apply_hermes_tasks.py --manifest tasks/hermes_tasks.json --validate-only
```

## پروتکل دیباگ حرفه‌ای
- **شکست تست:** تست را تنها و با نام کامل اجرا کن (`node --test --test-name-pattern=...`)؛ تست‌های workerd را با تست واحد قاطی نکن — اولی محیط واقعی DO/SQLite را می‌سنجد.
- **رفتار حافظه:** ریست فقط epoch را عوض می‌کند و پیام پاک نمی‌شود؛ باگ «حافظه برگشت» را اول در تراکنش append و صف هر گفتگو (`conversation.mjs`) بگرد، نه در KV قدیمی.
- **429 کاذب:** شمارنده fixed-window است و اتمیک نیست (best-effort)؛ خطای KV باید fail-closed باشد — سست‌کردن آن برای رفع 429 ممنوع.
- **شل:** هر تغییر `setup.sh` = `bash -n` + ShellCheck (`-S warning`) + `setup_validation.sh`. `eval` روی env در هر شکلی ممنوع؛ loader فقط allow-list.
- **دیباگ زنده:** اول `/api/health` و متریک‌ها؛ توکن بات/کلید Gemini را هرگز در دستور یا لاگ چاپ نکن (`set +x`، ریدکشن).

## گسترش (اولویت‌بندی)
- **Business (فعال):** هر مشتری قراردادی = یک فضای کاری در `workspaces.mjs`. قانون‌ها: دادهٔ مالک (حافظه، گوگل، رزرو، /status، /app) هرگز به مسیر عضو نرسد؛ متن مشتری فقط داده در پرامپت؛ هر مسیر مدل برای عضو قبلش `spend()` بگیرد؛ هر دستور جدید مشتری تست انزوا داشته باشد (`workspaces.test.mjs`).
- **P0:** انتشار کنترل‌شدهٔ Worker سخت‌سازی‌شده طبق چک‌لیست `docs/REPO_HARDENING.md` و تست `/app` در چت خصوصی.
- **P1 (W1):** پوشش واحد ≥۸۰٪، سرور Mock Gemini، آپدیت‌های ناقص تلگرام، quota پایدار هر کاربر، i18n فارسی خطاها، تست post-deploy.
- **P2 (W2/W3):** یادآور و خلاصهٔ صبح (Cron)، داشبورد مالک، بات عمومی مشتری وایکینگ — فقط با تصمیم محصول جدا.

## Definition of Done
هر تسک: شاخهٔ خودش (`hermes/NNN-*`)، پیاده‌سازی واقعی + تست، manifest به‌روز، CI هرمس سبز، PR جدا و بدون auto-merge، تیک در `hermes/ROADMAP.md`.

## پروندهٔ واقعی این دور (۲۰۲۶-۱۰-۱۴) — ۱۳ ماژولِ چک‌نشده

**کشف:** `scripts.check` فهرستی دستی است. با یک خط، ۳۰ ماژولِ `.mjs` ریشه با ۱۷ تایِ داخلِ فهرست مقایسه شد و ۱۳ تا (`add-user`, `app`, `auth`, `booking`, `build-skills`, `google`, `media`, `providers`, `skill-router`, `skills`, `sync-secrets`, `trip-media`, `users`) هرگز `node --check` نمی‌شدند. خطای سینتکسی در آن‌ها فقط هنگامِ bundle شدن یا در استقرار واقعی بیرون می‌زد — آن هم با پیامی که به ماژولِ اصلی اشاره نمی‌کرد.

```bash
cd hermes && node -e "
const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const checked=new Set((pkg.scripts.check.match(/([a-z0-9-]+\.mjs)/g)||[]));
const all=fs.readdirSync('.').filter(f=>f.endsWith('.mjs')&&!f.endsWith('.test.mjs'));
console.log('unchecked:',all.filter(f=>!checked.has(f)).join(' '));"
```

**رفعِ سه‌لایه:** (۱) فهرست کامل شد (۳۰/۳۰، همان لحظه همه سبز — پس بدهی بود نه باگِ فعال)؛ (۲) `coverage.test.mjs` اضافه شد تا دوباره چنین درزِ پوششی باز نشود؛ (۳) `scripts.test` به‌روز شد وگرنه تست اجرا نمی‌شد.

**چهار نگهبانِ `coverage.test.mjs` (و دلیلِ هرکدام):**
- هر `.mjs` ریشه باید در `check` باشد — جلوی همین درز را می‌گیرد.
- هر `*.test.mjs` باید در `test` **یا** `test:integration` باشد — `conversation.test.mjs` کند است و آگاهانه در integration است؛ نگهبان باید این تمایز را بفهمد، نه اینکه همه را یک‌جا بخواهد.
- هر `.sh` (ریشه و `tests/`) باید در `lint:shell` باشد — نصب‌کننده مسیرِ حساس است.
- `postinstall` باید `build-skills.mjs` داشته باشد و هیچ فلگِ `--force/--write/--push` نداشته باشد — چون `npm ci --ignore-scripts` روی ماشینِ مشارکت‌کننده باید امن بماند و همگام‌سازیِ راز فقط در استقرار واقعی رخ دهد.

**دیباگِ این پروژه — دستورِ ایزوله‌سازی:**
```bash
node --test --test-name-pattern="<نام دقیق>" worker.test.mjs   # یک تست، بدون نویز
npm run test:integration --prefix hermes                        # کار جدا: workerd/SQLite واقعی
```
هشدار: خروجیِ لاگ‌هایی مثل «[Hermes] Gemini edit failed» در حین تست **طبیعی** است (مسیرهای degrade عمداً اعمال می‌شوند)؛ آن‌ها را خرابی نخوان. خرابی یعنی `# fail` در خلاصهٔ TAP.

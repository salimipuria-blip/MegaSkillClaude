# Hermes Bridge (P0 — فقط‌خواندنی)

طرح کامل: [`docs/design/hermes-vscode-bridge.md`](../../docs/design/hermes-vscode-bridge.md).

## وضعیت P0
- ✅ محافظ مسیر: جلوگیری از `..`، مسیر مطلق، بایت NUL، بیرون‌زدن symlink از ریشه، و فایل‌های محافظت‌شده (`.env*` به‌جز `.env.example`، `.git/`، `*.pem`، `*.key`، `id_rsa`، `.netrc`).
- ✅ کارهای مجاز: `read_file`، `list_dir`، `search`، `git_status`.
- ✅ هیچ کار نوشتنی، اجرای شل، یا `propose_edit` وجود ندارد. تست ایستا این را بررسی می‌کند.
- ✅ صف کارها (`queue.mjs`): کار فقط از سمت هرمس ساخته می‌شود، هر دستگاه فقط کارهای مالک خودش را می‌بیند، کار با lease داده می‌شود، lease منقضی دوباره در صف می‌نشیند (حداکثر ۳ بار)، و کار منقضی هرگز داده نمی‌شود.
- ✅ توکن دستگاه: فقط هش SHA-256 ذخیره می‌شود، مقایسه با `timingSafeEqual` است و دستگاه قابل ابطال است (کارهای در حال اجرای آن به صف برمی‌گردند).
- ✅ مسیرهای دستگاه (`routes.mjs`): `POST /bridge/claim`، `/bridge/complete`، `/bridge/fail` با Bearer، بدنهٔ ≤ ۶۴ KB، و بدون مسیر ساخت کار برای دستگاه.
- ✅ کلاینت دستگاه (`client.mjs`): `runOnce` و `runLoop`. transport فقط `https` یا `localhost` را قبول می‌کند.
- ⏳ **هنوز مستقر نشده:** صف فعلاً در حافظهٔ همان فرایند است. ذخیره‌سازی پایدار روی Durable Object، اتصال به Worker هرمس و migration در `wrangler.toml` نیاز به تصمیم انتشار دارد و در این مرحله انجام نشده است.
- ⏳ P1 (پیشنهاد diff و افزونهٔ VS Code) هنوز شروع نشده است.

**معنای تحویل:** تحویل «دست‌کم یک‌بار» است. اگر دستگاه کار را اجرا کند ولی پاسخ `complete` به سرور نرسد، lease منقضی می‌شود و کار دوباره داده می‌شود. کارهای فقط‌خواندنی این تکرار را تحمل می‌کنند؛ کارهای نوشتنی در P1 به کلید idempotency نیاز دارند.

## اجرای محلی یک کار (بدون صف)
```bash
cd hermes
npm run check:bridge
npm run test:bridge   # ۴۱ تست: مسیر، ابزارها، صف، مسیرهای HTTP، کلاینت
node bridge/cli.mjs --root /path/to/MegaSkillClaude --job job.json
```
`job.json` مثلاً:
```json
{ "action": "search", "args": { "query": "landing page", "path": "hermes/bridge" } }
```
کار از فایل خوانده می‌شود، نه از خط فرمان، تا محتوایش در تاریخچهٔ شل ثبت نشود.

## محدودیت‌ها
- `read_file` تا ۱۲۸ KB، `search` تا ۲۰۰ نتیجه و ۵۰۰۰ فایل، `list_dir` تا ۵۰۰ مورد.
- `search` و `list_dir` از `node_modules`، `dist` و `.git` عبور نمی‌کنند؛ symlink هم دنبال نمی‌شود.
- جست‌وجو لفظی و بدون حساسیت به حروف بزرگ و کوچک است (نه regex).

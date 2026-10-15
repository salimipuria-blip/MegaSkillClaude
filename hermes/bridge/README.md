# Hermes Bridge (P0 — فقط‌خواندنی)

طرح کامل: [`docs/design/hermes-vscode-bridge.md`](../../docs/design/hermes-vscode-bridge.md).

## وضعیت P0
- ✅ محافظ مسیر: جلوگیری از `..`، مسیر مطلق، بایت NUL، بیرون‌زدن symlink از ریشه، و فایل‌های محافظت‌شده (`.env*` به‌جز `.env.example`، `.git/`، `*.pem`، `*.key`، `id_rsa`، `.netrc`).
- ✅ کارهای مجاز: `read_file`، `list_dir`، `search`، `git_status`.
- ✅ هیچ کار نوشتنی، اجرای شل، یا `propose_edit` وجود ندارد. تست ایستا این را بررسی می‌کند.
- ⏳ اتصال خروجی به صف هرمس و توکن دستگاه: در فاز بعدی، بعد از تأیید طراحی صف روی Cloudflare.

## اجرای محلی یک کار
```bash
cd hermes
npm run check:bridge
npm run test:bridge
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

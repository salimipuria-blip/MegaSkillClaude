# هرمس: دستیار ۲۴/۷ در تلگرام

هزینه: ۰. دو نسخه دارد:

| | **هرمس لایت** (پیشنهادی) | هرمس کامل |
|---|---|---|
| کجا اجرا می‌شود | Cloudflare Workers | سرور Oracle Always Free |
| کارت بانکی خارجی | لازم نیست | لازم است (اوراکل ایران را نمی‌پذیرد) |
| سرور یا دستگاه روشن | لازم نیست | سرور اوراکل |
| چه می‌کند | چت با جمینی، حافظهٔ ۲۰ پیام آخر، فقط برای تو | ایجنت کامل هرمس با ابزار و اجرای دستور روی سرور |
| فایل‌ها | `worker.mjs`، `wrangler.toml` | `setup.sh` |

## هرمس لایت روی Cloudflare

فضای حافظه (`hermes-memory`) از قبل در حساب Cloudflare ساخته شده و در `wrangler.toml` وصل است.

**۱. سه چیز آماده کن** (جایی ننویس و برای کسی نفرست)
- **کلید جمینی:** aistudio.google.com ← Get API key. با VPN.
- **توکن بات:** از `@BotFather` ← `/newbot`. اگر بات داری، `/token`.
- **شناسهٔ عددی تلگرام:** به `@userinfobot` پیام `/start` بده.

> **کلید جمینی اختیاری است.** اگر نباشد یا گوگل آن را رد کند (مثلاً 403)، بات خودکار از هوش مصنوعی رایگان خود Cloudflare (Workers AI) استفاده می‌کند. نه کلید می‌خواهد و نه VPN.

**۲. ساخت Worker از همین مخزن**
dash.cloudflare.com ← Workers & Pages ← Create ← **Import a repository** ← GitHub ← `MegaSkillClaude`
- Project name: `hermes` (دقیقاً همین)
- Root directory: `hermes`
- Deploy command: `npx wrangler deploy` (پیش‌فرض)
- ← Deploy

از این به بعد هر تغییری که در پوشهٔ `hermes/` روی `main` برود، خودکار منتشر می‌شود.

**۳. رمزها**
Worker `hermes` ← Settings ← Variables and Secrets ← Add. هر سه را با نوع **Secret** اضافه کن:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توکن BotFather |
| `GEMINI_API_KEY` | کلید جمینی |
| `ALLOWED_USER_ID` | شناسهٔ عددی تو |

> اگر رمزها را اشتباهی در Settings ← Build ← Variables and secrets گذاشتی، مشکلی نیست: `sync-secrets.mjs` موقع هر ساخت آن‌ها را به رمزهای خود بات کپی می‌کند.

**۴. فعال‌سازی:** یک‌بار صفحهٔ اصلی Worker (`https://hermes.<زیردامنهٔ تو>.workers.dev`) را باز یا رفرش کن؛ خودش بات را وصل می‌کند. (`/setup` هم همان کار را می‌کند) (با VPN، چون workers.dev در ایران فیلتر است). باید ببینی:
```
✓ Webhook set for @نام_بات
✓ Memory: on
```

**۵. تست:** در تلگرام به بات بنویس «سلام، خودت را معرفی کن».

### دستورها در تلگرام
- `/start`: خوش‌آمد
- `/reset`: پاک کردن حافظهٔ گفتگو

### اگر گیر کردی

| پیام | راه حل |
|---|---|
| `✗ Missing secrets: ...` | همان رمزها را در قدم ۳ اضافه کن، بعد `/setup` را دوباره باز کن |
| `✗ Telegram rejected ...` | توکن را دوباره از BotFather کپی کن |
| بات می‌گوید «این بات خصوصی است» | عددی که بات نشان داده را در `ALLOWED_USER_ID` بگذار |
| «جمینی کلید را نپذیرفت» | کلید تازه در AI Studio بساز و Secret را عوض کن |
| «سهمیهٔ رایگان جمینی پر است» | محدودیت رایگان گوگل است؛ چند دقیقه صبر کن |
| بات هیچ جوابی نمی‌دهد | `/setup` را دوباره باز کن. اگر درست نشد: Worker ← Logs، اسکرین‌شات بفرست |

### محدودیت‌های رایگان
- Cloudflare: روزی ۱۰۰٬۰۰۰ درخواست.
- حافظه: روزی ۱٬۰۰۰ نوشتن، یعنی حدود ۱٬۰۰۰ پیام در روز.
- جمینی: سهمیهٔ رایگان AI Studio.

تست‌ها: `node --test hermes/worker.test.mjs`

## هرمس کامل روی Oracle (فقط با کارت خارجی واقعی)

اوراکل برای ساخت حساب کلاد کارت ویزا یا مستر به نام خودت و آدرس خارج از ایران می‌خواهد. با اطلاعات جعلی ثبت‌نام نکن، چون حساب و سرور بسته می‌شوند.

**A. ساخت سرور** (کنسول اوراکل)
- مسیر: Compute ← Instances ← Create instance
- Image: Ubuntu 24.04 (aarch64)
- Shape: `VM.Standard.A1.Flex` با ۴ OCPU و ۲۴ گیگابایت رم. برچسب **Always Free** باید دیده شود.
- SSH keys: Generate a key pair for me، بعد **Save private key**
- اگر Out of capacity گرفتی: ۲ OCPU و ۱۲ گیگابایت.

**B. اتصال** با Termius: Host = آی‌پی عمومی، User = `ubuntu`، Key = کلید خصوصی

**C. نصب** (یک خط)
```bash
curl -fsSL https://raw.githubusercontent.com/salimipuria-blip/MegaSkillClaude/main/hermes/setup.sh -o setup.sh && bash setup.sh
```
اسکریپت کلید جمینی، توکن بات و شناسهٔ عددی را می‌پرسد. کلید و توکن موقع تایپ دیده نمی‌شوند و فقط روی همان سرور ذخیره می‌شوند. هرمس به صورت سرویس systemd اجرا می‌شود و بعد از ری‌استارت هم بالا می‌آید.

**نگهداری:** `hermes gateway status`، `hermes gateway restart`، `hermes doctor`. اگر بات ساکت ماند: `journalctl --user -u hermes-gateway -n 50 --no-pager`.

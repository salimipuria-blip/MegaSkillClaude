# نصب هرمس — راهنمای حرفه‌ای (Hermes/#021, #053, #067, #085, #091)

هرمس دو مسیر استقرار دارد؛ آن‌ها را با هم قاطی نکنید:

| مسیر | کجا | ورودی اصلی | رازها |
|---|---|---|---|
| **Lite (پیشنهادی)** | Cloudflare Workers | `hermes/entry.mjs` → `worker.mjs` | داشبورد Cloudflare، نوع Secret |
| **Full** | Oracle Always Free (Ubuntu) | `hermes/setup.sh` | ورودی مخفی ترمینال یا env در حالت non-interactive |

جزئیات قدم‌به‌قدم Lite و اتصال گوگل در [`hermes/README.md`](../../hermes/README.md) است و منبع حقیقت همان‌جاست؛ این سند قراردادهای اجرایی و عیب‌یابی مشترک را ثابت می‌کند.

## Lite — بررسی پس از استقرار

```bash
curl -fsS https://<worker>/health/live     # {"status":"ok","kind":"liveness"}
curl -fsS https://<worker>/health/ready    # 503 تا توکن بات + شناسهٔ مالک تنظیم شود
curl -fsS https://<worker>/metrics         # Prometheus؛ یا ?format=json
```

`/health/full` فقط **حضور** bindingها را (درست/نادرست) گزارش می‌کند؛ هیچ مقدار رازی چاپ نمی‌شود.

## Full — نصب تعاملی و non-interactive

```bash
# تعاملی: رازها مخفی پرسیده می‌شوند
bash hermes/setup.sh

# CI / provisioning: راز فقط از محیط، هرگز از آرگومان خط فرمان
GEMINI_API_KEY=... TELEGRAM_BOT_TOKEN=... TELEGRAM_USER_ID=... \
  bash hermes/setup.sh --non-interactive

# فقط پیش‌بررسی (دیسک، شبکه، اعتبار کلید/توکن) بدون نصب و تغییر سیستم
GEMINI_API_KEY=... TELEGRAM_BOT_TOKEN=... TELEGRAM_USER_ID=... \
  bash hermes/setup.sh --non-interactive --check-only
```

قرارداد تک‌فایلی: `setup.sh` با `curl -o setup.sh` هم باید کار کند، پس به فایل‌های همسایه وابسته نیست؛ در checkout، توابع تست‌شدهٔ `hermes/config.sh` و `hermes/logger.sh` را ترجیح می‌دهد.

متغیرهای قابل override: `GEMINI_API_BASE`, `TELEGRAM_API_BASE`, `LOG_LEVEL`, `HERMES_LOG_FORMAT=text|json`, `HERMES_INSTALL_LOG`, `HERMES_MIN_FREE_MB`, `HERMES_SECRETS_DIR` (رازهای mount‌شدهٔ سبک K8s؛ نام فایل uppercase می‌شود).

## عیب‌یابی سریع

| نشانه | Lite | Full |
|---|---|---|
| بات ساکت است | `setup:webhook` را دوباره اجرا کن؛ سپس Worker ← Logs | `journalctl --user -u hermes-gateway -n 50 --no-pager` |
| 401/403 جمینی | Secret را تازه کن | پیام نصب دقیقاً همین را می‌گوید؛ کلید تازه از AI Studio |
| 429 جمینی | سهمیهٔ رایگان؛ صبر یا مغز پشتیبان | همان |
| `/health/ready` ‏503 | binding/secret ناقص است | — |

## توسعهٔ محلی (بدون راز واقعی)

```bash
npm ci --prefix hermes --ignore-scripts
npm run check --prefix hermes
npm test --prefix hermes
bash hermes/tests/setup_validation.sh
```

تست‌ها به تلگرام/جمینی واقعی وصل نمی‌شوند. TLS محلی جداگانه لازم نیست؛ `wrangler dev`/Miniflare مسیر استاندارد توسعهٔ Worker است.

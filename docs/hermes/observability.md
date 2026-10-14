# مشاهده‌پذیری هرمس (Hermes/#059, #060, #062)

## Endpointها (Lite)

| مسیر | معنا | نکته |
|---|---|---|
| `GET /health/live` | isolate زنده است | به هیچ وابستگی‌ای وصل نمی‌شود |
| `GET /health/ready` | حداقل پیکربندی حاضر است | نبودش ‏503؛ فقط boolean برمی‌گرداند |
| `GET /health/full` | موجودی bindingها | بدون مقدار راز |
| `GET /metrics` | Prometheus text | شمارندهٔ **per-isolate** |
| `GET /metrics?format=json` | همان شمارنده‌ها به JSON | برای دیباگ انسانی |

⚠️ شمارنده‌های متریک با مرگ isolate صفر می‌شوند؛ برای تحلیل تاریخی به آن‌ها تکیه نکنید. هیچ لیبلی از شناسهٔ کاربر/چت ساخته نمی‌شود (انفجار cardinality + حریم خصوصی).

داشبورد نمونه: [`observability/grafana/hermes-dashboard.json`](../../observability/grafana/hermes-dashboard.json) — بعد از import، datasource خودتان را انتخاب کنید و یک scrape از `/metrics` استقرار **خودتان** بسازید.

## لاگ شل (Full)

`hermes/logger.sh`: با `HERMES_LOG_FORMAT=json` هر خط یک JSON با `ts/level/msg` است؛ `LOG_LEVEL=debug|info|warn|error` سطح را کنترل می‌کند. راز را به logger ندهید.

## تله‌متری (#060)

هرمس تله‌متری محصولی پیش‌فرض ندارد. `TELEMETRY_DISABLE=1` در مثال‌های env ثابت شده تا هر ابزار جانبی آینده هم بدون opt-out داده نفرستد.

## مقیاس (#062) — واقعیت مسیر رایگان

- Worker: سقف روزانهٔ سطح رایگان Cloudflare؛ KV اتمیک نیست (محدودیت رزرو best-effort و fail-closed است)؛ برای سهمیهٔ سختِ per-user باید Durable Object نوشت (تسک #077) و صف/جایگزین BullMQ روی Worker معنا ندارد (تسک #036 رد شده).

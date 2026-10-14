# 04 — Lithos Live Intelligence (`lithos/`)

## مأموریت و مرزها
داشبورد خصوصی پایش اینستاگرام/Buffer (KPI، insight و لیدها) با ورود Magic Link سوپابیس و endpoint همگام‌سازی serverless. خصوصی است: دسترسی داده فقط مالک (`lithos_owners`) و RLS خط اول دفاع است، نه پنهان‌کردن کلید anon.

## وضعیت فعلی (شواهد: `lithos/README.md`)
- ⚠️ منشأ کد: بازسازی از آخرین deployment سالم Vercel؛ `api/buffer-sync.js` **نیمه‌تعمیمی** است (بخش پایانی با برچسب `RECONSTRUCTED`) و کوئری GraphQL و کلیدهای متریک Buffer **هنوز با API واقعی راستی‌آزمایی نشده‌اند**.
- ✅ تست‌ها (`npm test`، handler با Buffer/Supabase موک‌شده) و بیلد Vite سبز؛ persistence روی RPCهای موجود (`lithos_ingest_buffer_snapshot`, `lithos_set_buffer_sync_state`).
- جداول خوانده‌شده: `lithos_insight_snapshots`, `lithos_kpi_snapshots`, `lithos_leads`, `lithos_sync_state`.

## معماری و فایل‌های کلیدی
فرانت تک‌فایلی `index.html` (Supabase JS از CDN)، `api/buffer-sync.js` (Vercel Function)، `vercel.json`، `tests/buffer-sync.test.mjs`.

## اجرا و تست
```bash
cd lithos && npm install && npm test && npm run build
node --test tests/buffer-sync.test.mjs   # دیباگ یک تست تنها
```

## پروتکل دیباگ حرفه‌ای
- **Sync ناموفق:** وضعیت را از `lithos_sync_state` بخوان (`connected/synced/error`)، بعد پاسخ خام Buffer را (بدون توکن) با کوئری فعلی diff بزن؛ چون کوئری unverified است، اول شکل پاسخ واقعی را با مستندات Buffer ثابت کن، بعد parser را اصلاح کن — برعکس نه.
- **دادهٔ خالی در داشبورد:** ترتیب بررسی: RLS و مالکیت → وجود snapshot → RPC ingest. مشکل را با service_role در فرانت «حل» نکن.
- **`BUFFER_API_KEY`** فقط server-side در Vercel است؛ نشتش در لاگ/کلاینت = چرخش فوری کلید از داشبورد Buffer.
- هر تغییر در بخش `RECONSTRUCTED` باید با تست mocked جدید پوشش داده شود و برچسب بازسازی فقط بعد از تطبیق با رفتار واقعی حذف شود.

## گسترش (اولویت‌بندی)
- **P0:** راستی‌آزمایی زندهٔ کوئری Buffer و کلیدهای متریک با یک sync دستی و مقایسهٔ عددها با پنل Buffer؛ ثبت نتیجه در README.
- **P1:** زمان‌بندی sync (Cron رایگان Vercel) + هشدار `sync_state=error`؛ تست قرارداد RPCها.
- **P2:** تفکیک فرانت تک‌فایلی به ماژول‌ها فقط اگر حجم تغییر توجیه کند؛ نمودار روند KPI با دادهٔ واقعی snapshotها.

## Definition of Done
`npm test && npm run build` سبز، sync دستی موفق با عدد منطبق با Buffer، هیچ secret در diff، وضعیت راستی‌آزمایی در `lithos/README.md` به‌روز.

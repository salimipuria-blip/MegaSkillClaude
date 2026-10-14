# استیکرهای وایکینگ آفرود

۱۲ پک × ۳۰ استیکر (۳۶۰ PNG شفاف ۵۱۲×۵۱۲)، تمام‌نارنجی، فونت لاله‌زار، بدون پس‌زمینه.
هر پک ۲۴ استیکر تکی (وایکینگ آقا و خانم) و ۶ دیالوگ دونفره دارد.

| پوشه | محتوا |
|---|---|
| `packs/pack-*/` | استیکرهای نهایی |
| `packs/preview-*.png` | پیش‌نمایش هر پک |
| `cover/viking-cover-sticker.png` | استیکر عنوان «اگه گفتی جای چی خالیه؟؟؟» |
| `src/` | سورس: `packs.js` (جمله‌ها)، `duos.js` (دیالوگ‌ها)، `character.js` و `female.js` (کاراکترها)، `stickers.html` (چیدمان و رنگ) |

## ساخت دوباره
```bash
cd brands/viking-offroad/stickers/src
npm install --no-package-lock
node render.js all          # همه‌ی پک‌ها؛ یا: node render.js 0,2 --sheets فقط پیش‌نمایش
```
مسیر کروم را با `CHROMIUM_PATH` بده اگر Playwright آن را پیدا نکرد. جمله‌ی جدید = یک خط در `packs.js`.

## کنترل کیفیت و جریان
از ریشهٔ monorepo: `python3 scripts/check_brand_assets.py --stickers` (تعداد پک/PNG، ابعاد ۵۱۲×۵۱۲، RGBA، preview و cover). این گیت ساختار را بررسی می‌کند، نه کیفیت طراحی یا شفافیت تک‌تک پیکسل‌ها؛ بازبینی چشمی همچنان لازم است. وضعیت به‌روز در [`brands/viking-offroad/PROGRESS.md`](../../PROGRESS.md) و دستور توسعه در [`docs/directives/09-viking-brand-assets.md`](../../../docs/directives/09-viking-brand-assets.md) است.

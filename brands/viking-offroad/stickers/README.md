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

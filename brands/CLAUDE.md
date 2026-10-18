# brands + brand (دارایی‌های برند وایکینگ آفرود) — دستور کار Claude

> وضعیت: **سالم؛ قالب محتوا تا تأیید بریف فقط پیش‌نویس** · آخرین بازبینی: 2026-10-18
> این فایل دو پوشه را پوشش می‌دهد: `brands/viking-offroad/` (پک استیکر) و `brand/viking/` (قالب پست/استوری). هرکدام دفتر جریان خودش را دارد:
> `brands/viking-offroad/PROGRESS.md` و `brand/viking/PROGRESS.md` (+ `brand/viking/PROFESSIONAL_GUIDE.md`، `ART_DIRECTION.md`). دستورهای مرتبط: `docs/directives/09-viking-brand-assets.md` و `10-viking-content-renderer.md`.

```yaml
project: viking-brand-assets
brand: viking.offroad (tour/off-road/camp; black + orange #F28A1E, warm cinematic mood)
parts:
  stickers:                         # brands/viking-offroad/stickers  — verified 2026-10-18
    packs: 12                       # pack-01-salam … pack-12-rezerv
    stickers: 360                   # 12 × (24 captions + 6 duos), 512×512 RGBA PNG, transparent
    previews: 12                    # packs/preview-*.png (RGB, ~0.9 MB each — review sheets, not deliverables)
    cover: cover/viking-cover-sticker.png   # 1600×1000 RGBA
    manifest: stickers/MANIFEST.json        # SHA-256 of every PNG; 372/372 hashes match disk
    source: stickers/src/{packs.js,duos.js,character.js,female.js,stickers.html,cover.html,render.js}
    note: "pack.color in packs.js is legacy metadata — NOT used by the renderer; every pack is all-orange"
  content_templates:                # brand/viking
    post: post.html → 3 PNG 1080×1350
    story: story.html → 1 PNG 1080×1920
    palette: {orange: "#F39A2B", black: "#141414", cream: "#FFD9A8", alert_red: "#FF4D3D"}
    claims_gate: brief.json (verified=false → render.mjs refuses unless --allow-unverified-claims)
commands:                           # all green 2026-10-18, from repo root
  stickers_structure: python3 scripts/check_brand_assets.py --stickers
  stickers_manifest:  python3 scripts/build_sticker_manifest.py --check
  templates_assets:   python3 scripts/check_brand_assets.py --templates
  renderer_syntax:    node --check brand/viking/render.mjs
  renderer_tests:     node --test brand/viking/tests/*.test.mjs        # 10/10 (pass FILES, not the folder)
  doctor:             node scripts/doctor.mjs brand-stickers ; node scripts/doctor.mjs brand-viking
consumers: [instagram/telegram posting by owner, hermes image routine context, docs/PORTFOLIO.md]
status: healthy
owner_actions:
  - fill brief.json claims (capacity, dates, prices, prize) with real `source` and set verified=true before any template is published
  - visual sign-off of one sample per sticker pack
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `brands/viking-offroad/stickers/packs/pack-NN-<slug>/01..30.png` | استیکر نهایی؛ ۰۱–۲۴ تکی، ۲۵–۳۰ دیالوگ دونفره |
| `brands/viking-offroad/stickers/src/packs.js` / `duos.js` | متن‌ها (منبع انسانی)؛ تعداد خروجی هر پک = `items.length + DUOS[i].length` |
| `…/src/render.js` | رندر Playwright؛ CLI صفرمبنا: `node render.js 0,2 --sheets` |
| `…/stickers/MANIFEST.json` | سنجاق پیکسل به سورس (`scripts/build_sticker_manifest.py`) |
| `brand/viking/{post,story}.html` + `assets/` | قالب؛ فونت‌ها و عکس محلی (بدون URL شبکه) |
| `brand/viking/render.mjs` | رندر با دروازهٔ fail-closed ادعاها |
| `brand/viking/brief.json` | هر عدد/تاریخ/قیمت/جایزه با `source`؛ پیش‌فرض `verified: false` |
| `brand/viking/tests/` | `render.test.mjs` (۳، Playwright fake) + `content.test.mjs` (۷) |

## قواعد سخت (MUST / NEVER)
```text
MUST  brand colors: black + orange #F28A1E (stickers/highlights); templates keep their own palette (#F39A2B…)
MUST  follow the root CLAUDE.md image routine for any NEW photo/visual: prompt-master → mega-skills-router
      → generate with an image model → review → SendUserFile. Persian text goes on top with Vazirmatn/Lalezar.
MUST  regenerate MANIFEST.json (python3 scripts/build_sticker_manifest.py) in the same change as any PNG/source edit
MUST  keep every campaign claim in brief.json with a real source; publish only with verified=true
NEVER design new photos/illustrations with code (SVG/canvas). The sticker renderer is the existing,
      owner-approved pipeline for this pack only — extending it (new sentences in packs.js) is fine;
      inventing new characters/art by code is not.
NEVER fake faces, English text on images, or invented scarcity/prizes/prices
NEVER fill a missing sticker by copying/renaming another PNG
NEVER commit render output (brand/viking/out/ is gitignored)
```

## اشکال‌زدایی
| نشانه | علت | بررسی | رفع |
|---|---|---|---|
| `build_sticker_manifest.py --check` قرمز | PNG یا `packs.js`/`duos.js` بدون بازسازی manifest عوض شده | همان دستور | اگر تغییر عمدی است: `python3 scripts/build_sticker_manifest.py` و بازبینی چشمی |
| `node --test brand/viking/tests/` خطای `Cannot find module …/tests` | Node 22 پوشه را ماژول فرض می‌کند | — | فایل‌ها را بده: `node --test brand/viking/tests/*.test.mjs` |
| `render.mjs` می‌گوید brief تأیید نشده | `brief.json.verified=false` (درست کار می‌کند) | `brief.json` | منبع ادعاها از مالک → `verified: true`؛ برای پیش‌نویس چیدمان: `--allow-unverified-claims` |
| رندر: مرورگر پیدا نشد | Playwright/Chromium نصب نیست | `CHROMIUM_PATH`، `PLAYWRIGHT_PATH` | مسیر مرورگر را بده؛ هرگز مسیر ثابت در کد |
| شمار PNG پک ≠ ۳۰ | `duos.js` تغییر کرده | `check_brand_assets.py --stickers` | بازرندر همان پک (`render.js i`) نه کپی فایل |
| رنگ پک «آبی/سبز» در manifest | فیلد `color` قدیمی در `packs.js` | `grep pack.color src/*` → استفاده نمی‌شود | نادیده بگیر یا در دور بعدی به `#F28A1E` یکسان کن (با بازسازی manifest) |

## صف کار
- **P0 (مالک)** — منبع واقعی همهٔ ادعاهای `brand/viking/brief.json` (ظرفیت، تاریخ ۳۰ مهر/برگشت، قیمت‌ها، جایزه، شرط تگ). پذیرش: هر `claims[].source` پر، `verified: true`، `node --test brand/viking/tests/*.test.mjs` سبز، رندر بدون فلگ.
- **P1** — بازبینی چشمی یک preview از هر ۱۲ پک (۲۰۲۶-۱۰-۱۸ پک ۵ «کمپ و شب» دیده شد: تمام‌نارنجی، متن فارسی سالم، بدون پس‌زمینه). پذیرش: جدول ۱۲ردیفه در `brands/viking-offroad/PROGRESS.md`.
- **P1** — lockfile برای `stickers/src` (فعلاً `playwright-core@1.56.0` بدون lock). پذیرش: `package-lock.json` و `npm ci` در دستور ساخت.
- **P2** — فیلد بی‌مصرف `color` در `packs.js` یا حذف یا یکسان؛ پذیرش: manifest بازسازی و `--check` سبز، PNGها بی‌تغییر (SHAها ثابت).
- **P2** — previewها (~۰٫۹MB) فقط برای بازبینی‌اند؛ اگر حجم مخزن مهم شد به WebP یا خارج از git منتقل شوند.

## پروتکل به‌روزرسانی
1. قبل و بعد از هر تغییر: پنج دستور بلوک `commands` (یا دو `doctor`).
2. تغییر سورس استیکر → رندر فقط پک مربوط → `build_sticker_manifest.py` → بازبینی چشمی (روی زمینهٔ روشن و تیره).
3. نتیجه را در `PROGRESS.md` همان زیرپروژه با تاریخ ثبت کن؛ این فایل (yaml و صف کار) را هم‌زمان به‌روز کن.
4. وضعیت مهم → `docs/PORTFOLIO.md` (منبع دانش هرمس).

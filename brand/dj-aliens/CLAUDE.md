# DJ Aliens × Viking (قصهٔ شب هالووین) — دستور کار

> وضعیت: **سالم؛ طرح آمادهٔ انتشار** · آخرین بازبینی: 2026-10-28
> دستور پروژه: `docs/directives/13-dj-aliens-story.md` · دفتر جریان: `PROGRESS.md` · قالب‌های وایکینگ: `brand/viking/`

```yaml
project: brand-dj-aliens
brand: DJ Aliens (DJ set) × viking.offroad (host) — Halloween night 02
folder: brand/dj-aliens
outputs:
  story: deliverables/dj-aliens-halloween-story.png   # 1080x1920, 9:16
  post:  deliverables/dj-aliens-halloween-post.png    # 1080x1350, 4:5
render: render.py -> build() / build_post()   # Pillow + HarfBuzz, no browser, no network
modules:
  bidi.py:     split_runs()           # pure logic, dependency-free, unit-tested
  textkit.py:  Face, run_mask, line_mask, draw_text, draw_rich_text, rich_width, fit_face
  render.py:   background, hud, header, eyebrow, wordmark, equalizer, headline, body, meta_card, cta
source_of_truth:
  copy_and_claims: brief.json         # every claim carries `source`; verified=true only when filled
  plate: assets/desert-night.jpg      # image-model plate, never drawn with code
  fonts: assets/fonts/*.woff2         # Lalezar, Vazirmatn (3 weights), Orbitron (3 weights)
palette: {orange: "#F39A2B", hot: "#FFB040", black: "#141414", cream: "#FFD9A8", white: "#FFFFFF", night_violet: "#7660EB"}
safe_area: {top: 210, bottom: 1700}   # Instagram/Telegram story chrome
commands:                              # all green 2026-10-28
  render:     python3 brand/dj-aliens/render.py
  tests:      python3 -m unittest discover -s brand/dj-aliens/tests -p "test_*.py"   # 13/13
  doctor:     node scripts/doctor.mjs brand-dj-aliens
status: healthy
owner_actions:
  - confirm the 4:20 tag is a graphic signature, not the real start time (or supply the real time)
  - one visual sign-off of the story on a phone before posting
```

## نقشهٔ کد
| مسیر | مسئولیت |
|---|---|
| `render.py` | چیدمان کامل ۹:۱۶ و ۴:۵ از `brief.json`؛ هیچ متن یا عددی داخلِ کد hard-code نیست مگر در `brief.json` |
| `textkit.py` | shaping با HarfBuzz، رسترِ گلیف با FreeType، glow/shadow، اندازه‌گیریِ واقعیِ عرض |
| `bidi.py` | تشخیص RTL/LTR و ترتیبِ بصریِ ران‌ها؛ بدون وابستگی تا در هر محیطی تست شود |
| `brief.json` | ادعاها + متن‌ها + مسیر assetها |
| `tests/test_brief.py` | قراردادِ ادعا/asset/متن فارسی |
| `assets/` | پلیت، لوگوی رسمی وایکینگ (ارجاع به `brand/viking/assets/logo.png`)، فونت‌ها |

## قواعد سخت (MUST / NEVER)
```text
MUST  هر عدد/تاریخ/ساعت/جایزه از brief.json بیاید و `source` داشته باشد
MUST  لوگوی رسمی فقط از brand/viking/assets/logo.png (بدون بازسازی/تغییر)
MUST  متن فارسی فقط با فونت واقعی (Lalezar/Vazirmatn) و shaping با HarfBuzz
MUST  بعد از هر تغییر بصری، PNG را در اندازهٔ واقعی روی موبایل ببین (هم story هم post)
NEVER عکس/آدم/صحنه را با کد (SVG/canvas/Pillow) طراحی کن — پلیت فقط از مدل تصویر
NEVER قیمت، ظرفیت، جایزه یا scarcity ساختگی اضافه کن
NEVER متنِ فارسی یا لاتین را با مدل تصویرساز روی عکس بگذار
NEVER خروجیِ deliverables/ را commit کن؛ build است
```

## جدول عیب‌یابی
| نشانه | علت احتمالی | کار درست |
|---|---|---|
| متن فارسی مربع/جدا-جدا | shaping انجام نشده یا reshaperِ آماده به‌کار رفته | از `textkit.draw_text` استفاده کن؛ فونت‌های برند فرم نمایشی ندارند |
| نام لاتین برعکس (`SNEILA`) | خط بدون bidi یکجا RTL شده | `split_runs` را دور نزن؛ `draw_rich_text`/`line_mask` خودشان تفکیک می‌کنند |
| فاصلهٔ کلمات چسبیده | عرضِ ران با ink جای advance حساب شده | `run_mask` عرضِ advance برمی‌گرداند؛ `rich_width` باید با رسم یکی باشد |
| خط از کادر بیرون زده | اندازهٔ ثابت برای متنِ متغیر | `fit_face`/`rich_width` با `max_width` استفاده شود |
| سایه/گلو خطِ زائد | pad نامناسب در blur | `draw_text` خودش pad را از `glow`/`shadow_blur` حساب می‌کند |
| `ModuleNotFoundError: uharfbuzz` | نصب‌نشدن requirements | `pip install -r brand/dj-aliens/requirements.txt` |

## صف کار
- **P1:** تأییدِ ساعت (۴:۲۰ گرافیکی است یا واقعی؟) و افزودنِ آن به `brief.json` اگر واقعی شد.
- **P1:** نسخهٔ کاروسل ۳ اسلایدی از همین زبان بصری (لاین‌آپ / قوانین شب / CTA) برای فید.
- **P2:** اسکریپتِ `--preview-grid` برای بررسی هم‌زمان story و post.
- **P2:** انتقالِ `brief.json` به اسکیمای مشترک با `brand/viking/brief.json` (کلید/برچسب/مقدار/منبع یکی است).

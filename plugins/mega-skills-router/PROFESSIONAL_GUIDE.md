# ممیزی فنی — مگا اسکیل (`mega-skills-router@psk`)

> تاریخ این دور: **2026-10-18** · دستور کار دائمی: `CLAUDE.md` · گزارش جریان: `PROGRESS.md`
> هر دور ممیزی این فایل را بازنویسی می‌کند؛ تاریخچه در `PROGRESS.md` می‌ماند.

## وضعیت اندازه‌گیری‌شده
| بررسی | قبل | بعد |
|---|---|---|
| `python3 -m unittest discover -s tests` | 70/70 سبز، **73.3s** | **73/73** سبز، **15.1s** |
| فایل تست مسیریاب به‌تنهایی | 51.2s | 11.5s |
| `sync_skill_library.py --check` | 0 فایل متفاوت | 0 فایل متفاوت |
| `node scripts/doctor.mjs router` | — | سبز، 21.9s |
| `verify_skills.py --strict` | — | HASHED 3020 |
| فراخوانی CLI با fallback (`"تور آفرود"`، `"صندوق فروش pos"`) | 2.2–2.3s | 0.74–0.78s |
| فراخوانی CLI عادی | 0.5–1.5s | 0.6–0.8s |

## یافته‌ها
### 🔴 باگ‌های مسیریابی برای پشتهٔ پروژه‌های قراردادی (رفع شد)
| ورودی | قبل (اول) | علت | بعد (اول) |
|---|---|---|---|
| `ربات تلگرام` (هرمس) | `telegram-channel-export` 0.43 | «ربات»/«تلگرام» alias نداشتند | `telegram-bot-builder` 1.0 |
| `تست واحد` | `bottoms-up-model-sheet` 0.68 (واحد اندازه‌گیری!) | «واحد» نادر بود و وزن را برد | `pro-testing-strategy` 1.0 |
| `برنامه‌نویسی پایتون` | `openpyxl-automation-pack` | «پایتون» alias نداشت | `python-code-style` 1.0 |
| `دیتابیس سوپابیس` (چام) | `database-*` 0.41 | «سوپابیس» ناشناخته | `supabase-automation` 1.0 |
| `ایمیل مارکتینگ` | `email-ops` 0.43 | «مارکتینگ» ناشناخته | `email-marketing` 1.0 |

اصلاح: aliasهای فارسی ابزار/پشته (ربات، تلگرام، واتساپ، یوتیوب، پایتون، جاوااسکریپت، تایپ‌اسکریپت، دیتابیس، پایگاه داده، سرور، ایمیل، سوپابیس، ورسل، کلادفلر، ری‌اکت، مارکتینگ) و alias عبارتی چندکلمه‌ای («تست واحد»/«یونیت تست» → `unit test`) در **هر دو** `route.py`. تست: `test_persian_stack_names_route_to_their_skills`.

### 🟠 کارایی (رفع شد)
- هر جستجو کل `triggers.json` (3.2MB، 30,203 trigger) را دوباره می‌خواند و توکن می‌کرد؛ fallback این کار را **دو بار** انجام می‌داد. اصلاح: `_prepared_index` با `functools.lru_cache` (کلید: مسیر + `st_mtime_ns` + `st_size`) و یک پاس واحد در آستانهٔ 0.25 که بعد به ≥0.50 فیلتر می‌شود (رتبه‌بندی یکسان؛ با 25 درخواست مقایسه شد و تنها اختلاف، جابه‌جایی جزئی امتیاز در دو درخواستی بود که aliasهای جدید IDF واژه‌شان را عوض کرده بودند). تست: `test_index_cache_reloads_an_edited_index`.
- تست‌ها ماژول را برای هر جستجو دوباره import می‌کردند؛ `_load` در تست cache شد.

### 🟠 دو نسخهٔ `route.py` دستی هم‌گام می‌شوند (نگهبان اضافه شد)
`sync_skill_library.py` فقط ایندکس و مهارت‌ها را تولید می‌کند، نه `route.py`/`SKILL.md`. تفاوت مجاز فقط حل مسیر است (`SKILL_DIR` در پلاگین، `REPO_ROOT`/`MEGA_SKILLS_ROOT` در نسخهٔ پروژه‌ای). تست `test_route_copies_differ_only_in_path_resolution` هر انحراف دیگری را قرمز می‌کند.

### 🟡 باز (در `CLAUDE.md` → صف کار)
- **هیچ مهارتی برای وایکینگ/آفرود و صندوق چام نیست:** `تور آفرود` → `code-tour` 0.34؛ `صندوق فروش pos` → `shetab-pos-notes` 0.46. راه‌حل: مهارت‌های تحویل `hermes-delivery`، `cham-delivery`، `viking-delivery` در `library/skills/` + sync (P0).
- **trigger‌های عمومی:** `فروشگاه آنلاین` به `academy-waitlist-generator` و چند `academy-*` با امتیاز 1.0 می‌خورد (عبارت کامل در trigger آن‌هاست). اصلاح در منبع canonical (P1).
- **حوزهٔ اشتباه:** `telegram-bot-builder` در `graphic-design` است (P1).
- **حجم پلاگین:** 17,832 فایل؛ نصب از marketplace کل مخزن را می‌گیرد. زمان نصب اندازه‌گیری نشده (P1).
- **CLI هنوز ~0.7s:** بیشترش JSON + توکن‌سازی است؛ ایندکس پیش‌توکن‌شده در sync آن را زیر 0.3s می‌برد (P2).

## فایل‌های این دور
- `plugins/mega-skills-router/skills/mega-skills-router/scripts/route.py` و `.claude/skills/mega-skills-router/scripts/route.py` — aliasها، کش، fallback تک‌پاس.
- `tests/test_mega_skills_router.py` — سه تست جدید + cache ماژول.
- `plugins/mega-skills-router/CLAUDE.md` (جدید)، همین فایل، `PROGRESS.md`.

## پیشنهادهای بعدی (به ترتیب ارزش برای تحویل پروژه‌ها)
1. سه مهارت تحویل پروژه + aliasهای برند (هرمس/چام/وایکینگ/آفرود) با تست رتبه‌بندی.
2. مجموعهٔ طلایی درخواست‌های واقعی مالک و اسکریپت دقت در CI (top-1 ≥ 85٪).
3. پاک‌سازی trigger‌های عمومی و اصلاح domainها در منبع canonical.
4. ایندکس پیش‌توکن‌شده؛ سپس بالا بردن نسخه به 1.3.0 در `plugin.json` و `marketplace.json`.

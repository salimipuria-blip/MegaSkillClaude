# نقشهٔ کل پروژه‌ها و ریپوها (مرجع هرمس)

> این فایل منبع دانش هرمس دربارهٔ «همهٔ پروژه‌ها» است و موقع انتشار به `hermes/public/knowledge/` کپی می‌شود.
> آخرین بازبینی کامل: **۲۰۲۶-۱۰-۱۷** (تست‌ها در همین تاریخ اجرا شدند). هر تغییر مهم = همین فایل به‌روز شود.

## مالک و قاعده‌ها
- مالک: پوریا (salimipuria-blip). همهٔ پروژه‌ها قراردادی‌اند و باید حرفه‌ای تحویل شوند.
- «مگا اسکیل» یعنی پلاگین Claude Code به نام `mega-skills-router@psk` (نه سایت psk).
- هیچ کلید یا رمزی در چت یا مخزن نوشته نمی‌شود. چیزی که تست نشده «انجام شد» گفته نمی‌شود.
- روال تغییر: شاخه → PR پیش‌نویس → CI سبز → مرج (squash).

## ریپوها
| ریپو | نقش | وضعیت |
|---|---|---|
| `MegaSkillClaude` (خصوصی) | **مخزن اصلی**: هرمس، پلاگین مگا اسکیل، psk، لیتوس، وایکینگ، بایسون، چام قدیمی، موبایل، برندها | فعال؛ Vercel و Cloudflare به همین وصل‌اند |
| `POINT` (خصوصی) | چام نسخهٔ جدید و امن (`fjcod/`، Supabase + RLS) | تست‌شده، منتشر نشده |
| `FJCod` (خصوصی) | چام نسخهٔ ۱ (دادهٔ مرورگر) | قدیمی؛ پس از انتقال Archive |
| `viking-experience-command` (خصوصی) | نسخهٔ قدیمی وایکینگ | قدیمی؛ کد جدید در `MegaSkillClaude/viking-team` |
| `Viking`، `PProject-i18n` | خالی | پیشنهاد Archive |
| `PProject` | قالب شروع پروژه؛ CI خراب | تعمیر یا Archive |
| `bison-brand-book`، `back` (عمومی) | نسخه‌های قدیمی بایسون/لاگ بررسی | پیشنهاد Archive |
| `porya-omni-llm-orchestrator` | بایگانی‌شده | — |
| `claude-code` | fork دست‌نخوردهٔ Anthropic | بی‌استفاده |

## پروژه‌ها
| پروژه | محل | وضعیت | کار مانده |
|---|---|---|---|
| **هرمس** (دستیار تلگرام + اپ) | `MegaSkillClaude/hermes` | زنده روی Cloudflare Worker `hermes`؛ ۲۲۰+ تست سبز؛ یادآور با Cron فعال | `hermes/ROADMAP.md` |
| **پلاگین مگا اسکیل** | `MegaSkillClaude/plugins/mega-skills-router` | نسخهٔ ۱.۲.۰، ۶٬۰۲۹ مهارت، ۷۰ تست سبز | مهارت تحویل اختصاصی هر پروژه |
| **چام (فروشگاه)** | `POINT/fjcod` (جدید)، `MegaSkillClaude/fjcod` (قدیمی) | جدید: سرور، احراز هویت، RLS، مرجوعی، فاکتور، کارکنان، گزارش؛ قدیمی رمزهای متنی در کد دارد | انتشار (Supabase + Vercel)، سبد نگه‌داشته، داشبورد رشد، انتقال دادهٔ قدیمی |
| **وایکینگ** (اپ تیم) | `MegaSkillClaude/viking-team` | ۱۹ تست سبز؛ Vercel وصل | اعمال SQL/RLS روی Supabase واقعی، آپلود از آیفون |
| **لیتوس** (داشبورد) | `MegaSkillClaude/lithos` | ۹ تست سبز | تطبیق کوئری Buffer با API واقعی |
| **MEGA SKILLS 3000** | `MegaSkillClaude/psk` | ۵۳ تست، دقت مسیریاب ۱۰۰٪ | secret `ENGINE_TOKEN` در GitHub (CI شاخهٔ اصلی بدون آن قرمز است)، کلید مدل رایگان |
| **بایسون** (برندبوک) | `MegaSkillClaude/bison-brand-book` | ساخت و ۸ تست سبز | تست دسترس‌پذیری |
| **کنسول موبایل** | `MegaSkillClaude/mobile` | ۱۰ تست سبز | تست روی آیفون واقعی |
| **استیکر و قالب وایکینگ** | `MegaSkillClaude/brands`، `brand` | ساختار سالم | بازبینی تصویری |

## فوری‌ها
1. رمزهای اولیهٔ چام قدیمی در کد (`MegaSkillClaude/fjcod/src/core/seed.ts`) و README ریپوی `FJCod` — باید پاک و رمز حساب‌های واقعی عوض شود.
2. secret `ENGINE_TOKEN` در تنظیمات GitHub ریپوی MegaSkillClaude تعریف شود (فقط مالک).
3. Codespaceهای اضافه از github.com/codespaces پاک شوند (سهمیهٔ ماهانه تمام شده بود).
4. انتخاب نسخهٔ نهایی چام: پیشنهاد `POINT/fjcod`.

## کاری که فقط مالک می‌تواند بکند
- ساخت پروژهٔ Supabase و دادن Project URL و anon key (هرگز service_role).
- تنظیم secretها در GitHub/Cloudflare، Archive ریپوها، پاک‌کردن Codespace، تصمیم دربارهٔ پلن Metricool، فرستادن فایل فونت دوران.

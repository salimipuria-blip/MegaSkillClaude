# راهنمای Claude برای این مخزن

## کاربر
- پوریا، تولیدکننده‌ی محتوا. روزانه بیش از ۱۰ عکس لازم دارد؛ سریع، دقیق و بی‌حاشیه کار کن.
- **همیشه فارسی جواب بده.** کوتاه و مستقیم.
- کاربر در ایران است: بسیاری از سرویس‌ها (Canva، Figma، Google) برایش با لینک باز نمی‌شوند.
- **«مگا اسکیل» = پلاگین Claude Code به نام `mega-skills-router@psk`** (کد در `plugins/mega-skills-router/` و `.claude/skills/mega-skills-router/` مخزن MegaSkillClaude). هر وقت کاربر گفت «مگا اسکیل» منظورش همین پلاگین است، نه سایت `psk/` (MEGA SKILLS 3000). هدف کاربر: کامل‌کردن این پلاگین تا با آن هرمس، چام، وایکینگ و بقیهٔ پروژه‌های قراردادی را تحویل دهد.

## قانون اصلی
- چیزی را که تست نکرده‌ای «انجام شد» نگو. قبل از اینکه بگویی کار می‌کند، خودت بررسی کن که خروجی واقعاً به دست کاربر می‌رسد.
- اول خواسته‌ی اصلی کاربر (مثلاً عکس) را انجام بده، بعد کارهای جانبی.

## ساخت عکس (روال تأییدشده توسط کاربر)
**هیچ‌وقت عکس را با کد طراحی نکن** (نه SVG، نه آیکون‌سازی دستی). کد فقط برای دانلود، تحویل و نوشتن متن فارسی روی عکس.
0. **بهبود پرامپت کاربر:** با مهارت `prompt-master` (`library/github-skills/prompt-master/SKILL.md`، بخش Image AI) پرامپت کاربر را حرفه‌ای‌تر کن. **مفهوم نباید ذره‌ای تغییر کند:** هیچ سوژه، عنصر، متن یا حال‌وهوایی اضافه یا حذف نشود؛ فقط وضوح و جزئیات فنی (قاب، نور، سبک، نسبت تصویر، منفی‌ها) اضافه شود. بعد بدون توقف برو مرحله‌ی بعد و پرامپت نهایی را همراه عکس تحویل بده.
1. **انتخاب مهارت:** با مسیریاب مگا (`mega-skills-router`) مهارت مرتبط را پیدا و SKILL.md آن را بخوان.
2. **دستورالعمل:** طبق همان مهارت کانسپت، سبک و پرامپت ساخت‌یافته را بنویس.
3. **ساخت:** اول با Figma (`mcp__Figma__generate_image`، planKey `team::1529441187564361142`)؛ اگر اعتبار تمام شد، هر تصویرساز رایگان دیگری که در دسترس است. فایل را با `curl` از `www.figma.com/api/mcp/asset/...` دانلود کن. **پیش‌شرط:** `www.figma.com` و `s3-figma-hubfile-images-production.figma.com` باید در Allowed domains محیط (سطح Limited، نه Full) باشند؛ تا ۱۴۰۵/۰۷/۱۹ باز نبودند و دانلود با خطای پراکسی رد می‌شد. اگر رد شد، به کاربر بگو و با کد جایگزین نکن.
4. **بررسی و اصلاح:** خودت هر عکس را باز کن؛ ایراد (متن غلط، چهره‌ی ساختگی، دست خراب، کادر نامناسب) را با ساخت دوباره یا اصلاح رفع کن، بعد تحویل بده.
5. **تحویل:** فقط فایل را با `SendUserFile` بفرست. **صفحه‌ی Artifact نساز** (کاربر نمی‌خواهد).
- لینک مستقیم Canva/Figma برای کاربر کار نمی‌کند؛ هرگز فقط لینک نده.
- متن فارسی داخل عکس را مدل خراب می‌نویسد: تصویر را بدون متن بساز و متن را با فونت Vazirmatn (`npm pack vazirmatn`) و Playwright روی آن بگذار.
- چهره‌ی ساختگی و متن انگلیسی روی عکس نگذار مگر کاربر بخواهد.

## ساخت موشن/ویدیو
- مهارت‌ها در `.claude/skills/` نصب‌اند (مجوزها در `.claude/skills/_licenses/`):
  - `remotion-*`: ۱۲ مهارت رسمی Remotion
  - از OpenDesign: `motion-design`، `video-hyperframes`، `gsap-core`، `gsap-timeline`
  - از iart-ai: `short-form-video`، `caption-animation`، `kinetic-typography`، `logo-animation`، `beat-sync-editing`، `ad-creative-video`، `launch-video`، `after-effects` و ۹ مهارت دیگر
  - از anymotion: `motion-graphics`، `motion-audio`، `saas-explainer-motion` و ۳ مهارت دیگر
  - `pixel2motion` (لوگو به SVG و انیمیشن)
  - `after-effects-mcp` (نیازمند After Effects روی کامپیوتر خودت)
- روال: عکس‌های صحنه را طبق روال عکس بالا با Figma بساز (بدون متن). بعد یک HTML با تایم‌لاین قطعی بنویس (`window.seek(t)`) که متن فارسی را با Vazirmatn روی عکس‌ها بگذارد. با Playwright فریم‌به‌فریم بگیر و با `ffmpeg` (`libx264`، `yuv420p`) MP4 بساز. نمونهٔ کامل: `brands/viking-offroad/motion/tour-camp-10s/`.
- Remotion (`npm i remotion @remotion/cli`) در sandbox فقط با `--browser-executable` روی `chrome-headless-shell` از `/opt/pw-browsers/chromium_headless_shell-*` رندر می‌گیرد. `chrome` معمولی خطای «Old Headless mode has been removed» می‌دهد.
- قبل از تحویل، فریم‌های کلیدی را باز کن و بررسی کن. اشکال رایج در صفحهٔ RTL: هر چیزی که از کادر بیرون بزند (`inset` منفی، `translateX`) صفحه را افقی جابه‌جا می‌کند. همه‌چیز را داخل یک `#stage` با `position:fixed; overflow:hidden` بگذار.

## مهارت‌های مارکتینگ
- پلاگین `marketing-skills@marketingskills` (۵۲ مهارت MIT از `coreyhaines31/marketingskills`) در `.claude/settings.json` فعال است و هر جلسه خودکار نصب می‌شود. نام‌ها با پیشوند `marketing-skills:` هستند، مثلاً `marketing-skills:copywriting`، `marketing-skills:social`، `marketing-skills:ad-creative`، `marketing-skills:launch` و `marketing-skills:marketing-plan`.
- برای کار مارکتینگ و محتوا، اول `mega-skills-router` را اجرا کن. اگر یکی از این ۵۲ مهارت دقیق‌تر جواب می‌داد، همان را بخوان.

## برندها
- **viking.offroad** (وایکینگ آفرود): تور آفرود و کمپ؛ مشکی و نارنجی (#F28A1E)، حال‌وهوای سینمایی گرم. پک استیکرها (۳۶۰ تا، تمام‌نارنجی، با سورس): `brands/viking-offroad/stickers/`. کاورهای هایلایت فعلی: عکس‌های لوکیشن با رنگ‌بندی نارنجی گرم و لبه‌ی تیره، سوژه در مرکز برای برش دایره‌ای.
- **MEGA SKILLS 3000**: پوشه‌ی `psk/`، سایت `psk-3000` روی Vercel.
- **Lithos**: پوشه‌ی `lithos/`، داشبورد خصوصی؛ دیتابیس Supabase فقط برای مالک (جدول `lithos_owners`).

## پروژه‌ها و تست
همهٔ پروژه‌ها در همین مخزن‌اند؛ نقشهٔ پوشه‌ها و انتشار در `README.md`، وضعیت و کارهای بعدی در `ROADMAP.md`.

**دستورکار هر پروژه:** هر پوشه یک `CLAUDE.md` دارد (spec یamlی، نقشهٔ کد، قواعد MUST/NEVER، جدول اشکال‌زدایی، صف کار P0–P2، پروتکل به‌روزرسانی) — قبل از کار در آن پوشه بخوان. بعد از هر تغییر: همان `CLAUDE.md` + `PROGRESS.md` (گزارش تاریخ‌دار) + `PROFESSIONAL_GUIDE.md` (ممیزی فنی) و در صورت تغییر وضعیت `docs/PORTFOLIO.md` را به‌روز کن. هرمس بخش spec و صف کار هر `CLAUDE.md` را در دانش مالک می‌خواند.
فهرست: `hermes/` · `plugins/mega-skills-router/` · `psk/` · `lithos/` · `viking-team/` · `bison-brand-book/` · `orchestrator/` · `mobile/` · `fjcod/` (قدیمی؛ جانشین `POINT/fjcod`) · `library/` · `brands/`
- `psk`: `npm run check && npm test`
- `lithos`: `npm test && npm run build`
- `fjcod` (فروشگاه چام): `npm ci && npm run check`
- `bison-brand-book`: `npm ci && npm run build`
- `viking-team`: `python3 -m unittest discover -s tests`
- `orchestrator`: `python scripts/audit/check_repository_contract.py` و pytest (فهرست فایل‌ها در CI)
- مسیریاب مهارت‌ها: `python -m unittest discover -s tests`
- `hermes` (از ریشه): `node --test hermes/worker.test.mjs` و `bash -n hermes/setup.sh`
- CI در `.github/workflows/ci.yml` همه را روی هر PR اجرا می‌کند.

## نوار وضعیت و هوک‌ها
- `.claude/statusline/`: نوار وضعیت یک‌خطی (مدل | درصد کانتکست | آخرین کار ▸ | پیشرفت چک‌لیست | هزینه | پوشه)، بدون مصرف توکن. هوک PostToolUse آخرین ابزار را ثبت می‌کند؛ دستورها هرگز کامل نمایش داده نمی‌شوند. عرض با `ECC_STATUSLINE_MAX_WIDTH` محدود می‌شود.
- **پیشرفت قابل‌دیدن:** برای کارهای ۳ مرحله‌ای به بالا یک چک‌لیست کوتاه (۳ تا ۷ مورد، با TaskCreate/TaskUpdate) نگه دار؛ هر بار فقط یک مورد در حال انجام، و هر مورد به‌محض تمام شدن تیک بخورد. چک‌لیست را در چت تکرار نکن؛ نوار وضعیت پیشرفت (`2/5`) را خودش نشان می‌دهد. برای کارهای تک‌مرحله‌ای لازم نیست.
- `.claude/hooks/session-start.sh`: در جلسه‌های ابری وابستگی‌های `lithos` را نصب می‌کند.

## یادداشت‌های عملیاتی (برای هر جلسهٔ تازه — اول این‌ها را بخوان)
- **مخزن خصوصی است** (از ۱۴۰۵/۰۷/۲۴). دسترسی Claude از GitHub App است و برقرار است؛ فورک‌ها مستقل‌اند.
- **روال PR:** شاخهٔ کاری → PR پیش‌نویس → CI سبز (۸ job در `ci.yml` + `ci-hermes.yml`) → ready → squash merge با `expectedHeadSha`. مخزن ECC قدیمی دیگر روی GitHub نیست؛ پلاگین‌هایش در `plugins/` همین مخزن‌اند.
- **خطای Vercel روی PR** (`api-deployments-free-per-day`) سهمیهٔ روزانهٔ حساب Vercel است، نه کد. هر پروژه در `vercel.json` یک `ignoreCommand` دارد که اگر پوشهٔ خودش از آخرین استقرار تغییر نکرده باشد، ساخت را رد می‌کند (فقط exit 0 یا 1 مجاز است — هر کد دیگری استقرار را «Failed» می‌کند؛ پس اگر `VERCEL_GIT_PREVIOUS_SHA` خالی باشد یا در clone کم‌عمق Vercel نباشد، ساخت انجام می‌شود و فقط وقتی مطمئن است پوشه دست نخورده رد می‌کند).
- **دانش پروژه‌ها در هرمس:** `docs/PORTFOLIO.md` + `PROGRESS.md`/`ROADMAP.md` هر پروژه را هرمس (فقط برای مالک) می‌خواند. بعد از هر تغییر مهم در وضعیت پروژه یا ریپوها، همین فایل‌ها را به‌روز کن تا هرمس هم به‌روز بماند.
- **هرمس روی Cloudflare Workers** است (Workers Builds با هر push به main). `*.workers.dev` از sandbox ابری Claude بسته است مگر در Allowed domains محیط باز شود؛ برای دیدن وضعیت زنده: در تلگرام `/status`، یا workflow «Hermes live health» (نیازمند secretهای `HERMES_URL` و `HEALTH_KEY`).
- **کلیدهای هرمس فقط در Cloudflare Secrets** (هرگز در چت/مخزن): `TELEGRAM_BOT_TOKEN`، `ALLOWED_USER_ID`، `GEMINI_API_KEY` (از ایران با AI Studio ساخته نمی‌شود)، `GITHUB_MODELS_TOKEN`، `GROQ_API_KEY`، `HF_TOKEN`، `MISTRAL_API_KEY`، `CEREBRAS_API_KEY`، `OPENROUTER_API_KEY`، `POLLINATIONS_TOKEN`، `HEALTH_KEY`، و اختیاری `GITHUB_REPO_TOKEN` (fine-grained فقط Read برای Contents/Actions/Pull requests؛ برای `/ci` `/prs` `/file` `/review` هرمس).
- **محیط کدنویسی:** هر Codespace این مخزن با `.devcontainer/` آماده باز می‌شود (Node 22، Python 3.12، Deno، gh، Claude Code CLI + افزونهٔ VS Code). برای دیدن کار Claude مثل همکار: در ترمینال Codespace `claude remote-control` را اجرا کن یا پنل Claude Code در VS Code را باز کن.

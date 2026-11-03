# ممیزی ۱۰۹ ریپوی ستاره‌دار — salimipuria-blip

**تاریخ:** ۲۰۲۶-۱۱-۰۴ · **دامنه:** همهٔ ۱۰۹ مخزن ستاره‌دار حساب GitHub شما
**روش:** ممیزی سه‌سطحی — متادیتای همهٔ ۱۰۹، درخت فایل همهٔ ۱۰۹ از API، و کلون+اسکن محتوای ۲۱ مخزن مهارتی/حساس
**خروجی ماشین‌خوان:** [`docs/audit/starred-repos-2026-11.csv`](audit/starred-repos-2026-11.csv)

---

## ۱) خلاصهٔ اجرایی

| شاخص | مقدار |
|---|---|
| مخزن ستاره‌دار | **۱۰۹** |
| دسته | ۳۰ کتابخانهٔ مهارت · ۲۷ لیست مرجع · ۳۳ محصول/ابزار · ۱۷ هارنس ایجنت · ۲ ابزار امنیتی |
| کل `SKILL.md` در ستاره‌ها | **۳,۳۲۹** |
| اسکن عمیق (کلون + بایت‌اسکن) | **۲۱ مخزن / ۲,۰۰۲ مهارت** (۶۰٪ کل) |
| مهارت با پوشهٔ `scripts/` (سطح اجرا) | ۷۷ مورد در نمونهٔ اسکن‌شده |
| مخزن با CI | ۸۴ از ۱۰۹ |
| مخزن با تست | ۶۷ از ۱۰۹ |
| مخزن بدون فایل مجوز در ریشه | **۱۴** (۱۰ لیست مرجع + ۴ مخزن کد/مهارت) |
| راز واقعی پیدا‌شده | **۰** (۹ الگوی مشابه، همه در fixture تست) |
| هم‌پوشانی با کتابخانهٔ MegaSkillClaude | **۸ مخزن / ۴۴۷ مهارت** وندور شده |

### هفت یافتهٔ اصلی

۱. **ستاره‌های شما عملاً «زنجیرهٔ تأمین» کتابخانهٔ مهارت‌هایتان هستند.** ۸ مخزن از ستاره‌ها قبلاً در `library/github-skills` وندور شده‌اند (۴۴۷ مهارت، ۱۵٪ کتابخانه). بزرگ‌ترین منبع کتابخانه (`sickn33/agentic-awesome-skills` با ۱٬۳۸۹ مهارت) اما **ستاره نشده** است — یعنی ستاره‌ها بازتاب کامل منابع نیستند.
۲. **هیچ pin و هشی برای مهارت‌های ثالث وجود ندارد.** `INDEX.json` فقط `url` با `/tree/HEAD/` دارد، نه commit SHA و نه هش محتوا. نتیجه: از ۴۴۷ مهارت وندورشده، **۳۴۸ بایت‌به‌بایت یکسان** با HEAD فعلی upstream، **۶۷ تغییر کرده** و **۳۱ اصلاً با مسیر فعلی upstream پیدا نمی‌شود** (بازآرایی مسیرها).
۳. **چهار مخزن مهارتی محبوب شما مجوز ندارند** — از جمله `anthropics/skills` (۱۸۷هزار ستاره، فقط `THIRD_PARTY_NOTICES.md`)، `cursor/plugins`، `multica-ai/andrej-karpathy-skills` و `youtube-jono/seo-agent`. وندور کردن محتوایشان = ریسک حقوقی. (هیچ‌کدام در کتابخانهٔ شما نیست — خوب است.)
۴. **۱,۳۲۷ مهارت (۴۰٪) هنوز اسکن محتوایی نشده‌اند.** خودِ ابزار SkillSpector (که ستاره کرده‌اید) در ۳۱٬۱۳۲ مهارت نشان می‌دهد ۲۶.۱٪ آسیب‌پذیری و ۵.۲٪ قصد مخرب محتمل دارند؛ با ۶٬۰۱۷ مهارت، انتظار آماری چند صد finding جدی است.
۵. **اسکن هیوریستیک ۲۱ مخزن، هیچ راز واقعی و هیچ `postinstall` مشکوکی پیدا نکرد**؛ ۹ الگوی راز همه در تست‌ها بودند. دو مستند نصب از `curl | bash` استفاده می‌کنند (Agent-Reach، knowledge-work-plugins) که باید با pin/checksum همراه شود.
۶. **کیفیت ساختاری مهارت‌ها خوب است:** در ۲,۰۰۲ مهارت اسکن‌شده، **۰ frontmatter معیوب** و فقط ۷۷ مهارت دارای `scripts/` (≈۳.۸٪) — یعنی سطح حملهٔ اجرایی کوچک‌تر از حجم کتابخانه است.
۷. **۲۵ مخزن بدون CI و ۴۲ بدون تست‌اند** (بیشترشان لیست مرجع یا مهارت‌های تک‌فایلی‌اند)؛ برای وندور کردن، «بدون تست» به‌تنهایی رد کردن نیست، اما «بدون مجوز» یا «بدون pin» هست.

---

## ۲) روش و پوشش

| سطح | چه کاری | تعداد | محدودیت |
|---|---|---|---|
| **T۱ — متادیتا + درخت** | `GET /repos/{o}/{r}/git/trees/{branch}?recursive=1` برای هر ۱۰۹ مخزن؛ استخراج وجود CI/تست/lockfile/مجوز/SKILL.md/اسکریپت نصب/فایل کلید | ۱۰۹/۱۰۹ (۰ خطا؛ ۱ درخت truncate: `microsoft/TypeScript`) | وجود فایل ≠ سالم بودن محتوا |
| **T۲ — کلون و اسکن محتوا** | `git clone --depth 1` + اسکن بایتی: راز، الگوهای اجرا، frontmatter، scriptهای داخل مهارت، postinstall | ۲۱ مخزن / ۲٬۰۰۲ مهارت | ۱۹ از ۳۰ مخزن مهارتی (+۲ ابزار امنیتی/ایجنت) |
| **T۳ — اصالت‌سنجی (provenance)** | مقایسهٔ هش مهارت‌های وندورشده با HEAD upstream | ۸ مخزن / ۴۴۷ مهارت | head-to-head، نه pin تاریخی |
| **T۴ — اسکن رسمی مهارت** | SkillSpector (۷۱ الگو، AST، SARIF) | **انجام نشد** | نیاز به Python ۳.۱۲+ / Docker که در این محیط نبود |

> همهٔ URLs با توکن خودتان و از `api.github.com` خوانده شد؛ هیچ کلونی در مخزن شما نوشته نشد (همه در `/tmp`).

---

## ۳) یافته‌های تفصیلی

### ۳.۱ مجوز: ۱۴ مخزن بدون فایل مجوز در ریشه
- ۱۰ مورد لیست مرجع‌اند (`awesome-*`، `HelloGitHub`، …) → برای «خواندن» مشکلی نیست، برای «کپی محتوا» مشکل‌دار.
- ۴ مورد کد/مهارت: `anthropics/skills`، `cursor/plugins`، `multica-ai/andrej-karpathy-skills`، `youtube-jono/seo-agent`.
- ۳ مورد **copyleft**: `immich-app/immich` و `macro-inc/macro` (AGPL-3.0) و `lightpanda-io/browser` (AGPL-3.0). استفادهٔ داخلی/سرویس‌دهی نیاز به بررسی حقوقی دارد؛ وندور در یک محصول بسته توصیه نمی‌شود.
- ۱۱ مورد `NOASSERTION` (مجوز فایل دارد ولی GitHub نشناخته): باید متن مجوز دستی خوانده شود.

### ۳.۲ اصالت‌سنجی مهارت‌های وندورشده

| مخزن upstream | وندور شده | یکسان با HEAD | متفاوت | مسیر پیدا نشد | مهارت در upstream |
|---|---:|---:|---:|---:|---:|
| `affaan-m/ECC` | ۲۷۹ | ۲۵۴ | ۲۵ | ۰ | ۱,۰۶۸ |
| `wshobson/agents` | ۹۸ | ۸۲ | ۱۶ | ۰ | ۱۸۵ |
| `mattpocock/skills` | ۳۱ | ۰ | ۰ | ۳۱ | ۲۰ |
| `addyosmani/agent-skills` | ۲۳ | ۵ | ۱۸ | ۰ | ۲۵ |
| `obra/superpowers` | ۱۳ | ۷ | ۶ | ۰ | ۱۵ |
| `cathrynlavery/diagram-design` | ۱ | ۰ | ۱ | ۰ | ۱ |
| `DietrichGebert/ponytail` | ۱ | ۰ | ۱ | ۰ | ۱۲ |
| `tt-a1i/archify` | ۱ | — | — | — | ۵ |
| **جمع** | **۴۴۷** | **۳۴۸** | **۶۷** | **۳۱** | — |

**تفسیر:** ۲۲٪ مهارت‌های وندورشده از HEAD فعلی upstream قدیمی‌ترند. `mattpocock/skills` کاملاً بازآرایی شده (۳۱ مهارت با آن نام‌ها در upstream نیست) و `addyosmani` بیشترین drift نسبی را دارد (۱۸ از ۲۳).

**اقدام:** در `INDEX.json` برای هر مهارت `upstream_commit` + `content_sha256` ثبت شود و `scripts/sync_skill_library.py --check` علاوه بر کپی داخلی، drift با upstream را هم گزارش کند (در حالت `--deep`). تا آن زمان، بازتولید وندور **قابل اثبات نیست**.

### ۳.۳ سطح اجرا و اسکریپت
- ۷۷ مهارت از ۲٬۰۰۲ مهارت اسکن‌شده پوشهٔ `scripts/` دارند — این‌ها تنها جایی هستند که «متن» به «اجرا» تبدیل می‌شود.
- در ۲۱ مخزن، **۰** `postinstall`/`preinstall` مشکوک پیدا شد (کلون‌ها شامل `package.json`های متعدد بودند).
- ۲ مستند نصب `curl … | bash` دارند (نه اسکریپت خودکار): `Panniantong/Agent-Reach` و `anthropics/knowledge-work-plugins`.
- الگوهای متنی «ignore previous instructions»/«exfiltration» در ECC و SkillSpector عمدتاً **محتوای دفاعی** (راهنمای امنیت) بودند، نه حمله — درس مهم: اسکن regex بدون context، false positive زیاد می‌دهد و باید با SkillSpector/AST جایگزین شود.

### ۳.۴ ارزش وندور (کدام ستاره‌ها برای این مخزن طلا هستند)
| مخزن | مجوز | مهارت | چرا ارزش دارد | تصمیم |
|---|---|---:|---|---|
| `affaan-m/ECC` | MIT | ۱,۰۶۸ (۲۷۹ وندور) | بزرگ‌ترین منبع هم‌راستا؛ ۷۸۹ مهارت وندورنشده | اسکن + pin، سپس گسترش تدریجی |
| `anthropics/knowledge-work-plugins` | Apache-2.0 | ۲۵۲ | کار دانشی/اداری، مکمل کتابخانه | اسکن + وندور با pin |
| `anthropics/financial-services` | Apache-2.0 | ۱۱۲ | تحلیل مالی/کسب‌وکار | اسکن + وندور انتخابی |
| `wshobson/agents` | MIT | ۱۸۵ (۹۸ وندور) | پلاگین‌مارکت‌پلیس بالغ | به‌روزرسانی ۱۶ مهارت drift |
| `coreyhaines31/marketingskills` | MIT | ۵۳ | بازاریابی/کپی/CRO — مستقیم مرتبط با کار شما | اسکن + وندور |
| `expo/skills` | MIT | ۲۵ | اپ موبایل | فقط در صورت نیاز |
| `blader/humanizer` | MIT | ۱ | حذف ردپای متن AI (محتوا) | وندور تک‌مهارت |
| `Jakeschincariol/instagram-agent-skill` | MIT | ۱۳ | اینستاگرام — مرتبط با برند | قبلاً ستاره شده، کیفیت متوسط |
| `anthropics/skills` | **بدون مجوز** | ۲۰ | مرجع رسمی مهارت‌ها | **وندور نکن**؛ فقط الگوگیری |
| `cursor/plugins` | **بدون مجوز** | ۱۷۳ | پلاگین‌های Cursor | **وندور نکن** |

---

## ۴) جدول کامل ۱۰۹ مخزن

<details>
<summary>برای دیدن جدول باز کنید (۱۰۹ ردیف)</summary>

| # | مخزن | دسته | ★ | مجوز | SKILL.md | بررسی | وندور | پرچم‌ها |
|---:|---|---|---:|---|---:|---|---:|---|
| ۱ | [`obra/superpowers`](https://github.com/obra/superpowers) | مهارت | ۳۱۱k | MIT | ۱۵ | عمیق | ۱۳ | CI− |
| ۲ | [`mattpocock/skills`](https://github.com/mattpocock/skills) | مهارت | ۳۱۱k | MIT | ۳۹ | سطحی | ۳۱ | تست− |
| ۳ | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | مهارت | ۲۹۶k | MIT | ۱۰۶۸ | عمیق | ۲۷۹ | الگوی راز* |
| ۴ | [`multica-ai/andrej-karpathy-skills`](https://github.com/multica-ai/andrej-karpathy-skills) | مهارت | ۲۲۹k | — | ۱ | عمیق |  | مجوز ندارد، CI−، تست− |
| ۵ | [`anthropics/skills`](https://github.com/anthropics/skills) | مهارت | ۱۸۷k | — | ۲۰ | عمیق |  | مجوز ندارد، CI− |
| ۶ | [`DietrichGebert/ponytail`](https://github.com/DietrichGebert/ponytail) | مهارت | ۱۸۳k | MIT | ۱۲ | عمیق | ۱ |  |
| ۷ | [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | مهارت | ۱۴۴k | MIT | ۱۳ | عمیق |  |  |
| ۸ | [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) | مهارت | ۱۱۳k | MIT | ۲۵ | عمیق | ۲۳ |  |
| ۹ | [`thedotmack/claude-mem`](https://github.com/thedotmack/claude-mem) | مهارت | ۱۱۱k | Apache-2.0 | ۴۴ | سطحی |  |  |
| ۱۰ | [`nexu-io/open-design`](https://github.com/nexu-io/open-design) | مهارت | ۱۰۵k | Apache-2.0 | ۵۶۲ | سطحی |  |  |
| ۱۱ | [`ruvnet/RuView`](https://github.com/ruvnet/RuView) | مهارت | ۱۰۲k | MIT | ۵۴ | سطحی |  |  |
| ۱۲ | [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) | مهارت | ۱۰۱k | Apache-2.0 | ۲۶ | سطحی |  |  |
| ۱۳ | [`tt-a1i/archify`](https://github.com/tt-a1i/archify) | مهارت | ۹۳k | Apache-2.0 | ۵ | سطحی | ۱ |  |
| ۱۴ | [`bytedance/deer-flow`](https://github.com/bytedance/deer-flow) | مهارت | ۸۴k | MIT | ۳۳ | سطحی |  |  |
| ۱۵ | [`mvanhorn/last30days-skill`](https://github.com/mvanhorn/last30days-skill) | مهارت | ۶۶k | MIT | ۱ | عمیق |  |  |
| ۱۶ | [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) | مهارت | ۶۴k | MIT | ۱ | عمیق | ۱ | تست− |
| ۱۷ | [`blader/humanizer`](https://github.com/blader/humanizer) | مهارت | ۶۴k | MIT | ۱ | عمیق |  | تست− |
| ۱۸ | [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills) | مهارت | ۵۸k | MIT | ۵۳ | عمیق |  |  |
| ۱۹ | [`wshobson/agents`](https://github.com/wshobson/agents) | مهارت | ۴۲k | MIT | ۱۸۵ | عمیق | ۹۸ |  |
| ۲۰ | [`anthropics/financial-services`](https://github.com/anthropics/financial-services) | مهارت | ۴۱k | Apache-2.0 | ۱۱۲ | عمیق |  | تست− |
| ۲۱ | [`anthropics/knowledge-work-plugins`](https://github.com/anthropics/knowledge-work-plugins) | مهارت | ۳۴k | Apache-2.0 | ۲۵۲ | عمیق |  | تست−، curl \| bash |
| ۲۲ | [`mksglu/context-mode`](https://github.com/mksglu/context-mode) | مهارت | ۳۳k | NOASSERTION | ۱۱ | سطحی |  | SPDX نامشخص |
| ۲۳ | [`cursor/plugins`](https://github.com/cursor/plugins) | مهارت | ۱۵k | — | ۱۷۳ | عمیق |  | مجوز ندارد |
| ۲۴ | [`humanlayer/skills`](https://github.com/humanlayer/skills) | مهارت | ۵k | MIT | ۷ | سطحی |  | CI−، تست− |
| ۲۵ | [`Jakeschincariol/instagram-agent-skill`](https://github.com/Jakeschincariol/instagram-agent-skill) | مهارت | ۴k | MIT | ۱۳ | عمیق |  | CI−، تست− |
| ۲۶ | [`expo/skills`](https://github.com/expo/skills) | مهارت | ۴k | MIT | ۲۵ | سطحی |  |  |
| ۲۷ | [`Dimillian/Skills`](https://github.com/Dimillian/Skills) | مهارت | ۴k | MIT | ۱۶ | عمیق |  | CI−، تست− |
| ۲۸ | [`rebelytics/one-skill-to-rule-them-all`](https://github.com/rebelytics/one-skill-to-rule-them-all) | مهارت | ۳k | CC-BY-4.0 | ۱ | عمیق |  |  |
| ۲۹ | [`chaseai-yt/claudex-loop`](https://github.com/chaseai-yt/claudex-loop) | مهارت | ۳k | NOASSERTION | ۶ | عمیق |  | SPDX نامشخص |
| ۳۰ | [`jgravelle/jcodemunch-mcp`](https://github.com/jgravelle/jcodemunch-mcp) | مهارت | ۲k | NOASSERTION | ۱۱ | سطحی |  | SPDX نامشخص |
| ۳۱ | [`NVIDIA/SkillSpector`](https://github.com/NVIDIA/SkillSpector) | امنیتی | ۲۴k | Apache-2.0 | ۳۳ | عمیق |  | الگوی راز* |
| ۳۲ | [`NVIDIA/OpenShell`](https://github.com/NVIDIA/OpenShell) | امنیتی | ۲۱k | Apache-2.0 | ۲۹ | سطحی |  |  |
| ۳۳ | [`morluto/rea`](https://github.com/morluto/rea) | ایجنت | ۴۲۶k | MIT | ۵ | سطحی |  |  |
| ۳۴ | [`msitarzewski/agency-agents`](https://github.com/msitarzewski/agency-agents) | ایجنت | ۱۶۶k | MIT |  | سطحی |  | تست− |
| ۳۵ | [`langchain-ai/langchain`](https://github.com/langchain-ai/langchain) | ایجنت | ۱۴۸k | MIT |  | سطحی |  |  |
| ۳۶ | [`paperclipai/paperclip`](https://github.com/paperclipai/paperclip) | ایجنت | ۱۱۰k | MIT | ۸۳ | سطحی |  |  |
| ۳۷ | [`Panniantong/Agent-Reach`](https://github.com/Panniantong/Agent-Reach) | ایجنت | ۱۰۸k | MIT | ۱ | عمیق |  | curl \| bash |
| ۳۸ | [`ChatGPTNextWeb/NextChat`](https://github.com/ChatGPTNextWeb/NextChat) | ایجنت | ۸۸k | MIT |  | سطحی |  |  |
| ۳۹ | [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) | ایجنت | ۷۸k | Apache-2.0 | ۲۸ | سطحی |  |  |
| ۴۰ | [`vectorize-io/hindsight`](https://github.com/vectorize-io/hindsight) | ایجنت | ۵۸k | MIT | ۲۰ | سطحی |  |  |
| ۴۱ | [`alibaba/open-code-review`](https://github.com/alibaba/open-code-review) | ایجنت | ۴۹k | Apache-2.0 | ۴ | سطحی |  |  |
| ۴۲ | [`THU-MAIC/OpenMAIC`](https://github.com/THU-MAIC/OpenMAIC) | ایجنت | ۴۲k | MIT | ۲۶ | سطحی |  |  |
| ۴۳ | [`Tencent/WeKnora`](https://github.com/Tencent/WeKnora) | ایجنت | ۳۶k | NOASSERTION | ۴ | سطحی |  | SPDX نامشخص |
| ۴۴ | [`1jehuang/jcode`](https://github.com/1jehuang/jcode) | ایجنت | ۲۱k | MIT | ۱ | سطحی |  |  |
| ۴۵ | [`TencentCloud/Octop`](https://github.com/TencentCloud/Octop) | ایجنت | ۱۱k | MIT | ۶۳ | سطحی |  |  |
| ۴۶ | [`CopilotKit/OpenBot`](https://github.com/CopilotKit/OpenBot) | ایجنت | ۱۰k | MIT | ۳ | سطحی |  |  |
| ۴۷ | [`macro-inc/macro`](https://github.com/macro-inc/macro) | ایجنت | ۶k | AGPL-3.0 | ۲۹ | سطحی |  | copyleft |
| ۴۸ | [`agent-substrate/substrate`](https://github.com/agent-substrate/substrate) | ایجنت | ۶k | Apache-2.0 | ۶ | سطحی |  |  |
| ۴۹ | [`youtube-jono/seo-agent`](https://github.com/youtube-jono/seo-agent) | ایجنت | ۰k | — |  | سطحی |  | مجوز ندارد، CI−، تست− |
| ۵۰ | [`trimstray/the-book-of-secret-knowledge`](https://github.com/trimstray/the-book-of-secret-knowledge) | محصول/ابزار | ۲۵۵k | MIT |  | سطحی |  | CI−، تست−، کهنه |
| ۵۱ | [`n8n-io/n8n`](https://github.com/n8n-io/n8n) | محصول/ابزار | ۲۰۹k | NOASSERTION | ۴۱ | سطحی |  | SPDX نامشخص |
| ۵۲ | [`microsoft/vscode`](https://github.com/microsoft/vscode) | محصول/ابزار | ۱۹۴k | MIT | ۷۹ | سطحی |  |  |
| ۵۳ | [`521xueweihan/HelloGitHub`](https://github.com/521xueweihan/HelloGitHub) | محصول/ابزار | ۱۸۶k | — |  | سطحی |  | مجوز ندارد، CI−، تست− |
| ۵۴ | [`f/prompts.chat`](https://github.com/f/prompts.chat) | محصول/ابزار | ۱۷۵k | NOASSERTION | ۴ | سطحی |  | SPDX نامشخص |
| ۵۵ | [`microsoft/generative-ai-for-beginners`](https://github.com/microsoft/generative-ai-for-beginners) | محصول/ابزار | ۱۲۲k | MIT | ۱ | سطحی |  |  |
| ۵۶ | [`immich-app/immich`](https://github.com/immich-app/immich) | محصول/ابزار | ۱۱۸k | AGPL-3.0 |  | سطحی |  | copyleft |
| ۵۷ | [`microsoft/TypeScript`](https://github.com/microsoft/TypeScript) | محصول/ابزار | ۱۱۱k | Apache-2.0 | ۴ | سطحی |  | tree ناقص |
| ۵۸ | [`denoland/deno`](https://github.com/denoland/deno) | محصول/ابزار | ۱۰۸k | MIT | ۶ | سطحی |  |  |
| ۵۹ | [`angular/angular`](https://github.com/angular/angular) | محصول/ابزار | ۱۰۱k | MIT | ۷ | سطحی |  |  |
| ۶۰ | [`ant-design/ant-design`](https://github.com/ant-design/ant-design) | محصول/ابزار | ۱۰۰k | MIT | ۹ | سطحی |  |  |
| ۶۱ | [`OpenCut-app/OpenCut`](https://github.com/OpenCut-app/OpenCut) | محصول/ابزار | ۹۷k | MIT |  | سطحی |  | تست− |
| ۶۲ | [`storybookjs/storybook`](https://github.com/storybookjs/storybook) | محصول/ابزار | ۹۱k | MIT | ۲۴ | سطحی |  |  |
| ۶۳ | [`mermaid-js/mermaid`](https://github.com/mermaid-js/mermaid) | محصول/ابزار | ۹۰k | MIT |  | سطحی |  |  |
| ۶۴ | [`jingyaogong/minimind`](https://github.com/jingyaogong/minimind) | محصول/ابزار | ۶۴k | Apache-2.0 |  | سطحی |  | CI−، تست− |
| ۶۵ | [`bilawalsidhu/gods-eye-view`](https://github.com/bilawalsidhu/gods-eye-view) | محصول/ابزار | ۶۲k | NOASSERTION | ۱ | سطحی |  | SPDX نامشخص |
| ۶۶ | [`HKUDS/DeepTutor`](https://github.com/HKUDS/DeepTutor) | محصول/ابزار | ۵۴k | Apache-2.0 | ۸ | سطحی |  |  |
| ۶۷ | [`dkhamsing/open-source-ios-apps`](https://github.com/dkhamsing/open-source-ios-apps) | محصول/ابزار | ۵۲k | CC0-1.0 |  | سطحی |  | تست− |
| ۶۸ | [`dypsilon/frontend-dev-bookmarks`](https://github.com/dypsilon/frontend-dev-bookmarks) | محصول/ابزار | ۴۷k | — |  | سطحی |  | مجوز ندارد، CI−، تست−، کهنه |
| ۶۹ | [`tashfeenahmed/freellmapi`](https://github.com/tashfeenahmed/freellmapi) | محصول/ابزار | ۴۶k | MIT |  | سطحی |  |  |
| ۷۰ | [`DataExpert-io/data-engineer-handbook`](https://github.com/DataExpert-io/data-engineer-handbook) | محصول/ابزار | ۴۴k | — |  | سطحی |  | مجوز ندارد، CI− |
| ۷۱ | [`pingdotgg/t3code`](https://github.com/pingdotgg/t3code) | محصول/ابزار | ۴۴k | MIT | ۱۵ | سطحی |  |  |
| ۷۲ | [`psf/black`](https://github.com/psf/black) | محصول/ابزار | ۴۲k | MIT |  | سطحی |  |  |
| ۷۳ | [`lightpanda-io/browser`](https://github.com/lightpanda-io/browser) | محصول/ابزار | ۴۱k | AGPL-3.0 |  | سطحی |  | copyleft |
| ۷۴ | [`Twigpine/openclaude`](https://github.com/Twigpine/openclaude) | محصول/ابزار | ۳۴k | NOASSERTION |  | سطحی |  | SPDX نامشخص |
| ۷۵ | [`standard/standard`](https://github.com/standard/standard) | محصول/ابزار | ۲۹k | MIT |  | سطحی |  | کهنه |
| ۷۶ | [`eslint/eslint`](https://github.com/eslint/eslint) | محصول/ابزار | ۲۷k | MIT |  | سطحی |  |  |
| ۷۷ | [`Renhuai123/ziwei-doushu`](https://github.com/Renhuai123/ziwei-doushu) | محصول/ابزار | ۱۴k | MIT |  | سطحی |  |  |
| ۷۸ | [`HumanAIGC/AnimateAnyone`](https://github.com/HumanAIGC/AnimateAnyone) | محصول/ابزار | ۱۴k | Apache-2.0 |  | سطحی |  | CI−، تست−، کهنه |
| ۷۹ | [`milind-soni/OpenMausBot`](https://github.com/milind-soni/OpenMausBot) | محصول/ابزار | ۱۱k | Apache-2.0 | ۶ | سطحی |  |  |
| ۸۰ | [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) | محصول/ابزار | ۹k | MIT |  | سطحی |  |  |
| ۸۱ | [`0xzr/freellmpool`](https://github.com/0xzr/freellmpool) | محصول/ابزار | ۰k | MIT |  | سطحی |  |  |
| ۸۲ | [`AnganSamadder/openkilo`](https://github.com/AnganSamadder/openkilo) | محصول/ابزار | ۰k | MIT |  | سطحی |  | تست− |
| ۸۳ | [`sindresorhus/awesome`](https://github.com/sindresorhus/awesome) | لیست | ۵۳۰k | CC0-1.0 |  | سطحی |  |  |
| ۸۴ | [`awesome-selfhosted/awesome-selfhosted`](https://github.com/awesome-selfhosted/awesome-selfhosted) | لیست | ۳۳۳k | NOASSERTION |  | سطحی |  | SPDX نامشخص، CI− |
| ۸۵ | [`vinta/awesome-python`](https://github.com/vinta/awesome-python) | لیست | ۳۳۲k | NOASSERTION | ۴ | سطحی |  | SPDX نامشخص |
| ۸۶ | [`avelino/awesome-go`](https://github.com/avelino/awesome-go) | لیست | ۱۹۱k | MIT |  | سطحی |  |  |
| ۸۷ | [`Hack-with-Github/Awesome-Hacking`](https://github.com/Hack-with-Github/Awesome-Hacking) | لیست | ۱۲۴k | CC0-1.0 |  | سطحی |  |  |
| ۸۸ | [`MunGell/awesome-for-beginners`](https://github.com/MunGell/awesome-for-beginners) | لیست | ۹۱k | — |  | سطحی |  | مجوز ندارد |
| ۸۹ | [`DopplerHQ/awesome-interview-questions`](https://github.com/DopplerHQ/awesome-interview-questions) | لیست | ۸۵k | — |  | سطحی |  | مجوز ندارد، بایگانی، کهنه |
| ۹۰ | [`binhnguyennus/awesome-scalability`](https://github.com/binhnguyennus/awesome-scalability) | لیست | ۷۵k | MIT |  | سطحی |  | CI− |
| ۹۱ | [`enaqx/awesome-react`](https://github.com/enaqx/awesome-react) | لیست | ۷۵k | — |  | سطحی |  | مجوز ندارد، CI− |
| ۹۲ | [`prakhar1989/awesome-courses`](https://github.com/prakhar1989/awesome-courses) | لیست | ۷۲k | — |  | سطحی |  | مجوز ندارد، CI−، کهنه |
| ۹۳ | [`sindresorhus/awesome-nodejs`](https://github.com/sindresorhus/awesome-nodejs) | لیست | ۶۷k | CC0-1.0 |  | سطحی |  | CI− |
| ۹۴ | [`Solido/awesome-flutter`](https://github.com/Solido/awesome-flutter) | لیست | ۶۱k | — |  | سطحی |  | مجوز ندارد، CI− |
| ۹۵ | [`rust-unofficial/awesome-rust`](https://github.com/rust-unofficial/awesome-rust) | لیست | ۶۰k | CC0-1.0 |  | سطحی |  |  |
| ۹۶ | [`tiimgreen/github-cheat-sheet`](https://github.com/tiimgreen/github-cheat-sheet) | لیست | ۶۰k | MIT |  | سطحی |  | CI−، کهنه |
| ۹۷ | [`wasabeef/awesome-android-ui`](https://github.com/wasabeef/awesome-android-ui) | لیست | ۵۸k | MIT |  | سطحی |  | CI− |
| ۹۸ | [`hesreallyhim/awesome-claude-code`](https://github.com/hesreallyhim/awesome-claude-code) | لیست | ۵۷k | NOASSERTION |  | سطحی |  | SPDX نامشخص |
| ۹۹ | [`vsouza/awesome-ios`](https://github.com/vsouza/awesome-ios) | لیست | ۵۳k | MIT |  | سطحی |  |  |
| ۱۰۰ | [`VoltAgent/awesome-openclaw-skills`](https://github.com/VoltAgent/awesome-openclaw-skills) | لیست | ۵۳k | MIT |  | سطحی |  |  |
| ۱۰۱ | [`lukasz-madon/awesome-remote-job`](https://github.com/lukasz-madon/awesome-remote-job) | لیست | ۵۰k | — |  | سطحی |  | مجوز ندارد |
| ۱۰۲ | [`DovAmir/awesome-design-patterns`](https://github.com/DovAmir/awesome-design-patterns) | لیست | ۴۹k | — |  | سطحی |  | مجوز ندارد، CI−، کهنه |
| ۱۰۳ | [`akullpp/awesome-java`](https://github.com/akullpp/awesome-java) | لیست | ۴۹k | CC-BY-SA-4.0 |  | سطحی |  | share-alike |
| ۱۰۴ | [`brillout/awesome-react-components`](https://github.com/brillout/awesome-react-components) | لیست | ۴۸k | CC0-1.0 |  | سطحی |  |  |
| ۱۰۵ | [`docker/awesome-compose`](https://github.com/docker/awesome-compose) | لیست | ۴۶k | CC0-1.0 |  | سطحی |  |  |
| ۱۰۶ | [`ashishps1/awesome-system-design-resources`](https://github.com/ashishps1/awesome-system-design-resources) | لیست | ۴۳k | GPL-3.0 |  | سطحی |  | copyleft، CI− |
| ۱۰۷ | [`goabstract/Awesome-Design-Tools`](https://github.com/goabstract/Awesome-Design-Tools) | لیست | ۴۱k | MIT |  | سطحی |  | CI−، کهنه |
| ۱۰۸ | [`PatrickJS/awesome-cursorrules`](https://github.com/PatrickJS/awesome-cursorrules) | لیست | ۴۱k | CC0-1.0 |  | سطحی |  |  |
| ۱۰۹ | [`open-free-llm-api/awesome-freellm-apis`](https://github.com/open-free-llm-api/awesome-freellm-apis) | لیست | ۵k | MIT |  | سطحی |  | CI− |

</details>

\* «الگوی راز» یعنی regex راز پیدا شد؛ در بررسی دستی همه در فایل‌های تست/fixture بودند و راز واقعی نبودند.

---

## ۵) ۲۱ مخزن اسکن عمیق

| مخزن | مجوز | SKILL.md | مهارت با scripts/ | frontmatter معیوب | تست/CI | اقدام |
|---|---|---:|---:|---:|---|---|
| `affaan-m/ECC` | MIT | ۱۰۶۸ | ۲۰ | ۰ | ✅ | بررسی دستی + pin |
| `anthropics/knowledge-work-plugins` | Apache-2.0 | ۲۵۲ | ۵ | ۰ | CI | بررسی دستی + pin |
| `wshobson/agents` | MIT | ۱۸۵ | ۳ | ۰ | ✅ | وندور با commit pin |
| `cursor/plugins` | — | ۱۷۳ | ۷ | ۰ | ✅ | وندور نکن |
| `anthropics/financial-services` | Apache-2.0 | ۱۱۲ | ۶ | ۰ | CI | بررسی دستی + pin |
| `coreyhaines31/marketingskills` | MIT | ۵۳ | ۲ | ۰ | ✅ | وندور با commit pin |
| `NVIDIA/SkillSpector` | Apache-2.0 | ۳۳ | ۶ | ۰ | ✅ | بررسی دستی + pin |
| `addyosmani/agent-skills` | MIT | ۲۵ | ۲ | ۰ | ✅ | وندور با commit pin |
| `anthropics/skills` | — | ۲۰ | ۸ | ۰ | — | وندور نکن |
| `Dimillian/Skills` | MIT | ۱۶ | ۱ | ۰ | — | بررسی دستی + pin |
| `obra/superpowers` | MIT | ۱۵ | ۳ | ۰ | — | بررسی دستی + pin |
| `nextlevelbuilder/ui-ux-pro-max-skill` | MIT | ۱۳ | ۹ | ۰ | ✅ | وندور با commit pin |
| `Jakeschincariol/instagram-agent-skill` | MIT | ۱۳ | ۰ | ۰ | — | بررسی دستی + pin |
| `DietrichGebert/ponytail` | MIT | ۱۲ | ۰ | ۰ | ✅ | وندور با commit pin |
| `chaseai-yt/claudex-loop` | NOASSERTION | ۶ | ۱ | ۰ | ✅ | وندور با commit pin |
| `multica-ai/andrej-karpathy-skills` | — | ۱ | ۰ | ۰ | — | وندور نکن |
| `mvanhorn/last30days-skill` | MIT | ۱ | ۱ | ۰ | ✅ | وندور با commit pin |
| `cathrynlavery/diagram-design` | MIT | ۱ | ۱ | ۰ | CI | بررسی دستی + pin |
| `blader/humanizer` | MIT | ۱ | ۱ | ۰ | CI | بررسی دستی + pin |
| `rebelytics/one-skill-to-rule-them-all` | CC-BY-4.0 | ۱ | ۱ | ۰ | ✅ | وندور با commit pin |
| `Panniantong/Agent-Reach` | MIT | ۱ | ۰ | ۰ | ✅ | وندور با commit pin |

---

## ۶) اولویت اقدام

### P۰ — همین هفته
۱. **SkillSpector روی `library/github-skills` و `plugins/…/references/skills`** با `--no-llm --format sarif`؛ baseline بسازید و در CI گیت کنید. (دستور در `docs/AUDIT_TOOLKIT_2026-11.md`)
۲. **pin کردن منبع مهارت‌ها:** افزودن `upstream_commit` و `content_sha256` به `INDEX.json` و گزارش drift؛ شروع با ۸ ریپوی ستاره‌دار.
۳. **قانون وندور:** «بدون فایل مجوز در ریشه → هیچ مهارتی وندور نمی‌شود.» (روی `anthropics/skills` و `cursor/plugins` اعمال شود.)
۴. **تعیین تکلیف ۳۱ مهارت `mattpocock`** که مسیر upstreamشان گم شده — یا بازنویسی مسیر، یا حذف از کتابخانه.

### P۱ — این ماه
۵. به‌روزرسانی ۶۷ مهارت drift (ECC ۲۵، addyosmani ۱۸، wshobson ۱۶، superpowers ۶، ponytail ۱، diagram ۱) با diff و بازبینی چشمی، نه کپی کورکورانه.
۶. اسکن بقیهٔ ۹ مخزن مهارتی که کلون نشدند (`morluto/rea`, `hex`-style بزرگ‌ها) — با اولویت آن‌هایی که مهارت‌شان قابل وندور است.
۷. حذف/جایگزینی `SnailSploit/Claude-Red` از کتابخانه (۳۴ مهارت آفسنسیو) اگر استفادهٔ تجاری/تیمی دارید؛ حداقل `incomplete` و خارج از مسیریابی پیش‌فرض نگه دارید.
۸. اضافه کردن ۲–۳ منبع ارزشمند (knowledge-work-plugins، marketingskills، financial-services) پس از اسکن.

### P۲ — بلندمدت
۹. جایگزینی Dependabot با Renovate گروهی برای ۲۵ PR باز.
۱۰. OSSF Scorecard + Rulesets برای اجبار بازبینی CODEOWNERS.
۱۱. ممیزی دوره‌ای ماهانه: اسکریپت `scripts/audit/starred_repos.py` (می‌تواند از همین روش T۱/T۳ استفاده کند) + گزارش در `docs/audit/`.

---

## ۷) اجرای SkillSpector (روش رسمی)

```bash
# Python 3.12+ یا Docker
uv tool install "skillspector @ git+https://github.com/NVIDIA/SkillSpector.git"
skillspector scan library/github-skills --no-llm --format sarif --output docs/audit/skills.sarif
skillspector scan plugins/mega-skills-router/skills/mega-skills-router/references/skills \
  --no-llm --format markdown --output docs/audit/skills.md
```
- `--no-llm`: تحلیل ایستا (بدون ارسال کد به مدل، مناسب داده‌های شخص ثالث)
- با LLM: تشخیص معنایی بهتر، اما محتوای مهارت‌ها به provider می‌رود.
- خروجی SARIF را در GitHub Code Scanning آپلود کنید تا finding‌ها در PR دیده شوند.

---

## ۸) محدودیت‌ها
- اسکن عمیق فقط ۱۹ از ۳۰ مخزن مهارتی (+۲ ابزار امنیتی/ایجنت) را پوشش داد (۲٬۰۰۲ از ۳٬۳۲۹ مهارت)؛ باقی فقط سطح درخت.
- «الگوی راز» هیوریستیک است؛ false positive و false negative دارد. مرجع نهایی: gitleaks/TruffleHog + SkillSpector.
- مجوز از متادیتای GitHub و وجود فایل ریشه استنتاج شده؛ متن مجوز به‌صورت حقوقی بازبینی نشده.
- هیچ‌کدام از مخازن اجرا/نصب نشدند (به‌جز کلون خواندنی و اسکن فایل)؛ رفتار runtime ارزیابی نشده.
- رتبه/ستاره‌ها در تاریخ ۲۰۲۶-۱۱-۰۴ خوانده شده‌اند.

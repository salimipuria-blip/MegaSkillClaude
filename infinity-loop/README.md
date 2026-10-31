# infinity-loop

**DeepSeekِ لوکالِ خودت را به‌عنوان بازبینِ مستقلِ پلن و بازرسِ کد اجرا کن.** هم‌خانوادهٔ ایدهٔ [`claudex-loop`](https://github.com/chaseai-yt/claudex-loop) است، با یک قاعدهٔ سخت: **هرکس چیزی را ساخت، خودش نمره‌اش را نمی‌دهد.** تو (یا Claude) پلن و کد را می‌نویسی؛ DeepSeek مستقل نمره می‌دهد. بدون نیاز به OpenAI/Codex، بدون حساب بیرونی، مناسب ایران.

> چرا این، و نه Codex؟ `claudex-loop` به دو CLIِ `codex` و `claude` و حساب‌های authenticated نیاز دارد. این‌جا بازبین، **DeepSeekِ روی سیستم خودت** است (Ollama یا LM Studio)؛ فقط یک endpoint سازگار با OpenAI لازم است.

## پیش‌نیاز
- Node ≥ 20 (بدون هیچ وابستگیِ اجرا؛ `npm install` لازم نیست).
- DeepSeek که به‌صورت محلی سرو شود و endpoint سازگار با OpenAI بدهد:
  - **Ollama** — `ollama run deepseek-r1` ⇒ `http://localhost:11434/v1`
  - **LM Studio** — مدل را load کن و سرور را روشن کن ⇒ `http://localhost:1234/v1`

## نصب (روی سیستم خودت، در VSCode)
```bash
git clone https://github.com/salimipuria-blip/MegaSkillClaude.git
cd MegaSkillClaude/infinity-loop
node bin/infinity-loop.mjs doctor
```
یا کل پوشهٔ `infinity-loop/` را در VSCode باز کن و در ترمینالِ داخلی همان دستورها را بزن. اختیاری: `npm link` تا `infinity-loop` سراسری شود.

## استفاده
```bash
# ۱) تشخیص endpoint و مدلِ DeepSeek
infinity-loop doctor

# ۲) سخت‌کردن یک پلن (خروجی: APPROVED / REVISE / BLOCKED؛ exit 0 فقط با APPROVED)
infinity-loop review --plan PLAN.md

# ۳) بازرسیِ دیفِ ساخته‌شده (exit 0 فقط با PASS)
infinity-loop inspect --base origin/main --plan PLAN.md
git diff | infinity-loop inspect --plan PLAN.md
```
هر دور در `LOOP-LEDGER.jsonl` ثبت می‌شود (قابل‌تغییر با `--log`).

## تنظیمات (env)
- `INFINITY_LOOP_BASE_URL` — اگر خواستی endpoint را دستی بدهی (پیش‌فرض: اول Ollama، بعد LM Studio).
- `INFINITY_LOOP_MODEL` — اگر چند مدل داری و می‌خواهی یکی مشخص شود (پیش‌فرض: اولین مدلی که نامش `deepseek` دارد).
- `INFINITY_LOOP_API_KEY` — برای endpointهای محلی لازم نیست.
- `INFINITY_LOOP_TIMEOUT_MS` — پیش‌فرض ۱۲۰۰۰۰.

## قاعده‌ها (چرا قابل‌اعتماد است)
- **بدونِ خودنمره‌دهی:** بازبین مدلی است که کد/پلن را ننوشته.
- **ناامن‌به‌صورت‌پیش‌فرض:** اگر بازبین خطِ `VERDICT:` سالم ندهد، یا خطا بدهد، نتیجه BLOCKED/FAIL است، نه تأیید.
- **تأییدِ گره‌خورده به SHA256 پلن:** هر ویرایشِ پلن، تأییدِ قبلی را باطل می‌کند.
- **سقف دور:** `--rounds` (پیش‌فرض ۱؛ حلقهٔ چنددوره با `maxRounds`/`maxInspectionRounds`).
- **یافتهٔ BLOCKER/MAJOR بر VERDICT غلبه می‌کند:** یک PASS با یافتهٔ مسدودکننده، pass حساب نمی‌شود.

## تست (بدون شبکه، بدون DeepSeek)
```bash
npm test     # ۱۰ تستِ قطعی با مدلِ جعلیِ تزریقی
```

## محدودیت‌های صادقانه
- بازبینِ محلیِ تمیز، **اثباتِ درستی نیست**؛ فقط می‌گوید چیزی پیدا نشد.
- کیفیتِ یافته‌ها به مدلِ DeepSeekِ تو بستگی دارد (مثلاً `deepseek-r1` بهتر از مدلِ کوچک).
- مرحلهٔ «build» این‌جا خودکار نیست؛ کد را تو/Claude می‌نویسی و بعد `inspect` می‌زنی. این عمداً است تا builder و grader یکی نشوند.

MIT © 2026 — ابعاد کاملِ همکاری در `COLLABORATION.json`.

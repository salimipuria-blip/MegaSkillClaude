# کنسول آیفون مگااسکیل (`mobile/`)

وب‌اپ موبایل فارسی (PWA) برای کدنویسی آنلاین از آیفون: باز کردن این ریپو در **VS Code آنلاین**، جست‌وجوی آفلاین ۵٬۷۳۷ مهارت و کپی دستور تست پروژه‌ها. مهارت همراه آن: `online-vscode-mobile-coding` در `library/skills/`.

## استفاده روی آیفون
1. این صفحه را با Safari باز کن (از هر هاست استاتیک ریپو یا پیش‌نمایش).
2. Share ← **Add to Home Screen** تا مثل اپ نصب شود.
3. تب «مهارت‌ها»: عبارت را فارسی/فینگلیش/انگلیسی بنویس ← روی مهارت بزن ← «کپی پرامپت آماده» را در Claude (داخل VS Code) پیست کن.
4. تب «پروژه‌ها» یا «VS Code»: همان پروژه مستقیم در `vscode.dev` باز می‌شود؛ با حساب گیت‌هاب وارد شو و ویرایش کن.

## چرا هر همکار خودکار این مهارت را دارد؟
- مسیریاب `mega-skills-router` در `.claude/skills/` **داخل خود ریپو** است؛ باز کردن ریپو در VS Code/Claude Code کافی است.
- این اسکیل در ایندکس مسیریاب ثبت شده (`library/skills/online-vscode-mobile-coding/SKILL.md`) و با `scripts/sync_skill_library.py` به پلاگین قابل‌نصب هم می‌رسد.
- افزونه‌های پیشنهادی از `.vscode/extensions.json` پیشنهاد می‌شوند.

## توسعه
```bash
python3 mobile/build-index.py          # بازسازی skills-index.json از ایندکس canonical مسیریاب
python3 mobile/build-index.py --check  # گیت تازگی ایندکس (در تست‌ها هم اجرا می‌شود)
python3 -m http.server 8000            # از ریشهٔ ریپو؛ بعد http://localhost:8000/mobile/
```
`mobile/skills-index.json` تولیدی است؛ دستی ویرایشش نکن.

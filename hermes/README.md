# هرمس ۲۴/۷ روی اوراکل رایگان + تلگرام

هزینه: ۰. هر دستور این صفحه با سورس رسمی `NousResearch/hermes-agent` تطبیق داده شده است.

## تفاوت با نسخهٔ قبلی برنامه

| قبلی | اصلاح‌شده | دلیل |
|---|---|---|
| `nohup hermes gateway start &` | `hermes gateway install` (سرویس systemd) | با ری‌استارت سرور خاموش نمی‌شود و اگر کرش کند خودش برمی‌گردد |
| جمینی از راه حالت `openai` | provider بومی `gemini` با `GEMINI_API_KEY` | هرمس جمینی را مستقیم پشتیبانی می‌کند |
| بات برای همه باز | `TELEGRAM_ALLOWED_USERS` | بدون این، هر غریبه‌ای می‌تواند به ایجنتی که روی سرور شما دستور اجرا می‌کند فرمان بدهد |
| اسم مدل ثابت | اسکریپت مدل‌های در دسترس کلید را چک و اولی را انتخاب می‌کند | اسم غلط مدل باعث خطای ۴۰۴ می‌شود |
| پلن B: Hugging Face | فقط برای تست | Space رایگان بدون بازدید می‌خوابد، پس ۲۴/۷ نیست |

## قدم‌ها

**A. ساخت سرور** (کنسول اوراکل)
- مسیر: Compute ← Instances ← Create instance
- Image: Ubuntu 24.04 (aarch64)
- Shape: `VM.Standard.A1.Flex` با ۴ OCPU و ۲۴ گیگابایت رم. برچسب **Always Free** باید دیده شود؛ اگر دیده نشد، نساز.
- SSH keys: Generate a key pair for me، بعد **Save private key**
- اگر خطای Out of capacity گرفتی: ۲ OCPU و ۱۲ گیگابایت، یا ساعت دیگری دوباره امتحان کن.

**B. اتصال** با Termius
- Host: آی‌پی عمومی سرور
- User: `ubuntu`
- Key: همان فایل کلید خصوصی

**C. آماده کردن دو چیز** (رمزها را جایی ننویس)
1. **کلید جمینی:** از aistudio.google.com ← Get API key. با VPN، چون گوگل ایران را نمی‌پذیرد.
2. **شناسهٔ عددی تلگرام:** به `@userinfobot` پیام `/start` بده.

**D. نصب** (در Termius، یک خط)
```bash
curl -fsSL https://raw.githubusercontent.com/salimipuria-blip/MegaSkillClaude/main/hermes/setup.sh -o setup.sh && bash setup.sh
```
اسکریپت سه چیز می‌پرسد: کلید جمینی، توکن بات و شناسهٔ عددی. کلید و توکن موقع تایپ دیده نمی‌شوند. هر سه فقط روی همان سرور ذخیره می‌شوند.

**E. تست:** در تلگرام به بات بنویس: «سلام، خودت را معرفی کن».

## اگر گیر کردی

| خطا | راه حل |
|---|---|
| Out of capacity | شکل ۲/۱۲ یا ساعت خلوت‌تر |
| Permission denied (publickey) | نام کاربری `ubuntu` و همان کلید خصوصی |
| Google rejected the key | کلید را دوباره کپی کن (با VPN) |
| بات جواب نمی‌دهد | `journalctl --user -u hermes-gateway -n 50 --no-pager` و اسکرین‌شات بفرست |
| بات می‌گوید unauthorized | شناسهٔ عددی را دوباره از `@userinfobot` بگیر و `bash setup.sh` را دوباره اجرا کن |

## نگهداری

- وضعیت: `hermes gateway status`
- ری‌استارت: `hermes gateway restart`
- عیب‌یابی: `hermes doctor`
- **اوراکل:** سرور Always Free اگر چند روز تقریباً بیکار بماند ممکن است پس گرفته شود و قبلش ایمیل هشدار می‌دهد. ایمیلت را چک کن.

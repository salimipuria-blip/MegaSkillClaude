# مدل‌ها روی Arena: کلاد و بقیه

پاسخ کوتاه: **انتخاب مدل کلاد در کانفیگ کار می‌کند؛ اینکه کلید و workspace تو به کدام
مدل‌ها دسترسی دارد، فقط با یک درخواست احراز هویت‌شده معلوم می‌شود.** این سند هر دو
بخش را جدا می‌کند.

## ۱. چه چیزی این‌جا تأیید شد

با `codex-cli 0.167.2` و کانفیگ همین مخزن (بخش `docs/CODEX_ARENA.md`):

```
$ codex exec -p arena -m claude-fable-5-2 --skip-git-repo-check "say hi"
model: claude-fable-5-2
provider: arena
```

یعنی شناسهٔ مدل کلاد بدون هیچ تغییر دیگری در کانفیگ به همان پرووایدر Arena می‌رود.
تنها چیزی که در محیط توسعه قابل آزمایش نبود، پاسخ واقعی `api.arena.ai` بود.

## ۲. شناسه‌های خانوادهٔ کلاد (منبع عمومی، ۱۴۰۵/۰۸)

| مدل | شناسهٔ API | زمینه | خروجی |
|---|---|---|---|
| Claude Fable 5.2 | `claude-fable-5-2` | ۱M | ۱۲۸K |
| Claude Fable 5.1 | `claude-fable-5-1` | ۱M | ۱۲۸K |
| Claude Fable 5 | `claude-fable-5` | ۱M | ۱۲۸K |
| Claude Opus 5.5 | `claude-opus-5-5` | ۱M | ۱۲۸K |
| Claude Opus 5 | `claude-opus-5` | ۱M | ۱۲۸K |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | ۱M | ۱۲۸K |
| Claude Sonnet 5 | `claude-sonnet-5` | ۱M | ۱۲۸K |
| Claude Haiku 5.5 | `claude-haiku-5-5` | ۱M | ۱۲۸K |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | ۲۰۰K | ۶۴K |
| Claude Opus 4.8 / 4.7 | `claude-opus-4-8` / `claude-opus-4-7` | ۲۰۰K | ۶۴K |

Fable 5.2 در ۹ نوامبر ۲۰۲۶ عرضه شد و ۲۰٪ ارزان‌تر از 5.1 است ($8/$40 به‌ازای هر
میلیون توکن). این جدول از منابع عمومی Anthropic و کاتالوگ‌های مدل است؛ **فهرست واقعی
دسترسی تو ممکن است کمتر باشد.**

## ۳. کدام مدل‌ها برای کلید تو فعال است

دو endpoint، هر دو با همان کلید. هیچ‌کدام صورت‌حساب نمی‌شود:

```bash
# الف) فهرست سازگار با OpenAI
curl -sS https://api.arena.ai/v1/models \
  -H "Authorization: Bearer $ARENA_API_KEY" | jq -r '.data[].id' | sort

# ب) همان منبعی که setup.sh برای ساخت کاتالوگ استفاده می‌کند
curl -sS https://platform.arena.ai/api/scripts/setup/models \
  -H "Authorization: Bearer $ARENA_API_KEY" \
  -H "User-Agent: arenarouter-setup.sh" | jq -r '.data[].id' | sort
```

اگر این دو خالی یا `401` برگرداندند، مشکل کلید/workspace است، نه کانفیگ.
برای بررسی مستقیم Fable 5.2:

```bash
curl -sS https://api.arena.ai/v1/models \
  -H "Authorization: Bearer $ARENA_API_KEY" \
  | jq -e '.data[].id | select(. == "claude-fable-5-2")' >/dev/null \
  && echo "fable 5.2 enabled" || echo "not enabled for this key"
```

اگر `claude-fable-5-2` نبود ولی `claude-fable-5-1` بود، با `claude-fable-5-1` شروع کن؛
شناسه‌ها قابل تعویض‌اند و بقیهٔ کانفیگ دست نمی‌خورد.

## ۴. استفاده در هر ابزار

**Codex** — پروفایل Arena + انتخاب مدل با `-m` یا `/model`:

```bash
codex exec -p arena -m claude-fable-5-2 "…"
```

کاتالوگی که از پورتال ساخته می‌شود همهٔ مدل‌های فعال کلید را دارد؛ اگر مدل در `/model`
دیده نشد، کاتالوگ قدیمی است و باید با `setup.sh` → `update models` بازسازی شود.

**Claude Code** — مدل مستقیم، نه روتر:

```bash
export ANTHROPIC_BASE_URL="https://api.arena.ai"
export ANTHROPIC_AUTH_TOKEN="$ARENA_API_KEY"
claude --model claude-fable-5-2
```

`coding-router-preview` یک علیاس روتر است و خودش مدل انتخاب می‌کند؛ اگر می‌خواهی
دقیقاً Fable 5.2 اجرا شود، شناسهٔ مستقیم را بده.

## ۵. مرز ادعا

- **تأییدشده:** کانفیگ و پروفایل در Codex 0.167.2 کار می‌کند، شناسهٔ کلاد پذیرفته
  می‌شود، و endpoint های کشف مدل وجود دارند (بدون کلید `401` می‌دهند).
- **تأییدنشده:** اینکه کلید تو به Fable 5.2 یا بقیهٔ خانواده دسترسی دارد. این فقط با
  دستورهای بخش ۳ روی دستگاه خودت معلوم می‌شود؛ کلیدت را هیچ‌جا نفرست.

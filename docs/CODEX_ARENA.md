# Codex: پلاس و Arena روی یک دستگاه

دو اشتراک کنار هم کار می‌کنند؛ لازم نیست یکی را برای دیگری حذف کنی:

| حالت | دستور | مدل | پرداخت |
|---|---|---|---|
| روزمره (ChatGPT Plus) | `codex` | مدل پیش‌فرض Codex | داخل اشتراک پلاس |
| روتر Arena | `codex --profile arena` | `coding-router-preview` | اعتبار کلید Arena |

## راه درست: نصب‌کنندهٔ رسمی Arena

```bash
curl -fsSL https://platform.arena.ai/setup.sh | bash
```

اسکریپت رسمی ابزارهای نصب‌شده را تشخیص می‌دهد، تأیید را در مرورگر می‌گیرد و این‌ها را
انجام می‌دهد:

- توکن را در `~/.arena/token` با مود `0600` می‌گذارد و یک helper می‌سازد که Codex
  با `auth.command` اجرا می‌کند؛ پس GUI بدون شل هم احراز هویت می‌شود و Codex هر ۵ دقیقه
  توکن را دوباره می‌خواند (چرخش کلید بدون ری‌استارت).
- فهرست مدل‌های مجاز کلید را از پورتال می‌گیرد و کاتالوگ Codex را خودش می‌سازد.
- رسید نصب (`~/.arena/install-state.json`) و ژورنال تراکنش نگه می‌دارد؛ `uninstall`
  فقط چیزی را برمی‌گرداند که از زمان نصب دست‌نخورده مانده باشد.

بعد از نصب: `codex app-server daemon restart` و سپس `codex --profile arena` یا `/model`.

اگر ادمین workspace مدل‌ها را عوض کرد، اسکریپت را دوباره اجرا کن و `update models` را بزن.

## راه دستی (بدون `curl | bash`)

اگر نمی‌خواهی اسکریپت بیرونی اجرا شود، همین دو فایل را خودت بساز. مقادیر اسکالر باید
**بالای اولین هدر `[section]`** بمانند و مسیر باید مطلق باشد؛ Codex `~` را باز نمی‌کند.

`~/.codex/config.toml`

```toml
[model_providers.arena]
name = "Arena"
base_url = "https://api.arena.ai/v1"
wire_api = "responses"
env_key = "ARENA_API_KEY"
requires_openai_auth = false
supports_websockets = false
```

`~/.codex/arena.config.toml` (پروفایل جدا، تا پلاس دست‌نخورده بماند)

```toml
model = "coding-router-preview"
model_provider = "arena"
model_catalog_json = '/absolute/path/to/codex-models.json'
```

سپس `export ARENA_API_KEY='<کلید Arena>'` در `~/.zshrc` یا `~/.bashrc`، ری‌استارت دیمن
و `codex --profile arena`.

در Codex جدید پروفایل‌ها از `config.toml` بیرون رفته‌اند. اگر جدول قدیمی
`[profiles.arena]` داشته باشی، `--profile` رد می‌شود؛ آن بخش را حذف کن.

## قرارداد کانفیگ (چرا هر فیلد)

| فیلد | چرا |
|---|---|
| `name` ≠ `"OpenAI"` | نام `OpenAI` کشف مدل را با شکل پاسخی که Codex نمی‌فهمد روشن می‌کند |
| `base_url` با `/v1` | Codex خودش `/responses` را اضافه می‌کند |
| `wire_api = "responses"` | `chat` در نسخه‌های جدید رد می‌شود |
| `supports_websockets = false` | گیت‌وی WebSocket را رد می‌کند و هر نوبت معطل می‌ماند |
| `requires_openai_auth = false` | صفحهٔ ورود ChatGPT رد می‌شود |
| `env_key` یا `auth.command` | `env_key` به export شل نیاز دارد؛ `auth.command` برای GUI هم کار می‌کند |

## چک‌لیست تأیید

1. `codex app-server daemon restart` — بستن Codex کافی نیست.
2. `/model` → ورودی «Arena Coding Router» دیده شود.
3. یک پرامپت کوتاه بفرست و همان درخواست را در مصرف Arena ببین.

## عیب‌یابی

| نشانه | علت احتمالی |
|---|---|
| مدل Arena در `/model` نیست | `model_catalog_json` تنظیم نشده یا مسیر مطلق نیست |
| خطای احراز هویت | `ARENA_API_KEY` در همان شل ست نشده، یا کلید برای آن مدل فعال نیست |
| کانفیگ اثر نمی‌کند | دیمن ری‌استارت نشده |
| `--profile arena` رد می‌شود | جدول قدیمی `[profiles.arena]` باقی مانده |
| مدل عوض نمی‌شود | اورراید `model_context_window` / `model_reasoning_effort` یا `.codex/config.toml` سطح پروژه |

## چرا نصب‌کنندهٔ اختصاصی نداریم

یک نسخهٔ پایتونی از این نصب در همین مخزن ساخته و بعد حذف شد. مقایسه با وزن‌دهی برای
شرایط همین کاربر: **نصب‌کنندهٔ رسمی ۱۳، نسخهٔ خودمان ۶**. دلایل اصلی:

- کشف خودکار مدل‌ها و helper توکن برای GUI را ما نداشتیم؛
- هم‌گامی با تغییرات فیلدهای کاتالوگ Codex وظیفهٔ آن‌هاست، نه ما؛
- ژورنال و رسید آن‌ها کامل‌تر است (قفل، ژورنال نسخهٔ ۲، رسید چند-ابزاری).

نسخهٔ ما فقط در دو چیز برنده بود: کلید خام روی دیسک نمی‌نوشت و بدون شبکه کار می‌کرد.
این دو ارزش نگه‌داشتن یک نصب‌کنندهٔ موازی و رقیب را ندارد؛ راه دستی بالا همان را
بدون هزینهٔ نگه‌داری می‌دهد.

## امنیت

- کلید را در مخزن، `.env` یا تاریخچهٔ شل کامیت نکن.
- اپ‌های GUI که بدون شل باز می‌شوند `ARENA_API_KEY` را نمی‌بینند؛ برای آن‌ها از راه
  رسمی (helper) استفاده کن.
- این کانفیگ فقط Codex لوکال را وصل می‌کند؛ تسک‌های ابری و ریموت از آن استفاده نمی‌کنند.

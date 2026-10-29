# سه پروژهٔ عملی هوش مصنوعی — نسخهٔ بازبینی‌شده و قابل اجرا

> این نسخهٔ اصلاح‌شدهٔ همان آموزش سه‌پروژه‌ای است (وب‌سایت هوشمند، اتوماسیون خبر، ایجنت RAG).
> ساختار و مسیر یادگیری حفظ شده؛ اما **هر ادعای فنی دوباره اندازه‌گیری شده** و کدی که در آموزش
> می‌آید، در همین پوشه اجرا و تست می‌شود. نسخهٔ اصلی چهار خطای مهم داشت که باعث می‌شد پروژه‌ها
> «طبق آموزش» بالا نیایند.

## چرا این نسخه بازنویسی شد — با شاهد، نه حدس

| # | ادعای نسخهٔ اصلی | وضعیت واقعی (اندازه‌گیری‌شده در ۲۰۲۶-۱۰-۲۹) | اثر |
|---|---|---|---|
| ۱ | `from langchain.chains import RetrievalQA` | `ModuleNotFoundError: No module named 'langchain.chains'` روی **langchain 1.4.7** | پروژهٔ ۳ در خط اول کد می‌شکست |
| ۲ | `from langchain.memory import ConversationBufferMemory` | `No module named 'langchain.memory'` — کلاس حذف شده است | همان |
| ۳ | `from langchain.text_splitter import RecursiveCharacterTextSplitter` | `No module named 'langchain.text_splitter'` — به بستهٔ جدا منتقل شده | همان |
| ۴ | «مدل چند ده مگابایت است» | `Xenova/distilbart-cnn-6-6` در حالت پیش‌فرض ≈ **۱٫۱ گیگابایت** (encoder 512MB + decoder 614MB)؛ با `dtype:'q8'` ≈ **۳۱۰ مگابایت** | کاربر بعد از چند دقیقه انتظار، تب را می‌بست |
| ۵ | «همهٔ ابزارها کاملاً رایگان و متن‌باز هستند» | **n8n متن‌باز نیست**: مجوز *Sustainable Use License* (fair-code) است و خودِ n8n هم خودش را open source نمی‌نامد | ادعای حقوقی نادرست در متن آموزشی |

شاهدِ اجرایی خطاهای ۱ تا ۳ (همین حالا قابل تکرار است):

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install "langchain>=1" langchain-community langchain-ollama langchain-chroma
python -c "from langchain.chains import RetrievalQA"       # ModuleNotFoundError
python -c "from langchain.memory import ConversationBufferMemory"  # ModuleNotFoundError
python -c "from langchain.text_splitter import RecursiveCharacterTextSplitter"  # ModuleNotFoundError
```

چیزی که واقعاً کار می‌کند و در این پوشه تست شده است:

```python
from langchain_community.document_loaders import PyPDFLoader
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_ollama import ChatOllama
from langchain_ollama import OllamaEmbeddings
```

نسخه‌های تأییدشده: `langchain 1.4.7` · `langchain-core 1.7.3` · `langchain-community 0.4.2` ·
`langchain-chroma 1.1.0` · `langchain-ollama 1.1.0` · `chromadb 1.5.9`.

---

## نقشهٔ پوشه

```
docs/guides/ai-projects-3/
├─ README.md                       ← همین فایل
├─ index.html                      ← نسخهٔ خواندنی و راست‌به‌چپ برای مطالعه/پرزنت
├─ project-1-browser-summarizer/   ← خلاصه‌ساز درون‌مرورگری (Transformers.js)
│   ├─ summarizer-core.mjs         ← منطقِ خالص و تست‌شده
│   ├─ summarizer-core.test.mjs    ← ۱۱ تست
│   ├─ worker.js  app.js  index.html  style.css
├─ project-2-news-automation/      ← خبر → خلاصهٔ محلی → تلگرام
│   ├─ feed-to-telegram.mjs        ← نسخهٔ بدون وابستگی (Node استاندارد)
│   ├─ feed-to-telegram.test.mjs   ← ۱۵ تست
│   └─ workflow.n8n.json           ← همان مسیر در n8n (قابل Import)
└─ project-3-rag-agent/            ← ایجنت RAG روی اسناد خودت
    ├─ rag_agent.py                ← LangChain 1.x، import تنبل
    ├─ test_rag.py                 ← ۲۱ تست، بدون مدل و بدون شبکه
    ├─ check_imports.py            ← سطح import را روی نسخهٔ نصب‌شده می‌سنجد
    └─ requirements.txt
```

اجرای همهٔ دروازه‌ها با یک فرمان:

```bash
python3 scripts/verify_ai_projects.py
```

در مجموع **۴۷ تست** خودکار (۱۱ نود برای پروژهٔ ۱، ۱۵ نود برای پروژهٔ ۲، ۲۱ پایتون برای پروژهٔ ۳) و ۱۲ بررسی در همین دروازه.

این اسکریپت سینتکس، تست‌ها، اعتبار JSON گردش‌کار، و **هم‌خوانی متن با کد** را می‌سنجد؛
یعنی اگر متن آموزش از کد جلو بزند، قرمز می‌شود.

---

# پروژهٔ ۱ — وب‌سایت هوشمند: خلاصه‌ساز داخل مرورگر

**ابزار:** Transformers.js · **هزینه:** صفر · **پیش‌نیاز:** HTML/CSS/JS پایه

### ۱) محیط

سه فایل + یک سرور استاتیک. ماژول ES و Web Worker از `file://` بارگذاری نمی‌شوند، پس:

```bash
cd docs/guides/ai-projects-3/project-1-browser-summarizer
python3 -m http.server 8000        # سپس http://localhost:8000
```

اکستنشن Live Server هم همین کار را می‌کند؛ تفاوتی ندارد.

### ۲) کتابخانه

```js
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
```

نسخه **پین** می‌شود (آخرین نسخه ۴٫۳٫۲ است، ولی نسخهٔ ۳٫۵٫۱ آموزش اصلی هنوز روی CDN هست).
اگر نسخه را پین نکنی، یک روز صبح کدت با نسخهٔ بعدی می‌شکند.

### ۳) مدل و حجمِ واقعی

```js
const summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6', {
  dtype: 'q8',                       // ← این خط، تفاوت ۱٫۱ گیگابایت و ۳۱۰ مگابایت است
  progress_callback: (e) => console.log(e.status, e.file, e.progress),
});
```

| حالت | encoder | decoder | جمع تقریبی |
|---|---|---|---|
| پیش‌فرض (fp32) | ۵۱۲ MB | ۶۱۴ MB | **≈ ۱٫۱ GB** |
| `dtype: 'q8'` | ۱۵۵ MB | ۱۵۵ MB | **≈ ۳۱۰ MB** |

اعداد از فهرست فایل‌های مخزن مدل خوانده شده‌اند، نه تخمین. در `summarizer-core.mjs` همین
`MODEL` و `DTYPE` ثابت‌اند و تست، هم‌خوانی‌شان با متنِ هشدار را قفل می‌کند.

### ۴) اجرا در Worker، نه در ترد اصلی

```js
new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
```

مدل باید داخل Worker باشد؛ وگرنه رابط کاربری در حین پردازش فریز می‌شود. نکته‌ای که در
بیشتر آموزش‌ها نیست: **`terminate()` تنها راهِ واقعیِ توقف** است، چون فراخوانی ONNX
قابل لغو نیست. `app.js` برای هر اجرا Worker تازه می‌سازد و دکمهٔ «توقف» همان را می‌بندد.

### ۵) خواندن خروجی

```js
const summary = output?.[0]?.summary_text ?? output?.[0]?.generated_text ?? '';
```

مدل BART `summary_text` می‌دهد، بعضی مدل‌های جایگزین `generated_text`. تابع `readSummary`
هر دو + خروجی رشته‌ای را می‌پذیرد؛ همین یک تابع، دلیلِ رایجِ چاپ‌شدن `undefined` را حذف می‌کند.

### ۶) انتشار رایگان

GitHub Pages یا Vercel — هر دو برای پروژهٔ شخصی رایگان‌اند. **توجه:** خودِ مدل از CDN
هاگینگ‌فیس دانلود می‌شود؛ «هیچ داده‌ای خارج نمی‌شود» درست است (متن شما جایی نمی‌رود) ولی
«هیچ درخواستی به اینترنت نمی‌رود» درست نیست.

---

# پروژهٔ ۲ — اتوماسیون: خبر → خلاصهٔ محلی → تلگرام

**ابزار:** n8n + Ollama · **هزینه:** صفر · **پیش‌نیاز:** آشنایی پایه با Docker (اختیاری)

> **دربارهٔ مجوز n8n:** n8n تحت *Sustainable Use License* منتشر می‌شود و خودش را
> «fair-code» می‌نامد، نه open source — کد در دسترس است و self-host رایگان است، اما مجوز
> استفاده را محدود می‌کند (فروشِ آن به‌عنوان سرویس به مشتری ثالث مجاز نیست). برای
> استفادهٔ شخصی و کسب‌وکارِ خودت رایگان است. Ollama (MIT) و مدل‌ها مجوز خودشان را دارند.

### ۱) مدل محلی

```bash
ollama pull llama3.1:8b
curl http://localhost:11434/api/generate -d '{"model":"llama3.1:8b","prompt":"سلام","stream":false}'
```

### ۲) مسیر در n8n

فایل `project-2-news-automation/workflow.n8n.json` را Import کن. چهار نود دارد:

```
[Schedule: هر ۶ ساعت] → [RSS Feed Read] → [HTTP Request → Ollama] → [Telegram: Send Message]
```

سه نکته‌ای که در نسخهٔ اصلی نبود و باعث خطا می‌شود:

1. اگر n8n داخل Docker است، `localhost` یعنی خودِ کانتینر؛ آدرس Ollama باید
   `http://host.docker.internal:11434` یا نام سرویس در شبکهٔ Docker باشد.
2. `timeout` نود HTTP را تنظیم کن (۱۲۰ ثانیه)؛ وگرنه اجرای کند معلق می‌ماند.
3. در `parse_mode: HTML` هر `<` در متن خبر، پیام را می‌شکند؛ متن را اول escape کن.

### ۳) همان مسیر بدون n8n

اگر نمی‌خواهی برای یک کار ساده یک سرویس کامل نصب کنی (یا مجوز fair-code سؤال‌برانگیز است):

```bash
FEED_URL=https://example.com/feed.xml OLLAMA_MODEL=llama3.1:8b \
  node project-2-news-automation/feed-to-telegram.mjs --dry-run

# ارسال واقعی:
FEED_URL=… TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… node …/feed-to-telegram.mjs
```

بدون `--dry-run` و با توکن، پیام به تلگرام می‌رود؛ بدون توکن، خودکار dry-run می‌شود.
پارس فید، ساخت پیام، escape و برشِ طول پیام همه تابع‌های خالص و تست‌شده‌اند (۱۵ تست).

### ۴) زمان‌بندی

`cron` ساده (لینوکس/مک):

```cron
0 */6 * * * cd /path/to/project && /usr/bin/env node feed-to-telegram.mjs >> news.log 2>&1
```

---

# پروژهٔ ۳ — ایجنت هوشمند: پرسش از اسناد خودت (RAG)

**ابزار:** Ollama + LangChain 1.x + ChromaDB · **هزینه:** صفر · **پیش‌نیاز:** پایتون پایه

### ۱) نصب

```bash
cd docs/guides/ai-projects-3/project-3-rag-agent
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` بازه می‌دهد (`>=1.4,<2`) نه پین دقیق؛ LangChain نسخهٔ major را سریع
عوض می‌کند و پینِ سخت، یک ماه بعد می‌پوسد. `check_imports.py` می‌گوید کدام نسخه نصب است و
آیا سطح import این آموزش روی همان نسخه سالم است.

### ۲) دو مدل، دو نقش

```bash
ollama pull nomic-embed-text     # embedding: متن → بردار
ollama pull llama3.1:8b          # generation: بردار → پاسخ
```

### ۳) برش متن (chunking)

`split_text` در `rag_agent.py` همان ایدهٔ `RecursiveCharacterTextSplitter` را در ۲۵ خط
قطعی پیاده می‌کند (پاراگراف → جمله → کاراکتر، با overlap). چرا خودمان؟ چون آن کلاس در
LangChain 1.x به بستهٔ `langchain-text-splitters` منتقل شده و این پیاده‌سازی، **قابل تست
بدون هیچ وابستگی** است.

### ۴) ایندکس برداری

```python
store = Chroma.from_documents(
    documents=documents,                    # list[Document]
    embedding=OllamaEmbeddings(model="nomic-embed-text"),
    persist_directory="./chroma_db",
)
```

در `langchain-chroma 1.1.0` امضا تأیید شده است: `from_documents(documents, embedding=None, ids=None, collection_name=…, persist_directory=None, …)`.
دیگر لازم نیست `store.persist()` صدا بزنی؛ Chroma 1.x خودش پایدار می‌کند.

### ۵) زنجیرهٔ بازیابی + پاسخ (بدون `RetrievalQA`)

```python
docs = retriever.invoke(question)           # k=4
context = format_context(docs)              # شماره‌گذاری [۱] [۲] …
reply = llm.invoke(build_messages(question, context))
print(answer_question(question, retriever, llm).render())
```

سه تصمیمِ مهم که در نسخهٔ اصلی نبود:

- **امتناع صریح:** اگر هیچ سندی پیدا نشد، مدل صدا زده **نمی‌شود** و پاسخ
  «در اسنادی که در اختیار دارم پاسخی پیدا نکردم.» است. ایجنت RAG که با زمینهٔ خالی جواب
  می‌دهد، فقط یک چت‌بات توهم‌زا با مراحل اضافه است.
- **ارجاع واقعی:** شماره‌گذاری متن و فهرست منابع از یک منبع می‌آیند؛ اگر بخشی از اسناد به
  دلیل سقف کاراکتر حذف شود، شماره‌ها هم حذف می‌شوند (باگ کلاسیکی که در نسخهٔ اولِ همین
  فایل بود و تست آن را گرفت).
- **حافظه با فراخواننده است، نه `Memory`:** تاریخچه یک لیست پیام است که خودت نگه می‌داری.

### ۶) رابط کاربری

```bash
streamlit run app.py     # یا همین CLI:
python3 rag_agent.py --docs ./notes --index --ask "خلاصهٔ جلسهٔ سه‌شنبه چی بود؟"
```

### ۷) واقع‌بینی

کیفیت مدل ۸B محلی به GPT-4 نمی‌رسد؛ هدف این پروژه معماری است (retrieval، ارجاع، امتناع)،
و همین معماری با مدل بزرگ‌تر عیناً کار می‌کند.

---

## چه چیزی اینجا تست می‌شود

```bash
node --test docs/guides/ai-projects-3/project-1-browser-summarizer/summarizer-core.test.mjs   # ۱۱
node --test docs/guides/ai-projects-3/project-2-news-automation/feed-to-telegram.test.mjs      # ۱۵
python3 -m unittest discover -s docs/guides/ai-projects-3/project-3-rag-agent -p "test_*.py"   # ۲۱
python3 scripts/verify_ai_projects.py                                                           # همه + هم‌خوانی متن/کد
```

**آنچه تست نمی‌شود و باید خودت روی دستگاهت ببینی:** دانلود مدل و اجرای واقعی ONNX در
مرورگر، اتصال واقعی به Ollama/Telegram، و کیفیت خروجی مدل. هیچ‌کدام از این چهار مورد در
CI اجرا نمی‌شود و در این سند «تأییدشده» حساب نمی‌شوند.

## منابع رسمی

- [Transformers.js — مستندات](https://huggingface.co/docs/transformers.js/en/index) · [نمونه‌پروژه‌های رسمی](https://github.com/huggingface/transformers.js-examples)
- [مدل Xenova/distilbart-cnn-6-6](https://huggingface.co/Xenova/distilbart-cnn-6-6)
- [n8n — نصب با Docker](https://docs.n8n.io/hosting/installation/docker/) · [مجوز Sustainable Use](https://docs.n8n.io/sustainable-use-license/)
- [Ollama](https://docs.ollama.com/) · [LangChain 1.x (پایتون)](https://docs.langchain.com/oss/python/langchain/overview) · [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) · [Chroma](https://docs.trychroma.com/)

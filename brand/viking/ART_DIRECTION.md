# راهنمای دقیق ساخت تصویر پست و استوری وایکینگ آفرود

این راهنما با مشاهدهٔ مستقیم چهار مرجع فرستاده‌شده—یک استوری عمودی و یک کاروسل سه‌اسلایدی—و تطبیق آن‌ها با `assets/lake.jpg` و قالب‌های محلی `post.html` و `story.html` نوشته شده است. هدف، بازسازی **زبان بصری وایکینگ** است، نه کپی‌کردن قیمت‌ها، تاریخ‌ها یا ادعاهای کمپین نمونه. قالب‌ها و این راهنما به وب‌اپ تیم یا Supabase متصل نیستند.

## ۱) تحلیل عمیق چهار مرجع

### تصویر و حال‌وهوا
- هر چهار مرجع از یک زبان عکاسی مشترک استفاده می‌کنند: **دریاچهٔ آرام، جنگل و کوه‌های مه‌آلود، طلوع طلایی و پاروزن کوچک روی پدل‌برد**. سوژه نسبت به منظره کوچک است و حس سکون، مقیاس و ماجراجویی آرام می‌دهد. عکس `assets/lake.jpg` در مخزن همین فضا را پشتیبانی می‌کند.
- نور خورشید و بازتاب گرم آب، نقطهٔ روشنِ مرکز/بالای کادر است؛ در مقابل، درخت‌ها و کناره‌ها سبز تیره‌اند و پایین قاب با گرادیان مشکی خوانایی متن را می‌گیرد. گرِید باید کهرباییِ کنترل‌شده باشد، نه فیلتر نارنجی سراسری؛ جزئیات آب، مه و سایه حفظ شوند.
- عکس قهرمان full-bleed است؛ پس‌زمینه در اسلایدهای مختلف با کراپ، تارکردن یا تیره‌کردن تکرار می‌شود. این کار انسجام کاروسل را بالا می‌برد، اما اگر چند عکس واقعی موجود است، برای هر اسلاید کراپ/نما را عوض کن تا صفحه‌ها کپیِ یکدیگر نشوند.
- **نشان رسمی دایره‌ای** در رفرنس‌ها تصویر کلاه‌خوددار دارد؛ این نقش بخشی از خود لوگو است و باید فقط از فایل `assets/logo.png` عیناً استفاده شود. آن را با مدل بازسازی نکن. در خود عکس پس‌زمینه، نمادهای نورس مثل کلاه‌خود، رون، کشتی یا تبر اضافه نکن؛ مگر brief صریحاً چنین سوژه‌ای بخواهد.

### سلسله‌مراتب و گرافیک
1. **نوار نارنجی مورب بالای کادر** مثل ticker لبه‌به‌لبه است؛ پیام کوتاه در آن تکرار می‌شود. در استوری و بعضی اسلایدها عبارت فوری/تکرارشونده همراه ایموجی دیده می‌شود. متن و ایموجی را در لایهٔ قالب بگذار؛ ادعای «ظرفیت محدود» یا «فقط تا...» فقط با تأیید brief.
2. **لوگوی دایره‌ای واقعی** معمولاً بالا-راستِ کاور و اسلاید پایانی می‌نشیند؛ در اسلاید جزئیات می‌توان برای خلوتی حذفش کرد. شمارهٔ `1/3`، `2/3` یا `3/3` در کپسول تیرهٔ بالا-چپ، کاروسل را قابل‌پیگیری می‌کند.
3. **تیتر یک‌نگاهی** روی عکس قرار می‌گیرد: عنوان/مقصد با نارنجی بزرگ، توصیف تجربه با سفید، سپس تاریخ یا جزئیات در باکس‌های کوچک‌تر. متن کوتاه و کنتراست بالا مهم‌تر از افزودن تزئین است.
4. اسلاید جزئیات از **کارت‌های تیرهٔ نیمه‌شفاف، حاشیهٔ نارنجی نازک و گوشهٔ گرد** در چیدمان دو ستونه استفاده می‌کند؛ رفرنس شش کارت دارد. برای هر کارت یک عنوان و توضیح کوتاه کافی است؛ آیکون‌ها/ایموجی‌ها را در لایهٔ متن اضافه کن، نه روی عکس. ایموجی‌های رنگیِ مراحل قرعه‌کشی مختص همان مکانیک‌اند و بخشی از پالت اصلی نیستند.
5. اسلاید پایانی **قیمت یا پیشنهاد را بسیار بزرگ** می‌کند و شرایط را زیر آن می‌آورد. قرمز `#FF4D3D` در رفرنس برای خط قیمت قبلی و برچسب جایزه استفاده شده؛ در کار جدید فقط وقتی قیمت قبلی واقعی یا جایزه تأییدشده است از آن استفاده کن.
6. **نوار سفید مورب پایین** یک CTA نهایی دارد؛ در رفرنس‌های رزرو، متن نمونه «رزرو از لینک بیو» است. پیام آن را با هدف واقعی محتوا عوض کن و فقط یک اقدام روشن نگه دار.

### تفاوت اجرای چهار قاب
- **استوری قرعه‌کشی:** نوار بالایی و لوگو، هوک، پیشنهاد/جایزه، مراحل شرکت، تاریخ یا مهلت و CTA را در یک قاب جمع می‌کند. این مرجع از نظر اطلاعات متراکم است؛ برای خروجی حرفه‌ای‌تر فقط موارد ضروری و تأییدشده را نگه دار و حاشیهٔ امن رابط اینستاگرام را رعایت کن.
- **کاروسل ۱/۳:** عکس روشن و قهرمان، عنوان سفر، تیتر بزرگ و نارنجی، توضیح سفید و دو باکس حرکت/بازگشت.
- **کاروسل ۲/۳:** عکس پس‌زمینه تار و تیره می‌شود تا شش کارت تجربه خوانا باشند؛ نوار نارنجیِ توضیح خدمات و نوار سفید CTA، دو لایهٔ بعدی‌اند.
- **کاروسل ۳/۳:** پس‌زمینه تیره‌تر است؛ نشان خودرو/شرط، رقم اصلی، توضیح هزینه و شرایط رزرو در مرکز سلسله‌مراتب قرار می‌گیرند و CTA پایین قاب می‌آید.

### تایپوگرافی و خوانایی
- فارسی راست‌به‌چپ، با نیم‌فاصله و املای درست؛ متن نهایی باید دقیقاً همان چیزی باشد که صاحب محتوا تأیید کرده است.
- تیتر نمایشی: **Lalezar**؛ متن و توضیح: **Vazirmatn** با وزن Bold/Black. در عرض نهایی ۱۰۸۰ پیکسل، تیترها معمولاً ۷۰ تا ۱۵۰ پیکسل، توضیح‌ها ۳۰ تا ۵۴ پیکسل و ریزترین اطلاعات حداقل ۲۴ پیکسل بمانند.
- نوشته‌های طولانی، فونت ریز، چند CTA، ایموجی‌های پراکنده و نوشته روی بخش روشن/شلوغ عکس خوانایی و حس حرفه‌ای را کم می‌کنند. یک بلوک متن حداکثر ۲–۳ خط؛ برای اطلاعات بیشتر از اسلاید بعد استفاده شود.
- مدل تصویرساز **نباید هیچ فارسی، عدد، لوگو یا تایپوگرافی‌ای بکشد**. متن فارسی را پس از تولید عکس، با فونت واقعی و ابزار قالب/لایهٔ متن اضافه کنید. لوگوی رسمی هم فقط از فایل برند استفاده شود، نه لوگوی ساختگی مدل.

## ۲) مشخصات نهایی هر قالب

| کاربرد | اندازهٔ نهایی | نسبت | ریتم پیشنهادی |
|---|---:|---:|---|
| پست فید/کاروسل | هر اسلاید ۱۰۸۰×۱۳۵۰ | ۴:۵ | ۳ اسلاید: هوک و معرفی / تجربه و خدمات / قیمت و CTA |
| استوری | ۱۰۸۰×۱۹۲۰ | ۹:۱۶ | یک قاب: هوک / پیشنهاد اصلی / گام یا مزیت / CTA |

### پست سه‌اسلایدی
- **اسلاید ۱ — توقف اسکرول:** هوک یک‌خطی در نوار بالا، نام تجربه/مقصد، یک عکس قهرمان و در صورت تأیید، تاریخ حرکت/بازگشت. از همان ابتدا پیشنهاد را روشن کن.
- **اسلاید ۲ — ارزش تجربه:** حداکثر ۴ تا ۶ مزیت واقعی در کارت‌های منظم؛ خدمات، تجهیزات، غذا و شرایط را فقط مطابق brief بنویس. اطلاعات مهم را با متن ریز فشرده نکن.
- **اسلاید ۳ — تصمیم و اقدام:** قیمت تأییدشده، توضیح خودروی شخصی/گروهی در صورت وجود، شرایط رزرو و یک CTA. ددلاین یا ظرفیت فقط وقتی واقعی و اعلام‌شده باشد.
- عکس و گرِید در هر سه اسلاید باید از یک دنیای بصری باشند؛ برای کاروسل یک عکس را عیناً سه بار تکرار نکن. نما/کراپ متفاوت اما نور و پالت یکسان بده.

### استوری یک‌قابی
- هوک و نوار نارنجی در بالا؛ لوگو در بالا-راست؛ پیشنهاد/قیمت یا مزیت اصلی بزرگ و در یک نگاه قابل‌فهم؛ گام‌های شرکت در کارت‌های کوتاه؛ یک CTA واضح.
- به‌خاطر رابط اینستاگرام، متن حیاتی را در حاشیهٔ خیلی بالا/پایین نگذار: حدود ۸٪ بالای تصویر و ۱۰٪ پایین را برای کنترل‌های رابط خلوت نگه دار. نوار تزئینی می‌تواند تا لبه برود، اما نباید تاریخ/شمارهٔ رزروِ ضروری زیر رابط پنهان شود.
- همهٔ جزئیات را در استوری جا نده؛ یک پیشنهاد، یک پیام، یک اقدام.

## ۳) پالت و اجرای برند

- نارنجی اصلی: `#F39A2B`
- مشکی/کارت: `#141414`
- کرم/متن ثانویه: `#FFD9A8`
- سفید: `#FFFFFF`
- قرمز تأکیدی: `#FF4D3D` (محدود به قیمتِ خط‌خورده یا جایزهٔ تأییدشده)
- گرِید عکس: سایهٔ سبز طبیعی و عمیق، هایلایت گرم/کهربایی؛ اشباع متوسط، پوست طبیعی، جزئیات سایه حفظ شود. مشکی‌ها را له نکن و کل تصویر را نارنجی نکن.
- لوگو: `brand/viking/assets/logo.png`؛ فونت‌ها: `brand/viking/assets/Lalezar.woff2` و فایل‌های Vazirmatn همان پوشه. برای قالب آماده، این فایل‌ها از قبل در HTML بارگذاری می‌شوند.

### هدف کیفیت عکس
- خروجی باید **فوتورئالیستیِ شبیه‌سازی‌شده** باشد: مثل فریم تبلیغاتیِ فیلم‌برداری‌شده با دوربین واقعی، نور و لنز باورپذیر، بافت طبیعی پوست/آب/برگ، مه ظریف، دامنهٔ نوری کنترل‌شده و شارپی طبیعی؛ نه تصویرسازی، پلاستیکی یا CGI آشکار.
- در پرامپت از «cinematic feature-film still» و «8K-like microdetail at the highest native resolution supported» استفاده کن. منظور کیفیت و جزئیات بصری است، نه ادعای فایل ۸K.
- محدودیت فنی فعلی مهم است: Hermes برای عکس پایه معمولاً ۱۰۲۴×۱۲۸۰ پیکسلِ پست و ۷۲۰×۱۲۸۰ پیکسلِ استوری درخواست می‌کند؛ این **۸K واقعی نیست** و ابعاد نهایی را سرویس تصویر تعیین می‌کند. رندر قالب ۱۰۸۰×۱۳۵۰ / ۱۰۸۰×۱۹۲۰ هم جزئیاتِ ازدست‌رفته را برنمی‌گرداند. برای خروجی بزرگ‌تر، upscaler باید واقعاً تنظیم و اجرا شود و ابعاد خروجی کنترل شوند؛ وضوح ۸K را تضمین نکن.

## ۴) پرامپت آماده برای تولید عکس پایه

این پرامپت را برای **عکس پس‌زمینه** به مدل بده؛ عبارت‌های داخل کروشه را با brief واقعی جایگزین کن. اندازه را جداگانه روی نسبت موردنظر تنظیم کن.

### پس‌زمینهٔ پست ۴:۵

```text
Create a photorealistic AI-generated live-action background photograph for a premium Viking Offroad Instagram feed carousel, portrait 4:5. Scene: [the exact real trip/activity and subject]. Match the supplied references’ mood: forested mountain lake at sunrise when relevant, layered fine mist, a low amber sun and natural reflection on the water, deep forest-green shadows and near-black edges/lower third. Cinematic feature-film still, physically plausible camera optics and lighting, natural HDR, realistic skin and equipment, crisp fine texture; aim for 8K-like microdetail at the highest native resolution supported, without fake sharpness. Keep the requested hero subject clear around the middle; preserve calm, dark negative space for later Persian copy and cards. Photo only: no words, letters, numbers, logo, watermark, ribbon, badge, cards, icons or UI. Viking is a modern brand; do not add Norse props or a horned helmet to the scene (the official logo is overlaid separately). Do not invent people, vehicles, props or campaign facts; no illustration or obvious CGI.
```

### پس‌زمینهٔ استوری ۹:۱۶

```text
Create a photorealistic AI-generated live-action background photograph for a Viking Offroad Instagram Story, portrait 9:16. Scene: [the exact real trip/activity and subject]. Match the supplied references’ mood: misty forest and mountain lake at sunrise when relevant, low amber sunlight with a soft water reflection, deep natural-green edges and a dark, quiet lower area. Cinematic feature-film still, physically plausible camera optics and lighting, natural HDR, realistic fine texture and believable proportions; aim for 8K-like microdetail at the highest native resolution supported, not fake sharpness. Keep the requested subject recognizable near the center; leave uncluttered negative space for later copy and keep critical details out of the top 8% and bottom 10% UI zones. Background only: no text, letters, numbers, logo, watermark, ribbon, cards, icons or UI. The official Viking logo is added separately; no Norse props or helmet in the photo. Do not add unrequested people, vehicles, equipment, dates, prizes or prices; no illustration or obvious CGI.
```

### پرامپت ویرایش عکس واقعی

```text
Edit the supplied photograph into a polished Viking Offroad campaign photo matching the four references: low amber sunrise, fine mist, natural forest-green shadows, warm reflections only where the scene supports them, and restrained contrast. Deliver a photorealistic, cinematic feature-film still with physically plausible optics/light, realistic microtexture and 8K-like detail at the highest resolution the model supports; do not imply native 8K if it is not delivered. Preserve the same people and identities, pose, vehicle/equipment count, location cues, perspective and genuine visible brand marks. Reframe/outpaint to [4:5 feed post / 9:16 Story] without stretching or cropping essential subjects; leave a darker, calm area for later Persian copy. Do not add props or campaign facts, or generate typography, text, numbers, logos, ribbons, cards or watermarks; use the real brand fonts and assets in the layout stage. No extra Norse imagery, illustration, obvious CGI, oversaturation or crushed blacks.
```

> اگر کاربر عکس و متن دقیق را باهم می‌فرستد، عکس را با مدل ویرایش کن و نوشته را با لایهٔ فونت واقعی اضافه کن. مدل تصویرساز را برای نوشتن متن فارسی به کار نبر. اگر فقط یک تیتر لازم است از `hermes/textlayer.mjs` استفاده کن؛ برای چیدمان کامل چندبخشی، قالب‌های تأییدشدهٔ این پوشه مبنا هستند.

## ۵) محدودیت‌های صداقت و ضدخطا

- هر عدد، قیمت، ظرفیت، تاریخ شمسی، جایزه، وعدهٔ «رایگان»، امکان شرکت با خودرو و محتوای خدمات باید از brief تأییدشده بیاید. مشخصاً قیمت ۷ میلیون، تاریخ‌های ۲۶/۳۰ مهر و ۱ آبان، «قرعه‌کشی رایگان»، «ظرفیت محدود» و شرط‌های فالو/ری‌پست/کامنت در مرجع‌ها فقط دادهٔ همان کمپین‌اند؛ برای کار جدید کپی نشوند.
- کمبود ظرفیت، فرصت محدود یا قیمت قبلی را هرگز نساز. اگر مقدار ضروری داده نشده، از جای‌نگهدار مثل `[قیمت]` استفاده کن یا یک سؤال مشخص بپرس.
- لوگوی رسمی را تغییر نده/بازسازی نکن؛ تصویر مرجع، منبع سبک است نه مجوز افزودن اطلاعات نادرست.
- چهره، سن، لباس، وسیله و هویت افراد در ویرایش حفظ شود؛ اشیای جدید فقط با درخواست صریح.
- از تصویر زمینهٔ تولیدشده انتظار نوشتهٔ فارسی سالم نداشته باش. خروجیِ بدون متن، نقص نیست؛ مرحلهٔ درستِ گردش کار است.

## ۶) ابزارهای همین مخزن و بررسی خروجی

- راهنمای سبک و قالب آماده: `brand/viking/README.md`، `post.html` و `story.html`.
- رندر محلی پست سه‌اسلایدی/استوری با فونت‌ها و لوگوی واقعی:

```bash
node brand/viking/render.mjs post brand/viking/out/review
node brand/viking/render.mjs story brand/viking/out/review
```

- بررسی فایل‌های ارجاع‌شده و تست رندرر:

```bash
python3 scripts/check_brand_assets.py --templates
node --check brand/viking/render.mjs
node --test brand/viking/tests/render.test.mjs
```

- رندر واقعی به Playwright و Chromium نیاز دارد؛ تست fake فقط مسیر کد و پاک‌سازی مرورگر را می‌آزماید و جای بازبینی PNG واقعی را نمی‌گیرد. خروجی را روی موبایل از نظر برش، خوانایی فارسی، فاصلهٔ UI استوری، صحت لوگو و صحت تمام ادعاها ببین. فایل‌های `out/` تولیدی‌اند و در Git commit نشوند.

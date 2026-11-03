# موشن ۱۰ ثانیه‌ای «تور آفرود و کمپ» — وایکینگ آفرود

خروجی: MP4 عمودی 1080×1920، ۶۰ فریم بر ثانیه، ۱۰ ثانیه، بدون صدا (برای ریلز و استوری).

| زمان | صحنه | متن |
|---|---|---|
| 0–3.6s | ماشین آفرود در جادهٔ خاکی کوهستان (`s1.png`) | وایکینگ آفرود · جاده تموم می‌شه… |
| 3.3–6.9s | کمپ شبانه زیر کهکشان (`s2.png`) | ماجرا تازه شروع می‌شه |
| 6.6–10s | آتش کمپ و کتری (`s3.png`) | تور آفرود و کمپ · برای رزرو دایرکت بده |

- عکس‌ها با Figma `generate_image` (مدل `gemini-3.1-flash-image`) ساخته شده‌اند و بدون متن هستند. متن فارسی را با فونت Vazirmatn (`vazir.woff2`) روی عکس‌ها می‌گذاریم.
- `index.html` یک تایم‌لاین قطعی دارد: `window.seek(t)` فریمِ لحظهٔ t را می‌سازد. اگر صفحه را در مرورگر باز کنی، خودکار پخش می‌شود.
- رندر:
  ```bash
  node brands/viking-offroad/motion/tour-camp-10s/render.mjs "$PWD/brands/viking-offroad/motion/tour-camp-10s"
  ffmpeg -framerate 60 -i brands/viking-offroad/motion/tour-camp-10s/frames/%04d.jpg \
    -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart viking-tour-camp-motion.mp4
  ```
  پوشهٔ `frames/` موقت است و نباید commit شود.

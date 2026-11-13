# Design Systems

مجموعه‌ای از **سیستم‌های طراحی حرفه‌ای و کامل** که آماده експورت و استفاده در پروژه‌های واقعی هستند.

هر سیستم شامل:

| فایل/پوشه | توضیح |
|-----------|-------|
| `tokens/css-variables.css` | توکن‌های رنگ، تایپوGRAPHY، فاصله، سایه و بازه به صورت CSS custom properties |
| `tokens/design-tokens.json` | توکن‌های طراحی برای import در ابزارهای 디자인 و جاوااسکریپت |
| `components/buttons.css` | استایل دکمه‌ها (primary, secondary, outline, ghost, destructive و ...) |
| `components/inputs.css` | استایل ورودی‌ها، انتخاب،textarea و چک‌باکس |
| `components/cards.css` | استایل کارت‌ها، badge، آواتار و شبکه (grid) |
| `docs/MASTER.md` | مستندات کامل: قوانین، ضدالگوها (anti-patterns)، چک‌لیست پیش از تحویل |
| `preview.html` | صفحه نمایش زنده برای تست سریع کامپوننت‌ها |

---

## سیستم‌های طراحی موجود

| نام |ρωνت | بهترین مورد استفاده | دایره‌های طراحی |
|-----|------|------------------|----------------|
| **Prism** | Bright / Enterprise | SaaS، داشبورد ارگانیزیشن، CRM | Variance 6/10 \| Motion 5/10 \| Density 5/10 |
| **Obsidian** | Dark / Premium | برند لوکس، پلتفرم مالی، داشبورد historians | Variance 7/10 \| Motion 6/10 \| Density 4/10 |
| **Vivid** | Colorful / Consumer | استارتاپ B2C، اپ موبایل-اول، سایت مارکتینگ | Variance 8/10 \| Motion 7/10 \| Density 6/10 |
| **Slate** | Technical / DevTools | ابزار توسعه‌دهنده، مستندات (docs)، مانیتورینگ | Variance 5/10 \| Motion 4/10 \| Density 8/10 |

---

## نحوه استفاده (سریع)

```html
<link rel="stylesheet" href="design-systems/prism/tokens/css-variables.css">
<link rel="stylesheet" href="design-systems/prism/components/buttons.css">
<link rel="stylesheet" href="design-systems/prism/components/inputs.css">
<link rel="stylesheet" href="design-systems/prism/components/cards.css">

<button class="btn btn-primary btn-lg">شروع کنید</button>
```

یا استفاده از توkn‌های JSON در ابزارهای طراحی (Figma variables، Style Dictionary، Expo، و غیره).

---

## پیش‌نیازهای پیش از تحویل (همه سیستم‌ها)

قبل از تحویل هر کد UI، چک‌لیست زیر در `docs/MASTER.md` هر سیستم Verify شود:

- [ ] هیچ Emoji به عنوان آیکون نیست (فقط SVG)
- [ ] همه آیکون‌ها از مجموعه هم‌نام (Lucide / Heroicons / Phosphor)
- [ ] `cursor:pointer` روی همه عناصرب کلیک‌پذیر
- [ ] حالت hover با ترانزیشنminster 150–400ms
- [ ] حالت focus قابل دیدن برای ناوبری کیبورد
- [ ] contraste متن حداقل 4.5:1 (WCAG AA)
- [ ] `prefers-reduced-motion` احترام شده
- [ ] ریسپانسیو: 375px، 768px، 1024px، 1440px
- [ ] Scroll افقی در موبایل وجود ندارد

---

## لایسنس

MIT — Free to use in commercial and personal projects.

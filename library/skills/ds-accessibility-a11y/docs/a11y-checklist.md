# چک‌لیست دسترسی (a11y) — WCAG AA

## فوکوس و صفحه‌کلید
- [ ] تمام دکمه‌ها `cursor: pointer` و `:focus-visible` دارند
- [ ] focus ring ۲px با رنگ `--ds-color-focus-ring` قابل دیدن است
- [ ] همه عناصرب کلیک‌پذیر keyboard-focusable هستند
- [ ] ترتیب Tab منطقی است
- [ ] modal focus-trap دارد و کلید Escape آن را می‌بندد

## Kontrast و رنگ
- [ ] متن اصلی روی پس‌زمینه حداقل ۴٫۵:۱ (WCAG AA)
- [ ] متن-muted حداقل ۳:۱
- [ ] رنگ تنها carrier معنا نیست (همیشه با آیکون/متن همراه)

## ARIA و Label
- [ ] همه ورودی‌ها دارای `<label>` یا `aria-label` هستند
- [ ] دکمه‌های آیکون‌دار `aria-label` دارند
- [ ] ورودی‌ها `aria-describedby` به helper/error دارند
- [ ] تصاویر meaningful دارای `alt`، Ornamental دارای `alt=""`

## RTL و زبان
- [ ] `<html lang="fa" dir="rtl">` وجود دارد
- [ ] اعداد فارسی و تاریخ شمسی پشتیبانی می‌شود (در에서도 مورد نیاز)

## Motion و Responsive
- [ ] `prefers-reduced-motion: reduce` respected است
- [ ] در ۳۷۵px+ scroll افقی وجود ندارد
- [ ] touch target حداقل ۴۴×۴۴ پیکسل در موبایل
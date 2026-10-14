<!-- Hermes PR (hermes/#047). Delete sections that do not apply. -->

## شرح / What & why


## معیار پذیرش / Acceptance
- [ ] 

## تست محلی / Local checks
- [ ] `bash hermes/tests/setup_validation.sh`
- [ ] `npm run check --prefix hermes && npm test --prefix hermes`
- [ ] `bash -n hermes/setup.sh` (و ShellCheck بدون warning جدید)

## امنیت / Security
- [ ] هیچ راز/token واقعی در diff نیست؛ فقط `*.example`
- [ ] لاگ‌ها و پیام‌های خطا مقدار راز را چاپ نمی‌کنند

## انتشار / Rollout
- مسیر انتشار (Worker / Oracle / فقط repo):
- ریسک و راه برگشت:

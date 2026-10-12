/** Deliberately visible until a real authenticated backend/data migration is deployed. */
export function LocalOnlyNotice() {
  return (
    <p className="local-only-notice" role="note">
      نسخهٔ محلی: ورود و داده‌ها سمت سرور محافظت نمی‌شوند. اطلاعات واقعی یا حساس وارد نکنید؛ پس از تازه‌سازی صفحه دوباره وارد شوید.
    </p>
  );
}

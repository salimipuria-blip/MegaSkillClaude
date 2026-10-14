# Release checklist

- [ ] All CI checks passing
- [ ] Required secrets present in GitHub (ENGINE_TOKEN, VERCEL_TOKEN, SUPABASE_KEY, TELEGRAM_BOT_TOKEN if needed)
- [ ] Staging deploy successful and smoke tests passed
- [ ] Migration scripts (if any) applied on staging
- [ ] Rollback plan documented (how to revert deployment & DB)
- [ ] Release notes drafted and CHANGELOG updated
- [ ] Owner explicitly authorizes merge/release (passing CI alone is not approval)

Verify secret presence in repository/deployment settings; never paste values into
issues, PRs, screenshots, or CI logs. Fork PRs must not require production secrets.

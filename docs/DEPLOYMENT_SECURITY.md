# Deployment and security operations

## Scope and permissions

The `Security and scheduled health` workflow runs an offline tracked-file scan on
PRs and pushes to main. Every Monday at 06:23 UTC (and on manual dispatch), it
also runs the dependency-free repository health script on the default branch.
This is repository health, **not live service uptime monitoring**. No production
URL is contacted, package installed, secret loaded or deployment triggered.
Workflow permissions are read-only; checkout does not persist Git credentials.
GitHub may delay scheduled runs. Review failures in Actions; no external alert
service or automatic repair/merge is configured.

## Scanner contract and limitations

Run `python3 scripts/scan_secrets.py` from any directory. It examines all tracked
working-tree regular files, including documentation and vendored skills. It
recognizes selected GitHub token formats, AWS access-key IDs, Telegram bot tokens
and private-key headers. Files over 8 MiB or unreadable files fail the check.
Symlinks are not followed. Only the exact publicly documented, nonfunctional AWS
example `AKIAIOSFODNN7EXAMPLE` is excluded; directories are never exempted.

Logs contain rule names and file ordinals only, never paths, matching lines,
credential values or exception details. To locate an ordinal, privately inspect
`git ls-files -z` using the same zero-based order; do not dump source lines into
CI logs. Do not add real credentials to test fixtures. Tests construct dummy
patterns at runtime and verify detection, redaction and fail-closed behavior.

This intentionally narrow detector is **not a complete secret scanner**: arbitrary
API keys/passwords, split/encoded values and other providers may be missed. It
does not scan Git history, ignored/untracked files or remote settings. Enable
GitHub native secret scanning/push protection where available and arrange a
separate history audit; these account settings were not changed by this PR.
A green scan does not prove the absence of secrets. PR authors can modify the
scanner/workflow, so required owner review and branch rules remain essential.

## Response to a finding

1. Stop publication. Identify the file privately; do not paste its contents into
   issues, chat, PR bodies, screenshots or Actions logs.
2. Revoke/rotate any real credential at its provider immediately. Removing it
   from the latest file does not revoke it or erase history.
3. Remove the value and use CI/deployment secret settings. Coordinate history
   cleanup separately if needed; never force-push history as an automatic fix.
4. Re-run scanner, regression tests and affected project CI. A public example
   exception needs explicit review and must match only an exact inert value.

## Release gate

Use [the release checklist](../.github/RELEASE_CHECKLIST.md). Passing CI does not
authorize merging or deployment. An owner must review the scoped diff, verify
required secrets exist without exposing their values, authorize release and
confirm staging smoke tests and rollback readiness.

- **Hermes:** follow [its README](../hermes/README.md) and
  [hardening rollout notes](REPO_HARDENING.md). Preserve original KV data and
  verify SQLite bindings/migrations before deployment. Never invoke secret-sync
  lifecycle hooks during tests. No credentials or account bindings are changed
  by this workflow.
- **Vercel projects:** verify the Git repository, root directory, branch and
  environment in each existing project's deployment settings. Check the preview
  before authorizing production. A Git merge is not proof of delivery; automatic
  main-branch deployment integrations may already exist.
- **Supabase / Orchestrator / CHAM:** do not apply schema changes or assume live
  RLS is enabled merely because SQL exists in Git. Take backups, test permission
  boundaries and recovery on staging, then obtain migration approval.

For rollback, select the previously verified deployment in the service's normal
controls and verify it is compatible with current data/schema. Database rollback
requires its own reviewed plan and tested backup; a Git revert is not a database
restore. Never automatically delete stored user data.

## Workflow rollback

Revert the scoped security-operations commit through a reviewed PR. That removes
the new workflow, scanner, tests and this guide; it changes no service deployment
or database. Before merge, inspect GitHub checks. Remote schedules and account
settings cannot be verified solely by local tests.

# Changelog

All notable changes to this repository are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [CalVer](https://calver.org/) `YYYY.MM.PATCH` for repository-wide
releases; each app keeps its own `package.json` version.

## [Unreleased]

## [2026.11.0] — 2026-11-04

Audit-remediation release: the repository and the Vercel production deployment
were brought up to a documented professional baseline. Every item below was
verified by running the tool named next to it (see `docs/audit/`).

### Added

* `LICENSE` (MIT) plus an explicit scope note: vendored skills and assets keep
  their upstream licenses. Fixes the "no root license" finding.
* `SECURITY.md` — disclosure policy, response SLAs, in/out-of-scope list,
  security model and secret-rotation runbook.
* `THIRD-PARTY-NOTICES.md` — generated inventory of vendored skill sources,
  their SPDX licenses and the pinned upstream commit.
* `library/github-skills/PROVENANCE.json` — per-skill `sha256` and upstream
  `ref`/`commit` for every vendored skill (supply-chain drift detection).
* `.github/workflows/security.yml` — secret scan, Semgrep, zizmor, action
  pinning contract, dependency audit and SBOM, all SHA-pinned, read-only.
* `tests/test_audit_contract.py` — executable contract: action SHA pinning,
  least-privilege workflow permissions, required security files, production
  security headers, and a test that forbids piping a download into a shell.
* `psk/api/_limits.mjs` + `psk/tests/limits.test.mjs` — per-client token-bucket
  rate limiting (health 120/min, skills 60/min, tasks 12/min), `429` with
  `Retry-After`, unit-tested window/reset/eviction behaviour.
* `docs/audit/` — machine-readable output of the scanners that were actually
  run (Semgrep, detect-secrets, zizmor, Bandit, SBOM, npm audit).

### Changed

* **All 29 GitHub Actions references pinned to full commit SHAs** with a
  version comment (`actions/checkout@11d5960a… # v4.4.0`, etc.) and
  `persist-credentials: false` on every checkout (`zizmor`: 0 findings).
* Every CI job got `timeout-minutes: 20`; Dependabot got a 7-day cooldown and
  grouped updates (npm + actions).
* `psk/vercel.json` now sends HSTS, `X-Frame-Options: DENY`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy` and a Content-Security
  Policy for the static site, on top of the existing nosniff/Referrer-Policy.
* `/api/*` handlers rate-limit before authentication, so token guessing is
  bounded; `X-RateLimit-*` headers are returned on every call.
* `hermes/setup.sh` downloads the installer to a temporary file, verifies an
  optional `HERMES_INSTALLER_SHA256`, and executes it from disk instead of
  piping `curl` into `bash`.
* `scripts/repo_health_check.sh` uses the correct `**/.env.example` glob (the
  old `*.env.example` pattern never matched) and now also requires `LICENSE`,
  `SECURITY.md` and the audit contract test.

### Fixed

* `docs/audit/starred-repos-2026-11.csv` / `docs/STARRED_REPOS_AUDIT_2026-11.md`
  and `docs/AUDIT_TOOLKIT_2026-11.md` are now tracked, so the audit evidence
  ships with the code it describes.

### Security notes

* No secret was found in tracked files or history (`detect-secrets`,
  `gitleaks`-compatible rules, `Semgrep p/secrets`); the 9 regex hits from the
  earlier starred-repo sweep were test fixtures inside third-party repos.
* The Vercel production token (`ENGINE_TOKEN`) was not read, printed or
  rotated in this release; only its presence was verified via a `401`/`200`
  probe.

## [0.4.0] — 2026-11-03

* `docs/REPO_DEEP_ANALYSIS_2026-11-03.md`: 14-section deep analysis of the
  repository with a P0–P3 remediation backlog.
* `psk` test suite measured at 97.9 % line / 88.3 % branch coverage.

## [0.3.0] — prior

* Hermes 100-task program, wave W0 landed (`979dac8f`).

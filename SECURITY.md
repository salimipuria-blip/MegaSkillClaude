# Security Policy

## Supported versions

| Component | Location | Support |
| --- | --- | --- |
| MEGA SKILLS 3000 engine (Vercel) | `psk/` | current `main` only |
| Hermes agent runtime | `hermes/` | current `main` only |
| Orchestrator / Supabase functions | `orchestrator/` | current `main` only |
| Skill library content | `library/` | current `main` only |

Older commits, forks and private branches are not supported. There are no
back-ported security fixes: a fix lands on `main` and is deployed from there.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

* Email: **salimipuria@gmail.com** (subject: `SECURITY — MegaSkillClaude`)
* Or use GitHub → *Security* → *Report a vulnerability* (private advisory) on
  `salimipuria-blip/MegaSkillClaude`.

Include: affected URL/file, steps to reproduce, impact, and any proof of
concept. If you need encryption, say so in the first mail and a key will be
provided.

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | 72 hours |
| Triage + severity (CVSS 3.1) | 7 days |
| Fix for Critical / High | 14 days |
| Fix for Medium / Low | next scheduled release |
| Public disclosure | after a fix ships, coordinated with you |

This is a volunteer-run personal project: no bug bounty, but credit in
`CHANGELOG.md` if you want it.

## In scope

* `https://psk-3000.vercel.app` and its aliases (`poors-3000.vercel.app`)
  — the `/api/*` serverless functions and the static site.
* The repository itself: secrets in history, unsafe CI workflows, supply-chain
  issues in vendored skills, dependency confusion.
* Hermes installer (`hermes/setup.sh`) and the orchestrator gateway.

## Out of scope

* Findings that need a compromised client device, physical access, or a
  malicious browser extension.
* Missing "best practice" headers on a non-production preview URL.
* Rate-limit or DoS reports produced with volumetric traffic.
* Content of a skill written by a third party that only repeats public advice
  (report the *code path* instead: `library/github-skills/PROVENANCE.json`).
* Automated scanner output with no demonstrated impact.

## Security model (what is already enforced)

* `/api/tasks` and `/api/skills` fail closed: `ENGINE_TOKEN` (24+ chars) must be
  configured on the server, and every call must present
  `Authorization: Bearer <token>` compared in constant time.
* Request bodies are capped (4 000 chars input, 12 000 bytes body), methods are
  pinned, and responses are `Cache-Control: no-store`.
* Skills are treated as untrusted reference text: skill bodies cannot grant
  tools, reach the network, or override the system prompt.
* No secrets are committed; `.env*` is blocked by pre-commit, CI and
  `.gitignore`, and every push/PR is scanned by the secret scanner job.
* All GitHub Actions are pinned to full commit SHAs with a version comment.

## Rotating a leaked secret

1. Revoke at the provider first (Groq / Gemini / Cerebras / OpenRouter, Supabase,
   GitHub, Vercel).
2. `vercel env rm <NAME> production && vercel env add <NAME> production`.
3. Redeploy production, then confirm `/api/health` is 200 with the new token.
4. Record the rotation in `CHANGELOG.md` (date + which key, never the value).

---

## خلاصهٔ فارسی

اگر آسیب‌پذیری پیدا کردی، **issue عمومی باز نکن**. به `salimipuria@gmail.com`
ایمیل بزن یا از تب Security همان ریپو گزارش خصوصی بده. پاسخ حداکثر ۷۲ ساعت،
رفع نقص بحرانی تا ۱۴ روز. دامنهٔ بررسی: `psk-3000.vercel.app`، خودِ ریپو،
اسکریپت نصب Hermes و گیت‌وی orchestrator. گزارش‌های اسکنر بدون اثبات تأثیر
پذیرفته نمی‌شوند.

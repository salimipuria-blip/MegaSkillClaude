"""Executable audit contract for this repository (stdlib only, no network).

Every check here maps to a finding from docs/REPO_DEEP_ANALYSIS_2026-11-03.md or
docs/STARRED_REPOS_AUDIT_2026-11.md. If a check fails, the finding is back.
The point is that "we fixed the audit" is not a claim in a document, it is a
test that runs on every push.

    python3 -m unittest tests.test_audit_contract -v
"""
from __future__ import annotations

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_DIRS = [ROOT / ".github" / "workflows", ROOT / "orchestrator" / ".github" / "workflows"]
SHA_PIN = re.compile(r"^\s*(?:-\s+)?uses:\s*(?P<action>[\w.-]+/[\w.-]+)@(?P<ref>\S+)(?P<rest>.*)$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
FIRST_PARTY_SKIP = {
    "library", "docs", "brand", "brands", "node_modules", ".git", "psk/data",
    # Vendored third-party skill references (Azure/Terraform instructions) that
    # are prose we never execute; they are catalogued in THIRD-PARTY-NOTICES.md.
    "plugins/mega-skills-router/skills",
}


def workflow_files() -> list[Path]:
    files: list[Path] = []
    for folder in WORKFLOW_DIRS:
        if folder.is_dir():
            files.extend(sorted(folder.glob("*.yml")))
            files.extend(sorted(folder.glob("*.yaml")))
    return files


def rel_parts_test(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    return bool(rel.parts) and rel.parts[0] in {"tests", "plugins"}


def first_party_text_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if any(str(rel).startswith(prefix) for prefix in FIRST_PARTY_SKIP):
            continue
        if path.suffix.lower() in {
            ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2",
            ".ttf", ".pdf", ".zip", ".mp4", ".mov", ".mp3", ".bin", ".tgz",
        }:
            continue
        try:
            if path.stat().st_size > 2_000_000:
                continue
        except OSError:
            continue
        files.append(path)
    return files


class WorkflowPinning(unittest.TestCase):
    def test_every_action_is_pinned_to_a_commit_sha(self):
        unpinned = []
        for path in workflow_files():
            for line in path.read_text(encoding="utf-8").splitlines():
                m = SHA_PIN.match(line)
                if not m:
                    continue
                if not HEX40.match(m.group("ref")):
                    unpinned.append(f"{path.relative_to(ROOT)}: {line.strip()}")
                elif "#" not in m.group("rest"):
                    unpinned.append(f"{path.relative_to(ROOT)}: missing version comment: {line.strip()}")
        self.assertEqual(unpinned, [], "every `uses:` must be owner/repo@<40-hex-sha> # vX")

    def test_checkout_never_persists_credentials(self):
        offenders = []
        for path in workflow_files():
            lines = path.read_text(encoding="utf-8").splitlines()
            for i, line in enumerate(lines):
                if "uses: actions/checkout@" not in line:
                    continue
                block = "\n".join(lines[i:i + 4])
                if "persist-credentials: false" not in block:
                    offenders.append(f"{path.relative_to(ROOT)}:{i + 1}")
        self.assertEqual(offenders, [], "checkout steps must set persist-credentials: false")

    def test_workflows_declare_least_privilege_permissions(self):
        offenders = []
        for path in workflow_files():
            text = path.read_text(encoding="utf-8")
            if not re.search(r"^permissions:", text, re.MULTILINE):
                offenders.append(f"{path.relative_to(ROOT)}: no top-level permissions")
            if re.search(r"permissions:\s*write-all", text):
                offenders.append(f"{path.relative_to(ROOT)}: write-all")
            if re.search(r"^\s+contents:\s*write\s*$", text, re.MULTILINE):
                offenders.append(f"{path.relative_to(ROOT)}: contents: write")
        self.assertEqual(offenders, [])

    def test_every_job_has_a_timeout(self):
        offenders = []
        for path in workflow_files():
            lines = path.read_text(encoding="utf-8").splitlines()
            for i, line in enumerate(lines):
                if not line.startswith("    runs-on:"):
                    continue
                job_head = line
                tail = lines[i + 1:i + 8]
                if not any(l.startswith("    timeout-minutes:") for l in tail):
                    offenders.append(f"{path.relative_to(ROOT)}:{i + 1} {job_head.strip()}")
        self.assertEqual(offenders, [])


class RequiredFiles(unittest.TestCase):
    def test_security_baseline_files_exist_and_are_not_empty(self):
        required = [
            "LICENSE", "SECURITY.md", "CHANGELOG.md", "THIRD-PARTY-NOTICES.md",
            ".gitleaks.toml", ".semgrepignore", ".semgrep/rules.yml",
            "psk/vercel.json", "psk/api/_limits.mjs", "psk/tests/limits.test.mjs",
            "library/github-skills/PROVENANCE.json",
            "docs/audit/starred-repos-2026-11.csv",
            "docs/STARRED_REPOS_AUDIT_2026-11.md", "docs/AUDIT_TOOLKIT_2026-11.md",
        ]
        missing = [f for f in required if not (ROOT / f).is_file() or (ROOT / f).stat().st_size == 0]
        self.assertEqual(missing, [])

    def test_license_is_a_real_license(self):
        text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("MIT License", text)
        self.assertIn("WITHOUT WARRANTY OF ANY KIND", text.upper())
        self.assertIn("library/", text, "scope note must exclude vendored material")


class ProductionHeaders(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / "psk" / "vercel.json").read_text(encoding="utf-8"))

    def headers_for(self, source: str) -> dict[str, str]:
        out: dict[str, str] = {}
        for entry in self.config.get("headers", []):
            if entry.get("source") == source:
                for pair in entry.get("headers", []):
                    out[pair["key"].lower()] = pair["value"]
        return out

    def test_global_headers_are_hardened(self):
        global_headers = {}
        for entry in self.config.get("headers", []):
            if entry.get("source") == "/(.*)":
                for pair in entry.get("headers", []):
                    global_headers[pair["key"].lower()] = pair["value"]
        for header in (
            "x-content-type-options", "referrer-policy", "strict-transport-security",
            "x-frame-options", "permissions-policy", "cross-origin-opener-policy",
        ):
            self.assertIn(header, global_headers, f"missing {header}")
        self.assertEqual(global_headers["x-frame-options"], "DENY")
        self.assertGreaterEqual(
            int(re.search(r"max-age=(\d+)", global_headers["strict-transport-security"]).group(1)),
            31_536_000,
        )

    def test_pages_get_a_content_security_policy_and_api_does_not(self):
        # The catch-all block also carries a bare `frame-ancestors 'none'` CSP (defence in
        # depth alongside X-Frame-Options), so pick the full page policy, not just any CSP.
        page_csp = [h["value"] for e in self.config["headers"]
                    if e["source"] != "/api/(.*)"
                    for h in e["headers"]
                    if h["key"] == "Content-Security-Policy" and "default-src" in h["value"]]
        self.assertTrue(page_csp, "the static site needs a CSP")
        csp = page_csp[0]
        self.assertIn("default-src 'self'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn("https://fonts.googleapis.com", csp, "fonts must be self-hosted")

    def test_no_wildcard_cors_and_bounded_duration(self):
        raw = json.dumps(self.config).lower()
        self.assertNotIn("access-control-allow-origin\", \"value\": \"*", raw)
        for cfg in self.config.get("functions", {}).values():
            self.assertLessEqual(cfg.get("maxDuration", 0), 60)


class SecretHygiene(unittest.TestCase):
    PRIVATE_KEY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----")
    CLOUD_KEY = re.compile(
        r"\b(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|"
        r"sk-live-[A-Za-z0-9]{16,}|sk_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{35})\b"
    )
    JWT = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")

    def test_no_private_keys_or_cloud_credentials_in_first_party_code(self):
        hits = []
        for path in first_party_text_files():
            rel = path.relative_to(ROOT)
            if rel.parts and rel.parts[0] == "tests":
                continue
            # Detector definitions embed the very key shapes they search for.
            if path.name in {"scan_secrets.py", "scan_third_party_skills.py"}:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if self.PRIVATE_KEY.search(text) or self.CLOUD_KEY.search(text):
                hits.append(str(rel))
        self.assertEqual(hits, [])

    def test_supabase_jwts_are_anon_only_and_never_service_role(self):
        """A Supabase anon key is public by design; a service_role key is a full bypass."""
        import base64
        roles = {}
        for path in first_party_text_files():
            if path.suffix not in {".js", ".mjs", ".ts", ".py", ".json", ".html"}:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for token in self.JWT.findall(text):
                payload = token.split(".")[1]
                payload += "=" * (-len(payload) % 4)
                try:
                    claims = json.loads(base64.urlsafe_b64decode(payload))
                except Exception:  # noqa: BLE001 - not a JWT we can read
                    continue
                roles.setdefault(str(rel := claims.get("role")), set()).add(str(path.relative_to(ROOT)))
                self.assertNotEqual(claims.get("role"), "service_role",
                                    f"service_role key in {path.relative_to(ROOT)}")
        for role in roles:
            self.assertIn(role, {"anon", "authenticated", "None"},
                          f"unexpected JWT role {role}: {sorted(roles[role])}")

    def test_no_shell_pipe_from_network(self):
        pattern = re.compile(r"\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:bash|sh|zsh)\b")
        hits = []
        for path in first_party_text_files():
            if path.suffix not in {".sh", ".bash", ".zsh", ".yml", ".yaml", ".mjs", ".js", ".py"}:
                continue
            # Documentation and detector tests quote the pattern they forbid.
            if path.suffix == ".md" or rel_parts_test(path):
                continue
            # Detector scripts embed the pattern they are looking for.
            if path.name in {"scan_secrets.py", "scan_third_party_skills.py"}:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for i, line in enumerate(text.splitlines(), 1):
                if pattern.search(line):
                    hits.append(f"{path.relative_to(ROOT)}:{i}")
        self.assertEqual(hits, [])

    def test_no_tracked_dotenv_files(self):
        try:
            out = subprocess.run(
                ["git", "ls-files", "--", ".env", ".env.*", "**/.env", "**/.env.*"],
                cwd=ROOT, capture_output=True, text=True, timeout=60, check=True,
            ).stdout
        except (subprocess.SubprocessError, OSError):
            self.skipTest("git is not available")
        offenders = [f for f in out.split() if not f.endswith(".example")]
        self.assertEqual(offenders, [])


class SupplyChain(unittest.TestCase):
    def setUp(self):
        self.prov = json.loads(
            (ROOT / "library" / "github-skills" / "PROVENANCE.json").read_text(encoding="utf-8")
        )

    def test_every_indexed_skill_is_hashed(self):
        totals = self.prov["totals"]
        self.assertEqual(totals["present"], totals["indexed"])
        self.assertEqual(totals["missing"], 0)
        index = json.loads((ROOT / "library" / "github-skills" / "INDEX.json").read_text(encoding="utf-8"))
        self.assertEqual(totals["indexed"], len(index))
        bad = [s["local"] for s in self.prov["skills"]
               if not re.fullmatch(r"[0-9a-f]{64}", s.get("sha256") or "")]
        self.assertEqual(bad, [])

    def test_every_repository_is_pinned_to_an_upstream_commit(self):
        unpinned = [repo for repo, info in self.prov["repos"].items() if not info.get("upstream_commit")]
        self.assertEqual(unpinned, [])

    def test_sbom_is_current(self):
        sbom_path = ROOT / "docs" / "audit" / "sbom.cdx.json"
        self.assertTrue(sbom_path.is_file(), "run node scripts/audit/make_sbom.mjs")
        sbom = json.loads(sbom_path.read_text(encoding="utf-8"))
        self.assertEqual(sbom["bomFormat"], "CycloneDX")
        self.assertGreater(len(sbom["components"]), 0)
        before = sbom_path.read_text(encoding="utf-8")
        subprocess.run(
            ["node", "scripts/audit/make_sbom.mjs"],
            cwd=ROOT, check=True, capture_output=True, timeout=120,
        )
        self.assertEqual(before, sbom_path.read_text(encoding="utf-8"), "SBOM is stale; regenerate it")


class RuntimeContract(unittest.TestCase):
    def test_every_api_handler_applies_the_rate_limiter(self):
        for name in ("tasks.js", "skills.js", "health.js"):
            text = (ROOT / "psk" / "api" / name).read_text(encoding="utf-8")
            self.assertIn("limit(req,res,", text, f"{name} must call limit(req,res,...)")

    def test_api_handlers_fail_closed_on_method_and_token(self):
        core = (ROOT / "psk" / "api" / "_core.mjs").read_text(encoding="utf-8")
        self.assertIn("timingSafeEqual", core)
        self.assertIn("503", core)

    def test_fonts_are_self_hosted(self):
        for css in (ROOT / "psk" / "public").rglob("*.css"):
            text = css.read_text(encoding="utf-8", errors="ignore")
            self.assertNotIn("fonts.googleapis.com/css", text, f"{css} must not import Google Fonts")
        self.assertTrue((ROOT / "psk" / "public" / "puria" / "fonts" / "fonts.css").is_file())


if __name__ == "__main__":
    unittest.main()

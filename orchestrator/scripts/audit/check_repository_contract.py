from __future__ import annotations
import re
from pathlib import Path

FORBIDDEN_NAMES = {'.env', 'github-admin-token.env'}
FORBIDDEN_SUFFIXES = {'.zip', '.pem', '.p12', '.pfx'}
SECRET_PATTERNS = [
    re.compile(r"(?i)\b(service_role|service-role|github_admin_token)\b\s*[:=]\s*['\"][^'\"]{8,}"),
    re.compile(r'\bgh[pousr]_[A-Za-z0-9_]{20,}\b'),
    re.compile(r'\bsb_secret_[A-Za-z0-9_-]{20,}\b'),
    # hermes/#027, #079: high-confidence shapes only, so test fixtures and
    # documentation examples (which never match these lengths) stay green.
    re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
    re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----'),
    re.compile(r'\bAIza[0-9A-Za-z_-]{35}\b'),
    re.compile(r'\b[0-9]{8,}:[A-Za-z0-9_-]{35}\b'),
]


def _is_cache(path: Path) -> bool:
    return bool(set(path.parts) & {'.git', '.pytest_cache', '__pycache__', '.supabase', 'node_modules'})


def assert_repository_contract(root: Path) -> list[str]:
    errors: list[str] = []
    for path in root.rglob('*'):
        if not path.is_file() or _is_cache(path.relative_to(root)):
            continue
        rel = path.relative_to(root)
        if path.name in FORBIDDEN_NAMES:
            errors.append(f'forbidden file: {rel}')
        if path.suffix.lower() in FORBIDDEN_SUFFIXES:
            errors.append(f'forbidden binary/archive: {rel}')
        if path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        if any(p.search(text) for p in SECRET_PATTERNS):
            errors.append(f'possible secret in: {rel}')
    return errors


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    errors = assert_repository_contract(root)
    if errors:
        raise SystemExit('\n'.join(errors))
    print('repository contract: OK')

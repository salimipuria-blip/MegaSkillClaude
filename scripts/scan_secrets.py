#!/usr/bin/env python3
"""Offline, redacted scan of tracked working-tree files for high-confidence secrets.
Not a replacement for provider revocation, GitHub secret scanning or a history audit.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RULES = {
    'github-token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{82,255})\b'),
    'aws-access-key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'telegram-token': re.compile(rb'\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b'),
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
}
MAX_BYTES = 8 * 1024 * 1024


# AWS publishes this exact nonfunctional ID in documentation. No path-wide exclusions.
PUBLIC_EXAMPLES = {b'AKIAIOSFODNN7EXAMPLE'}


def findings(data):
    return [name for name, pattern in RULES.items()
            if any(match.group() not in PUBLIC_EXAMPLES for match in pattern.finditer(data))]


def scan(root=ROOT):
    paths = subprocess.run(['git', 'ls-files', '-z'], cwd=root, check=True,
                           stdout=subprocess.PIPE).stdout.split(b'\0')
    matched = 0
    errors = 0
    for index, raw in enumerate(paths):
        if not raw:
            continue
        path = root / raw.decode('utf-8', errors='surrogateescape')
        # Symlinks are not followed: their targets may be outside the checkout.
        if path.is_symlink():
            continue
        try:
            with path.open('rb') as source:
                data = source.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                print(f'ERROR tracked-file #{index}: exceeds scan size limit', file=sys.stderr)
                errors += 1
                continue
            for rule in findings(data):
                # Do not print paths, source lines, values or exception text.
                print(f'FAIL tracked-file #{index}: {rule}', file=sys.stderr)
                matched += 1
        except OSError:
            print(f'ERROR tracked-file #{index}: unreadable', file=sys.stderr)
            errors += 1
    print(f'Secret scan: {matched} finding(s), {errors} read/size error(s).')
    return 1 if matched or errors else 0


if __name__ == '__main__':
    try:
        sys.exit(scan())
    except (OSError, subprocess.CalledProcessError):
        print('ERROR unable to enumerate tracked files', file=sys.stderr)
        sys.exit(2)

"""Distinguish intentionally unmaterialized historical artifacts from a broken partial install."""
from __future__ import annotations

import json
from pathlib import Path


def can_skip_materialization(root: Path) -> bool:
    metadata = root / 'skills/registry/BASELINE_ARTIFACTS.json'
    if not metadata.is_file():
        return False
    policy = json.loads(metadata.read_text(encoding='utf-8'))
    if policy.get('materialization_required_before_strict_test') is not True:
        return False
    # An interrupted installation or a missing file in an existing install must fail, not skip.
    return not any((root / path).exists() for path in [
        'skills/registry/skills-manifest.json', 'skills/installed', 'skills/original',
    ])

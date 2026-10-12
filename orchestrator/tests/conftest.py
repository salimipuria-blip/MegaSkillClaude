from pathlib import Path

import pytest
from scripts.audit.materialization import can_skip_materialization

ROOT = Path(__file__).resolve().parents[1]


def pytest_addoption(parser):
    parser.addoption('--require-materialized-skills', action='store_true',
                     help='Fail installation tests when the historical external artifacts are missing')


def pytest_collection_modifyitems(config, items):
    if config.getoption('--require-materialized-skills') or not can_skip_materialization(ROOT):
        return
    reason = ('Historical Mega Skills artifacts are not materialized in this checkout; '
              'see skills/registry/BASELINE_ARTIFACTS.json. Use --require-materialized-skills for the strict gate.')
    for item in items:
        if item.get_closest_marker('materialized_skills'):
            item.add_marker(pytest.mark.skip(reason=reason))

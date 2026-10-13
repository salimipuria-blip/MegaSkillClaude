import json

from scripts.audit.materialization import can_skip_materialization


def policy(root):
    path = root / 'skills/registry/BASELINE_ARTIFACTS.json'
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({'materialization_required_before_strict_test': True}))


def test_only_an_explicitly_unmaterialized_snapshot_can_skip(tmp_path):
    assert not can_skip_materialization(tmp_path)
    policy(tmp_path)
    assert can_skip_materialization(tmp_path)


def test_partial_installs_are_not_silently_skipped(tmp_path):
    policy(tmp_path)
    for path in ['skills/installed', 'skills/original']:
        directory = tmp_path / path
        directory.mkdir()
        assert not can_skip_materialization(tmp_path)
        directory.rmdir()
    (tmp_path / 'skills/registry/skills-manifest.json').write_text('{}')
    assert not can_skip_materialization(tmp_path)


def test_a_missing_artifact_without_the_documented_policy_must_fail(tmp_path):
    policy(tmp_path)
    (tmp_path / 'skills/registry/BASELINE_ARTIFACTS.json').write_text('{}')
    assert not can_skip_materialization(tmp_path)

"""Build/check the portable plugin from canonical project skills, without executing imported code.

Run from any directory: python scripts/sync_skill_library.py [--check]
The project index is canonical. Companion files stay duplicated for portable installation, but
CI verifies their bytes; edit library/ or psk/data/, not the generated plugin references.
No originals or unrecognized files are deleted.
"""
from __future__ import annotations

import argparse
import copy
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = Path('.claude/skills/mega-skills-router')
PLUGIN = Path('plugins/mega-skills-router/skills/mega-skills-router')


def _inside(root: Path, relative: str | Path) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f'path escapes repository: {relative}')
    return path


def _json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=1) + '\n').encode('utf-8')


def annotate(index: dict, github: list[dict]) -> dict:
    result = copy.deepcopy(index)
    known = {skill['name']: bool(skill.get('incomplete')) for skill in github}
    for skill in result['skills']:
        if skill.get('origin') == 'github':
            if skill['name'] not in known:
                raise ValueError(f"GitHub skill missing from canonical INDEX.json: {skill['name']}")
            if known[skill['name']]:
                skill['incomplete'] = True
            else:
                skill.pop('incomplete', None)
    incomplete = sum(bool(skill.get('incomplete')) for skill in result['skills'])
    result['counts']['incomplete_skills'] = incomplete
    result['counts']['routable_skills'] = len(result['skills']) - incomplete
    return result


def domains(index: dict) -> dict[str, bytes]:
    grouped = defaultdict(list)
    for skill in index['skills']:
        grouped[skill['domain']].append(skill)
    output = {}
    for domain, skills in grouped.items():
        if not domain or Path(domain).name != domain or domain in {'.', '..'}:
            raise ValueError(f'invalid domain: {domain}')
        lines = [f'# {domain}', '', f'Skills: {len(skills)}', '']
        for skill in sorted(skills, key=lambda s: s['name']):
            disabled = ' [incomplete: excluded from default routing]' if skill.get('incomplete') else ''
            lines.append(f"- `{skill['name']}` → `{skill['source_path']}`{disabled}")
        output[domain] = ('\n'.join(lines) + '\n').encode('utf-8')
    return output


def synchronize(root: Path = ROOT, *, check: bool = False) -> list[str]:
    root = root.resolve()
    source_index = _inside(root, PROJECT / 'references/triggers.json')
    source = json.loads(source_index.read_text(encoding='utf-8'))
    github = json.loads(_inside(root, 'library/github-skills/INDEX.json').read_text(encoding='utf-8'))
    project = annotate(source, github)
    plugin = copy.deepcopy(project)
    instructions = []
    seen = set()
    for source_skill, portable_skill in zip(project['skills'], plugin['skills']):
        name = source_skill['name']
        if name in seen or not name or Path(name).name != name or name in {'.', '..'}:
            raise ValueError(f'invalid/duplicate skill name: {name}')
        seen.add(name)
        relative_source = str(source_skill['source_path'])
        allowed = ('psk/data/skills/', 'library/skills/', 'library/github-skills/')
        if not relative_source.startswith(allowed) or not relative_source.endswith('/SKILL.md'):
            raise ValueError(f'invalid canonical source: {relative_source}')
        prefix = next(value for value in allowed if relative_source.startswith(value))
        origin = _inside(_inside(root, prefix), relative_source[len(prefix):])
        if not origin.is_file():
            raise ValueError(f"missing canonical instructions: {source_skill['source_path']}")
        portable_skill['source_path'] = f'references/skills/{name}/INSTRUCTIONS.md'
        destination = _inside(root, PLUGIN / portable_skill['source_path'])
        instructions.append((origin, destination))

    rendered_domains = [(directory, domains(payload)) for directory, payload in [(PROJECT, project), (PLUGIN, plugin)]]
    changed = []
    def update(path: Path, data: bytes) -> None:
        _inside(root, path)
        if path.is_file() and path.read_bytes() == data:
            return
        changed.append(str(path.relative_to(root)))
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    update(source_index, _json(project))
    update(_inside(root, PLUGIN / 'references/triggers.json'), _json(plugin))
    for directory, rendered in rendered_domains:
        for domain, text in rendered.items():
            update(_inside(root, directory / f'references/domains/{domain}.md'), text)
    for origin, destination in instructions:
        update(destination, origin.read_bytes())
        for companion in sorted(origin.parent.rglob('*')):
            if not companion.is_file() or companion == origin or '__pycache__' in companion.parts:
                continue
            safe_source = _inside(origin.parent, companion)
            target = _inside(root, destination.parent / companion.relative_to(origin.parent))
            update(target, safe_source.read_bytes())
    # The portable plugin must include the upstream notices, not just a "license: MIT" label.
    licenses = _inside(root, 'library/github-skills/_licenses')
    for path in sorted(licenses.rglob('*')):
        if path.is_file():
            update(_inside(root, PLUGIN / 'references/licenses' / path.relative_to(licenses)), _inside(licenses, path).read_bytes())
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='fail on drift without writing any files')
    args = parser.parse_args()
    changed = synchronize(check=args.check)
    if args.check and changed:
        print('Skill library drift; run python scripts/sync_skill_library.py:')
        print('\n'.join(changed[:40]))
        if len(changed) > 40:
            print(f'... and {len(changed) - 40} more files')
        return 1
    print(f"Skill library {'checked' if args.check else 'synchronized'}: {len(changed)} differing files")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

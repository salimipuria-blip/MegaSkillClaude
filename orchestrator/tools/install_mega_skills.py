"""Materializes the historical Mega Skills 3000 snapshot into skills/{installed,original,registry}.

Usage: python tools/install_mega_skills.py <mega-skills-3000.zip> <mega-skills-router-plugin.zip>
The archives are external (never committed; *.zip is forbidden by the repository contract). After a run,
verify with: python -m pytest -q --require-materialized-skills tests
"""
from __future__ import annotations
import hashlib, json, re, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 3:
    sys.exit(__doc__.strip().splitlines()[2])
RAW_ZIP, ROUTER_ZIP = (Path(a).resolve() for a in sys.argv[1:])
for archive in (RAW_ZIP, ROUTER_ZIP):
    if not archive.is_file():
        sys.exit(f'archive not found: {archive}')
INSTALLED = ROOT / 'skills' / 'installed'
ORIGINAL = ROOT / 'skills' / 'original'
REGISTRY = ROOT / 'skills' / 'registry'

for p in (INSTALLED, ORIGINAL, REGISTRY):
    p.mkdir(parents=True, exist_ok=True)

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def frontmatter_description(text: str) -> str:
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?', text, re.S)
    if not m:
        return ''
    dm = re.search(r'^description:\s*(.*)$', m.group(1), re.M)
    return dm.group(1).strip().strip('"\'') if dm else ''

with zipfile.ZipFile(RAW_ZIP) as zr, zipfile.ZipFile(ROUTER_ZIP) as zp:
    raw_paths = [n for n in zr.namelist() if n.endswith('/SKILL.md')]
    exe_paths = [n for n in zp.namelist() if n.endswith('/INSTRUCTIONS.md')]
    raws = {p.split('/')[-2]: (p, zr.read(p)) for p in raw_paths}
    exes = {p.split('/')[-2]: (p, zp.read(p)) for p in exe_paths}
    trigger_path = next(n for n in zp.namelist() if n.endswith('/references/triggers.json'))
    trigger_doc = json.loads(zp.read(trigger_path))
    trigger_map = {x['name']: x for x in trigger_doc['skills']}

    assert len(raws) == 3000, len(raws)
    assert len(exes) == 3000, len(exes)
    assert set(raws) == set(exes) == set(trigger_map)
    assert sum(len(v['triggers']) for v in trigger_map.values()) == 15000

    manifest = []
    repaired = []
    for name in sorted(raws):
        raw_path, raw_b = raws[name]
        exe_path, exe_b = exes[name]
        raw_text = raw_b.decode('utf-8')
        exe_text = exe_b.decode('utf-8')
        item = trigger_map[name]

        skill_dir = INSTALLED / name
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / 'SKILL.md').write_bytes(exe_b)

        original_dir = ORIGINAL / name
        original_dir.mkdir(parents=True, exist_ok=True)
        (original_dir / 'SKILL.md').write_bytes(raw_b)

        is_repaired = raw_b != exe_b
        if is_repaired:
            repaired.append(name)

        record = {
            'skill_key': name,
            'name': name,
            'description': frontmatter_description(exe_text),
            'domain': item['domain'],
            'triggers': item['triggers'],
            'installed_path': f'skills/installed/{name}/SKILL.md',
            'original_path': f'skills/original/{name}/SKILL.md',
            'source_path': raw_path,
            'router_source_path': exe_path,
            'original_sha256': sha(raw_b),
            'installed_sha256': sha(exe_b),
            'repaired': is_repaired,
            'install_mode': 'eager_global',
            'trigger_role': 'selection_only',
            'status': 'installed',
        }
        manifest.append(record)

    (REGISTRY / 'skills-manifest.json').write_text(
        json.dumps({
            'schema_version': 2,
            'install_mode': 'eager_global',
            'trigger_role': 'selection_only',
            'counts': {
                'skills': len(manifest),
                'triggers': sum(len(x['triggers']) for x in manifest),
                'repaired': len(repaired),
                'original_assets': len(manifest),
                'installed_assets': len(manifest),
            },
            'source_archives': {
                'mega-skills-3000.zip': sha(RAW_ZIP.read_bytes()),
                'mega-skills-router-plugin.zip': sha(ROUTER_ZIP.read_bytes()),
            },
            'repaired_skills': repaired,
            'skills': manifest,
        }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    # skills/route.py is tracked source, not generated here (an embedded copy drifted: wrong registry path).
    with zp.open(trigger_path) as src, open(REGISTRY / 'triggers.json', 'wb') as dst:
        dst.write(src.read())

print(json.dumps({
    'installed_skills': len(manifest),
    'installed_triggers': sum(len(x['triggers']) for x in manifest),
    'original_assets': len(manifest),
    'installed_assets': len(manifest),
    'repaired': len(repaired),
    'source_hash': sha(RAW_ZIP.read_bytes()),
    'router_hash': sha(ROUTER_ZIP.read_bytes()),
}, ensure_ascii=False, indent=2))

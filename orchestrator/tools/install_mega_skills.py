from __future__ import annotations
import hashlib, json, re, shutil, zipfile
from pathlib import Path

ROOT = Path('/mnt/data/porya-omni-llm-orchestrator')
RAW_ZIP = Path('/mnt/data/mega-skills-3000(2).zip')
ROUTER_ZIP = Path('/mnt/data/mega-skills-router-plugin(2).zip')
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
    shutil.copyfileobj(zp.open(trigger_path), open(REGISTRY / 'triggers.json', 'wb'))

    router = r'''#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
REG = json.loads((ROOT/'registry'/'skills-manifest.json').read_text(encoding='utf-8'))

def norm(s: str) -> str:
    return ' '.join(re.findall(r'[\w\u0600-\u06FF]+', s.lower(), flags=re.UNICODE))

def route(query: str, limit: int = 5):
    q = norm(query); qset = set(q.split())
    ranked=[]
    for s in REG['skills']:
        best=0.0; why=''
        for trig in s['triggers']:
            t=norm(trig)
            if q == t: score=100.0
            elif t and t in q: score=70.0 + min(len(t)/100, 5)
            else:
                ts=set(t.split()); score=(len(qset & ts)/max(1,len(ts)))*30.0
            if score>best: best,why=score,trig
        if norm(s['name']) in q: best += 20
        if norm(s['domain']) in q: best += 5
        if best>0: ranked.append((best,s,why))
    ranked.sort(key=lambda x:(-x[0],x[1]['name']))
    return [{'score':round(sc,3),'skill':s['name'],'domain':s['domain'],'matched_trigger':why,'path':s['installed_path']} for sc,s,why in ranked[:limit]]

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('query'); ap.add_argument('--limit',type=int,default=5)
    a=ap.parse_args(); print(json.dumps(route(a.query,a.limit),ensure_ascii=False,indent=2))
'''
    (ROOT/'skills'/'route.py').write_text(router, encoding='utf-8')

print(json.dumps({
    'installed_skills': len(manifest),
    'installed_triggers': sum(len(x['triggers']) for x in manifest),
    'original_assets': len(manifest),
    'installed_assets': len(manifest),
    'repaired': len(repaired),
    'source_hash': sha(RAW_ZIP.read_bytes()),
    'router_hash': sha(ROUTER_ZIP.read_bytes()),
}, ensure_ascii=False, indent=2))

#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parent
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

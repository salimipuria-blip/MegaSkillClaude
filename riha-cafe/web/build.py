"""Wrap app.html (artifact fragment) into index.html (standalone page for Vercel)."""
from pathlib import Path
here = Path(__file__).resolve().parent
body = (here / "app.html").read_text(encoding="utf-8")
head = ('<!doctype html>\n<html lang="fa" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#1E4635">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n')
i = body.index("<header")
(here / "index.html").write_text(head + body[:i] + "</head>\n<body>\n" + body[i:] + "\n</body>\n</html>\n", encoding="utf-8")
print("index.html written")

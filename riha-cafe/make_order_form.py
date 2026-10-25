"""Order-form edition of the Riha Cafe workbook.

Builds the ready-to-start workbook with the extra "ثبت سفارش" sheet and three
buttons, and writes the macro module that the buttons call:

  python3 make_order_form.py
    -> سامانه_کافه_ریحا_v4_فرم_سفارش.xlsx   (workbook + buttons)
    -> RihaCafe_OrderForm.bas                (import once in Excel, then save as .xlsm)

The VBA project is not embedded here: tools outside Excel write project files
that Excel often reports as damaged, so Excel itself compiles the module.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "سامانه_کافه_ریحا_v4_فرم_سفارش.xlsx"
BAS = ROOT / "RihaCafe_OrderForm.bas"
FORM_SHEET = "ثبت سفارش"

# (macro, label, from row, to row) - rows are 0-based, buttons sit in column F
BUTTONS = [
    ("RegisterOrder", "ثبت فاکتور", 3, 5),
    ("RegisterAndPrint", "ثبت و چاپ", 5, 7),
    ("ClearOrderForm", "پاک کردن فرم", 10, 12),
]


def vba_source():
    """Template -> ASCII module: FA("متن") becomes U("hex ...")."""
    src = (ROOT / "vba" / "RihaCafe_OrderForm.vba").read_text(encoding="utf-8")
    src = re.sub(r'FA\("([^"]*)"\)', lambda m: 'U("' + " ".join(f"{ord(ch):04X}" for ch in m.group(1)) + '")', src)
    bad = [line for line in src.splitlines() if any(ord(ch) > 126 for ch in line)]
    assert not bad, f"non-ASCII left in VBA: {bad[:3]}"
    return src.replace("\n", "\r\n")


def shape(i, macro, label, r0, r1):
    return f'''<xdr:twoCellAnchor editAs="absolute">
<xdr:from><xdr:col>5</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>{r0}</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>5</xdr:col><xdr:colOff>1428750</xdr:colOff><xdr:row>{r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:sp macro="[0]!{macro}" textlink="">
<xdr:nvSpPr><xdr:cNvPr id="{i + 2}" name="btn{macro}"/><xdr:cNvSpPr/></xdr:nvSpPr>
<xdr:spPr><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="{'15533E' if i < 2 else '8A8F8C'}"/></a:solidFill><a:ln><a:noFill/></a:ln></xdr:spPr>
<xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" rtlCol="1" anchor="ctr"/><a:lstStyle/>
<a:p><a:pPr algn="ctr" rtl="1"/><a:r><a:rPr lang="fa-IR" sz="1200" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Tahoma"/><a:cs typeface="Tahoma"/></a:rPr><a:t>{label}</a:t></a:r></a:p>
</xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>'''


def add_buttons(path):
    """Attach a drawing with macro buttons to the form sheet (openpyxl cannot write shapes)."""
    with zipfile.ZipFile(path) as z:
        files = {n: z.read(n) for n in z.namelist()}
    wb = files["xl/workbook.xml"].decode("utf-8")
    rid = re.search(r'<sheet [^>]*name="' + FORM_SHEET + r'"[^>]*r:id="([^"]+)"', wb).group(1)
    rels = files["xl/_rels/workbook.xml.rels"].decode("utf-8")
    target = re.search(r'<Relationship [^>]*Id="' + rid + r'"[^>]*Target="([^"]+)"', rels) or \
        re.search(r'<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + rid + '"', rels)
    sheet = "xl/" + target.group(1).lstrip("/").removeprefix("xl/")
    srels = sheet.replace("worksheets/", "worksheets/_rels/") + ".rels"
    n = 1
    while f"xl/drawings/drawing{n}.xml" in files:
        n += 1
    drawing = f"xl/drawings/drawing{n}.xml"
    files[drawing] = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
                      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                      + "".join(shape(i, *b) for i, b in enumerate(BUTTONS)) + "</xdr:wsDr>").encode("utf-8")
    rel = (f'<Relationship Id="rIdBtn" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" '
           f'Target="../drawings/drawing{n}.xml"/>')
    if srels in files:
        files[srels] = files[srels].decode("utf-8").replace("</Relationships>", rel + "</Relationships>").encode("utf-8")
    else:
        files[srels] = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                        + rel + "</Relationships>").encode("utf-8")
    x = files[sheet].decode("utf-8")
    assert "<drawing " not in x
    if 'xmlns:r=' not in x[:600]:
        x = x.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ', 1)
    tag = '<drawing r:id="rIdBtn"/>'
    for nxt in ("<legacyDrawing", "<tableParts", "<extLst", "</worksheet>"):
        if nxt in x:
            x = x.replace(nxt, tag + nxt, 1)
            break
    files[sheet] = x.encode("utf-8")
    ct = files["[Content_Types].xml"].decode("utf-8")
    ct = ct.replace("</Types>", f'<Override PartName="/{drawing}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>')
    files["[Content_Types].xml"] = ct.encode("utf-8")
    tmp = path.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    tmp.replace(path)


def main():
    env = dict(os.environ, RIHA_OUT=str(OUT))
    subprocess.run([sys.executable, str(ROOT / "build_riha_cafe_v4.py"), "--clean", "--macro"], check=True, env=env)
    add_buttons(OUT)
    BAS.write_bytes(vba_source().encode("ascii"))
    print("Created", OUT)
    print("Created", BAS)


if __name__ == "__main__":
    main()

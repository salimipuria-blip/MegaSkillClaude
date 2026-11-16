# -*- coding: utf-8 -*-
"""Riha Cafe operations workbook - version 4 (Jalali dates, live stock, bug-fix release).

Design principles
  P1  One sheet = one workflow (8 visible sheets + 1 hidden support sheet).
  P2  Every ledger is an Excel Table with real calculated-column formulas, so a new row
      fills its own formulas. Max two tables side by side, never two growing tables stacked.
  P3  Fixed zone on top of each sheet: title, legend, health strip, section bands, header.
  P4  Gold header / gold cell = manual input, slate header / grey cell = calculated.
  P5  Lookups use INDEX/MATCH on column names (no numeric column indexes).
  P6  Settings and dropdown lists are named; no hard-coded constants inside formulas.
  P7  Only "final" sales and "approved" records reach reports and stock.

Run:  python build_riha_cafe_v4.py --clean   (ready-to-start file)
      python build_riha_cafe_v4.py           (demo file with sample data)
      needs riha_data.json and jalali_lib.py next to it
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import date, datetime, time
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableFormula, TableStyleInfo
from openpyxl.styles import Protection
from jalali_lib import jtext, jmonth, is_leap_j, jdays_in_month, j2g

ROOT = Path(__file__).resolve().parent
CLEAN = "--clean" in sys.argv          # clean = masters only, no sample transactions
OUT = ROOT / ("سامانه_کافه_ریحا_v4_آماده_شروع.xlsx" if CLEAN else "سامانه_کافه_ریحا_v4_نمونه_دمو.xlsx")
MACRO = "--macro" in sys.argv          # adds the order-entry sheet; make_xlsm.py turns the result into .xlsm
if MACRO:
    OUT = Path(os.environ.get("RIHA_OUT", ROOT / "riha_macro_base.xlsx"))
TRANSACTIONAL = {"tblSales", "tblPurchases", "tblStockAdjust", "tblExpenses", "tblCash", "tblAttendance", "tblPayroll", "tblTargets"}
DATA = json.loads((ROOT / "riha_data.json").read_text(encoding="utf-8"))

# ----------------------------------------------------------------------------- constants
ZW = "\u200c"
FINAL = DATA["tblSales"][0]["وضعیت"]            # نهایی
APPROVED = DATA["tblExpenses"][0]["وضعیت"]      # تایید شده
DRAFT = "پیش" + ZW + "نویس"
CANCEL = "ابطال"
COSTC = "بهای تمام" + ZW + "شده"
OTC = "اضافه" + ZW + "کاری"
SUPC = [k for k in DATA["tblSuppliers"][0]][0]   # کد تأمین‌کننده
SUPN = [k for k in DATA["tblSuppliers"][0]][1]   # نام تأمین‌کننده
ING_SUP = [k for k in DATA["tblIngredients"][0]][-1]
EXP_BY = [k for k in DATA["tblExpenses"][0] if "ثبت" in k][0]
OK_STOCK, LOW_STOCK, OUT_STOCK = "مناسب", "نیاز به خرید", "ناموجود"
BAD_CODE = "کد نامعتبر"
UNIT = "هزار تومان"
LAST = 10000                                      # DV / conditional-format reach

DARK, GREEN, SLATE = "0B3025", "15533E", "56665F"
CREAM, PALE_GREEN, GOLD = "F6F1E7", "E2EEE7", "B49657"
IN_FILL, CALC_FILL = "FFF8E1", "EEF1EF"
WHITE, RED_PALE, ORANGE_PALE, TEXT = "FFFFFF", "F9E0E0", "FFF0D4", "17241F"
THIN = Side(style="thin", color="D7DDD9")
MED = Side(style="medium", color=GREEN)
MONEY = '#,##0.0;[Red]-#,##0.0;"–"'
INT = '#,##0;[Red]-#,##0;"–"'
PCT = "0.0%"
DATEF = "yyyy/mm/dd"
FN = "Arial"


def font(size=10, bold=False, color=TEXT, italic=False):
    return Font(name=FN, size=size, bold=bold, color=color, italic=italic)


def fill(c):
    return PatternFill("solid", fgColor=c)


def dec(v):
    if isinstance(v, dict):
        if "d" in v:
            return datetime.strptime(v["d"], "%Y-%m-%d").date()
        if "t" in v:
            h, m = map(int, v["t"].split(":"))
            return time(h, m)
    return v


def jconv(k, v):
    """Sample data is stored with Gregorian dates; the workbook works in Jalali text."""
    if isinstance(v, date) and not isinstance(v, datetime):
        return jmonth(v) if k == "ماه" else jtext(v)
    return v


def rows_of(table):
    if CLEAN and table in TRANSACTIONAL:
        return []
    return [{k: jconv(k, dec(v)) for k, v in r.items()} for r in DATA[table]]


# ----------------------------------------------------------------------------- workbook
wb = Workbook()
wb.remove(wb.active)
wb.calculation.calcMode = "auto"
wb.calculation.fullCalcOnLoad = True
wb.calculation.forceFullCalc = True
wb.properties.title = "سامانه عملیاتی کافه ریحا v4.1"
wb.properties.creator = "Riha Cafe"

SHEETS = {}
for key, name, color in [
    ("dash", "داشبورد", GREEN), ("sales", "فروش", GOLD), ("inv", "فاکتور", GOLD),
    ("stock", "خرید و انبار", GOLD), ("menu", "منو و دستورپخت", GOLD),
    ("cash", "هزینه و صندوق", GOLD), ("hr", "حضور و حقوق", GOLD),
    ("base", "پایه" + ZW + "ها و تنظیمات", SLATE), ("lists", "فهرست" + ZW + "ها", SLATE),
    ("sup", "پشتیبان", SLATE), ("cal", "تقویم", SLATE),
]:
    ws = wb.create_sheet(name)
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = color
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.sheet_format.defaultRowHeight = 19.5
    ws.sheet_format.customHeight = True
    SHEETS[key] = ws
SHEETS["sup"].sheet_state = "hidden"
SHEETS["cal"].sheet_state = "hidden"


def qn(ws):
    return "'" + ws.title + "'"


def define(name, ref):
    wb.defined_names.add(DefinedName(name, attr_text=ref))


# ----------------------------------------------------------------------------- helpers
def tr(tbl, s):
    """Convert [@[col]] into the file-format form tbl[[#This Row],[col]]."""
    return re.sub(r"\[@\[([^\]]+)\]\]", lambda m: f"{tbl}[[#This Row],[{m.group(1)}]]", s)


class Col:
    def __init__(self, name, kind, w, fmt=None, f=None, align=None):
        self.name, self.kind, self.w, self.fmt, self.f, self.align = name, kind, w, fmt, f, align


def IN(name, w, fmt=None, align=None):
    return Col(name, "in", w, fmt, None, align)


def CA(name, w, f, fmt=None, align=None):
    return Col(name, "calc", w, fmt, f, align)


def tc(tbl, col):
    """tbl[col] with double brackets when the header has special characters."""
    return f"{tbl}[[{col}]]" if re.search(r"[/%()\-\.,:#'\"]", col) else f"{tbl}[{col}]"


def me(col):
    return f"[@[{col}]]"


def lk(tbl, ret, keycol, key, dflt='""'):
    return f"IFERROR(INDEX({tbl}[{ret}],MATCH({key},{tbl}[{keycol}],0)),{dflt})"


def title(ws, text, sub, last_col):
    last = CL(last_col)
    ws.merge_cells(f"A1:{last}1")
    ws["A1"] = text
    ws["A1"].font = font(18, True, WHITE)
    ws["A1"].fill = fill(DARK)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 30
    ws.merge_cells(f"A2:{last}2")
    ws["A2"] = sub
    ws["A2"].font = font(9, False, "40524A", True)
    ws["A2"].fill = fill(CREAM)
    ws["A2"].alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
    ws.row_dimensions[2].height = 20
    ws.row_dimensions[3].height = 26
    ws.row_dimensions[4].height = 18


def band(ws, row, c1, c2, text, color=DARK):
    if c2 > c1:
        ws.merge_cells(start_row=row, start_column=c1, end_row=row, end_column=c2)
    c = ws.cell(row, c1, text)
    c.font = font(10, True, WHITE)
    c.fill = fill(color)
    c.alignment = Alignment(horizontal="center", vertical="center")
    for j in range(c1, c2 + 1):
        ws.cell(row, j).fill = fill(color)


def strip(ws, row, c0, items):
    """Health strip: (label, formula, number_format) pairs, two cells each."""
    for i, (lab, f, fmt) in enumerate(items):
        lc = ws.cell(row, c0 + 2 * i, lab)
        lc.font = font(8, True, DARK)
        lc.fill = fill(PALE_GREEN)
        lc.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        lc.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
        vc = ws.cell(row, c0 + 2 * i + 1, f)
        vc.font = font(11, True, DARK)
        vc.fill = fill(WHITE)
        vc.alignment = Alignment(horizontal="center", vertical="center")
        vc.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
        if fmt:
            vc.number_format = fmt


def add_table(ws, name, cols, rows, hdr_row, c0):
    letters = {c.name: CL(c0 + i) for i, c in enumerate(cols)}
    known = {c.name for c in cols}
    for r in rows:
        extra = set(r) - known
        assert not extra, (name, extra)
    for i, c in enumerate(cols):
        h = ws.cell(hdr_row, c0 + i, c.name)
        h.font = font(9, True, WHITE)
        h.fill = fill(GREEN if c.kind == "in" else SLATE)
        h.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        h.border = Border(top=MED, bottom=MED, left=THIN, right=THIN)
        ws.column_dimensions[CL(c0 + i)].width = c.w
    ws.row_dimensions[hdr_row].height = 34
    n = max(len(rows), 1)
    for r in range(n):
        row = rows[r] if r < len(rows) else {}
        for i, c in enumerate(cols):
            cell = ws.cell(hdr_row + 1 + r, c0 + i)
            cell.value = ("=" + tr(name, c.f)) if c.kind == "calc" else row.get(c.name)
            cell.font = font(9)
            cell.fill = fill(IN_FILL if c.kind == "in" else CALC_FILL)
            cell.border = Border(bottom=THIN)
            if c.fmt:
                cell.number_format = c.fmt
            cell.alignment = Alignment(horizontal=c.align or ("center" if c.fmt else "right"), vertical="center")
    ref = f"{CL(c0)}{hdr_row}:{CL(c0 + len(cols) - 1)}{hdr_row + n}"
    tab = Table(displayName=name, ref=ref)
    tab.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=False)
    tab._initialise_columns()
    for tc, c in zip(tab.tableColumns, cols):
        tc.name = c.name
        if c.kind == "calc":
            tc.calculatedColumnFormula = TableFormula(attr_text=tr(name, c.f))
    ws.add_table(tab)
    return letters


def dv_list(ws, rng, name, strict=True):
    dv = DataValidation(type="list", formula1="=" + name, allow_blank=True)
    dv.errorTitle, dv.error = "ورودی نامعتبر", "لطفاً یک مقدار معتبر از فهرست انتخاب کنید."
    dv.showErrorMessage = True
    dv.errorStyle = "stop" if strict else "warning"
    ws.add_data_validation(dv)
    dv.add(rng)


def dv_num(ws, rng, kind, op, f1, f2=None, msg="مقدار واردشده معتبر نیست."):
    dv = DataValidation(type=kind, operator=op, formula1=str(f1), formula2=None if f2 is None else str(f2), allow_blank=True)
    dv.errorTitle, dv.error = "ورودی نامعتبر", msg
    dv.showErrorMessage = True
    ws.add_data_validation(dv)
    dv.add(rng)


def cf(ws, rng, formula, color):
    ws.conditional_formatting.add(rng, FormulaRule(formula=[formula], fill=fill(color), stopIfTrue=False))


def cf_dup(ws, col, last=None):
    last = last or LAST
    ws.conditional_formatting.add(f"{col}{D0}:{col}{last}", FormulaRule(formula=[f'AND(${col}{D0}<>"",COUNTIF(${col}${D0}:${col}${last},${col}{D0})>1)'], fill=fill("F4B6B6")))


def set_print(ws, area=None, orient="landscape", titles=None, tall=0):
    if area:
        ws.print_area = area
    ws.page_setup.orientation = orient
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = tall
    ws.page_margins.left = ws.page_margins.right = 0.25
    ws.page_margins.top = ws.page_margins.bottom = 0.4
    ws.oddFooter.center.text = "کافه ریحا | صفحه &P از &N"
    if titles:
        ws.print_title_rows = titles


LEGEND = "خانه‌های زرد = ورود دستی | خانه‌های خاکستری = خودکار (ویرایش نشود) | تاریخ‌ها شمسی و به شکل 1405/08/02 | افزودن: زیر آخرین ردیف جدول بنویسید | حذف: راست‌کلیک ← Delete ← Table Rows"
H0 = 5          # table header row on every ledger sheet
D0 = H0 + 1     # first data row

# ============================================================================ Jalali formula builders
DATE_BAD = "تاریخ نامعتبر"
ES, GD, CHK, OKC = "وضعیت مؤثر", "تاریخ میلادی", "پیام بررسی", "معتبر"
DN, IK = "فاکتور روز", "کلید فاکتور"      # v4.1 invoice numbering (see SALES)
JMONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
CAL_Y0, CAL_Y1 = 1398, 1450          # calendar reference range (inclusive)


def jn(x):
    """Normalise a typed date: Persian/Arabic digits -> ASCII, - . space -> '/'."""
    s = f"TRIM({x})"
    for ch in ["-", ".", " ", "٫", "،"]:
        s = f'SUBSTITUTE({s},"{ch}","/")'
    for i, (p, a) in enumerate(zip("۰۱۲۳۴۵۶۷۸۹", "٠١٢٣٤٥٦٧٨٩")):
        s = f'SUBSTITUTE(SUBSTITUTE({s},"{p}","{i}"),"{a}","{i}")'
    return s


def jpart(n, k):
    return f'TRIM(MID(SUBSTITUTE({n},"/",REPT(" ",30)),{(k - 1) * 30 + 1},30))'


def jkey(x):      # yyyymmdd from a typed Jalali date (1405/08/02, 1405-8-2, 14050802, Persian digits ...)
    n = jn(x)
    return f'IF(ISERROR(FIND("/",{n})),VALUE({n}),VALUE({jpart(n, 1)})*10000+VALUE({jpart(n, 2)})*100+VALUE({jpart(n, 3)}))'


def jkeym(x):     # yyyymm from 1405/08 or 1405/08/01
    n = jn(x)
    return f'IF(ISERROR(FIND("/",{n})),VALUE(LEFT({n},6)),VALUE({jpart(n, 1)})*100+VALUE({jpart(n, 2)}))'


def gd(x, has):
    """Gregorian serial of a Jalali date typed (as text) in cell/ref x.  Real Excel serials pass through."""
    return (f'IF({x}="",IF({has},"{DATE_BAD}",""),IF(AND(ISNUMBER({x}),{x}<100000),{x},'
            f'IFERROR(INDEX(CalSerial,MATCH({jkey(x)},CalKey,0)),"{DATE_BAD}")))')


def mstart(x, has):
    return (f'IF({x}="",IF({has},"{DATE_BAD}",""),IFERROR(INDEX(MonStart,MATCH({jkeym(x)},MonKey,0)),"{DATE_BAD}"))')


def jtxt(serial):
    return f'IFERROR(INDEX(CalText,MATCH({serial},CalSerial,0)),"")'


# ============================================================================ hidden calendar sheet (reference data)
cal = SHEETS["cal"]
cal.sheet_view.rightToLeft = True
for c, (h, w) in enumerate([("کلید yyyymmdd", 14), ("سریال اکسل", 12), ("تاریخ شمسی", 12), ("", 3), ("کلید ماه", 10), ("شروع ماه", 11), ("پایان ماه", 11), ("نام ماه", 16)], 1):
    cal.cell(1, c, h).font = font(9, True)
    cal.column_dimensions[CL(c)].width = w
cal["J1"] = "داده مرجع تقویم شمسی (۱۳۹۸ تا ۱۴۵۰)؛ دستی ویرایش نشود. سال کبیسه طبق قاعده ۳۳ ساله."
EPOCH = date(1899, 12, 30)
r_ = 2
m_ = 2
for jy in range(CAL_Y0, CAL_Y1 + 1):
    for jm in range(1, 13):
        n_days = jdays_in_month(jy, jm)
        first = j2g(jy, jm, 1)
        cal.cell(m_, 5, jy * 100 + jm)
        cal.cell(m_, 6, (first - EPOCH).days)
        cal.cell(m_, 7, (first - EPOCH).days + n_days - 1)
        cal.cell(m_, 8, f"{JMONTHS[jm - 1]} {jy}")
        m_ += 1
        for jd in range(1, n_days + 1):
            g = j2g(jy, jm, jd)
            cal.cell(r_, 1, jy * 10000 + jm * 100 + jd)
            cal.cell(r_, 2, (g - EPOCH).days)
            cal.cell(r_, 3, f"{jy}/{jm:02d}/{jd:02d}")
            r_ += 1
define("CalKey", f"{qn(cal)}!$A$2:$A${r_ - 1}")
define("CalSerial", f"{qn(cal)}!$B$2:$B${r_ - 1}")
define("CalText", f"{qn(cal)}!$C$2:$C${r_ - 1}")
define("MonKey", f"{qn(cal)}!$E$2:$E${m_ - 1}")
define("MonStart", f"{qn(cal)}!$F$2:$F${m_ - 1}")
define("MonEnd", f"{qn(cal)}!$G$2:$G${m_ - 1}")
define("MonName", f"{qn(cal)}!$H$2:$H${m_ - 1}")

# ============================================================================ editable lists sheet
ls_ = SHEETS["lists"]
title(ls_, "فهرست‌های قابل ویرایش", "هر فهرست یک جدول است: مورد جدید را زیر آخرین ردیف بنویسید تا در همه کشویی‌ها ظاهر شود. حذف مورد: راست‌کلیک ← Delete ← Table Rows.", 17)
menu_cats = []
for r in DATA["tblMenu"]:
    if r["دسته"] not in menu_cats:
        menu_cats.append(r["دسته"])
SALARY_CAT = "حقوق و مزایا"
EDIT_LISTS = [
    ("tblListMenuCat", "دسته منو", "MenuCategories", menu_cats),
    ("tblListGroup", "گروه مواد", "IngredientGroup", ["قهوه", "لبنیات", "چای و ادویه", "سیروپ و پوره", "میوه و سبزی", "پروتئین", "خشکبار", "بسته" + ZW + "بندی", "غذا", "سایر"]),
    ("tblListUnit", "واحد", "Units", ["گرم", "میلی" + ZW + "لیتر", "عدد", "کیلوگرم", "بسته"]),
    ("tblListRole", "سمت", "Roles", ["مدیر", "صندوق" + ZW + "دار", "باریستا", "سالن" + ZW + "کار", "آشپز", "کمک" + ZW + "آشپز"]),
    ("tblListExpCat", "دسته هزینه", "ExpenseCategory", [SALARY_CAT, "اجاره", "قبوض", "مواد مصرفی", "تعمیرات", "بازاریابی", "حمل" + ZW + "ونقل", "کارمزد", "سایر"]),
]
for i, (tbl, colname, nm, vals) in enumerate(EDIT_LISTS):
    c0 = 1 + i * 3
    add_table(ls_, tbl, [IN(colname, 24)], [{colname: v} for v in vals], H0, c0)
    band(ls_, 4, c0, c0, colname)
    ls_.column_dimensions[CL(c0 + 1)].width = 3
    define(nm, f"{tc(tbl, colname)}")
ls_.freeze_panes = f"A{D0}"
ls_["A3"] = "توجه: مورد «" + SALARY_CAT + "» در فهرست دسته هزینه برای جلوگیری از شمارش دوباره حقوق استفاده می‌شود؛ اگر نامش را عوض کردید، همان نام را در «پایه‌ها و تنظیمات ← دسته هزینه حقوق» هم بنویسید."
ls_["A3"].font = font(9, False, "B00020", True)
ls_.row_dimensions[3].height = 20
set_print(ls_, None, titles=f"{H0}:{H0}")

# ============================================================================ hidden support sheet (fixed lists + chart helpers)
sup = SHEETS["sup"]
title(sup, "فهرست‌های ثابت و داده کمکی نمودار", "این شیت مخفی است. فهرست‌های قابل ویرایش (دسته منو، گروه مواد، واحد، سمت، دسته هزینه) در شیت «فهرست‌ها» هستند.", 18)
LISTS = [
    ("PaymentMethods", "روش پرداخت", ["نقد", "کارت", "انتقال", "آنلاین", "نسیه"]),
    ("SaleStatus", "وضعیت فروش", [DRAFT, FINAL, CANCEL]),
    ("ApprovalStatus", "وضعیت تایید", [DRAFT, APPROVED, CANCEL]),
    ("ActiveList", "فعال", ["بله", "خیر"]),
    ("StockTypes", "نوع حرکت انبار", ["خرید", "ضایعات", "اصلاح موجودی"]),
]
for c, (nm, lab, vals) in enumerate(LISTS, 1):
    h = sup.cell(4, c, lab)
    h.font, h.fill = font(9, True, WHITE), fill(GREEN)
    sup.column_dimensions[CL(c)].width = 18
    for r, v in enumerate(vals, 5):
        sup.cell(r, c, v).font = font(9)
    define(nm, f"{qn(sup)}!${CL(c)}$5:${CL(c)}${4 + len(vals)}")
# settings helper: stock-start date (optional) as serial
sup["R4"], sup["S4"] = "شروع انبار", "شروع انبار (عدد)"
sup["R5"] = "=IF(Cfg_StockStart=\"\",\"\"," + gd("Cfg_StockStart", "TRUE") + ")"
sup["S5"] = "=IF(ISNUMBER(R5),R5,0)"
define("Cfg_StockStartS", f"{qn(sup)}!$S$5")
define("Cfg_StockStartRaw", f"{qn(sup)}!$R$5")
# chart helper: daily sales (31 days from RptFrom) + category sales
for c, t in [(12, "روز (سریال)"), (13, "فروش روزانه"), (14, "روز ماه"), (15, "دسته"), (16, "فروش دسته")]:
    sup.cell(4, c, t).font = font(9, True)
for i in range(31):
    r = 5 + i
    sup.cell(r, 12, f'=IF(ISNUMBER(RptFrom),RptFrom+{i},"")').number_format = "0"
    sup.cell(r, 13, f'=IF(OR(L{r}="",L{r}>RptTo),"",SUMIFS(tblSales[فروش خالص],tblSales[{GD}],L{r},tblSales[{ES}],"{FINAL}"))').number_format = MONEY
    sup.cell(r, 14, f'=IF(OR(L{r}="",L{r}>RptTo),"",IFERROR(VALUE(RIGHT({jtxt(f"L{r}")},2)),""))')
N_CAT = min(len(menu_cats) + 3, 14)
for i in range(N_CAT):
    r = 5 + i
    sup.cell(r, 15, f'=IFERROR(INDEX(MenuCategories,{i + 1})&"","")')
    sup.cell(r, 16, f'=IF(O{r}="","",SUMIFS(tblSales[فروش خالص],tblSales[دسته],O{r},tblSales[{GD}],">="&RptFrom,tblSales[{GD}],"<="&RptTo,tblSales[{ES}],"{FINAL}"))').number_format = MONEY
rr = 5 + N_CAT
sup.cell(rr, 15, "سایر")
sup.cell(rr, 16, f"=DashSales-SUM(P5:P{rr - 1})").number_format = MONEY
CAT_LAST = rr
# month helper for the 12-month table (Jalali months of the report year)
for c, t in [(18, "شروع ماه"), (19, "پایان ماه"), (20, "نام ماه")]:
    pass
sup["U4"], sup["V4"], sup["W4"] = "شروع ماه گزارش", "پایان ماه گزارش", "نام ماه گزارش"
for i in range(12):
    r = 5 + i
    sup.cell(r, 21, f'=IFERROR(INDEX(MonStart,MATCH(RptYear*100+{i + 1},MonKey,0)),"")').number_format = "0"
    sup.cell(r, 22, f'=IFERROR(INDEX(MonEnd,MATCH(RptYear*100+{i + 1},MonKey,0)),"")').number_format = "0"
    sup.cell(r, 23, f'=IFERROR(INDEX(MonName,MATCH(RptYear*100+{i + 1},MonKey,0)),"")')
define("MonthlyStart", f"{qn(sup)}!$U$5:$U$16")
define("MonthlyEnd", f"{qn(sup)}!$V$5:$V$16")
define("MonthlyName", f"{qn(sup)}!$W$5:$W$16")

# ============================================================================ helpers v4
def bal(s):
    assert s.count("(") == s.count(")"), "unbalanced parentheses: " + s[:120]
    return s


def dv_custom(ws, rng, formula, msg, style="stop"):
    dv = DataValidation(type="custom", formula1=formula, allow_blank=True)
    dv.errorTitle, dv.error = "ورودی نامعتبر", msg
    dv.showErrorMessage = True
    dv.errorStyle = style
    ws.add_data_validation(dv)
    dv.add(rng)


def cf_baddate(ws, col_letter, gd_letter):
    ws.conditional_formatting.add(f"{col_letter}{D0}:{col_letter}{LAST}", FormulaRule(formula=[f'${gd_letter}{D0}="{DATE_BAD}"'], fill=fill("F4B6B6")))


def issue_count(tbl, col):
    return f"SUMPRODUCT(--(LEN({tbl}[{col}])>0))"


# ============================================================================ SALES
ws = SHEETS["sales"]
S = "tblSales"
title(ws, "ثبت فروش | هر ردیف یک قلم فاکتور", LEGEND + " | اقلام هر فاکتور پشت‌سرهم و با شماره یکسان؛ وضعیت خالی = «" + FINAL + "». مبالغ به " + UNIT + ".", 26)
has_s = f'OR({me("نام محصول")}<>"",{me(DN)}<>"")'
# v4.1: the invoice number is no longer typed or created by a VBA button (macros do not run in Excel for the web).
# The user types only the invoice's number of the day (1, 2, 3 ...); the full number R-yyyymmdd-NN and a numeric
# sort key are formulas, so numbers are unique, stable under sorting/deleting and identical on every device.
inv_dkey = f'INDEX(CalKey,MATCH({me(GD)},CalSerial,0))'
hdr = lambda c: f"{S}[[#Headers],[{c}]]"
sales_cols = [
    IN("تاریخ", 12, "@"),
    IN(DN, 9, "0"),
    CA("شماره فاکتور", 15, bal(f'IF(OR({me(DN)}="",NOT(ISNUMBER({me(GD)}))),"",IFERROR("R-"&{inv_dkey}&"-"&TEXT({me(DN)},"00"),""))')),
    # v4.1: the product is picked by NAME from a dropdown (easy on a phone); the code is looked up
    IN("نام محصول", 24),
    CA("کد محصول", 12, f'IF({me("نام محصول")}="","",{lk("tblMenu", "کد محصول", "نام محصول", me("نام محصول"), chr(34) + BAD_CODE + chr(34))})'),
    IN("تعداد", 8, "General"),
    CA("قیمت واحد", 11, f'IF({me("کد محصول")}="","",{lk("tblMenu", "قیمت فروش", "کد محصول", me("کد محصول"), "0")})', MONEY),
    IN("درصد تخفیف", 9, "0%"),
    CA("فروش خالص", 12, f'IF({me("کد محصول")}="","",{me("تعداد")}*{me("قیمت واحد")}-{me("مبلغ تخفیف")})', MONEY),
    IN("روش پرداخت", 11),
    IN("وضعیت", 10),
    IN("کد پرسنل", 11),
    IN("ساعت", 8, "hh:mm"),
    IN("میز/سفارش", 12),
    IN("نام مشتری", 16),
    IN("تلفن", 13),
    IN("یادداشت", 18),
    CA("دسته", 12, f'IF({me("کد محصول")}="","",{lk("tblMenu", "دسته", "کد محصول", me("کد محصول"))})'),
    CA("مبلغ تخفیف", 11, f'IF({me("کد محصول")}="","",{me("تعداد")}*{me("قیمت واحد")}*{me("درصد تخفیف")})', MONEY),
    CA("بهای واحد", 11, f'IF({me("کد محصول")}="","",{lk("tblMenu", "هزینه استاندارد", "کد محصول", me("کد محصول"), "0")})', MONEY),
    CA(COSTC, 12, f'IF({me("کد محصول")}="","",{me("تعداد")}*{me("بهای واحد")})', MONEY),
    CA("سود ناخالص", 12, f'IF({me("کد محصول")}="","",{me("فروش خالص")}-{me(COSTC)})', MONEY),
    CA("حاشیه سود", 9, f'IFERROR({me("سود ناخالص")}/{me("فروش خالص")},0)', PCT),
    CA(ES, 11, f'IF(AND({me("کد محصول")}="",{me("شماره فاکتور")}=""),"",IF({me("وضعیت")}="","{FINAL}",{me("وضعیت")}))'),
    # BUG 1 FIX: invoice-start flag no longer looks at the physical row above. The first FINAL line of each
    # invoice number (counted from the table top to the current row) gets 1, so sorting/filtering/inserting
    # rows can move the flag but never changes the number of invoices.
    CA("شروع فاکتور", 8, bal(f'IF({me("شماره فاکتور")}="","",IF(AND({me(ES)}="{FINAL}",COUNTIFS({hdr("شماره فاکتور")}:{me("شماره فاکتور")},{me("شماره فاکتور")},{hdr(ES)}:{me(ES)},"{FINAL}")=1),1,0))'), "0"),
    CA(GD, 11, bal(gd(me("تاریخ"), has_s)), "0"),
    CA(IK, 13, bal(f'IF({me("شماره فاکتور")}="","",{inv_dkey}*1000+{me(DN)})'), "0"),
]
sales_rows = rows_of("tblSales")
_names = {m["کد محصول"]: m["نام محصول"] for m in DATA["tblMenu"]}
for r in sales_rows:        # sample data stores product codes; the sheet takes names
    r["نام محصول"] = _names[r.pop("کد محصول")]
_seen = {}
for r in sales_rows:        # sample data: old free-text invoice numbers -> number of the day
    day = _seen.setdefault(r["تاریخ"], {})
    r[DN] = day.setdefault(r.pop("شماره فاکتور"), len(day) + 1)
for r in sales_rows:
    if isinstance(r.get("میز/سفارش"), str) and r["میز/سفارش"].isdigit():
        r["میز/سفارش"] = int(r["میز/سفارش"])
LS = add_table(ws, S, sales_cols, sales_rows, H0, 1)
NO_INV = f'COUNTIFS({S}[کد محصول],"?*",{S}[شماره فاکتور],"")'
band(ws, 4, 1, len(sales_cols), "دفتر فروش  |  ورودی‌ها: تاریخ، فاکتور روز (۱، ۲، ۳… شماره کامل خودکار)، نام محصول (از فهرست)، تعداد، تخفیف، پرداخت، وضعیت  ←  نتیجه‌ها: نام، قیمت، فروش خالص، بهای تمام‌شده، سود")
# BUG 7 FIX: counters use the same definitions as the dashboard (final lines, first final line per invoice);
# the last two cards show the dashboard-period values so both places can be compared directly.
strip(ws, 3, 1, [
    ("فاکتور بعدی امروز", f'=_xlfn.MAXIFS({S}[{DN}],{S}[{GD}],TODAY())+1', "0"),
    ("اقلام ثبت‌شده", f'=COUNTIF({S}[کد محصول],"?*")', INT),
    ("فاکتور نهایی (کل)", f"=COUNTIF({S}[شروع فاکتور],1)", INT),
    ("ردیف " + DRAFT, f'=COUNTIF({S}[{ES}],"{DRAFT}")', INT),
    ("کد/تاریخ/شماره نامعتبر", f'=COUNTIF({S}[کد محصول],"{BAD_CODE}")+COUNTIF({S}[{GD}],"{DATE_BAD}")+{NO_INV}', INT),
    ("فروش نهایی کل", f'=SUMIFS({S}[فروش خالص],{S}[{ES}],"{FINAL}")', MONEY),
    ("فاکتور بازه داشبورد", "=DashInvoices", INT),
    ("فروش بازه داشبورد", "=DashSales", MONEY),
])
rng = lambda col: f"{LS[col]}{D0}:{LS[col]}{LAST}"
dv_list(ws, rng("نام محصول"), "ProductNames")
dv_list(ws, rng("کد پرسنل"), "StaffCodes")
dv_list(ws, rng("روش پرداخت"), "PaymentMethods")
dv_list(ws, rng("وضعیت"), "SaleStatus")
dv_num(ws, rng("تعداد"), "decimal", "greaterThan", 0, msg="تعداد باید بزرگ‌تر از صفر باشد.")
dv_num(ws, rng(DN), "whole", "between", 1, 999, "شماره فاکتورِ روز یک عدد صحیح از 1 تا 999 است.")
ws.data_validations.dataValidation[-1].promptTitle = "شماره فاکتور روز"
ws.data_validations.dataValidation[-1].prompt = "اولین فاکتور هر روز 1، بعدی 2 و… (کارت «فاکتور بعدی امروز» بالای صفحه). همه اقلام یک فاکتور همین عدد را بگیرند."
ws.data_validations.dataValidation[-1].showInputMessage = True
dv_num(ws, rng("درصد تخفیف"), "decimal", "between", 0, 1, "درصد تخفیف را بین 0 و 1 وارد کنید (مثلاً 0.1 = ده درصد).")
full = f"A{D0}:{CL(len(sales_cols))}{LAST}"
cf(ws, full, f'${LS["وضعیت"]}{D0}="{CANCEL}"', RED_PALE)
cf(ws, full, f'${LS["وضعیت"]}{D0}="{DRAFT}"', ORANGE_PALE)
cf(ws, f'{LS["نام محصول"]}{D0}:{LS["نام محصول"]}{LAST}', f'${LS["کد محصول"]}{D0}="{BAD_CODE}"', "F4B6B6")
cf_baddate(ws, LS["تاریخ"], LS[GD])
cf(ws, f'{LS[DN]}{D0}:{LS[DN]}{LAST}', f'AND(${LS["کد محصول"]}{D0}<>"",${LS[DN]}{D0}="")', "F4B6B6")
ws.freeze_panes = f"A{D0}"
set_print(ws, None, titles=f"{H0}:{H0}")

# ============================================================================ MENU & RECIPE
ws = SHEETS["menu"]
title(ws, "منو، قیمت‌گذاری و دستورپخت", LEGEND + " | هزینه استاندارد هر محصول از جمع ردیف‌های رسپی آن محاسبه می‌شود. «کل» = از شروع انبار؛ «بازه» = بازه انتخابی داشبورد.", 23)
menu_cols = [
    IN("کد محصول", 12), IN("نام محصول", 24), IN("دسته", 13), IN("قیمت فروش", 11, MONEY),
    CA("هزینه استاندارد", 12, f'IF({me("کد محصول")}="","",SUMIFS(tblRecipe[هزینه خط],tblRecipe[کد محصول],{me("کد محصول")}))', MONEY),
    CA("سود ناخالص واحد", 12, f'IF({me("کد محصول")}="","",{me("قیمت فروش")}-{me("هزینه استاندارد")})', MONEY),
    CA("درصد بهای مواد", 10, f'IFERROR({me("هزینه استاندارد")}/{me("قیمت فروش")},0)', PCT),
    IN("فعال؟", 7), IN("توضیح", 28),
    CA("وضعیت رسپی", 11, f'IF({me("کد محصول")}="","",IF(COUNTIF(tblRecipe[کد محصول],{me("کد محصول")})=0,"بدون رسپی","کامل"))'),
    CA("فروش بازه", 9, f'IF({me("کد محصول")}="","",SUMIFS(tblSales[تعداد],tblSales[کد محصول],{me("کد محصول")},tblSales[{GD}],">="&RptFrom,tblSales[{GD}],"<="&RptTo,tblSales[{ES}],"{FINAL}"))', "General"),
]
LM = add_table(ws, "tblMenu", menu_cols, rows_of("tblMenu"), H0, 1)
sold_tot = lambda: f'SUMIFS(tblSales[تعداد],tblSales[کد محصول],{me("کد محصول")},tblSales[{ES}],"{FINAL}",tblSales[{GD}],">="&Cfg_StockStartS)'
sold_per = lambda: f'SUMIFS(tblSales[تعداد],tblSales[کد محصول],{me("کد محصول")},tblSales[{ES}],"{FINAL}",tblSales[{GD}],">="&RptFrom,tblSales[{GD}],"<="&RptTo)'
recipe_cols = [
    IN("کد محصول", 12),
    CA("نام محصول", 22, f'IF({me("کد محصول")}="","",{lk("tblMenu", "نام محصول", "کد محصول", me("کد محصول"), chr(34) + BAD_CODE + chr(34))})'),
    IN("کد ماده", 11),
    CA("نام ماده", 20, f'IF({me("کد ماده")}="","",{lk("tblIngredients", "نام ماده", "کد ماده", me("کد ماده"), chr(34) + BAD_CODE + chr(34))})'),
    CA("واحد", 9, f'IF({me("کد ماده")}="","",{lk("tblIngredients", "واحد", "کد ماده", me("کد ماده"))})'),
    IN("مقدار استاندارد", 11, "General"),
    CA("بهای واحد ماده", 11, f'IF({me("کد ماده")}="","",{lk("tblIngredients", "بهای میانگین", "کد ماده", me("کد ماده"), "0")})', '#,##0.00'),
    CA("هزینه خط", 10, f'IF({me("کد ماده")}="","",{me("مقدار استاندارد")}*{me("بهای واحد ماده")})', MONEY),
    # BUG 9 FIX: "کل" columns feed the stock ledger; new "بازه" columns follow the dashboard period.
    CA("فروش کل", 9, f'IF({me("کد محصول")}="","",{sold_tot()})', "General"),
    CA("مصرف کل", 10, f'IF({me("کد ماده")}="","",{me("مقدار استاندارد")}*{me("فروش کل")})', '#,##0.0'),
    CA("فروش بازه", 9, f'IF({me("کد محصول")}="","",{sold_per()})', "General"),
    CA("مصرف بازه", 10, f'IF({me("کد ماده")}="","",{me("مقدار استاندارد")}*{me("فروش بازه")})', '#,##0.0'),
    IN("یادداشت", 18),
]
c_rec = len(menu_cols) + 2
LR = add_table(ws, "tblRecipe", recipe_cols, rows_of("tblRecipe"), H0, c_rec)
band(ws, 4, 1, len(menu_cols), "منو و قیمت فروش")
band(ws, 4, c_rec, c_rec + len(recipe_cols) - 1, "دستورپخت استاندارد (هر ردیف = یک ماده از یک محصول)  |  کل = کسر از انبار، بازه = گزارش")
ws.column_dimensions[CL(len(menu_cols) + 1)].width = 3
strip(ws, 3, 1, [
    ("محصولات", "=COUNTA(tblMenu[کد محصول])", INT),
    ("بدون رسپی", '=COUNTIF(tblMenu[وضعیت رسپی],"بدون رسپی")', INT),
    ("بهای مواد > 40%", '=COUNTIF(tblMenu[درصد بهای مواد],">0.4")', INT),
])
strip(ws, 3, c_rec, [
    ("ردیف رسپی", "=COUNTA(tblRecipe[کد محصول])", INT),
    ("کد نامعتبر", f'=COUNTIF(tblRecipe[نام ماده],"{BAD_CODE}")+COUNTIF(tblRecipe[نام محصول],"{BAD_CODE}")', INT),
])
cf_dup(ws, LM["کد محصول"])
dv_list(ws, f'{LM["دسته"]}{D0}:{LM["دسته"]}{LAST}', "MenuCategories", strict=False)
dv_list(ws, f'{LM["فعال؟"]}{D0}:{LM["فعال؟"]}{LAST}', "ActiveList")
dv_list(ws, f'{LR["کد محصول"]}{D0}:{LR["کد محصول"]}{LAST}', "ProductCodes")
dv_list(ws, f'{LR["کد ماده"]}{D0}:{LR["کد ماده"]}{LAST}', "IngredientCodes")
dv_num(ws, f'{LM["قیمت فروش"]}{D0}:{LM["قیمت فروش"]}{LAST}', "decimal", "greaterThanOrEqual", 0, msg="قیمت باید عدد غیرمنفی باشد (هزار تومان).")
dv_num(ws, f'{LR["مقدار استاندارد"]}{D0}:{LR["مقدار استاندارد"]}{LAST}', "decimal", "greaterThan", 0, msg="مقدار استاندارد باید بزرگ‌تر از صفر باشد.")
cf(ws, f'{LM["درصد بهای مواد"]}{D0}:{LM["درصد بهای مواد"]}{LAST}', f'AND(ISNUMBER(${LM["درصد بهای مواد"]}{D0}),${LM["درصد بهای مواد"]}{D0}>0.4)', RED_PALE)
cf(ws, f'{LM["وضعیت رسپی"]}{D0}:{LM["وضعیت رسپی"]}{LAST}', f'${LM["وضعیت رسپی"]}{D0}="بدون رسپی"', ORANGE_PALE)
cf(ws, f'{LR["نام ماده"]}{D0}:{LR["نام ماده"]}{LAST}', f'${LR["نام ماده"]}{D0}="{BAD_CODE}"', "F4B6B6")
cf(ws, f'{LM["فعال؟"]}{D0}:{LM["فعال؟"]}{LAST}', f'${LM["فعال؟"]}{D0}="خیر"', "E5E5E5")
ws.freeze_panes = f"A{D0}"
define("ProductCodes", "tblMenu[کد محصول]")
define("ProductNames", "tblMenu[نام محصول]")
set_print(ws, None, titles=f"{H0}:{H0}")

# ============================================================================ STOCK (ledger + ingredients)
ws = SHEETS["stock"]
title(ws, "خرید و انبار", LEGEND + " | خرید، ضایعات و اصلاح موجودی در یک دفتر ثبت می‌شود؛ وضعیت خالی = «" + APPROVED + "». موجودی هر ماده با خرید زیاد و با فروش (طبق رسپی)، ضایعات و اصلاح کم می‌شود.", 38)
STK = "tblStockLog"
inv_name = lambda k: lk("tblIngredients", "نام ماده", "کد ماده", me(k), chr(34) + BAD_CODE + chr(34))
code_, typ_, qty_, price_, disc_ = me("کد ماده"), me("نوع"), me("مقدار"), me("بهای واحد"), me("تخفیف")
# BUG 2 FIX: every ledger row is validated; a row that fails any check is flagged (message) and contributes
# nothing to stock or to the weighted-average cost until it is corrected, so one bad row can no longer
# corrupt stock levels or average prices.
chk_f = bal(
    f'IF({code_}="","",IF({me("نام ماده")}="{BAD_CODE}","کد ماده نامعتبر",IF({typ_}="","نوع حرکت خالی",'
    f'IF(NOT(ISNUMBER({qty_})),"مقدار خالی",IF({qty_}=0,"مقدار صفر",IF(AND({typ_}<>"اصلاح موجودی",{qty_}<0),"مقدار باید مثبت باشد",'
    f'IF({me(GD)}="{DATE_BAD}","تاریخ خالی یا نامعتبر",IF(AND({typ_}="خرید",NOT(ISNUMBER({price_}))),"بهای واحد خالی",'
    f'IF(AND({typ_}="خرید",N({price_})<0),"بهای واحد منفی",IF(AND({typ_}="خرید",N({disc_})>{qty_}*N({price_})),"تخفیف بیش از مبلغ خرید",'
    f'IF(AND({me(SUPC)}<>"",{me(SUPN)}="{BAD_CODE}"),"کد تأمین‌کننده نامعتبر","")))))))))))')
stock_cols = [
    IN("تاریخ", 12, "@"), IN("شماره سند", 12), IN("نوع", 12), IN("کد ماده", 11),
    CA("نام ماده", 18, f'IF({code_}="","",{inv_name("کد ماده")})'),
    IN("مقدار", 10, "#,##0.0"), IN("بهای واحد", 9, "#,##0.00"), IN("تخفیف", 9, MONEY),
    IN(SUPC, 11),
    CA(SUPN, 16, f'IF({me(SUPC)}="","",{lk("tblSuppliers", SUPN, SUPC, me(SUPC), chr(34) + BAD_CODE + chr(34))})'),
    IN("روش پرداخت", 10), IN("وضعیت", 10), IN("توضیح", 22),
    CA(CHK, 20, chk_f),
    CA(OKC, 7, f'IF({code_}="","",IF({me(CHK)}="",1,0))', "0"),
    CA("اثر بر موجودی", 11, f'IF({code_}="","",IF({me(OKC)}=1,IF({typ_}="ضایعات",-ABS({qty_}),{qty_}),0))', "#,##0.0"),
    CA("مبلغ خالص", 11, f'IF({code_}="","",IF(AND({me(OKC)}=1,{typ_}="خرید"),{qty_}*{price_}-N({disc_}),0))', MONEY),
    CA(ES, 11, f'IF({code_}="","",IF({me("وضعیت")}="","{APPROVED}",{me("وضعیت")}))'),
    CA(GD, 11, bal(gd(me("تاریخ"), f'{code_}<>""')), "0"),
]
stock_rows = []
for r in rows_of("tblPurchases"):
    stock_rows.append({"تاریخ": r["تاریخ"], "شماره سند": r["شماره خرید"], "نوع": "خرید", "کد ماده": r["کد ماده"],
                       "مقدار": r["تعداد"], "بهای واحد": r["بهای واحد"], "تخفیف": r["تخفیف"], SUPC: r[SUPC],
                       "روش پرداخت": r["روش پرداخت"], "وضعیت": r["وضعیت"], "توضیح": r["یادداشت"]})
for r in rows_of("tblStockAdjust"):
    neg = r["مقدار اصلاحی"] < 0 and "ضایعات" in str(r["علت"])
    stock_rows.append({"تاریخ": r["تاریخ"], "شماره سند": r["کد تعدیل"], "نوع": "ضایعات" if neg else "اصلاح موجودی",
                       "کد ماده": r["کد ماده"], "مقدار": abs(r["مقدار اصلاحی"]) if neg else r["مقدار اصلاحی"],
                       "وضعیت": r["وضعیت"], "توضیح": r["علت"]})
if CLEAN:
    stock_rows = []
LK = add_table(ws, STK, stock_cols, stock_rows, H0, 1)
S_ST = f'{STK}[{ES}],"{APPROVED}",{STK}[{OKC}],1,{STK}[{GD}],">="&Cfg_StockStartS'
ing_c = me("کد ماده")
ing_cols = [
    IN("کد ماده", 11), IN("نام ماده", 18), IN("گروه", 12), IN("واحد", 9),
    IN("موجودی آغازین", 11, "#,##0.0"), IN("بهای آغازین", 10, "#,##0.00"), IN("حد سفارش", 9, "#,##0"), IN(ING_SUP, 11),
    CA("ورودی خرید", 10, f'IF({ing_c}="","",SUMIFS({STK}[مقدار],{STK}[کد ماده],{ing_c},{STK}[نوع],"خرید",{S_ST}))', "#,##0.0"),
    CA("مصرف کل", 10, f'IF({ing_c}="","",SUMIFS(tblRecipe[مصرف کل],tblRecipe[کد ماده],{ing_c}))', "#,##0.0"),
    CA("ضایعات و اصلاح", 10, f'IF({ing_c}="","",SUMIFS({STK}[اثر بر موجودی],{STK}[کد ماده],{ing_c},{STK}[نوع],"<>خرید",{S_ST}))', "#,##0.0"),
    CA("موجودی فعلی", 11, f'IF({ing_c}="","",N({me("موجودی آغازین")})+{me("ورودی خرید")}+{me("ضایعات و اصلاح")}-{me("مصرف کل")})', "#,##0.0"),
    CA("بهای میانگین", 10, f'IF({ing_c}="","",IFERROR((N({me("موجودی آغازین")})*N({me("بهای آغازین")})+SUMIFS({STK}[مبلغ خالص],{STK}[کد ماده],{ing_c},{STK}[نوع],"خرید",{S_ST}))/(N({me("موجودی آغازین")})+{me("ورودی خرید")}),N({me("بهای آغازین")})))', "#,##0.000"),
    CA("ارزش موجودی", 11, f'IF({ing_c}="","",MAX({me("موجودی فعلی")},0)*{me("بهای میانگین")})', MONEY),
    CA("وضعیت", 11, f'IF({ing_c}="","",IF({me("موجودی فعلی")}<=0,"{OUT_STOCK}",IF({me("موجودی فعلی")}<=N({me("حد سفارش")}),"{LOW_STOCK}","{OK_STOCK}")))'),
    CA("کمبود تا حد سفارش", 11, f'IF({ing_c}="","",MAX(N({me("حد سفارش")})-{me("موجودی فعلی")},0))', "#,##0.0"),
    CA("مصرف بازه", 10, f'IF({ing_c}="","",SUMIFS(tblRecipe[مصرف بازه],tblRecipe[کد ماده],{ing_c}))', "#,##0.0"),
    CA("پوشش روز", 9, f'IF({ing_c}="","",IFERROR(IF({me("مصرف بازه")}<=0,"",MAX({me("موجودی فعلی")},0)/({me("مصرف بازه")}/MAX(RptTo-RptFrom+1,1))),""))', "0.0"),
    CA("ردیف هشدار", 8, f'IF(OR({ing_c}="",{me("وضعیت")}="{OK_STOCK}"),"",COUNTIFS(tblIngredients[[#Headers],[وضعیت]]:{me("وضعیت")},"<>{OK_STOCK}",tblIngredients[[#Headers],[کد ماده]]:{me("کد ماده")},"<>")-1)', "0"),
]
c_ing = len(stock_cols) + 2
LI = add_table(ws, "tblIngredients", ing_cols, rows_of("tblIngredients"), H0, c_ing)
ws.column_dimensions[CL(len(stock_cols) + 1)].width = 3
band(ws, 4, 1, len(stock_cols), "دفتر انبار: خرید ← ضایعات ← اصلاح موجودی (فقط ردیف «" + APPROVED + "» و بدون خطا اثر دارد)")
band(ws, 4, c_ing, c_ing + len(ing_cols) - 1, "مواد اولیه و موجودی زنده  |  موجودی = آغازین + خرید + اصلاح − ضایعات − مصرف فروش (طبق رسپی)")
strip(ws, 3, 1, [
    ("ردیف‌ها", f"=COUNTA({STK}[کد ماده])", INT),
    (DRAFT, f'=COUNTIF({STK}[{ES}],"{DRAFT}")', INT),
    ("ردیف نیازمند اصلاح", "=" + issue_count(STK, CHK), INT),
    ("خرید تاییدشده", f'=SUMIFS({STK}[مبلغ خالص],{STK}[{ES}],"{APPROVED}")', MONEY),
])
strip(ws, 3, c_ing, [
    ("مواد", "=COUNTA(tblIngredients[کد ماده])", INT),
    ("نیاز به خرید", f'=COUNTIF(tblIngredients[وضعیت],"{LOW_STOCK}")', INT),
    (OUT_STOCK, f'=COUNTIF(tblIngredients[وضعیت],"{OUT_STOCK}")', INT),
    ("ارزش انبار", "=SUM(tblIngredients[ارزش موجودی])", MONEY),
])
for col, nm in [("نوع", "StockTypes"), ("کد ماده", "IngredientCodes"), (SUPC, "SupplierCodes"), ("روش پرداخت", "PaymentMethods"), ("وضعیت", "ApprovalStatus")]:
    dv_list(ws, f"{LK[col]}{D0}:{LK[col]}{LAST}", nm)
q_, t_, p_ = LK["مقدار"], LK["نوع"], LK["بهای واحد"]
dv_custom(ws, f"{q_}{D0}:{q_}{LAST}", f'AND(ISNUMBER({q_}{D0}),{q_}{D0}<>0,OR({t_}{D0}="اصلاح موجودی",{q_}{D0}>0))',
          "خرید و ضایعات باید مقدار مثبت باشند؛ فقط «اصلاح موجودی» می‌تواند منفی باشد؛ صفر مجاز نیست.")
dv_custom(ws, f"{p_}{D0}:{p_}{LAST}", f'IF({t_}{D0}="خرید",AND(ISNUMBER({p_}{D0}),{p_}{D0}>=0),OR({p_}{D0}="",AND(ISNUMBER({p_}{D0}),{p_}{D0}>=0)))',
          "برای «خرید» بهای واحد الزامی و غیرمنفی است.")
dv_num(ws, f'{LK["تخفیف"]}{D0}:{LK["تخفیف"]}{LAST}', "decimal", "greaterThanOrEqual", 0, msg="تخفیف نمی‌تواند منفی باشد.")
for col, nm in [("گروه", "IngredientGroup"), ("واحد", "Units"), (ING_SUP, "SupplierCodes")]:
    dv_list(ws, f"{LI[col]}{D0}:{LI[col]}{LAST}", nm, strict=(col == ING_SUP))
for col in ["موجودی آغازین", "بهای آغازین", "حد سفارش"]:
    dv_num(ws, f"{LI[col]}{D0}:{LI[col]}{LAST}", "decimal", "greaterThanOrEqual", 0, msg="مقدار باید عدد غیرمنفی باشد.")
cf(ws, f'A{D0}:{CL(len(stock_cols))}{LAST}', f'${LK[CHK]}{D0}<>""', "F4B6B6")
cf(ws, f'A{D0}:{CL(len(stock_cols))}{LAST}', f'${LK[ES]}{D0}="{DRAFT}"', ORANGE_PALE)
cf(ws, f'A{D0}:{CL(len(stock_cols))}{LAST}', f'${LK[ES]}{D0}="{CANCEL}"', RED_PALE)
cf(ws, f'{LK["نام ماده"]}{D0}:{LK["نام ماده"]}{LAST}', f'${LK["نام ماده"]}{D0}="{BAD_CODE}"', "F4B6B6")
cf_dup(ws, LI["کد ماده"])
st = LI["وضعیت"]
cf(ws, f"{st}{D0}:{st}{LAST}", f'${st}{D0}="{OUT_STOCK}"', RED_PALE)
cf(ws, f"{st}{D0}:{st}{LAST}", f'${st}{D0}="{LOW_STOCK}"', ORANGE_PALE)
cf(ws, f'{LI["کمبود تا حد سفارش"]}{D0}:{LI["کمبود تا حد سفارش"]}{LAST}', f'AND(ISNUMBER(${LI["کمبود تا حد سفارش"]}{D0}),${LI["کمبود تا حد سفارش"]}{D0}>0)', ORANGE_PALE)
ws.freeze_panes = f"A{D0}"
define("IngredientCodes", "tblIngredients[کد ماده]")
set_print(ws, None, titles=f"{H0}:{H0}")

# ============================================================================ EXPENSES & CASH
ws = SHEETS["cash"]
title(ws, "هزینه‌ها و صندوق روزانه", LEGEND + " | خرید مواد فقط در «خرید و انبار» ثبت شود. «موجودی اول» هر روز خودکار از موجودی واقعی آخرین روز ثبت‌شده می‌آید.", 31)
EX = "tblExpenses"
has_e = f'{me("مبلغ")}<>""'
exp_cols = [IN("تاریخ", 12, "@"), IN("شماره هزینه", 12), IN("دسته هزینه", 14), IN("شرح", 24), IN("مبلغ", 11, MONEY),
            IN("روش پرداخت", 11), IN(EXP_BY, 11), IN("وضعیت", 10), IN("یادداشت", 20),
            CA(ES, 11, f'IF({me("مبلغ")}="","",IF({me("وضعیت")}="","{APPROVED}",{me("وضعیت")}))'),
            CA(GD, 11, bal(gd(me("تاریخ"), has_e)), "0")]
LE = add_table(ws, EX, exp_cols, rows_of("tblExpenses"), H0, 1)

cash_dt = me(GD)
prev_ = me("تاریخ قبلی")
gdn = lambda: f'ISNUMBER({cash_dt})'
# BUG 6 FIX: the daily cash sheet now carries the counted closing balance forward. Opening = previous recorded
# day's real count (so yesterday's shortage/surplus is absorbed, not lost); expected = opening + cash sales
# - cash expenses since that day - bank transfers; cumulative difference is shown per day.
cash_cols = [
    IN("تاریخ", 12, "@"), IN("افتتاحیه دستی", 10, MONEY),
    CA("موجودی اول", 11, bal(f'IF({gdn()},IF({me("افتتاحیه دستی")}<>"",{me("افتتاحیه دستی")},IF({prev_}<>"",SUMIFS(tblCash[موجودی واقعی],tblCash[{GD}],{prev_}),Cfg_CashOpen)),"")'), MONEY),
    CA("فروش نقدی", 10, f'IF({gdn()},SUMIFS(tblSales[فروش خالص],tblSales[{GD}],">="&IF({prev_}="",{cash_dt},{prev_}+1),tblSales[{GD}],"<="&{cash_dt},tblSales[روش پرداخت],"نقد",tblSales[{ES}],"{FINAL}"),"")', MONEY),
    CA("هزینه نقدی", 10, f'IF({gdn()},SUMIFS(tblExpenses[مبلغ],tblExpenses[{GD}],">="&IF({prev_}="",{cash_dt},{prev_}+1),tblExpenses[{GD}],"<="&{cash_dt},tblExpenses[روش پرداخت],"نقد",tblExpenses[{ES}],"{APPROVED}"),"")', MONEY),
    IN("انتقال به بانک", 10, MONEY),
    CA("انتظار", 10, f'IF({gdn()},{me("موجودی اول")}+{me("فروش نقدی")}-{me("هزینه نقدی")}-N({me("انتقال به بانک")}),"")', MONEY),
    IN("موجودی واقعی", 11, MONEY),
    CA("اختلاف", 9, f'IF(OR({me("موجودی واقعی")}="",{me("انتظار")}=""),"",{me("موجودی واقعی")}-{me("انتظار")})', MONEY),
    CA("اختلاف انباشته", 11, f'IF({me("اختلاف")}="","",SUMIFS(tblCash[اختلاف],tblCash[{GD}],"<="&{cash_dt}))', MONEY),
    CA("فروش کارت", 10, f'IF({gdn()},SUMIFS(tblSales[فروش خالص],tblSales[{GD}],{cash_dt},tblSales[روش پرداخت],"کارت",tblSales[{ES}],"{FINAL}"),"")', MONEY),
    CA("انتقال یا آنلاین", 11, f'IF({gdn()},SUMIFS(tblSales[فروش خالص],tblSales[{GD}],{cash_dt},tblSales[روش پرداخت],"انتقال",tblSales[{ES}],"{FINAL}")+SUMIFS(tblSales[فروش خالص],tblSales[{GD}],{cash_dt},tblSales[روش پرداخت],"آنلاین",tblSales[{ES}],"{FINAL}"),"")', MONEY),
    CA("نسیه", 9, f'IF({gdn()},SUMIFS(tblSales[فروش خالص],tblSales[{GD}],{cash_dt},tblSales[روش پرداخت],"نسیه",tblSales[{ES}],"{FINAL}"),"")', MONEY),
    CA("جمع فروش روز", 11, f'IF({gdn()},SUMIFS(tblSales[فروش خالص],tblSales[{GD}],{cash_dt},tblSales[{ES}],"{FINAL}"),"")', MONEY),
    IN("مسئول", 10), IN("یادداشت", 20),
    CA(GD, 11, bal(gd(me("تاریخ"), "FALSE")), "0"),
    CA("تاریخ قبلی", 11, bal(f'IF({gdn()},IF(_xlfn.MAXIFS(tblCash[{GD}],tblCash[{GD}],"<"&{cash_dt},tblCash[موجودی واقعی],"<>")=0,"",_xlfn.MAXIFS(tblCash[{GD}],tblCash[{GD}],"<"&{cash_dt},tblCash[موجودی واقعی],"<>")),"")'), "0"),
]
c_cash = len(exp_cols) + 2
cash_rows = rows_of("tblCash")
for i, r in enumerate(cash_rows):          # demo: only the first day needs a manual opening balance
    r["افتتاحیه دستی"] = r.pop("موجودی اول", None) if i == 0 else None
    r.pop("موجودی اول", None)
LC = add_table(ws, "tblCash", cash_cols, cash_rows, H0, c_cash)
ws.column_dimensions[CL(len(exp_cols) + 1)].width = 3
band(ws, 4, 1, len(exp_cols), "هزینه‌های عملیاتی")
band(ws, 4, c_cash, c_cash + len(cash_cols) - 1, "صندوق و تسویه روزانه (هر روز یک ردیف؛ «موجودی واقعی» را در پایان شیفت بشمارید)")
strip(ws, 3, 1, [("هزینه‌ها", "=COUNTA(tblExpenses[مبلغ])", INT), (DRAFT, f'=COUNTIF(tblExpenses[{ES}],"{DRAFT}")', INT),
                 ("جمع تاییدشده", f'=SUMIFS(tblExpenses[مبلغ],tblExpenses[{ES}],"{APPROVED}")', MONEY)])
strip(ws, 3, c_cash, [("روزهای ثبت‌شده", "=COUNT(tblCash[تاریخ میلادی])", INT), ("روز با اختلاف", "=SUMPRODUCT(ISNUMBER(tblCash[اختلاف])*(tblCash[اختلاف]<>0))", INT),
                      ("جمع اختلاف", "=SUM(tblCash[اختلاف])", MONEY)])
for col, nm in [("دسته هزینه", "ExpenseCategory"), ("روش پرداخت", "PaymentMethods"), (EXP_BY, "StaffCodes"), ("وضعیت", "ApprovalStatus")]:
    dv_list(ws, f"{LE[col]}{D0}:{LE[col]}{LAST}", nm)
dv_list(ws, f'{LC["مسئول"]}{D0}:{LC["مسئول"]}{LAST}', "StaffCodes")
dv_num(ws, f'{LE["مبلغ"]}{D0}:{LE["مبلغ"]}{LAST}', "decimal", "greaterThan", 0, msg="مبلغ باید بزرگ‌تر از صفر باشد.")
cf(ws, f"A{D0}:{CL(len(exp_cols))}{LAST}", f'${LE["وضعیت"]}{D0}="{DRAFT}"', ORANGE_PALE)
cf(ws, f"A{D0}:{CL(len(exp_cols))}{LAST}", f'${LE["وضعیت"]}{D0}="{CANCEL}"', RED_PALE)
cf_baddate(ws, LE["تاریخ"], LE[GD])
cf_baddate(ws, LC["تاریخ"], LC[GD])
cf_dup(ws, LC["تاریخ"])
ad = LC["اختلاف"]
cf(ws, f"{ad}{D0}:{ad}{LAST}", f"AND(ISNUMBER(${ad}{D0}),${ad}{D0}<>0)", RED_PALE)
ws.freeze_panes = f"A{D0}"
set_print(ws, None, titles=f"{H0}:{H0}")

# ============================================================================ ATTENDANCE & PAYROLL
ws = SHEETS["hr"]
title(ws, "حضور و غیاب و حقوق ماهانه", LEGEND + " | حقوق پایه به نسبت روزهای حضور تاییدشده (به‌علاوه مرخصی با حقوق) پرداخت می‌شود؛ ماه حقوق را به شکل 1405/08 بنویسید.", 36)
AT = "tblAttendance"
staff_name = lambda k: lk("tblStaff", "نام و نام خانوادگی", "کد پرسنل", me(k), chr(34) + BAD_CODE + chr(34))
a_code, a_gd = me("کد پرسنل"), me(GD)
att_chk = bal(
    f'IF({a_code}="","",IF({me("نام")}="{BAD_CODE}","کد پرسنل نامعتبر",IF({a_gd}="{DATE_BAD}","تاریخ خالی یا نامعتبر",'
    f'IF(OR({me("ورود")}="",{me("خروج")}=""),"ورود یا خروج خالی",IF(N({me("ساعات کار")})<=0,"ساعت کار صفر",'
    f'IF(COUNTIFS({AT}[کد پرسنل],{a_code},{AT}[{GD}],{a_gd},{AT}[{ES}],"<>{CANCEL}")>1,"ردیف تکراری برای این روز",""))))))')
att_cols = [
    IN("تاریخ", 12, "@"), IN("کد پرسنل", 11),
    CA("نام", 20, f'IF({a_code}="","",{staff_name("کد پرسنل")})'),
    CA("ساعت برنامه", 9, f'IF({a_code}="","",{lk("tblStaff", "ساعت روزانه", "کد پرسنل", a_code, "Cfg_StdHours")})', "0.0"),
    IN("ورود", 8, "hh:mm"), IN("خروج", 8, "hh:mm"), IN("استراحت", 9, "0.0"),
    CA("ساعات کار", 9, f'IF(OR({me("ورود")}="",{me("خروج")}=""),"",MAX(0,MOD({me("خروج")}-{me("ورود")},1)*24-N({me("استراحت")})))', "0.0"),
    CA("عادی", 8, f'IF({me("ساعات کار")}="","",MIN({me("ساعات کار")},{me("ساعت برنامه")}))', "0.0"),
    CA(OTC, 9, f'IF({me("ساعات کار")}="","",MAX({me("ساعات کار")}-{me("عادی")},0))', "0.0"),
    IN("وضعیت", 10), IN("یادداشت", 18),
    CA(ES, 11, f'IF({a_code}="","",IF({me("وضعیت")}="","{APPROVED}",{me("وضعیت")}))'),
    CA(GD, 11, bal(gd(me("تاریخ"), f'{a_code}<>""')), "0"),
    CA(CHK, 20, att_chk),
    CA(OKC, 7, f'IF({a_code}="","",IF({me(CHK)}="",1,0))', "0"),
]
att_rows = rows_of("tblAttendance")
for r in att_rows:
    r.pop("ساعت برنامه", None)
LA = add_table(ws, AT, att_cols, att_rows, H0, 1)
p_start, p_end = me("شروع ماه"), me("پایان ماه")
mr = lambda tbl: f'{tbl}[{GD}],">="&{p_start},{tbl}[{GD}],"<="&{p_end}'
pay_att = lambda col: f'SUMIFS({AT}[{col}],{AT}[کد پرسنل],{me("کد پرسنل")},{mr(AT)},{AT}[{ES}],"{APPROVED}",{AT}[{OKC}],1)'
pc = me("کد پرسنل")
pay_msg = bal(
    f'IF({pc}="","",IF({me("نام")}="{BAD_CODE}","کد پرسنل نامعتبر",IF({p_start}="{DATE_BAD}","ماه نامعتبر",'
    f'IF(COUNTIFS(tblPayroll[کد پرسنل],{pc},tblPayroll[شروع ماه],{p_start},tblPayroll[{ES}],"<>{CANCEL}")>1,"ردیف تکراری برای این ماه",'
    f'IF(AND({me("روز حضور")}=0,N({me("مرخصی با حقوق")})=0),"بدون حضور ثبت‌شده؛ حقوق پایه صفر","")))))')
pay_cols = [
    IN("ماه", 10, "@"), IN("کد پرسنل", 11),
    CA("نام", 20, f'IF({pc}="","",{staff_name("کد پرسنل")})'),
    CA("حقوق پایه", 10, f'IF({pc}="","",{lk("tblStaff", "حقوق پایه", "کد پرسنل", pc, "0")})', MONEY),
    CA("روز حضور", 8, f'IF({pc}="","",COUNTIFS({AT}[کد پرسنل],{pc},{mr(AT)},{AT}[{ES}],"{APPROVED}",{AT}[{OKC}],1))', "0"),
    IN("مرخصی با حقوق", 9, "0"),
    CA("ساعت عادی", 9, f'IF({pc}="","",{pay_att("عادی")})', "0.0"),
    CA(OTC, 9, f'IF({pc}="","",{pay_att(OTC)})', "0.0"),
    CA("نرخ ساعتی", 9, f'IF({pc}="","",IFERROR({me("حقوق پایه")}/(Cfg_WorkDays*Cfg_StdHours),0))', '#,##0.00'),
    CA("مبلغ اضافه" + ZW + "کاری", 10, f'IF({pc}="","",{me(OTC)}*{me("نرخ ساعتی")}*Cfg_OT)', MONEY),
    CA("کمیسیون", 10, f'IF({pc}="","",SUMIFS(tblSales[فروش خالص],tblSales[کد پرسنل],{pc},{mr("tblSales")},tblSales[{ES}],"{FINAL}")*{lk("tblStaff", "درصد کمیسیون", "کد پرسنل", pc, "0")})', MONEY),
    IN("پاداش", 9, MONEY), IN("کسورات", 9, MONEY),
    # BUG 3 FIX: base salary is pro-rated by approved attendance days (+ paid leave); no attendance = no base pay.
    CA("حقوق پایه پرداختنی", 11, f'IF({pc}="","",IFERROR({me("حقوق پایه")}*MIN(1,({me("روز حضور")}+N({me("مرخصی با حقوق")}))/Cfg_WorkDays),0))', MONEY),
    CA("حقوق نهایی", 11, f'IF({pc}="","",{me("حقوق پایه پرداختنی")}+{me("مبلغ اضافه" + ZW + "کاری")}+{me("کمیسیون")}+N({me("پاداش")})-N({me("کسورات")}))', MONEY),
    IN("وضعیت", 10), IN("یادداشت", 18),
    CA(ES, 11, f'IF({pc}="","",IF({me("وضعیت")}="","{APPROVED}",{me("وضعیت")}))'),
    CA("شروع ماه", 11, bal(mstart(me("ماه"), f'{pc}<>""')), "0"),
    CA("پایان ماه", 11, f'IF({p_start}="","",IFERROR(INDEX(MonEnd,MATCH({p_start},MonStart,0)),"{DATE_BAD}"))', "0"),
    CA(CHK, 24, pay_msg),
]
c_pay = len(att_cols) + 2
LP = add_table(ws, "tblPayroll", pay_cols, rows_of("tblPayroll"), H0, c_pay)
ws.column_dimensions[CL(len(att_cols) + 1)].width = 3
band(ws, 4, 1, len(att_cols), "حضور و غیاب روزانه")
band(ws, 4, c_pay, c_pay + len(pay_cols) - 1, "محاسبه حقوق ماهانه (هر ماه یک ردیف برای هر نفر؛ ماه شمسی مثل 1405/08)")
strip(ws, 3, 1, [("ردیف‌ها", f"=COUNTA({AT}[کد پرسنل])", INT), (DRAFT, f'=COUNTIF({AT}[{ES}],"{DRAFT}")', INT),
                 ("ردیف نیازمند اصلاح", "=" + issue_count(AT, CHK), INT), ("جمع اضافه" + ZW + "کاری", f"=SUM({AT}[{OTC}])", "0.0")])
strip(ws, 3, c_pay, [("ردیف حقوق", "=COUNTA(tblPayroll[کد پرسنل])", INT), ("هشدار حقوق", "=" + issue_count("tblPayroll", CHK), INT),
                     ("جمع حقوق", f'=SUMIFS(tblPayroll[حقوق نهایی],tblPayroll[{ES}],"{APPROVED}")', MONEY)])
dv_list(ws, f'{LA["کد پرسنل"]}{D0}:{LA["کد پرسنل"]}{LAST}', "StaffCodes")
dv_list(ws, f'{LA["وضعیت"]}{D0}:{LA["وضعیت"]}{LAST}', "ApprovalStatus")
dv_list(ws, f'{LP["کد پرسنل"]}{D0}:{LP["کد پرسنل"]}{LAST}', "StaffCodes")
dv_list(ws, f'{LP["وضعیت"]}{D0}:{LP["وضعیت"]}{LAST}', "ApprovalStatus")
dv_num(ws, f'{LA["ورود"]}{D0}:{LA["خروج"]}{LAST}', "time", "between", 0, 0.99999, "ساعت را به شکل 09:00 وارد کنید.")
dv_num(ws, f'{LA["استراحت"]}{D0}:{LA["استراحت"]}{LAST}', "decimal", "between", 0, 12, "استراحت را به ساعت (0 تا 12) وارد کنید.")
dv_num(ws, f'{LP["مرخصی با حقوق"]}{D0}:{LP["مرخصی با حقوق"]}{LAST}', "decimal", "between", 0, 31, "تعداد روز مرخصی بین 0 و 31 باشد.")
cf(ws, f"A{D0}:{CL(len(att_cols))}{LAST}", f'${LA[CHK]}{D0}<>""', "F4B6B6")
cf(ws, f"A{D0}:{CL(len(att_cols))}{LAST}", f'${LA[ES]}{D0}="{DRAFT}"', ORANGE_PALE)
cf(ws, f"A{D0}:{CL(len(att_cols))}{LAST}", f'${LA[ES]}{D0}="{CANCEL}"', RED_PALE)
cf(ws, f'{LP[CHK]}{D0}:{LP[CHK]}{LAST}', f'LEN(${LP[CHK]}{D0})>0', ORANGE_PALE)
cf_baddate(ws, LP["ماه"], LP["شروع ماه"])
ws.freeze_panes = f"A{D0}"
set_print(ws, None, titles=f"{H0}:{H0}")

# ============================================================================ BASE DATA & SETTINGS
ws = SHEETS["base"]
title(ws, "پایه‌ها و تنظیمات | پرسنل، تأمین‌کنندگان، تنظیمات و اهداف", LEGEND, 40)
staff_cols = [IN("کد پرسنل", 11), IN("نام و نام خانوادگی", 20), IN("سمت", 11), IN("موبایل", 12), IN("تاریخ استخدام", 12, "@"),
              IN("حقوق پایه", 10, MONEY), IN("درصد کمیسیون", 10, "0.0%"), IN("هدف فروش فردی", 11, MONEY), IN("ساعت روزانه", 8, "0.0"),
              IN("فعال؟", 7), IN("یادداشت", 18)]
LSF = add_table(ws, "tblStaff", staff_cols, rows_of("tblStaff"), H0, 1)
sup_cols = [IN(SUPC, 11), IN(SUPN, 20), IN("شخص تماس", 14), IN("موبایل", 13), IN("حوزه تأمین", 18), IN("شرایط پرداخت", 11), IN("فعال؟", 7)]
c_sup = len(staff_cols) + 2
LSU = add_table(ws, "tblSuppliers", sup_cols, rows_of("tblSuppliers"), H0, c_sup)
set_cols = [IN("عنوان", 22), IN("مقدار", 18), IN("توضیح", 40)]
set_rows = rows_of("tblSettings")
extra_settings = [
    ("روز کاری ماه", 22, "مبنای نرخ ساعتی و تناسب حقوق پایه: حقوق ÷ روز کاری؛ روزهای حضور تاییدشده نسبت به این عدد حساب می‌شود"),
    ("موجودی آغازین صندوق", 0, "موجودی نقد اولین روز ثبت صندوق (هزار تومان)؛ بعد از آن موجودی اول هر روز خودکار است"),
    ("تاریخ شروع انبار", None, "اختیاری، شمسی مثل 1405/08/01؛ خرید، فروش و اصلاح قبل از این تاریخ در انبار حساب نمی‌شود (خالی = همه)"),
    ("دسته هزینه حقوق", SALARY_CAT, "هزینه‌های این دسته در سود و زیان حساب نمی‌شود چون حقوق از جدول «حضور و حقوق» می‌آید"),
]
idx = [i for i, r in enumerate(set_rows) if "ضریب" in r["عنوان"]][0] + 1
for k, (t_, v_, d_) in enumerate(extra_settings):
    set_rows.insert(idx + k, {"عنوان": t_, "مقدار": v_, "توضیح": d_})
c_set = c_sup + len(sup_cols) + 1
LSE = add_table(ws, "tblSettings", set_cols, set_rows, H0, c_set)
ws.column_dimensions[CL(len(staff_cols) + 1)].width = 3
ws.column_dimensions[CL(c_sup + len(sup_cols))].width = 3
band(ws, 4, 1, len(staff_cols), "پرسنل")
band(ws, 4, c_sup, c_sup + len(sup_cols) - 1, "تأمین‌کنندگان")
band(ws, 4, c_set, c_set + 2, "تنظیمات کسب‌وکار")
SET_ROW0 = D0
names_map = {"نام کسب" + ZW + "وکار": "Cfg_CafeName", "نرخ مالیات": "Cfg_Tax", "ساعت استاندارد روزانه": "Cfg_StdHours",
             "ضریب اضافه" + ZW + "کاری": "Cfg_OT", "روز کاری ماه": "Cfg_WorkDays", "تلفن کافه": "Cfg_Phone",
             "آدرس کافه": "Cfg_Address", "اینستاگرام": "Cfg_Instagram", "موجودی آغازین صندوق": "Cfg_CashOpen",
             "تاریخ شروع انبار": "Cfg_StockStart", "دسته هزینه حقوق": "Cfg_SalaryCat"}
vcol = CL(c_set + 1)
for i, r in enumerate(set_rows):
    if r["عنوان"] in names_map:
        define(names_map[r["عنوان"]], f"{qn(ws)}!${vcol}${SET_ROW0 + i}")
assert len([r for r in set_rows if r["عنوان"] in names_map]) == len(names_map), "settings names"
row_of = lambda t: SET_ROW0 + [i for i, r in enumerate(set_rows) if r["عنوان"] == t][0]
ws[f"{vcol}{row_of('نرخ مالیات')}"].number_format = PCT
ws[f"{vcol}{row_of('تاریخ شروع انبار')}"].number_format = "@"
# targets table sits beside the settings (never stacked under a table that can grow)
c_tgt = c_set + 4
tgt_cols = [IN("ماه", 10, "@"), IN("هدف فروش", 12, MONEY), IN("هدف سود ناخالص", 13, MONEY), IN("هدف سود خالص", 12, MONEY),
            IN("سقف بهای مواد", 11, PCT), IN("سقف هزینه", 10, PCT), IN("یادداشت", 20),
            CA("شروع ماه", 11, bal(mstart(me("ماه"), f'{me("هدف فروش")}<>""')), "0")]
LT = add_table(ws, "tblTargets", tgt_cols, rows_of("tblTargets"), H0, c_tgt)
band(ws, 4, c_tgt, c_tgt + len(tgt_cols) - 1, "اهداف ماهانه (هر ماه یک ردیف؛ ماه شمسی مثل 1405/08)")
# quick guide below the settings
g0 = SET_ROW0 + len(set_rows) + 2
band(ws, g0, c_set, c_set + 2, "راهنمای سریع")
guide = [
    "۱) راه‌اندازی: پرسنل و تأمین‌کنندگان ← مواد (خرید و انبار) ← منو و دستورپخت ← موجودی آغازین ← فروش.",
    "۲) تاریخ‌ها شمسی و متنی‌اند: 1405/08/02 (هر جداکننده و ارقام فارسی هم قبول است). ردیف قرمز = تاریخ نامعتبر.",
    "۳) روزانه: فروش ← فاکتور (چاپ) ← هزینه و صندوق (موجودی واقعی) ← حضور و حقوق.",
    "۳-۱) شماره فاکتور خودکار است: در «فروش» فقط «فاکتور روز» را بزنید (اولین فاکتور هر روز 1، بعدی 2…)؛ شماره کامل مثل R-14050802-01 ساخته می‌شود. بدون ماکرو و دکمه، در Excel وب و موبایل هم کار می‌کند.",
    "۴) انبار خودکار: خرید زیاد می‌کند؛ فروش طبق رسپی، ضایعات و اصلاح کم می‌کنند؛ کمبودها در داشبورد و ستون «وضعیت» مواد دیده می‌شوند.",
    "۵) ماهانه: داشبورد ← بازه تاریخ را بنویسید؛ حقوق ماه را در «حضور و حقوق» ثبت کنید.",
    "۶) کد محصول، ماده و پرسنل یکتا باشد و بعد از ثبت تراکنش عوض نشود؛ برای حذف از منو «فعال؟ = خیر» بزنید.",
    "۷) دسته منو، گروه مواد، واحد، سمت و دسته هزینه را در شیت «فهرست‌ها» اضافه یا حذف کنید.",
]
for i, t in enumerate(guide):
    ws.merge_cells(start_row=g0 + 1 + i, start_column=c_set, end_row=g0 + 1 + i, end_column=c_set + 2)
    c = ws.cell(g0 + 1 + i, c_set, t)
    c.font, c.fill = font(9, False, "584421"), fill("FAF1DE")
    c.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
    ws.row_dimensions[g0 + 1 + i].height = 28
strip(ws, 3, 1, [("پرسنل فعال", '=COUNTIF(tblStaff[فعال؟],"بله")', INT), ("تأمین‌کننده", f"=COUNTA(tblSuppliers[{SUPC}])", INT)])
cf_dup(ws, LSF["کد پرسنل"], 500)
cf_dup(ws, LSU[SUPC], 500)
cf_baddate(ws, LT["ماه"], LT["شروع ماه"])
dv_list(ws, f'{LSF["سمت"]}{D0}:{LSF["سمت"]}{LAST}', "Roles", strict=False)
dv_list(ws, f'{LSF["فعال؟"]}{D0}:{LSF["فعال؟"]}{LAST}', "ActiveList")
dv_list(ws, f'{LSU["فعال؟"]}{D0}:{LSU["فعال؟"]}{LAST}', "ActiveList")
dv_num(ws, f'{LSF["حقوق پایه"]}{D0}:{LSF["حقوق پایه"]}{LAST}', "decimal", "greaterThanOrEqual", 0, msg="حقوق باید عدد غیرمنفی باشد.")
dv_num(ws, f'{LSF["درصد کمیسیون"]}{D0}:{LSF["درصد کمیسیون"]}{LAST}', "decimal", "between", 0, 1, "درصد کمیسیون بین 0 و 1 باشد (مثلاً 0.003).")
dv_num(ws, f'{LSF["ساعت روزانه"]}{D0}:{LSF["ساعت روزانه"]}{LAST}', "decimal", "between", 1, 24, "ساعت روزانه بین 1 و 24 باشد.")
cf(ws, f'A{D0}:{CL(len(staff_cols))}{LAST}', f'${LSF["فعال؟"]}{D0}="خیر"', "E5E5E5")
cf(ws, f'{CL(c_sup)}{D0}:{CL(c_sup + len(sup_cols) - 1)}{LAST}', f'${LSU["فعال؟"]}{D0}="خیر"', "E5E5E5")
ws.freeze_panes = f"A{D0}"
define("StaffCodes", "tblStaff[کد پرسنل]")
define("SupplierCodes", f"tblSuppliers[{SUPC}]")
set_print(ws, None, titles=f"{H0}:{H0}")

# ============================================================================ INVOICE (print)
ws = SHEETS["inv"]
for r in range(1, 32):
    for c in range(1, 7):
        ws.cell(r, c).fill = fill(CREAM)
        ws.cell(r, c).font = font(10)
        ws.cell(r, c).alignment = Alignment(horizontal="right", vertical="center")
for col, w in {"A": 12, "B": 28, "C": 9, "D": 15, "E": 15, "F": 16, "H": 3, "I": 34}.items():
    ws.column_dimensions[col].width = w
ws.merge_cells("A1:F1")
ws["A1"] = '=Cfg_CafeName&" | فاکتور فروش"'
ws["A1"].font = font(20, True, WHITE)
ws["A1"].fill = fill(DARK)
ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
ws.row_dimensions[1].height = 38
ws.merge_cells("A2:F2")
ws["A2"] = '=TRIM(IF(Cfg_Phone="","",Cfg_Phone&"   |   ")&IF(Cfg_Address="","",Cfg_Address&"   |   ")&IF(Cfg_Instagram="","",Cfg_Instagram))'
ws["A2"].font = font(9, False, "40524A", True)
ws["A2"].alignment = Alignment(horizontal="center", vertical="center")
# v4.1: invoice picker without macros. The printed number (B4) is a formula: the invoice chosen in I3, or the
# latest invoice when I3 is empty. The dropdown lists distinct invoice numbers, newest first (support sheet Y:Z).
N_INVLIST = 300
sup["Y4"], sup["Z4"] = "کلید فاکتور (جدیدترین اول)", "شماره فاکتور"
for i in range(N_INVLIST):
    r = 5 + i
    if i == 0:
        sup.cell(r, 25, f'=IF(MAX(tblSales[{IK}])=0,"",MAX(tblSales[{IK}]))')
    else:
        nxt = f'_xlfn.MAXIFS(tblSales[{IK}],tblSales[{IK}],"<"&Y{r - 1})'
        sup.cell(r, 25, f'=IF(N(Y{r - 1})=0,"",IF({nxt}=0,"",{nxt}))')
    sup.cell(r, 25).number_format = "0"
    sup.cell(r, 26, f'=IF(Y{r}="","","R-"&INT(Y{r}/1000)&"-"&TEXT(MOD(Y{r},1000),"00"))')
define("LastInvoice", f"{qn(sup)}!$Z$5")
define("InvoiceList", f"OFFSET({qn(sup)}!$Z$5,0,0,MAX(1,COUNT({qn(sup)}!$Y$5:$Y${4 + N_INVLIST})),1)")
for c, v in [("I2", "انتخاب فاکتور برای چاپ (خالی = آخرین فاکتور)"), ("I3", None),
             ("I4", '="آخرین فاکتور ثبت‌شده: "&LastInvoice'),
             ("I5", f'="فاکتور بعدی امروز در شیت فروش: "&(_xlfn.MAXIFS(tblSales[{DN}],tblSales[{GD}],TODAY())+1)'),
             ("I6", '=IF(TRIM(I3&"")="",LastInvoice,TRIM(I3&""))')]:
    ws[c] = v
    ws[c].font = font(9, c == "I2", DARK if c in ("I2", "I3") else "666666")
    ws[c].alignment = Alignment(horizontal="right", vertical="center")
ws["I3"].fill = fill(IN_FILL)
ws["I3"].font = font(11, True, DARK)
ws["I3"].border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
ws["I7"] = "↑ فاکتورِ در حال نمایش (خودکار)"
ws["I7"].font = font(8, False, "888888")
define("InvSel", f"{qn(ws)}!$I$6")
dv_list(ws, "I3", "InvoiceList", strict=False)
ws.merge_cells("A3:F3")
ws["A3"] = ('=IF(InvSel="","هنوز فاکتوری در شیت فروش ثبت نشده است",IF(COUNTIF(tblSales[شماره فاکتور],InvSel)=0,"⚠ شماره فاکتور یافت نشد",'
            'IF(COUNTIF(tblSales[شماره فاکتور],InvSel)>14,"⚠ اقلام بیش از 14 ردیف است؛ چاپ فقط 14 قلم اول را نشان می‌دهد",'
            'IF(COUNTIFS(tblSales[شماره فاکتور],InvSel,tblSales[وضعیت],"<>' + CANCEL + '")=0,"⚠ این فاکتور ابطال شده است",""))))')
ws["A3"].font = font(9, True, "B00020")
ws["A3"].alignment = Alignment(horizontal="center", vertical="center")
labels = [("A4", "شماره فاکتور:"), ("D4", "تاریخ:"), ("A5", "مشتری:"), ("D5", "پرسنل:"), ("A6", "تلفن:"), ("D6", "پرداخت:"), ("A7", "سفارش:"), ("D7", "وضعیت:")]
for c, lab in labels:
    ws[c] = lab
    ws[c].font = font(10, True, DARK)
mfld = f"MATCH(InvSel,tblSales[شماره فاکتور],0)"
ws.merge_cells("B4:C4")
ws["B4"] = "=InvSel"
ws["B4"].font = font(11, True, DARK)
for cell, col, fmt in [("E4", "تاریخ", None), ("B5", "نام مشتری", None), ("B6", "تلفن", None), ("E6", "روش پرداخت", None), ("B7", "میز/سفارش", None), ("E7", ES, None)]:
    ws.merge_cells(f"{cell}:{'F' if cell.startswith('E') else 'C'}{cell[1]}")
    ws[cell] = f'=IFERROR(INDEX({tc("tblSales", col)},{mfld})&"","")'
ws.merge_cells("E5:F5")
ws["E5"] = f'=IFERROR({lk("tblStaff", "نام و نام خانوادگی", "کد پرسنل", f"INDEX(tblSales[کد پرسنل],{mfld})")},"")'
for r in range(4, 8):
    for c in range(1, 7):
        ws.cell(r, c).border = Border(bottom=THIN)
for c, h in enumerate(["ردیف", "شرح آیتم", "تعداد", "قیمت واحد", "تخفیف", "مبلغ"], 1):
    cell = ws.cell(9, c, h)
    cell.fill, cell.font = fill(GREEN), font(10, True, WHITE)
    cell.alignment = Alignment(horizontal="center", vertical="center")
for r in range(10, 24):
    k = r - 9
    col_ = "tblSales[شماره فاکتور]"
    if k == 1:
        # empty selection must not match the empty number of an unused table row
        ws.cell(r, 9, f'=IF(InvSel="","",IFERROR(MATCH(InvSel,{col_},0),""))')
    else:
        ws.cell(r, 9, f'=IF($I{r - 1}="","",IFERROR($I{r - 1}+MATCH(InvSel,INDEX({col_},$I{r - 1}+1):INDEX({col_},ROWS({col_})),0),""))')
    ws.cell(r, 1, f'=IF($I{r}="","",{k})')
    # a cancelled line stays visible (marked) but shows zero discount/amount, so the lines add up to the totals
    cxl = f'INDEX(tblSales[وضعیت],$I{r})="{CANCEL}"'
    for c, col in [(2, "نام محصول"), (3, "تعداد"), (4, "قیمت واحد"), (5, "مبلغ تخفیف"), (6, "فروش خالص")]:
        v = f'INDEX({tc("tblSales", col)},$I{r})'
        v = {2: f'{v}&IF({cxl}," (ابطال)","")', 5: f'IF({cxl},0,{v})', 6: f'IF({cxl},0,{v})'}.get(c, v)
        ws.cell(r, c, f'=IF($I{r}="","",{v})')
        if c >= 4:
            ws.cell(r, c).number_format = MONEY
    for c in range(1, 7):
        ws.cell(r, c).border = Border(bottom=THIN)
        ws.cell(r, c).alignment = Alignment(horizontal="right" if c == 2 else "center", vertical="center")
ws["I9"] = "ردیف کمکی (چاپ نمی‌شود)"
ws["I9"].font = font(8, False, "888888")
for r in range(10, 24):
    ws.cell(r, 9).font = font(8, False, "888888")
tot = [("D25", "جمع تخفیف:", f'=SUMIFS(tblSales[مبلغ تخفیف],tblSales[شماره فاکتور],InvSel,tblSales[وضعیت],"<>{CANCEL}")'),
       ("D26", "جمع پیش از مالیات:", f'=SUMIFS(tblSales[فروش خالص],tblSales[شماره فاکتور],InvSel,tblSales[وضعیت],"<>{CANCEL}")'),
       ("D27", "مالیات:", "=F26*Cfg_Tax"), ("D28", "مبلغ قابل پرداخت:", "=F26+F27")]
for c, lab, f in tot:
    r = int(c[1:])
    ws.merge_cells(f"D{r}:E{r}")
    ws[c] = lab
    ws[c].font = font(10, True, DARK)
    ws[f"F{r}"] = f
    ws[f"F{r}"].number_format = MONEY
    ws[f"F{r}"].font = font(10, True, DARK)
    ws[f"F{r}"].fill = fill(GOLD if r == 28 else "FAF1DE")
    ws[f"F{r}"].alignment = Alignment(horizontal="center", vertical="center")
ws.merge_cells("A30:F30")
ws["A30"] = '="سپاس از انتخاب شما 🌿 | "&Cfg_CafeName&" | مبالغ به "&"' + UNIT + '"'
ws["A30"].font = font(9, False, "40524A", True)
ws["A30"].alignment = Alignment(horizontal="center", vertical="center")
ws.sheet_view.zoomScale = 110
set_print(ws, "A1:F30", "portrait", tall=1)


# ============================================================================ DASHBOARD (+ reports)
ws = SHEETS["dash"]
for c in range(1, 15):
    ws.column_dimensions[CL(c)].width = 14.5
for c in range(13, 22):
    ws.column_dimensions[CL(c)].hidden = True
title(ws, "داشبورد مدیریتی و گزارش‌ها", "همه ارقام به " + UNIT + " و فقط از داده‌های «" + FINAL + "» / «" + APPROVED + "». تاریخ‌ها شمسی (مثل 1405/08/02)؛ خانه‌های زرد ردیف ۳ بازه گزارش را تعیین می‌کنند.", 12)
TODAY_KEY = "INDEX(CalKey,MATCH(TODAY(),CalSerial,0))"
if CLEAN:
    DEF = [f'=IFERROR({jtxt(f"INDEX(MonStart,MATCH(INT({TODAY_KEY}/100),MonKey,0))")},"")',
           f'=IFERROR({jtxt(f"INDEX(MonEnd,MATCH(INT({TODAY_KEY}/100),MonKey,0))")},"")',
           f'=IFERROR({jtxt("TODAY()")},"")',
           f"=IFERROR(INT({TODAY_KEY}/10000),1405)"]
else:
    DEF = ["1405/07/01", "1405/07/30", "1405/07/22", 1405]
ctrl = [("A3", "از تاریخ", "B3", DEF[0]), ("C3", "تا تاریخ", "D3", DEF[1]), ("E3", "روز گزارش", "F3", DEF[2]), ("G3", "سال گزارش", "H3", DEF[3])]
for lc, lab, vc, val in ctrl:
    ws[lc] = lab
    ws[lc].font = font(9, True, DARK)
    ws[lc].alignment = Alignment(horizontal="center", vertical="center")
    ws[lc].fill = fill(PALE_GREEN)
    ws[vc] = val
    ws[vc].number_format = "General"
    ws[vc].fill = fill(IN_FILL)
    ws[vc].font = font(10, True, DARK)
    ws[vc].alignment = Alignment(horizontal="center", vertical="center")
    ws[vc].border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
# hidden helper cells: serials / keys behind the Jalali inputs
helpers = {
    "O3": "=" + gd("$B$3", "TRUE"), "P3": "=" + gd("$D$3", "TRUE"), "Q3": "=" + gd("$F$3", "TRUE"),
    "R3": '=IFERROR(INT(INDEX(CalKey,MATCH(O3,CalSerial,0))/100),"")', "S3": '=IFERROR(INT(INDEX(CalKey,MATCH(P3,CalSerial,0))/100),"")',
    "T3": '=IFERROR(INDEX(MonStart,MATCH(R3,MonKey,0)),"")', "U3": "=IFERROR(VALUE(" + jn("$H$3") + "),0)",
}
for k, f in helpers.items():
    ws[k] = bal(f)
ws["I3"] = "ماه‌های بازه"
ws["I3"].font, ws["I3"].fill = font(9, True, DARK), fill(PALE_GREEN)
ws["I3"].alignment = Alignment(horizontal="center", vertical="center")
ws["J3"] = "=IFERROR((INT(S3/100)-INT(R3/100))*12+MOD(S3,100)-MOD(R3,100)+1,1)"
ws["J3"].font, ws["J3"].alignment = font(10, True, DARK), Alignment(horizontal="center", vertical="center")
ws["J3"].border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
ws["J3"].number_format = "0"
BADC = '"' + BAD_CODE + '"'
# BUG 8 FIX: duplicate counter counts UNIQUE duplicated codes (each code once), not every duplicated cell.
dup = lambda t, c: f'SUMPRODUCT(({t}[{c}]<>"")*(COUNTIF({t}[{c}],{t}[{c}])>1)/COUNTIF({t}[{c}],{t}[{c}]&""))'
ws["M3"] = bal(
    f'=COUNTIF(tblSales[کد محصول],{BADC})+COUNTIF(tblSales[{GD}],"{DATE_BAD}")+{NO_INV}'
    f'+{issue_count("tblStockLog", CHK)}+{issue_count(AT, CHK)}+{issue_count("tblPayroll", CHK)}'
    f'+COUNTIF(tblRecipe[نام ماده],{BADC})+COUNTIF(tblRecipe[نام محصول],{BADC})'
    f'+COUNTIF(tblExpenses[{GD}],"{DATE_BAD}")+COUNTIF(tblCash[{GD}],"{DATE_BAD}")+COUNTIF(tblTargets[شروع ماه],"{DATE_BAD}")'
    f'+COUNTIF(tblMenu[وضعیت رسپی],"بدون رسپی")+{dup("tblMenu", "کد محصول")}+{dup("tblIngredients", "کد ماده")}+{dup("tblStaff", "کد پرسنل")}+{dup("tblSuppliers", SUPC)}'
    f'+IF(Cfg_StockStartRaw="{DATE_BAD}",1,0)+IF(AND(ISNUMBER($O$3),ISNUMBER($P$3),ISNUMBER($Q$3)),IF($P$3<$O$3,1,0),1)+IF(AND($U$3>={CAL_Y0},$U$3<={CAL_Y1}),0,1)')
ws.merge_cells("K3:L3")
ws["K3"] = '=IF($M$3=0,"✔ داده سالم","⚠ "&$M$3&" مورد بررسی")'
ws["K3"].font = font(10, True, DARK)
ws["K3"].alignment = Alignment(horizontal="center", vertical="center")
ws["K3"].border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
ws.conditional_formatting.add("K3:L3", FormulaRule(formula=["$M$3=0"], fill=fill("D5EBD9")))
ws.conditional_formatting.add("K3:L3", FormulaRule(formula=["$M$3>0"], fill=fill("F4B6B6")))
for c_ in ("B3", "D3", "F3"):
    ws.conditional_formatting.add(c_, FormulaRule(formula=[f'NOT(ISNUMBER(${ {"B3": "O", "D3": "P", "F3": "Q"}[c_] }$3))'], fill=fill("F4B6B6")))
define("DataIssues", f"{qn(ws)}!$M$3")
for nm, cell in [("RptFrom", "$O$3"), ("RptTo", "$P$3"), ("RptDay", "$Q$3"), ("RptYear", "$U$3"), ("RptMonths", "$J$3"), ("RptMonthStart", "$T$3")]:
    define(nm, f"{qn(ws)}!{cell}")
define("DashSales", f"{qn(ws)}!$C$14")
define("DashInvoices", f"{qn(ws)}!$A$10")
ws.row_dimensions[4].height = 6
dv_num(ws, "H3", "whole", "between", CAL_Y0, CAL_Y1, "سال شمسی معتبر وارد کنید (مثلاً 1405).")

per = f'tblSales[{GD}],">="&RptFrom,tblSales[{GD}],"<="&RptTo,tblSales[{ES}],"{FINAL}"'
perE = f'tblExpenses[{GD}],">="&RptFrom,tblExpenses[{GD}],"<="&RptTo,tblExpenses[{ES}],"{APPROVED}",tblExpenses[دسته هزینه],"<>"&Cfg_SalaryCat'
perP = f'tblPayroll[شروع ماه],">="&RptMonthStart,tblPayroll[شروع ماه],"<="&RptTo,tblPayroll[{ES}],"{APPROVED}"'
perT = f'tblTargets[شروع ماه],">="&RptMonthStart,tblTargets[شروع ماه],"<="&RptTo'


def card(top, c1, caption, formula, fmt):
    ws.merge_cells(start_row=top, start_column=c1, end_row=top, end_column=c1 + 2)
    ws.merge_cells(start_row=top + 1, start_column=c1, end_row=top + 2, end_column=c1 + 2)
    h, v = ws.cell(top, c1, caption), ws.cell(top + 1, c1, formula)
    h.font, h.fill = font(10, True, WHITE), fill(GREEN)
    h.alignment = Alignment(horizontal="center", vertical="center")
    v.font, v.fill = font(20, True, DARK), fill(WHITE)
    v.alignment = Alignment(horizontal="center", vertical="center")
    v.number_format = fmt
    for rr_ in range(top, top + 3):
        for cc in range(c1, c1 + 3):
            ws.cell(rr_, cc).border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
            ws.cell(rr_, cc).fill = fill(GREEN) if rr_ == top else fill(WHITE)


card(5, 1, "فروش خالص", "=C14", MONEY)
card(5, 4, "سود ناخالص", "=C16", MONEY)
card(5, 7, "سود خالص", "=C19", MONEY)
card(5, 10, "تحقق هدف فروش", f'=IF(SUMIFS(tblTargets[هدف فروش],{perT})=0,"هدف تعیین نشده",C14/SUMIFS(tblTargets[هدف فروش],{perT}))', PCT)
card(9, 1, "تعداد فاکتور", f"=COUNTIFS({per},tblSales[شروع فاکتور],1)", INT)
card(9, 4, "میانگین هر فاکتور", "=IFERROR(C14/A10,0)", MONEY)
card(9, 7, "درصد بهای مواد", "=C22", PCT)
card(9, 10, "ارزش موجودی انبار", "=SUM(tblIngredients[ارزش موجودی])", MONEY)
ws.row_dimensions[8].height = 8
ws.row_dimensions[12].height = 8
for r in (6, 7, 10, 11):
    ws.row_dimensions[r].height = 21

band(ws, 13, 1, 6, "صورت سود و زیان بازه انتخابی")
band(ws, 13, 7, 12, "گزارش روز انتخابی و صندوق")


def line(r, c_lab, c_val, c_note_end, label, formula, fmt, note="", bold=False):
    ws.merge_cells(start_row=r, start_column=c_lab, end_row=r, end_column=c_lab + 1)
    ws.merge_cells(start_row=r, start_column=c_val + 1, end_row=r, end_column=c_note_end)
    a, b, n = ws.cell(r, c_lab, label), ws.cell(r, c_val, formula), ws.cell(r, c_val + 1, note)
    a.font, a.fill = font(10, bold, DARK), fill(PALE_GREEN if bold else CREAM)
    a.alignment = Alignment(horizontal="right", vertical="center", indent=1)
    b.font, b.fill = font(10, True, DARK), fill("FAF1DE" if bold else WHITE)
    b.alignment = Alignment(horizontal="center", vertical="center")
    b.number_format = fmt
    n.font = font(8, False, "666666", True)
    n.alignment = Alignment(horizontal="right", vertical="center", indent=1)
    for cc in range(c_lab, c_note_end + 1):
        ws.cell(r, cc).border = Border(bottom=THIN)


pl = [
    ("فروش خالص", f"=SUMIFS(tblSales[فروش خالص],{per})", MONEY, "پس از تخفیف", True),
    ("(−) بهای تمام‌شده", f"=SUMIFS(tblSales[{COSTC}],{per})", MONEY, "بر پایه رسپی", False),
    ("سود ناخالص", "=C14-C15", MONEY, "", True),
    ("(−) هزینه عملیاتی", f"=SUMIFS(tblExpenses[مبلغ],{perE})", MONEY, "بدون دسته حقوق", False),
    ("(−) حقوق و مزایا", f"=SUMIFS(tblPayroll[حقوق نهایی],{perP})", MONEY, "ماه‌های بازه", False),
    ("سود خالص", "=C16-C17-C18", MONEY, "", True),
    ("حاشیه سود ناخالص", "=IFERROR(C16/C14,0)", PCT, "", False),
    ("حاشیه سود خالص", "=IFERROR(C19/C14,0)", PCT, "", False),
    ("درصد بهای مواد", "=IFERROR(C15/C14,0)", PCT, "سقف هدف در پایه‌ها", False),
    ("سهم هزینه و حقوق", "=IFERROR((C17+C18)/C14,0)", PCT, "", False),
]
for i, (lab, f, fmt, note, bold) in enumerate(pl):
    line(14 + i, 1, 3, 6, lab, f, fmt, note, bold)
dy = f'tblSales[{GD}],RptDay,tblSales[{ES}],"{FINAL}"'
cash_pick = lambda col: f'IFERROR(INDEX(tblCash[{col}],MATCH(RptDay,tblCash[{GD}],0)),"ثبت نشده")'
daily = [
    ("فروش خالص روز", f"=SUMIFS(tblSales[فروش خالص],{dy})", MONEY, "", True),
    ("تعداد فاکتور", f"=COUNTIFS({dy},tblSales[شروع فاکتور],1)", INT, "", False),
    ("سود ناخالص روز", f"=SUMIFS(tblSales[سود ناخالص],{dy})", MONEY, "", False),
    ("فروش نقدی", f'=SUMIFS(tblSales[فروش خالص],{dy},tblSales[روش پرداخت],"نقد")', MONEY, "", False),
    ("فروش کارت و انتقال", f'=SUMIFS(tblSales[فروش خالص],{dy},tblSales[روش پرداخت],"کارت")+SUMIFS(tblSales[فروش خالص],{dy},tblSales[روش پرداخت],"انتقال")+SUMIFS(tblSales[فروش خالص],{dy},tblSales[روش پرداخت],"آنلاین")', MONEY, "کارت + انتقال + آنلاین", False),
    ("نسیه", f'=SUMIFS(tblSales[فروش خالص],{dy},tblSales[روش پرداخت],"نسیه")', MONEY, "", False),
    ("هزینه تاییدشده روز", f'=SUMIFS(tblExpenses[مبلغ],tblExpenses[{GD}],RptDay,tblExpenses[{ES}],"{APPROVED}")', MONEY, "", False),
    ("انتظار صندوق", "=" + cash_pick("انتظار"), MONEY, "از جدول صندوق", False),
    ("اختلاف صندوق", "=" + cash_pick("اختلاف"), MONEY, "موجودی واقعی − انتظار", True),
    ("اختلاف انباشته", "=" + cash_pick("اختلاف انباشته"), MONEY, "مجموع تا این روز", True),
]
for i, (lab, f, fmt, note, bold) in enumerate(daily):
    line(14 + i, 7, 9, 12, lab, f, fmt, note, bold)
for c_ in ("I22", "I23"):
    ws.conditional_formatting.add(c_, FormulaRule(formula=[f"AND(ISNUMBER(${c_[0]}${c_[1:]}),${c_[0]}${c_[1:]}<>0)"], fill=fill(RED_PALE)))
ws.conditional_formatting.add("C19", FormulaRule(formula=["$C$19<0"], fill=fill(RED_PALE)))

band(ws, 25, 1, 6, "فروش روزانه (۳۱ روز از ابتدای بازه)")
band(ws, 25, 7, 12, "فروش بر اساس دسته")
sup_ = SHEETS["sup"]
ch1 = BarChart()
ch1.type = "col"
ch1.style = 10
ch1.height, ch1.width = 7.4, 17.2
ch1.add_data(Reference(sup_, min_col=13, min_row=4, max_row=35), titles_from_data=True)
ch1.set_categories(Reference(sup_, min_col=14, min_row=5, max_row=35))
ch1.legend = None
ch1.y_axis.delete = False
ch1.x_axis.delete = False
ch1.y_axis.number_format = "#,##0"
ws.add_chart(ch1, "A26")
ch2 = BarChart()
ch2.type = "bar"
ch2.style = 10
ch2.height, ch2.width = 7.4, 17.2
ch2.add_data(Reference(sup_, min_col=16, min_row=4, max_row=CAT_LAST), titles_from_data=True)
ch2.set_categories(Reference(sup_, min_col=15, min_row=5, max_row=CAT_LAST))
ch2.legend = None
ch2.y_axis.delete = False
ch2.x_axis.delete = False
ch2.y_axis.number_format = "#,##0"
ws.add_chart(ch2, "G26")

band(ws, 42, 1, 6, '="هشدار موجودی ("&COUNT(tblIngredients[ردیف هشدار])&" قلم؛ ۱۰ مورد اول نمایش داده می‌شود)"')
band(ws, 42, 7, 12, "عملکرد پرسنل در بازه انتخابی")
for c1, c2, txt in [(1, 1, "کد"), (2, 3, "نام ماده"), (4, 4, "موجودی"), (5, 5, "حد سفارش"), (6, 6, "وضعیت"),
                    (7, 8, "نام"), (9, 9, "فروش خالص"), (10, 10, "ساعت کار"), (11, 11, OTC), (12, 12, "تحقق هدف")]:
    if c2 > c1:
        ws.merge_cells(start_row=43, start_column=c1, end_row=43, end_column=c2)
    h = ws.cell(43, c1, txt)
    h.font, h.fill = font(9, True, WHITE), fill(SLATE)
    h.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for cc in range(c1, c2 + 1):
        ws.cell(43, cc).fill = fill(SLATE)
for i in range(10):
    r = 44 + i
    ws.cell(r, 13, f'=IFERROR(MATCH(ROWS($M$44:M{r}),tblIngredients[ردیف هشدار],0),"")')
    ws.cell(r, 14, f'=IFERROR(INDEX(tblStaff[کد پرسنل],ROWS($N$44:N{r}))&"","")')
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    ws.merge_cells(start_row=r, start_column=7, end_row=r, end_column=8)
    pick = lambda col: f'=IF($M{r}="","",INDEX(tblIngredients[{col}],$M{r}))'
    ws.cell(r, 1, pick("کد ماده"))
    ws.cell(r, 2, pick("نام ماده"))
    ws.cell(r, 4, pick("موجودی فعلی")).number_format = "#,##0.0"
    ws.cell(r, 5, pick("حد سفارش")).number_format = "#,##0"
    ws.cell(r, 6, pick("وضعیت"))
    ws.cell(r, 7, f'=IF($N{r}="","",{lk("tblStaff", "نام و نام خانوادگی", "کد پرسنل", f"$N{r}")})')
    ws.cell(r, 9, f'=IF($N{r}="","",SUMIFS(tblSales[فروش خالص],tblSales[کد پرسنل],$N{r},{per}))').number_format = MONEY
    att_per = f'tblAttendance[کد پرسنل],$N{r},tblAttendance[{GD}],">="&RptFrom,tblAttendance[{GD}],"<="&RptTo,tblAttendance[{ES}],"{APPROVED}",tblAttendance[{OKC}],1'
    ws.cell(r, 10, f'=IF($N{r}="","",SUMIFS(tblAttendance[ساعات کار],{att_per}))').number_format = "0.0"
    ws.cell(r, 11, f'=IF($N{r}="","",SUMIFS(tblAttendance[{OTC}],{att_per}))').number_format = "0.0"
    tg = lk("tblStaff", "هدف فروش فردی", "کد پرسنل", f"$N{r}", "0")
    ws.cell(r, 12, f'=IF($N{r}="","",IF(N({tg})=0,"",I{r}/({tg}*RptMonths)))').number_format = "0%"
    for cc in range(1, 13):
        ws.cell(r, cc).font = font(9)
        ws.cell(r, cc).border = Border(bottom=THIN)
        ws.cell(r, cc).alignment = Alignment(horizontal="right" if cc in (2, 7) else "center", vertical="center")
cf(ws, "F44:F53", f'$F44="{OUT_STOCK}"', RED_PALE)
cf(ws, "F44:F53", f'$F44="{LOW_STOCK}"', ORANGE_PALE)
cf(ws, "L44:L53", 'AND(ISNUMBER($L44),N($I44)>0,$L44<0.8)', RED_PALE)

band(ws, 55, 1, 11, "خلاصه ۱۲ ماهه سال شمسی گزارش (سال را در H3 تغییر دهید؛ هدف‌ها از «پایه‌ها و تنظیمات»)")
KM = "ROW()-ROW(tblMonthly[[#Headers],[ماه]])"
m_s, m_e = f"INDEX(MonthlyStart,{KM})", f"INDEX(MonthlyEnd,{KM})"
mth = lambda t: f'{t}[{GD}],">="&{m_s},{t}[{GD}],"<="&{m_e}'
mon_cols = [
    CA("ماه", 14.5, f'IFERROR(INDEX(MonthlyName,{KM}),"")'),
    CA("فروش", 14.5, f'SUMIFS(tblSales[فروش خالص],{mth("tblSales")},tblSales[{ES}],"{FINAL}")', MONEY),
    CA(COSTC, 14.5, f'SUMIFS(tblSales[{COSTC}],{mth("tblSales")},tblSales[{ES}],"{FINAL}")', MONEY),
    CA("سود ناخالص", 14.5, f'{me("فروش")}-{me(COSTC)}', MONEY),
    CA("هزینه", 14.5, f'SUMIFS(tblExpenses[مبلغ],{mth("tblExpenses")},tblExpenses[{ES}],"{APPROVED}",tblExpenses[دسته هزینه],"<>"&Cfg_SalaryCat)', MONEY),
    CA("حقوق", 14.5, f'SUMIFS(tblPayroll[حقوق نهایی],tblPayroll[شروع ماه],{m_s},tblPayroll[{ES}],"{APPROVED}")', MONEY),
    CA("سود خالص", 14.5, f'{me("سود ناخالص")}-{me("هزینه")}-{me("حقوق")}', MONEY),
    CA("هدف فروش", 14.5, f'SUMIFS(tblTargets[هدف فروش],tblTargets[شروع ماه],{m_s})', MONEY),
    CA("تحقق هدف", 14.5, f'IF({me("هدف فروش")}=0,"",{me("فروش")}/{me("هدف فروش")})', PCT),
    CA("بهای مواد درصد", 14.5, f'IFERROR({me(COSTC)}/{me("فروش")},0)', PCT),
    CA("اقلام", 14.5, f'SUMIFS(tblSales[تعداد],{mth("tblSales")},tblSales[{ES}],"{FINAL}")', INT),
]
LMN = add_table(ws, "tblMonthly", mon_cols, [{} for _ in range(12)], 56, 1)
cf(ws, "I57:I68", "AND(ISNUMBER($I57),$I57>0,$I57<0.8)", RED_PALE)
band(ws, 70, 1, 12, "فروش ماهانه در برابر هدف")
ch3 = BarChart()
ch3.type = "col"
ch3.style = 10
ch3.height, ch3.width = 7.6, 34.8
ch3.add_data(Reference(ws, min_col=2, min_row=56, max_row=68), titles_from_data=True)
ch3.add_data(Reference(ws, min_col=8, min_row=56, max_row=68), titles_from_data=True)
ch3.set_categories(Reference(ws, min_col=1, min_row=57, max_row=68))
ch3.y_axis.delete = False
ch3.x_axis.delete = False
ch3.y_axis.number_format = "#,##0"
ch3.legend.position = "b"
ws.add_chart(ch3, "A71")
ws.freeze_panes = "A4"
set_print(ws, "A1:L86", "portrait", tall=0)

# ============================================================================ order form (macro version only)
# The "ثبت" button runs RegisterOrder in RihaCafe_OrderForm.bas; cell addresses here must match that module.
if MACRO:
    ws = wb.create_sheet("ثبت سفارش")
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = GREEN
    SHEETS["order"] = ws
    title(ws, "کافه ریحا | ثبت سفارش", "محصول و تعداد را وارد کنید و «ثبت فاکتور» را بزنید. شمارهٔ فاکتور خودکار است و سفارش در شیت «فروش» ثبت می‌شود.", 7)
    for col, w in zip("ABCDEFG", [6, 30, 10, 14, 16, 24, 18]):
        ws.column_dimensions[col].width = w

    def lab(ref, text):
        c = ws[ref]
        c.value = text
        c.font = font(10, True, DARK)
        c.alignment = Alignment(horizontal="right", vertical="center")

    def box(ref, value=None, fmt=None):
        c = ws[ref]
        c.value = value
        c.font = font(11, True)
        c.fill = fill(IN_FILL)
        c.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
        c.alignment = Alignment(horizontal="center", vertical="center")
        if fmt:
            c.number_format = fmt

    def calc(ref, value, fmt=None, size=11):
        c = ws[ref]
        c.value = value
        c.font = font(size, True, DARK)
        c.fill = fill(CALC_FILL)
        c.border = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)
        c.alignment = Alignment(horizontal="center", vertical="center")
        if fmt:
            c.number_format = fmt

    FORM_DATE = f'=IFERROR({jtxt("TODAY()")},"")'
    lab("A4", "تاریخ"); box("B4", FORM_DATE, "@")
    lab("A5", "پرداخت"); box("B5", "نقد")
    lab("A6", "میز/سفارش"); box("B6")
    lab("A7", "مشتری"); box("B7")
    lab("C4", "تلفن"); ws.merge_cells("D4:E4"); box("D4")
    lab("C5", "پرسنل"); ws.merge_cells("D5:E5"); box("D5")
    lab("C6", "تخفیف"); ws.merge_cells("D6:E6"); box("D6", 0, "0%")
    lab("C7", "فاکتور بعدی"); ws.merge_cells("D7:E7")
    # helper cells (hidden column G): serial of the form date and the next number of that day
    ws["G4"] = "=" + gd("$B$4", "TRUE")
    ws["G5"] = f'=IF(ISNUMBER(G4),_xlfn.MAXIFS(tblSales[{DN}],tblSales[{GD}],G4)+1,"")'
    ws["G6"] = '=IF(ISNUMBER(G4),INDEX(CalKey,MATCH(G4,CalSerial,0)),"")'
    calc("D7", '=IF(ISNUMBER(G4),"R-"&G6&"-"&TEXT(G5,"00"),"تاریخ نامعتبر")', size=12)
    ws.column_dimensions["G"].hidden = True
    dv_list(ws, "B5", "PaymentMethods")
    dv_list(ws, "D5", "StaffCodes")
    dv_num(ws, "D6", "decimal", "between", 0, 1, "تخفیف بین 0% و 100% است.")

    band(ws, 9, 1, 5, "اقلام سفارش (حداکثر ۱۴ قلم، هم‌اندازهٔ فاکتور چاپی)", GREEN)
    for j, h in enumerate(["ردیف", "نام محصول", "تعداد", "قیمت واحد", "مبلغ"], 1):
        c = ws.cell(10, j, h)
        c.font = font(10, True, WHITE)
        c.fill = fill(DARK)
        c.alignment = Alignment(horizontal="center", vertical="center")
    for r in range(11, 25):
        calc(f"A{r}", r - 10, size=10)
        box(f"B{r}"); ws[f"B{r}"].alignment = Alignment(horizontal="right", vertical="center")
        box(f"C{r}", None, "General")
        calc(f"D{r}", f'=IF(B{r}="","",IFERROR(INDEX(tblMenu[قیمت فروش],MATCH(B{r},tblMenu[نام محصول],0)),"{BAD_CODE}"))', MONEY)
        calc(f"E{r}", f'=IF(OR(B{r}="",C{r}="",NOT(ISNUMBER(D{r}))),"",C{r}*D{r})', MONEY)
    dv_list(ws, "B11:B24", "ProductNames")
    dv_num(ws, "C11:C24", "decimal", "greaterThan", 0, msg="تعداد باید بزرگ‌تر از صفر باشد.")
    lab("D26", "جمع اقلام"); calc("E26", "=SUM(E11:E24)", MONEY)
    lab("D27", "تخفیف"); calc("E27", "=E26*N(D6)", MONEY)
    lab("D28", "قابل پرداخت"); calc("E28", "=E26-E27", MONEY, 13)
    lab("A26", "واحد مبالغ: " + UNIT)
    ws.merge_cells("A30:E31")
    ws["A30"] = "اگر دکمه‌ها کار نکردند، در نوار زرد بالای صفحه این را بزنید: Enable Content"
    ws["A30"].font = font(11, True, DARK)
    ws["A30"].fill = fill(CREAM)
    ws["A30"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for r in range(4, 8):
        ws.row_dimensions[r].height = 24
    for r in range(11, 25):
        ws.row_dimensions[r].height = 22
    set_print(ws, "A1:E31", "portrait")

wb._sheets = [SHEETS[k] for k in (["dash", "order"] if MACRO else ["dash"]) + ["sales", "inv", "stock", "menu", "cash", "hr", "base", "lists", "sup", "cal"]]
wb.active = 1 if MACRO else 0
wb.save(OUT)
print("Created", OUT)

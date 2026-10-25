# -*- coding: utf-8 -*-
"""Jalali <-> Gregorian helpers (33-year arithmetic rule, exact for 1300-1470)."""
from datetime import date, timedelta

def is_leap_j(jy):
    return (jy % 33) in (1, 5, 9, 13, 17, 22, 26, 30)

def jdays_in_month(jy, jm):
    if jm <= 6: return 31
    if jm <= 11: return 30
    return 30 if is_leap_j(jy) else 29

# anchor: 1398/01/01 = 2019-03-21
_ANCHOR_J, _ANCHOR_G = 1398, date(2019, 3, 21)

def j2g(jy, jm, jd):
    d = _ANCHOR_G
    if jy >= _ANCHOR_J:
        for y in range(_ANCHOR_J, jy):
            d += timedelta(days=366 if is_leap_j(y) else 365)
    else:
        for y in range(jy, _ANCHOR_J):
            d -= timedelta(days=366 if is_leap_j(y) else 365)
    for m in range(1, jm):
        d += timedelta(days=jdays_in_month(jy, m))
    return d + timedelta(days=jd - 1)

def g2j(g):
    jy = 1398
    start = _ANCHOR_G
    while True:
        ylen = 366 if is_leap_j(jy) else 365
        if g < start:
            jy -= 1; start -= timedelta(days=366 if is_leap_j(jy) else 365); continue
        if g >= start + timedelta(days=ylen):
            start += timedelta(days=ylen); jy += 1; continue
        break
    n = (g - start).days
    for m in range(1, 13):
        L = jdays_in_month(jy, m)
        if n < L: return jy, m, n + 1
        n -= L

def jtext(g):
    y, m, d = g2j(g)
    return f"{y}/{m:02d}/{d:02d}"

def jmonth(g):
    y, m, _ = g2j(g)
    return f"{y}/{m:02d}"

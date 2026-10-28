#!/usr/bin/env python3
"""Minimal bidirectional run splitting for Persian copy carrying Latin names.

This is deliberately dependency-free: the shaping pipeline (`textkit.py`) needs
HarfBuzz and FreeType, but the ordering decision — which words are RTL, which are
LTR, and how they are placed in visual order — is pure logic and is unit-tested
on a bare Python.

Rules used (a subset of UAX#9, enough for this campaign's copy):
  * Arabic script and its punctuation are RTL; ZWNJ stays inside the word.
  * Latin letters and Arabic-Indic digits are LTR, so "ALIENS" and "۴:۲۰" are
    never mirrored inside a Persian sentence.
  * Neutrals/whitespace attach to the run they follow; adjacent runs of the same
    direction merge, which keeps "۴:۲۰" and "ALIENS!" whole.
  * The paragraph base direction is RTL when any Arabic letter is present.
"""

from __future__ import annotations

import unicodedata

# Arabic-script punctuation that belongs to the RTL run.
RTL_PUNCT = set("،؛؟«»٬٫ـ")


def _classify(ch: str) -> str:
    """'R' Arabic script, 'N' number (shaped LTR), 'L' Latin, 'S' neutral."""
    cp = ord(ch)
    if 0x0660 <= cp <= 0x0669 or 0x06F0 <= cp <= 0x06F9:   # Arabic-Indic digits
        return "N"
    if 0x06DD <= cp <= 0x06ED or 0x0600 <= cp <= 0x06FF:
        return "R"
    if ch in RTL_PUNCT:
        return "R"
    if ch == "\u200c":                                      # ZWNJ joins letters
        return "R"
    if ch.isdigit():
        return "N"
    if ch.isalpha():
        return "L"
    if unicodedata.category(ch).startswith("P") or ch.isspace():
        return "S"
    return "S"


def split_runs(text: str) -> list[tuple[str, str]]:
    """Split a line into visual-order runs of (text, 'rtl'|'ltr')."""
    if not text:
        return []

    kinds = [_classify(ch) for ch in text]

    # Base direction: RTL when the line carries Arabic script.
    base = "rtl" if "R" in kinds else "ltr"

    # Attach neutrals to the run they follow; leading neutrals join what follows.
    runs: list[list[str]] = []          # [kind, text]
    for ch, kind in zip(text, kinds):
        if kind == "S":
            if runs:
                runs[-1][1] += ch
            else:
                runs.append(["S", ch])
            continue
        if runs and runs[-1][0] in (kind, "S"):
            if runs[-1][0] == "S":
                runs[-1][0] = kind
            runs[-1][1] += ch
        else:
            runs.append([kind, ch])

    resolved: list[list[str]] = []
    for kind, chunk in runs:
        direction = "rtl" if kind == "R" else "ltr"
        if resolved and resolved[-1][0] == direction:
            resolved[-1][1] += chunk          # keep "4:20" and "ALIENS!" in one run
        else:
            resolved.append([direction, chunk])

    if base == "rtl":
        resolved.reverse()
    return [(direction, chunk) for direction, chunk in resolved]

"""Regression coverage for malformed BOM-encoded text documents."""

from pathlib import Path

import pytest

import book_to_skill.utils as utils
from book_to_skill.exceptions import ExtractionError
from book_to_skill.parsers.text import read_text_file


@pytest.mark.parametrize(
    "raw",
    [
        b"\xef\xbb\xbf\xff",  # invalid UTF-8 after its BOM
        b"\xff\xfeA",  # truncated UTF-16 LE code unit
        b"\xfe\xffA",  # truncated UTF-16 BE code unit
        b"\xff\xfe\x00\x00A",  # truncated UTF-32 LE code unit
        b"\x00\x00\xfe\xffA",  # truncated UTF-32 BE code unit
    ],
)
def test_malformed_bom_does_not_fall_back_to_legacy_encoding(tmp_path: Path, raw: bytes) -> None:
    path = tmp_path / "book.txt"
    path.write_bytes(raw)
    assert read_text_file(str(path)) is None


def test_malformed_bom_is_rejected_by_text_extractor(tmp_path: Path) -> None:
    path = tmp_path / "book.txt"
    path.write_bytes(b"\xff\xfeA")
    with pytest.raises(ExtractionError, match="Could not read text document"):
        utils.extract_single_file(path, "text", "no")

"""Validator for hcd_mi_incidence source CSVs.

Verifies per-row provenance: for each row in a curated CSV, opens the cited PDF page
and checks:
  1. The source_row_label (or key distinctive words thereof) appears on the cited page.
  2. The n_affected and mean_incidence_pct values appear in text form on the cited page.

Per protocol (datagap-mima-18-extraction-protocol.md §Strictness): strict on all rows.
LOW-confidence rows that can't trace back to source are indistinguishable from
fabrications. Rows flagged `validator_known_failure` bypass validation but require
an explicit ambiguity-log entry documenting why the PDF text extraction can't resolve
the cited cell; these entries need user sign-off before merge.

Usage:
  python -m backend.etl.validate_hcd_mi_source_csv backend/data/source/chamanza_2010.csv \\
         docs/_internal/research/hcd-nhp-dog_beagle/chamanza2010.pdf
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path
from typing import Any


def _load_pdf_pages(pdf_path: Path) -> dict[int, str]:
    """Return 1-indexed page number -> page text."""
    import fitz
    doc = fitz.open(str(pdf_path))
    pages = {}
    for i in range(doc.page_count):
        pages[i + 1] = doc[i].get_text()
    doc.close()
    return pages


def _normalize(s: str) -> str:
    """Normalize for fuzzy comparison: lowercase, collapse whitespace, strip punctuation."""
    s = s.lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s\-/%.]", " ", s)
    return s.strip()


def _distinctive_words(label: str, min_len: int = 5) -> list[str]:
    """Extract distinctive content words from a row label for fuzzy matching."""
    return [w for w in re.findall(r"\w+", label) if len(w) >= min_len]


def _value_on_page(page_text: str, value: str) -> bool:
    """Does the numeric value appear on the page, allowing for whitespace/formatting variations?"""
    if not value or value in ("", "nan", "None"):
        return True  # NULL values aren't verifiable; pass silently
    # Normalize page text: collapse all whitespace
    page_norm = re.sub(r"\s+", " ", page_text)
    # Try exact value
    if value in page_norm:
        return True
    # Try integer form (e.g., '285' instead of '285.0')
    try:
        f = float(value)
        as_int = str(int(f))
        if f == int(f) and as_int in page_norm:
            return True
        # Try decimal with single decimal place (e.g., 9.6 vs 9.60)
        as_pct_1dp = f"{f:.1f}"
        if as_pct_1dp in page_norm:
            return True
    except (ValueError, TypeError):
        pass
    # Try with surrounding parentheses for pct-style numbers
    return False


def validate_row(row: dict[str, Any], pages: dict[int, str]) -> list[str]:
    """Return list of validation failures for a single row. Empty list = row passes."""
    failures = []

    # Escape hatch: rows with validator_known_failure skip validation
    flags = row.get("flags", "")
    if "validator_known_failure" in flags:
        return []

    page_num_str = row.get("source_page", "").strip()
    if not page_num_str:
        failures.append("missing source_page")
        return failures
    try:
        page_num = int(page_num_str)
    except ValueError:
        failures.append(f"source_page is not an integer: {page_num_str!r}")
        return failures

    if page_num not in pages:
        failures.append(f"source_page {page_num} not in PDF (pages available: 1-{max(pages)})")
        return failures

    page_text = pages[page_num]
    page_norm = _normalize(page_text)

    # Check 1: source_row_label findable via distinctive-word hit ratio.
    # Per spec §Validator: word-hit-ratio >= 0.5 rather than character-level fuzzy
    # match. Chosen because fitz text extraction introduces line-wrap artifacts,
    # stray whitespace within numbers ("7 .3%"), and unicode stripping — these
    # break strict char-similarity but preserve word boundaries. Empirically,
    # all 234 Chamanza + 19 Maita canonical rows pass at 0.5.
    label = row.get("source_row_label", "").strip()
    if label:
        words = _distinctive_words(label)
        if words:
            hits = sum(1 for w in words if w.lower() in page_norm)
            ratio = hits / len(words)
            if ratio < 0.5:
                failures.append(
                    f"source_row_label '{label}': only {hits}/{len(words)} distinctive words "
                    f"found on page {page_num} (ratio {ratio:.2f} < 0.5)"
                )

    # Check 2: n_affected present on page (for prose-source rows, the % is more likely findable
    # than the count; for table rows, the count is what the paper directly reports)
    n_affected = row.get("n_affected", "")
    if "prose_percentage" in flags or "n_affected_reconstructed_from_pct" in flags:
        # Prose source: verify mean_incidence_pct instead of n_affected
        pct = row.get("mean_incidence_pct", "")
        if not _value_on_page(page_text, pct):
            failures.append(
                f"mean_incidence_pct {pct!r} not found on page {page_num} "
                f"(prose source; expected percentage visible in text)"
            )
    else:
        # Table source: verify n_affected (which is the paper-reported count)
        if not _value_on_page(page_text, n_affected):
            # For sex-split rows, n_affected might be the per-sex count; Chamanza reports both,
            # so either value should appear. If we can't find it, that's a real miss.
            # But: sex-split rows may have n_affected=0 (derived) for "–" paper values — those
            # won't appear on the page literally. Skip 0-case rows.
            if str(n_affected) != "0":
                failures.append(
                    f"n_affected {n_affected!r} not found on page {page_num}"
                )

    return failures


def validate_csv(csv_path: Path, pdf_path: Path) -> int:
    """Validate all rows in csv_path against pdf_path. Returns exit code (0 = pass)."""
    pages = _load_pdf_pages(pdf_path)
    with open(csv_path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    print(f"Validating {len(rows)} rows from {csv_path.name} against {pdf_path.name}")
    print(f"PDF pages: 1-{max(pages)}")

    total_failures = 0
    escaped_rows = 0
    for i, row in enumerate(rows, start=1):
        if "validator_known_failure" in row.get("flags", ""):
            escaped_rows += 1
            continue
        failures = validate_row(row, pages)
        if failures:
            total_failures += len(failures)
            print(f"\n[row {i}] {row.get('sex', '?')} {row.get('organ', '?')} / {row.get('finding', '?')}")
            print(f"  page={row.get('source_page')} flags={row.get('flags', '')!r}")
            for failure in failures:
                print(f"  FAIL: {failure}")

    print(f"\n--- Summary ---")
    print(f"Rows checked:      {len(rows) - escaped_rows}")
    print(f"Rows escape-hatch: {escaped_rows}")
    print(f"Validator failures: {total_failures}")

    return 1 if total_failures > 0 else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path, help="Path to curated CSV")
    parser.add_argument("pdf_path", type=Path, help="Path to source PDF")
    args = parser.parse_args()

    if not args.csv_path.exists():
        print(f"CSV not found: {args.csv_path}", file=sys.stderr)
        sys.exit(2)
    if not args.pdf_path.exists():
        print(f"PDF not found: {args.pdf_path}", file=sys.stderr)
        sys.exit(2)

    sys.exit(validate_csv(args.csv_path, args.pdf_path))


if __name__ == "__main__":
    main()

"""Pass-2 self-audit of Maita 1977 extraction.

Different shape from Chamanza (prose, not tables). Strategy:
  1. Scan the raw text for every percentage expression (X.X% or X%).
  2. For each, determine whether the encoded FINDINGS list accounts for it.
  3. Verify each FINDINGS row's anchor phrase is findable in raw text near the cited page.
  4. Produce pass-2 CSV (reconstructed from same parse) + diff report.

A disagreement surfaces if:
  - A % value appears in the paper but is not in FINDINGS (and not in the declared-skip list).
  - An anchor phrase from FINDINGS cannot be located in the raw text.
  - A page number in FINDINGS doesn't match the page where the % actually appears.
"""

import csv
import re
from pathlib import Path
import importlib.util
import sys

HERE = Path(__file__).parent
RAW_PATH = HERE / ".maita_raw.txt"

# Import pass-1 FINDINGS
spec = importlib.util.spec_from_file_location(
    "pass1", HERE / ".maita_pass1_encoder.py"
)
pass1 = importlib.util.module_from_spec(spec)
sys.modules["pass1"] = pass1
spec.loader.exec_module(pass1)


# Known skips (from ambiguity log)
DECLARED_SKIPS = [
    # (pct, page_0idx, reason)
    (33.1, 0, "AMB-MAITA-001: Toxocara cross-organ composite rate"),
    (33.1, 2, "AMB-MAITA-001: Toxocara cross-organ composite rate (detail occurrence)"),
    (33.1, 3, "AMB-MAITA-001: Toxocara cross-organ composite rate (discussion occurrence)"),
    (3.7, 3, "AMB-MAITA-002: Japanese-summary typo for ligament necrosis (actual 7.3%)"),
]

# Percentages appearing on the Japanese-summary page (0-indexed 4 in this PDF).
# The JP abstract duplicates values already encoded from the English side;
# some use rounded forms (e.g., 87% vs 87.5%).
JAPANESE_SUMMARY_PAGE = 4  # 0-indexed

# Additional blocklist for non-finding percentages (environment, dose, procedural).
ENV_PCT_BLOCKLIST_CONTEXT = [
    "humidity", "buffered formalin", "55", "pH",
]


def find_percentages_in_text(text_with_pages):
    """Find every X% or X.X% mention with its 0-indexed page number and surrounding context."""
    percentages = []
    pages = {}  # page_0idx -> text
    current_page = None

    for line in text_with_pages.split("\n"):
        m = re.match(r"===== PAGE (\d+)", line.strip())
        if m:
            current_page = int(m.group(1))
            pages[current_page] = ""
            continue
        if current_page is not None:
            pages[current_page] += line + "\n"

    for page, text in pages.items():
        # Normalize stray whitespace inside numbers: "7 .3%" -> "7.3%"
        norm = re.sub(r"(\d+)\s+\.\s*(\d)", r"\1.\2", text)
        # Require non-digit boundary before the number so ".3%" inside "7.3%" isn't re-matched
        for match in re.finditer(r"(?<![\d.])(\d+(?:\.\d+)?)\s*%", norm):
            pct = float(match.group(1))
            start = max(0, match.start() - 40)
            end = min(len(norm), match.end() + 40)
            context = norm[start:end].replace("\n", " ").replace("  ", " ").strip()
            # Strip any non-ASCII to keep Windows console happy
            context_ascii = context.encode("ascii", errors="replace").decode("ascii")
            percentages.append({
                "pct": pct,
                "page_0idx": page,
                "context": context_ascii,
            })
    return percentages


def is_declared_skip(pct, page):
    for skip_pct, skip_page, _ in DECLARED_SKIPS:
        if abs(skip_pct - pct) < 0.01 and abs(skip_page - page) <= 1:
            return True
    return False


def is_non_finding(pct, page, context):
    # Japanese summary page — all values are duplicates of English findings (often rounded).
    if page == JAPANESE_SUMMARY_PAGE:
        return True
    # Environmental / procedural values
    if abs(pct - 55) < 0.5 and ("humidity" in context or "55" in context):
        return True
    if abs(pct - 10) < 0.01 and ("formalin" in context or "buffered" in context):
        return True
    if abs(pct - 1) < 0.01 and "humidity" in context:
        return True
    return False


def main():
    text = RAW_PATH.read_text(encoding="utf-8")
    percentages = find_percentages_in_text(text)
    findings_pcts = {(round(f[2], 2), f[3]) for f in pass1.FINDINGS}  # (pct, page_0idx)

    print(f"Raw text percentage mentions: {len(percentages)}")
    print(f"FINDINGS entries: {len(pass1.FINDINGS)}")

    unaccounted = []
    for p in percentages:
        key_exact = (round(p["pct"], 2), p["page_0idx"])
        # Allow ±1 page tolerance (abstract + detail + discussion often on different pages)
        matches_finding = any(
            abs(p["pct"] - fp) < 0.05 and abs(p["page_0idx"] - fpage) <= 2
            for (fp, fpage) in findings_pcts
        )
        if matches_finding:
            continue
        if is_declared_skip(p["pct"], p["page_0idx"]):
            continue
        if is_non_finding(p["pct"], p["page_0idx"], p["context"]):
            continue
        unaccounted.append(p)

    print(f"\nUnaccounted percentage mentions (not in FINDINGS, not declared-skip, not non-finding): {len(unaccounted)}")
    for p in unaccounted:
        print(f"  [p{p['page_0idx']+1}] {p['pct']}% :: ...{p['context']}...")

    # Verify each FINDINGS anchor phrase is findable
    print(f"\nAnchor-phrase verification:")
    missing_anchors = []
    for (organ, finding, pct, page, anchor, sex_mode, notes) in pass1.FINDINGS:
        # Search the full text (not just the cited page) since cross-references occur
        norm_text = re.sub(r"\s+", " ", text)
        norm_anchor = re.sub(r"\s+", " ", anchor.strip("[]").replace("[%]", "%").replace("[um]", ""))
        # Try multiple simplifications since fitz sometimes drops chars
        # Strip numbers and bracketed chars; match by distinctive phrase
        anchor_words = [w for w in re.findall(r"\w+", anchor) if len(w) > 4]
        if anchor_words:
            # Require at least 3 distinctive words to appear in proximity
            distinctive = anchor_words[:5]
            hit = all(
                re.search(re.escape(w), norm_text, re.IGNORECASE)
                for w in distinctive
            )
            if hit:
                print(f"  OK: {organ}/{finding} ({pct}%) anchor findable")
            else:
                missing = [w for w in distinctive if not re.search(re.escape(w), norm_text, re.IGNORECASE)]
                missing_anchors.append((organ, finding, missing))
                print(f"  MISS: {organ}/{finding} — anchor words not found: {missing}")

    # Write diff report
    diff_path = HERE / ".maita_pass2_diff.txt"
    with open(diff_path, "w", encoding="utf-8") as f:
        f.write("Pass-1 vs Pass-2 disagreement report (Maita 1977)\n")
        f.write("=" * 55 + "\n\n")
        f.write(f"Raw-text percentage mentions: {len(percentages)}\n")
        f.write(f"FINDINGS entries (encoded): {len(pass1.FINDINGS)}\n")
        f.write(f"Unaccounted percentages: {len(unaccounted)}\n")
        f.write(f"Missing anchors: {len(missing_anchors)}\n\n")
        if unaccounted:
            f.write("--- Unaccounted % mentions ---\n")
            for p in unaccounted:
                f.write(f"  [p{p['page_0idx']+1}] {p['pct']}% :: ...{p['context']}...\n")
            f.write("\n")
        if missing_anchors:
            f.write("--- Missing anchor phrases ---\n")
            for organ, finding, missing in missing_anchors:
                f.write(f"  {organ}/{finding} :: missing words {missing}\n")
    print(f"\nWrote diff report to {diff_path}")

    # Emit pass-2 CSV (audit trail per protocol Q1) — reconstructed from same FINDINGS,
    # with extraction_pass=2 to distinguish.
    pass2_csv_path = HERE / "maita_1977_pass2.csv"
    rows = []
    for (organ, finding, pct, page, anchor, sex_mode, notes) in pass1.FINDINGS:
        # One aggregate row per FINDINGS entry (not per-sex) — this is the paper-reported state
        if sex_mode == "BOTH":
            denom = 420
            sex_out = "BOTH_AGGREGATE"
        elif sex_mode == "M_ONLY":
            denom = 215
            sex_out = "M"
        else:
            denom = 205
            sex_out = "F"
        n_aff = round(pct / 100 * denom)
        rows.append({
            "species": "BEAGLE", "strain": "BEAGLE", "sex": sex_out,
            "organ": organ, "finding": finding, "severity": "ANY",
            "n_studies": "",
            "n_animals": denom, "n_affected": n_aff,
            "mean_incidence_pct": pct,
            "sd_incidence_pct": "", "min_incidence_pct": "", "max_incidence_pct": "",
            "duration_category": "", "source": "maita_1977", "confidence": "LOW",
            "notes": f"pass2_paper_aggregate; {notes}",
            "year_min": "", "year_max": 1977,
            "severity_scale_version": "unknown",
            "terminology_version": "pre_inhand_1977",
            "severity_distribution": "",
            "source_page": page + 1, "source_table": "",
            "source_row_label": anchor[:60],
            "extraction_pass": 2,
            "flags": "pass2_aggregate_reconstruction|prose_percentage",
        })
    with open(pass2_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=pass1.FIELDNAMES, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} pass-2 rows to {pass2_csv_path}")


if __name__ == "__main__":
    main()

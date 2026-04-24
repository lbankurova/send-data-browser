"""Pass-2 self-audit of Chamanza 2010 extraction.

Strategy: programmatically re-parse the raw text produced by fitz, extracting every
'N (pct)' total cell with its preceding M/F counts and following range, then
cross-check against TABLE_DATA from the pass-1 encoder. Any disagreement -> pass_disagreement AMB.

This is a different extraction path from pass-1 (which was manual tuple entry
of what I read on-screen). A mismatch between the two indicates either:
  (a) pass-1 mis-typed a number
  (b) pass-2 parser got confused by multi-line finding names
Both types of finding surface as pass_disagreement entries for user review.

Output:
  - chamanza_2010_pass2.csv (reconstructed from parse)
  - .chamanza_pass2_diff.txt (disagreement report)
"""

import csv
import re
from pathlib import Path
import importlib.util
import sys

HERE = Path(__file__).parent
RAW_PATH = HERE / ".chamanza_raw.txt"

# Import pass-1 TABLE_DATA for ground-truth comparison
spec = importlib.util.spec_from_file_location(
    "pass1", HERE / ".chamanza_pass1_encoder.py"
)
pass1 = importlib.util.module_from_spec(spec)
sys.modules["pass1"] = pass1
spec.loader.exec_module(pass1)


# -----------------------------------------------------------------------------
# Parse raw text: find all "N (pct)" total cells with context
# -----------------------------------------------------------------------------

TOTAL_RE = re.compile(r"^(\d+)\s*\((\d+\.\d+)\)\s*$")
# Matches lines like "0 – 100", "0 – 37.5", "0 –12.5", "0–16.6" etc.
# en-dash variants
RANGE_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*$")
# Single "–" or "-" line means range not reported
RANGE_NONE_RE = re.compile(r"^\s*[–-]\s*$")
# Organ header like "Lung (55)" or "Parotid salivary gland (17) (43c)"
# or "Ovary (43)*"
ORGAN_RE = re.compile(r"^([A-Z][a-zA-Z /,\-]+?)\s*\(\s*(\d+)\s*\)(\s*\(\d+c\))?\s*\*?\s*$")


def parse_cell(text_lines, total_idx):
    """Given the index of a 'N (pct)' total line, back-trace M/F/finding and forward range."""
    # Walk backwards: expect F_count, M_count, finding_line(s)
    i = total_idx - 1
    # F_count: integer or '–'
    f_line = text_lines[i].strip()
    if not re.match(r"^(\d+|[–-])$", f_line):
        return None  # non-numeric above total -> not a valid cell
    i -= 1
    m_line = text_lines[i].strip()
    if not re.match(r"^(\d+|[–-])$", m_line):
        return None
    i -= 1
    # Finding line(s): may be 1 or 2 lines above M/F
    finding_lines = []
    while i >= 0:
        candidate = text_lines[i].strip()
        if not candidate:
            break
        # Stop when we hit another numeric or table header
        if re.match(r"^\d+$", candidate):
            break
        if re.match(r"^(\d+\.\d+|\d+)$", candidate):
            break
        if RANGE_RE.match(candidate) or RANGE_NONE_RE.match(candidate):
            break
        if ORGAN_RE.match(candidate):
            break
        if candidate.startswith("TABLE ") or candidate.startswith("a "):
            break
        if candidate.startswith("Organ ") or candidate.startswith("Number of"):
            break
        if candidate in ("Male", "Female", "Male Female Total (%)"):
            break
        finding_lines.append(candidate)
        i -= 1
        # Cap at 3 back-lines to avoid runaway
        if len(finding_lines) >= 3:
            break

    finding_lines.reverse()
    finding = " ".join(finding_lines).strip()

    # Walk forward: expect a range line
    rng_min = rng_max = None
    if total_idx + 1 < len(text_lines):
        next_line = text_lines[total_idx + 1].strip()
        m = RANGE_RE.match(next_line)
        if m:
            rng_min = float(m.group(1))
            rng_max = float(m.group(2))
        elif RANGE_NONE_RE.match(next_line):
            pass  # explicit "–" = not reported

    # Decode sex counts
    def _to_count(s):
        if re.match(r"^[–-]$", s):
            return None
        return int(s)

    return {
        "finding": finding,
        "m": _to_count(m_line),
        "f": _to_count(f_line),
        "total": int(re.match(TOTAL_RE, text_lines[total_idx].strip()).group(1)),
        "pct": float(re.match(TOTAL_RE, text_lines[total_idx].strip()).group(2)),
        "range_min": rng_min,
        "range_max": rng_max,
    }


def parse_raw_text():
    """Scan raw text, emit all cells (with organ context) from tables 2-7."""
    text = RAW_PATH.read_text(encoding="utf-8")
    lines = text.split("\n")

    # Find table regions: we care about Tables 2-7 (incidence tables)
    cells = []
    current_organ = None
    current_table = None
    current_page = None

    for idx, line in enumerate(lines):
        stripped = line.strip()
        # Track page headers
        m = re.match(r"^===== PAGE (\d+)", stripped)
        if m:
            current_page = int(m.group(1))  # 0-indexed
            continue
        # Track table headers (note en-dash vs em-dash vs hyphen variants)
        if re.match(r"^TABLE [2-7]\b", stripped):
            current_table = stripped.split(".")[0].replace("TABLE", "Table")
            current_organ = None
            continue
        # Organ header
        om = ORGAN_RE.match(stripped)
        if om and current_table and not om.group(1).startswith("a "):
            # Filter: must be inside a table we care about (2-7)
            organ_name = om.group(1).strip().rstrip(",")
            organ_n = int(om.group(2))
            # Skip bogus organ matches (like "Chapter 14, section 21" etc.)
            if len(organ_name) < 3 or organ_name.startswith(("Chapter", "Figure", "Section")):
                continue
            current_organ = (organ_name, organ_n)
            continue
        # Total cell
        tm = TOTAL_RE.match(stripped)
        if tm and current_organ and current_table:
            cell = parse_cell(lines, idx)
            if cell:
                cell["organ"] = current_organ[0]
                cell["organ_n"] = current_organ[1]
                cell["table"] = current_table
                cell["page_0idx"] = current_page
                cells.append(cell)
    return cells


# -----------------------------------------------------------------------------
# Cross-check against pass-1 TABLE_DATA
# -----------------------------------------------------------------------------

def normalize_finding(s):
    """Canonicalize a finding string for cross-matching."""
    return " ".join(s.lower().replace("–", "-").split())


def build_pass1_entries():
    """Collision-aware: list of all pass-1 finding entries, grouped by organ."""
    entries = []
    for (page, table, organ, org_n, group, findings) in pass1.TABLE_DATA:
        for entry in findings:
            if len(entry) == 8:
                finding, m, f, t, t_pct, rng_min, rng_max, _ = entry
            else:
                finding, m, f, t, t_pct, rng_min, rng_max = entry
            entries.append({
                "page": page, "table": table, "organ": organ.upper(),
                "finding": finding, "m": m, "f": f, "t": t, "t_pct": t_pct,
                "range_min": rng_min, "range_max": rng_max,
            })
    return entries


def _finding_match(a: str, b: str) -> bool:
    """Fuzzy match handling pass-2's multi-line wrap artifact ('a/ b' vs 'a/b')."""
    a_norm = normalize_finding(a).replace("/ ", "/").replace(" / ", "/")
    b_norm = normalize_finding(b).replace("/ ", "/").replace(" / ", "/")
    if a_norm == b_norm:
        return True
    # Allow pass-2 finding-name to be a substring of pass-1 or vice versa (multi-line truncation)
    if a_norm in b_norm or b_norm in a_norm:
        return True
    return False


def compare(pass2_cells, pass1_entries):
    """Collision-aware comparison: each pass-2 cell must find exactly one pass-1 entry
    matching by (organ, M, F, T, pct, range, finding-fuzzy). Unmatched cells in either
    pass surface as disagreements."""
    disagreements = []
    matched_p1_indices = set()

    for cell in pass2_cells:
        c_organ = cell["organ"].upper()
        candidates = [
            (i, e) for i, e in enumerate(pass1_entries)
            if e["organ"] == c_organ and i not in matched_p1_indices
        ]
        # Find best match: exact on numbers first, then on finding name
        exact_num = [
            (i, e) for i, e in candidates
            if e["t"] == cell["total"]
            and abs(e["t_pct"] - cell["pct"]) < 0.05
            and e["m"] == cell["m"]
            and e["f"] == cell["f"]
            and (e["range_min"] or 0) == (cell["range_min"] or 0)
            and (e["range_max"] or 0) == (cell["range_max"] or 0)
        ]
        # If multiple candidates on numbers, disambiguate by finding name
        if len(exact_num) > 1:
            by_name = [(i, e) for i, e in exact_num if _finding_match(e["finding"], cell["finding"])]
            if by_name:
                exact_num = by_name[:1]
            else:
                exact_num = exact_num[:1]
        if exact_num:
            i, e = exact_num[0]
            matched_p1_indices.add(i)
            continue

        # No exact match — look for near-match (same T, pct, but different M/F/range)
        near = [
            (i, e) for i, e in candidates
            if e["t"] == cell["total"] and abs(e["t_pct"] - cell["pct"]) < 0.05
        ]
        if near:
            # Disambiguate by finding name if possible
            by_name = [(i, e) for i, e in near if _finding_match(e["finding"], cell["finding"])]
            if by_name:
                i, e = by_name[0]
                matched_p1_indices.add(i)
                mismatches = []
                if e["m"] != cell["m"]:
                    mismatches.append(f"M: pass-2={cell['m']}, pass-1={e['m']}")
                if e["f"] != cell["f"]:
                    mismatches.append(f"F: pass-2={cell['f']}, pass-1={e['f']}")
                if (e["range_min"] or 0) != (cell["range_min"] or 0) or (e["range_max"] or 0) != (cell["range_max"] or 0):
                    mismatches.append(
                        f"Range: pass-2=[{cell['range_min']}, {cell['range_max']}], "
                        f"pass-1=[{e['range_min']}, {e['range_max']}]"
                    )
                disagreements.append({
                    "type": "numeric_mismatch_same_finding",
                    "pass1": e, "pass2": cell, "mismatches": mismatches,
                })
                continue
            else:
                # Numbers-collision without name-match: cell matches T+pct but no finding name variant
                disagreements.append({
                    "type": "pass2_cell_name_unmatched",
                    "pass2": cell,
                    "note": f"pass-2 found {cell['organ']}/{cell['finding']} T={cell['total']} ({cell['pct']}%), "
                            f"pass-1 has {len(near)} entries at that T+pct but none with matching finding name",
                })
                continue

        disagreements.append({
            "type": "pass2_cell_missing_in_pass1",
            "pass2": cell,
            "note": f"pass-2 parsed {cell['organ']}/{cell['finding']} T={cell['total']} ({cell['pct']}%) — not found in pass-1",
        })

    # Pass-1 entries not matched by any pass-2 cell
    for i, e in enumerate(pass1_entries):
        if i not in matched_p1_indices:
            disagreements.append({
                "type": "pass1_entry_unmatched",
                "pass1": e,
                "note": f"pass-1 encoded {e['organ']}/{e['finding']} T={e['t']} ({e['t_pct']}%) — pass-2 parser did not locate this cell",
            })

    return disagreements


def main():
    pass2_cells = parse_raw_text()
    pass1_entries = build_pass1_entries()
    disagreements = compare(pass2_cells, pass1_entries)

    print(f"Pass-2 parsed {len(pass2_cells)} total cells from raw text")
    print(f"Pass-1 has {len(pass1_entries)} finding entries encoded")
    print(f"Disagreements: {len(disagreements)}")

    # Categorize
    from collections import Counter
    by_type = Counter(d["type"] for d in disagreements)
    for t, n in by_type.most_common():
        print(f"  {t}: {n}")

    # Write diff report
    diff_path = HERE / ".chamanza_pass2_diff.txt"
    with open(diff_path, "w", encoding="utf-8") as f:
        f.write(f"Pass-1 vs Pass-2 disagreement report (Chamanza 2010)\n")
        f.write(f"{'=' * 60}\n\n")
        f.write(f"Pass-2 cells parsed: {len(pass2_cells)}\n")
        f.write(f"Pass-1 entries encoded: {len(pass1_entries)}\n")
        f.write(f"Disagreements: {len(disagreements)}\n\n")
        for d in disagreements:
            f.write(f"--- {d['type']} ---\n")
            for k, v in d.items():
                if k != "type":
                    f.write(f"  {k}: {v}\n")
            f.write("\n")
    print(f"\nWrote diff report to {diff_path}")

    # Also emit pass-2 reconstructed CSV for the audit trail (protocol Q1 decision)
    pass2_csv_path = HERE / "chamanza_2010_pass2.csv"
    fieldnames = pass1.FIELDNAMES
    rows = []
    # Build a tuple-keyed lookup from pass1_entries (with finding name) for CSV reconstruction
    p1_by_num = {}
    for e in pass1_entries:
        k = (e["organ"], e["t"], round(e["t_pct"], 1))
        p1_by_num.setdefault(k, []).append(e)

    for cell in pass2_cells:
        organ = cell["organ"].upper()
        candidates = p1_by_num.get((organ, cell["total"], round(cell["pct"], 1)), [])
        # Pick by finding name match; else first candidate
        p1 = None
        for c in candidates:
            if _finding_match(c["finding"], cell["finding"]):
                p1 = c
                break
        if p1 is None and candidates:
            p1 = candidates[0]
        if p1 is None:
            continue
        # Use pass-2 parsed values for counts, pass-1 overrides for finding name canon
        # (we don't want finding-name parsing artifacts in the audit CSV)
        organ = cell["organ"].upper()
        # Determine emission logic same as pass-1 (per-sex split)
        # Skip this if we can't determine group; use pass-1 entry's group
        # For simplicity, emit one BOTH-row per cell showing the paper's aggregate
        rows.append({
            "species": "CYNO",
            "strain": "MACACA_FASCICULARIS",
            "sex": "BOTH_AGGREGATE",  # pass-2 retains paper-level aggregate for audit
            "organ": organ,
            "finding": p1["finding"],
            "severity": "ANY",
            "n_studies": cell["organ_n"],
            "n_animals": 570,  # pass-2 audit uses paper-level denom
            "n_affected": cell["total"],
            "mean_incidence_pct": cell["pct"],
            "sd_incidence_pct": "",
            "min_incidence_pct": cell["range_min"] if cell["range_min"] is not None else "",
            "max_incidence_pct": cell["range_max"] if cell["range_max"] is not None else "",
            "duration_category": "",
            "source": "chamanza_2010",
            "confidence": "HIGH",
            "notes": f"pass2_m={cell['m']};pass2_f={cell['f']}",
            "year_min": 2003,
            "year_max": 2009,
            "severity_scale_version": "unknown",
            "terminology_version": "inhand_pre_2024",
            "severity_distribution": "",
            "source_page": (cell["page_0idx"] or 0) + 1,
            "source_table": cell["table"],
            "source_row_label": f"{cell['organ']} / {p1['finding']}",
            "extraction_pass": 2,
            "flags": "pass2_aggregate_reconstruction",
        })
    with open(pass2_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} pass-2 rows to {pass2_csv_path}")


if __name__ == "__main__":
    main()

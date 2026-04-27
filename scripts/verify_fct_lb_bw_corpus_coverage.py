"""Corpus-coverage verification for FCT registry sec 7.3 / 7.4 / 7.5.

Extends `verify_fct_lb_bw_numerics.py` (which covers sec 7.1, 7.2, 7.6)
by byte-checking the remaining 18 LB band entries against the corpus
tables in `docs/_internal/research/fct-lb-bw-band-values.md`:

  sec 7.3 metabolic/lipid: LB.CHOL.up/down, LB.GLUC.up/down
  sec 7.4 systemic:        LB.TP.down, LB.ALB.down
  sec 7.5 hematology:      LB.WBC.up/down, LB.RBC.down, LB.HGB.down,
                           LB.HCT.down, LB.PLT.down, LB.RETIC.up/down,
                           LB.NEUT.up, LB.LYM.up/down, LB.EOS.down

Per corpus sec 3.3 (hematology) and 2.3/2.4 (chemistry), bands are uniform
across rat/mouse/dog/nhp/other. NHP carries `provenance: extrapolated`
(corpus sec 5); dog hematology carries `provenance: industry_survey`
(Bourges-Abella 2015).

Checks per entry:
  (a) numeric ladder per species matches corpus tables (uniform)
  (b) units == "fold"
  (c) source_refs is non-empty and cites the corpus-named primary source
  (d) NHP band carries provenance: extrapolated
  (e) dog hematology bands carry provenance: industry_survey

Output:
  - stderr: failure summary
  - stdout: PASS line
  - file: docs/validation/fct-band-corpus-coverage.md (per-entry status table)

Exit: 0 on all-match, 1 on any mismatch.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REG = ROOT / "shared" / "rules" / "field-consensus-thresholds.json"
REPORT = ROOT / "docs" / "validation" / "fct-band-corpus-coverage.md"

SPECIES = ("rat", "mouse", "dog", "nhp", "other")


def _ladder(vc: float, cf: float, af: float, saf: float) -> dict[str, float]:
    return {
        "variation_ceiling": vc,
        "concern_floor": cf,
        "adverse_floor": af,
        "strong_adverse_floor": saf,
    }


# (corpus_section, expected_uniform_ladder, expected_citation_substr,
#  dog_provenance, source_label, soft_citation)
# soft_citation=True flags entries where corpus body (§2.3/§2.4) names no
# specific primary paper -- only generic "tox-pathology consensus". Corpus
# §5 confidence-map groups them with Hall 2012 but doesn't anchor specifically.
# Verifier passes on the generic citation but report surfaces the gap.
EXPECTED: dict[str, tuple[str, dict[str, float], str, str, str, bool]] = {
    # sec 7.3 metabolic / lipid (corpus sec 2.3)
    "LB.CHOL.up":   ("7.3", _ladder(1.3, 1.5, 2.0, 3.0), "tox-pathology",   "best_practice",   "tox-pathology consensus (no named primary)", True),
    "LB.CHOL.down": ("7.3", _ladder(0.85, 0.7, 0.5, 0.3), "tox-pathology",  "best_practice",   "tox-pathology consensus (no named primary)", True),
    "LB.GLUC.up":   ("7.3", _ladder(1.2, 1.5, 2.0, 3.0), "tox-pathology",   "best_practice",   "tox-pathology consensus (no named primary)", True),
    "LB.GLUC.down": ("7.3", _ladder(0.85, 0.7, 0.5, 0.3), "tox-pathology",  "best_practice",   "tox-pathology consensus (no named primary)", True),
    # sec 7.4 systemic (corpus sec 2.4)
    "LB.TP.down":   ("7.4", _ladder(0.95, 0.9, 0.85, 0.75), "tox-pathology", "best_practice",  "tox-pathology consensus (no named primary)", True),
    "LB.ALB.down":  ("7.4", _ladder(0.95, 0.9, 0.85, 0.75), "tox-pathology", "best_practice",  "tox-pathology consensus (no named primary)", True),
    # sec 7.5 hematology (corpus sec 3.1, dog primary; rat/mouse/nhp uniform)
    "LB.WBC.up":    ("7.5", _ladder(1.3, 1.5, 1.8, 2.5),  "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.WBC.down":  ("7.5", _ladder(0.85, 0.7, 0.5, 0.3), "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.RBC.down":  ("7.5", _ladder(0.95, 0.9, 0.85, 0.75), "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.HGB.down":  ("7.5", _ladder(0.95, 0.9, 0.85, 0.75), "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.HCT.down":  ("7.5", _ladder(0.95, 0.9, 0.85, 0.75), "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.PLT.down":  ("7.5", _ladder(0.8, 0.6, 0.5, 0.25), "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.RETIC.up":  ("7.5", _ladder(1.5, 2.0, 3.0, 5.0),  "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.RETIC.down":("7.5", _ladder(0.7, 0.5, 0.3, 0.15), "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.NEUT.up":   ("7.5", _ladder(1.3, 1.5, 1.8, 2.5),  "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.LYM.up":    ("7.5", _ladder(1.3, 1.5, 1.8, 2.5),  "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.LYM.down":  ("7.5", _ladder(0.8, 0.6, 0.5, 0.3),  "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
    "LB.EOS.down":  ("7.5", _ladder(0.5, 0.3, 0.2, 0.1),  "bourges-abella", "industry_survey", "Bourges-Abella 2015", False),
}


def _check_entry(entry_key: str, entry: dict, expected_ladder: dict[str, float],
                 citation_substr: str, dog_provenance: str) -> tuple[list[str], dict]:
    """Returns (failures_for_entry, status_record_for_report)."""
    failures: list[str] = []
    status: dict[str, str] = {}

    bands = entry.get("bands", {})
    ladder_ok = True
    for sp in SPECIES:
        band = bands.get(sp)
        if band is None:
            failures.append(f"MISSING {entry_key} bands.{sp}")
            ladder_ok = False
            continue
        for k, v in expected_ladder.items():
            actual = band.get(k)
            if actual != v:
                failures.append(
                    f"FAIL {entry_key} bands.{sp}.{k}: expected {v}, got {actual}"
                )
                ladder_ok = False
        if band.get("units") != "fold":
            failures.append(
                f"FAIL {entry_key} bands.{sp}.units: expected 'fold', got {band.get('units')!r}"
            )
            ladder_ok = False
    status["ladder"] = "OK" if ladder_ok else "FAIL"

    nhp_band = bands.get("nhp", {})
    if nhp_band.get("provenance") != "extrapolated":
        failures.append(
            f"FAIL {entry_key} bands.nhp.provenance: expected 'extrapolated', "
            f"got {nhp_band.get('provenance')!r}"
        )
        status["nhp_provenance"] = "FAIL"
    else:
        status["nhp_provenance"] = "OK"

    dog_band = bands.get("dog", {})
    if dog_band.get("provenance") != dog_provenance:
        failures.append(
            f"FAIL {entry_key} bands.dog.provenance: expected {dog_provenance!r}, "
            f"got {dog_band.get('provenance')!r}"
        )
        status["dog_provenance"] = "FAIL"
    else:
        status["dog_provenance"] = "OK"

    refs = entry.get("source_refs") or []
    cite_blob = " ".join(
        (r.get("citation") or "") for r in refs if isinstance(r, dict)
    ).lower()
    if not refs:
        failures.append(f"FAIL {entry_key} source_refs: empty")
        status["source_refs"] = "FAIL (empty)"
    elif citation_substr not in cite_blob:
        failures.append(
            f"FAIL {entry_key} source_refs: missing expected citation substring "
            f"{citation_substr!r}"
        )
        status["source_refs"] = f"FAIL (no {citation_substr!r})"
    else:
        status["source_refs"] = "OK"

    return failures, status


def _write_report(rows: list[tuple[str, str, str, bool, dict]]) -> None:
    lines: list[str] = [
        "# FCT Band Corpus Coverage Report",
        "",
        "**Generated:** auto via `scripts/verify_fct_lb_bw_corpus_coverage.py`",
        "",
        "Per-entry verification of registry alignment with corpus tables in",
        "`docs/_internal/research/fct-lb-bw-band-values.md` (sec 2.3, 2.4, 3.1).",
        "Covers the 18 entries NOT byte-checked by `verify_fct_lb_bw_numerics.py`",
        "(which covers sec 7.1 hepatic, 7.2 renal, 7.6 BW).",
        "",
        "## Per-entry status",
        "",
        "| Entry | Corpus sec | Ladder | NHP provenance | Dog provenance | Source_refs | Primary source |",
        "|---|---|---|---|---|---|---|",
    ]
    soft_entries: list[str] = []
    for entry_key, sec, source_label, soft, status in rows:
        marker = " *" if soft else ""
        lines.append(
            f"| `{entry_key}` | {sec} | {status['ladder']} | "
            f"{status['nhp_provenance']} | {status['dog_provenance']} | "
            f"{status['source_refs']} | {source_label}{marker} |"
        )
        if soft:
            soft_entries.append(entry_key)
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append(
        "- All 18 entries have uniform ladders across rat/mouse/dog/nhp/other "
        "per corpus sec 3.3 (hematology) and sec 2.3/2.4 (chemistry uniformity)."
    )
    lines.append(
        "- NHP rows carry `provenance: extrapolated` per corpus sec 5 "
        "confidence-tier map (no published NHP CVI/CVG study comparable to "
        "Bourges-Abella 2015 for dog)."
    )
    lines.append(
        "- Dog hematology rows carry `provenance: industry_survey` "
        "(Bourges-Abella 2015 n=55 beagle CVs)."
    )
    if soft_entries:
        lines.append("")
        lines.append("## Soft-citation gap")
        lines.append("")
        lines.append(
            f"Entries marked `*` cite generic 'tox-pathology consensus' rather "
            f"than naming a primary source paper. Corpus sec 5 confidence-map "
            f"groups these with Hall 2012 + tox-pathology, but corpus sec 2.3 "
            f"and sec 2.4 do not anchor to a specific paper. This is a corpus "
            f"gap, not a registry defect: " + ", ".join(f"`{k}`" for k in soft_entries) + "."
        )
        lines.append("")
        lines.append(
            "**Follow-up:** RG-FCT-LB-BW candidate -- elicit named primary "
            "source(s) for CHOL/GLUC/TP/ALB band thresholds, or downgrade "
            "`threshold_reliability` from `moderate` to `low` if no primary "
            "anchor exists."
        )
    lines.append("")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def verify() -> int:
    if not REG.exists():
        print(f"ERROR: FCT registry not found at {REG}", file=sys.stderr)
        return 2

    with open(REG, encoding="utf-8") as f:
        data = json.load(f)
    entries = data.get("entries", {})

    all_failures: list[str] = []
    rows: list[tuple[str, str, str, bool, dict]] = []

    for entry_key, (sec, ladder, citation_substr, dog_prov, label, soft) in EXPECTED.items():
        entry = entries.get(entry_key)
        if entry is None:
            all_failures.append(f"MISSING {entry_key!r} in registry")
            rows.append((entry_key, sec, label, soft,
                         {"ladder": "MISSING", "nhp_provenance": "-",
                          "dog_provenance": "-", "source_refs": "-"}))
            continue
        fails, status = _check_entry(entry_key, entry, ladder, citation_substr, dog_prov)
        all_failures.extend(fails)
        rows.append((entry_key, sec, label, soft, status))

    _write_report(rows)

    if all_failures:
        print("\n".join(all_failures), file=sys.stderr)
        print(
            f"\nFAIL: {len(all_failures)} corpus-coverage mismatches across "
            f"{len(EXPECTED)} entries (sec 7.3 / 7.4 / 7.5).",
            file=sys.stderr,
        )
        return 1

    print(
        f"OK: all corpus-coverage checks passed "
        f"({len(EXPECTED)} entries x 5 species + provenance + source_refs)."
    )
    print(f"Report: {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(verify())

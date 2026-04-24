"""Pass-1 encoder for Maita 1977 Beagle HCD (prose extraction).

Source: Exp. Anim. 26(2):161-167, 1977. N=420 Beagles (215M + 205F), 1-4 years, Sankyo.

Each entry in FINDINGS: (organ, finding, pct, source_page_0idx, anchor_phrase, sex_mode, notes)
- sex_mode: "BOTH" (emit M+F duplicates with denom=210 each) -- actually per _LEGACY_DATA
  convention we emit BOTH as M+F both using the SAME pct, same n_affected derived from
  420-aggregate. n_animals=420 on each row.
  OR "M_ONLY" (single M row, n_animals=215).
- anchor_phrase: <=60 char anchor from the containing sentence for provenance re-find.

Output: maita_1977_pass1.csv
"""

import csv
from pathlib import Path


# (organ, finding, pct, source_page_0idx, anchor_phrase, sex_mode, notes)
FINDINGS = [
    # === Liver (6 findings) — abstract page 1 + detail pages 1-2 ===
    ("LIVER", "gallstones", 87.5, 0,
     "Gallstones were found in 87.5 % of cases examined",
     "BOTH", ""),
    ("LIVER", "granulomas", 59.9, 1,
     "granulomas... were seen in the liver of 59.9% of cases examined",
     "BOTH", ""),
    ("LIVER", "intranuclear hyaline inclusions", 52.6, 1,
     "Intranuclear hyaline bodies... in hepatocytes from 52.6% of cases examined",
     "BOTH", ""),
    ("LIVER", "lipofuscin deposition", 50.0, 1,
     "In hepatocytes of 50 [%] of cases examined lipofuscin was seen",
     "BOTH", "see AMB-MAITA-006 (fitz OCR artifact)"),
    ("LIVER", "eosinophilic cytoplasmic inclusions", 3.7, 1,
     "Eosinophilic... cytoplasmic inclusion bodies... in hepatocytes from 3.7% of cases examined",
     "BOTH", ""),
    ("LIVER", "parenchymal necrosis at ligament base", 7.3, 1,
     "In 7.3 % of cases examined fresh or old hemorrhages... at the base of... coronary or triangular ligament",
     "BOTH", "see AMB-MAITA-002 (JP-summary typo)"),

    # === Thyroid (1) — page 2 detail, page 3 discussion confirms 46.3% ===
    ("THYROID GLAND", "follicular epithelial cell hyperplasia", 46.3, 2,
     "Bilateral hyperplasia of the follicular epithelial cells was seen in the thyroid glands from 46.3 % of cases examined",
     "BOTH", ""),

    # === Spleen (1) — page 2 detail, page 3 discussion confirms ===
    ("SPLEEN", "gandy-gamna like bodies, capsular", 43.1, 2,
     "Gandy-Gamna bodies in the splenic capsule of 43.1 % of cases examined",
     "BOTH", ""),

    # === Pituitary (1) — page 2 detail ===
    ("PITUITARY", "anterior lobe cysts", 35.1, 2,
     "Cysts 20 to 200 [um] in diameter were found in the anterior lobe of the hypophysis from 35.1 % of cases examined",
     "BOTH", ""),

    # === Prostate (1) — MALE ONLY, 13.7% OF MALES (n=215) per detail text ===
    ("PROSTATE", "chronic inflammation", 13.7, 2,
     "Chronic inflammation was seen in the prostates from 13.7 % of males",
     "M_ONLY", "see AMB-MAITA-003 (male denom)"),
]

# NOT ENCODED (see ambiguity log):
# - Toxocara canis migration lesions 33.1% — cross-organ composite rate (AMB-MAITA-001)


FIELDNAMES = [
    "species", "strain", "sex", "organ", "finding", "severity",
    "n_studies", "n_animals", "n_affected",
    "mean_incidence_pct", "sd_incidence_pct", "min_incidence_pct", "max_incidence_pct",
    "duration_category", "source", "confidence", "notes",
    "year_min", "year_max", "severity_scale_version", "terminology_version", "severity_distribution",
    "source_page", "source_table", "source_row_label", "extraction_pass", "flags",
]


def emit_row(organ, finding, sex, pct, n_animals, source_page, anchor_phrase,
             extra_flags, extra_notes):
    """Derive n_affected from pct × n_animals. Flag reconstruction."""
    n_affected = round(pct / 100.0 * n_animals)
    flags = ["prose_percentage", "paper_aggregate_n", "n_affected_reconstructed_from_pct"] + list(extra_flags)
    return {
        "species": "BEAGLE",
        "strain": "BEAGLE",  # vendor-agnostic per blueprint strain list
        "sex": sex,
        "organ": organ,
        "finding": finding,
        "severity": "ANY",
        "n_studies": 1,  # Maita 1977 is itself one retrospective study (N=420 Sankyo colony)
        "n_animals": n_animals,
        "n_affected": n_affected,
        "mean_incidence_pct": pct,
        "sd_incidence_pct": "",
        "min_incidence_pct": "",
        "max_incidence_pct": "",
        "duration_category": "",  # Maita pools across 1-4 year age range, multiple test durations
        "source": "maita_1977",
        "confidence": "LOW",  # paper-aggregate N per protocol confidence rules
        "notes": extra_notes,
        "year_min": "",  # paper gives ages, not calendar years; leave NULL
        "year_max": 1977,  # publication year (conservative upper bound)
        "severity_scale_version": "unknown",
        "terminology_version": "pre_inhand_1977",
        "severity_distribution": "",
        "source_page": source_page + 1,  # 1-indexed
        "source_table": "",  # Maita has no tables; prose
        "source_row_label": anchor_phrase[:60],
        "extraction_pass": 1,
        "flags": "|".join(flags),
    }


def main():
    out_dir = Path(__file__).parent
    out_path = out_dir / "maita_1977_pass1.csv"

    rows = []
    for (organ, finding, pct, page, anchor, sex_mode, notes) in FINDINGS:
        if sex_mode == "BOTH":
            # Follow hcd_mi_seed.py _LEGACY_DATA convention: emit M and F with same values.
            # n_animals = 420 (paper aggregate) for both rows — n_affected derived the same way.
            # Alternative would be splitting 420 into 215M + 205F, but paper doesn't provide
            # sex-stratified counts, so duplicating the paper-level rate is the honest choice.
            for sex in ("M", "F"):
                rows.append(emit_row(
                    organ, finding, sex, pct, 420, page, anchor,
                    extra_flags=["sex_unknown_follows_legacy_duplication"],
                    extra_notes=notes,
                ))
        elif sex_mode == "M_ONLY":
            rows.append(emit_row(
                organ, finding, "M", pct, 215, page, anchor,
                extra_flags=["sex_specific_finding"],
                extra_notes=notes,
            ))
        elif sex_mode == "F_ONLY":
            rows.append(emit_row(
                organ, finding, "F", pct, 205, page, anchor,
                extra_flags=["sex_specific_finding"],
                extra_notes=notes,
            ))

    with open(out_path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} pass-1 rows to {out_path}")
    print(f"\nBy sex:")
    from collections import Counter
    c = Counter(r["sex"] for r in rows)
    for sex, n in c.items():
        print(f"  {sex}: {n}")
    print(f"\nBy organ:")
    c = Counter(r["organ"] for r in rows)
    for org, n in sorted(c.items()):
        print(f"  {org}: {n}")


if __name__ == "__main__":
    main()

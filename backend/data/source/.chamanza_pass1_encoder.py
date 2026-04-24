"""Pass-1 encoder for Chamanza 2010 MI incidence tables.

Each TABLE_DATA entry: (page_0idx, table_label, organ, organ_studies_n, denom_group, findings)
- denom_group: "BOTH" (denom=570 total, 285/sex), "M_ONLY" (denom=285 M), "F_ONLY" (denom=285 F)
- findings: list of (finding, male_cases|None, female_cases|None, total_cases, total_pct_paper, range_min|None, range_max|None)
  None for a sex = "–" in paper; for BOTH-sex organ this means 0 cases; for single-sex it's the inapplicable sex.

Output: writes chamanza_2010_pass1.csv to the same directory.
"""

import csv
from pathlib import Path

# 1-indexed page numbers match what the PDF reader sees on the bottom of each page
# (the PDF internal pages start at physical page 1 = doc page 0)

TABLE_DATA = [
    # --- TABLE 2: Lung, Heart, Aorta (p. 3 / 0-indexed 2) ---
    (2, "Table 2", "LUNG", 55, "BOTH", [
        ("inflammatory cell infiltration",        28, 27,  55, 9.6,  0,  100),
        ("interstitial inflammation",             22, 14,  36, 6.3,  0,  37.5),
        ("alveolar macrophage accumulation",      16, 16,  32, 5.6,  0,  40),
        ("pigment deposits",                      16, 10,  26, 4.6,  0,  100),
        ("focal pleural fibrosis/pleuritis",      16,  9,  25, 4.4,  0,  50),
        ("foreign body granuloma",                 8,  9,  17, 3.0,  0,  37.5),
        ("hyperplasia of BALT",                    7, 10,  17, 3.0,  0,  37.5),
        ("bronchiolitis",                          5,  8,  13, 2.3,  0,  12.5),
        ("emboli",                                 7,  5,  12, 2.1,  0,  12.5),
        ("vasculitis/vascular degeneration",       5,  4,   9, 1.6,  0,  40),
    ]),
    (2, "Table 2", "HEART", 50, "BOTH", [
        ("inflammatory cell foci",                67, 80, 147, 25.8, 0,  100),
        ("focal myocarditis",                     22, 14,  36, 6.3,  0,  66.7),
        ("myocardial degeneration/fibrosis",      19, 13,  32, 5.6,  0,  66.7),
        ("karyomegaly",                            8,  8,  16, 2.8,  0,  50),
        ("mucinous change",                        6,  7,  13, 2.3,  0,  20),
        ("endocardiosis",                          6,  4,  10, 1.8,  0,  12.5),
        ("coronary intimal thickening",            5,  5,  10, 1.8,  0,  25),
        ("arteritis/periarteritis",                3,  4,   7, 1.2,  0,  25),
        ("mineralization",                      None,  3,   3, 0.5,  0,  12.5),
        ("squamous/epithelial cysts or plaques",   1,  2,   3, 0.5,  0,  12.5),
    ]),
    (2, "Table 2", "AORTA", 20, "BOTH", [
        ("mucinous change",                        7,  8,  15, 2.6,  0,  40),
        ("intimal thickening/degeneration",        4,  5,   9, 1.6,  0,  12.5),
        ("mineralization",                         3,  2,   5, 0.9,  0,  12.5),
    ]),

    # --- TABLE 3: Liver, Gall bladder, Pancreas, Salivary glands (p. 3 / 0-indexed 2) ---
    (2, "Table 3", "LIVER", 58, "BOTH", [
        ("inflammatory cell foci",               166, 180, 346, 60.7, 0, 100),
        ("diffuse hepatocyte vacuolation/lipidosis", 18,  17, 35, 6.1,  0, 60),
        ("tension lipidosis/focal lipidosis",      7,  26,  33, 5.8,  0, 50),
        ("glycogen vacuolation",                  14,  18,  32, 5.6,  0, 100),
        ("focal necrosis/single cell necrosis",   11,  11,  22, 3.9,  0, 37.5),
        ("subcapsular hemorrhage/fibrosis",       11,   9,  20, 3.5,  0, 37.5),
        ("bile duct hyperplasia/periportal fibrosis", 7,   4,  11, 1.9,  0, 20),
        ("pigment",                                5,   6,  11, 1.9,  0, 50),
        ("ectopic adrenal gland",                  0,   2,   2, 0.4,  0, 12.5),
    ]),
    (2, "Table 3", "GALL BLADDER", 16, "BOTH", [
        ("inflammatory cell infiltrations",        5,   4,   9, 1.6,  0, 20),
    ]),
    (2, "Table 3", "EXOCRINE PANCREAS", 30, "BOTH", [
        ("inflammatory cell infiltrations",       19,  17,  36, 6.3,  0, 66.7),
        ("acinar cell atrophy/duct cell hyperplasia", 9, 4,  13, 2.3,  0, 12.5),
        ("acinar cell degranulation",              4,   4,   8, 1.4,  0, 50),
        ("accessory spleen",                       5,   2,   7, 1.2,  0, 12.5),
    ]),
    (2, "Table 3", "SUBMAXILLARY SALIVARY GLAND", 49, "BOTH", [
        ("inflammatory cell infiltrations",       50,  71, 121, 21.2, 0, 100),
        ("inflammation",                           7,   4,  11, 1.9,  0, 40),
    ]),
    # Parotid has dual annotation (17) (43c). 17 = studies with finding; 43 = studies where organ was evaluated.
    # Denominator for % is still 570 per math check: 76/570=13.33≈13.3%. Flag organ_eval_n=43 in notes.
    (2, "Table 3", "PAROTID SALIVARY GLAND", 17, "BOTH", [
        ("inflammatory cell infiltration",        30,  46,  76, 13.3, 0, 100),
        ("inflammation",                          14,  18,  32, 5.6,  0, 50),
        ("mineralized duct contents",              8,   6,  14, 2.5,  0, 50),
    ]),

    # --- TABLE 4: Stomach, Small/Large intestines, Esophagus, Tongue (p. 4 / 0-indexed 3) ---
    (3, "Table 4", "STOMACH", 46, "BOTH", [
        ("gastritis",                             35,  35,  70, 12.3, 0, 100),
        ("inflammatory cell infiltration",        36,  33,  69, 12.1, 0, 100),
        ("lymphoid hyperplasia",                  10,   6,  16, 2.8,  0, 50),
        ("parasitic granuloma",                    8,   7,  15, 2.6,  0, 75),
        ("focal muscle atrophy/degeneration",      6,   6,  12, 2.1,  0, 12.5),
        # Range "–" = not reported, encode as None
        ("gastric infarction/necrosis",            1,   2,   3, 0.5,  None, None),
    ]),
    (3, "Table 4", "SMALL INTESTINE", 20, "BOTH", [
        ("inflammatory cell infiltration",         9,   6,  15, 2.6,  0, 37.5),
        ("pigmented macrophage, lamina propria",  11,   4,  15, 2.6,  0, 50),
        ("inflammation",                           5,   2,   7, 1.2,  0, 12.5),
        ("lacteal ectasia/edema",                  5,   2,   7, 1.2,  0, 37.5),
        ("diffuse goblet cell hyperplasia",        3,   4,   7, 1.2,  0, 66.7),
        ("diverticulum/glandular herniation",      3,   2,   5, 0.9,  0, 12.5),
    ]),
    (3, "Table 4", "LARGE INTESTINE", 24, "BOTH", [
        ("balantidium in the lumen",              68,  46, 114, 20.0, 0, 100),
        ("inflammatory cell infiltrations",       16,  16,  32, 5.6,  0, 50),
        ("syncytial cells, GALT",                  9,  11,  20, 3.5,  0, 75),
        ("inflammation/colitis",                   8,   4,  12, 2.1,  0, 37.5),
        ("vasculitis/perivasculitis",              5,   6,  11, 1.9,  0, 37.5),
        ("glandular microherniation",              4,   4,   8, 1.4,  0, 33.3),
        ("parasitic granuloma/fibrosis/mineralization", 2, 3, 5, 0.9, 0, 12.5),
    ]),
    (3, "Table 4", "ESOPHAGUS", 15, "BOTH", [
        ("inflammatory cell infiltrations",       11,   8,  19, 3.3,  0, 60),
        ("focal muscle atrophy/degeneration",      8,   9,  17, 3.0,  0, 14.2),
    ]),
    (3, "Table 4", "TONGUE", 19, "BOTH", [
        ("inflammation/subepithelial myositis",   15,   7,  22, 3.9,  0, 50),
        ("inflammatory cell foci",                 9,   3,  12, 2.1,  0, 37.5),
    ]),

    # --- TABLE 5: Urinary, Reproductive, Endocrine (journal p. 645 / PDF 0-indexed 3) ---
    (3, "Table 5", "KIDNEY", 56, "BOTH", [
        ("inflammatory cell infiltrations",       87,  77, 164, 28.8, 0, 100),
        ("interstitial nephritis",                27,  29,  56, 9.8,  0, 100),
        ("mineral deposits/mineralization",        6,   9,  15, 2.6,  0, 37.5),
        ("glomerulonephritis/sclerosis",           6,   5,  11, 1.9,  0, 37.5),
        # Range "–" for tubular degeneration
        ("tubular degeneration/regeneration",      5,   4,   9, 1.6,  None, None),
    ]),
    (3, "Table 5", "URINARY BLADDER", 19, "BOTH", [
        ("inflammatory cell foci",                12,  15,  27, 4.7,  0, 66.7),
        ("focal mineralization, adventitial remnants", 6, 0, 6, 1.2,  0, 12.5),
        ("cystitis/eosinophilic cystitis",         3,   3,   6, 1.2,  0, 12.5),
    ]),
    (3, "Table 5", "TESTIS", 5, "M_ONLY", [
        ("hypoplasia, seminiferous tubules",       4, None,   4, 1.4,  0, 40),
        # Range "–" for inflammatory cell foci
        ("inflammatory cell foci",                 1, None,   1, 0.4,  None, None),
    ]),
    (3, "Table 5", "EPIDIDYMIS", 3, "M_ONLY", [
        ("inflammatory cell foci/inflammation",    6, None,   6, 2.1,  0, 33.3),
        ("arteritis/periarteritis",                5, None,   5, 1.8,  0, 16.6),
    ]),
    (3, "Table 5", "PROSTATE", 15, "M_ONLY", [
        ("inflammatory cell infiltrates",          9, None,   9, 3.2,  0, 66.7),
    ]),
    # Ovary has "*" annotation in "Ovary (43)*" — no matching footnote text was captured; flag in notes.
    (3, "Table 5", "OVARY", 43, "F_ONLY", [
        ("cysts (follicular/paraovarian/rete ovarii)", None, 25, 25, 8.8, 0, 66.7),
        ("mineralized atretic follicles",       None,   20,  20, 7.0,  0, 66.7),
    ]),
    (3, "Table 5", "THYROID GLAND", 39, "BOTH", [
        ("ectopic thymus",                        31,  33,  64, 11.2, 0, 83.3),
        ("cysts/ultimobranchial cysts",           22,  13,  35, 6.1,  0, 100),
        ("dilated/cystic follicles",              13,   5,  18, 3.2,  0, 100),
        ("lymphocytic thyroiditis",                1,   3,   4, 0.7,  0, 16.6),
    ]),
    (3, "Table 5", "ADRENAL GLAND", 19, "BOTH", [
        ("mineralization",                         5,   3,   8, 1.4,  0, 50),
        ("cortical cell vacuolation",              2,   6,   8, 1.4,  0, 40),
        ("pigment",                                2,   3,   5, 0.9,  0, 16.6),
        ("adrenohepatic fusion/adhesion",          2,   3,   5, 0.9,  0, 37.5),
    ]),
    (3, "Table 5", "PARATHYROID GLAND", 22, "BOTH", [
        ("ectopic thymus",                        10,   6,  16, 2.8,  0, 20),
        ("congenital cysts",                      10,   5,  15, 2.6,  0, 20),
    ]),
    (3, "Table 5", "PITUITARY", 10, "BOTH", [
        ("inflammatory cell foci",                 4,   2,   6, 1.1,  0, 33.3),
        ("cysts",                                  6,   0,   6, 1.1,  0, 40),
        ("focal anterior pituitary cell hypertrophy", 2, 4,   6, 1.1,  0, 12.5),
    ]),

    # --- TABLE 6: Hematopoietic, Lymphoid (p. 5 / 0-indexed 4) ---
    (4, "Table 6", "MESENTERIC LYMPH NODE", 12, "BOTH", [
        ("sinus histiocytosis",                    8,   3,  11, 1.9,  0, 50),
        ("eosinophil infiltration",                3,   4,   7, 1.2,  0, 20),
        ("lymphangiectasia",                       2,   2,   4, 0.7,  0, 37.5),
    ]),
    (4, "Table 6", "SUBMANDIBULAR LYMPH NODE", 9, "BOTH", [
        ("pigmented macrophages",                  6,   2,   8, 1.4,  0, 50),
        ("granulocytic infiltrates",               3,   3,   6, 1.1,  0, 20),
    ]),
    (4, "Table 6", "THYMUS", 9, "BOTH", [
        ("atrophy",                                4,   6,  10, 1.8,  0, 66.7),
        ("cystic tubular hyperplasia",             3,   6,   9, 1.6,  0, 16.6),
        # Range "–" for myoid cells
        ("myoid cells/muscle tissue",              0,   2,   2, 0.4,  None, None),
    ]),
    (4, "Table 6", "SPLEEN", 15, "BOTH", [
        ("focal lymphoid follicular hyperplasia", 18,  16,  34, 6.0,  0, 50),
        ("capsular fibrosis",                      6,   3,   9, 1.6,  0, 50),
        ("hyalinized germinal centers",            5,   3,   8, 1.4,  0, 37.5),
    ]),

    # --- TABLE 7: Skin, MSK, Nervous (p. 5 / 0-indexed 4) ---
    (4, "Table 7", "SKIN", 41, "BOTH", [
        ("dermatitis",                            14,  17,  31, 5.4,  0, 100),
        ("hair follicular atrophy",                5,   7,  12, 2.1,  0, 50),
        # Penile = male-specific anatomy; denom override = 285 M. 4/285=1.40%.
        ("epidermal hyperplasia, penile",          4,   0,   4, 1.4,  0, 50, "M_ANATOMIC"),
    ]),
    (4, "Table 7", "BRAIN", 26, "BOTH", [
        ("inflammatory cell foci, meningeal",      7,   7,  14, 2.5,  0, 50),
        ("pigment",                                7,   5,  12, 2.1,  0, 50),
        ("perivasculitis, meningeal",              6,   4,  10, 1.8,  0, 100),
        ("perivascular cuffs",                     4,   5,   9, 1.6,  0, 100),
        ("mineralization, thalamus",               5,   4,   9, 1.6,  0, 50),
        ("focal gliosis/glial scar",               2,   3,   5, 0.9,  0, 40),
    ]),
    (4, "Table 7", "SPINAL CORD", 9, "BOTH", [
        ("perivasculitis, meningeal",              8,   5,  13, 2.3,  0, 50),
    ]),
    (4, "Table 7", "SCIATIC NERVE", 9, "BOTH", [
        ("inflammation, perineural",               1,   3,   4, 0.7,  0, 33.3),
        ("perivasculitis",                         1,   2,   3, 0.5,  0, 33.3),
    ]),
    (4, "Table 7", "SKELETAL MUSCLE", 20, "BOTH", [
        ("inflammatory cell infiltrates",          4,   3,   7, 1.2,  0, 25),
        ("histiocyte infiltration/vaccine granuloma", 3, 3, 6, 1.1,  0, 33.3),
        ("myositis",                               2,   3,   5, 0.9,  0, 50),
    ]),
    (4, "Table 7", "BONE", 10, "BOTH", [
        ("digital fractures",                      5,   2,   7, 1.2,  0, 40),
        ("physeal lesions",                        3,   2,   5, 0.9,  0, 12.5),
    ]),
]

# Column order (matches protocol)
FIELDNAMES = [
    "species", "strain", "sex", "organ", "finding", "severity",
    "n_studies", "n_animals", "n_affected",
    "mean_incidence_pct", "sd_incidence_pct", "min_incidence_pct", "max_incidence_pct",
    "duration_category", "source", "confidence", "notes",
    "year_min", "year_max", "severity_scale_version", "terminology_version", "severity_distribution",
    "source_page", "source_table", "source_row_label", "extraction_pass", "flags",
]


def confidence_for(n_animals: int, denom_sex_specific: bool) -> str:
    """Per protocol §Confidence rules.

    For Chamanza rows we have:
      - per-sex rows: n_animals = 285, sex-stratified from paper-reported counts
      - denominator is >= 100 in all cases for Chamanza
    Chamanza reports discrete M/F counts (requirement for HIGH), canonical-organ-term mappable.
    So HIGH for all Chamanza per-sex rows where n_animals >= 100. All Chamanza rows qualify.
    """
    if n_animals >= 100:
        return "HIGH"
    if n_animals >= 30:
        return "MODERATE"
    return "LOW"


def emit_row(organ, finding, sex, n_affected, n_animals, organ_n_studies,
             min_pct, max_pct, source_page, source_table,
             base_flags, notes_extra=""):
    mean_pct = round(n_affected / n_animals * 100, 2) if n_animals else None
    flags = list(base_flags)
    if n_affected == 0 and mean_pct == 0:
        flags.append("zero_cases")
    if min_pct is None and max_pct is None:
        flags.append("range_not_reported")
    row_label = f"{organ.title()} / {finding}"
    notes = notes_extra or ""
    return {
        "species": "CYNO",
        "strain": "MACACA_FASCICULARIS",
        "sex": sex,
        "organ": organ,
        "finding": finding,
        "severity": "ANY",
        "n_studies": organ_n_studies,
        "n_animals": n_animals,
        "n_affected": n_affected,
        "mean_incidence_pct": mean_pct,
        "sd_incidence_pct": "",
        "min_incidence_pct": min_pct if min_pct is not None else "",
        "max_incidence_pct": max_pct if max_pct is not None else "",
        "duration_category": "",  # Chamanza pools studies of various durations; use NULL fallback
        "source": "chamanza_2010",
        "confidence": confidence_for(n_animals, False),
        "notes": notes,
        "year_min": 2003,
        "year_max": 2009,
        "severity_scale_version": "unknown",
        "terminology_version": "inhand_pre_2024",
        "severity_distribution": "",
        "source_page": source_page + 1,  # Convert to 1-indexed for CSV
        "source_table": source_table,
        "source_row_label": row_label,
        "extraction_pass": 1,
        "flags": "|".join(flags),
    }


def main():
    out_dir = Path(__file__).parent
    out_path = out_dir / "chamanza_2010_pass1.csv"

    rows = []
    ambiguities = []  # (AMB-id, organ, finding, page, computed, paper, note)

    for (page, table, organ, organ_n_studies, denom_group, findings) in TABLE_DATA:
        for entry in findings:
            # Handle optional 8th element: per-finding denom override (e.g., "M_ANATOMIC")
            if len(entry) == 8:
                finding, m, f, t, t_pct, rng_min, rng_max, finding_override = entry
            else:
                finding, m, f, t, t_pct, rng_min, rng_max = entry
                finding_override = None

            # Validate reported total matches M+F when both given
            if m is not None and f is not None:
                if m + f != t:
                    raise ValueError(
                        f"Sum mismatch: {organ}/{finding} M={m} + F={f} != T={t}"
                    )

            # Determine effective denom_group for THIS finding
            effective_group = finding_override if finding_override else denom_group

            # Compute paper denom (expected)
            if effective_group == "BOTH":
                paper_denom = 570
            else:  # M_ONLY, F_ONLY, M_ANATOMIC, F_ANATOMIC
                paper_denom = 285

            computed_total_pct = round(t / paper_denom * 100, 1)
            pct_gap = abs(computed_total_pct - t_pct)
            if pct_gap > 0.2:
                raise ValueError(
                    f"Pct mismatch exceeds tolerance: {organ}/{finding} "
                    f"computed {computed_total_pct} vs paper {t_pct} "
                    f"(denom {paper_denom})"
                )
            elif pct_gap >= 0.1:
                ambiguities.append((
                    organ, finding, page + 1, computed_total_pct, t_pct,
                    f"paper-reported {t_pct}% vs computed {computed_total_pct}% "
                    f"from {t}/{paper_denom}; likely paper rounding"
                ))

            # Per-sex row emission based on effective group
            if effective_group == "BOTH":
                m_cases = m if m is not None else 0
                f_cases = f if f is not None else 0
                base_flags = ["range_cross_sex"] if rng_min is not None else []
                rows.append(emit_row(
                    organ, finding, "M", m_cases, 285, organ_n_studies,
                    rng_min, rng_max, page, table, base_flags,
                ))
                rows.append(emit_row(
                    organ, finding, "F", f_cases, 285, organ_n_studies,
                    rng_min, rng_max, page, table, base_flags,
                ))
            elif effective_group in ("M_ONLY", "M_ANATOMIC"):
                m_cases = m if m is not None else 0
                base_flags = ["sex_specific_organ"] if effective_group == "M_ONLY" else ["sex_specific_finding"]
                rows.append(emit_row(
                    organ, finding, "M", m_cases, 285, organ_n_studies,
                    rng_min, rng_max, page, table, base_flags,
                ))
            elif effective_group in ("F_ONLY", "F_ANATOMIC"):
                f_cases = f if f is not None else 0
                base_flags = ["sex_specific_organ"] if effective_group == "F_ONLY" else ["sex_specific_finding"]
                rows.append(emit_row(
                    organ, finding, "F", f_cases, 285, organ_n_studies,
                    rng_min, rng_max, page, table, base_flags,
                ))

    # Parotid + Ovary carry footnote ambiguities — reference AMB entries so
    # .build_canonical.py applies the ambiguity_logged flag automatically.
    for r in rows:
        if r["organ"] == "PAROTID SALIVARY GLAND":
            r["notes"] = "see AMB-CHAMANZA-005 (dual footnote)"
        if r["organ"] == "OVARY":
            r["notes"] = "see AMB-CHAMANZA-006 (asterisk footnote)"

    # Write CSV
    with open(out_path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} pass-1 rows to {out_path}")

    # Summary by organ
    from collections import Counter
    by_organ = Counter(r["organ"] for r in rows)
    print(f"\nRow counts by organ:")
    for org, n in sorted(by_organ.items()):
        print(f"  {org}: {n}")

    # Report ambiguities
    if ambiguities:
        print(f"\nRounding-gap ambiguities ({len(ambiguities)}):")
        for organ, finding, page, computed, paper, note in ambiguities:
            print(f"  [p{page}] {organ}/{finding}: {note}")


if __name__ == "__main__":
    main()

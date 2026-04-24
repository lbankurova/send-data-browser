# Chamanza 2010 — Ambiguity Log

**Source:** Chamanza et al. 2010, *Toxicol Pathol* 38(4):642–657.
**PDF:** `docs/_internal/research/hcd-nhp-dog_beagle/chamanza2010.pdf`
**CSV:** `backend/data/source/chamanza_2010.csv` (canonical after merge)
**Pass-1 generated:** 2026-04-23

---

## AMB-CHAMANZA-001 — Meaning of `(n)` in "Organ (n)" [RESOLVED AT SOURCE]
- **Location:** Tables 2–7 column headers, footnotes on pages 3, 5, 7 (0-indexed 2, 4, 6).
- **Observed:** Every organ row prefix uses `Organ (na)` notation, e.g. "Stomach (46)", "Liver (58)". Initial concern: is `(n)` the number of animals evaluated (affecting denominator) or a study count?
- **Interpretations:**
  1. Per-organ animal count (would make denominator variable per organ)
  2. Number of studies with recorded finding in the organ
  3. Number of studies where the organ was evaluated
- **Chosen:** **Interpretation (2)**, per explicit footnote `a` appearing after each table: "Number of studies with a recorded finding in the organ."
- **Alternative encoding:** Rejected — math against 570 denominator confirms (2). Liver "Inflammatory cell foci" 346/570 = 60.70% ≈ paper 60.7%. Stomach "Gastritis" 70/570 = 12.28% ≈ paper 12.3%. Interpretations (1) and (3) would require variable denominators that don't match paper rates.
- **Implication for CSV:** `n_studies` field populated with `(n)` value; `n_animals` held constant at 285 (per sex) / 570 (total) regardless of `(n)`.
- **User review:** [x] Resolved at source by paper footnote.

---

## AMB-CHAMANZA-002 — Blueprint "per-cell N 30-150" mis-assumption vs actual 570 denominator
- **Location:** Blueprint `docs/_internal/incoming/hcd-mi-ma-s08-wiring-synthesis.md:20`, "Chamanza 2010 (cyno, ~2,600 aggregate / 30-150 cell-level)".
- **Observed:** The blueprint assumes Chamanza per-cell N = 30–150, triggering the `cell_n_below_reliability_threshold` flag at <100 per F4. But Chamanza reports all incidence percentages against the paper-aggregate 570 animals (285/sex), regardless of per-organ `(n)` annotation. Math check confirms this across Liver (346/570=60.7%), Heart (147/570=25.8%), Stomach (70/570=12.3%), etc.
- **Interpretations:**
  1. Blueprint was wrong about Chamanza's denominator reporting convention — `cell_n_below_reliability_threshold` should NOT fire for Chamanza Total (%) data.
  2. Blueprint was referring to the per-study group size (3–8 animals/group per footnote b), which IS below 100 — but this small-N context applies only to the *Range (%)* column, not the *Total (%)*.
  3. Blueprint estimated ~2,600 as a finding-count aggregate across organs (570 animals × multiple findings each), and 30–150 as per-study-per-sex cell counts.
- **Chosen:** **Interpretation (2)** — blueprint's small-N concern applies legitimately to the Range (%) per-study data (3–8 animals/group, often <100 aggregate), not to Total (%). Encoded accordingly:
  - Total (%) rows in CSV: `n_animals` = 285 or 570, no `cell_n_below_reliability_threshold` flag
  - Range (%) values encoded as `min_incidence_pct` / `max_incidence_pct`, flagged with `range_cross_sex` (paper's range is per-study across both sexes; attributing it to sex-split rows is approximate)
- **Alternative encoding:** If blueprint intent was strict interpretation (1), we'd apply `cell_n_below_reliability_threshold` to all Chamanza rows where `(n) × typical_per_study_N < 100`. This would apply broadly and doesn't match paper's own denominator reporting.
- **User review:** [ ] Needs confirmation — does blueprint F4 small-N flag apply to Range (%) data (as encoded) or to Total (%) (which would require re-flagging all Chamanza rows)?

---

## AMB-CHAMANZA-003 — Urinary bladder 1.2% vs computed 1.05% rounding anomaly
- **Location:** Page 5 (0-indexed 4), Table 5, Urinary bladder (19) rows for "Focal mineralization, adventitial remnants" and "Cystitis/eosinophilic cystitis", both at 6 cases / 1.2% reported.
- **Observed:** Paper reports Total (%) = 1.2% for 6-case findings under urinary bladder. Computed 6/570 = 1.053% → rounds to 1.1%, not 1.2%.
- **Interpretations:**
  1. Paper rounding error or inconsistent rounding convention.
  2. Implicit different denominator applied for urinary bladder rows (e.g., 500 animals? — no such denominator stated).
  3. Paper used a different rounding rule (truncate + tolerance, or rounded up).
- **Chosen:** **Interpretation (1)**, paper rounding inconsistency. Encoded paper-reported 1.2% in CSV via `mean_incidence_pct`; paper's reported value preserved. `n_affected = 6`, `n_animals = 285 (per sex split)`.
- **Note:** Other 6-case findings in the paper at `6/570` also round to 1.1%. The urinary bladder case is the only 1.2% report for 6 cases — may be a paper-side typo vs a genuine different denominator. Cross-check: Heart "Arteritis/periarteritis" = 7/570 = 1.228% ≈ paper 1.2%, so 1.2% is the natural rounding of ~1.22%, not 1.05%. Concerning.
- **Alternative encoding:** If a different denominator was meant (e.g., only animals with bladder evaluated), we'd need `n_animals` adjusted accordingly. No paper evidence for this.
- **User review:** [ ] Accept paper value as-is, note the discrepancy?

---

## AMB-CHAMANZA-004 — "Epidermal hyperplasia, penile" anatomically sex-specific finding in BOTH-sex organ (SKIN)
- **Location:** Page 5 (0-indexed 4), Table 7, Skin (41), "Epidermal hyperplasia, penile".
- **Observed:** Skin is a BOTH-sex organ, but the specific finding "penile hyperplasia" is anatomically male-only. Paper reports M=4, F=0, Total=4 (1.4%). Math: 4/570 = 0.70%, not 1.4%. But 4/285 = 1.40% ✓. Paper implicitly used male-only denominator for this single row within an otherwise BOTH-sex table.
- **Interpretations:**
  1. Paper applied per-finding anatomic denominator (male-only = 285) for anatomically sex-restricted findings, even within BOTH-sex organ tables.
  2. Paper reporting typo.
- **Chosen:** **Interpretation (1)** — anatomically restricted finding → sex-specific denominator. Encoded with `denom_group` override = `M_ANATOMIC`, emitted single M row with `n_animals=285`, flag `sex_specific_finding`.
- **Alternative encoding:** If (2), we'd emit M=4/570=0.7% and F=0/570=0% rows. The paper-reported 1.4% would become unsupported.
- **Scan for other sex-specific findings in BOTH-sex organs:** reviewed Tables 2–7 — no other anatomically sex-restricted findings found among the 121 findings. "Penile" is the only such row.
- **User review:** [ ] Confirm M_ANATOMIC handling correct?

---

## AMB-CHAMANZA-005 — Parotid salivary gland dual annotation "(17) (43c)"
- **Location:** Page 3 (0-indexed 2), Table 3, "Parotid salivary gland (17) (43c)".
- **Observed:** Parotid row has two parenthesized annotations: (17) = studies with finding (footnote `a`), (43c) = number of studies in which the organ was evaluated (footnote `c` — parotid was evaluated in 43 of 60 studies).
- **Interpretations:**
  1. Denominator remains 570 (paper aggregate) per footnotes.
  2. Denominator is animals in the 43 evaluating studies (variable).
- **Chosen:** **Interpretation (1)** — math check: "Inflammatory cell infiltration" 76/570 = 13.33% ≈ paper 13.3%. Denominator is 570 even though parotid was only evaluated in 43 studies.
- **Implication:** The 17 animals in studies not evaluating parotid count as "not-affected" in the denominator — this slightly underestimates the true rate among parotid-evaluated animals. Paper's convention.
- **Alternative encoding:** If (2), `n_animals` would vary per row (≈43 × avg-per-study). Under (1), `n_animals=285` per sex (paper-level), `n_studies=17` (footnote `a`). The 43-evaluating-studies count is lost in (1) — captured only in the `notes` field cross-reference.
- **Encoding:** `n_studies = 17` (studies-with-finding); `notes = see AMB-CHAMANZA-005 (dual footnote)`.
- **User review:** [ ] Acceptable approximation of Chamanza's convention?

---

## AMB-CHAMANZA-006 — Ovary "(43)*" asterisk annotation with missing footnote text
- **Location:** Page 4 (0-indexed 3), Table 5, "Ovary (43)*".
- **Observed:** Ovary row has an asterisk annotation but the corresponding footnote text was not captured in fitz text extraction. The footer text for Table 5 shows only footnotes `a` and `b`, no `*` definition.
- **Interpretations:**
  1. Asterisk indicates female-only denominator (obvious given ovary is female-organ) — redundant annotation.
  2. Asterisk points to a footnote lost in OCR/text extraction (visually present in PDF but not extracted).
  3. Asterisk indicates special methodology (e.g., only mature females evaluated).
- **Chosen:** **Interpretation (1)** — math check: "Cysts" 25/285 = 8.77% ≈ paper 8.8%. Denominator is 285 female-only, consistent with the female-only anatomy of the organ. Asterisk likely just flags "female-only" for reader convenience.
- **Alternative encoding:** If (3), a sub-cohort denominator (e.g., only sexually mature females) would apply — `n_animals` would be <285 and `mean_incidence_pct` would compute to a higher rate. Under the chosen interpretation (1), the emission is: single F row, `n_animals=285`, flag `sex_specific_organ`.
- **Encoding:** Emitted as single F row with `n_animals=285`, flag `sex_specific_organ`; `notes = see AMB-CHAMANZA-006 (asterisk footnote)`.
- **Recommendation:** Manual visual check of page 4 PDF (1-indexed 5 via journal numbering 645) to confirm asterisk meaning before canonical merge.
- **User review:** [ ] Visual check of PDF — does asterisk footnote text exist?

---

## AMB-CHAMANZA-007 — Range (%) attribution to sex-split rows
- **Location:** All Chamanza rows with paper-reported Range (%).
- **Observed:** Chamanza reports Range (%) as cross-study, cross-sex (per footnote b: "Determined only in studies with five to eight animals per group"). When we split per-finding into M and F rows, the Range attributed to each sex row is the same cross-sex range.
- **Interpretations:**
  1. Attribute cross-sex Range to both M and F rows — imperfect but faithful to paper.
  2. Omit Range from per-sex rows (NULL min/max) — lossy of real information.
  3. Emit a separate BOTH row with the Range, in addition to per-sex M and F rows — triples row count.
- **Chosen:** **Interpretation (1)** — min/max attributed to both M and F rows, flagged `range_cross_sex`. Consumers reading min/max for a sex-specific query should note the flag indicates the range is not sex-stratified.
- **Alternative encoding:** (2) preserves purity but loses useful Range data; (3) inflates row count with redundant data.
- **User review:** [ ] Accept `range_cross_sex` flag as adequate disclosure?

---

## Pass-1 / Pass-2 disagreements

### Internal regex-based pass-2 (same-context, script-driven)
Pass-2 parsed 121 total cells from raw text via regex, cross-checked against pass-1 TABLE_DATA: **0 disagreements**. Limitation: same agent, same raw-text source — catches typos but NOT semantic errors.

### Independent agent pass-2 (zero-context `Explore` agent, 2026-04-24)
Separate Claude agent with no session context or access to this repo's existing extractions was given the PDF and asked to independently extract all incidence tables. Output: `.chamanza_independent_extraction.csv` + `.chamanza_independent_notes.md`.

- Independent extraction: **118 findings** (my canonical: 121)
- **Numeric mismatches on 118 shared findings: 0**
- Independent interpretations (derived from PDF alone) matched mine on:
  - Denominator = 570 (paper-aggregate)
  - `(n)` after organ = "studies with a recorded finding in the organ" (footnote a)
  - Sex-specific organs use denominator = 285
  - Distinction between "–" (not applicable, sex-specific anatomy) and "0" (zero occurrences)
  - Table 3 footnote c for Parotid (43c) = studies in which organ was evaluated
- **3-finding gap — agent omission, not canonical error.** Agent missed:
  - `BONE / digital fractures` (p5 Table 7, 7 cases, 1.2%)
  - `BONE / physeal lesions` (p5 Table 7, 5 cases, 0.9%)
  - `SKELETAL MUSCLE / myositis` (p5 Table 7, 5 cases, 0.9%)
  - Verified present in raw text at lines 1071–1099 of `.chamanza_raw.txt`. Agent's organ list for Table 7 was "Skin, Brain, Spinal cord, Sciatic nerve, Skeletal muscle" — BONE entirely omitted, and SKELETAL MUSCLE extraction incomplete.
- **Net verdict:** independent extraction validates canonical numeric accuracy (0 mismatches) and canonical completeness (my canonical is strictly more complete). No canonical row challenged.
- **User review:** [ ] Accept independent verification result?

---

## Summary

| Count | Category |
|---|---|
| 7 | Ambiguity entries (this log) |
| 1 | Resolved at source (AMB-001) |
| 6 | Require user review (AMB-002..007) |
| 0 | Internal pass-2 disagreements (regex re-parse, script-driven) |
| 0 | Independent-agent pass-2 numeric disagreements (118 shared findings, zero-context agent, 2026-04-24) |
| 3 | Independent-agent omissions (agent extraction error, NOT canonical defect — BONE + SKELETAL MUSCLE/myositis) |
| 234 | Canonical rows written |

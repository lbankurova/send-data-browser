# Maita 1977 — Ambiguity Log

**Source:** Maita, Masuda, Suzuki 1977, *Exp. Anim.* 26(2):161–167. "Spontaneous Lesions Detected in the Beagles Used in Toxicity Studies."
**PDF:** `docs/_internal/research/hcd-nhp-dog_beagle/maita1977.pdf`
**CSV:** `backend/data/source/maita_1977.csv` (canonical after merge)
**Pass-1 generated:** 2026-04-23

**Paper N:** 420 Beagles (215M + 205F), aged 1–4 years, Sankyo Co. Ltd., Japan. Paper-aggregate denominator; no per-organ per-cell N reported.

---

## AMB-MAITA-001 — Toxocara canis migration lesions are cross-organ composite (33.1%), not per-organ
- **Location:** Page 3 (0-indexed 2) detail; confirmed in abstract (p. 1) and discussion (p. 4).
- **Observed:** Paper reports "Damages caused by migration of Toxocara canis larvae were detected in 33.1[%] of cases examined, in the lungs, liver, kidneys, spleen, pancreas, mesenteric lymph nodes and others." The 33.1% is the case-level rate — fraction of animals with Toxocara damage in *any* listed organ — not a per-organ incidence.
- **Interpretations:**
  1. Emit one row per organ listed (LUNG, LIVER, KIDNEY, SPLEEN, PANCREAS, MESENTERIC LYMPH NODE) at 33.1% each, flagged `multi_organ_composite_rate`. This over-attributes — a single animal with lesions in 4 organs would be counted 4 times across rows, inflating per-organ HCD estimates.
  2. Emit a single summary row with an aggregate organ label (e.g., `MULTIPLE` or `SYSTEMIC`). Breaks organ-field convention (all existing `hcd_mi_incidence` rows use specific organs). Engine queries by organ would not match.
  3. Skip encoding entirely. Log the finding exists but cannot be represented without fabrication. Lose coverage of Toxocara finding entirely.
- **Chosen:** **Interpretation (3) — skip.** Emitting per-organ at 33.1% each is fabrication (inflates rates); the aggregate organ label breaks schema convention. Honest encoding is to acknowledge the paper's reporting convention doesn't fit the per-organ schema.
- **Alternative encoding:** Under (1), six rows would appear — LUNG/LIVER/KIDNEY/SPLEEN/PANCREAS/MESENTERIC LYMPH NODE × finding `toxocara canis migration lesions` × sex=M and F — each at `mean_incidence_pct=33.1` with `n_affected=round(0.331*210)=70` per sex. Under (2), one row with `organ="MULTIPLE"` (unprecedented in the schema). Under (3, chosen), zero rows — the finding is absent from the canonical CSV.
- **Implication:** Users querying HCD for Toxocara-related findings in specific organs will get no match. Maita's Toxocara data is recoverable only by reading the paper directly. Flag as a known coverage gap in the Beagle catalog.
- **User review:** [ ] Accept skip, or prefer option 1 (emit-per-organ with flag)?

---

## AMB-MAITA-002 — Paper internal inconsistency: ligament-base necrosis 7.3% (English) vs 3.7% (Japanese summary)
- **Location:** English abstract p. 1 and detail p. 2 say **7.3%**; Japanese summary p. 5 (original-language abstract) says **3.7%** ("靱帯付着部の実質壊死が3.7%にみられた").
- **Observed:** English text reports this finding twice at 7.3% (abstract + detail sentence). Japanese summary at end of paper reports 3.7% for the same finding. The Japanese summary also lists "eosinophilic cytoplasmic inclusions at 3.7%" — same paper — raising suspicion that the Japanese summary has a transcription error conflating the two 3.X% values.
- **Interpretations:**
  1. English text is authoritative; Japanese summary has a typo (7.3 → 3.7 transposition or copy-paste error from adjacent entry).
  2. Japanese summary is authoritative; English text has the typo (double-occurrence in English suggests this is less likely).
  3. Genuinely ambiguous; encode both and let downstream decide.
- **Chosen:** **Interpretation (1)** — encoded 7.3%. Reasoning: English text reports the value twice (abstract + detail paragraph), providing internal consistency; the Japanese summary appears to have duplicated the 3.7% value from the adjacent eosinophilic-inclusions finding. `notes` field records the conflict.
- **Alternative encoding:** If (2), mean_incidence_pct = 3.7%, n_affected = round(0.037 × 420) = 16. Under (1), mean = 7.3%, n_affected = 31.
- **User review:** [ ] Confirm English-text precedence, or require visual review of page 5 Japanese summary to resolve?

---

## AMB-MAITA-003 — Prostatitis 13.7% expressed against male denominator, not paper total
- **Location:** Abstract p. 1 reports "prostatitis (13.7%)" in the same list format as other findings (which use 420 denom). Detail p. 3 clarifies: "Chronic inflammation was seen in the prostates from 13.7 % **of males**".
- **Observed:** Abstract format implies 420-total denominator; detail text is explicit that the rate is against males only (215). Prostate is anatomically male-only, so a male denominator is biologically appropriate; but the abstract's presentation is ambiguous.
- **Interpretations:**
  1. Rate is 13.7% of males (denom = 215) — natural for sex-specific anatomy, matches detail text explicitly.
  2. Rate is 13.7% of total 420 (58 cases) — matches abstract formatting convention only.
- **Chosen:** **Interpretation (1)** — encoded as M-only row, `n_animals=215`, `n_affected=round(0.137×215)=29`, `sex=M`. Detail text is unambiguous and biologically correct.
- **Alternative encoding:** If (2), sex=M with n_animals=420 would break the schema (denom can't exceed the sex cohort); the only coherent (2) reading would be n_affected=58 but that requires 58/420=13.8% (close), suggesting paper arithmetic done against 420 — unlikely.
- **User review:** [ ] Confirm male-denom interpretation?

---

## AMB-MAITA-004 — Sex stratification absent for all BOTH-sex findings
- **Location:** All rows except PROSTATE.
- **Observed:** Maita does not report sex-split counts for any finding (unlike Chamanza). The paper's methods section notes the cohort is 215M + 205F, but findings are reported in aggregate.
- **Interpretations:**
  1. Assume sex-uniform distribution; emit M and F rows with the same percentage and `n_animals=420` duplicated (_LEGACY_DATA convention in hcd_mi_seed.py). Queries for either sex get the same answer — lossy of any real sex difference, but honest about what the paper tells us.
  2. Emit a single row with `sex=BOTH`. The engine's `WHERE sex=?` query with M or F would not match, effectively making these rows invisible to per-sex queries.
  3. Split the aggregate count proportionally: 420 × pct → M share = round(count × 215/420), F share = round(count × 205/420). Approximation; not paper-grounded.
- **Chosen:** **Interpretation (1)** — emit M and F rows with duplicated values, flagged `sex_unknown_follows_legacy_duplication`. This follows the existing convention in `backend/etl/hcd_mi_seed.py:211-221` (_LEGACY_DATA → M+F). Makes rows queryable at cost of implying a sex-uniform rate.
- **Why not (2) — engine `sex=BOTH` fallback?** Four reasons, merit-ranked:
  1. **Precedent:** existing `_LEGACY_DATA` pattern in `hcd_mi_seed.py:211-221` is the established convention for sex-unknown source data (Sprague-Dawley mock data). No precedent departure.
  2. **Scope:** DATA-GAP-MIMA-18 is about data extraction. The engine query cascade in `hcd_database.py:788-819` is a separate subsystem — modifying it expands scope.
  3. **Structural complexity:** adding `sex=BOTH` fallback is not 3 lines — it introduces a 4th tier in the existing 3-tier cascade and raises ranking questions (if both a sex-specific row AND a BOTH row match, which wins? Lower confidence? Higher N?). These require their own spec.
  4. **CLAUDE.md rule 15:** `hcd_database.py` is shared code in `backend/services/analysis/` — any modification requires `/ops:impact` first to understand downstream consumers.
- **Follow-up logged:** `DATA-GAP-MIMA-22` (engine `sex=BOTH` fallback for sex-unblinded HCD sources) in `docs/_internal/TODO.md`. Not an unprompted deferral per CLAUDE.md rule 13 — real dependency on a separate design decision.
- **Alternative encoding:** (2) would require engine changes to fall back to BOTH on miss; (3) is fabrication.
- **User review:** [ ] Accept duplication-under-flag as per existing convention + scope boundary?

---

## AMB-MAITA-005 — n_affected derived from percentage × aggregate N (lossy)
- **Location:** All rows. The paper reports only percentages, not explicit case counts. I reconstruct n_affected = round(pct/100 × 420), which introduces rounding error.
- **Observed:** E.g., gallstones 87.5% × 420 = 367.5 → round to 368. If the true count were 367 or 368, it would still round to 87.5% reported. So we can't recover the exact count.
- **Interpretations:**
  1. Emit derived n_affected; flag `n_affected_reconstructed_from_pct`; acknowledge ±1 count uncertainty.
  2. Emit `n_affected = None` (NULL) since the paper doesn't report counts. Loses information about order of magnitude.
- **Chosen:** **Interpretation (1)** — encoded with flag. Rate is paper-grounded; count is derived with known precision (±0.5%). Flag makes the derivation auditable.
- **Alternative encoding:** Under (2), `n_affected = NULL` for every row; downstream consumers computing confidence intervals from M/N counts would have to fall back to `n_animals × mean_incidence_pct/100` themselves. Under (1, chosen), `n_affected` is pre-computed with a flag marking the ±0.5% rounding uncertainty.
- **User review:** [ ] Accept reconstruction with flag?

---

## AMB-MAITA-006 — OCR artifact "50 /" for lipofuscin deposition
- **Location:** Page 2 detail text "In hepatocytes of 50 / of cases examined lipofuscin was seen"
- **Observed:** `fitz` text extraction produces "50 /" where the paper likely has "50%". The slash after "50" is an OCR/extraction artifact (the `%` sign frequently mis-extracts this way in old scans).
- **Cross-check:** Abstract page 1 reports "lipofuscin deposition (50%)" — confirming the intended value is 50%. Japanese summary p. 5 confirms "リポフスチン沈着が50%". Discussion p. 4 also refers to 50%.
- **Interpretations:**
  1. Paper says 50% (confirmed 3× elsewhere in same paper); fitz artifact.
  2. Paper actually says "50 /" for some other meaning — extremely unlikely given redundant 50% elsewhere.
- **Chosen:** **Interpretation (1)** — encoded as 50.0%. No real ambiguity.
- **Alternative encoding:** Under (2), the row would be omitted entirely (value unknown). Cross-citation in the paper makes this implausible.
- **User review:** [x] Resolved by cross-citation.

---

## AMB-MAITA-007 — Beagle catalog coverage is known-partial vs AC-F8-1 target (≥ 60 rows/species)
- **Location:** Maita delivers 19 rows across 5 organs (LIVER, THYROID GLAND, SPLEEN, PITUITARY, PROSTATE) vs blueprint F8 AC-F8-1 target of "≥ 60 rows per species covering the top 10 organ systems."
- **Observed:** Major Beagle organ systems absent: kidney, heart, lung, lymphoid system, musculoskeletal, nervous. Sato 2012 is a photomicrograph atlas with no quantitative tables (confirmed 0 `%` table hits during scope audit). Chandra 2010 citation in prior synthesis is unverifiable (tracked as DATA-GAP-MIMA-21).
- **Interpretations:**
  1. Ship F8 with partial Beagle coverage; surface the partial state via `catalog_coverage.json` so downstream consumers can distinguish "catalog has no HCD for this organ" from "no HCD exists anywhere." Track the gap as DATA-GAP-MIMA-21.
  2. Block F8 merge until Chandra 2010 (or equivalent) is acquired.
  3. Emit placeholder rows with `confidence=LOW` and paper-source="unknown" to pad the count. Fabrication.
- **Chosen:** **Interpretation (1)** — documented scope-gap, honest surfacing via metadata, no fabrication. Per blueprint F8 scope-revision 2026-04-23 in DATA-GAP-MIMA-18.
- **Alternative encoding:** Under (2), no Beagle rows would ship until Chandra acquisition; cyno HCD (Chamanza) could still ship. Under (3), padded rows would inflate the catalog without adding real information. Under (1, chosen), the data is honest: 19 real rows + metadata flagging partial coverage.
- **Surfacing:** `catalog_coverage.json` contains `BEAGLE.known_partial = true` and `missing` field pointing to DATA-GAP-MIMA-21. Also written to `etl_metadata` under key `mi_catalog_coverage` per spec §Catalog-coverage metadata, enabling frontend/engine queries via the standard DB path.
- **User review:** [ ] Accept partial-Beagle-coverage shipping with surfaced known-partial state?

---

## Pass-1 / Pass-2 disagreements

### Internal regex-based pass-2 (same-context, script-driven)
Pass-2 scanned all 37 percentage mentions in the raw text; all accounted for (either in FINDINGS, declared-skip, or non-finding). All 10 anchor phrases verifiable in PDF text. **0 unaccounted percentages, 0 anchor misses.** Limitation: same agent, same source.

### Independent agent pass-2 (zero-context `Explore` agent, 2026-04-24)
Separate Claude agent with no session context extracted Maita independently. Output: `.maita_independent_extraction.csv` + `.maita_independent_notes.md`.

- Independent extraction: **11 findings** (my canonical: 10 encoded + 1 skipped via AMB-MAITA-001 = 11 mentioned)
- **Numeric agreement on all 10 per-organ findings: 100%** (gallstones 87.5%, granulomas 59.9%, intranuclear hyaline inclusions 52.6%, lipofuscin 50%, eosinophilic inclusions 3.7%, ligament necrosis 7.3%, thyroid FEC hyperplasia 46.3%, Gandy-Gamna 43.1%, pituitary cysts 35.1%, prostatitis 13.7%)
- Independent interpretations matched mine on:
  - Paper N = 420 (215M + 205F)
  - Prostatitis is male-only at 13.7% of 215 males (AMB-MAITA-003 confirmed)
  - Toxocara 33.1% is cross-organ composite, not per-organ (AMB-MAITA-001 confirmed — agent reported it as a "multi-organ" finding)
  - Sex stratification not reported for non-sex-specific findings (AMB-MAITA-004 confirmed)
- **Finding-name canonicalization differences (not semantic):**
  - Agent: "fine granular gallstones" | Mine: "gallstones" (agent preserved paper's descriptive phrasing)
  - Agent: "small cysts in the anterior lobe" @ HYPOPHYSIS | Mine: "anterior lobe cysts" @ PITUITARY (agent used paper's organ spelling; mine uses SEND-standard PITUITARY)
  - Agent: "Gandy-Gamna like bodies of the splenic capsule" | Mine: "gandy-gamna like bodies, capsular"
  - Agent: "parenchymal necrosis at the base of the ligaments" | Mine: "parenchymal necrosis at ligament base"
  - No numeric impact. Canonical uses SEND-normalized organ names and slightly-compacted finding terms.
- **Agent reports "no internal inconsistencies"** — but agent was instructed to ignore Japanese summary. AMB-MAITA-002 reconfirmed by direct re-read of PDF page 5 (1-indexed) on 2026-04-24: Japanese text shows "3.7%" for ligament necrosis where English shows "7.3%". Pattern of two adjacent "3.7%" values in Japanese (eosinophilic + ligament necrosis both listed as 3.7%) strongly suggests Japanese-summary transcription error.
- **Net verdict:** independent extraction validates canonical numeric accuracy (100%), denominator interpretations, sex-basis assignments, and the Toxocara-skip decision. AMB-MAITA-002 (Japanese typo) is unchallenged — independent agent simply wasn't scoped to check it.
- **User review:** [ ] Accept independent verification result?

---

## Summary

| Count | Category |
|---|---|
| 7 | Ambiguity entries (this log) |
| 1 | Resolved at source (AMB-006, OCR artifact cross-confirmed) |
| 6 | Require user review (AMB-001..005, AMB-007) |
| 0 | Internal pass-2 disagreements |
| 0 | Independent-agent pass-2 numeric disagreements (100% agreement on 10 shared findings, zero-context agent, 2026-04-24) |
| 1 | AMB-002 (Japanese typo) reconfirmed by direct re-read — independent agent was scoped to ignore Japanese summary |
| 19 | Canonical rows written (10 M + 9 F; 5 organs after sex split) |
| 1 | Findings skipped (Toxocara composite rate, AMB-MAITA-001 confirmed by independent agent) |

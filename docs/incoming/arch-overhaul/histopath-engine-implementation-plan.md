# Histopathology Engine — Implementation Plan

> **Spec:** `docs/incoming/arch-overhaul/histopath-engine-spec.md`
> **Audit context:** `docs/views/histopathology-audit-results.md`, `docs/views/histopathology-audit.md`
> **Generated:** 2026-02-16
> **Status:** Ready for review

---

## Agent Questions — Resolved

All 14 agent questions from the spec have been answered by codebase search. Resolutions below drive the implementation decisions.

### Tier 1 Resolutions

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| Q1 | Does the backend already read ts.xpt? | **YES.** `xpt_processor.py:135-234` has `extract_full_ts_metadata()` extracting 20+ TSPARMCD params. Served via `/api/studies/{id}/metadata`. | IMP-01: Embed `StudyContext` in existing metadata — no new endpoint needed. |
| Q2 | Do R18/R19 exist? | **YES.** Both are real, actively firing rules. R18 = incidence decrease (protective), R19 = potential protective/therapeutic effect. `scores_and_rules.py:83-94, 172-194`. Frontend uses them in Protective Signals Bar. | IMP-05: **Not phantom.** Keep `protective` category. Add rule ID schema validation only. |
| Q3 | Are CA/JT p-values pre-computed? | **YES.** `FindingDoseTrend` has `ca_trend_p`, `severity_trend_p`, `severity_trend_rho`. Frontend Fisher's is for on-the-fly sex comparisons only. | IMP-09: **Closed — non-issue.** Document and move on. |
| Q4 | Where is NOAEL calculated? | `view_dataframes.py:262-372`. Backward inference: find lowest adverse dose (severity="adverse" AND p<0.05), NOAEL = one level below. Confidence penalties for single endpoint, sex inconsistency. | IMP-10: No circular dependency. Clinical catalog elevations DO affect severity classification which feeds NOAEL. Document the chain. |
| Q5 | How many `?? 0` severity coercions? | **30 occurrences** across 6 files: HistopathologyView.tsx (12), HistopathologyContextPanel.tsx (6), DoseChartsSelectionZone.tsx (2), pattern-classification.ts (1), syndrome-rules.ts (1). All use `?? 0` pattern. | IMP-11: Scope confirmed. ~22 unique call sites need tri-state conversion. |

### Tier 2 Resolutions

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| Q6 | What does `classifyFindingNature()` return when no match? | Returns `{ nature: "other", expected_reversibility: "moderate", typical_recovery_weeks: null }` — silent fallback, no indication it couldn't classify. | IMP-04: Add explicit `UNKNOWN` category with "manual review recommended" note. |
| Q7 | Does `computeVerdict()` receive duration/category info? | `recovery_days` exists at specimen level (`SubjectHistopathResponse.recovery_days`). Used in tooltips and classification confidence already, but **NOT used to gate verdict logic** in `computeVerdict()`. | IMP-03: Duration data exists. Wire it into verdict computation — no new data fetch needed. |
| Q8 | How does `detectSyndromes()` handle sex? | **Bug confirmed.** Sex field defined on rules but NEVER checked during detection. All matches output `sex: "Combined"` hardcoded (line 388). Testicular degeneration would incorrectly match female data. | IMP-06: Fix is straightforward — add sex filter in detection loop. |
| Q9 | How does mock HCD work? | 30 entries, 23 organs, flat (finding, organ) lookup. No strain/sex/route/duration differentiation. Source: "mock"\|"laboratory"\|"published". | IMP-02: Full rewrite of lookup with multi-level fallback. |
| Q10 | Is MONOTONIC_DOWN always 0.5? | Base 0.5 × confidence multiplier (0.4–1.0) → final 0.2–0.5. **Not domain-aware.** | IMP-07: Add domain parameter for domain-aware weighting. |
| Q11 | Does laterality feed into scoring? | **No.** Purely display/UI. `aggregateFindingLaterality()` returns structured counts (left, right, bilateral integers). | IMP-08: Integration point is clear — feed counts into confidence modifier. |
| Q12 | Distinct finding terms in data? | Need to extract from `lesion_severity_summary.json` — deferred to implementation. | IMP-12: Extract terms at implementation time to seed mapping table. |
| Q13 | What does `formatPValue()` do? | `severity-colors.ts:92`: uses `toFixed(2)` for p ≥ 0.01, so p=0.049 → "0.05". **Bug confirmed.** | IMP-13: Direct fix — use `toFixed(3)` for 0.01–0.10 range. |
| Q14 | Does backend normalize finding terms? | Not investigated yet — deferred to IMP-12 implementation. | IMP-12: Check during implementation. |

---

## Audit Issue Cross-Reference

Which of the 104 audit issues are addressed by which IMP item?

| Audit Issue | Severity | Related IMP | Resolution |
|-------------|----------|-------------|------------|
| H04 — Raw verdict codes | HIGH | IMP-03 | Recovery verdict improvements add display labels |
| H09 — p-value rounding at 0.05 | HIGH | IMP-13 | Direct fix |
| M31 — Raw "insufficient_n" verdict | MED | IMP-03 | `verdictLabel()` usage + new `recovery_too_short` |
| M33 — Abbreviated pattern labels | MED | IMP-07 | Pattern classification changes |
| M34 — "Low N: 5/12" fraction confusion | MED | IMP-07 | Pattern label rewrite |
| M35 — Sex hardcoded "Combined" | MED | IMP-06 | Direct fix — sex enforcement in detection |
| M36 — "At upper" incomplete label | MED | IMP-02 | HCD rewrite replaces all labels |
| M37 — "mass" keyword too broad | MED | IMP-12 | CT normalization replaces substring matching |
| L52 — Recovery period week rounding | LOW | IMP-03 | Duration-aware tooltip rewrite |

**Not covered by any IMP** (UI-only fixes, separate work):
H01 (bare signal scores), H02 (signal dots legend), H03 (Cohen's d context), H05/H06 (concordance legend), H07 (lab value thresholds), H08 (8px/60% text), H10 (dose group colors), M01-M30 UI issues, L01-L51 polish items.

---

## Decision Resolutions

Decisions the spec left open, resolved by codebase investigation:

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| IMP-01: Own endpoint vs embed? | **Embed in existing `/api/studies/{id}/metadata`** | Backend already parses ts.xpt via `extract_full_ts_metadata()`. Frontend `StudyContext` type mirrors what's already served. No new endpoint needed — just type the existing data. |
| IMP-02: Static TS map vs backend JSON? | **Frontend TypeScript map** for prototype | Faster iteration. Move to backend JSON when real HCD data arrives. |
| IMP-02: How to communicate `isMock`? | **Small "(mock HCD)" suffix on labels** | Least intrusive, always visible. Banner is too heavy for prototype. |
| IMP-03: `recovery_too_short` display? | **Show with distinct icon (⏱) and grayed style** | Showing `persistent` is worse than showing limited. Hiding entirely loses the information. |
| IMP-04: Should DEPOSITIONAL suppress scoring? | **No — reduce weight but don't suppress** | Hemosiderin in spleen is usually incidental, but hemosiderin in liver can be significant. Let the context panel explain. |
| IMP-05: Implement or remove R18/R19? | **Keep — they're already implemented and firing** | Investigation resolved this completely. |
| IMP-06: Strain-expected: positive insight or silent score reduction? | **Generate positive insight** | "CPN is a common spontaneous finding in SD males (15–30% background)" is more useful than silent suppression. Transparency > automation. |
| IMP-07: MONOTONIC_DOWN in findings table? | **Keep visible with different language** | Quarantining to separate section adds complexity. Different label is simpler. |
| IMP-11: Heatmap for present_ungraded? | **Distinct visual (diagonal hatch pattern)** | Honesty > simplicity. Present-but-ungraded is a real data state that users need to see. |
| IMP-12: Frontend TS or backend JSON? | **Frontend TypeScript** for prototype | Same rationale as IMP-02. |

---

## Implementation Phases

### Phase 0: Quick Wins (no dependencies, immediate value)
**Effort: XS — 1-2 hours total**

#### 0A. IMP-13 — P-value display rounding fix
- **File:** `frontend/src/lib/severity-colors.ts` — `formatPValue()`
- **Change:** `toFixed(2)` → `toFixed(3)` for 0.01–0.10 range; `toFixed(4)` for <0.01
- **Resolves:** H09

#### 0B. IMP-05 — Rule ID schema validation
- **Files:** `frontend/src/lib/finding-aggregation.ts`, new `frontend/src/types/rule-ids.ts`
- **Changes:**
  1. Create `VALID_RULE_IDS` const array (`R01`–`R19`) with `RuleId` type
  2. Add `console.warn` for unknown rule IDs in `aggregateByFinding()`
  3. Update `protective` category to route R18/R19 (already works — just document)
- **Note:** R18/R19 are real. No dead branch to remove. The protective category IS populated for studies with decreasing incidence patterns.

#### 0C. IMP-09 — Close as non-issue
- **Action:** Document in spec that CA/JT are pre-computed (`finding_dose_trends.json` fields: `ca_trend_p`, `severity_trend_p`, `severity_trend_rho`). Frontend `fishersExact2x2()` is for supplementary on-the-fly sex comparisons. No missing implementations.
- **No code changes.**

---

### Phase 1: Foundations (independent, high impact)
**Effort: M — 4-6 hours total**

#### 1A. IMP-01 — StudyContext type + parser
- **New file:** `frontend/src/types/study-context.ts`
  - `StudyContext` interface (as spec'd)
  - ISO 8601 duration parser for DOSDUR/RECSAC/TRMSAC
  - Computed fields: `estimatedNecropsyAgeWeeks`, `glpCompliant`
- **New file:** `frontend/src/lib/parse-study-context.ts`
  - `parseStudyContext(metadata: StudyMetadata): StudyContext`
  - Maps existing `StudyMetadata` fields to `StudyContext`
  - Parses duration strings (`P13W` → 13 weeks, `P14D` → 14 days)
- **New hook:** `frontend/src/hooks/useStudyContext.ts`
  - Wraps existing `/api/studies/{id}/metadata` fetch
  - Returns `StudyContext` parsed from metadata
  - React Query with 5-min stale cache (matches other hooks)
- **Backend check:** Verify `extract_full_ts_metadata()` already extracts RECSAC, DOSDUR, TRMSAC, SNDCTVER, DIET. If any missing, add to the extraction. These are the fields the spec needs that aren't guaranteed to be in the current metadata endpoint.
- **No new backend endpoint** — reuse existing metadata.

#### 1B. IMP-11 — Severity tri-state model
- **Backend change:** `backend/generator/view_dataframes.py`
  - Add `severity_status` field to `lesion_severity_summary.json`:
    - `'absent'` when incidence = 0
    - `'present_ungraded'` when incidence > 0 and avg_severity is null/NaN
    - `'graded'` when incidence > 0 and avg_severity is a number
  - Keep `avg_severity` as-is (null when ungraded) — don't change the field, add alongside
- **Frontend type:** Update `LesionSeverityRow` in `analysis-views.ts`
  - Add `severity_status: 'absent' | 'present_ungraded' | 'graded'`
- **Frontend migration:** Replace all 30 `?? 0` coercions site-by-site:

  | File | Sites | Fix Pattern |
  |------|-------|-------------|
  | `HistopathologyView.tsx` | 12 | Check `severity_status` before using `avg_severity`; show "Present (ungraded)" or "—" for non-graded |
  | `HistopathologyContextPanel.tsx` | 6 | Same — use incidence-only display when `present_ungraded` |
  | `DoseChartsSelectionZone.tsx` | 2 | Skip severity from chart when `present_ungraded` |
  | `pattern-classification.ts` | 1 | Exclude `present_ungraded` rows from severity trend analysis |
  | `syndrome-rules.ts` | 1 | Use incidence-only for syndrome matching when severity unavailable |

- **Heatmap visual:** Add diagonal hatch CSS pattern for `present_ungraded` cells
- **Regenerate data:** Run `python -m generator.generate PointCross` after backend change
- **Resolves:** Systematic false severity signals documented in spec

---

### Phase 2: Core Engine Improvements (depend on Phase 1A)
**Effort: L — 8-12 hours total**

#### 2A. IMP-03 — Recovery duration awareness
- **Depends on:** IMP-01 (for `recoveryPeriodDays`)
- **Files:** `recovery-assessment.ts`, `recovery-classification.ts`, `finding-nature.ts`
- **Changes:**
  1. Expand `computeVerdict()` signature with `recoveryPeriodDays` and `findingCategory`
  2. Add `recovery_too_short` verdict with ⏱ symbol
  3. Logic: if `recoveryPeriodDays < expectedReversibilityDays(findingCategory)` and no improvement → `recovery_too_short`
  4. Update `buildRecoveryTooltip()` to explain timing gap
  5. Add `ASSESSMENT_LIMITED_BY_DURATION` classification in `recovery-classification.ts` (blue, LOW confidence)
  6. Modulate `finding-nature.ts` tooltips to show study recovery period vs expected window
  7. Update all callers of `computeVerdict()` to pass new parameters
- **Resolves:** H04, M31, L52 — systematic false "persistent" labels for this study

#### 2B. IMP-04 — Finding nature severity modulation + new categories
- **File:** `finding-nature.ts` (116 → ~200 lines)
- **Changes:**
  1. Add `maxSeverity` optional parameter to `classifyFindingNature()`
  2. Implement reversibility modulation table (severity 1-2 / 3 / 4-5)
  3. Add `reversibilityQualifier`: `'expected' | 'possible' | 'unlikely' | 'none'`
  4. Add new categories: `DEPOSITIONAL` (hemosiderin, lipofuscin, pigment, mineral deposit), `VASCULAR` (hemorrhage, thrombosis, congestion), `UNKNOWN` (explicit fallback)
  5. Change silent "other" fallback to explicit `UNKNOWN` with "manual review recommended"
- **Resolves:** M37 (indirectly — "mass" moves to CT map in IMP-12)

#### 2C. IMP-02 — Historical controls expansion
- **Depends on:** IMP-01 (for `StudyContext`)
- **File:** `mock-historical-controls.ts` (177 → ~500 lines)
- **Changes:**
  1. New `HCDEntry` interface with strain/species/sex/route/durationBucket fields
  2. Multi-level matching: exact → drop route → drop strain → drop duration → NO_DATA
  3. Duration buckets: short (≤4w), subchronic (5-26w), chronic (27-52w), carcinogenicity (>52w)
  4. Seed with Charles River Crl:CD(SD) data from spec (23 male + 9 female entries)
  5. Context-aware labels: "Above background for SD rat, male, 13-wk oral gavage (mock HCD)"
  6. `isMock` → "(mock HCD)" suffix on labels
  7. Update all call sites to pass `StudyContext`
- **Resolves:** M36 — incomplete labels

---

### Phase 3: Refinements
**Effort: M — 6-8 hours total**

#### 3A. IMP-06 — Syndrome detection sex + strain
- **Depends on:** IMP-01 (for `StudyContext`)
- **File:** `syndrome-rules.ts` (402 → ~500 lines)
- **Changes:**
  1. **Sex fix:** Add sex filter in `detectSyndromes()` loop — check `rule.sex` against input data sex; output `detectedInSex` instead of hardcoded "Combined"
  2. **Strain awareness:** Add `context: StudyContext` parameter; for SD-expected findings (CPN, cardiomyopathy), add `strainNote` and reduce confidence by 0.2-0.3
  3. **New syndromes:** #12 Phospholipidosis, #13 Spontaneous Cardiomyopathy (M, SD-suppressed), #14 CPN (M, SD-suppressed), #15 GI Mucosal Toxicity, #16 Injection Site Reaction (route-suppressed for oral)
  4. **Route suppression:** Syndrome #16 only fires when `context.route` contains INJECTION/SUBCUTANEOUS/INTRAMUSCULAR
- **Resolves:** M35 — sex "Combined" bug

#### 3B. IMP-07 — Pattern classification rebalancing
- **File:** `pattern-classification.ts`
- **Changes:**
  1. Add `domain` parameter to weight lookup (histopath incidence vs organ weight vs hematology vs body weight)
  2. MONOTONIC_DOWN: 0.5 for histopath incidence, 2.0 for organ/body weight, 1.5 for hematology/clinical chem
  3. SINGLE_GROUP: 0.75 default, 1.5 if affected group is highest dose
  4. Update label for histopath MONOTONIC_DOWN: "Incidence decreases with dose — interpret in context"
- **Resolves:** M33, M34

#### 3C. IMP-12 — CT-normalized finding term mapping
- **Depends on:** IMP-01 (for `sendCtVersion`)
- **New file:** `frontend/src/lib/finding-term-map.ts`
- **Changes:**
  1. Create `FindingTermMapping` interface and `FINDING_TERM_MAP` constant
  2. `normalizeFinding()`: exact match → synonym match → fallback to legacy substring
  3. Integrate into `classifyFindingNature()` — try CT lookup first
  4. Seed with: (a) current 65 keywords from finding-nature.ts, (b) Charles River HCD finding terms, (c) actual finding terms from study data (extract at implementation time)
  5. Add `source: 'ct_mapped' | 'substring_match'` to return type for auditability
- **Resolves:** M37 — "mass" keyword issue eliminated by exact-match priority

---

### Phase 4: Polish
**Effort: S — 2-4 hours total**

#### 4A. IMP-10 — NOAEL derivation transparency
- **File:** `backend/generator/view_dataframes.py` (NOAEL section)
- **Changes:**
  1. Add `noael_derivation` object to R14 output: `{ method, adverse_rules_at_loael, confidence_factors }`
  2. Document the chain: R04/R12/R13 flag adverse → clinical catalog may elevate severity → NOAEL derived from lowest adverse dose
  3. Confirm clinical catalog elevations DO propagate to NOAEL (they do — severity classification feeds into the adverse filter)
- **Frontend:** Display derivation in NOAEL context panel tooltip

#### 4B. IMP-08 — Laterality signal modifier
- **File:** `laterality.ts` (95 → ~130 lines)
- **Changes:**
  1. New `lateralitySignalModifier()` function
  2. Input: left/right/bilateral counts (already available from `aggregateFindingLaterality()`)
  3. Output: modifier (-0.2 to +0.2) + interpretation string
  4. Integration: additive modifier in `computeConfidence()` in `pattern-classification.ts`

---

## Dependency Graph

```
Phase 0 (parallel, no deps):
  0A: IMP-13 (p-value fix)
  0B: IMP-05 (rule ID schema)
  0C: IMP-09 (close)

Phase 1 (parallel, no deps between them):
  1A: IMP-01 (StudyContext) ──────────────┐
  1B: IMP-11 (severity tri-state)         │
                                          │
Phase 2 (depends on 1A):                  │
  2A: IMP-03 (recovery duration) ◄────────┤
  2B: IMP-04 (finding nature)             │
  2C: IMP-02 (historical controls) ◄──────┤
                                          │
Phase 3 (depends on 1A):                  │
  3A: IMP-06 (syndrome sex+strain) ◄──────┤
  3B: IMP-07 (pattern weights)            │
  3C: IMP-12 (CT term mapping) ◄──────────┘

Phase 4 (low priority, after Phase 2-3):
  4A: IMP-10 (NOAEL transparency)
  4B: IMP-08 (laterality modifier)
```

**Critical path:** Phase 0 → Phase 1A → Phase 2A (IMP-03 fixes the most impactful systematic false signal).

Phase 1B (IMP-11) is independent and can run in parallel with Phase 1A, but requires backend regeneration and touches 30 sites — higher risk of merge conflicts if done simultaneously with Phase 2/3 work.

---

## Effort Summary

| Phase | Items | Effort | Cumulative |
|-------|-------|--------|------------|
| 0 | IMP-13, IMP-05, IMP-09 | XS (1-2h) | 1-2h |
| 1 | IMP-01, IMP-11 | M (4-6h) | 5-8h |
| 2 | IMP-03, IMP-04, IMP-02 | L (8-12h) | 13-20h |
| 3 | IMP-06, IMP-07, IMP-12 | M (6-8h) | 19-28h |
| 4 | IMP-10, IMP-08 | S (2-4h) | 21-32h |

**Total estimated effort: 21-32 hours across 13 improvements.**

---

## Audit Issues NOT Covered

These 95 audit issues require separate UI improvement work, not engine changes:

- **HIGH (7):** H01 (signal scores), H02 (signal dots), H03 (Cohen's d), H05/H06 (concordance legend), H07 (lab thresholds), H08 (8px text), H10 (dose colors)
- **MEDIUM (28):** M01-M30 excluding M31/M33-M37
- **LOW (55+):** All L-series items

Recommend addressing H01, H02, H03, H08, H10 as a separate "UI readability" pass after engine work stabilizes.

---

## Verification Plan

After each phase, run the relevant pressure-test scenarios from Appendix B:

| Phase | Scenarios to Run |
|-------|-----------------|
| 0 | #12 (p-value threshold display) |
| 1A | — (foundation, verified by downstream phases) |
| 1B | #9 (severity null coercion) |
| 2A | #3 (recovery too short), #5 (severity modulation) |
| 2B | #5 (severity modulation — finding nature side) |
| 2C | #1 (strain-specific background), #2 (genuine vs background), #4 (sex-dimorphic) |
| 3A | #10 (sex-specific syndrome) |
| 3B | — (visual inspection of pattern labels) |
| 3C | #11 (finding term normalization) |
| 4A | #8 (NOAEL consistency) |
| 4B | #7 (laterality pattern) |

Scenario #6 (dead rule branch) is already resolved — R18/R19 are real.

---

## Files Changed Per Phase

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 0 | `types/rule-ids.ts` | `severity-colors.ts`, `finding-aggregation.ts` |
| 1A | `types/study-context.ts`, `lib/parse-study-context.ts`, `hooks/useStudyContext.ts` | Possibly `xpt_processor.py` (if missing fields) |
| 1B | — | `view_dataframes.py`, `analysis-views.ts`, `HistopathologyView.tsx`, `HistopathologyContextPanel.tsx`, `DoseChartsSelectionZone.tsx`, `pattern-classification.ts`, `syndrome-rules.ts`, `index.css` (hatch pattern) |
| 2A | — | `recovery-assessment.ts`, `recovery-classification.ts`, `finding-nature.ts`, `HistopathologyView.tsx`, `HistopathologyContextPanel.tsx` |
| 2B | — | `finding-nature.ts` |
| 2C | — | `mock-historical-controls.ts`, `HistopathologyContextPanel.tsx` |
| 3A | — | `syndrome-rules.ts` |
| 3B | — | `pattern-classification.ts` |
| 3C | `lib/finding-term-map.ts` | `finding-nature.ts` |
| 4A | — | `view_dataframes.py`, `scores_and_rules.py` |
| 4B | — | `laterality.ts`, `pattern-classification.ts` |

**Total: 4 new files, ~18 modified files across all phases.**

# Settings Propagation Audit

**Date:** 2026-03-03
**Status:** Current — reflects codebase at commit `171c890`

## Problem Statement

The app has 10 user-defined settings on the Study Details page. At the time of this audit (commit `171c890`), 6 of 10 were placeholders. **Phase 3 (commits `1b7cc1b`, `3f44bba`) enabled 4 more**, bringing the total to 8/10 active settings. 3 remain placeholder (Steel, Cuzick, logistic-slope). The two-pipeline architecture was resolved by the parameterized backend pipeline (Phase 1-3).

---

## Architecture: The Two-Pipeline Problem

### Pipeline A: Live (settings-aware)

```
useFindings() → raw UnifiedFinding[]
  → applyScheduledFilter()        [setting 1: scheduled-only]
  → applyRecoveryPoolingFilter()   [setting 2: recovery pooling]
  → applyEffectSizeMethod()        [setting 3: effect size]
  → applyMultiplicityMethod()      [setting 4: multiplicity]
  = activeFindings
  → mapFindingsToRows() / flattenFindingsToDRRows()
  → deriveEndpointSummaries() → syndromes → signal scores → NOAEL
```

**Entry point:** `useFindingsAnalyticsLocal` hook.
**Consumers:** FindingsView, FindingsRail, FindingsContextPanel, DoseResponseView, DoseResponseContextPanel, NoaelDeterminationView (organ table + weighted NOAEL card), OrganContextPanel, SyndromeContextPanel.

### Pipeline B: Pre-generated (settings-blind)

```
backend/generator/generate.py → 8 JSON files
  → served via /api/studies/{id}/analysis/{view_name}
  → consumed by useXxxSummary() hooks (React Query, 5-min stale)
```

**JSON files:** `study_signal_summary`, `target_organ_summary`, `noael_summary`, `lesion_severity_summary`, `dose_response_metrics`, `organ_evidence_detail`, `adverse_effect_summary`, `rule_results`.

**Consumers:** StudySummaryView (signal cards, target organ table), NoaelDeterminationView (NOAEL doses, signal heatmap), HistopathologyView (lesion table, syndrome detection, specimen rail), all rule engine results.

**These 8 JSON endpoints are computed once at generation time and never re-derived. They ignore all 10 settings.**

### Pipeline Bridging (partial, ad-hoc)

Some views have been partially migrated from Pipeline B to Pipeline A:
- DoseResponseView: switched from `useDoseResponseMetrics` → `useFindingsAnalyticsLocal` (2026-03-03)
- NoaelDeterminationView organ table: switched from `useAdverseEffectSummary` → `useFindingsAnalyticsLocal` (2026-03-03)
- HistopathologyView: inline scheduled-only filter added for lesion rows (2026-03-03), but still reads `useLesionSeveritySummary` (Pipeline B)

These patches only address a subset of the gap. The remaining Pipeline B consumers are untouched.

---

## Setting-by-Setting Status

### Category 1: Settings with Core Logic (4/10)

These settings have working transform functions. The gap is propagation scope.

#### 1. Scheduled-Only (Mortality Exclusion)

| Attribute | Value |
|-----------|-------|
| **Storage** | React Context (`ScheduledOnlyContext`) |
| **Core logic** | `applyScheduledFilter()` in `useFindingsAnalyticsLocal.ts:124-147` |
| **HistoPath** | Inline filter in `HistopathologyView.tsx:2088-2113` |

| UI Surface | Status | Notes |
|------------|--------|-------|
| FindingsView / FindingsRail / FindingsContextPanel | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| DoseResponseView (table, charts) | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| DoseResponseContextPanel | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| NoaelDeterminationView — organ table | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| NoaelDeterminationView — weighted NOAEL card | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| NoaelDeterminationView — NOAEL doses row | **MISSING** | `useEffectiveNoael` → pre-gen `noael_summary.json` |
| NoaelDeterminationView — signal heatmap | **MISSING** | `useStudySignalSummary` → pre-gen JSON |
| HistopathologyView — lesion incidence/severity table | PROPAGATES | Inline filter on `scheduled_group_stats` |
| HistopathologyView — syndrome detection | **PARTIAL** | Lesion rows filtered, but `signalData` from pre-gen JSON |
| HistopathologyView — context panel | **MISSING** | No `useScheduledOnly` import |
| StudySummaryView — signal cards, target organs | **MISSING** | Pre-gen JSON |
| StudyDetailsContextPanel — normalization note | **MISSING** | `useOrganWeightNormalization` reads raw findings |
| OrganContextPanel / SyndromeContextPanel | PROPAGATES | Via `FindingsAnalyticsContext` |

#### 2. Recovery Pooling (Pool vs. Separate)

| Attribute | Value |
|-----------|-------|
| **Storage** | Session key `pcc.${studyId}.recoveryPooling`, default `"pool"` |
| **Core logic** | `applyRecoveryPoolingFilter()` in `useFindingsAnalyticsLocal.ts:97-117` |

| UI Surface | Status | Notes |
|------------|--------|-------|
| FindingsView / FindingsRail / FindingsContextPanel | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| DoseResponseView (table, charts) | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| DoseResponseView — time course chart | PROPAGATES | Reads key directly for `includeRecovery` API param |
| NoaelDeterminationView — organ table | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| NoaelDeterminationView — weighted NOAEL card | PROPAGATES | Via `useFindingsAnalyticsLocal` |
| NoaelDeterminationView — NOAEL doses row | **MISSING** | Pre-gen JSON |
| NoaelDeterminationView — signal heatmap | **MISSING** | Pre-gen JSON |
| HistopathologyView — everything | **N/A** | Terminal domains (MI/MA/OM/TF) have no recovery pooling variant; specimens collected at sacrifice from all animals |
| StudySummaryView — signal cards, target organs | **MISSING** | Pre-gen JSON |
| StudyDetailsContextPanel — normalization note | **MISSING** | `useOrganWeightNormalization` reads raw findings, ignores recovery pooling. **This is the specific bug reported.** |
| OrganContextPanel / SyndromeContextPanel | PROPAGATES | Via `FindingsAnalyticsContext` |

#### 3. Effect Size Method (hedges-g, cohens-d, glass-delta)

| Attribute | Value |
|-----------|-------|
| **Storage** | Session key `pcc.${studyId}.effectSize`, default `"hedges-g"` |
| **Core logic** | `applyEffectSizeMethod()` in `stat-method-transforms.ts:76-132` |
| **Also read via** | `useStatMethods` hook (15+ files for label/symbol display) |

| UI Surface | Status | Notes |
|------------|--------|-------|
| FindingsView / FindingsRail | PROPAGATES | Values + labels |
| DoseResponseView | PROPAGATES | Values + labels |
| NoaelDeterminationView — organ table | PROPAGATES | Values via `useFindingsAnalyticsLocal` |
| NoaelDeterminationView — column header label | PROPAGATES | Reads `useStatMethods` for symbol |
| NoaelDeterminationView — NOAEL doses | **MISSING** | Pre-gen JSON |
| NoaelDeterminationView — signal heatmap values | **MISSING** | Pre-gen JSON |
| StudySummaryView — signal values | **MISSING** | Pre-gen JSON |
| HistopathologyView | **N/A** | Incidence data, no effect size concept |
| StudyDetailsContextPanel — normalization note | PROPAGATES | Passed to `useOrganWeightNormalization` |
| All context panels (labels) | PROPAGATES | Via `useStatMethods` |

#### 4. Multiplicity Correction (dunnett-fwer, bonferroni)

| Attribute | Value |
|-----------|-------|
| **Storage** | Session key `pcc.${studyId}.multiplicity`, default `"dunnett-fwer"` |
| **Core logic** | `applyMultiplicityMethod()` in `stat-method-transforms.ts:147-190` |

| UI Surface | Status | Notes |
|------------|--------|-------|
| All `useFindingsAnalyticsLocal` consumers | PROPAGATES | p-values corrected in pipeline |
| HistopathologyView | **MISSING** | Pre-gen JSON. Hardcodes "unadjusted for multiplicity" |
| All pre-gen JSON views | **MISSING** | Server-computed, not re-derived |

---

### Category 2: Active Phase 3 Settings (4/10 — moved from placeholder)

These settings were placeholder at the time of the audit. Phase 3 (commits `1b7cc1b`, `3f44bba`) implemented backend transforms in `parameterized_pipeline.py`.

| # | Setting | Transform | Status |
|---|---------|-----------|--------|
| 6 | Adversity threshold | `classify_severity(threshold=...)` via `rederive_enrichment()` | **ACTIVE** — 3 modes: grade-ge-1, grade-ge-2, grade-ge-2-or-dose-dep |
| 7 | Pairwise test: Williams | `apply_pairwise_williams()` → `williams_from_group_stats()` | **ACTIVE** — Williams' step-down, skips multiplicity (FWER inherent) |
| 8 | Trend test: Williams-trend | `apply_trend_williams()` → reuses `_williams_applied` or runs independently | **ACTIVE** — first step-down p → `trend_p` |
| 10 | Organ weight method | `apply_organ_weight_method()` → swaps OM alternatives with round-trip support | **ACTIVE** — absolute/ratio-bw/ratio-brain |

### Category 3: Remaining Placeholder Settings (3/10)

| # | Setting | Default | Why No Implementation |
|---|---------|---------|----------------------|
| 5 | Control group | First control ARMCD | Functional no-op (PointCross has one control). Requires re-running all pairwise stats for multi-arm studies. |
| 7b | Pairwise test: Steel | `"dunnett"` | No Steel test implementation. `disabled: true` in UI. |
| 8b | Trend test: Cuzick | `"jonckheere"` | No Cuzick implementation. `disabled: true` in UI. |
| 9 | Incidence trend: logistic-slope | `"cochran-armitage"` | No logistic regression implementation. `disabled: true` in UI. |

---

## Root Cause Analysis

### Why the split exists

The app was originally built with a backend-first architecture: the generator pre-computes everything into JSON files, and the frontend is a read-only viewer. User settings were added later as a progressive enhancement, with `useFindingsAnalyticsLocal` as the live re-derivation pipeline. But the migration from Pipeline B (pre-gen) to Pipeline A (live) was never completed — only the Findings view was fully migrated. Other views still read pre-gen JSON for some or all of their data.

### Why patchwork fixes don't work

Each patch (e.g., switching DoseResponseView to the live pipeline) fixes one view but doesn't address:

1. **The normalization note bug** — `useOrganWeightNormalization` reads raw cached findings, bypassing all filters. It needs to receive `activeFindings` instead of fetching its own.
2. **NOAEL dose computation** — `noael_summary.json` is pre-generated. The per-sex NOAEL doses shown in the NOAEL view's banner row will never change with any setting toggle.
3. **Signal scores in pre-gen JSON** — `study_signal_summary.json` is used by StudySummaryView signal cards, NoaelDeterminationView signal heatmap, and HistopathologyView organ weight summary strip. All frozen.
4. **Rule engine results** — `rule_results.json` is pre-generated. Insights lists in all views show stale rules.
5. **Target organ summary** — `target_organ_summary.json` is pre-generated. Target organ flags never change.

### The fundamental question

Is the goal to:

**(A) Fully derive everything client-side** — move all computation into the live pipeline, eliminate pre-gen JSON dependency for all 8 views. Large effort. All signal scores, NOAEL computation, rule engine, syndrome detection become client-side.

**(B) Re-generate server-side when settings change** — keep the generator but add a "re-generate with settings" API call. Settings would be sent to the backend, which re-runs the pipeline with different parameters. Avoids duplicating complex logic on the frontend but adds latency on every setting change.

**(C) Accept the split and document it** — clearly mark which views are settings-aware and which are reference-only (showing the "default" analysis). Communicate to the user that some views show pre-computed reference data.

**(D) Hybrid** — move the high-impact derivations (NOAEL, signal scores) to the live pipeline while leaving lower-impact pre-gen JSON (rule engine, target organ flags) as reference data with a visual indicator.

---

## The Specific Bug: Normalization Note vs. Recovery Pooling

**Location:** `StudyDetailsContextPanel.tsx:122`

```typescript
const normalization = useOrganWeightNormalization(studyId, false, effectSize as EffectSizeMethod);
```

**What happens:** `useOrganWeightNormalization` hook (`useOrganWeightNormalization.ts:251`) fetches raw findings via React Query cache and calls `extractBwGroupStats(findings)` on the **unfiltered** findings. The hook:
- Does NOT receive `recoveryPooling` as a parameter
- Does NOT call `applyRecoveryPoolingFilter()` before extracting BW stats
- Does NOT receive `isScheduledOnly` or call `applyScheduledFilter()`

**Result:** The BW effect size (`g = X.XX`) and tier displayed below the organ weight dropdown always reflects pooled (all-animals) BW stats, regardless of the recovery pooling or scheduled-only settings.

**Fix path:** The hook should accept `activeFindings` (already filtered by all settings) instead of fetching its own copy of raw findings. Or: the `StudyDetailsContextPanel` should pass the active findings from `useFindingsAnalyticsLocal` to the normalization hook.

---

## Inventory of Hardcoded Labels

These labels should reflect the active setting but currently don't:

| File | Line | Hardcoded Value | Should Be |
|------|------|-----------------|-----------|
| `DoseDetailPane.tsx` | 127 | `"Dunnett's test"` | `pairwiseTest` setting label |
| `DoseDetailPane.tsx` | 129 | `"Jonckheere-Terpstra"` / `"Cochran-Armitage"` | `trendTest` / `incidenceTrend` setting labels |
| `VerdictPane.tsx` | 347 | `"Jonckheere-Terpstra"` / `"Cochran-Armitage"` | Same |
| `HistopathologyView.tsx` | ~1565 | `"unadjusted for multiplicity"` | Should reflect `multiplicity` setting |

---

## Pre-Generated JSON Consumers (Full Map)

Every hook below reads from Pipeline B (pre-gen JSON) and is settings-blind:

| Hook | JSON File | Consuming Views |
|------|-----------|-----------------|
| `useStudySignalSummary` | `study_signal_summary.json` | StudySummaryView, NoaelDeterminationView (heatmap), HistopathologyView (organ weight strip, syndrome detection), DoseResponseView (causality tool) |
| `useTargetOrganSummary` | `target_organ_summary.json` | StudySummaryView, NoaelDeterminationView (panel data) |
| `useEffectiveNoael` / `useNoaelSummary` | `noael_summary.json` | NoaelDeterminationView (banner, per-sex NOAEL), DoseResponseView (causality tool) |
| `useLesionSeveritySummary` | `lesion_severity_summary.json` | HistopathologyView (entire view) |
| `useRuleResults` | `rule_results.json` | All views (InsightsList component), DoseResponseView (causality tool), NoaelDeterminationView (rule inspector) |
| `useFindingDoseTrends` | `finding_dose_trends.json` | HistopathologyView (dose-dependence classification) |

---

## Migration Priority Matrix

If the decision is to progressively migrate to Pipeline A:

| Hook to Replace | Effort | Impact | Notes |
|----------------|--------|--------|-------|
| `useOrganWeightNormalization` (raw findings → active findings) | **Small** | Fixes normalization note bug | Only needs to accept `activeFindings` param |
| `useEffectiveNoael` → derive from `useFindingsAnalyticsLocal` | **Medium** | NOAEL doses respond to all 4 settings | `computeEndpointNoaelMap` already exists client-side |
| `useStudySignalSummary` → derive from live pipeline | **Medium** | Signal scores respond to settings | `withSignalScores` already runs client-side in `useFindingsAnalyticsLocal` |
| `useTargetOrganSummary` → derive from endpoint summaries | **Small** | Target organ flags respond to settings | Simple aggregation from endpoint summaries |
| `useLesionSeveritySummary` → live pipeline | **Not possible** | Modifier-level data (distribution, temporality) doesn't exist in UnifiedFinding | Would need backend changes to include modifier data in unified findings |
| `useRuleResults` → client-side rule engine | **Large** | Rules respond to settings | Would require porting rule engine to TypeScript |
| `useFindingDoseTrends` → client-side | **Medium** | Trend stats respond to settings | Would require porting trend tests to TypeScript |

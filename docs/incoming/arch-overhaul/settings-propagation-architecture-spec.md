# Settings Propagation: Architecture Spec

**Date:** 2026-03-03
**Status:** Phases 1-3 complete (commits `30f0e9a`, `305d413`, `2c436e3`, `1b7cc1b`, `3f44bba`). Phase 4 (cache warming) not started.
**Input:** `settings-propagation-audit.md` (commit `171c890`)

---

## Executive Summary

The settings propagation problem is caused by having two independent data pipelines that answer the same question with different inputs. The fix is not to make the frontend pipeline bigger — it is to eliminate it. The backend already has all the logic, all the data, and all the statistical implementations. Parameterize it by settings, cache the results, and turn the frontend into a pure presentation layer.

---

## Why the Client-Side Migration Approach Is Wrong

The alternative proposal — expanding `useFindingsAnalyticsLocal` to compute NOAEL, signal scores, target organ flags, and potentially the rule engine and trend statistics client-side — solves the propagation gaps but creates worse problems.

### 1. It enshrines logic duplication as the permanent architecture

The backend generator (`generate.py`) still exists and still has NOAEL computation, signal scoring, the rule engine, and trend statistics. The client-side approach rewrites ~830 LOC of that in TypeScript so the frontend can independently derive the same results. Now there are two implementations of the same analytical logic in two languages.

When a pharma customer says "your Hedges' g calculation doesn't match our internal validation" — which implementation do you fix? Both? How do you prove they stay in sync? For a platform selling analytical rigor to life sciences companies, dual implementations of statistical methods is a liability.

### 2. It doesn't solve the 6 placeholder settings

The audit lists 6 settings with zero implementation: control group selection, adversity threshold, pairwise test, trend test, incidence trend, organ weight method. These are placeholders because the frontend *can't* implement them:

- **Control group selection** requires re-running all pairwise statistics against a different reference group. The backend hardcodes `dose_level === 0`; the frontend does too (`stat-method-transforms.ts:88`). Changing this requires the full statistical pipeline, not a filter function.
- **Adversity threshold** requires a classification engine that only exists in `findings_pipeline.py`.
- **Williams test, Steel test, logistic regression** are disabled in the UI because no JavaScript implementation exists. They exist in Python (scipy).

The client-side approach leaves these 6 settings as permanent placeholders, or requires porting even more backend logic to TypeScript, deepening the duplication.

### 3. The `UnifiedFinding` data model is a bottleneck

The audit identifies that `useLesionSeveritySummary` can't move to Pipeline A because modifier-level enrichment data (distribution, temporality, SUPP qualifiers) isn't in `UnifiedFinding`. This is a symptom: every time the backend has richer data than what the frontend data model carries, the client-side pipeline hits a wall. In a parameterized backend pipeline, this limitation doesn't exist — computation happens where the data lives.

### 4. Consistency depends on developer discipline, not architecture

Today, consistency requires every developer to remember to use `useFindingsAnalyticsLocal` and not accidentally import a pre-gen hook. That's a convention enforced by code review. In a parameterized backend architecture, there are no pre-gen hooks to accidentally use. Every hook calls the same parameterized API. Consistency is structural.

---

## Target Architecture

### Principle

One pipeline, on the server, parameterized by settings. The frontend is a presentation layer. Pre-generated JSON becomes a cache optimization, not a separate data path.

### API Contract

Every analysis endpoint accepts the full settings tuple as query parameters:

```
GET /api/studies/{id}/analysis/{view_name}
    ?scheduled_only=true
    &recovery_pooling=pool
    &effect_size=hedges-g
    &multiplicity=dunnett-fwer
    &control_group=vehicle
    &adversity_threshold=grade-ge-2-or-dose-dep
    &pairwise_test=dunnett
    &trend_test=jonckheere
    &incidence_trend=cochran-armitage
    &organ_weight_method=absolute
```

All 10 settings are first-class parameters. The response shape is identical to the current pre-gen JSON — no frontend changes to data consumers beyond swapping the hook internals.

When parameters match the defaults, the response is served from the existing pre-generated cache (the files `generate.py` already produces). This means the common case (default settings) has zero additional latency.

### Backend Components

#### `ParameterizedAnalysisPipeline`

A class/module that takes `(study_id: str, settings: AnalysisSettings)` and returns all analysis outputs. This is NOT new logic — it is the existing generator pipeline refactored to accept settings as input parameters instead of using hardcoded defaults.

```python
@dataclass
class AnalysisSettings:
    scheduled_only: bool = False
    recovery_pooling: Literal["pool", "separate"] = "pool"
    effect_size: Literal["hedges-g", "cohens-d", "glass-delta"] = "hedges-g"
    multiplicity: Literal["dunnett-fwer", "bonferroni"] = "dunnett-fwer"
    control_group: str = "vehicle"  # ARMCD of control group
    adversity_threshold: str = "grade-ge-2-or-dose-dep"
    pairwise_test: Literal["dunnett", "williams", "steel"] = "dunnett"
    trend_test: Literal["jonckheere", "cuzick", "williams"] = "jonckheere"
    incidence_trend: Literal["cochran-armitage", "logistic"] = "cochran-armitage"
    organ_weight_method: Literal["absolute", "ratio"] = "absolute"
```

The pipeline returns a dict keyed by view name, with the same JSON shapes the current endpoints return:

```python
class PipelineResult(TypedDict):
    study_signal_summary: dict
    target_organ_summary: dict
    noael_summary: dict
    lesion_severity_summary: dict
    dose_response_metrics: dict
    organ_evidence_detail: dict
    adverse_effect_summary: dict
    rule_results: dict
```

#### Changes to existing generator

`generate.py` becomes a thin wrapper:

```python
# Before (current)
def generate_analysis(study_id):
    # 500+ lines of hardcoded pipeline
    ...
    write_json("study_signal_summary.json", signal_data)
    write_json("noael_summary.json", noael_data)
    # etc.

# After
def generate_analysis(study_id):
    pipeline = ParameterizedAnalysisPipeline(study_id)
    result = pipeline.run(AnalysisSettings())  # defaults
    for view_name, data in result.items():
        write_json(f"{view_name}.json", data)
```

Generation behavior is unchanged. The same JSON files are written at generation time with default settings.

#### Parameterization points in existing pipeline

These are the specific locations in the backend where hardcoded defaults need to become parameters:

| Setting | Current Hardcoding | Change Required |
|---------|-------------------|-----------------|
| `scheduled_only` | Findings query includes all sacrifice types | Add `WHERE sacrifice_type = 'scheduled'` filter when `True` |
| `recovery_pooling` | Groups always pooled in findings query | Add group filtering/separation logic |
| `effect_size` | Hardcoded Hedges' g in `findings_pipeline.py` | Pass method to effect size computation |
| `multiplicity` | Hardcoded Dunnett FWER | Pass method to p-value correction |
| `control_group` | `dose_level === 0` in pairwise stats | Pass ARMCD, re-run pairwise against selected control |
| `adversity_threshold` | Hardcoded classification logic in `findings_pipeline.py` | Pass threshold to adversity classifier |
| `pairwise_test` | Only Dunnett implemented | Enable Williams/Steel code paths (may already exist but be unused) |
| `trend_test` | Only Jonckheere-Terpstra | Enable Cuzick/Williams code paths |
| `incidence_trend` | Only Cochran-Armitage | Enable logistic regression code path |
| `organ_weight_method` | Always absolute | Apply ratio normalization when selected |

#### Cache layer

Results are cached by the tuple `(study_id, settings_hash)`:

```python
def get_analysis(study_id: str, settings: AnalysisSettings, view_name: str) -> dict:
    cache_key = f"{study_id}_{settings.hash()}"

    # Check file cache
    cached = read_cache(cache_key, view_name)
    if cached:
        return cached

    # Compute and cache
    pipeline = ParameterizedAnalysisPipeline(study_id)
    result = pipeline.run(settings)
    write_cache(cache_key, result)

    return result[view_name]
```

Default settings map to the existing pre-gen files (hash of defaults = the files `generate.py` already writes). Non-default combinations are computed on first request and cached for subsequent requests.

Cache invalidation: when a study is re-generated (new data upload), all cached variants for that study are cleared.

#### API endpoint

```python
@router.get("/api/studies/{study_id}/analysis/{view_name}")
def get_study_analysis(
    study_id: str,
    view_name: str,
    settings: AnalysisSettings = Depends(parse_settings_from_query),
) -> dict:
    return get_analysis(study_id, settings, view_name)
```

Single endpoint pattern. `view_name` is one of: `study_signal_summary`, `target_organ_summary`, `noael_summary`, `lesion_severity_summary`, `dose_response_metrics`, `organ_evidence_detail`, `adverse_effect_summary`, `rule_results`.

### Frontend Components

#### `StudySettingsContext`

Replaces the scattered `sessionStorage.getItem` calls. Single context holds all 10 settings for the current study:

```typescript
interface StudySettings {
  scheduledOnly: boolean;
  recoveryPooling: "pool" | "separate";
  effectSize: "hedges-g" | "cohens-d" | "glass-delta";
  multiplicity: "dunnett-fwer" | "bonferroni";
  controlGroup: string;
  adversityThreshold: string;
  pairwiseTest: "dunnett" | "williams" | "steel";
  trendTest: "jonckheere" | "cuzick" | "williams";
  incidenceTrend: "cochran-armitage" | "logistic";
  organWeightMethod: "absolute" | "ratio";
}

const StudySettingsContext = createContext<{
  settings: StudySettings;
  updateSetting: (key: keyof StudySettings, value: any) => void;
}>(/* ... */);
```

Settings changes are debounced (300ms) before triggering refetches. The context persists to sessionStorage for tab-refresh continuity, but sessionStorage is the persistence layer, not the source of truth — the context is.

#### Hook refactoring

Every `useXxxSummary` hook is refactored to pass settings as query parameters. The response shape is unchanged, so consuming components don't need modification.

```typescript
// Before
function useStudySignalSummary(studyId: string) {
  return useQuery({
    queryKey: ["study-signal-summary", studyId],
    queryFn: () =>
      fetch(`/api/studies/${studyId}/analysis/study_signal_summary`)
        .then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

// After
function useStudySignalSummary(studyId: string) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["study-signal-summary", studyId, settings],
    queryFn: () =>
      fetch(`/api/studies/${studyId}/analysis/study_signal_summary?${params}`)
        .then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true,  // Show old data while refetching
  });
}
```

The `queryKey` includes the full settings object, so React Query automatically refetches when any setting changes and caches each combination independently.

#### Elimination of frontend Pipeline A

Once all hooks read from the parameterized backend:

**Remove entirely:**

- `useFindingsAnalyticsLocal` (the entire hook)
- `applyScheduledFilter()`
- `applyRecoveryPoolingFilter()`
- `applyEffectSizeMethod()`
- `applyMultiplicityMethod()`
- `stat-method-transforms.ts` (the computation functions; keep label maps if they exist separately)
- `FindingsAnalyticsContext` provider
- All inline filters (e.g., `HistopathologyView.tsx:2088-2113` scheduled-only filter)

**Refactor:**

- `useOrganWeightNormalization` — no longer fetches raw findings. Reads from parameterized `organ_evidence_detail` or a dedicated normalization endpoint.
- `useFindings()` — still fetches raw `UnifiedFinding[]` for the FindingsView table display (the raw data browser), but is no longer the entry point for derived analytics.

**Keep but rewire:**

- `useStatMethods` — reads from `StudySettingsContext` for labels/symbols. No computation.
- All consuming views — unchanged. They still destructure the same data shapes from the same-named hooks.

#### Hardcoded labels

These become reactive reads from `StudySettingsContext`:

| File | Line | Current | Fix |
|------|------|---------|-----|
| `DoseDetailPane.tsx` | 127 | `"Dunnett's test"` | `settings.pairwiseTest` via label map |
| `DoseDetailPane.tsx` | 129 | `"Jonckheere-Terpstra"` / `"Cochran-Armitage"` | `settings.trendTest` / `settings.incidenceTrend` via label map |
| `VerdictPane.tsx` | 347 | Same | Same |
| `HistopathologyView.tsx` | ~1565 | `"unadjusted for multiplicity"` | `settings.multiplicity` via label map |

### UX for Setting Changes

When a user changes a setting:

1. Setting updates in `StudySettingsContext` (immediate).
2. 300ms debounce timer starts.
3. After debounce, React Query keys invalidate for all affected hooks.
4. Hooks refetch with new query parameters.
5. During refetch, `keepPreviousData: true` shows the previous results — no blank screens, no spinners for fast responses.
6. If the backend serves from cache (default settings, or previously-computed combination), response is near-instant. If cache miss, backend computes, caches, and returns.
7. For cache misses that take >500ms, show a subtle "recalculating..." indicator on the affected cards/tables.

For rapid toggling (user clicks multiple settings in quick succession), the 300ms debounce collapses these into a single API call with all changes applied.

---

## Migration Plan

### Phase 1: Backend parameterization

**Goal:** The backend can accept settings and return different results. No frontend changes yet.

1. Extract `ParameterizedAnalysisPipeline` from `generate.py`. This is a refactor, not a rewrite — move the pipeline logic into a class that accepts `AnalysisSettings`, with the current hardcoded values as defaults.
2. Add settings query parameter parsing to the existing `/api/studies/{id}/analysis/{view_name}` endpoint.
3. Implement the cache layer (file-based, keyed by `study_id + settings_hash`).
4. Verify: calling the endpoint with default params returns byte-identical results to the current pre-gen JSON files. This is the correctness gate — if defaults don't match, something broke in the refactor.

At this point, the backend is parameterized but the frontend still reads pre-gen JSON (which is now served through the same endpoint with default params). No user-visible change.

### Phase 2: Frontend settings plumbing

**Goal:** Frontend passes settings to the backend. All 4 existing working settings propagate to all views via the server.

1. Create `StudySettingsContext`, migrating reads from scattered `sessionStorage.getItem` calls.
2. Refactor each `useXxxSummary` hook to read settings from context and pass as query params. Do them one at a time; each is a self-contained change.
3. Remove `useFindingsAnalyticsLocal` and all frontend filtering/transform code.
4. Remove inline filters (HistopathologyView scheduled-only filter, etc.).
5. Fix hardcoded labels.

Verify per-hook: toggling each of the 4 settings updates every view that consumes the affected hook.

### Phase 3: Enable placeholder settings — COMPLETE (commit `1b7cc1b`, `3f44bba`)

**Goal:** The 6 placeholder settings become functional.

**Implemented (4 of 6):**
1. **Pairwise test: Williams** — `apply_pairwise_williams()` calls `williams_from_group_stats()`, maps step-down results to pairwise entries, preserves `cohens_d`. Williams FWER control means `apply_multiplicity_method()` is skipped when Williams is selected (prevents double-correction).
2. **Trend test: Williams-trend** — `apply_trend_williams()` reuses `_williams_applied` metadata from pairwise or runs independently. Sets `trend_p` from first step-down result.
3. **Organ weight method** (absolute/ratio-bw/ratio-brain) — `apply_organ_weight_method()` swaps OM alternative stats into primary slots, saves current primary back to alternatives for lossless round-tripping. Recomputes `min_p_adj`, `max_effect_size`.
4. **Adversity threshold** (grade-ge-1/grade-ge-2/grade-ge-2-or-dose-dep) — `classify_severity()` parameterized with `threshold` parameter. Threaded through `enrich_findings()` → `rederive_enrichment()`.

Transform order: `organ_weight_method → pairwise_williams → trend_williams → rederive_enrichment(threshold)`. Organ weight swap runs first so Williams operates on the correct metric's stats.

**Still placeholder (2 of 6):**
- **Steel pairwise test** — no implementation
- **Cuzick trend test** — no implementation
- **Logistic-slope incidence trend** — no implementation

**No-op (functional as-is):**
- **Control group** — PointCross has one control ("Vehicle"); dropdown enabled, selecting it is a no-op

### Phase 4: Cache warming (optimization)

**Goal:** Eliminate latency for common setting combinations.

1. Add analytics tracking: which setting combinations do users actually select per study?
2. At generation time, pre-compute the top N most common non-default combinations (likely 5-10 covers 90%+ of usage).
3. Implement cache warming as a background job after generation completes.

---

## Verification Criteria

### Correctness gate (Phase 1)

For every study in the test suite, for every `view_name`:

```python
assert get_analysis(study_id, AnalysisSettings(), view_name) == read_pregen_json(study_id, view_name)
```

Default-parameter results must be byte-identical to current pre-gen JSON. Any difference means the refactor introduced a bug.

### Propagation gate (Phase 2)

For each of the 4 working settings, for each view listed in the audit's surface tables:

1. Load the view with default settings. Record all displayed values.
2. Toggle the setting. Record all displayed values.
3. Assert: values changed where expected, values unchanged where setting is irrelevant.

This is the same test matrix from the audit, but now every cell should read "PROPAGATES."

### Elimination gate (Phase 2)

After Phase 2 is complete:

- `useFindingsAnalyticsLocal` is deleted from the codebase.
- `applyScheduledFilter`, `applyRecoveryPoolingFilter`, `applyEffectSizeMethod`, `applyMultiplicityMethod` are deleted.
- `stat-method-transforms.ts` contains no computation functions (label/symbol maps only).
- `FindingsAnalyticsContext` is deleted.
- No frontend file imports any filtering or statistical computation function.

A grep for the deleted function names returns zero results.

### Performance gate (Phase 2+)

- Default settings: response time <= current pre-gen JSON serving time (should be identical since it is the same cache).
- Non-default cached: response time <= current pre-gen + 50ms overhead.
- Non-default uncached: response time <= 5 seconds for the largest study in the test suite. (If this is exceeded, the computation needs optimization or the cache warming strategy needs to be more aggressive.)
- Setting toggle UX: no blank screens. `keepPreviousData` ensures previous results display until new results arrive.

---

## Files Affected

### Backend (modify)

| File | Change |
|------|--------|
| `generate.py` | Extract pipeline into `ParameterizedAnalysisPipeline`, call with default settings |
| `findings_pipeline.py` | Accept `AnalysisSettings` parameter instead of hardcoded values |
| API route handler for `/analysis/{view_name}` | Add settings query param parsing, cache lookup, on-demand computation |

### Backend (new)

| File | Purpose |
|------|---------|
| `analysis_settings.py` | `AnalysisSettings` dataclass, defaults, hash function, query param parser |
| `analysis_cache.py` | Cache read/write/invalidate by `(study_id, settings_hash)` |

### Frontend (modify)

| File | Change |
|------|--------|
| Every `useXxxSummary` hook (8 hooks) | Add settings to query key and query params |
| `StudyDetailsContextPanel.tsx` | Remove direct `useOrganWeightNormalization` raw-findings fetch |
| `DoseDetailPane.tsx` | Replace hardcoded test labels with settings-derived labels |
| `VerdictPane.tsx` | Same |
| `HistopathologyView.tsx` | Remove inline scheduled-only filter (~lines 2088-2113); replace hardcoded multiplicity label |
| All settings dropdowns on Study Details page | Read from / write to `StudySettingsContext` instead of raw sessionStorage |

### Frontend (new)

| File | Purpose |
|------|---------|
| `StudySettingsContext.tsx` | Centralized settings state, debounced update, sessionStorage persistence |
| `buildSettingsParams.ts` | Utility to serialize `StudySettings` to URL query string |

### Frontend (delete)

| File | Reason |
|------|--------|
| `useFindingsAnalyticsLocal.ts` | Entire hook — all computation moves to backend |
| `stat-method-transforms.ts` | Computation functions removed (keep label maps if needed) |
| `FindingsAnalyticsContext.tsx` | No longer needed — views read from parameterized hooks |
| `applyScheduledFilter` | Deleted (backend handles) |
| `applyRecoveryPoolingFilter` | Deleted (backend handles) |
| `applyEffectSizeMethod` | Deleted (backend handles) |
| `applyMultiplicityMethod` | Deleted (backend handles) |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Backend computation too slow for interactive toggling | Cache warming for common combinations; `keepPreviousData` in React Query; 300ms debounce on setting changes |
| Refactoring `generate.py` introduces regressions | Phase 1 correctness gate: default-param results must be byte-identical to current pre-gen JSON before any frontend changes |
| Network dependency for every setting change | Debounce collapses rapid toggles; cached responses are near-instant; offline/error state shows last cached result |
| Large diff / review burden | Phases are independently deployable. Phase 1 is backend-only with no user-visible change. Phase 2 can be done hook-by-hook. |

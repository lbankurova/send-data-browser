# Dose-Response View: First-Principles Redesign

## What this does

Redesigns the dose-response view based on persona-driven gap analysis. Elevates time-course to a peer visualization, adds NOAEL context, builds a real volcano/Pareto scatter, enriches the rail with triage signals, and improves the Metrics tab for biostatistician workflows. Addresses 10 prioritized questions (Q1-Q10) mapped to 5 personas (P1 Study Director, P5 Biostatistician, P3 Reg Toxicologist, P7 Reg Reviewer, P2 Pathologist).

Source analysis: `C:\pg\pcc-design\dose-response-first-principles-redesign.md`

## Implementation phases

### Phase 1 — Layout & data-already-exists (highest impact, least effort)

#### 1a. Elevate time-course to peer visualization
**Gap:** Time-course is a collapsed toggle at the bottom of the Evidence tab (line 1251, `expanded = false`). Temporal dynamics are a primary evidence dimension — reversibility determines regulatory outcome.

**Change:**
- Default `expanded = true` in `TimecourseSection`
- Move TimecourseSection from below pairwise table to directly below the D-R chart as a peer section with a section label divider
- Remove toggle chrome — if temporal data exists, show it; if not, show nothing (no placeholder)
- Time-course already renders beautifully (dose-colored lines, subject overlay, Y-axis mode switching)

**Data:** Real API endpoint `/api/studies/:id/timecourse/:domain/:testCode` — already wired via `useTimecourseGroup` and `useTimecourseSubject` hooks. No backend changes needed.

**Addresses:** Q4 (temporal dynamics), Priority 1 in gap analysis.

#### 1b. NOAEL reference line + header context
**Gap:** No NOAEL context anywhere in the dose-response view. Users must hold NOAEL dose in working memory from a different view.

**Change:**
- Fetch NOAEL data from `noael_summary.json` (already generated, fields: `noael_dose_level`, `noael_label`, `noael_dose_value`, `noael_dose_unit`)
- Add `<ReferenceLine>` (already imported from Recharts) to dose-response chart at NOAEL dose level — dashed vertical line with label
- Add NOAEL context line in summary header: `NOAEL: 10 mg/kg (Dose 2)` in `text-[10px] text-muted-foreground`
- NOAEL determined per-sex; show the relevant one based on selected endpoint's sex filter

**Data:** `noael_summary.json` — 3 rows (M, F, Combined). Need a `useNoaelSummary` hook or fetch alongside existing `useStudySignalSummary`.

**Addresses:** Q5 (NOAEL question), Priority 2 in gap analysis.

#### 1c. Sticky summary header
**Gap:** Summary header scrolls away when viewing charts or tables, losing endpoint context.

**Change:** Add `sticky top-0 z-10 bg-background` to the summary header div (line ~782).

**Addresses:** Q1/Q2 (cognitive load), Priority 9 in gap analysis.

#### 1d. Volcano/Pareto scatter (real Recharts implementation)
**Gap:** Currently a placeholder (`ParetoPlaceholder` at line 2429) showing viewer specs but no actual visualization.

**Change:**
- Replace `ParetoPlaceholder` with a real Recharts `ScatterChart`
- X-axis: `max_effect_size` (absolute value) from `EndpointSummary`
- Y-axis: `-log10(min_trend_p)` from `EndpointSummary`
- Color dots by `organ_system` using a deterministic hue-from-hash palette
- Highlight selected endpoint with a ring/larger dot
- Click dot → selects endpoint in rail (via `selectEndpoint`)
- Reference lines: `|d|=0.5` (small), `|d|=0.8` (large), `p=0.05` (-log10 = 1.3), `p=0.01` (-log10 = 2.0)
- Tooltip: endpoint name, organ system, effect size, p-value
- All data already computed in `endpointSummaries` (in-memory, no API call)

**DG migration:** When Datagrok arrives, swap Recharts scatter for `DG.ScatterPlot` viewer — same data contract, better interactivity (zoom, pan, lasso, linked selection). The Recharts version is functionally complete, not a stub.

**Addresses:** Q7 (stat sig vs bio relevance), Priority unstated but doc calls it "the primary orientation tool."

### Phase 2 — Enriched rail signals (moderate effort, high triage value)

#### 2a. Enriched rail items
**Current:** name, direction arrow, pattern badge, trend p, |d|.
**Add to `EndpointSummary` interface and rail rendering:**

| Signal | Source | Display |
|--------|--------|---------|
| Min N | `dose_response_metrics.json` `.n` — compute min across dose groups | `n=10` mono text |
| Sex divergence | Compute `\|d_M - d_F\|` from endpoint rows; flag when > 0.5 | `M` or `F` in sex color |
| Temporal flag | `data_type === "continuous"` or `domain === "CL"` | Clock icon `◷` |
| Assessment status | Check `useAnnotations` for endpoint | Checkmark `✓` |

**Rail item proposed layout:**
```
Row 1: [endpoint name .............. ↑ ⚥]    name + direction + sex-diff
Row 2: [mono] p=0.003 |d|=2.2 n=10  ◷ ✓     pattern + stats + N + flags
```

#### 2b. Organ group domain diversity
**Current:** Organ header shows `Hepatic (5)`.
**Change:** Compute unique domains per group. Render below header: `LB OM MI` using colored domain text.
**Data:** Already available — `group.endpoints` has `domain` on each.

#### 2c. Assessment status in summary header
**Change:** When ToxFinding annotation exists for selected endpoint, show `Assessed: treatment-related, adverse` in `text-[10px]` in the summary header.
**Data:** Already fetched via `useAnnotations`.

### Phase 3 — Metrics tab improvements (P5 workspace)

#### 3a. "Significant only" filter
Add toggle to filter bar: `p_value < 0.05`. Reduces ~1342 → ~100 rows.

#### 3b. Evidence color toggle
Add toggle to filter bar. When on, apply `text-[#DC2626]` to p-values < 0.05 and effect sizes > 0.8 at rest. Default off (respects neutral-at-rest philosophy).

#### 3c. N column position
Move N to 4th column (after endpoint, domain, dose) instead of current position between SD and incidence.

#### 3d. Statistical method indicator
Add static column: "Dunnett" for continuous, "Fisher" for categorical — matches what the generator actually computes. In production, this comes from pipeline metadata.

### Phase 4 — Architecture changes (needs design approval)

#### 4a. Merge ToxFinding + Causality into Assessment pane
Move CausalityWorksheet from Hypotheses tab to a unified "Assessment" context panel pane. ToxFinding form at top, collapsible Bradford Hill section below. One save.

#### 4b. Statistics pane expansion
Add dose-level breakdown table to context panel Statistics pane. N per group prominently. Test method display.

#### 4c. Rename Hypotheses → Explore
Tab label change per doc recommendation.

## Data model

### Existing data (no changes needed for Phases 1-3)

**`dose_response_metrics.json`** — 1350 rows, all fields:
`endpoint_label`, `domain`, `test_code`, `organ_system`, `dose_level`, `dose_label`, `sex`, `mean`, `sd`, `n`, `incidence`, `affected`, `p_value`, `effect_size`, `dose_response_pattern`, `trend_p`, `data_type`

**`noael_summary.json`** — 3 rows (M, F, Combined):
`sex`, `noael_dose_level`, `noael_label`, `noael_dose_value`, `noael_dose_unit`, `loael_dose_level`, `loael_label`, `n_adverse_at_loael`, `adverse_domains_at_loael`, `noael_confidence`

**`study_signal_summary.json`** — ~500 rows:
`endpoint_label`, `endpoint_type`, `domain`, `test_code`, `organ_system`, `organ_name`, `dose_level`, `dose_label`, `dose_value`, `sex`, `signal_score`, `direction`, `p_value`, `trend_p`, `effect_size`, `severity`, `treatment_related`, `dose_response_pattern`, `statistical_flag`, `dose_response_flag`, `mean`, `n`

**Time-course API** (on-demand, not pre-generated):
- Group: `TimecourseResponse { test_code, test_name, domain, unit, timepoints: [{ day, groups: [{ dose_level, dose_label, sex, n, mean, sd, values }] }] }`
- Subject: `TimecourseSubjectResponse { subjects: [{ usubjid, sex, dose_level, dose_label, arm_code, values: [{ day, value }] }] }`

### New hook needed
- `useNoaelSummary(studyId)` — fetches `/api/analysis/noael-summary` (same pattern as other analysis hooks)

## UI specification

**View:** Dose-Response (`/studies/:id/dose-response`)
**File:** `frontend/src/components/analysis/DoseResponseView.tsx` (3028 lines)

All changes are within the existing three-panel layout. No new routes. No new views. Changes are incremental to the existing component.

## Integration points

- `docs/systems/data-pipeline.md` — no pipeline changes for Phases 1-3
- `docs/views/dose-response.md` — view spec will need updating after each phase
- `docs/systems/insights-engine.md` — no changes
- `docs/systems/annotations.md` — Phase 4a merges annotation panes
- No new dependencies — Recharts ScatterChart already available (imported but only used for icon)

## Acceptance criteria

### Phase 1
- [ ] Time-course chart visible by default below D-R chart when temporal data exists
- [ ] No time-course section shown for endpoints without temporal data (no empty placeholder)
- [ ] NOAEL dose level marked on D-R chart with dashed reference line
- [ ] NOAEL info displayed in summary header (`NOAEL: X mg/kg (Dose N)`)
- [ ] Summary header stays visible when scrolling evidence content
- [ ] Volcano scatter renders all endpoints as dots with organ-system coloring
- [ ] Clicking a dot in volcano scatter selects the endpoint in the rail
- [ ] Reference lines at |d|=0.5, |d|=0.8, p=0.05, p=0.01 visible
- [ ] Selected endpoint highlighted in volcano scatter

### Phase 2
- [ ] Rail items show min N across dose groups
- [ ] Rail items show sex-divergence flag when |d_M - d_F| > 0.5
- [ ] Rail items show clock icon when temporal data is available
- [ ] Rail items show checkmark when ToxFinding annotation exists
- [ ] Organ group headers show domain diversity labels (colored text)
- [ ] Summary header shows assessment status when annotation exists

### Phase 3
- [ ] "Significant only" filter reduces metrics table to p < 0.05 rows
- [ ] Evidence color toggle applies red to significant p-values and large effect sizes at rest
- [ ] N column positioned 4th in metrics table
- [ ] Statistical method column shows "Dunnett" or "Fisher"

### Phase 4
- [ ] Causality worksheet accessible from context panel Assessment pane
- [ ] ToxFinding + Bradford Hill share one save action
- [ ] Statistics pane shows dose-level breakdown with N per group
- [ ] Hypotheses tab renamed to Explore

## Datagrok notes

- Volcano/Pareto scatter: Recharts implementation is a functional bridge. In DG, use `DG.ScatterPlot` with linked selection to the endpoint DataFrame. Same data contract.
- Time-course charts: In DG, use `DG.LineChart` with `splitBy: dose_group`. Current Recharts implementation matches the target UX.
- All Hypotheses/Explore tools (Shape, Model, Correlation, Outliers) are designed for DG viewers. The Recharts bridges (Pareto, Shape) will be swapped.

## Open questions

- Phase 4a (Assessment pane merge): Does combining ToxFinding + Causality in one pane work for the P1 workflow? May need user testing.
- Volcano scatter mini-map in rail header: The doc suggests a thumbnail above the endpoint list. Worth doing as a separate enhancement after the full scatter is proven.
- Statistical method: Currently hardcoded mapping. Should the generator emit the test name from the pipeline for accuracy?

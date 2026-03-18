# Post-Implementation Review: Findings + D-R View Merge (Phases A-C)

**Date:** 2026-03-17
**Branch:** `merge-findings-dr`
**Commits:** `32b97a2` (Phase A) → `f944499` (Phase B) → `77ce6f6` (pane reorder + per-sex causality) → `a5f3e13` (Phase C WIP) → `476e0ca` (TS fixes)
**Spec:** `docs/incoming/view-merge-spec.md` (8 phases, 30 steps)
**Cross-reference documents:**
- `docs/incoming/dose-response-view-audit.md` — UX/domain audit (29 findings)
- `docs/incoming/view-redesign-ideas.md` — brainstormed merge decisions (15+ items)
- `docs/incoming/dr-findings-merge-analysis.md` — exhaustive gap analysis (30 features, 12 gaps, 8 questions, 7 risks)

---

## Step 0: Spec Verification Checklist

The spec (`view-merge-spec.md`) has no formal verification checklist section. Proceeding to requirement trace.

---

## Step 1: Four-Dimension Requirement Trace

### Phase A — Context Panel Additions (spec Section 5, Section 16 lines 478-483)

#### A1: "Add CausalityWorksheet pane to FindingsContextPanel"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | `CausalityWorksheet` imported (FindingsContextPanel.tsx:29) and rendered (line 1890-1906). 5 auto-computed + 4 expert criteria. Persists via `useAnnotations<CausalAssessment>`. |
| WHEN | PASS | Renders when `contextReady` is true (finding selected + context data loaded). |
| UNLESS | PASS | Not rendered when no finding selected. |
| HOW | PASS | Wrapped in `CollapsiblePane title="Causality assessment" defaultOpen={false}`. Props: studyId, selectedEndpoint, selectedSummary, ruleResults, signalSummary, effectSizeSymbol, perSexSummaries. |

#### A2: "Add InsightsList pane (wire useRuleResults)"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | `InsightsList` imported (line 31), rendered (lines 1814-1832). `useRuleResults(studyId)` called at line 1095. |
| WHEN | PASS | Conditional: `endpointRules.length > 0` (line 1814). |
| UNLESS | PASS | Hidden when no rules match the endpoint's organ_system + domain prefix filter (lines 1107-1116). |
| HOW | PASS | Wrapped in `CollapsiblePane title="Organ insights" defaultOpen={false}`. Filters by organ_system match OR endpoint scope with domain prefix (line 1112-1114). |

#### A3: "Verify ToxFindingForm system suggestion wiring"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | `ToxFindingForm` rendered at line 1909-1915. `systemSuggestion` prop wired via `deriveToxSuggestion(selectedSignalRow)` (line 1913). |
| WHEN | PASS | Always rendered when studyId exists. |
| HOW | PASS | Signal data from `useStudySignalSummary` (line 1096), matched by endpoint_label + sex (lines 1101-1105). |

#### A4: "Add incremental header info (pattern badge, assessment status, NOAEL)"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | All three present at lines 1396-1432. |
| WHEN | PASS | Pattern badge: when `!hasSibling && selectedFinding.dose_response_pattern` (line 1402). Assessment: when `toxAnnotations[endpointKey]` exists (line 1409). NOAEL: when `!hasSibling && noael` (line 1425). |
| UNLESS | PASS | Pattern and NOAEL suppressed when sibling exists — avoids cross-sex contradiction (comment at lines 1397-1400). Assessment status suppressed when no annotation. |
| HOW | PASS | Pattern badge: `bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200` (neutral gray per design rules). Assessment: same neutral gray. NOAEL: `text-muted-foreground` text only. |

#### A-ORDERING: Pane ordering

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | **DEVIATION** | Pane ordering follows "data → analysis → determination" (commit 77ce6f6), NOT the spec Section 5 order (lines 203-234). |

**Spec Section 5 order:** Header → Verdict → CausalityWorksheet → ToxFindingForm → EvidencePane → InsightsList → DoseDetailPane → SexComparisonPane → CorrelationsPane → ContextPane → RecoveryPane → TimeCoursePane → DistributionPane → EndpointSyndromePane → NormalizationHeatmap

**Actual order:** Header → Verdict+SexComparison → DoseDetail → **TimeCourse → Distribution → Recovery** → StatEvidence → **InsightsList** → Patterns → Correlations → EffectRanking → **CausalityWorksheet → ToxFindingForm** → RelatedViews

**Decision:** The spec placed CausalityWorksheet and ToxFindingForm early (#3-4), before evidence panes. The implementation places them last, after all evidence. This directly addresses the audit's IA-01 finding ("conclusion before evidence undermines trust") — assessment tools come AFTER the user has seen all data. This is the better ordering from a toxicology workflow perspective and was a deliberate choice.

---

### Phase B — Time-Course Unification (spec Section 6, Section 16 lines 484-488)

#### B1: "Extend TimeCoursePane with CL bar chart support"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | `TimeCourseBarChart.tsx` (315 lines, new SVG component). CL detected via `finding.domain === "CL"` (TimeCoursePane.tsx:346). |
| WHEN | PASS | Renders when `isCL` is true (line 398-419). `useClinicalObservations` hook fetches CL data (line 370-373). |
| UNLESS | PASS | Not shown for non-CL domains. Y-axis mode toggle hidden for CL (counts, not continuous). |
| HOW | PASS | SVG rendering (per spec line 269). Grouped bars per dose level at each study day. |

#### B2: "Add subject-level trace overlay with dose group filter"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | "Show subjects" toggle (TimeCoursePane.tsx:614). `useTimecourseSubject` hook (lines 361-367). Dose group chip filter (lines 640-668). |
| WHEN | PASS | Subject data fetched only when `showSubjects && isContinuous` (line 362). Filter chips shown only when `showSubjects` (line 640). |
| UNLESS | PASS | Subject traces not available for CL domain (isContinuous check). |
| HOW | PASS | Subjects rendered as thin polylines in SVG (TimeCourseLineChart.tsx:177-234). Per-subject color by dose group. Filter defaults to all selected (empty array = all, line 344). |

**Spec quote check:** "Dose group filter required" — PASS, filter UI renders when subjects shown.

#### B3: "Add Y-axis mode toggle"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | 4 modes: `g`, `absolute`, `pct_change`, `pct_vs_control` (TimeCoursePane.tsx:34-39). PanePillToggle UI (lines 600-604). |
| WHEN | PASS | Toggle shown for continuous domains. `g` disabled in subject mode (line 584). |
| UNLESS | PASS | Auto-switches g→absolute when subjects enabled (line 384: `effectiveYAxisMode`). |
| HOW | PASS | Transformation in `transformSeries()` (lines 62-130). |

#### B4: "Add recovery continuity in subject mode (remove group lines)"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | Subject traces split at terminal day: solid (treatment) + dashed (recovery) (TimeCourseLineChart.tsx:188-223). Group lines hidden: `{!hasSubjects && doseGroups.map...}` (line 237). |
| WHEN | PASS | Recovery segments only when subject has post-terminal data. |
| UNLESS | PASS | At group level, recovery is NOT shown — `useTimeCourseData.ts:128-141` clips post-terminal timepoints for group data. |
| HOW | PASS | Treatment segment: solid stroke. Recovery segment: `strokeDasharray="2,1.5"` (line 219). USUBJID grouping merges treatment+recovery (TimeCoursePane.tsx:145-158). |

**Hooks reuse check (spec Section 6 line 270):**
- `useTimecourseGroup` — PASS (via useTimeCourseData.ts:3)
- `useTimecourseSubject` — PASS (TimeCoursePane.tsx:12)
- `useRecoveryPooling` — PASS (TimeCoursePane.tsx:15)
- `useClinicalObservations` — PASS (TimeCoursePane.tsx:11)

---

### Phase C — Central Panel Restructure (spec Section 3-4, Section 16 lines 490-494)

#### C1: "Build DoseResponseChartPanel (D-R + effect size side-by-side, mode toggles)"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | `DoseResponseChartPanel.tsx` (503 lines). D-R chart (line/bar by data type) + effect size bar chart side-by-side (lines 437-497). |
| WHEN | PASS | Chart type auto-selected: `chartData.dataType === "continuous" ? buildDoseResponseLineOption : buildIncidenceBarOption` (lines 350-354). Effect size chart only when `hasEffect` (lines 329-334). |
| HOW | PASS | PanelResizeHandle between charts (line 477). splitPct state with 20-80% bounds (line 376). Both charts locked to same `selectedDay` state (line 237). |

**Sub-checks:**

| Feature | Status | Evidence |
|---------|--------|----------|
| Incidence compact mode | PASS | ChartModeToggle (line 451), auto-activates when maxIncidence < 0.3 (lines 300-304) |
| Non-monotonic flag | PASS | `checkNonMonotonic` called (lines 308-326), passed to chart builders (line 353) |
| Day stepper (terminal/peak/recovery) | PASS | Arrow buttons + dropdown (lines 398-435). Labels assigned: terminal/peak/recovery (lines 225-230). |
| Day stepper label format | **FAIL (HOW)** | Spec: "Terminal (Day 92)". Actual: "D92 (terminal)" (line 418: `D{d}{label ? \` (\${label})\` : ""}`). Reversed order. |
| Peak detection algorithm | **FAIL (WHEN)** | Spec: `argmax \|Hedges' g\|` for continuous, `argmin Fisher's exact p` for incidence. Actual: `Math.abs(r.effect_size ?? 0)` for ALL data types (lines 217-220). No data_type check. |
| NOAEL reference line | **FAIL (UNLESS)** | `compactify()` strips ALL NOAEL markLines (lines 108-123). Spec doesn't authorize removal. |
| Recovery visual distinction | **FAIL (HOW)** | Spec: "different color treatment or clear header label so user can't mistake recovery D-R for main study." Actual: only the dropdown label "(recovery)" distinguishes it. No color or N-warning. |

#### C2: "Build FindingsTableHeader (mode toggle)"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | **DEVIATION** | No separate `FindingsTableHeader` component created. Header is inline in `FindingsTable.tsx` (lines 649-716). |
| HOW | PASS (functional) | All/Worst toggle (lines 653-677) and Standard/Pivoted toggle (lines 671-695) are present and functional. |

**Decision:** Component not extracted as separate file but functionality is complete. Low severity — refactoring preference.

#### C3: "Modify FindingsView for scope-dependent layout"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | `FindingsView.tsx:405-447`. Endpoint selected → `DoseResponseChartPanel`. No endpoint → `FindingsQuadrantScatter`. |
| WHEN | PASS | `activeEndpoint` state drives the branch. |
| HOW | **FAIL (HOW)** | Spec: "Tab 1: Evidence (default), Tab 2: Metrics (full metrics table)". Actual: tabs are "Chart" and "Table" (FindingsView.tsx:60-65). "Table" opens FindingsTable, not a separate MetricsTable. |

#### C4: "Improve FindingsTable columns"

| Dimension | Status | Evidence |
|-----------|--------|----------|
| WHAT | PASS | Data Type column (FindingsTable.tsx:297-307), dose header tooltips (lines 308-346), "Trend p" naming (lines 398, 549). |
| HOW | PASS | Type column shows "cont"/"inc" with tooltip. Dose headers use `DoseHeader` component with full-label tooltip. "Trend p" consistent in both layouts. |

---

## Step 2: Data Reuse Audit

| Item | Status | Detail |
|------|--------|--------|
| `flattenFindingsToDRRows` | PASS | Single source in `derive-summaries.ts:272-308`. Used by both DoseResponseView and DoseResponseChartPanel. |
| `getEffectSizeLabel`/`getEffectSizeSymbol` | PASS | Single source in `stat-method-transforms.ts:87-93`. Used consistently. |
| `getDoseGroupColor` | PASS | Single source in `severity-colors.ts`. No hardcoded dose colors. |
| `getPatternLabel` | PASS in new code | FindingsContextPanel.tsx:1404 uses canonical `getPatternLabel` from `findings-rail-engine.ts`. DoseResponseView.tsx has a duplicate local `PATTERN_LABELS` map with **inconsistent labels** (e.g., "Threshold effect" vs "Threshold", "Flat (no effect)" vs "Flat") — but this is in the OLD D-R view that will be deleted in Phase G. |
| `computeSignalScore` | Deferred | Two implementations exist (DoseResponseView.tsx:120 vs findings-rail-engine.ts:66). Different formulas. Both in OLD D-R view — will be resolved when D-R view is deleted (Phase G). |
| `deriveEndpointSummaries` | Deferred | Two implementations exist (DoseResponseView.tsx:126 vs derive-summaries.ts:318). OLD D-R version lacks organ system resolution, per-sex breakdowns, NOAEL tier. Will be resolved when D-R view is deleted (Phase G). |
| Domain-aware effect size label | **GAP** | DoseResponseChartPanel uses `getEffectSizeLabel(esMethod)` for the chart subtitle (line 484). This shows the user's selected method (e.g., "Hedges' g") regardless of domain. For MI endpoints, the actual metric is avg_severity, not Hedges' g. However, MI endpoints typically have null `effect_size` from `pw?.cohens_d`, so the effect size chart doesn't render for MI (`hasEffect` = false). Low practical impact. |

**Methods/field-contracts cross-reference:**
- FIELD-34 (signal score): canonical source is `computeEndpointSignal()` in findings-rail-engine — all new code should use this after Phase G deletion.
- FIELD-17 (pattern label): canonical source is `getPatternLabel()` — new code already uses this.
- METH-17 (endpoint aggregation): canonical source is `deriveEndpointSummaries()` in derive-summaries.ts — will become sole implementation after Phase G.

---

## Step 3: Gap List

### Spec deviations found (new code)

| # | Spec section | Dimension | Spec says | Code does | File:line | Severity | TODO |
|---|-------------|-----------|-----------|-----------|-----------|----------|------|
| SD-1 | §4 line 162-165 | WHEN | Peak detection: `argmax \|Hedges' g\|` continuous, `argmin Fisher's p` incidence | Uses `argmax \|effect_size\|` for ALL data types | DoseResponseChartPanel.tsx:217-220 | LOW (incidence usually terminal-only) | GAP-89 |
| SD-2 | §4 line 152 | HOW | Day label format: "Terminal (Day 92)" | Shows "D92 (terminal)" — reversed order | DoseResponseChartPanel.tsx:418 | LOW | GAP-90 |
| SD-3 | §3 line 70-71 | HOW | "Tab 1: Evidence, Tab 2: Metrics" | Tabs labeled "Chart" and "Table" | FindingsView.tsx:60-65 | MEDIUM (user decision needed) | GAP-91 |
| SD-4 | §4 line 160 | HOW | Recovery: "different color treatment or clear header label" | Only dropdown label "(recovery)" distinguishes | DoseResponseChartPanel.tsx:229 | LOW | GAP-92 |
| SD-5 | §14 line 428 | WHAT | Create `FindingsTableHeader` component | Header is inline in FindingsTable | FindingsTable.tsx:649-716 | LOW (functional equivalent) | — |
| SD-6 | §5 lines 203-234 | HOW | Pane order: Causality (#3) → ToxFinding (#4) → Evidence (#5) | Evidence → ... → Causality → ToxFinding (assessment last) | FindingsContextPanel.tsx:1609-1909 | DELIBERATE (see Step 4) | — |

### Features not yet implemented (planned for later phases)

| # | Spec section | Feature | Phase | TODO |
|---|-------------|---------|-------|------|
| NI-1 | §5 item 9 | D-R correlations (organ neighbors) → OrganContextPanel | — | GAP-93 |
| NI-2 | §9 | Full MetricsTable migration | — | GAP-91 |
| NI-3 | §2 | FindingsNavGrid (flat rail) | D | — |
| NI-4 | §10 | Scatter merge (Pareto/volcano) | E | — |
| NI-5 | §7 | Pipeline consolidation (signal score, scheduled-only) | F | — |
| NI-6 | §12 | Route cleanup + D-R deletion | G | — |
| NI-7 | §13 | Backend cleanup | G | — |

### Issues from cross-reference documents

| # | Source | Issue | TODO |
|---|--------|-------|------|
| CR-1 | Audit D-07, all 3 docs | Fold change never shown (most intuitive tox metric) | GAP-85 (already logged) |
| CR-2 | Audit D-08 | Sex divergence computed but never displayed | GAP-86 (already logged) |
| CR-3 | Audit D-09 | Control group no visual distinction | GAP-87 (already logged) |
| CR-4 | Audit UX-05 | CausalityWorksheet no collapsed summary badge | GAP-94 |
| CR-5 | Gap G11 | NOAEL reference line stripped from compact D-R charts | GAP-95 |

---

## Step 4: Decision Points

| # | Spec requirement | Implementation choice | Rationale |
|---|-----------------|----------------------|-----------|
| DP-1 | Spec §5: CausalityWorksheet + ToxFindingForm placed at positions 3-4 (before EvidencePane) | Placed at positions 12-13 (after all evidence panes) | Addresses audit IA-01: "conclusion before evidence undermines trust." Follows data→analysis→determination workflow. A toxicologist should see all evidence before reaching assessment tools. |
| DP-2 | Spec §3: Tabs labeled "Evidence" and "Metrics" | Tabs labeled "Chart" and "Table" | "Chart" better describes the scope-dependent content (scatter OR D-R charts). "Table" is the FindingsTable, not a separate MetricsTable. User decision needed on whether full MetricsTable migration is required. |
| DP-3 | Spec §4: NOAEL reference line preserved | Stripped in compact D-R charts | Space optimization for compact central panel charts. NOAEL info remains accessible in context panel header and VerdictPane. |
| DP-4 | Spec §14: Separate `FindingsTableHeader` component | Header inline in FindingsTable | All functionality present. Component extraction is refactoring preference with no user-facing impact. |

---

## Step 5: Cross-Spec Integration Gaps

| # | Spec reference | Integration needed | Status |
|---|---------------|-------------------|--------|
| XI-1 | §12: "Update all 11 cross-view navigation links" | 11 locations navigate to `/dose-response` — must update to `/findings` | Phase G (not started) |
| XI-2 | §12: "Add location.state handling to FindingsView" | Cross-view nav passes `{ organ_system, endpoint_label }` state | Not implemented — FindingsView uses callback-based selection, not URL state |
| XI-3 | §12: "Add redirect route, delete D-R view" | Route redirect + component deletion | Phase G (not started) |
| XI-4 | §13: "Retire dose_response_metrics.json + hook" | Backend cleanup | Phase G (not started) |
| XI-5 | §9: "Column naming consistency with FindingsTable" | Metrics tab columns must match FindingsTable naming | Deferred until MetricsTable migration decision (GAP-91) |

---

## Step 6: Full Gap List

### New TODOs to log in docs/TODO.md

| ID | Description | Source | Priority | Files |
|----|-------------|--------|----------|-------|
| GAP-89 | Peak detection: use `argmin Fisher's p` for incidence endpoints in DoseResponseChartPanel | Spec §4 vs DoseResponseChartPanel.tsx:217-220 | P3 | `DoseResponseChartPanel.tsx` |
| GAP-90 | Day stepper label: change "D92 (terminal)" to "Terminal (Day 92)" per spec | Spec §4 line 152 | P3 | `DoseResponseChartPanel.tsx:418` |
| GAP-91 | Central panel tabs: decide Evidence/Metrics vs Chart/Table naming, and whether full MetricsTable migration is needed | Spec §3, §9 | P2 | `FindingsView.tsx:60-65` |
| GAP-92 | Recovery day visual distinction: add color treatment or N-warning on D-R charts when showing recovery data | Spec §4 line 160, ideas doc "Recovery visual distinction" | P3 | `DoseResponseChartPanel.tsx` |
| GAP-93 | Migrate D-R organ correlations (signal-score-ranked organ neighbors) to OrganContextPanel | Spec §5 item 9, gap analysis G6 | P3 | `OrganContextPanel.tsx` |
| GAP-94 | CausalityWorksheet: show collapsed summary badge (e.g., "Likely causal" or "Not assessed") | Audit UX-05 | P3 | `FindingsContextPanel.tsx:1890` |
| GAP-95 | NOAEL reference line on compact D-R charts: consider toggle or conditional display | Gap analysis G11, spec silent on removal | P3 | `DoseResponseChartPanel.tsx:108-123` |

### Previously logged (confirmed still open)

| ID | Description | Status |
|----|-------------|--------|
| GAP-85 | Show fold change for continuous endpoints | Open — highest-impact domain gap |
| GAP-86 | Display sex divergence when significant | Open |
| GAP-87 | Visual distinction for control group row | Open |

---

## Audit Findings Resolution (from dose-response-view-audit.md)

### Must-fix (scientifically incorrect)

| ID | Issue | Resolved? | How |
|----|-------|-----------|-----|
| D-03 | Effect size threshold styling assumes Cohen's d | Resolved | D-R header not migrated; DoseResponseChartPanel has no threshold styling |
| D-04 | Volcano scatter mixes incompatible metrics | Phase E | FindingsQuadrantScatter uses percentile axes |
| D-05 | Context panel averages means across sexes | Resolved | D-R Statistics pane discarded; DoseDetailPane shows per-sex data |
| D-01 | Local `computeSignalScore` adds incompatible scales | Phase G | Will die with D-R view deletion |
| D-02 | `generateConclusion` uses raw effect size | Resolved | Not migrated |

### Should-fix (high UX impact)

| ID | Issue | Resolved? | How |
|----|-------|-----------|-----|
| UX-01 | No endpoint list/picker | Resolved | FindingsRail serves this role |
| R-02 | Dose-level statistics in 3 places | Resolved | D-R Statistics pane discarded, pairwise table not migrated |
| IA-01 | Insights before statistics | Resolved | Reordered: data→analysis→determination (commit 77ce6f6) |
| IA-02 | Evidence tab stacks 3 sections | Resolved | Charts in central panel, time-course in context panel, pairwise gone |
| R-06 | Conclusion text enumerates visible metrics | Resolved | Not migrated |
| IA-03 | Causality buried in Hypotheses | Resolved | CausalityWorksheet → own context panel pane |

### Nice-to-fix

| ID | Issue | Resolved? |
|----|-------|-----------|
| D-06 | "Data: continuous" instead of stat method | N/A — D-R header gone |
| D-07 | No fold change | Open (GAP-85) |
| D-08 | Sex divergence never displayed | Open (GAP-86) |
| D-09 | Control group visual distinction | Open (GAP-87) |
| UX-05 | Causality no summary state | Partial (GAP-94) |
| CC-02 | Two deriveEndpointSummaries | Phase G — dies with D-R view |

---

## Gap Analysis Resolution (from dr-findings-merge-analysis.md)

| Gap | Severity | Resolved? | Notes |
|-----|----------|-----------|-------|
| G1: CausalityWorksheet | HIGH | Done | Context panel pane with persistence |
| G2: Hypotheses framework | MEDIUM | Done (kill) | Eliminated by design |
| G3: Volcano/Pareto scatter | MEDIUM | Phase E | |
| G4: InsightsList | MEDIUM | Done | Wired via useRuleResults |
| G5: ToxFindingForm | HIGH | Done | Already present + verified |
| G6: D-R correlations | LOW | Open (GAP-93) | |
| G7: Endpoint bookmarks | LOW | Phase D | |
| G8: CL time-course | MEDIUM | Done | TimeCourseBarChart |
| G9: Subject-level traces | MEDIUM | Done | Full implementation |
| G10: Non-monotonic flag | LOW | Done | checkNonMonotonic → amber markArea |
| G11: NOAEL reference line | LOW | Stripped (GAP-95) | Intentional for space |
| G12: Incidence compact mode | LOW | Done | ChartModeToggle |

---

## Domain Observations (SEND Toxicology)

### Fold change — highest-impact domain gap (D-07, GAP-85)

In regulatory study reports, findings use fold-change language: "ALT elevated 3.2-fold at high dose." The backend computes `max_fold_change` (FIELD-15) but `flattenFindingsToDRRows` doesn't expose it. Hedges' g/Cohen's d are statistically rigorous but unfamiliar outside biostats. Adding fold change to FindingsTable or DoseResponseChartPanel is the single highest-impact improvement for regulatory utility.

### Per-sex causality consistency — scientifically sound

The direction-agreement check (commit 77ce6f6) correctly downgrades consistency when sexes show opposite trends. In regulatory tox, opposite-direction dose-response between sexes argues against treatment-relatedness unless a sex-specific mechanism is known (e.g., liver enzyme sex dimorphism in rats).

### Assessment status in header — well done

The incremental header info (FindingsContextPanel.tsx:1396-1432) correctly uses neutral gray badges, suppresses when sibling exists, and shows treatment-relatedness status. Exactly what a toxicologist needs when scanning endpoints.

---

## Parallels Across the Three Documents

| Theme | Audit lens | Ideas lens | Gap Analysis lens |
|-------|-----------|------------|-------------------|
| Redundancy elimination | R-02/R-03/R-06: same data in 3+ places | "Findings wins, D-R discarded" | D-R Statistics redundant with DoseDetailPane |
| Assessment workflow | IA-03/UX-05: buried, no summary | "CausalityWorksheet → context panel" | G1/G5: regulatory workflow tools |
| Data-type blindness | D-01 through D-04: 5 findings | Not addressed | Signal score computed differently |
| Information order | IA-01: "conclusion before evidence" | "Findings takes precedence" | Not specified |
| Fold change | D-07: "most intuitive metric" | Not mentioned | Not mentioned |
| Time-course scope | IA-02: "three views at once" | "Context panel only" | G8/G9: CL + subjects missing |

The audit is the most domain-aware (D-07, D-08, D-09). The gap analysis is the most mechanically thorough (30 features tracked). The ideas doc is the most opinionated on IA ("flat over nested").

---

*Review completed: 2026-03-17*
*Files changed (b00df5e..476e0ca): 28 files, +4346 -988 lines*
*Methodology: POST-IMPLEMENTATION-REVIEW.md checklist (Steps 0-6)*

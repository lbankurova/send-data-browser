# Dose-Response View Audit

Full UX and domain audit of `DoseResponseView.tsx` (2872 lines), `DoseResponseContextPanel.tsx` (376 lines), and their data flow. Evaluates redundancy, information ordering, domain correctness, and interaction design from a SEND toxicology perspective.

**Auditor perspective:** A regulatory toxicologist evaluating dose-response relationships for NOAEL determination and treatment-related assessment.

---

## 1. View anatomy (current state)

### Center panel (DoseResponseView.tsx)

```
+-------------------------------------------------------+
| Summary header (sticky)                                |
|   Domain · Organ [· Categorical]     [Pattern badge]   |
|   Conclusion text                                      |
|   Trend p | Min p | Max |g| | Data | NOAEL | Assessed  |
+-------------------------------------------------------+
| [Evidence] [Hypotheses] [Metrics]   [expand/collapse]  |
+-------------------------------------------------------+
| Evidence tab:                                          |
|   ViewSection "Charts"  (resizable height)             |
|     [DR line/bar chart | resize | Effect size chart]   |
|     Legend                                              |
|   ViewSection "Time-course"  (resizable height)        |
|     [Sex-faceted line/bar charts]                       |
|     Legend                                              |
|     Day-by-dose table                                  |
|   ViewSection "Pairwise comparison (N)"                |
|     [Dose | Sex | Mean | SD | N | p | Effect | Pat.]  |
+-------------------------------------------------------+
| Hypotheses tab:                                        |
|   Toolbar: [Shape] [Pareto] [+]     "Does not affect."|
|   Tool content (Shape/Model/Pareto/Corr/Outlier/Caus.) |
+-------------------------------------------------------+
| Metrics tab:                                           |
|   Filter bar: Sex | DataType | Organ | p<0.05 | count |
|   Full data table (13 columns, all endpoints)          |
+-------------------------------------------------------+
```

### Right panel (DoseResponseContextPanel.tsx)

```
+-------------------------------------------------------+
| Header: endpoint_label                                 |
|   Domain · Organ [· Sex]                               |
|   [Tier count badges]                                  |
+-------------------------------------------------------+
| [v] Insights       (rule results for endpoint)         |
| [v] Statistics      (dose-level breakdown table)       |
| [v] Correlations    (other endpoints in same organ)    |
|     Tox Assessment  (ToxFindingForm)                   |
| [>] Related views   (links to study summary, histo, noael) |
+-------------------------------------------------------+
```

---

## 2. Redundancy findings

### R-01: Endpoint identity shown 3 times

The selected endpoint's identity (domain, organ system) appears in:
1. **Summary header** — `DomainLabel · titleCase(organ_system)` (line 644-646)
2. **Context panel header subtitle** — `DomainLabel · titleCase(organ_system) [· sex]` (line 170-173)
3. **Causality worksheet header** (if Hypotheses > Causality is open) — `DomainLabel · organ_system` (line 2619-2623)

**Impact:** Low. Some duplication is expected between center and right panel since they can be read independently. The causality worksheet header (3rd instance) is unnecessary since the user navigated there explicitly.

**Recommendation:** Remove the causality worksheet header (it's inside a tab that already has context). Keep center/right duplication as standard practice.

### R-02: Dose-level statistics shown in 3 places

Dose-by-group data appears as:
1. **Evidence tab → Pairwise comparison table** — per dose×sex: Mean, SD, N, p, Effect, Pattern (line 1058-1111)
2. **Context panel → Statistics pane** — per dose (sex-aggregated): N, Mean/SD or Aff/Inc%, p-value (line 193-259)
3. **Time-course → Day-by-dose table** — per day×dose×sex: Mean±SD, N (line 1570-1682)

The pairwise table and context panel statistics contain essentially the same information with different aggregation. The user has no guidance on which to trust.

**Impact:** High. A toxicologist reviewing dose-level statistics will encounter the same data in two panels with slightly different presentations. The context panel version averages means and SDs across sexes (lines 121-125) — this is statistically dubious (averaging means across sexes with different baselines).

**Recommendation:**
- Remove the Statistics pane from the context panel entirely. The pairwise table in the center panel is more complete (it preserves sex stratification).
- If a compact summary is needed in the context panel, show the NOAEL-relevant dose level only, not the full breakdown.

### R-03: Pattern shown in 3 places

Dose-response pattern classification appears:
1. **Summary header** — pattern badge, top right (line 649-657)
2. **Summary header conclusion** — embedded in text: "Monotonic increase across doses" (line 235)
3. **Pairwise table** — Pattern column, repeated per row (line 1076, 1103-1104)

**Impact:** Medium. The pattern badge and conclusion text are inches apart and say the same thing. The pairwise table shows pattern per dose×sex row, which is always the same value within an endpoint — wasting a column.

**Recommendation:**
- Remove pattern from the conclusion text (it's already in the badge right above).
- Remove the Pattern column from the pairwise table. It's a per-endpoint attribute shown per-row, adding no information.

### R-04: p-values shown in 4 places

For the selected endpoint, p-value information appears:
1. **Summary header** — "Trend p:" and "Min p:" (lines 666-688)
2. **Charts** — significance encoding (larger dots with border for p<0.05) (dose-response-charts.ts)
3. **Pairwise table** — p-value and Trend p columns (lines 1093-1096, 1098-1101)
4. **Context panel Statistics** — p-value column (line 246)

**Impact:** Medium. Four representations of the same information. The summary header compact metrics, the chart encoding, and the pairwise table are each justifiable in isolation but collectively are redundant.

**Recommendation:** Keep summary header (overview), chart encoding (visual), and pairwise table (detail). Remove context panel Statistics (see R-02).

### R-05: Effect size shown in 3 places

1. **Summary header** — "Max |g|:" with threshold styling (lines 689-702)
2. **Effect size bar chart** — visual representation by dose (lines 1000-1040)
3. **Pairwise table** — Effect column (lines 1098-1101)

**Impact:** Low. The chart and table serve different purposes (visual pattern vs. exact values). The summary header gives the extreme. Acceptable redundancy.

### R-06: Conclusion text duplicates other header elements

`generateConclusion()` (lines 231-256) outputs text like:
> "Monotonic increase across doses, trend p=0.001, max effect size 2.50. Both sexes affected."

Every piece of this sentence is already shown elsewhere in the same header:
- Pattern → badge (right of header)
- Trend p → compact metrics row
- Max effect size → compact metrics row
- Sex info → derivable from compact metrics

**Impact:** Medium. The conclusion text is the header's raison d'etre, but when it merely repeats surrounding elements, it wastes vertical space without adding insight.

**Recommendation:** Either make the conclusion text additive (synthesize, don't enumerate) or remove it. A useful conclusion would be: "Likely treatment-related: strong monotonic trend in both sexes with large effect." A bad one is listing metrics already visible 2cm below.

---

## 3. Information architecture

### IA-01: Context panel order is suboptimal for dose-response workflow

Current order: Insights → Statistics → Correlations → Tox Assessment → Related Views

A toxicologist's dose-response workflow is:
1. See the data (what happened?)
2. See the statistical evidence (is it significant?)
3. Read system-generated insights (what does the system think?)
4. Check corroborating endpoints (does anything else agree?)
5. Make an assessment (treatment-related? adverse?)
6. Navigate to related views

The current order puts **Insights first** — before the user has seen the statistical data. This is "conclusion before evidence," which undermines trust. A toxicologist wants to form their own impression before seeing the system's interpretation.

**Recommendation:** Reorder to: Statistics → Insights → Correlations → Tox Assessment → Related Views. Better yet, remove Statistics per R-02 and use: Insights → Correlations → Tox Assessment → Related Views (since the pairwise table in the center panel serves the statistics role).

### IA-02: Evidence tab tries to be three views at once

The Evidence tab contains:
1. Charts section (dose-response + effect size, resizable)
2. Time-course section (line charts + day-by-dose table, resizable)
3. Pairwise comparison table (flex)

These are three distinct analytical activities:
- **Charts** = visual dose-response pattern recognition
- **Time-course** = temporal dynamics (a different analytical question)
- **Pairwise table** = detailed statistical reference

Stacking all three vertically means:
- The user must scroll extensively to move between them
- The time-course section can be 400px+ tall (chart + table), pushing the pairwise table far off-screen
- A user interested in comparing the dose-response chart with pairwise statistics can't see both simultaneously

**Recommendation:** Consider promoting Time-course to its own tab (Evidence | Time-course | Hypotheses | Metrics). The Evidence tab becomes Charts + Pairwise — two sections that relate directly and fit in one viewport.

### IA-03: Hypotheses tab mixes exploration and assessment

The Hypotheses tab contains:
- **Exploration tools:** Shape (interactive chart), Pareto (volcano scatter), Correlation, Outliers
- **Assessment tool:** Causality (Bradford Hill worksheet with persistence)

These serve fundamentally different purposes:
- Exploration tools are read-only, disposable, and non-persisted ("Does not affect conclusions")
- Causality is a write operation with a save button that persists to the annotation system ("Persists assessment")

The small italic text "Persists assessment" vs. "Does not affect conclusions" in the toolbar (line 2058-2059) is the only signal distinguishing these categories.

**Impact:** A toxicologist using the Causality tool may not realize they're writing durable data. Conversely, they may not find the Causality tool at all since it's nested inside a "Hypotheses" tab next to placeholder tools.

**Recommendation:** Move the Causality worksheet out of Hypotheses. Either:
- Make it a collapsible section in the context panel (near Tox Assessment, which is the same category of work)
- Or promote it to its own tab

### IA-04: Three of six hypothesis tools are non-functional placeholders

Model Fit, Correlation, and Outliers are placeholder stubs with "Requires Datagrok compute backend" or "Available in production" notes. This is 50% of the tool palette.

**Impact:** Medium-high. Showing non-functional tools:
- Creates false expectations about current capabilities
- Dilutes attention from the three functional tools
- The "Add to favorites" + "right-click to remove" interaction model around placeholders is premature

**Recommendation:** Remove placeholder tools entirely, or visually distinguish them (grayed out, "Coming soon" badge). The toolbar should show only functional tools by default.

### IA-05: Pairwise table columns include always-empty fields

The pairwise table shows both Mean/SD (continuous) and Incidence (from Metrics tab columns). The Effect column shows `effect_size` (= `pw?.cohens_d`), which is `null` for all incidence endpoints per SLA-13.

Similarly, the Metrics tab shows all 13 columns regardless of data type — for continuous endpoints, Incidence is always "—"; for categorical, Mean/SD are always "—".

**Impact:** Medium. Wasted columns create visual noise and make the table harder to scan.

**Recommendation:** Conditionally show columns based on the selected endpoint's data type, or group endpoints by data type and show appropriate columns for each.

### IA-06: Summary header shows study-level NOAEL, not endpoint-level

Lines 707-719 show the NOAEL from `noaelSummary`, which is a study-level determination (Combined sex or first available). When viewing a specific endpoint that's significant at dose level 3 but the study NOAEL is at dose level 2, the toxicologist sees a NOAEL that doesn't relate to the endpoint they're examining.

**Impact:** Medium. Potentially misleading. The endpoint-specific NOAEL onset dose would be more useful here.

**Recommendation:** Either show the endpoint's own LOAEL/NOAEL (derivable from the pairwise data by finding the lowest significant dose), or remove NOAEL from this header and leave it for the NOAEL Determination view.

---

## 4. Domain-specific issues

### D-01: `computeSignalScore` duplicated and inconsistent

DoseResponseView defines its own `computeSignalScore` (line 119-123):
```ts
function computeSignalScore(minTrendP: number | null, maxEffect: number | null): number {
  const pPart = minTrendP != null && minTrendP > 0 ? -Math.log10(minTrendP) : 0;
  const ePart = maxEffect != null ? Math.abs(maxEffect) : 0;
  return pPart + ePart;
}
```

This adds `-log10(p)` directly to `|effect_size|` — mixing incompatible scales. For context:
- `-log10(0.001)` = 3.0
- `|Cohen's d|` of 0.8 (large effect) contributes only 0.8
- `|avg_severity|` of 2.0 (mild INHAND grade, MI domain) contributes 2.0

So an MI finding with mild severity (2.0) and borderline significance (p=0.05, -log10=1.3) scores 3.3, while a continuous finding with a large statistical effect (d=0.8) and strong significance (p=0.001) scores 3.8 — they appear similar despite very different evidence profiles.

This is the same `max_effect_size` overloading issue documented in the scientific logic audit (SLA-02), but with a separate local implementation.

**Impact:** The signal score drives endpoint ranking in `deriveEndpointSummaries` (line 228), which determines what the user sees at the top of the endpoint list.

**Recommendation:** Remove the local `computeSignalScore`. Use the canonical implementation from `findings-rail-engine.ts`, or — better — rank by p-value alone within data type, since effect size is not cross-type comparable.

### D-02: `generateConclusion` uses raw effect size without data-type awareness

Line 242: `parts.push(\`max effect size ${ep.max_effect_size.toFixed(2)}\`)` — shows raw `max_effect_size` regardless of whether it's Cohen's d or avg_severity.

This is a downstream instance of SLA-01/SLA-03 from the scientific logic audit.

**Recommendation:** Use `getEffectSizeLabel`/`getEffectSizeSymbol` and branch on `ep.data_type`. For incidence endpoints, show "avg severity" or "incidence rate", not "effect size".

### D-03: Summary header effect size threshold styling assumes Cohen's d

Lines 693-698: Bold styling applied at thresholds 0.5 (medium) and 0.8 (large):
```tsx
selectedSummary.max_effect_size >= 0.8 ? "font-semibold"
  : selectedSummary.max_effect_size >= 0.5 ? "font-medium" : ""
```

These are Cohen's d conventions. For MI (histopath) endpoints, `max_effect_size` is avg_severity — a value of 0.8 means MINIMAL grade, which should not be styled as "large."

**Impact:** High. Visual emphasis on MI findings is systematically incorrect. Every graded MI finding gets bold styling.

### D-04: Volcano scatter (Pareto) mixes incompatible metrics on X axis

Lines 2248-2258: X axis = `Math.abs(ep.max_effect_size!)`. This is SLA-06 from the audit. The scatter has reference lines at g=0.5 and g=0.8 (dose-response-charts.ts:975-995), which are meaningless for incidence endpoints.

All MI findings cluster to the right of the "large effect" reference line regardless of clinical significance.

**Recommendation:** Either:
- Filter to continuous-only endpoints in the volcano scatter
- Or use `computeWithinTypeRank()` (already implemented for the Findings scatter) to normalize within data type

### D-05: Context panel Statistics averages means across sexes

Lines 121-125 of DoseResponseContextPanel:
```ts
const avgMean = levelRows.every((r) => r.mean != null)
  ? levelRows.reduce((sum, r) => sum + (r.mean ?? 0), 0) / levelRows.length
  : null;
```

This averages male and female group means to produce a single "mean" per dose level. For endpoints with sex differences (which are common in toxicology — liver enzyme baselines differ substantially between sexes), this produces a number that doesn't correspond to any real group's measurement.

**Impact:** High (scientifically incorrect). A toxicologist would never average across sexes without first verifying homogeneity.

**Recommendation:** Remove this aggregation. Show sex-stratified data, or remove the Statistics pane entirely (see R-02).

### D-06: "Data: continuous" label should show statistical method

Line 704-706: `Data: {selectedSummary.data_type}` shows "continuous" or "categorical." This tells the toxicologist nothing they don't already know from the endpoint domain. What they want is the **statistical method** used: "Dunnett" or "Williams" or "Fisher" — information that affects how they interpret the p-values.

The Metrics tab column does show Method (line 472-477), but the summary header doesn't.

**Recommendation:** Replace "Data: continuous" with "Method: Dunnett" (or whatever `statMethods` specifies).

### D-07: No fold change shown anywhere for continuous endpoints

Fold change (treatment mean / control mean) is the most intuitive dose-response metric for toxicologists. It's how findings are discussed in study reports: "ALT was elevated 3.2-fold at high dose."

The backend computes `max_fold_change` (per FIELD-15), but `flattenFindingsToDRRows` doesn't include it (line 262 reads `pw?.cohens_d`, not `max_fold_change`). The entire dose-response view shows effect size (Cohen's d or Hedges' g) but never fold change.

**Impact:** Medium. Cohen's d is statistically rigorous but unfamiliar to most toxicologists. Fold change is universally understood in the field.

**Recommendation:** Add fold change to the pairwise table or as a summary header metric. Can be derived: `mean / controlMean` for dose_level > 0.

### D-08: Sex divergence computed but never displayed

Lines 182-206 compute `sex_divergence` (|d_M - d_F|) and `divergent_sex` per endpoint. These are stored in `EndpointSummary` but never rendered.

Sex-specific sensitivity is a critical dose-response characteristic. If a liver enzyme shows d=1.5 in females but d=0.2 in males, that's essential information for NOAEL determination (the NOAEL might be sex-specific).

**Recommendation:** Show sex divergence in the summary header when it exceeds a meaningful threshold (e.g., |d_M - d_F| > 0.5). Example: "Sex divergence: F >> M (|d| diff: 1.3)".

### D-09: No control group visual distinction

The pairwise table (lines 1058-1111) and context panel statistics table (lines 202-252) render dose level 0 (vehicle control) identically to treatment groups. The control group is the reference against which all comparisons are made — it should be visually distinct.

**Recommendation:** Add subtle background styling or a label for the control group row (e.g., "Vehicle" label, or `bg-muted/20` background).

---

## 5. Interaction and UX issues

### UX-01: No endpoint list/picker in the center panel

The dose-response view has no visible endpoint selector of its own. Endpoints are selected by:
- Clicking the organ rail (left panel)
- Clicking a point on the volcano scatter (Hypotheses > Pareto)
- Clicking a row in the Metrics tab
- State passed from other views via navigation

There's no scannable list of endpoints sorted by signal strength, which is the natural entry point for dose-response review. Compare with the Findings view, which has a prominent left rail with a ranked endpoint list.

**Impact:** High. The user has to switch tabs or use the organ rail to find endpoints. This is a critical workflow gap for a dedicated dose-response analysis view.

**Recommendation:** Either add a left rail with a ranked endpoint list (matching the Findings view pattern), or make the Metrics tab the default landing tab with prominent endpoint selection.

### UX-02: Tab default should be reconsidered

The default tab is "Evidence" (line 279). On first load, the user sees charts for the auto-selected endpoint. But without an endpoint picker in the center panel (UX-01), the user may not know:
- Which endpoint is currently selected
- What other endpoints exist
- Why this endpoint was auto-selected

The endpoint name appears only in the summary header context line (small text) and the context panel header.

**Recommendation:** Either default to Metrics (gives overview first) or add the endpoint label prominently in the summary header.

### UX-03: Context panel test method hardcoded

DoseResponseContextPanel line 150:
```ts
test_method: rows[0].data_type === "continuous" ? "Dunnett" : "Fisher",
```

This doesn't respect the user's stat method settings (`useStatMethods`). If the user switched to Williams' test, the context panel still says "Dunnett."

**Recommendation:** Use `useStatMethods` to derive the correct test method name.

### UX-04: Hypotheses toolbar is over-engineered for current state

The favorites/pin/right-click/search/dropdown system (lines 1913-2061) is ~150 lines of interaction code for a toolbar with 3 functional and 3 placeholder items. Features:
- Favorites with reordering
- Right-click context menu to toggle pin
- Searchable dropdown
- Per-item icons

This is premature complexity for 6 items (3 functional). A simple radio button group would serve better until the tool count justifies the current chrome.

**Recommendation:** Simplify to a static button group: `[Shape] [Pareto] [Causality]`. Reintroduce the dropdown when more tools are functional.

### UX-05: Causality worksheet has no summary/preview state

The Causality worksheet is always shown in full form view — 5 computed criteria, 4 expert criteria, overall assessment, comments. Even for an unassessed endpoint, the user sees 9+ rows with dot gauges and dropdowns.

**Impact:** The worksheet takes significant vertical space even when the user hasn't interacted with it. There's no collapsed/preview state showing just the overall verdict.

**Recommendation:** Show a compact summary when previously assessed: "Likely causal (5/9 criteria assessed)". Expand to full form on click.

---

## 6. Cross-cutting concerns

### CC-01: DoseResponseView.tsx is 2872 lines

This file contains:
- Data derivation (`deriveEndpointSummaries`, `generateConclusion`, `computeSignalScore`)
- Three tab content components (`ChartOverviewContent`, `HypothesesTabContent`, `MetricsTableContent`)
- Five hypothesis sub-components (Shape, Model, Pareto, Correlation, Outliers placeholders)
- `CausalityWorksheet` with full annotation CRUD
- `TimecourseSection` with CL and continuous variants
- `TimecourseCharts` and `TimecourseTable` components
- Column definitions and table configuration

**Recommendation:** Extract at minimum:
- `CausalityWorksheet` → own file (it's 350+ lines with its own state management and annotation hooks)
- `TimecourseSection` + children → own file (~550 lines)
- Hypothesis placeholders → own file (~250 lines)
- `deriveEndpointSummaries` + helpers → move to `lib/derive-summaries.ts` (avoid collision with the existing function of the same name there)

### CC-02: Two `deriveEndpointSummaries` functions exist

1. `DoseResponseView.tsx:125` — local, takes `DoseResponseRow[]`, produces `EndpointSummary` (local type)
2. `lib/derive-summaries.ts:281` — canonical, takes `AdverseEffectSummaryRow[]`, produces `EndpointSummary` (exported type)

These derive similar but different summaries from different source data. The local version includes `sex_divergence`, `has_timecourse`, and `signal_score`. The canonical version includes `severity`, `treatmentRelated`, and `maxFoldChange`.

**Impact:** Bug risk. Changes to one won't propagate to the other. The `signal_score` computation differs.

---

## 7. Summary of findings by priority

### Must-fix (scientifically incorrect or misleading)

| ID | Issue | Lines | Category |
|----|-------|-------|----------|
| D-03 | Effect size threshold styling assumes Cohen's d for MI endpoints | 693-698 | Domain |
| D-04 | Volcano scatter mixes incompatible metrics on X axis (= SLA-06) | 2248-2258 | Domain |
| D-05 | Context panel averages means across sexes | CP:121-125 | Domain |
| D-01 | Local `computeSignalScore` adds incompatible scales (= SLA-02) | 119-123 | Domain |
| D-02 | `generateConclusion` uses raw effect size, no data-type label | 231-256 | Domain |

### Should-fix (high UX impact)

| ID | Issue | Lines | Category |
|----|-------|-------|----------|
| UX-01 | No endpoint list/picker in center panel | — | UX |
| R-02 | Dose-level statistics in 3 places (pairwise, CP, timecourse table) | Multiple | Redundancy |
| IA-01 | Context panel shows Insights before Statistics (conclusion before evidence) | CP:188 | IA |
| IA-02 | Evidence tab stacks 3 disparate sections (charts, timecourse, pairwise) | 940-1111 | IA |
| R-06 | Conclusion text enumerates metrics already visible nearby | 231-256 | Redundancy |
| IA-03 | Causality worksheet buried in Hypotheses tab alongside placeholders | 2097-2106 | IA |

### Nice-to-fix (polish, consistency)

| ID | Issue | Lines | Category |
|----|-------|-------|----------|
| D-06 | "Data: continuous" should show stat method | 704-706 | Domain |
| D-07 | No fold change shown (most intuitive metric for toxicologists) | — | Domain |
| D-08 | Sex divergence computed but never displayed | 182-206 | Domain |
| D-09 | No control group visual distinction | 1058-1111 | UX |
| UX-03 | Context panel test method hardcoded to Dunnett/Fisher | CP:150 | UX |
| UX-04 | Hypotheses toolbar over-engineered for 3 functional tools | 1913-2061 | UX |
| UX-05 | Causality worksheet has no collapsed/summary state | 2614-2870 | UX |
| IA-04 | 3 of 6 hypothesis tools are non-functional placeholders | 1889-1896 | IA |
| IA-05 | Pairwise/Metrics table shows always-empty columns | 380-480 | IA |
| R-03 | Pattern shown in 3 places (badge, conclusion, pairwise column) | Multiple | Redundancy |
| CC-01 | File is 2872 lines — should extract major sub-components | — | Code |
| CC-02 | Two `deriveEndpointSummaries` functions with different schemas | 125, DS:281 | Code |
| IA-06 | Summary header shows study-level NOAEL, not endpoint-level | 707-719 | IA |
| R-01 | Endpoint identity shown 3 times (summary, CP, causality) | Multiple | Redundancy |

---

## 8. Recommended restructuring

### Context panel reorder

**Current:** Insights → Statistics → Correlations → Tox Assessment → Related Views

**Proposed:** Insights → Correlations → Tox Assessment → Related Views

Remove Statistics pane (redundant with pairwise table). Move Insights to top since, with Statistics gone, it becomes the primary value-add of the context panel — showing computed rule results that the center panel doesn't.

### Evidence tab restructuring

**Current:** Charts + Time-course + Pairwise table (vertical stack, scrollable)

**Option A — Promote time-course to its own tab:**
- Evidence: Charts + Pairwise (fits in one viewport)
- Time-course: temporal analysis (separate analytical question)
- Hypotheses: keep as-is
- Metrics: keep as-is

**Option B — Collapsible sections with smarter defaults:**
- Time-course defaults to collapsed unless the endpoint has temporal data with >1 timepoint
- Pairwise table moves above time-course (higher priority for dose-response analysis)

### Hypotheses tab cleanup

- Remove placeholder tools (Model, Correlation, Outliers) until implemented
- Move Causality to context panel or its own tab
- Remaining: Shape + Pareto in a simplified toolbar

---

*Created: 2026-03-11*
*Source files: DoseResponseView.tsx (2872 lines), DoseResponseContextPanel.tsx (376 lines), dose-response-charts.ts, derive-summaries.ts*

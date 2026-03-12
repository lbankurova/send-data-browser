# Findings ↔ Histopathology Merge Audit

**Date:** 2026-03-11
**Framework:** `view-consistency-audit-framework.md`
**Scope:** Should HistopathologyView merge into FindingsView? If so, how?

---

## A. Identity — Side by Side

| # | Question | FindingsView | HistopathologyView |
|---|----------|-------------|-------------------|
| A1 | Primary selection unit | Endpoint (UnifiedFinding) | Specimen → Finding (two-level) |
| A2 | What question? | "Which endpoints show significant treatment-related changes?" | "What histopathological findings are in this specimen, are they dose-dependent, and do they recover?" |
| A3 | Primary persona | Toxicologist (study-level triage) | Pathologist (organ-level deep dive) |
| A4 | Reachable from other view? | No (this IS the entry point) | **Yes** — MI/MA endpoints already appear in FindingsView scatter + table |
| A5 | Entry point | Navigation, study landing | Navigation, cross-link from FindingsView |

**Assessment:** The questions are not the same — FindingsView is triage ("what's interesting?"), HistopathView is deep dive ("tell me everything about this organ"). But A4 is the critical flag: histopath findings are already selectable in FindingsView. When a user clicks "hepatocellular hypertrophy" in FindingsView, they get FindingsContextPanel. When they click it in HistopathView, they get HistopathologyContextPanel. Two different panels for the same data entity.

**A2 reframed:** HistopathView's question is really a *scoped* version of FindingsView's question — "which endpoints show signal" narrowed to "which findings show signal *within this specimen*." The additional depth (recovery, severity grades, subject-level data) is context panel content, not a different question.

---

## B. Information Architecture — FindingsView

### B1. Rail (FindingsRail)

| # | Answer |
|---|--------|
| B1.1 | Lists endpoints, grouped by organ / finding / syndrome |
| B1.2 | 3 grouping modes (organ, finding, syndrome) × 4 sort modes (signal, pvalue, effect, alpha) |
| B1.3 | Per item: severity dot, pattern glyph, p-value, effect size, clinical severity badge, sex divergence |
| B1.4 | Click changes both main area (table highlights row) and context panel (opens endpoint detail) |

### B2. Main Area

| # | Answer |
|---|--------|
| B2.1 | **No tabs.** Single mode: scatter + table stacked vertically |
| B2.2 | (1) Quadrant scatter (effect size × p-value, all endpoints), (2) Findings table (13+ columns, all endpoints) |
| B2.3 | Scatter: No — multi-item triage visualization, needs full width. Table: No — multi-item, 13+ columns |
| B2.4 | Overview of many items (all endpoints in study) |
| B2.5 | Rail filters (search, domain, pattern, severity, TR-only, sig-only). Header: scheduled-only toggle |

### B3. Context Panel (FindingsContextPanel)

| # | Answer |
|---|--------|
| B3.1 | Single level: endpoint-level. Falls back to organ/syndrome scope panel when no endpoint selected |
| B3.2 | 16 panes: Header → Verdict → Recovery verdict line → Sex comparison → Dose detail → Time course → Distribution → Recovery → Statistical evidence → OM normalization → ANCOVA → Decomposed confidence → Patterns → Correlations → Effect ranking → Related views |
| B3.3 | Shared: Verdict, Dose detail, Time course, Distribution, Recovery, Evidence, ANCOVA, Correlations, Context (effect ranking) |
| B3.4 | Unique: RecoveryVerdictLine, SexComparisonPane, OM normalization note, DecomposedConfidencePane |
| B3.5 | RecoveryVerdictLine: domain data (different queries for histopath vs continuous). SexComparison: **independently built** (no equivalent in histopath). OM normalization: domain data. Decomposed confidence: **independently built** |

---

## B. Information Architecture — HistopathologyView

### B1. Rail (SpecimenRailMode)

| # | Answer |
|---|--------|
| B1.1 | Lists specimens (organs), one entry per specimen examined |
| B1.2 | 5 sort modes (signal, organ-grouped, severity, incidence, alpha). 1 filter: dose trend pattern |
| B1.3 | Per item: review status, pattern glyph, max severity, peak incidence, finding count, adverse count, sentinel badge, syndrome name, organ system, domain labels |
| B1.4 | Click changes main area (loads specimen data into table/charts/matrix) AND context panel (opens specimen overview) |

### B2. Main Area

| # | Answer |
|---|--------|
| B2.1 | **3 tabs:** Evidence (default), Hypotheses, Compare |
| B2.2 | Evidence tab: (1) Findings table (9 columns, findings within selected specimen), (2) Dose charts (incidence + severity, dual bar charts), (3) Severity matrix — group mode (findings × dose heatmap) and subject mode (subjects × findings heatmap) |
| B2.3 | See analysis below |
| B2.4 | Data for ONE selected specimen. Multi-item within that scope (multiple findings) |
| B2.5 | Sex filter, min severity filter (local to view) |

**B2.3 — Could each main area visualization live in the context panel?**

| Visualization | Context panel? | Analysis |
|---------------|:-:|----------|
| Findings table | No | Multi-item, needs sorting/filtering. But it's scoped to one specimen — typically 3–15 findings. Smaller than FindingsView's table. Could technically be a pane, but would be cramped |
| Dose charts (incidence + severity) | **Yes** | Shows data for one specimen or one selected finding. Already single-item scoped. Dual bar charts would fit in a collapsible pane at ~200px height each |
| Severity matrix (group mode) | **Marginal** | Findings × dose groups. Width is the constraint — needs ~6 dose columns × ~10 finding rows. Tight in a 350px context panel but feasible with horizontal scroll. Value: pattern detection across findings simultaneously |
| Severity matrix (subject mode) | No | Wide (subjects × findings), interactive (filters, sort, toggles). Needs main area space |
| Hypotheses tab | **Yes** | Syndrome analysis for one specimen. Already single-item detail. Natural context panel pane |
| Compare tab | No | Side-by-side subjects. Needs full width |

### B3. Context Panel (HistopathologyContextPanel)

**Specimen level (9 panes):**

| # | Pane | Shared? | Why unique? |
|---|------|---------|-------------|
| 1 | Header (name, metrics, organ, domains) | Shared (ContextPanelHeader) | — |
| 2 | Insights (treatment-related, clinical, decreased) | **Unique** | Histopath-specific rule engine output |
| 3 | Syndrome detected | **Unique** | Histopath-specific syndrome detection |
| 4 | Lab correlates | **Unique** | Histopath-specific lab correlation mapping |
| 5 | Peer comparison (HCD) | **Unique** | Histopath-specific historical control comparison |
| 6 | Recovery assessment (table) | **Unique** | Specimen-level recovery classifications |
| 7 | Laterality | **Unique** | Paired organs only (histopath) |
| 8 | Pathology review form | **Unique** | Histopath annotation workflow |
| 9 | Related views | Shared pattern | — |

**Finding level (15 panes):**

| # | Pane | Shared? | Why unique? |
|---|------|---------|-------------|
| 1 | Header | Shared | — |
| 2 | Insights + HCD inline | **Unique** | Histopath rule output + HCD context mixed in |
| 3 | Dose-response pattern | **Independently built** | FindingsView has Verdict pane with pattern. Different rendering, same data |
| 4 | Concordant findings | **Unique** | Histopath syndrome context at finding level |
| 5 | Dose detail table | **Independently built** | FindingsView has DoseDetailPane. Different format (incidence table vs stats table) |
| 6 | Result modifiers (SUPP) | **Unique** | Histopath-specific supplementary qualifiers |
| 7 | Sex comparison | **Independently built** | FindingsView has SexComparisonPane. Different rendering |
| 8 | Recovery (dose-level detail) | **Independently built** | FindingsView has RecoveryPane. Different format (finding-specific incidence deltas vs group means) |
| 9 | Correlating evidence | **Independently built** | FindingsView has CorrelationsPane. Different scope |
| 10 | Lab correlates | **Unique** | Finding-level lab correlation |
| 11 | Laterality | **Unique** | Paired organ laterality |
| 12 | Pathology review | **Unique** | Annotation form |
| 13 | Tox assessment | **Unique** | Second annotation form |
| 14 | Related views | Shared | — |

**B3.5 verdict:** Of 15 finding-level panes, **5 are independently built duplicates** of FindingsContextPanel panes (dose-response pattern, dose detail, sex comparison, recovery, correlating evidence). They show the same conceptual data with different rendering because they were built separately. This is the strongest signal for convergence.

---

## C. Redundancy

| # | Question | Answer |
|---|----------|--------|
| C1 | Main area ↔ context panel at same detail? | **HistopathView: Yes.** Summary strip in main area duplicates Overview pane in context panel (~80% overlap). Dose charts in main area show same data as Dose detail pane in context panel (different format). FindingsView: No significant overlap |
| C2 | Rail ↔ main area at same detail? | Both views: acceptable master-detail (rail shows summary, main shows detail) |
| C3 | Within context panel, two panes same data? | **HistopathView: Yes.** Insights pane contains recovery insight + HCD context that also appear in dedicated Recovery and Peer Comparison panes. Pattern in header AND dedicated pane |
| C4 | **Cross-view:** main area duplicates? | **Yes.** FindingsView table shows MI/MA endpoints with p-value, effect size, severity, pattern. HistopathView findings table shows the same findings with incidence, severity, signal, dose-dependence. Same findings, different columns. A user can see "hepatocellular hypertrophy" in both views |

**C4 is the core redundancy.** Every histopath finding exists in both views. The HistopathView adds incidence detail, recovery, and severity grading — but these are depth, not different data.

---

## D. Composability — Concrete Content Mapping

Instead of asking "could it be a tab?", let's map each actual piece of HistopathView content to its destination.

### D1. HistopathView findings table → FindingsView table (scoped)

**What it is:** Table of findings within selected specimen. 9 columns: finding name, distribution (SUPP), peak severity, incidence%, signal, dose-dependent (with method dropdown), recovery verdict, laterality, also-in (R16).

**FindingsView table already shows MI/MA findings.** When scoped to a specimen via the rail, it shows the same rows. FindingsView's table has per-dose-group columns showing values — for MI/MA data, those show incidence per dose group. That's actually *more* information than HistopathView's table, which only shows peak incidence as a single column.

**Unique histopath columns that FindingsView table lacks:**

| Column | Where it goes | Rationale |
|--------|--------------|-----------|
| Distribution (SUPP) | Context panel (Result modifiers pane) | Per-finding detail, not triage info |
| Dose-dependent (with 5-method dropdown) | Context panel (Verdict or Dose detail pane) | Method selection is per-finding analysis, not scan-level. The verdict (dose-dependent: yes/no) could be a table column, but the method selector belongs in the context panel |
| Recovery verdict | Context panel (Recovery pane) | Already exists there. A summary badge in the table column is possible but not essential |
| Laterality | Context panel (Laterality pane) | Per-finding detail |
| Also-in (R16 cross-organ) | Context panel (Correlations pane) | Already exists there |

**Verdict:** FindingsView's table absorbs the histopath findings table. No new table component needed. The rail scopes it to one specimen's findings. The unique columns are per-finding detail that belongs in the context panel.

### D2. Dose charts → Context panel pane

**What they are:** Dual bar charts — incidence by dose and severity by dose. Show data for the selected specimen aggregate, or filtered to the selected finding.

**This is single-item data.** Whether scoped to a specimen or a finding, it's one entity's dose-response visualized as bars. The FindingsView context panel already has DoseDetailPane showing dose-response as a stats table. Adding a bar chart rendering (or a separate pane) is straightforward. Two charts at ~180px height each = 360px, well within context panel scroll space.

**Verdict:** Context panel pane. Appears for MI/MA findings. Could be a chart mode within existing DoseDetailPane or a separate "Dose-incidence chart" pane.

### D3. Severity matrix GROUP mode → Three options

**What it is:** Findings × dose groups heatmap. Rows = findings in selected specimen (typically 3–15). Columns = dose groups (typically 4–6 + recovery groups). Cells = severity heat or incidence heat. Total size: ~10 rows × ~8 columns.

**The core question:** does this visualization reveal patterns that FindingsView's table (scoped to the same specimen) cannot?

FindingsView's table already has per-dose-group columns. When scoped to a specimen, it shows:

```
Finding          | C    | Low  | Mid  | High | p-value | severity
hypertrophy      | 0/10 | 2/10 | 5/10 | 8/10 | 0.001   | adverse
vacuolation      | 1/10 | 1/10 | 3/10 | 4/10 | 0.04    | warning
necrosis         | 0/10 | 0/10 | 0/10 | 2/10 | 0.23    | normal
```

The severity matrix shows the same data with colored cells instead of text. The color makes dose-progression patterns visible at a glance — but the table's numbers already show the same progression.

**Option A: No matrix. Table is enough.** The table already shows per-dose data. Sort by signal strength and scan. Simplest approach.

**Option B: Context panel pane at specimen level.** When a specimen is selected from the rail (no specific finding clicked), the context panel shows a compact severity matrix as one of the specimen-level panes. Width-constrained (~350px) but feasible with ~80px per dose column for 4–6 groups. This is where the user scans the specimen before drilling into a finding.

**Option C: Heat-colored cells in FindingsView's table.** Instead of showing text values ("2/10") in dose columns for MI/MA data, show heat-colored cells with the same grayscale ramp the matrix uses. The table becomes the matrix — same data, same visual encoding, no separate visualization.

**Recommendation: Option C.** It eliminates the matrix entirely by giving the table the matrix's visual power. Option B is the fallback if the table cells are too small for readable heat encoding.

### D4. Subject heatmap (SUBJECT mode) → Drilldown

**What it is:** Individual animals × findings heatmap. Rows = subjects (up to 60+). Columns = findings. Interactive: affected-only toggle, sort by dose/severity, dose group filter, severity-graded-only filter, comparison subject selection.

**This can't fit in the context panel.** Too wide, too interactive, too many rows. It's also an infrequent workflow — individual animal analysis is a deep dive, not the default view.

**Destination:** Drilldown from context panel. A "View subjects" button in the specimen-level context panel opens a modal/overlay with the full subject heatmap. The modal has room for the filters and interactive controls.

### D5. Hypotheses tab → Context panel pane

**What it is:** Syndrome analysis for the selected specimen. Shows detected syndromes with required/supporting findings, concordant dose groups, related organs.

**The context panel already has a "Syndrome detected" pane** at specimen level (HistopathContextPanel pane #3). The Hypotheses tab is an expanded version. Merging means enriching the existing syndrome pane with the hypotheses tab's additional detail (concordance, interpretation notes), not adding a new tab.

### D6. Compare tab → Drilldown

**What it is:** Side-by-side subject comparison. Triggered by selecting 2+ subjects in the subject heatmap, then clicking "Compare."

**This is a chained drilldown** from D4 (subject heatmap). It follows the same pattern: modal/overlay launched from the subject heatmap drilldown. Infrequent, needs full width, not a primary workflow.

### D7. Rail: Specimen as a grouping mode

**What SpecimenRailMode does:** Lists specimens sorted by signal/severity/incidence/alpha, with organ-system grouping. Per-item shows: review status, pattern glyph, max severity, peak incidence, finding count, adverse count, sentinel badge, syndrome name.

**FindingsRail already has "organ" grouping** which groups endpoints by organ system. A "specimen" grouping mode would list individual specimens (LIVER, KIDNEY, etc.) — same concept as organ but at the specimen level. FindingsRail already renders domain-aware info per item (BW normalization tier for OM endpoints). Adding histopath-specific metrics (incidence, severity grade, recovery status) follows the same pattern.

**Verdict:** Specimen becomes the 4th grouping mode in FindingsRail (organ, finding, syndrome, specimen). When active, cards = specimens, items = findings within that specimen. Click a card → scope the table to that specimen. Click a finding → select it in the table + open context panel.

---

## E. Domain-Specific Rendering

| # | Question | Answer |
|---|----------|--------|
| E1 | Unique visualization? | (1) Severity matrix — but the table with heat-colored cells achieves the same thing (see D3 Option C). (2) Subject heatmap — genuinely unique, handled as drilldown. (3) Dose bar charts — context panel pane |
| E2 | Could live in context panel? | Dose charts: **yes**. Subject heatmap: **no** (drilldown). Severity matrix: **replaced by heat-colored table cells** or **yes** as specimen-level pane |
| E3 | Does it need a tab? | **No.** No new tabs needed. Rail scopes the data, table adapts columns, context panel adapts panes |
| E4 | Requires cross-item comparison? | Subject heatmap only. Handled as modal drilldown, not permanent main-area section |
| E5 | Fundamentally different data structure? | Incidence-based vs magnitude-based. But FindingsView's table already handles MI/MA data in its dose columns. The difference is rendering (heat vs text), not structure |

---

## F. Decision Matrix

| Criterion | Score | Evidence |
|-----------|-------|----------|
| Unique primary question (A2) | **Weak** | HistopathView's question is FindingsView's question scoped to one specimen + deeper |
| Unique selection unit not reachable elsewhere (A4) | **Against** | MI/MA findings already appear in FindingsView |
| Main area shows multi-item overview essential to workflow (D6) | **No** | FindingsView's table scoped to specimen IS the overview. Severity matrix is a rendering choice, not unique content |
| Unique visualization requiring cross-item comparison (E4) | **Drilldown** | Subject heatmap is a modal, not a view. Severity matrix is absorbed into table |
| Rail content is natural grouping mode elsewhere (D1) | **Against separate view** | Specimen list fits as FindingsRail grouping mode |
| Same data entity reachable from another view (A4) | **Against separate view** | Core redundancy — same findings, two context panels |
| Context panel panes mostly unique due to independent build (B3.5) | **Against separate view** | 5 of 15 finding-level panes are independently built duplicates |

### Verdict: **Merge. No new tabs. Rail scoping + domain-polymorphic context panel + drilldowns.**

HistopathologyView's content maps entirely onto FindingsView's existing architecture:
- The **table** scoped by the rail already shows specimen findings
- The **context panel** gains domain-polymorphic panes
- The **subject heatmap** and **subject comparison** become drilldowns (modal/overlay)
- No new tabs are needed

---

## G. Merge Architecture

### G1. FindingsView main area: No change

The scatter + table layout stays. No tabs added. When the rail scopes to a specimen, the table filters to that specimen's findings. The scatter shows those findings as dots (fewer dots, same visualization).

**Table domain-awareness:** When showing MI/MA findings, the per-dose-group columns render with heat-colored cells (grayscale severity or incidence ramp) instead of plain text. This gives the table the matrix's visual scanning power. The existing `getNeutralHeatColor()` utility already produces the right colors.

### G2. FindingsRail: Specimen grouping mode

FindingsRail gains a **"specimen"** grouping mode (4th mode alongside organ, finding, syndrome):
- Cards = specimens (LIVER, KIDNEY, etc.)
- Card click = scope table + scatter to that specimen's findings
- Per-item info adapts: review status, pattern glyph, max severity, peak incidence, adverse count, finding count, syndrome name
- Sort modes: signal, severity, incidence, alpha

### G3. Context panel: Domain-polymorphic panes

When a finding is selected, the context panel checks its domain. The pane stack adapts:

**Shared panes (all domains):**
1. Header
2. Verdict (with domain-appropriate metrics)
3. Sex comparison
4. Dose detail (polymorphic: incidence table + bar chart for MI/MA, stats table for continuous)
5. Recovery (polymorphic: incidence deltas for MI/MA, mean comparison for continuous)
6. Correlations (add cross-organ matches for MI/MA)
7. Related views

**Histopath-specific panes (MI/MA only):**
- Insights (treatment-related, clinical, decreased — histopath rule engine output)
- Peer comparison (HCD)
- Concordant findings (syndrome at finding level)
- Result modifiers (SUPP distribution/temporality)
- Laterality
- Lab correlates (histopath-specific organ-to-lab mapping)
- Pathology review form
- Tox assessment form

**Continuous-specific panes (LB/BW/OM/CL/FW):**
- Time course
- Distribution
- ANCOVA decomposition
- Decomposed confidence (ECI breakdown)
- OM normalization note

**Specimen-level context panel** (no specific finding selected, rail scoped to specimen):
- Specimen header with metrics
- Specimen insights (aggregate rule results)
- Syndrome detected (with concordance, related organs)
- Lab correlates (full table format)
- Peer comparison (HCD per finding)
- Recovery assessment (per-finding classification table)
- Laterality summary
- "View subjects" button → opens subject heatmap drilldown
- Pathology review form

### G4. Drilldowns (modal/overlay)

**Subject heatmap:** Launched from specimen-level context panel ("View subjects" button). Full-width modal with:
- Individual animals × findings heatmap
- Filters: affected-only, sort by dose/severity, dose group filter, severity-graded-only
- Comparison subject selection (checkbox per subject)
- "Compare selected" button → opens subject comparison

**Subject comparison:** Launched from subject heatmap. Side-by-side subject detail.

### G5. What gets consolidated

| Current duplication | Merged into |
|---|---|
| HistopathView findings table | FindingsView table, scoped by rail. Unique columns → context panel panes |
| HistopathView dose detail table vs FindingsView DoseDetailPane | Single polymorphic DoseDetailPane (incidence + bar chart mode for MI/MA) |
| HistopathView dose charts (incidence + severity bars) | DoseDetailPane chart mode or dedicated context panel pane |
| HistopathView severity matrix (group) | Heat-colored cells in FindingsView table dose columns, OR specimen-level context panel pane |
| HistopathView sex comparison vs FindingsView SexComparisonPane | Single SexComparisonPane (incidence format for MI/MA) |
| HistopathView recovery vs FindingsView RecoveryPane | Single polymorphic RecoveryPane (incidence deltas for MI/MA) |
| HistopathView correlating evidence vs FindingsView CorrelationsPane | Single CorrelationsPane (add cross-organ matches for MI/MA) |
| HistopathView dose-response pattern vs FindingsView Verdict pattern | Pattern info lives in Verdict pane |
| HistopathView insights vs FindingsView verdict | Verdict pane gains rule-based insights for MI/MA |
| HistopathView hypotheses tab vs syndrome context panel pane | Enriched syndrome pane in context panel |

### G6. Files affected

**Delete after merge:**
- `HistopathologyView.tsx` (~2400 lines)
- `HistopathologyViewWrapper.tsx`
- `HistopathologyContextPanel.tsx` (~2500 lines) → unique panes extracted, duplicates consolidated
- `SpecimenRailMode.tsx` (~500 lines) → absorbed into FindingsRail

**New files:**
- `panes/histopath/PeerComparisonPane.tsx` — extracted from HistopathContextPanel
- `panes/histopath/LateralityPane.tsx` — extracted
- `panes/histopath/InsightsPane.tsx` — extracted (histopath rule engine output)
- `panes/histopath/ResultModifiersPane.tsx` — extracted (SUPP)
- `components/SubjectHeatmapModal.tsx` — subject heatmap + comparison as drilldown

**Modified files:**
- `FindingsRail.tsx` — add specimen grouping mode
- `FindingsTable.tsx` — heat-colored cells for MI/MA dose columns
- `FindingsContextPanel.tsx` — domain-polymorphic pane selection, specimen-level pane set
- `DoseDetailPane.tsx` — add incidence rendering mode + optional bar chart
- `RecoveryPane.tsx` — add incidence delta rendering mode
- `SexComparisonPane.tsx` — add incidence format
- `CorrelationsPane.tsx` — add cross-organ matches

### G7. What's NOT part of this merge

- **Dose-Response view** — separate audit needed (different selection model: endpoint × dose curve)
- **NOAEL view** — separate audit needed (conclusion-oriented, not evidence-oriented)
- **Design system changes** — no visual design changes proposed
- **Backend changes** — none needed, all data endpoints remain the same

---

## Open Design Questions

### Q1. Severity matrix: heat table cells vs context panel pane?

**Option C** (heat-colored table cells) eliminates the matrix entirely. **Option B** (context panel pane at specimen level) preserves it as a compact reference. Both are valid. Option C is simpler. Option B gives a dedicated spatial view for pattern scanning.

**Recommendation:** Start with Option C. If users miss the matrix view, add it as a specimen-level context panel pane later.

### Q2. Dose charts: separate pane or DoseDetailPane chart mode?

DoseDetailPane already shows dose-response data as a stats table. Adding a bar chart toggle within the same pane keeps it compact. A separate pane adds scroll length. Chart-within-pane is more economical.

### Q3. Subject heatmap modal: how to trigger?

From specimen-level context panel, a "View subjects" button is the natural trigger. Could also be triggered from FindingsView's table header when scoped to a specimen (e.g., a "Subjects" button in the filter bar).

### Q4. Scatter plot value when scoped to one specimen?

A specimen may have 3–15 findings. The scatter plot with 5 dots is less useful than with 50+ endpoints. Options:
- Keep showing it (harmless, just sparse)
- Auto-collapse it when scoped to a specimen (table takes full height)
- Show a different specimen-level summary in that space

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| FindingsView becomes more complex | FindingsView.tsx stays as orchestrator (~430 lines). New complexity lives in FindingsContextPanel (pane selection logic) and FindingsRail (specimen mode). Both are additive |
| FindingsRail becomes overloaded | Specimen mode is additive. Existing 3 modes untouched. Rail is already domain-aware (BW tier for OM) |
| Context panel too long with domain panes | Domain filtering means you never see all panes — you see the right panes for the selected domain. Panes are collapsible |
| Subject heatmap loses discoverability in modal | Prominent "View subjects" button in specimen-level context panel. Can also add a button in the table filter bar when scoped to specimen |
| Loss of three-section resizable layout | The three-section layout (table + charts + matrix) was histopath-specific. In the merged view, the table IS the overview, the charts are in the context panel, and the matrix is heat-colored table cells. No resizable sections needed |

---

## Summary

HistopathologyView's content maps onto FindingsView without new tabs or views:

1. **Rail** gains specimen grouping mode (4th mode in FindingsRail)
2. **Table** scoped by rail shows specimen findings; heat-colored dose cells replace the severity matrix
3. **Context panel** becomes domain-polymorphic — MI/MA findings get histopath-specific panes (peer comparison, laterality, insights, recovery with incidence deltas); continuous findings get their current panes
4. **Subject heatmap + comparison** become modal drilldowns from the context panel
5. **5 duplicate panes** consolidated into polymorphic shared components

The merge eliminates ~5400 lines of view-specific code (HistopathologyView + HistopathologyContextPanel + SpecimenRailMode), resolves the "two context panels for one finding" inconsistency, and produces a single coherent analysis surface.

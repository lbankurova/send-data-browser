# View Consistency Audit Framework

**Date:** 2026-03-11
**Scope:** Framework for evaluating any view or panel in SENDEX — drives merge/split decisions and cross-view consistency

---

## Purpose

SENDEX has multiple analytical views (Findings, Histopathology, Dose-Response, NOAEL). Each evolved independently. This framework asks the questions that determine whether a view earns its existence as a separate surface, or whether its content should be absorbed into another view as a tab, mode, or context panel pane.

The goal is a coherent app, not a collection of screens.

---

## How to Use

For each view under audit:

1. Fill out **Section A** (identity) to establish what the view does.
2. Fill out **Section B** (information architecture) to map where information lives.
3. Fill out **Section C** (redundancy) to find waste.
4. Fill out **Section D** (composability) to determine merge potential.
5. Fill out **Section E** (domain rendering) to identify genuinely unique needs.
6. Use the **Section F** decision matrix to reach a verdict.

Apply the same framework to both the view under audit AND the view it might merge into. Compare the two completed audits side by side.

---

## A. Identity

These questions establish what the view is for and whether that purpose is distinct.

| # | Question | Notes |
|---|----------|-------|
| A1 | What is the primary selection unit? (endpoint, specimen, organ, subject, finding) | The thing the user clicks to "drill in." |
| A2 | What question does the user come here to answer? | One sentence. If it takes a paragraph, the view may be trying to do too much. |
| A3 | Who is the primary user persona? | Toxicologist, pathologist, statistician, regulatory reviewer? |
| A4 | Can this selection unit be reached from another view? | If yes, the two views share a data entity. That's where inconsistency lives. |
| A5 | What is the entry point? | How does the user get here? Navigation, cross-link, rail click? |

**Red flag:** If A2 is the same for two views, one of them probably shouldn't exist.

---

## B. Information Architecture

Map the three-panel layout (rail, main area, context panel) for this view. For each zone, list what it shows.

### B1. Rail

| # | Question |
|---|----------|
| B1.1 | What does the rail list? (specimens, endpoints, organs, syndromes, groups) |
| B1.2 | What grouping/sorting modes are available? |
| B1.3 | What summary info appears per rail item? (counts, badges, signal indicators) |
| B1.4 | Does clicking a rail item change the main area, the context panel, or both? |

### B2. Main Area

| # | Question |
|---|----------|
| B2.1 | What tabs or modes exist? List each with a one-line description. |
| B2.2 | What visualizations are in the main area? (tables, charts, heatmaps, scatters) |
| B2.3 | For each visualization: could it live in the context panel instead? What would be lost? |
| B2.4 | Does the main area show data for one selected item, or an overview of many items? |
| B2.5 | What filters exist? Are they view-specific or shared across views? |

### B3. Context Panel

| # | Question |
|---|----------|
| B3.1 | What levels does the context panel operate at? (e.g., specimen-level → finding-level) |
| B3.2 | List every pane in order, per level. |
| B3.3 | Which panes are shared components (used by other views' context panels)? |
| B3.4 | Which panes are unique to this view? |
| B3.5 | For each unique pane: is it unique because of domain-specific data, or because it was built independently? |

**Red flag:** If B3.5 answers "built independently" for most unique panes, there's convergence opportunity.

---

## C. Redundancy

Redundancy is information appearing at the same zoom level without adding value. Master-detail repetition (rail shows summary, panel shows detail) is acceptable. Exact duplication at the same zoom level is waste.

| # | Question |
|---|----------|
| C1 | Does the main area show anything the context panel also shows, at the same detail level? |
| C2 | Does the rail show anything the main area also shows at the same detail level? |
| C3 | Within the context panel, do any two panes show the same data in different formats? |
| C4 | Across views: does this view's main area duplicate what another view shows for the same data entity? |

For each "yes": is the duplication justified? Justifications:
- **Scan vs. detail** — acceptable (rail summary → panel detail)
- **Different analytical lens** — acceptable if the lens is genuinely different
- **Same data, different format** — waste unless the format reveals different patterns
- **Historical accident** — waste

---

## D. Composability

These questions determine whether a view can be absorbed into another view.

| # | Question | Notes |
|---|----------|-------|
| D1 | Could this view's rail content be a grouping mode in another view's rail? | e.g., specimen list as a mode in FindingsRail |
| D2 | Could this view's main area be a tab in another view? | Would it make sense as "Evidence / Hypotheses / [this]"? |
| D3 | Could this view's unique context panel panes be added to another view's context panel, triggered by selecting the right data type? | Polymorphic context panel. |
| D4 | If merged, what user workflow would break or become harder? | This is the critical blocker question. |
| D5 | If merged, what information would be lost? | Should be "nothing" — if something is lost, the merge is wrong. |
| D6 | Does this view require seeing many items simultaneously in the main area in a way that a context panel can't support? | Tables/grids of 10+ items need main area space. Single-item detail can go in context panel. |

**Merge verdict:** If D1-D3 are all "yes" and D4/D5 are "nothing significant," the view should merge.

---

## E. Domain-Specific Rendering

Some domains genuinely need unique visualizations. This section separates "needs custom rendering" from "needs a separate view."

| # | Question |
|---|----------|
| E1 | Does this domain require a visualization that no other domain uses? Describe it. |
| E2 | Could that visualization be a context panel pane (detail for one selected item)? |
| E3 | Could that visualization be a tab in a shared main area? |
| E4 | Does the visualization require cross-item comparison (multiple items visible at once)? |
| E5 | Is the data structure fundamentally different? (incidence vs. magnitude, hierarchical vs. flat, categorical vs. continuous) |

**Key principle:** A unique data structure may need unique rendering, but unique rendering doesn't require a separate view. It requires a polymorphic panel or tab.

---

## F. Decision Matrix

After completing A-E, score the view:

| Criterion | Separate View | Tab/Mode | Context Panel Pane |
|-----------|:---:|:---:|:---:|
| Unique primary question (A2) | Required | -- | -- |
| Unique selection unit that can't be reached elsewhere (A4) | Strong signal | -- | -- |
| Main area shows multi-item overview essential to workflow (D6) | Strong signal | Possible | No |
| Unique visualization requiring cross-item comparison (E4) | Possible | Preferred | No |
| Unique visualization for single selected item (E2) | No | Possible | Preferred |
| Rail content is a natural grouping mode elsewhere (D1) | Against | -- | -- |
| Same data entity reachable from another view (A4) | Against | -- | -- |
| Context panel panes are mostly unique due to independent build (B3.5) | Against | -- | -- |

**Verdicts:**
- **Separate view**: Multiple "required" or "strong signal" scores, no "against" scores
- **Tab/mode in existing view**: Some unique rendering needs, but selection unit and rail are shareable
- **Absorb into context panel**: The view exists to show detail for a single item that's selectable elsewhere

---

## G. Cross-View Consistency Rules

Regardless of merge/split decisions, these rules apply across all views:

1. **Same entity, same context panel.** If two views can select the same data entity (e.g., a histopath finding), the context panel panes for that entity should be structurally identical. Differences in available panes are acceptable only when one view lacks the data to populate a pane.

2. **Rail modes are additive.** Adding a new grouping mode to an existing rail is cheaper than building a new rail. Before creating a new rail, verify the grouping can't be a mode.

3. **Tabs are cheap, views are expensive.** A new tab in the main area shares the rail, context panel, and navigation context. A new view shares nothing. Default to tab.

4. **Context panel panes are domain-polymorphic.** A "Recovery" pane should work for any domain. A "Dose detail" pane should work for incidence and magnitude data. If a pane only works for one domain, it should be clearly scoped (e.g., "Specimen recovery" not "Recovery").

5. **Filter state should be global where possible.** Sex filter, dose group filter, adverse-only toggle — these should apply across views, not reset on navigation.

6. **The main area earns space with multi-item views.** Tables, scatters, heatmaps that show many items at once belong in the main area. Single-item detail belongs in the context panel. If a main area visualization shows detail for one selected item, it should probably move to the context panel.

---

## Applying This Framework

To audit a specific view, create a document named `{view}-audit.md` in `docs/incoming/` that:

1. Fills out sections A through E with concrete answers
2. Cites specific file locations and line numbers
3. Scores section F
4. States a verdict with rationale
5. If the verdict is "merge," provides a concrete mapping: what goes where

Then compare audits across views to identify convergence opportunities.

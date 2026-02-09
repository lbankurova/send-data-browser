# Signals Tab v2 — First-Principles Rationale

## Why the Current Signals Tab Failed

### The Scientist's Question

When a toxicologist opens a study for the first time, they ask: **"What happened in this study?"** This is a triage question. They need to rapidly assess:

1. Which organs are affected and how severely
2. What the NOAEL is and how confident they can be in it
3. What needs closer examination
4. Where to go next (which specialized view to open)

The Study Summary Signals tab is the **entry point** for this entire workflow. It must answer the triage question within 10-15 seconds of visual scanning.

### What Target Organs and Dose-Response Got Right

Both successful redesigns share a structural pattern:

```
+-- Navigation Rail --+-- Evidence Panel -----------+
|                     |                             |
| Item 1 (selected)   | [Conclusion header]         |
|   score, stats      | [Tab 1: Overview]           |
| Item 2              | [Tab 2: Detail table]       |
|   score, stats      |                             |
| Item 3              |                             |
+---------------------+-----------------------------+
```

This pattern works because it matches how toxicologists think:

1. **Scan** — glance at the rail to identify items of interest (organ, endpoint)
2. **Select** — click one to see its evidence
3. **Assess** — read the conclusion, examine evidence, form a judgment
4. **Navigate** — cross-view links to deeper analysis

Three levels of progressive disclosure:
- **Rail item**: summary metrics (name + score + a few numbers) — enough to triage
- **Evidence panel**: conclusion + structured evidence — enough to assess
- **Context panel**: deep synthesis + annotation form — enough to decide

The current Signals tab breaks every one of these principles.

### Five Specific Failures

**1. The Findings/Heatmap toggle creates a false dichotomy.**

Findings mode shows conclusions without evidence. Heatmap mode shows evidence without conclusions. The scientist must choose one at a time, toggling back and forth. This is like having a report where you can read either the summary OR the data tables, but never see them together.

Target Organs doesn't make you choose between the organ list and the evidence — they're side by side. Dose-Response doesn't make you choose between the endpoint rail and the chart — they're side by side.

**2. Findings mode has no useful progressive disclosure.**

The organ rows show: organ name, domain codes, and a D-R count. That's it. No evidence score. No significance count. No treatment-related count. No severity indicator. A scientist scanning this list can't tell whether Hepatic has strong evidence from 40 significant endpoints or weak evidence from 2.

Compare to Target Organs rail items: evidence score bar, significance/treatment-related counts, domain chips with convergence visual. Enough to triage without clicking.

**3. Findings mode has no evidence surface.**

Clicking an organ in Findings mode does one thing: highlights the row and updates the context panel. There is no center-panel evidence surface — no table of endpoints, no signal breakdown, no organ-scoped heatmap. To see evidence, you must either:
- Switch to Heatmap mode (losing the findings view)
- Read the 280px context panel (cramped)
- Navigate to Target Organs or Dose-Response (leaving the page)

Target Organs shows evidence inline when you click an organ. Dose-Response shows a chart + pairwise table. Signals shows... a highlighted row.

**4. The two-column layout is spatially wasteful.**

The left column (organ list + study statements) uses ~60% of width for a sparse list. The right column (modifiers + review flags) is 280px for 2-5 short text items. On a 1920px monitor, this produces ~800px of near-empty space in the left column and a narrow rail with 3 amber cards.

Target Organs uses its full evidence panel width for domain breakdowns, top findings, and a searchable table. Dose-Response uses its panel for charts and metrics. Signals uses its panel for... whitespace.

**5. The heatmap is organ-grouped but acts as a flat grid.**

The OrganGroupedHeatmap already groups endpoints by organ with collapsible headers — it's structurally a two-level hierarchy. But it's presented as a single monolithic scroll area. The scientist has to scroll through all 14 organ groups to find the one they care about, expand it, then scan for the endpoint they're looking for. There's no quick-access mechanism.

### The Root Cause

The Signals tab was designed as a **narrative view** (conclusions in text) with a **data view** (heatmap) bolted on via a toggle. The design assumed scientists would read the findings text first, then switch to the heatmap for verification.

This assumption is wrong. Toxicologists don't read studies like essays. They **scan, select, examine**. The narrative approach works for final reports but not for interactive analysis. The two successful views prove this: neither uses narrative text as the primary content. Both use structured, scannable, interactive surfaces.

---

## Design Principles for v2

These principles are extracted from what worked in Target Organs and Dose-Response, generalized to the Signals tab's specific purpose.

### P1: Two-Panel Master-Detail is the Universal Pattern

Every successful view in this app uses it. The Signals tab should too. Left panel navigates, right panel shows detail. Both visible simultaneously.

### P2: Each Rail Item Must Carry Enough Information to Triage

The scientist should be able to look at the organ rail and, without clicking anything, answer: "Which 2-3 organs need my attention?" This requires: evidence score, significance count, whether it's a target, and some severity indicator.

### P3: The Evidence Panel Must Show Conclusions AND Data

"Convergent evidence from 4 domains" is a conclusion. The top 5 endpoints with their p-values and effect sizes is the data. Both must be on screen at the same time for the selected organ.

### P4: No Mode Toggles for Core Content

If the scientist needs both conclusions and evidence (and they always do), don't make them toggle. Put them in tabs within the evidence panel instead, where both are one click away without losing the navigation context.

### P5: The Heatmap is an Evidence Surface, Not a Separate Mode

The organ-scoped signal matrix (endpoint × dose, colored by score) is evidence for the selected organ. It belongs inside the evidence panel as a tab — alongside an overview tab that states conclusions and shows key metrics.

### P6: Study-Level Conclusions Are Persistent, Not a Section

NOAEL, study-scope statements, and aggregate metrics are not per-organ — they're study-level. They belong in a persistent Decision Bar that doesn't scroll and doesn't change with organ selection. This is already working. Keep it.

### P7: Modifiers and Flags Are Per-Organ Context, Not a Sidebar

"Hepatic changes in females only" is about the Hepatic organ. It should appear when Hepatic is selected, inside the evidence panel. Not in a global rail that the scientist has to mentally cross-reference with the organ list.

---

## Proposed Layout

```
+-----------------------------------------------------------+
| Decision Bar: NOAEL statement(s) + metrics line            | ~60px, persistent
+-----------------------------------------------------------+
| Study-level statements (if any)                            | 0-2 lines
+-----------+-----------------------------------------------+
|           |  Organ Summary Header                         |
| Organ     |    Conclusion text + compact metrics           |
| Rail      |                                               |
| (300px)   |  [Overview]  [Signal matrix]                  |
|           |                                               |
| ★ Hepatic |  Overview tab:                                |
|   ███░ 1.1|    Domain convergence: LB(12) MI(3) OM(2)    |
|   12 sig  |    Top endpoints table (5-8 rows)             |
|   4 TR    |    Modifiers: "females only" (if relevant)    |
|           |    Review flags (if any for this organ)        |
| ★ Renal   |    Cross-view links                           |
|   ██░░ 0.7|                                               |
|   8 sig   |  Signal matrix tab:                           |
|   3 TR    |    Organ-scoped heatmap                       |
|           |    Endpoint × dose, colored by signal score    |
| ○ Body    |    Same interaction as current heatmap         |
|   █░░░ 0.4|    but filtered to selected organ only        |
|   3 sig   |                                               |
|   1 TR    |                                               |
+-----------+-----------------------------------------------+
```

### What Changes

| Element | Current | v2 |
|---------|---------|-----|
| Center mode | Findings/Heatmap toggle | Two-panel with tabs (no toggle) |
| Organ display | Minimal rows in Findings column | Enriched rail items with score bar, stats |
| Evidence surface | None in Findings; full heatmap in Heatmap mode | Per-organ: Overview tab + organ-scoped matrix tab |
| Modifiers/flags | Global conditions rail (right column) | Per-organ, inside evidence panel |
| Study statements | Above organ list in left column | Persistent line below Decision Bar |
| Study-level flags | In conditions rail | Study-level section above organ rail (or dedicated slot in Decision Bar) |
| Signal grid | Hidden toggle below heatmap | Removed from Signals tab (power users use Heatmap tab directly via the signal matrix) |

### What Stays the Same

- **Decision Bar**: Same structure, same metrics, same position
- **Context panel**: Same three-level behavior (no selection / organ / endpoint)
- **Color system**: Same signal score, p-value, domain colors
- **Data hooks**: Same `useStudySignalSummary`, `useTargetOrganSummary`, `useNoaelSummary`, `useRuleResults`
- **Selection state**: Same `SignalSelectionContext` (endpoint + organ, mutually exclusive)
- **Cross-view navigation**: Same links to Target Organs, Dose-Response, Histopathology, NOAEL
- **Keyboard shortcuts**: Escape clears selection
- **Auto-select**: Highest-evidence organ selected on load

### The Evidence Panel: Overview Tab

For the selected organ, the Overview tab shows:

1. **Conclusion text** — generated from rules: "Convergent evidence from N domains (LB, MI, OM). N/M endpoints significant, K treatment-related. Target organ identified."

2. **Top endpoints table** — up to 8 rows, sorted by signal score:
   | Endpoint | Dir | d | p | Pattern | TR |
   |----------|-----|---|---|---------|-----|
   | ALT | ↑ | 2.23 | <0.001 | Monotonic | Yes |
   | AST | ↑ | 1.14 | 0.003 | Monotonic | Yes |
   | ALP | ↑ | 0.82 | 0.021 | Threshold | No |

3. **Modifiers** (if any for this organ) — e.g., "Changes in females only."

4. **Review flags** (if any for this organ) — e.g., "Single-domain evidence only."

5. **Cross-view links** — "View in Target Organs →", "View dose-response →"

### The Evidence Panel: Signal Matrix Tab

Organ-scoped mini heatmap:
- Same visual encoding as current OrganGroupedHeatmap
- But showing ONLY endpoints for the selected organ
- No organ grouping needed (it's already filtered to one organ)
- Click a cell → endpoint selection → context panel updates
- All current heatmap interactions preserved

### The Organ Rail

Each rail item shows:
- Organ name (bold)
- ★ target indicator (if `target_organ_flag`)
- Evidence score bar (horizontal, colored by score)
- Stat line: `N sig · M TR · K domains`
- Domain chips (compact, monospace)
- Amber dot if modifiers or review flags exist for this organ

Items sorted by evidence score descending. Auto-select top item on load.

### Study-Level Content

Content that isn't organ-specific:
- **Study statements** ("Treatment-related effects present...") → 1-2 lines below Decision Bar, always visible
- **Study-level review flags** (widespread low power, etc.) → collapsible "Study notes" section at the top of the organ rail, or a dedicated row at the top of the rail with different styling

---

## Why This Will Work

### 1. Consistency with proven pattern
The scientist who just used Target Organs and Dose-Response will immediately understand the Signals tab. Same layout, same interaction model, same progressive disclosure levels. No new concepts to learn.

### 2. Answers the triage question in 10 seconds
Scan the rail: organs sorted by evidence, target-flagged ones marked with ★, evidence bars provide visual weight. The scientist can identify the 2-3 key organs without clicking anything.

### 3. Evidence and conclusions on the same screen
Click an organ → Overview tab shows the conclusion text AND the top endpoints. The scientist reads "Convergent evidence from 4 domains" and immediately sees the ALT/AST/ALP table below it. No mode switching.

### 4. Heatmap is preserved as a drill-down tool
The organ-scoped signal matrix tab shows the exact same visual encoding as the current heatmap, but filtered to one organ. It's not hidden or removed — it's contextualized. The scientist can switch to it when they want cell-level detail.

### 5. Modifiers and flags are actionable
"Hepatic changes in females only" appears when Hepatic is selected, right where the scientist is looking. Not in a sidebar that requires mental cross-referencing.

### 6. Minimal new code, maximum structural change
The components we need mostly exist:
- OrganRail: adapt from TargetOrgansView's rail
- Overview tab: new, but uses existing data hooks and follows a pattern we've built 4 times
- Signal matrix tab: extract from OrganGroupedHeatmap (render one organ group instead of all)
- Decision Bar: keep as-is
- Context panel: keep as-is

---

## What This Means for Other Views

### Process Observation: View Redesign Workflow

The successful redesigns (Target Organs, Dose-Response, and now Signals v2) follow the same workflow:

1. **Analyze the failure** — what cognitive mode does the view serve? What mental model does the scientist use? Where does the current design break that model?
2. **Extract principles** — from successful views in the same app, what structural patterns work?
3. **Design the layout** — two-panel master-detail with enriched rail + tabbed evidence
4. **Specify the evidence** — what goes in each tab? What data sources? What conclusion text?
5. **Identify reuse** — which existing components can be adapted?
6. **Implement** — code the components following the established patterns
7. **Document** — rewrite the view spec to match the new implementation

### Suggestion: View Designer Role

The above workflow could be formalized as a **View Designer** subrole or pre-implementation step:

**Input**: Current view code + design system docs + domain context (what question does the scientist ask?)

**Output**: A rationale document (like this one) with:
- Failure analysis
- Design principles (reusable across views)
- Layout specification (ASCII + table)
- Component inventory (new, adapted, unchanged)
- Data flow

**Benefit**: The View Designer thinks about *why* before the Frontend Developer thinks about *how*. This prevents implementing a design that looks good in code but fails the scientist's workflow.

For this app, every view should go through the same analysis:
- What question does it answer?
- What cognitive mode (Exploration / Conclusion / Hybrid)?
- Does it follow the two-panel pattern?
- Does each panel have progressive disclosure?
- Are conclusions stated explicitly?
- Is evidence one click away (not one mode-switch away)?

The Histopathology and NOAEL views haven't been through this analysis yet. They may have the same structural problems the Signals tab had.

# Study Summary — Overview Tab Implementation Spec

**Route:** `/studies/:studyId` (default tab)
**Component:** `StudyOverviewTab.tsx` (new, inside `StudySummaryView.tsx`)
**Cognitive mode:** Conclusion (insights first, evidence available via Signals tab)
**Scientific question:** "What happened in this study — and how does it fit the program?"

---

## Summary of Change

Add a new **Overview** tab to the Study Summary view. It becomes the **default tab** (replacing Study details as default). The tab bar becomes: `[Overview]  [Signals]  [Study Details]  [Generate Report]`.

The Overview tab is a **briefing page** — it tells the scientist what happened before they explore the evidence. It also houses cross-study context (program NOAELs, cross-study insights) and reported-vs-derived discrepancy indicators.

The Signals tab and Study Details tab are **unchanged** except:
- The Study Statements Bar (study-level statements, modifiers, caveats) **moves from Signals into the Overview tab**. The Signals tab retains only the Decision Bar.
- The organ rail items in Signals are **simplified to 3 rows** (name+badge, evidence bar, stats line). Rows 4 (effect metrics) and 5 (D-R summary) are removed — that detail is available in the Evidence panel.

---

## Provenance Indicators (ⓘ pattern)

Every derived conclusion on this page must show where it comes from. This builds trust — the scientist needs to know whether a value is from the study report, from statistical analysis, or from the cross-study engine.

### Design Pattern

Use an **info icon** (`Info` from lucide-react, `h-3 w-3`) inline next to any value that has a data source. The icon is `text-muted-foreground/50` at rest, `text-muted-foreground` on hover. Clicking or hovering reveals a tooltip with provenance details.

### Provenance Tooltip Content

| Source Type | Icon Tint | Tooltip Format |
|-------------|-----------|----------------|
| Study report (nSDRG) | `text-blue-400` | "Source: Study report (nSDRG)" |
| Data-derived (xpt analysis) | `text-slate-400` | "Source: Derived from {domain} data · {method}" |
| Cross-study engine | `text-violet-400` | "Source: Cross-study analysis · Rule {id}" |
| Insights engine (single-study) | `text-slate-400` | "Source: Signal analysis engine · {rule_name}" |

### Where Provenance Icons Appear

1. **Key Findings narrative** — single ⓘ after the text block. Tooltip: "Source: Study report (nSDRG)" or "Source: Synthesized from signal analysis engine"
2. **NOAEL value** — ⓘ next to each value (reported and/or derived)
3. **LOAEL value** — same pattern
4. **Target organ list** — ⓘ next to any organ tagged "(derived)" or with a discrepancy note
5. **Cross-study insights** — ⓘ next to each insight. Tooltip names the rule and reference study.
6. **Program NOAELs table** — ⓘ in the NOAEL column header. Tooltip: "Values use study report where available, data-derived as fallback."

### Provenance Component

```tsx
// Reusable component
interface ProvenanceInfo {
  source: 'report' | 'derived' | 'cross-study' | 'engine';
  detail: string; // e.g., "nSDRG", "Williams' test on BW domain", "Rule 4: Cross-species NOAEL"
}

<ProvenanceIcon info={provenanceInfo} />
```

Renders: `<span className="inline-flex items-center">` with `Info` icon + `Tooltip` (shadcn/ui). Icon color follows source type table above. Tooltip is `text-xs`, max-width 280px.

---

## Layout

The Overview tab fills the center panel. Scrollable, `overflow-y-auto`.

```
+-----------------------------------------------------------+
| [● Overview]  [Signals]  [Study Details]    [Gen Report]  |  ← tab bar (shared)
+-----------------------------------------------------------+
|                                                           |
|  KEY FINDINGS                                        ⓘ   |  ← narrative block
|  ─────────────────────────────────────────────────────    |
|  {3–5 sentence auto-generated narrative}                  |
|                                                           |
|  ┌──────────────────────────┬────────────────────────────┐|
|  │ NOAEL / LOAEL            │ TARGET ORGANS              │|  ← conclusion cards
|  │                          │                            │|
|  │ NOAEL   10 mg/kg/day  ⓘ │ ■ Hepatic         3.2  ⓘ │|
|  │         M+F              │   LB·OM·MI·MA  M+F        │|
|  │         Reported ✓       │                            │|
|  │                          │ ■ Renal           1.8  ⓘ │|
|  │ LOAEL   30 mg/kg/day  ⓘ │   LB·OM·MI     M          │|
|  │                          │                            │|
|  │ Driver  Hepatocellular ⓘ │ ■ Hematologic    1.4  ⓘ │|
|  │         hypertrophy      │   LB·MI        M+F        │|
|  │                          │                            │|
|  │ Confidence  92% ●        │   Body weight     0.3     │|
|  │                          │   Cardiovascular  0.1     │|
|  └──────────────────────────┴────────────────────────────┘|
|                                                           |
|  STUDY STATEMENTS                                         |  ← moved from Signals
|  ─────────────────────────────────────────────────────    |
|  ● Treatment-related effects present with dose-response   |
|  ▲ Hepatic changes in females only                        |
|  ▲ Large effects without significance (37 endpoints)      |
|                                                           |
|  CROSS-STUDY CONTEXT                                      |  ← new section
|  ─────────────────────────────────────────────────────    |
|  {Program NOAELs table + cross-study insights}            |
|                                                           |
+-----------------------------------------------------------+
```

---

## Section 1: Key Findings Narrative

Container: `px-6 pt-6 pb-4`

### Header Row
`flex items-center justify-between`
- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Key Findings"
- Provenance icon: `ProvenanceIcon` — source is `report` if `key_findings_reported` exists, otherwise `engine`

### Narrative Block
`mt-2 text-sm leading-relaxed text-foreground`

**Content priority:**
1. If `study.key_findings_reported` exists (from nSDRG): render that text verbatim.
2. If not, synthesize from engine data:
   - Sentence 1: Target organ count and names. "Three target organs identified: hepatic (primary), renal, and hematologic."
   - Sentence 2: Primary target evidence. "Hepatic effects show convergent evidence across LB, OM, MI, and MA domains in both sexes with clear dose-response."
   - Sentence 3: NOAEL + driver. "NOAEL is 10 mg/kg/day (M+F), driven by hepatocellular hypertrophy at 30 mg/kg/day."
   - Sentence 4 (optional): Recovery or key modifier. "Recovery was partial for hepatic findings at 30 mg/kg/day."
   - Sentence 5 (optional): Major flags. "Mortality was observed in 2 high-dose males."

**Data sources:** `key_findings_reported` (from study object), `targetOrgans` (from `useTargetOrganSummary`), `noaelData` (from `useNoaelSummary`), `panelData.studyStatements` (from `buildSignalsPanelData`).

### Source Label
`mt-1.5 text-[10px] text-muted-foreground/60`
- If reported: "Source: study report"
- If synthesized: "Source: derived from data analysis"

---

## Section 2: Conclusion Cards

Container: `px-6 py-4`

Two cards side by side: `grid grid-cols-2 gap-4` (stacks to `grid-cols-1` at `max-[900px]`).

Each card: `rounded-lg border bg-card p-4`

### Left Card: NOAEL / LOAEL

Section header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3` — "NOAEL / LOAEL"

**Layout:** Key-value rows, `space-y-2.5`

Each row: `flex items-baseline gap-2`
- Label: `w-20 shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground`
- Value: `text-xs font-semibold text-foreground`
- Provenance: `ProvenanceIcon` inline after value

#### When only one data layer exists (typical)

| Row | Label | Value | Provenance |
|-----|-------|-------|------------|
| NOAEL | `NOAEL` | "{dose} {unit}" | report or derived |
| | | Sex qualifier below: `text-[10px] text-muted-foreground` — "M+F" or "Males: X, Females: Y" | |
| LOAEL | `LOAEL` | "{dose} {unit}" | report or derived |
| Driver | `DRIVER` | Endpoint name | engine |
| Confidence | `CONFIDENCE` | Score with colored dot (green ≥80%, amber ≥60%, red <60%) | engine |

#### When both reported and derived exist and MATCH

Same as above, but the provenance tooltip says "Source: Study report (nSDRG) · Confirmed by data analysis." Add a subtle `✓` checkmark after "Reported" in `text-green-600 text-[10px]`.

#### When both exist and DIFFER (discrepancy)

| Row | Content |
|-----|---------|
| NOAEL header | "NOAEL" label as usual |
| Reported | `text-xs` — "Reported  {dose} {unit}" + ⓘ (report) |
| Derived | `text-xs` — "Derived   {dose} {unit}" + ⓘ (derived with method) |
| Discrepancy note | `text-[10px] leading-snug text-amber-700` with `TriangleAlert` icon (h-3 w-3 text-amber-500) — interpretation text from Rule 0 output |
| LOAEL | As normal |
| Driver | As normal (from whichever layer is primary — reported preferred) |

**Discrepancy interpretation text (from insights engine Rule 0):**
- If derived < reported: "Statistical analysis is more conservative — data flags findings at {derived.dose} that study director considered non-adverse."
- If derived > reported: "Study director applied stricter criteria than statistical analysis."

### Right Card: Target Organs

Section header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3` — "Target Organs"

**Layout:** Vertical list of organ items, `space-y-1.5`

Each target organ item: `flex items-center gap-2 py-1`
- Color indicator: `h-2.5 w-2.5 rounded-full` — color from evidence tier (red ≥2.5, orange ≥1.5, amber ≥0.8, green <0.8)
- Organ name: `text-xs font-semibold` + `titleCase()`
- Evidence score: `text-xs font-mono tabular-nums text-muted-foreground` — right-aligned
- Provenance: `ProvenanceIcon` — report if organ is in `target_organs_reported`, derived if only in `target_organs_derived`
- Below name: `text-[10px] text-muted-foreground` — domain chips (colored text `text-[9px] font-semibold`) + sex indicator

**Discrepancy annotations (inline):**
- If organ is in `target_organs_derived` but NOT in `target_organs_reported`: append `text-[10px] text-amber-700` — "(derived)" + ⓘ with tooltip: "Data analysis identifies this as a potential target organ. Not listed in study report."
- If organ is in `target_organs_reported` but NOT in `target_organs_derived`: append `text-[10px] text-muted-foreground` — "(report only)" + ⓘ with tooltip: "Listed in study report. Not flagged by statistical analysis — may be based on clinical observations."

**Non-target organs:** Below a subtle separator (`border-t mt-2 pt-2`), list remaining organs with evidence scores but no color dot, `text-muted-foreground`. Only show if evidence_score > 0. No provenance icons needed for non-targets.

**Clickability:** Each organ item is clickable — navigates to Signals tab with that organ selected in the rail. Hover: `hover:bg-accent/30 rounded-md px-1 -mx-1`.

---

## Section 3: Study Statements (moved from Signals)

Container: `px-6 py-4 border-t`

Section header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2` — "Study Statements"

**Content:** Renders the same `panelData.studyStatements`, `panelData.modifiers` (study-scope only), and `panelData.caveats` (study-scope only) that currently render in the Signals tab's Study Statements Bar.

**Rendering:**
- Statements: `text-sm leading-relaxed` with `StatementIcon` (same component as current)
- Modifiers: `text-xs text-amber-800` with amber triangle icon. Each has ⓘ → "Source: Signal analysis engine · {rule_name}"
- Caveats: `text-xs text-orange-700` with warning icon. Each has ⓘ → "Source: Signal analysis engine · {rule_name}"

Only renders if non-empty. If all arrays are empty, the entire section is hidden.

---

## Section 4: Cross-Study Context

Container: `px-6 py-4 border-t`

Section header: `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3` — "Cross-Study Context"

**Only renders when cross-study data is available** (i.e., the study belongs to a program with other studies, OR the cross-study intelligence feature is enabled). If no cross-study data exists, the section is hidden entirely.

### Program NOAELs Table

Sub-header: `text-xs font-medium text-foreground mb-2` — "Program NOAELs ({compound})" + ⓘ with tooltip: "NOAEL values use study report where available, data-derived as fallback."

Table: `overflow-x-auto rounded-md border bg-card`, `text-xs`

Header row: `border-b bg-muted/30`
- Headers: `px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`

| Column | Header | Alignment | Cell Rendering |
|--------|--------|-----------|----------------|
| study_id | Study | Left | `font-medium`. Current study row has `bg-accent/30`. |
| species | Species | Left | `text-muted-foreground` |
| duration | Duration | Left | `text-muted-foreground` — "{N} wk" |
| noael | NOAEL | Left | Value + source indicator: "(report)" or "(derived)" in `text-[10px] text-muted-foreground`. Discrepancy: ⚠ icon if `has_noael_discrepancy(study)` |
| stage | Stage | Left | Colored text per stage colors (green/blue/amber/purple from intelligence spec) |

Row hover: `hover:bg-accent/50`. Click navigates to that study's Overview tab (if not current study).

### Cross-Study Insights

Sub-header: `text-xs font-medium text-foreground mb-2 mt-4` — "Cross-Study Insights"

**Priority 0 + 1 insights:** Always visible. Each insight:
- Container: `flex items-start gap-2 py-1.5`
- Bullet: `mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40`
- Text: `text-xs leading-relaxed text-foreground`
- Provenance: ⓘ inline at end of text → "Source: Cross-study analysis · {rule_title} · Reference: {ref_study_id}"

**Priority 2 + 3 insights:** Collapsed behind toggle.
- Toggle: `text-xs text-muted-foreground hover:text-foreground cursor-pointer mt-2` — "Show more insights ({count}) ▾" / "Show fewer ▴"
- Same rendering as above when expanded.

**Empty state:** If no cross-study insights exist: `text-xs text-muted-foreground` — "No cross-study data available for this compound."

**Data source:** `useCrossStudyInsights(studyId)` hook (new). Returns `{ program_noaels: StudyNoael[], insights: Insight[] }`.

---

## Context Panel (Right Sidebar — 280px)

When the Overview tab is active, the context panel shows **study-scope conclusions** instead of the "select something" empty state.

### Component: `OverviewContextPanel`

#### Header
- `border-b px-4 py-2`
- Title: `text-sm font-semibold` — "Study Context"

#### Pane 1: Conclusions (default open)
Renders study-scope rules from `ruleResults` where `scope === "study"`. Uses `InsightsList` component filtered to study scope.

Typical content:
- "3 target organs identified" (R15)
- "NOAEL established at 10 mg/kg/day" (R14)
- "Multi-domain convergence confirmed for hepatic" (R16)

Each item has ⓘ provenance.

#### Pane 2: Validation Status (default open)
- Status: Pass/Warnings/Fail with icon (same icons as landing page table)
- Count: "{N} rules evaluated"
- Errors/warnings breakdown: "{N} errors · {N} warnings"
- Last validated: timestamp
- Link: "View full report →" navigates to `/studies/{studyId}/validation`

#### Pane 3: Package Completeness (default open, only if cross-study data available)
Checklist:
- nSDRG: ✓ or ✗ with `text-green-600` or `text-muted-foreground/40`
- define.xml: ✓ or ✗
- XPT domains: ✓ or ✗ + "{N} domains loaded"

#### Pane 4: Quick Navigation (default open)
Links to all analysis views:
- "Signals →" (switches to Signals tab)
- "Target Organs →"
- "Dose-Response →"
- "Histopathology →"
- "NOAEL Decision →"
- "Adverse Effects →"
- "Validation →"

Style: `text-[11px] text-primary hover:underline`

---

## Signals Tab Changes

### Study Statements Bar: REMOVED
The Study Statements Bar (`panelData.studyStatements`, study-scope modifiers, study-scope caveats) no longer renders in the Signals tab. This content is now on the Overview tab, Section 3.

The **Decision Bar stays** — it is the persistent NOAEL/LOAEL reference while drilling into signals.

### Organ Rail: Simplified to 3 Rows

Current 5-row rail item:
```
Row 1: Name + direction arrow + TARGET badge
Row 2: Evidence score bar
Row 3: Stats (sig · TR · domains + domain chips)
Row 4: Effect metrics (|d| + trend p)
Row 5: D-R summary
```

New 3-row rail item:
```
Row 1: Name + direction arrow + TARGET badge
Row 2: Evidence score bar
Row 3: Stats (sig · TR · domains + domain chips)
```

Rows 4 and 5 are removed. This information is available in the Evidence panel header metrics line and the Overview tab top findings respectively. The rail's job is orientation and selection, not detailed metrics.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Active tab | Local | `useState<"overview" \| "signals" \| "details">` — **defaults to "overview"** (changed from "signals") |
| Cross-study data | Server | `useCrossStudyInsights(studyId)` hook (new, React Query) |
| All existing signal/organ/NOAEL/rule hooks | Server | Unchanged — Overview tab consumes same hooks |
| Insight expansion | Local | `useState<boolean>` — controls "Show more insights" toggle |

---

## Data Sources

| Hook | Used By | New? |
|------|---------|------|
| `useStudyMetadata(studyId)` | Key Findings synthesis | Existing |
| `useTargetOrganSummary(studyId)` | Target Organs card | Existing |
| `useNoaelSummary(studyId)` | NOAEL/LOAEL card | Existing |
| `useRuleResults(studyId)` | Study Statements, context panel conclusions | Existing |
| `useStudySignalSummary(studyId)` | Key Findings synthesis (signal counts) | Existing |
| `useValidationResults(studyId)` | Context panel validation status | Existing |
| `useCrossStudyInsights(studyId)` | Program NOAELs table, cross-study insights | **New** |
| `buildSignalsPanelData()` | Study Statements section | Existing (moved) |

### New Hook: `useCrossStudyInsights`

```ts
interface CrossStudyData {
  program_noaels: {
    study_id: string;
    species: string;
    duration_weeks: number;
    noael: { dose: number; unit: string; source: 'report' | 'derived' } | null;
    has_discrepancy: boolean;
    pipeline_stage: string;
  }[];
  insights: {
    priority: number;
    rule: string;
    title: string;
    detail: string;
    ref_study: string | null;
  }[];
  compound: string;
}

function useCrossStudyInsights(studyId: string): UseQueryResult<CrossStudyData>
```

API endpoint: `GET /api/studies/{studyId}/cross-study`

---

## New Shared Component: ProvenanceIcon

```tsx
interface ProvenanceInfo {
  source: 'report' | 'derived' | 'cross-study' | 'engine';
  detail: string;
}

function ProvenanceIcon({ info }: { info: ProvenanceInfo }) {
  // Renders: Info icon (h-3 w-3) with Tooltip
  // Icon color by source type:
  //   report: text-blue-400
  //   derived: text-slate-400
  //   cross-study: text-violet-400
  //   engine: text-slate-400
  // Hover: text-muted-foreground
  // Tooltip: "Source: {label} · {detail}"
}
```

Place in `components/ui/provenance-icon.tsx`. Uses shadcn `Tooltip` component.

---

## Styling Reference

All styles follow existing design system conventions:

| Element | Classes |
|---------|---------|
| Section header | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Card container | `rounded-lg border bg-card p-4` |
| Key-value label | `text-[10px] font-medium uppercase tracking-wider text-muted-foreground` |
| Key-value value | `text-xs font-semibold text-foreground` |
| Muted subtext | `text-[10px] text-muted-foreground` |
| Discrepancy text | `text-[10px] leading-snug text-amber-700` |
| Discrepancy icon | `TriangleAlert h-3 w-3 text-amber-500` |
| Clickable organ row | `hover:bg-accent/30 rounded-md px-1 -mx-1 cursor-pointer` |
| Evidence tier dot (red) | `bg-red-500` (score ≥ 2.5) |
| Evidence tier dot (orange) | `bg-orange-500` (score ≥ 1.5) |
| Evidence tier dot (amber) | `bg-amber-500` (score ≥ 0.8) |
| Evidence tier dot (green) | `bg-green-500` (score < 0.8) |
| Stage colors | Submitted `#4A9B68`, Pre-Sub `#7CA8E8`, Ongoing `#E8D47C`, Planned `#C49BE8` |
| Provenance icon (rest) | `text-muted-foreground/50` |
| Provenance icon (hover) | `text-muted-foreground` |

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Target organ item | Click | Switches to Signals tab with organ selected in rail |
| Program NOAEL row | Click | `/studies/{otherStudyId}` (Overview tab of that study) |
| Context panel quick nav | Click | Various analysis view routes |
| Context panel validation link | Click | `/studies/{studyId}/validation` |
| Overview tab top findings endpoint name | Click | Switches to Signals tab, selects that organ + endpoint |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading (all data) | Centered spinner + "Loading study overview..." |
| Loading (cross-study only) | Main sections render; cross-study section shows `Skeleton h-20 w-full` |
| No cross-study data | Cross-Study Context section hidden entirely |
| No key findings (no nSDRG, no signal data) | Narrative block shows: "No findings data available. Run signal analysis or import nSDRG to generate key findings." |
| No target organs identified | Target Organs card shows: "No target organs identified." with all organs listed at 0 score. |

---

## Implementation Order

1. **ProvenanceIcon component** — shared UI primitive, used everywhere
2. **StudyOverviewTab component** — the new tab with all 4 sections
3. **OverviewContextPanel component** — context panel for Overview tab
4. **Tab bar update** — add Overview as first tab, change default
5. **useCrossStudyInsights hook** — new API integration
6. **Signals tab simplification** — remove Study Statements Bar, simplify organ rail
7. **API endpoint** — `GET /api/studies/{studyId}/cross-study` (backend)

---

## Files to Create

| File | Purpose |
|------|---------|
| `components/ui/provenance-icon.tsx` | ProvenanceIcon + ProvenanceInfo type |
| `components/panels/study-overview/StudyOverviewTab.tsx` | Main Overview tab component |
| `components/panels/study-overview/KeyFindingsSection.tsx` | Section 1: narrative |
| `components/panels/study-overview/ConclusionCards.tsx` | Section 2: NOAEL + Target Organs cards |
| `components/panels/study-overview/StudyStatementsSection.tsx` | Section 3: moved from Signals |
| `components/panels/study-overview/CrossStudySection.tsx` | Section 4: program NOAELs + insights |
| `components/panels/study-overview/OverviewContextPanel.tsx` | Context panel for Overview tab |
| `hooks/useCrossStudyInsights.ts` | React Query hook for cross-study API |

## Files to Modify

| File | Change |
|------|--------|
| `StudySummaryView.tsx` | Add Overview tab, change default, route context panel |
| `SignalsPanel.tsx` | Remove Study Statements Bar rendering |
| `SignalsOrganRail.tsx` → `SignalsOrganRailItem` | Remove rows 4-5 from rail items |
| `StudySummaryContextPanel.tsx` | Route to OverviewContextPanel when Overview tab active |

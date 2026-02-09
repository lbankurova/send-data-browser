# Study Summary View

**Route:** `/studies/:studyId`
**Component:** `StudySummaryView.tsx` (wrapped by `StudySummaryViewWrapper.tsx`)
**Scientific question:** "What happened in this study?"
**Role:** Entry point after opening a study. Orientation, signal detection, triage.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Study Summary View        | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The Study Summary View itself is split into two tabs with a shared tab bar:

```
+-----------------------------------------------------------+
| [Study Details]  [Signals]              [Generate Report]  |  <-- tab bar, border-b
+-----------------------------------------------------------+
|                                                           |
|  Tab content (fills remaining height, scrollable)         |
|                                                           |
+-----------------------------------------------------------+
```

---

## Tab Bar

- **Position:** Top of the view, full width, `border-b`
- **Tabs:** "Study Details" and "Signals" (default active)
- **Active indicator:** `h-0.5 bg-primary` underline at bottom of active tab
- **Tab text:** `text-xs font-medium`. Active = `text-foreground`. Inactive = `text-muted-foreground`
- **Generate Report button:** Right-aligned in tab bar. Border, `text-xs`, icon `FileText` (3.5x3.5) + "Generate Report" label. Opens HTML report in new tab.

---

## Tab 1: Study Details

Full-width scrollable metadata display. Padding `p-6`.

### Header
- `text-2xl font-bold`: "Study: {study_id}"
- Optional subtitle in `text-muted-foreground`: study title from TS domain

### Sections

Each section has:
- Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-1 mb-3`
- Key-value rows: label (w-36, `text-muted-foreground`) + value (`select-all`), `text-sm`, `py-1`

#### Study overview
| Label | Source |
|-------|--------|
| Species | `meta.species` |
| Strain | `meta.strain` |
| Study type | `meta.study_type` |
| Design | `meta.design` |
| Subjects | `"{total} ({males}M, {females}F)"` |
| Start date | `meta.start_date` |
| End date | `meta.end_date` |
| Duration | ISO duration parsed to "{N} weeks" or "{N} days" |

#### Treatment
| Label | Source |
|-------|--------|
| Test article | `meta.treatment` |
| Vehicle | `meta.vehicle` |
| Route | `meta.route` |

#### Administration
| Label | Source |
|-------|--------|
| Sponsor | `meta.sponsor` |
| Test facility | `meta.test_facility` |
| Study director | `meta.study_director` |
| GLP | `meta.glp` |
| SEND version | `meta.send_version` |

#### Domains ({count})
- Flex-wrap row of domain chips
- Each chip: `<Link>` to `/studies/{studyId}/domains/{domain}`
- Styling: `rounded-md bg-muted px-2 py-0.5 font-mono text-xs`
- Hover: `hover:bg-primary/20 transition-colors` (blue tint)
- Navigates to domain table view on click

---

## Tab 2: Signals — Two-Panel Master-Detail

Vertical stack, fills remaining height. Contains Decision Bar, Study Statements Bar, and a two-panel master-detail layout.

```
+-----------------------------------------------------------+
| Decision Bar (NOAEL statement + metrics)                  |  border-b
+-----------------------------------------------------------+
| Study Statements Bar (study-level facts/modifiers/caveats)|  border-b (if content)
+-----------------------------------------------------------+
| Organ Rail (300px)  |  Evidence Panel (flex-1)            |
| ┌─────────────────┐ | ┌──────────────────────────────────┐|
| │ Search input    │ | │ Organ Header (name, stats)       │|
| │ ─ ─ ─ ─ ─ ─ ─  │ | │ [Overview] [Signal matrix]  tabs │|
| │ Organ items     │ | │ ┌────────────────────────────────┐│|
| │  (scrollable)   │ | │ │ Tab content (scrollable)      ││|
| │                 │ | │ │                                ││|
| └─────────────────┘ | │ └────────────────────────────────┘│|
|                     | └──────────────────────────────────┘|
+-----------------------------------------------------------+
```

Responsive: `max-[1200px]:flex-col` — stacks vertically on narrow screens.

### Decision Bar

Persistent across the Signals tab. Visual anchor with blue accent: `shrink-0 border-b border-l-2 border-l-blue-500 bg-blue-50/30 px-4 py-2.5 dark:bg-blue-950/10`.

**NOAEL statements:** From `panelData.decisionBar` (priority 900+ rules). Each as:
- `flex items-start gap-2 leading-snug`
- First line: `text-sm font-medium`; subsequent lines: `text-sm`
- Alert icon (`▲`) for warning/review-flag statements, blue dot (`●`) for facts

**Metrics line:** `mt-1 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground`
- NOAEL value (amber-600 if "Not established" or "Control", foreground otherwise)
- N targets · significant ratio · D-R count · N domains

### Study Statements Bar

Shows study-level statements, modifiers, and caveats from `panelData`. Only renders if non-empty.

- **Study statements:** `text-sm leading-relaxed` with StatementIcon
- **Study modifiers:** `text-xs text-amber-800` with amber triangle icon. Only includes modifiers where `organSystem` is falsy.
- **Study caveats:** `text-xs text-orange-700` with warning icon. Only includes caveats where `organSystem` is falsy.

### Organ Rail (left panel, resizable 180-500px, default 300px)

**Component:** `SignalsOrganRail` (from `SignalsPanel.tsx`)
**Resizable:** Uses `useResizePanel(300, 180, 500)` with `PanelResizeHandle` between rail and evidence panel. Handle hidden at `max-[1200px]` (stacked layout).

Header: "ORGAN SYSTEMS ({count})" + search input (`text-xs`).

Each rail item (`SignalsOrganRailItem`):
- **Tier indication dot** (leftmost, before organ name): Critical = red `#DC2626`, Notable = amber `#D97706`, Observed = no dot. Computed via `computeTier()` from `rule-synthesis.ts`.
- Target organs: red left border (`border-l-2 border-l-[#DC2626]`), "TARGET" badge
- Non-targets: transparent left border
- Selected: `bg-blue-50/60 dark:bg-blue-950/20`
- Not selected: `hover:bg-accent/30`
- Evidence score bar: normalized to max across all organs, `h-1.5 rounded-full bg-[#D1D5DB]` (neutral gray). On hover, evidence score number turns red (`group-hover/rail:text-[#DC2626]`).
- Stats line: `{n_significant} sig · {n_treatment_related} TR · {n_domains} domains`
- Domain chips: plain colored text (`text-[9px] font-semibold` with `getDomainBadgeColor().text` color class)
- Dose-response summary (if available from OrganBlock): `D-R: {nEndpoints} ({topEndpoint})`

**Target/non-target separator:** A subtle divider label ("Other organs") appears between the last target organ and the first non-target organ. Style: `text-[9px] uppercase tracking-wider text-muted-foreground/50 px-3 py-1.5 border-b`.

**Sorted by:** Targets first, then by `evidence_score` descending within each group.
**Auto-select:** Highest-evidence organ is auto-selected when data loads and no organ is selected.

### Evidence Panel (right panel, flex-1)

**Component:** `SignalsEvidencePanel` (from `SignalsPanel.tsx`)

#### Organ Header (compact, 2-line format)
- Line 1: Organ name `text-sm font-semibold` + "TARGET" badge (if applicable)
- Line 2: Merged summary+metrics in `text-[11px] text-muted-foreground tabular-nums`: `{n_domains} domains · {n_significant}/{n_endpoints} sig ({pct}%) · {n_treatment_related} TR · Max {max_signal} · Evidence {evidence_score}`

#### Tab Bar
Two tabs: "Overview" and "Signal matrix"
- Same styling as main tab bar (`text-xs font-medium`, `h-0.5 bg-primary` underline)

#### Overview Tab (`SignalsOverviewTab`)

Scrollable content (`overflow-y-auto px-4 py-3`):

1. **Insights** — `InsightsList` component filtered to organ-specific rules (`r.organ_system === key` or `r.context_key.startsWith("organ_{key}")`)
2. **Modifiers** — Amber-styled items filtered to this organ (`s.organSystem === key || s.clickOrgan === key`). Organ names are clickable links.
3. **Review flags** — Orange bordered cards (`rounded border border-orange-200 bg-orange-50/50 p-2`) with primary/detail text split. Organ names are clickable links.
4. **Domain breakdown** — Table with columns: Domain (colored badge), Endpoints, Significant, TR. Sorted by significant count desc.
5. **Top findings** — Up to 8 findings sorted by `|effect_size|` desc. Each row shows: endpoint name, direction arrow, effect size (mono), p-value (mono), severity badge, TR flag, sex + dose label.

**Cross-view links (pinned footer):** Pinned below the scrollable content area as a persistent footer strip (`shrink-0 border-t px-4 py-2 flex gap-3`). Links: "Target Organs →", "Dose-response →", "Histopathology →". Navigate with `{ state: { organ_system } }`.

#### Signal Matrix Tab (`SignalsMatrixTab`)

1. **Inline filters** — `StudySummaryFilters` without organ dropdown (organ already selected). Filters: endpoint type, sex, min score, significant only.
2. **Organ-scoped heatmap** — `OrganGroupedHeatmap` with `singleOrganMode` prop. Shows only the selected organ's signals. No organ header row, always expanded.

### OrganGroupedHeatmap (shared component)

**Component:** `charts/OrganGroupedHeatmap.tsx`

**Props include `singleOrganMode?: boolean`** — when true:
- Organ header row is suppressed (no chevron, organ name, sparkline, etc.)
- The single organ group is always expanded
- Only endpoint rows and dose column headers render

**Normal mode (multi-organ):** Used by other views. Organs grouped and sorted by evidence_score desc, target organs first. Collapsible with chevron. Organ header shows: name, evidence score badge, domain chips, target star, sparkline, endpoint count.

**Neutral-at-rest rendering:** Heatmap cells use neutral gray backgrounds at rest (`rgba(0,0,0,0.04)` for data cells, `rgba(0,0,0,0.02)` for empty). On hover, the cell fills with the signal score color. Text uses `tabular-nums` for number alignment. See design guide §1.3 and §1.11 for details.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}`, shows `StudySummaryContextPanel`.

### No Selection State
- Message: "Select a signal from the heatmap or grid to view details."
- `p-4 text-xs text-muted-foreground`

### Organ Selected
- Shows OrganPanel with organ-specific insights, domain breakdown, and cross-view links

### Endpoint Selected

#### Header
- `border-b px-4 py-3`
- Endpoint label: `text-sm font-semibold`
- Subtitle: "{domain} . {sex} . Dose {dose_level}" in `text-xs text-muted-foreground`

#### Pane 1: Insights (default open)
`CollapsiblePane` with `InsightsList` component.

Rules filtered to: matching context_key (`{domain}_{test_code}_{sex}`), matching organ key (`organ_{organ_system}`), or study scope.

#### Pane 2: Statistics (default open)
Key-value pairs, `text-[11px]`:

| Metric | Display |
|--------|---------|
| Signal score | Colored badge with score to 3 decimals |
| Direction | Text value or em dash |
| Best p-value | Mono formatted |
| Trend p-value | Mono formatted |
| Effect size | Mono, 2 decimals, or em dash |
| Dose-response | Pattern with underscores replaced |
| Severity | Capitalized |
| Treatment-related | Yes/No |

#### Pane 3: Correlations (default open)
- Shows other findings in same `organ_system`, up to 10, sorted by signal_score desc
- Header text: "Other findings in {organ system}"

#### Pane 4: Tox Assessment (default closed)
`ToxFindingForm` component with treatment-related dropdown, adversity dropdown, comment textarea, and SAVE button.

---

## State Management

| State | Scope | Managed By |
|-------|-------|-----------|
| Active tab | Local | `useState<"details" \| "signals">` — defaults to "signals" |
| Selected organ | Local | `useState<string \| null>` — auto-selects top organ |
| Selection | Shared via context | `SignalSelectionContext` — syncs heatmap cells and context panel |
| Signal data | Server | `useStudySignalSummary` hook (React Query, 5min stale) |
| Target organs | Server | `useTargetOrganSummary` hook |
| NOAEL data | Server | `useNoaelSummary` hook |
| Rule results | Server | `useRuleResults` hook |
| Study metadata | Server | `useStudyMetadata` hook |
| Panel data | Derived | `buildSignalsPanelData(noaelData, targetOrgans, signalData)` |

---

## Data Flow

```
useStudySignalSummary(studyId)  ──> signalData (989 rows)
useTargetOrganSummary(studyId)  ──> targetOrgans (14 organs)
useNoaelSummary(studyId)        ──> noaelData
useRuleResults(studyId)         ──> ruleResults
         |
    buildSignalsPanelData()
         |
    panelData ──> decisionBar, studyStatements, organBlocks,
                  modifiers, caveats, metrics
         |
    ┌────┴────────────────────────────────────┐
    │                                         │
SignalsOrganRail                    SignalsEvidencePanel
(sorted organs,                     (selected organ's data)
 organBlocksMap)                    ├── Overview (InsightsList, domain table,
    │                               │            top findings, cross-view links)
    └── selectedOrgan ──────────>  └── Signal matrix (filtered heatmap)
                                         │
                                    SignalSelection (shared)
                                         │
                                  StudySummaryContextPanel
                                    /     |      \
                              Insights  Stats  Correlations
```

---

## Keyboard

| Key | Action |
|-----|--------|
| Escape | Clears both organ selection and endpoint selection |

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Overview tab cross-view links | Click | Target Organs / Dose-Response / Histopathology (with `organ_system` state) |
| Domain chip (Details tab) | Click | `/studies/{studyId}/domains/{domain}` |
| Generate Report button | Click | Opens HTML report in new browser tab |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading study summary..." |
| Error (no generated data) | Red box with instructions to run generator command |
| Empty organ search | "No matches for '{search}'" centered in rail |
| No signal data for organ | "No signal data for this organ." centered in overview tab |
| No metadata (Details tab) | Spinner + "Loading details..." |

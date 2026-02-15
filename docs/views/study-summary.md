# Study Summary View

**Route:** `/studies/:studyId`
**Query parameters:** `?tab=details|signals|insights` (optional — sets initial active tab)
**Component:** `StudySummaryView.tsx` (wrapped by `StudySummaryViewWrapper.tsx`)
**Cognitive mode:** Hybrid (conclusions stated in Decision Bar and TARGET badges; evidence available on drill-down)
**Scientific question:** "What happened in this study?"
**Role:** Entry point after opening a study. Orientation, signal detection, triage.

**Deep linking:** The `tab` query parameter allows direct navigation to a specific tab. Example: `/studies/PC201708?tab=insights` opens the Cross-study insights tab directly. Used by landing page context panel navigation links.

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

The Study Summary View itself is split into three tabs with a shared tab bar:

```
+-------------------------------------------------------------------+
| [Study Details]  [Signals]  [Cross-study insights]  [Gen Report] |  <-- tab bar, border-b
+-------------------------------------------------------------------+
|                                                                   |
|  Tab content (fills remaining height, scrollable)                 |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## Tab Bar

- **Position:** Top of the view, full width, `border-b`
- **Tabs:** "Study details" (first), "Signals" (second), and "Cross-study insights" (third)
- **Active indicator:** `h-0.5 bg-primary` underline at bottom of active tab
- **Tab text:** `text-xs font-medium`. Active = `text-foreground`. Inactive = `text-muted-foreground`. Sentence case for tab labels.
- **Generate Report button:** Right-aligned in tab bar. Border, `text-xs`, icon `FileText` (3.5x3.5) + "Generate report" label (sentence case). Opens HTML report in new tab.

---

## Tab 1: Study Details

Full-width scrollable metadata display. Padding `p-4`.

### Header
- `text-base font-semibold`: "Study: {study_id}" (`mb-3` wrapper)
- Optional subtitle: `mt-0.5 text-xs text-muted-foreground` — study title from TS domain

### Sections

Each section has:
- Section wrapper: `mb-4` (last section omits margin)
- Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-0.5 mb-2`
- Key-value rows (`MetadataRow`): label (`w-28 shrink-0 text-muted-foreground`) + value (`select-all`), `text-xs`, `gap-2 py-0.5`

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

#### Treatment arms ({count})
Conditional — only renders if `meta.dose_groups` is non-empty.

Table in `max-h-60 overflow-auto rounded-md border`, `text-xs` (scrollable if tall):
- Sticky header: `sticky top-0 z-10 bg-background`, `border-b bg-muted/30`, all `<th>` use `px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Body rows: `border-b last:border-b-0`, all `<td>` use `px-2 py-1`

| Column | Align | Cell rendering |
|--------|-------|----------------|
| Arm code | left | `font-mono text-xs` |
| Label | left | plain |
| Dose | right | `tabular-nums text-muted-foreground` — "{value} {unit}" or em dash |
| M | right | `tabular-nums text-muted-foreground` |
| F | right | `tabular-nums text-muted-foreground` |
| Total | right | `tabular-nums font-medium` |

**Provenance messages** — below the treatment arms table (`mt-2 space-y-0.5`). Each message: `flex items-start gap-2 text-xs leading-snug`. Icon: `AlertTriangle` (amber-500) for warnings, `Info` (blue-400) for info. Text: `text-amber-700` for warnings, `text-muted-foreground` for info. Optional "Review →" link button navigates to validation view with rule pre-selected.

#### Domains ({count})
- Flex-wrap row of domain chips (`gap-1.5`)
- Each chip: `<Link>` to `/studies/{studyId}/domains/{domain}`
- Styling: `rounded-md bg-muted px-2 py-0.5 font-mono text-xs`
- Hover: `hover:bg-primary/20 transition-colors` (blue tint)
- Navigates to domain table view on click

---

## Tab 2: Signals

Vertical stack, fills remaining height. Contains Decision Bar, Study Statements Bar, Protective Signals Bar, and the Evidence Panel. Organ selection is provided by the shell-level organ rail (not embedded in the view).

```
+-----------------------------------------------------------+
| Decision Bar (NOAEL statement + metrics)                  |  border-b
+-----------------------------------------------------------+
| Study Statements Bar (study-level facts/modifiers/caveats)|  border-b (if content)
+-----------------------------------------------------------+
| Protective Signals Bar (R18/R19 findings)                 |  border-b (if content)
+-----------------------------------------------------------+
| Evidence Panel (flex-1, full width)                       |
| ┌──────────────────────────────────────────────────────┐  |
| │ Organ Header (name, stats)                           │  |
| │ [Evidence] [Signal matrix] [Metrics] [Rules]  tabs   │  |
| │ ┌──────────────────────────────────────────────────┐ │  |
| │ │ Tab content (scrollable)                         │ │  |
| │ │                                                  │ │  |
| │ └──────────────────────────────────────────────────┘ │  |
| └──────────────────────────────────────────────────────┘  |
+-----------------------------------------------------------+
```

The shell organ rail (`OrganRailMode`) lives in the left rail panel of the three-panel layout. The view declares `useRailModePreference("organ")` in `StudySummaryViewWrapper`.

### Decision Bar

Persistent across the Signals tab. Neutral muted background: `shrink-0 border-b bg-muted/20 px-4 py-2`.

**Structured layout (compact, single-row NOAEL/LOAEL/Driver):**

1. **NOAEL / LOAEL / Driver row** — inline, wrapped (`flex flex-wrap items-baseline gap-x-5 gap-y-1`):
   - Each: label (`text-[10px] font-medium uppercase tracking-wider text-muted-foreground`) + value (`text-xs font-semibold text-foreground`)
   - NOAEL value: amber-600 only if "Not established"; all other values (including "Control") use `text-foreground`
   - NOAEL sex qualifier: `text-[10px] text-muted-foreground` inline after value
   - NOAEL confidence badge (if present): text color only (`text-[10px] font-medium`, no background pill) — `text-green-700` if ≥80%, `text-amber-700` if ≥60%, `text-red-700` if <60%. Wrapped in `ConfidencePopover` (from `ScoreBreakdown.tsx`) when NOAEL data is available.
   - Driver (if exists): `text-xs font-medium text-foreground`

2. **Alert/warning statements** (if any from `panelData.decisionBar` with warning/review-flag icons): `text-xs leading-snug text-amber-700` with triangle/warning icon

3. **Metrics line:** `mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground` — N targets · sig ratio · D-R count · N domains

**Data source:** NOAEL, LOAEL, and driver values come from `MetricsLine` (computed in `signals-panel-engine.ts` from NOAEL summary + signal data). Alert statements from `panelData.decisionBar` (priority 900+ rules, filtered to warning/review-flag icons).

### Study Statements Bar

Shows study-level statements, modifiers, and caveats from `panelData`. Only renders if non-empty.

- **Study statements:** `text-sm leading-relaxed` with StatementIcon
- **Study modifiers:** `text-xs leading-relaxed text-foreground/80` with amber triangle icon. Only includes modifiers where `organSystem` is falsy.
- **Study caveats:** `text-xs leading-relaxed text-foreground/80` with warning icon. Only includes caveats where `organSystem` is falsy.

### Protective Signals Bar

**Component:** `ProtectiveSignalsBar` (inline in `StudySummaryView.tsx`)

Shows below the Study Statements Bar, above the Evidence Panel. Only renders when R18 (protective findings) or R19 (repurposing candidates) rules are present in the ruleResults.

Container: `shrink-0 border-b px-4 py-2`. Header: "PROTECTIVE SIGNALS" label + count summary.

Aggregates protective findings via `aggregateProtectiveFindings()`:
- Groups by finding name across R18/R19 rules, collecting specimens, sexes, control/high-dose percentages
- **Repurposing candidates** (R19): `border-l-2 border-l-purple-400`, "repurposing" label in `text-purple-600`, incidence text shows "potential therapeutic target"
- **Protective-only findings** (R18): `border-l-2 border-l-emerald-400`, compact layout with incidence percentages (`font-mono`), capped at 5 items with "+N more" overflow
- Sorted: repurposing candidates first, then by control incidence descending
- Clickable navigation: each finding name is a `<button>` that navigates to the histopathology view with `{ state: { specimen, finding } }`

### Organ Selection (shell-level rail)

The Signals tab does **not** embed its own organ rail. Organ selection flows from the shell-level `OrganRailMode` (declared via `useRailModePreference("organ")` in `StudySummaryViewWrapper`). The `SignalsOrganRail` component exists in `SignalsPanel.tsx` but is used by the shell rail mode, not embedded in the view.

The selected organ flows from `StudySelectionContext` (`studySelection.organSystem`). Each rail item (`SignalsOrganRailItem`) shows:

- **Row 1: Name line** — `flex items-center gap-2`:
  - Organ name: `text-xs font-semibold` + `titleCase()`
  - Dominant direction arrow (if available): `text-[10px] text-muted-foreground/60` — up/down/mixed. Computed from significant signals (p < 0.05) in `computeOrganRailStats()`.
  - "TARGET" badge (if target organ): `text-[9px] font-semibold uppercase text-red-600`
- **Row 2: Evidence score bar** — uses `<EvidenceBar>` reusable component. Neutral gray track and fill, width normalized to max across all organs.
- **Row 3: Stats line** — `text-[10px] text-muted-foreground`: `{n_significant} sig · {n_treatment_related} TR · {n_domains} domains` + domain chips
- **Row 4: Effect metrics** (if available) — `text-[10px] text-muted-foreground tabular-nums`: `|d|={maxAbsEffectSize}` + `trend p={minTrendP}`
- **Row 5: D-R summary** (if available from OrganBlock): `text-[10px] text-muted-foreground` — `D-R: {nEndpoints} ({topEndpoint})`

**Target/non-target separator:** "Other organs" divider between target and non-target groups.

**Sorted by:** Targets first, then by `evidence_score` descending within each group.
**Auto-select:** Highest-evidence organ is auto-selected when data loads and no organ is selected (via `useEffect` in `StudySummaryView`).

### Evidence Panel (full width, flex-1, `bg-muted/5`)

**Component:** `SignalsEvidencePanel` (from `SignalsPanel.tsx`)

#### Organ Header (compact, 2-line format)
- Line 1: Organ name `text-sm font-semibold` + "TARGET" badge (if applicable)
- Line 2: Metrics in `text-[11px] text-muted-foreground tabular-nums`: `{n_domains} domains · {n_significant}/{n_endpoints} sig ({pct}%) · {n_treatment_related} TR · Max {max_signal} · Evidence {evidence_score} · |d| {maxAbsEffectSize} · trend p {minTrendP}`. Evidence score is wrapped in `EvidenceScorePopover` for breakdown details.
- No conclusion sentence — all relevant information is conveyed by the metrics line

#### Tab Bar
Four tabs: "Evidence", "Signal matrix", "Metrics", "Rules"
- Same styling as main tab bar (`text-xs font-medium`, `h-0.5 bg-primary` underline)
- The "Rules" tab renders `RuleInspectorTab` for browsing and inspecting rule results filtered to the selected organ

#### Evidence Tab (`SignalsOverviewTab`)

Scrollable content (`overflow-y-auto px-4 py-3`):

1. **Insights** — `InsightsList` component filtered to organ-specific rules (`r.organ_system === key` or `r.context_key.startsWith("organ_{key}")`)
2. **Modifiers** — Items filtered to this organ (`s.organSystem === key || s.clickOrgan === key`), rendered as plain `<div>` elements. Organ names are plain text (not clickable).
3. **Review flags** — Items with warning icon in `flex items-start gap-2 text-xs leading-relaxed text-foreground/80`, amber warning icon left-aligned. Organ names are plain text (not clickable).
4. **Domain breakdown** — Table with columns: Domain (colored text `text-[9px] font-semibold` with `getDomainBadgeColor`), Endpoints, Significant (font-semibold if >0), TR (font-semibold if >0). Sorted by significant count desc.
5. **Top findings** — Up to 8 findings sorted by `|effect_size|` desc. Each row (`hover:bg-accent/30`, clickable → navigates to dose-response view) shows:
   - Endpoint name (`min-w-[120px] truncate font-medium`)
   - Direction arrow (`text-muted-foreground/50`)
   - Effect size (font-mono, font-semibold if |d| ≥ 0.8, `ev` class for data-evidence styling)
   - P-value (font-mono, font-semibold if < 0.001, font-medium if < 0.01, `ev` class for data-evidence styling)
   - Trend p-value (font-mono text-muted-foreground, font-semibold if < 0.01, prefixed with "t:")
   - D-R pattern badge (if not none/flat): `rounded-full bg-muted px-1.5 py-0.5 text-[9px]`
   - Severity badge (`rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium`)
   - TR flag (if treatment-related)
   - Sex + dose label (right-aligned, muted)

Note: Cross-view navigation links are available in the context panel's "Related views" pane, not in the Evidence tab itself.

#### Signal Matrix Tab (`SignalsMatrixTab`)

1. **Inline filters** — `StudySummaryFilters` without organ dropdown (organ already selected). Filters: endpoint type, sex, min score, significant only.
2. **Organ-scoped heatmap** — `OrganGroupedHeatmap` with `singleOrganMode` prop. Shows only the selected organ's signals. No organ header row, always expanded.

#### Metrics Tab (`SignalsMetricsTab`)

Full sortable data table of all signals for the selected organ. TanStack React Table with client-side sorting and column resizing.

**Filter bar** (`border-b bg-muted/30 px-4 py-2`):
- Sex dropdown: All sexes / Male / Female
- Severity dropdown: All severities / Adverse / Warning / Normal
- Significant only checkbox
- Row count: `ml-auto text-[10px] text-muted-foreground`

**Columns** (12 total):

| Column | Header | Size | Cell Rendering |
|--------|--------|------|----------------|
| endpoint_label | Endpoint | 160px | `truncate font-medium` |
| domain | Domain | 55px | `text-[9px] font-semibold` with `getDomainBadgeColor().text` |
| dose_label | Dose | 90px | First segment before comma, truncated |
| sex | Sex | 40px | Plain text |
| signal_score | Score | 60px | `font-mono` 2 decimals |
| direction | Dir | 35px | `text-muted-foreground` direction symbol |
| p_value | p-value | 65px | `font-mono`, font-semibold if < 0.01 |
| trend_p | Trend p | 65px | `font-mono`, font-semibold if < 0.01 |
| effect_size | \|d\| | 55px | `font-mono`, font-semibold if \|d\| ≥ 0.8 |
| severity | Severity | 70px | `rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium` |
| treatment_related | TR | 35px | Y (font-semibold) / N (muted) |
| dose_response_pattern | Pattern | 90px | Underscores replaced with spaces, em dash if none/flat |

**Default sort:** signal_score descending.
**Row interactions:** Same as other tables — `hover:bg-accent/50`, `bg-accent` on selection. Click toggles selection and updates context panel.

### OrganGroupedHeatmap (shared component)

**Component:** `charts/OrganGroupedHeatmap.tsx`

**Props include `singleOrganMode?: boolean`** — when true:
- Organ header row is suppressed (no chevron, organ name, sparkline, etc.)
- The single organ group is always expanded
- Only endpoint rows and dose column headers render

**Normal mode (multi-organ):** Used by other views. Organs grouped and sorted by evidence_score desc, target organs first. Collapsible with chevron. Organ header shows: name, evidence score badge, domain chips, target star, sparkline, endpoint count.

**`pendingNavigation` mechanism:** The heatmap accepts a `pendingNavigation` prop that auto-expands a specified organ and scrolls to it. Used for programmatic navigation (e.g., clicking an organ link in the context panel auto-expands and scrolls to that organ in the heatmap).

**Neutral-at-rest rendering:** Heatmap cells use neutral gray backgrounds at rest (`rgba(0,0,0,0.04)` for data cells, `rgba(0,0,0,0.02)` for empty). On hover, the cell fills with the signal score color. Text uses `tabular-nums` for number alignment. See design guide §1.3 and §1.11 for details.

---

## Tab 3: Cross-Study Insights

Full-width scrollable insight cards display. Padding `p-4`.

**Data source:** `useInsights(studyId)` hook fetches insights from `/api/portfolio/insights/{study_id}`. Returns array of `Insight` objects with `priority`, `rule`, `title`, `detail`, `ref_study`.

**Priority filtering:**
- **Priority 0-1 (critical/high):** Always visible at top
- **Priority 2-3 (medium/low):** Collapsed by default behind "Show N more insights ▼" toggle button

### Loading State
Centered spinner `Loader2` (animate-spin) + "Loading insights..." (`text-sm text-muted-foreground`).

### Empty State
Centered message: "No cross-study insights available (no reference studies)." (`text-xs text-muted-foreground`).

### Insight Card (`InsightCard`)

Each insight renders as a card with `border-l-2 border-primary py-2 pl-3` (left accent bar), `space-y-2` between cards.

**Card structure:**
1. **Header row** — `flex items-baseline justify-between`:
   - Title: `text-xs font-semibold` (left)
   - Reference study ID: `text-[10px] text-muted-foreground` (right) — shows study ID if `ref_study` is present, or `"(this study)"` in italic if `ref_study` is null (self-referencing insights like Rule 0 and Rule 9)
2. **Detail text** — `mt-1 text-[11px] text-foreground` — full insight detail paragraph

### Toggle Button
When priority 2-3 insights exist:
- Button: `text-xs text-primary hover:underline`, `mt-4`
- Collapsed state: `"Show ${priority23.length} more insights ▼"`
- Expanded state: `"Show fewer insights ▲"`

**Rules by priority (for reference):**
- Priority 0: discrepancy, dose_selection, monitoring_watchlist, dose_overlap_warning
- Priority 1: cross_species_noael, shared_target_organ, novel_target_organ, same_species_noael_trend, same_species_loael_trend, noael_loael_margin, mortality_signal, tumor_signal
- Priority 2: reversibility_comparison, severity_comparison, sex_specific_finding
- Priority 3: route_difference, study_type_difference, domain_coverage_gap, dose_range_context

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}`, shows `StudySummaryContextPanel` via `StudySummaryContextPanelWrapper`.

**Wrapper architecture:** `StudySummaryContextPanelWrapper` (in `ContextPanel.tsx`) bridges `StudySelectionContext` to the context panel:
- Reads `studySel` from `useStudySelection()` hook
- Extracts `organSelection = studySel.organSystem ?? null`
- Fetches `signalData` (via `useStudySignalSummary`) and `ruleResults` (via `useRuleResults`)
- Always passes `selection={null}` — endpoint-level selection is managed locally within `SignalsEvidencePanel` and does not flow to the context panel
- Passes `organSelection` to `StudySummaryContextPanel` which shows `OrganPanel` (organ selected) or empty state (no organ selected)

### No Selection State
- Primary message: "Select a signal from the heatmap or grid to view details."
- Tip text: "Tip: Click an organ in the rail for organ-level insights, or select a heatmap cell for endpoint statistics."
- `p-4 text-xs text-muted-foreground`, tip in `text-muted-foreground/60`

### Organ Selected (`OrganPanel`)

Triggered when an organ is selected in the rail. Since `selection` is always `null` from the wrapper, this panel shows whenever an organ is selected.

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Organ name: `text-sm font-semibold` + `titleCase()`
- CollapseAllButtons (right-aligned)
- Subtitle: "{totalSignals} signals · {N} domain(s)" in `mt-1 text-xs text-muted-foreground`
- TierCountBadges: `mt-1.5 text-xs` — clickable tier pills (Critical/Notable/Observed) with counts

#### Pane 1: Organ insights (default open)
`InsightsList` with organ-filtered rules (`context_key === organKey || organ_system === organSystem || scope === "study"`) and `tierFilter` from TierCountBadges.

#### Pane 2: Contributing endpoints (default open)
Table showing up to 15 endpoints in this organ, grouped by max signal score per endpoint.

| Column | Rendering |
|--------|-----------|
| Endpoint | `truncate` (22 char max, ellipsis) |
| Dom | `text-[9px] font-semibold` with `getDomainBadgeColor().text` |
| Signal | `font-mono` 2 decimals, right-aligned |
| p | `font-mono` formatted p-value, right-aligned |

Rows: `cursor-pointer border-b border-dashed hover:bg-accent/30`. Click navigates to Dose-Response view with `{ state: { organ_system } }`.

#### Pane 3: Evidence breakdown (default open)
- Domains: colored text chips (`text-[9px] font-semibold`)
- Counts: Significant (N/total), Treatment-related (N), Adverse (N)
- Sex comparison (below separator): Males (sig/total), Females (sig/total)

#### Pane 4: Related views (default closed)
Links to Histopathology (with organ name in label), Dose-Response, Histopathology, NOAEL Decision — all with `{ state: { organ_system } }`. Style: `text-[11px]`, `text-primary hover:underline`.

Note: There is a duplicate "View histopathology" link — one with the organ name in the label (e.g., "View histopathology: Hepatic") and one without. Both navigate to the same destination.

### Endpoint Selected (`EndpointPanel`)

**Note:** This panel exists in the codebase but is currently **not reachable** from the wrapper. `StudySummaryContextPanelWrapper` always passes `selection={null}`, so this panel never renders in normal operation. The code is preserved for future use if endpoint selection is wired through to the context panel.

#### Header
- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Endpoint label: `text-sm font-semibold`
- CollapseAllButtons (right-aligned)
- Subtitle: "{domain} . {sex} . Dose {dose_level}" in `mt-1 text-xs text-muted-foreground`
- TierCountBadges: `mt-1.5 text-xs` — clickable tier pills with counts

Rules filtered to: matching context_key (`{domain}_{test_code}_{sex}`), matching organ key (`organ_{organ_system}`), or study scope.

#### Pane 1: Insights (default open)
`CollapsiblePane` with `InsightsList` component and `tierFilter` from TierCountBadges.

#### Pane 2: Statistics (default open)
Key-value pairs, `text-[11px] tabular-nums`. Signal score value is wrapped in `SignalScorePopover` for breakdown details.

| Metric | Display |
|--------|---------|
| Signal score | `font-mono` 3 decimals (clickable popover) |
| Direction | Text value or em dash |
| Best p-value | `font-mono` formatted |
| Trend p-value | `font-mono` formatted |
| Effect size | `font-mono` formatted, or em dash |
| Dose-response | Pattern with underscores replaced |
| Severity | Raw value |
| Treatment-related | Yes/No |

#### Pane 3: Source records
`SourceRecordsExpander` component (not wrapped in CollapsiblePane — manages its own expand/collapse). Expands to show individual animal/subject records matching the signal. Allows drill-down to raw data level. Related to TRUST-07p1 feature. Only rendered when selection, selectedRow, and studyId are all present.

#### Pane 4: Correlations (default open)
- Header text: "Other findings in {organ system}"
- Shows other findings in same `organ_system`, up to 10, sorted by signal_score desc
- Table: Endpoint (truncated 25 chars), Dom (colored text), Signal (font-mono), p (font-mono)
- Rows clickable — navigate to dose-response view with `{ state: { endpoint_label, organ_system } }`
- Empty state: "No correlations in this organ system."

#### Pane 5: Tox Assessment (no pane header — direct `ToxFindingForm`)
`ToxFindingForm` component with treatment-related dropdown, adversity dropdown, comment textarea, and SAVE button. Uses `deriveToxSuggestion()` for system suggestion.

#### Pane 6: Related views (default closed)
Links to Histopathology (with organ name in label and organ_system), Dose-Response (with endpoint_label + organ_system), Histopathology (generic, with organ_system), NOAEL Decision (with organ_system). Style: `text-[11px]`, `text-primary hover:underline`.

Note: There is a duplicate "View histopathology" link — one with the organ name in the label and one without.

#### Pane 7: Audit trail (default closed)
`AuditTrailPanel` component (manages its own CollapsiblePane internally). Shows annotation history for the selected endpoint. Related to TRUST-06 feature.

#### Pane 8: Statistical methodology (default closed)
`MethodologyPanel` component (manages its own CollapsiblePane internally). Explains how the signal score was calculated. Related to TRUST-03 feature.

---

## State Management

| State | Scope | Managed By |
|-------|-------|-----------|
| Active tab | Local | `useState<Tab>` — "details" \| "signals" \| "insights", initialized from `?tab=` query parameter or defaults to "details" |
| Selected organ | Shared via context | `StudySelectionContext` (`studySelection.organSystem`) — set by shell-level organ rail |
| Local signal selection | Local | `useState<SignalSelection \| null>` — endpoint-level selection within the evidence panel, not forwarded to context panel |
| Evidence panel tab | Local (SignalsEvidencePanel) | `useState<"overview" \| "matrix" \| "metrics" \| "rules">` — defaults to "overview" |
| Show all insights | Local (CrossStudyInsightsTab) | `useState<boolean>` — toggles visibility of priority 2-3 insights |
| Rail width | Shell | Managed by shell-level `OrganRailMode` (not embedded in this view) |
| Rail search | Shell (SignalsOrganRail) | `useState<string>` |
| Metrics tab filters | Local (SignalsMetricsTab) | `useState<{ sex, severity, significant_only }>` |
| Metrics tab sorting | Local (SignalsMetricsTab) | `useState<SortingState>` — default `signal_score` desc |
| Signal data | Server | `useStudySignalSummary` hook (React Query, 5min stale) |
| Target organs | Server | `useTargetOrganSummary` hook |
| NOAEL data | Server | `useNoaelSummary` hook |
| Rule results | Server | `useRuleResults` hook |
| Study metadata | Server | `useStudyMetadata` hook |
| Provenance messages | Server | `useProvenanceMessages` hook |
| Insights | Server | `useInsights` hook — cross-study intelligence (19 rules, 0-18) |
| Panel data | Derived | `buildSignalsPanelData(noaelData, targetOrgans, signalData)` |
| Selected organ data | Derived | Matched from `targetOrgans` by `selectedOrgan` |
| OrganBlocksMap | Derived (in SignalsOrganRail) | Map from `panelData.organBlocks` keyed by `organKey` |
| RailStatsMap | Derived (in SignalsOrganRail) | Per-organ `{ maxAbsEffectSize, minTrendP, dominantDirection }` from signal data |

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
Shell OrganRailMode              SignalsEvidencePanel
(SignalsOrganRail,                (selected organ's data)
 organBlocksMap)                  ├── Evidence (InsightsList, domain table,
    │                             │            top findings)
    └── selectedOrgan ──────>     ├── Signal matrix (filtered heatmap)
         (via                     ├── Metrics (sortable data table)
    StudySelectionContext)         └── Rules (RuleInspectorTab)
                                         │
                                    localSignalSel (local only)
                                         │
                                  StudySummaryContextPanel
                                    (receives organSelection, NOT endpoint sel)
                                    /          \
                              OrganPanel     Empty state
                              (organ mode)   (no organ)
```

---

## Keyboard

No keyboard shortcuts are implemented in the Study Summary view. Organ navigation and selection clearing are handled via mouse interaction only.

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Evidence tab top findings row | Click | Dose-Response (with `endpoint_label` + `organ_system` state) |
| Context panel: OrganPanel related views | Click | Histopathology / Dose-Response / Histopathology / NOAEL Decision (with `organ_system`) |
| Context panel: OrganPanel contributing endpoints | Click | Dose-Response (with `organ_system`) |
| Protective signals bar finding | Click | Histopathology (with `specimen` + `finding` state) |
| Domain chip (Details tab) | Click | `/studies/{studyId}/domains/{domain}` |
| Provenance "Review" link | Click | Validation view with rule pre-selected |
| Generate Report button | Click | Opens HTML report in new browser tab via `generateStudyReport()` |

Note: The context panel `EndpointPanel` is currently not reachable because `StudySummaryContextPanelWrapper` always passes `selection={null}`. It shows only `OrganPanel` (organ selected) or empty state (no organ selected).

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading study summary..." |
| Error (no generated data) + insights tab active | Tab bar still shown; CrossStudyInsightsTab renders normally (graceful degradation — insights work without analysis data) |
| Error (no generated data) + other tab active | Amber-themed box (`bg-amber-50`, `text-amber-600`/`text-amber-700`, `Info` icon) with instructions to run generator command. Includes a "View cross-study insights" button that switches to the insights tab. Below: gray box with generator command for studies with XPT data. |
| Cross-study insights error | `Info` icon + "Cross-study insights are not available for this study." + "(Only portfolio studies with metadata have insights)" |
| Cross-study insights empty | "No cross-study insights available (no reference studies)." |
| No organ selected (signals tab) | "Select an organ system from the rail to view evidence" centered in evidence panel area |
| No metadata (Details tab) | Spinner + "Loading details..." |

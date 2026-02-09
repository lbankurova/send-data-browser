# NOAEL Decision View

**Route:** `/studies/:studyId/noael-decision`
**Component:** `NoaelDecisionView.tsx` (wrapped by `NoaelDecisionViewWrapper.tsx`)
**Scientific question:** "What is the NOAEL and what are the dose-limiting adverse findings?"
**Role:** Decision-level summary. Two-panel master-detail layout with persistent NOAEL banner, organ rail, and evidence panel (Overview + Adversity matrix tabs).

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  NOAEL Decision View       | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a flex column: persistent NOAEL Banner at top, then a two-panel master-detail layout below (matching Target Organs, Dose-Response, Signals, and Histopathology views):

```
+-----------------------------------------------------------+
|  NOAEL Determination (persistent, non-scrolling)           |
|  [Combined card] [Males card] [Females card]               |
+--[300px]--+---------------------------------------[flex-1]-+
|            | OrganHeader                                    |
| Organ      |  organ name, adverse count, summary text,     |
| Rail       |  compact metrics (max |d|, min p, endpoints)  |
|            +------------------------------------------------+
| search     | [Overview] [Adversity matrix]  <── tab bar     |
| organ 1    +------------------------------------------------+
| organ 2    | Tab content:                                    |
| organ 3    |  Overview: endpoint summary, insights, links    |
| ...        |  Adversity matrix: filters, matrix, grid        |
|            |                                                  |
+------------+------------------------------------------------+
```

Responsive: stacks vertically below 1200px (`max-[1200px]:flex-col`). Rail becomes horizontal 180px tall strip.

---

## NOAEL Banner (persistent, non-scrolling)

Container: `shrink-0 border-b bg-muted/20 px-4 py-3`

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2` — "NOAEL determination"

### Card Layout

`flex flex-wrap gap-3` — up to 3 cards (Combined, Males, Females), each `flex-1`.

### Per-Card Structure

Outer: `rounded-lg border p-3`

**Border/background color logic:**
- Established (`noael_dose_value > 0`): `border-green-200 bg-green-50`
- Not established: `border-red-200 bg-red-50`

**Row 1:** `mb-1 flex items-center justify-between`
- Sex label: `text-xs font-semibold` — "Combined" / "Males" / "Females"
- Status badge: `rounded px-1.5 py-0.5 text-[10px] font-medium`
  - Established: `bg-green-100 text-green-700` — "Established"
  - Not established: `bg-red-100 text-red-700` — "Not established"

**Row 2+:** `space-y-0.5 text-[11px]`
- NOAEL: label `text-muted-foreground`, value `font-medium` — "{dose_value} {dose_unit}"
- LOAEL: label `text-muted-foreground`, value `font-medium` — loael_label (first part before comma)
- Adverse at LOAEL: label `text-muted-foreground`, value `font-medium` — count
- Confidence (if `noael_confidence != null`): label `text-muted-foreground`, value `font-medium` with color (green >= 80%, yellow >= 60%, red < 60%) — percentage

**Row 3 (conditional):** Only rendered if `adverse_domains_at_loael` is not empty. `mt-1 flex flex-wrap gap-1`
- Domain badges: `rounded px-1 py-0.5 text-[9px] font-medium` with `getDomainBadgeColor()` — bg + text color

---

## Organ Rail (left panel, 300px)

`flex w-[300px] shrink-0 flex-col overflow-hidden border-r`

### Header
- Label: `text-xs font-medium uppercase tracking-wider text-muted-foreground` — "Organ systems ({N})"
- Search input: `mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs` with placeholder "Search organs..."

### Rail Items

Each `OrganRailItem` is a `<button>` with:
- Container: `w-full text-left border-b border-border/40 px-3 py-2.5 transition-colors`
- Selected: `bg-blue-50/60 dark:bg-blue-950/20`
- Not selected: `hover:bg-accent/30`
- Left border: `border-l-2 border-l-[#DC2626]` for organs with adverse findings, `border-l-transparent` otherwise

**Row 1:** Organ name (`text-xs font-semibold`, underscores replaced with spaces) + adverse count badge (`text-[9px] font-semibold uppercase text-[#DC2626]` — "N ADV")

**Row 2:** Adverse bar — adverse count normalized to max across all organs, `#DC2626/60` fill. Bar: `h-1.5 flex-1 rounded-full bg-muted/50` with inner colored fill. Fraction: `shrink-0 text-[10px] text-muted-foreground` — "adverse/total".

**Row 3:** Stats line — `{N} endpoints · {M} TR` + domain chips (outline style: `rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70` with colored dot).

### Sorting

Organs sorted by: `adverseCount` desc → `trCount` desc → `maxEffectSize` desc.

### Auto-Select

On data load, auto-selects the top organ (highest adverse count).

### Search

Filters organs by name (case-insensitive substring match, underscores treated as spaces). Empty state: "No matches for '{search}'".

---

## Organ Header

`shrink-0 border-b px-4 py-3`

- Organ name: `text-sm font-semibold` (underscores replaced with spaces)
- Adverse badge (if adverseCount > 0): `text-[10px] font-semibold uppercase text-[#DC2626]` — "{N} ADVERSE"
- Summary text: `mt-1 text-xs leading-relaxed text-muted-foreground` — "{N} endpoints across {D} domains, {M} adverse, {T} treatment-related."
- Compact metrics: `mt-2 flex flex-wrap gap-3 text-[11px]` — max |d| (colored if >= 0.8), min p (colored if < 0.01), endpoint count

---

## Tab Bar

`flex shrink-0 items-center gap-0 border-b px-4`

Two tabs: **Overview** and **Adversity matrix**

Active tab: `border-b-2 border-primary text-primary`
Inactive tab: `border-transparent text-muted-foreground hover:text-foreground`
All tabs: `px-3 py-2 text-xs font-medium transition-colors`

---

## Overview Tab

`flex-1 overflow-y-auto px-4 py-3` — scrollable content.

### Endpoint Summary

Section header: `text-xs font-medium uppercase tracking-wide text-muted-foreground` — "Endpoint summary"

Each endpoint is a clickable `<button>` row:
- Container: `flex w-full items-center gap-2 rounded border border-border/30 px-2 py-1.5 text-left text-[11px] hover:bg-accent/30`
- Selected: `bg-accent ring-1 ring-primary`
- Endpoint name: truncated at 35 chars, `min-w-0 flex-1 truncate font-medium`
- Direction symbol: `shrink-0 text-sm`, colored (red for up, blue for down)
- Max effect size: `shrink-0 font-mono text-[10px]` with effect size color
- Severity badge: `shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-medium` with `getSeverityBadgeClasses`
- TR badge (if treatment-related): `shrink-0 text-[9px] font-medium text-red-600` — "TR"

Sorted by: severity (adverse first) → treatment-related → max effect size desc. Click sets endpoint-level selection (finds representative row, updates context panel). Click again to deselect.

### Insights

Only shown when organ-scoped rule results exist. Section header: "Insights". Uses `InsightsList` component with rules filtered to the selected organ (matches on `organ_system`, `output_text` containing organ name, or `context_key` containing organ key).

### Cross-View Links

Section header: "Related views". Three navigation links:
- "View in Target Organs" → `/studies/{studyId}/target-organs` with `{ state: { organ_system: organ } }`
- "View dose-response" → `/studies/{studyId}/dose-response` with `{ state: { organ_system: organ } }`
- "View histopathology" → `/studies/{studyId}/histopathology` with `{ state: { organ_system: organ } }`
- All links: `block hover:underline`, color `#3a7bd5`, arrow suffix

---

## Adversity Matrix Tab

Two zones: filter bar + scrollable content (adversity matrix + adverse effect grid), scoped to the selected organ.

### Filter Bar

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Filter | Type | Control | Default |
|--------|------|---------|---------|
| Sex | Dropdown | `<select>` with "All sexes" / Male / Female | All |
| Treatment related | Dropdown | `<select>` with "TR: Any" / "Treatment-related" / "Not treatment-related" | Any |

No organ dropdown (organ already selected via rail). Row count indicator: right-aligned `ml-auto text-[10px] text-muted-foreground`, "{filtered} of {total} findings".

### Adversity Matrix

Only shown when `matrixData.endpoints.length > 0`. Container: `border-b p-4`.

Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` — "Adversity matrix ({N} endpoints)"

**Structure:** `overflow-x-auto` > `inline-block` — horizontal scrollable flex layout.

**Header row:** Endpoint label column `w-48 shrink-0` + dose columns each `w-16 shrink-0 text-center text-[10px] font-medium text-muted-foreground`. Dose headers show actual dose labels (from allAeData), falling back to "Dose {level}".

**Data rows:** Only endpoints with at least one adverse + treatment_related finding. Sort: first adverse dose level ascending, then alphabetically by endpoint label.
- Each `flex border-t` row
- Endpoint label: `w-48 shrink-0 truncate py-0.5 pr-2 text-[10px]`, truncated at 35 chars
- Cells: `flex h-5 w-16 shrink-0 items-center justify-center` with severity-colored inner box (`h-4 w-12 rounded-sm`)

**Aggregation:** Takes worst severity per endpoint × dose across sexes.

**Severity cell colors:**

| Condition | Color |
|-----------|-------|
| Adverse + treatment-related | `#ef4444` (red) |
| Warning | `#fbbf24` (amber) |
| Normal / other | `#4ade80` (green) |
| No data | `#e5e7eb` (gray) |

**Legend:** 4 color swatches with labels (Adverse, Warning, Normal, N/A).

### Adverse Effect Grid

TanStack React Table, `w-full text-xs`, client-side sorting. Scoped to selected organ.

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 30 chars with ellipsis, `title` tooltip |
| domain | Domain | Domain chip with outline+dot style |
| dose_level | Dose | Colored badge with dose group color, shows dose_label |
| sex | Sex | Plain text |
| p_value | P-value | `font-mono`, p-value color coded |
| effect_size | Effect | `font-mono`, effect size color coded |
| direction | Dir | Direction symbol with color |
| severity | Severity | Badge with severity classes |
| treatment_related | TR | "Yes" in `font-medium text-red-600` or "No" in `text-muted-foreground` |
| dose_response_pattern | Pattern | `text-muted-foreground`, underscores replaced with spaces |

Row cap: 200 rows with message. Row interactions: click to select/deselect, hover highlight.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/noael-decision`, shows `NoaelContextPanel`.

**No changes to context panel.** The `NoaelContextPanelWrapper` in `ContextPanel.tsx` already fetches `noaelData`, `aeData`, and `ruleResults` via hooks and passes as props. Selection flows from `ViewSelectionContext`.

### No Selection State

Panes (unchanged):
1. **NOAEL narrative** (default open) — `InsightsList` with rules where `scope === "study"`
2. **Confidence** (default closed) — adverse at LOAEL per sex
3. Footer: "Select a row to view adversity rationale."

### With Selection

Panes (unchanged):
1. **Adversity rationale** (default open) — dose-level rows for selected endpoint + sex
2. **Insights** (default open) — `InsightsList` with endpoint-scoped rules
3. **Related views** (default closed) — cross-view navigation links
4. **Tox Assessment** (default closed) — `ToxFindingForm`

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Local | `useState<string \| null>` — which organ is active in the rail |
| Active tab | Local | `useState<EvidenceTab>` — "overview" or "matrix" |
| Selection (endpoint) | Shared via context | `ViewSelectionContext` with `_view: "noael"` tag |
| Sex filter | Local | `useState<string \| null>` — for Adversity matrix tab |
| TR filter | Local | `useState<string \| null>` — for Adversity matrix tab |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state (in AdversityMatrixTab) |
| NOAEL summary data | Server | `useNoaelSummary` hook (React Query, 5min stale) |
| Adverse effect data | Server | `useAdverseEffectSummary` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |

---

## Data Flow

```
useNoaelSummary(studyId)          ──> noaelData (3 rows: M/F/Combined)
useAdverseEffectSummary(studyId)  ──> aeData (357 rows)
useRuleResults(studyId)           ──> ruleResults (shared React Query cache)
                                          |
                              deriveOrganSummaries() → OrganSummary[]
                                          |
                                  OrganRail (sorted by adverseCount desc)
                                          |
                              [selectedOrgan] → filter aeData
                                          |
                                  organData → deriveEndpointSummaries()
                                     /              \
                            OverviewTab          AdversityMatrixTab
                            (endpoints,          (matrix + grid,
                             insights,            sex/TR filter)
                             cross-view)               |
                                  \              /
                              NoaelSelection (shared)
                                          |
                                NoaelContextPanel
                                  /    |     |      \
                           Narrative  Dose  Insights  Tox
```

---

## Cross-View Navigation

### Inbound
- From other views with `location.state`: `{ organ_system: string }` — auto-selects matching organ in rail (case-insensitive).

### Outbound (Overview tab)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| "View in Target Organs" | `/studies/{studyId}/target-organs` | `{ organ_system: organ }` |
| "View dose-response" | `/studies/{studyId}/dose-response` | `{ organ_system: organ }` |
| "View histopathology" | `/studies/{studyId}/histopathology` | `{ organ_system: organ }` |

### Outbound (Context panel — unchanged)
Same three links in the "Related views" pane.

---

## Keyboard

- **Escape**: clears endpoint-level selection (via `keydown` listener on `window`)

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading NOAEL data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No organ selected (but data exists) | "Select an organ system to view adverse effect details." |
| No data at all | "No adverse effect data available." |
| Empty search results (rail) | "No matches for '{search}'" |
| No endpoints for organ (overview) | "No endpoints for this organ." |
| No rows after filter (matrix) | "No rows match the current filters." |
| >200 filtered rows (grid) | Truncation message below grid |

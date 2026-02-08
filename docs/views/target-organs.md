# Target Organs View

**Route:** `/studies/:studyId/target-organs`
**Component:** `TargetOrgansView.tsx` (wrapped by `TargetOrgansViewWrapper.tsx`)
**Scientific question:** "Which organ systems show converging evidence of toxicity?"
**Role:** Organ-level convergence assessment. Identifies target organs by aggregating evidence across endpoints and domains.

---

## Layout

The view lives in the center panel of the 3-panel shell:

```
+--[260px]--+----------[flex-1]----------+--[280px]--+
|            |                            |            |
| Browsing   |  Target Organs View        | Context    |
| Tree       |  (this document)           | Panel      |
|            |                            |            |
+------------+----------------------------+------------+
```

The view itself is a single scrollable column with two main sections:

```
+-----------------------------------------------------------+
|  Target Organ Systems ({N})                                |
|  [Card][Card][Card]... (flex-wrap)                         |
+-----------------------------------------------------------+  <-- border-b
|  {organ_name} — Evidence Detail                            |
|  [Domain ▼] [Sex ▼]                        {N} findings   |  <-- filter bar, when organ selected
+-----------------------------------------------------------+
|                                                           |
|  Evidence detail grid (TanStack table, 9 columns)          |
|                                                           |
+-----------------------------------------------------------+
```

If no organ is selected, the lower area shows a centered message: "Select an organ system above to view evidence details." (`flex flex-1 items-center justify-center text-sm text-muted-foreground`)

---

## Organ Summary Cards

Container: `border-b p-4`

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2` — "Target organ systems ({count})"

**Cards wrapper:** `flex flex-wrap gap-2`

Organs are sorted by `evidence_score` descending.

### Card Structure

Each card is a `<button>`:
- Base: `rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/50`
- Selected: `ring-2 ring-primary`

**Row 1:** `flex items-center gap-2`
- Organ name: `text-xs font-semibold`, underscores replaced with spaces
- TARGET badge (shown only if `target_organ_flag` is true): `rounded bg-red-100 px-1 py-0.5 text-[9px] font-medium text-red-700`

**Row 2:** `mt-1 flex items-center gap-2 text-[10px]`
- Evidence score badge: `rounded px-1 py-0.5 font-medium text-white` with signal score color (uses `getSignalScoreColor(evidence_score / 2)`)
- Endpoint count: `text-muted-foreground` — "{n_endpoints} endpoints"
- Domain count: `text-muted-foreground` — "{n_domains} domains"

**Row 3:** `mt-1 flex gap-1`
- Domain badges: `rounded px-1 py-0.5 text-[9px] font-medium` with domain-specific bg/text colors (see table below)

### Domain Badge Colors

| Domain | Background | Text |
|--------|-----------|------|
| LB | `bg-blue-100` | `text-blue-700` |
| BW | `bg-emerald-100` | `text-emerald-700` |
| OM | `bg-purple-100` | `text-purple-700` |
| MI | `bg-rose-100` | `text-rose-700` |
| MA | `bg-orange-100` | `text-orange-700` |
| CL | `bg-cyan-100` | `text-cyan-700` |
| Other | `bg-gray-100` | `text-gray-700` |

### Card Interaction

- Clicking a card selects that organ (toggles off if already selected).
- Selecting an organ clears any active domain filter and updates the selection context.

---

## Evidence Detail (shown when organ selected)

### Filter Bar

`flex items-center gap-2 border-b bg-muted/30 px-4 py-2`

| Element | Rendering |
|---------|-----------|
| Organ name label | `text-xs font-medium` — "{organ_name} — Evidence detail" (underscores replaced with spaces) |
| Domain dropdown | `<select>` with "All domains" + domains present in the selected organ. `rounded border bg-background px-2 py-1 text-xs` |
| Sex dropdown | `<select>` with All sexes / Male / Female. Same styling as domain dropdown. |
| Row count | `ml-auto text-[10px] text-muted-foreground` — "{N} findings" |

---

## Evidence Grid

### Table

TanStack React Table, `w-full text-xs`, client-side sorting.

**Header row:** `border-b bg-muted/50`
- Headers: `cursor-pointer px-2 py-1.5 text-left font-medium hover:bg-accent/50`
- Clickable for sorting (shows triangle arrow: `▲` asc / `▼` desc)

**Columns:**

| Column | Header | Cell Rendering |
|--------|--------|----------------|
| endpoint_label | Endpoint | Truncated at 30 chars with ellipsis, `title` tooltip for full name |
| domain | Domain | Colored badge: `rounded px-1.5 py-0.5 text-[10px] font-medium` with domain-specific bg/text colors |
| dose_level | Dose | `text-muted-foreground`, shows `dose_label.split(",")[0]` (first part before comma) |
| sex | Sex | Plain text |
| p_value | P-value | `font-mono` with p-value color classes |
| effect_size | Effect | `font-mono` with effect size color classes |
| direction | Dir | `text-sm`, direction symbol with color |
| severity | Severity | Badge with severity color classes |
| treatment_related | TR | Conditional text styling |

### Direction Symbols

| Value | Symbol | Color |
|-------|--------|-------|
| Up | `↑` | Red |
| Down | `↓` | Blue |
| None / null | `—` | `text-muted-foreground` |

### Severity Badge

`rounded-sm px-1.5 py-0.5 text-[10px] font-medium`

| Level | Background | Text |
|-------|-----------|------|
| Adverse | Red background | Red text |
| Warning | Amber background | Amber text |
| Normal | Green background | Green text |

### Treatment Related Column

| Value | Rendering |
|-------|-----------|
| Yes | `font-medium text-red-600` |
| No | `text-muted-foreground` |

### P-value Color Scale (text classes)

| Threshold | Class |
|-----------|-------|
| p < 0.001 | `text-red-600 font-semibold` |
| p < 0.01 | `text-red-500 font-medium` |
| p < 0.05 | `text-amber-600 font-medium` |
| p < 0.1 | `text-amber-500` |
| p >= 0.1 | `text-muted-foreground` |

### Effect Size Color Scale

| Threshold | Class |
|-----------|-------|
| |d| >= 1.2 | `text-red-600 font-semibold` |
| |d| >= 0.8 | `text-red-500 font-medium` |
| |d| >= 0.5 | `text-amber-600` |
| |d| >= 0.2 | `text-amber-500` |
| |d| < 0.2 | `text-muted-foreground` |

### Row Interactions

- Hover: `hover:bg-accent/50`
- Selected: `bg-accent` (matched on `endpoint_label` + `sex` + `organ_system`)
- Click: sets selection. Click again to deselect.
- Row cells: `px-2 py-1`

**Row cap:** None — all rows are rendered regardless of count.

**Empty state:** No explicit empty state in the grid; shows zero rows with just headers.

---

## Context Panel (Right Sidebar — 280px)

Route-detected: when pathname matches `/studies/{studyId}/target-organs`, shows `TargetOrgansContextPanel`.

### No Selection State

- Message: "Select an organ system to view convergence details."
- `p-4 text-xs text-muted-foreground`

### With Selection

#### Header

- `border-b px-4 py-3`
- Organ name: `text-sm font-semibold`, underscores replaced with spaces
- Below: `mt-1 flex items-center gap-2 text-[11px]`
  - Evidence score badge: `rounded px-1.5 py-0.5 font-medium text-white` with signal score color
  - TARGET ORGAN badge (shown only if flagged): `rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-700`

#### Pane 1: Convergence (default open)

`CollapsiblePane` with `InsightsList` component.
- Rules filtered to those matching `context_key === "organ_{organ_system}"` or `organ_system === selection.organ_system`.
- Same InsightsList rendering as described in study-summary.md (tier pills, organ groups, synthesized signals, correlation chips, expandable raw rules).

#### Pane 2: Endpoints (default open)

Shows up to 15 contributing endpoints sorted by occurrence count descending.

Each item: `flex items-center gap-1 text-[11px]`
- Domain badge: `rounded px-1 py-0.5 text-[9px] font-medium` with domain-specific colors (same palette as organ cards)
- Endpoint label: truncated at 28 chars with `title` tooltip for full name
- Count: `ml-auto text-muted-foreground` — "(N)"

#### Pane 3: Related Views (default closed)

Cross-view navigation links in `text-[11px]`:
- "View dose-response" — navigates to `/studies/{studyId}/dose-response`
- "View histopathology" — navigates to `/studies/{studyId}/histopathology`
- "View NOAEL decision" — navigates to `/studies/{studyId}/noael-decision`

All links: `block hover:underline`, color `#3a7bd5`, arrow suffix.

#### Pane 4: Tox Assessment (conditionally shown, default closed)

Only shown when `selection.endpoint_label` exists (i.e., a specific endpoint row is selected in the evidence grid, not just an organ card).

Standard `ToxFindingForm` component — same as study-summary.md:
- Treatment related dropdown, adversity dropdown (grayed when treatment="No"), comment textarea, SAVE button.
- Keyed by `endpointLabel` (the selected endpoint).

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Local | `useState<string \| null>` |
| Domain filter | Local | `useState<string \| null>` — clears when organ changes |
| Sex filter | Local | `useState<string \| null>` |
| Selected row | Shared via context | `ViewSelectionContext` with `_view: "target-organs"` tag |
| Sorting | Local | `useState<SortingState>` — TanStack sorting state |
| Organ summary data | Server | `useTargetOrganSummary` hook (React Query, 5min stale) |
| Evidence detail data | Server | `useOrganEvidenceDetail` hook (React Query, 5min stale) |
| Rule results | Server | `useRuleResults` hook (consumed by context panel) |

---

## Data Flow

```
useTargetOrganSummary(studyId)  ──> organData (14 organs)
useOrganEvidenceDetail(studyId) ──> evidenceData (357 rows)
                                         |
                                    [filter by organ + domain + sex]
                                         |
                                    filteredEvidence
                                      /        \
                               Organ cards    Evidence grid
                                      \        /
                                   OrganSelection (shared)
                                         |
                              TargetOrgansContextPanel
                                   /     |      \
                          Convergence  Endpoints  ToxAssessment
```

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Context panel > Related views | Click "View dose-response" | `/studies/{studyId}/dose-response` |
| Context panel > Related views | Click "View histopathology" | `/studies/{studyId}/histopathology` |
| Context panel > Related views | Click "View NOAEL decision" | `/studies/{studyId}/noael-decision` |

**Missing cross-view links (potential improvement):**
- No link back to Study Summary from this view
- Related views pane is default-closed, easy to miss
- No organ or endpoint filter is passed when navigating to other views

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading target organ data..." |
| Error (no generated data) | Red box with instructions to run generator command |
| No organ selected | "Select an organ system above to view evidence details." centered in lower area |

---

## Current Issues / Improvement Opportunities

### Organ Cards
- No visual ordering indicator (e.g., rank number or bar) — cards are sorted by score but this is not communicated visually
- Evidence score is divided by 2 when mapping to color scale (`getSignalScoreColor(evidence_score / 2)`) — may not match user expectations of the raw score
- No search or filter for the cards themselves — with 14 organs, scanning is manageable but could scale poorly
- Cards wrap naturally via flex-wrap but no indicator of how many are off-screen on narrow viewports

### Evidence Grid
- No row cap — all rows rendered regardless of count, which could cause performance issues with large datasets
- No pagination
- No column visibility toggle
- No "group by endpoint" or collapsible grouping option
- Endpoint truncation at 30 chars is longer than dose-response (25 chars) — inconsistent across views

### Context Panel
- Endpoints list capped at 15 — no way to see the full list or expand it
- InsightsList rule filtering uses `context_key === organKey || organ_system === selection.organ_system` — precise but may miss some relevant cross-organ rules
- Related views pane is default-closed — users may not discover navigation links
- Tox Assessment only appears when a specific endpoint row is selected, not for organ-level selection — no way to assess at the organ level
- No summary statistics for the selected organ (e.g., percentage treatment-related, dominant severity, count by direction)

### General
- No keyboard navigation (arrow keys in grid or between cards)
- No visual connection between organ card selection and the grid below (content changes but there is no animation or scroll-into-view)
- Selecting an organ card and clicking an evidence row are independent selection actions — the two-level selection model (organ then row) could be confusing since the context panel responds differently to each
- No export option for grid data
- No back-link to Study Summary from this view

# Target Organs View

**Route:** `/studies/:studyId/target-organs` → **redirects to** `/studies/:studyId` (study summary)
**Component:** No dedicated center-panel view. Organ selection lives in the shell-level `OrganRailMode` (`components/shell/OrganRailMode.tsx`).
**Scientific question:** "Which organ systems show converging evidence of toxicity?"
**Role:** Organ-level convergence assessment. Organ selection via the shell rail; organ-scoped content appears in the Study Summary evidence panel and context panel when an organ is selected.

> **Implementation note:** The route `/studies/:studyId/target-organs` is defined in `App.tsx` as `<Navigate to=".." replace />`, which redirects to the study summary. There is no `TargetOrgansView.tsx` or `TargetOrgansViewWrapper.tsx`. All organ-level functionality is provided by the shell rail (`OrganRailMode`) and the context panel (`TargetOrgansContextPanel` via `ContextPanel.tsx`).

---

## Architecture

```
+--[260px]--+--[rail]--+----------[flex-1]----------+--[280px]--+
|            |          |                            |            |
| Browsing   | Organ    | Study Summary View         | Context    |
| Tree       | Rail     | (center panel content)     | Panel      |
|            | Mode     |                            | (organ-    |
|            | (shell)  |                            |  scoped)   |
+------------+----------+----------------------------+------------+
```

When the user navigates to `/target-organs`, the redirect shows the study summary in the center panel. The shell-level `OrganRailMode` (in `PolymorphicRail`) provides organ selection. Clicking an organ updates `StudySelectionContext`, which the study summary and context panel react to.

---

## Organ Rail (shell-level `OrganRailMode`)

**File:** `frontend/src/components/shell/OrganRailMode.tsx` (394 lines)

The organ rail is a shell-level component in `PolymorphicRail`, not embedded in a view. It fetches its own data via `useTargetOrganSummary()`, `useStudySignalSummary()`, and `useOrganEvidenceDetail()`.

### Header

- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` -- "Organ systems ({N})"
- Search input: filters organs by name (case-insensitive substring match)

### Filters

- Search text (organ name)
- Adverse-only checkbox
- Significant-only checkbox

### Sort Modes (`OrganSortMode`)

- **Evidence** (default): targets first, then `evidence_score` descending
- **Adverse**: `n_treatment_related` descending
- **Effect**: `max_signal_score` descending
- **Alpha**: alphabetical by `organ_system`

### Rail Items

Each `OrganRailItem` is a `<button>`:

**Row 1:** Organ name (`text-xs font-semibold`, `titleCase()`) + direction arrow + TARGET badge (if `target_organ_flag`)

**Row 2:** Evidence bar with popover -- neutral gray fill, proportional to `evidence_score / maxEvidenceScore`

**Row 3:** Signal metrics -- min p-value, max |d|, dose consistency label (all neutral text)

**Row 4:** Counts and domain labels (plain colored text via `getDomainBadgeColor().text`)

**Row 5:** Max effect size and trend p-value

### Per-Organ Stats

`computeOrganRailStats(rows)` returns:
- `maxAbsEffectSize: number | null`
- `minTrendP: number | null`
- `dominantDirection: string | null`

### Keyboard Navigation

Uses `useRailKeyboard()` hook -- arrow keys navigate organ list, Enter/Space selects.

### Selection

Clicking an organ calls `navigateTo({ organSystem: organ })` which updates `StudySelectionContext`.

---

## Center-Panel Content

> **NOT IMPLEMENTED.** The route `/studies/:studyId/target-organs` redirects to the study summary view. No dedicated `TargetOrgansView.tsx` exists. The organ summary header, tab bar, evidence tab, hypotheses tab, and metrics tab described below are **planned features** that have not been built. Organ-scoped content currently appears in the Study Summary evidence panel when an organ is selected via the shell rail.

The following sections document the **planned design** for a future dedicated center-panel view. They are retained for reference but do not reflect current code.

---

## Helper Functions

### `deriveSexLabel(rows: OrganEvidenceRow[]): string`
Returns "Male only", "Female only", or "Both sexes" based on unique `sex` values in the organ's evidence rows.

### `getDoseConsistency(rows: OrganEvidenceRow[]): "Weak" | "Moderate" | "Strong"`
Groups rows by endpoint, computes significance-rate-per-dose-level, checks monotonicity.
- **Strong**: >50% of endpoints monotonic AND >=3 dose groups with significant findings
- **Moderate**: some monotonic OR >=2 dose groups with significant findings
- **Weak**: everything else

### `deriveOrganConclusion(organ, evidenceRows, organRules): string`
Builds a deterministic 1-line conclusion from convergence status, domain spread, significance, sex, and dose relationship.

### `computeOrganStats(rows: OrganEvidenceRow[]): OrganStats`
Computes min p-value, max absolute effect size, and dose consistency from evidence rows.

---

## Context Panel (Right Sidebar -- 280px)

Route-detected: when pathname matches `/studies/{studyId}/target-organs`, shows `TargetOrgansContextPanel` via `TargetOrgansContextPanelWrapper` in `ContextPanel.tsx`.

The wrapper fetches `organData` (via `useTargetOrganSummary`), `evidenceData` (via `useOrganEvidenceDetail`), and `ruleResults` (via `useRuleResults`) from shared React Query cache. Selection flows from `ViewSelectionContext` (filtered to `_view: "target-organs"`).

### No Selection State

- Message: "Select an organ system to view convergence details."
- `p-4 text-xs text-muted-foreground`

### With Selection

#### Header

- `sticky top-0 z-10 border-b bg-background px-4 py-3`
- Row 1: organ name (`text-sm font-semibold`, `titleCase()`) + `CollapseAllButtons` (expand/collapse all panes)
- Row 2 (left): evidence score (`font-semibold` if >= 0.5, `font-medium` otherwise) + TARGET ORGAN badge (if flagged, `text-[10px] font-semibold uppercase text-[#DC2626]`)
- Row 2 (right): `TierCountBadges` showing Critical/Notable/Observed counts with clickable tier filter via `tierFilter` state

Collapse/expand all functionality is powered by `useCollapseAll()` hook, which provides generation counters (`expandGen`, `collapseGen`) passed to each `CollapsiblePane`.

#### Pane 1: Convergence (default open)

Compact tier count summary (not full InsightsList — that lives in the center Hypotheses tab to avoid redundancy).
- Rules filtered to those matching `context_key === "organ_{organ_system}"` or `organ_system === selection.organ_system`.
- Renders: "{N} critical signal(s), {M} notable signal(s), {K} observed across {T} rules."
- Domains line: unique domains extracted from `organEvidence` rows (not context_key), rendered as `DomainLabel` colored text components, sorted alphabetically.
- Footer: "See Hypotheses tab for full insights."
- Empty state: "No convergence rules for this organ."

#### Pane 2: Domain coverage (default open)

Per-domain endpoint count summary (not individual endpoints — that lives in the center Evidence tab to avoid redundancy).
- Groups endpoints by domain, counts per domain, sorted by count descending.
- **Note:** Domain counts are derived from the top 15 unique endpoints (by occurrence count), not all evidence rows. Organs with more than 15 unique endpoints may show incomplete domain coverage counts.
- Each row: domain code (plain colored text `text-[9px] font-semibold` with `getDomainBadgeColor().text`) + endpoint count (`text-muted-foreground`).
- Footer: "See Evidence tab for full endpoint list."
- Empty state: "No endpoints for this organ."

#### Pane 3: Tox Assessment (conditionally shown — annotation before navigation)

Only shown when `selection.endpoint_label` exists (i.e., a specific endpoint row is selected in the evidence table, not just an organ).

Standard `ToxFindingForm` component with `endpointLabel` prop. Not wrapped in a `CollapsiblePane`. Note: no explicit React `key` prop is set — remounting is controlled by the parent conditional (`selection.endpoint_label` existing).

#### Pane 4: Related Views (default closed)

Cross-view navigation links in `text-[11px]`:
- "View dose-response" -- navigates to `/studies/{studyId}/dose-response` with `{ state: { organ_system } }`
- "View histopathology" -- navigates to `/studies/{studyId}/histopathology` with `{ state: { organ_system } }`
- "View NOAEL decision" -- navigates to `/studies/{studyId}/noael-decision` with `{ state: { organ_system } }`

All links: `block text-primary hover:underline`, arrow suffix.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Shared via context | `StudySelectionContext` (`studySelection.organSystem`) -- set by shell-level `OrganRailMode` |
| Rail search | Local (OrganRailMode) | `useState<string>` inside `OrganRailMode` shell component |
| Rail sort | Local (OrganRailMode) | `useState<OrganSortMode>` -- "evidence" \| "adverse" \| "effect" \| "alpha" |
| Rail filters | Local (OrganRailMode) | adverse-only, significant-only checkboxes |
| Tier filter | Local (context panel) | `useState<Tier \| null>` -- filters InsightsList tiers |
| Collapse all | Local (context panel) | `useCollapseAll()` -- generation counters for expand/collapse |
| Organ summary data | Server | `useTargetOrganSummary` hook (React Query, 5min stale) -- fetched by OrganRailMode |
| Evidence detail data | Server | `useOrganEvidenceDetail` hook (React Query, 5min stale) -- fetched by OrganRailMode |
| Signal summary data | Server | `useStudySignalSummary` hook -- fetched by OrganRailMode for stats |
| Rule results | Server | `useRuleResults` hook (shared cache with context panel) |

---

## Data Flow

```
OrganRailMode (shell component)
  ├─ useTargetOrganSummary(studyId)  --> organData (14 organs)
  ├─ useStudySignalSummary(studyId)  --> signal data for rail stats
  └─ useOrganEvidenceDetail(studyId) --> evidence data for stats
                    |
          sorted/filtered organ list
                    |
          [user clicks organ] --> navigateTo({ organSystem: organ })
                    |
          StudySelectionContext.organSystem updated
                    |
          TargetOrgansContextPanel (via ContextPanel.tsx routing)
                /     |       \       \
         Convergence  Domain    Related  ToxAssessment
         (tier count  coverage  Views    (conditional)
          summary)    (counts)
```

> **Note:** No center-panel view processes organ data. Organ-scoped content appears only in the context panel and (when organ is selected) in the Study Summary evidence panel.

---

## Cross-View Navigation

### Inbound
- Route `/studies/:studyId/target-organs` redirects to study summary via `<Navigate to=".." replace />`
- From other views passing `{ organ_system: string }` in `location.state` -- the shell rail reads `StudySelectionContext` to highlight the matching organ.

### Outbound (Context panel -- Related views pane)
| Action | Navigates To | State Passed |
|--------|-------------|-------------|
| "View dose-response" | `/studies/{studyId}/dose-response` | `{ organ_system }` |
| "View histopathology" | `/studies/{studyId}/histopathology` | `{ organ_system }` |
| "View NOAEL decision" | `/studies/{studyId}/noael-decision` | `{ organ_system }` |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading (rail) | Spinner in `OrganRailMode` while data fetches |
| No data at all (rail) | Empty rail state |
| Empty search results (rail) | "No matches for '{search}'" |
| No organ selected (context panel) | "Select an organ system to view convergence details." |

---

## Changelog

### 2026-02-12 -- 78-rule audit fixes (Phase 4)

- **Top findings evidence pattern:** Replaced `group-hover/finding:text-[#DC2626]` with canonical `ev` class + `data-evidence-row`/`data-evidence` attributes (C-03). Effect size and p-value now use interaction-driven evidence coloring consistent with all other views.
- **Direction symbol token:** Replaced `text-[#9CA3AF]` with `text-muted-foreground` on direction symbols in top findings (C-10).

### 2026-02-12 -- Color audit C-01 through C-36

- **Rail items:** Removed colored left border (`border-l-[#DC2626]`), tier dots (`organTierDot()`), and `bg-blue-50/60` selected state. Now: `bg-accent` selection, no left border, single "TARGET" badge as Tier 1 conclusion indicator per card. Eliminates decision-red repetition (was 3× `#DC2626` per target organ card).

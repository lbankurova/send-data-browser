# Target Organs View

**Route:** `/studies/:studyId/target-organs` → **redirects to** `/studies/:studyId` (study summary)
**Component:** No dedicated center-panel view. Organ selection lives in the shell-level `OrganRailMode` (`components/shell/OrganRailMode.tsx`).
**Scientific question:** "Which organ systems show converging evidence of toxicity?"
**Role:** Organ-level convergence assessment. Organ selection via the shell rail; organ-scoped content appears in the Study Summary evidence panel and context panel when an organ is selected.

> **Implementation note:** The route `/studies/:studyId/target-organs` is defined in `App.tsx` as `<Navigate to=".." replace />`, which redirects to the study summary. There is no `TargetOrgansView.tsx` or `TargetOrgansViewWrapper.tsx`. All organ-level functionality is provided by the shell rail (`OrganRailMode`). There is no dedicated `TargetOrgansContextPanel` -- when the redirect lands on the study summary route, the `StudySummaryContextPanel` is shown instead.

---

## Architecture

```
+--[260px]--+--[rail]--+----------[flex-1]----------+--[280px]--+
|            |          |                            |            |
| Browsing   | Organ    | Study Summary View         | Study      |
| Tree       | Rail     | (center panel content)     | Summary    |
|            | Mode     |                            | Context    |
|            | (shell)  |                            | Panel      |
+------------+----------+----------------------------+------------+
```

When the user navigates to `/target-organs`, the redirect shows the study summary in the center panel. The shell-level `OrganRailMode` (in `PolymorphicRail`) provides organ selection. Clicking an organ updates `StudySelectionContext`, which the study summary view and its context panel react to. The context panel shown is the `StudySummaryContextPanel` (since the route is the study summary route after redirect).

---

## Organ Rail (shell-level `OrganRailMode`)

**File:** `frontend/src/components/shell/OrganRailMode.tsx` (416 lines)

The organ rail is a shell-level component in `PolymorphicRail`, not embedded in a view. It fetches its own data via `useTargetOrganSummary()`, `useStudySignalSummary()`, and `useOrganEvidenceDetail()`. It also reads global filters via `useGlobalFilters()` from `GlobalFilterContext`.

### Header

`border-b px-2.5 py-1.5`

- Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` -- "Organs ({filtered}/{total})" or "Organs ({N})" when no filter is active
- Sort dropdown: `<select>` element with options "Sort: Evidence (default)", "Sort: Adverse count", "Sort: Effect size", "Sort: A-Z"
- `FilterShowingLine`: below sort dropdown, shows active filter summary (search term, sex, adverse only, significant only, severity, and filtered/total count)

### Filters

Filters come from `GlobalFilterContext` (shared with other views), not local state:
- `filters.search` -- search text (organ name, case-insensitive substring match, underscores replaced with spaces)
- `filters.adverseOnly` -- adverse-only toggle
- `filters.significantOnly` -- significant-only toggle
- `filters.minSeverity` -- minimum severity filter (filters organs with `max_severity >= minSeverity`)

### Sort Modes (`OrganSortMode`)

- **Evidence** (default): targets first, then `evidence_score` descending
- **Adverse**: `n_treatment_related` descending
- **Effect**: `max_signal_score` descending
- **Alpha**: alphabetical by `organ_system`

### Rail Items

Each `OrganRailItem` is a `<button>` using shared design tokens from `lib/design-tokens.ts`:
- Base: `rail.itemBase` (`w-full text-left border-b border-border/40 border-l-2 transition-colors`)
- Selected: `rail.itemSelected` (`border-l-primary bg-blue-50/80 dark:bg-blue-950/30`)
- Idle: `rail.itemIdle` (`border-l-transparent hover:bg-accent/30`)
- Padding: `px-3 py-2`

**Row 1:** Organ name (`text-xs font-semibold`, `titleCase()`) + direction symbol (`text-[10px] text-muted-foreground/60`, unicode arrows from `signalStats.dominantDirection`) + TARGET badge (if `target_organ_flag`, `text-[9px] font-semibold uppercase text-[#DC2626]`)

**Row 2:** `EvidenceBar` component with `EvidenceScorePopover` (?) button -- neutral gray fill, proportional to `evidence_score / maxEvidenceScore`. Evidence score label uses `font-semibold` if >= 0.5, `font-medium` if >= 0.3.

**Row 3:** Signal metrics from `computeOrganStats()` (from `organ-analytics.ts`) -- min p-value (`font-mono text-muted-foreground`, `font-semibold` when < 0.001, `font-medium` when < 0.01), max |d| (`font-mono text-muted-foreground`, `font-semibold` when >= 0.8, `font-medium` when >= 0.5), dose consistency label (`text-[9px] text-muted-foreground` with weight from `getDoseConsistencyWeight()`)

**Row 4:** Counts and domain labels (`text-[10px] text-muted-foreground`) -- "{n_significant} sig", "{n_treatment_related} TR", "{n_domains} domain(s)", followed by `DomainLabel` colored text components for each domain

**Row 5:** Max |d| and trend p from signal data (`signalStats`, computed from `SignalSummaryRow[]`) -- `text-[10px] tabular-nums text-muted-foreground` with `font-mono` and `font-semibold` emphasis for strong values

**Separator:** When sorted by evidence, a divider row "Other organs" (`text-[9px] uppercase tracking-wider text-muted-foreground/50`) appears between target and non-target organs.

### Per-Organ Stats

Two stat sources per organ:

**`computeOrganStats(rows: OrganEvidenceRow[])` (from `organ-analytics.ts`)** returns `OrganStats`:
- `minPValue: number | null`
- `maxEffectSize: number | null`
- `doseConsistency: "Weak" | "Moderate" | "Strong"`

**`computeOrganRailStats(signals: SignalSummaryRow[])` (local in OrganRailMode)** returns `OrganRailStats`:
- `maxAbsEffectSize: number`
- `minTrendP: number | null`
- `dominantDirection: "↑" | "↓" | "↕" | null` (based on significant up/down counts)

### Keyboard Navigation

Uses `useRailKeyboard()` hook -- arrow keys navigate organ list, Enter/Space selects.

### Selection

Clicking an organ calls `navigateTo({ organSystem: organ.organ_system })` which updates `StudySelectionContext`. Selected state is determined by `selection.organSystem === organ.organ_system`. Deselection is handled by `clearSelection` (from `useStudySelection`) triggered by `useRailKeyboard` Escape key.

---

## Center-Panel Content

> **NOT IMPLEMENTED.** The route `/studies/:studyId/target-organs` redirects to the study summary view. No dedicated `TargetOrgansView.tsx` exists. The organ summary header, tab bar, evidence tab, hypotheses tab, and metrics tab described below are **planned features** that have not been built. Organ-scoped content currently appears in the Study Summary evidence panel when an organ is selected via the shell rail.

The following sections document the **planned design** for a future dedicated center-panel view. They are retained for reference but do not reflect current code.

---

## Helper Functions

**File:** `frontend/src/lib/organ-analytics.ts`

### `computeOrganStats(rows: OrganEvidenceRow[]): OrganStats`
Computes min p-value, max absolute effect size, and dose consistency from evidence rows.

### `getDoseConsistencyFromEvidence(rows: OrganEvidenceRow[]): "Weak" | "Moderate" | "Strong"`
Groups rows by endpoint, computes significance-rate-per-dose-level, checks monotonicity.
- **Strong**: >50% of endpoints monotonic AND >=3 dose groups with significant findings
- **Moderate**: some monotonic OR >=2 dose groups with significant findings
- **Weak**: everything else

### `deriveSexLabel(rows: OrganEvidenceRow[]): string`
Returns "Male only", "Female only", or "Both sexes" based on unique `sex` values in the organ's evidence rows.

### `deriveOrganConclusion(organ, evidenceRows, organRules): string`
Builds a deterministic 1-line conclusion from convergence status, domain spread, significance, sex, and dose relationship. Uses `deriveSexLabel()` and `getDoseConsistencyFromEvidence()` internally.

---

## Context Panel (Right Sidebar -- 280px)

> **No dedicated context panel.** There is no `TargetOrgansContextPanel` component and no route-detection for `/target-organs` in `ContextPanel.tsx`. Since the route redirects to the study summary, the `StudySummaryContextPanel` is shown instead. Organ-scoped content in the context panel is managed by the study summary view's context panel when an organ is selected via `StudySelectionContext.organSystem`.

---

## State Management

| State | Scope | Managed By |
|-------|-------|------------|
| Selected organ | Shared via context | `StudySelectionContext` (`selection.organSystem`) -- set by shell-level `OrganRailMode` via `navigateTo()` |
| Rail sort | Local (OrganRailMode) | `useState<OrganSortMode>("evidence")` -- "evidence" \| "adverse" \| "effect" \| "alpha" |
| Rail filters | Shared via context | `GlobalFilterContext` (`useGlobalFilters()`) -- search, sex, adverseOnly, significantOnly, minSeverity |
| Organ summary data | Server | `useTargetOrganSummary` hook (React Query, 5min stale) -- fetched by OrganRailMode |
| Evidence detail data | Server | `useOrganEvidenceDetail` hook (React Query, 5min stale) -- fetched by OrganRailMode for `computeOrganStats` |
| Signal summary data | Server | `useStudySignalSummary` hook -- fetched by OrganRailMode for `computeOrganRailStats` |

---

## Data Flow

```
OrganRailMode (shell component)
  ├─ useTargetOrganSummary(studyId)     --> organData (organ rows)
  ├─ useStudySignalSummary(studyId)     --> signal data for computeOrganRailStats
  ├─ useOrganEvidenceDetail(studyId)    --> evidence data for computeOrganStats
  └─ useGlobalFilters()                 --> filters (search, sex, adverse, sig, severity)
                    |
          sorted/filtered organ list
                    |
          [user clicks organ] --> navigateTo({ organSystem: organ })
                    |
          StudySelectionContext.organSystem updated
                    |
          StudySummaryContextPanel (via ContextPanel.tsx routing on study summary route)
```

> **Note:** No center-panel view or dedicated context panel processes organ data. The route redirects to study summary, which has its own context panel. Organ selection in the rail updates `StudySelectionContext`, which the study summary view and context panel react to.

---

## Cross-View Navigation

### Inbound
- Route `/studies/:studyId/target-organs` redirects to study summary via `<Navigate to=".." replace />`
- From other views passing `{ organ_system: string }` in `location.state` -- the shell rail reads `StudySelectionContext` to highlight the matching organ.

### Outbound
No direct outbound navigation from OrganRailMode. The organ rail updates `StudySelectionContext.organSystem`, which other views and context panels react to. Cross-view navigation links (dose-response, histopathology, NOAEL) are provided by the `StudySummaryContextPanel` when an organ is selected, not by a dedicated target organs context panel.

---

## Error / Loading States

| State | Display |
|-------|---------|
| No data at all (rail) | "No organ data available" -- `px-3 py-4 text-center text-[11px] text-muted-foreground` |
| Empty search results (rail) | "No matches for \u201C{search}\u201D" -- same styling |
| Empty filtered results (rail) | No items rendered (empty organ list) |

---

## Changelog

### 2026-02-15 -- Spec sync with codebase

- **No TargetOrgansContextPanel:** Removed all references to a dedicated context panel. The `/target-organs` route redirects to study summary, so `StudySummaryContextPanel` is shown. There is no route-detection for target-organs in `ContextPanel.tsx`.
- **OrganRailMode line count:** Updated from 394 to 416 lines.
- **Filters from GlobalFilterContext:** Rail does not have local search/filter state. All filtering (search, sex, adverseOnly, significantOnly, minSeverity) comes from `GlobalFilterContext` via `useGlobalFilters()`.
- **Header label:** Changed from "Organ systems" to "Organs" to match code. Added sort dropdown and `FilterShowingLine` descriptions.
- **Rail item design tokens:** Documented use of `rail.itemBase`, `rail.itemSelected`, `rail.itemIdle` from `design-tokens.ts` with left border treatment.
- **Per-organ stats:** Documented both stat sources (`computeOrganStats` from `organ-analytics.ts` and local `computeOrganRailStats`).
- **Evidence bar popover:** Documented `EvidenceScorePopover` component on rail items.
- **Target/non-target separator:** Documented separator row in evidence sort mode.
- **Helper functions:** Updated to reflect `organ-analytics.ts` file location and actual function names (`getDoseConsistencyFromEvidence` not `getDoseConsistency`).
- **State management:** Removed context panel state rows (tier filter, collapse all). Added GlobalFilterContext.
- **Data flow:** Removed TargetOrgansContextPanel from diagram. Added GlobalFilterContext source.

### 2026-02-12 -- 78-rule audit fixes (Phase 4)

- **Top findings evidence pattern:** Replaced `group-hover/finding:text-[#DC2626]` with canonical `ev` class + `data-evidence-row`/`data-evidence` attributes (C-03). Effect size and p-value now use interaction-driven evidence coloring consistent with all other views.
- **Direction symbol token:** Replaced `text-[#9CA3AF]` with `text-muted-foreground` on direction symbols in top findings (C-10).

### 2026-02-12 -- Color audit C-01 through C-36

- **Rail items:** Removed colored left border (`border-l-[#DC2626]`), tier dots (`organTierDot()`), and `bg-blue-50/60` selected state. Now: `bg-accent` selection, no left border, single "TARGET" badge as Tier 1 conclusion indicator per card. Eliminates decision-red repetition (was 3× `#DC2626` per target organ card).

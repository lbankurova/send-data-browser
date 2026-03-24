# Study Summary View

**Route:** `/studies/:studyId`
**Query parameters:** `?tab=details|insights` (optional — sets initial active tab)
**Component:** `StudySummaryView.tsx` (wrapped by `StudySummaryViewWrapper.tsx`)
**Cognitive mode:** Orientation — conclusions surfaced in profile block; evidence available via drill-down to other views
**Scientific question:** "What happened in this study?"
**Role:** Entry point after opening a study. Study overview and orientation. Provides a dense profile of the study design, data quality, and key conclusions, plus cross-study intelligence.

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

The Study Summary View itself is split into two tabs with a shared tab bar:

```
+-------------------------------------------------------------------+
| [Study Details]  [Cross-study insights]              [Gen Report] |  <-- tab bar, border-b
+-------------------------------------------------------------------+
|                                                                   |
|  Tab content (fills remaining height, scrollable)                 |
|                                                                   |
+-------------------------------------------------------------------+
```

A `RecalculatingBanner` overlays the top of the view when data is being recalculated (`isFetching && isPlaceholderData`).

---

## Tab Bar

- **Position:** Top of the view, full width, `border-b`
- **Tabs:** "Study details" (first) and "Cross-study insights" (second)
- **Active indicator:** `h-0.5 bg-primary` underline at bottom of active tab
- **Tab text:** `text-xs font-medium`. Active = `text-foreground`. Inactive = `text-muted-foreground`. Sentence case for tab labels.
- **Generate Report button:** Right-aligned in tab bar via `ViewTabBar`'s `right` prop. Wrapped in `px-3 py-2` div. Classes: `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50`. Icon `FileText` (h-3.5 w-3.5) + "Generate report" label (sentence case). Opens HTML report in new tab via `generateStudyReport(studyId)`.

---

## Tab 1: Study Details

Fixed header + scrollable body. The profile block is a frozen `shrink-0 border-b` section; everything below scrolls in `flex-1 overflow-auto`. Contains sections in vertical stack: Study Profile Block (single-column stack), Provenance Warnings (conditional), Study Timeline (in CollapsiblePane), Domain Table (in CollapsiblePane), and Data Quality (in CollapsiblePane, default closed).

### Study Profile Block

Dense single-column stack header pinned at top. Container: `shrink-0 border-b px-4 pb-4 pt-4`.

**Study identity line:**

Single `text-xs font-semibold uppercase tracking-wider` span containing subtitle parts (species+strain, duration+route, etc.) separated by `|` dividers (`text-border`), all lowercase. Ends with `{nGroups} groups, {totalSubjects} subjects`. Optionally includes pipeline stage with a colored indicator dot (`h-1.5 w-1.5 rounded-full`, green `#16a34a` for "submitted", purple `#9333ea` otherwise) and stage label with underscores replaced by spaces.

**Supporting lines:** `mt-1.5 space-y-0.5 text-[11px] text-muted-foreground`:

- **Groups:** "Groups: {doseLabels}" comma-joined ascending. Control groups shown as "Control", others as `{dose_value} {dose_unit}`.
- **Arms:** "Arms: Main: {N}" with optional ` · Recovery: {N}` and ` · TK satellite: {N}`.
- **TK/Recovery notes (conditional):** "TK satellite subjects excluded from toxicology endpoints" and/or recovery pooling note ("Recovery arms included in treatment-period statistics" or "Recovery arms excluded from treatment-period statistics").

**NOAEL & conclusions block (conditional):** Only rendered when NOAEL or target organ data is available. `mt-3` spacing.

- **NOAEL/LOAEL line:** `flex items-baseline gap-1.5 text-xs` — "NOAEL: {dose}" (`font-semibold`) with optional sex qualifier in `text-[11px] text-muted-foreground`, `|` divider, "LOAEL: {dose}" (`font-semibold`). After NOAEL/LOAEL: `|` divider then supporting counts in `text-[11px] font-normal text-muted-foreground` — target organ count, domains with signals count, confidence percentage, all joined by ` · `.
- **Exposure at NOAEL (conditional):** `mt-0.5 text-[11px] text-muted-foreground`. Label `font-medium` — "At NOAEL:" or "At LOAEL:" with `Cmax {mean} {unit} · AUC {mean} {unit}`.
- **HED/MRSD (conditional):** `mt-0.5 text-[11px] text-muted-foreground`. When PK `hed` data available and `noael_status !== "at_control"`. Format: `"HED: {hed_mg_kg} mg/kg · MRSD: {mrsd_mg_kg} mg/kg"` with `font-medium` labels.
- **Dose proportionality warning (conditional):** `mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground`. `AlertTriangle` icon (amber-500) + interpretation text.
- **Study-level interpretation notes:** Filtered by `domain === null`. Each `mt-0.5 flex items-start gap-1 text-[11px]` with severity-dependent icon (`AlertTriangle` amber-500 for caution, `Info` muted-foreground for info). Text in `text-muted-foreground` with format `{category}: {note}`.

**Data sources:** `useStudyMetadata` (species, strain, route, dose_groups, study_type, dosing_duration, pipeline_stage), `useStudyContext` (dosingDurationWeeks, recoveryPeriodDays), `useNoaelSummary` (NOAEL/LOAEL values, confidence), `useTargetOrganSummary` (target organ count), signal data (domain signal count), `usePkIntegration`, `getInterpretationContext()` (species/vehicle/route notes).

### Provenance Warnings (conditional)

Rendered after the Profile Block, before the Study Timeline. Only shown when filtered provenance warnings exist (excludes Prov-001..004 and Prov-006, which are shown in Data Quality). Container: `border-b px-4 py-3 space-y-0.5`.

Each message: `flex items-start gap-2 text-[11px] leading-snug`. Icon: `AlertTriangle` (amber-500). Text: `text-amber-700`. Includes a "Configure →" link button that scrolls to the context panel.

### Study Timeline

Wrapped in `CollapsiblePane` with `title="Study timeline"` and `defaultOpen`. Only renders when `doseGroups.length > 0` and `studyCtx.dosingDurationWeeks` is available.

**Component:** `StudyTimeline` from `components/analysis/charts/StudyTimeline.tsx`.

Spacious SVG swimlane visualization showing study design, phases, and death events as horizontal dosing lanes. The component self-wraps in a card container (`rounded-md border p-3`). No `maxHeight` cap — the SVG scales naturally with its 1050px viewBox.

**Props:** `doseGroups`, `dosingDurationWeeks`, `recoveryPeriodDays`, `treatmentRelatedDeaths` (`mortalityData.deaths` — backend-classified TR), `accidentalDeaths` (`mortalityData.accidentals` — backend-classified incidental), `excludedSubjects`.

**SVG layout constants:**
- `SVG_WIDTH = 1050`, `LEFT_MARGIN = 90`, `RIGHT_MARGIN = 467` (annotation area)
- `ROW_PITCH = 34`, `LANE_HEIGHT = 20`
- `TOP_MARGIN = 24`, `BOTTOM_AXIS_HEIGHT = 30`, `TK_LANE_HEIGHT = 10`, `TK_LANE_GAP = 14`
- `DEATH_R = 3.5`, `DEATH_OFFSET_ABOVE = 3`
- Chart width = `SVG_WIDTH - LEFT_MARGIN - RIGHT_MARGIN`. Annotation area starts at `SVG_WIDTH - RIGHT_MARGIN + ANNOT_GAP`.
- Responsive via `width="100%"`. No `maxHeight` style — scales proportionally.

**Elements:**

1. **Reference lines (3 vertical):**
   - **D1 "First dose":** Light dashed line (`stroke="#D1D5DB"`, `strokeWidth={0.75}`) from `TOP_MARGIN` to lanes bottom. Label "First dose" above in 8px muted-foreground.
   - **Terminal sacrifice:** Dashed line (`stroke="#9CA3AF"`, `strokeWidth={1}`) at dosing end day. Label "Terminal sac." above. Tooltip: `"Terminal sacrifice · D{dosingDays}"`.
   - **End of recovery (conditional):** Light dashed line at `totalDays`, only when `hasRecovery`. Label "End recovery" above. Tooltip: `"End of recovery · D{totalDays}"`.

2. **Dose group lanes:** One horizontal bar per main (non-recovery) group, sorted by `dose_level` ascending. Each lane occupies `LANE_HEIGHT` (20px) with `ROW_PITCH` (46px) spacing.
   - **Left label line 1:** Dose label + N total (via `formatDoseShortLabel`), format `"{dose} (n={n_total})"`, `fill-foreground` 11px font-weight 600, right-aligned at `LEFT_MARGIN - 6`, vertically centered with bar.
   - **Left label line 2 (sub-label):** Sex split + optional death count (e.g., `"10M / 10F · 2 TR deaths"`), 9px muted-foreground, positioned 10px below bar bottom.
   - **Dosing bar:** Rectangle from Day 1 to terminal sacrifice, filled with `getDoseGroupColor(dose_level)`, `opacity={0.85}`, `rx={3}`. Tooltip: dose label, sex split, N, death counts (TR + incidental), recovery info.
   - **Recovery extension (conditional):** Rendered when `hasRecovery && group.recovery_armcd && group.recovery_n > 0`. Uses the main group's own `recovery_n` field (NOT separate recovery group entries). Lighter rectangle from terminal to study end. Fill: group color lightened 50%, `opacity={0.7}`, dashed stroke. Text inside: `"R:{recovery_n}"` in group color, 8px font. Tooltip with subject count and day range.

3. **Death markers (conditional):** Rendered per lane from `treatmentRelatedDeaths` + `accidentalDeaths` props. Each death with non-null `study_day` is mapped to its lane by `dose_level`. **Positioned 3px above bar top** per spec §4.3.
   - **TR death:** Filled red circle (`fill="#DC2626"`, `stroke="white"`, `strokeWidth={1.5}`, `r={3.5}`). Source: `mortalityData.deaths` (backend-classified).
   - **Non-TR / incidental death:** Hollow circle (`fill="white"`, `stroke="#6B7280"`, `strokeWidth={1.5}`, `r={3.5}`). Source: `mortalityData.accidentals`.
   - **Attribution logic:** Uses the backend's classification (deaths[] = TR, accidentals[] = incidental). No client-side text parsing of DDRESCAT.
   - **Stacking:** Multiple deaths on the same day stacked upward by `DEATH_R * 2 + 1` per prior same-day death.
   - **Tooltip:** Subject ID, study day, dose label, attribution (TR / incidental), cause (if available), exclusion status (included/excluded from analysis).

4. **TK satellite lane (conditional, Variant A pooled):** Rendered below main lanes with `TK_LANE_GAP` (14px) spacing. **Thinner** than main lanes: `TK_LANE_HEIGHT = 10` (spec: 8-10px).
   - **Left label:** `"TK satellites (n={tkTotal})"` in muted-foreground, italic, 9px.
   - **Background:** Light gray rectangle (`fill="#F3F4F6"`) with dashed gray border. Tooltip: subject count + exclusion note.
   - **Per-group segments:** Equal-width sub-rectangles, each lightened group color with centered TK count in group color, 7px bold.
   - **Right annotation:** `"Excluded from tox analyses"` in muted-foreground italic 8px.

5. **Day axis:** "Study day" label at left margin (9px font-weight 500). Tick marks along the bottom. Ticks generated by `dayTicks()` — always includes Day 1 and dosing end day; intermediate ticks at 7/14/28-day intervals depending on study length. Format: `"D{day}"`, 9px muted-foreground.

6. **Legend (conditional, HTML below SVG):** Rendered when the timeline has recovery, TK, or deaths. Single-row flex-wrap layout, `text-[10px] text-muted-foreground`, `gap-x-4 gap-y-0.5`. Items:
   - Treatment (colored rect swatch, `h-2.5`)
   - Recovery (lighter rect with dashed border) — only if recovery exists
   - TK satellites (gray dashed rect, `h-2`) — only if TK lane exists
   - TR death (red filled circle SVG) — only if TR deaths exist
   - Incidental death (hollow gray circle SVG) — only if non-TR deaths exist
   - Terminal sacrifice (dashed vertical line SVG)

### Domains ({count})

Wrapped in `CollapsiblePane` with `title="Domains ({count})"` and `defaultOpen`.

**Component:** `DomainTable` — aggregates signal data per domain, sorts by adversity tier, and generates key findings text.

**Table:** `w-full text-[11px]` inside `h-full overflow-auto`:
- Sticky header: `sticky top-0 z-10 bg-background`, `<tr>` with `border-b bg-muted/30`.
- Header cells: `px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`.

| Column | Header | Align | Cell rendering | Width |
|--------|--------|-------|----------------|-------|
| Domain | Domain | left | `<Link>` to domain browser — domain code (`font-mono`) + full name (`text-muted-foreground`) + record count (`text-[10px] text-muted-foreground`). Link: `text-primary hover:underline`. | `1px; nowrap` |
| Subjects | Subjects | right | `tabular-nums text-muted-foreground`. DS domain (with mortality): `"{N} deaths"` + "View TRS animals" link to cohort view (`/studies/{studyId}/cohort?preset=trs`). Others: subject count or em dash. | `1px; nowrap` |
| Signals | Signals | right | `tabular-nums text-muted-foreground` — `"{N} TR"` or em dash | `1px; nowrap` |
| Adverse | Adverse | right | `tabular-nums text-muted-foreground` — `"{N} adv"` or em dash | `1px; nowrap` |
| Notes | Notes | left | Generated key findings text + decision-point context notes (absorber column, `width: 100%`). Context notes appended after findings with ` · ` separator. DS: `"{N} excluded from terminal stats. Confirm selection in Context Panel"`. OM (when `normTier >= 2`): BW effect size + tier label + "Confirm Organ Weight Method selection in Context Panel". Domain-scoped interpretation notes also appended when domain matches and signal requirements are met. | absorber |

**Tier system (sort order):**

| Tier | Criteria | Position |
|------|----------|----------|
| 1 | Has adverse endpoints | Above fold |
| 2 | Has TR endpoints (no adverse) | Above fold |
| 3 | Always-visible domains (DS, TF) with data | Above fold |
| 4 | Data domains without findings | Below fold |
| 5 | Structural domains (DM, EX, TA, TE, TX, TS, CO, SE, SUPP*, RELREC, SC, PM) | Below fold |

Within tier: sort by adverse count desc, then TR count desc, then row count desc.

**Below-fold toggle:** `text-[11px] text-primary hover:underline`:
- Collapsed: `"+ {N} more domains"`
- Expanded: `"Restore compact view"`

**Key findings generation** (`generateKeyFindings`):
- **TF domain only:** Shows per-specimen tumor type breakdown with counts. Format: `"{N} types SPECIMEN: finding (count) · SPECIMEN: finding (count)"`. Uses `buildTfTypeSummary()` which processes raw TF domain records fetched via `useQuery` (tiny payload, `staleTime: 5min`).
- **All other domains:** No key findings text is generated. Contextual notes from `generateContextNote()` are shown instead when relevant.

**Row hover:** `border-b transition-colors hover:bg-accent/50`.
**Domain link click:** Navigates to domain browser: `/studies/{studyId}/domains/{code}`.

**Normalization engine:** The DetailsTab calls `useOrganWeightNormalization(studyId, true, effectSizeMethod)` with `fetchEnabled: true` — this fetches findings data and populates the normalization cache. The normalization `highestTier` and `worstBwG` values are passed to the DomainTable for OM domain context notes.

### Data Quality

Wrapped in `CollapsiblePane` with `title="Data quality"` and `defaultOpen={false}`. Header right shows exception badges (conditional): missing required domain count and/or validation error count, each with `border-l-4` red accent + `font-medium text-foreground`.

Contains sub-sections in `space-y-2`:

#### Domain completeness (exception-only display)

Sub-header: `text-[11px] font-medium text-muted-foreground` — "Domain completeness ({domainProfile.label})". Appends `"— no exceptions noted"` when both required and optional are present.

Study-type-aware domain requirements via `getDomainProfile()`:
- **repeat-dose:** Required: BW, CL, DS, DM, EX, LB, MI, OM, FW. Optional: MA, TF, PP, PC, EG, VS.
- **carcinogenicity:** Same as repeat-dose plus TF required.
- **safety-pharmacology:** Required: BW, CL, DS, DM, EX, EG, VS. Optional: LB, MI, OM, FW, MA, TF, PP, PC.

- **Missing required (conditional):** `border-l-4` red accent, `font-medium text-foreground` — "Missing required: {codes}" with impact notes (e.g., "— histopath cross-reference unavailable" for MI, "— organ weight analysis unavailable" for OM). Optional missing shown below in `text-muted-foreground`.
- **Only optional missing (conditional):** `text-muted-foreground` — "Optional not submitted: {codes}".

#### Tissue battery (conditional — from `useCrossAnimalFlags`)

Sub-header: `text-[11px] font-medium text-muted-foreground` — "Tissue battery:" with inline reference counts (Terminal + Recovery tissue counts per sex from `reference_batteries`) and `"— all animals meet expected count"` when no issues.

- **Study-level note** (if present): `text-[11px] text-muted-foreground`.
- **Flagged animals (conditional):** `text-amber-700` with `AlertTriangle` — `"{N} animal(s) below expected tissue count"`.

#### Anomalies (conditional — only if warnings exist)

Component: `AnomaliesList`. Combines provenance warnings (all with `icon === "warning"`) and flagged animals (from tissue battery with `flag === true`). Each item: `text-[11px] text-amber-700` with `AlertTriangle` icon. Capped at 5 items with "+{N} more" expand button.

#### Validation issues

Always rendered. `text-[11px] text-muted-foreground`. Shows loading state, "not available", "no issues found", or counts by severity (errors with `border-b-[1.5px] border-dashed border-[#DC2626]`, warnings, info). Includes "Review all →" link to `/studies/{studyId}/validation`.

### Interpretation Context (relocated)

**Note:** Interpretation context notes are no longer rendered as a separate section. Study-level notes (those with `domain === null`) are displayed inline in the Profile Block's conclusions area, with severity-dependent icons (`AlertTriangle` for caution, `Info` for info) and format `{category}: {note}`. Domain-scoped notes are displayed in the Domain Table's Notes column.

**Data source:** `getInterpretationContext()` from `lib/species-vehicle-context.ts`. Static lookup tables derived from `docs/knowledge/species-profiles.md` and `docs/knowledge/vehicle-profiles.md`. Returns notes filtered by the study's species, strain, vehicle, and route.

**BW confounding note:** Shown in context panel's normalization summary (Analysis Settings pane) rather than in the Details tab.

**Route notes:** Oral gavage GI stress, IV injection site reactions, inhalation respiratory background, SC tissue reactions.

---

## Tab 2: Cross-Study Insights

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
   - Reference study ID: `text-[11px] text-muted-foreground` (right) — shows study ID if `ref_study` is present, or `"(this study)"` in italic if `ref_study` is null (self-referencing insights like Rule 0 and Rule 9)
2. **Detail text** — `mt-1 text-xs text-foreground` — full insight detail paragraph

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

Route-detected: when pathname matches `/studies/{studyId}`, shows `StudyDetailsContextPanel` via `StudySummaryContextPanelWrapper`.

**Wrapper architecture:** `StudySummaryContextPanelWrapper` (in `ContextPanel.tsx`) simply returns `<StudyDetailsContextPanel studyId={studyId} />`. No organ rail, no signal selection, no conditional panel switching.

### StudyDetailsContextPanel

**Component:** `components/analysis/panes/StudyDetailsContextPanel.tsx`

**Header:** `sticky top-0 z-10 flex shrink-0 items-center justify-between border-b bg-muted/30 px-4 py-[15px]` — left: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` label "Study-level settings". Right: `CollapseAllButtons` (expand/collapse all panes).

**Loading state:** `Skeleton` placeholders (`h-4 w-2/3`, `h-3 w-full`, `h-3 w-3/4`) when metadata is loading.

**Layout:** `flex h-full flex-col overflow-hidden` with scrollable body `flex-1 overflow-auto`.

**Pane 1: Analysis methods (default open)**

Single `CollapsiblePane` containing all configurable analysis and statistical parameters. Settings use `SettingsRow` + `SettingsSelect` components (defined locally). `SettingsRow`: label in `w-28 shrink-0 text-muted-foreground`, control in `shrink-0`. Explanatory text below each dropdown in `pl-[7.75rem] text-[11px] leading-snug text-muted-foreground`.

| Setting | Control | Notes |
|---------|---------|-------|
| Primary comparator | `SettingsSelect` dropdown | Lists control groups (dose_level === 0, non-recovery). Change triggers confirm dialog: "Changing comparator will recalculate all statistics. Continue?" Shows amber warning (`AlertTriangle` + `text-amber-700`) if multiple control groups detected or recovery controls excluded. |
| Organ weight method | `SettingsSelect` dropdown | Options: Per-organ recommended (default), Force absolute, Force ratio to BW, Force ratio to brain. When normalization `highestTier >= 2` **and** `normalization.state` is non-null (cache-only via `useOrganWeightNormalization(studyId, false)`), an additional summary block appears below the dropdown showing: BW effect g + tier label, brain weight g + brain tier label (with dog thresholds note for rabbit/minipig/NZW), auto/manual status + organ count at Tier 2+, and normalization rationale string. |
| Adversity threshold | `SettingsSelect` dropdown | Options: Grade >= 1, Grade >= 2, Grade >= 2 or dose-dep (default), Custom (disabled/planned). |
| Recovery pooling | `SettingsSelect` dropdown | Conditional — only when `hasRecovery`. Options: Pool with main study, Analyze separately. Confirm dialog: "Changing pooling mode will affect all treatment-period statistics. Continue?" Explanatory text varies by selection. |
| Pairwise test | `SettingsSelect` dropdown | Options: Dunnett, Williams' step-down, Steel (disabled/planned). |
| Multiplicity | `SettingsSelect` dropdown | Options vary by pairwise test selection. Dunnett: Dunnett FWER (built-in), Bonferroni, Holm-Sidak (disabled), BH-FDR (disabled). Williams: same options but Williams' controls FWER inherently (explanatory text). Explanatory text varies by selection. |
| Trend test | `SettingsSelect` dropdown | Options: Jonckheere-Terpstra, Cuzick (disabled/planned), Williams (parametric). |
| Incidence trend | `SettingsSelect` dropdown | Options: Cochran-Armitage (approx.), Logistic regression (disabled/planned). Explanatory text: "Chi-square linear contrast approximation with ordinal dose scores". |
| Effect size | `SettingsSelect` dropdown | Options: Hedges' g, Cohen's d (uncorrected), Glass's delta. Explanatory text varies by selection. |

All settings persist via `useStudySettings` centralized context (which internally uses `useSessionState` with study-scoped keys).

**Pane 2: Mortality**

`MortalityInfoPane` component, receiving `mortality={mortalityData}` and collapse/expand props.

**Pane 3: Study notes (default open if note exists)**

`CollapsiblePane`. Title "Study notes" with `headerRight` showing count: `"1 note"` or `"none"`. `defaultOpen={!!currentNote}`. Contains:
- Textarea: 4 rows, `text-xs`, placeholder "Add study-level notes..."
- Save button: `rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50`, disabled when unchanged or saving.
- Last edited timestamp: `text-[10px] text-muted-foreground/60` below save button.
- Persists via annotation API (`useAnnotations<StudyNote>` / `useSaveAnnotation<StudyNote>`).

---

## Prefetching

On mount, when `studyId` and settings are stable, the view prefetches two heavy datasets:
- `findings` — via `fetchFindings(studyId, 1, 10000, allFilters)`, key: `["findings", studyId, 1, 10000, allFilters, ""]`
- `lesion-severity-summary` — via `fetchLesionSeveritySummary(studyId)`, key: `["lesion-severity-summary", studyId, ""]`

This eliminates perceived latency when navigating to Findings or Histopathology views.

---

## State Management

| State | Scope | Managed By |
|-------|-------|-----------|
| Active tab | Session-persisted + cross-component sync | `useStudySummaryTab` hook — "details" \| "insights", initialized from `?tab=` query parameter or defaults to "details". Uses `useSessionState` with key `"pcc.studySummary.tab"` + custom DOM event `"pcc:studySummaryTabChange"` for cross-component sync between view and context panel. |
| Show all insights | Local (CrossStudyInsightsTab) | `useState<boolean>` — toggles visibility of priority 2-3 insights |
| Show folded domains | Local (DomainTable) | `useState<boolean>` — toggles below-fold domain visibility |
| Study metadata | Server | `useStudyMetadata` hook |
| Study context | Server | `useStudyContext` hook (dosingDurationWeeks, recoveryPeriodDays) |
| Signal data | Server | `useStudySignalSummary` hook (for domain table aggregation) |
| NOAEL data | Server | `useNoaelSummary` hook (for profile block conclusions) |
| Target organs | Server | `useTargetOrganSummary` hook (for target organ count) |
| Cross-animal flags | Server | `useCrossAnimalFlags` hook (tissue battery, flagged animals) |
| Provenance messages | Server | `useProvenanceMessages` hook |
| Mortality data | Server | `useStudyMortality` hook (deaths, early death subjects) |
| Domain data | Server | `useDomains` hook (domain list with row/subject counts) |
| Insights | Server | `useInsights` hook — cross-study intelligence (19 rules, 0-18) |
| PK integration | Server | `usePkIntegration` hook — exposure at NOAEL/LOAEL, HED/MRSD, dose proportionality |
| TF domain data | Server | `useQuery` for raw TF domain records (enabled when TF domain exists, staleTime 5min) |
| Interpretation notes | Derived | `getInterpretationContext()` from `lib/species-vehicle-context.ts` — species/strain/vehicle/route context notes |
| Normalization | Server/Derived | `useOrganWeightNormalization(studyId, true, effectSizeMethod)` — fetches findings, computes per-organ normalization tiers |
| Analysis methods | Session-persisted | `useStudySettings` centralized context (controlGroup, organWeightMethod, adversityThreshold, recoveryPooling, pairwiseTest, trendTest, incidenceTrend, multiplicity, effectSize) — all in single "Analysis methods" pane in context panel |
| Excluded subjects | Context | `useScheduledOnly` — early death subjects from mortality data |
| Validation results | Server | `useValidationResults` hook — domain-level validation summary |

---

## Data Flow

```
useStudyMetadata(studyId)       ──> meta (species, strain, dose_groups, etc.)
useStudyContext(studyId)        ──> studyCtx (dosingDurationWeeks, recoveryPeriodDays)
useStudySignalSummary(studyId)  ──> signalData (for domain table aggregation)
useNoaelSummary(studyId)        ──> noaelData (NOAEL/LOAEL in profile block)
useTargetOrganSummary(studyId)  ──> targetOrgans (target organ count)
useCrossAnimalFlags(studyId)    ──> crossFlags (tissue battery, flagged animals)
useProvenanceMessages(studyId)  ──> provenanceData (warnings)
useStudyMortality(studyId)      ──> mortalityData (deaths, DS domain key findings)
useDomains(studyId)             ──> domainData (domain list with counts)
useInsights(studyId)            ──> insights (cross-study intelligence)
usePkIntegration(studyId)       ──> pkData (exposure, HED/MRSD, dose proportionality)
useOrganWeightNormalization()   ──> normalization (tier, BW g, brain g)
useValidationResults(studyId)   ──> valData (validation summary)

         ┌──────────────────────────────────────────────┐
         │            StudySummaryView                  │
         │                                              │
         │  ┌────────────────┐  ┌─────────────────────┐ │
         │  │  DetailsTab    │  │ CrossStudyInsightsTab│ │
         │  │                │  │                     │ │
         │  │  Profile +     │  │  InsightCard list   │ │
         │  │   Conclusions  │  │  Priority filtering │ │
         │  │  Prov warnings │  │                     │ │
         │  │  StudyTimeline │  └─────────────────────┘ │
         │  │  DomainTable   │                          │
         │  │  Data quality  │                          │
         │  └────────────────┘                          │
         └──────────────────────────────────────────────┘
                         │
                         │ route detection
                         ▼
              StudyDetailsContextPanel
              (always — no conditional modes)
              ├── Analysis methods pane (all settings merged)
              ├── Mortality pane
              └── Study notes pane
```

---

## Keyboard

No keyboard shortcuts are implemented in the Study Summary view.

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Domain table domain link | Click | Domain browser (`/studies/{studyId}/domains/{code}`) |
| Domain table DS "View TRS animals" link | Click | Cohort view with TRS preset (`/studies/{studyId}/cohort?preset=trs`) |
| Provenance "Configure" link | Click | Scrolls to context panel |
| Generate Report button | Click | Opens HTML report in new browser tab via `generateStudyReport()` |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading study summary..." |
| Error (no generated data) + insights tab active | Tab bar still shown; CrossStudyInsightsTab renders normally (graceful degradation — insights work without analysis data) |
| Error (no generated data) + other tab active | Amber-themed box (`bg-amber-50`, `text-amber-600`/`text-amber-700`, `Info` icon) with instructions to run generator command. Includes a "View cross-study insights →" button that switches to the insights tab. Below: gray box with generator command for studies with XPT data. |
| Cross-study insights error | `Info` icon + "Cross-study insights are not available for this study." + "(Only portfolio studies with metadata have insights)" |
| Cross-study insights empty | "No cross-study insights available (no reference studies)." |
| No metadata (Details tab) | Spinner + "Loading details..." |

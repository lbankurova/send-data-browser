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

---

## Tab Bar

- **Position:** Top of the view, full width, `border-b`
- **Tabs:** "Study details" (first) and "Cross-study insights" (second)
- **Active indicator:** `h-0.5 bg-primary` underline at bottom of active tab
- **Tab text:** `text-xs font-medium`. Active = `text-foreground`. Inactive = `text-muted-foreground`. Sentence case for tab labels.
- **Generate Report button:** Right-aligned in tab bar via `ViewTabBar`'s `right` prop. Classes: `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50`. Icon `FileText` (h-3.5 w-3.5) + "Generate report" label (sentence case). Opens HTML report in new tab via `generateStudyReport(studyId)`.

---

## Tab 1: Study Details

Full-width scrollable content. Padding `p-4`. Contains five sections in vertical stack: Study Profile Block, Study Timeline, Treatment Arms, Data Quality, Analysis Settings, and Domain Table.

### Study Profile Block

Dense narrative header at the top of the tab. No section header — renders directly.

**Line 1 — Study ID:** `text-sm font-semibold` — displays `meta.study_id`.

**Line 2 — Subtitle:** `text-[10px] text-muted-foreground` — species/strain, duration + study type, route, joined with ` · `. Example: `"Sprague-Dawley rat · 4wk repeat-dose · oral gavage"`. Duration formatted as `{N}wk` or `{N}d`. Study type has "toxicity" stripped and "repeat dose" hyphenated.

**Line 3 — Group summary:** `mt-0.5 text-[10px] text-muted-foreground` — `"{nGroups} groups: {doseLabels}" · "{perGroupM}M + {perGroupF}F/group"`. Dose labels sorted ascending: "Control, 5 mg/kg, 20 mg/kg, 80 mg/kg". Per-group sex counts only shown if both > 0.

**Line 4 — Subject breakdown:** `mt-0.5 text-[10px] text-muted-foreground` — `"Main study: {N} ({M}M, {F}F)"`. Followed by:
- TK satellite count (if any): ` · TK satellite: {N}` — count rendered in `tabular-nums font-semibold`, with `text-amber-600` if TK subjects exceed 10% of total population.
- Recovery count (if any): ` · Recovery: {N}`

**Line 5 — Recovery period (conditional):** `mt-0.5 text-[10px] text-muted-foreground` — only rendered if recovery exists and recovery period is known. Format: `"Recovery: {N}wk (Groups {list})"`. Groups are 1-indexed.

**Conclusions block (conditional):** Rendered when NOAEL or target organ data is available.

- **NOAEL/LOAEL line:** `mt-1.5 flex flex-wrap items-baseline gap-x-3 text-xs`:
  - NOAEL: `font-semibold` — "NOAEL: {dose}" (e.g., "NOAEL: 20 mg/kg" or "NOAEL: Control"). Sex qualifier `(M+F)` in `text-[10px] text-muted-foreground` if applicable.
  - LOAEL: `text-muted-foreground` — "LOAEL: {dose}". Extracted from `loael_label`.
- **Target/domain/confidence line:** `mt-0.5 flex items-center gap-x-2 text-[10px] text-muted-foreground` — `"{N} target organs · {N} domains with signals · {N}% confidence"`. Items separated by `·` middot. Each segment conditional.

**Data sources:** `useStudyMetadata` (species, strain, route, dose_groups, study_type, dosing_duration), `useStudyContext` (dosingDurationWeeks, recoveryPeriodDays), `useNoaelSummary` (NOAEL/LOAEL values, confidence), `useTargetOrganSummary` (target organ count), signal data (domain signal count).

### Study Timeline

**Component:** `StudyTimeline` from `components/analysis/charts/StudyTimeline.tsx`.

Compact SVG visualization showing the study design as horizontal dosing lanes. Only renders when `doseGroups.length > 0` and `studyCtx.dosingDurationWeeks` is available. Wrapped in `mb-4` section.

**SVG layout constants:**
- `LANE_HEIGHT = 14`, `LANE_GAP = 3`, `LEFT_MARGIN = 90`, `RIGHT_MARGIN = 40`
- `TOP_MARGIN = 4`, `BOTTOM_AXIS_HEIGHT = 16`, `TK_LANE_GAP = 6`
- Total width: 520 (viewBox), responsive via `width="100%"`

**Elements:**

1. **Terminal sacrifice line:** Dashed vertical line (`stroke="#9CA3AF"`, `strokeDasharray="3,2"`) at the dosing end day. Label "terminal sac" above in `fill-muted-foreground` 8px font.

2. **Dose group lanes:** One horizontal bar per main (non-recovery) group, sorted by `dose_level` ascending.
   - **Left label:** Group dose (via `formatDoseShortLabel`), `fill-foreground` 10px, right-aligned at `LEFT_MARGIN - 4`.
   - **Dosing bar:** Rectangle from Day 1 to terminal sacrifice, filled with `getDoseGroupColor(dose_level)`, `opacity={0.85}`, `rx={2}`.
   - **Size annotation:** White text inside bar — `"{n_male}M {n_female}F"`, 9px font-weight 500.
   - **Recovery extension (conditional):** Lighter rectangle from terminal to study end. Fill: group color lightened 50% (`lighten(color, 0.5)`), `opacity={0.7}`, dashed stroke in group color. Text inside: `"R:{recovery_n}"` in group color, 8px font.

3. **TK satellite lane (conditional):** Rendered below main lanes with `TK_LANE_GAP` spacing when any group has TK subjects.
   - **Left label:** `"TK satellite"` in muted-foreground, italic, 9px.
   - **Background:** Light gray rectangle (`fill="#F3F4F6"`) with dashed gray border.
   - **Per-group segments:** Equal-width sub-rectangles, each lightened group color with centered TK count in group color, 8px bold.
   - **Right annotation:** `"Excluded from toxicology analyses"` in muted-foreground italic 8px, after terminal sacrifice line.

4. **Day axis:** Tick marks along the bottom. Ticks generated by `dayTicks()` — always includes Day 1 and dosing end day; intermediate ticks at 7/14/28-day intervals depending on study length. Format: `"D{day}"`, 9px muted-foreground.

### Treatment Arms ({count})

Conditional — only renders if `meta.dose_groups` is non-empty. Section wrapper `mb-4`.

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-0.5 mb-2`.

**Table:** `max-h-60 overflow-auto rounded-md border`, `w-full text-[10px]` (scrollable if tall):
- Sticky header: `sticky top-0 z-10 bg-background`, `border-b bg-muted/30`, all `<th>` use `px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`
- Body rows: `border-b last:border-b-0 border-l-2` with left border color from `getDoseGroupColor(dg.dose_level)` via inline `style`. All `<td>` use `px-1.5 py-px`.

| Column | Align | Cell rendering | Condition |
|--------|-------|----------------|-----------|
| Arm code | left | `font-mono` | Always |
| Label | left | plain | Always |
| Dose | right | `tabular-nums text-muted-foreground` — "{value} {unit}" or em dash | Always |
| M | right | `tabular-nums text-muted-foreground` | Always |
| F | right | `tabular-nums text-muted-foreground` | Always |
| Total | right | `tabular-nums font-medium` | Always |
| TK | right | `tabular-nums text-muted-foreground` — count or em dash | Only if `hasTk` (any group has TK > 0) |
| Recovery | right | `tabular-nums text-muted-foreground` — "{n} ({armcd})" or em dash | Only if `hasRecovery` (any group has recovery) |

**Provenance warnings** — below the treatment arms table (`mt-2 space-y-0.5`). Filtered to exclude Prov-001..004 (those are shown in data quality). Each message: `flex items-start gap-2 text-xs leading-snug`. Icon: `AlertTriangle` (amber-500). Text: `text-amber-700`. Includes a "Configure →" link button that scrolls to the context panel.

### Data Quality

Section wrapper `mb-4`. Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-0.5 mb-2`.

Contains four sub-sections:

#### Domain completeness

Sub-header: `text-[10px] font-medium text-muted-foreground` — "Domain completeness".

Three-tier layout (`space-y-0.5 text-[10px]`):

1. **Required row:** Label `"Required:"` (`w-14 shrink-0 text-muted-foreground`) + domain codes (BW, CL, DS, DM, EX, LB, MI, OM, FW). Present domains: `text-green-700` with checkmark. Missing: `text-red-600` with cross.
2. **Optional row:** Label `"Optional:"` + domain codes (MA, TF, PP, PC, EG, VS). Present: `text-green-700` with checkmark. Missing: `text-foreground/60` with cross.
3. **Missing impact notes (conditional):** `text-amber-700` with `AlertTriangle` icon. Lists missing required domains with impact notes (e.g., "MI missing — histopath cross-reference unavailable", "OM missing — organ weight analysis unavailable").

#### Tissue battery (conditional — from `useCrossAnimalFlags`)

Sub-header: `text-[10px] font-medium text-muted-foreground` — "Tissue battery".

- **Reference counts:** Terminal and recovery tissue counts per sex from `battery.reference_batteries`. Format: `"Terminal: {N} tissues (control M) · {N} tissues (control F)"`, `"Recovery: {N} tissues (control M) · {N} tissues (control F)"`. Style: `text-[10px] text-muted-foreground`.
- **Study-level note** (if present): `text-[10px] text-muted-foreground`.
- **Flagged animals status:** If flagged count > 0: amber warning — `"{N} animals below expected tissue count"` with `AlertTriangle`. If 0: green check — `"All animals meet expected tissue count"` with `CheckCircle2`.

#### TK satellites (conditional — only if `tkTotal > 0`)

Sub-header: `text-[10px] font-medium text-muted-foreground` — "TK satellites".

Content (`text-[10px] text-muted-foreground`):
- `"{N} subjects detected"`
- `"Excluded from all toxicology analyses"`
- Per-group breakdown: `"Groups: {dose} ({count}), ..."` — dose label from dose_value/dose_unit or "Control"/armcd fallback.

#### Anomalies (conditional — only if warnings exist)

Sub-header: `text-[10px] font-medium text-muted-foreground` — "Anomalies".

Component: `AnomaliesList`. Combines provenance warnings (all with `icon === "warning"`) and flagged animals (from tissue battery with `flag === true`). Each item: `text-[10px] text-amber-700` with `AlertTriangle` icon.

- Warning items: `{message}` text.
- Flagged animal items: `"{animal_id} ({sex}) — {completion_pct}% tissue completion"`.
- Capped at 5 items with "+{N} more" expand button.

**No issues state:** When no quality issues exist (no warnings, no battery, no TK, no missing required), shows: `"No quality issues detected."` in `text-[10px] text-muted-foreground`.

### Analysis Settings

Section wrapper `mb-4`. Section header: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-0.5 mb-2`.

Compact summary line: `flex items-center gap-2 text-xs text-muted-foreground`. Shows current settings joined with ` · `:
- Exclusion count: `"{N} subjects excluded"` or `"All animals included"`
- Control group: `"control: {label}"`
- Organ weight method: `"organ wt: {method}"` (absolute / ratio-to-BW / ratio-to-brain)

Includes "Configure →" link button (`text-primary hover:underline`) that scrolls to the context panel.

### Domains ({count})

Signal-prioritized domain table with key findings and clinical significance metrics.

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-0.5 mb-2`.

**Component:** `DomainTable` — aggregates signal data per domain, sorts by adversity tier, and generates key findings text.

**Table:** `max-h-72 overflow-auto rounded-md border`, `w-full text-[10px]`:
- Sticky header: `sticky top-0 z-10 bg-background`, `<tr>` with `border-b bg-muted/30`.
- Header cells: `px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`.

| Column | Header | Align | Cell rendering | Width |
|--------|--------|-------|----------------|-------|
| Domain | Domain | left | `<Link>` to domain browser — domain code (`font-mono`) + full name (`text-muted-foreground`) + record count (`text-[9px] text-muted-foreground`). Link: `text-primary hover:underline`. | `1px; nowrap` |
| Subjects | Subjects | right | `tabular-nums text-muted-foreground`. DS domain: `"{N} deaths"`. TF domain: `"{N} types"`. Others: subject count or em dash. | `1px; nowrap` |
| Signals | Signals | right | `tabular-nums text-muted-foreground` — `"{N} TR"` or em dash | `1px; nowrap` |
| Adverse | Adverse | right | `tabular-nums text-muted-foreground` — `"{N} adv"` or em dash | `1px; nowrap` |
| Key findings | Key findings | left | Generated key findings text (absorber column, no width constraint) | absorber |

**Tier system (sort order):**

| Tier | Criteria | Position |
|------|----------|----------|
| 1 | Has adverse endpoints | Above fold |
| 2 | Has TR endpoints (no adverse) | Above fold |
| 3 | Always-visible domains (DS, TF) with data | Above fold |
| 4 | Data domains without findings | Below fold |
| 5 | Structural domains (DM, EX, TA, TE, TX, TS, CO, SE, SUPP*, RELREC, SC, PM) | Below fold |

Within tier: sort by adverse count desc, then TR count desc, then row count desc.

**Below-fold toggle:** `text-[10px] text-primary hover:underline`:
- Collapsed: `"+ {N} more domains (no findings)"`
- Expanded: `"Hide structural domains"`

**Key findings generation** (`generateKeyFindings`):
- **DS domain:** Uses mortality data — groups deaths by cause, formats as `"{N} {cause}"` joined by comma.
- **TF domain (no TR/adverse):** Shows up to 3 tumor types from endpoint labels.
- **All others:** Top 3 TR/adverse endpoints sorted by adverse > TR > signal score desc. Format: `"{name} {direction}{clinSig}"`. Clinical significance suffix: `"(p<.0001, |d|=7.8)"` — p-value shown if < 0.01, effect size shown if |d| >= 2.0.
- **MI/MA labels:** Reformatted from `"SPECIMEN — FINDING"` to `"finding (specimen)"` lowercase.
- **OM labels:** Specimen name only.

**Row click:** Navigates to Findings view with domain filter: `/studies/{studyId}/findings?domain={code}`.
**Domain link click:** Navigates to domain browser: `/studies/{studyId}/domains/{code}`. Stops event propagation (does not trigger row click).

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

Route-detected: when pathname matches `/studies/{studyId}`, shows `StudyDetailsContextPanel` via `StudySummaryContextPanelWrapper`.

**Wrapper architecture:** `StudySummaryContextPanelWrapper` (in `ContextPanel.tsx`) simply returns `<StudyDetailsContextPanel studyId={studyId} />`. No organ rail, no signal selection, no conditional panel switching.

### StudyDetailsContextPanel

**Component:** `components/analysis/panes/StudyDetailsContextPanel.tsx`

**Header:**
- Study ID: `text-sm font-semibold` — "Study: {studyId}"
- Subtitle: `mt-0.5 text-[10px] text-muted-foreground` — duration + species joined with ` · `

**Pane 1: Analysis settings (default open)**

`CollapsiblePane` with `variant="margin"`. Contains configurable analysis parameters:

| Setting | Control | Notes |
|---------|---------|-------|
| Primary comparator | `<select>` dropdown | Lists control groups (dose_level === 0, non-recovery). Change triggers confirm dialog. Shows amber warning if multiple control groups detected or recovery controls excluded. |
| Mortality exclusion | Text display | `"{N} excluded"` or `"None excluded"`. Below: `MortalityDataSettings` component with full death/accidental tables. |
| Organ weight method | `<select>` dropdown | Options: Absolute (default), Ratio to BW, Ratio to brain. Explanatory note below changes with selection. |
| Adversity threshold | `<select>` dropdown | Options: Grade >= 1, Grade >= 2, Grade >= 2 or dose-dep (default), Custom. |
| Statistical methods | Collapsible sub-section | Default collapsed. Contains: Pairwise test (Dunnett/Dunn/Tukey), Trend test (Jonckheere-Terpstra/Cochran-Armitage/Linear contrast), Incidence test (Fisher exact/Cochran-Armitage). |
| Recovery period | Conditional section | Only shown if study has recovery arms. Shows auto-detected day range, recovery arm codes, and override checkbox. |

All settings persist via `useSessionState` with study-scoped keys (e.g., `pcc.{studyId}.controlGroup`).

**Pane 2: Study notes (default open if note exists)**

`CollapsiblePane` with `variant="margin"`. Contains:
- Textarea: 4 rows, `text-xs`, placeholder "Add study-level notes..."
- Save button: `rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground`, disabled when unchanged or saving.
- Last edited timestamp: `text-[9px] text-muted-foreground/60` below save button.
- Persists via annotation API (`useAnnotations<StudyNote>` / `useSaveAnnotation<StudyNote>`).

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
| Analysis settings | Session-persisted | `useSessionState` per setting (controlGroup, organWeightMethod, adversityThreshold, pairwiseTest, trendTest, incidenceTest, recoveryOverride) — managed in context panel |
| Excluded subjects | Context | `useScheduledOnly` — early death subjects from mortality data |

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

         ┌──────────────────────────────────────────────┐
         │            StudySummaryView                  │
         │                                              │
         │  ┌────────────────┐  ┌─────────────────────┐ │
         │  │  DetailsTab    │  │ CrossStudyInsightsTab│ │
         │  │                │  │                     │ │
         │  │  Profile Block │  │  InsightCard list   │ │
         │  │  StudyTimeline │  │  Priority filtering │ │
         │  │  Arms table    │  │                     │ │
         │  │  Data quality  │  └─────────────────────┘ │
         │  │  Settings      │                          │
         │  │  DomainTable   │                          │
         │  └────────────────┘                          │
         └──────────────────────────────────────────────┘
                         │
                         │ route detection
                         ▼
              StudyDetailsContextPanel
              (always — no conditional modes)
              ├── Analysis settings pane
              └── Study notes pane
```

---

## Keyboard

No keyboard shortcuts are implemented in the Study Summary view.

---

## Cross-View Navigation

| From | Action | Navigates To |
|------|--------|-------------|
| Domain table row click | Click | Findings view with domain filter (`/studies/{studyId}/findings?domain={code}`) |
| Domain table domain link | Click | Domain browser (`/studies/{studyId}/domains/{code}`) |
| Provenance "Configure" link | Click | Scrolls to context panel |
| Analysis settings "Configure" link | Click | Scrolls to context panel |
| Generate Report button | Click | Opens HTML report in new browser tab via `generateStudyReport()` |

---

## Error / Loading States

| State | Display |
|-------|---------|
| Loading | Centered spinner `Loader2` (animate-spin) + "Loading study summary..." |
| Error (no generated data) + insights tab active | Tab bar still shown; CrossStudyInsightsTab renders normally (graceful degradation — insights work without analysis data) |
| Error (no generated data) + other tab active | Amber-themed box (`bg-amber-50`, `text-amber-600`/`text-amber-700`, `Info` icon) with instructions to run generator command. Includes a "View cross-study insights" button that switches to the insights tab. Below: gray box with generator command for studies with XPT data. |
| Cross-study insights error | `Info` icon + "Cross-study insights are not available for this study." + "(Only portfolio studies with metadata have insights)" |
| Cross-study insights empty | "No cross-study insights available (no reference studies)." |
| No metadata (Details tab) | Spinner + "Loading details..." |

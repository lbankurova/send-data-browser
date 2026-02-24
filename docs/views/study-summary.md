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

Full-width scrollable content. Padding `p-4`. Contains five sections in vertical stack: Study Profile Block (with Conclusions Strip), Provenance Warnings (conditional), Study Timeline (in card), Data Quality | Interpretation Context (side-by-side grid at xl), and Domain Table.

### Study Profile Block

Dense narrative header at the top of the tab. No section header — renders directly.

**Line 1 — Study ID:** `text-sm font-semibold` — displays `meta.study_id`.

**Line 2 — Subtitle:** `text-[10px] text-muted-foreground` — species/strain, duration + study type, route, joined with ` · `. Example: `"Sprague-Dawley rat · 4wk repeat-dose · oral gavage"`. Duration formatted as `{N}wk` or `{N}d`. Study type has "toxicity" stripped and "repeat dose" hyphenated.

**Line 3 — Group summary:** `mt-0.5 text-[10px] text-muted-foreground` — `"{nGroups} groups: {doseLabels}" · "{perGroupM}M + {perGroupF}F/group"`. Dose labels sorted ascending: "Control, 5 mg/kg, 20 mg/kg, 80 mg/kg". Per-group sex counts only shown if both > 0.

**Line 4 — Subject breakdown:** `mt-0.5 text-[10px] text-muted-foreground` — `"Main study: {N} ({M}M, {F}F)"`. Followed by:
- TK satellite count (if any): ` · TK satellite: {N}` — count rendered in `tabular-nums font-semibold`, with `text-amber-600` if TK subjects exceed 10% of total population.
- Recovery (if any): ` · Recovery: {N}, {period} (Groups {list}) — pooled during treatment` — all recovery info on one line: count, period label, group list, pooling note. Groups are 1-indexed.

**Conclusions strip (conditional):** Rendered below identity when NOAEL or target organ data is available. Contained in `rounded-md bg-muted/10 p-3 mt-3`.

- **NOAEL/LOAEL + metrics row:** `flex flex-wrap items-baseline gap-x-6 gap-y-1`:
  - NOAEL: `text-xs font-semibold` — "NOAEL: {dose}". Sex qualifier `(M+F)` in `text-[10px] text-muted-foreground`.
  - LOAEL: inline after NOAEL — `text-[10px] text-muted-foreground` — "LOAEL: {dose}".
  - Target organs / domains with signals / confidence: `flex flex-wrap gap-x-3 text-[10px] text-muted-foreground`. Each segment conditional.
- **Exposure at NOAEL (conditional):** Shows when PK data available with NOAEL or LOAEL exposure. Format: `"At NOAEL: Cmax {mean} {unit} · AUC {mean} {unit}"`. Label switches to "At LOAEL" when only LOAEL exposure available. Data from `usePkIntegration`.
- **HED/MRSD (conditional):** Shows when PK `hed` data available and `noael_status !== "at_control"`. Format: `"HED: {hed_mg_kg} mg/kg · MRSD: {mrsd_mg_kg} mg/kg"`.
- **Dose proportionality warning (conditional):** Amber icon + interpretation text when assessment is not "linear" and not "insufficient_data".

**Data sources:** `useStudyMetadata` (species, strain, route, dose_groups, study_type, dosing_duration), `useStudyContext` (dosingDurationWeeks, recoveryPeriodDays), `useNoaelSummary` (NOAEL/LOAEL values, confidence), `useTargetOrganSummary` (target organ count), signal data (domain signal count).

### Study Timeline

**Component:** `StudyTimeline` from `components/analysis/charts/StudyTimeline.tsx`.

Spacious SVG swimlane visualization showing study design, phases, and death events as horizontal dosing lanes. Only renders when `doseGroups.length > 0` and `studyCtx.dosingDurationWeeks` is available. Wrapped in `mb-6` section. The component self-wraps in a card container (`rounded-md border p-3`). No `maxHeight` cap — the SVG scales naturally with its 900px viewBox.

**Props:** `doseGroups`, `dosingDurationWeeks`, `recoveryPeriodDays`, `treatmentRelatedDeaths` (`mortalityData.deaths` — backend-classified TR), `accidentalDeaths` (`mortalityData.accidentals` — backend-classified incidental), `excludedSubjects`.

**SVG layout constants:**
- `LANE_HEIGHT = 20` (spec: 18–20px), `ROW_PITCH = 38` (top-to-top lane spacing; gap = 18px for sub-labels)
- `LEFT_MARGIN = 180` (spec: 140–180px, wider for enriched labels), `RIGHT_MARGIN = 20` (spec: 16–24px)
- `TOP_MARGIN = 24`, `BOTTOM_AXIS_HEIGHT = 30`, `TK_LANE_HEIGHT = 10` (spec: 8–10px, thinner than main), `TK_LANE_GAP = 14`
- `DEATH_R = 3.5`, `DEATH_OFFSET_ABOVE = 3` (spec: 2–4px above bar)
- Total width: 900 (viewBox), responsive via `width="100%"`. No `maxHeight` style — scales proportionally.

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

4. **TK satellite lane (conditional, Variant A pooled):** Rendered below main lanes with `TK_LANE_GAP` (14px) spacing. **Thinner** than main lanes: `TK_LANE_HEIGHT = 10` (spec: 8–10px).
   - **Left label:** `"TK satellites (n={tkTotal})"` in muted-foreground, italic, 9px.
   - **Background:** Light gray rectangle (`fill="#F3F4F6"`) with dashed gray border. Tooltip: subject count + exclusion note.
   - **Per-group segments:** Equal-width sub-rectangles, each lightened group color with centered TK count in group color, 7px bold.
   - **Right annotation:** `"Excluded from tox analyses"` in muted-foreground italic 8px.

5. **Day axis:** "Study day" label at left margin (9px font-weight 500). Tick marks along the bottom. Ticks generated by `dayTicks()` — always includes Day 1 and dosing end day; intermediate ticks at 7/14/28-day intervals depending on study length. Format: `"D{day}"`, 9px muted-foreground.

6. **Legend (conditional, HTML below SVG):** Rendered when the timeline has recovery, TK, or deaths. Single-row flex-wrap layout, `text-[9px] text-muted-foreground`, `gap-x-4 gap-y-0.5`. Items:
   - Treatment (colored rect swatch, `h-2.5`)
   - Recovery (lighter rect with dashed border) — only if recovery exists
   - TK satellites (gray dashed rect, `h-2`) — only if TK lane exists
   - TR death (red filled circle SVG) — only if TR deaths exist
   - Incidental death (hollow gray circle SVG) — only if non-TR deaths exist
   - Terminal sacrifice (dashed vertical line SVG)

### Provenance Warnings (conditional)

Rendered between the Profile Block and the Study Timeline. Only shown when filtered provenance warnings exist (excludes Prov-001..004, which are shown in Data Quality). Container: `mb-4 space-y-0.5`.

Each message: `flex items-start gap-2 text-[10px] leading-snug`. Icon: `AlertTriangle` (amber-500). Text: `text-amber-700`. Includes a "Configure →" link button that scrolls to the context panel.

### Data Quality + Interpretation Context (two-column grid)

These two sections are wrapped in a responsive grid container:
```
<div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
  <section>Data Quality</section>
  <section>Interpretation Context (conditional)</section>
</div>
```

The `xl:grid-cols-2` class only applies when Interpretation Context has notes — otherwise uses single column (full width for Data Quality). `gap-6` provides inter-section spacing.

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

Single line: `text-[10px] text-muted-foreground` — `"TK satellite: {N} subjects excluded from all toxicology analyses"`. Per-group breakdown remains in the arms table TK column. Amber >10% threshold warning stays in the profile block.

#### Anomalies (conditional — only if warnings exist)

Sub-header: `text-[10px] font-medium text-muted-foreground` — "Anomalies".

Component: `AnomaliesList`. Combines provenance warnings (all with `icon === "warning"`) and flagged animals (from tissue battery with `flag === true`). Each item: `text-[10px] text-amber-700` with `AlertTriangle` icon.

- Warning items: `{message}` text.
- Flagged animal items: `"{animal_id} ({sex}) — {completion_pct}% tissue completion"`.
- Capped at 5 items with "+{N} more" expand button.

**No issues state:** When no quality issues exist (no warnings, no battery, no TK, no missing required), shows: `"No quality issues detected."` in `text-[10px] text-muted-foreground`.

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
| Notes | Notes | left | Generated key findings text + decision-point context notes (absorber column, no width constraint). Context notes appended in `text-muted-foreground` after findings with ` · ` separator. DS: `"{N} excluded from terminal stats"` with "configure →" link. BW: tier-aware confounding note — Tier 1: no note; Tier 2: `"organ weight ratios may be confounded (g=X.XX)"` + "configure →"; Tier 3–4: `"organ weights auto-set to ratio-to-brain (g=X.XX)"` + "configure →". OM: `"using {method}"` + tier/g annotation when normalization tier >= 2 (e.g., `"BW effect moderate (g=0.7, Tier 2)"`) + "configure →" link. | absorber |

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

**Auto-set organ weight method:** Uses the organ weight normalization engine (`useOrganWeightNormalization(studyId, false)`). The hook is called with `fetchEnabled: false` — reads from React Query cache only, no backend fetch. Data populates once the user visits the adverse effects view (where `useFindingsAnalyticsLocal` triggers the actual API call). When cached normalization data is available and `highestTier >= 3` (large BW effect, g >= 1.0) and current `organWeightMethod === "absolute"`, auto-sets to `"ratio-brain"`. **Fallback:** When normalization data is not yet cached (`highestTier` defaults to 1), falls back to signal-based heuristic: if any BW domain signal is adverse + direction "down", auto-sets to `"ratio-brain"`. User can manually override in context panel. See `lib/organ-weight-normalization.ts` for the tiered decision engine.

### Interpretation Context

Second column in the Data Quality grid (above Domains table). Only rendered when interpretation notes exist.

**Section header:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground` with `border-b pb-0.5 mb-2`.

**Content:** `space-y-1 text-[10px]`. Each note: `flex items-start gap-1.5` with severity-dependent icon:
- `caution`: `AlertTriangle` in `text-amber-500`
- `info`: `Info` in `text-muted-foreground`

Note format: `<category>: <note>` — category in `font-medium text-muted-foreground`, note in `text-foreground`.

**Data source:** `getInterpretationContext()` from `lib/species-vehicle-context.ts`. Static lookup tables derived from `docs/knowledge/species-profiles.md` and `docs/knowledge/vehicle-profiles.md`. Returns notes filtered by the study's species, strain, vehicle, and route.

**BW confounding note (conditional):** When `useOrganWeightNormalization` reports `highestTier >= 2`, a caution note is appended:
- Tier 2: `"Moderate BW effect (g=X.XX). Organ-to-BW ratios should be interpreted with caution for high-dose groups."`
- Tier 3: `"Large BW effect (g=X.XX). Brain-weight normalization auto-selected for organ weights."`
- Tier 4: `"Severe BW effect (g=X.XX). ANCOVA recommended for definitive organ weight assessment."`
Rendered with `AlertTriangle` icon, category `"Body weight"`, severity `"caution"`.

**Species notes (selected examples):**
- Rat: preferred hepatotoxicity markers (SDH/GLDH), QTc not translational, nephrotoxicity qualification markers
- Dog: QTc gold-standard, emesis reflex, ALT specificity
- Monkey: immune concordance, cortisol variability, QTc relevant
- Mouse: hepatitis concordance, low cardiac concordance

**Strain notes:** Fischer 344 MCL incidence caution, Sprague-Dawley mammary adenoma background.

**Vehicle notes:** Corn oil (lipid elevation), PEG400 (renal), DMSO (hemolysis), saline/MC/CMC (no confounds).

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

**Pane container:** `space-y-3` wrapper around all panes for consistent inter-pane spacing.

**Pane 1: Analysis settings (default open)**

`CollapsiblePane` with `variant="margin"`. Contains configurable analysis parameters:

| Setting | Control | Notes |
|---------|---------|-------|
| Primary comparator | `<select>` dropdown | Lists control groups (dose_level === 0, non-recovery). Change triggers confirm dialog. Shows amber warning if multiple control groups detected or recovery controls excluded. |
| Organ weight method | `<select>` dropdown | Options: Absolute (default), Ratio to BW, Ratio to brain. Explanatory note below changes with selection. When normalization `highestTier >= 2` **and** `normalization.state` is non-null (cache-only — data available only after visiting adverse effects view), an additional summary block appears below the dropdown showing: BW effect g + tier label, brain weight g + affected/unaffected status, auto/manual status + organ count at elevated tiers, and expandable `[Why?]` rationale with numbered decision strings. See `useOrganWeightNormalization(studyId, false)` hook. |
| Adversity threshold | `<select>` dropdown | Options: Grade >= 1, Grade >= 2, Grade >= 2 or dose-dep (default), Custom. |

All settings persist via `useSessionState` with study-scoped keys (e.g., `pcc.{studyId}.controlGroup`).

**Pane 2: Subject population (conditional — only if recovery or TK)**

`CollapsiblePane` with `variant="margin"`. Only renders when `hasRecovery || hasTk`. Contains:
- Recovery line: `"Recovery: {N} — pooled with main during treatment"` (if recovery exists)
- TK line: `"TK satellite: {N} — excluded from all analyses"` (if TK exists)
- Treatment-period N per group (if recovery exists): pooled counts with `(+NR)` suffix for groups with recovery animals
- **Recovery period settings (conditional):** Only shown if study has recovery arms. Day range auto-detected, recovery arm codes listed. Treatment period pooling dropdown (Pool with main study / Analyze separately). Override recovery start day checkbox.

**Pane 3: Statistical methods**

Separate `CollapsiblePane` with `variant="margin"`. Pairwise test (Dunnett), multiplicity correction, trend test (Jonckheere-Terpstra), incidence trend (Cochran-Armitage), effect size (Hedges' g). All with explanatory sub-text.

**Pane 4: Mortality**

`MortalityInfoPane` component. Shows `headerRight` summary: `"{N} deaths · {included} included · {excluded} excluded"`. Per-subject table with inclusion toggle, override comments.

**Pane 5: Study notes (default open if note exists)**

`CollapsiblePane` with `variant="margin"`. Title "Study notes" with `headerRight` showing count: `"1 note"` or `"none"` (right-aligned, `text-[9px] font-medium`). Contains:
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
| PK integration | Server | `usePkIntegration` hook — exposure at NOAEL/LOAEL, HED/MRSD, dose proportionality |
| Interpretation notes | Derived | `getInterpretationContext()` from `lib/species-vehicle-context.ts` — species/strain/vehicle/route context notes |
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
usePkIntegration(studyId)       ──> pkData (exposure, HED/MRSD, dose proportionality)

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
         │  │  Data quality  │                          │
         │  │  | Interp ctx  │                          │
         │  │  DomainTable   │                          │
         │  └────────────────┘                          │
         └──────────────────────────────────────────────┘
                         │
                         │ route detection
                         ▼
              StudyDetailsContextPanel
              (always — no conditional modes)
              ├── Analysis settings pane
              ├── Subject population (conditional)
              ├── Statistical methods pane
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
| Domain table row click | Click | Findings view with domain filter (`/studies/{studyId}/findings?domain={code}`) |
| Domain table domain link | Click | Domain browser (`/studies/{studyId}/domains/{code}`) |
| Provenance "Configure" link | Click | Scrolls to context panel |
| Domain table "configure →" link | Click | Scrolls to context panel (DS mortality settings, BW/OM organ weight method) |
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

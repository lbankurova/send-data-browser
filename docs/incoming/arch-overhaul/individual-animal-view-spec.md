# Individual Animal View — Make Dead Animals Tell Their Story

> **Status:** IMPLEMENTED. Design frozen per CLAUDE.md hard rule — requires explicit user approval before any visual changes.

## Problem

When a reviewer clicks on an animal in the mortality table (or any animal from the findings), the individual animal context panel shows all the right data but presents it flat — no hierarchy, no connections between findings, and critical information rendered with the same visual weight as background noise.

Example: animal PC201708-4003 was moribund sacrificed on day 90 with hepatocellular carcinoma. The individual animal panel shows:
- A BW sparkline with only 2 of 14 available timepoints
- Lab values as an alphabetical list (ALB, ALBGLOB, ALP, ALT…)
- Histopath as a flat list where HEPATOCELLULAR CARCINOMA has the same visual weight as NORMAL findings, and 40+ NORMAL tissues are listed individually
- No connection between the carcinoma and the fact that this animal died from it

The data is correct and complete in the underlying SEND domains. The rendering doesn't convey what matters about this animal.

## Target component

`SubjectProfilePanel.tsx` (~920 lines) — renders inside the context panel when a subject is selected via `ViewSelectionContext.selectedSubject`. Triggered from mortality table (StudyBanner), histopathology heatmap column click, or context panel subject links.

Data hook: `useSubjectProfile(studyId, usubjid)` → fetches `/api/studies/{study_id}/subjects/{usubjid}/profile`.

## What was built

### 1. BW sparkline: render ALL available timepoints

Renders every BW record for the animal, plotted by study day. Includes both BWTESTCD = "BW" (periodic body weights) and BWTESTCD = "TERMBW" (terminal body weight) on the same sparkline.

The sparkline shows the full trajectory. For animal 4003, this reveals: steady gain weeks 1–6, plateau/erratic weeks 7–9, sharp decline weeks 11–14. Clinically meaningful — consistent with a growing hepatic mass.

**Dimensions:** Same compact layout (`width={200} height={50}`). First and last values as numeric labels (`font-mono text-[10px] text-muted-foreground`). Peak label shown if peak is >10% above both first and last values — positioned above the peak point, same `font-mono text-[10px] text-muted-foreground`.

**Hover interaction:** `<title>` element on each point circle: `Day {day} — {value} {unit}`. Native browser tooltip.

**Point dots:** Small circles (`r={2}`, stroke = dose color via `getDoseGroupColor()`, fill = white) at each data point.

**Empty states:**
- 0 measurements: "No body weight data" in `text-[11px] text-muted-foreground`
- 1 measurement: `BW: {value} {unit} (Day {day})` in `text-[11px] text-muted-foreground`

### 2. Histopathology: severity hierarchy + cause-of-death linking

Five sub-features.

**A. Sort by clinical significance, not just severity.**

Sort order (top to bottom):
1. **Cause of death** — unscheduled death AND MI finding matches COD (tier 0)
2. **Presumptive COD** — unscheduled death, no malignancy, highest severity finding (tier 1)
3. **Malignant neoplasms** — MIRESCAT = "MALIGNANT" (tier 2)
4. **Benign neoplasms** — MIRESCAT = "BENIGN" (tier 3)
5. **Non-neoplastic findings with severity >= grade 2** (moderate+) — sorted by severity grade descending (tier 4)
6. **Non-neoplastic findings with severity grade 1** (minimal/mild) — sorted alphabetically by specimen (tier 5)
7. **NORMAL tissues** — collapsed (see below)

**B. Visual hierarchy by significance tier.**

Uses **Position > Typography > Tint** (per design system priority). COD rows get `bg-amber-50/50` row tint — a warm highlight without red-repetition-per-row violation. All other tiers differentiate via font-weight and position only.

| Tier | Row treatment | Finding cell badges | Severity |
|------|--------------|---------------------|----------|
| Cause of death | `bg-amber-50/50` | `text-[9px] text-muted-foreground` "Malignant" + `text-[9px] font-semibold text-[#DC2626]` "Cause of death" | Grayscale heat badge |
| Presumptive COD | `bg-amber-50/50` | `text-[9px] font-semibold text-[#DC2626]/60` "Presumptive COD" | Grayscale heat badge |
| Malignant neoplasm | `font-medium text-foreground` | `text-[9px] text-muted-foreground` "Malignant" | "N/A" with tooltip |
| Benign neoplasm | `text-foreground` | `text-[9px] text-muted-foreground` "Benign" | "N/A" with tooltip |
| Non-neoplastic, grade >= 2 | `font-medium text-foreground` | — | Grayscale heat badge (prominent) |
| Non-neoplastic, grade 1 | `text-foreground/80` | — | Grayscale heat badge |
| NORMAL | Collapsed into summary line | — | — |

Design decisions:
- **COD badge gets `#DC2626`** — this is a conclusion (Tier 1, always colored at rest), same as TARGET ORGAN badge.
- **COD row gets `bg-amber-50/50`** — warm row tint instead of `border-l-2 border-[#DC2626]` to avoid red-repetition-per-row (design system violation: no decision red more than once per row). Same tint pattern as flagged lab rows.
- **Malignant/Benign labels are plain text** — `text-[9px] text-muted-foreground`. Not bordered pills (looked visually heavy in context panel). Per CLAUDE.md: "Categorical identity NEVER gets color."
- **Neoplasm severity shows "N/A"** — neoplasms don't receive severity grades in SEND (1–5 scale is for non-neoplastic lesions only). Shows `N/A` with tooltip "Severity grading not applicable to neoplasms" instead of em-dash.
- **Severity uses grayscale heat** — existing `getNeutralHeatColor()` function.

**C. Collapse NORMAL tissues.**

Single summary line: `{count} tissues examined — normal`

Style: `text-[10px] text-muted-foreground cursor-pointer hover:text-foreground`. Expandable on click with chevron indicator (`ChevronRight` rotated 90deg when expanded). When expanded, compact comma-separated list in `text-[10px] leading-relaxed text-muted-foreground` with `pl-4`.

**Empty state:** If all tissues have findings (no NORMAL entries), omit the summary line entirely.

**D. Display MIRESCAT when present.**

After the finding name in the same cell, as plain text: `text-[9px] text-muted-foreground` with `ml-1.5`. Sentence case ("Malignant", "Benign").

**E. Cause-of-death matching logic.**

Frontend-only logic using existing data:

1. **Detect unscheduled death:** Check `profile.disposition` for death indicators: string contains "DEAD", "MORIBUND", "EUTHANIZED", or "FOUND DEAD" (case-insensitive). Scheduled sacrifices NOT included.

2. **Animal died + malignant neoplasm exists:** Flag all malignant neoplasms as "Cause of death".

3. **Animal died + no malignancy:** Flag highest severity finding(s) as "Presumptive COD".

4. **Animal died + no MI findings:** Show cause line in header as "Unknown" (italic, muted).

### 3. Lab values: flag abnormals relative to control means

Dedicated "vs ctrl" column with fold-change display + `bg-amber-50/50` row tint on flagged rows.

**Flagging thresholds:**

| Condition | Applies to | Row treatment | vs ctrl column |
|-----------|-----------|---------------|----------------|
| Value > 2x control mean | ALT, AST, ALP, BILI, BUN, CREA, GGT | `bg-amber-50/50` + `font-medium` on test code and value | `↑ {ratio}x` |
| Value < 0.5x control mean | ALB, RBC, HGB, HCT, PLT, WBC | `bg-amber-50/50` + `font-medium` on test code and value | `↓ {ratio}x` |
| Within normal range | All others | `text-muted-foreground` | — |

**Column header tooltip:** "Fold-change vs concurrent control group mean (same sex, terminal timepoint)" on the "vs ctrl" header.

**The "vs ctrl" column only appears when at least one lab is flagged.** If no flags, the table shows Test / Day / Value only.

**Sort order:** Flagged labs sort to the top, then alphabetical within each group.

**Expand/collapse:** Shows first 10 tests by default. If more exist, shows `{n} more tests...` link to expand, and `Show less` to collapse back.

**Control data source:** Terminal-timepoint control means by sex from `profile.control_stats.lab`. If control data unavailable for a test, skip flagging.

**Empty state:** "No laboratory data available" in `text-[11px] text-muted-foreground`.

### 4. Clinical observations: flag inconsistencies with disposition

**When all CL observations are normal and animal had unscheduled death:**
```
All observations normal ({n} days)
⚠ No clinical signs recorded — unexpected for {disposition}. Verify CL data completeness.
```
Warning uses `AlertTriangle` icon (`h-3 w-3 text-muted-foreground`) + `text-[10px] text-muted-foreground italic`.

**When abnormal observations exist:** Sorted by relevance:
1. Observations in last 7 days before disposition day (tagged "near death" in `text-[9px] text-muted-foreground`)
2. All other abnormal observations, by day descending
3. Normal observations collapsed into count: `{n} normal observations`

Abnormal observation rows: `bg-amber-50 px-1 rounded` with `Day {n}` in mono + finding in `font-medium`.

**When all observations are abnormal:** Shows `AlertTriangle` note "All recorded observations are abnormal."

**Empty state:** "No clinical observation data" in `text-[11px] text-muted-foreground`.

### 5. Individual animal header: mortality context

```
PC201708-4003                              ← text-sm font-semibold font-mono
Sex: Male  Dose: 200 mg/kg                ← text-[11px] metadata row
Disposition: MORIBUND SACRIFICE  Day 90    ← text-[11px], day on same line
Cause: Hepatocellular carcinoma (Liver)    ← text-[11px] font-medium, deaths only
```

- **Sex** uses `font-medium` only — no color.
- **Dose** uses colored text via `getDoseGroupColor(dose_level)` on `font-mono font-medium`. No pipe/border — colored text inline.
- **Day** is on the same line as disposition (not a separate field): `Day <span font-mono>{n}</span>` in `text-muted-foreground` with `ml-2`.
- **Cause line:** Only for unscheduled deaths. Text = finding name + specimen in parens. `font-medium text-foreground`. Unknown cause: `text-muted-foreground italic`. Multiple COD findings: first + "(+{n} more)".
- **Cause text casing:** Raw finding text from data (may contain clinical abbreviations).

### 6. Macroscopic findings

Sorted alphabetically by specimen (aligns with MI reading order). Normal tissues filtered out. If normals exist, count shown below table: `{n} tissues normal`. No COD logic applied to MA.

**Empty states:**
- Has normals but no notable findings: "No notable macroscopic findings ({n} tissues normal)"
- No MA data at all: section not rendered (CollapsiblePane omitted)

### 7. Empty states

Every section has an explicit empty state (design system mandatory):

| Section | Empty condition | Message | Style |
|---------|----------------|---------|-------|
| BW sparkline | 0 measurements | "No body weight data" | `text-[11px] text-muted-foreground` |
| BW sparkline | 1 measurement | "BW: {value} {unit} (Day {day})" | `text-[11px] text-muted-foreground` |
| Lab values | 0 measurements | "No laboratory data available" | `text-[11px] text-muted-foreground` |
| Clinical obs | 0 observations | "No clinical observation data" | `text-[11px] text-muted-foreground` |
| Histopathology | 0 MI findings | "No microscopic findings recorded" | `text-[11px] text-muted-foreground` |
| Macroscopic | 0 MA findings | CollapsiblePane not rendered | — |
| All domains empty | No data at all | "No cross-domain data available for this subject." | `p-4 text-center text-xs text-muted-foreground` |

### 8. Backend data changes

The profile endpoint (`/studies/{study_id}/subjects/{usubjid}/profile`) was augmented with two additions:

**A. MIRESCAT on MI findings.**

`SubjectFinding` now includes `result_category?: string | null` populated from MIRESCAT column. Backend uses `_safe_str()` helper to handle pandas NaN → None conversion.

**B. Control group lab statistics.**

`control_stats.lab` object: terminal-timepoint (max day per test) control means for same sex as subject, from dose_level=0 group.

**C. Disposition day column fix.**

Backend reads `DSSTDY` first, falls back to `DSDY` — SEND standard uses `DSSTDY`.

## What NOT to do

- **Do not change the panel layout structure.** Keep: header → measurements (BW sparkline + lab table) → clinical observations → histopathology → macroscopic (if present).
- **Do not build full reference range / historical control comparison.** Concurrent control means only.
- **Do not hide NORMAL tissues entirely.** Collapse with expand — tissue battery completeness matters.
- **Do not add color to categorical badges** (Malignant/Benign). Plain text only.
- **Do not use emojis.** Use lucide-react icons.
- **Do not use bordered pills for Malignant/Benign.** Plain text was chosen over gray badges during implementation review.
- **Do not use border-l for COD rows.** `bg-amber-50/50` was chosen to avoid red-repetition-per-row.
- **Do not color-code sex.** Typography (`font-medium`) only.

## Verification checklist

| # | Check | Section | Status |
|---|-------|---------|--------|
| 1 | MI findings sorted by clinical significance (COD > malignant > benign > grade desc > alpha) | §2.A | PASS |
| 2 | COD row has `bg-amber-50/50` + red text "Cause of death" badge | §2.B | PASS |
| 3 | Malignant/Benign labels are plain text `text-[9px] text-muted-foreground` (no badge, no border) | §2.B, §2.D | PASS |
| 4 | NORMAL tissues collapsed into "{count} tissues examined — normal" with expand | §2.C | PASS |
| 5 | COD detection: unscheduled death + malignant → "Cause of death"; no malignant → highest severity → "Presumptive COD" | §2.E | PASS |
| 6 | BW sparkline renders all timepoints with dot markers and peak label (>10% threshold) | §1 | PASS |
| 7 | BW hover tooltips show day + weight | §1 | PASS |
| 8 | Flagged labs have dedicated "vs ctrl" column with ↑/↓ + ratio, and `bg-amber-50/50` row tint | §3 | PASS |
| 9 | Lab flagging uses typography only (font-medium + arrows), no color on values | §3 | PASS |
| 10 | Flagged labs sorted to top, expand/collapse toggle for >10 tests | §3 | PASS |
| 11 | CL inconsistency note for moribund + no abnormal CL, with AlertTriangle icon | §4 | PASS |
| 12 | Header shows cause line for unscheduled deaths only | §5 | PASS |
| 13 | All empty states present per §7 table | §7 | PASS |
| 14 | MIRESCAT field added to SubjectFinding type and backend response | §8.A | PASS |
| 15 | Control stats added to SubjectProfile type and backend response | §8.B | PASS |
| 16 | No emojis anywhere in the component | CLAUDE.md | PASS |
| 17 | All labels sentence case ("Cause of death", "Malignant", "Benign") | §5 Casing | PASS |
| 18 | Build passes: `cd C:/pg/pcc/frontend && npm run build` | — | PASS |
| 19 | Dose in header uses colored text (not border-l pipe) | §5 | PASS |
| 20 | Day shown on disposition line (not separate) | §5 | PASS |
| 21 | Sex has no color, just font-medium | §5 | PASS |
| 22 | Neoplasm severity shows "N/A" with tooltip (not em-dash) | §2.B | PASS |
| 23 | MA sorted alphabetically by specimen | §6 | PASS |

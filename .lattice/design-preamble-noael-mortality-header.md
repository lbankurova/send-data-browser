# Design preamble — NOAEL/LOAEL synthesis header + Mortality settings pane

Trigger: user-requested audit of `StudySummaryView > NOAEL/LOAEL` central artwork
(NoaelBannerCompact + ModifierStrip) + the right-rail `MortalityInfoPane` header
("the header with status looks bad here in nimble, and other studies").

Date: 2026-04-27. Mode: Audit + Design.

## 1.1 Analytical question

P1 (Study Director, primary) and P3 (Reg Tox, primary) opening the study summary
both ask the same convergence question: *"Has this study established a defensible
NOAEL, what value, with how much confidence — and is anything in the study design
or mortality picture undermining that determination?"* The header band is the
30-second triage. Wrong values are catastrophic; **opaque or visually-broken
status is nearly as bad** because it forces the reviewer to derive what the
engine already computed (CLAUDE.md rule 14, "system computes what it can").

For the right-rail `MortalityInfoPane`: the question is **"how many subjects
contribute to terminal stats, and which deaths am I excluding from that pool?"**
— a study-level setting that decides whether the central NOAEL/LOAEL is even
trustworthy (Nimble's 28% control mortality is the canonical case).

P3 cross-study triage is the failure mode the current header creates: the same
status band must read identically across PointCross (3 deaths), Nimble
(26 deaths), PDS (1 death), instem (4 deaths). Today it doesn't — it visually
breaks at long status strings.

## 1.2 Engine outputs survey

### What the engine emits at the central band (PointCross fixture)

`backend/generated/PointCross/noael_summary.json` (Combined row):
- `noael_label = "Not established"`, `noael_dose_value = null`
- `loael_label = "Group 2,2 mg/kg PCDRUG"`, `loael_dose_level = 1`
- `noael_confidence = 0.8`
- `noael_derivation.adverse_findings_at_loael` = N items, with per-finding
  `loo_control_fragile` flags + `loo_min_stability` aggregate
- per-sex M/F rows expose `loael_dose_level` divergence

`backend/generated/PointCross/study_mortality.json`:
- `has_mortality = True`, `deaths = 2`, `accidentals = 1`
- `total_deaths`, `total_accidental`, `mortality_loael_label`,
  `mortality_loael_cap`, `qualification = {control_mortality_rate, ...}`,
  per-record `relatedness` (often `None` — see CT-3 risk below)

`backend/generated/PointCross/pk_integration.json`:
- `available`, `noael_exposure | loael_exposure` (Cmax + AUC), `dose_proportionality`
- `dose_proportionality = {assessment, slope, r_squared, non_monotonic}`

`recovery_verdicts.json`:
- per-finding `verdict ∈ {reversed, persistent, equivocal, ...}`,
  joined to LOAEL findings

### What the existing UI surfaces today

- **NoaelBannerCompact** — NOAEL value, LOAEL value, confidence (clickable for
  breakdown popover), at-LOAEL exposure (Cmax + AUC + Full PK link). Tier dots:
  outlined-red for "not established", solid red for established LOAEL.
  ✅ Surfaces all critical engine outputs at the band level.
- **ModifierStrip** (6 cells) — Recovery, Mortality, LOO fragility, PK shape,
  Sex, HCD. Each cell has label / primary / detail / tone (warning/critical
  glyph). ✅ Surfaces the second-tier modifiers.
- **MortalityInfoPane** (right rail) — header summary + qualification
  (control_mortality_rate + flags + suppress_noael) + per-subject include/exclude
  table. Header summary string:
  `${n_total} deaths (${n_unsched} unscheduled, ${n_acc} accidental) · ${n_inc} included · ${n_exc} excluded`

### Engine outputs the existing UI does NOT surface (delta)

| Engine output | Where it lives | Current UI gap |
|---|---|---|
| `qualification.suppress_noael` (true on Nimble) | `study_mortality.json` | NOAEL banner shows `0.0` confidence as a number with no semantic warning that the engine has *suppressed* the determination. The MortalityInfoPane shows the suppress-NOAEL red callout but ONLY when expanded — closed it's invisible. |
| `qualification.control_mortality_rate` (0.28 on Nimble) | `study_mortality.json` | Nimble: control deaths drive the 26-death summary, but the closed pane just shows the count. The most decision-relevant number (control mortality rate) is hidden behind expansion. |
| `cause_category` distribution (`undetermined` for all Nimble records) | `study_mortality.json` | Nimble's 26-death summary is dominated by `relatedness = None` records that are mis-classified by `ModifierStrip.computeMortalityCell` as "treatment-related". This produces a misleading central-tile count. **SCIENCE-FLAG candidate.** |
| Per-dose mortality breakdown when most deaths are CONTROLS | `study_mortality.json by_dose` | Today's modifier-strip detail line lists all dose groups equally; for Nimble it would say "13 at Group 1, Control · 2 at Group 2, Treatment" — burying the asymmetry. |

### CT-3 check (state-collapsing factor → single token)

The MortalityInfoPane header currently emits a 4-axis count
(`total · unsched · accidental · included · excluded`) flattened into ONE
uppercase title-bar string. **CT-3 hit:** the engine produces five distinct
state counts; the header concatenates them with `·` separators inside a
title-bar that applies `uppercase tracking-wider font-semibold`, turning the
counts into visual noise that wraps mid-string at narrow rail widths.

The NOAEL banner has a similar but subtler CT-3 risk:
**`confidence = 0.0` on Nimble + `suppress_noael = true`** displays as just
"0%" with the breakdown popover hint — which conflates "engine ran, scored 0"
with "engine REFUSED to determine because control mortality is critical."
Two distinct states, one rendered token.

## 1.3 Spine candidates, mapped to persona mental models

The header band has one clear spine; mortality has three real candidates.

### Central NOAEL/LOAEL band — spine candidates

Note: this is essentially solved (the band IS the spine). The question is
*how dense* and whether the right-edge cluster (PK exposure + breakdown
trigger) competes with the LOAEL anchor.

- **Spine A (current): "Determination → modifiers, two horizontal strips"**
  P1 mental model: convergence — read NOAEL/LOAEL, then scan modifiers for
  what could undermine. P3 mental model: regulatory extraction — same scan,
  faster. **Get:** complete decision context in two rows. **Lose:** when any
  one cell goes long, layout breaks (Nimble mortality cell, long dose labels).

- **Spine B (rejected): "Headline + sentence"** — a single sentence narrative
  ("NOAEL not established; LOAEL 2 mg/kg at 80% confidence; 1 TR death at
  4,200 mg/kg; recovery 0/4 reversed"). Fits P1 reading-pattern but loses the
  affordance grid (override targets, click-for-breakdown, click-for-PK).
  Rejected — drops engine-computed structure.

- **Spine C (rejected): "Vertical decision tree"** — branching from
  determination to qualifying flags. Loses the persistent left-to-right
  scan pattern shared with the rest of the app. Rejected.

**Default: keep Spine A.** Fixes target *cell-level layout robustness*, not
the spine.

### MortalityInfoPane header — spine candidates

This is where redesign is needed.

- **Spine A — Settings-pane convention (current): title + headerRight summary**
  P3/P6 mental model: look at the closed pane title bar to decide whether to
  open. **Get:** zero-click status. **Lose:** the `headerRight` slot inherits
  the title-bar's `uppercase tracking-wider font-semibold` styling — so a long
  count string becomes ALL CAPS, cramped, wraps mid-string. Ugly on
  Nimble's 68-char string. Today's wiring forces the conventional pattern
  through a class system that wasn't designed for it.

- **Spine B — Status-chip cluster (proposed)**
  Render the count NOT as a continuation of the title text, but as a
  small-font chip cluster aligned right of title: `[26 deaths] · [15 unsched]
  · [11 accid] · [0 incl]`. Each chip uses sentence-case `text-[10px]`
  (Micro tier per visual-design-guide §2.1) on neutral gray. Stays
  one line at any rail width because chips can wrap as a group, not
  mid-text. P3 fits — sees the count tally without opening. P6 fits —
  sees the included/excluded split for audit. **Get:** robust to long
  strings; preserves all five count axes; visible when closed AND open.
  **Lose:** uses more vertical space than a single text line at narrow
  widths (chips wrap to second line). Acceptable: closed pane is short.

- **Spine C — Status icon + count, defer detail to expansion**
  Just `[!] 26 events` in the header, defer the four-axis breakdown to inside
  the pane. P3 mental model: "show me the headline, I'll click for detail."
  **Get:** narrowest possible header. **Lose:** P6 audit pattern (need
  included/excluded count without expansion); also loses the
  `suppress_noael` warning at-a-glance.

**Default: Spine B.** P3 (cross-study triage) + P6 (audit) both score 5
on Validation/StudyDetails workspaces (utility matrix), so two personas
have strong primary use; the matrix justifies the chip cluster.

## 1.4 Rules in scope

### Hard rules invoked

- **CLAUDE.md rule 14 (science preservation):** the central tile's
  `treatmentRelated` filter (`d.relatedness !== "accidental"`) treats
  `relatedness = null` as treatment-related. Nimble has 13 control deaths
  with `null` relatedness — they would be COUNTED as treatment-related on
  the central tile. **Flag as SCIENCE-FLAG independent of the visual
  redesign** — fix on the data path, not by re-skinning the tile.
- **CLAUDE.md rule 16 (verify against actual data):** verified against
  PointCross, Nimble, PDS, instem `study_mortality.json` and
  `noael_summary.json`. Counts and label widths above are real.
- **CLAUDE.md rule 18 (contract triangle):** any change to the count
  string in `MortalityInfoPane` summary is a consumption-site change;
  no declaration/enforcement update needed (string is local).

### Visual rules quoted

- **design-decisions.md §1, C-05/C-27:** "any categorical badge ... uses
  `bg-gray-100 text-gray-600 border-gray-200`" — chip cluster proposal
  uses neutral gray, no per-status color.
- **design-decisions.md §2 / visual-design-guide §2.1:** font hierarchy.
  Pane title is `text-xs font-semibold uppercase tracking-wider
  text-muted-foreground`. The status counts must be **a tier below**
  (Micro, `text-[10px]`) and must NOT inherit `uppercase tracking-wider`.
  Today's bug is exactly this hierarchy violation.
- **frontend-ui-gate.md Rule 2 (label audit):** "is this label already
  visible in the parent context?" — the word "deaths" in the count chip
  is redundant after "Mortality" pane title. Drop it: `[26 events] ·
  [15 unsched] · [11 accid] · [0 incl] · [26 excl]`.
- **datagrok-app-design-patterns.md §7 (spatial anchoring):** the chip
  cluster must render the SAME slots whether closed or open, even when
  some counts are zero (`0 incl` is information, not "missing").
- **CT-9 (vocabulary leak) check:** "unsched" / "incl" / "excl" are
  abbreviations. Need tooltips or full words. Per pane width budget,
  abbreviations + tooltip is the right call (UI-gate Rule 6, abbrevs
  acceptable when universally understood in context).
- **frontend-ui-gate.md Rule 1 (viewport budget):** right rail is
  280-300px. The current uppercase-everything title bar can wrap to 3
  lines on Nimble. Chip cluster must fit in 1-2 lines max.

### Audit-checklist hits anticipated

- **C-04** (context panel text emphasis: font-weight not color) — chip
  cluster respects this.
- **C-25** (domain labels: neutral text-only) — analogous principle for
  status counts: neutral, no per-state coloring.
- **A-11** (spatial anchoring, fixed-width slots) — chip slots should
  always render even when 0.
- **K-08** (self-labeling) — chip text must name the dimension, not just
  the number.

### Algorithm-defensibility (rule 19) check

Modifier-strip mortality cell consumes `study_mortality.deaths.relatedness`
which is a KG/scoring contract field. **The current tile output for Nimble
("15 deaths · 13 at Group 1, Control · 2 at Group 2, Treatment") would
fail rule-19 review** — a regulatory toxicologist would NOT agree this
output represents the data, because 13 of those are CONTROL deaths and
the cell label says "Mortality" without distinguishing arm. This is a
SCIENCE-FLAG that must be raised independently of the visual redesign.
Fix per rule 19 = data path (relatedness inference) or surface-text
(distinguish control vs treatment in the detail line).

### Rule-21 correction (post-audit, 2026-04-27)

The original A-08 proposal -- "Suppressed (control mortality)" red badge
replacing the confidence chip in `NoaelBannerCompact` when
`qualification.suppress_noael === true` -- was REVERTED before commit
upon user objection. Reframed as CLAUDE.md rule 21:

> Algorithmic resistance to a credentialed reviewer's explicit override
> is the system claiming epistemic authority it doesn't have.

The badge approach (a) replaced the user-readable confidence value with
an "engine refused" framing, and (b) implicitly framed the engine's
suppress decision as terminal, when in fact the toxicologist may have
animal-specific context, study conduct issues, or batch-level confounds
that warrant a NOAEL determination despite control mortality.

Corrected approach: surface qualification flags (already done by
`MortalityQualification` inside the Mortality pane) AND add a
confirmation-prompt pattern on the override popover (filed as GAP-362).
The chip cluster in this audit ships **without** the suppress badge --
purely informational count axes. The `mortalityData` plumbing through
`NoaelBannerCompact` was reverted. The `MortalityHeaderChips` retains
the four count axes (total / unscheduled / accidental / included) only.

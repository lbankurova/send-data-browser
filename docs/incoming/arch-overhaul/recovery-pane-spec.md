# Recovery Pane Redesign Specification

**Version 1.0 · February 2026 · Datagrok Confidential**

---

## 1. Problem Statement

The current recovery pane displays raw group means at terminal and recovery timepoints (e.g., "1.42g → 1.58g"). This is misleading for three reasons:

- **Raw means drift with age, growth, and body weight.** A recovery-period increase in organ weight may reflect normal animal growth, not worsening pathology. Without control normalization, the pane cannot distinguish biological recovery from background drift.
- **Recovery classification operates on raw deltas.** "Worsening" is assigned when the raw value increases, even if the gap from control is actually narrowing. This produces incorrect verdicts.
- **Peak effects during dosing are invisible.** If an effect peaks mid-study (e.g., body weight g=7.8 at Day 45) but partially resolves before terminal sacrifice (g=3.45 at Day 92), the recovery pane only sees the terminal value. The full severity trajectory is lost.

---

## 2. Design Principles

**Control-normalized effect is the primary metric.** Recovery means "did the treated group move closer to normal?" Normal is defined by the concurrent control group at each timepoint, not by the treated group's own earlier value.

**Verdicts first, numbers second.** The toxicologist's first question is "did it recover?" not "what were the means?" Lead with the classification, support with the delta.

**Peak context when it matters.** When the peak-during-dosing effect materially exceeds the terminal effect, surface it as an annotation so the reviewer understands the full trajectory.

**Both sexes visible.** Recovery data is shown per-sex side by side, consistent with the panel redesign (Tier 1 comparative view).

**Raw means available but secondary.** Raw values appear on hover or as a secondary detail line, not as the primary reading.

---

## 3. Recovery Metric

### 3.1 Primary Metric: Control-Normalized Effect

For continuous endpoints (OM, LB, BW), compute the effect relative to the concurrent control group at each timepoint:

**Effect at timepoint T:**

```
effect_T = treated_mean_T - control_mean_T
```

Or as a standardized measure:

```
hedges_g_T = (treated_mean_T - control_mean_T) / pooled_SD_T
```

Or as percentage difference from control:

```
pct_diff_T = (treated_mean_T - control_mean_T) / control_mean_T × 100
```

**Recommended default: Hedges' g** for the classification logic (unitless, comparable across endpoints), with percentage difference from control as the displayed number (more intuitive for toxicologists). Raw means available on hover.

### 3.2 Recovery Percentage

Recovery is measured as the change in the control-normalized effect between terminal and recovery timepoints:

```
recovery_pct = (|effect_terminal| - |effect_recovery|) / |effect_terminal| × 100
```

Positive = effect is shrinking (recovering). Negative = effect is growing (worsening).

**Baseline denominator is always the terminal (end-of-dosing) effect.** This is consistent with regulatory convention: recovery assessment compares the end-of-dosing sacrifice group to the recovery sacrifice group. Peak-during-dosing effects are surfaced as context (Section 5), not as the classification baseline.

### 3.3 Histopathology (MI/MA)

For incidence-based findings, recovery is assessed differently:

- **Terminal incidence:** affected / examined at end of dosing
- **Recovery incidence:** affected / examined at recovery sacrifice
- **Classification:** based on whether incidence decreased, stayed the same, or increased

Thresholds:

- Recovery incidence = 0 → **Resolved**
- Recovery incidence < terminal incidence → **Reducing**
- Recovery incidence = terminal incidence → **Persistent**
- Recovery incidence > terminal incidence → **Worsening**

When severity grades are available, also assess whether the distribution shifted (e.g., from "moderate" to "minimal" = improving even if incidence is unchanged).

---

## 4. Classification Thresholds (Continuous)

### 4.1 Prerequisite Gate

Before classifying recovery, check that the terminal effect is meaningful enough to assess:

- If `|g_terminal| < 0.5` AND `|pct_diff_terminal| < organ_threshold / 2` → **Not assessable** (effect at terminal too small to meaningfully evaluate recovery)
- Otherwise → proceed to classification

This prevents the system from calling a trivial fluctuation "persistent" or "worsening."

### 4.2 Classification Buckets

Based on `recovery_pct` (the percentage change in the control-normalized effect):

| Recovery % | Verdict | Meaning |
|---|---|---|
| Effect at recovery < 0.5 SD of control AND ≥ 80% recovered | **Resolved** | Effect dropped below threshold and substantially recovered |
| Effect at recovery < 0.5 SD of control AND < 80% recovered | **Reversed** | Effect below threshold but terminal was borderline |
| ≥ 80% reduction in effect | **Reversed** | Near-complete recovery |
| 50–80% reduction | **Reversing** | Strong but incomplete recovery |
| 20–50% reduction | **Partial** | Some recovery, substantial residual effect |
| < 20% reduction | **Persistent** | Minimal or no recovery |
| Effect increased (negative recovery %) | **Worsening** | Effect grew during recovery period |

### 4.3 Special Cases

**Direction reversal during recovery:** If the effect changes sign (e.g., organ weight was above control at terminal, below control at recovery), classify as **Overcorrected** with a flag. This is biologically unusual and warrants review.

**Control group drift:** If the control group's mean changes substantially between terminal and recovery (e.g., > 15% change in body weight due to growth), add a note: "Control group shifted X% between timepoints; recovery classification may be affected by background drift." This doesn't change the classification but alerts the reviewer.

---

## 5. Peak Effect Context

### 5.1 When to Show

Display peak-during-dosing context when the peak effect materially exceeds the terminal effect:

```
show_peak_context = |g_peak| > |g_terminal| × 1.5  AND  |g_peak| > 1.0
```

Both conditions must be met: the peak must be substantially larger than terminal (not just slightly higher due to noise), and the peak itself must be non-trivial.

### 5.2 Data Source

Peak effect comes from the timecourse data:

- **BW:** Weekly measurements are available. Peak is the timepoint with the largest |g| vs. concurrent control.
- **LB:** Interim bleeds if present. Otherwise peak = terminal (no annotation needed).
- **OM:** Only terminal and recovery sacrifices exist. Peak context is not applicable (organ weights are only measured at necropsy).

### 5.3 Display Format

When peak context is shown, add an annotation line below the recovery verdict:

```
200 mg/kg: Worsening — effect vs control grew 27% (g: 3.45 → 4.38)
           ⚠ Peak effect was larger during dosing (g = 7.8 at Day 45)
```

The annotation is informational only — it does not change the recovery classification. Its purpose is to prevent the toxicologist from interpreting the terminal-vs-recovery comparison in isolation without knowing the full trajectory.

### 5.4 Trajectory Summary (Optional Enhancement)

For endpoints with rich timecourse data (primarily BW), consider a compact trajectory line:

```
Peak (D45): g = 7.8 → Terminal (D92): g = 3.45 → Recovery (D106): g = 4.38
            ╰── 56% resolved during dosing ──╯    ╰── 27% worsened ──╯
```

This tells the full story: the effect peaked, partially resolved during dosing, then worsened again during recovery. This trajectory pattern (partial resolution followed by rebound) is clinically significant and invisible in a terminal-only comparison.

---

## 6. Layout

### 6.1 Structure

The recovery pane is a collapsible section within the finding detail panel. It appears in Tier 2 (per-sex analytical detail) for the selected sex, and optionally in a combined view showing both sexes.

```
▾ RECOVERY
  106d post-dosing · Recovery window: D92 → D198

  ┌─────────────────────────────────────────────────────────────────┐
  │                    F                    │          M            │
  ├─────────────────────────────────────────┼───────────────────────┤
  │ 2 mg/kg   Partial  Δ narrowed 22%      │ Reversing  Δ narrowed │
  │           g: 1.2 → 0.9                 │ 57%                   │
  │                                         │ g: 0.8 → 0.3         │
  ├─────────────────────────────────────────┼───────────────────────┤
  │ 20 mg/kg  Worsening  Δ grew 30%        │ Partial  Δ narrowed   │
  │           g: 1.1 → 1.4 · p=0.041       │ 31%                   │
  │                                         │ g: 0.9 → 0.6         │
  ├─────────────────────────────────────────┼───────────────────────┤
  │ 200 mg/kg Worsening  Δ grew 11%        │ Worsening  Δ grew 27% │
  │           g: 1.4 → 1.6                 │ g: 3.5 → 4.4 · p=0.002│
  │                                         │ ⚠ Peak g=7.8 at D45  │
  └─────────────────────────────────────────┴───────────────────────┘

  Hover any cell for raw means and control values.
```

### 6.2 Per-Row Structure

Each dose-group row contains, in order:

1. **Dose label** with color-coded left border (matching dose detail section colors)
2. **Verdict badge:** Resolved / Reversed / Reversing / Partial / Persistent / Worsening — color-coded (green spectrum for recovery, red for worsening, gray for persistent/not assessable)
3. **Delta summary:** "Δ narrowed X%" or "Δ grew X%" — the control-normalized effect change as a percentage
4. **Effect size trajectory:** "g: [terminal] → [recovery]" — Hedges' g at each timepoint
5. **Statistical significance** (when available): p-value for treated vs control at recovery (Welch t-test), shown on all rows
6. **Peak context annotation** (when triggered): "⚠ Peak g=X.X at Day N" — appears below the main row content

### 6.3 Sparkline (Optional)

For endpoints with timecourse data, a minimal sparkline showing the control-normalized effect over time. The sparkline plots g (or % diff from control) on the Y-axis and study day on the X-axis. A horizontal line at zero represents "no effect." The dot trajectory shows whether the effect is moving toward or away from zero.

- Dot at or near zero line = resolved
- Dot moving toward zero = recovering
- Dot moving away from zero = worsening

This replaces the wireframe's raw-mean sparkline with a control-normalized version that answers the right question.

### 6.4 Hover Detail

On hover over any dose-group cell, show:

```
┌──────────────────────────────────────┐
│ 200 mg/kg · Male · Recovery          │
│                                      │
│ Terminal (D92)     Recovery (D198)    │
│ Treated:  2.49g    Treated:  3.16g   │
│ Control:  1.45g    Control:  1.95g   │
│ Δ:        1.04g    Δ:        1.21g   │
│ g:        3.45     g:        4.38    │
│ % diff:   +72%     % diff:   +62%    │
│                                      │
│ Recovery: Δ grew 16% (worsening)     │
│ Peak during dosing: g=7.8 at D45     │
└──────────────────────────────────────┘
```

This gives the full raw data context without cluttering the primary view.

---

## 7. Verdict Color Coding

| Verdict | Color | Hex (suggested) |
|---|---|---|
| Resolved | Dark green | #1B7A3D |
| Reversed | Green | #27AE60 |
| Reversing | Light green | #6BBF59 |
| Partial | Amber/yellow | #E6A817 |
| Persistent | Gray | #888888 |
| Worsening | Red | #C0392B |
| Not assessable | Light gray | #BBBBBB |
| Overcorrected | Purple | #8E44AD |

The color progression (green → amber → red) maps to the toxicologist's concern level: green = good news, amber = equivocal, red = bad news.

---

## 8. Data Requirements

### 8.1 Continuous Endpoints (OM, LB, BW)

For each dose group × sex × timepoint, the recovery API must provide:

| Field | Description | Currently available? |
|---|---|---|
| treated_mean | Group mean for treated animals | Yes (`mean`) |
| treated_sd | Group SD | Yes (`sd`) |
| treated_n | Sample size | Yes (`treated_n`) |
| control_mean | Concurrent control mean at same timepoint | Yes (`control_mean`) |
| control_sd | Control SD | Not returned (not needed for current classification) |
| control_n | Control sample size | Yes (`control_n`) |
| p_value | Statistical comparison (recovery vs terminal, or recovery vs control) | Yes (`p_value`) |

The recovery-comparison API (`/api/studies/{id}/recovery-comparison`) returns all fields above per dose × sex × endpoint row. Control stats and terminal-arm means (`control_mean_terminal`, `treated_mean_terminal`) are also included for drift detection and hover detail.

### 8.2 Peak Effect Data

| Field | Description | Currently available? |
|---|---|---|
| peak_g | Largest |Hedges' g| during dosing phase | Yes (`peak_effect`) — computed server-side for BW and LB |
| peak_timepoint | Study day of peak effect | Yes (`peak_day`) |
| terminal_g | Hedges' g at terminal sacrifice | Yes (`terminal_effect`) |

Peak effect is computed server-side in the recovery-comparison endpoint by scanning all main-arm timepoints for each dose × sex × endpoint and finding the maximum |g| vs concurrent control. Applicable to BW (weekly data) and LB (interim bleeds). OM has terminal-only data, so peak = terminal.

### 8.3 Histopathology (MI/MA)

| Field | Description | Currently available? |
|---|---|---|
| terminal_incidence | Affected / examined at terminal | Yes (`main.affected / main.examined`) |
| recovery_incidence | Affected / examined at recovery | Yes (`recovery.affected / recovery.examined`) |
| terminal_severity_dist | Distribution of severity grades at terminal | Yes — `main.avgSeverity`, `main.maxSeverity` per dose |
| recovery_severity_dist | Distribution of severity grades at recovery | Yes — `recovery.avgSeverity`, `recovery.maxSeverity` per dose |

The `useOrganRecovery` hook supports a sex parameter and is called unconditionally for both F and M (React hook rules). Severity data powers §9.2 grade shift annotations.

---

## 9. Histopathology Recovery Detail

### 9.1 Display Format

Histopathology recovery differs from continuous endpoints — it's incidence-based and may include severity grade shifts.

```
▾ RECOVERY (MI)
  13d post-dosing · Recovery window: D92 → D105

  ┌─────────────────────────────────────────────────────────────────┐
  │                    F                    │          M            │
  ├─────────────────────────────────────────┼───────────────────────┤
  │ 20 mg/kg  Reducing                     │ Reducing              │
  │           3/10 → 1/10                   │ 3/10 → 1/10          │
  │           Severity: moderate → minimal  │ Severity: mod → min  │
  ├─────────────────────────────────────────┼───────────────────────┤
  │ 200 mg/kg Persistent                   │ Worsening             │
  │           3/10 → 3/10                   │ 3/9 → 5/9            │
  │           Severity: unchanged           │ Severity: mod → sev  │
  └─────────────────────────────────────────┴───────────────────────┘
```

### 9.2 Severity Grade Shifts

When severity grade distributions are available, assess whether the *quality* of the finding changed even if incidence is stable:

- Incidence unchanged but grades decreased (moderate → minimal): **Improving** (override "Persistent")
- Incidence unchanged but grades increased (minimal → moderate): **Progressing** (override "Persistent")
- Incidence decreased and grades decreased: **Reducing** (strongest recovery signal)
- Incidence decreased but grades increased in remaining animals: **Mixed** (flag for review)

### 9.3 Per-Sex Considerations

As noted in the panel architecture spec: histopathology recovery from `useOrganRecovery` may be per-specimen rather than per-sex for some data sources. When sex-specific data is available (the hook supports the sex parameter), show per-sex. When only pooled data is available, show a single column with a note: "Recovery data pooled across sexes."

---

## 10. Edge Cases

### 10.1 No Recovery Group

Study design does not include a recovery sacrifice. Recovery section is hidden entirely. The sex comparison table (Tier 1) shows "—" in the Recovery row.

### 10.2 Recovery Group Exists but Tissue Not Examined

Recovery animals were sacrificed but the specific organ/tissue was not examined at recovery. Display: "Not examined at recovery" with the recommendation: "Confirm whether recovery arm tissue was collected and evaluated." (This already exists in the current panel.)

### 10.3 Very Small Terminal Effect

|g_terminal| < 0.5 and percentage change below half the organ threshold. Display: "Not assessable — terminal effect below assessment threshold." Do not classify as Persistent or Resolved.

### 10.4 Control Group Missing at Recovery

Some study designs don't maintain a control group through recovery (all control animals sacrificed at terminal). In this case, control-normalization at the recovery timepoint is not possible. Fall back to: compare treated recovery group to treated terminal group (raw delta), with a prominent note: "No concurrent control at recovery — classification based on raw change, not control-normalized effect."

### 10.5 Single Animal in Recovery Group

When n=1 for a recovery group (common in dose groups where most animals were sacrificed at terminal), statistical comparisons are not meaningful. Display the data point but suppress the verdict: "n=1 — insufficient for classification." Show the individual value for reference.

### 10.6 Different Animals at Terminal vs Recovery

This is the standard case in toxicology — terminal and recovery groups are different animals, not the same animals measured twice. The classification compares *group-level* effects, not individual trajectories. No special handling needed, but the hover detail should clarify: "Terminal and recovery groups are independent cohorts."

---

## 11. Finding Nature and Expected Reversibility

### 11.1 Purpose

For histopathology findings, the nature of the lesion carries information about expected reversibility independent of the data. Display this as contextual guidance below the recovery data:

```
Finding nature: inflammatory (Inflammation)
Expected reversibility: typically resolves within 6–10 weeks if stimulus removed
```

### 11.2 Nature Categories

| Category | Examples | Expected Reversibility |
|---|---|---|
| Inflammatory | Inflammation, infiltration | Typically reversible (6–10 weeks) |
| Degenerative | Degeneration, necrosis | Variable; depends on severity and organ regenerative capacity |
| Proliferative | Hyperplasia, hypertrophy | Usually reversible if non-neoplastic |
| Atrophic | Atrophy, decreased cellularity | Often reversible; may require longer recovery |
| Depositional | Pigmentation, vacuolation | Often persistent; depends on clearance mechanism |
| Neoplastic | Adenoma, carcinoma | Not reversible |

### 11.3 Concordance Check

When both recovery data and finding nature are available, flag discordance:

- Finding nature says "typically reversible" but data shows Persistent/Worsening → "⚠ Expected to reverse but persisting — may indicate ongoing toxicity or insufficient recovery duration"
- Finding nature says "not reversible" but data shows Reducing/Resolved → "Finding nature suggests persistence; reduction may reflect sampling variability or secondary changes"

---

## 12. Tooltips

| Element | Tooltip |
|---|---|
| Verdict badge | Definition of the classification (e.g., "Reversing: control-normalized effect decreased 50–80% during recovery period") |
| Δ narrowed/grew X% | "Change in the effect size (vs concurrent control) between terminal and recovery sacrifice. Positive = effect is resolving." |
| g: X → Y | "Hedges' g at terminal and recovery timepoints. Measures how many standard deviations the treated group is from control." |
| p-value | "Statistical significance of the difference between terminal and recovery groups. Shown only when p < 0.1." |
| Peak annotation | "Largest effect observed during the dosing phase. Shown when the peak materially exceeded the terminal value, indicating partial resolution occurred before the end of dosing." |
| "Not assessable" | "Terminal effect was too small to meaningfully evaluate recovery (below assessment threshold)." |

---

## 13. Migration from Current Design

| Current Element | Current Behavior | New Behavior | Change Type |
|---|---|---|---|
| Recovery means | Raw group means (e.g., "1.42g → 1.58g") | Control-normalized effect (g or % diff) as primary, raw on hover | Metric change |
| Recovery verdict | Based on raw mean change | Based on control-normalized effect change | Logic change |
| Single-sex view | One sex shown, matches selected finding | Both sexes side by side | Layout change |
| Peak context | Not shown | Annotation when peak > 1.5× terminal and |g_peak| > 1.0 | New element |
| Finding nature | Shown as text line | Shown with concordance check against data | Enhanced |
| Severity grades | Not assessed for recovery | Grade shift classification when available | New logic |
| Histopath per-sex | Pooled | Per-sex when hook supports it, pooled with note when not | Data change |
| Hover detail | None | Full raw data breakdown (treated, control, delta, g, % diff) | New element |

---

## 14. Implementation Notes

### 14.1 API Changes

**Done.** The recovery-comparison endpoint (`backend/routers/temporal.py`) returns control stats (`control_mean`, `control_n`, `control_mean_terminal`), treated stats (`treated_n`, `treated_mean_terminal`), and flags (`insufficient_n`, `no_concurrent_control`) on every row. The frontend type `RecoveryComparisonResponse` in `temporal-api.ts` mirrors these fields as optional properties.

### 14.2 Peak Effect Computation

**Done — computed server-side.** The backend scans all main-arm timepoints per dose × sex × endpoint and returns `peak_effect` (max |g|) and `peak_day` on each row. No frontend utility needed.

### 14.3 Hook Architecture

**Done.** `HistopathRecoveryAllSexes` calls `useOrganRecovery` unconditionally for both F and M, renders whichever has data. Both hooks share the React Query cache (5-min stale).

### 14.4 Backwards Compatibility

**Done.** The recovery section handles three degraded states: (1) `insufficient_n` — shows raw value with "insufficient for classification"; (2) `no_concurrent_control` — shows raw mean with amber warning; (3) below-threshold terminal effect — shows "Not assessed" with terminal g value. All states render informative content rather than hiding the row.

---

## 15. Implementation Status (as of current)

### 15.1 Implemented

| Spec section | Feature | Status | Notes |
|---|---|---|---|
| §2 | Verdicts first, numbers second | Done | Verdict label leads each row |
| §2, §6.1 | Both sexes side-by-side | Done | F before M, sex headers when both exist |
| §3.1 | Control-normalized Hedges' g as primary metric | Done | g used throughout, not raw means |
| §3.2 | Recovery % formula with terminal as denominator | Done | `(|g_terminal| - |g_recovery|) / |g_terminal| × 100` |
| §3.3 | Histopath incidence display | Done | `affected/examined → affected/examined` |
| §4.2 | Classification buckets (all 7 verdicts) | Done | resolved/reversed/overcorrected/reversing/partial/persistent/worsening. "Resolved" requires `|g| < 0.5 AND pct ≥ 80%`; otherwise "Reversed". |
| §4.3 | Overcorrected verdict (effect changed sign) | Done (729206d) | Sign comparison + `|g_recovery| >= 0.5` gate |
| §4.3 | Control group drift warning (>15% change) | Done | Backend returns control_mean + control_mean_terminal; frontend computes drift % |
| §5.1–5.3 | Peak context annotation with absolute floor | Done (729206d) | `|peak| > |terminal| × 1.5 AND |peak| > 1.0 AND |terminal| >= 0.5` |
| §5.2 | Peak data from backend (BW/LB timecourse scan) | Done | Backend computes peak_effect + peak_day per row |
| §5.4 | Trajectory summary (Peak → Terminal → Recovery) | Done (729206d) | Segment percentages shown when peak annotation triggered |
| §6.2 | P-value display on all rows | Done | Always shown when available — users need it to assess verdict reliability |
| §6.4 | Hover detail (raw means, control, delta, g, %) | Done | Row-level `title` with treated/control/g at terminal + recovery |
| §9.2 | Severity grade shift overrides | Done | Improving/Progressing/Mixed/Reducing annotations per dose in histopath |
| §9.3, §14.3 | Histopath per-sex (both hooks unconditional) | Done | `useOrganRecovery` called for F and M |
| §10.1 | No recovery group → pane hidden | Done | |
| §10.4 | No concurrent control at recovery | Done | Backend emits flagged row; frontend shows raw mean + warning |
| §10.5 | n=1 suppression | Done | Backend emits flagged row; frontend shows "n=1 — insufficient for classification" |
| §11.1–11.2 | Finding nature + reversibility (histopath) | Done | `classifyFindingNature` with severity modulation |
| §11.3 | Concordance check (nature vs verdict discordance) | Done (729206d) | Warnings for expected-but-persisting and unlikely-but-reversing |
| §12 | Tooltips on verdict/delta/g/p/peak elements | Done | Element-level `title` attributes on 6 elements |
| §14.2 | Peak effect computed server-side | Done | No frontend utility needed — backend returns peak_effect/peak_day |
| — | TERMBW unification into BW series | Done | Scheduled BW (D1–D85) + terminal BW (D92) treated as one series |
| — | OM OMSPEC groupby (organs distinguished) | Done | OMTESTCD is always "WEIGHT"; group by OMSPEC instead |
| — | Day numbers in display | Done | Terminal and recovery days shown with g values |
| — | Pane position: immediately after Dose detail | Done | Before Evidence/Syndromes — proximity to verdict summary |

### 15.2 Partially Implemented

| Spec section | Feature | Current state | Gap |
|---|---|---|---|
| §4.1 | Prerequisite gate | `|g_terminal| < 0.5` only | Spec requires AND `|pct_diff_terminal| < organ_threshold/2` — needs control mean + organ threshold. **Defer:** current g-only gate is sufficient. |

### 15.3 Not Implemented (Remaining)

_None — all spec items are either implemented or documented as deliberate departures._

### 15.4 Deliberate Departures from Spec

| Spec element | Spec says | Implementation | Rationale |
|---|---|---|---|
| §7 | Custom hex colors (#1B7A3D, #27AE60, etc.) | Tailwind semantic classes (emerald-700, amber-700, etc.) | Design system compliance — no raw hex in components |
| §6.1 | Table layout with F/M columns | Stacked sections with sex headers | Context panel is narrow (~300px); side-by-side columns would be too cramped |
| §3.1 | % difference from control as displayed number | Hedges' g as displayed number | g is already the standard throughout the app; adding % diff would require API extension |
| §6.3 | Sparkline visualization | Not implemented | Deferred — significant UI complexity for context panel width |

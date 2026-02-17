# Findings Context Panel — Optimization Spec

**Problem:** The context panel repeats the same facts across panes — trend p appears 4 times, NOAEL 2 times, effect size 3 times, % decrease 3 times. This drowns the signal in noise and creates inconsistency risk (observed: "20%" vs "19.6%" for the same BW decrease, and within the Statistics pane itself, prose says "p=<0.001" for 200 mg/kg while the group table shows p-adj "<0.0001" for the same row). Note: trend p and pairwise p are legitimately different tests and may differ — the issue is when the *same* test shows different values in different places.

**Principle:** Each fact appears **once**, in the pane that owns it. Other panes reference up, never duplicate down.

---

## Current Structure (Body Weight example)

```
┌─ TREATMENT SUMMARY ──────────────────────────────────┐
│ ● Treatment-related                                   │
│   Adverse                                             │
│                                                       │
│ EVIDENCE                                              │
│  • HIGH confidence (p < 0.01, large effect,           │
│    threshold pattern, treatment-related)              │ ← confidence
│  • Significant at Group 4,200 mg/kg (p=<0.0001)      │ ← sig + p
│  • Threshold dose-response                            │ ← pattern
│  • Effect size -8.15 (very large)                     │ ← effect
│  • Trend p = <0.0001, supporting dose-dependence      │ ← trend p
│  • Mean decreased 20% at highest dose vs control      │ ← % change
│                                                       │
│ Target organ    General                               │
│ NOAEL           0 mg/kg ← BUG: should be 20          │ ← noael
│ Affected sexes  Males only ← BUG: should be Both     │
│ Pattern         Threshold                             │ ← pattern (2nd)
│ Confidence      HIGH                                  │ ← confidence (2nd)
├─ STATISTICS ─────────────────────────────────────────┤
│ Significant decrease vs control at 200.0 mg/kg       │
│   (p=<0.001)                                          │ ← pairwise p (but table below says <0.0001?)
│ 1 of 3 treated groups show significant effect         │
│ Mean decreased 19.6% at highest dose vs control       │ ← % change (2nd)
│ Trend test significant (p=<0.001)                     │ ← trend p (2nd)
│                                                       │
│ Group table: C, 2, 20, 200 with n/mean/SD/p-adj      │ ← UNIQUE DATA
│                                                       │
│ Trend: p=<0.0001                     Unit: g          │ ← trend p (3rd)
├─ DOSE RESPONSE ──────────────────────────────────────┤
│ Threshold effect: no sig at 2.0, onset at 200.0       │ ← pattern (3rd)
│ NOAEL for this finding: 20.0 mg/kg                    │ ← noael (2nd)
│ Body weight decreased 19.6% — exceeds 10% threshold  │ ← % change (3rd)
│                                                       │
│ ● Threshold effect  Decreasing                        │ ← pattern (4th)
│ [bar chart: 0 → 403, 2 → 403.9, 20 → 399.8,         │ ← UNIQUE DATA
│  200 → 324.2]                                         │
│                                                       │
│ Trend test: p=<0.0001                                 │ ← trend p (4th)
├─ CORRELATIONS ───────────────────────────────────────┤
│ No correlated findings identified                     │ ← SUSPICIOUS
├─ EFFECT SIZE ────────────────────────────────────────┤
│ Very large effect (Cohen's d = 8.15)                  │ ← effect (2nd)
│ Ranks #1 of 226 findings by effect magnitude          │ ← UNIQUE DATA
│ Large effect with high significance: robust finding   │ ← effect (3rd)
│                                                       │
│ SELECTED FINDING                                      │
│ -8.15  Cohen's d                                      │ ← effect (4th)
│ Very large                                            │
│                                                       │
│ LARGEST EFFECTS (TOP 10)                              │ ← UNIQUE DATA
│ BW Body Weight -8.15, ...                             │
└──────────────────────────────────────────────────────┘
```

**Unique data per pane** (the stuff that justifies the pane's existence):
- Treatment Summary: TR verdict + adverse classification + evidence rationale
- Statistics: Group table (n, mean, SD, p-adj per dose)
- Dose Response: Bar chart, threshold onset description, NOAEL
- Correlations: Correlated endpoints list
- Effect Size: Rank among all findings, top 10 list

Everything else is repeated.

---

## Proposed Structure

```
┌─ VERDICT ────────────────────────────────────────────┐
│ ● Treatment-related · Adverse                         │
│                                                       │
│ Threshold decrease, onset at 200 mg/kg                │
│ HIGH confidence · Both sexes · NOAEL 20 mg/kg         │
│                                                       │
│ |d| = 8.15       p < 0.0001      -19.6%              │
│ Cohen's d        Jonckheere-     vs control           │
│ (very large)     Terpstra trend  at 200 mg/kg         │
├─ EVIDENCE ───────────────────────────────────────────┤
│  • Significant at 200 mg/kg (p<0.0001, Dunnett's),   │
│    not at 2 or 20 mg/kg                               │
│  • Trend test confirms dose-dependence                │
│  • BW decrease exceeds 10% regulatory threshold       │
│  • Effect is largest of 226 findings (#1 by |d|)      │
├─ DOSE DETAIL ────────────────────────────────────────┤
│ Group   n    Mean     SD     p-adj                    │
│ ─────────────────────────────────────                 │
│ C       10   403.00   11.70   —                       │
│ 2       10   403.90    9.64   1.00                    │
│ 20      10   399.80   15.79   1.00                    │
│ 200     10   324.20    7.00   <0.0001                 │
│                              Dunnett's test (adjusted)│
│                                                       │
│ [bar chart: dose-response visualization]              │
│                                                       │
│ Trend: p<0.0001 · Jonckheere-Terpstra      Unit: g   │
├─ CORRELATIONS ───────────────────────────────────────┤
│ No correlated findings in General organ system        │
├─ CONTEXT ────────────────────────────────────────────┤
│ LARGEST EFFECTS (TOP 10)                              │
│ #1  BW Body Weight -8.15                              │
│ #2  BW Body Weight -5.05                              │
│ ...                                                   │
├─ RELATED VIEWS ──────────────────────────────────────┤
│ View dose-response → View histopathology →            │
└──────────────────────────────────────────────────────┘
```

---

## Pane-by-Pane Specification

### Pane 1: VERDICT (replaces Treatment Summary)

The verdict is the single most important output. It should read like a one-paragraph conclusion, not a form with redundant fields.

**Structure:**

```
┌──────────────────────────────────────────────────────┐
│ ● Treatment-related · Adverse                        │  ← Line 1: verdict
│                                                      │
│ Threshold decrease, onset at 200 mg/kg               │  ← Line 2: pattern sentence
│ HIGH confidence · Both sexes · NOAEL 20 mg/kg        │  ← Line 3: key metadata
│                                                      │
│  |d| = 8.15      p < 0.0001      -19.6%             │  ← Line 4: key numbers
│  (very large)    (trend)          vs control         │
└──────────────────────────────────────────────────────┘
```

**Line 1 — Verdict badge:**
- `flex items-center gap-2`
- TR badge: same existing red/green badge (`● Treatment-related` or `✓ Not treatment-related`)
- Severity: `text-xs font-medium` — "Adverse" / "Warning" / "Normal"
- These two are the only fields from the old Treatment Summary that aren't repeated elsewhere

**Line 2 — Pattern sentence:**
- `mt-1.5 text-xs text-foreground/80`
- Single sentence combining pattern + direction + onset dose
- Template: `"{Pattern} {direction}, onset at {onset_dose} mg/kg"` for threshold
- Template: `"Monotonic {direction} across doses"` for monotonic
- Template: `"No dose-dependent pattern"` for flat
- This replaces 4 separate pattern mentions (Treatment Summary field, evidence bullet, Dose Response text, Dose Response badge)

**Line 3 — Key metadata:**
- `mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground`
- `{confidence} confidence` · `{sexes}` · `NOAEL {dose} mg/kg`
- Each separated by `·`
- This is the ONE place NOAEL, confidence, and sex scope appear

**Line 4 — Key numbers:**
- `mt-2 flex gap-x-4 text-[10px]`
- Three number cells, each with value on top and label below:
  - Effect size: value in `text-sm font-semibold font-mono`, label `text-muted-foreground`
  - P-value: same styling, **with test name in label**
  - % change: same styling
- The labels provide interpretation AND provenance:

```
  |d| = 8.15         p < 0.0001              -19.6%
  Cohen's d          Jonckheere-Terpstra      vs control
  (very large)       trend                    at 200 mg/kg
```

- Test name is part of the label, not a separate element. `text-[9px] text-muted-foreground`
- This is the ONE place these numbers appear

**What's removed from Treatment Summary:**
- Evidence bullet list → moves to Evidence pane (deduplicated)
- Target organ field → shown in rail group, not repeated
- Pattern field → absorbed into Line 2
- Confidence field → absorbed into Line 3
- NOAEL field → absorbed into Line 3
- Affected sexes field → absorbed into Line 3

### Pane 2: EVIDENCE (replaces Statistics prose)

The old Statistics pane had two kinds of content: prose descriptions ("Significant decrease vs control...") and the group data table. The prose was mostly restating numbers from the Verdict. Keep the unique interpretive insights; drop the restatements.

**Structure:**

```
┌──────────────────────────────────────────────────────┐
│ ▿ EVIDENCE                                           │
│                                                      │
│  | Significant at 200 mg/kg (p<0.0001, Dunnett's),  │
│  | not at 2 or 20 mg/kg                              │
│  | Trend test confirms dose-dependence               │
│  | BW decrease exceeds 10% regulatory threshold      │
│  | Effect is largest of 226 findings (#1 by |d|)     │
└──────────────────────────────────────────────────────┘
```

**Content rules — each bullet must pass this test:** "Does this bullet tell the user something they can't already read from the Verdict numbers?" If a bullet just restates a number from Line 4, delete it.

| Old bullet | Keep? | Reason |
|-----------|-------|--------|
| "HIGH confidence (p < 0.01, large effect, threshold pattern, treatment-related)" | **No** | Restates Verdict Line 1 + Line 3 |
| "Significant at Group 4, 200 mg/kg (p=<0.0001)" | **Yes → rewrite** | But rewrite to include NON-significant groups: "Significant at 200 mg/kg, not at 2 or 20" — this adds the comparison context |
| "Threshold dose-response" | **No** | Restates Verdict Line 2 |
| "Effect size -8.15 (very large)" | **No** | Restates Verdict Line 4 |
| "Trend p = <0.0001" | **No** | Restates Verdict Line 4 |
| "Mean decreased 20% at highest dose vs control" | **No** | Restates Verdict Line 4 (and was inconsistent — 20% vs 19.6%) |
| "1 of 3 treated groups show significant effect" | **Yes → rewrite** | Absorbed into the rewritten significance bullet above |
| "BW decrease exceeds 10% threshold" | **Yes** | Unique regulatory context — the 10% BW threshold is domain knowledge not in the numbers |
| "Ranks #1 of 226 findings" | **Yes** | Unique context — how this finding compares to all others |

**Styling:**
- Container: `CollapsiblePane` with default open
- Bullet list: `space-y-1 text-xs text-foreground/80`
- Left border accent: `border-l-2 border-primary/30 pl-2` on each bullet (same style as the existing red accent bars in Statistics, but neutral — the red bars were overusing color)
- Important bullets (regulatory thresholds, rank): `border-l-2 border-amber-400 pl-2` for visual emphasis

### Pane 3: DOSE DETAIL (replaces Statistics table + Dose Response)

Merges the group table from old Statistics and the bar chart from old Dose Response into one pane. No prose — just data.

**Structure:**

```
┌──────────────────────────────────────────────────────┐
│ ▿ DOSE DETAIL                          Unit: g       │
│                                                      │
│ Group    n    Mean      SD      p-adj                │
│ ─────────────────────────────────────────            │
│ | C      10   403.00   11.70    —                    │
│ | 2      10   403.90    9.64    1.00                 │
│ | 20     10   399.80   15.79    1.00                 │
│ | 200    10   324.20    7.00    <0.0001              │
│                                                      │
│ [dose-response bar chart]                            │
└──────────────────────────────────────────────────────┘
```

**What's removed:**
- "Threshold effect: no significant effect at 2.0 mg/kg, onset at 200.0 mg/kg" → already in Verdict Line 2
- "NOAEL for this finding: 20.0 mg/kg" → already in Verdict Line 3
- "Body weight decreased 19.6%" → already in Verdict Line 4
- "Trend test: p=<0.0001" → already in Verdict Line 4
- The pattern badge below the bar chart → already in Verdict Line 2

**What stays:**
- The group data table (n, mean, SD, p-adj) — this is the raw evidence
- The dose-response bar chart — this is the visual
- Unit label in the pane header — useful context
- Dose-level color bars on the left of each row (existing)
- Bold/red styling on significant p-adj values (existing)
- **Test name label** below the group table: `text-[9px] text-muted-foreground` — e.g., "Pairwise: Dunnett's test (adjusted)" for continuous, "Pairwise: Fisher's exact test (Bonferroni-adjusted)" for categorical. This makes it traceable which test produced the p-adj column values.

### Pane 4: CORRELATIONS (unchanged)

Keep as-is. But fix the empty state message to be more informative:

**Current:** "No correlated findings identified for this endpoint"
**New:** "No correlated findings in {organ_system}" — adds the organ context

**Possible bug:** Body Weight at d=-8.15 with "no correlations" is suspicious. BW typically correlates with food consumption (also BW domain) and potentially organ weights. The correlation engine may need review — either the threshold is too strict, or it's only looking within the same domain instead of across domains.

### Pane 5: CONTEXT (replaces Effect Size)

The old Effect Size pane had three kinds of content: the selected finding's Cohen's d (redundant with Verdict), interpretation prose (redundant), and the Top 10 list (unique). Keep the unique part.

**Structure:**

```
┌──────────────────────────────────────────────────────┐
│ ▿ CONTEXT                                            │
│                                                      │
│ LARGEST EFFECTS (TOP 10)                             │
│  #1  BW  Body Weight        -8.15                    │
│  #2  BW  Body Weight        -5.05                    │
│  #3  BW  Body Weight        -4.71                    │
│  #4  LB  Hematocrit         -4.60                    │
│  #5  BW  Body Weight        -4.16                    │
│  #6  MI  INFLAMMATION        4.00                    │
│  ...                                                 │
│                                                      │
│ 226 findings with computed effect sizes              │
└──────────────────────────────────────────────────────┘
```

**What's removed:**
- "Very large effect (Cohen's d = 8.15)" → in Verdict Line 4
- "Large effect with high significance: robust finding" → in Evidence bullets
- The big "-8.15 Cohen's d / Very large" card → in Verdict Line 4

**What stays:**
- Top 10 list with rank numbers added (was missing rank indicator)
- The selected finding highlighted in the list (bold or accent background)
- Total count label

**Rename:** "CONTEXT" instead of "EFFECT SIZE" because the pane now provides comparative context, not the primary effect size number. Open to "RANKING" or "COMPARISON" as alternative names.

### Pane 6: RELATED VIEWS (unchanged)

Keep as-is. Default closed.

---

## Inconsistency Fixes

### Fix 1: Single source of truth for each number

| Number | Computed in | Displayed in | Formatting |
|--------|-----------|-------------|-----------|
| Trend p-value | `endpoint.trendP` | Verdict Line 4 only | `formatPValue()` |
| Effect size | `endpoint.maxEffectSize` | Verdict Line 4 only | `.toFixed(2)` |
| % change vs control | `endpoint.pctChangeVsControl` | Verdict Line 4 only | `.toFixed(1)` + "%" |
| NOAEL | `endpoint.noael` | Verdict Line 3 only | `{dose} mg/kg` |
| Confidence | `endpoint.confidence` | Verdict Line 3 only | uppercase |
| Affected sexes | `endpoint.affectedSexes` | Verdict Line 3 only | "Both" / "Males" / "Females" |
| Pattern | `endpoint.pattern` | Verdict Line 2 only | sentence form |

No other pane may display these values in text form. They appear once. The group table and bar chart show the underlying data from which these are derived — that's not duplication, that's evidence.

### Fix 2: % change rounding

Current: Treatment Summary shows "20%", Statistics shows "19.6%".
Fix: Use `((highDoseMean - controlMean) / controlMean * 100).toFixed(1)` everywhere. One function, one result: "19.6%".

### Fix 3: P-value source clarity and formatting consistency

There are two legitimate p-values for any dose group comparison:
- **Trend p** (Jonckheere-Terpstra / Cochran-Armitage): tests dose-dependent trend across all groups
- **Pairwise p-adj** (Dunnett's / Fisher's, adjusted): tests one dose group vs control

These are different tests and can produce different values — that's correct, not a bug.

However, within the Statistics pane itself there's a conflict: the prose says "Significant decrease vs control at 200.0 mg/kg (p=<0.001)" but the group table below shows p-adj = <0.0001 for the same 200 mg/kg row. If both are the pairwise adjusted p-value, they should match. Either the prose is pulling from a different source than the table, or applying a different formatting threshold.

Fix: Every p-value display must carry its test name and use `formatPValue()` consistently.

**Test provenance label rule:** Every p-value in the UI must be accompanied by a label identifying the statistical test that produced it. The label appears as `text-[9px] text-muted-foreground` below or beside the value. No naked p-values anywhere in the panel.

**Where test labels appear:**

| Location | P-value | Test label |
|----------|---------|------------|
| Verdict Line 4 | Trend p | "Jonckheere-Terpstra trend" (continuous) or "Cochran-Armitage trend" (categorical) |
| Dose Detail table header | p-adj column | "Dunnett's" (continuous) or "Fisher's exact" (categorical) as column subtitle |
| Dose Detail table footer | Trend p | "Trend: p=X · {test name}" |
| Evidence bullets | Any p mentioned | Test name in parentheses after the value |

**Statistical test reference table:**

The app uses six statistical tests. This is the canonical list — if a p-value appears in the UI, it came from one of these:

```
TEST                         DATA TYPE      QUESTION                           WHEN USED
─────────────────────────────────────────────────────────────────────────────────────────
Jonckheere-Terpstra          Continuous     "Is there a dose-dependent         Trend p for continuous
                                             trend in means?"                  endpoints (LB, BW, OM)

Cochran-Armitage             Categorical    "Is there a dose-dependent         Trend p for categorical
                                             trend in incidence?"              endpoints (MI, MA, CL)

Dunnett's test               Continuous     "Is this dose group's mean         Pairwise p-adj for
                                             different from control?"          continuous endpoints

Fisher's exact test          Categorical    "Is this dose group's              Pairwise p-adj for
                                             incidence different from          categorical endpoints
                                             control?"

Cochran-Armitage (pairwise)  Categorical    "Is dose-dependence present        Fisher pairwise in
                                             between specific dose pairs?"     histo dose-dep methods

Williams' test               Continuous     "Is there a monotonic              Alternative trend test
                                             dose-response trend?"             (if used by backend)
```

**Formatting function:** All p-values use `formatPValue()`:

| Actual value | Display |
|-------------|---------|
| p < 0.0001  | "<0.0001" |
| p < 0.001   | value.toFixed(4) |
| p < 0.01    | value.toFixed(3) |
| p >= 0.01   | value.toFixed(2) |
| null         | "—" |

No exceptions. No manual string construction. One function, everywhere.

### Fix 4: NOAEL source

Bug 2 from the bug report: Treatment Summary shows NOAEL 0 mg/kg, Dose Response shows 20 mg/kg. With the new Verdict pane, NOAEL appears once and comes from a single computation. Verify the NOAEL derivation function returns 20 mg/kg for Body Weight (last dose with no statistically significant effect).

### Fix 5: Affected sexes source

Bug 3 from the bug report: Treatment Summary shows "Males only" for HYPERTROPHY when both sexes are affected. With the new Verdict pane, sex scope comes from the endpoint aggregate (`deriveEndpointSummaries()`), not from the selected table row.

---

## Before / After Comparison

### Before (Body Weight): ~45 lines of content, 4 trend p mentions

```
TREATMENT SUMMARY                    ~18 lines
  verdict + 6 evidence bullets
  + 6 metadata fields
STATISTICS                           ~10 lines
  3 prose lines + group table + trend label
DOSE RESPONSE                        ~6 lines
  3 prose lines + bar chart + trend label
CORRELATIONS                         ~1 line
EFFECT SIZE                          ~10 lines
  3 prose lines + card + top 10 list
```

### After (Body Weight): ~25 lines of content, 0 repeated facts

```
VERDICT                              ~4 lines
  badge + pattern sentence + metadata + numbers
EVIDENCE                             ~4 lines (only unique insights)
DOSE DETAIL                          ~6 lines
  group table + bar chart
CORRELATIONS                         ~1 line
CONTEXT                              ~8 lines
  top 10 list with rank
```

44% reduction in content. Zero repeated facts. Every line adds information.

---

## State: Endpoint-Level vs Row-Level

**Critical design decision:** The optimized panel shows **endpoint-level** data in the Verdict, and **row-level** data only in the Dose Detail table (where it's the actual evidence). This is the correct scoping because:

1. The scatter dot represents the endpoint aggregate
2. The rail card represents the endpoint aggregate
3. The verdict should match what those UI elements promise

The Dose Detail table still shows individual rows (sex × timepoint) because that's where the toxicologist needs to see the granular evidence. But the Verdict's NOAEL, sex scope, pattern, confidence, and key numbers are all endpoint-level.

This means the context panel needs to derive (or receive) endpoint-level summary data, not just the selected row's data. The `deriveEndpointSummaries()` function already computes most of these fields — the panel should consume them.

### What "selected row" still controls:

- The **highlighted row** in the Dose Detail table (scroll-to, bold)
- Nothing else. The Verdict, Evidence, and Context panes are endpoint-scoped.

---

## Implementation Notes

- The Verdict pane is not a `CollapsiblePane` — it's always visible (like the current Treatment Summary). Compact enough at 4 lines to not need collapsing.
- Evidence and Dose Detail use `CollapsiblePane` with default open.
- Context uses `CollapsiblePane` with default open.
- Related Views uses `CollapsiblePane` with default closed (unchanged).
- The old 5-pane structure (Treatment Summary, Statistics, Dose Response, Correlations, Effect Size) is replaced by the new 5-pane structure (Verdict, Evidence, Dose Detail, Correlations, Context). The pane count is the same; the content is deduplicated.

---

## TODOs (post-implementation)

- [ ] **Spec contradiction — trend p appears twice.** The Inconsistency Fixes table (§ Fix 1) says trend p should appear in "Verdict Line 4 only", but the Dose Detail section explicitly specifies a trend footer `"Trend: p={formatPValue(trend_p)} · {test_name}"`. Implementation follows the Dose Detail section (includes both). Resolve: either remove the Dose Detail trend footer or update the Fix 1 table to say "Verdict Line 4 + Dose Detail footer".

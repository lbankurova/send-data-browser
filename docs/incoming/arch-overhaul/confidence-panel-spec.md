# Confidence Decomposition Panel — UI Spec

## Design Principle

**Code the signal, not the semantics.** HIGH means nothing to see — it should recede. LOW means "look here" — it should pop. The panel's job is to let a toxicologist trust the summary at a glance and drill into the reasoning only when something is flagged.

---

## Layout Structure

The confidence decomposition replaces the current flat list + scattered evidence sections with a single, self-contained block. Each dimension is a collapsible row that contains its own evidence.

```
┌─────────────────────────────────────────────────────────┐
│  Confidence: HIGH · NOAEL weight: 1 (determining)       │
│  Hide decomposition                                     │
│                                                         │
│  HIGH  Statistical evidence                         ▸   │
│  HIGH  Biological plausibility                      ▸   │
│  HIGH  Dose-response quality                        ▸   │
│  HIGH  Trend test validity                          ▸   │
│  HIGH  Trend concordance                            ▸   │
└─────────────────────────────────────────────────────────┘
```

When a dimension is LOW:

```
┌─────────────────────────────────────────────────────────┐
│  Confidence: LOW (limited by Trend test validity)       │
│  · NOAEL weight: 0.3 (supporting)                       │
│  Hide decomposition                                     │
│                                                         │
│  HIGH  Statistical evidence                         ▸   │
│  HIGH  Biological plausibility                      ▸   │
│  HIGH  Dose-response quality                        ▸   │
│  ⚠ LOW  Trend test validity                         ▾   │  ← auto-expanded
│  │                                                      │
│  │  Variance heterogeneity detected in raw group data:  │
│  │  · SD ratio: 4.0× (control SD); threshold: 2.0×     │
│  │  · CV ratio: 3.3× (min group CV); threshold: 2.0×   │
│  │                                                      │
│  │  JT trend test assumes comparable within-group       │
│  │  variances across dose groups. Significance may      │
│  │  be inflated.                                        │
│  │                                                      │
│  │  Note: No ANCOVA normalization available for this    │
│  │  endpoint. If body weight is a covariate, ANCOVA     │
│  │  adjustment may resolve this.                        │
│  │                                                      │
│  HIGH  Trend concordance                            ▸   │
└─────────────────────────────────────────────────────────┘
```

When a dimension is MODERATE (e.g., non-monotonic pattern):

```
┌─────────────────────────────────────────────────────────┐
│  Confidence: MODERATE (limited by Dose-response quality) │
│  · NOAEL weight: 0.7 (contributing)                      │
│  Hide decomposition                                      │
│                                                          │
│  HIGH      Statistical evidence                      ▸   │
│  HIGH      Biological plausibility                   ▸   │
│  MODERATE  Dose-response quality                     ▸   │  ← not auto-expanded
│  HIGH      Trend test validity                       ▸   │
│  HIGH      Trend concordance                         ▸   │
└──────────────────────────────────────────────────────────┘
```

Note: MODERATE rows do **not** auto-expand. They use medium-weight text to subtly stand out from HIGH rows, but they don't demand immediate attention the way LOW does. The user can click to expand if they want the detail.

---

## Dimension Rows

### Row Anatomy

Each row has three elements:

```
[badge]  [label]                                    [chevron]
```

- **Badge**: The confidence level text. HIGH/MODERATE/LOW.
- **Label**: Dimension name. Always the same: "Statistical evidence", "Biological plausibility", "Dose-response quality", "Trend test validity", "Trend concordance".
- **Chevron**: `▸` collapsed, `▾` expanded.

### Visual Treatment by Level

| Level    | Badge style                          | Row style          | Behavior         |
|----------|--------------------------------------|--------------------|------------------|
| HIGH     | Muted text, no background            | Default row        | Collapsed        |
| MODERATE | Medium-weight text, subtle underline | Default row        | Collapsed        |
| LOW      | Bold text, warning accent background | Accent left border | **Auto-expanded** |

**LOW rows auto-expand** when the panel opens. The user immediately sees what's wrong and why. HIGH rows stay collapsed — they're confirmation, not news.

The **limiting dimension** (the one that set the overall confidence level) gets called out in the header: `"Confidence: LOW (limited by Trend test validity)"`.

---

## Expanded Content per Dimension

Each dimension, when expanded, shows a brief evidence block. Content varies by dimension and by what data is available.

### Statistical evidence

```
Dunnett's: p < 0.0001 at 200 mg/kg
Effect size: g = 2.61
Not significant at 2 mg/kg or 20 mg/kg
```

### Biological plausibility

```
Part of Target organ wasting syndrome (moderate):
  Body Weight, TESTIS — TESTIS (WEIGHT), GLAND, MAMMARY — ATROPHY

Part of Nephrotoxicity syndrome (moderate): Creatinine

4-domain convergence in Renal: LB, MA, MI, OM
```

### Dose-response quality

**When pattern is monotonic (quality = HIGH):**

```
Monotonic dose-response confirmed
Step-down: [Show step-down detail]
```

**When pattern is threshold (quality = HIGH — no hidden reversal):**

```
Threshold dose-response pattern
Effect onset at [dose level]
Step-down: [Show step-down detail]
```

**When pattern is threshold with hidden reversal (quality = LOW):**

```
Threshold pattern with high-dose reversal detected:
  Effect peaks at [mid-dose] and reverses at [high dose].
  Trend test may overstate or understate the effect.
```

**When backend classifies pattern as non_monotonic (quality = MODERATE):**

```
Backend pattern classification: non_monotonic
JT trend test assumes monotonic dose-response;
significance may not reflect the observed pattern shape.
Consider examining individual dose-group contrasts
(Dunnett's) rather than trend for this endpoint.
```

**When pattern is flat (quality = HIGH):**

```
Flat dose-response pattern (no treatment-related trend).
Statistical evidence dimension handles significance
separately.
```

### Trend test validity

**When ANCOVA is available (validity = HIGH due to ANCOVA bypass):**

```
ANCOVA normalization available (R² = 0.56)
Raw variance check bypassed — body weight covariate
accounts for between-group variance.
BW slope homogeneity: p = 0.78 (assumption met)
```

**When ANCOVA is NOT available and validity is LOW:**

```
Variance heterogeneity detected in raw group data:
  · SD ratio: 4.0× (control SD); threshold: 2.0×
  · CV ratio: 3.3× (min group CV); threshold: 2.0×

JT trend test assumes comparable within-group
variances across dose groups. Significance may
be inflated.
```

**When neither flag fires (validity = HIGH, no ANCOVA):**

```
Within-group variance is comparable across dose groups.
SD ratio: 1.3× (threshold: 2.0×)
CV ratio: 1.1× (threshold: 2.0×)
```

### Trend concordance

```
Jonckheere-Terpstra    p = <0.0001 *
Williams' test         MED: 3 *
● Concordant

[Show step-down detail]
```

---

## Tooltips

Every dimension label gets an `info` tooltip (ⓘ icon or hover on label). Tooltips are **definitional only** — they explain what the dimension measures, not what it found.

| Dimension               | Tooltip text                                                                                           |
|-------------------------|-------------------------------------------------------------------------------------------------------|
| Statistical evidence    | Strength of the statistical signal: p-value significance and effect size magnitude.                    |
| Biological plausibility | Whether this finding is corroborated by related findings across domains (e.g., clinical chemistry supporting an organ weight change). |
| Dose-response quality   | Evaluates whether the dose-response pattern is consistent with a reliable treatment-related effect. Flags non-monotonic patterns (e.g., mid-dose peaks with high-dose reversals) where trend test interpretation may be less straightforward. |
| Trend test validity     | Whether the statistical assumptions of the trend test are met — specifically, comparable within-group variances across dose groups. When ANCOVA is available, this check uses ANCOVA diagnostics instead of raw variance. |
| Trend concordance       | Whether two independent trend tests (Jonckheere-Terpstra and Williams) agree on the presence and direction of a dose-related trend. |

Tooltip style: light background, max-width ~300px, appears on hover with short delay (~200ms), dismisses on mouse-out. No click-to-pin needed.

---

## Interaction Details

### Expand/Collapse

- Click anywhere on the row to toggle.
- LOW dimensions auto-expand on panel load.
- Multiple dimensions can be expanded simultaneously.
- "Hide decomposition" collapses the entire confidence block (existing behavior).

### Confidence Header

The header line changes based on overall confidence:

- **HIGH**: `Confidence: HIGH · NOAEL weight: 1 (determining)`
- **MODERATE**: `Confidence: MODERATE (limited by [dimension]) · NOAEL weight: 0.7 (contributing)`
- **LOW**: `Confidence: LOW (limited by [dimension]) · NOAEL weight: 0.3 (supporting)`

When confidence is not HIGH, the limiting dimension name is a clickable link that scrolls/focuses the relevant expanded row.

---

## What Moves Out

The current standalone sections — **TREND TEST COMPARISON** and **ANCOVA DECOMPOSITION** — are reorganized:

| Current section            | New location                                                              |
|----------------------------|--------------------------------------------------------------------------|
| JT p-value, Williams MED, Concordant badge | Moves **into** Trend concordance expanded detail         |
| Step-down detail           | Linked from both Dose-response quality and Trend concordance             |
| ANCOVA R², BW slope, group decomposition table | Stays as standalone section (this is interpretive analysis, not confidence metadata) |
| ANCOVA validity info (R², slope homogeneity) | **Also referenced in** Trend test validity expanded detail (brief summary, not full table) |

The ANCOVA decomposition table remains a standalone section because toxicologists use it for interpretation (direct vs. indirect effects, adjusted means) — not just as a confidence input. But the trend test validity expansion **cross-references** it: "ANCOVA normalization available (R² = 0.56)" with an anchor link to the full ANCOVA section if needed.

---

## Edge Cases

### No confidence data available
Show: `Confidence: Not computed` with no expandable rows.

### Dimension not triggered
If a dimension returns NOT_TRIGGERED (e.g., trend validity skipped because no trend test ran), show the row as:
```
 —   Trend test validity (not applicable)
```
Muted text, no chevron, not expandable. Tooltip still available.

### Multiple dimensions at LOW
All LOW dimensions auto-expand. Header shows the primary limiter:
`Confidence: LOW (limited by Trend test validity, Dose-response quality)`

---

## Summary of Changes

1. **Confidence dimensions become expandable rows** — each self-contained with its own evidence
2. **LOW rows auto-expand** — signal pops, non-issues recede
3. **Tooltips on every dimension** — definitional, not evidential
4. **Trend test comparison moves inside Trend concordance** expansion
5. **ANCOVA decomposition stays standalone** — it's interpretive, not just a confidence input
6. **Limiting dimension called out in header** with clickable link to the row
7. **No color-coding on HIGH** — muted, recedes. **LOW gets accent treatment** — bold, border, background
8. **Dose-response quality now penalizes non_monotonic patterns** — MODERATE when backend classifies pattern as non-monotonic (JT is mismatched to the shape)

---

## Implementation Status

**Core spec: Fully implemented** as of `b4e8da3`.

| Spec item | Status | Notes |
|---|---|---|
| Expandable dimension rows | Done | `DecomposedConfidencePane` in `FindingsContextPanel.tsx` |
| LOW auto-expand | Done | Dimensions with `level === "LOW"` default open |
| MODERATE collapsed, medium-weight text | Done | Subtle underline + `font-medium` |
| HIGH muted, no background | Done | Typography-only — `text-muted-foreground` |
| Tooltips on every dimension | Done | ⓘ hover via `title`, text matches spec table |
| Trend concordance expanded content | Done | JT + Williams p-values, MED labels, concordance badge |
| ANCOVA decomposition stays standalone | Done | `ANCOVADecompositionPane` remains its own pane below |
| Limiting dimension in header | Done | `"(limited by [dimension])"` shown for MODERATE/LOW |
| Dose-response quality penalizes non_monotonic | Done | `checkDoseResponseQuality` in `endpoint-confidence.ts` |

### Divergences from Spec

**D1: Dose group labels use `DoseLabel` component throughout.**
The spec's ASCII mockups show bare group numbers (e.g., `1`, `2`, `3`). Implementation uses `DoseLabel` with resolved actual-dosage labels ("Control", "200 mg/kg") and colored left-border pipes in: group comparison table, pairwise bar chart, ANCOVA effect decomposition table, ANCOVA adjusted means, recovery histopath per-dose rows, and recovery continuous per-dose rows. **Rationale:** Bare numbers require the user to mentally map dose levels to actual dosages. The `DoseLabel` component is the project-wide standard (CLAUDE.md hard rule: "Never render raw dose group strings"), and colored pipes provide at-a-glance dose identification consistent with every other view.

**D2: Pairwise bar chart uses neutral grey instead of primary/30.**
Spec does not specify bar chart styling. Implementation uses `h-2.5 bg-gray-300` (thinner, neutral grey) instead of the original `h-4 bg-primary/30`. **Rationale:** The bar chart is supporting evidence (Tier 2), not a conclusion. Neutral grey follows the design system's color budget rule (≤10% saturated pixels at rest) and avoids competing with the p-value color signal.

**D3: Limiting dimension header is not a clickable scroll link.**
Spec says the limiting dimension name should be "a clickable link that scrolls/focuses the relevant expanded row." Implementation shows the dimension name in the header text but does not implement click-to-scroll. **Rationale:** LOW dimensions auto-expand on load, so they are already visible; the scroll link adds interaction complexity for minimal benefit given the panel's compact size.

---

## TODO: Umbrella Alternatives for Non-Monotonic Patterns

**Status:** Not yet implemented. Tracked here for future work.

### Problem

When the backend classifies a pattern as `non_monotonic`, the current engine correctly flags dose-response quality as MODERATE — but the underlying issue is that JT (a monotonic trend test) is the wrong tool for this shape. The penalty is a workaround for not having the right test.

### Proposed Solution

Implement umbrella alternative tests (e.g., Mack-Wolfe, Chen-Wolfe) that are designed for non-monotonic dose-response patterns — specifically, patterns that rise to a peak and then decline (or vice versa). These tests detect trend without assuming monotonicity.

### What Changes When Implemented

- For `non_monotonic` patterns, run the umbrella alternative alongside JT
- If the umbrella test confirms the pattern is significant, dose-response quality can be restored to HIGH — the pattern is real and now validated by an appropriate test
- Trend concordance gains a new comparison axis: JT vs. umbrella alternative (replacing JT vs. Williams for non-monotonic cases)
- The MODERATE penalty for non-monotonic patterns becomes conditional: only applies if no umbrella test is available or if the umbrella test disagrees

### Tooltip (Future State)

When umbrella alternatives are implemented, update the dose-response quality tooltip to:

> **Dose-response quality** — Evaluates whether the dose-response pattern is consistent with a reliable treatment-related effect. For monotonic patterns, assessed via JT and Williams. For non-monotonic patterns (e.g., peak-and-reversal), assessed via umbrella alternative tests (Mack-Wolfe) designed for these shapes.

### Engine Changes Required

1. Add umbrella test computation to the backend statistical engine
2. Attach umbrella results to `UnifiedFinding` (e.g., `umbrella?: UmbrellaResult`)
3. In `checkDoseResponseQuality`: when pattern is `non_monotonic` and umbrella test is available, use umbrella p-value to determine quality instead of defaulting to MODERATE
4. In `checkTrendConcordance`: when pattern is `non_monotonic`, compare umbrella vs. JT instead of JT vs. Williams
5. Update expanded detail content for both dimensions to show umbrella test results

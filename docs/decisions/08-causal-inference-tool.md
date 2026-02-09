# 08 — Causal Inference Tool (Bradford Hill Worksheet)

**Status:** Proposed
**Priority:** Medium — extends existing Hypotheses tab
**Depends on:** None (uses existing rule_results and signal data)

---

## Problem

The app excels at characterizing *what* happened (dose-response shape, effect size, statistical significance) but does not help the toxicologist reason about *why* — specifically, whether a finding is causally related to treatment. The Hypotheses tab has "Correlation" (Pearson/Spearman co-movement), but correlation is not causation. Toxicologists need structured causal reasoning to support regulatory conclusions.

Bradford Hill criteria are the standard framework for evaluating causal inference in toxicology:

1. **Biological gradient** (dose-response relationship)
2. **Consistency** (same effect across sexes, replicable)
3. **Specificity** (effect limited to target tissues)
4. **Temporality** (onset timing relative to dosing)
5. **Coherence** (multiple evidence streams tell consistent story)
6. **Biological plausibility** (mechanism is scientifically plausible)
7. **Strength of association** (magnitude of effect)
8. **Experiment** (controlled conditions support causation)
9. **Analogy** (similar compounds produce similar effects)

Several of these can be auto-populated from existing data; others require expert judgment.

---

## Proposed Solution

Add a **"Causality"** tool to the Hypotheses tab's tool palette. When selected, it shows a structured Bradford Hill worksheet for the currently selected endpoint.

### Location in UI

- New entry in `HYPOTHESIS_TOOLS` array:
  ```
  { value: "causality", label: "Causality", icon: Scale, available: true, description: "Bradford Hill causal assessment" }
  ```
- Renders in the Hypotheses tab content area (same pattern as Shape, Pareto, Correlation, etc.)
- Not a favorite by default (user pins it if they use it regularly)

### Worksheet Layout

Two zones within the tool content area:

```
+------------------------------------------+
| Causality assessment: {endpoint_label}   |
| {domain} · {organ_system}               |
+------------------------------------------+
|                                          |
| [Auto-populated criteria]                |
|  Biological gradient    [Strong] ●●●○○   |
|  Consistency            [Moderate] ●●○○○ |
|  Specificity            [Weak] ●○○○○     |
|  Strength               [Strong] ●●●●○   |
|  Coherence              [Strong] ●●●○○   |
|                                          |
| [Expert-input criteria]                  |
|  Temporality            [___________]    |
|  Plausibility           [___________]    |
|  Experiment             [___________]    |
|  Analogy                [___________]    |
|                                          |
| [Overall assessment]                     |
|  ○ Likely causal                         |
|  ○ Possibly causal                       |
|  ○ Unlikely causal                       |
|  ○ Not assessed                          |
|                                          |
|  Comment: [___________________________]  |
|                                          |
+------------------------------------------+
```

### Auto-populated Criteria

These are derived from existing data without user input:

| Criterion | Data source | How to score |
|-----------|-------------|-------------|
| Biological gradient | `dose_response_pattern` from endpoint summary | `monotonic_increase`/`decrease` → Strong; `threshold` → Moderate; `non_monotonic`/`flat` → Weak |
| Consistency | `sexes` array from endpoint summary | Both sexes affected → Strong; one sex only → Moderate |
| Specificity | Count of organs where this endpoint signals | 1 organ → Strong; 2-3 → Moderate; 4+ → Weak |
| Strength of association | `max_effect_size` from endpoint summary | \|d\| >= 0.8 → Strong; >= 0.5 → Moderate; < 0.5 → Weak |
| Coherence | R16 correlation rules from `rule_results` for this organ | Multiple correlated findings → Strong; some → Moderate; none → Weak |

### Expert-input Criteria

These require toxicologist judgment. Each shows:
- A text area for the rationale (free text, persisted via annotations API)
- An optional strength selector (Strong / Moderate / Weak / N/A)

| Criterion | Guidance text shown |
|-----------|-------------------|
| Temporality | "Is the timing of onset consistent with treatment exposure? Consider recovery group data if available." |
| Biological plausibility | "Is there a known biological mechanism? Reference published literature or compound class effects." |
| Experiment | "Do the controlled study conditions support a causal interpretation? Consider study design adequacy." |
| Analogy | "Do similar compounds in the same class produce similar effects?" |

### Overall Assessment

Radio button group with four options. The selected value is persisted as an annotation. This is the toxicologist's conclusion — it is never auto-calculated.

### Color Coding

Apply the signal-not-meaning principle:
- **Auto-populated strength indicators** use neutral gray dots (●○). Not colored — these are categorical assessments, not signal values. The number of filled dots encodes the strength (1-5 scale).
- **Overall assessment radio buttons** are plain text. No color coding on the selection.
- The only color in this view comes from the p-value and effect size values displayed in the auto-populated evidence rows (if shown), using the standard `getPValueColor()`/`getEffectSizeColor()` functions.

### Persistence

- Auto-populated criteria are computed on the fly (no storage needed)
- Expert-input text and strength selections persist via the existing annotations API as a new schema type: `causal-assessment.json`
- Key format: `{endpoint_label}` (one assessment per endpoint per study)
- Overall assessment value persists in the same annotation

---

## Integration Points

| File | Change |
|------|--------|
| `docs/views/dose-response.md` | Add Causality tool to Hypotheses tab section |
| `frontend/src/components/analysis/DoseResponseView.tsx` | Add `"causality"` to `HypothesisIntent` union, add tool entry, add `CausalityWorksheet` component |
| `frontend/src/hooks/useAnnotations.ts` | Already supports arbitrary schema types — no change needed |
| `backend/routers/annotations.py` | Already handles any schema_type — no change needed |
| `docs/systems/annotations.md` | Document new `causal-assessment` schema type |

---

## What This Does NOT Include

- **Automated causal conclusion.** The tool structures reasoning, it does not compute a verdict.
- **Literature integration.** No PubMed lookup or compound database queries.
- **Cross-study comparison.** Assessment is per-endpoint within a single study.
- **Temporality data.** Scoring temporality requires per-timepoint data (see spec 01-temporal-evidence-api.md). Until that API exists, Temporality remains expert-input only.

---

## Open Questions

1. Should the causality assessment be exportable as part of the HTML report? Recommend: yes, as an appendix table.
2. Should there be a study-level causality summary (aggregating endpoint-level assessments)? Recommend: defer to a later spec.
3. Should auto-populated scores be overridable by the toxicologist? Recommend: yes — show the computed value as a default but allow manual override with a justification field.

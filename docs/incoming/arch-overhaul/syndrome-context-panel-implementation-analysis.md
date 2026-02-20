# SyndromeContextPanel Implementation Analysis

**Date:** 2026-02-19
**Specs:** `food-consumption-pane-spec-v2.md`, `syndrome-context-panel-restructure-spec-v2.md`
**Target:** `SyndromeContextPanel.tsx` (1720 lines → ~1400 lines est.)

---

## Decision Points (12 resolved)

### D-1: FC dose labels — colored or neutral?
**Decision:** Colored via `getDoseGroupColor(level)` — inline `color` style, `text-[10px] font-mono`.
**Rationale:** FC spec §5.6 explicitly specifies this. CLAUDE.md DoseLabel hard rule requires colored dose labels. Domain labels stay neutral gray per design system — dose labels are a different visual class.

### D-2: Domain labels in context panel
**Decision:** Always neutral gray (`text-muted-foreground`).
**Rationale:** Recent commit established this as design system rule. Colored domain text (`getDomainBadgeColor(domain).text`) is used elsewhere per CLAUDE.md but context panel uses neutral gray for domains within evidence rows.

### D-3: Sticky header pattern
**Decision:** Reuse from histopathology — `sticky top-0 z-10 border-b bg-background px-4 py-3`.
**Rationale:** Established pattern across all context panels. Add severity left-border accent to existing container.

### D-4: Detection confidence (patternConfidence)
**Decision:** Remove from display entirely. Add meaningful tooltip to mechanism certainty text.
**Rationale:** Pattern confidence is a detection-phase metric (how well the pattern matched). Mechanism certainty is the interpretive conclusion (is the mechanism confirmed?). They measure different things but create confusion when shown together. Keep the more meaningful one.

### D-5: Unimplemented B-factors (B-2, B-6, B-7)
**Decision:** Hide — don't show "no" for things that can't compute "yes".
**Rationale:** B-2 (adaptive/stress confound), B-6 (precursor to worse), B-7 (secondary to other) are all hardcoded "no" in the engine. Displaying them misleads reviewers into thinking the system evaluated and rejected these factors.

### D-6: Backend/scientific logic changes
**Decision:** None. UI-only restructure.
**Rationale:** All data sources already exist. No new API calls, no new hooks, no engine changes.

### D-7: Hy's Law display filtering
**Decision:** Show only TRIGGERED and APPROACHING rules. Omit NOT TRIGGERED entirely.
**Rationale:** Showing 3 rules all saying "NOT TRIGGERED" communicates "no Hy's Law concern" in 18 lines. Omitting communicates the same in 0 lines. Absence = no concern.

### D-8: Evidence pane merge strategy — discriminating + differential
**Decision:** Use `syndromeInterp.discriminatingEvidence` as primary, augment with differential implication text from `DIFFERENTIAL_PAIRS`.
**Rationale:** Both components evaluate the same endpoints. The certainty assessment and differential are two views of identical data. Merge eliminates redundant endpoint lookup.

### D-9: Recovery display in DR&R pane
**Decision:** Border-left blocks (emerald/amber) with `d=X.X → d=Y.Y` transition format.
**Rationale:** Consistent with FC pane recovery blocks (spec §5.5). Effect size transition is more informative than separate terminal/recovery columns.

### D-10: ECETOC factors — keep or remove?
**Decision:** Keep as collapsible "All A/B factors" sub-section within DR&R, collapsed by default.
**Rationale:** Preserves detail for reviewers who need it without cluttering the primary view. The key information (dose-response, recovery) is surfaced in the main pane.

### D-11: Reference pane merge
**Decision:** Merge Interpretation + Related Views (minus "View validation →") into single "Reference" pane, always collapsed.
**Rationale:** Both are reference material. Static interpretation text is read once. Navigation links are secondary. No reason for separate accordion entries.

### D-12: Food consumption conditional display
**Decision:** Show for XS08/XS09 always; others only when XS09 co-detected AND FC available AND assessment ≠ not_applicable.
**Rationale:** FC pane is definitional for XS09 (wasting) and core to XS08 (stress response). For other syndromes, FC is only relevant as a wasting confound.

---

## Data Availability Assessment

| Data field | Available? | Source | Notes |
|-----------|-----------|--------|-------|
| `overallSeverity` | Yes | `syndromeInterp.overallSeverity` | Already computed in ECETOC assessment |
| `mechanismCertainty` | Yes | `syndromeInterp.mechanismCertainty` | Already in header |
| `recovery.status` | Yes | `syndromeInterp.recovery.status` | Was in verdict card |
| `treatmentRelatedness.overall` | Yes | `syndromeInterp.treatmentRelatedness.overall` | Was in ECETOC pane |
| `adversity.overall` | Yes | `syndromeInterp.adversity.overall` | Was in ECETOC pane |
| `mortalityNoaelCap` | Yes | `syndromeInterp.mortalityContext.mortalityNoaelCap` | Was in verdict card |
| `discriminatingEvidence` | Yes | `syndromeInterp.discriminatingEvidence` | Was in certainty pane |
| `upgradeEvidence` | Yes | `syndromeInterp.upgradeEvidence` | Was in upgrade pane |
| FC raw periods | Yes | `foodConsumptionSummary.periods` | Already fetched |
| FC recovery | Yes | `foodConsumptionSummary.recovery` | Already fetched |
| FC `overall_assessment` | Yes | `foodConsumptionSummary.overall_assessment` | For key stats |
| Trend p-value | Partial | Not exposed per-endpoint | DR&R summary uses `treatmentRelatedness.doseResponse` text |
| Lead endpoint effect size | Yes | Derivable from `allEndpoints` | Find min p-value endpoint |

---

## Engine-vs-Spec Gaps

### Gap 1: Assessment label mapping
Backend produces `"primary_weight_loss"`, `"secondary_to_food"`, `"malabsorption"`, `"not_applicable"`.
Spec uses `"primary"`, `"secondary"`, `"indeterminate"`, `"no_effect"`.
**Resolution:** Frontend mapping function `getVerdictConfig()` translates.

### Gap 2: FE recovery status
Backend `recovery` object has `fw_recovered` and `bw_recovered` but not `fe_recovered`.
**Resolution:** Derive FE recovery from period data if recovery period exists, or omit FE row.

### Gap 3: Residual magnitude for recovery
Spec §5.5 shows "still ↓15% at recovery" but backend doesn't provide residual pct change.
**Resolution:** Compute from recovery period data if available, otherwise omit magnitude suffix.

### Gap 4: Trend p-value in DR&R summary
Spec §3.3 shows `trend p=0.002` but `treatmentRelatedness` doesn't expose per-endpoint trend p.
**Resolution:** Extract from `allEndpoints` lead endpoint if available, otherwise show dose-response pattern text only.

---

## Implementation Phases

1. **Phase 1:** Food Consumption Pane Redesign (FoodConsumptionPane rewrite)
2. **Phase 2:** Sticky Header Restructure (header + verdict card removal)
3. **Phase 3:** Evidence Pane Merge (4 panes → 1)
4. **Phase 4:** Dose-Response & Recovery Pane Merge (2 panes → 1)
5. **Phase 5:** Conditional Display + Cleanup (pane ordering, conditionals, Reference merge)

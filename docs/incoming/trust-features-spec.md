# Trust Features Specification

**Author:** UX Designer (domain research)
**Date:** 2026-02-12
**Status:** Draft — pending prioritization

## Thesis

**Trust = Transparency + Control + Verification.** Different personas need different balances of these three dimensions. The system currently provides good *conclusions* (insights first) but insufficient *reasoning visibility* (why those conclusions). Trust is the gap between "the system says X" and "I believe X because I can see how the system derived it."

### Trust Dimension Map

| Persona | Primary trust need | Current trust level | Gap |
|---------|-------------------|--------------------|----|
| P5 Biostatistician | Transparency + Control | Low | Can't see formulas, can't adjust thresholds |
| P1 Study Director | Transparency + Control | Medium | Sees conclusions, can't trace reasoning chain |
| P7 Regulatory Reviewer | Transparency + Verification | Low | Can't verify methodology or trace to source |
| P2 Pathologist | Verification | Medium | Sees grades but can't verify aggregation |
| P4 Data Manager | Transparency + Control | Medium | Can't inspect or customize validation rules |
| P6 QA Auditor | Verification | Low | No audit trail, no change history |
| P3 Reg Toxicologist | Transparency | Medium | Can cite conclusions but not methodology |

## Feature Summary

| ID | Feature | Primary personas | Trust dimension | Phase |
|----|---------|-----------------|----------------|-------|
| TRUST-01 | Insight engine rule editor | P5, P1, P7 | Transparency + Control | 1 (inspector), 2 (editor), 3 (custom rules) |
| TRUST-02 | Evidence provenance & calculation transparency | P1, P7, P5 | Transparency | 1 |
| TRUST-03 | Statistical methodology panel | P5, P7 | Transparency | 2 (needs backend work) |
| TRUST-04 | Expert override & disagreement workflow | P1, P2, P5 | Control | 1 (extends existing ToxFinding) |
| TRUST-05 | Validation rule transparency & customization | P4, P6 | Transparency + Control | 1 (inspector), 2 (editor) |
| TRUST-06 | Audit trail & change history | P6, P7 | Verification | 2 (needs auth infrastructure) |
| TRUST-07 | Raw data verification panel | P2, P7, P5 | Verification | 1 (source records), 2 (historical controls) |

## Recommended Implementation Order

### Phase 1 — Read-only transparency (no backend changes)
1. **TRUST-01 phase 1:** Rule Inspector Panel — expose all hardcoded values in a browsable UI
2. **TRUST-02:** Evidence provenance — signal score breakdowns, convergence explanations
3. **TRUST-05 phase 1:** Validation rule inspector — show YAML rules in the UI
4. **TRUST-07 phase 1:** Source records expander — drill from aggregates to animal data

**Rationale:** These are all read-only features that surface existing information. No backend changes needed. Maximum trust improvement for minimum effort.

### Phase 2 — Expert control (extends existing systems)
5. **TRUST-04:** Override & disagreement workflow — extends existing ToxFinding form
6. **TRUST-01 phase 2:** Threshold editor — UI for adjusting hardcoded values
7. **TRUST-05 phase 2:** Validation rule customization — enable/disable/adjust rules

**Rationale:** These add control on top of transparency. Extend existing annotation and configuration systems.

### Phase 3 — Full regulatory compliance (needs infrastructure)
8. **TRUST-06:** Audit trail — requires authentication infrastructure
9. **TRUST-03:** Statistical methodology panel — requires backend pipeline extensions
10. **TRUST-01 phase 3:** Custom rule builder — full rule authoring
11. **TRUST-05 phase 3:** Custom validation rule builder

**Rationale:** These require significant infrastructure (auth, pipeline extensions, storage) but deliver regulatory compliance.

## Cross-Feature Dependencies

```
TRUST-06 (Audit Trail) ──depends on──► Authentication infrastructure
TRUST-03 (Stat Methods) ──depends on──► Backend pipeline extensions (store test metadata)
TRUST-04 (Overrides) ──enhances──► TRUST-06 (overrides feed audit trail)
TRUST-01 phase 2 (Editor) ──enhances──► TRUST-06 (config changes feed audit trail)
```

## Regulatory Context

| Regulation | Relevant trust features |
|-----------|----------------------|
| 21 CFR Part 58 (GLP) | TRUST-04 (SD responsibility), TRUST-06 (audit trail) |
| 21 CFR Part 11 (electronic records) | TRUST-06 (audit trail + e-signatures) |
| ICH S3A (toxicokinetics) | TRUST-03 (stat methodology documentation) |
| ICH M3(R2) (nonclinical safety) | TRUST-01 (methodology transparency), TRUST-03 |
| CDISC SENDIG | TRUST-05 (validation rule provenance) |
| FDA Data Standards Program | TRUST-05 (validation approach documentation) |

## Competitive Context

| Competitor | Trust features they offer | Our gap |
|-----------|--------------------------|---------|
| Certara sendexplorer | Configurable rules, audit trail, role-based access | All 7 TRUST features |
| Pinnacle 21 | Custom validation rules, rule versioning, CDISC provenance | TRUST-05, TRUST-06 |
| Instem Provantis | Full audit trail, electronic signatures, peer review workflow | TRUST-04, TRUST-06 |
| PathData | Pathologist override workflow, peer review comparison | TRUST-04, TRUST-07 |

## Success Metrics

| Metric | Target | Measured by |
|--------|--------|-------------|
| P5 can verify signal score formula | < 3 clicks from any score | Usability test |
| P1 can trace NOAEL to source data | < 5 clicks from banner to animal records | Usability test |
| P7 finds methodology transparent | All computed values have "show calculation" | Feature checklist |
| P6 can export audit trail | One-click export of complete history | Feature checklist |
| P4 can inspect validation rules | All 18 rules visible with conditions | Feature checklist |

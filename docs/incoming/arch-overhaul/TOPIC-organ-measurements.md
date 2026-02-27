# Topic Hub: Organ Weight Measurements & Normalization

**Last updated:** 2026-02-26
**Overall status:** Core engine complete (Phases 1-2). Phase 3 deferred. UI is functional but not the full spec vision.

---

## What Shipped

All core logic, backend pipeline, and functional UI are implemented and tested.

### Engine & Backend
- **Normalization decision engine** — 4-tier Hedges' g framework, 7 organ categories (STRONG_BW, MODERATE_BW, WEAK_BW, BRAIN, GONADAL, ANDROGEN_DEPENDENT, FEMALE_REPRODUCTIVE), species-calibrated brain tier check
- **Metric-aware statistics** — `findings_om.py` runs JT, Dunnett's, Hedges' g, Williams' on the *recommended* metric per organ (not absolute for all)
- **Williams' trend test** — PAVA step-down, published + Monte Carlo critical values, auto-computed for all OM endpoints
- **ANCOVA** (Phase 2) — OLS effect decomposition (direct/indirect), slope homogeneity test, adjusted LS means. Runs when tier >= 3 or brain affected
- **Normalization-aware alternatives** — `alternatives` dict stores stats for all metrics per endpoint
- **Python normalization port** — `normalization.py` mirrors frontend `decideNormalization()` for backend use

### Frontend Logic
- **Endpoint Confidence Index (ECI)** — 5-dimension min-aggregation (statistical, biological, dose-response, non-monotonic, trend concordance)
- **JT/Williams' concordance check** — 5th ECI dimension, step-down detail, discordance warnings
- **NOAEL contribution weighting** — 0.0/0.3/0.7/1.0 weights from integrated confidence
- **Weighted NOAEL derivation** — study-level NOAEL from weighted endpoint contributions
- **B-7 secondary-to-BW assessment** — reproductive overrides (GONADAL never secondary, ANDROGEN_DEPENDENT stress-linked, FEMALE_REPRODUCTIVE low-confidence)
- **Magnitude floors** — `checkMagnitudeFloorOM()` wired into syndrome engine's `checkMagnitudeFloor()`
- **Syndrome engine integration** — normalization contexts flow through `useFindingsAnalyticsLocal`, consumed by SE-4, SE-7/SE-8 directional gates, ANCOVA-awareness, cross-domain magnitude floors

### UI Components
- **FindingsRail** — organ card normalization indicator (mode abbreviation + tier-colored underline). Bug fix `7e1f19c`: was matching organ system name against SEND specimen — never matched; now collects OM specimens from card endpoints.
- **NormalizationHeatmap** — organ x dose-group matrix with tier-colored mode badges (OrganContextPanel + empty state)
- **OrganContextPanel normalization pane** — tier, rationale, alternatives table, override form
- **FindingsContextPanel OM annotation** — BW confounding callout, category-specific messaging (GONADAL, ANDROGEN_DEPENDENT, FEMALE_REPRODUCTIVE), normalization alternatives table
- **WilliamsComparisonPane** — JT vs Williams' comparison with step-down detail
- **ANCOVADecompositionPane** — model R^2, slope homogeneity, per-dose decomposition table
- **DecomposedConfidencePane** — 5-dimension ECI breakdown
- **DoseResponseView** — effect size chart y-axis metric subtitle ("Computed from body-weight" etc.)
- **NormalizationOverrideForm** — per-organ mode override with reason, persisted via annotations API

### Tests
- `organ-weight-normalization.test.ts` — 104 tests (decision engine, categories, tiers, reproductive branches, B-7)
- `syndrome-normalization.test.ts` — 23 tests (syndrome engine normalization integration)
- `endpoint-confidence.test.ts` — 50 tests (4 mechanisms + concordance + NOAEL weighting)
- `test_normalization.py` — backend normalization decisions (all categories, metric selection)
- `test_williams.py` — PAVA correctness (5 cases) + Williams' test (6 cases)
- `test_ancova.py` — ANCOVA computation, tier-4 metric override

### Key Commits
- `909e3ad` — SE-7/SE-8 directional gates with ANCOVA awareness
- `861fb18` — D3 metric subtitle + D5 normalization heatmap + shared constants extraction
- `7e1f19c` — Fix FindingsRail normalization indicator (was dead — organ system vs specimen mismatch)

---

## What's NOT Shipped (spec vs. reality)

### Deferred by design
| Item | Spec | Reason |
|------|------|--------|
| **Phase 3: Bayesian mediation** | OWN §7 | Requires PyMC dependency; ANCOVA covers most use cases. Next major milestone. |
| **Standalone REST endpoints** | OWN §6.1, WTC §2.8 | Williams'/ANCOVA run inline in generator — no separate API needed for current architecture. |
| **Williams' for non-OM domains** | WTC §3 | Spec says "all continuous endpoints" but implementation is OM-only. LB/BW don't need Williams' currently. Low priority. |

### Spec UI not implemented (lower priority)
| Item | Spec | What exists instead |
|------|------|---------------------|
| **Normalization Ribbon** | OWN §5.1 | No dedicated ribbon. Mode info shown in rail indicators, context panel panes, and chart subtitles. Functional equivalent spread across surfaces. |
| **Organ Weight Adaptive Grid** | OWN §5.2 | No dedicated OM grid viewer with tier-adaptive columns. Findings table serves this role with normalization annotation in evidence pane. |
| **Decision Rationale Panel ("Why?")** | OWN §5.3 | Rationale shown inline in OrganContextPanel normalization pane. No standalone modal. |
| **Organ-vs-BW Scatter** | OWN §5.5 | Not built. Would require individual-level data on frontend (currently only group stats). |
| **ANCOVA Forest Plot** | OWN §6.3 | ANCOVA decomposition table exists; no forest plot visualization. |

### Minor gaps
| Item | Spec | Status |
|------|------|--------|
| Organ-calibrated magnitude floors (prostate >= 1.0, ovary/uterus >= 1.5) | AMD-001 §4.2 | Not in syndrome engine. Generic floors apply. |
| NST REQ-5 user override recomputes tests | NST §4 | Alternatives dict has pre-computed stats for all metrics; no UI to switch + show warning banner. Override form changes the *decision* but doesn't recompute on the fly. |
| Pattern classifier metric awareness | NST REQ-1 | Dose-response pattern classifier may still use absolute values. Needs verification in generator classifier. |

---

## Roadmap

### Near-term (nice-to-have)
- Organ-calibrated magnitude floors for reproductive organs
- Verify pattern classifier uses recommended metric

### Medium-term
- Organ-vs-BW scatter plot (requires individual-level data on frontend)
- ANCOVA forest plot visualization

### Long-term
- **Phase 3: Bayesian mediation** (PyMC) — direct/indirect effect posterior distributions, DAG visualization
- Williams' test for LB/BW domains (if non-monotonicity becomes a concern there)

---

## File Map

### Specifications (historical — served their purpose, now superseded by code)
| File | Role | Status |
|------|------|--------|
| `docs/incoming/arch-overhaul/organ_weight_normalization_spec.md` | Original engine spec (OWN v1.1) | IMPLEMENTED (core engine + Phase 2 ANCOVA). UI ribbon/grid/scatter NOT BUILT. |
| `docs/incoming/arch-overhaul/spec_amendment_reproductive_normalization.md` | AMD-001: reproductive sub-categories | IMPLEMENTED (all 3 categories + B-7 overrides + UI messaging) |
| `docs/incoming/arch-overhaul/spec_normalization_aware_statistical_testing.md` | NST: metric-aware stats pipeline | IMPLEMENTED (REQ-1 through REQ-4). REQ-5 override recompute NOT DONE. |
| `docs/incoming/arch-overhaul/spec_endpoint_confidence_integrity.md` | ECI: 5-dimension confidence framework | IMPLEMENTED (all 4 mechanisms + Mech 2c concordance) |
| `docs/incoming/arch-overhaul/spec_williams_trend_concordance.md` | WTC: Williams' test + concordance | IMPLEMENTED (backend + frontend + concordance UI). OM-only (spec says all continuous). |

### Tracking (stale — superseded by this hub)
| File | Role | Status |
|------|------|--------|
| `docs/incoming/arch-overhaul/implementation-plan-own-nst-wtc.md` | Phase A-F implementation roadmap | STALE — says "not started" but all phases complete. |
| `docs/incoming/arch-overhaul/spec-audit-findings.md` | Compliance audit | STALE — pre-implementation. |
| `docs/incoming/arch-overhaul/spec-cross-reference-map.md` | Spec dependency map | STALE — conflicts were resolved during implementation. |

### Research (reference — still valid)
| File | Role | Relevance |
|------|------|-----------|
| `docs/deep-research/dr-organ_weight_normalization_research_complete.md` | Scientific evidence foundation | All thresholds, tier boundaries, and organ categories trace to this. Still the definitive reference for *why* decisions were made. |
| `docs/deep-research/reproductive_organ_research.md` | Reproductive organ sub-categorization evidence | Foundation for AMD-001. Creasy 2013, estrous cycle CV data, magnitude floor rationale. |
| `docs/deep-research/brain-weights-thresholds.md` | Brain weight stability data | Species-specific brain tier thresholds. Still current. |

### Knowledge docs (local-only, gitignored)
| File | Entry | Current? |
|------|-------|----------|
| `docs/knowledge/methods.md` | METH-03a (normalization auto-selection) | Updated 2026-02-26. Phase 2 marked done. Integration points current. |
| `docs/knowledge/field-contracts.md` | FIELD-51 (NormalizationDecision), FIELD-52 (secondaryToBW) | Updated 2026-02-26. Consumers list current. |

### View specs (tracked in git)
| File | OM sections | Current? |
|------|-------------|----------|
| `docs/views/adverse-effects.md` | Rail indicator, OrganContextPanel panes, OM annotations, heatmap, override form | Yes — updated 2026-02-26. |
| `docs/views/dose-response.md` | Effect size chart metric subtitle | Yes — updated 2026-02-26. |

### System specs
| File | OM sections | Current? |
|------|-------------|----------|
| `docs/systems/data-pipeline.md` | OM pipeline, ANCOVA, Williams', normalization output fields | Yes — describes generator pipeline accurately. |
| `docs/systems/annotations.md` | normalization-overrides schema | Yes. |

### Implementation (code)
| File | Role |
|------|------|
| **Backend** | |
| `backend/services/analysis/normalization.py` | Python normalization decision engine |
| `backend/services/analysis/findings_om.py` | OM findings pipeline (metric-aware stats) |
| `backend/services/analysis/ancova.py` | ANCOVA computation |
| `backend/services/analysis/williams.py` | Williams' trend test |
| `backend/tests/test_normalization.py` | Backend normalization tests |
| `backend/tests/test_williams.py` | Backend Williams' tests |
| `backend/tests/test_ancova.py` | Backend ANCOVA tests |
| **Frontend** | |
| `frontend/src/lib/organ-weight-normalization.ts` | Decision engine, shared constants, helpers |
| `frontend/src/lib/endpoint-confidence.ts` | 5-dimension ECI, concordance, NOAEL weighting |
| `frontend/src/hooks/useOrganWeightNormalization.ts` | Study normalization hook (Phase 1 + 2 enrichment) |
| `frontend/src/hooks/useNormalizationOverrides.ts` | Override persistence hook |
| `frontend/src/components/analysis/panes/NormalizationHeatmap.tsx` | Organ x dose-group heatmap |
| `frontend/src/components/analysis/panes/OrganContextPanel.tsx` | Normalization pane + override form |
| `frontend/src/components/analysis/panes/FindingsContextPanel.tsx` | OM annotation, Williams', ANCOVA, ECI panes |
| `frontend/src/components/analysis/findings/FindingsRail.tsx` | Rail normalization indicator |
| `frontend/src/components/analysis/DoseResponseView.tsx` | Chart metric subtitle |
| **Frontend tests** | |
| `frontend/tests/organ-weight-normalization.test.ts` | 104 tests — decision engine |
| `frontend/tests/syndrome-normalization.test.ts` | 23 tests — syndrome integration |
| `frontend/tests/endpoint-confidence.test.ts` | 50 tests — ECI mechanisms |

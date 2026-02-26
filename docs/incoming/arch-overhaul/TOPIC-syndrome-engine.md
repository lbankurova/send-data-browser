# Topic Hub: Cross-Domain Syndrome Engine & Interpretation Layer

**Last updated:** 2026-02-26
**Overall status:** Fully shipped. Two detection engines (histopathology + cross-domain), 6-module interpretation pipeline, ECETOC scoring, translational confidence, organ proportionality, and restructured UI — all implemented and tested. A handful of ECETOC factors remain reserved pending external data sources.

---

## What Shipped

The syndrome engine is the largest frontend subsystem (~8,100 lines of library code, ~5,600 lines of components, ~3,000 lines of tests). Everything below is live in production.

### Two Detection Engines (by design, never merge)

| Engine | File | Lines | Rules | Input |
|--------|------|-------|-------|-------|
| Histopathology-specific | `syndrome-rules.ts` | 544 | 14 rules | `Map<organ, LesionSeverityRow[]>` |
| Cross-domain | `cross-domain-syndromes.ts` | 1,833 | 10 syndromes (XS01–XS10) | `EndpointSummary[]` spanning LB/BW/MI/MA/OM/CL |

**Histopathology engine** — 14 hardcoded pattern rules (testicular degeneration, hepatotoxicity classic, hepatocellular adaptation, nephrotoxicity tubular, CPN, bone marrow suppression, lymphoid depletion, GI toxicity, cardiac toxicity, adrenal hypertrophy, phospholipidosis, spontaneous cardiomyopathy, GI mucosal toxicity, injection site reaction). Strain suppressions (IMP-06b), sex filtering, route gates.

**Cross-domain engine** — 10 structured syndrome definitions with compound required logic (AND/OR/custom expressions), directional gates (REM-09), magnitude floors per endpoint class, ANCOVA integration, sex-divergent detection. Syndromes: Hepatocellular Injury (XS01), Cholestatic Injury (XS02), Nephrotoxicity (XS03), Myelosuppression (XS04), Hemolytic Anemia (XS05), Phospholipidosis (XS06), Immune Suppression (XS07), Stress Response (XS08), Wasting Syndrome (XS09), Cardiovascular Toxicity (XS10).

### Interpretation Layer (6 modules, 3,782 lines)

| Module | File | Lines | Key exports |
|--------|------|-------|-------------|
| Orchestrator | `syndrome-interpretation.ts` | 132 | Re-exports all; documents 18 approved spec deviations |
| Types & constants | `syndrome-interpretation-types.ts` | 823 | 17 types, discriminator registry (8 syndromes), CL correlates, canonical synonyms, SOC map |
| Certainty | `syndrome-certainty.ts` | 873 | `assessCertainty()`, `applyCertaintyCaps()` (5 caps), `evaluateDiscriminator()`, `evaluateUpgradeEvidence()` (UE-01–UE-08), `getEnzymeMagnitudeTier()` |
| ECETOC & severity | `syndrome-ecetoc.ts` | 902 | `computeTreatmentRelatedness()` (A-1–A-7), `computeAdversity()` (B-2–B-7), `deriveOverallSeverity()` (7-level cascade), mortality/tumor/food consumption context |
| Translational | `syndrome-translational.ts` | 612 | `interpretSyndrome()` main orchestrator, `assessTranslationalConfidence()`, SOC-level LR+ (5 species × 9 SOCs), 20+ PT-level entries, MedDRA v3.0 dictionary |
| Cross-reference | `syndrome-cross-reference.ts` | 540 | `crossReferenceHistopath()`, `assessSyndromeRecovery()`, `assessClinicalObservationSupport()`, `assembleStudyDesignNotes()` |

### Organ Proportionality (XS09)

`organ-proportionality.ts` (847 lines) — OPI = organ weight Δ% / body weight Δ%. Per-sex computation, MI concordance (6 types), 5-class OPI classification (proportionate/disproportionate/inverse/not_applicable/insufficient_data), sex-divergent pattern detection. Wired into XS09 wasting syndrome evidence pane.

### Supporting Engines

| Engine | File | Lines | Rules |
|--------|------|-------|-------|
| Lab-clinical catalog | `lab-clinical-catalog.ts` | 1,061 | 33 rules (L01–L31, L25a/b/c) |
| Clinical catalog (backend) | `clinical_catalog.py` | 436 | 15 rules (C01–C15) |
| Clinical findings pipeline | `findings_cl.py` | 142 | CL domain processing |
| Signal scoring | (in `insights-engine.md`) | — | Syndrome boost in signal formula |

### UI Components (5,596 lines)

| Component | File | Lines | Role |
|-----------|------|-------|------|
| SyndromeContextPanel | `panes/SyndromeContextPanel.tsx` | 2,563 | 8-pane interpretation display (restructured from 15 panes) |
| FindingsRail | `findings/FindingsRail.tsx` | 1,236 | Syndrome grouping mode, endpoint cards, normalization indicators |
| FindingsContextPanel | `panes/FindingsContextPanel.tsx` | 696 | Endpoint-level evidence with verdict, Williams', ANCOVA, ECI panes |
| FindingsView | `findings/FindingsView.tsx` | 469 | Master view container for adverse effects |
| FindingsQuadrantScatter | `findings/FindingsQuadrantScatter.tsx` | 187 | Dose-response × effect-size scatter |
| OrganContextPanel | `panes/OrganContextPanel.tsx` | 914 | Organ-level context with normalization, proportionality panes |

### Hooks

| Hook | File | Lines | Role |
|------|------|-------|------|
| useFindingsAnalyticsLocal | `hooks/useFindingsAnalyticsLocal.ts` | 217 | Orchestrates detection + interpretation, row mapping, normalization context |

### Tests (3,016 lines)

| File | Lines | Coverage |
|------|-------|----------|
| `syndromes.test.ts` | 337 | Core detection (histopathology + cross-domain matching) |
| `syndrome-integration.test.ts` | 349 | End-to-end pipeline (detection → interpretation → UI data) |
| `syndrome-interpretation.test.ts` | 1,689 | Certainty grading, discriminators, ECETOC factors, severity cascade |
| `syndrome-normalization.test.ts` | 641 | Normalization integration, OPI classification |

### Key Commits (chronological)

| Commit | Description |
|--------|-------------|
| `11ef91d` | Pattern classification, confidence scoring & concordant syndrome detection |
| `3ec37ec` | Sex-filtered evaluation, strain awareness, new syndromes (IMP-06) |
| `efd0227` | Findings view Phase 2 — coherence, signal tiers, cross-domain syndromes |
| `f891c63` | Findings Phase 3 — lab-clinical catalog, enhanced signal score, verdict card |
| `5a89603` | XS10 cardiovascular syndrome + translational confidence scoring |
| `f44a5d6` | Wire MedDRA v3.0 dictionary into translational confidence scoring |
| `c3b643c` | ECETOC treatment-relatedness, adversity scoring, and severity cascade |
| `398b1bb`–`1d5051d` | Sprint 0–4 scientific logic remediation (REM-01 through REM-22) |
| `594e93b` | 8 tests for per-organ stats, cross-sex FC, discriminator, REM-06 |
| `bbafbfe` | Magnitude floors v0.2.0 + JT trend test (REM-27, REM-29) |
| `e1b5db9` | Tiered liver enzyme floors + certainty upgrade evidence (PATCH-01/04) |
| `aa8e62b` | Restructure SyndromeContextPanel — 15 panes to 8, severity header, FC redesign |
| `afadcd2` | XS09 organ proportionality index (OPI) analysis |
| `67b825c` | Per-organ magnitude floors, estrous detection, XS08 B-7 gate |
| `3b6bf66` | Refactor: split syndrome-interpretation into 5 focused modules |
| `909e3ad` | SE-8/SE-7/SE-1 OM directional gates with ANCOVA awareness |

---

## What's NOT Shipped (spec vs. reality)

### Reserved ECETOC factors (data-dependent)

| Factor | Name | Reason not implemented |
|--------|------|------------------------|
| A-3 | HCD comparison | Requires historical control database — no data source available |
| A-4 | Temporal onset (general) | Only FC temporal ordering implemented; general needs time-course infrastructure |
| A-5 | Mechanism plausibility | Needs external MOA database or manual annotation |
| B-2 | Stress confound (general) | XS08 overlap check exists; general cross-syndrome interference not built |
| B-6 | Precursor to worse (general) | Tumor progression wired; non-tumor adaptive→adverse progression not built |

### Minor gaps

| Item | Status |
|------|--------|
| Organ-calibrated magnitude floors for reproductive organs | Generic floors apply; prostate ≥1.0, ovary/uterus ≥1.5 not in syndrome engine |
| Histopathology syndrome dedicated panel | Results inline in HistopathologyView — no standalone panel |
| Protective syndromes (R18/R19) | Research document exists (`protective-syndromes-research-NOT-IN-SCOPE-YET.md`); not implemented |

---

## Roadmap

### Near-term (nice-to-have)
- Organ-calibrated magnitude floors for reproductive organs (prostate, ovary, uterus)
- A-4 temporal onset via food consumption time-course data (partial infrastructure exists)

### Medium-term
- A-3 HCD comparison (requires historical control database integration)
- General B-2 cross-syndrome stress confound detection
- General B-6 adaptive→adverse progression (beyond tumor)

### Long-term
- A-5 mechanism plausibility (external MOA database)
- Protective syndromes R18/R19 (adaptive non-adverse, incidental protective, on-mechanism beneficial)
- Histopathology syndrome dedicated panel (currently inline)

---

## File Map

### Specifications (historical)

| File | Role | Status |
|------|------|--------|
| `docs/incoming/arch-overhaul/syndrome-context-panel.md` | UI component spec (original, 8 panes) | IMPLEMENTED |
| `docs/incoming/arch-overhaul/syndrome-context-panel-restructure-spec.md` | v2.0: 15→8 pane restructure | SUPERSEDED by v3.0 |
| `docs/incoming/arch-overhaul/syndrome-context-panel-restructure-spec-v2.md` | v3.0: refined verdict badges, decision points | IMPLEMENTED |
| `docs/incoming/arch-overhaul/syndrome-context-panel-implementation-analysis.md` | 12 decision points resolved, gap analysis | IMPLEMENTED |
| `docs/incoming/arch-overhaul/food-consumption-pane-spec-v2.md` | FC pane within SyndromeContextPanel | IMPLEMENTED |
| `docs/incoming/arch-overhaul/multi-domain-integration-spec.md` | Multi-domain data pipeline feeding detection | IMPLEMENTED |
| `docs/incoming/arch-overhaul/archive/syndrome-interpretation-layer-spec.md` | Post-detection interpretive enrichment (7 components) | ARCHIVED — superseded by modular implementation |
| `docs/incoming/arch-overhaul/archive/translational-confidence-spec.md` | LR+ scoring by species/SOC (rev 2) | ARCHIVED — integrated into `syndrome-translational.ts` |
| `docs/incoming/arch-overhaul/archive/syndrome-matching-fix-spec.md` | Substring matching false-positive bug fix | ARCHIVED — fix applied |

### Tracking (stale)

| File | Role | Status |
|------|------|--------|
| `docs/incoming/arch-overhaul/syndrome-context-panel-implementation-analysis.md` | Implementation decision tracker | STALE — all decisions resolved, implementation complete |

### Research (reference — still valid)

| File | Relevance |
|------|-----------|
| `docs/deep-research/lab-clinical-significance-thresholds.md` | Clinical significance thresholds for LB-based syndrome endpoints |
| `docs/knowledge/protective-syndromes-research-NOT-IN-SCOPE-YET.md` | R18/R19 protective syndrome patterns (future) |
| `docs/incoming/arch-overhaul/concordance-sources (1).xlsx` | Translational confidence source catalog (9 sources, availability matrix) |

### Knowledge docs

| File | Entry | Current? |
|------|-------|----------|
| `docs/knowledge/syndrome-engine-reference.md` | Auto-generated catalog: 10 syndromes, 13 magnitude floor classes, 5 directional gates, 8 discriminators | Yes — regenerated 2026-02-26 |
| `docs/knowledge/methods-index.md` | METH-14 (cross-domain detection), METH-15 (compound expression evaluator), CLASS-09 (syndrome confidence) | Yes |
| `docs/knowledge/field-contracts-index.md` | FIELD-01 (overallSeverity), FIELD-18 (requiredMet), FIELD-19 (domainsCovered), FIELD-20 (supportScore) | Yes |

### View specs

| File | Syndrome sections | Current? |
|------|-------------------|----------|
| `docs/views/adverse-effects.md` | §4 SyndromeContextPanel: 8-pane structure, verdict lines, data dependency | Yes |
| `docs/views/histopathology.md` | §71 syndrome badge display, signal scoring syndrome boost | Yes |

### System specs

| File | Syndrome sections | Current? |
|------|-------------------|----------|
| `docs/systems/insights-engine.md` | Syndrome boost in signal scoring formula, R01–R17 rule integration | Yes |
| `docs/systems/data-pipeline.md` | Unified findings pipeline, endpoint summary generation | Yes |

### Implementation (code)

**Backend (2 files, 578 lines)**

| File | Lines | Role |
|------|-------|------|
| `backend/services/analysis/clinical_catalog.py` | 436 | C01–C15 clinically significant finding patterns |
| `backend/services/analysis/findings_cl.py` | 142 | CL domain processing pipeline |

**Frontend — library (10 files, 8,167 lines)**

| File | Lines | Role |
|------|-------|------|
| `src/lib/syndrome-rules.ts` | 544 | Histopathology detection engine (14 rules) |
| `src/lib/cross-domain-syndromes.ts` | 1,833 | Cross-domain detection engine (XS01–XS10) |
| `src/lib/syndrome-interpretation.ts` | 132 | Orchestrator barrel + spec deviation docs |
| `src/lib/syndrome-interpretation-types.ts` | 823 | Shared types, discriminator registry, CL correlates |
| `src/lib/syndrome-certainty.ts` | 873 | Certainty grading, caps, upgrade evidence |
| `src/lib/syndrome-ecetoc.ts` | 902 | ECETOC A/B-factors, mortality, tumor, food consumption, severity |
| `src/lib/syndrome-translational.ts` | 612 | LR+ concordance, MedDRA v3.0, main `interpretSyndrome()` |
| `src/lib/syndrome-cross-reference.ts` | 540 | Histopath cross-ref, recovery, CL correlation, study design |
| `src/lib/organ-proportionality.ts` | 847 | OPI computation, classification, sex divergence |
| `src/lib/lab-clinical-catalog.ts` | 1,061 | 33 lab-clinical rules (L01–L31) |

**Frontend — hooks (1 file, 217 lines)**

| File | Lines | Role |
|------|-------|------|
| `src/hooks/useFindingsAnalyticsLocal.ts` | 217 | Detection + interpretation orchestration |

**Frontend — components (6 files, 5,596 lines)**

| File | Lines | Role |
|------|-------|------|
| `src/components/analysis/panes/SyndromeContextPanel.tsx` | 2,563 | 8-pane syndrome interpretation display |
| `src/components/analysis/findings/FindingsRail.tsx` | 1,236 | Syndrome grouping, endpoint cards |
| `src/components/analysis/panes/OrganContextPanel.tsx` | 914 | Organ-level context with OPI pane |
| `src/components/analysis/panes/FindingsContextPanel.tsx` | 696 | Endpoint evidence, verdict, Williams', ANCOVA |
| `src/components/analysis/findings/FindingsView.tsx` | 469 | Master view container |
| `src/components/analysis/findings/FindingsQuadrantScatter.tsx` | 187 | Dose-response scatter plot |

**Frontend — tests (4 files, 3,016 lines)**

| File | Lines | Coverage |
|------|-------|----------|
| `tests/syndrome-interpretation.test.ts` | 1,689 | Certainty, discriminators, ECETOC, severity |
| `tests/syndrome-normalization.test.ts` | 641 | Normalization integration, OPI |
| `tests/syndrome-integration.test.ts` | 349 | End-to-end pipeline |
| `tests/syndromes.test.ts` | 337 | Core detection |

**Totals: 23 files, ~17,574 lines**

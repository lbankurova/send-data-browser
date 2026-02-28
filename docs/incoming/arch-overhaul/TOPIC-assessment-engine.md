# TOPIC Hub: Assessment Engine — Regulatory Alignment & Roadmap

**Created:** 2026-02-28 | **Updated:** 2026-02-28 (Tiers 1+2 shipped, Briefs 1/2/4/5/6 incorporated)
**Source material:**
- `docs/deep-research/reg-standards-for-auto-tox-finding-assessment.md` — Regulatory standards audit (7 domains)
- `docs/deep-research/github-repos-overlay-tox-assessment.md` — Open-source landscape (27 repos, build vs. leverage)
- `docs/deep-research/send_browser_source_catalog.xlsx` — 7-sheet workbook (repos, sources, roadmap, action items, PT data)
- `docs/deep-research/engine/brief 1/` — Organ-specific HCD variability & magnitude thresholds (13 organs, 12 sources, JSON config)
- `docs/deep-research/engine/brief 2/` — Non-liver adaptive response classification rules (5 decision trees)
- `docs/deep-research/engine/brief 4/` — NTP CEBS historical control data profiling (DTT IAD discovery, phased A→B approach)
- `docs/deep-research/engine/brief 5/` — GRADE temporal dimension design decision (merge, not standalone)
- `docs/deep-research/engine/brief 6/` — 14 non-tumor progression chains for ECETOC B-6 factor encoding

**Related TOPIC hubs:** TOPIC-syndrome-engine, TOPIC-noael-determination, TOPIC-organ-measurements, TOPIC-data-pipeline

---

## 1. Executive Summary

The deep-research documents propose a **four-phase assessment engine overhaul** grounded in the ECETOC TR 085 two-step adversity framework, organ-specific regulatory thresholds, GRADE-adapted confidence scoring, and cross-domain concordance detection. The system already implements more of this than the research anticipated — the organ weight normalization engine (Bailey 2004 categories, 4-tier BW effects, ANCOVA decomposition) and the cross-domain syndrome engine (10 syndromes with compound logic) are production-quality.

**Tier 1 shipped** (commit `f6c195d`, 2026-02-28): The foundational split-brain problem is resolved. Backend `assess_finding()` implements per-finding ECETOC assessment producing five-category `finding_class` (not_treatment_related / tr_non_adverse / tr_adaptive / tr_adverse / equivocal). Intrinsic adversity dictionary (`shared/adversity-dictionary.json`) auto-classifies necrosis, fibrosis, neoplasia. NOAEL derivation consumes `finding_class` via `_is_loael_driving()`. 1025 tests pass.

**Tier 2 shipped** (2026-02-28): Two-gate OM classification (statistical gate + organ-specific magnitude gate) replaces uniform Cohen's d thresholds. 13-organ threshold config (`shared/organ-weight-thresholds.json`) with species-specific adrenal thresholds. 6 adaptive decision trees (liver, thyroid, adrenal, thymus/spleen, kidney, gastric) evaluate context-dependent MI findings using `ConcurrentFindingIndex`. "Adaptive" never claimed from magnitude alone — requires biological evidence from concurrent findings. Species threaded through entire pipeline.

**Bottom line:** The system is ~90% through Phase 0 and ~85% through Phase 1. Research is complete for all six briefs. Tier 2C (Hall 2012 liver panel) and Tier 3A (HCD Phase 1, SD rat static ranges) are shipped. The heaviest remaining implementation work is: (1) B-6 progression chains (Brief 6, 14 chains ready for YAML), (2) HCD Phase 2 (SQLite from DTT IAD), and (3) GRADE confidence scoring extensions.

---

## 2. Gap Analysis: Research Roadmap vs. Current Implementation

### Phase 0 — Fix Foundational Errors

| Roadmap Item | Status | Current State | Gap |
|---|---|---|---|
| **Statistical screening as flagging only** | ~~DONE~~ | Backend `assess_finding()` treats statistics as one input to A-factor scoring (A-6), not as adversity output. `finding_class` replaces crude 3-category classification for NOAEL derivation. | None — `_is_loael_driving()` uses `finding_class` with legacy fallback. Shipped `f6c195d`. |
| **Five-category taxonomy** | ~~DONE~~ | Backend `finding_class` field: not_treatment_related / tr_non_adverse / tr_adaptive / tr_adverse / equivocal. Applied to ALL findings, not just syndrome-matched. Frontend type updated. | None — shipped `f6c195d`. |
| **Intrinsic adversity dictionary** | ~~DONE~~ | `shared/adversity-dictionary.json`: 3 tiers (always_adverse: 10 terms, likely_adverse: 6, context_dependent: 5). Consumed by `adversity_dictionary.py` in Step 0 of `assess_finding()`. | None — shipped `f6c195d`. |
| **Organ-specific normalization** | DONE | `normalization.py` + `organ-weight-normalization.ts`: Bailey 2004 categories (8 organ groups), 4 BW-effect tiers, 12 species/strain profiles, ANCOVA at Tier 3-4, brain-ratio for weak_bw organs. | None — this is fully implemented. |
| **Organ-specific magnitude thresholds** | ~~DONE~~ | Two-gate OM classification: statistical gate (p < 0.05) + magnitude gate (pct_change >= organ threshold from `shared/organ-weight-thresholds.json`). 13 organs, species-specific for adrenal. | None — shipped. `_assess_om_two_gate()` in `classification.py`, `organ_thresholds.py` lazy-loaded config. |

### Phase 1 — Build Core Assessment Layers

| Roadmap Item | Status | Current State | Gap |
|---|---|---|---|
| **ECETOC Step 1 (treatment-relatedness)** | 4/7 factors | A-1 dose-response (0-2pts) ✓, A-2 concordance via `corroboration_status` (0-1pt) ✓, A-6 statistics (0-1pt) ✓, A-7 clinical obs ✓. A-3 HCD reserved, A-4 temporal partial (food only), A-5 mechanism missing. | A-3 is the biggest gap — no HCD database. **Brief 4 completed:** phased approach — Option A (static SD/Wistar ranges from Envigo+Inotiv, 2 weeks) → Option B (SQLite from NTP DTT IAD 78 MB Excel, 6 weeks). Option C (sendigR) eliminated — doesn't support OM domain. A-5 requires MOA annotations. A-4: **Brief 5 decided** onset-timing modifier for BW/CL goes into DR quality, not A-4. |
| **ECETOC Step 2 (adversity)** | 6/7 factors | B-2 adaptive: intrinsic adversity dict ✓ + 6 adaptive decision trees ✓ (liver, thyroid, adrenal, thymus/spleen, kidney, gastric), B-3 reversibility ✓, B-4 magnitude ✓, B-5 cross-domain ✓, B-7 secondary ✓. B-6 precursor partial (tumors only). | **Brief 6 completed:** 14 organ-specific progression chains ready for YAML encoding (liver neoplastic, kidney CPN, kidney α2u-globulin, thyroid, adrenal medulla, testis, lung, forestomach, urinary bladder, mammary gland, pancreas, nasal cavity, liver fibrosis, heart cardiomyopathy). Each has severity triggers, species/strain specificity, spontaneous rates, time dependency. Adaptive trees shipped — `adaptive_trees.py` (723L), `ConcurrentFindingIndex` (155L). |
| **Cross-domain concordance** | DONE (mostly) | 10 syndromes (XS01-XS10), shared definitions, frontend full scoring with compound logic + directional gates + magnitude floors. Backend corroboration_status **now consumed** by NOAEL (via `assess_finding()` A-2 factor) and classification. | Backend corroboration still lacks compound logic/directional gates/magnitude floors (frontend-only). |
| **Per-sex assessment** | DONE | All analyses per-sex. NOAEL provides M/F/Combined. Sex divergence detection and display. Separate narratives when divergent. | Missing: sex-dimorphism mechanism flags (α2u nephropathy, CYP differences). min(M,F) has no exceptions — always conservative. **Brief 1** documents α2u-globulin flag for male rat kidney — ready for implementation. |
| **Liver hypertrophy decision tree** | ~~DONE~~ | Full Hall 2012 tree in `_tree_liver()`: 9-marker LB panel check (ALT/AST/ALP/GGT/BILI/CHOL/BILEAC/TP/ALB), min 5 clean, ALT+AST critical, any significant change = not clean (catches both ↑ and ↓), per-marker detail in annotations. Config in `organ-weight-thresholds.json`. | None — shipped. Frontend XS01 adaptive check remains as the simpler syndrome-level counterpart (different abstraction layer). |

### Phase 2 — Advanced Integration

| Roadmap Item | Status | Current State | Gap |
|---|---|---|---|
| **NOAEL proposal engine** | ~~DONE~~ | Backend NOAEL **now consumes** `finding_class` via `_is_loael_driving()`. Treatment-related-non-adverse findings no longer constrain NOAEL. Corroboration penalty (-0.15 confidence) when ALL adverse findings at LOAEL are uncorroborated. Derivation trace includes `finding_class`, `corroboration_status`, `classification_method`. | No structured justification package (export/PDF). Shipped `f6c195d`. |
| **GRADE confidence scoring** | PARTIAL | ECI 5-dimension (statistical, biological, dose-response, trend validity, trend concordance) with integrated=min(all). Frontend endpoint confidence (HIGH/MODERATE/LOW). | **Brief 5 decided:** temporal is NOT a standalone dimension. Merge on-dose adaptation into B-3 (3-tier reversibility). Add onset-timing modifier into DR quality for BW/CL. Missing: HCD position, consistency (cross-sex/cross-study). |
| **HCD integration** | **Phase 1 DONE** | SD rat static ranges (Envigo C11963, 10 organs × 2 sexes × 2 durations). A-3 factor active for OM findings. PointCross: 2 findings reclassified. | Phase 1+ (Wistar Han), Phase 2 (SQLite from DTT IAD) not yet implemented. |
| **BMD module** | MISSING | No benchmark dose computation. | pybmds (R20, public domain) is pip-installable. Low complexity integration for optional BMD alongside NOAEL. |

### Phase 3 — Polish & Differentiate

| Roadmap Item | Status | Current State | Gap |
|---|---|---|---|
| **Pharmacological class context** | MISSING | No MOA database, no compound class metadata input. Syndrome detection acts as implicit proxy. | Would require compound class as study-level annotation (TSPARMCD in TS domain). Known class effects modulate plausibility. |
| **BW confounding detection** | DONE | BW-effect tiers, ANCOVA with effect decomposition, `assessSecondaryToBodyWeight()`, ECETOC B-7 factor. | None — well implemented. |
| **Expert review package** | MISSING | No structured PDF/HTML output. All assessment viewed in-app only. | Would need PDF/HTML report generation with finding table, concordance map, NOAEL proposal, confidence scores. |

---

## 3. Results Analysis: Strengths, Architectural Risks, and Strategic Gaps

### 3.1 Strengths — What's Already Better Than Research Expected

The research documents (especially the GitHub repos overlay) position the system's domain as "complete gaps" in open source. In fact, the system has built several of these from scratch:

1. **Organ weight normalization engine** — Bailey 2004 organ categories, 4-tier BW-effect classification, ANCOVA decomposition with direct/indirect effect separation, Williams' step-down trend test, 12 species/strain brain tier profiles, reproductive organ sub-categorization. The research roadmap puts this as Phase 0 priority; it's already done.

2. **Cross-domain syndrome detection** — 10 syndromes with compound required logic, directional gates, magnitude floors, endpoint class floors. Two-layer architecture (backend presence-based, frontend full scoring). Shared JSON definitions consumed by both Python and TypeScript.

3. **ECETOC framework partial implementation** — `syndrome-ecetoc.ts` (902 lines) implements the two-step structure with factor-by-factor reasoning traces. This is the exact architecture the research proposes.

4. **Statistical test suite** — Dunnett's (FWER-controlled), Williams' (with isotonic regression and critical value tables), JT trend, ANCOVA, Fisher's exact, Cochran-Armitage, Hedges' g. This is more comprehensive than what ToxicR (R22) provides in a single package.

5. **Per-sex analysis with divergence detection** — All pipelines run per-sex independently. NOAEL provides M/F/Combined. Sex divergence detected and narrated separately in the UI.

6. **Finding nature classification** — `finding-nature.ts` classifies histopathology findings into 7 biological nature categories with severity-modulated reversibility timelines. This is a building block toward the intrinsic adversity dictionary.

### 3.2 Architectural Risks — Split-Brain Problem ✅ RESOLVED

> **Shipped `f6c195d`:** The split-brain is fixed. Backend `assess_finding()` implements per-finding ECETOC assessment for ALL findings. NOAEL consumes `finding_class`. See Tier 1 above for details.

**Remaining architectural note:** Two ECETOC assessment layers now coexist by design:
- **Backend** (`classification.py` → `assess_finding()`): Per-finding floor. Uses available evidence (statistics, magnitude, corroboration, intrinsic adversity) without syndrome context. Produces `finding_class`.
- **Frontend** (`syndrome-ecetoc.ts` → `computeAdversity()`): Per-syndrome ceiling. Uses full syndrome context (compound required logic, directional gates, cross-domain concordance). Produces `adversity` on `SyndromeResult`.

This is intentional — the frontend can upgrade/downgrade from the backend assessment when richer syndrome context is available. The backend provides the baseline that drives NOAEL; the frontend provides the nuanced view for expert review.

### 3.3 Strategic Gaps — What Can't Be Fixed Without External Data

Three gaps require external data sources, not just code changes:

1. **Historical control data (A-3):** **Research complete (Brief 4).** NTP DTT IAD (78 MB Excel, 14+ strains, 40+ tissues) is the key resource. Phased approach: static JSON ranges first (Envigo SD + Inotiv Wistar Han 700-study HCD), then SQLite from DTT IAD. Without HCD, the system cannot distinguish treatment-related from spontaneous high-background findings (e.g., F344 rat MCL, pituitary adenoma, CPN). This is a data integration project.

2. **Pharmacological class context (A-5):** Requires compound class metadata. Could be added as a TS domain annotation (TSPARMCD = "STYPE" or custom qualifier). Without it, the system cannot assess mechanism plausibility for known class effects (PPARα agonist → liver weight expected, immunosuppressant → lymphoid depletion expected).

3. **PT-level concordance data:** The xlsx's "Interim PT Data" sheet has 48 endpoint-level LR+ values from Liu & Fan 2026 (bioRxiv). The supplementary tables (850 identical-term + 2,833 cross-term pairs) are not yet public. Clark 2018 (CC-BY, open access) is the available fallback for SOC-level concordance.

---

## 4. File Map

### Backend Assessment Logic
| File | Lines | Role |
|---|---|---|
| `backend/services/analysis/classification.py` | ~668 | 3-category severity, dose-response pattern, treatment-relatedness (A-3 HCD), **`assess_finding()` ECETOC per-finding assessment**, two-gate OM with HCD modifier (`_assess_om_two_gate`), adaptive tree dispatch (`assess_finding_with_context`) |
| `backend/services/analysis/adversity_dictionary.py` | ~55 | Intrinsic adversity lookup from shared JSON |
| `backend/services/analysis/organ_thresholds.py` | ~154 | Lazy-loaded organ threshold config + species resolver |
| `backend/services/analysis/hcd.py` | ~289 | HCD reference ranges (A-3): HcdRangeDB lazy-loaded singleton, assess_a3(), strain/duration TS extraction |
| `shared/hcd-reference-ranges.json` | ~63 | SD rat organ weight reference ranges (Envigo C11963, 10 organs × 2 sexes × 2 durations) |
| `backend/services/analysis/concurrent_findings.py` | ~158 | ConcurrentFindingIndex for cross-finding queries (is_lb_marker_clean: any significant change = not clean) |
| `backend/services/analysis/adaptive_trees.py` | ~740 | 6 adaptive decision trees (liver/Hall 2012 panel, thyroid, adrenal, thymus/spleen, kidney, gastric) |
| `backend/services/analysis/corroboration.py` | ~230 | Presence-based cross-domain syndrome matching, quality gate |
| `backend/services/analysis/findings_pipeline.py` | ~315 | Shared enrichment: classification, fold change, corroboration, ConcurrentFindingIndex, assess_finding_with_context (strain + duration threading) |
| `backend/services/analysis/findings_om.py` | ~400 | Organ weight domain: 3 metrics, normalization selection, Williams' |
| `backend/services/analysis/normalization.py` | ~350 | Bailey 2004 organ categories, BW-effect tiers, metric selection |
| `backend/services/analysis/ancova.py` | ~300 | ANCOVA: LS means, pairwise, slope homogeneity, effect decomposition |
| `backend/services/analysis/williams.py` | ~400 | Williams' step-down with isotonic regression, critical value tables |
| `backend/services/analysis/statistics.py` | ~500 | Dunnett's, Welch, JT, Fisher's, Cochran-Armitage, Hedges' g |
| `backend/services/analysis/insights.py` | ~535 | Per-finding context pane insights (A1-E4), organ-specific C4 threshold |
| `backend/services/analysis/clinical_catalog.py` | ~300 | 15 clinical significance patterns (C01-C15), 7 protective exclusions |
| `backend/services/analysis/mortality.py` | ~200 | DS/DD parsing, mortality LOAEL, NOAEL cap, early-death subjects |
| `backend/services/analysis/correlations.py` | ~200 | Residualized Spearman correlations within organ systems |
| `backend/generator/scores_and_rules.py` | ~600 | 19 rules (R01-R19), suppression logic, clinical catalog post-pass |
| `backend/generator/view_dataframes.py` | ~800 | Signal scoring, NOAEL summary, target organ summary, view assembly |
| `backend/generator/generate.py` | ~500 | Pipeline orchestration (5 phases) |
| `backend/services/analysis/unified_findings.py` | ~244 | On-demand unified findings with deterministic IDs, species threading |
| `shared/syndrome-definitions.json` | ~600 | 10 syndrome definitions (XS01-XS10) consumed by Python + TypeScript |
| `shared/adversity-dictionary.json` | ~65 | 3-tier intrinsic adversity dictionary (21 terms) |
| `shared/organ-weight-thresholds.json` | ~116 | 13-organ species-specific thresholds (variation ceiling, adverse floor, strong adverse) |

### Frontend Assessment Logic
| File | Lines | Role |
|---|---|---|
| `frontend/src/lib/syndrome-ecetoc.ts` | ~900 | ECETOC two-step framework: treatment-relatedness + adversity |
| `frontend/src/lib/cross-domain-syndromes.ts` | ~1180 | Full syndrome scoring: compound logic, directional gates, magnitude floors |
| `frontend/src/lib/syndrome-rules.ts` | ~540 | Histopathology-specific syndromes (14 rules) |
| `frontend/src/lib/finding-nature.ts` | ~150 | 7 biological nature categories + reversibility |
| `frontend/src/lib/protective-signal.ts` | ~200 | 3-tier protective signal classification |
| `frontend/src/lib/endpoint-confidence.ts` | ~350 | ECI 5-dimension confidence + NOAEL contribution weights |
| `frontend/src/lib/severity-colors.ts` | ~200 | Severity/signal color scales |
| `frontend/src/lib/organ-weight-normalization.ts` | ~990 | Full normalization engine (mirrors backend) |
| `frontend/src/lib/organ-proportionality.ts` | ~200 | OPI for wasting syndrome |
| `frontend/src/lib/noael-narrative.ts` | ~200 | Structured NOAEL narratives |
| `frontend/src/lib/derive-summaries.ts` | ~400 | Endpoint summaries, per-sex breakdowns, NOAEL tiers |
| `frontend/src/lib/findings-rail-engine.ts` | ~250 | Signal scoring with syndrome/coherence boosts |

### Validation Engine (separate system — data conformance, not assessment)
| File | Lines | Role |
|---|---|---|
| `backend/validation/engine.py` | ~300 | Two-engine architecture (CDISC CORE + custom rules) |
| `backend/validation/rules/study_design.yaml` | ~100 | 7 rules (SD-001 to SD-007) |
| `backend/validation/rules/fda_data_quality.yaml` | ~100 | 7 rules (FDA-001 to FDA-007) |
| `backend/validation/checks/study_design.py` | ~300 | Study design check handler |
| `backend/validation/checks/fda_data_quality.py` | ~400 | FDA data quality check handler |

### Knowledge Docs
| File | Role |
|---|---|
| `docs/knowledge/species-profiles.md` | 5 species, 8 strains, biomarker lists |
| `docs/knowledge/vehicle-profiles.md` | 9 vehicles, 6 routes, confound matrix |
| `docs/knowledge/methods-index.md` | 13 tests, 32 methods, 27 algorithms |
| `docs/knowledge/field-contracts-index.md` | 60 computed field contracts |

---

## 5. Suggested Implementation Roadmap

### Priority Tier 1 — Fix the Split-Brain (Foundation) ✅ SHIPPED

> **Commits:** `f6c195d` (implementation), `d338e19` (tests + docs) — 2026-02-28
> **Test coverage:** 22 dedicated assertions in `frontend/tests/finding-class.test.ts`, 1025 total tests pass
> **PointCross distribution:** 226 not_treatment_related, 101 tr_adverse, 45 equivocal, 24 tr_non_adverse

#### 1A. Per-Finding ECETOC Assessment ✅
- `assess_finding()` in `classification.py`: 3-step assessment (intrinsic override → A-factor TR → B-factor adversity)
- A-factors scored: A-1 dose-response (0-2pts), A-2 concordance via corroboration_status (0-1pt), A-6 statistics (0-1pt); ≥1.0 = treatment-related
- B-factors applied: dictionary override → large magnitude (|d|≥1.5) → context-dependent check → moderate+corroborated → small effect → equivocal fallback
- Pipeline integration: `_assess_all_findings()` runs AFTER `compute_corroboration()` in `process_findings()`

#### 1B. Intrinsic Adversity Dictionary ✅
- `shared/adversity-dictionary.json`: 3 tiers (always_adverse: 10 terms, likely_adverse: 6, context_dependent: 5)
- `backend/services/analysis/adversity_dictionary.py`: lazy-loaded, substring matching, priority ordering
- Step 0 in `assess_finding()`: always_adverse + any signal → tr_adverse; always_adverse + no signal → equivocal

#### 1C. Corroboration Wired into NOAEL ✅
- `_is_loael_driving(finding)`: uses `finding_class == "tr_adverse"`, falls back to `severity == "adverse"` when absent
- Replaced 4 `severity == "adverse"` checks in `build_noael_summary()`
- Corroboration penalty: -0.15 confidence when ALL adverse findings at LOAEL are uncorroborated
- R04 annotated with `finding_class` and `finding_class_disagrees` flag (40/141 disagree in PointCross)

### Priority Tier 2 — Organ-Specific Thresholds & Non-Liver Adaptive Trees ✅ SHIPPED

> **Shipped:** 2026-02-28
> **New files (Tier 2):** `shared/organ-weight-thresholds.json` (116L), `backend/services/analysis/organ_thresholds.py` (154L), `backend/services/analysis/concurrent_findings.py` (155L), `backend/services/analysis/adaptive_trees.py` (723L)
> **New files (Tier 3A):** `shared/hcd-reference-ranges.json` (63L), `backend/services/analysis/hcd.py` (289L)
> **Modified files:** `classification.py` (295→668L), `findings_pipeline.py` (267→315L), `insights.py` (523→535L), `domain_stats.py` (383→391L), `unified_findings.py` (240→248L), `analysis.ts` (328→368L)
> **Test coverage:** 30 new assertions in `frontend/tests/organ-thresholds.test.ts`, updated `finding-class.test.ts`

#### 2A. Organ-Specific Magnitude Thresholds ✅

Two-gate OM classification replaces uniform Cohen's d thresholds. Each OM finding evaluated by two independent gates:
- **Statistical gate:** p < 0.05 from pairwise comparison
- **Magnitude gate:** pct_change >= organ-specific threshold from `shared/organ-weight-thresholds.json`

13 organs with species-specific thresholds (adrenal: rat 15% / mouse 25%):

| Organ | Variation Ceiling | Adverse Floor | Strong Adverse | Species-Specific? | CV Range |
|---|---|---|---|---|---|
| Liver | 10% | 15% | 20% | No | 8-18% |
| Heart | 8% | 8% | 15% | No | 5-12% |
| Kidney | 10% | 10% | 15% | No | 8-16% |
| Adrenal | 15% (rat) / 25% (mouse) | 15% / 25% | 25% / 40% | **Yes** | 5-51% |
| Thyroid | 10% | 10% | 20% | No | 10-20% |
| Testes | 10% | 10% | 15% | No | 5-20% |
| Spleen | 15% | 15% | 25% | No | 12-30% |
| Thymus | 15% | 15% | 25% | No | 15-40% |
| Brain | 5% | any_significant | 5% | No | 3-6% |
| Ovaries | 20% | 20% | 30% | No | 15-40% |
| Epididymides | 10% | 10% | 15% | No | 6-15% |
| Prostate | 15% | 15% | 25% | No | 10-30% |
| Uterus | 25% | 25% | 40% | No | 25-60% |

**Implementation:** `_assess_om_two_gate()` and `_compute_pct_change()` in `classification.py`. `organ_thresholds.py` lazy-loads config with species resolver. `insights.py` C4 insight uses organ-specific threshold. Frontend types: `_assessment_detail` on `DoseResponseRow`.

#### 2B. Non-Liver Adaptive Decision Trees (ECETOC B-2 Extension) ✅

6 adaptive decision trees implemented in `adaptive_trees.py` (723L), evaluating context-dependent MI findings via `ConcurrentFindingIndex` (155L):

| Tree | Organ/Finding | Key Discrimination | Adaptive→Adverse Boundary |
|---|---|---|---|
| LIVER | Hepatocellular hypertrophy | Enzyme induction vs hepatotoxicity | Necrosis/fibrosis concurrent; enzyme fold ≥5.0 |
| THYROID | Follicular hypertrophy/hyperplasia | Enzyme induction (liver axis) vs direct thyroid toxicant | Hyperplasia without liver correlation; follicular adenoma |
| ADRENAL | Cortical hypertrophy | Stress/ACTH-mediated (B-7) vs direct toxicity | Zona-specific necrosis; concurrent vacuolation+weight loss |
| THYMUS_SPLEEN | Lymphoid depletion/atrophy | Stress lymphocytolysis vs immunotoxicity (ICH S8) | Functional immune impairment; concurrent infections |
| KIDNEY | Tubular hypertrophy/basophilia/vacuolation | Adaptive enzyme induction vs tubular injury; α2u-globulin | Concurrent degeneration/necrosis/regeneration |
| GASTRIC | Forestomach/glandular changes | Local irritation (adaptive) vs tissue destruction | Erosion/ulceration; glandular necrosis |

**Key design constraint:** "Adaptive" never claimed from magnitude alone — requires biological evidence from concurrent findings. `ConcurrentFindingIndex` provides cross-finding queries across all domains for the same study. Species threaded through pipeline for species-specific rules (e.g., adrenal mouse vs rat thresholds, male rat α2u-globulin). Frontend type: `_tree_result` on `DoseResponseRow`.

**Pipeline integration:** `assess_finding_with_context()` in `classification.py` wraps `assess_finding()` + adaptive tree evaluation. Called from `findings_pipeline.py` after `ConcurrentFindingIndex` construction.

#### 2C. Full Liver Hypertrophy Decision Tree (Hall et al. 2012) ✅ SHIPPED

**What:** Full Hall 2012 LB panel verification in the liver adaptive tree.

**Config:** `organ-weight-thresholds.json` LIVER.adaptive_requires: 9 LB markers (ALT, AST, ALP, GGT, BILI, CHOL, BILEAC, TP, ALB), min 5 present and clean, both damage markers (ALT+AST) clean, enzyme fold <5.0.

**Implementation:** `_tree_liver()` in `adaptive_trees.py` performs full panel check:
- Counts available/clean/changed markers using `ConcurrentFindingIndex.is_lb_marker_clean()`
- `is_lb_marker_clean()` flags ANY significant change (up or down) — catches both enzyme elevation (ALT↑) and synthetic failure (ALB↓, TP↓)
- Critical markers (ALT, AST): if changed → `tr_adverse` (hepatotoxicity)
- Panel incomplete (<5 available) → `equivocal` with annotation
- ≥5 clean + all critical clean + severity ≤ 2 → `tr_adaptive` (enzyme induction)
- Per-marker breakdown in `ecetoc_factors` and `rationale` (e.g., "3/7 clean; changed: ALT,AST,ALP,ALB; missing: BILEAC,TP")
- Liver adverse indicators include steatosis/vacuolization/lipidosis (fatty change = hepatotoxicity)

**PointCross results:** Both sexes → `tr_adverse` via ALT elevation. Female: 3/7 clean, 4 changed (ALT,AST,ALP,ALB). Male: 3/7 clean, 4 changed (ALT,AST,ALP,CHOL). 2 markers (BILEAC, TP) missing from study's LB panel.

**Test coverage:** 4 dedicated Hall panel assertions in `organ-thresholds.test.ts` (panel detail in factors, rationale, node_path, critical marker → tr_adverse).

### Priority Tier 3 — External Data Integration

#### 3A. Historical Control Data Integration (ECETOC A-3) — Phase 1: Static Ranges ✅ SHIPPED

**Shipped:** Session 2026-02-28. SD rat (Envigo C11963) static ranges for 10 organs × 2 sexes × 2 durations.

**Implementation:**
- `shared/hcd-reference-ranges.json` (~80L) — strain-indexed with aliases, duration categories (28-day, 90-day)
- `backend/services/analysis/hcd.py` (~200L) — `HcdRangeDB` lazy-loaded singleton, `assess_a3()` returns `{result, score, detail}`, plus `get_strain()` and `get_study_duration_days()` TS domain extractors with ISO 8601 duration parsing
- `classification.py` — A-3 wired into `_score_treatment_relatedness()` (+0.5 outside_hcd, -0.5 within_hcd). OM two-gate: `_assess_om_two_gate()` applies HCD as post-gate modifier (within_hcd + both gates → equivocal downgrade; outside_hcd + stat only + small magnitude → equivocal upgrade). Strong adverse bypasses HCD.
- `findings_pipeline.py` — `process_findings()` accepts `strain` + `duration_days`, threads to `_assess_all_findings()`
- `domain_stats.py`, `unified_findings.py` — extract strain + duration via `get_strain()`, `get_study_duration_days()`
- `analysis.ts` — `_hcd_assessment` and `_assessment_detail.hcd_result/hcd_downgrade/hcd_upgrade` types
- BFIELD-76: `_hcd_assessment` documented. METH-35: Historical Control Data (A-3) documented.

**PointCross impact:** 2 OM findings downgraded tr_adverse→equivocal (Spleen F 27% within_hcd, Thymus M 37% within_hcd). Distribution: 227/101/42/23/3 (was 227/103/40/23/3). 1062 tests pass.

**Not yet implemented:** Wistar Han ranges (Inotiv PDF digitization), non-OM domains (LB/BW ranges for A-3).

#### 3A+. Historical Control Data Integration — Phase 2: SQLite from DTT IAD
**What:** Download NTP DTT IAD Organ Weight (78 MB Excel) and Terminal Bodyweight (85.9 MB Excel) files. Build SQLite reference database with ETL: parse Excel → filter controls → join OM+BW by animal ID → compute ratios → index by strain/sex/duration/route/date.

**Enables:** Dynamic matching by route, vehicle, age, study date. Covers SD, Wistar Han, F344/N, B6C3F1/N, CD-1. Percentile ranking against matched HCD distribution (superior to simple range checks).

**Files affected:** New `backend/services/analysis/hcd_database.py`, new ETL script, SQLite database file.

**Complexity:** Medium-High. ~500-700 lines. Depends on 3A JSON schema (drop-in replacement).

**Note:** Option C (sendigR) permanently eliminated — sendigR doesn't support OM domain, CEBS isn't in SEND format.

#### 3B. PT-Level Concordance Data
**What:** Integrate the Liu & Fan 2026 concordance data (LR+ by preferred term × species × modality) for clinical translatability scoring.

**Current data availability:**
- 48 PT-level LR+ values extractable from paper text (in xlsx "Interim PT Data" sheet)
- Clark 2018 SOC-level LR+ available now (CC-BY open access)
- Liu & Fan supplementary tables (850 identical-term + 2,833 cross-term) not yet released

**Approach:** Hard-code interim values now. Replace with parsed supplementary tables when released. Build as `shared/concordance-data.json`.

**Files affected:** New shared concordance data file. Frontend consumer TBD (likely new tab or insight type).

**Complexity:** Low for interim. Medium for full integration.

### Priority Tier 4 — Advanced Capabilities

#### 4A. GRADE-Adapted Confidence Scoring
**What:** Extend current ECI (5-dimension). **Brief 5 resolved the temporal question:** temporal pattern does NOT become dimension 6. Instead:

**Merge into existing dimensions (per Brief 5):**
1. **Expand B-3 reversibility to 3-tier:** persists through recovery → no reversibility; resolves during recovery → standard reversibility; resolves during dosing → on-dose adaptation (highest confidence of non-adversity). Only scorable when interim LB data exists.
2. **Add onset-timing modifier to DR quality:** For BW/CL domains only (rich temporal data). Early onset (<10% of study duration) flags palatability/stress; late onset (>50%) flags cumulative toxicity. Not scored for terminal-only domains (LB, OM, MI).
3. **Remaining additions:** HCD dimension (requires 3A), cross-sex/cross-study consistency (available from current per-sex data).

**Why:** No published system scores confidence at the individual finding level. Genuine methodological innovation opportunity.

**Complexity:** Medium. ~300-400 lines (reduced from 500-700 since temporal is not standalone).

#### 4B. BMD Optional Module
**What:** Add benchmark dose computation alongside NOAEL using pybmds (EPA BMDS Python wrapper, public domain, pip-installable).

**Why:** EFSA endorses BMD as "scientifically more advanced." While not standard in pharma, having optional BMD makes the system EFSA-ready.

**Approach:** `pip install pybmds`. Run BMD on continuous endpoints with ≥3 dose groups. Display as optional column in NOAEL view.

**Complexity:** Low-Medium. ~300-500 lines.

#### 4C. Backend Compound Logic for Corroboration
**What:** Port the frontend's compound required logic evaluation (e.g., "ALP AND (GGT OR 5NT)" for XS02) to the backend corroboration module. Currently only the frontend evaluates compound logic — the backend does presence-only matching.

**Why:** Reduces the split-brain problem. Backend corroboration_status would be more accurate and could be consumed by NOAEL derivation with higher confidence.

**Complexity:** Medium. ~300-400 lines.

### Priority Tier 5 — Future / When Needed

- **4D. Pharmacological class context** — requires compound class metadata from study sponsors
- **4E. Expert review package** — structured PDF/HTML output for toxicologist review
- **4F. Cross-study HCD queries** — dynamic sendigR integration for multi-study HCD
- **4G. BMDExpress integration** — toxicogenomics BMD if scope expands to -omics
- **4H. Recovery-period cross-domain concordance** — assess coherent syndrome resolution during recovery

---

## 6. Build vs. Leverage Matrix (Updated with Current State)

| Capability | Research Status | Current State | Action |
|---|---|---|---|
| SEND data ingestion | Solved (sendigR) | Built (XPT processor) | No change needed |
| Statistical screening | Solved (ToxicR) | Built (Dunnett's, JT, Williams', ANCOVA) | No change needed — our suite is comprehensive |
| Dose-response modeling/BMD | Solved (pybmds) | Not implemented | **Leverage** pybmds for optional BMD |
| CDISC terminology harmonization | Solved (xptcleaner) | Partial (built-in specimen/test normalization) | Consider xptcleaner for cross-study harmonization |
| Cross-study HCD analysis | Solved (sendigR) | Not implemented | **Build** static JSON ranges (Phase 1) then SQLite from DTT IAD (Phase 2). sendigR eliminated — no OM support. |
| Adversity classification | Complete gap in OSS | **Partial** — ECETOC two-step at syndrome level | **Build** extension to all findings |
| Biological plausibility scoring | Complete gap in OSS | **Partial** — dose-response quality + concordance | **Build** extension with HCD + MOA |
| Cross-domain concordance engine | Complete gap in OSS | **Built** — 10 syndromes, dual engine | **Enhance** backend with compound logic |
| Sex-specific assessment | Complete gap in OSS | **Built** — all analyses per-sex | **Enhance** with mechanism flags |
| NOAEL determination logic | Complete gap in OSS | **Built** — per-sex + combined + override | **Enhance** with ECETOC adversity input |
| Finding-level confidence scoring | Complete gap in OSS | **Partial** — ECI 5-dimension | **Build** GRADE-adapted 6-dimension |
| Organ weight interpretation | Complete gap in OSS | **Built** — Bailey categories, ANCOVA, 4 tiers | **Enhance** with organ-specific thresholds |
| Pharmacological class context | Complete gap in OSS | Not implemented | **Build** when MOA metadata available |
| Expert review package | Complete gap in OSS | Not implemented | **Build** later |

---

## 7. Source Catalog Quick Reference

### Priority Sources for Implementation

| ID | Source | Type | Status | Use For |
|---|---|---|---|---|
| S10 | ECETOC TR 085 | Regulatory framework | In use | Adversity two-step framework (encoding A-factors, B-factors) |
| S11 | Kerlin 2016 (STP) | Best practices | In use | NOAEL as expert decision, bio > stats |
| S12 | Palazzi 2016 (ESTP 4th) | Adversity definition | Partially used | Intrinsic adversity dictionary |
| S13 | Hall 2012 (ESTP liver) | Decision tree | Partially used | Full liver hypertrophy decision tree |
| S15 | Bailey 2004 | Normalization | Implemented | Organ-specific normalization |
| S16 | Kale 2022 | NOAEL case study | Partially used | Per-sex NOAEL exceptions |
| S18 | Arndt 2024 (ESTP 9th) | Critical principle | Encoded | Absence ≠ disconfirmation |
| S19 | Kluxen 2020 / Lazic | ANCOVA/mediation | Implemented | ANCOVA, effect decomposition |

### Priority Repos for Integration

| ID | Repo | License | Use For |
|---|---|---|---|
| R01 | sendigR (PHUSE) | MIT | HCD queries, xptcleaner Python module |
| R04 | SEND-TestDataFactory | MIT | Synthetic test data for assessment engine validation |
| R07/R08 | Lazic mediation | CC-BY 4.0 | Reference for Bayesian causal mediation (PyMC port) |
| R12 | NTP CEBS | Public domain | Historical control organ/body weights |
| R18 | effectsize (R) | MIT | Reference for validating our Hedges' g computation |
| R20 | BMDS/pybmds | Public domain | Optional BMD module |

### Repos to AVOID (GPL)

| ID | Repo | License | Safe Action |
|---|---|---|---|
| R15 | SiTuR | GPL | Reference only; use NTP CEBS (R12) for data |
| R16 | CMAverse | GPL-3 | Reference only; use PyMC for mediation |
| R17 | R mediation | GPL-2 | Reference only; use statsmodels for frequentist approach |

---

## 8. Open Questions / Decision Points

1. ~~**Where should the assessment engine live?**~~ **RESOLVED:** Backend Python. `assess_finding()` in `classification.py` is the single source of truth. Frontend `syndrome-ecetoc.ts` remains as the syndrome-level ECETOC implementation (higher abstraction, richer context). Both coexist: backend is per-finding floor, frontend is per-syndrome ceiling.

2. ~~**Should the NOAEL derivation consume ECETOC adversity directly?**~~ **RESOLVED:** Yes. `_is_loael_driving()` uses `finding_class` with legacy fallback. Runs in generator pipeline, persisted in `noael_summary.json` with `classification_method` trace.

3. ~~**How much HCD data to bootstrap?**~~ **RESOLVED (Brief 4):** Phased approach. Phase 1 (Option A): static JSON ranges from Envigo C11963 (SD rat) + Inotiv RccHan:WIST (Wistar Han, 700+ studies). Phase 2 (Option B): SQLite from NTP DTT IAD Excel files (78 MB OM + 85.9 MB BW, 14+ strains, 40+ tissues). Option C (sendigR) eliminated — doesn't support OM domain, CEBS isn't in SEND format.

4. ~~**Is the intrinsic adversity dictionary a compile-time or runtime resource?**~~ **RESOLVED:** Compile-time shared JSON (`shared/adversity-dictionary.json`). Lazy-loaded by `adversity_dictionary.py`. Same pattern as `shared/syndrome-definitions.json`.

5. **Should the assessment engine produce a "regulatory compliance score"?** The research docs avoid this (EPA warns against pseudo-quantification). But clients may want a summary metric. If so, it should be a structured profile (per-dimension), not a single number.

6. ~~**Should non-liver adaptive trees live in shared JSON or backend Python?**~~ **RESOLVED:** Backend Python. `adaptive_trees.py` implements 6 trees as Python functions (option b). Trees need cross-finding queries via `ConcurrentFindingIndex`, severity threshold checks, species flags, and cross-organ links — too complex for JSON. Threshold config lives in `shared/organ-weight-thresholds.json`; tree logic in Python.

---

## 9. Deep Research Brief Status

| Brief | Title | Status | Deliverable | Blocks |
|---|---|---|---|---|
| 1 | Organ-specific HCD variability & magnitude thresholds | ✅ IMPLEMENTED | `shared/organ-weight-thresholds.json` (116L), `organ_thresholds.py` (154L), two-gate OM in `classification.py` | Tier 2A ✅ |
| 2 | Non-liver adaptive response classification rules | ✅ IMPLEMENTED | 6 decision trees in `adaptive_trees.py` (723L), `ConcurrentFindingIndex` (155L) | Tier 2B ✅ |
| 3 | Cross-domain concordance linkage map | NOT STARTED | Organ-by-organ endpoint linkage table beyond XS01-XS10 | Tier 4C |
| 4 | NTP CEBS historical control data profiling | ✅ COMPLETE | Phased Option A→B, DTT IAD discovery, sendigR eliminated, SD rat starter ranges compiled | Tier 3A Phase 1 ✅ |
| 5 | GRADE temporal dimension design decision | ✅ COMPLETE | Decision: merge into B-3 + DR quality, not standalone | Tier 4A |
| 6 | Non-tumor progression chains (ECETOC B-6) | ✅ COMPLETE | 14 organ-specific chains with severity triggers, species specificity, HCD rates, time dependency | Tier 3B |

**Full brief specifications:** `docs/deep-research/engine/deep-research-briefs-targeted.md`

---

## 10. Deliberate Non-Implementations (renumbered from §9)

These items from the research roadmap are intentionally deferred or out of scope:

1. **Auto-assigning NOAEL** — Per Kerlin Rec #7, the system proposes but never auto-assigns. This is a design principle, not a gap.
2. **Full Bayesian causal mediation** — Lazic 2020 PyMC port is Phase 3. Current ANCOVA covers the primary use case.
3. **Toxicogenomics BMD** — BMDExpress-3 integration only relevant if scope expands to -omics.
4. **ToxAgents / LLM integration** — Reference from Liu & Fan 2026. Out of scope for rule-based engine.
5. **Cross-study portfolio intelligence** — `insights_engine.py` (19 rules) exists as metadata-level cross-study comparison. Full re-analysis of reference studies is out of scope.

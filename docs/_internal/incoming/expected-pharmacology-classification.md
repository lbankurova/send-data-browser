# Expected Pharmacological Effect Classification

**Status:** Spec draft (updated 2026-03-29 — integrated 5 additional research docs)
**Priority:** P1 (SG-01 in study-type-expansion-analysis.md)
**Affected studies:** Study2, Study4 (vaccines), future biologics/gene therapy

### Research inputs
| Document | Content | Impact |
|----------|---------|--------|
| `research/class-exp-pharmacology-28mar2026.md` | Problem analysis, regulatory framework, hybrid architecture design | Core spec driver |
| `research/aav-gene-therapy-expected-effects.md` | 31 expected findings for AAV gene therapy (hepatotox, DRG, coagulopathy) | Profile data |
| `research/oligo-checkpoint-expected-effects.md` | 17 oligonucleotide + 24 checkpoint inhibitor expected findings | Profile data |
| `research/send-test-code-matching.md` | 24 LB alias groups, organ hierarchy, MI text normalization, matching algorithm | PREREQ-1 |
| `research/severity-thresholds-pharmacology.md` | Adverse vs pharmacological cutoffs per modality, 7 never-reclassifiable findings | PREREQ-3 |
| `research/hcd-species-coverage-audit.md` | Pre-seed audit: rat OM only. Now resolved with seed data (see below) | OPEN-1 |
| `research/hcd/hcd_acquisition_report.md` | 1,068 LB reference rows: cynomolgus, rabbit, beagle, SD rat, Wistar Han | OPEN-1 |
| `research/hcd/hcd_seed.sqlite` | Seed database ready for ETL into pipeline | OPEN-1 |
| `research/sample-size/sample-size-adequacy-29mar2026.md` | D8 sample-size dimension, power tables, regulatory reference N | Resolves SG-09; D8/D9 numbering |
| `research/control-groups/control-groups-model-29mar2026.md` | 10+ control configurations, dual-control pooling, no-control handling | Resolves SG-12; **foundational dependency** |
| `research/multi-compound-studies/multi_compound_study_analysis.md` | Per-compound partitioning, JT suppression, ADC analyte handling | Resolves SG-11; orthogonal |
| `research/d-r/NonMonotonic_DoseResponse_29mar2026.md` | 4-tier compound-class-aware D2 scoring for NMDR | Resolves SG-08; D2 redesign |
| `research/engine/cardiovascular-telementry-analysis.md` | CV telemetry pipeline spec, `findings_cv.py` data layer | Resolves SG-05; complementary |
| `research/d8-interaction-analysis.md` | D3/D9 interaction: suppress D3/D4/D5/D7 when D9 fires (Option B) |

---

## Problem

The ECETOC B-factor framework has no provision for expected pharmacological effects. Vaccine and biologic studies systematically produce `tr_adverse` classifications for on-target findings (CRP 34-66x, lymphoid hyperplasia 100% incidence, injection site inflammation). The engine correctly detects dose-response and statistical significance — but cannot ask "is this what the compound is supposed to do?"

Study2 and Study4 both show the same disagreement: report says NOAEL = treatment dose (all findings pharmacology-related), engine says NOAEL = control (findings are statistically adverse). Neither is wrong — they're answering different questions. The engine needs a mechanism to present both views.

---

## Design: Tiered hybrid architecture

Maps to the 4-tier design from the research doc, reusing existing infrastructure.

### Tier 1 — Automated compound-class suggestion

**What:** Parse TS metadata → suggest a compound modality profile from a curated repository.

**Existing code to extend:**
- `subject_context.py:56-80` (`_TS_PARAMS` dict) — add PCLASS, INTTYPE, TRT, STITLE *(done)*
- `StudyMetadata` model (`backend/models/study_metadata.py`) — add `compound_class` field
- `study-type-registry.ts` — already routes by TS.STYPE, extend to carry modality hint

**New artifact:** `shared/expected-effect-profiles/` directory with JSON profiles per modality.

**Inference heuristics (cascading, first match wins):**

> **Note:** SEND standard uses TSPARMCD `PCLASS` (not `PCLAS`). Original spec had a typo. Fixed 2026-03-29.

| Signal | Source | Inferred modality | Confidence |
|--------|--------|-------------------|------------|
| PCLASS contains immunoglobulin/antibody terms | TS domain | Monoclonal antibody | HIGH |
| PCLASS contains vaccine/antigen terms | TS domain | Vaccine | HIGH |
| PCLASS contains gene therapy/AAV terms | TS domain | AAV gene therapy | HIGH |
| PCLASS contains oligonucleotide terms | TS domain | Oligonucleotide | HIGH |
| TRT (treatment name) contains modality keywords | TS domain | Per keyword match | MEDIUM |
| STITLE (study title) contains modality keywords | TS domain | Per keyword match | MEDIUM |
| INTTYPE contains gene therapy signal | TS domain | AAV gene therapy | MEDIUM |
| IS domain present + ROUTE = IM/SC | XPT files + TS | Biologic (probable vaccine) | MEDIUM |
| ROUTE = SC/IM + species = NHP | TS domain | Biologic (unspecified) | LOW |
| INTTYPE = BIOLOGICAL | TS domain | Biologic (unspecified) | LOW |
| None of the above | — | Small molecule (default) | — |

**Output:** `study_metadata.compound_class` populated with suggested value + confidence. Stored as annotation (schema type `compound-profile`) so SME can override.

### Tier 2 — SME confirmation via existing annotation system

**What:** Present suggested profile to toxicologist. SME accepts, modifies, or rejects.

**Existing infrastructure (no new construction):**
- `annotations.py` CRUD — add `"compound-profile"` to `VALID_SCHEMA_TYPES`
- `_append_audit_entry` — already records field-level changes with timestamp
- Frontend annotation pattern (ToxFindingForm) — reuse for profile review

**New UI:** Compound profile selector in the Study Summary view.
- Dropdown: compound class (vaccine, AAV gene therapy, oligonucleotide, checkpoint inhibitor, small molecule, other)
- When selected, shows the expected-effect checklist from the profile
- SME checks/unchecks individual expected findings
- "Accept profile" button confirms the selection
- All decisions persisted via annotation API with audit trail

**Schema:**
```json
{
  "compound_class": "vaccine_adjuvanted",
  "confidence": "HIGH",
  "inference_method": "PCLAS",
  "confirmed_by_sme": true,
  "expected_findings": {
    "LB_CRP_up": { "included": true, "severity_threshold": null },
    "LB_Fibrinogen_up": { "included": true, "severity_threshold": null },
    "MI_spleen_hyperplasia": { "included": true, "severity_threshold": "moderate" },
    "MI_injection_site_inflammation": { "included": true, "severity_threshold": "severe" },
    "BW_decrease_transient": { "included": true, "severity_threshold": null },
    "OM_iliac_ln_weight_up": { "included": true, "severity_threshold": null }
  },
  "justification": "Adjuvanted vaccine — STP Points to Consider (Sellers 2020)"
}
```

### Tier 3 — Finding-level D9 confidence dimension

**What:** When a finding matches a confirmed expected-effect profile entry, add a D9 "pharmacological expectation" dimension that downgrades adversity confidence.

**Extension point:** `confidence.py:273` — `compute_confidence()` already assembles D1-D7. Add D8 (sample size) and D9 (pharmacology).

```python
# D9: Pharmacological expectation
# | Dim | Downgrade (-1)                        | Neutral (0) | Skip             |
# |-----|---------------------------------------|-------------|------------------|
# | D9  | Finding matches confirmed EE profile  | No match    | No profile set   |

def _score_d9_pharmacological(f: dict, expected_profile: dict | None) -> dict:
    if not expected_profile or not expected_profile.get("confirmed_by_sme"):
        return _dim("D9", "Pharmacological expectation", None,
                     "No confirmed compound profile — skipped")

    expected_findings = expected_profile.get("expected_findings", {})
    # Build match key: {domain}_{test_code}_{direction}
    match_key = f"{f.get('domain', '')}_{f.get('test_code', '')}_{f.get('direction', '')}".lower()

    # Check for match against profile entries
    for ee_key, ee_config in expected_findings.items():
        if not ee_config.get("included"):
            continue
        if _matches_expected_finding(f, ee_key, ee_config):
            # Check severity threshold if specified
            threshold = ee_config.get("severity_threshold")
            if threshold and _exceeds_severity_threshold(f, threshold):
                return _dim("D9", "Pharmacological expectation", 0,
                             f"Matches expected '{ee_key}' but exceeds severity "
                             f"threshold '{threshold}' — neutral (may be adverse)")
            return _dim("D9", "Pharmacological expectation", -1,
                         f"Matches expected pharmacological effect '{ee_key}' "
                         f"from {expected_profile.get('compound_class', 'unknown')} profile")

    return _dim("D9", "Pharmacological expectation", 0,
                 "No match against expected-effect profile")
```

**Effect on classification:** When D9 fires, D3/D4/D5/D7 are suppressed (set to `score=None` with pharmacological rationale). Only D1 (stats), D2 (dose-response), D6 (equivocal zone), D8 (sample size), and D9 (-1) remain scored. Typical result: sum drops from +3..+5 to +0..+1 (HIGH → MODERATE). This shifts expected-pharmacological findings out of the "high confidence adverse" zone without overriding the statistical evidence.

**D9 does NOT auto-reclassify.** It adjusts confidence, which the SME sees in the evidence panel. The SME then decides whether to override `tr_adverse` → `tr_non_adverse` via the existing ToxFindingForm. The system suggests, the expert decides.

**Never-reclassifiable guard:** Before D9 fires, check the finding against the 7 never-reclassifiable conditions (myocarditis, Hy's Law, etc.). If matched, D9 = 0 with rationale "Finding matches never-reclassifiable condition: [reason]". This prevents the system from ever suggesting that myocarditis is expected pharmacology.

**Extension point for classification:** `classification.py:assess_finding_with_context()` at line 832 — add `expected_profile` parameter. Pass through to `assess_finding()`. After B-factor evaluation, if D9 fired and finding_class is `tr_adverse`, annotate with `_pharmacological_candidate: true` flag. This flag drives the UI to show dual classification.

### Tier 4 — Weight-of-evidence integration

**What:** D9 integrates pharmacological knowledge into the existing GRADE WoE framework. D1-D7 are existing dimensions, D8 is sample-size adequacy, D9 is pharmacological expectation.

**Already implemented (no new work):**
- GRADE framework with dimensional scoring (`confidence.py`)
- HCD integration as D4 (`hcd.py`, `hcd_database.py`)
- Cross-domain corroboration as D3 (`corroboration.py`)
- Cross-sex consistency as D5

**New for Tier 4:** D8 (sample size) and D9 (pharmacological expectation) extend the existing D1-D7 framework. Both follow the same `_dim()` pattern. No new WoE framework needed.

---

## Expected-Effect Profile Repository

### Location

`shared/expected-effect-profiles/` — JSON files, one per modality. Shared between frontend (display) and backend (matching).

### Schema per profile

```json
{
  "profile_id": "vaccine_adjuvanted",
  "display_name": "Adjuvanted vaccine",
  "modality": "vaccine",
  "source": "STP Points to Consider (Sellers et al., 2020)",
  "description": "Expected findings for adjuvanted vaccine studies in standard species",
  "expected_findings": [
    {
      "key": "LB_CRP_up",
      "domain": "LB",
      "test_codes": ["CRP", "CRPTN"],
      "direction": "up",
      "description": "C-reactive protein elevation (acute phase response)",
      "typical_magnitude": "9-66x baseline",
      "severity_threshold": null,
      "species_applicability": ["RABBIT", "MONKEY", "DOG"],
      "species_note": "Not a sensitive marker in rodents (use alpha-1-acid glycoprotein)",
      "rationale": "Direct pharmacodynamic consequence of immune activation. STP consensus: 'of little significance if immune response is as expected'"
    },
    {
      "key": "LB_Fibrinogen_up",
      "domain": "LB",
      "test_codes": ["FIBRINO", "FIB"],
      "direction": "up",
      "description": "Fibrinogen elevation (acute phase)",
      "typical_magnitude": "1.5-2x baseline",
      "severity_threshold": null,
      "species_applicability": ["RABBIT", "MONKEY", "DOG"],
      "rationale": "Acute phase protein, secondary to immune activation"
    },
    {
      "key": "MI_injection_site",
      "domain": "MI",
      "organs": ["INJECTION SITE", "SITE OF INJECTION"],
      "findings": ["INFLAMMATION", "MONONUCLEAR CELL INFILTRATE", "NECROSIS"],
      "direction": "up",
      "description": "Injection site inflammation",
      "severity_threshold": "severe",
      "species_applicability": null,
      "rationale": "Expected local reaction. Non-adverse even at marked severity when reversible. STP: reversibility is key criterion"
    },
    {
      "key": "MI_spleen_hyperplasia",
      "domain": "MI",
      "organs": ["SPLEEN"],
      "findings": ["HYPERPLASIA", "GERMINAL CENTER CELLULARITY", "LYMPHOID HYPERPLASIA"],
      "direction": "up",
      "description": "Splenic lymphoid hyperplasia",
      "severity_threshold": "moderate",
      "species_applicability": null,
      "rationale": "Expected immune response — active germinal center reaction to antigen"
    },
    {
      "key": "MI_ln_hyperplasia",
      "domain": "MI",
      "organs": ["LYMPH NODE", "ILIAC LYMPH NODE", "INGUINAL LYMPH NODE"],
      "findings": ["HYPERPLASIA", "GERMINAL CENTER CELLULARITY"],
      "direction": "up",
      "description": "Draining lymph node hyperplasia",
      "severity_threshold": null,
      "species_applicability": null,
      "rationale": "Expected draining lymph node reaction to vaccine antigen"
    },
    {
      "key": "OM_ln_weight_up",
      "domain": "OM",
      "organs": ["ILIAC LYMPH NODE", "INGUINAL LYMPH NODE", "AXILLARY LYMPH NODE"],
      "direction": "up",
      "description": "Draining lymph node weight increase",
      "typical_magnitude": "5-10x",
      "severity_threshold": null,
      "species_applicability": null,
      "rationale": "Correlate of lymphoid hyperplasia — expected immune response"
    },
    {
      "key": "BW_decrease_transient",
      "domain": "BW",
      "test_codes": ["BW"],
      "direction": "down",
      "description": "Transient body weight decrease post-dose",
      "severity_threshold": null,
      "species_applicability": null,
      "rationale": "Common with adjuvanted vaccines. Non-adverse when transient and reversible"
    },
    {
      "key": "LB_Globulin_up",
      "domain": "LB",
      "test_codes": ["GLOBUL", "GLOB"],
      "direction": "up",
      "description": "Globulin increase (immunoglobulin production)",
      "severity_threshold": null,
      "species_applicability": null,
      "rationale": "Expected humoral immune response"
    },
    {
      "key": "LB_AG_ratio_down",
      "domain": "LB",
      "test_codes": ["A/G", "AGRATIO", "ALGLOB"],
      "direction": "down",
      "description": "A/G ratio decrease",
      "severity_threshold": null,
      "species_applicability": null,
      "rationale": "Secondary to globulin increase — not an independent finding"
    }
  ]
}
```

### Initial modality set (5 profiles from published consensus)

| Profile | Entries | Research source | Status |
|---------|---------|----------------|--------|
| `vaccine_adjuvanted.json` | 9 | Spec draft above + STP Sellers 2020 | Draft |
| `vaccine_non_adjuvanted.json` | ~6 | Subset of adjuvanted (no injection site, lower CRP) | To derive |
| `aav_gene_therapy.json` | 31 | `research/aav-gene-therapy-expected-effects.md` | Research complete |
| `oligonucleotide.json` | 17 | `research/oligo-checkpoint-expected-effects.md` | Research complete |
| `checkpoint_inhibitor.json` | 24 | `research/oligo-checkpoint-expected-effects.md` | Research complete |

Small molecule studies have no expected-effect profile (default behavior, no D9 scoring).

**5 specialty LB test codes** identified in research that are not in the current biomarker catalog: UPROT, C3, CYTOKIN, TROPI, BNP. These need catalog entries when profiles referencing them are activated.

---

## Prerequisites and open design questions

### PREREQ-1: Test code normalization (blocks Phase 2)

The test code matching research (`research/send-test-code-matching.md`) found that **test code normalization doesn't exist in the pipeline**. BUN/UREAN/UREA are 3 codes for the same analyte across our studies. Without a canonical registry, profile matching will fail silently.

Two existing but fragmented alias systems contain the knowledge:
- `shared/config/biomarker-catalog.json` — duplicate entries for same analyte
- `shared/config/syndrome-definitions.json` — `testCodes` arrays per syndrome

**Required:** Consolidate into a single canonical test code registry (`shared/config/test-code-aliases.json`) and add a normalization step early in the findings pipeline. The matching algorithm spec in the research doc proposes a 4-phase approach: canonical codes → organ resolution → finding text normalization → unified matcher.

### PREREQ-2: D3/D9 interaction design (RESOLVED)

When multiple expected-pharmacological findings corroborate each other (e.g., CRP + fibrinogen + spleen hyperplasia in a vaccine study), the current D3 (concordance = +1) fights D9 (pharmacological = -1). They cancel out, producing the wrong confidence grade. Similarly, D4 (HCD = +1 for outside range) and D5 (cross-sex = +1) both upgrade adversity for findings that are EXPECTED to be outside HCD and EXPECTED in both sexes.

**Resolution (Option B from `research/d8-interaction-analysis.md`):** When D9 fires, suppress D3/D4/D5/D7 by setting them to `score=None` with explicit pharmacological rationale. D1 (statistical strength) and D2 (dose-response quality) remain scored — these are informative regardless of interpretation. D6 (Tier 2 equivocal) also remains.

Worked example: vaccine CRP with D9 firing drops from sum=+5 (HIGH) to sum=+1 (MODERATE). ~15-20 lines of new code in `confidence.py`.

**Phase 2 evolution:** Make D3 context-aware — check whether corroborating findings are also expected-pharmacological. If all corroboration is from expected findings, suppress D3. If any is unexpected, keep D3=+1. Requires `corroboration.py` to expose which findings provided corroboration.

### PREREQ-3: Severity thresholds (RESOLVED)

`research/severity-thresholds-pharmacology.md` provides quantitative cutoffs from regulatory literature. Key findings:

**7 never-reclassifiable findings** (always adverse regardless of pharmacological context):
1. Myocarditis at any grade
2. Troponin elevation above reference range
3. Hy's Law pattern (ALT >3x + bilirubin >2x)
4. Necrosis at injection site (non-reversible tissue destruction)
5. Body weight loss >20%
6. Platelet count <20k/uL
7. DRG toxicity with clinical neurological signs

**Key insight from research:** Most thresholds are contextual rules (concurrent findings + duration + functional correlates), not simple magnitude cutoffs. Encoding approach: severity_threshold in profiles should be a structured object, not a scalar:
```json
"severity_threshold": {
  "type": "grade",
  "max_non_adverse": 4,
  "condition": "reversible AND no tissue destruction",
  "never_reclassifiable": ["necrosis"]
}
```

### OPEN-1: HCD species coverage (RESOLVED — accepted limitation)

HCD audit found zero LB records for any species. **Now resolved** — `research/hcd/hcd_seed.sqlite` contains 1,068 clinical pathology reference rows from 5 open-access sources:

| Species | Strain | Rows | Source | Confidence |
|---------|--------|------|--------|------------|
| Cynomolgus monkey | Vietnamese | 113 | Kim 2016 (n=76M, 37F) | MODERATE |
| NZW rabbit | — | 50 | Ozkan 2012 (n=24M, 16F) | LOW (SEM not SD) |
| Beagle dog | — | 180 | Choi 2011 (n=74M, 74F at 6mo) | HIGH (6mo) |
| SD rat | Sichuan CDC | 53 | He 2017 (n=250M, 250F) | HIGH |
| Wistar Han rat | — | 672 | ViCoG 2025 (457K measurements) | HIGH |

**Integration:** ETL from `hcd_seed.sqlite` into pipeline's `hcd.db` needed (new Phase 0.5). Key caveats in `research/hcd/hcd_acquisition_report.md`: rabbit stores SEM (convert SD=SEM*sqrt(n)), ViCoG uses geometric mean + tolerance intervals (log-normal), cynomolgus ALP useless in young animals (bone isoform).

**D4 impact:** With LB HCD loaded, D4 scores for clinical pathology in all 4 species. CRP, fibrinogen, ALT/AST, platelets — the exact endpoints where expected-pharmacology classification matters most — now have species-specific baselines.

---

## Implementation phases

### Phase 0: Foundational prerequisites (3-4 days)

**0a. Control model fix (1-2 days)** — FOUNDATIONAL DEPENDENCY from `research/control-groups/control-groups-model-29mar2026.md`

Control classification must be correct before D9 fires. If GLP003's dual controls aren't properly classified, `has_concurrent_control` may be wrong, adversity flags get suppressed, and D9 never executes. Implementation:

1. Enhance `_is_control()` to return control type (VEHICLE_CONTROL, NEGATIVE_CONTROL, POSITIVE_CONTROL) not just boolean
2. Add dual-control detection in `build_dose_groups()` — when 2+ distinct control types detected
3. Implement pooling decision tree (Section 2 of control-groups research): vehicle = primary reference, negative = QC
4. Add Prov-009: "Dual control detected — vehicle designated as primary reference"
5. Test against GLP003 (vehicle + water controls)

**0b. Test code normalization (2 days)** — from `research/send-test-code-matching.md`

1. Create `shared/config/test-code-aliases.json` from consolidated biomarker-catalog + syndrome-definitions aliases (24 groups identified in research)
2. Create `shared/config/organ-aliases.json` for organ name hierarchy (bone marrow 4 forms, lymph node 7+ subtypes)
3. Add `normalize_test_code(code)` and `normalize_organ(organ)` functions to `send_knowledge.py`
4. Wire normalization into profile matching (Phase 2) — NOT into existing findings pipeline (avoid regression)

### Phase 0.5: HCD LB expansion (1 day)

1. ETL `research/hcd/hcd_seed.sqlite` → pipeline's `backend/data/hcd.db` (extend schema for LB domain)
2. Handle SEM→SD conversion for rabbit data (Ozkan 2012)
3. Handle geometric mean + tolerance intervals for ViCoG data (log-normal parameters)
4. Extend `hcd.py` query logic: currently OM-only, add LB lookup path
5. Wire LB HCD into A-3 scoring for clinical pathology findings (currently only OM gets A-3)
6. Verify D4 scores for cynomolgus CRP, rabbit fibrinogen, beagle ALT against seed data

### Phase 1: Data layer + profiles (2-3 days)

1. Create `shared/expected-effect-profiles/` with all 5 modality profile JSONs (research outputs provide the data)
2. Add PCLAS + INTTYPE to `_TS_PARAMS` in `subject_context.py:56`
3. Add `compound_class` field to `StudyMetadata` model
4. Add `"compound-profile"` to `VALID_SCHEMA_TYPES` in `annotations.py`
5. Write compound-class inference function in `subject_context.py`
6. Add API endpoint: `GET /api/studies/{id}/compound-profile` — returns inferred + confirmed profile
7. Populate severity thresholds in profiles from research output

### Phase 2: D8 (sample size) + D9 (pharmacology) confidence dimensions (2-3 days)

D3/D9 interaction design resolved (Option B). Three confidence dimensions added in this phase:

**D8 — Sample-size adequacy** (from `research/sample-size/sample-size-adequacy-29mar2026.md`):
1. Add `_score_d8_sample_size()` to `confidence.py` — compare endpoint N vs study-type reference N
2. Crossover ×1.5 multiplier, D1×D8 interaction (strong p caps D8 at -1)
3. Resolves SG-09 entirely

**D9 — Pharmacological expectation** (this spec):
4. Add `_score_d9_pharmacological()` — match finding against confirmed profile using normalized test codes/organs
5. Add never-reclassifiable guard (7 conditions) — checked before D9 fires
6. When D9 = -1: suppress D3/D4/D5/D7 (set score=None with pharmacological rationale). ~15-20 lines.
7. Add `expected_profile` parameter to `compute_confidence()` and `compute_all_confidence()`
8. Load confirmed profile from annotations in `findings_pipeline.py`
9. Add `_pharmacological_candidate: true` annotation on findings where D9 fires
10. Add Prov-008 provenance message: compound class + N matched findings + N suppressed dimensions

**D2 redesign coordination** (from `research/d-r/NonMonotonic_DoseResponse_29mar2026.md`):
11. Replace blanket D2=-1 for non-monotonic with 4-tier compound-class-aware scoring
12. Shares `compound_class` lookup with D9 — implement together
13. Expected NMDR patterns (e.g., beta-agonist respiratory rate) score D2=+1 instead of -1
14. Resolves SG-08 for compound-class-aware studies

### Phase 3: Frontend profile review (2-3 days)

1. Compound class dropdown in Study Summary banner
2. Expected-effect checklist (accept/modify/reject per finding)
3. D9 column in evidence confidence panel (same pattern as D1-D7)
4. Dual classification indicator: original `tr_adverse` + suggested `pharmacological`
5. ToxFindingForm already shows `systemSuggestedAdversity` — extend with profile context

### Phase 4: Validation (1-2 days)

1. Test against Study2/Study4 (vaccines) — verify D9 fires for expected findings
2. Test against PointCross (negative control) — verify zero behavioral change
3. Validate NOAEL shift when SME overrides findings
4. Check HCD interaction for non-rat species (from audit results)

---

## What is NOT in scope

- Auto-reclassification without SME sign-off (regulatory requirement per ICH S6(R1))
- Cross-study compound program analysis (separate feature, SG-14)
- QSAR-based toxicity prediction (different problem)
- Modification of the ECETOC A-factor pipeline (A-factors work correctly)
- B-8 as a formal ECETOC extension (D9 confidence dimension achieves the same effect through existing WoE framework)
- Multi-compound partitioning (SG-11, addressed by `research/multi-compound-studies/` — orthogonal, composes cleanly)
- CV domain processing (SG-05, addressed by `research/engine/cardiovascular-telementry-analysis.md` — complementary)
- Full control-model implementation beyond dual-control fix (deferred — Phase 0a handles the blocking case only)

---

## Validation plan

### Study2 (456a Vaccine, NZW Rabbits)

With vaccine_adjuvanted profile confirmed:
- CRP 34-66x → D9 fires → confidence drops from HIGH to MODERATE
- Fibrinogen 1.65-2x → D9 fires
- Spleen hyperplasia 10/10 → D9 fires
- Iliac LN weight 7.8-10.4x → D9 fires
- Expected: 7+ findings shift from `tr_adverse` to `tr_adverse + pharmacological_candidate`
- SME overrides via ToxFindingForm → NOAEL shifts from control to treatment dose
- Matches report conclusion

### Study4 (Adjuvanted Influenza Vaccine, NZW Rabbits)

Same profile, same expected shifts. Additional test: injection site inflammation at marked severity should NOT be reclassified (exceeds severity_threshold).

### PointCross (negative control)

No expected-effect profile for small molecules. D9 = None (skipped) for all findings. Zero behavioral change. Regression-safe.

---

## Key design decisions

1. **D9 downgrades confidence, doesn't auto-reclassify.** The system suggests, the expert decides. This satisfies FDA AI guidance (human oversight) and STP best practices (professional judgment).

2. **Profiles are per-modality, not per-compound.** Compound-specific overrides happen at Tier 2 (SME modifies the checklist). The repository encodes class-level knowledge from consensus documents.

3. **Original classification is never overwritten.** `finding_class` stays as computed. `_pharmacological_candidate` is an annotation layer. The SME's override via ToxFindingForm is a separate field tracked by the audit system.

4. **Severity thresholds are the safety valve.** CRP at 34x = expected. CRP at 1000x with organ failure = adverse regardless of profile. Each profile entry can specify a threshold above which the pharmacological expectation no longer applies.

5. **Species applicability gates matching.** CRP is not a sensitive acute phase marker in rodents. Profile entries can specify which species they apply to, preventing false matches.

6. **Test code matching uses normalized aliases, not raw codes.** Profile entries specify canonical test codes. A normalization layer maps sponsor-specific codes (BUN/UREAN/UREA) to canonical forms before matching. This prevents silent match failures across heterogeneous datasets.

7. **D3/D9 interaction resolution (PENDING).** When D9 fires, the behavior of D3 (concordance), D4 (HCD), D5 (cross-sex), and D7 (direction) must be adjusted. The current design where these dimensions boost adversity confidence produces incorrect grades for expected pharmacological findings that are corroborated, outside HCD, concordant across sexes, and aligned with concern direction — all of which are EXPECTED for pharmacological effects. Resolution from `research/d8-interaction-analysis.md` will update this section.

---

## Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| HCD seed data low-N for rabbit (n=24M) | Wide confidence intervals, LOW confidence flag | Cross-validate with Hewitt 1989 (n=110, paywalled) when available |
| Test code aliases incomplete → silent match failures | Profile entries don't fire for valid findings | Start with known aliases from 6-study corpus; expand as studies are added |
| Severity thresholds too permissive → genuine toxicity flagged as expected | Safety signal missed | Conservative defaults (null = no threshold); SME must explicitly accept |
| D3/D9 interaction design wrong → incorrect confidence grades | Toxicologist loses trust in system | Worked examples in research doc; validate on Study2/Study4 before shipping |
| Profile too broad → non-pharmacological findings reclassified | Over-correction | Severity thresholds + species gates + SME confirmation all required |

# External Dependencies

What this project depends on that we did not create. Each entry has a stable ID, describes the dependency, what version we use, what we take from it, and the update protocol when it changes.

Spec-unaware: this file describes dependencies themselves, not which specs reference them. Cross-reference specs via text search on the stable IDs.

---

## CDISC Standards

### SENDIG-3.1

**Standard for Exchange of Nonclinical Data Implementation Guide, version 3.1**

We use SENDIG 3.1 as the authoritative domain-variable schema for all SEND data handling. Our local copy is `backend/validation/metadata/sendig_31_variables.yaml` (328 lines), which encodes every domain (DM, TS, TA, TE, TX, SE, EX, DS, LB, BW, MI, MA, OM, CL, FW, EG, PC, PP), variable name, label, type (Char/Num), and core designation (Req/Exp/Perm).

**What we take:** Domain membership, variable naming, core/expected/permissible classification. Every validation rule that checks "does variable X exist in domain Y" derives its ground truth from this file. The study design rules (SD-001 through SD-007) reference SENDIG 3.1 explicitly in their `cdisc_reference` fields.

**What's coming:** SENDIG 3.2 is expected. When it ships, regenerate the YAML from the published PDF/Excel, diff against 3.1, and update validation rules whose domain-variable expectations change.

**Update protocol:** Replace `sendig_31_variables.yaml` with the new version. Run `test_rule_catalog.py` — any structural invariant failures indicate rules that assumed old variable definitions. Run all validation tests.

---

### CDISC-CT

**CDISC SEND Controlled Terminology**

Our local copy is `backend/validation/metadata/controlled_terms.yaml` (361 lines), encoding 40+ codelists: SEX, SPECIES (14 terms), STRAIN (39 species-specific variants), ROUTE (19 terms), DOSE_FORM (12 terms), SEVERITY (5 grades: MINIMAL through SEVERE), SPECIMEN (50+ tissue types), DOMAIN_CODES (24 domains), STUDY_DESIGN (6 types), EGTESTCD (17 ECG parameters), and more. Each codelist is marked extensible or non-extensible.

**What we take:** Valid coded values for FDA-004 ("Undefined controlled terminology codes"), study design validation (SD-003 species/strain checks), and domain browser display. The `extensible` flag determines whether sponsor-defined terms are permitted.

**What's coming:** CDISC publishes CT updates quarterly. New terms are additive; removed terms are rare.

**Update protocol:** Download the latest SEND CT package from the CDISC Library. Regenerate `controlled_terms.yaml`. Run `test_fda_validation.py` — FDA-004 specifically tests CT compliance. If new codelists are added that the engine should validate, add them to the YAML and update the FDA check handler.

---

### CDISC-CORE

**CDISC Conformance Rules Engine**

Optional integration. Runs in a separate Python 3.12 virtual environment (`backend/.venv-core/`) via subprocess, with entry script at `backend/_core_engine/core.py` and 208 pre-cached `.pkl` rule files in `backend/_core_engine/resources/cache/`. Default SENDIG version: `"3-1"`. Timeout: 120 seconds.

**What we take:** 400+ conformance rules that check structural SEND compliance (missing required variables, type mismatches, codelist violations, cross-domain referential integrity). Results are merged into our validation output alongside our 14 custom rules. The engine auto-detects SENDIG version from `TS.SNDIGVER`.

**Current status:** Optional — graceful fallback if `.venv-core` is not installed. `core_runner.is_core_available()` gates all CORE calls.

**Update protocol:** When CDISC publishes new CORE rule packs, replace the `.pkl` cache files. Run the full validation test suite to verify merge behavior.

---

## Regulatory Guidance

### FDA-SEND-REVIEW

**FDA SEND Review Guide**

The primary regulatory reference for our 7 FDA data quality rules (FDA-001 through FDA-007). Specific sections cited in rule YAML:

- FDA-001 (categorical data in numeric result): Section 4.2
- FDA-002 (timing variable alignment): implicit SEND timing rules
- FDA-003 (below-LLOQ without imputation): SENDIG 3.1 Section 6.3
- FDA-005 (early-death data): early death threshold of 7 days before terminal sacrifice
- FDA-007 (QTc correction): ICH S7B cross-reference for non-rodent ECG requirements

**What we take:** Rule logic, severity classifications, and fix guidance text. Each FDA rule's `cdisc_reference` field in `fda_data_quality.yaml` cites the relevant section.

**Update protocol:** When the FDA updates the SEND Review Guide, review each FDA rule against the new text. Update rule descriptions, parameters, and fix guidance as needed.

---

### FDA-KM-SCALING

**FDA Body Surface Area Scaling Factors (Km-based)**

Allometric scaling constants for human equivalent dose (HED) calculation, hardcoded in `backend/generator/pk_integration.py`:

| Species | Km | Conversion factor |
|---------|-----|-------------------|
| Mouse | 3 | 12.3 |
| Hamster | 5 | 7.4 |
| Rat | 6 | 6.2 |
| Guinea pig | 8 | 4.6 |
| Rabbit | 12 | 3.1 |
| Monkey | 12 | 3.1 |
| Dog | 20 | 1.8 |
| Minipig | 20 | 1.8 |

**Formula:** `HED = NOAEL_dose / conversion_factor`

**Source:** FDA Guidance for Industry: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers (2005).

**What we take:** Species-specific conversion factors for the PK integration module. Used to translate animal NOAEL doses to human-relevant exposure context.

**Update protocol:** These values are stable (unchanged since 2005). Only update if FDA revises the guidance document.

---

### ICH-S7B

**ICH S7B: The Nonclinical Evaluation of the Potential for Delayed Ventricular Repolarization (QT Interval Prolongation) by Human Pharmaceuticals**

Referenced by FDA-007 (QTc correction documentation). Establishes that non-rodent species require QTc correction method documentation; rodent studies are exempt from multi-correction requirements.

**What we take:** The rodent/non-rodent distinction for QTc validation. FDA-007 checks `EGMETHOD` population and flags empty method fields, with species-aware diagnosis text.

**Update protocol:** Monitor ICH revisions. The S7B core requirement (document QTc correction for non-rodents) has been stable.

---

## Published Scientific Data

### LIU-FAN-2026

**Liu & Fan 2026 — Pre-clinical to Human Concordance**

Citation: Liu & Fan 2026, n=7,565 drugs. Provides likelihood ratio positive (LR+) values for translating pre-clinical findings to human risk, by species and System Organ Class (SOC) or Preferred Term (PT).

Implemented in `frontend/src/lib/syndrome-interpretation.ts` as `concordance-v0` (data version tag: 2026-02-18). Contains:

- **SOC-level LR+** by species (rat, dog, monkey, mouse, rabbit). Example: rat hepatobiliary 3.5, dog renal 3.5, monkey immune system 6.0.
- **PT-level LR+** for ~307 endpoint-species pairs. Examples: immune-mediated hepatitis (mouse: 462.4), hyperphagia (dog: 230.8), hepatic necrosis (rat: 8.7, dog: 12.3), thrombocytopenia (all: 8.4).

**Translational tier assignment:**
- High: PT-level LR+ >= 10 OR SOC LR+ >= 5
- Moderate: PT-level LR+ >= 3 OR SOC LR+ >= 3
- Low: PT-level LR+ < 3 AND SOC LR+ < 3
- Insufficient data: no lookup match

**What we take:** All LR+ values for translational confidence scoring in the syndrome interpretation engine. Tier boundaries. Citation text for UI display.

**Update protocol:** When a new concordance dataset is published or the authors update their analysis, increment the `CONCORDANCE_DATA_VERSION` tag, replace the lookup tables in `syndrome-interpretation.ts`, and verify tier boundaries still make sense with the new data distribution.

---

### SEND-KNOWLEDGE-BASE

**Biomarker Organ Mapping and Biological Thresholds**

Internal knowledge base in `backend/services/analysis/send_knowledge.py`. Not from a single publication — aggregates standard toxicology practice:

**Biomarker map** (60+ LBTESTCD entries): Maps each lab test code to organ, organ system, direction of concern, and category. Examples: ALT → LIVER/hepatic/up/enzyme, BUN → KIDNEY/renal/up/general, RBC → BONE MARROW/hematologic/down/general.

**Organ-to-system map** (40+ specimens): Maps anatomical specimens to organ systems. Examples: LIVER → hepatic, KIDNEY → renal, BRAIN → neurologic, TESTIS → reproductive.

**Biological significance thresholds:**
- Body weight decrease >= 10% is concerning
- Organ weight change >= 15% is concerning
- Liver enzyme fold-change >= 2.0x is concerning
- General lab fold-change >= 1.5x is concerning

**Domain-specific Cohen's d thresholds:**
- LB: negligible 0.3, small 0.6, medium 1.0, large 1.5
- BW: negligible 0.2, small 0.5, medium 0.8, large 1.2
- OM: same as LB
- FW: same as BW
- Default: same as BW

**What we take:** All biomarker-to-organ mappings drive the organ coherence detection and signal scoring. Thresholds drive the insights engine's biological significance assessments.

**Update protocol:** When adding new test codes or adjusting thresholds, update `send_knowledge.py`. Run the full generator and verify insights output hasn't regressed.

---

### LAB-CLINICAL-CATALOG

**Lab Clinical Significance Rules (L01-L26)**

Rule engine in `frontend/src/lib/lab-clinical-catalog.ts`. 26 rules evaluating lab endpoint patterns for clinical significance, structured per admiral grading patterns. Categories: liver, graded, governance.

**Severity tiers:** S1 (Monitor), S2 (Concern), S3 (Adverse), S4 (Critical).

**Clinical floor thresholds** (minimum signal score for each severity): S4: 15, S3: 8, S2: 4, S1: 0.

**Synonym architecture:** Exact-label lookup (no substring matching). Each canonical lab name maps to test code aliases and normalized endpoint labels. Examples: ALT → [alt, alat, alanine aminotransferase, sgpt, gpt], BUN → [bun, blood urea nitrogen, urea nitrogen, urea].

**Rule thresholds** (examples): ALT 2x-5x for liver rules, BUN 2x for renal, HGB decrease for hematologic.

**What we take:** Clinical significance classification for every lab finding. Drives the adverse effects view and findings rail.

**Update protocol:** When adding new rules or adjusting thresholds, update the catalog. Run `npm test` to verify pipeline assertions.

---

### CROSS-DOMAIN-SYNDROMES

**Cross-Domain Syndrome Detection Rules (XS01-XS09)**

9 rules in `frontend/src/lib/cross-domain-syndromes.ts` (972 lines). Detect multi-domain toxicity patterns by matching structured term dictionaries across LB, BW, MI, MA, OM, and CL domains.

**What we take:** Syndrome detection (hepatotoxicity, nephrotoxicity, hematotoxicity, cardiotoxicity, immunotoxicity, neurotoxicity, respiratory, GI, metabolic/endocrine). Each rule specifies required and supporting evidence terms with compound logic.

**Statistical threshold:** p < 0.05 for endpoint significance.

**Update protocol:** When adding new syndrome rules, append to the array and update the XS ID sequence. Run `npm test`.

---

## Statistical Methods

### SIGNAL-SCORING

**Signal Score Computation**

Four-component weighted formula implemented in both `frontend/src/lib/rule-definitions.ts` and `backend/services/insights_engine.py`:

| Component | Weight | Cap/normalization |
|-----------|--------|-------------------|
| P-value (Dunnett's pairwise) | 0.35 | -log10(p)/4, capped at p = 0.0001 |
| Trend p-value (Jonckheere-Terpstra) | 0.20 | Same -log10 normalization |
| Effect size (Cohen's d) | 0.25 | \|d\|/2, capped at d = 2.0 |
| Dose-response pattern | 0.20 | Pattern score (see below) |

**Pattern classification scores:**
- monotonic_increase/decrease: 1.0
- threshold: 0.7
- non_monotonic: 0.3
- flat: 0.0
- insufficient_data: 0.0

**Design rationale:** Higher statistical weight (0.35) reflects that Dunnett's pairwise comparison is more definitive than Jonckheere-Terpstra trend test. Pattern weight aligns with ICH regulatory practice for causality assessment.

**Target organ evidence threshold:** score >= 0.3 AND >= 1 significant endpoint.

**Update protocol:** Changes to weights or caps affect all signal scores across the system. Update both frontend and backend implementations in tandem. Run all tests.

---

### NOAEL-CONFIDENCE

**NOAEL Confidence Scoring**

Implemented in `frontend/src/lib/rule-definitions.ts`. Penalties applied to NOAEL confidence:

| Condition | Penalty |
|-----------|---------|
| Single endpoint (<=1 adverse at LOAEL) | -0.20 |
| Sex inconsistency (M != F NOAEL) | -0.20 |
| Large effect non-significant (\|d\| >= 1.0 AND p >= 0.05) | -0.20 |
| Pathology disagreement | -0.00 (reserved) |

**What we take:** Confidence modifiers that flag NOAEL determinations with limited evidence or conflicting signals.

**Update protocol:** Adjust penalty values in `rule-definitions.ts`. These are currently hardcoded; no YAML externalization.

---

### PATTERN-CLASSIFICATION

**Dose-Response Pattern Detection**

Implemented in `frontend/src/lib/pattern-classification.ts` and documented in `docs/systems/data-pipeline.md`.

- Control threshold for incidence-based detection: 0.05
- Threshold pattern detection: initial diffs <= `min_threshold`, then all remaining diffs in same direction
- `min_threshold` = `abs(control_mean) * 0.01` (or 1e-10 if control_mean ~= 0)

**Update protocol:** Changes to pattern detection thresholds affect the dose-response pattern classifications that feed into signal scoring (weight 0.20). Run `npm test` after changes.

---

## Color and Display Standards

### SIGNAL-COLORS

**Signal Score Color Scale**

Implemented in `frontend/src/lib/severity-colors.ts`:

| Score range | Color | Hex |
|-------------|-------|-----|
| >= 0.8 | Red | #D32F2F |
| >= 0.6 | Orange | #F57C00 |
| >= 0.4 | Yellow | #FBC02D |
| >= 0.2 | Green | #81C784 |
| > 0 | Dark green | #388E3C |

These are internal design decisions, not external dependencies. Included here because the thresholds (0.8/0.6/0.4/0.2) are referenced across multiple views and changing them has system-wide impact.

**Update protocol:** Change in `severity-colors.ts`. All views that display signal-based color inherit automatically.

---

## Recovery and Protection Assessment

### RECOVERY-THRESHOLDS

**Recovery Assessment Verdict Thresholds**

Implemented in `frontend/src/lib/recovery-assessment.ts`:

| Verdict | Incidence ratio | Severity ratio |
|---------|----------------|----------------|
| Progressing | >= 1.5x | >= 1.5x |
| Reversed | <= 1.0x (at or below control) | <= 1.0x |
| Reversing | Between reversed and progressing | Between reversed and progressing |

**Update protocol:** Adjust in `recovery-assessment.ts`. These thresholds determine recovery/reversal verdicts in the histopathology view.

---

### PROTECTIVE-SIGNAL

**Protective Signal Classification Thresholds**

Implemented in `frontend/src/lib/protective-signal.ts`:

| Classification | Condition |
|----------------|-----------|
| Pharmacological | control incidence > historical control rate x 1.5 |
| Treatment-decrease | high-dose incidence < historical control rate x 0.5 |

**Update protocol:** Adjust in `protective-signal.ts`.

---

## Blocked / Stubbed Dependencies

### INHAND

**International Harmonization of Nomenclature and Diagnostic Criteria for Lesions in Rats and Mice**

Referenced in `docs/systems/insights-engine.md` as a future integration: "Production should support catalog versioning (INHAND nomenclature updates)." Not currently integrated. The clinical catalog uses hardcoded substring matching on MITERM/MATERM/CLTEST rather than formal INHAND nomenclature linkage.

**What we would take:** Standardized finding terminology for morphological lesion matching, replacing current substring-based matching with formal nomenclature codes.

**Status:** Blocked — no INHAND machine-readable dictionary available in the project.

---

### HISTORICAL-CONTROLS

**Historical Control Incidence Databases**

Mock data in `frontend/src/lib/mock-historical-controls.ts`. Attributes reference "Charles River Laboratories Crl:CD(SD)" with 34 control groups over 4-26 weeks. Source attribution fields distinguish "mock" vs "laboratory" vs "published."

**What we would take:** Background incidence rates for spontaneous lesions, enabling "above historical control" flagging. Currently drives the protective signal classification with mock data.

**Status:** Stubbed — mock data only. Production would need integration with a real historical control database (NTP HCD, CEBS, or proprietary laboratory databases).

---

### EXPORT

**CSV/Excel Export**

Currently an `alert()` stub. No external dependency yet — when implemented, will likely use a library like SheetJS (xlsx) or Papa Parse (CSV).

**Status:** Stub — `alert()` placeholder in UI.

---

### AUTH

**Authentication and Authorization**

No authentication anywhere. Hardcoded "User" identity. When implemented, will require an external auth provider (OAuth, JWT, or similar).

**Status:** Missing — no implementation, no dependency chosen.

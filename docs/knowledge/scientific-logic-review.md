# Scientific Logic Review — SEND Data Browser

**Generated:** 2026-02-19  
**Study:** PointCross (RAT, SPRAGUE-DAWLEY, ORAL GAVAGE, 13-week subchronic)  
**Pipeline:** 62 endpoint summaries → 8 detected syndromes (XS01, XS04, XS05, XS08, XS09, XS10, XS03, XS07)

---

## Instructions for Reviewers

This document is **auto-generated from code** — every definition, threshold, and worked example reflects the system's current logic. When the code changes, this document regenerates.

Your task: read each section and answer the **► Review questions**. You do not need to read any code. Focus on:
- Are the syndrome definitions clinically appropriate?
- Are the interpretation thresholds reasonable for preclinical regulatory studies?
- Do the worked examples (Part D) produce conclusions you agree with?
- Are any ⚠ anomaly markers genuine problems or acceptable edge cases?

Mark each question with ✅ (agree), ❌ (disagree — explain), or ❓ (need more info).

---

# Part A: Syndrome Pattern Definitions

The system defines 10 cross-domain syndrome patterns (XS01–XS10). Each pattern specifies required and supporting evidence across laboratory (LB), microscopic pathology (MI), macroscopic pathology (MA), organ weight (OM), clinical observation (CL), and other domains.

## XS01: Hepatocellular injury

**Clinical description:** Direct damage to liver parenchymal cells (hepatocytes), typically from reactive metabolites, mitochondrial dysfunction, or oxidative stress. Key markers: ALT/AST elevation with histopathological confirmation (necrosis, degeneration). Distinguished from cholestatic injury (XS02) by enzyme profile.

**Required logic:** ANY one required term triggers detection  
**Minimum domains:** 2

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| ALT ↑ | LB | up | ALT |
| AST ↑ | LB | up | AST |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| SDH ↑ | LB | up |
| BILI ↑ | LB | up |
| Liver weight | OM | any |
| Liver necrosis | MI | any |
| Liver hypertrophy | MI | any |

**► Review questions:**

- [ ] Are ALT + AST sufficient required markers for rodent hepatocellular injury, or should SDH (sorbitol dehydrogenase) be required as a more liver-specific marker?
- [ ] Should GLDH (glutamate dehydrogenase) be included as a required or supporting marker for hepatocellular injury in rats?
- [ ] Is the 'any' required logic appropriate (any single required term triggers), or should compound logic (e.g., ALT AND AST) be used?
- [ ] Are the histopathological findings (necrosis, degeneration, hypertrophy) correctly classified as supporting rather than required?

---

## XS02: Hepatobiliary / Cholestatic

**Clinical description:** Impaired bile formation or flow (cholestasis), with or without hepatocellular involvement. Key markers: ALP/GGT/5'-nucleotidase elevation. May present as intrahepatic (drug/metabolite-induced) or extrahepatic (biliary obstruction). R-ratio classification differentiates hepatocellular vs. cholestatic vs. mixed injury.

**Required logic:** Compound: `ALP AND (GGT OR 5NT)`  
**Minimum domains:** 2

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| ALP ↑ | LB | up | ALP |
| GGT ↑ | LB | up | GGT |
| 5NT ↑ | LB | up | 5NT |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| BILI ↑ | LB | up |
| CHOL ↑ | LB | up |
| Liver weight ↑ | OM | up |
| Liver bile duct hyperplasia | MI | any |

**► Review questions:**

- [ ] Is the compound logic 'ALP AND (GGT OR 5NT)' appropriate for cholestasis detection in rodents?
- [ ] Should total bilirubin be required (not just supporting) for cholestasis?
- [ ] Is ALP elevation alone sufficient to suggest cholestasis, or is concurrent GGT/5NT essential to rule out bone-origin ALP?

---

## XS03: Nephrotoxicity

**Clinical description:** Toxic injury to the kidney, affecting glomerular filtration, tubular reabsorption, or both. Key markers: BUN/creatinine elevation with kidney weight changes and histopathological findings (tubular necrosis, mineralization). Electrolyte disturbances (Na, K, Ca, P) provide supporting evidence.

**Required logic:** ANY one required term triggers detection  
**Minimum domains:** 2

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| BUN ↑ | LB | up | BUN |
| CREAT ↑ | LB | up | CREAT |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| Kidney weight | OM | any |
| SPGRAV ↓ | LB | down |
| Kidney tubular degeneration | MI | any |

**► Review questions:**

- [ ] Are BUN and creatinine sufficient required markers, or should urinalysis parameters (proteinuria, glucosuria) also be required?
- [ ] Is the 'any' required logic appropriate — can a single marker (e.g., BUN alone) reliably indicate nephrotoxicity without creatinine confirmation?
- [ ] Should kidney weight changes be required rather than supporting?

---

## XS04: Myelosuppression

**Clinical description:** Decreased bone marrow production of blood cells (suppressed hematopoiesis). Distinct from peripheral destruction (XS05). Key differentiator: reticulocyte direction — decreased in myelosuppression, increased in hemolysis. Multi-lineage cytopenias (neutropenia, thrombocytopenia, anemia) suggest stem cell-level toxicity.

**Required logic:** Compound: `ANY(NEUT, PLAT, (RBC AND HGB))`  
**Minimum domains:** 1

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| NEUT ↓ | LB | down | NEUT |
| PLAT ↓ | LB | down | PLAT |
| RBC ↓ | LB | down | RBC |
| HGB ↓ | LB | down | HGB |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| Bone marrow hypocellularity | MI | any |
| RETIC ↓ | LB | down |
| Spleen atrophy | MI | any |
| Spleen weight ↓ | OM | down |

**► Review questions:**

- [ ] Reticulocyte direction is the primary XS04/XS05 discriminator. Is this sufficient, or should MCV/MCH/MCHC also be considered?
- [ ] Is the compound logic 'ANY(NEUT, PLAT, (RBC AND HGB))' appropriate? Should lymphocyte count also be included?
- [ ] Should bone marrow cellularity assessment (if available) override peripheral blood parameters?
- [ ] Is minDomains=1 (LB only) too permissive? Should histopath confirmation be required?

---

## XS05: Hemolytic anemia

**Clinical description:** Accelerated destruction of circulating red blood cells (hemolytic anemia). Distinguished from myelosuppression (XS04) by reticulocyte response (increased = regenerative response to peripheral RBC loss). Supporting evidence: bilirubin elevation, spleen enlargement, Heinz bodies, spherocytes.

**Required logic:** ALL required terms must match  
**Minimum domains:** 1

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| RBC ↓ | LB | down | RBC |
| RETIC ↑ | LB | up | RETIC |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| BILI ↑ | LB | up |
| Spleen weight ↑ | OM | up |
| Spleen extramedullary hematopoiesis | MI | any |
| HAPTO ↓ | LB | down |

**► Review questions:**

- [ ] Is reticulocyte increase sufficient to distinguish hemolysis from myelosuppression, or could reticulocyte increase also occur in recovery from transient myelosuppression?
- [ ] Should indirect bilirubin (vs. total bilirubin) be the preferred supporting marker?
- [ ] Should the required logic be 'all' (requiring both RBC decrease and reticulocyte increase simultaneously)?

---

## XS06: Phospholipidosis

**Clinical description:** Excessive accumulation of phospholipids within lysosomes of multiple cell types, typically caused by cationic amphiphilic drugs that inhibit lysosomal phospholipases. Key histopathological hallmark: lamellar bodies visible on electron microscopy. Often multi-organ (liver, lung, kidney, lymph nodes).

**Required logic:** ANY one required term triggers detection  
**Minimum domains:** 2

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| PL ↑ | LB | up | PHOS |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| Any foamy macrophage | MI | any |
| Liver weight ↑ | OM | up |

**► Review questions:**

- [ ] Is the current marker set sufficient to detect phospholipidosis without electron microscopy confirmation?
- [ ] Should the definition include specific histopathological findings (lamellar bodies, foamy macrophages) as required terms?
- [ ] Should cationic amphiphilic drug (CAD) structure be a prerequisite or modifier for phospholipidosis detection?

---

## XS07: Immunotoxicity

**Clinical description:** Drug-induced suppression or dysregulation of the immune system. May manifest as lymphoid depletion, thymic atrophy, altered immunoglobulin levels, or impaired functional immune response. Key markers: WBC/lymphocyte changes, organ weight decreases (thymus, spleen), histopathological lymphoid depletion.

**Required logic:** ANY one required term triggers detection  
**Minimum domains:** 2

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| WBC ↓ | LB | down | WBC |
| LYMPH ↓ | LB | down | LYMPH |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| Spleen weight ↓ | OM | down |
| Thymus weight ↓ | OM | down |
| Spleen lymphoid depletion | MI | any |

**► Review questions:**

- [ ] Should functional immune endpoints (e.g., antibody response to T-dependent antigen) be included if available?
- [ ] Is the distinction between immunosuppression (decreased function) and immunotoxicity (structural damage) adequately captured?
- [ ] Should thymus weight be required rather than supporting for immunotoxicity assessment?

---

## XS08: Stress response

**Clinical description:** Non-specific physiological stress response (distress), often secondary to excessive toxicity or palatability issues. Key markers: adrenal hypertrophy, thymic atrophy, body weight loss, corticosterone elevation. Must be distinguished from direct organ toxicity — stress response findings alone should not drive NOAEL.

**Required logic:** ANY one required term triggers detection  
**Minimum domains:** 2

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| Adrenal weight ↑ | OM | up | ADRENAL_WT |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| CORT ↑ | LB | up |
| Thymus weight ↓ | OM | down |
| LYMPH ↓ | LB | down |
| Body Weight ↓ | BW | down |

**► Review questions:**

- [ ] How should the system distinguish primary adrenal toxicity from secondary stress-related adrenal hypertrophy?
- [ ] Should body weight loss be required for stress response classification, or can adrenal/thymus changes alone qualify?
- [ ] At what threshold of body weight change (%) should stress response become the primary classification vs. secondary to another syndrome?

---

## XS09: Target organ wasting

**Clinical description:** Progressive loss of organ mass (atrophy/wasting) with or without functional decline. Typically manifests as decreased organ weights with histopathological atrophy, often accompanied by body weight loss. May be primary (direct toxicity) or secondary (generalized wasting from severe systemic toxicity).

**Required logic:** ANY one required term triggers detection  
**Minimum domains:** 2

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| Body Weight ↓ | BW | down | BW |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| Food Consumption ↓ | BW | down |
| Organ weight ↓ | OM | down |
| Any atrophy | MI | any |

**► Review questions:**

- [ ] How should the system distinguish primary organ atrophy (direct toxicity) from secondary wasting (systemic toxicity)?
- [ ] Should body weight loss percentage thresholds be defined for classifying severity of wasting?
- [ ] Is it correct that organ weight decreases alone can trigger this syndrome, without histopathological confirmation of atrophy?

---

## XS10: Cardiovascular

**Clinical description:** Drug-induced effects on the cardiovascular system, including cardiac functional changes (heart rate, ECG parameters, blood pressure), structural changes (cardiomyocyte degeneration, fibrosis), and vascular effects. Species differences in translational relevance (e.g., rodent QTc has limited predictive value for human risk).

**Required logic:** ANY one required term triggers detection  
**Minimum domains:** 1

**Required evidence:**

| Term | Domain | Direction | Tag |
|------|--------|-----------|-----|
| QTCBAG | EG | any | QTC |
| PRAG | EG | any | PR |
| RRAG | EG | any | RR |
| HR | VS | any | HR |

**Supporting evidence:**

| Term | Domain | Direction |
|------|--------|-----------|
| Heart weight ↑ | OM | up |
| Heart cardiomyopathy | MI | any |
| CTNI ↑ | LB | up |

**► Review questions:**

- [ ] Given that rodent QTc has limited translational value, should cardiac functional parameters (HR, ECG) receive reduced weight in rodent studies?
- [ ] Should troponin levels be included as a sensitive marker for cardiomyocyte injury?
- [ ] How should the system handle species-specific differences in cardiovascular susceptibility (e.g., rat vs. dog)?

---

# Part B: Interpretation Framework

After detecting syndrome patterns, the system interprets each through a multi-step pipeline. Each step produces a structured assessment that feeds into the next.

## B.1: Certainty Assessment

Classifies each syndrome into one of three certainty levels:

| Level | Meaning | Criteria |
|-------|---------|----------|
| `mechanism_confirmed` | Strong mechanistic evidence supports the pattern | Histopath cross-references confirm expected findings in target organs; discriminating evidence favors this syndrome over alternatives |
| `mechanism_uncertain` | Pattern detected but mechanistic evidence is incomplete | Some discriminating findings present but not all; histopath may be absent or inconclusive |
| `pattern_only` | Statistical pattern with no mechanistic confirmation | No histopath data, no discriminating findings, or discriminating evidence is equivocal |

**Decision logic:** The system evaluates discriminating findings (endpoints that distinguish this syndrome from its differential diagnosis). Each finding scores as `confirms`, `argues_against`, or `not_measured`. The ratio of confirms to argues_against, combined with histopathological cross-reference, determines the certainty level.

## B.2: Treatment-Relatedness (ECETOC A-Factors)

Scores treatment-relatedness using weighted factors adapted from ECETOC Technical Report No. 138:

| Factor | Scoring | Weight |
|--------|---------|--------|
| A-1: Dose-response | `strong` (monotonic+significant), `weak` (trend only), `absent` | Primary |
| A-2: Cross-endpoint concordance | `concordant` (≥2 domains), `isolated` (single domain) | Supporting |
| A-6: Statistical significance | `significant` (p<0.05 pairwise + trend, or p<0.01, or adverse+monotonic), `borderline`, `not_significant` | Supporting |
| CL: Clinical observation support | `yes`/`no` — correlating clinical signs present | Modifier |

**Overall classification:**
- `treatment_related` — strong dose-response OR (significant + concordant) OR (adverse severity + monotonic pattern)
- `possibly_related` — weak evidence or borderline significance without concordance
- `not_related` — no dose-response, not significant, no concordance

## B.3: Adversity Assessment (ECETOC B-Factors)

Evaluates whether the syndrome represents an adverse effect using a multi-factor framework:

| Factor | Assessment | Source |
|--------|-----------|--------|
| Adaptive response | `true`/`false` — are changes adaptive (e.g., enzyme induction without injury)? | Endpoint patterns |
| Reversibility | `true`/`false`/`null` — do effects reverse in recovery period? | Recovery arm data |
| Magnitude | `minimal`/`mild`/`moderate`/`marked`/`severe` — Cohen's d thresholds | Effect sizes |
| Cross-domain support | `true`/`false` — do multiple domains converge? | Domain count |
| Precursor to worse | `true`/`false` — could changes progress to more serious injury? | Syndrome definition |
| Secondary to other | `true`/`false` — are changes secondary to another primary toxicity? | Cross-syndrome analysis |

**Magnitude thresholds (Cohen's d):**
- `minimal`: |d| < 0.5
- `mild`: 0.5 ≤ |d| < 1.0
- `moderate`: 1.0 ≤ |d| < 2.0
- `marked`: 2.0 ≤ |d| < 3.0
- `severe`: |d| ≥ 3.0

**Overall adversity:** `adverse`, `non_adverse`, or `equivocal`

## B.4: Severity Cascade

Assigns an overall severity tier based on the interpretation results. Priority order (highest to lowest):

| Tier | Label | Trigger |
|------|-------|---------|
| S0 | Death | Treatment-related mortality detected |
| — | Carcinogenic | Tumor progression sequence detected |
| — | Proliferative | Tumors present (no progression) |
| S4 | Critical | Adversity=adverse + magnitude≥marked + mechanism_confirmed |
| S3 | Adverse | Adversity=adverse + mechanism_confirmed or mechanism_uncertain |
| S2 | Concern | Adversity=equivocal OR pattern_only with adverse signals |
| S1 | Monitor | Non-adverse, minimal magnitude, or insufficient evidence |

## B.5: Translational Confidence

Estimates how likely the animal findings translate to human risk, using species-specific likelihood ratios (LR+) from published concordance databases:

| Tier | LR+ range | Interpretation |
|------|-----------|----------------|
| `high` | LR+ ≥ 3.0 | Strong positive predictive value — animal findings reliably predict human toxicity at this SOC/endpoint level |
| `moderate` | 1.5 ≤ LR+ < 3.0 | Modest predictive value — some concordance but significant false positive rate |
| `low` | LR+ < 1.5 | Poor predictive value — animal findings at this SOC have limited relevance to human risk |
| `insufficient_data` | No data | LR+ not available for this species/SOC combination |

**Data source:** SOC-level and endpoint-level LR+ from published preclinical-to-clinical concordance studies (Bailey et al., Olson et al.).

**► Review questions for interpretation framework:**

- [ ] Cohen's d thresholds for adversity magnitude: <0.5=minimal, 0.5–1.0=mild, 1.0–2.0=moderate, 2.0–3.0=marked, ≥3.0=severe. Are these appropriate for preclinical studies with n=5–30 per group?
- [ ] Treatment-relatedness requires BOTH pairwise p<0.05 AND trend p<0.05 (or adverse+monotonic, or p<0.01). Is this the right stringency for a screening tool?
- [ ] The severity cascade always elevates to S0 (Death) if treatment-related mortality is detected, regardless of other factors. Should there be exceptions (e.g., single early death with ambiguous cause)?
- [ ] Should translational confidence modify the severity tier, or should it remain an independent annotation?
- [ ] Is the three-level certainty scale (confirmed/uncertain/pattern_only) sufficient, or should intermediate levels be added?
- [ ] Should reversibility data (when available) be able to override an 'adverse' classification to 'non_adverse'?

---

# Part C: Lab Clinical Significance Rules

The system uses 33 rules to classify individual lab parameter changes. Each rule specifies the parameter(s), direction, threshold, and severity tier.

## Liver Rules

| ID | Name | Severity | Parameters | Thresholds | Source |
|-----|------|----------|------------|------------|--------|
| L01 | ALT elevation (moderate) | S2 | ALT increase (required) | ALT: ≥2× control → S2 Concern | FDA Guidance (2009) |
| L02 | ALT elevation (marked) | S3 | ALT increase (required) | ALT: ≥5× control → S3 Adverse | FDA Guidance (2009) |
| L03 | ALT + Bilirubin concurrent elevation | S4 | ALT increase (required); TBILI increase (required) | — | FDA Guidance (2009), Hy's Law |
| L04 | Bilirubin elevation (isolated) | S1 | TBILI increase (required) | — | Clinical practice |
| L05 | Hepatocellular panel coverage (QC) | S1 | ALT increase (supporting); AST increase (supporting); SDH increase (supporting); GDH increase (supporting) | — | Best practice |
| L06 | Cholestatic panel coverage (QC) | S1 | ALP increase (supporting); GGT increase (supporting); 5NT increase (supporting); TBILI increase (supporting) | — | Best practice |
| L07 | Hy's Law pattern | S4 | ALT increase (required); TBILI increase (required); ALP increase (supporting) | — | FDA Hy's Law guidance |
| L08 | Hy's Law-like animal pattern | S3 | ALT increase (required); TBILI increase (required) | — | Nonclinical adaptation |
| L09 | Excess ALT frequency (program flag) | S3 | ALT increase (required) | — | Program monitoring |
| L10 | R-ratio classification | S2 | ALT increase (required); ALP increase (supporting) | — | R-ratio hepatic phenotype |
| L11 | ALP in cholestasis (note) | S1 | ALP increase (required) | — | Clinical practice |

## Graded Rules

| ID | Name | Severity | Parameters | Thresholds | Source |
|-----|------|----------|------------|------------|--------|
| L12 | BUN elevation | S3 | BUN increase (required) | BUN: ≥2× control → S3 Adverse | Renal toxicology |
| L13 | Creatinine elevation | S3 | CREAT increase (required) | CREAT: ≥1.5× control → S3 Adverse | Renal toxicology |
| L14 | Hemoglobin decrease | S3 | HGB decrease (required) | HGB: ≤0.50× control (≥50% decrease) → S3 Adverse | Hematology |
| L15 | RBC decrease | S3 | RBC decrease (required) | RBC: ≤0.50× control (≥50% decrease) → S3 Adverse | Hematology |
| L16 | HCT decrease | S2 | HCT decrease (required) | HCT: ≤0.67× control (≥33% decrease) → S2 Concern | Hematology |
| L17 | Platelet decrease | S3 | PLAT decrease (required) | PLAT: ≤0.50× control (≥50% decrease) → S3 Adverse | Hematology |
| L18 | WBC decrease | S2 | WBC decrease (required) | WBC: ≤0.67× control (≥33% decrease) → S2 Concern | Hematology |
| L19 | Neutrophil decrease | S3 | NEUT decrease (required) | NEUT: ≤0.50× control (≥50% decrease) → S3 Adverse | Hematology |
| L20 | Potassium imbalance | S2 | K increase (required) | K: ≥1.5× control → S2 Concern | Clinical chemistry |
| L21 | Glucose imbalance | S2 | GLUC increase (required) | GLUC: ≥2× control → S2 Concern | Clinical chemistry |
| L22 | Cholesterol elevation | S1 | CHOL increase (required) | CHOL: ≥1.5× control → S1 Monitor | Clinical chemistry |
| L23 | Reticulocyte response | S2 | RETIC increase (required) | RETIC: ≥2× control → S2 Concern | Hematology |
| L24 | Coagulation prolongation | S2 | PT increase (required); INR increase (supporting); APTT increase (supporting) | PT: ≥1.5× control → S2 Concern; INR: ≥1.3× control → S2 Concern; APTT: ≥1.5× control → S2 Concern | Coagulation |
| L25a | Sodium imbalance | S2 | NA increase (required) | NA: ≥1.2× control → S2 Concern | Clinical chemistry |
| L25b | Calcium/Phosphate imbalance | S2 | CA increase (required); PHOS increase (supporting); MG increase (supporting) | CA: ≥1.5× control → S2 Concern; PHOS: ≥1.5× control → S2 Concern; MG: ≥1.5× control → S2 Concern | Clinical chemistry |
| L25c | Urinalysis abnormality | S1 | URINE_VOL increase (required); URINE_SG decrease (supporting) | URINE_VOL: ≥1.5× control → S1 Monitor; URINE_SG: ≤0.77× control (≥23% decrease) → S1 Monitor | Urinalysis |
| L28 | Neutrophil increase | S1 | NEUT increase (required) | NEUT: ≥2× control → S1 Monitor | Hematology |
| L29 | WBC increase | S1 | WBC increase (required) | WBC: ≥2× control → S1 Monitor | Hematology |
| L30 | Platelet increase | S1 | PLAT increase (required) | PLAT: ≥2× control → S1 Monitor | Hematology |
| L31 | Reticulocyte decrease | S2 | RETIC decrease (required) | RETIC: ≤0.50× control (≥50% decrease) → S2 Concern | Hematology |

## Governance Rules

| ID | Name | Severity | Parameters | Thresholds | Source |
|-----|------|----------|------------|------------|--------|
| L26 | Multi-domain convergence bonus | S1 |  | — | Internal |
| L27 | Syndrome pattern bonus | S1 |  | — | Internal |

**► Review questions for classification rules:**

- [ ] Are the fold-change thresholds for liver enzymes (L01: ≥2×, L02: ≥5×) appropriate across species?
- [ ] Should Hy's Law criteria (L07) apply to preclinical studies, or is this strictly a clinical concept?
- [ ] Are the governance rules (L26: multi-domain convergence, L27: syndrome pattern bonus) appropriately weighted?
- [ ] For bidirectional parameters (L20: Potassium, L21: Glucose), is the threshold symmetry appropriate?
- [ ] Should reticulocyte direction (L23 vs L31) use different thresholds for increase vs decrease?
- [ ] Are graded increase rules (L28–L30) at the right severity level, given that increases may represent reactive rather than toxic responses?

---

# Part D: PointCross Worked Examples

This section shows the system's actual output for each syndrome detected in the PointCross study. Every value below is computed by the pipeline — nothing is hand-edited.

**Study:** PointCross  
**Species:** RAT (SPRAGUE-DAWLEY)  
**Route:** ORAL GAVAGE  
**Duration:** 13 weeks (subchronic)  
**Detected syndromes:** XS01 (Hepatocellular injury), XS04 (Myelosuppression), XS05 (Hemolytic anemia), XS08 (Stress response), XS09 (Target organ wasting), XS10 (Cardiovascular), XS03 (Nephrotoxicity), XS07 (Immunotoxicity)

## XS01: Hepatocellular injury

**Confidence:** MODERATE  
**Domains covered:** LB, MI, OM  
**Sexes:** F, M  
**Required logic met:** Yes (2/2 required terms, logic: ALT or AST)

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | ALT ↑ | ✓ matched | Alanine Aminotransferase | LB | ↑ | +2.23 | 0.0003 | 1.25× | non_monotonic |
| **R** | AST ↑ | ✓ matched | Aspartate Aminotransferase | LB | ↑ | +3.99 | <0.0001 | 1.56× | threshold_increase |
| S | SDH ↑ | — not measured | — | LB | — | n/a | n/a | n/a | — |
| S | BILI ↑ | — not measured | — | LB | — | n/a | n/a | n/a | — |
| S | Liver weight | ✓ matched | LIVER — LIVER (WEIGHT) | OM | ↑ | +2.36 | 0.0010 | 1.90× | threshold_increase |
| S | Liver necrosis | — not measured | — | MI | — | n/a | n/a | n/a | — |
| S | Liver hypertrophy | ✓ matched | LIVER — HYPERTROPHY | MI | ↑ | n/a | 0.003 | n/a | threshold_increase |

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_uncertain` | Required findings met. But ALP argues against this specific mechanism. Consider differential (XS02 (Cholestatic injury)). |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: concordant, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=severe, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `low` | SOC: hepatobiliary disorders, LR+: 3.5 |

**Endpoint-level translational evidence:**

| Endpoint | LR+ | Species |
|----------|-----|---------|
| hepatotoxicity | 2.2 | all |

**Discriminating findings:**

| Endpoint | Expected | Actual | Status | Weight |
|----------|----------|--------|--------|--------|
| ALP | ↓ | ↑ | argues_against | strong |
| GGT | ↓ | — | not_available | moderate |
| LIVER::NECROSIS | ↑ | — | not_available | strong |
| LIVER::BILE DUCT HYPERPLASIA | ↓ | — | not_available | strong |

**► Syndrome-specific review questions:**

- [ ] Are ALT + AST sufficient required markers for rodent hepatocellular injury, or should SDH (sorbitol dehydrogenase) be required as a more liver-specific marker?
- [ ] Should GLDH (glutamate dehydrogenase) be included as a required or supporting marker for hepatocellular injury in rats?
- [ ] Is the 'any' required logic appropriate (any single required term triggers), or should compound logic (e.g., ALT AND AST) be used?
- [ ] Are the histopathological findings (necrosis, degeneration, hypertrophy) correctly classified as supporting rather than required?

---

## XS04: Myelosuppression

**Confidence:** LOW  
**Domains covered:** LB  
**Sexes:** F, M  
**Required logic met:** Yes (3/4 required terms, logic: any of (NEUT, PLAT, (RBC + HGB)))

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | NEUT ↓ | ✓ matched | Neutrophils | LB | ↓ | -2.45 | 0.0003 | 0.66× | threshold_decrease |
| **R** | PLAT ↓ | ○ not sig | Platelets | LB | ↑ | +1.06 | 0.091 | 1.13× | non_monotonic |
| **R** | RBC ↓ | ✓ matched | Erythrocytes | LB | ↓ | -1.43 | 0.040 | 0.97× | non_monotonic |
| **R** | HGB ↓ | ✓ matched | Hemoglobin | LB | ↓ | -2.64 | <0.0001 | 0.91× | threshold_decrease |
| S | Bone marrow hypocellularity | — not measured | — | MI | — | n/a | n/a | n/a | — |
| S | RETIC ↓ | ⚠ opposite | Reticulocytes | LB | ↑ | +1.76 | 0.003 | 1.44× | non_monotonic |
| S | Spleen atrophy | — not measured | — | MI | — | n/a | n/a | n/a | — |
| S | Spleen weight ↓ | ⚠ opposite | SPLEEN — SPLEEN (WEIGHT) | OM | ↑ | +1.48 | 0.018 | 1.43× | threshold_increase |

> ⚠ **2 opposite-direction match(es)** — endpoints matching term identity but in the wrong direction.

**Missing domains:** MI

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_uncertain` | Required findings met. But RETIC argues against this specific mechanism. Consider differential (XS05 (Hemolytic anemia)). |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: isolated, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=severe, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `high` | SOC: blood and lymphatic system disorders, LR+: 3.5 |

**Endpoint-level translational evidence:**

| Endpoint | LR+ | Species |
|----------|-----|---------|
| anemia | 10.1 | all |
| neutropenia | 16.1 | all |

**Discriminating findings:**

| Endpoint | Expected | Actual | Status | Weight |
|----------|----------|--------|--------|--------|
| RETIC | ↓ | ↑ | argues_against | strong |
| BONE MARROW::HYPOCELLULARITY | ↑ | — | not_available | strong |
| SPLEEN_WT | ↓ | ↑ | argues_against | moderate |
| SPLEEN::EXTRAMEDULLARY HEMATOPOIESIS | ↓ | — | not_available | moderate |

> **Anomaly summary:** 2 anomaly marker(s) detected in this syndrome. Review marked items (⚠) above.

**► Syndrome-specific review questions:**

- [ ] Reticulocyte direction is the primary XS04/XS05 discriminator. Is this sufficient, or should MCV/MCH/MCHC also be considered?
- [ ] Is the compound logic 'ANY(NEUT, PLAT, (RBC AND HGB))' appropriate? Should lymphocyte count also be included?
- [ ] Should bone marrow cellularity assessment (if available) override peripheral blood parameters?
- [ ] Is minDomains=1 (LB only) too permissive? Should histopath confirmation be required?

---

## XS05: Hemolytic anemia

**Confidence:** MODERATE  
**Domains covered:** LB, MI, OM  
**Sexes:** F, M  
**Required logic met:** Yes (2/2 required terms, logic: RBC + RETIC)

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | RBC ↓ | ✓ matched | Erythrocytes | LB | ↓ | -1.43 | 0.040 | 0.97× | non_monotonic |
| **R** | RETIC ↑ | ✓ matched | Reticulocytes | LB | ↑ | +1.76 | 0.003 | 1.44× | non_monotonic |
| S | BILI ↑ | — not measured | — | LB | — | n/a | n/a | n/a | — |
| S | Spleen weight ↑ | ✓ matched | SPLEEN — SPLEEN (WEIGHT) | OM | ↑ | +1.48 | 0.018 | 1.43× | threshold_increase |
| S | Spleen extramedullary hematopoiesis | ✓ matched | SPLEEN — PIGMENTATION | MI | ↑ | n/a | 0.211 | n/a | threshold_increase |
| S | HAPTO ↓ | — not measured | — | LB | — | n/a | n/a | n/a | — |

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_confirmed` | Required findings met. RETIC confirms this mechanism. No contradicting evidence. |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: concordant, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=marked, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `high` | SOC: blood and lymphatic system disorders, LR+: 3.5 |

**Endpoint-level translational evidence:**

| Endpoint | LR+ | Species |
|----------|-----|---------|
| anemia | 10.1 | all |

**Discriminating findings:**

| Endpoint | Expected | Actual | Status | Weight |
|----------|----------|--------|--------|--------|
| RETIC | ↑ | ↑ | supports | strong |
| BONE MARROW::HYPERCELLULARITY | ↑ | — | not_available | strong |
| SPLEEN_WT | ↑ | ↑ | supports | moderate |
| SPLEEN::PIGMENTATION | ↑ | — | not_available | moderate |
| TBILI | ↑ | — | not_available | moderate |

**► Syndrome-specific review questions:**

- [ ] Is reticulocyte increase sufficient to distinguish hemolysis from myelosuppression, or could reticulocyte increase also occur in recovery from transient myelosuppression?
- [ ] Should indirect bilirubin (vs. total bilirubin) be the preferred supporting marker?
- [ ] Should the required logic be 'all' (requiring both RBC decrease and reticulocyte increase simultaneously)?

---

## XS08: Stress response

**Confidence:** MODERATE  
**Domains covered:** BW, LB, OM  
**Sexes:** F, M  
**Required logic met:** Yes (1/1 required terms, logic: ADRENAL_WT)

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | Adrenal weight ↑ | ✓ matched | GLAND, ADRENAL — GLAND, ADRENAL (WEIGHT) | OM | ↑ | +1.76 | 0.004 | 1.42× | threshold_increase |
| S | CORT ↑ | — not measured | — | LB | — | n/a | n/a | n/a | — |
| S | Thymus weight ↓ | ✓ matched | THYMUS — THYMUS (WEIGHT) | OM | ↓ | -1.12 | 0.068 | 1.44× | non_monotonic |
| S | LYMPH ↓ | ⚠ opposite | Lymphocytes | LB | ↑ | +1.41 | 0.027 | 1.71× | threshold_increase |
| S | Body Weight ↓ | ✓ matched | Body Weight | BW | ↓ | -8.15 | <0.0001 | 0.80× | threshold_decrease |

> ⚠ **1 opposite-direction match(es)** — endpoints matching term identity but in the wrong direction.

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_uncertain` | Required findings met but no discriminating evidence available. Cannot confirm specific mechanism. |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: concordant, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=severe, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `insufficient_data` | SOC: —, LR+: n/a |

**Discriminating findings:**

| Endpoint | Expected | Actual | Status | Weight |
|----------|----------|--------|--------|--------|
| GLAND, ADRENAL::HYPERTROPHY | ↑ | — | not_available | strong |
| THYMUS_WT | ↓ | ↓ | not_available | moderate |

> **Anomaly summary:** 1 anomaly marker(s) detected in this syndrome. Review marked items (⚠) above.

**► Syndrome-specific review questions:**

- [ ] How should the system distinguish primary adrenal toxicity from secondary stress-related adrenal hypertrophy?
- [ ] Should body weight loss be required for stress response classification, or can adrenal/thymus changes alone qualify?
- [ ] At what threshold of body weight change (%) should stress response become the primary classification vs. secondary to another syndrome?

---

## XS09: Target organ wasting

**Confidence:** MODERATE  
**Domains covered:** BW, MI, OM  
**Sexes:** F, M  
**Required logic met:** Yes (1/1 required terms, logic: BW)

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | Body Weight ↓ | ✓ matched | Body Weight | BW | ↓ | -8.15 | <0.0001 | 0.80× | threshold_decrease |
| S | Food Consumption ↓ | — not measured | — | BW | — | n/a | n/a | n/a | — |
| S | Organ weight ↓ | ✓ matched | HEART — HEART (WEIGHT) | OM | ↓ | -2.72 | <0.0001 | 0.68× | threshold_decrease |
| S | Any atrophy | ✓ matched | GLAND, MAMMARY — ATROPHY | MI | ↑ | n/a | 0.061 | n/a | threshold_increase |

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_uncertain` | Required findings met. No discriminating evidence defined for this syndrome. |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: concordant, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=severe, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `low` | SOC: metabolism and nutrition disorders, LR+: 2.5 |

**► Syndrome-specific review questions:**

- [ ] How should the system distinguish primary organ atrophy (direct toxicity) from secondary wasting (systemic toxicity)?
- [ ] Should body weight loss percentage thresholds be defined for classifying severity of wasting?
- [ ] Is it correct that organ weight decreases alone can trigger this syndrome, without histopathological confirmation of atrophy?

---

## XS10: Cardiovascular

**Confidence:** MODERATE  
**Domains covered:** EG, MI, OM  
**Sexes:** F, M  
**Required logic met:** Yes (1/4 required terms, logic: QTC or PR or RR or HR)

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | QTCBAG | — not measured | — | EG | — | n/a | n/a | n/a | — |
| **R** | PRAG | — not measured | — | EG | — | n/a | n/a | n/a | — |
| **R** | RRAG | ✓ matched | RR Interval, Aggregate | EG | ↓ | -1.09 | 0.104 | 0.80× | threshold_decrease |
| **R** | HR | — not measured | — | VS | — | n/a | n/a | n/a | — |
| S | Heart weight ↑ | ⚠ opposite | HEART — HEART (WEIGHT) | OM | ↓ | -2.72 | <0.0001 | 0.68× | threshold_decrease |
| S | Heart cardiomyopathy | ✓ matched | HEART — INFLAMMATION | MI | ↑ | n/a | 0.250 | n/a | threshold_increase |
| S | CTNI ↑ | — not measured | — | LB | — | n/a | n/a | n/a | — |

> ⚠ **1 opposite-direction match(es)** — endpoints matching term identity but in the wrong direction.

**Missing domains:** LB, VS

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_uncertain` | Required findings met. But HEART_WT argue against. Consider differential (functional (rate change) vs structural cardiovascular toxicity). |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: concordant, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=severe, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `low` | SOC: cardiac disorders, LR+: 2.5 |

**Discriminating findings:**

| Endpoint | Expected | Actual | Status | Weight |
|----------|----------|--------|--------|--------|
| QTCBAG | ↑ | — | not_available | strong |
| HEART::CARDIOMYOPATHY | ↑ | — | not_available | strong |
| HEART_WT | ↑ | ↓ | argues_against | moderate |
| CTNI | ↑ | — | not_available | strong |

> **Anomaly summary:** 1 anomaly marker(s) detected in this syndrome. Review marked items (⚠) above.

**► Syndrome-specific review questions:**

- [ ] Given that rodent QTc has limited translational value, should cardiac functional parameters (HR, ECG) receive reduced weight in rodent studies?
- [ ] Should troponin levels be included as a sensitive marker for cardiomyocyte injury?
- [ ] How should the system handle species-specific differences in cardiovascular susceptibility (e.g., rat vs. dog)?

---

## XS03: Nephrotoxicity

**Confidence:** MODERATE  
**Domains covered:** LB, OM  
**Sexes:** M  
**Required logic met:** Yes (1/2 required terms, logic: BUN or CREAT)

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | BUN ↑ | — not measured | — | LB | — | n/a | n/a | n/a | — |
| **R** | CREAT ↑ | ✓ matched | Creatinine | LB | ↑ | +1.78 | 0.007 | 1.25× | threshold_increase |
| S | Kidney weight | ✓ matched | KIDNEY — KIDNEY (WEIGHT) | OM | ↑ | +2.73 | 0.0002 | 1.53× | threshold_increase |
| S | SPGRAV ↓ | — not measured | — | LB | — | n/a | n/a | n/a | — |
| S | Kidney tubular degeneration | — not measured | — | MI | — | n/a | n/a | n/a | — |

**Missing domains:** MI

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_confirmed` | Required findings met. Moderate supporting evidence from KIDNEY_WT. No contradicting evidence. |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: concordant, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=severe, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `moderate` | SOC: renal and urinary disorders, LR+: 4 |

**Discriminating findings:**

| Endpoint | Expected | Actual | Status | Weight |
|----------|----------|--------|--------|--------|
| KIDNEY::TUBULAR DEGENERATION | ↑ | — | not_available | strong |
| KIDNEY::CAST | ↑ | — | not_available | moderate |
| KIDNEY_WT | ↑ | ↑ | supports | moderate |
| URINE_SG | ↓ | — | not_available | moderate |

**► Syndrome-specific review questions:**

- [ ] Are BUN and creatinine sufficient required markers, or should urinalysis parameters (proteinuria, glucosuria) also be required?
- [ ] Is the 'any' required logic appropriate — can a single marker (e.g., BUN alone) reliably indicate nephrotoxicity without creatinine confirmation?
- [ ] Should kidney weight changes be required rather than supporting?

---

## XS07: Immunotoxicity

**Confidence:** MODERATE  
**Domains covered:** LB, OM  
**Sexes:** M  
**Required logic met:** Yes (1/2 required terms, logic: WBC or LYMPH)

### Term-by-Term Match Evidence

| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (d) | p-value | Fold Change | Pattern |
|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|
| **R** | WBC ↓ | ✓ matched | Leukocytes | LB | ↓ | -2.08 | 0.003 | 0.59× | threshold_decrease |
| **R** | LYMPH ↓ | ⚠ opposite | Lymphocytes | LB | ↑ | +1.41 | 0.027 | 1.71× | threshold_increase |
| S | Spleen weight ↓ | ⚠ opposite | SPLEEN — SPLEEN (WEIGHT) | OM | ↑ | +1.48 | 0.018 | 1.43× | threshold_increase |
| S | Thymus weight ↓ | ✓ matched | THYMUS — THYMUS (WEIGHT) | OM | ↓ | -1.12 | 0.068 | 1.44× | non_monotonic |
| S | Spleen lymphoid depletion | — not measured | — | MI | — | n/a | n/a | n/a | — |

> ⚠ **2 opposite-direction match(es)** — endpoints matching term identity but in the wrong direction.

**Directional gate:**
- gate_fired: true
- action: strong_against
- certainty_cap: pattern_only
- reason: LYMPH ↑ contradicts expected ↓ for XS07.

**Missing domains:** MI

### Interpretation

| Component | Result | Detail |
|-----------|--------|--------|
| Certainty | `mechanism_uncertain` | Required findings met. No discriminating evidence defined for this syndrome. |
| Treatment-relatedness | `treatment_related` | dose-response: strong, concordance: concordant, significance: significant |
| Adversity | `adverse` | adaptive=false, reversible=unknown, magnitude=severe, precursor=false |
| Severity | `S3_Adverse` | — |
| Recovery | `not_examined` | Recovery not examined in this study. |
| Translational | `low` | SOC: immune system disorders, LR+: 2.5 |

> **Anomaly summary:** 2 anomaly marker(s) detected in this syndrome. Review marked items (⚠) above.

**► Syndrome-specific review questions:**

- [ ] Should functional immune endpoints (e.g., antibody response to T-dependent antigen) be included if available?
- [ ] Is the distinction between immunosuppression (decreased function) and immunotoxicity (structural damage) adequately captured?
- [ ] Should thymus weight be required rather than supporting for immunotoxicity assessment?

---

# Part E: Cross-Cutting Review Questions

These questions span multiple syndromes and the overall interpretation framework.

## Syndrome Detection

- [ ] Are the 10 defined syndromes (XS01–XS10) sufficient to cover the major toxicological patterns seen in preclinical regulatory studies?
- [ ] Are there important syndromes missing from the current set? Consider: cardiotoxicity markers (troponin), neurotoxicity (FOB parameters), reproductive/developmental toxicity, dermal toxicity.
- [ ] Is the minimum domain count appropriate for each syndrome? Some syndromes (XS04, XS05, XS10) require only 1 domain — is single-domain detection too permissive?
- [ ] Should the system consider temporal patterns (onset timing, progression) in syndrome detection, or is endpoint-level data sufficient?

## Interpretation Pipeline

- [ ] Is the sequential pipeline order (certainty → treatment-relatedness → adversity → severity → translational) appropriate, or should some steps run in parallel?
- [ ] Should historical control data (HCD) comparison be mandatory rather than optional for treatment-relatedness assessment?
- [ ] Is the current approach of running the full pipeline with empty data arrays (no histopath, no recovery, no mortality in this study fixture) valid, or should the system flag 'insufficient data' more aggressively?
- [ ] Should syndromes interact — e.g., should XS08 (Stress response) finding automatically reduce certainty for other syndromes that could be secondary to stress?

## Data Quality

- [ ] The fixture contains only LB/BW/MI/MA/OM domain data. Should the system explicitly warn when expected domains (CL, EG, VS) are absent from the study data?
- [ ] Should the system distinguish between 'not measured' (domain not in study) and 'measured but not significant' (domain present, no findings)?
- [ ] How should the system handle parameters with sex-discordant results (significant in one sex, not in the other)?

## Regulatory Context

- [ ] Are the severity tiers (S0–S4) aligned with regulatory agency expectations (FDA, EMA, PMDA)?
- [ ] Should the system produce different interpretations for different regulatory contexts (e.g., IND-enabling vs. NDA-supporting studies)?
- [ ] Is the translational confidence assessment appropriately conservative for regulatory decision-making?

---

*End of review document. Generated by `generate-review-packet.test.ts`.*
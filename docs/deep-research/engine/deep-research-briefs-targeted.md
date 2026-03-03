# Targeted Deep-Research Briefs: Assessment Engine Gap Closure

**Context:** These six briefs target specific research gaps identified by overlaying the regulatory standards audit, the GitHub open-source landscape analysis, and the internal codebase assessment (TOPIC-assessment-engine.md). Each brief is scoped to produce directly implementable output — lookup tables, decision trees, or config files — not general knowledge.

**Prerequisite reading for all briefs:** The system already implements Bailey 2004 organ-specific normalization, 10 cross-domain syndromes (XS01–XS10) with compound logic, ECETOC two-step framework (4/7 A-factors, 4/7 B-factors), per-sex analysis with divergence detection, and ANCOVA with Lazic-style effect decomposition. These briefs fill the remaining gaps.

---

## Brief 1: Organ-Specific Historical Control Variability and Magnitude Thresholds

### Research objective

Produce a **machine-readable organ×species×strain threshold table** for organ weight changes, grounded in published historical control variability data rather than expert convention. The system currently uses a uniform 15% threshold for all organs. This is wrong — heart has low CV and 7% changes merit attention, while adrenals in mice have CV >20% and 12% changes are noise.

### Specific deliverables

1. **Coefficient of variation (CV) table** for absolute organ weights by organ × species × strain × sex. Target organs (priority order): adrenal, spleen, thymus, heart, kidney, thyroid, brain, testes, ovaries, liver. Target species/strains: SD rat, Wistar Han rat, F344 rat, CD-1 mouse, B6C3F1 mouse, beagle dog.

2. **Regulatory magnitude thresholds** reconciled across sources, with citation for each cell:

| Organ | Source | Threshold | Condition | Classification |
|---|---|---|---|---|
| Liver | JMPR 2015 | ≤15% relative | No histopath correlate | Not adverse |
| Liver | EFSA | ≤20% | No histopath correlate | Non-adverse |
| Liver | EU Biocides | >10% | Default | Adverse (refinable) |
| Heart | ? | >5% | Low CV | Flag for review |
| Adrenals | ? | >15% | Rat (CV 5-17%) | Flag for review |
| Adrenals | ? | >20%? | Mouse (CV 20-51%) | Flag for review |
| Thyroid | ? | >10% | With T3/T4/TSH change | Potentially significant |
| Testes | WHO 2015 | >10% | ? | Flag for review |

Fill in the "?" cells. For organs where no published regulatory threshold exists, derive a defensible threshold from 2×CV of historical control data (i.e., changes exceeding 2 standard deviations of control variation are biologically noteworthy).

3. **Species-specific adjustment factors:** Where thresholds should differ between rat and mouse (adrenals are the primary case), provide separate values.

### Key sources to investigate

- **Marxfeld et al. 2019** — Adrenal weight variability across species/strains. This is the primary source for adrenal CV data. Published in a regulatory toxicology journal. Find the exact CV values by species/strain/sex.
- **NTP CEBS database** (https://ntp.niehs.nih.gov/data/controls) — Historical control body weights and organ weights for F344/N rats, B6C3F1 mice, HSD rats, Wistar Han rats. Individual animal-level data is available. Query for: organ weight distributions (mean, SD, CV) by organ × strain × sex for control animals in studies with terminal sacrifice at standard ages (8-12 weeks for 28-day, 16-20 weeks for 90-day).
- **Sellers et al. 2007** (STP organ weight position paper, Toxicol Pathol 35:751-755) — States brain weight is "highly conserved"; implies any significant brain weight change is noteworthy. Check for organ-specific variability guidance.
- **Bailey et al. 2004** (Toxicol Pathol 32:448-466) — Contains regression data for organ weight vs. body weight relationships. Extract residual variability after BW correction as a measure of inherent organ weight variability.
- **WHO 2015** — Testes threshold of <10% generally within normal distribution. Find the specific document and table.
- **JMPR 2015 liver guidance** — "Relative liver weight increases ≤15% without histopathological effects should not be considered adverse." Find exact citation and check if this was updated post-2015.
- **EFSA Scientific Committee 2017** or relevant EFSA opinion on liver weight thresholds.
- **EU Biocides Working Group** — Defaults to >10% relative liver weight as adverse absent further information, refinable to ≤15%.
- **Carmichael et al. 1997** — Referenced for ≥150% of control liver weight correlated with carcinogenic outcome in lifetime studies.

### What NOT to research

- Liver thresholds are already well-documented from the initial audit. Confirm but don't spend time re-deriving.
- ANCOVA vs. ratio methodology — already addressed in the system via Kluxen/Lazic.
- Normalization method selection per organ — already implemented per Bailey 2004.

### Output format

JSON config structure matching what the system can consume:
```json
{
  "organ_thresholds": {
    "LIVER": {
      "variation_ceiling_pct": 10,
      "adaptive_ceiling_pct": 15,
      "adverse_floor_pct": 15,
      "cv_reference": { "sd_rat_m": 12.3, "sd_rat_f": 11.8, ... },
      "sources": ["JMPR 2015", "EFSA 2017", "EU Biocides WG"],
      "notes": "Refinable to ≤15% when hypertrophy only, per Hall 2012"
    },
    "ADRENAL": {
      "variation_ceiling_pct": { "rat": 15, "mouse": 25 },
      ...
    }
  }
}
```

### Estimated scope

1–2 days. Primary bottleneck is extracting CV data from NTP CEBS or Marxfeld 2019 — the regulatory thresholds themselves are faster to compile.

---

## Brief 2: Non-Liver Adaptive Response Classification Rules

### Research objective

Build **organ-specific adaptive classification decision trees** for the 5–6 most common non-liver findings that are frequently adaptive rather than adverse. The system currently classifies adaptive responses only for liver (XS01: liver weight ↑ + hypertrophy + no necrosis + enzyme fold <5.0 → adaptive). Every other organ's hypertrophy, hyperplasia, or vacuolation falls through to crude statistical classification, which systematically over-calls adversity on adaptive changes.

This directly fills the ECETOC B-2 factor gap (general adaptive response) identified in the internal assessment.

### Specific deliverables

For each of the following finding types, produce a **decision tree with explicit branching criteria** (analogous to Hall 2012 for liver):

#### 1. Thyroid follicular cell hypertrophy/hyperplasia in rodents

Primary question: When is thyroid follicular hypertrophy adaptive (secondary to hepatic enzyme induction) vs. adverse (direct thyroid toxicant)?

Decision branches needed:
- Is there concurrent liver weight increase / hepatocellular hypertrophy? (suggests enzyme induction → increased T4 clearance → TSH rise → thyroid stimulation)
- Are T3/T4 decreased and TSH increased? (expected pattern for enzyme induction)
- Is the change rodent-specific? (Rat thyroid is uniquely sensitive to TSH-mediated stimulation; FDA/EMA position on human relevance?)
- Severity: follicular hypertrophy alone → adaptive; follicular hyperplasia → potentially pre-neoplastic; follicular adenoma → adverse
- What are the EPA/EFSA/FDA positions on rodent thyroid follicular cell tumors from enzyme induction? (Known species-specific non-relevant mechanism per Capen 1997 framework)

Key sources: **Capen 1997** thyroid disruption mode-of-action framework; **ESTP thyroid workshop** (find exact citation — there should be an ESTP International Expert Workshop on thyroid follicular cell changes); **Maronpot et al.** or **Hard et al.** on thyroid follicular cell tumor MOA in rats; **EPA Thyroid Assays** guidance; **ICH S1B(R1)** — may address rodent thyroid tumor relevance.

#### 2. Adrenal cortical hypertrophy

Primary question: When is adrenal cortical hypertrophy adaptive (physiological response to ACTH stimulation, stress, body weight loss) vs. adverse (direct adrenal toxicity)?

Decision branches needed:
- Is there concurrent body weight decrease >10%? (stress/catabolism → ACTH rise → cortical hypertrophy; secondary per ECETOC B-7)
- Is the hypertrophy zona fasciculata only? (ACTH-mediated, usually adaptive)
- Is there concurrent cortical vacuolation? (lipid accumulation — may be adverse if progressive)
- Are there cortical necrosis, hemorrhage, or cortical atrophy in other zones? (adverse)
- ACTH/cortisol/corticosterone changes concurrent?

Key sources: **Rosol et al. 2001** (Toxicol Pathol, adrenal gland review); **Everds et al. 2013** (STP position on interpreting stress-related changes); any ESTP workshop on adrenal pathology; **Sellers 2007** — organ weight position addresses adrenal interpretation.

#### 3. Splenic/thymic lymphoid changes (atrophy, hyperplasia, increased/decreased cellularity)

Primary question: When are immune organ weight/cellularity changes adaptive (pharmacological immunomodulation, stress lymphocytolysis) vs. adverse (immunotoxicity)?

Decision branches needed:
- Is there concurrent body weight decrease / increased corticosterone? (stress → thymic involution → secondary, non-adverse)
- Is the thymic change cortical atrophy only? (stress pattern) vs. total thymic atrophy (potentially adverse immunosuppression)
- For spleen: increased extramedullary hematopoiesis (EMH) — compensatory response to anemia vs. primary splenic toxicity
- Are there concurrent infections or opportunistic findings? (functional immune impairment → adverse)
- ICH S8 immunotoxicity trigger criteria — what threshold of immune organ change triggers additional immunotoxicity testing?

Key sources: **ICH S8** (immunotoxicity studies); **Haley et al. 2005** (STP immunotoxicity best practices); **Everds et al. 2013** (stress-related changes); **Germolec et al. 2017** or NTP immunotoxicity review papers.

#### 4. Renal tubular hypertrophy / basophilia / vacuolation

Primary question: When are renal tubular changes adaptive (enzyme induction, protein handling) vs. adverse (tubular injury)?

Decision branches needed:
- Hypertrophy alone without degeneration/necrosis/regeneration → adaptive (similar logic to liver)
- Tubular basophilia — often regenerative response; alone may be adaptive, but if combined with degeneration is adverse
- Vacuolation — phospholipidosis (mechanism-based, reversible, potentially non-adverse per ESTP 5th workshop) vs. hydropic degeneration (adverse)
- α2u-globulin nephropathy (male rat specific, not human-relevant per EPA 1991) — need explicit flag as species-artifact

Key sources: **Lenz et al. 2018** (ESTP 5th International Expert Workshop on lysosomal accumulation/vacuolation — Toxicol Pathol); **Hard et al.** (CPN in rats — chronic progressive nephropathy as background confound); **EPA 1991 α2u-globulin position**; **Frazier 2017** or similar on renal tubular adaptive responses.

#### 5. Gastric mucosal changes (hyperplasia, erosion, ulceration)

Primary question: When are GI mucosal changes adaptive vs. adverse?

Decision branches needed:
- Mucosal hyperplasia alone → adaptive response to irritation
- Erosion/ulceration → adverse (tissue destruction)
- Forestomach squamous hyperplasia in rodents — relevance to humans? (No human forestomach; local irritation artifact)
- Glandular stomach vs. forestomach distinction for human relevance

Key sources: **Greaves 2012** (Histopathology of Preclinical Toxicity Studies, Chapter 8 GI tract); relevant ESTP guidance if available; **Proctor et al.** on forestomach relevance.

### What NOT to research

- Liver hypertrophy — already covered by Hall 2012 and partially implemented.
- Neoplastic progression — covered by Brief 6.
- Anything requiring compound-specific MOA — these decision trees should work from morphological pattern recognition + concurrent findings, not from knowledge of the specific drug.

### Output format

For each organ, a decision tree in this structure:
```
IF [finding_type] in [organ]
  AND [concurrent_finding_present/absent]
  AND [severity ≤ threshold]
  AND [no_concurrent_adverse_indicator]
THEN classification = "adaptive" | "adverse" | "equivocal"
RATIONALE: [citation]
```

These will be encoded as extensions to the existing `syndrome-ecetoc.ts` B-2 adaptive response logic.

### Estimated scope

2–3 days. The thyroid and renal sections have the most literature to synthesize. The adrenal and splenic sections are more straightforward.

---

## Brief 3: Cross-Domain Concordance Linkage Map Beyond XS01–XS10

### Research objective

Build a **comprehensive organ-by-organ endpoint linkage table** defining which clinical pathology (LB), organ weight (OM), microscopic (MI), and clinical observation (CL) findings are expected to co-occur for each target organ when that organ is genuinely affected by treatment. This extends the current 10-syndrome architecture (XS01–XS10) to cover the full range of findings that currently fall through as "not_applicable" for corroboration.

The 10 existing syndromes cover: hepatotoxicity (XS01), cholestasis (XS02), nephrotoxicity (XS03), hematotoxicity (XS04), skeletal myopathy (XS05), wasting (XS06), pancreatitis (XS07), cardiotoxicity (XS08), immunosuppression (XS09), phospholipidosis (XS10). What's missing is concordance logic for findings in organs NOT covered by these syndromes, and for findings in covered organs that don't rise to the level of a named syndrome.

### Specific deliverables

For each organ system below, produce an **endpoint linkage table** with these columns:

| Target Organ | MI Finding | Expected OM Change | Expected LB Change(s) | Expected CL Sign(s) | Concordance Strength | Direction Required? | Source |

#### Organ systems to cover (in priority order):

**1. Bone marrow / hematopoietic system** — Partially covered by XS04 (hematotoxicity: anemia, leukopenia, thrombocytopenia) but XS04 is clinical-path-centric. Need the reverse mapping: MI findings (bone marrow hypocellularity, myeloid depletion, erythroid depletion) → expected LB correlates. Also: extramedullary hematopoiesis in spleen as compensatory response.

Key source: **Reagan et al. 2011** — STP Bone Marrow Working Group position paper on evaluation of bone marrow in nonclinical safety studies. This should contain the complete concordance mapping.

**2. Thyroid** — Not covered by any existing syndrome. Need: follicular hypertrophy/hyperplasia (MI) ↔ thyroid weight ↑ (OM) ↔ T3↓/T4↓/TSH↑ (LB) ↔ liver enzyme induction (cross-organ linkage). This is a multi-organ concordance chain (liver → thyroid axis).

Key source: **Capen 1997** thyroid framework; ESTP thyroid workshop papers; **Hood 1999** or **Bartsch et al.** on T4/TSH measurement in rodent tox.

**3. Adrenal** — Not covered. Need: cortical hypertrophy (MI) ↔ adrenal weight ↑ (OM) ↔ cholesterol/cortisol/corticosterone/ACTH changes (LB) ↔ stress-related clinical signs. Must distinguish primary adrenal effects from secondary (stress/BW-mediated).

Key source: **Rosol et al. 2001** adrenal review; **Everds et al. 2013** stress paper.

**4. Reproductive organs (testes, ovaries, uterus, epididymis, prostate, seminal vesicles)** — Not covered. Need: testicular degeneration (MI) ↔ testes weight ↓ (OM) ↔ testosterone/LH/FSH changes (LB) ↔ sperm parameters if measured. Ovarian changes ↔ cycling effects ↔ estrogen/progesterone. This is complex because reproductive organ weights are inherently sex-specific and hormonally regulated.

Key source: **Creasy et al. 2012** (STP position on evaluation of testicular toxicity); **Dixon et al. 2014** or STP female reproductive pathology paper; **Sellers 2007** for reproductive organ weight interpretation.

**5. CNS/PNS** — Not covered. Need: neuronal degeneration/necrosis (MI) ↔ brain weight changes rare but significant (OM) ↔ limited LB correlates (CSF markers rarely collected in standard studies) ↔ clinical signs (tremors, convulsions, gait abnormality, decreased activity). CNS is primarily CL→MI concordance, not LB-mediated.

Key source: **Bolon et al. 2006** (STP/ARP position paper on neuropathology); **Sellers 2007** for brain weight ("highly conserved").

**6. Skin/injection site** — Not covered. Need: dermal irritation/necrosis (MI) ↔ no OM ↔ no specific LB ↔ clinical signs (erythema, edema, eschar). Relevant for route-dependent local effects that are distinct from systemic toxicity.

Key source: **Schafer et al.** on injection site reactions; OECD TG 410/412 guidance on dermal irritation assessment.

**7. Eye/ophthalmic** — Not covered. Need: retinal degeneration, lens opacity (MI) ↔ no OM ↔ limited LB ↔ ophthalmic exam findings. Important because some drug classes (chloroquine, ethambutol) have specific ocular toxicity.

Key source: **Weir et al.** STP position on ocular pathology evaluation if available.

### Additional deliverables

**Cross-organ linkage chains:** Some findings span multiple organs mechanistically. Document the major chains:
- Liver enzyme induction → ↑T4 clearance → ↑TSH → thyroid follicular hypertrophy (liver-thyroid axis)
- Bone marrow suppression → peripheral cytopenias → splenic EMH (marrow-blood-spleen axis)
- Severe body weight loss → thymic atrophy + adrenal hypertrophy + reduced organ weights (stress/wasting cascade — overlaps XS06)
- Hemolytic anemia → ↑bilirubin + ↑reticulocytes + splenic hemosiderosis + bone marrow erythroid hyperplasia

**Concordance strength tiers** matching the four-tier plausibility hierarchy from the regulatory audit:
- Tier 1 (Strongest): MI + concordant OM + concordant LB + dose-response
- Tier 2 (Strong): Any 2 concordant domains + dose-response
- Tier 3 (Supportive): 1 domain + dose-response + biological plausibility from class knowledge
- Tier 4 (Insufficient): Single marginal finding in one domain only

### What NOT to research

- Endpoints already covered by XS01–XS10 — don't re-derive hepatotoxicity, cholestasis, nephrotoxicity, etc.
- Mechanism-specific concordance requiring knowledge of the specific compound — these linkage rules should be mechanism-agnostic (based on what findings co-occur when an organ is damaged, regardless of why).
- Rare/exotic target organs (ureters, salivary gland, Harderian gland, etc.) — focus on the major target organs that account for >90% of findings.

### Output format

JSON structure matching the existing syndrome definitions:
```json
{
  "concordance_map": {
    "THYROID": {
      "mi_findings": ["HYPERTROPHY, FOLLICULAR CELL", "HYPERPLASIA, FOLLICULAR CELL"],
      "expected_om": { "direction": "increased", "organ": "THYROID" },
      "expected_lb": [
        { "test": "T4", "direction": "decreased" },
        { "test": "TSH", "direction": "increased" }
      ],
      "cross_organ_link": {
        "organ": "LIVER",
        "finding": "HYPERTROPHY, HEPATOCELLULAR",
        "mechanism": "enzyme_induction_t4_clearance"
      },
      "strength_when_all_present": "tier_1",
      "strength_mi_only": "tier_3"
    }
  }
}
```

### Estimated scope

3–5 days. The bone marrow (Reagan 2011) and testes (Creasy 2012) sections should be well-defined by their respective STP position papers. Thyroid and adrenal require synthesizing across multiple sources. CNS/eye/skin are smaller sections.

---

## Brief 4: NTP CEBS Historical Control Data Profiling

### Research objective

Profile the NTP CEBS historical control database to determine **what's actually usable** for the strains Datagrok's customers run, and decide between three integration approaches: static reference ranges from published literature (Option A), NTP CEBS data tables (Option B), or dynamic sendigR-style queries (Option C).

The system currently has mock HCD for SD rat only, and the ECETOC A-3 factor (values within historical control range) always returns "no_hcd". This is the single most impactful missing false-positive filter.

### Specific deliverables

1. **CEBS data inventory** for the following strains and endpoints:

| Strain | # Studies Available | Organ Weight Data? | Body Weight Data? | Brain Weight? | Clinical Path? | Histopath Incidence? | Age Range Covered |
|---|---|---|---|---|---|---|---|
| SD (Hsd:Sprague Dawley) | ? | ? | ? | ? | ? | ? | ? |
| Wistar Han | ? | ? | ? | ? | ? | ? | ? |
| F344/N | ? | ? | ? | ? | ? | ? | ? |
| B6C3F1 (mouse) | ? | ? | ? | ? | ? | ? | ? |
| CD-1 (mouse) | ? | ? | ? | ? | ? | ? | ? |

2. **Data quality assessment:**
   - Are OM and BW from the same animals with timing alignment? (Required for organ-to-body weight ratio computation)
   - Is brain weight consistently recorded? (Required for Bailey organ-to-brain ratios for adrenal, ovaries)
   - What's the variance in study conduct dates? (HCD should be <5 years per Keenan 2009 STP best practices)
   - Are route of administration and vehicle recorded? (Needed for matched HCD queries)
   - What SEND domains are present and what's the terminology consistency?

3. **Decision recommendation:** Given the data available:
   - **Option A (static ranges):** Sufficient if CEBS has published summary statistics. Compile mean ± SD for top 15 organs × 3 strains × 2 sexes from published NTP papers or CEBS exports. Store as JSON config. Advantages: no external dependency, fast, deterministic. Disadvantage: can't match by route/vehicle/age.
   - **Option B (CEBS data tables):** Download individual animal data from CEBS. Build SQLite reference database. Compute percentiles at runtime for matched comparisons. Advantages: richer matching, strain-specific, age-adjusted. Disadvantage: data management, update cycle.
   - **Option C (dynamic sendigR):** Full sendigR integration with xptcleaner for terminology harmonization. Advantages: most comprehensive, updatable with customer's own data. Disadvantage: significant engineering, requires customer SEND data contribution.

   Recommend the minimum viable option that enables A-3 factor assessment for SD and Wistar Han rats in 28-day and 90-day studies.

### Key sources to investigate

- **NTP CEBS web interface:** https://ntp.niehs.nih.gov/data/controls — Navigate and document what's downloadable without API access. Check available strains, endpoint types, download formats.
- **Carfagna et al. 2021** (Chem Res Toxicol 34:483-494) — Describes querying 1,800+ SEND datasets to determine population frequencies. Documents data quality issues (field population ranging 6-99%). Check which fields are reliably populated.
- **Keenan et al. 2009** (Toxicol Pathol 37:679-693) — STP best practices for HCD use. Key constraint: HCD should be matched for strain, sex, age, laboratory, recent time period (<5 years). Document these matching criteria.
- **Steger-Hartmann et al. 2020** — "Virtual control groups" concept using historical control data from SEND datasets. Published in ALTEX. Describes methodology for using HCD as virtual controls.
- **sendigR documentation** (https://phuse-org.github.io/sendigR/) — Review what queries it supports, what matching criteria are available, what data quality issues it addresses.
- **Kluxen et al. 2024** — Analysis of JMPR 2004-2021 use of HCD. States HCD used "routinely and exclusively to avoid potential false positive decisions." Document how JMPR uses HCD and what their matching criteria are.

### What NOT to research

- How to compute statistical comparisons against HCD — the math is standard (percentile ranking, Z-score against HCD distribution).
- sendigR code architecture — we may not use sendigR; we need its data model, not its code.
- HCD for dog or NHP — start with rat and mouse only.

### Output format

A data availability report with the inventory table above, plus a concrete recommendation (A/B/C) with justification. If Option A is recommended, include the actual reference ranges for the top 10 organs × SD rat × both sexes as a starter dataset.

### Estimated scope

1.5 days. The primary effort is navigating the CEBS web interface and documenting what's actually downloadable, then pulling a sample dataset to assess quality.

---

## Brief 5: GRADE Temporal Dimension — Design Decision

### Research objective

Determine whether "temporal pattern" merits inclusion as a standalone sixth dimension in the GRADE-adapted confidence scoring framework, or whether it's already captured by existing dimensions (B-3 reversibility factor, dose-response quality). The current ECI has 5 dimensions. The regulatory audit proposed adding temporal pattern, HCD context, and cross-sex/cross-study consistency. HCD and consistency are clearly valuable additions. Temporal pattern is the ambiguous one.

### Specific question

In standard SEND repeat-dose toxicity studies (28-day, 90-day, chronic), what temporal information is actually available, and does it discriminate between finding confidence levels in a way not already captured by other dimensions?

### Deliverables

1. **Inventory of temporal data in SEND datasets** by domain:

| Domain | Temporal Data Available | Typical Timepoints | Informativeness for Confidence |
|---|---|---|---|
| LB (clinical pathology) | Multiple interim + terminal | Day 1, 7, 14, 28 (for 28-day); Day 1, 30, 60, 90 (for 90-day) | ? |
| BW (body weight) | Weekly measurements | Weekly | ? |
| OM (organ weight) | Terminal only (+ recovery) | Day 29 or 92; recovery Day 57 or 120 | ? |
| MI (histopathology) | Terminal only (+ recovery) | Terminal + recovery | ? |
| CL (clinical signs) | Daily/weekly observations | Throughout study | ? |
| FW (food/water) | Weekly measurements | Weekly | ? |

2. **Analysis:** For each domain with temporal data:
   - Does the time-course pattern (early onset vs. late onset, progressive vs. stable, reversing during dosing) actually add information about finding confidence beyond what dose-response quality and reversibility already capture?
   - Example: ALT elevation at Day 7 that normalizes by Day 28 while still on dose — is this different information from "reversible" (B-3 factor)? Does it change confidence?
   - Example: Body weight decrease that starts at Day 1 vs. Day 21 — does onset timing affect adversity classification? (Early onset suggests palatability/stress; late onset suggests cumulative toxicity.)

3. **Recommendation:** One of:
   - **Include as dimension 6:** If temporal patterns provide information not captured by dose-response + reversibility, define the scoring criteria (what upgrades/downgrades confidence based on temporal pattern).
   - **Merge into existing dimensions:** If temporal is essentially a sub-component of dose-response quality or reversibility, fold it into those dimensions with explicit temporal sub-criteria.
   - **Drop:** If temporal data is too sparse in standard SEND datasets to meaningfully score.

### Key sources to investigate

- **OECD TG 407/408/413** — Describe the required measurement timepoints for 28-day, 90-day, and chronic studies. What temporal resolution is mandated?
- **3–5 real FDA pharmacology/toxicology reviews** (Drugs@FDA) — Check how reviewers reference temporal patterns. Do they cite onset timing or time-course as part of their confidence assessment? Or do they only reference terminal findings?
- **GRADE framework (Schünemann et al.)** — In the original GRADE for clinical evidence, is there a temporal dimension? (There isn't explicitly, but "consistency" and "dose-response" may embed temporal elements.)
- **NTP Technical Report format** — How does NTP present temporal data in their reports? Do they discuss onset timing as part of their evidence level determinations?

### What NOT to research

- How to compute temporal metrics from SEND data — that's engineering.
- Recovery-period analysis — already implemented as B-3 reversibility.
- Time-course pharmacokinetics — out of scope for the assessment engine.

### Output format

A 1–2 page decision memo with the recommendation and rationale. If "include," provide the scoring criteria. If "merge," specify which existing dimension absorbs it and how.

### Estimated scope

Half a day. This is a design decision more than a literature question. The primary work is checking 3–5 real datasets/reviews to see whether temporal information is actually used in practice.

---

## Brief 6: Non-Tumor Progression Chains for ECETOC B-6

### Research objective

Enumerate the **10–15 most common generic (non-compound-specific) lesion progression chains** in repeat-dose toxicity studies, for encoding as ECETOC B-6 factor ("finding is a precursor to an established adverse progression"). The system currently only flags neoplastic progression (adenoma → carcinoma). Non-neoplastic progression chains (e.g., minimal tubular degeneration → cortical fibrosis → CPN) are not built.

### Specific deliverables

A table of progression chains with this structure:

| Organ | Early Lesion | Intermediate | Late/Severe | Evidence Source | Species-Specific? | Spontaneous? |
|---|---|---|---|---|---|---|
| Liver | Hepatocellular hypertrophy | Hepatocellular hyperplasia | Hepatocellular adenoma → carcinoma | Maronpot 2009 | More common in mice | Can be spontaneous |
| Kidney | Tubular basophilia/regeneration | Tubular degeneration | Interstitial fibrosis / CPN | Hard et al. | F344 rat CPN is spontaneous | Yes (CPN) |
| Thyroid | Follicular hypertrophy | Follicular hyperplasia | Follicular adenoma → carcinoma | Capen 1997 | Rodent-specific TSH response | Rare spontaneous |
| ? | ? | ? | ? | ? | ? | ? |

Each chain should include:
- **Trigger severity:** At what severity grade does the early lesion become a precursor concern? (Minimal hypertrophy ≠ concern; marked hypertrophy = concern.)
- **Species/strain specificity:** Some progressions are strain-specific (F344 rat mononuclear cell leukemia, B6C3F1 mouse liver tumors).
- **Spontaneous vs. treatment-induced:** Does this progression occur spontaneously at background rates? If so, the B-6 flag should only fire when incidence or severity exceeds HCD.
- **Time dependency:** Does progression require chronic exposure, or can it occur in subchronic studies?

### Key sources to investigate

- **Maronpot et al. 2004 or 2009** — "Biological basis of differential susceptibility to hepatocarcinogenesis." Liver progression chain.
- **Boorman et al.** or **NTP pathology tables** — Standard lesion progression patterns from NTP 2-year bioassays.
- **Hard & Khan 2004** (or equivalent) — Chronic progressive nephropathy in rats. The CPN progression chain is critical because it's spontaneous in aged rats and confounds treatment-related kidney findings.
- **Capen 1997** — Thyroid follicular cell progression from hypertrophy → hyperplasia → adenoma → carcinoma.
- **NTP Historical Controls** — Background incidence of progression-relevant lesions to set thresholds for when B-6 should fire.
- **Hardisty et al.** — Proliferative lesion nomenclature and progression criteria.
- **INHAND nomenclature** (International Harmonization of Nomenclature and Diagnostic Criteria) — May define progression relationships between lesion types within each organ.

### What NOT to research

- Compound-specific progression chains (e.g., specific drug's unique MOA leading to a unique lesion sequence) — these can't be pre-coded.
- Neoplastic grading criteria — not the focus; we need the pre-neoplastic → neoplastic chain, not how to grade the tumor itself.
- Carcinogenicity study design — the B-6 factor is about recognizing precursors in subchronic studies, not about running carcinogenicity studies.

### Output format

A YAML/JSON progression chain definition:
```yaml
progression_chains:
  - id: PC01
    organ: LIVER
    chain:
      - stage: early
        findings: ["HYPERTROPHY, HEPATOCELLULAR"]
        severity_trigger: "moderate or greater"
      - stage: intermediate
        findings: ["HYPERPLASIA, HEPATOCELLULAR"]
        severity_trigger: "any"
      - stage: late
        findings: ["ADENOMA, HEPATOCELLULAR", "CARCINOMA, HEPATOCELLULAR"]
    species_specific: "more common in B6C3F1 mouse"
    spontaneous_rate: "10-30% in 2-year B6C3F1 males"
    time_dependency: "typically requires >6 months exposure"
    source: "Maronpot 2009"
```

### Estimated scope

1–2 days. The liver, kidney (CPN), and thyroid chains are well-documented. Searching for less obvious non-neoplastic chains (e.g., minimal inflammation → fibrosis → organ failure for various organs) takes more digging.

---

## Summary of All Briefs

| Brief | Title | Blocks | Scope | Priority |
|---|---|---|---|---|
| 1 | Organ-specific HCD variability & magnitude thresholds | Phase 0 item 2A (organ thresholds) | 1–2 days | High |
| 2 | Non-liver adaptive response classification rules | Phase 1 items 1A + 2B (ECETOC B-2) | 2–3 days | High |
| 3 | Cross-domain concordance linkage map | Phase 1 items 1A + 4C (concordance) | 3–5 days | High |
| 4 | NTP CEBS historical control data profiling | Phase 2 item 3A (HCD integration) | 1.5 days | Medium |
| 5 | GRADE temporal dimension design decision | Phase 2 item 4A (confidence scoring) | 0.5 days | Low |
| 6 | Non-tumor progression chains (B-6) | Phase 1 item 1A (ECETOC B-6 factor) | 1–2 days | Low |

**Total estimated research time: 9.5–14 days**

Briefs 1–3 should run first (potentially in parallel) as they block the highest-priority implementation work. Brief 4 can follow once the threshold data from Brief 1 reveals whether CEBS adds value beyond published summary statistics. Brief 5 is a design decision that may resolve in a 30-minute discussion rather than formal research. Brief 6 is low priority because the B-6 factor has limited practical impact without compound-specific data.

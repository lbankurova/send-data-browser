# Clinical Insight Layer Design — Preclinical Tox Rules Engine

## 1. Clinical Catalog Entries

### CC-01: Reproductive Organ Atrophy / Degeneration (Male)

| Field | Value |
|---|---|
| **id** | `CC-01` |
| **finding/organ** | `specimen: testis, epididymis, seminal vesicle` / `finding: atrophy, degeneration, hypospermia, aspermia` (organ_system fallback: `male_reproductive`) |
| **clinical_class** | `Sentinel` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 1`, `min_incidence_treated: any`, `min_severity_grade: 1 (minimal)` |
| **corroboration** | `[organ_weight_decrease:testis, sperm_parameters:motility_decrease, sperm_parameters:count_decrease, hormone:testosterone_decrease, hormone:LH_increase]` |
| **rationale** | Testicular atrophy/degeneration is a sentinel finding per ICH S5(R3) and FDA guidance. Even minimal-grade findings in a single animal may indicate irreversible reproductive toxicity. Regulatory agencies treat this as adverse regardless of statistical significance. |
| **notes** | Strain-specific background incidence matters (e.g., aged Sprague-Dawley). For juvenile studies, distinguish developmental delay from toxicity. In aged animals with high background, require ≥grade 2 or dose-response for elevation. |

### CC-02: Reproductive Organ Atrophy / Degeneration (Female)

| Field | Value |
|---|---|
| **id** | `CC-02` |
| **finding/organ** | `specimen: ovary, uterus` / `finding: atrophy, degeneration, decreased corpora lutea` (organ_system fallback: `female_reproductive`) |
| **clinical_class** | `Sentinel` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 1`, `min_incidence_treated: any`, `min_severity_grade: 1` |
| **corroboration** | `[organ_weight_decrease:ovary, organ_weight_decrease:uterus, estrous_cycle:prolonged_diestrus, hormone:estradiol_decrease]` |
| **rationale** | Female reproductive atrophy is a sentinel finding with potential for irreversible fertility impairment. Ovarian findings are particularly critical since oocyte reserve cannot regenerate. |
| **notes** | Estrous cycling status must be factored. In aged females, background ovarian atrophy is expected—require dose-response or severity increase above concurrent controls. |

### CC-03: Malignant Neoplasia (Any Organ)

| Field | Value |
|---|---|
| **id** | `CC-03` |
| **finding/organ** | `specimen: any` / `finding: carcinoma, sarcoma, lymphoma, malignant *` (organ_system fallback: `any`) |
| **clinical_class** | `Sentinel` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 1`, `min_incidence_treated: any`, `min_severity_grade: N/A` |
| **corroboration** | `[preneoplastic_findings:hyperplasia, preneoplastic_findings:metaplasia, preneoplastic_findings:foci_of_cellular_alteration, survival:decreased]` |
| **rationale** | Any treatment-related malignant neoplasm is adverse by definition. Even a single occurrence in a treated group with zero control incidence warrants regulatory flagging. Historical control data informs but does not override concurrent control comparison. |
| **notes** | For common background tumors (e.g., F344 rat: testicular interstitial cell, pituitary), compare against both concurrent and historical control ranges. Benign neoplasia should be cataloged separately (see CC-04). Combine benign + malignant of same morphologic type per IARC/NTP convention when assessing trend. |

### CC-04: Benign Neoplasia (Common Background Tumors)

| Field | Value |
|---|---|
| **id** | `CC-04` |
| **finding/organ** | `specimen: any` / `finding: adenoma, fibroma, benign *` |
| **clinical_class** | `ContextDependent` |
| **elevate_to** | `none` (escalate to `Adverse` only if exceeds historical control range OR shows significant dose-response) |
| **threshold_overrides** | `min_n_affected: 2`, `min_incidence_treated: exceeds_HCD_range`, `min_severity_grade: N/A` |
| **corroboration** | `[preneoplastic_findings:hyperplasia, malignant_counterpart:present, survival:not_decreased]` |
| **rationale** | Benign neoplasia must be evaluated against historical control data. Isolated occurrences within HCD range are generally not treatment-related. However, combine with malignant counterpart for trend analysis per regulatory convention. |
| **notes** | Requires HCD lookup. Strain/species/lab-specific background rates are essential. If HCD unavailable, treat as HighConcern and escalate. |

### CC-05: Neurotoxic Injury

| Field | Value |
|---|---|
| **id** | `CC-05` |
| **finding/organ** | `specimen: brain, spinal_cord, sciatic_nerve, peripheral_nerve` / `finding: necrosis, degeneration, gliosis, demyelination, axonal_degeneration, neuronal_necrosis` (organ_system fallback: `nervous`) |
| **clinical_class** | `Sentinel` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 1`, `min_incidence_treated: any`, `min_severity_grade: 1` |
| **corroboration** | `[FOB:abnormal, motor_activity:decreased, clinical_signs:tremors, clinical_signs:convulsions, clinical_signs:ataxia]` |
| **rationale** | Neural tissue has minimal regenerative capacity. Any treatment-related neurodegeneration or necrosis is adverse. Background incidence of neuronal necrosis is essentially zero in young adult rodents. |
| **notes** | Age-related neurodegeneration in aged animals (≥18 months) requires careful HCD comparison. Gliosis alone (without neuronal damage) may be ContextDependent. Peripheral neuropathy findings should trigger review of clinical sign data. |

### CC-06: Bone Marrow Hypocellularity / Aplasia

| Field | Value |
|---|---|
| **id** | `CC-06` |
| **finding/organ** | `specimen: bone_marrow, sternum, femur` / `finding: hypocellularity, aplasia, decreased_cellularity, necrosis` (organ_system fallback: `hematopoietic`) |
| **clinical_class** | `Sentinel` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 1`, `min_incidence_treated: any`, `min_severity_grade: 1` |
| **corroboration** | `[hematology:WBC_decrease, hematology:RBC_decrease, hematology:platelet_decrease, hematology:reticulocyte_decrease, clinical_signs:pallor, spleen:extramedullary_hematopoiesis]` |
| **rationale** | Bone marrow suppression indicates serious hematotoxicity with potential for life-threatening cytopenias. Even minimal hypocellularity in a single animal warrants flagging given near-zero background incidence and clinical severity. |
| **notes** | Distinguish from marrow fat infiltration in aged/obese animals. Extramedullary hematopoiesis in spleen corroborates bone marrow suppression. Sectoral hypocellularity (focal) may be ContextDependent; diffuse is always Sentinel. |

### CC-07: Liver Necrosis / Degeneration

| Field | Value |
|---|---|
| **id** | `CC-07` |
| **finding/organ** | `specimen: liver` / `finding: necrosis, degeneration, hepatocellular_necrosis, single_cell_necrosis, centrilobular_necrosis` |
| **clinical_class** | `HighConcern` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 1`, `min_incidence_treated: any`, `min_severity_grade: 2 (mild)` for degeneration; `1 (minimal)` for necrosis |
| **corroboration** | `[clinical_chemistry:ALT_increase, clinical_chemistry:AST_increase, clinical_chemistry:ALP_increase, clinical_chemistry:bilirubin_increase, organ_weight_increase:liver, liver:hepatocellular_hypertrophy]` |
| **rationale** | Hepatocellular necrosis is always adverse at any severity. Degeneration at minimal grade alone may be adaptive but becomes adverse at mild or above, or when corroborated by enzyme elevations. |
| **notes** | Single-cell necrosis at minimal grade without enzyme changes may be background (some strains). Centrilobular necrosis has higher specificity for toxicity than random single-cell necrosis. Liver hypertrophy alone is generally adaptive (see CC-10). |

### CC-08: Kidney Tubular Necrosis

| Field | Value |
|---|---|
| **id** | `CC-08` |
| **finding/organ** | `specimen: kidney` / `finding: tubular_necrosis, cortical_necrosis, tubular_degeneration, papillary_necrosis` |
| **clinical_class** | `HighConcern` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 1`, `min_incidence_treated: any`, `min_severity_grade: 1` |
| **corroboration** | `[clinical_chemistry:BUN_increase, clinical_chemistry:creatinine_increase, urinalysis:proteinuria, urinalysis:cast_increase, organ_weight_increase:kidney, kidney:tubular_basophilia]` |
| **rationale** | Renal tubular necrosis indicates direct nephrotoxicity. Functionally significant even at minimal grade. Tubular basophilia (regeneration) corroborates prior injury. |
| **notes** | Chronic progressive nephropathy (CPN) in male rats is a common background finding—must distinguish from treatment-related tubular injury. Alpha-2u-globulin nephropathy in male rats is species-specific and generally not human-relevant per EPA guidance. |

### CC-09: Injection/Application Site Reactions

| Field | Value |
|---|---|
| **id** | `CC-09` |
| **finding/organ** | `specimen: injection_site, application_site` / `finding: necrosis, inflammation, edema, hemorrhage, fibrosis` |
| **clinical_class** | `ContextDependent` |
| **elevate_to** | `none` (elevate to `Adverse` only if: necrosis present, or severity ≥ grade 3, or exceeds vehicle control) |
| **threshold_overrides** | `min_n_affected: 2`, `min_incidence_treated: exceeds_vehicle_control`, `min_severity_grade: 2` |
| **corroboration** | `[clinical_signs:injection_site_swelling, clinical_signs:injection_site_scab]` |
| **rationale** | Local tolerability findings are expected with many formulations. Adversity depends on severity relative to vehicle control. However, necrosis at injection site is always flagged. |
| **notes** | Route-dependent evaluation. SC and IM routes have higher background inflammation than IV. Compare against vehicle control, not untreated control. |

### CC-10: Liver Hypertrophy (Adaptive)

| Field | Value |
|---|---|
| **id** | `CC-10` |
| **finding/organ** | `specimen: liver` / `finding: hepatocellular_hypertrophy, centrilobular_hypertrophy` |
| **clinical_class** | `ModerateConcern` |
| **elevate_to** | `none` (unless accompanied by degenerative/necrotic changes or persistent enzyme elevation) |
| **threshold_overrides** | `min_n_affected: 3`, `min_incidence_treated: 0.20`, `min_severity_grade: 2` |
| **corroboration** | `[organ_weight_increase:liver, liver:necrosis, liver:degeneration, clinical_chemistry:ALT_increase, enzyme_induction:CYP_increase]` |
| **rationale** | Isolated hepatocellular hypertrophy is generally adaptive (enzyme induction) per FDA and EMEA guidance. Becomes adverse only when accompanied by degenerative changes, persistent transaminase elevation, or cell proliferation. |
| **notes** | In mouse, centrilobular hypertrophy with hepatocellular proliferation has carcinogenic relevance. Species and duration context required. |

### CC-11: Thyroid Follicular Hypertrophy/Hyperplasia

| Field | Value |
|---|---|
| **id** | `CC-11` |
| **finding/organ** | `specimen: thyroid` / `finding: follicular_hypertrophy, follicular_hyperplasia` |
| **clinical_class** | `ModerateConcern` |
| **elevate_to** | `none` (unless neoplasia is present or TSH elevation confirmed without hepatic enzyme induction explanation) |
| **threshold_overrides** | `min_n_affected: 3`, `min_incidence_treated: 0.20`, `min_severity_grade: 2` |
| **corroboration** | `[hormone:TSH_increase, hormone:T4_decrease, hormone:T3_decrease, liver:hepatocellular_hypertrophy, thyroid:follicular_adenoma]` |
| **rationale** | Often secondary to hepatic enzyme induction (increased T4 clearance → TSH elevation → thyroid stimulation). This mechanism is rat-specific and generally not human-relevant per FDA/EMEA guidance. Requires MOA assessment. |
| **notes** | If no hepatic enzyme induction explanation, treat as HighConcern. Direct thyroid toxicants (e.g., PTU-like) require different assessment. In carcinogenicity studies, link to follicular neoplasia. |

### CC-12: Adrenal Cortical Hypertrophy / Vacuolation

| Field | Value |
|---|---|
| **id** | `CC-12` |
| **finding/organ** | `specimen: adrenal_gland` / `finding: cortical_hypertrophy, cortical_vacuolation` |
| **clinical_class** | `ModerateConcern` |
| **elevate_to** | `none` (elevate to `Adverse` if accompanied by cortical necrosis/degeneration or HPA axis disruption) |
| **threshold_overrides** | `min_n_affected: 3`, `min_incidence_treated: 0.20`, `min_severity_grade: 2` |
| **corroboration** | `[hormone:cortisol_change, hormone:ACTH_change, adrenal:cortical_necrosis, clinical_signs:stress_related]` |
| **rationale** | Adrenal cortical hypertrophy may be adaptive (stress-related) or indicate direct adrenotoxicity. Vacuolation often reflects lipid accumulation from impaired steroidogenesis. |
| **notes** | Stress-related changes are common in tox studies and are generally not considered direct toxicity. Distinguish from phospholipidosis. |

### CC-13: Lymphoid Depletion / Thymic Atrophy

| Field | Value |
|---|---|
| **id** | `CC-13` |
| **finding/organ** | `specimen: thymus, spleen, lymph_node` / `finding: lymphoid_depletion, atrophy, decreased_cellularity, apoptosis_increase` (organ_system fallback: `immune`) |
| **clinical_class** | `HighConcern` |
| **elevate_to** | `Adverse` |
| **threshold_overrides** | `min_n_affected: 2`, `min_incidence_treated: 0.10`, `min_severity_grade: 2` |
| **corroboration** | `[hematology:lymphocyte_decrease, organ_weight_decrease:thymus, organ_weight_decrease:spleen, immunotox:T_cell_decrease, globulin:decrease]` |
| **rationale** | Lymphoid depletion indicates immunotoxicity. Thymic atrophy combined with lymphocyte decreases is a red flag for immunosuppression. ICH S8 guidance requires follow-up immunotoxicity assessment. |
| **notes** | Stress-related thymic atrophy is common and must be distinguished from direct immunotoxicity. Requires assessment of corticosterone/cortisol levels and clinical condition. If body weight decrease >10%, may be secondary to inanition. |

---

## 2. Protective Plausibility Exclusions

### PE-01: Reproductive Organ Findings — Never Protective

| Field | Value |
|---|---|
| **id** | `PE-01` |
| **excluded_organ_systems** | `[male_reproductive, female_reproductive]` |
| **excluded_findings** | `[atrophy, degeneration, hypospermia, aspermia, decreased_corpora_lutea, any_finding_in_reproductive_organs]` |
| **exclusion_conditions** | All findings in reproductive organs where incidence decreases with dose |
| **rationale** | A decrease in incidence of reproductive findings with dose is biologically implausible as a "protective" effect. Decreasing incidence of reproductive pathology more likely reflects: (a) background variability in small groups, (b) survivor selection bias, or (c) reproductive suppression masking the endpoint (e.g., testicular atrophy eliminates the substrate for spermatogenic staging abnormalities). Labeling such decreases as "protective" is misleading and would be challenged by regulators. |
| **recommended_engine_behavior** | Suppress `Protective` label entirely. Downgrade to `Informational` with note: "Incidence decrease in reproductive organ — not biologically interpretable as protective. Review for suppression effects or background variability." Never apply R10/effect-size rules in protective direction for these organs. |

### PE-02: Neoplasia — Never Protective (Without Explicit Justification)

| Field | Value |
|---|---|
| **id** | `PE-02` |
| **excluded_findings** | `[carcinoma, sarcoma, lymphoma, adenoma, fibroma, any neoplastic finding]` |
| **exclusion_conditions** | Any decrease in tumor incidence in treated groups vs. control |
| **rationale** | Decreased tumor incidence should not be labeled "protective" because: (a) in most standard tox studies, tumor incidence is too low and group sizes too small for meaningful protective claims; (b) decreased food consumption/body weight (common toxicity) independently reduces tumor incidence (especially in rats), confounding any protective interpretation; (c) regulatory agencies do not credit "chemoprotective" claims from standard tox studies; (d) survival differences create competing-risk artifacts. A genuine chemoprotective claim requires dedicated carcinogenicity study design with appropriate power. |
| **recommended_engine_behavior** | Suppress `Protective` label. If decrease is statistically significant AND monotonic AND survival is equivalent across groups, downgrade to `Informational` with note: "Decreased tumor incidence observed; likely secondary to decreased food consumption/body weight or survival differences. Not interpretable as protective in standard tox study design." Require: `(1) monotonic decrease, (2) equivalent survival, (3) equivalent body weight trajectories, (4) baseline incidence >15%` for ANY protective-adjacent commentary. |

### PE-03: Low Baseline Incidence Findings — Guard Against False Protective

| Field | Value |
|---|---|
| **id** | `PE-03` |
| **exclusion_conditions** | `control_incidence < 15%` AND `finding_incidence_treated < control_incidence` |
| **rationale** | When control group incidence is low (e.g., 1/10 = 10%, 2/15 = 13%), any decrease to 0% in treated groups is within normal variability and carries no statistical or biological meaning. The power to detect a true decrease from a 10% baseline in groups of 10–15 animals is negligible. |
| **recommended_engine_behavior** | If `control_incidence < 0.15`: suppress `Protective` label entirely. If `control_incidence >= 0.15 AND < 0.30`: require monotonic decrease AND statistical significance (Fisher exact p < 0.05) to even flag as `Informational`. If `control_incidence >= 0.30`: allow `Trend` label but still not `Protective` unless all PE-02 criteria are also met. |

### PE-04: Body Weight / Food Consumption — Confounded Protective

| Field | Value |
|---|---|
| **id** | `PE-04` |
| **excluded_findings** | `[body_weight_decrease, food_consumption_decrease]` (when used as "protective" against other findings) |
| **exclusion_conditions** | Engine attempts to label reduced body weight or food consumption as "protective" |
| **rationale** | Decreased body weight and food consumption are toxicity indicators. They confound interpretation of many other endpoints (tumor incidence, organ weights, clinical chemistry). They must never be labeled protective. |
| **recommended_engine_behavior** | Body weight decrease > 10% from control should be flagged as a confounding factor for all concurrent findings in same dose group. Add covariate flag `bw_confounded: true` to all findings in groups with >10% BW decrease. Never label BW or FC decreases as protective. |

### PE-05: Mortality / Survival-Related Endpoint Decreases

| Field | Value |
|---|---|
| **id** | `PE-05` |
| **exclusion_conditions** | Finding incidence decreases in groups with decreased survival relative to control |
| **rationale** | If animals die before lesions develop, incidence of chronic findings will be artifactually lower. This is survivor bias, not a protective effect. |
| **recommended_engine_behavior** | If `survival_treated < survival_control - 10%` (percentage points): suppress all `Protective` labels in that dose group. Flag all decreasing findings as `Survival-Confounded`. Require severity-adjusted analysis (e.g., Poly-k test for carcinogenicity data). |

---

## 3. Confidence Threshold Tuning

### 3.1 Assessment of Defaults

#### Low Confidence — **Adjust**

**Your default:** n_affected == 1 (non-sentinel) OR control incidence < 10% OR effect-size-only OR non-monotonic without Tier1/corroboration.

**Issues:**
- The OR logic is too broad. A finding with n_affected=3, good dose-response, AND control incidence < 10% would be Low simply because of the control incidence criterion. Low control incidence doesn't mean low confidence—it can mean the finding is rare and therefore *more* significant when it occurs in treated animals.
- Effect-size-only is correctly Low *unless* effect size is very large (Cohen's d > 2.0 with n ≥ 3).
- Non-monotonic pattern should trigger Low only if there's no threshold explanation (e.g., findings at high-dose only is threshold, not non-monotonic).

**Adjusted Low:**
```
Low IF:
  (n_affected == 1 AND clinical_class != Sentinel)
  OR (effect_size_only AND (cohen_d < 2.0 OR n_affected < 3))
  OR (non_monotonic AND NOT threshold_pattern AND no_Tier1_significance AND no_corroboration)
```

Note: Control incidence < 10% removed as standalone Low trigger. Instead, low control incidence feeds into protective plausibility exclusions (Section 2).

#### Medium Confidence — **Adjust**

**Your default:** n_affected >= 2 OR incidence >= 10% plus ≥1 supporting factor.

**Issues:**
- The OR between n_affected >= 2 and incidence >= 10% is redundant (incidence >= 10% with n=10 means n_affected >= 1, with n=15 means n_affected >= 2). Define in terms of `max(min_n, ceil(min_incidence × n_group))`.
- "At least one supporting factor" is good but should be enumerated to avoid ambiguity.

**Adjusted Medium:**
```
Medium IF NOT Low AND:
  n_affected >= 2
  AND at least ONE of:
    - monotonic or threshold dose-response pattern
    - any statistical significance (p < 0.05, trend or pairwise)
    - corroboration from ≥1 related domain/finding
    - severity grade increase with dose
    - clinical_class is HighConcern or Sentinel
```

#### High Confidence — **Adjust**

**Your default:** n_affected >= 3 OR incidence >= 20% AND monotonic/threshold AND corroboration.

**Issues:**
- "OR" between n_affected >= 3 and incidence >= 20% should be AND (both should be met) to avoid upgrading a 3/15 = 20% incidence finding with no other evidence to High.
- Corroboration should require cross-domain, not just related findings within same domain.

**Adjusted High:**
```
High IF:
  n_affected >= max(3, ceil(0.20 × n_group))
  AND (monotonic OR threshold) dose-response
  AND at least ONE of:
    - statistical significance (trend_p < 0.05 OR pairwise_p < 0.05 at ≥1 dose)
    - cross-domain corroboration (e.g., histopath + clinical_chem + organ_weight)
  
  OR (clinical_class == Sentinel AND n_affected >= 1 AND dose_response_present)
```

### 3.2 Group Size Pitfalls

| Group Size | Pitfall | Mitigation |
|---|---|---|
| **n = 10** | 1/10 = 10% incidence easily triggers thresholds; Fisher's exact has very low power (can't detect <40% difference reliably). | Don't rely on statistical significance alone. Require biological plausibility + dose-response pattern. A single-animal finding (10%) should remain Low unless Sentinel. |
| **n = 15** | 2/15 = 13% — marginal for Medium confidence. Better power than n=10 but still insufficient for rare findings. | For n=15, the 2-animal minimum is sound. But 2/15 with no dose-response should stay Low-Medium boundary. |
| **Both** | Effect-size metrics (Cohen's d) are unreliable at these sample sizes; confidence intervals are enormous. | Always pair effect-size with n_affected count. Never elevate based on effect-size alone when n_group < 20. |

### 3.3 Example Scenarios

| # | Scenario | n_group | n_affected | Pattern | Significance | Corroboration | Clinical Class | → Confidence |
|---|---|---|---|---|---|---|---|---|
| 1 | Testicular atrophy, high-dose only, 1 animal | 10 | 1 | threshold | none | none | Sentinel | **High** (Sentinel exception: n=1 + dose-response sufficient) |
| 2 | Liver single-cell necrosis, mid+high dose, 2 animals each | 10 | 2 (mid), 3 (high) | monotonic | trend_p=0.03 | ALT ↑ | HighConcern | **High** (n≥3, monotonic, significant, corroborated) |
| 3 | Kidney tubular basophilia, high-dose only, 1 animal | 15 | 1 | threshold | none | no BUN/creat change | HighConcern | **Low** (n=1, non-sentinel class, no corroboration) |
| 4 | Lung alveolar macrophage accumulation, all dose groups, non-monotonic | 10 | 3, 1, 4 | non-monotonic | none | none | ContextDependent | **Low** (non-monotonic, no significance, no corroboration) |
| 5 | Lymphoid depletion thymus + lymphocyte decrease, mid+high | 10 | 0, 2, 4 | monotonic | trend_p=0.01 | lymphocyte ↓ | HighConcern | **High** (n≥3, monotonic, significant, cross-domain corroboration) |
| 6 | Liver hypertrophy, all dose groups, dose-responsive | 15 | 2, 5, 10 | monotonic | pairwise p<0.01 high | liver wt ↑ | ModerateConcern | **High** (n=10 at high, monotonic, significant, corroborated) |
| 7 | Adrenal vacuolation, high-dose only, 2 animals | 10 | 2 | threshold | none | no hormone data | ModerateConcern | **Medium** (n=2, threshold pattern, but no significance or corroboration—only one supporting factor) |
| 8 | Mammary gland fibroadenoma, 1 animal in mid-dose, 0 in high | 15 | 1 | non-monotonic | none | none | ContextDependent | **Low** (n=1, non-sentinel, non-monotonic, no support) |

---

## 4. R10 Minimum Support Thresholds

### Verdict: **Adjust**

Your proposed `n_affected >= 2 AND incidence >= 10%` is a reasonable starting point but has issues:

1. **Rigidity with group size.** At n=10, `incidence >= 10%` means n_affected >= 1, so the n_affected >= 2 criterion dominates and incidence is redundant. At n=15, 2/15 = 13.3% passes both. At n=20, 2/20 = 10% passes both. The thresholds effectively reduce to just "n_affected >= 2" for typical tox group sizes.

2. **No sentinel exception.** A single animal with testicular atrophy and a massive Cohen's d should not be suppressed.

### Recommended Formula

```
R10_minimum_support(n_group, clinical_class):

  IF clinical_class IN [Sentinel]:
    RETURN n_affected >= 1  # No minimum suppression for sentinels
    # But: append flag "sentinel_single_animal: true" for transparency

  ELSE:
    min_n = 2
    min_incidence = max(0.10, 2 / n_group)
    RETURN n_affected >= min_n AND incidence_treated >= min_incidence
```

**Behavior:** `max(0.10, 2/n_group)` ensures:
- For small groups, the 2-animal minimum drives the threshold (which is always ≥10% when n ≤ 20).
- For larger groups (n > 20), the 10% floor prevents low-incidence noise from triggering.

### Sentinel Exception Policy

Sentinel findings (CC-01, CC-02, CC-03, CC-05, CC-06) bypass the R10 minimum support guard entirely. The engine should:
1. Allow effect-size rules to fire for n_affected = 1.
2. Append a transparency flag: `"sentinel_exception": true, "review_recommended": true`.
3. Still apply confidence scoring (which will assign Low-Medium for a sentinel with n=1 and no corroboration, or High if dose-response is present).

### Examples

#### Group Size = 10

| Scenario | n_affected | incidence | min_incidence = max(0.10, 2/10) = 0.20 | Passes R10? |
|---|---|---|---|---|
| Non-sentinel, 1 animal affected | 1 | 0.10 | 0.20 | **No** — suppressed (n < 2, incidence < 0.20) |
| Non-sentinel, 2 animals affected | 2 | 0.20 | 0.20 | **Yes** — passes both criteria |
| Sentinel (testicular atrophy), 1 animal | 1 | 0.10 | N/A (sentinel bypass) | **Yes** — sentinel exception applies |

#### Group Size = 15

| Scenario | n_affected | incidence | min_incidence = max(0.10, 2/15) = 0.133 | Passes R10? |
|---|---|---|---|---|
| Non-sentinel, 1 animal affected | 1 | 0.067 | 0.133 | **No** — suppressed |
| Non-sentinel, 2 animals affected | 2 | 0.133 | 0.133 | **Yes** — passes (exactly at threshold) |
| Non-sentinel, 2 animals affected, one severity grade 1 | 2 | 0.133 | 0.133 | **Yes** — passes; confidence determined by Section 3 |
| Sentinel (neuronal necrosis), 1 animal | 1 | 0.067 | N/A (sentinel bypass) | **Yes** — sentinel exception |

---

## 5. Unit Tests

### UT-01: Sentinel Single Animal — Must Not Be Suppressed

```yaml
test_id: UT-01
description: "Single animal with testicular atrophy at high dose should be flagged Adverse with High confidence"
input:
  finding: testicular_atrophy
  specimen: testis
  rule_hits: [R03_incidence, R10_effect_size]
  n_group: 10
  n_affected: {control: 0, low: 0, mid: 0, high: 1}
  severity: {high: [grade_2]}
  dose_response: threshold
  corroboration: []
expected:
  clinical_class: Sentinel (CC-01)
  R10_guard: PASS (sentinel exception)
  confidence: High (sentinel + dose-response)
  elevate_to: Adverse
  protective_label: N/A
```

### UT-02: Effect-Size Alarm on n=1 Non-Sentinel — Must Be Suppressed

```yaml
test_id: UT-02
description: "Single animal with kidney tubular basophilia, large Cohen's d — R10 should suppress"
input:
  finding: tubular_basophilia
  specimen: kidney
  rule_hits: [R10_effect_size]
  n_group: 10
  n_affected: {control: 0, low: 0, mid: 0, high: 1}
  severity: {high: [grade_1]}
  dose_response: threshold
  corroboration: []
expected:
  clinical_class: ModerateConcern
  R10_guard: FAIL (n_affected=1 < 2, not sentinel)
  confidence: Low
  signal_suppressed: true
```

### UT-03: Protective Label on Reproductive Organ — Must Be Blocked

```yaml
test_id: UT-03
description: "Ovarian atrophy incidence decreases with dose — must not be labeled protective"
input:
  finding: ovarian_atrophy
  specimen: ovary
  direction: decrease
  n_group: 10
  incidence: {control: 0.20, low: 0.10, mid: 0.10, high: 0.00}
  dose_response: monotonic_decrease
expected:
  protective_label: BLOCKED (PE-01)
  output_label: Informational
  output_note: "Incidence decrease in reproductive organ — not biologically interpretable as protective"
```

### UT-04: Duplicate Categorization — Adverse + Trend Must Consolidate

```yaml
test_id: UT-04
description: "Liver necrosis triggers both R01 (adverse) and R05 (trend) — must consolidate to single Adverse"
input:
  finding: hepatocellular_necrosis
  specimen: liver
  rule_hits: [R01_adverse_threshold, R05_trend]
  n_group: 10
  n_affected: {control: 0, low: 0, mid: 1, high: 3}
  significance: {trend_p: 0.02, pairwise_high_p: 0.01}
expected:
  deduplication: R01 and R05 consolidated into single insight
  final_category: Adverse
  confidence: High
  supporting_evidence: ["R01: threshold exceeded", "R05: significant trend p=0.02"]
  duplicate_entries: 0
```

### UT-05: Contradictory Narrative — Significant Trend + "Inconsistent" Must Resolve

```yaml
test_id: UT-05
description: "Finding with significant trend (p=0.03) but non-monotonic incidence pattern — narrative must not say 'inconsistent'"
input:
  finding: alveolar_macrophage_accumulation
  specimen: lung
  rule_hits: [R05_trend, R07_pattern]
  n_group: 10
  incidence: {control: 0.10, low: 0.30, mid: 0.10, high: 0.40}
  significance: {trend_p: 0.03}
  dose_response: non_monotonic
expected:
  narrative_must_not_contain: ["inconsistent with trend", "no clear pattern"]
  correct_narrative: "Significant positive trend (p=0.03) with non-monotonic dose-response. Mid-dose dip may reflect biological variability; finding driven by low and high dose increases."
  confidence: Medium (significant trend but non-monotonic)
```

### UT-06: Neoplasia Decrease — Must Not Be Protective

```yaml
test_id: UT-06
description: "Mammary fibroadenoma incidence decreases in treated groups — must not be protective"
input:
  finding: mammary_fibroadenoma
  specimen: mammary_gland
  direction: decrease
  n_group: 15
  incidence: {control: 0.27, low: 0.20, mid: 0.13, high: 0.07}
  body_weight: {control: 350g, high: 310g}  # 11.4% decrease
  survival: equivalent
expected:
  protective_label: BLOCKED (PE-02)
  confound_flag: bw_confounded (PE-04, BW decrease >10%)
  output_label: Informational
  output_note: "Decreased tumor incidence likely secondary to body weight reduction"
```

### UT-07: Low Baseline Protective — Must Be Suppressed

```yaml
test_id: UT-07
description: "Rare finding (1/10 control) absent in all treated groups — not protective"
input:
  finding: hepatic_lipidosis
  specimen: liver
  direction: decrease
  n_group: 10
  incidence: {control: 0.10, low: 0.00, mid: 0.00, high: 0.00}
expected:
  protective_label: BLOCKED (PE-03, control incidence < 15%)
  output_label: SUPPRESSED
  reasoning: "Control incidence 10% — absence in treated groups is within normal variability for n=10"
```

### UT-08: Confidence Escalation with Corroboration

```yaml
test_id: UT-08
description: "Bone marrow hypocellularity with hematology corroboration should reach High confidence"
input:
  finding: bone_marrow_hypocellularity
  specimen: sternum
  rule_hits: [R01, R05]
  n_group: 10
  n_affected: {control: 0, low: 0, mid: 1, high: 3}
  dose_response: monotonic
  significance: {trend_p: 0.02}
  corroboration: [WBC_decrease, reticulocyte_decrease, platelet_decrease]
expected:
  clinical_class: Sentinel (CC-06)
  confidence: High
  elevate_to: Adverse
  corroboration_count: 3 (cross-domain: hematology)
  R10_guard: PASS (sentinel exception even for mid-dose n=1)
```

---

## Notes on Implementation

**Configurability:** All numeric thresholds (min_n_affected, min_incidence, severity grades, p-value cutoffs) should be stored as configurable parameters, not hardcoded. The values above are *pragmatic regulatory defaults*—study-specific overrides (species, strain, study type, duration) are expected and should be supported.

**Internal consistency checks the engine should enforce:**
1. No finding may carry both `Adverse` and `Protective` labels simultaneously.
2. No finding may appear in more than one insight row (deduplication is mandatory).
3. Sentinel findings must bypass R10 suppression.
4. Protective exclusions (PE-01 through PE-05) take precedence over any rule that would assign a `Protective` label.
5. Confidence level must be computable for every retained signal; signals that cannot be scored should be flagged for manual review.

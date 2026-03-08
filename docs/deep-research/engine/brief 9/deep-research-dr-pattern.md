# No authoritative equivalence band threshold table exists — here is what does

**No regulatory agency, standards body, or professional society has published a lookup table of equivalence band thresholds by species, sex, and endpoint for dose-response trend classification in preclinical toxicology.** This gap is not an oversight but reflects a deliberate reliance on expert toxicological judgment. The closest published framework — EFSA's ±1.0 pooled SD — applies a single blanket threshold across all continuous endpoints and was developed for GMO safety assessment, not pharmaceutical toxicology. Every other source is either silent on specific thresholds or explicitly delegates the choice to sponsors. What follows is the most complete synthesis achievable from seven distinct evidence streams, with gaps flagged for validation against labeled study data.

---

## The field's only published threshold: EFSA's ±1.0 SD

The sole explicit, published equivalence threshold for continuous toxicology endpoints comes from the **EFSA Scientific Committee (2011)**, which proposed **±1.0 pooled SD as equivalence limits** for Standardized Effect Sizes (SES) in 90-day rodent feeding studies. The rationale: "standardised effect sizes of up to this magnitude seem to have little biological relevance in relation to toxicity." Van der Voet et al. (2017, *Archives of Toxicology* 91:3209–3227) implemented this framework, pooling SD across all groups (including control) and applying it uniformly to hematology, clinical chemistry, and organ weights.

This ±1.0 SD threshold has been criticized on fundamental grounds. Delaney et al. (2018, *J. Agric. Food Chem.* 66:6048–6063) noted the circularity of using the same experimental data to estimate both the effect size and the comparison threshold. The pooled SD is influenced by treatment effects themselves — if a treatment increases variability, the threshold widens, potentially masking the effect. The **U.S. EPA Benchmark Dose Technical Guidance (2012)** independently converged on **1 SD shift in the mean** as the default Benchmark Response (BMR) for continuous data, corresponding to approximately **10% extra risk** under normal distribution assumptions. Neither source provides endpoint-specific, species-specific, or sex-specific multipliers.

No pharmaceutical regulatory agency — **FDA, EMA, PMDA** — has endorsed or referenced the EFSA equivalence framework. No ICH guideline (including S3A, S7A, M3) addresses equivalence bands. The pharmaceutical nonclinical space relies entirely on weight-of-evidence NOAEL determination by expert judgment.

---

## OECD test guidelines are silent on statistical specifics

All five relevant OECD Test Guidelines (407, 408, 412, 413, 453) use nearly identical boilerplate language requiring **"appropriate and generally acceptable statistical methods"** without specifying any particular test, threshold, SD calculation, or classification scheme. TG 407 (revised 2008) adds only that analysts should "avoid the use of multiple t-tests." TG 453 defers to **Guidance Document 116** for chronic/carcinogenicity statistical methods, but GD 116 addresses only tumor trend analysis and survival adjustment — not continuous endpoint equivalence bands.

Critically, no OECD TG specifies:

- Equivalence thresholds or fold-change criteria for any endpoint
- Whether to use pooled SD versus control-only SD
- Dose-response pattern classification methodology
- Specific trend tests (Jonckheere-Terpstra, Williams, Dunnett)
- Effect size thresholds distinguishing biological from statistical significance
- Power analysis requirements or minimum detectable effect sizes

The gap between the guidelines' vague statistical requirement and the infrastructure needed for automated equivalence band classification is vast and intentional. OECD relies on professional scientific judgment rather than algorithmic decision rules.

---

## Pooled SD versus control-only SD: no consensus, but standard practice leans toward ANOVA MSE

Two fundamentally different approaches exist for the SD used in equivalence bands, and **no toxicology-specific guidance explicitly compares them**:

| Approach | SD includes control? | Formula | Rationale | Key source |
|---|---|---|---|---|
| **ANOVA MSE (pooled across all groups)** | Yes — all k groups | SD = √[Σ(nᵢ−1)·sᵢ² / Σ(nᵢ−1)] | Best variance estimate under null hypothesis of homogeneity | Standard ANOVA theory; EFSA 2011; NTP practice |
| **Glass's delta (control-only SD)** | No — control group only | SD = SD_control | Control SD unaffected by treatment; preferred when treatment may alter variability | Glass 1976; Carfagna et al. 2024 (PHUSE/BioCelerate) |
| **Pairwise pooled (SES)** | Yes — specific pair | SD = √[(SD₁² + SD₂²)/2] for equal n | Standard Cohen's d calculation | Lovell 2013; effect-size literature |

The **PHUSE/BioCelerate cross-study platform** (Carfagna et al. 2024, *Toxicological Sciences* 200:277–286) uses **control group SD** for Z-score normalization, computing (treatment mean − control mean) / control SD. This is equivalent to Glass's delta. The phuse-org/send-summarizer GitHub repository implements this approach with user-modifiable scoring thresholds. The repository's README explicitly disclaims: "Nothing in these scripts is intended to guide the analytic process."

Standard toxicology practice using **ANOVA with Dunnett or Williams tests** implicitly uses the **pooled MSE** (all groups). This means trend tests and equivalence bands may use different SD bases — a methodological inconsistency that has not been formally addressed in the literature.

---

## Trend tests are separate from equivalence bands — here is the decision tree

The **Jonckheere-Terpstra test** produces a **p-value for monotonic trend** across ordered dose groups. It answers "Is there a dose-related trend?" The equivalence band answers a different question: "How large is the change relative to normal variation?" These are complementary but distinct tools.

The **NTP decision tree** (the most widely cited in preclinical toxicology) operates as follows:

1. **Step 1 — Jonckheere-Terpstra test**: Screen for monotonic trend (nonparametric, no distributional assumptions)
2. **Step 2a — If J-T significant**: Apply trend-sensitive tests — **Williams test** (parametric, for normally distributed endpoints like body weight and organ weight) or **Shirley-Williams test** (nonparametric, for skewed endpoints like hematology and clinical chemistry)
3. **Step 2b — If J-T not significant**: Apply non-trend pairwise tests — **Dunnett test** (parametric) or **Steel test** (nonparametric)

Hamada (2018, *J. Toxicol. Pathol.* 31:15–22) documented the Japanese approach, noting that for small sample sizes (n < 7 per group, typical in dog and NHP studies), **nonparametric methods show extreme performance deterioration** and parametric methods are preferred despite potential distributional violations. Hothorn (2014, *Toxicol. Res.* 3:418–432) recommended the **"Umbrella-protected Williams" test** combining Dunnett and Williams for unidirectional endpoints, noting its robustness to the downturn problem at high doses.

---

## Species-specific biological variability that should inform thresholds

The biological variability data below represents the empirical foundation from which endpoint-specific equivalence bands should be derived. **CV% varies by an order of magnitude across endpoints and species** — a blanket ±1 SD threshold treats a 5% CV endpoint (brain weight) identically to a 51% CV endpoint (mouse adrenal weight), which is scientifically indefensible.

### Organ weights — CV% from control groups

| Species (Strain) | Organ | CV% range | Key source |
|---|---|---|---|
| Rat (Wistar) | Body weight | 3–8% | Marxfeld et al. 2019 |
| Rat (Wistar) | Brain | 3–5% | OECD 407 validation |
| Rat (Wistar) | Heart | 6–10% | OECD 407 validation |
| Rat (Wistar) | Kidney | 8–12% | OECD 407 validation |
| Rat (Wistar) | Liver | 8–15% | OECD 407 validation; BASF HCD |
| Rat (Wistar) | Adrenals | 5–17% | Marxfeld et al. 2019 |
| Rat (Wistar) | Testes | 5–10% | OECD 407 validation |
| Rat (Wistar) | Spleen | 15–25% | OECD 407 validation |
| Rat (Wistar) | Thymus | 15–30% | OECD 407 validation |
| Rat (Wistar/SD) | Uterus | ≥30% | PMC3389835 |
| Mouse (CD-1) | Body weight | 4–9% | Marxfeld et al. 2019 |
| Mouse (CD-1) | Brain | 3–6% | Marxfeld et al. 2019 |
| Mouse (CD-1) | Liver | 8–18% | Marxfeld et al. 2019 |
| Mouse (CD-1) | Kidney | 8–14% | Marxfeld et al. 2019 |
| Mouse (CD-1/C57BL/6) | **Adrenals (M)** | **20–51%** | Marxfeld et al. 2019 |
| Mouse (CD-1/C57BL/6) | Ovaries | 20–40% | Marxfeld et al. 2019 |
| Dog (Beagle) | All organs | Higher than rodent | Sellers et al. 2007 (STP); Bailey et al. 2004 |
| NHP (Cynomolgus) | All organs | **Highest variability; sparse data** | Koga 2005 |

### Hematology — biological variation CV%

| Species | Parameter | Within-subject CV (CVI) | Between-subject CV (CVG) | Source |
|---|---|---|---|---|
| Dog (Beagle) | RBC | 3.6% | 5.9% | Bourgès-Abella et al. 2015 |
| Dog (Beagle) | Hemoglobin | 3.8% | 5.8% | Bourgès-Abella et al. 2015 |
| Dog (Beagle) | WBC | 18.5% | 18.2% | Bourgès-Abella et al. 2015 |
| Dog (Beagle) | Platelets | 14.3% | 16.5% | Bourgès-Abella et al. 2015 |
| Dog (Beagle) | MCV | 1.2% | 3.2% | Bourgès-Abella et al. 2015 |
| Rat (Wistar Han) | RBC/Hgb/Hct | 3–6% within-study | — | de Kort et al. 2020 |
| Rat (Wistar Han) | WBC | 15–30% inter-study | — | de Kort et al. 2020 |
| Rat (SD) | Eosinophils | ≥30% | — | PMC3389835 |
| NHP (Cynomolgus) | MCV, MCH | Large between-animal | — | Koga 2005 |

### Clinical chemistry — variability patterns

| Species | Parameter | CV% (approx.) | Variability class | Source |
|---|---|---|---|---|
| Rat (SD) | Total protein | 3–6% | Low | Charles River HCD |
| Rat (SD) | Albumin | 3–6% | Low | Charles River HCD |
| Rat (SD) | Creatinine | 8–15% | Moderate | Charles River HCD |
| Rat (SD) | ALT | 15–30% | High | ASVCP; Charles River HCD |
| Rat (SD) | AST | 10–25% | Moderate–High | ASVCP; Charles River HCD |
| Rat (SD) | Glucose | 10–20% | Moderate | Charles River HCD |
| Rat (SD) | Triglycerides | ≥30% | Very high | PMC3389835 |
| Rat (SD) | Total bilirubin | ≥30% | Very high | PMC3389835 |
| Rat (SD) | GGT | ≥30% | Very high | PMC3389835 |

---

## The requested lookup table — with all gaps visible

The table below synthesizes every available data point into the requested format. **Where no authoritative threshold exists, this is flagged explicitly.** The "Recommended equivalence threshold" column reflects the only published values (EFSA ±1.0 SD; EPA 1 SD BMR) and empirically-informed estimates derived from the variability data above. Values marked **EMPIRICAL/UNSPECIFIED** have no published authority behind them.

### Master equivalence band threshold table

| Species | Sex | Endpoint Domain | Endpoint | Recommended Equiv. Threshold | SD Basis | Source / Status |
|---|---|---|---|---|---|---|
| **All** | **Both** | **All continuous** | **All** | **±1.0 pooled SD** | Pooled (all groups) | EFSA 2011 — only published threshold; applies to 90-day feeding studies in rodents |
| **All** | **Both** | **All continuous** | **All (BMD context)** | **1 SD shift from control** | Control or pooled | EPA BMD Technical Guidance 2012 — benchmark response level, not equivalence band per se |
| Rat | Both | Body weight | Terminal BW | ±1.0 SD (~3–8% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — inferred from CV% 3–8% (Marxfeld 2019) |
| Rat | Both | Organ weight | Brain | ±1.0 SD (~3–5% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — low CV supports tight band |
| Rat | Both | Organ weight | Liver | ±1.0 SD (~8–15% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — moderate CV |
| Rat | Both | Organ weight | Kidney | ±1.0 SD (~8–12% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — moderate CV |
| Rat | Both | Organ weight | Heart | ±1.0 SD (~6–10% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — moderate CV |
| Rat | Both | Organ weight | Adrenals | ±1.0–1.5 SD (~5–17% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — high variability, especially females |
| Rat | Both | Organ weight | Spleen | ±1.5 SD (~15–25% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — high intrinsic CV |
| Rat | Both | Organ weight | Thymus | ±1.5 SD (~15–30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — very high CV, stress-sensitive |
| Rat | F | Organ weight | Uterus | ±2.0 SD (≥30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — estrous-cycle driven variability |
| Rat | Both | Hematology | RBC, Hgb, Hct | ±1.0 SD (~3–6% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — low within-study CV |
| Rat | Both | Hematology | WBC | ±1.5 SD (~15–30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — high CV, consider nonparametric |
| Rat | Both | Hematology | Eosinophils | ±2.0 SD (≥30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — very high CV |
| Rat | Both | Clinical chemistry | Total protein, Albumin | ±1.0 SD (~3–6% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — low CV |
| Rat | Both | Clinical chemistry | ALT | ±1.5 SD (~15–30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — high CV, stress/handling sensitive |
| Rat | Both | Clinical chemistry | AST | ±1.0–1.5 SD (~10–25% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** |
| Rat | Both | Clinical chemistry | Glucose | ±1.0–1.5 SD (~10–20% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — fasting-sensitive |
| Rat | Both | Clinical chemistry | Triglycerides | ±2.0 SD (≥30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — very high CV |
| Rat | Both | Clinical chemistry | Total bilirubin | ±2.0 SD (≥30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — very high CV |
| Rat | Both | Urinalysis | Volume | ±2.0 SD (≥30% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — very high CV; sparse data |
| Rat | Both | Urinalysis | All other | **NO THRESHOLD PROPOSED** | N/A | **GAP** — mostly ordinal/categorical; SD-based bands inappropriate |
| Mouse | Both | Body weight | Terminal BW | ±1.0 SD (~4–9% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** |
| Mouse | Both | Organ weight | Brain | ±1.0 SD (~3–6% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** |
| Mouse | Both | Organ weight | Liver | ±1.0 SD (~8–18% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — wider range than rat |
| Mouse | M | Organ weight | **Adrenals** | **±2.0 SD (~20–51% of mean)** | Control SD | **EMPIRICAL/UNSPECIFIED** — Marxfeld 2019 documents extreme CV in male mice |
| Mouse | F | Organ weight | Ovaries | ±2.0 SD (~20–40% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** |
| Dog (Beagle) | Both | Body weight | Terminal BW | ±1.0–1.5 SD (~8–15% of mean) | Control SD | **EMPIRICAL/UNSPECIFIED** — outbred, higher CV than rodent |
| Dog (Beagle) | Both | Organ weight | All (absolute) | **Not recommended** | N/A | STP (Sellers 2007; Bailey 2004) recommends organ-to-brain weight ratio, not absolute weight |
| Dog (Beagle) | Both | Organ weight | All (organ:brain ratio) | ±1.0–1.5 SD | Control SD | **EMPIRICAL/UNSPECIFIED** — STP-recommended normalization |
| Dog (Beagle) | Both | Hematology | RBC, Hgb, Hct | ±1.0 SD (~4–6% CV) | Control SD | **EMPIRICAL/UNSPECIFIED** — Bourgès-Abella 2015 |
| Dog (Beagle) | Both | Hematology | WBC | ±1.5–2.0 SD (~18% CV) | Control SD | **EMPIRICAL/UNSPECIFIED** |
| Dog (Beagle) | Both | Hematology | Platelets | ±1.5 SD (~14–17% CV) | Control SD | **EMPIRICAL/UNSPECIFIED** |
| Dog (Beagle) | Both | Clinical chemistry | All | **NO THRESHOLD PROPOSED** | N/A | **GAP** — insufficient published BV data for beagle serum chemistry |
| NHP (Cynomolgus) | Both | Body weight | Terminal BW | ±1.5–2.0 SD (~10–20%+ CV) | Control SD | **EMPIRICAL/UNSPECIFIED** — highest variability species |
| NHP (Cynomolgus) | Both | Organ weight | All | **NO THRESHOLD PROPOSED** | N/A | **GAP** — essentially no published organ weight CV% from tox controls |
| NHP (Cynomolgus) | Both | Hematology | All | ±1.5–2.0 SD | Control SD | **EMPIRICAL/UNSPECIFIED** — large between-animal variation (Koga 2005); individual RI preferred |
| NHP (Cynomolgus) | Both | Clinical chemistry | ALP, Cholesterol, Creatinine | ±2.0 SD | Control SD | **EMPIRICAL/UNSPECIFIED** — large between-animal CV, age/sex/source effects (Koga 2005) |
| NHP (Cynomolgus) | Both | Clinical chemistry | Other | **NO THRESHOLD PROPOSED** | N/A | **GAP** — insufficient species-specific data |
| **All species** | **Both** | **All domains** | **All endpoints** | **NO REGULATORY THRESHOLD** | N/A | **CONFIRMED GAP** — FDA, EMA, PMDA, ICH, OECD TGs 407/408/412/413/453 are all silent |

---

## Why the gap exists and what it means

The absence of standardized thresholds is not accidental. Three structural factors explain it:

**First, NOAEL determination is deliberately judgment-based.** ICH M3(R2) and all OECD test guidelines treat NOAEL as an integrated expert assessment combining statistical significance, dose-response relationships, biological plausibility, historical control data, and severity of findings. Reducing this to algorithmic threshold crossing would require addressing the full complexity of toxicological interpretation — something regulators have explicitly avoided mandating.

**Second, biological variability spans an order of magnitude across endpoints.** Brain weight CV% of 3–5% versus male mouse adrenal weight CV% of 20–51% means that a single SD multiplier produces radically different absolute thresholds. A ±1 SD band for brain weight in rats corresponds to a ~4% change from control, while ±1 SD for mouse adrenal weight in males could correspond to a ~35% change. These are scientifically incomparable magnitudes, yet the EFSA framework treats them identically.

**Third, small group sizes in non-rodent studies fundamentally limit statistical power.** Dog studies typically use **4–6 animals/sex/group** and NHP studies **3–6 animals/sex/group**. Hamada (2018) documented "extreme performance deterioration" of nonparametric methods below n = 7. With these sample sizes, the SD estimate itself has very wide confidence intervals (~40–60% relative uncertainty for n = 4), making any SD-based threshold inherently unstable. This is why the STP and ASVCP emphasize individual animal data review and subject-as-own-control designs for non-rodent species.

---

## Practical recommendations for building a validated threshold table

Given the gap landscape, constructing a defensible equivalence band lookup table requires a **bottom-up empirical approach** rather than adoption of a single published standard. Four steps are warranted:

**Calibrate thresholds against labeled study data.** Use a corpus of completed studies with known toxicological outcomes (NOAEL already determined by expert pathologists/toxicologists) to empirically determine what SD multiplier, applied to each endpoint/species combination, correctly classifies dose groups as "no effect" versus "treatment-related." This is the only way to validate thresholds against ground truth.

**Use control-only SD (Glass's delta) rather than pooled SD.** The control group SD is uncontaminated by treatment effects. If a compound increases liver weight variability at high doses, pooling that inflated variance into the threshold would desensitize detection. The PHUSE/BioCelerate platform (Carfagna et al. 2024) adopted this approach for its Z-score normalization.

**Adopt endpoint-specific multipliers based on CV% tiers.** A three-tier system aligned with observed biological variability would be more defensible than a blanket ±1.0 SD:

- **Tier 1 (CV < 10%)**: ±1.0 SD — body weight, brain, heart, RBC parameters, total protein, albumin
- **Tier 2 (CV 10–20%)**: ±1.0 SD but flag as "equivocal" at 0.75–1.0 SD — liver, kidney, ALT, AST, glucose, platelets
- **Tier 3 (CV > 20%)**: ±1.5 SD or use nonparametric/rank-based classification — spleen, thymus, adrenals (mouse), WBC, triglycerides, bilirubin, reproductive organs

**Maintain separate thresholds by species, and flag NHP/dog as low-confidence.** Rodent thresholds can be calibrated with reasonable confidence given typical group sizes of 10–20/sex/group. Non-rodent thresholds should carry explicit uncertainty flags due to small n and high biological variability, and should be supplemented with within-subject longitudinal comparisons where predose data exist.

---

## Conclusion: the gap is the finding

The most important result of this research is the confirmation that **no authoritative equivalence band threshold table exists for preclinical dose-response trend classification** — not from PHUSE, OECD, FDA, EMA, PMDA, ICH, or any professional society. The EFSA ±1.0 pooled SD and the EPA 1 SD BMR are the only published quantitative anchors, and neither was designed for pharmaceutical preclinical study analysis. The PHUSE/BioCelerate send-summarizer tool uses control-group Z-scores with deliberately user-modifiable thresholds, confirming that the field's leading collaborative effort considers this an unsolved parameterization problem. Every entry in the lookup table above marked "EMPIRICAL/UNSPECIFIED" represents a threshold that must be validated against labeled study data before deployment. The variability data from Marxfeld (2019), Bourgès-Abella (2015), Koga (2005), de Kort (2020), and historical control databases provide the empirical foundation for this calibration — but the calibration itself has not been done and published. This represents both a significant gap and a concrete opportunity for the field.
# When body weight confounds organ weight ratios in toxicology studies

**No regulatory body or published consensus defines a specific Hedges' g threshold for switching from organ-to-body-weight to organ-to-brain-weight normalization in preclinical toxicology studies.** This represents a recognized gap in the field. The Society of Toxicologic Pathology (STP) recommends brain-weight normalization when "notable body weight changes" occur but deliberately leaves the threshold to expert judgment (Sellers et al., 2007, *Toxicologic Pathology*). Based on a synthesis of the available literature—including species-specific body weight variability data, organ-body weight correlation analyses, and statistical best practices—this report derives an evidence-based, tiered Hedges' g framework and provides species-specific guidance for all common preclinical species.

The foundational work by Bailey et al. (2004, *Toxicologic Pathology*) demonstrated that the choice of normalization method should be organ-specific: **liver and thyroid are best normalized to body weight, while adrenals and ovaries are best normalized to brain weight, regardless of whether treatment affects body weight**. The broader question of when body weight changes render organ-to-body-weight ratios unreliable has been debated for over 50 years, with statisticians consistently recommending ANCOVA over any ratio method (Shirley, 1977, *Toxicology*; Lazic et al., 2020, *Scientific Reports*), yet industry practice has been slow to change.

## A proposed tiered Hedges' g decision framework

Since no formal effect size threshold exists, the following framework is derived from first principles using published body weight coefficients of variation (CV), the OECD maximum tolerated dose (MTD) criterion of 10% body weight reduction, and the practical consensus among toxicologic pathologists that body weight differences in the range of **10–15%** compromise the reliability of organ-to-body-weight ratios.

The derivation logic is straightforward. In Sprague-Dawley rats, body weight CV is typically **8–15%** (Bailey et al., 2004; Piao et al., 2013, *Journal of Toxicologic Pathology*). A 10% mean body weight difference between treated and control groups, divided by a pooled standard deviation of approximately 10% of the control mean, yields a **Hedges' g ≈ 1.0**. This aligns with the OECD MTD criterion and represents the point at which most toxicologic pathologists become concerned about confounding. The framework naturally adapts across species because Hedges' g incorporates the denominator's variability.

**Tier 1 — Hedges' g < 0.5 (routine analysis):** Report absolute organ weights and organ-to-body-weight ratios. Brain weight ratios are optional and supplementary. This corresponds to body weight differences of roughly <5% in rodents.

**Tier 2 — Hedges' g 0.5–1.0 (supplementary brain normalization recommended):** Calculate and report organ-to-brain-weight ratios alongside body weight ratios for all organs. Interpret organ-to-body-weight ratios with caution for organs with weak body weight correlations (adrenals, ovaries, thymus, pituitary). This corresponds to approximately **5–10% body weight change** in rodents and **7–15%** in non-human primates.

**Tier 3 — Hedges' g ≥ 1.0 (automatic switch to brain normalization and/or ANCOVA):** Organ-to-brain-weight ratios become the primary normalization method for all organs. ANCOVA with baseline body weight as covariate should be conducted as a sensitivity analysis. For organs that correlate poorly with both body and brain weight (thymus, pituitary), use absolute weights with ANCOVA. This corresponds to approximately **≥10% body weight change** in rodents, **≥15%** in dogs, and **≥20–25%** in non-human primates.

**Tier 4 — Hedges' g ≥ 2.0 (severe body weight effects):** Neither ratio method may be adequate. ANCOVA or Bayesian causal mediation models (Lazic et al., 2020) should be the primary analytical approach. Simple ratios should be reported only as supplementary data.

It is essential to note that these thresholds should not replace integrated pathological assessment. As Sellers et al. (2007) emphasized, organ weight changes "must be evaluated within the context of the compound class, mechanism of action, and the entire data set for that study." The framework above provides a decision-support tool, not an algorithmic replacement for expert judgment.

## Species and strain-specific coefficients of variation

Brain weight variability is consistently **2–3 times lower** than body weight variability across all preclinical species—a finding confirmed by multiple large historical control datasets. The table below synthesizes published data from Bailey et al. (2004), Piao et al. (2013), Marxfeld et al. (2019, *Regulatory Toxicology and Pharmacology*), Suri et al. (2012, *Journal of Toxicology and Environmental Health*), Amato et al. (2022, *Toxicologic Pathology*), and others.

| Species / Strain | Body Weight CV (%) | Brain Weight CV (%) | Typical Brain Wt | BW CV : Brain CV Ratio | Brain Sensitivity to Toxicants |
|---|---|---|---|---|---|
| **Rat – Sprague-Dawley** | 8–15 (M); 6–12 (F) | 2–5 | 1.9–2.2 g (M) | ~3× | Low |
| **Rat – Wistar** | 7–12 (M); 6–10 (F) | 2–5 | 1.8–2.1 g (M) | ~2.5× | Low |
| **Rat – Fischer 344** | 5–10 (M); 5–8 (F) | 2–4 | 1.8–2.0 g (M) | ~2.5× | Low |
| **Rat – Long-Evans** | 8–14 (M); 7–12 (F) | 2–5 | 1.9–2.2 g (M) | ~3× | Low |
| **Mouse – CD-1** | 8–15 (M); 7–12 (F) | 3–6 | 0.45–0.55 g (M) | ~2.5× | Low |
| **Mouse – C57BL/6** | 6–12 (M); 5–10 (F) | 3–5 | 0.42–0.50 g (M) | ~2× | Low |
| **Mouse – BALB/c** | 6–10 (M); 5–9 (F) | 3–5 | 0.40–0.48 g (M) | ~2× | Low |
| **Dog – Beagle** | 10–20 | 4–8 | 72–85 g (M) | ~2.5× | Very low |
| **NHP – Cynomolgus** | 15–30 | 5–12 | 55–75 g (M) | ~2.5× | Low–Moderate |
| **NHP – Rhesus** | 15–25 | 5–10 | 80–110 g (M) | ~2.5× | Low–Moderate |
| **Rabbit – NZW** | 10–18 | 4–7 | 10–12 g | ~2.5× | Low |
| **Minipig – Göttingen** | 10–20 | 5–10 | 40–65 g | ~2× | Low |

Several strain-specific patterns deserve emphasis. **Inbred strains** (Fischer 344, C57BL/6, BALB/c) show lower body weight variability than outbred stocks, with Fischer 344 rats exhibiting the tightest body weight distribution (**CV 5–10%**) and correspondingly low brain weight CV (**2–4%**). This means the Hedges' g threshold translates to smaller absolute percentage body weight differences in inbred strains—a 5% body weight change in F344 rats may already yield g ≈ 0.5–1.0. Non-human primates pose the greatest challenge, with body weight CVs of **15–30%** driven by genetic heterogeneity, geographic origin variation (Mauritius vs. China vs. Southeast Asia), sexual dimorphism, and age variability (Amato et al., 2022; Yeager et al., 2011, *Regulatory Toxicology and Pharmacology*). Brain weight in cynomolgus monkeys **plateaus by approximately 4 years of age** while body weight continues increasing, making brain weight normalization particularly valuable in NHP studies with age-variable cohorts.

## What regulators and key references actually say

**The STP position paper** (Sellers et al., 2007) remains the most authoritative guidance. It states: "In cases of notable body weight changes, organ-to-brain weight ratios may be useful, as test materials that alter body weight generally do not alter brain weight (Wilson et al., 2001), making organ-to-brain weight ratios useful in cases of notable decreases in body weight that impact organ-to-body weight ratios." The STP recommends brain weight collection in all multidose GLP studies (7 days to 1 year) so that organ-to-brain ratios "may be calculated if needed." Critically, the STP endorsed organ-specific normalization per Bailey et al. (2004): **organ-to-brain weight ratios may be more appropriate for ovaries and adrenals, while organ-to-body weight ratios may be more appropriate for liver and thyroid**.

**OECD Test Guidelines 407 (28-day) and 408 (90-day)** require collection of brain weight alongside other mandatory organs but specify only "relative organ weight" without distinguishing between body-weight and brain-weight denominators. **No OECD guideline prescribes a specific threshold** for switching normalization methods.

**The U.S. EPA's Guidelines for Neurotoxicity Risk Assessment (1998)** contains perhaps the most definitive regulatory statement on brain weight: "A change in brain weight is considered to be a biologically significant effect. This is true regardless of changes in body weight, because **brain weight is generally protected during undernutrition or weight loss**, unlike many other organs or tissues. It is inappropriate to express brain weight changes as a ratio of body weight and thereby dismiss changes in absolute brain weight." This statement establishes that brain weight is inherently protected—supporting its use as a stable normalizer—but also warns against using brain-to-body-weight ratios to dismiss genuine brain weight findings.

**FDA and EMA guidance** harmonize with ICH guidelines (M3(R2), S5(R3), S6(R1)) and require organ weight evaluation as part of identifying target organs but provide **no specific guidance on normalization methodology**. The Michael et al. (2007) survey revealed a notable geographic divide: most North American companies routinely calculated organ-to-brain weight ratios, while European and veterinary product companies rarely did so—reflecting less regulatory emphasis on brain normalization in the EU.

**Bailey et al. (2004, *Toxicologic Pathology*)** analyzed control Sprague-Dawley rat data from 26 toxicity studies and established that the proportionality assumption underlying organ-to-body-weight ratios (i.e., that a 20% difference in body weight corresponds to a 20% difference in organ weight) **is violated for most organs**. Liver and thyroid showed strong proportional relationships with body weight (r = 0.50–0.74), but adrenal glands, ovaries, thymus, and pituitary did not.

**Nirogi et al. (2014, *International Journal of Pharmaceutical Sciences and Research*)** replicated these findings in 43 toxicity studies with Wistar rats, confirming that organ-to-body-weight ratios are "optimum for most organs" but recommending absolute weight or alternative statistical methods for ovaries, thyroid-parathyroid, thymus, and pituitary.

## Brain weight stability is robust, but not absolute

The evidence for brain weight resistance to systemic toxicity is substantial and spans decades. **Schärer (1977, *Toxicology*)** demonstrated that rats restricted to 68% of ad libitum feeding for 13 weeks—resulting in a **32% body weight reduction**—maintained essentially unchanged absolute brain weight. Relative brain weight increased 30–40% purely because the denominator (body weight) decreased while the numerator (brain weight) remained stable. **Feron et al. (1973, *Food and Cosmetics Toxicology*)** showed the same pattern with non-toxic growth retardation of 11–58% induced by high-cellulose diets: brain absolute weight was preserved even at the most severe restriction levels.

The Haschek and Rousseaux's *Handbook of Toxicologic Pathology* (2013) synthesized data from "several hundred repeated-dose toxicity studies" and concluded that all common target organs change weight in proportion to body weight "**other than the brain**." Piao et al. (2013) confirmed that brain weight "is not considered to be influenced by nutritional factors" and showed only modest age-related increases in brain weight from 13 to 78 weeks in Sprague-Dawley rats—far less than the concurrent body weight increases.

However, **brain weight is not invulnerable**. Known exceptions fall into three categories:

- **Developmental neurotoxicants** represent the most important exception. Crofton et al. (2024, *EFSA Supporting Publications*) analyzed 173 developmental neurotoxicity (DNT) studies and found that **70% showed decreased pup body weights**, but only **41% of those also showed decreased brain weights**—and 3 studies showed brain weight decreases with no body weight change at all. Known developmental neurotoxicants affecting brain weight include lead, methylmercury, polychlorinated biphenyls, chlorpyrifos, and phenobarbital during the brain growth spurt.

- **Direct neurotoxicants in adult animals** can alter brain weight, though this is uncommon in general toxicology. The EPA (1998) considers any brain weight change biologically significant precisely because such changes are rare and therefore always meaningful.

- **Extreme systemic toxicity** (body weight loss exceeding approximately **40–50%** in adults) may eventually compromise brain weight, though published evidence for this threshold is limited. During the brain growth spurt (prenatal through early postnatal in rodents), severe maternal undernutrition can affect brain development even at lesser degrees of weight loss (Carney et al., 2004, *Toxicological Sciences*).

## Statistical methods beyond simple ratios

The statistical literature is unanimous that **ANCOVA is superior to ratio normalization**, yet the toxicology field has been slow to adopt this recommendation. Shirley (1977, *Toxicology*) demonstrated that ANCOVA with terminal body weight as covariate removes body weight dependence from organ weight analysis, while simple ratios fail to do so. **Lazic et al. (2020, *Scientific Reports*)** showed that even after calculating relative liver weight (liver/body weight ratio), the ratio remained significantly correlated with body weight (r = 0.51, p < 0.001), whereas ANCOVA completely eliminated this dependence (r = 0.00, p = 1.00).

However, ANCOVA has a critical limitation. When treatment affects body weight (i.e., body weight is a mediator, not just a confounder), including it as a covariate violates the ANCOVA assumption of covariate independence and can **over-correct**, masking true organ weight effects (Andersen et al., 1999, *Toxicology*). This is precisely the scenario the user describes—when treatment causes significant body weight changes.

**Lazic et al. (2020)** proposed an elegant solution: **Bayesian causal mediation models** that decompose the total drug effect on organ weight into a direct effect (drug → organ) and an indirect effect (drug → body weight → organ). This approach can handle both causal pathways (does the drug change body weight which changes organ weight, or does it change the organ directly?) and provides probability-of-safety statements rather than ambiguous p-values. The method uses a Region of Practical Equivalence (ROPE) framework—for example, AstraZeneca uses a **±20% liver weight change** threshold for triggering mechanistic investigation.

**Karp et al. (2012, *Laboratory Animals*)** demonstrated with real data that ratio correction is "flawed and can result in erroneous calls of significance leading to inappropriate biological conclusions." They strongly recommended ANCOVA with graphical tools. **Kluxen (2019, *Archives of Toxicology*)** advocated bivariate scatter plots of organ weight versus body weight with treatment groups identified, arguing that such plots "vastly improve toxicological interpretation."

**Allometric scaling** provides another perspective. The relationship between organ weight and body weight is allometric (Y = aW^b), not strictly proportional (Trieb et al., 1976, *Toxicology and Applied Pharmacology*). Interspecific brain weight scales as approximately BW^0.70 (Stahl, 1965), while intraspecific brain-body exponents are even lower (**0.2–0.4**; Gould, 1975). This sublinear relationship means that simple ratios systematically overestimate relative brain weight in lighter animals and underestimate it in heavier ones—a mathematical artifact that ANCOVA avoids.

For the standardized effect size approach specifically, **Festing (2014, *Toxicologic Pathology*)** proposed using standardized effect sizes (equivalent to Cohen's d) as a universal data transformation in toxicology, enabling comparison across endpoints. While Festing did not define decision thresholds for organ weight normalization, his framework supports the use of effect size metrics to standardize decision-making.

## When brain weight fails: alternative normalization strategies

When a compound affects brain weight itself—typically in DNT studies, neurotoxicity assessments, or with CNS-targeting agents—neither body weight nor brain weight ratios are appropriate normalizers. The recommended hierarchy is:

**ANCOVA with baseline (pre-dose) body weight** becomes the preferred method, since baseline body weight is measured before treatment begins and therefore cannot be a mediator of treatment effects. This approach was endorsed by Shirley and Newnham (1984, *Statistics in Medicine*), who concluded that "if there is background information which shows a linear relationship between variate and covariate it is advisable to adjust for the covariate, however weak the relationship may appear to be."

**Bayesian causal mediation models** (Lazic et al., 2020) represent the most statistically rigorous approach, decomposing treatment effects into direct and indirect pathways while providing probabilistic safety assessments. These models are implemented in R using the mediation package.

**Absolute organ weight analysis** with expert pathological interpretation remains valid when statistical adjustment methods are not feasible. The STP position paper emphasizes that organ weight data should always be "interpreted in an integrated fashion with gross pathology, clinical pathology, and histopathology findings" (Sellers et al., 2007).

**Multivariate analysis of variance (MANOVA)** treating organ weight and body weight as a bivariate response was proposed by Andersen et al. (1999) and has the advantage of not requiring the covariate independence assumption. However, it has not been widely adopted in practice.

For **developmental neurotoxicity studies** specifically, the EPA (1998) and OECD TG 426 require brain morphometrics (quantitative measurements of brain regions) as a more sensitive endpoint than whole brain weight. When brain weight is affected, regional brain measurements and neuropathological examination become the primary interpretive endpoints.

## Conclusion

The absence of a formal effect size threshold in the literature reflects the field's reliance on expert judgment rather than algorithmic decision rules. The tiered Hedges' g framework proposed here—**g < 0.5 for routine analysis, g 0.5–1.0 for supplementary brain normalization, g ≥ 1.0 for automatic switching, and g ≥ 2.0 for ANCOVA-primary analysis**—is derived from species-specific body weight variability data and the practical consensus around a **~10% body weight change** threshold. This framework has the advantage of being species-agnostic in its application while naturally calibrating to species-specific variability through the standardized effect size denominator.

Three insights emerge from this synthesis that go beyond the conventional literature. First, the organ-specific recommendations of Bailey et al. (2004) are more important than any body weight threshold: **adrenals and ovaries should always use brain weight normalization** regardless of body weight changes, while liver and thyroid should preferentially use body weight normalization unless body weight is severely affected. Second, the statistical literature overwhelmingly favors ANCOVA over any ratio method, yet the field's practice has not caught up—SEND-compliant studies should increasingly incorporate ANCOVA as standard analytical methodology. Third, for non-human primate studies where body weight CV can reach **30%**, brain weight normalization should be considered essentially routine rather than triggered by a specific threshold, given the inherent unreliability of organ-to-body-weight ratios in such variable populations.

---

## GitHub & implementation resources for SEND organ weight normalization

The following section catalogs open-source code, datasets, and implementation approaches found on GitHub and related platforms that can be harvested or adapted for building the organ weight normalization auto-selection logic in the Datagrok SEND data browser. Resources are organized by harvest priority: directly implementable code first, then supporting ecosystem tools, statistical toolkits, validation data, and a recommended phased implementation spec.

---

### 1. Directly Harvestable: Lazic et al. Bayesian Causal Mediation Model

**This is the single most important implementation resource.**

#### The Paper
Lazic SE, Semenova E, Williams DP (2020). *Determining organ weight toxicity with Bayesian causal models.* Scientific Reports 10(1):6625.

#### Code & Data
- **Supplementary File 1** (Data_and_code.zip) ships with the paper at [nature.com/articles/s41598-020-63465-y](https://www.nature.com/articles/s41598-020-63465-y) — contains complete **R + Stan code** implementing the full Bayesian causal mediation model for organ weight analysis
- **Data source**: NTP sodium dichromate dihydrate study in F344 rats, 60 animals across 6 dose groups — available via **[github.com/lahothorn/SiTuR](https://github.com/lahothorn/SiTuR)** (the "Statistics in Toxicology using R" data package)
- **Updated mediation code** (Julia): [github.com/stanlazic/lab-animals-mediation](https://github.com/stanlazic/lab-animals-mediation) — Lazic's 2024 Lab Animals follow-up paper

#### What You Can Harvest
1. **Stan model definition** for the hierarchical Bayesian mediation model (DAG: Drug → Body Weight → Organ Weight, plus Drug → Organ Weight directly)
2. **Effect decomposition logic**: code to compute total effect, direct effect, and indirect (body-weight-mediated) effect
3. **ROPE (Region of Practical Equivalence) framework**: AstraZeneca uses ±20% liver weight change as their threshold — this maps directly to a "probability of safety" output
4. **Unequal variance handling**: hierarchical model that shrinks group means and allows heteroscedasticity across dose groups
5. **Sensitivity analysis**: `medsens()` function from R's `mediation` package to test robustness of conclusions against unmeasured confounders

#### Implementation Path for Datagrok
The Lazic model has three layers of complexity — implement progressively:

| Level | Method | Complexity | What It Gives You |
|-------|--------|------------|-------------------|
| **Level 1** | Hedges' g threshold + auto-switch | Low (JS/Python) | Decision engine for ratio selection |
| **Level 2** | R `mediation` package (frequentist) | Medium (R backend) | Direct/indirect effect decomposition |
| **Level 3** | Full Bayesian Stan model | High (Stan/R) | Probability-of-safety statements, ROPE |

For Level 1 (your immediate question), only arithmetic is needed — no external dependencies.

---

### 2. PHUSE/FDA SEND Ecosystem on GitHub

The PHUSE Nonclinical Working Group (in collaboration with FDA) has built an ecosystem of R packages for SEND data analysis. These are MIT-licensed and directly relevant.

#### sendigR — Cross-Study Analysis of CDISC SEND Datasets
- **Repo**: [github.com/phuse-org/sendigR](https://github.com/phuse-org/sendigR)
- **Also on CRAN**: `install.packages("sendigR")`
- **What it does**: Extracts control data from SEND studies stored in SQLite/Oracle databases. Supports Body Weights (BW domain), Laboratory test results (LB), and Microscopic findings (MI).
- **Harvest value**: 
  - SEND domain parsing logic (XPT → database)
  - The `xptcleaner` Python sub-package for harmonizing SEND controlled terminology
  - R Shiny app architecture for interactive cross-study analysis
  - Body weight gain analysis script (BW domain processing)

#### send-summarizer — Treatment Effect Normalization & Visualization
- **Repo**: [github.com/phuse-org/send-summarizer](https://github.com/phuse-org/send-summarizer)
- **What it does**: Normalizes, aggregates, and **visualizes treatment effects in target organ systems** across multiple studies
- **Harvest value**: This is the closest existing open-source tool to what you're building. It handles:
  - Organ-system-level treatment effect aggregation
  - Cross-study normalization logic
  - Visualization of treatment effects
  - R package structure for SEND organ data

#### BioCelerate — SEND Cross-Study Query Scripts
- **Repo**: [github.com/phuse-org/BioCelerate](https://github.com/phuse-org/BioCelerate)
- **What it does**: Search scripts for querying and collating information from SEND datasets, building an SQLite database from XPT files
- **Harvest value**:
  - `sysParameters.R` configuration pattern for SEND data paths
  - SQLite schema for SEND study data
  - Metadata-driven query approach

#### SEND-TestDataFactory — Synthetic SEND Data Generator
- **Repo**: [github.com/phuse-org/SEND-TestDataFactory](https://github.com/phuse-org/SEND-TestDataFactory)
- **What it does**: Generates synthetic SEND-formatted .xpt datasets (body weights, clinical observations, micropathology)
- **Harvest value**: Test data for your organ weight normalization feature — generate studies with known body weight effects and verify your auto-selection logic

#### SENDsanitizer — Synthetic SEND Data from Real Data
- **Repo**: [github.com/phuse-org/SENDsanitizer](https://github.com/phuse-org/SENDsanitizer)
- **What it does**: Generates synthetic SEND-formatted data from real datasets using Bayesian regression models, anonymizing sensitive info
- **Harvest value**: Bayesian data generation logic; privacy-preserving test data pipeline

#### toxSummary — Repeat-Dose Toxicology Visualization
- **Repo**: [github.com/phuse-org/toxSummary](https://github.com/phuse-org/toxSummary)
- **What it does**: R Shiny app for visualizing safety margins and severity of toxicities across studies. Built in collaboration with FDA.
- **Harvest value**: 
  - NOAEL/safety margin calculation logic
  - Cross-study visualization patterns for tox data
  - FDA-consulted UI patterns for toxicology data review

---

### 3. Statistical Toolkits for Organ Weight Analysis

#### SiTuR — Statistics in Toxicology Using R (Data Package)
- **Repo**: [github.com/lahothorn/SiTuR](https://github.com/lahothorn/SiTuR)
- **What it is**: Data companion to Hothorn (2016) *Statistics in Toxicology Using R* (Chapman & Hall/CRC)
- **Harvest value**:
  - **Multiple toxicology datasets** with organ weight + body weight data (NTP studies)
  - Reference implementations of Dunnett's procedure, Williams' trend test, and other tox-specific statistical methods
  - Organ weight analysis examples including ANCOVA approaches

#### R `mediation` Package
- **CRAN**: `install.packages("mediation")`
- **Reference**: Tingley et al. (2014) *Journal of Statistical Software* 59:1-38
- **Harvest value**: Drop-in causal mediation analysis. The Lazic paper uses this directly:
  ```r
  library(mediation)
  mod.m <- lm(body_weight ~ treatment, data=d)
  mod.y <- lm(organ_weight ~ treatment + body_weight, data=d)
  med <- mediate(mod.m, mod.y, treat="treatment", mediator="body_weight")
  ```
  This gives you direct effect, indirect effect, total effect, and proportion mediated — all computable server-side for your SEND browser.

#### lcomm/rstanmed — Bayesian Mediation in Stan
- **Repo**: [github.com/lcomm/rstanmed](https://github.com/lcomm/rstanmed)
- **What it does**: A dedicated R package wrapping Bayesian mediation analysis in Stan
- **Harvest value**: Pre-built Stan models for mediation that could be adapted for organ weight analysis without writing Stan code from scratch

#### CMAverse — Comprehensive Causal Mediation Analysis
- **Repo**: [github.com/bs1125/CMAverse](https://bs1125.github.io/CMAverse/)
- **What it does**: Full suite for causal mediation including DAG visualization, 6 different analysis approaches, and sensitivity analysis
- **Harvest value**: Could provide the sensitivity analysis layer — E-value approach and measurement error handling

---

### 4. NTP Data: The Gold Standard for Validation

#### NTP Historical Control Database
- **URL**: [ntp.niehs.nih.gov/data/controls](https://ntp.niehs.nih.gov/data/controls)
- **What it contains**: Body weight growth curves, survival data, and pathology for control animals from hundreds of NTP studies
- **Species/strains**: F344/N rats, B6C3F1 mice, Harlan Sprague-Dawley rats, Wistar Han rats
- **Harvest value**: 
  - Historical body weight CV data by species/strain/sex/route/duration
  - Validation data for your Hedges' g thresholds
  - Growth curves with 5th/95th percentile bands

#### NTP CEBS Database
- **URL**: Chemical Effects in Biological Systems
- **What it contains**: Individual animal-level data from NTP studies including organ weights and body weights
- **Harvest value**: Real study data to validate the full pipeline — you can compute Hedges' g for body weight, check brain weight stability, and verify the auto-selection logic produces sensible results

#### EPA CompTox Reproducibility Data
- **Repo**: [github.com/USEPA/CompTox-Reproducibility-Organ-Effects](https://github.com/USEPA/CompTox-Reproducibility-Organ-Effects)
- **What it does**: Analyzes reproducibility of organ-level effects in repeat dose animal studies from the EPA ToxRefDB
- **Harvest value**: 
  - Organ-level effect size data across hundreds of chemicals
  - LEL (Lowest Effect Level) data for organ weight endpoints
  - R analysis pipeline for organ effect concordance

---

### 5. Recommended Implementation Spec Outline

Based on the resources above, here's the implementation path I'd recommend:

#### Phase 1: Auto-Selection Engine (JavaScript, runs in browser)

```
Input: SEND OM domain (organ measurements) + BW domain (body weights)
  
Step 1: For each dose group vs. control, compute Hedges' g for terminal body weight
Step 2: For each dose group vs. control, compute Hedges' g for brain weight (if available)
Step 3: Apply tiered decision logic:
  
  if brain_g >= 0.8:
    flag = "BRAIN_AFFECTED"  → ANCOVA only, warn user
  elif bw_g < 0.5:
    default_normalization = "BODY_WEIGHT"
    show_brain_ratios = false
  elif bw_g >= 0.5 and bw_g < 1.0:
    default_normalization = "BODY_WEIGHT"  
    show_brain_ratios = true  (supplementary)
    show_warning = true
  elif bw_g >= 1.0 and bw_g < 2.0:
    default_normalization = "BRAIN_WEIGHT"  ← auto-switch
    show_body_ratios = true  (supplementary)
    recommend_ancova = true
  elif bw_g >= 2.0:
    default_normalization = "ANCOVA"
    show_ratios = supplementary_only
    
Step 4: Apply organ-specific overrides per Bailey et al. (2004):
  - Adrenals, ovaries → prefer brain normalization even at lower g
  - Liver, thyroid → prefer body weight normalization unless g >= 1.0
  - Thymus, pituitary → prefer absolute weight + ANCOVA at all levels

Step 5: Display decision rationale in UI tooltip/panel
```

#### Phase 2: ANCOVA Backend (R or Python server-side)

Harvest the ANCOVA logic from Lazic's supplementary code or the R `mediation` package. Expose via API:

- Input: organ weights, body weights, treatment groups
- Output: ANCOVA-adjusted means, p-values, effect sizes, body-weight-corrected comparisons

#### Phase 3: Bayesian Mediation (Optional, Advanced)

Port the Lazic Stan model or use `brms` R package for:
- Direct vs. indirect effect decomposition
- Probability-of-safety statements with ROPE
- Visualization of posterior distributions for organ weight effects

#### Data Sources for Testing

| Source | License | Content | Use Case |
|--------|---------|---------|----------|
| SiTuR NTP data | Open | F344 rat organ + body weights | Unit test the decision engine |
| SEND-TestDataFactory | MIT | Synthetic SEND XPT files | Integration test SEND parsing → analysis |
| NTP CEBS | Public | Thousands of studies | Validate thresholds at scale |
| EPA ToxRefDB | Public | Cross-chemical organ effects | Validate cross-study aggregation |

---

### 6. Key Open-Source Licenses

All major resources identified are open-source compatible:

| Resource | License |
|----------|---------|
| sendigR | MIT |
| BioCelerate | MIT |
| send-summarizer | MIT (implied, PHUSE standard) |
| SiTuR | GPL (R package default) |
| Lazic supplementary code | CC-BY 4.0 (Scientific Reports) |
| R mediation package | GPL-2 |
| CMAverse | GPL-3 |
| SEND-TestDataFactory | MIT |
| SENDsanitizer | MIT |
| toxSummary | MIT |
| EPA CompTox scripts | Public domain (US Government) |

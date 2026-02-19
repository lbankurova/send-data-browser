# Analytical Methods Registry

Every statistical test, algorithmic method, classification algorithm, and scoring formula in the analysis engine, with rationale, alternatives considered, and implementation locations.

Spec-unaware: this file describes methods themselves, not which specs reference them. Specs reference methods via their stable IDs (e.g., `STAT-01`, `CLASS-05`) in frontmatter `methods:` fields.

Companion to `dependencies.md`, which documents **what we depend on** (external data, standards, references). This file documents **how we compute things**.

---

## Statistical Tests (STAT)

### STAT-01 — Welch's t-Test

**Purpose:** Pairwise comparison of treated vs. control group means for continuous endpoints.

**Implementation:** `scipy.stats.ttest_ind(treated, control, equal_var=False)` — backend `statistics.py:7`. Frontend receives computed p-values via API.

**Parameters:** Two-tailed, unequal variance assumed. Minimum n=2 per group; returns `{None, None}` below this threshold. NaN values dropped before computation.

**Why this method:** Welch's t-test is preferred over Student's t because preclinical dose groups frequently have unequal variances (treatment effect inflates variance). The equal-variance assumption of Student's t would inflate false-positive rates in these cases.

**Alternatives considered:** Mann-Whitney U (STAT-02, implemented but reserved for non-normal distributions). Permutation tests (computationally expensive, not needed given typical group sizes of 5–30).

**References:** FDA SEND Review Guide (implicit); standard toxicological practice.

---

### STAT-02 — Mann-Whitney U Test

**Purpose:** Nonparametric pairwise comparison for ordinal or non-normal continuous data.

**Implementation:** `scipy.stats.mannwhitneyu(a1, a2, alternative="two-sided")` — backend `statistics.py:19`.

**Parameters:** Two-tailed. Minimum n=1 per group. NaN values dropped. ValueError caught and returns `{None, None}`.

**Why this method:** Rank-based test that makes no distributional assumption. Appropriate for ordinal severity grades (MI lesion severity 1–5) and non-normal lab parameters.

**Alternatives considered:** Wilcoxon rank-sum (mathematically equivalent). Student's t (invalid for ordinal data).

**Current status:** Implemented but not called in the active pipeline. Reserved for future ordinal analysis.

---

### STAT-03 — Fisher's Exact Test (2x2)

**Purpose:** Pairwise comparison of treated vs. control incidence rates for binary endpoints (affected/not affected).

**Implementation:** `scipy.stats.fisher_exact(table)` — backend `statistics.py:34`. Table format: `[[affected_treated, unaffected_treated], [affected_control, unaffected_control]]`.

**Parameters:** Two-tailed. Returns odds ratio and p-value. ValueError caught. No Bonferroni correction applied to incidence domains (see design note below).

**Why this method:** Fisher's exact test is the gold standard for 2x2 tables with small cell counts (common in histopathology incidence — e.g., 3/10 treated vs. 0/10 control). Chi-square approximation breaks down below expected count of 5.

**Alternatives considered:** Chi-square test (invalid for small expected counts, common in tox). Barnard's test (computationally expensive, marginal gain in power).

**Design note:** Pairwise Fisher's results are not Bonferroni-corrected for incidence domains (MI, MA, CL, TF, DS). The test is inherently conservative with small counts, and individual comparisons are the primary interest.

**Consumers:** MI (`findings_mi.py:130`), MA (`findings_ma.py:109`), CL (`findings_cl.py:81`), TF (`findings_tf.py:156`), DS (`findings_ds.py:104`).

---

### STAT-04 — Jonckheere-Terpstra Trend Test (Spearman Approximation)

**Purpose:** Test for monotonic dose-response trend across ordered dose groups for continuous endpoints.

**Implementation:** `scipy.stats.spearmanr(dose_levels, values)` — backend `statistics.py:46`. Also called as `_jonckheere_terpstra_p()` in `domain_stats.py:75` (identical logic).

**Parameters:** Each observation paired with its ordinal dose level index (0, 1, 2, ...). Minimum 4 total non-NaN values across all groups. NaN values dropped per group before flattening.

**Why this method:** True Jonckheere-Terpstra test is not available in scipy. Spearman rank correlation is a computationally simpler proxy that captures monotonic trend direction and significance. Adequate for continuous endpoints where dose order matters.

**Alternatives considered:** True JT test (not in scipy without custom implementation). Cuzick's trend test (requires equal spacing assumption). Linear regression slope test (sensitive to outliers).

**Consumers:** LB (`findings_lb.py:131`), BW (`findings_bw.py:118`), OM, FW (`domain_stats.py:369`). Not used for incidence domains (use STAT-05 instead).

---

### STAT-05 — Cochran-Armitage Trend Test

**Purpose:** Test for dose-dependent trend in binary incidence data across ordered dose groups.

**Implementation:** Custom z-score computation — backend `statistics.py:65`. Dose scores: linear `[0, 1, 2, ..., k-1]`. P-value from standard normal CDF (two-tailed).

**Parameters:** `counts` = affected per dose group, `totals` = animals per dose group. Requires >= 2 groups, total n > 0, and global incidence 0 < p_bar < 1. Returns `{None, None}` if p_bar is 0 or 1 (all affected or none).

**Why this method:** Standard trend test for binary outcomes in toxicology. The z-score formulation with linear dose scores is equivalent to chi-square trend when both are valid. More appropriate than continuous trend tests for incidence data.

**Alternatives considered:** Logistic regression slope (more complex, equivalent for linear trends). Exact conditional trend test (computationally intensive, unnecessary for routine screening).

**Consumers:** MI (`findings_mi.py:146`), MA, CL (`findings_cl.py:95`), TF, DS. Result stored as `trend_p`.

---

### STAT-06 — One-Way ANOVA F-Test

**Purpose:** Omnibus test of whether any dose group mean differs from the others for continuous endpoints.

**Implementation:** `scipy.stats.f_oneway(*valid_groups)` — backend `domain_stats.py:41`.

**Parameters:** At least 2 groups with n >= 2 each. Groups failing the minimum are filtered before testing. Returns `None` on exception.

**Why this method:** Standard omnibus test providing a single overall p-value. Complements pairwise tests (STAT-01) and trend tests (STAT-04).

**Alternatives considered:** Kruskal-Wallis (STAT-08, implemented for non-normal data). Welch's ANOVA (not in scipy's f_oneway, but irrelevant since pairwise Welch's t-tests drive classification).

**Consumers:** Generator enrichment step (`domain_stats.py:222`). Result stored as `anova_p`. Supplementary — not used in severity classification, which relies on pairwise tests and trend.

---

### STAT-07 — Dunnett's Test

**Purpose:** Multiple comparisons of each treated dose group vs. a single control, with familywise error rate control.

**Implementation:** `scipy.stats.dunnett(*treated_groups, control=control)` — backend `domain_stats.py:53`.

**Parameters:** Control must have n >= 2. Each treated group must have n >= 2 (filtered). Returns list of p-values aligned with original group indices; `None` for filtered-out groups.

**Why this method:** Dunnett's test accounts for correlation between multiple control comparisons, providing higher power than Bonferroni while controlling FWER. This is the standard post-hoc test for many-to-one comparisons in tox study design.

**Alternatives considered:** Bonferroni (STAT-10, more conservative, already used for pairwise in the main pipeline). Holm-Sidak (step-down variant, marginal power gain).

**Consumers:** Generator enrichment step (`domain_stats.py:227`). Result stored as `dunnett_p` list. Supplementary — not used in primary classification.

---

### STAT-08 — Kruskal-Wallis H-Test

**Purpose:** Nonparametric omnibus test (alternative to one-way ANOVA) for ordinal or non-normal data.

**Implementation:** `scipy.stats.kruskal(*valid_groups)` — backend `domain_stats.py:94`.

**Parameters:** At least 2 groups with n >= 1 each. Returns `None` on exception.

**Why this method:** Rank-based test appropriate for ordinal severity grades (1–5 MI severity scale) where the normality assumption of ANOVA is violated.

**Alternatives considered:** One-way ANOVA (STAT-06, valid for continuous data only). Permutation ANOVA (computationally expensive).

**Current status:** Implemented but not called in the active pipeline. Reserved for future ordinal analysis of MI severity data.

---

### STAT-09 — Spearman Rank Correlation

**Purpose:** Assess monotonic relationship between two variables without assuming linearity.

**Implementation:** Two variants in backend `statistics.py`:
- General: `spearman_correlation(x, y)` at line 112. Minimum 3 pairs.
- Severity-specific: `severity_trend(dose_levels, avg_severities)` at line 124. Minimum 3 pairs, returns `{None, None}` if severity is constant.

**Parameters:** Paired observations with NaN mask. Both variants use `scipy.stats.spearmanr()`.

**Why this method:** Nonparametric — tests monotonic but not necessarily linear relationships. Robust to outliers and ordinal scales.

**Alternatives considered:** Pearson correlation (assumes normality and linearity). Kendall's tau (similar information, less familiar in tox literature).

**Consumers:** Used internally by STAT-04 (Jonckheere-Terpstra approximation). `severity_trend()` reserved for future severity-specific analysis.

---

### STAT-10 — Bonferroni Correction

**Purpose:** Control familywise error rate when performing multiple pairwise comparisons.

**Implementation:** `bonferroni_correct(p_values, n_tests)` — backend `statistics.py:143`.

**Parameters:** `p_adj = min(p_raw * n_tests, 1.0)`. Default `n_tests` = count of non-None p-values. Cap at 1.0. `None` values preserved.

**Why this method:** Simplest and most conservative multiple-comparison correction. Controls FWER at the specified alpha. Appropriate for regulatory safety reporting where false negatives are more acceptable than false positives.

**Alternatives considered:** Holm-Sidak (step-down, more powerful but harder to explain). Benjamini-Hochberg FDR (controls false discovery rate, less conservative — inappropriate for safety-critical assessments). Dunnett's (STAT-07, used separately as enrichment).

**Consumers:** LB (`findings_lb.py:125`), BW (`findings_bw.py:114`), OM, FW (`domain_stats.py:365`). **Not applied** to incidence domains (MI, MA, CL, DS, TF).

---

### STAT-11 — Binomial SE Tolerance

**Purpose:** Define an equivalence band for incidence data to absorb sampling noise in dose-response pattern classification.

**Implementation:** `_binomial_tolerance(n, p)` — backend `classification.py:80`. Frontend mirror in `pattern-classification.ts:295`.

**Parameters:** `se = sqrt(p * (1 - p) / n)`. Tolerance = `max(1.5 * se, 0.02)`. Returns minimum tolerance (0.02) if n <= 0 or p not in (0, 1).

**Constants:**
- `_MIN_INCIDENCE_TOLERANCE = 0.02` (2 percentage points floor)
- Multiplier: 1.5 on standard error (~68% CI, wider than 1 sigma)

**Why this method:** Incidence differences smaller than this band are treated as "flat" to prevent false non-monotonic classifications from sampling noise. The 1.5x multiplier provides a confidence interval wider than 1 sigma. The 2pp floor ensures even perfectly-observed proportions (0/5 or 5/5) get minimum tolerance.

**Alternatives considered:** Fixed tolerance (ignores sample size dependence). Exact binomial CI (computationally more expensive, marginal benefit at typical n=5–30).

**Consumers:** Dose-response classification for incidence data (CLASS-02/CLASS-03).

---

### STAT-12 — Hedges' g Effect Size (bias-corrected)

**Purpose:** Standardized measure of the difference between two group means, in units of pooled standard deviation, with small-sample bias correction.

**Implementation:** `cohens_d(group1, group2)` — backend `statistics.py:96`. Function name retained for backwards compatibility; JSON field remains `cohens_d`. The computation applies Hedges' correction factor `J = 1 - 3/(4*df - 1)` where `df = n1 + n2 - 2`.

**Parameters:** Pooled SD uses Bessel's correction (`ddof=1`). Minimum n=2 per group. Returns `None` if pooled SD = 0 (constant values). Formula: `g = d * J`, where `d = (mean1 - mean2) / SD_pooled`, `SD_pooled = sqrt(((n1-1)*var1 + (n2-1)*var2) / (n1 + n2 - 2))`, and `J = 1 - 3/(4*df - 1)`.

**Why this method:** Hedges' g corrects the upward bias in Cohen's d that occurs with small sample sizes (n < 20), which are typical in preclinical studies (control n=10, treated n=5). The correction factor J approaches 1.0 as sample size increases, so there is no penalty for larger studies. REM-05 identified this as a P1 scientific issue.

**Alternatives considered:** Uncorrected Cohen's d (biased high for small n, previously used). Glass's delta (uses only control SD — biased when treatment changes variance).

**Consumers:** All continuous pairwise comparisons (LB, BW, OM, FW). Max |g| feeds severity classification (CLASS-01) and signal scoring (METRIC-01). Thresholds used across the system: 0.5 (meaningful), 0.8 (strong), 1.0 (very strong), 2.0 (extreme). Review packet column header: "Effect Size (g)".

---

## Algorithmic Methods (METH)

### METH-01 — Dual-Pass Early-Death Exclusion

**Purpose:** Separate analysis with and without animals that died early, so that early-death artifacts do not mask or inflate treatment effects in terminal endpoints.

**Implementation:** `compute_all_findings(study, early_death_subjects)` — backend `domain_stats.py:110`.

**Parameters:**
- Pass 1: All animals, all domains
- Pass 2 (conditional on `early_death_subjects`): Exclude early-death subjects from terminal domains only (`TERMINAL_DOMAINS = {"MI", "MA", "OM", "TF"}`) and LB (terminal timepoint only)
- Merge: Pass 1 provides base stats; Pass 2 augments with scheduled-only stats for comparison
- Lookup key: `(domain, test_code, sex, day)`

**Why this method:** Animals that die early have incomplete exposure. Their terminal pathology reflects both treatment effect and intercurrent disease. Analyzing with and without these animals shows whether a finding persists in scheduled-sacrifice animals (more reliable) or was driven by moribund animals (potentially artifact).

**Alternatives considered:** Exclude all early-death data (loses information). Covariate-adjusted analysis (requires modeling assumptions beyond scope).

---

### METH-02 — BW Percent Change from Baseline

**Purpose:** Express body weight changes as percent change from each animal's own baseline, enabling within-subject comparison.

**Implementation:** `compute_bw_findings(study, subjects)` — backend `findings_bw.py:41`.

**Parameters:** Baseline = first timepoint per subject (min BWDY). Formula: `((value - baseline) / baseline) * 100` where baseline > 0, else NaN. Precision: 2 decimals.

**Why this method:** Absolute body weight varies across animals. Percent change normalizes to baseline, making dose-group comparisons meaningful. Industry standard for body weight analysis in tox studies.

**Alternatives considered:** Absolute change (confounded by initial body weight). AUC-based BW analysis (more complex, not standard for SEND).

---

### METH-03 — Relative Organ Weight (Organ-to-Body Ratio)

**Purpose:** Normalize organ weights to terminal body weight, accounting for body size differences across animals.

**Implementation:** `compute_om_findings(...)` — backend `findings_om.py:86`.

**Parameters:** `relative = (organ_weight / terminal_body_weight) * 100` where tbw > 0, else NaN. Terminal body weight = last BWDY in BW domain per subject. Precision: 4 decimals.

**Why this method:** Absolute organ weights correlate with body size. Relative organ weight isolates drug-induced organ changes from body growth effects. Required by FDA for organ weight evaluation.

**Alternatives considered:** Organ-to-brain-weight ratio (standard for some organs but not universal). Allometric scaling (unnecessary for within-study comparison).

---

### METH-04 — MI Severity Score Mapping

**Purpose:** Convert text-based microscopic finding severity grades (SENDIG terminology) to numeric scores for statistical analysis.

**Implementation:** `SEVERITY_SCORES` dict and `compute_mi_findings(...)` — backend `findings_mi.py:15`.

**Parameters:** Mapping: `{MINIMAL: 1, MILD: 2, MODERATE: 3, MARKED: 4, SEVERE: 5}`. Average severity computed for affected subjects only per dose group. Normal terms excluded: `{NORMAL, WITHIN NORMAL LIMITS, WNL, NO ABNORMALITIES, UNREMARKABLE}`.

**Why this method:** CDISC SEND defines severity as text. Numeric mapping enables parametric analysis (mean, trend) while preserving ordinal relationships. The 1–5 scale is universal in toxicological pathology.

**Alternatives considered:** Binary (present/absent) — loses severity information. Weighted scoring (severity * area affected) — requires data not in SEND.

---

### METH-05 — Incidence Normalization

**Purpose:** Compute proportion of affected animals per dose group for binary (present/absent) endpoints.

**Implementation:** Per-domain `compute_*_findings()` — backend `findings_mi.py:99`, `findings_ma.py:80`, `findings_cl.py:61`.

**Parameters:** `incidence = affected / total` per (dose_level, sex). Affected = unique USUBJID count with finding. Total from pre-computed `n_per_group`. Returns 0 if total = 0. Precision: 4 decimals.

**Why this method:** Standard incidence calculation. Necessary for Fisher's exact (STAT-03) and Cochran-Armitage (STAT-05) inputs. Group size normalization handles unequal arms (e.g., satellite groups).

**Alternatives considered:** None — this is the universal definition of incidence.

---

### METH-06 — Tissue/Biomarker Organ System Resolution

**Purpose:** Map any finding (from any domain) to its organ system for cross-domain coherence analysis.

**Implementation:** `get_organ_system(specimen, test_code, domain)` — backend `organ_map.py:9`.

**Parameters:** Three-tier resolution priority:
1. Specimen (primary): exact match in `ORGAN_SYSTEM_MAP`, or prefix match for compound names (e.g., "LYMPH NODE, INGUINAL" matches "LYMPH_NODE")
2. Test code (fallback): lookup in `BIOMARKER_MAP[test_code].get("system")` from `send_knowledge.py`
3. Domain default: LB/EG/VS → specific systems, others → "general"

**Why this method:** Organ system is the key grouping variable for signal aggregation. Multiple domains reference the same organ differently (MI uses specimen names, LB uses test codes, OM uses both). This resolver provides a canonical mapping.

**Alternatives considered:** Manual per-domain mapping (requires maintenance for each new endpoint). MedDRA SOC mapping (external dependency, not needed at this level).

---

### METH-07 — Tumor Morphology to Cell Type

**Purpose:** Extract cell type lineage from tumor morphology text for tumor classification and cross-reference.

**Implementation:** `_extract_cell_type(morphology)` — backend `findings_tf.py:18`.

**Parameters:** Normalize to uppercase; longest-key-first matching against `CELL_TYPE_MAP` (47 entries). Examples: "HEPATOCELLULAR" → "hepatocellular", "RENAL CELL" → "renal_cell", "LYMPHOMA" → "lymphoid". Returns "unclassified" if no match.

**Why this method:** SEND encodes tumor morphology as free text (MITESTCD + free-text description). Cell type lineage is needed for carcinogenicity assessment. Longest-key-first prevents partial matches (e.g., "CELL" shouldn't match before "RENAL CELL").

**Alternatives considered:** SNOMED-CT lookup (external dependency, overkill for cell type). Regex-based extraction (fragile with free-text pathology descriptions).

---

### METH-08 — SETCD to Dose Level Mapping (TK Satellite)

**Purpose:** Map toxicokinetic (TK) satellite group SETCDs to their corresponding dose levels for PK-PD correlation.

**Implementation:** `_build_setcd_dose_map(dm_df, dose_groups)` — backend `pk_integration.py:232`.

**Parameters:** Parse numeric prefix from TK SETCDs (e.g., "1TK" → "1", "2TK" → "2"). Match prefix to group_number (1-indexed from dose_groups). Returns mapping: `{setcd_string: dose_level_index}`.

**Why this method:** TK satellite groups follow a naming convention where the numeric prefix matches the main study group number. This enables automated dose assignment without requiring explicit mapping in study design documents.

**Alternatives considered:** TX domain cross-reference (not all studies encode TK groups in TX). Manual mapping (not scalable for automated pipeline).

---

### METH-09 — ISO 8601 Duration Parsing

**Purpose:** Convert PK elapsed time strings (ISO 8601 duration format) to numeric hours for concentration-time analysis.

**Implementation:** `_parse_elapsed_time(pceltm)` — backend `pk_integration.py:841`.

**Parameters:** Parse "PT" prefix, then loop-extract hours (H), minutes (M), seconds (S). Examples: "PT0.5H" → 0.5, "PT2H" → 2.0, "PT30M" → 0.5, "PT1H30M" → 1.5. Fallback: plain number interpreted as hours. Precision: 4 decimals.

**Why this method:** SEND PC domain uses ISO 8601 durations for PCELTM (elapsed time). Numeric conversion enables sorting and interpolation for concentration-time curves.

**Alternatives considered:** Python `isodate` library (external dependency for a simple parse). Regex-only (insufficient for compound durations like "PT1H30M").

---

### METH-10 — BQL Handling (LLOQ/2 Imputation)

**Purpose:** Handle below-quantification-limit (BQL) concentration values in pharmacokinetic data by imputing LLOQ/2.

**Implementation:** `_compute_concentration_time(...)` — backend `pk_integration.py:368`.

**Parameters:** Missing PCSTRESN → BQL. Imputed as `LLOQ / 2` (standard PK convention). `is_bql` boolean tracked per record. LLOQ sourced from study design (TK config) or default 0.0.

**Why this method:** LLOQ/2 imputation is the most common handling for BQL data in regulatory PK analysis. It avoids zero values (which distort log-transformed analysis) while acknowledging that the true value lies between 0 and LLOQ.

**Alternatives considered:** LLOQ/sqrt(2) (M3 method — more theoretically justified but less common in SEND submissions). Maximum likelihood estimation (requires distributional assumptions). Zero imputation (biases mean estimates downward).

---

### METH-11 — TK Survivorship Cross-Reference

**Purpose:** Determine whether TK satellite animals survived the study, to distinguish real PK phenomena from mortality artifacts in dose-proportionality assessment.

**Implementation:** `_check_tk_survivorship(study, dm_df, tk_design)` — backend `pk_integration.py:619`.

**Parameters:** Death codes: `{"MORIBUND SACRIFICE", "FOUND DEAD", "DIED"}`. Cross-reference: TK subjects vs. main study subjects at highest dose. Returns counts of deaths in each arm.

**Why this method:** If main study animals die at high dose but TK satellites survive, a non-monotonic AUC curve may reflect real PK (saturation, autoinduction) rather than early-death artifact. This cross-reference resolves the ambiguity.

**Alternatives considered:** Ignore mortality context (risks misinterpreting PK curves). Covariate adjustment (insufficient data in typical TK designs).

---

### METH-12 — Rule Suppression (Deduplication)

**Purpose:** Eliminate redundant rule signals when a stronger rule already captures the same finding.

**Implementation:** `_apply_suppressions(results)` — backend `scores_and_rules.py:257`.

**Parameters:** Group by context key `(domain, test_code, sex)`. Suppression rules:
- R01 (treatment-related) present → suppress R07 (non-monotonic pattern)
- R04 (adverse severity) present → suppress R01 (treatment significance) and R03 (trend)

Removal by Python object identity (`id(r)`).

**Why this method:** Without suppression, a single adverse finding would fire R01 + R03 + R04 + R05/R06/R07, cluttering the results with redundant signals. The hierarchy ensures only the most specific/strongest rule survives per context.

**Alternatives considered:** Priority-based display (show all but rank by severity — still clutters). Mutual exclusion groups (more complex, same result).

---

### METH-13 — Direction Determination

**Purpose:** Assign directional interpretation ("up" or "down") to a finding based on the most robust available evidence.

**Implementation:** Per-domain `compute_*_findings()` — representative in `findings_lb.py:133`.

**Parameters:** Two-tier priority:
1. Primary: If max |Cohen's d| > 0.01, use sign(d): positive → "up", negative → "down"
2. Fallback: Compare high-dose mean to control mean via percent change

**Why this method:** Effect size (Cohen's d) is more reliable than raw mean comparison for noisy data. The 0.01 threshold avoids assigning direction from negligible effect sizes.

**Alternatives considered:** Always use mean comparison (sensitive to outliers). Trend slope sign (STAT-04 gives a single slope, not pairwise direction).

---

### METH-14 — Cross-Domain Syndrome Detection (XS01–XS10)

**Purpose:** Detect multi-organ toxicological syndromes by matching endpoint patterns across domains against predefined syndrome definitions.

**Implementation:** `detectFromEndpoints(endpoints, sex)` — frontend `cross-domain-syndromes.ts:856`.

**Parameters:** For each syndrome definition:
1. Required terms: match via test codes (exact), canonical labels (exact), specimen+finding pairs (MI/MA), or organ+direction (OM)
2. Supporting terms: match after required logic satisfied
3. Validation: `domainsCovered.length >= syndrome.minDomains`
4. Confidence: via CLASS-09 (`assignConfidence`)

Accepts compound Boolean expressions (METH-15) for required logic.

**Why this method:** Cross-domain convergence is the strongest evidence of a mechanistic syndrome (e.g., hepatotoxicity = ALT↑ + TBILI↑ + liver necrosis + liver weight↑). Term matching against curated definitions provides consistent, reproducible detection.

**Alternatives considered:** Machine learning clustering (requires training data, less interpretable). Manual pathologist annotation (not scalable for automated screening).

---

### METH-15 — Compound Expression Evaluator

**Purpose:** Evaluate Boolean logic expressions used in syndrome definitions (e.g., "ALP AND (GGT OR 5NT)").

**Implementation:** `evaluateCompoundExpression(expr, matchedTags)` — frontend `cross-domain-syndromes.ts:704`.

**Parameters:** Recursive parser supporting:
- `ANY(a, b, c)` — at least one item matches
- `(X AND Y)` — parenthesized sub-expression
- `X AND Y` — all parts true
- `X OR Y` — at least one part true
- Simple tag — `matchedTags.has(normalized)`

Top-level comma splitting respects parentheses via `splitTopLevel()`.

**Why this method:** Some syndromes require complex biomarker logic (e.g., cholestatic liver syndrome needs ALP AND either GGT or 5NT). A simple tag-set check cannot express this. The recursive evaluator handles arbitrary nesting.

**Alternatives considered:** Pre-flattened rules (exponential rule explosion for complex logic). External expression library (unnecessary dependency for a small grammar).

---

### METH-16 — Endpoint Synonym Resolution

**Purpose:** Map varied endpoint labels and test codes to a single canonical name for cross-study and cross-domain matching.

**Implementation:** `resolveCanonical(endpointLabel, testCode)` — frontend `lab-clinical-catalog.ts:155`.

**Parameters:** Two O(1) lookup maps built at module load:
1. `BY_TEST_CODE`: test code → canonical (e.g., "SGPT" → "ALT")
2. `BY_LABEL`: normalized label → canonical (e.g., "alanine aminotransferase" → "ALT")

Priority: test code first (more reliable), then label. Returns `null` if no match. No substring matching — exact only.

**Why this method:** Lab endpoints appear under many names across studies (ALT vs. SGPT vs. GPT vs. "Alanine Aminotransferase"). The lab clinical significance rules (CLASS-15) require canonical names. Pre-indexed maps provide O(1) lookup.

**Alternatives considered:** Fuzzy matching (false positives with similar-sounding tests). CDISC codelist lookup (doesn't cover legacy test names like SGPT).

---

### METH-17 — Endpoint Aggregation (Multi-Row Dedup)

**Purpose:** Collapse multiple rows per endpoint (from different sexes, timepoints, dose groups) into a single summary record.

**Implementation:** `deriveEndpointSummaries(rows)` — frontend `derive-summaries.ts:193`.

**Parameters:** Group by `endpoint_label`. Per-label aggregation:
- `worstSeverity`: max("adverse" > "warning" > "normal")
- `maxEffectSize`: max |d| across all rows
- `minPValue`: min p across all rows
- `direction`: from row with max |d|
- `pattern`: prefer non-flat dose-response pattern

Per-sex aggregation runs in parallel (`bySex` map). Backfill for H4 gap: if first row had null testCode/specimen/finding, take from subsequent rows.

**Why this method:** The adverse effects API returns one row per (endpoint, dose, sex, timepoint). The findings view needs one row per endpoint with worst-case statistics. Aggregation preserves the most concerning signal per endpoint.

**Alternatives considered:** Keep all rows (UI too verbose for screening). Average statistics (dilutes strong signals).

---

### METH-18 — Organ Coherence Derivation

**Purpose:** Assess cross-domain convergence of evidence within each organ system.

**Implementation:** `deriveOrganCoherence(endpoints)` — frontend `derive-summaries.ts:391`.

**Parameters:** Group endpoints by `organ_system`. Filter to adverse/warning severity. Count unique domains per organ. Convergence labels:
- >= 3 domains → "3-domain convergence"
- >= 2 domains → "2-domain convergence"
- 1 domain → "single domain"

**Why this method:** Multi-domain evidence for the same organ (e.g., liver: LB enzyme elevation + MI necrosis + OM weight increase) is far more compelling than single-domain findings. This simple domain count captures the concept without complex weighting.

**Alternatives considered:** Weighted domain scores (e.g., MI + OM more compelling than LB + BW — adds complexity without clear benefit at screening level). Correlation-based methods (require paired subject-level data).

---

### METH-19 — Histopathology Proxy Matching

**Purpose:** Match expected histopathology findings using morphological proxies when direct finding text doesn't match exactly.

**Implementation:** `checkFindingWithProxies(expectedFinding, observations)` — frontend `syndrome-interpretation.ts:811`.

**Parameters:** Try direct match first (case-insensitive substring). If no direct match, try proxies:
- Pattern: `/hypocellul/i` implies `CELLULARITY_CHANGE` with `decrease` relationship
- Pattern: `/hypercellul/i` implies `CELLULARITY_CHANGE` with `increase` relationship
- Direction-aware: proxy matches only when direction aligns

**Why this method:** Pathologists encode the same finding in many ways. "Decreased cellularity" may be coded as "HYPOCELLULARITY" rather than the expected "CELLULARITY DECREASED". Proxy matching bridges these coding variants.

**Alternatives considered:** NLP-based similarity (overkill for a small, well-defined synonym set). Strict matching only (misses valid findings coded differently).

---

### METH-20 — Sex-Divergence Projection

**Purpose:** Project aggregate endpoint statistics to sex-specific values when males and females show opposite directions.

**Implementation:** `projectToSex(ep, sex)` — frontend `cross-domain-syndromes.ts:782`.

**Parameters:** Divergence detection: `ep.bySex` has >= 2 entries AND direction set contains both "up" and "down". If divergent: override direction, effect size, p-value, pattern, severity, treatment-relatedness from sex-specific data. If no divergence: return aggregate (stronger signal than sex-specific).

**Why this method:** Some endpoints show opposite effects by sex (e.g., cholesterol increases in males, decreases in females). The aggregate signal washes out. Sex-specific projection enables correct syndrome matching per sex.

**Alternatives considered:** Always use sex-specific data (loses power when sexes agree). Ignore sex divergence (misses real biological differences).

---

### METH-21 — MedDRA Dictionary Key Building

**Purpose:** Construct standardized lookup keys for translational confidence dictionary (concordance data) from endpoint metadata.

**Implementation:** `buildDictionaryKeys(ep)` — frontend `syndrome-interpretation.ts:2429`.

**Parameters:** Domain-specific key patterns:
- LB/CL: `testCode.toUpperCase()` (primary), `endpoint_label.toUpperCase()` (fallback)
- MI/MA: `MI:FINDING:SPECIMEN` (normalized underscores). Short specimen variant for compound names
- OM: `OM:WEIGHT:SPECIMEN:UP|DOWN` (directional)

Returns array of keys in priority order (first match wins).

**Why this method:** The concordance data (LIU-FAN-2026) uses compound keys that encode domain + finding + specimen. This builder creates candidate keys from endpoint metadata, trying specific forms first and falling back to general forms.

**Alternatives considered:** Exact key match only (too brittle for varied specimen naming). Fuzzy matching (false positives in medical terminology).

---

### METH-22 — Discriminator Evaluation (Two-Pass)

**Purpose:** Evaluate discriminating findings that support or argue against a syndrome hypothesis, using domain-appropriate logic.

**Implementation:** `evaluateDiscriminator(disc, allEndpoints, histopathData)` — frontend `syndrome-interpretation.ts:963`.

**Parameters:** Two-pass design:
- **Pass 1 (Lab/OM endpoints):** Lookup endpoint by canonical name. Check significance (p < 0.05). If significant: direction match → "supports", mismatch → "argues_against". If not significant: direction-aware absence (expected down + absent = "supports"; expected up + absent = "argues_against")
- **Pass 2 (Histopath findings):** Parse "SPECIMEN::FINDING" format. Filter lesion rows by specimen, then by finding. If no finding: try proxy matching (METH-19). Return support/against based on presence.

**Why this method:** Different data types require different evaluation logic. Lab endpoints have p-values and directions; histopath findings have presence/absence and proxy coding. The two-pass design handles both cleanly.

**Alternatives considered:** Unified scoring (requires normalizing lab significance and histopath incidence to a common scale — possible but adds complexity without clear benefit for this binary support/against decision).

### METH-23 — Finding Term Normalization

**Purpose:** Map raw histopathology/macroscopic finding text to INHAND-aligned categories with reversibility profiles.

**Implementation:** `normalizeFinding(rawTerm)` — frontend `finding-term-map.ts:625`. Curated mapping table in same file at line 35.

**Parameters:** Two-pass lookup:
- **Pass 1 (Exact):** Lowercase-normalize the raw term and match against `FINDING_TERM_MAP` keys (O(1) hash lookup). Keys are curated against SEND Terminology 2017-03-31.
- **Pass 2 (Synonym):** Scan `SYNONYM_INDEX` (pre-indexed from `commonSynonyms` arrays in the mapping table). Returns the parent mapping.

Each mapping entry provides: `normalizedTerm`, `category` (FindingNature), `inhandClass`, and `reversibility` profile (`weeksLow`, `weeksHigh`, `qualifier`).

**Why this method:** SEND histopathology terms are not standardized across studies — the same lesion may be recorded as "hepatocellular hypertrophy", "hypertrophy, hepatocellular", or "Hepatocyte hypertrophy". A curated dictionary with synonym support normalizes these variants to INHAND-aligned categories, enabling consistent nature classification (CLASS-19) and cross-study comparison.

**Alternatives considered:** Fuzzy string matching (risk of false positives — "fibrosis" vs "fibroplasia" are distinct findings). NLP-based entity recognition (overkill for a controlled vocabulary of ~100 terms).

---

## Classification Algorithms (CLASS)

### CLASS-01 — Severity Classification

**Purpose:** Classify each finding as "adverse", "warning", or "normal" based on statistical significance and effect magnitude.

**Implementation:** `classify_severity(finding)` — backend `classification.py:7`.

**Parameters:**

*Continuous endpoints:*
- Adverse: `p_adj < 0.05 AND |d| >= 0.5`, OR `trend_p < 0.05 AND |d| >= 0.8`
- Warning: `p_adj < 0.05 AND |d| < 0.5`, OR `trend_p < 0.05 AND |d| < 0.8`, OR `|d| >= 1.0`
- Normal: none of the above

*Incidence endpoints:*
- Direction "down" (significant decrease): warning if `p_adj < 0.05` or `trend_p < 0.05`, else normal (decreases are not adverse — may be protective)
- Direction "up" or "none": adverse if `p_adj < 0.05`; warning if `trend_p < 0.05` or `p_adj < 0.1`; else normal

**Why this method:** Two-axis classification (statistical significance + biological magnitude) prevents both false alarms (significant but tiny effects) and missed signals (large effects in underpowered studies). The direction-aware incidence logic avoids flagging treatment-related decreases as adverse.

**Alternatives considered:** P-value only (ignores effect magnitude — a 0.1% difference can be "significant" at n=100). Effect size only (ignores variability — a 2x increase from 0.001 to 0.002 is meaningless).

---

### CLASS-02 — Dose-Response Pattern (Continuous)

**Purpose:** Classify the shape of the dose-response curve for continuous endpoints using noise-tolerant step analysis.

**Implementation:** `classify_dose_response(group_stats, data_type)` — backend `classification.py:174`.

**Parameters:**
- Equivalence band: `0.5 * pooled_SD` (`_EQUIVALENCE_FRACTION = 0.5`, `_MIN_POOLED_SD = 0.001`)
- Step direction: difference > band → "up"/"down"; within band → "flat"
- Pattern rules: all non-flat same direction (no flats) → "monotonic_increase/decrease"; with flats → "threshold_increase/decrease"; mixed → "non_monotonic"; all flat → "flat"

For incidence data: uses binomial SE-based tolerance (STAT-11) instead of pooled SD.

**Why this method:** Raw mean comparisons are noise-sensitive. The equivalence band (0.5 SD ≈ negligible Cohen's d) filters out sampling noise, preventing false non-monotonic classifications. This is critical: a finding classified as "non-monotonic" gets a lower signal score than "monotonic."

**Alternatives considered:** Polynomial regression (requires model selection, overfits at k=3-4 groups). Isotonic regression (provides shape but not a simple classification label). Fixed absolute threshold (not scale-invariant).

**Output:** `{pattern, confidence, onset_dose_level}`

---

### CLASS-03 — Dose-Response Pattern (Incidence/Histopath)

**Purpose:** Frontend pattern classification for incidence-type findings with histopathology-specific logic and confidence modifiers.

**Implementation:** `classifyPattern(groups, trendP, config)` — frontend `pattern-classification.ts:158`.

**Parameters:**
- Trivial gates: < 2 groups → NO_PATTERN; single treated → SINGLE_GROUP
- Baseline-awareness: effective threshold = `max(0.05, 0.15 * control_incidence)` (15% relative for high baselines)
- Monotonic tolerance: 0.02 (default)
- Non-monotonic: requires peak in interior groups exceeding neighbors by binomial tolerance, minimum 2 affected animals
- Pattern types: `MONOTONIC_UP`, `MONOTONIC_DOWN`, `THRESHOLD`, `NON_MONOTONIC`, `SINGLE_GROUP`, `CONTROL_ONLY`, `NO_PATTERN`

**Why this method:** Extends CLASS-02 with histopathology-specific features: baseline-relative thresholds (a 5% increase from 50% control is different from 5% from 0% control), laterality modifiers, syndrome concordance boosters, and organ weight correlation.

**Alternatives considered:** Reuse backend classification directly (lacks histopath-specific modifiers and laterality logic).

---

### CLASS-04 — Pattern Confidence Scoring

**Purpose:** Assess confidence in the dose-response pattern classification (how much to trust the pattern label).

**Implementation:** `_compute_confidence(steps, means, pooled_sd)` — backend `classification.py:119`.

**Parameters:**
- Factor 1: Max Cohen's d from control: >= 2.0 → +2 points, >= 0.8 → +1 point
- Factor 2: Raw step cleanliness without band (all monotonic → +1 point)
- Score >= 3 → "HIGH", >= 1 → "MODERATE", < 1 → "LOW"

**Why this method:** Pattern classification alone doesn't indicate reliability. A "monotonic" pattern from noisy data with |d| = 0.3 deserves less trust than one with |d| = 2.0. The confidence score captures this.

**Alternatives considered:** P-value-based confidence (STAT-04 trend p-value already captured separately). Bootstrap confidence interval for pattern (computationally expensive).

---

### CLASS-05 — Treatment-Relatedness Determination

**Purpose:** Determine whether a finding is likely caused by the test article (treatment-related) vs. spontaneous.

**Implementation:** `determine_treatment_related(finding)` — backend `classification.py:255`.

**Parameters:** OR logic across three criteria:
1. `p_adj < 0.05 AND trend_p < 0.05` (both pairwise and trend significant)
2. `severity == "adverse" AND dose_response in ("monotonic_increase", "monotonic_decrease")`
3. `p_adj < 0.01` (very strong pairwise evidence alone)

**Why this method:** Treatment-relatedness requires converging evidence: statistical significance alone is insufficient (could be chance), dose-response alone is insufficient (could be coincidental trend). The three OR-criteria capture different evidence profiles that are individually compelling.

**Alternatives considered:** Bayesian posterior probability (requires prior distribution for spontaneous rates — not available without historical control database). ECETOC framework (implemented at syndrome level as METRIC-08, not per-endpoint).

---

### CLASS-06 — NOAEL/LOAEL Derivation (Backend)

**Purpose:** Identify the No-Observed-Adverse-Effect-Level (NOAEL) and Lowest-Observed-Adverse-Effect-Level (LOAEL) from dose-group findings.

**Implementation:** `build_noael_summary(...)` — backend `view_dataframes.py:307`.

**Parameters:**
- LOAEL: lowest dose level with `severity == "adverse" AND p_value < 0.05` in pairwise
- NOAEL: LOAEL - 1 (if LOAEL > 0), else None ("not established")
- Per-sex derivation: M, F, Combined (each independent)
- Mortality cap: if mortality LOAEL exists and NOAEL >= it, cap NOAEL to `mortality_loael - 1`
- Scheduled-only NOAEL: re-derive excluding early deaths, flag if differs

**Why this method:** NOAEL/LOAEL is the primary regulatory endpoint. Simple "highest dose with no adverse finding" is the FDA-standard derivation. The mortality cap prevents setting NOAEL at a dose where animals die.

**Alternatives considered:** Benchmark dose (BMD) modeling (more sophisticated, requires custom dose-response models — planned for future). Trend-based NOAEL (no standard definition).

---

### CLASS-07 — Endpoint NOAEL Derivation (Frontend, Pairwise)

**Purpose:** Frontend derivation of per-endpoint NOAEL with tier classification for the findings view.

**Implementation:** `computeEndpointNoaelMap(findings, doseGroups)` — frontend `derive-summaries.ts:495` (helper at line 437).

**Parameters:**
- Iterate dose levels ascending; find lowest with `p_value_adj < 0.05` in pairwise → LOAEL
- NOAEL = LOAEL - 1
- Tier: LOAEL at dose 1 → "at-lowest"; dose 2 → "mid"; dose >= 3 → "high"; no LOAEL but trend_p < 0.05 → "below-lowest"; no adverse → "none"
- Sex-specific breakdown; Combined = worst-case across sexes; flag `sexDiffers`

**Why this method:** Frontend needs per-endpoint NOAEL for the findings rail and NOAEL decision view. The tier classification provides quick visual assessment of how conservative the NOAEL is.

**Alternatives considered:** Use only backend NOAEL (backend computes study-level, not per-endpoint).

---

### CLASS-08 — Target Organ Flagging

**Purpose:** Flag organs as "target organs" based on aggregated signal evidence across all endpoints.

**Implementation:** `build_target_organ_summary(findings)` — backend `view_dataframes.py:85`.

**Parameters:**
- Evidence score: `(total_signal / n_endpoints) * (1 + 0.2 * (n_domains - 1))`
- Target organ flag: `evidence_score >= 0.3 AND n_significant >= 1`
- Supporting metrics: n_domains, n_endpoints, n_significant (p < 0.05), max_severity (1–5 from histopath)

**Why this method:** Target organ identification is a key regulatory deliverable. The evidence score combines signal strength with cross-domain convergence. The 0.3 threshold flags approximately 1 strong signal or 2–3 moderate signals from different domains.

**Alternatives considered:** Expert rule-based (too rigid for varied study designs). Machine learning (insufficient training data for rare organs).

---

### CLASS-09 — Cross-Domain Syndrome Confidence

**Purpose:** Assign confidence level to a detected cross-domain syndrome based on evidence quality.

**Implementation:** `assignConfidence(requiredMet, supportCount, domainCount, oppositeCount)` — frontend `cross-domain-syndromes.ts:759`.

**Parameters:**
- HIGH: `requiredMet AND supportCount >= 3 AND domainCount >= 3`
- MODERATE: `requiredMet AND supportCount >= 1 AND domainCount >= 2`
- LOW: otherwise
- Counter-evidence penalties: `oppositeCount >= 2` → force LOW; `oppositeCount >= 1 AND base == HIGH` → cap at MODERATE

**Why this method:** Confidence should reflect both the strength of supporting evidence and the presence of contradicting evidence. The three-level system (HIGH/MODERATE/LOW) is simple enough for screening while capturing the key distinctions.

**Alternatives considered:** Continuous confidence score (more granular but harder to interpret at screening level). Bayesian posterior (requires prior, unavailable for novel syndromes).

---

### CLASS-10 — Recovery Verdict

**Purpose:** Classify whether a finding reversed, persisted, or progressed during the recovery period.

**Implementation:** `computeVerdict(main, recovery, thresholds)` — frontend `recovery-assessment.ts:110`.

**Parameters:** Guard chain first (not_examined, insufficient_n, anomaly, low_power, not_observed). Then:
- `incidenceRatio = recovery.incidence / main.incidence`
- `sevRatio = recovery.avgSeverity / main.avgSeverity`
- Verdicts: "reversed" (incR <= 0.2, sevR <= 0.3), "reversing" (incR <= 0.5 or sevR <= 0.5), "progressing" (incR > 1.1 and more affected), "persistent" (default)

Default thresholds: `{reversedIncidence: 0.2, reversedSeverity: 0.3, reversingIncidence: 0.5, reversingSeverity: 0.5, progressingIncidence: 1.1, progressingSeverity: 1.2}`

v4 duration awareness: short recovery period may reclassify persistent → reversing.

**Why this method:** Recovery assessment requires comparing incidence and severity ratios between main and recovery arms. The ratio-based approach normalizes for different baseline severities. The guard chain prevents spurious verdicts from insufficient data.

**Alternatives considered:** Binary (recovered/not) — loses nuance. Statistical test on recovery data (underpowered: recovery arms typically have n=3–5).

---

### CLASS-11 — Protective Signal Classification

**Purpose:** Classify treatment-related decreases in histopathology findings as pharmacological, secondary, or background.

**Implementation:** `classifyProtectiveSignal(input)` — frontend `protective-signal.ts:71`.

**Parameters:** Three-tier classification:
1. Directionality gate: only "decreasing" findings enter
2. Magnitude check: decrease < 15pp OR control < 10% → "background"
3. Pharmacological exclusion: 23-item list of artifact/degenerative findings
4. Dose consistency + cross-domain correlates: "pharmacological" requires strong + >= 2 correlates; "treatment-decrease" requires strong or moderate + >= 1 correlate

Consequence finding heuristic: structural/compositional + >= 2 correlates → likely secondary effect, not direct pharmacological.

**Why this method:** Not all decreases in histopathology incidence are protective. Some are artifacts (degenerative changes that don't occur if animals are healthier), some are secondary to body weight loss, and only a subset represent genuine pharmacological protection. This three-tier system distinguishes them.

**Alternatives considered:** Binary (protective/not) — too simplistic. Historical control comparison (requires database not available).

---

### CLASS-12 — Syndrome Certainty Assessment

**Purpose:** Assess the mechanistic certainty of a detected syndrome based on discriminating evidence.

**Implementation:** `assessCertainty(syndrome, discriminators, allEndpoints, histopathData)` — frontend `syndrome-interpretation.ts:1109`.

**Parameters:** Gate chain:
1. Required pathway not met → "pattern_only"
2. Strong counter-evidence → "mechanism_uncertain"
3. Strong supporting without contradiction → "mechanism_confirmed"
4. Moderate supporting, no contradiction → "mechanism_confirmed"
5. Default → "mechanism_uncertain"

**Why this method:** Syndrome detection (METH-14) identifies pattern matches. Certainty assessment evaluates whether the mechanistic explanation is credible (e.g., hepatotoxicity is confirmed if liver enzymes AND histopath AND organ weight all point the same way).

**Alternatives considered:** Continuous certainty score (harder to action for regulatory decisions). Expert panel consensus (not automatable).

---

### CLASS-13 — Adversity Assessment (ECETOC B-Factors)

**Purpose:** Determine whether a syndrome constitutes an "adverse" effect using the ECETOC decision framework B-factors.

**Implementation:** `computeAdversity(syndrome, allEndpoints, recovery, certainty, tumorContext, foodConsumptionContext)` — frontend `syndrome-interpretation.ts:2165`.

**Parameters:** B-factors evaluated:
- B-2 (adaptive): false (not determinable from current data model)
- B-3 (reversible): from recovery status
- B-4 (magnitudeLevel): from max |Cohen's d| — severe >= 2.0, marked >= 1.5, moderate >= 1.0, mild >= 0.5, minimal < 0.5
- B-5 (crossDomainSupport): domainsCovered.length >= 2
- B-6 (precursorToWorse): from tumor context
- B-7 (secondaryToOther): from food consumption context

Decision: adverse if precursor to tumors OR mechanism confirmed + cross-domain OR severe/marked magnitude. Non-adverse if reversible + minimal/mild + no progression. Equivocal otherwise.

**Why this method:** ECETOC B-factors are the standard industry framework for adversity assessment. Automating this provides consistency and traceability.

**Alternatives considered:** NOAEL-only assessment (doesn't distinguish adverse from non-adverse). Custom scoring (less defensible than ECETOC in regulatory submissions).

**References:** ECETOC Technical Report No. 85 (2002), updated guidance.

---

### CLASS-14 — Overall Severity Cascade

**Purpose:** Assign an overall severity level to a syndrome, integrating mortality, tumor, mechanism, and adversity assessments.

**Implementation:** `deriveOverallSeverity(mortalityContext, tumorContext, adversity, certainty)` — frontend `syndrome-interpretation.ts:2227`.

**Parameters:** Priority cascade:
1. Deaths in syndrome organs → "S0_Death"
2. Tumors + progression → "carcinogenic"
3. Tumors without progression → "proliferative"
4. Treatment-related deaths (non-syndrome organs) → "S4_Critical"
5. Mechanism confirmed + adverse → "S3_Adverse"
6. Any adverse signal → "S2_Concern"
7. Non-adverse with confirmed mechanism → "S1_Monitor"
8. Default → "S2_Concern"

**Why this method:** Regulatory reporting requires a single summary severity. The cascade reflects toxicological priority: death > cancer > critical toxicity > adverse > monitoring. This mirrors standard industry practice for report narratives.

**Alternatives considered:** Matrix-based (cross all dimensions — too complex for a summary label). Worst-case-only (misses important nuances like "confirmed mechanism but non-adverse").

---

### CLASS-15 — Lab Rule Severity Grading (L01–L31)

**Purpose:** Evaluate lab endpoints against 31 graded clinical significance rules organized by organ system.

**Implementation:** Lab rule definitions and `evaluateThreshold(rule, ctx)` — frontend `lab-clinical-catalog.ts:224`.

**Parameters:** 31 rules across categories:
- Liver (L01–L11): ALT elevation thresholds (2–5x for S2, >= 5x for S3), Hy's Law pattern (ALT + TBILI = S4), hepatocellular/cholestatic panel coverage (QC rules)
- Renal (L12–L13): BUN >= 2x → S3, Creatinine >= 1.5x → S3
- Hematologic (L14–L19): HGB/RBC decrease >= 2x → S3, Platelet decrease >= 2x → S3, WBC/Neutrophil thresholds
- Electrolyte/Metabolic (L20–L25): K/Na/GLUC/CHOL imbalances
- Coagulation (L24): PT/INR/APTT thresholds

Severity tiers: S1 (Monitor), S2 (Concern), S3 (Adverse), S4 (Critical).

**Why this method:** Graded rules mirror clinical laboratory alerting practice. Thresholds derived from human clinical significance criteria adapted for preclinical context (wider thresholds to account for species differences).

**Alternatives considered:** Single unified threshold (ignores organ-specific biology). Machine learning (requires large training set, less interpretable for regulators).

---

### CLASS-16 — Endpoint Confidence (Findings Rail)

**Purpose:** Classify confidence in an endpoint's adverse signal for the findings rail display.

**Implementation:** `classifyEndpointConfidence(ep)` — frontend `findings-rail-engine.ts:93`.

**Parameters:**
- HIGH (level 2): `p < 0.01 AND |d| >= 0.8 AND pattern in (monotonic, threshold)`
- MODERATE (level 1): `p < 0.05` OR `|d| >= 0.5 AND pattern != flat` OR `treatmentRelated AND pattern != flat`
- LOW (level 0): otherwise
- Modifiers: treatmentRelated → +1 tier (cap at 2); sexes.length >= 2 → +1 tier (cap at 2)

**Why this method:** The findings rail sorts endpoints by signal strength. Confidence classification provides grouping within the rail (HIGH endpoints first). The three dimensions (significance, effect size, pattern) capture the essential information quality.

**Alternatives considered:** Continuous score only (rail already uses METRIC-03 for sorting — confidence provides grouping). Binary (too coarse for a multi-tier rail).

---

### CLASS-17 — Dose-Proportionality (Log-Log PK)

**Purpose:** Assess whether drug exposure increases proportionally with dose using log-log linear regression.

**Implementation:** `_compute_dose_proportionality(by_dose_group, tk_survivorship)` — backend `pk_integration.py:418`.

**Parameters:**
- Prefer AUCLST > AUCTAU > AUCIFO as exposure parameter
- Requires >= 3 dose groups with valid AUC data
- Log-log regression: `log(AUC) = slope * log(dose) + intercept`
- Classification: slope 0.8–1.2 → "linear"; > 1.2 → "supralinear"; < 0.8 → "sublinear"
- Non-monotonicity flag: AUC drops between consecutive dose groups
- TK survivorship cross-reference (METH-11): distinguish real PK from mortality artifact

**Why this method:** Log-log linearity is the standard power model for dose-proportionality (AUC = a * dose^b, where b = 1 for proportionality). The 0.8–1.2 slope range follows FDA bioequivalence guidance.

**Alternatives considered:** AUC/dose ratio (simple but doesn't provide statistical assessment). Mixed-effects model (requires individual-level PK data, often unavailable in summary TK).

**References:** FDA Guidance for Industry: Bioanalytical Method Validation (dose-proportionality section).

---

### CLASS-18 — Rule Engine (R01–R19)

**Purpose:** Evaluate 19 predefined signal rules across endpoint, organ, and study scopes to generate structured rule results.

**Implementation:** `evaluate_rules(findings, target_organs, noael_summary, dose_groups)` — backend `scores_and_rules.py:97`.

**Parameters:** 19 rules:

| ID | Scope | Severity | Condition |
|----|-------|----------|-----------|
| R01 | endpoint | info | treatment_related == True |
| R02 | endpoint | info | p_value_adj < 0.05 in pairwise |
| R03 | endpoint | info | trend_p < 0.05 |
| R04 | endpoint | warning | severity == "adverse" |
| R05 | endpoint | info | monotonic pattern |
| R06 | endpoint | info | threshold pattern |
| R07 | endpoint | info | non_monotonic pattern |
| R08 | organ | warning | target_organ_flag == True |
| R09 | organ | info | n_domains >= 2 |
| R10 | endpoint | warning | \|effect_size\| >= 1.0 (dampened if n_affected <= 1) |
| R11 | endpoint | info | 0.5 <= \|effect_size\| < 1.0 |
| R12 | endpoint | warning | MI/MA/CL, direction == "up", non-normal severity |
| R13 | endpoint | info | histopath severity grade increase pattern |
| R14 | study | info | NOAEL established |
| R15 | study | warning | NOAEL not established (adverse at lowest dose) |
| R16 | organ | info | correlated findings (n_findings >= 2 in organ) |
| R17 | study | critical | mortality signal (DS domain, dose-dependent) |
| R18 | endpoint | info | histopath incidence decrease |
| R19 | endpoint | info | potential protective effect (ctrl >= 50%, drop >= 40pp) |

Suppressions (METH-12): R01 → suppress R07; R04 → suppress R01, R03.

**Why this method:** Rule-based signal detection provides transparent, auditable results. Each rule maps to a specific toxicological concept. The suppression hierarchy eliminates redundancy.

**Alternatives considered:** Machine learning signal detection (not interpretable enough for regulatory use). Continuous scoring only (loses the "what does this mean?" narrative that rules provide).

### CLASS-19 — Finding Nature Classification

**Purpose:** Classify histopathology findings into biological nature categories (adaptive, degenerative, proliferative, inflammatory, depositional, vascular) with expected reversibility and typical recovery timelines.

**Implementation:** `classifyFindingNature(findingName, maxSeverity?)` — frontend `finding-nature.ts:140`. Uses `normalizeFinding()` (METH-23) as primary lookup, falls back to keyword substring table at line 47.

**Parameters:**
- **Two-pass resolution:** (1) CT-normalized lookup via METH-23. If found, map `reversibility.qualifier` to expected_reversibility tier (expected→high, unlikely→low, none→none, unknown→moderate). (2) If no CT match, scan 40+ keyword entries ordered by longest-match priority; proliferative checked first (neoplastic = irreversible, highest priority).
- **Severity modulation:** When `maxSeverity` is provided, `modulateBySeverity()` adjusts the expected recovery timeline — higher severity grades extend recovery weeks and may downgrade reversibility expectations. The modulation matrix is indexed by `[nature][severityBand]`.
- **Explicit unknown:** If neither CT nor keyword matches, returns `nature: "unknown"` with `expected_reversibility: "moderate"` (conservative default).

**Why this method:** Pathologists mentally classify findings by biological nature to predict reversibility — adaptive changes (hypertrophy, hyperplasia) are expected to reverse; degenerative changes (fibrosis, necrosis) may not. Automating this classification enables the recovery assessment engine (CLASS-10, CLASS-20) to set appropriate expectations per finding.

**Alternatives considered:** Asking the pathologist to manually classify (defeats the "system computes what it can" principle). Using INHAND classification directly (INHAND terms don't carry reversibility information).

### CLASS-20 — Recovery Classification (Interpretive Layer)

**Purpose:** Transform mechanical recovery verdicts (CLASS-10) into pathologist-meaningful interpretive categories with confidence grading, rationale, and recommended actions.

**Implementation:** `classifyRecovery(assessment, context)` — frontend `recovery-classification.ts:140`. Consumes `RecoveryAssessment` from `recovery-assessment.ts` (CLASS-10).

**Parameters:**
- **7 classification types:** `EXPECTED_REVERSIBILITY`, `INCOMPLETE_RECOVERY`, `ASSESSMENT_LIMITED_BY_DURATION`, `DELAYED_ONSET_POSSIBLE`, `INCIDENTAL_RECOVERY_SIGNAL`, `PATTERN_ANOMALY`, `UNCLASSIFIABLE`.
- **Priority order (most concerning first):** PATTERN_ANOMALY (0) > DELAYED_ONSET (1) > INCOMPLETE_RECOVERY (2) > ASSESSMENT_LIMITED (3) > EXPECTED_REVERSIBILITY (4) > INCIDENTAL (5) > UNCLASSIFIABLE (6).
- **Guard verdicts short-circuit:** If the mechanical verdict is `not_examined`, `insufficient_n`, `low_power`, `anomaly`, or `no_data`, classification returns `UNCLASSIFIABLE` with a specific rationale.
- **Context inputs:** `isAdverse`, `doseConsistency` (Weak/Moderate/Strong/NonMonotonic), `doseResponsePValue`, `clinicalClass` (Sentinel/HighConcern/etc.), `signalClass`, `findingNature` (from CLASS-19). Future nullable inputs: `historicalControlIncidence`, `crossDomainCorroboration`, `recoveryPeriodDays`.
- **Confidence model:** Starts at Low/Moderate/High based on classification certainty. Boosted one tier by strong dose consistency, available clinical class, or finding nature match. Degraded when inputs are missing.

**Why this method:** The mechanical verdict ("reversed", "persistent") answers "what do the numbers show?" — appropriate for data surfaces. The interpretive classification answers "what does this mean for the safety assessment?" — appropriate for insights and regulatory surfaces. Separating these layers keeps data presentation neutral while providing pathologist-meaningful interpretation.

**Alternatives considered:** Combining both layers in one function (violates the data-layer vs. interpretation-layer architectural separation). Using only the mechanical verdict everywhere (loses the interpretive context pathologists need for regulatory reports).

---

## Scoring Formulas (METRIC)

### METRIC-01 — Signal Score (4-Component Weighted)

**Purpose:** Single 0–1 composite score combining statistical significance, trend significance, effect magnitude, and dose-response pattern quality.

**Implementation:** `_compute_signal_score(p_value, trend_p, effect_size, dose_response_pattern)` — backend `view_dataframes.py:489`. Frontend mirror: `computeSignalScoreBreakdown()` — `rule-definitions.ts:260`.

**Parameters:**

| Component | Weight | Input | Transform | Cap |
|-----------|--------|-------|-----------|-----|
| P-value | 0.35 | adjusted p-value | `-log10(p) / 4.0` | p = 0.0001 |
| Trend | 0.20 | trend p-value | `-log10(p) / 4.0` | p = 0.0001 |
| Effect size | 0.25 | \|Cohen's d\| | `\|d\| / 2.0` | \|d\| = 2.0 |
| Pattern | 0.20 | pattern label | lookup table | 1.0 |

Pattern scores: `{monotonic_increase: 1.0, monotonic_decrease: 1.0, threshold: 0.7, non_monotonic: 0.3, flat: 0.0, insufficient_data: 0.0}`.

Final score: `min(sum_of_components, 1.0)`.

**Why these weights:** P-value (0.35) is the strongest single indicator of treatment effect. Effect size (0.25) captures biological magnitude — complements p-value, which is sample-size-dependent. Trend (0.20) confirms dose-response, a hallmark of causality. Pattern (0.20) reinforces monotonicity as the strongest causal signal.

**Alternatives considered:** Equal weights (ignores the fact that p-value is the most informative single measure). Principal component analysis (data-driven but unstable across studies). Unweighted maximum (loses the benefit of converging evidence).

---

### METRIC-02 — Target Organ Evidence Score

**Purpose:** Aggregate signal evidence across all endpoints within an organ system, with cross-domain convergence boost.

**Implementation:** `build_target_organ_summary(findings)` — backend `view_dataframes.py:85`. Frontend mirror: `computeEvidenceScoreBreakdown()` — `rule-definitions.ts:314`.

**Parameters:**
- `evidence_score = (total_signal / n_endpoints) * (1 + 0.2 * (n_domains - 1))`
- Convergence multiplier: 1.0 (1 domain), 1.2 (2 domains), 1.4 (3 domains), ...
- Target organ flag threshold: `evidence_score >= 0.3 AND n_significant >= 1`

**Why this formula:** Average signal per endpoint prevents organs with many low-quality findings from outscoring organs with few strong findings. The 20% boost per additional domain reflects the toxicological principle that multi-domain convergence is strong evidence of a target organ.

**Alternatives considered:** Sum of signals (biased toward organs with many endpoints). Maximum signal (ignores convergence). Weighted domain scoring (adds complexity without clear benefit at screening level).

---

### METRIC-03 — Findings Rail Signal Score

**Purpose:** Sort and group endpoints in the findings rail by signal strength, with domain-aware and syndrome-aware boosting.

**Implementation:** `computeEndpointSignal(ep, boosts)` — frontend `findings-rail-engine.ts:54`.

**Parameters:**
- Base: `severityWeight + pValueWeight + effectWeight + trBoost + patternWeight`
  - Severity: adverse = 3, other = 1
  - P-value: `max(0, -log10(minPValue))` (unbounded, capped implicitly by p-value range)
  - Effect: `min(|maxEffectSize|, 5)`
  - Treatment-related: +2
  - Pattern: base weight * confidence multiplier (HIGH=1.0, MOD=0.7, LOW=0.4)
- Boosts: syndromeBoost (+3 if in syndrome), coherenceBoost (+2 for 3+ domains, +1 for 2), clinicalFloor (S4=15, S3=8, S2=4, S1=0)
- Final: `max(base + boosts, clinicalFloor)`

Pattern base weights: `{monotonic_increase: 2, monotonic_decrease: 2, threshold: 1.5, non_monotonic: 0.5, flat: 0}`.

**Why this formula:** Unlike METRIC-01 (0–1 normalized), this score is unbounded, optimized for sorting. The clinical floor ensures lab clinical rules (CLASS-15) always rank at or above their severity level. The syndrome and coherence boosts promote findings that are part of a bigger mechanistic story.

**Alternatives considered:** METRIC-01 directly (too compressed for rail sorting — many findings cluster near 0.5). Manual priority tiers (loses continuous ranking within tiers).

---

### METRIC-04 — NOAEL Confidence Score

**Purpose:** Quantify confidence in the derived NOAEL by penalizing uncertainty factors.

**Implementation:** `_compute_noael_confidence(sex, sex_findings, all_findings, noael_level, n_adverse_at_loael)` — backend `view_dataframes.py:439`. Frontend mirror: `computeConfidenceBreakdown()` — `rule-definitions.ts:357`.

**Parameters:** Start at 1.0, subtract penalties:

| Penalty | Value | Condition |
|---------|-------|-----------|
| Single endpoint | -0.20 | n_adverse_at_loael <= 1 |
| Sex inconsistency | -0.20 | opposite sex has different NOAEL |
| Pathology disagreement | -0.00 | reserved (annotation data unavailable at generation) |
| Large effect non-significant | -0.20 | any finding with \|d\| >= 1.0 AND p >= 0.05 |

Floor: `max(confidence, 0.0)`.

**Why this method:** Confidence starts high and erodes with uncertainty. Each penalty represents a specific scientific concern. The 0.20 step size was chosen so that all four penalties together bring confidence to 0.2 (not zero — even worst case has some information).

**Alternatives considered:** Composite scoring (harder to explain per-penalty). Bootstrap confidence interval (computationally expensive, requires raw data at query time).

---

### METRIC-05 — Lab Clinical Confidence Score

**Purpose:** Assess confidence that a lab clinical significance rule match represents a genuine signal, based on supporting evidence.

**Implementation:** `computeConfidence(rule, ctx)` — frontend `lab-clinical-catalog.ts:642`.

**Parameters:** Additive score, interpreted as tier:

| Modifier | Points | Condition |
|----------|--------|-----------|
| Dose-response present | +2 | monotonic or threshold pattern |
| No dose-response | -1 | no dose-response, parameters exist |
| Same-organ corroboration | +2 | other endpoints in same organ adverse/warning |
| Multi-domain convergence | +2 | coherenceDomainCount >= 3 |
| Syndrome match | +2 | syndromeMatched |
| Multiple sexes | +1 | any parameter shows >= 2 sexes |
| Single sex only | -1 | all parameters single sex |
| Fold-change well above threshold | +1 | max fold-change >= 5.0 |

Interpretation: score >= 4 → HIGH, 1–3 → MODERATE, <= 0 → LOW.

Clinical floor boost: S4=15, S3=8, S2=4, S1=0 (applied at signal level, not confidence level).

**Why this formula:** Each modifier reflects an independent line of evidence that strengthens or weakens the rule match. Dose-response is the strongest single indicator (+2). Cross-organ and cross-domain evidence are independently important (+2 each). Single-sex and absent dose-response are red flags (-1 each).

**Alternatives considered:** Binary (match/no match — loses nuance). Weighted mean of p-values (doesn't capture cross-domain convergence).

---

### METRIC-06 — Histopathology Pattern Confidence

**Purpose:** Confidence level for histopathology pattern classification, incorporating statistical and contextual modifiers.

**Implementation:** `computeConfidence(groups, pattern, trendP, syndromeMatch, organWeightSignificant, laterality)` — frontend `pattern-classification.ts:344`.

**Parameters:**
- Base classification:
  - HIGH: `trendP < 0.05 AND activeGroups >= 3 AND totalAffected >= 5`
  - MODERATE: `trendP < 0.1 OR activeGroups >= 2 OR totalAffected in [3, 4]`
  - LOW: otherwise
- Modifiers (each can bump +1 tier, capped at HIGH): syndrome match, organ weight significant, peak severity >= 3.0, positive laterality
- Negative modifier (can drop -1 tier): negative laterality

**Why this formula:** Statistical trend significance is the primary indicator. Active group count and total affected capture reproducibility. Contextual modifiers (syndrome concordance, organ weight, severity grade, laterality) provide independent corroboration that a pathologist would consider.

**Alternatives considered:** Trend p-value alone (misses context). Multi-factor logistic model (overkill for three-tier classification).

---

### METRIC-07 — Pattern Signal Weight

**Purpose:** Convert a histopathology pattern classification + confidence into a numeric weight for signal scoring.

**Implementation:** `patternWeight(pattern, confidence, syndrome, options)` — frontend `pattern-classification.ts:540`.

**Parameters:**
- Base weights: `{MONOTONIC_UP: 2.5, THRESHOLD: 2.0, NON_MONOTONIC: 1.5, SINGLE_GROUP: 0.75, MONOTONIC_DOWN: 0.5, CONTROL_ONLY: 0, NO_PATTERN: 0}`
- Domain-aware MONOTONIC_DOWN: `{MI: 0.5, OM: 2.0, LB: 1.5, BW: 2.0, MA: 0.5}` (dose-dependent decrease is adverse for OM/BW, potentially protective for MI/MA)
- SINGLE_GROUP at highest dose: 1.5 (potential threshold effect), otherwise 0.75 (likely incidental)
- Confidence multiplier: `{HIGH: 1.0, MODERATE: 0.7, LOW: 0.4}`
- Syndrome boost: +1.0 if syndrome matched

**Why these weights:** MONOTONIC_UP (2.5) is the most compelling causal evidence. THRESHOLD (2.0) implies a clear NOAEL. NON_MONOTONIC (1.5) is ambiguous but observed. The domain-aware MONOTONIC_DOWN reflects biology: decreased organ weight (OM) at higher doses is concerning; decreased tumor incidence (MI) may be protective.

**Alternatives considered:** Equal weights (ignores the widely accepted hierarchy of dose-response evidence). Data-driven weights (unstable across studies with different patterns).

---

### METRIC-08 — ECETOC Treatment-Relatedness Score (A-Factors)

**Purpose:** Assess treatment-relatedness of a syndrome using the ECETOC A-factor framework at the syndrome (not endpoint) level.

**Implementation:** `computeTreatmentRelatedness(syndrome, allEndpoints, clSupport)` — frontend `syndrome-interpretation.ts:2073`.

**Parameters:** Weighted factor scoring:

| Factor | Strong (+2) | Weak (+1) | Moderate (+0.5) | Absent (0) |
|--------|------------|-----------|-----------------|------------|
| A-1 (dose-response) | confidence HIGH | confidence MOD | — | LOW |
| A-2 (concordance) | domains >= 2 | — | — | isolated |
| A-4 (HCD) | — | — | — | no_hcd (always) |
| A-6 (significance) | minP < 0.05 | — | minP < 0.1 | >= 0.1 |
| CL support | strengthens | — | — | not |

Overall: >= 3 → "treatment_related"; >= 1.5 → "possibly_related"; < 1.5 → "not_related".

**Why this method:** ECETOC A-factors are the standard weight-of-evidence framework for treatment-relatedness. Strong dose-response gets the highest weight (+2) because it is the most compelling causal evidence. Cross-domain concordance and statistical significance provide independent confirmation.

**Alternatives considered:** Per-endpoint treatment-relatedness (CLASS-05, already computed — METRIC-08 operates at the higher syndrome level). Bayesian causality assessment (requires historical control priors).

**References:** ECETOC Technical Report No. 85.

---

### METRIC-09 — Translational Confidence (LR+ Tiers)

**Purpose:** Assess how likely a preclinical finding is to translate to human risk, using published concordance data.

**Implementation:** `assignTranslationalTier(species, primarySOC, endpointLRPlus)` — frontend `syndrome-interpretation.ts:2379`.

**Parameters:** Two-tier lookup (PT preferred over SOC):
- PT-level: `maxLR >= 10` → "high"; `>= 3` → "moderate"; else "low"
- SOC-level (fallback): `socLR >= 5` → "high"; `>= 3` → "moderate"; else "low"
- No match → "insufficient_data"

**Why these thresholds:** Likelihood ratio (LR+) > 10 is strong evidence of clinical relevance in diagnostic test theory. The 3 and 5 thresholds provide a three-tier system consistent with the Liu & Fan 2026 data distribution. PT-level thresholds are lower than SOC because PT matches are more specific (10 vs. 5 for "high").

**Alternatives considered:** Continuous LR+ display (less actionable than tiers for screening). Sensitivity/specificity separately (LR+ combines both into a single interpretable metric). Negative predictive value (requires disease prevalence, unavailable).

**References:** Liu & Fan 2026 (n=7,565 drugs). See `dependencies.md` entry LIU-FAN-2026.

---

### METRIC-10 — ECETOC Adversity Magnitude (Hedges' g)

**Purpose:** Map Hedges' g effect size to toxicological severity grades for ECETOC B-factor adversity assessment.

**Implementation:** `deriveMagnitudeLevel(syndrome, allEndpoints)` — frontend `syndrome-interpretation.ts:2137`.

**Parameters:** `maxG = max |Hedges' g|` across all matched endpoints.

| Magnitude | Threshold |
|-----------|-----------|
| severe | \|d\| >= 2.0 |
| marked | \|d\| >= 1.5 |
| moderate | \|d\| >= 1.0 |
| mild | \|d\| >= 0.5 |
| minimal | \|d\| < 0.5 |

**Why these thresholds:** Adapted from clinical effect size interpretation to toxicology context. Standard Cohen's d benchmarks (0.2/0.5/0.8) are too lenient for safety assessment. The tox-adapted thresholds (0.5/1.0/1.5/2.0) better distinguish biologically meaningful treatment effects in preclinical data where inter-animal variability is typically lower than in clinical trials.

**Alternatives considered:** Standard Cohen's d benchmarks (too lenient for tox). Fold-change only (not standardized, can't compare across endpoints with different scales).

---

### METRIC-11 — Max Fold Change

**Purpose:** Compute the maximum fold change between any treated group and control for a continuous endpoint.

**Implementation:** `compute_max_fold_change(group_stats)` — backend `classification.py:231`.

**Parameters:** `max_fc = max over treated groups of max(treated_mean/control_mean, control_mean/treated_mean)`. Returns `None` if < 2 groups or `|control_mean| < 1e-10`. Always >= 1.0. Rounded to 2 decimals.

**Why this method:** Fold change is a simple, intuitive measure of effect magnitude that clinicians and regulators understand immediately. "3x increase in ALT" is more communicable than "Cohen's d = 1.4." Used alongside Cohen's d, not instead of it.

**Alternatives considered:** Percent change from control (equivalent information, less standard in tox literature). Log2 fold change (standard in genomics, unusual in tox).

---

### METRIC-12 — HED (FDA Km Scaling)

**Purpose:** Convert animal NOAEL dose to Human Equivalent Dose using FDA body-surface-area scaling.

**Implementation:** `_compute_hed(noael_dose_value, km_info, noael_dose_level)` — backend `pk_integration.py:753`.

**Parameters:**
- `HED = NOAEL_dose / conversion_factor`
- `MRSD = HED / 10` (fixed 10x safety factor)

Km conversion factors by species:

| Species | Km | Conversion Factor |
|---------|-----|-------------------|
| Mouse | 3 | 12.3 |
| Hamster | 5 | 7.4 |
| Rat | 6 | 6.2 |
| Guinea pig | 8 | 4.6 |
| Rabbit | 12 | 3.1 |
| Monkey | 12 | 3.1 |
| Dog | 20 | 1.8 |
| Minipig | 20 | 1.8 |

HED rounded to 4 decimals. MRSD rounded to 4 decimals. Status: "established" if NOAEL > 0, "at_control" if NOAEL = 0.

**Why this method:** FDA Km scaling (body surface area adjustment) is the regulatory standard for translating nonclinical NOAEL to human-relevant doses. The Km values account for metabolic rate differences across species. The 10x safety factor follows ICH M3(R2) guidance.

**Alternatives considered:** Allometric scaling by body weight (less accurate than BSA for most drug classes). PBPK modeling (requires detailed pharmacokinetic parameters, beyond scope of automated screening). Plasma exposure-based scaling (preferred when TK data available — see CLASS-17 for PK analysis).

**References:** FDA Guidance for Industry: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers (2005). See `dependencies.md` entry FDA-KM-SCALING.

# SEND Data Browser -- Data Pipeline Specification

This document specifies ALL backend computation logic for the SEND Data Browser analysis pipeline. It is implementation-agnostic: a developer reading it should be able to reimplement the pipeline in any Python environment (standalone script, web framework, Datagrok package) using only this document and the SEND .XPT source files.

**Pipeline version:** Based on the prototype implementation (generator pipeline) and the design specification (send-browser-spec-p3.md, sections 9-10).

---

## 1. Pipeline Overview

### Input / Output

| Direction | What | Format |
|-----------|------|--------|
| Input | One study folder containing .XPT files (SAS Transport v5) | One .xpt per SEND domain (dm.xpt, lb.xpt, bw.xpt, mi.xpt, etc.) |
| Output | 8 JSON data files + 1 HTML static chart | Written to an output directory per study |

### Output Files

| File | Description | Row count (typical) |
|------|-------------|---------------------|
| `study_signal_summary.json` | Signal scores per endpoint x dose x sex | ~1000 |
| `target_organ_summary.json` | Organ-level evidence aggregation | ~14 |
| `dose_response_metrics.json` | Full dose-response detail per endpoint | ~1300 |
| `organ_evidence_detail.json` | Per-organ endpoint evidence | ~350 |
| `lesion_severity_summary.json` | Histopathology lesion x dose x sex | ~700 |
| `adverse_effect_summary.json` | Non-normal findings x dose x sex | ~350 |
| `noael_summary.json` | NOAEL determination per sex | 3 |
| `rule_results.json` | Rule engine output | ~975 |
| `static/target_organ_bar.html` | Self-contained HTML bar chart | 1 |

### High-Level Pipeline Flow

```
Load .XPT files (pyreadstat)
    |
    v
Phase 1: Build dose groups + subject roster (DM + TX domains)
    |
    v
Phase 2: Per-domain findings computation
    LB --> continuous stats (Welch t, Cohen's d, trend, Bonferroni)
    BW --> continuous stats + baseline % change
    OM --> continuous stats + relative organ weight
    MI --> incidence + severity (Fisher's exact, Cochran-Armitage)
    MA --> incidence (Fisher's exact, Cochran-Armitage)
    CL --> incidence (Fisher's exact, Cochran-Armitage)
    FW --> continuous stats (mirrors BW pattern)
    |
    v
Phase 3: Classification + enrichment
    Severity classification (adverse / warning / normal)
    Dose-response pattern classification
    Treatment-relatedness determination
    Organ system mapping
    |
    v
Phase 4: View-specific DataFrame assembly (7 output JSONs)
    study_signal_summary      (signal scores)
    target_organ_summary      (organ evidence)
    dose_response_metrics     (full dose detail)
    organ_evidence_detail     (per-organ evidence)
    lesion_severity_summary   (histopath)
    adverse_effect_summary    (adversity)
    noael_summary             (NOAEL per sex)
    |
    v
Phase 5: Rule engine (16 canonical rules --> rule_results.json)
    |
    v
Phase 6: Static chart generation (target_organ_bar.html)
    |
    v
Output: write all JSON + HTML to output directory
```

---

## 2. Data Loading

### 2.1 XPT File Reading

All .XPT files are read using `pyreadstat.read_xport()`, which returns a `(DataFrame, metadata)` tuple.

```python
import pyreadstat

df, meta = pyreadstat.read_xport(str(xpt_path))
```

After loading, all column names are uppercased:

```python
df.columns = [c.upper() for c in df.columns]
```

### 2.2 Domain Discovery

Studies are identified by scanning a root data directory. Each subdirectory is a potential study. A study is valid if it contains at least one .xpt file.

For each study folder:
1. List all files with `.xpt` extension (case-insensitive).
2. The domain name is the file stem in lowercase (e.g., `dm.xpt` becomes domain `"dm"`).
3. Store as a mapping: `domain_name (str) --> file_path (Path)`.

Nested study discovery: if a folder has no .xpt files, recurse into subfolders. Study IDs for nested studies use `--` separators (e.g., `"ParentFolder--SubStudy"`).

### 2.3 Study Metadata from TS Domain

The TS (Trial Summary) domain contains study-level metadata as key-value pairs in `TSPARMCD` / `TSVAL` columns.

Extraction procedure:
1. Read `ts.xpt`.
2. Iterate rows; for each row, extract `TSPARMCD` (parameter code) and `TSVAL` (value).
3. Build a map: `{TSPARMCD: TSVAL}`.
4. Skip entries where `TSVAL` is empty or `"nan"`.

Key parameters extracted:

| TSPARMCD | Maps to | Description |
|----------|---------|-------------|
| SPECIES | species | Test species |
| STRAIN | strain | Strain/substrain |
| SSTYP | study_type | Study type |
| ROUTE | route | Route of administration |
| TRT | treatment | Test article name |
| TRTV | vehicle | Vehicle |
| DOSDUR | dosing_duration | Dosing duration |
| STSTDTC | start_date | Study start date |
| EXPENDTC | end_date | Study end date |
| SPLANSUB | subjects | Planned number of subjects |
| SSPONSOR | sponsor | Sponsor |
| SNDIGVER | send_version | SEND version |
| STITLE | title | Study title |
| SPREFID | protocol | Protocol number |
| SDESIGN | design | Study design |

### 2.4 Relevant Domains for Analysis

The pipeline processes these domains when present:

| Domain | Full Name | Data Type | Required |
|--------|-----------|-----------|----------|
| DM | Demographics | Subject roster | Yes |
| TX | Trial Sets | Dose group info | No (falls back to DM.ARM) |
| LB | Laboratory | Continuous | No |
| BW | Body Weights | Continuous | No |
| OM | Organ Measurements | Continuous | No |
| MI | Microscopic Findings | Incidence + ordinal severity | No |
| MA | Macroscopic Findings | Incidence | No |
| CL | Clinical Observations | Incidence | No |
| FW | Food/Water Consumption | Continuous | No |

---

## 3. Dose Group Construction (Phase 1)

### 3.1 Subject Roster from DM

From the DM domain, extract three columns per subject:

| Column | Source | Description |
|--------|--------|-------------|
| USUBJID | DM.USUBJID | Unique subject identifier |
| SEX | DM.SEX | Sex: "M" or "F" |
| ARMCD | DM.ARMCD | Arm code (dose group identifier) |

Derived columns added to the subject roster:

| Column | Derivation |
|--------|------------|
| `is_recovery` | `True` if ARMCD is in `{"1R", "2R", "3R", "4R"}` |
| `dose_level` | Mapped from ARMCD: `{"1": 0, "2": 1, "3": 2, "4": 3}`. Recovery arms strip the "R" suffix before mapping. Unknown ARMCDs map to `-1`. |

**Note:** The ARMCD-to-dose-level mapping assumes a standard 4-group design (control + 3 dose levels). For studies with different designs, this mapping must be adapted.

### 3.2 Dose Information from TX

The TX (Trial Sets) domain provides dose values and labels in long format. Each SETCD groups parameters via `TXPARMCD` / `TXVAL` pairs.

Extraction procedure:
1. For each unique SETCD, collect all `TXPARMCD: TXVAL` pairs.
2. Extract: `ARMCD`, `TRTDOS` (dose value, parsed to float), `GRPLBL` or `SETLBL` (group label), `TRTDOSU` (dose unit).
3. Build a map: `ARMCD --> {dose_value, dose_unit, label}`.

If TX is not present or does not provide group labels, fall back to `DM.ARM` column.

### 3.3 Dose Groups Output

For each ARMCD (main study only, excluding recovery arms), compute:

| Field | Type | Description |
|-------|------|-------------|
| `dose_level` | int | Ordinal index (0 = control) |
| `armcd` | string | Arm code |
| `label` | string | Human-readable label |
| `dose_value` | float or null | Numeric dose |
| `dose_unit` | string or null | Dose unit (e.g., "mg/kg/day") |
| `n_male` | int | Count of males in this arm |
| `n_female` | int | Count of females in this arm |
| `n_total` | int | Total subjects in this arm |

---

## 4. Per-Domain Findings Computation (Phase 2)

Each domain module produces a list of "finding" dictionaries. All findings share a common structure, then vary by domain-specific fields.

### 4.1 Common Finding Structure

Every finding dictionary contains:

| Field | Type | Description |
|-------|------|-------------|
| `domain` | string | Domain code: "LB", "BW", "OM", "MI", "MA", "CL", "FW" |
| `test_code` | string | Unique test/finding identifier |
| `test_name` | string | Human-readable name |
| `specimen` | string or null | Tissue/organ (MI, MA, OM) or null (LB, BW, CL, FW) |
| `finding` | string | Finding description |
| `day` | int or null | Study day (longitudinal domains) or null (terminal) |
| `sex` | string | "M" or "F" |
| `unit` | string or null | Measurement unit |
| `data_type` | string | "continuous" or "incidence" |
| `group_stats` | list[dict] | Per-dose-group summary statistics |
| `pairwise` | list[dict] | Pairwise test results vs. control |
| `trend_p` | float or null | Trend test p-value |
| `trend_stat` | float or null | Trend test statistic |
| `direction` | string or null | "up", "down", or "none" |
| `max_effect_size` | float or null | Maximum absolute effect size across dose groups |
| `min_p_adj` | float or null | Minimum adjusted p-value across dose groups |

### 4.2 Analysis Stratification

All statistical tests are computed **separately by sex** (M and F independently). Longitudinal domains (BW, LB, FW) are also stratified by study day. Terminal domains (MI, MA, OM) are analyzed at the terminal sacrifice only.

### 4.3 Subject Filtering

Only main-study subjects are included in analysis. Recovery-arm subjects (`is_recovery = True`) are excluded from all computations. After filtering, domain data is joined to the subject roster on USUBJID to add `SEX` and `dose_level`.

### 4.4 LB -- Laboratory Test Results

**Analysis grain:** LBTESTCD x LBDY x SEX

**Source columns:** `LBSTRESN` (preferred) or `LBORRES` (fallback), parsed to numeric. `LBTESTCD` for test code, `LBTEST` for test name, `LBSTRESU` for unit, `LBDY` for study day.

**Group statistics (per dose_level):**

| Field | Formula |
|-------|---------|
| `n` | count of non-missing values |
| `mean` | `numpy.mean(values)`, rounded to 4 decimals |
| `sd` | `numpy.std(values, ddof=1)`, rounded to 4 decimals (null if n < 2) |
| `median` | `numpy.median(values)`, rounded to 4 decimals |

**Pairwise tests:** Each treated dose group vs. control (dose_level = 0):

| Field | Method |
|-------|--------|
| `p_value` | Welch's t-test (see Section 5.1) |
| `statistic` | t-statistic from Welch's test |
| `cohens_d` | Cohen's d effect size (see Section 5.5) |
| `p_value_adj` | Bonferroni-corrected p-value (see Section 5.6) |

**Trend test:** Spearman rank correlation as Jonckheere-Terpstra approximation (see Section 5.3).

**Direction:** Compare high-dose group mean to control mean:
```
pct_change = ((high_dose_mean - control_mean) / abs(control_mean)) * 100
direction = "up" if pct_change > 0, "down" if pct_change < 0, else "none"
```

### 4.5 BW -- Body Weights

**Analysis grain:** BWDY x SEX

**Source columns:** `BWSTRESN` (preferred) or `BWORRES` (fallback). `BWDY` for study day, `BWSTRESU` for unit.

**Baseline computation:**
```python
baseline_per_subject = bw_df.sort_values("BWDY").groupby("USUBJID")["value"].first()
```

**Additional per-subject derived column:**
```
pct_change = ((value - baseline) / baseline) * 100   [when baseline > 0]
```

**Group statistics:** Same as LB, plus:

| Field | Formula |
|-------|---------|
| `mean_pct_change` | `numpy.mean(pct_change_values)` for the group |

**Pairwise, trend, direction:** Identical to LB.

**test_code:** Fixed as `"BW"`. **test_name:** Fixed as `"Body Weight"`.

### 4.6 OM -- Organ Measurements

**Analysis grain:** OMSPEC x OMTESTCD x SEX

**Source columns:** `OMSTRESN` (preferred) or `OMORRES` (fallback). `OMSPEC` for organ/specimen, `OMTESTCD` for test code (absolute vs relative weight), `OMSTRESU` for unit.

**Terminal body weight lookup:**
```python
# Read BW domain, sort by BWDY, take last value per USUBJID
terminal_bw = bw_df.sort_values("BWDY").groupby("USUBJID").last()["bw_val"].to_dict()
```

**Relative organ weight (per subject):**
```
relative = (organ_weight / terminal_body_weight) * 100   [as percentage]
```

**Group statistics:** Same as LB, plus:

| Field | Formula |
|-------|---------|
| `mean_relative` | `numpy.mean(relative_values)` for the group |

**Pairwise, trend, direction:** Identical to LB, operating on absolute organ weight values.

### 4.7 MI -- Microscopic Findings

**Analysis grain:** MISPEC x MISTRESC x SEX

**Source columns:** `MISPEC` (tissue), `MISTRESC` (standardized finding result), `MISEV` (severity grade).

**Filtering:** Exclude normal findings. The following terms are treated as normal:
```
{"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE"}
```
Also exclude findings where MISTRESC is empty or "NAN".

**Severity scoring:**

| MISEV value | Numeric score |
|-------------|---------------|
| MINIMAL | 1 |
| MILD | 2 |
| MODERATE | 3 |
| MARKED | 4 |
| SEVERE | 5 |
| Absent (not in MI data) | 0 |

**Group statistics (per dose_level):**

| Field | Formula |
|-------|---------|
| `n` | Total animals examined in the group (`n_per_group` from DM for this dose_level x sex) |
| `affected` | Count of unique USUBJIDs with this finding in this group |
| `incidence` | `affected / n` |
| `avg_severity` | Mean severity score among affected animals (null if no severity data) |

**Pairwise tests:** Fisher's exact test (see Section 5.2). Each treated group vs. control:

| Field | Method |
|-------|--------|
| `p_value` | Fisher's exact test on 2x2 table |
| `p_value_adj` | Set equal to `p_value` (no additional Bonferroni in current implementation) |
| `odds_ratio` | From Fisher's exact test |
| `risk_ratio` | `(affected_treated / n_treated) / (affected_control / n_control)` |

**Trend test:** Cochran-Armitage trend test for incidence (see Section 5.4).

**Direction:** Compare high-dose incidence to control incidence.

**test_code:** `"{MISPEC}_{MISTRESC}"`. **max_effect_size:** Set to avg_severity across all groups.

### 4.8 MA -- Macroscopic Findings

**Analysis grain:** MASPEC x MASTRESC x SEX

Follows the MI pattern exactly, except:
- No severity scoring (MA findings are presence/absence only).
- `avg_severity` is not computed.
- `max_effect_size` is null.
- Same normal-term filtering as MI.

### 4.9 CL -- Clinical Observations

**Analysis grain:** CLSTRESC x SEX

**Source columns:** `CLSTRESC` (preferred) or `CLORRES` (fallback).

Follows the MI incidence pattern (Fisher's exact + Cochran-Armitage trend), except:
- No specimen column (findings are not organ-specific).
- `specimen` is null.
- Same normal-term filtering as MI, plus `"NONE"`.

### 4.10 FW -- Food/Water Consumption

**Analysis grain:** FWTESTCD x FWDY x SEX

Mirrors the BW pattern exactly (continuous analysis with Welch's t, Cohen's d, trend, Bonferroni). Uses `FWSTRESN` or `FWORRES` for values, `FWDY` for study day.

---

## 5. Statistical Methods Reference

### 5.1 Welch's t-test (Pairwise Comparison)

**Purpose:** Compare treated group vs. control for continuous endpoints.

**Implementation:**
```python
from scipy.stats import ttest_ind
t_stat, p_val = ttest_ind(treated_values, control_values, equal_var=False)
```

**Parameters:**
- `equal_var=False` (Welch's variant; does not assume equal variances)
- Minimum group size: 2 per group (returns null if either group has n < 2)
- NaN values are removed before computation.

**Output:** t-statistic and two-sided p-value.

### 5.2 Fisher's Exact Test (Incidence Comparison)

**Purpose:** Compare treated group incidence vs. control for categorical endpoints.

**Implementation:**
```python
from scipy.stats import fisher_exact
odds_ratio, p_val = fisher_exact([[a, b], [c, d]])
```

**Contingency table layout:**

|                | Finding present | Finding absent |
|----------------|----------------|----------------|
| Treated group  | a              | b              |
| Control group  | c              | d              |

Where:
- `a` = number affected in treated group
- `b` = n_treated - a
- `c` = number affected in control
- `d` = n_control - c

**Output:** Odds ratio and two-sided p-value.

### 5.3 Trend Test -- Continuous (Jonckheere-Terpstra Approximation)

**Purpose:** Test for a monotonic dose-response trend across ordered dose groups for continuous endpoints.

**Implementation:** Uses Spearman rank correlation between dose level (ordinal integer) and measured values as a proxy for the Jonckheere-Terpstra test.

```python
from scipy.stats import spearmanr

dose_levels = []
values = []
for level, group_values in enumerate(groups):
    for v in group_values:
        dose_levels.append(level)
        values.append(v)

rho, p_val = spearmanr(dose_levels, values)
```

**Minimum data requirement:** At least 4 total observations across groups.

**Output:** Spearman rho (correlation coefficient) and p-value.

### 5.4 Trend Test -- Incidence (Cochran-Armitage Approximation)

**Purpose:** Test for a dose-response trend in incidence (binary) data.

**Implementation:** Chi-square trend approximation:

```python
scores = [0, 1, 2, ..., k-1]   # dose level scores (k = number of groups)
n = sum(totals)
p_bar = sum(counts) / n

numerator = sum(score_i * count_i) - p_bar * sum(score_i * total_i)

denominator_squared = p_bar * (1 - p_bar) * (
    sum(score_i^2 * total_i) - (sum(score_i * total_i))^2 / n
)

z = numerator / sqrt(denominator_squared)
p_value = 2 * (1 - norm.cdf(abs(z)))
```

Where `counts[i]` = number affected in dose group i, `totals[i]` = number examined in dose group i.

**Edge cases:** Returns null if `p_bar` is 0 or 1 (all or no animals affected), if denominator is <= 0, or if fewer than 2 groups.

### 5.5 Cohen's d (Effect Size)

**Purpose:** Quantify the practical magnitude of difference between treated and control groups.

**Implementation:**
```python
pooled_std = sqrt(
    ((n1 - 1) * var(group1, ddof=1) + (n2 - 1) * var(group2, ddof=1))
    / (n1 + n2 - 2)
)
cohens_d = (mean(group1) - mean(group2)) / pooled_std
```

**Minimum requirement:** At least 2 values per group. Returns null if pooled_std is 0.

**Interpretation:**
- |d| < 0.2: negligible
- 0.2 <= |d| < 0.5: small
- 0.5 <= |d| < 0.8: medium
- |d| >= 0.8: large

### 5.6 Bonferroni Correction

**Purpose:** Adjust p-values for multiple comparisons across dose groups.

**Implementation:**
```python
n_tests = count of non-null p-values
adjusted_p = min(raw_p * n_tests, 1.0)
```

Applied to all pairwise p-values within a single finding (i.e., across dose levels for one endpoint x sex). Not applied to Fisher's exact test results for incidence domains (MI, MA, CL) in the current implementation.

### 5.7 Spearman Rank Correlation

**Purpose:** Measure correlation between two findings that share the same organ/specimen.

**Implementation:**
```python
from scipy.stats import spearmanr
rho, p_val = spearmanr(values_x, values_y)
```

Used in two contexts:
1. Trend tests (dose level vs. value; see Section 5.3).
2. Cross-finding correlations (group means of finding A vs. group means of finding B across dose levels; used for R16 rule).

### 5.8 ANOVA (One-Way)

**Purpose:** Test for overall group effect across all dose groups (used in enrichment phase).

**Implementation:**
```python
from scipy.stats import f_oneway
F_stat, p_val = f_oneway(*groups)
```

**Minimum requirement:** At least 2 groups with at least 2 observations each.

### 5.9 Dunnett's Test

**Purpose:** Pairwise comparison of each treated group vs. control with family-wise error rate control.

**Implementation:**
```python
from scipy.stats import dunnett
result = dunnett(*treated_groups, control=control_group)
# result.pvalue is an array of p-values, one per treated group
```

**Minimum requirement:** Control group and at least one treated group each with at least 2 observations.

**Note:** In the current implementation, the ANOVA p-value is approximated from the minimum adjusted pairwise p-value, and the Dunnett's test is used in the enrichment phase for continuous endpoints. The primary pairwise test used throughout is Welch's t-test with Bonferroni correction.

### 5.10 Kruskal-Wallis Test

**Purpose:** Non-parametric test for overall group effect on ordinal/severity data.

**Implementation:**
```python
from scipy.stats import kruskal
H_stat, p_val = kruskal(*groups)
```

**Minimum requirement:** At least 2 groups with at least 1 observation each.

### 5.11 Library Dependencies

| Library | Version | Functions Used |
|---------|---------|----------------|
| scipy | >= 1.11 | `stats.ttest_ind`, `stats.fisher_exact`, `stats.spearmanr`, `stats.f_oneway`, `stats.dunnett`, `stats.kruskal`, `stats.mannwhitneyu`, `stats.norm.cdf` |
| numpy | >= 1.24 | `mean`, `std`, `median`, `sqrt`, `isnan`, `isinf`, `where` |
| pandas | >= 2.0 | DataFrame operations, groupby, merge |
| pyreadstat | >= 1.2 | `read_xport` |

---

## 6. Classification and Enrichment (Phase 3)

After per-domain findings are computed, each finding is enriched with classification results.

### 6.1 Severity Classification

Each finding is classified as `"adverse"`, `"warning"`, or `"normal"`.

**Continuous endpoints (BW, LB, OM, FW):**

| Classification | Conditions |
|----------------|------------|
| adverse | `min_p_adj < 0.05 AND abs(max_effect_size) >= 0.5` |
| warning | `min_p_adj < 0.05 AND abs(max_effect_size) < 0.5` |
| adverse | `trend_p < 0.05 AND abs(max_effect_size) >= 0.8` |
| warning | `trend_p < 0.05 AND abs(max_effect_size) < 0.8` |
| warning | `abs(max_effect_size) >= 1.0` (regardless of p-value) |
| normal | None of the above |

Conditions are evaluated in order; first match wins.

**Incidence endpoints (MI, MA, CL):**

| Classification | Conditions |
|----------------|------------|
| adverse | `min_p_adj < 0.05` |
| warning | `trend_p < 0.05` |
| warning | `min_p_adj < 0.1` |
| normal | None of the above |

### 6.2 Dose-Response Pattern Classification

Each finding's dose-response pattern is classified using group means (continuous) or incidence values (categorical) across dose levels.

```
Input: ordered list of values [control, low, mid, high]
Compute: diffs[i] = values[i+1] - values[i]
Minimum threshold: abs(control_mean) * 0.01  (prevents noise classification)
```

| Pattern | Condition |
|---------|-----------|
| `"monotonic_increase"` | All diffs > threshold |
| `"monotonic_decrease"` | All diffs < -threshold |
| `"flat"` | All abs(diffs) <= threshold |
| `"threshold"` | Initial diffs are flat, then all remaining diffs are in same direction |
| `"non_monotonic"` | None of the above |
| `"insufficient_data"` | Fewer than 2 data points |

### 6.3 Treatment-Relatedness Determination

A finding is classified as treatment-related (`True`) if ANY of:

| Condition | Rationale |
|-----------|-----------|
| `min_p_adj < 0.05 AND trend_p < 0.05` | Both pairwise and trend significance |
| `severity == "adverse" AND dose_response_pattern in ("monotonic_increase", "monotonic_decrease")` | Adverse with clear dose-response |
| `min_p_adj < 0.01` | Highly significant pairwise comparison alone |

### 6.4 Organ System Mapping

Each finding is mapped to an organ system using a three-tier priority lookup:

**Priority 1 -- Specimen name.** If `specimen` is non-null, look up in the organ system map:

| Specimen values | Organ system |
|----------------|--------------|
| LIVER | hepatic |
| KIDNEY, KIDNEYS, URINARY BLADDER | renal |
| BRAIN, SPINAL CORD, SCIATIC NERVE | neurological |
| HEART, AORTA | cardiovascular |
| LUNG, LUNGS, TRACHEA, LARYNX | respiratory |
| SPLEEN, BONE MARROW, THYMUS, LYMPH NODE (+ variants) | hematologic |
| ADRENAL GLAND(S), THYROID GLAND, PITUITARY GLAND, PANCREAS | endocrine |
| STOMACH, SMALL/LARGE INTESTINE, COLON, DUODENUM, JEJUNUM, ILEUM, CECUM, RECTUM, ESOPHAGUS | gastrointestinal |
| TESTIS/TESTES, EPIDIDYMIS, PROSTATE, OVARY/OVARIES, UTERUS, MAMMARY GLAND | reproductive |
| SKIN, INJECTION SITE | integumentary / local |
| SKELETAL MUSCLE, BONE, STERNUM, FEMUR | musculoskeletal |
| EYE, EYES | ocular |

Partial matching is supported: `"LYMPH NODE, INGUINAL"` matches `"LYMPH NODE"`.

**Priority 2 -- Biomarker map (LB domain).** If `test_code` matches a known lab test:

| LBTESTCD | Organ system | Organ |
|----------|-------------|-------|
| ALT, AST, ALP, GGT, TBIL, ALB, TP, GLOB | hepatic | LIVER |
| BUN, CREAT, PHOS | renal | KIDNEY |
| RBC, HGB, HCT, WBC, PLT, RETIC, MCV, MCH, MCHC | hematologic | BONE MARROW |
| GLUC, CHOL, TRIG | metabolic | LIVER (CHOL, TRIG) or null (GLUC) |
| NA, K, CL, CA | electrolyte | KIDNEY (NA, K, CL) or null (CA) |
| CK | musculoskeletal | SKELETAL MUSCLE |
| LDH | general | null |

**Priority 3 -- Domain default.** If neither specimen nor biomarker matches, defaults to `"general"`.

### 6.5 Endpoint Type Classification

| Domain | Endpoint type |
|--------|--------------|
| BW | `"body_weight"` |
| FW | `"food_water"` |
| LB | `"clinical_chemistry"` |
| MI | `"histopathology"` |
| MA | `"gross_pathology"` |
| OM | `"organ_weight"` |
| CL | `"clinical_observation"` |

### 6.6 Endpoint Label Construction

| Domain | Label format |
|--------|-------------|
| MI, MA, CL, OM (with specimen) | `"{specimen} -- {test_name}"` |
| LB, BW, FW (no specimen) | `"{test_name}"` |

---

## 7. View-Specific DataFrame Assembly (Phase 4)

### 7.1 `study_signal_summary.json`

**Grain:** endpoint x dose x sex. One row per treated dose group per finding.

**Construction:**
1. Iterate all findings.
2. For each finding, iterate its `group_stats`.
3. Skip dose_level = 0 (control rows are not included in signal summary).
4. Compute signal score (see Section 8).
5. Emit one row per (finding, dose_level).

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding endpoint_label |
| `endpoint_type` | string | Finding endpoint_type |
| `domain` | string | Finding domain |
| `test_code` | string | Finding test_code |
| `organ_system` | string | Finding organ_system |
| `organ_name` | string | Finding organ_name |
| `dose_level` | int | group_stats dose_level |
| `dose_label` | string | Dose group label from dose_groups |
| `dose_value` | float or null | Numeric dose from dose_groups |
| `sex` | string | Finding sex |
| `signal_score` | float (0-1) | Computed per Section 8 |
| `direction` | string or null | Finding direction |
| `p_value` | float or null | Pairwise p_value_adj (preferred) or p_value |
| `trend_p` | float or null | Finding trend_p |
| `effect_size` | float or null | Pairwise cohens_d for this dose_level |
| `severity` | string | Finding severity classification |
| `treatment_related` | boolean | Finding treatment_related |
| `dose_response_pattern` | string | Finding dose_response_pattern |
| `statistical_flag` | boolean | `p_value < 0.05` |
| `dose_response_flag` | boolean | Pattern is monotonic_increase, monotonic_decrease, or threshold |
| `mean` | float or null | Group mean from group_stats |
| `n` | int | Group n from group_stats |

**Sorting:** Descending by `signal_score`.

### 7.2 `target_organ_summary.json`

**Grain:** organ system x study. One row per organ system.

**Construction:**
1. Group all findings by `organ_system`.
2. For each organ system, compute:
   - `endpoints`: set of unique `"{domain}_{test_code}_{sex}"` keys
   - `domains`: set of unique domain codes
   - `total_signal`: sum of signal scores across all findings
   - `max_signal`: maximum signal score
   - `n_significant`: count of findings with min_p_adj < 0.05
   - `n_treatment_related`: count of treatment-related findings

**Evidence score formula:**
```python
mean_signal = total_signal / len(endpoints)
domain_count = len(domains)
evidence_score = mean_signal * (1 + 0.2 * (domain_count - 1))
```

The `(1 + 0.2 * (domain_count - 1))` multiplier rewards convergent multi-domain evidence:
- 1 domain: multiplier = 1.0
- 2 domains: multiplier = 1.2
- 3 domains: multiplier = 1.4

**Target organ flag:**
```python
target_organ_flag = (evidence_score >= 0.3) and (n_significant >= 1)
```

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `organ_system` | string | Organ system name |
| `evidence_score` | float | Computed as above |
| `n_endpoints` | int | Count of unique endpoint keys |
| `n_domains` | int | Count of unique domains |
| `domains` | string[] | Sorted list of domain codes |
| `max_signal_score` | float | Maximum signal score |
| `n_significant` | int | Findings with p < 0.05 |
| `n_treatment_related` | int | Treatment-related findings |
| `target_organ_flag` | boolean | Whether organ meets target threshold |

**Sorting:** Descending by `evidence_score`.

### 7.3 `dose_response_metrics.json`

**Grain:** endpoint x dose x sex. One row per dose group per finding (including control).

**Construction:**
1. Iterate all findings.
2. For each finding, iterate its `group_stats` (all dose levels including control).
3. Look up the matching pairwise result for this dose_level (if any).
4. Emit one row.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding endpoint_label |
| `domain` | string | Finding domain |
| `test_code` | string | Finding test_code |
| `organ_system` | string | Finding organ_system |
| `dose_level` | int | group_stats dose_level |
| `dose_label` | string | Dose group label |
| `sex` | string | Finding sex |
| `mean` | float or null | Group mean (continuous) |
| `sd` | float or null | Group SD |
| `n` | int | Group sample size |
| `incidence` | float or null | Group incidence (incidence data) |
| `affected` | int or null | Number affected (incidence data) |
| `p_value` | float or null | Pairwise p-value (adjusted if available) |
| `effect_size` | float or null | Cohen's d |
| `dose_response_pattern` | string | Finding pattern |
| `trend_p` | float or null | Finding trend_p |
| `data_type` | string | "continuous" or "incidence" |

### 7.4 `organ_evidence_detail.json`

**Grain:** organ x endpoint x dose. One row per pairwise comparison for non-normal or treatment-related findings.

**Construction:**
1. Filter findings to those where `severity != "normal"` OR `treatment_related == True`.
2. For each qualifying finding, iterate its `pairwise` results.
3. Emit one row per pairwise comparison.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `organ_system` | string | Finding organ_system |
| `organ_name` | string | Finding organ_name |
| `endpoint_label` | string | Finding endpoint_label |
| `domain` | string | Finding domain |
| `test_code` | string | Finding test_code |
| `dose_level` | int | Pairwise dose_level |
| `dose_label` | string | Dose group label |
| `sex` | string | Finding sex |
| `p_value` | float or null | Pairwise adjusted p-value |
| `effect_size` | float or null | Pairwise Cohen's d |
| `direction` | string or null | Finding direction |
| `severity` | string | Finding severity |
| `treatment_related` | boolean | Finding treatment_related |

### 7.5 `lesion_severity_summary.json`

**Grain:** lesion x dose x sex. Includes only findings from MI, MA, CL domains.

**Construction:**
1. Filter findings to `domain in ("MI", "MA", "CL")`.
2. For each qualifying finding, iterate its `group_stats`.
3. Emit one row per dose group.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding endpoint_label |
| `specimen` | string | Finding specimen |
| `finding` | string | Finding finding |
| `domain` | string | Finding domain |
| `dose_level` | int | group_stats dose_level |
| `dose_label` | string | Dose group label |
| `sex` | string | Finding sex |
| `n` | int | Animals examined |
| `affected` | int | Animals with finding |
| `incidence` | float | Proportion affected |
| `avg_severity` | float or null | Mean severity score (often null) |
| `severity` | string | Finding severity classification |

**Note:** `avg_severity` is null for approximately 75% of rows (whenever severity data is not recorded or the group has no affected animals). Consumers must null-guard this field.

### 7.6 `adverse_effect_summary.json`

**Grain:** endpoint x dose x sex. Includes only findings with `severity != "normal"`.

**Construction:**
1. Filter findings to `severity in ("adverse", "warning")`.
2. For each qualifying finding, iterate its `pairwise` results.
3. Emit one row per pairwise comparison.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding endpoint_label |
| `endpoint_type` | string | Finding endpoint_type |
| `domain` | string | Finding domain |
| `organ_system` | string | Finding organ_system |
| `dose_level` | int | Pairwise dose_level |
| `dose_label` | string | Dose group label |
| `sex` | string | Finding sex |
| `p_value` | float or null | Pairwise adjusted p-value |
| `effect_size` | float or null | Pairwise Cohen's d |
| `direction` | string or null | Finding direction |
| `severity` | string | Finding severity |
| `treatment_related` | boolean | Finding treatment_related |
| `dose_response_pattern` | string | Finding pattern |

### 7.7 `noael_summary.json`

**Grain:** sex (3 rows: M, F, Combined).

**Construction per sex:**
1. Collect findings for this sex (or all findings for "Combined").
2. Find `adverse_dose_levels`: set of all dose_levels where `severity == "adverse"` AND at least one pairwise `p_value_adj < 0.05`.
3. If adverse_dose_levels is non-empty:
   - `loael_level` = min(adverse_dose_levels)
   - `noael_level` = loael_level - 1 (if loael_level > 0, else null)
4. If adverse_dose_levels is empty: `noael_level = null`, `loael_level = null`.
5. Count `n_adverse_at_loael`: number of adverse findings with significant pairwise at the LOAEL dose.
6. Collect `adverse_domains_at_loael`: domains contributing adverse findings at LOAEL.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `sex` | string | "M", "F", or "Combined" |
| `noael_dose_level` | int or null | Computed NOAEL dose level |
| `noael_label` | string | Dose group label for NOAEL, or "Not established" |
| `noael_dose_value` | float or null | Numeric dose at NOAEL |
| `noael_dose_unit` | string or null | Dose unit |
| `loael_dose_level` | int or null | Computed LOAEL dose level |
| `loael_label` | string | Dose group label for LOAEL, or "N/A" |
| `n_adverse_at_loael` | int | Count of adverse findings at LOAEL |
| `adverse_domains_at_loael` | string[] | Domains with adverse findings at LOAEL |

---

## 8. Signal Score Computation

### 8.1 Endpoint Signal Score

**Range:** 0.0 to 1.0. Computed for each endpoint x dose combination.

**Formula:**
```
signal_score = w_p * p_component
             + w_trend * trend_component
             + w_effect * effect_component
             + w_pattern * pattern_component
```

**Weights (as implemented):**

| Weight | Value | Spec value | Description |
|--------|-------|------------|-------------|
| w_p | 0.35 | 0.30 | Statistical significance |
| w_trend | 0.20 | 0.30 | Dose-response trend |
| w_effect | 0.25 | 0.25 | Effect magnitude |
| w_pattern | 0.20 | 0.15 | Dose-response pattern |

**Note:** The implemented weights differ slightly from the design spec (Section 10.7.1). The implementation uses a continuous `-log10(p)` scaling rather than the spec's discrete thresholds.

**Component definitions (as implemented):**

| Component | Formula |
|-----------|---------|
| p_component | `min(-log10(p_value) / 4.0, 1.0)` (caps at p = 0.0001; 0 if null) |
| trend_component | `min(-log10(trend_p) / 4.0, 1.0)` (same scaling) |
| effect_component | `min(abs(effect_size) / 2.0, 1.0)` (caps at |d| = 2.0) |
| pattern_component | Lookup table (see below) |

**Pattern scores:**

| Dose-response pattern | Score |
|-----------------------|-------|
| `monotonic_increase` | 1.0 |
| `monotonic_decrease` | 1.0 |
| `threshold` | 0.7 |
| `non_monotonic` | 0.3 |
| `flat` | 0.0 |
| `insufficient_data` | 0.0 |

Final score is clamped to `min(score, 1.0)`.

### 8.2 Organ Evidence Score

Computed per organ system in `target_organ_summary`:

```
mean_signal = sum(signal_scores for all findings in organ) / n_unique_endpoints
convergence_multiplier = 1 + 0.2 * (n_domains - 1)
evidence_score = mean_signal * convergence_multiplier
```

### 8.3 Design Spec Signal Score (Reference)

The design spec (Section 10.7.1) defines a conceptually similar but discretized scoring:

| Component | 1.0 | 0.5 | 0.0 |
|-----------|-----|-----|-----|
| Statistical_Signal | p < 0.01 | 0.01 <= p < 0.05 | p >= 0.05 |
| Dose_Response_Signal | trend_p < 0.05 AND monotonic | trend_p < 0.05 | trend_p >= 0.05 |
| Effect_Size_Signal | min(1.0, \|d\| / 1.0) | -- | -- |
| Biological_Context_Signal | Maps to target organ | -- | 0.0 |

Spec weights: 0.30, 0.30, 0.25, 0.15.

The implementation's continuous `-log10(p)` scaling provides finer granularity than the spec's discrete thresholds. Both approaches produce qualitatively similar rankings.

---

## 9. Rule Engine (Phase 5)

### 9.1 Overview

The rule engine evaluates 16 canonical rules (R01-R16) against findings, target organs, and NOAEL summary data. Each rule produces zero or more structured results.

Rules are evaluated in three passes:
1. **Endpoint-scope rules (R01-R07, R10-R13):** Evaluated per finding.
2. **Organ-scope rules (R08, R09, R16):** Evaluated per organ in target_organ_summary.
3. **Study-scope rules (R14, R15):** Evaluated per sex in noael_summary.

### 9.2 Rule Result Structure

Each emitted rule produces a dictionary:

| Field | Type | Description |
|-------|------|-------------|
| `rule_id` | string | Rule identifier (R01-R16) |
| `scope` | string | "endpoint", "organ", or "study" |
| `severity` | string | "info" or "warning" |
| `context_key` | string | Identifies the evaluated entity (see below) |
| `organ_system` | string | Organ system (empty for study-scope) |
| `output_text` | string | Resolved template text |
| `evidence_refs` | string[] | Evidence reference strings |

**Context key formats:**
- Endpoint-scope: `"{domain}_{test_code}_{sex}"` (e.g., `"LB_ALT_M"`)
- Organ-scope: `"organ_{organ_system}"` (e.g., `"organ_hepatic"`)
- Study-scope: `"study_{sex}"` (e.g., `"study_M"`, `"study_Combined"`)

### 9.3 Canonical Rules

#### R01 -- Treatment-Related

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | `finding.treatment_related == True` |
| Template | `"Treatment-related: {endpoint_label} shows statistically significant dose-dependent change ({direction}) in {sex} ({pattern})."` |

#### R02 -- Significant Pairwise

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | For each pairwise result: `p_value_adj < 0.05` (or `p_value < 0.05` if adj not available) |
| Template | `"Significant pairwise difference at {dose_label} (p={p_value:.4f}, d={effect_size:.2f})."` |
| Note | Emits one result per significant dose level |

#### R03 -- Significant Trend

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | `finding.trend_p < 0.05` |
| Template | `"Significant dose-response trend (p={trend_p:.4f})."` |

#### R04 -- Adverse Severity

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | warning |
| Condition | `finding.severity == "adverse"` |
| Template | `"Adverse finding: {endpoint_label} classified as adverse in {sex} (p={p_value:.4f})."` |

#### R05 -- Monotonic Pattern

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | `dose_response_pattern in ("monotonic_increase", "monotonic_decrease")` |
| Template | `"Monotonic dose-response: {endpoint_label} shows {pattern} across dose groups in {sex}."` |

#### R06 -- Threshold Pattern

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | `dose_response_pattern == "threshold"` |
| Template | `"Threshold effect: {endpoint_label} shows threshold pattern in {sex} -- effect begins at higher doses."` |

#### R07 -- Non-Monotonic Pattern

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | `dose_response_pattern == "non_monotonic"` |
| Template | `"Non-monotonic: {endpoint_label} shows inconsistent dose-response in {sex}. Consider biological plausibility."` |

#### R08 -- Target Organ

| Property | Value |
|----------|-------|
| Scope | organ |
| Severity | warning |
| Condition | `organ.target_organ_flag == True` |
| Template | `"Target organ: {organ_system} identified with convergent evidence from {n_domains} domains ({domains})."` |

#### R09 -- Multi-Domain Evidence

| Property | Value |
|----------|-------|
| Scope | organ |
| Severity | info |
| Condition | `organ.n_domains >= 2` |
| Template | `"Multi-domain evidence for {organ_system}: {n_endpoints} endpoints across {domains}."` |

#### R10 -- Large Effect

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | warning |
| Condition | `abs(max_effect_size) >= 1.0` |
| Template | `"Large effect: {endpoint_label} shows Cohen's d = {effect_size:.2f} at high dose in {sex}."` |

#### R11 -- Moderate Effect

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | `0.5 <= abs(max_effect_size) < 1.0` |
| Template | `"Moderate effect: {endpoint_label} shows Cohen's d = {effect_size:.2f} at high dose."` |

#### R12 -- Histopathology Incidence Increase

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | warning |
| Condition | `domain in ("MI", "MA", "CL") AND direction == "up" AND severity != "normal"` |
| Template | `"Histopathology: increased incidence of {finding} in {specimen} at high dose ({sex})."` |

#### R13 -- Severity Grade Increase

| Property | Value |
|----------|-------|
| Scope | endpoint |
| Severity | info |
| Condition | `domain in ("MI", "MA", "CL") AND dose_response_pattern in ("monotonic_increase", "threshold") AND avg_severity is not null` |
| Template | `"Severity grade increase: {finding} in {specimen} shows dose-dependent severity increase."` |

#### R14 -- NOAEL Established

| Property | Value |
|----------|-------|
| Scope | study |
| Severity | info |
| Condition | `noael_row.noael_dose_level is not None` |
| Template | `"NOAEL established at {noael_label} ({noael_dose_value} {noael_dose_unit}) for {sex}."` |
| Note | Emits one result per sex (M, F, Combined) |

#### R15 -- NOAEL Not Established

| Property | Value |
|----------|-------|
| Scope | study |
| Severity | warning |
| Condition | `noael_row.noael_dose_level is None` (i.e., adverse effects at lowest dose) |
| Template | `"NOAEL not established for {sex}: adverse effects observed at lowest dose tested."` |

#### R16 -- Correlated Findings

| Property | Value |
|----------|-------|
| Scope | organ |
| Severity | info |
| Condition | Organ has >= 2 findings |
| Template | `"Correlated findings in {organ_system}: {endpoint_labels} suggest convergent toxicity."` |
| Note | endpoint_labels is a comma-joined list of up to 5 unique endpoint labels for the organ |

### 9.4 Template Variable Resolution

Rule templates use Python `str.format()` with a context dictionary built from the finding:

```python
context = {
    "endpoint_label": finding.endpoint_label,
    "domain": finding.domain,
    "test_code": finding.test_code,
    "sex": finding.sex,
    "direction": finding.direction,
    "pattern": finding.dose_response_pattern,
    "severity": finding.severity,
    "specimen": finding.specimen,
    "finding": finding.finding,
    "organ_system": finding.organ_system,
    "p_value": finding.min_p_adj or 0,
    "effect_size": finding.max_effect_size or 0,
    "trend_p": finding.trend_p or 0,
}
```

If `str.format()` fails (missing key or type error), the raw template string is used as-is.

### 9.5 Rule Evaluation Order

1. Iterate all findings. For each finding, evaluate R01-R07, R10-R13 (endpoint-scope).
2. Iterate target_organ_summary. For each organ, evaluate R08, R09, R16 (organ-scope).
3. Iterate noael_summary. For each sex row, evaluate R14 or R15 (study-scope).

There is no explicit conflict resolution in the current implementation. All qualifying rules emit their results; the frontend handles tiering and display.

---

## 10. Static Charts (Phase 6)

### 10.1 Target Organ Bar Chart

**Input:** `target_organ_summary` (list of organ dictionaries).

**Output:** Self-contained HTML string with inline CSS. No external dependencies.

**Chart specification:**
- Horizontal bar chart.
- One bar per organ system, sorted by evidence_score descending.
- Bar width proportional to evidence_score (as percentage of maximum score).
- Color coding:
  - Red (`#ef4444`) if evidence_score >= threshold (0.3).
  - Green (`#22c55e`) if evidence_score < threshold.
- Each bar displays the numeric evidence_score.
- Detail text shows `"{n_endpoints} endpoints, {n_domains} domains"`.
- Organs with `target_organ_flag = True` are marked with `" *"` suffix.
- Header: "Target Organ Evidence Scores".
- Legend: "Threshold for target organ designation: 0.3".

**Font:** `system-ui, -apple-system, sans-serif`.

---

## 11. Output Serialization

### 11.1 JSON Sanitization

Before writing any output JSON, all values are recursively sanitized:

| Input type | Output |
|------------|--------|
| `numpy.integer` | Python `int` |
| `numpy.bool_` | Python `bool` |
| `float` NaN or Inf | `None` (JSON null) |
| `numpy.floating` | Python `float` (or None if NaN/Inf) |
| `set` | Sorted `list` |
| `dict` | Recursively sanitized dict |
| `list` / `tuple` | Recursively sanitized list |
| Everything else | Passed through |

### 11.2 Output Directory Structure

```
{output_dir}/{study_id}/
    study_signal_summary.json
    target_organ_summary.json
    dose_response_metrics.json
    organ_evidence_detail.json
    lesion_severity_summary.json
    adverse_effect_summary.json
    noael_summary.json
    rule_results.json
    static/
        target_organ_bar.html
```

JSON files are written with `indent=2` for readability.

---

## 12. Cross-Finding Correlations (Supplementary)

The unified findings pipeline (used by the dynamic adverse effects endpoint, separate from the generator) also computes Spearman correlations between findings. This is documented here for completeness.

**Pairing criteria:** Two findings are paired if they share the same specimen (or domain code if no specimen) AND the same sex.

**Correlation vector:** Group means (continuous) or incidence values (categorical) across dose levels, using the shorter vector length if dose-level counts differ.

**Minimum requirement:** At least 3 dose levels with non-null values for both findings.

**Output (per pair):**

| Field | Type | Description |
|-------|------|-------------|
| `finding_id_1` | string | First finding ID |
| `finding_id_2` | string | Second finding ID |
| `endpoint_1` | string | First finding label |
| `endpoint_2` | string | Second finding label |
| `domain_1` | string | First finding domain |
| `domain_2` | string | Second finding domain |
| `specimen` | string | Shared specimen |
| `sex` | string | Sex |
| `rho` | float | Spearman correlation coefficient |
| `p_value` | float or null | Correlation p-value |

Results are sorted by `abs(rho)` descending, capped at 50 pairs.

---

## 13. Design Spec Reference: Adversity Determination Logic

The design spec (Section 10.9) defines a more elaborate adversity determination than the current implementation (which uses severity classification from Section 6.1). The spec's criteria are documented here for future implementation.

**A finding is adverse at a given dose when ANY of:**

| Criterion | Logic | Applies to |
|-----------|-------|-----------|
| Severe histopathology | MI_Severity_Mean >= 3.0 AND MI_Incidence >= 0.5 | MI |
| High-incidence pathology | MI_Incidence >= 0.8 AND MI_Severity_Mean >= 2.0 | MI |
| Large functional change | abs(delta_vs_control) > 50% AND p < 0.05 | LB |
| Organ weight + pathology concordance | OM_Pct_vs_Control > 20% AND p < 0.05 AND concordant MI finding | OM + MI |
| Body weight decrement | BW_vs_Control_Mean < -10% AND p < 0.05 at terminal | BW |
| Treatment-related mortality | Any dose-related death | DS |
| Clinical observation severity | CL_Severity_Score >= 3 AND CL_Incidence >= 0.5 AND dose-related | CL |

**A finding is non-adverse (adaptive) when ALL of:**

| Criterion | Logic |
|-----------|-------|
| Small effect | abs(delta_vs_control) < 20% OR incidence < 0.3 |
| Non-monotonic | dose_response is not monotonic |
| Minimal severity | severity_mean < 2.0 |
| Reversible | Recovery group shows return toward control |
| No concordant pathology | No matching MI/MA findings |

---

## 14. Design Spec Reference: NOAEL Confidence Score

The design spec (Section 10.7.4) defines a NOAEL confidence score not yet implemented:

```
NOAEL_Confidence = 1.0
    - 0.2 if adversity driven by a single endpoint only
    - 0.2 if sex inconsistency (M and F NOAELs differ)
    - 0.2 if pathology peer review disagreement flagged
    - 0.2 if large effect size but non-significant p at NOAEL-driving dose

Clamped to [0, 1].
```

A confidence score of 0.4 or below should trigger prominent review warnings.

---

## 15. Design Spec Reference: Additional Rules

The design spec (Section 10.8) defines additional rules not in the current R01-R16 set:

| Spec rule ID | Current mapping | Notes |
|-------------|-----------------|-------|
| endpoint.large.effect.low.power | Not implemented | Fires when abs(effect_size) > 0.8 AND p >= 0.05 |
| endpoint.stat.no.effect | Not implemented | Fires when p < 0.05 AND abs(effect_size) < 0.3 |
| endpoint.adaptive.signal | Not implemented | Fires when adverse_flag = false AND p < 0.05 AND dose_response |
| endpoint.sex.inconsistency | Not implemented | Fires when one sex shows signal > 0.6 and other < 0.3 |
| noael.low.confidence | Not implemented | Fires when confidence_score <= 0.4 |
| noael.sex.difference | Not implemented | Fires when M and F NOAELs differ |
| study.mortality.signal | Not implemented | Fires when treatment-related deaths detected (requires DS domain) |
| study.no.treatment.effect | Not implemented | Fires when all signals < 0.3 |

---

## Appendix A: Complete Library Function Reference

| Function | Module | Parameters | Returns |
|----------|--------|------------|---------|
| `welch_t_test(g1, g2)` | statistics | Two arrays of values | `{statistic, p_value}` |
| `mann_whitney_u(g1, g2)` | statistics | Two arrays of values | `{statistic, p_value}` |
| `fisher_exact_2x2(table)` | statistics | 2x2 contingency table | `{odds_ratio, p_value}` |
| `trend_test(groups)` | statistics | List of arrays (ordered by dose) | `{statistic, p_value}` |
| `trend_test_incidence(counts, totals)` | statistics | Affected counts, group totals | `{statistic, p_value}` |
| `cohens_d(g1, g2)` | statistics | Two arrays of values | float or None |
| `spearman_correlation(x, y)` | statistics | Two arrays of values | `{rho, p_value}` |
| `bonferroni_correct(p_values)` | statistics | List of p-values | List of adjusted p-values |
| `classify_severity(finding)` | classification | Finding dict | "adverse", "warning", or "normal" |
| `classify_dose_response(group_stats, data_type)` | classification | Group stats list, data type | Pattern string |
| `determine_treatment_related(finding)` | classification | Finding dict | boolean |
| `get_organ_system(specimen, test_code, domain)` | organ_map | Specimen, test code, domain | Organ system string |
| `get_organ_name(specimen, test_code)` | organ_map | Specimen, test code | Human-readable organ name |

---

## Appendix B: Data Flow Diagram (Detailed)

```
dm.xpt --+--> build_dose_groups() --> dose_groups[], subjects DataFrame
tx.xpt --+

lb.xpt ----> compute_lb_findings(study, subjects)   --+
bw.xpt ----> compute_bw_findings(study, subjects)   --+
om.xpt ----> compute_om_findings(study, subjects)   --+--> all_findings[]
mi.xpt ----> compute_mi_findings(study, subjects)   --+
ma.xpt ----> compute_ma_findings(study, subjects)   --+
cl.xpt ----> compute_cl_findings(study, subjects)   --+
fw.xpt ----> _compute_fw_findings(study, subjects)  --+
                                                       |
                                         +-------------+
                                         |
                                         v
                              classify_severity()
                              classify_dose_response()
                              determine_treatment_related()
                              get_organ_system()
                                         |
                                         v
                              enriched findings[]
                                         |
              +-----------+-----------+--+---------+---------+---------+
              |           |           |            |         |         |
              v           v           v            v         v         v
         build_study   build_target  build_dose  build_organ  build_   build_
         _signal_      _organ_       _response   _evidence   lesion_  adverse_
         summary()     summary()     _metrics()  _detail()   severity effect_
              |           |           |            |         _summary summary
              |           |           |            |            |        |
              |           |           |            |            |        |
              |           |           |            |            |        +--+
              |           |           |            |            |           |
              |           +--------+  |            |            |           v
              |                    |  |            |            |    build_noael_
              |                    |  |            |            |    summary()
              |                    |  |            |            |        |
              v                    v  v            v            v        v
     study_signal    target_organ  dose_response  organ_evid  lesion  adverse  noael
     _summary.json   _summary     _metrics.json  _detail     _sev    _effect  _summary
                       .json                      .json       .json   .json    .json
                         |                                                      |
                         +----------------+--------------+-----+----------------+
                                          |                    |
                                          v                    v
                                   evaluate_rules()    generate_target_
                                          |            organ_bar_chart()
                                          v                    |
                                   rule_results.json           v
                                                     static/target_organ_bar.html
```

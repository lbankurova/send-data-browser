# Data Pipeline

## Purpose

The data pipeline loads SAS Transport (.XPT) files from a SEND-format preclinical toxicology study, builds dose group mappings, computes per-domain statistical analyses (pairwise comparisons, trend tests, effect sizes), classifies findings by severity and dose-response pattern, maps findings to organ systems, and assembles 8 view-specific JSON output files plus 1 static HTML chart. A separate on-demand pipeline computes adverse effects with cross-finding correlations and context pane data for the Adverse Effects view.

## Architecture

### Two Pipelines

**Pipeline 1 -- Pre-Generated (Generator).** Runs offline via CLI (`python -m generator.generate <study_id>`). Reads XPT files, computes all statistics, writes 8 JSON files + 1 HTML chart to `backend/generated/{study_id}/`. The frontend fetches these via `GET /api/studies/{id}/analysis/{view_name}`.

**Pipeline 2 -- On-Demand (Adverse Effects).** Runs on first API request, then cached. Computes the same domain findings as Pipeline 1, adds deterministic IDs, cross-finding correlations, and per-finding context pane data. Served via `GET /api/studies/{id}/analyses/adverse-effects`.

Both pipelines share the same core modules: `dose_groups.py`, `findings_lb.py`, `findings_bw.py`, `findings_om.py`, `findings_mi.py`, `findings_ma.py`, `findings_cl.py`, `findings_ds.py`, `statistics.py`, and `classification.py`. The generator additionally uses `view_dataframes.py`, `scores_and_rules.py`, `organ_map.py`, and `static_charts.py`. The on-demand pipeline additionally uses `correlations.py`, `context_panes.py`, and `insights.py`.

### Pipeline Flow (Generator)

```
dm.xpt --+
tx.xpt --+--> build_dose_groups() --> dose_groups[], subjects DataFrame (is_recovery, is_satellite)
                |                     tk_setcds → is_satellite via DM.SETCD
                |
lb.xpt --------+--> compute_lb_findings(study, subjects) --+
bw.xpt --------+--> compute_bw_findings(study, subjects) --+
om.xpt --------+--> compute_om_findings(study, subjects) --+--> all_findings[]
mi.xpt --------+--> compute_mi_findings(study, subjects) --+
ma.xpt --------+--> compute_ma_findings(study, subjects) --+
cl.xpt --------+--> compute_cl_findings(study, subjects) --+
fw.xpt --------+--> _compute_fw_findings(study, subjects) -+
                                                             |
                                           +-----------------+
                                           |
                                           v
                                  classify_severity()
                                  classify_dose_response()
                                  determine_treatment_related()
                                  get_organ_system() / get_organ_name()
                                  _classify_endpoint_type()
                                           |
                                           v
                                  enriched findings[]
                                           |
          +---------+----------+-----------+----------+---------+---------+
          |         |          |           |          |         |         |
          v         v          v           v          v         v         v
   build_study  build_target  build_dose  build_organ  build_  build_   build_
   _signal_     _organ_       _response   _evidence   lesion_ adverse_ noael_
   summary()    summary()     _metrics()  _detail()   severity effect_  summary()
          |         |          |           |          _summary summary
          |         |          |           |          ()       ()
          v         v          v           v          v        v         v
   study_signal  target_organ  dose_response  organ_evid  lesion  adverse  noael
   _summary.json _summary.json _metrics.json  _detail.json _sev.json _effect.json _summary.json
                    |                                                      |
                    +-------------------+--------------+--+----------------+
                                        |                 |
                                        v                 v
                                 evaluate_rules()  generate_target_
                                        |          organ_bar_chart()
                                        v                 |
                                 rule_results.json        v
                                                 static/target_organ_bar.html
```

---

## Contracts

### Input: XPT Files

Each study is a directory containing `.xpt` files (SAS Transport v5). Domain name is the filename stem in lowercase (e.g., `dm.xpt` -> `"dm"`).

| Domain | Full Name | Data Type | Required | Key Columns |
|--------|-----------|-----------|----------|-------------|
| DM | Demographics | Subject roster | **Yes** | USUBJID, SEX, ARMCD, ARM |
| TX | Trial Sets | Dose group info | No (falls back to DM.ARM) | SETCD, TXPARMCD, TXVAL |
| TS | Trial Summary | Study metadata | No | TSPARMCD, TSVAL |
| LB | Laboratory | Continuous | No | USUBJID, LBTESTCD, LBTEST, LBSTRESN/LBORRES, LBSTRESU, LBDY |
| BW | Body Weights | Continuous | No | USUBJID, BWSTRESN/BWORRES, BWSTRESU, BWDY |
| OM | Organ Measurements | Continuous | No | USUBJID, OMSPEC, OMTESTCD, OMSTRESN/OMORRES, OMSTRESU |
| MI | Microscopic Findings | Incidence + severity | No | USUBJID, MISPEC, MISTRESC, MISEV |
| MA | Macroscopic Findings | Incidence | No | USUBJID, MASPEC, MASTRESC |
| CL | Clinical Observations | Incidence | No | USUBJID, CLSTRESC/CLORRES |
| FW | Food/Water Consumption | Continuous | No | USUBJID, FWSTRESN/FWORRES, FWSTRESU, FWDY, FWTESTCD |

All XPT files are read via:

```python
import pyreadstat
df, meta = pyreadstat.read_xport(str(xpt_path))
df.columns = [c.upper() for c in df.columns]
```

### Output: 8 JSON Files + 1 HTML Chart

Written to `backend/generated/{study_id}/`:

| File | Row Grain | Key Columns | Typical Count |
|------|-----------|-------------|---------------|
| `study_signal_summary.json` | endpoint x dose x sex (treated only) | signal_score, p_value, effect_size, severity, treatment_related | ~989 |
| `target_organ_summary.json` | organ system | evidence_score, n_endpoints, n_domains, target_organ_flag | ~14 |
| `dose_response_metrics.json` | endpoint x dose x sex (all doses) | mean, sd, n, incidence, p_value, effect_size, dose_response_pattern | ~1342 |
| `organ_evidence_detail.json` | organ x endpoint x dose (non-normal only) | p_value, effect_size, direction, severity, treatment_related | ~357 |
| `lesion_severity_summary.json` | finding x dose x sex (MI/MA/CL only) | n, affected, incidence, avg_severity, severity | ~728 |
| `adverse_effect_summary.json` | endpoint x dose x sex (non-normal only) | p_value, effect_size, severity, treatment_related, dose_response_pattern | ~357 |
| `noael_summary.json` | sex (M/F/Combined) | noael_dose_level, noael_label, loael_dose_level, n_adverse_at_loael | 3 |
| `rule_results.json` | rule instance | rule_id, scope, severity, context_key, output_text, evidence_refs | ~975 |
| `static/target_organ_bar.html` | -- | Self-contained HTML bar chart with inline CSS | 1 file |

JSON files are written with `indent=2`. All values are recursively sanitized before serialization:

| Input type | Output |
|------------|--------|
| `numpy.integer` | Python `int` |
| `numpy.bool_` | Python `bool` |
| `float` NaN or Inf | `None` (JSON null) |
| `numpy.floating` | Python `float` (or `None` if NaN/Inf) |
| `set` | Sorted `list` |
| `dict`, `list`, `tuple` | Recursively sanitized |

### Adverse Effects API (On-Demand Pipeline)

| Method | Endpoint | Parameters | Response |
|--------|----------|------------|----------|
| GET | `/api/studies/{id}/analyses/adverse-effects` | `page`, `page_size`, `domain`, `sex`, `severity`, `search` | `AdverseEffectsResponse` (paginated findings + dose_groups + summary) |
| GET | `/api/studies/{id}/analyses/adverse-effects/finding/{finding_id}` | -- | `FindingContext` (5 context panes with insights) |
| GET | `/api/studies/{id}/analyses/adverse-effects/summary` | -- | Summary counts (total findings, adverse, warning, normal, treatment_related, target_organs, suggested_noael) |

The adverse effects pipeline caches its results as `backend/cache/{study_id}/adverse_effects.json`. Cache validity is checked against the most recent mtime of relevant XPT files (`dm`, `tx`, `lb`, `bw`, `om`, `mi`, `ma`, `cl`).

---

## Pipeline Phases

### Phase 1: Loading & Dose Groups

**Entry point:** `services/analysis/dose_groups.py::build_dose_groups(study)` (shared by both pipelines)

**Step 1: Read DM domain.** Extract subject roster:

```python
dm_df, _ = read_xpt(study.xpt_files["dm"])
dm_df.columns = [c.upper() for c in dm_df.columns]
subjects = dm_df[["USUBJID", "SEX", "ARMCD"]].copy()
subjects["ARMCD"] = subjects["ARMCD"].astype(str).str.strip()
```

**Step 2: Mark recovery arms.**

```python
RECOVERY_ARMCDS = {"1R", "2R", "3R", "4R"}
subjects["is_recovery"] = subjects["ARMCD"].isin(RECOVERY_ARMCDS)
```

**Step 3: Map ARMCD to dose level.**

```python
ARMCD_TO_DOSE_LEVEL = {"1": 0, "2": 1, "3": 2, "4": 3}

def map_dose_level(armcd: str) -> int:
    base = armcd.replace("R", "")
    return ARMCD_TO_DOSE_LEVEL.get(base, -1)

subjects["dose_level"] = subjects["ARMCD"].apply(map_dose_level)
```

- ARMCD `"1"` -> dose_level 0 (control)
- ARMCD `"2"` -> dose_level 1 (low)
- ARMCD `"3"` -> dose_level 2 (mid)
- ARMCD `"4"` -> dose_level 3 (high)
- Recovery arms (`"1R"`, `"2R"`, `"3R"`, `"4R"`) strip the `"R"` suffix before mapping.
- Unknown ARMCDs map to `-1`.

**NOTE:** This mapping is hardcoded for a standard 4-group design. It must be adapted for studies with different ARMCD values.

**Step 4: Read TX domain (if present).**

TX is a long-format table. `_parse_tx(study)` returns `(tx_map, tk_setcds)` — the dose group map plus a set of TK satellite SETCDs. For each unique `SETCD`, collect `TXPARMCD`/`TXVAL` pairs:

```python
for setcd in tx_df["SETCD"].unique():
    set_rows = tx_df[tx_df["SETCD"] == setcd]
    params = {}
    for _, row in set_rows.iterrows():
        parm = str(row.get("TXPARMCD", "")).strip()
        val = str(row.get("TXVAL", "")).strip()
        if parm and val and val != "nan":
            params[parm] = val

    armcd = params.get("ARMCD", str(setcd))
    dose_val = float(params["TRTDOS"]) if "TRTDOS" in params else None
    label = params.get("GRPLBL") or params.get("SETLBL") or f"ARMCD {armcd}"
    # TK satellites are detected and excluded from tx_map (see Step 4a)
    tx_map[armcd] = {"dose_value": dose_val, "dose_unit": params.get("TRTDOSU"), "label": label}
```

If TX is absent or has no labels, fall back to `DM.ARM`:

```python
if not tx_map:
    for armcd in dm_df["ARMCD"].unique():
        arm_rows = dm_df[dm_df["ARMCD"] == armcd]
        label = str(arm_rows["ARM"].iloc[0]) if "ARM" in arm_rows.columns else f"Group {armcd}"
        tx_map[str(armcd).strip()] = {"dose_value": None, "dose_unit": None, "label": label}
```

**Step 4a: TK satellite detection and segregation.**

TK (toxicokinetic) satellite animals exist solely for plasma exposure data. They share ARMCD values with main study animals but have distinct SETCD values (e.g., "2TK", "3TK", "4TK"). Satellites must be excluded from all statistical analyses — including them inflates group N and corrupts p-values, incidence denominators, and group means.

Detection uses a waterfall of heuristics (first match wins):

| Heuristic | What it checks | Example |
|-----------|----------------|---------|
| TK-prefixed param value | Any `TXPARMCD` starting with "TK" where value is not "non-TK"/"none"/"no" | `TKDESC="TK"` (positive), `TKDESC="non-TK"` (negative) |
| SETCD substring | `"TK"` appears in SETCD string | `SETCD="2TK"` |
| Label keywords | SETLBL or GRPLBL contains "satellite" or "toxicokinetic" | `SETLBL="Group 2, TK"` |

When a set is identified as TK satellite:
1. Its SETCD is added to `tk_setcds` set
2. It is **not** written to `tx_map` (avoids ARMCD collision — TK and main arms share ARMCD)
3. `is_satellite` is assigned via `DM.SETCD.isin(tk_setcds)` (not ARMCD lookup)

Fallback: if DM lacks a SETCD column, `is_satellite` falls back to ARMCD-based detection from `tx_map`.

**Step 5: Build dose_groups summary (main study only, excluding recovery and satellite arms).**

```python
for armcd in sorted(ARMCD_TO_DOSE_LEVEL.keys()):  # "1", "2", "3", "4"
    arm_subs = main_subjects[main_subjects["ARMCD"] == armcd]
    dose_groups.append({
        "dose_level": ARMCD_TO_DOSE_LEVEL[armcd],
        "armcd": armcd,
        "label": tx_info.get("label", f"Group {armcd}"),
        "dose_value": tx_info.get("dose_value"),
        "dose_unit": tx_info.get("dose_unit"),
        "n_male": int((arm_subs["SEX"] == "M").sum()),
        "n_female": int((arm_subs["SEX"] == "F").sum()),
        "n_total": len(arm_subs),
    })
```

**Output:** `{"dose_groups": list[dict], "subjects": DataFrame, "tx_map": dict, "tk_count": int}`

The `subjects` DataFrame includes columns: `USUBJID`, `SEX`, `ARMCD`, `dose_level`, `is_recovery`, `is_satellite`.

### Phase 2: Per-Domain Statistics

All statistical tests are computed **separately by sex** (M and F independently). Longitudinal domains (LB, BW, FW) are additionally stratified by study day. Terminal domains (MI, MA, OM) are analyzed once per specimen x sex.

**Subject filtering is phase-aware (DATA-01).** TK satellites are always excluded. Recovery animals are handled differently by domain type:

**In-life domains (BW, LB, CL, FW, BG, EG, VS):** Recovery animals are pooled with main study animals during the treatment period. Their records are filtered to `day <= last_dosing_day` so only treatment-period data contributes to statistics.

```python
from services.analysis.phase_filter import get_treatment_subjects, filter_treatment_period_records

treatment_subs = get_treatment_subjects(subjects)  # main + recovery, exclude satellites
domain_df = domain_df.merge(treatment_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")
domain_df = filter_treatment_period_records(domain_df, subjects, day_col, last_dosing_day)
```

**Terminal domains (MI, MA, OM, TF) and mortality (DS, DD):** Recovery animals are excluded (different sacrifice timing). Uses the legacy filter:

```python
main_subs = subjects[~subjects["is_recovery"] & ~subjects["is_satellite"]].copy()
domain_df = domain_df.merge(main_subs[["USUBJID", "SEX", "dose_level"]], on="USUBJID", how="inner")
```

**`last_dosing_day`** is computed once per study by `phase_filter.compute_last_dosing_day()` from TE/TA epoch structure (primary) or TS.DOSDUR (fallback). If unavailable, recovery records are excluded entirely (safe fallback). See `docs/knowledge/methods.md` DATA-01 for details.

#### Common Finding Structure

Every domain module produces findings with this common structure:

| Field | Type | Description |
|-------|------|-------------|
| `domain` | string | `"LB"`, `"BW"`, `"OM"`, `"MI"`, `"MA"`, `"CL"`, `"FW"` |
| `test_code` | string | Unique test/finding identifier |
| `test_name` | string | Human-readable name |
| `specimen` | string or null | Tissue/organ (MI, MA, OM) or null |
| `finding` | string | Finding description |
| `day` | int or null | Study day (longitudinal) or null (terminal) |
| `sex` | string | `"M"` or `"F"` |
| `unit` | string or null | Measurement unit |
| `data_type` | string | `"continuous"` or `"incidence"` |
| `group_stats` | list[dict] | Per-dose-group summary statistics |
| `pairwise` | list[dict] | Pairwise test results vs. control |
| `trend_p` | float or null | Trend test p-value |
| `trend_stat` | float or null | Trend test statistic |
| `direction` | string or null | `"up"`, `"down"`, or `"none"` |
| `max_effect_size` | float or null | Maximum absolute effect size across dose groups |
| `min_p_adj` | float or null | Minimum adjusted p-value across dose groups |

#### LB -- Laboratory Test Results

**File:** `services/analysis/findings_lb.py::compute_lb_findings(study, subjects)`

**Analysis grain:** LBTESTCD x LBDY x SEX

**Source columns:**
- Value: `LBSTRESN` (preferred) or `LBORRES` (fallback), parsed to numeric via `pd.to_numeric(..., errors="coerce")`
- Test code: `LBTESTCD` (required -- returns empty if absent)
- Test name: `LBTEST`
- Unit: `LBSTRESU`
- Study day: `LBDY` (defaults to 1 if absent), parsed to numeric

**Group statistics (per dose_level):**

| Field | Formula |
|-------|---------|
| `n` | Count of non-missing values |
| `mean` | `round(float(np.mean(vals)), 4)` |
| `sd` | `round(float(np.std(vals, ddof=1)), 4)` (null if n < 2) |
| `median` | `round(float(np.median(vals)), 4)` |

**Pairwise tests (each treated dose_level vs. control, dose_level=0):**

Primary method: `dunnett_pairwise(control_values, treated_groups)` (STAT-07, REM-28). Dunnett's p-values are already FWER-controlled, so `p_value_adj = p_value`.

| Field | Computation |
|-------|-------------|
| `dose_level` | Treated group dose level |
| `p_value` | Dunnett's test p-value (FWER-controlled) |
| `p_value_adj` | Same as `p_value` (Dunnett's controls FWER inherently) |
| `statistic` | `None` (Dunnett's doesn't provide per-comparison statistics) |
| `cohens_d` | Hedges' g bias-corrected effect size (STAT-12) |
| `p_value_welch` | Raw Welch's t-test p-value (STAT-13, for alternative multiplicity corrections) |

Minimum group size: control must have n >= 2 for any pairwise tests to run.

**Trend test:** `trend_test(dose_groups_values)` -- Jonckheere-Terpstra (STAT-04, REM-29) for ordered independent groups. Requires >= 2 dose groups.

**Direction:**
```python
pct_change = ((high_dose_mean - control_mean) / abs(control_mean)) * 100
direction = "up" if pct_change > 0 else "down" if pct_change < 0 else "none"
# Special case: if control_mean == 0 and LBDY exists, direction derived from sign of high_dose_mean
```

**max_effect_size:** Maximum `abs(cohens_d)` across pairwise results (preserving sign of the max-abs value).

**min_p_adj:** Minimum `p_value_adj` across pairwise results.

**test_code:** `str(testcd)` (e.g., `"ALT"`, `"AST"`).

#### BW -- Body Weights

**File:** `services/analysis/findings_bw.py::compute_bw_findings(study, subjects)`

**Analysis grain:** BWDY x SEX

**Source columns:** `BWSTRESN` (preferred) or `BWORRES` (fallback). `BWDY` for study day (defaults to 1), `BWSTRESU` for unit (defaults to `"g"`).

**Baseline computation:**
```python
baseline = bw_df.sort_values("BWDY").groupby("USUBJID")["value"].first().to_dict()
bw_df["baseline"] = bw_df["USUBJID"].map(baseline)
bw_df["pct_change"] = np.where(
    bw_df["baseline"] > 0,
    ((bw_df["value"] - bw_df["baseline"]) / bw_df["baseline"]) * 100,
    np.nan,
)
```

**Group statistics:** Same as LB, plus:

| Field | Formula |
|-------|---------|
| `mean_pct_change` | `round(float(np.mean(pct_vals)), 2)` (null if no valid pct_change values) |

Mean and sd are rounded to 2 decimals (not 4 like LB).

**Pairwise, trend, direction:** Identical to LB.

**test_code:** Fixed `"BW"`. **test_name:** Fixed `"Body Weight"`.

#### OM -- Organ Measurements

**File:** `services/analysis/findings_om.py::compute_om_findings(study, subjects)`

**Analysis grain:** OMSPEC x OMTESTCD x SEX (or OMSPEC x SEX if OMTESTCD absent)

**Source columns:** `OMSTRESN` (preferred) or `OMORRES` (fallback). `OMSPEC` (required -- returns empty if absent). `OMTESTCD`, `OMSTRESU`.

**Terminal body weight lookup:**
```python
bw_df, _ = read_xpt(study.xpt_files["bw"])
bw_df["BWDY"] = pd.to_numeric(bw_df["BWDY"], errors="coerce")
terminal = bw_df.sort_values("BWDY").groupby("USUBJID").last()
terminal_bw = terminal["bw_val"].to_dict()
```

**Relative organ weight (per subject):**
```python
relative = np.where(tbw > 0, (organ_weight / tbw) * 100, np.nan)
```

**Group statistics:** Same as LB (4-decimal rounding), plus:

| Field | Formula |
|-------|---------|
| `mean_relative` | `round(float(np.mean(rel_vals)), 4)` (null if no terminal BW data) |

**Normalization-aware stats pipeline** (SPEC-NST-AMD-000): Stats run on the biologically recommended metric per organ category — absolute, ratio-to-BW (`value / terminal_bw * 100`), or ratio-to-brain (`value / brain_wt`). The `decide_metric()` function in `normalization.py` selects the metric based on organ category (7 categories) and BW/brain Hedges' g tiers. Alternative metrics are computed for all available modes. Williams' step-down test runs alongside JT and Dunnett's.

**ANCOVA** (Phase 2, `ancova.py`): When normalization tier >= 3 or brain is affected, a one-way ANCOVA (`organ_weight ~ C(dose_group) + body_weight`) is precomputed via OLS. Outputs: adjusted LS means at overall mean BW, pairwise t-tests (treated vs control), slope homogeneity test (interaction model), and effect decomposition (total/direct/indirect with Hedges' g for the direct effect). At tier >= 4, `recommended_metric` is overridden to `"ancova"`.

**Output fields:** `normalization` (recommended_metric, organ_category, tier, confidence, bw_hedges_g, brain_hedges_g), `williams` (direction, constrained_means, step_down_results, minimum_effective_dose, pooled_variance, pooled_df), `ancova` (adjusted_means, pairwise, slope, slope_homogeneity, effect_decomposition, model_r_squared, mse), `alternatives` (per-metric group_stats + pairwise + trend).

**test_code:** `str(testcd)` or `"OMWT"` if no OMTESTCD. **test_name:** `"{specimen} ({testcd})"` or `str(specimen)` if testcd is `"OMWT"`. **day:** Always `None` (terminal).

#### MI -- Microscopic Findings

**File:** `services/analysis/findings_mi.py::compute_mi_findings(study, subjects)`

**Analysis grain:** MISPEC x MISTRESC x SEX

**Source columns:** `MISPEC` (required), `MISTRESC` (required), `MISEV` (optional).

**Normal-term filtering:**
```python
NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE"}
mi_abnormal = mi_df[~mi_df["finding_upper"].isin(NORMAL_TERMS)]
mi_abnormal = mi_abnormal[mi_abnormal["finding_upper"] != "NAN"]
```

Findings with empty MISTRESC are also excluded.

**Severity scoring:**

| MISEV value | Numeric score |
|-------------|---------------|
| MINIMAL | 1 |
| MILD | 2 |
| MODERATE | 3 |
| MARKED | 4 |
| SEVERE | 5 |

```python
SEVERITY_SCORES = {"MINIMAL": 1, "MILD": 2, "MODERATE": 3, "MARKED": 4, "SEVERE": 5}
mi_abnormal["sev_score"] = mi_abnormal[severity_col].str.strip().str.upper().map(SEVERITY_SCORES)
```

**Denominator:** `n_per_group = main_subs.groupby(["dose_level", "SEX"]).size().to_dict()` -- total animals per dose x sex from DM (not from MI records).

**Group statistics (per dose_level):**

| Field | Formula |
|-------|---------|
| `n` | Total animals examined in group (from DM, not MI records) |
| `affected` | `dose_grp["USUBJID"].nunique()` |
| `incidence` | `round(affected / n, 4)` |
| `avg_severity` | `round(float(np.mean(sev_vals)), 2)` among affected animals (null if no severity data) |

**Pairwise tests (Fisher's exact):**

```python
table = [
    [treat_affected, treat_total - treat_affected],
    [control_affected, control_total - control_affected],
]
result = fisher_exact_2x2(table)
# Returns: {"odds_ratio": float, "p_value": float}
```

For MI, `p_value_adj` is set equal to `p_value` (no Bonferroni correction for incidence domains).

**Risk ratio:**
```python
rr = (treat_affected / treat_total) / (control_affected / control_total)
```

**Trend test:** Cochran-Armitage approximation via `trend_test_incidence(incidence_counts, incidence_totals)`.

**Direction:** Compares high-dose incidence to control incidence.

**test_code:** `f"{specimen}_{finding_str}"` (e.g., `"LIVER_HEPATOCELLULAR HYPERTROPHY"`).

**max_effect_size:** Set to overall average severity score across all groups (not Cohen's d).

**Additional field:** `avg_severity` (overall mean severity).

#### MA -- Macroscopic Findings

**File:** `services/analysis/findings_ma.py::compute_ma_findings(study, subjects)`

**Analysis grain:** MASPEC x MASTRESC x SEX

Follows MI pattern exactly, except:
- Same NORMAL_TERMS (without `"NONE"`).
- No severity scoring (no MISEV equivalent).
- `avg_severity` is not computed; not included in output.
- `max_effect_size` is `None`.
- Pairwise: Fisher's exact (same as MI). `p_value_adj = p_value` (no Bonferroni).
- Trend: Cochran-Armitage (same as MI).

#### CL -- Clinical Observations

**File:** `services/analysis/findings_cl.py::compute_cl_findings(study, subjects)`

**Analysis grain:** CLSTRESC x SEX (no specimen column)

**Source columns:** `CLSTRESC` (preferred) or `CLORRES` (fallback).

**Normal-term filtering:** Same as MI, plus `"NONE"`:
```python
NORMAL_TERMS = {"NORMAL", "WITHIN NORMAL LIMITS", "WNL", "NO ABNORMALITIES", "UNREMARKABLE", "NONE"}
```

Follows MI incidence pattern (Fisher's exact + Cochran-Armitage trend), except:
- No specimen column; `specimen` is `None` in output.
- `test_code` is the finding string itself (e.g., `"EXCESSIVE SALIVATION"`).
- `max_effect_size` is `None`.
- `p_value_adj = p_value` (no Bonferroni).

#### FW -- Food/Water Consumption

**File:** `generator/domain_stats.py::_compute_fw_findings(study, subjects)` (only in generator pipeline; not in on-demand pipeline)

**Analysis grain:** FWTESTCD x FWDY x SEX (or FWDY x SEX if no FWTESTCD)

Mirrors the BW continuous pattern: Welch's t, Cohen's d, trend, Bonferroni. Uses `FWSTRESN` or `FWORRES` for values, `FWDY` for study day (defaults to 1), `FWSTRESU` for unit (defaults to `"g"`).

Mean/sd rounded to 2 decimals. **test_code:** `str(testcd)` or `"FW"`. **test_name:** `"Food/Water ({testcd})"` or `"Food/Water Consumption"`.

**NOTE:** FW is only processed in the generator pipeline (`domain_stats.py`), not in the on-demand adverse effects pipeline (`unified_findings.py`), because `unified_findings.py` only calls LB, BW, OM, MI, MA, CL.

#### DS -- Disposition (Mortality)

**File:** `services/analysis/findings_ds.py::compute_ds_findings(study, subjects)`

**Analysis grain:** SEX (one finding per sex with any deaths)

**Source column:** `DSDECOD` (decoded disposition term).

**Death detection:** Matches against a set of known death/euthanasia terms:
```python
DEATH_TERMS = {"DEAD", "DEATH", "FOUND DEAD", "DIED", "EUTHANIZED", "EUTHANASIA",
               "EUTHANIZED MORIBUND", "SACRIFICED MORIBUND", "MORIBUND SACRIFICE",
               "MORIBUND", "TERMINAL SACRIFICE", "SCHEDULED EUTHANASIA"}
```

Follows the MI incidence pattern: counts unique USUBJID per dose group, Fisher's exact pairwise tests, Cochran-Armitage trend test. No Bonferroni correction.

**Output fields:** `domain="DS"`, `test_code="MORTALITY"`, `data_type="incidence"`, `mortality_count=<int>`. No specimen, no avg_severity, no max_effect_size.

**NOTE:** DS is processed in the generator pipeline (`domain_stats.py`) and included in the enrichment loop. The `organ_map.py` maps DS domain to `"general"` organ system by default.

### Phase 3: Classification & Enrichment

**File:** `generator/domain_stats.py::compute_all_findings()` (enrichment loop) and `services/analysis/classification.py` (classification functions)

After all domain findings are collected, each finding is enriched:

```python
for finding in all_findings:
    finding["severity"] = classify_severity(finding)
    finding["dose_response_pattern"] = classify_dose_response(finding["group_stats"], finding["data_type"])
    finding["treatment_related"] = determine_treatment_related(finding)
    finding["organ_system"] = get_organ_system(finding["specimen"], finding["test_code"], finding["domain"])
    finding["organ_name"] = get_organ_name(finding["specimen"], finding["test_code"])
    finding["endpoint_label"] = ...  # see below
    finding["endpoint_type"] = _classify_endpoint_type(finding["domain"], finding["test_code"])
    finding["anova_p"] = ...  # approximated from min_p_adj for continuous, else None
    finding["jt_p"] = ...     # same as trend_p
```

#### Severity Classification

**File:** `services/analysis/classification.py::classify_severity(finding)`

Returns `"adverse"`, `"warning"`, or `"normal"`. Conditions evaluated in order; first match wins.

**Continuous endpoints (LB, BW, OM, FW):**

| Classification | Conditions |
|----------------|------------|
| `"adverse"` | `min_p_adj < 0.05 AND abs(max_effect_size) >= 0.5` |
| `"warning"` | `min_p_adj < 0.05 AND abs(max_effect_size) < 0.5` |
| `"adverse"` | `trend_p < 0.05 AND abs(max_effect_size) >= 0.8` |
| `"warning"` | `trend_p < 0.05 AND abs(max_effect_size) < 0.8` |
| `"warning"` | `abs(max_effect_size) >= 1.0` (regardless of p-value) |
| `"normal"` | None of the above |

**Incidence endpoints (MI, MA, CL):**

| Classification | Conditions |
|----------------|------------|
| `"adverse"` | `min_p_adj < 0.05` |
| `"warning"` | `trend_p < 0.05` |
| `"warning"` | `min_p_adj < 0.1` |
| `"normal"` | None of the above |

#### Dose-Response Pattern Classification

**File:** `services/analysis/classification.py::classify_dose_response(group_stats, data_type)`

Extracts ordered values: `means` (continuous) or `incidence`/`affected` (incidence) from group_stats.

```python
control_mean = means[0] if means[0] is not None else 0
min_threshold = abs(control_mean) * 0.01 if abs(control_mean) > 1e-10 else 1e-10
diffs = [means[i + 1] - means[i] for i in range(len(means) - 1)]
```

| Pattern | Condition |
|---------|-----------|
| `"insufficient_data"` | Fewer than 2 data points |
| `"flat"` | All `abs(diffs) <= min_threshold` |
| `"monotonic_increase"` | All `diffs > min_threshold` |
| `"monotonic_decrease"` | All `diffs < -min_threshold` |
| `"threshold"` | Initial diffs are flat (within threshold), remaining diffs all in same direction |
| `"non_monotonic"` | None of the above |

Threshold detection logic:
```python
first_nonzero = next((i for i, d in enumerate(diffs) if abs(d) > min_threshold), None)
if first_nonzero is not None and first_nonzero > 0:
    remaining = diffs[first_nonzero:]
    if all(d > min_threshold for d in remaining) or all(d < -min_threshold for d in remaining):
        return "threshold"
```

#### Treatment-Relatedness Determination

**File:** `services/analysis/classification.py::determine_treatment_related(finding)`

Returns `True` if **any** of:

| Condition | Logic |
|-----------|-------|
| Both pairwise and trend significant | `min_p_adj < 0.05 AND trend_p < 0.05` |
| Adverse with monotonic dose-response | `severity == "adverse" AND dose_response_pattern in ("monotonic_increase", "monotonic_decrease")` |
| Very significant pairwise alone | `min_p_adj < 0.01` |

#### Organ System Mapping

**File:** `generator/organ_map.py::get_organ_system(specimen, test_code, domain)` using data from `services/analysis/send_knowledge.py`

Three-tier priority lookup:

**Priority 1 -- Specimen name.** If `specimen` is non-null, look up in `ORGAN_SYSTEM_MAP` (exact match first, then prefix match for compound names like `"LYMPH NODE, INGUINAL"`):

| Specimen(s) | Organ System |
|-------------|--------------|
| LIVER | hepatic |
| KIDNEY, KIDNEYS, URINARY BLADDER | renal |
| BRAIN, SPINAL CORD, SCIATIC NERVE | neurological |
| HEART, AORTA | cardiovascular |
| LUNG, LUNGS, TRACHEA, LARYNX | respiratory |
| SPLEEN, BONE MARROW, THYMUS, LYMPH NODE (+ variants) | hematologic |
| ADRENAL GLAND(S), THYROID GLAND, PITUITARY GLAND, PANCREAS | endocrine |
| STOMACH, SMALL/LARGE INTESTINE, COLON, DUODENUM, JEJUNUM, ILEUM, CECUM, RECTUM, ESOPHAGUS | gastrointestinal |
| TESTIS/TESTES, EPIDIDYMIS, PROSTATE, OVARY/OVARIES, UTERUS, MAMMARY GLAND | reproductive |
| SKIN | integumentary |
| INJECTION SITE | local |
| SKELETAL MUSCLE, BONE, STERNUM, FEMUR | musculoskeletal |
| EYE, EYES | ocular |

**Priority 2 -- Biomarker map (LB domain).** If `test_code` matches a key in `BIOMARKER_MAP`:

| LBTESTCD | System | Organ |
|----------|--------|-------|
| ALT, AST, ALP, GGT, TBIL, ALB, TP, GLOB | hepatic | LIVER |
| BUN, CREAT, PHOS | renal | KIDNEY |
| RBC, HGB, HCT, WBC, PLT, RETIC, MCV, MCH, MCHC | hematologic | BONE MARROW |
| GLUC | metabolic | (none) |
| CHOL, TRIG | metabolic | LIVER |
| NA, K, CL | electrolyte | KIDNEY |
| CA | electrolyte | (none) |
| CK | musculoskeletal | SKELETAL MUSCLE |
| LDH | general | (none) |

**Priority 3 -- Domain default.** All domains default to `"general"`.

#### Endpoint Type Classification

| Domain | Endpoint Type |
|--------|--------------|
| BW | `"body_weight"` |
| FW | `"food_water"` |
| LB | `"clinical_chemistry"` |
| MI | `"histopathology"` |
| MA | `"gross_pathology"` |
| OM | `"organ_weight"` |
| CL | `"clinical_observation"` |

#### Endpoint Label Construction

| Domain | Label Format |
|--------|-------------|
| MI, MA, CL, OM (with specimen) | `"{specimen} -- {test_name}"` |
| LB, BW, FW (no specimen) | `"{test_name}"` |

### Phase 4: View-Specific Assembly

**File:** `generator/view_dataframes.py`

#### `study_signal_summary.json`

**Function:** `build_study_signal_summary(findings, dose_groups)`

**Grain:** endpoint x dose x sex. One row per treated dose group per finding. Control rows (dose_level=0) are excluded.

**Construction:**
1. Iterate all findings.
2. For each finding, iterate `group_stats`.
3. Skip dose_level == 0.
4. Look up matching pairwise result. `p_value` = `p_value_adj` (preferred) or `p_value`.
5. Compute signal score (see Signal Score section).
6. Emit one row.
7. Sort all rows by `signal_score` descending.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding |
| `endpoint_type` | string | Finding |
| `domain` | string | Finding |
| `test_code` | string | Finding |
| `organ_system` | string | Finding |
| `organ_name` | string | Finding |
| `dose_level` | int | group_stats |
| `dose_label` | string | From dose_groups |
| `dose_value` | float or null | From dose_groups |
| `sex` | string | Finding |
| `signal_score` | float (0-1) | Computed (rounded to 3 decimals) |
| `direction` | string or null | Finding |
| `p_value` | float or null | Pairwise (adj preferred) |
| `trend_p` | float or null | Finding |
| `effect_size` | float or null | Pairwise cohens_d |
| `severity` | string | Finding |
| `treatment_related` | boolean | Finding |
| `dose_response_pattern` | string | Finding |
| `statistical_flag` | boolean | `p_value is not None and p_value < 0.05` |
| `dose_response_flag` | boolean | Pattern in `("monotonic_increase", "monotonic_decrease", "threshold")` |
| `mean` | float or null | Group mean |
| `n` | int | Group n |

#### `target_organ_summary.json`

**Function:** `build_target_organ_summary(findings)`

**Grain:** One row per organ system. Does not take dose_groups as input.

**Construction:**
1. Group all findings by `organ_system`.
2. For each organ system:
   - `endpoints`: set of unique `"{domain}_{test_code}_{sex}"` keys
   - `domains`: set of unique domain codes
   - `total_signal`: sum of signal scores (computed per-finding using `_compute_signal_score(min_p_adj, trend_p, max_effect_size, dose_response_pattern)`)
   - `max_signal`: max of those signal scores
   - `n_significant`: count of findings where `min_p_adj < 0.05`
   - `n_treatment_related`: count of treatment-related findings

**Evidence score formula:**
```python
mean_signal = total_signal / max(len(endpoints), 1)
domain_count = len(domains)
evidence_score = mean_signal * (1 + 0.2 * (domain_count - 1))
```

Multi-domain convergence multiplier:
- 1 domain -> 1.0x
- 2 domains -> 1.2x
- 3 domains -> 1.4x

**Target organ flag:**
```python
target_organ_flag = (evidence_score >= 0.3) and (n_significant >= 1)
```

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `organ_system` | string | Organ system name |
| `evidence_score` | float | Computed (rounded to 3) |
| `n_endpoints` | int | Unique endpoint key count |
| `n_domains` | int | Unique domain count |
| `domains` | string[] | Sorted domain codes |
| `max_signal_score` | float | Max signal score (rounded to 3) |
| `n_significant` | int | Findings with min_p_adj < 0.05 |
| `n_treatment_related` | int | Treatment-related findings |
| `target_organ_flag` | boolean | Whether organ meets threshold |

Sorted by `evidence_score` descending.

#### `dose_response_metrics.json`

**Function:** `build_dose_response_metrics(findings, dose_groups)`

**Grain:** endpoint x dose x sex. One row per dose group per finding (including control).

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding |
| `domain` | string | Finding |
| `test_code` | string | Finding |
| `organ_system` | string | Finding |
| `dose_level` | int | group_stats |
| `dose_label` | string | From dose_groups |
| `sex` | string | Finding |
| `mean` | float or null | Group mean (continuous) |
| `sd` | float or null | Group SD |
| `n` | int | Group n |
| `incidence` | float or null | Group incidence (incidence data) |
| `affected` | int or null | Number affected |
| `p_value` | float or null | Pairwise (adj preferred) |
| `effect_size` | float or null | Cohen's d |
| `dose_response_pattern` | string | Finding pattern |
| `trend_p` | float or null | Finding trend_p |
| `data_type` | string | `"continuous"` or `"incidence"` |

#### `organ_evidence_detail.json`

**Function:** `build_organ_evidence_detail(findings, dose_groups)`

**Grain:** organ x endpoint x dose. One row per pairwise comparison for non-normal or treatment-related findings.

**Filter:** `severity != "normal" OR treatment_related == True`

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `organ_system` | string | Finding |
| `organ_name` | string | Finding |
| `endpoint_label` | string | Finding |
| `domain` | string | Finding |
| `test_code` | string | Finding |
| `dose_level` | int | Pairwise |
| `dose_label` | string | From dose_groups |
| `sex` | string | Finding |
| `p_value` | float or null | Pairwise (adj preferred) |
| `effect_size` | float or null | Pairwise Cohen's d |
| `direction` | string or null | Finding |
| `severity` | string | Finding |
| `treatment_related` | boolean | Finding |

#### `lesion_severity_summary.json`

**Function:** `build_lesion_severity_summary(findings, dose_groups)`

**Grain:** finding x dose x sex. MI, MA, CL domains only.

**Filter:** `domain in ("MI", "MA", "CL")`

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding |
| `specimen` | string | Finding |
| `finding` | string | Finding |
| `domain` | string | Finding |
| `dose_level` | int | group_stats |
| `dose_label` | string | From dose_groups |
| `sex` | string | Finding |
| `n` | int | Animals examined |
| `affected` | int | Animals with finding |
| `incidence` | float | Proportion |
| `avg_severity` | float or null | Mean severity score (null for ~75% of rows) |
| `severity` | string | Finding severity classification |

**NOTE:** `avg_severity` is null for approximately 550 of 728 rows. Consumers must null-guard with `?? 0`.

#### `adverse_effect_summary.json`

**Function:** `build_adverse_effect_summary(findings, dose_groups)`

**Grain:** endpoint x dose x sex. Non-normal findings only.

**Filter:** `severity != "normal"` (includes both `"adverse"` and `"warning"`)

One row per pairwise comparison for qualifying findings.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `endpoint_label` | string | Finding |
| `endpoint_type` | string | Finding |
| `domain` | string | Finding |
| `organ_system` | string | Finding |
| `dose_level` | int | Pairwise |
| `dose_label` | string | From dose_groups |
| `sex` | string | Finding |
| `p_value` | float or null | Pairwise (adj preferred) |
| `effect_size` | float or null | Pairwise Cohen's d |
| `direction` | string or null | Finding |
| `severity` | string | Finding severity |
| `treatment_related` | boolean | Finding |
| `dose_response_pattern` | string | Finding |

#### `noael_summary.json`

**Function:** `build_noael_summary(findings, dose_groups)`

**Grain:** 3 rows (M, F, Combined).

**Construction per sex:**
1. Filter findings to matching sex (or all for "Combined").
2. Find `adverse_dose_levels`: set of dose_levels where `severity == "adverse"` AND at least one pairwise `p_value_adj < 0.05`.
3. If adverse_dose_levels non-empty:
   - `loael_level = min(adverse_dose_levels)`
   - `noael_level = loael_level - 1` (if loael_level > 0, else null)
4. Count `n_adverse_at_loael` and collect `adverse_domains_at_loael`.

**Schema:**

| Column | Type | Source |
|--------|------|--------|
| `sex` | string | `"M"`, `"F"`, or `"Combined"` |
| `noael_dose_level` | int or null | Computed |
| `noael_label` | string | Dose group label, or `"Not established"` |
| `noael_dose_value` | float or null | Numeric dose |
| `noael_dose_unit` | string or null | Dose unit |
| `loael_dose_level` | int or null | Computed |
| `loael_label` | string | Dose group label, or `"N/A"` |
| `n_adverse_at_loael` | int | Count of adverse findings at LOAEL |
| `adverse_domains_at_loael` | string[] | Domains contributing at LOAEL |

### Phase 5: Rule Engine (16 Canonical Rules)

**File:** `generator/scores_and_rules.py::evaluate_rules(findings, target_organs, noael_summary, dose_groups)`

Evaluates 16 rules (R01-R16) in three passes:

1. **Endpoint-scope (R01-R07, R10-R13):** Per finding.
2. **Organ-scope (R08, R09, R16):** Per organ in target_organ_summary.
3. **Study-scope (R14, R15):** Per sex in noael_summary.

#### Rule Result Structure

| Field | Type | Description |
|-------|------|-------------|
| `rule_id` | string | R01-R16 |
| `scope` | string | `"endpoint"`, `"organ"`, or `"study"` |
| `severity` | string | `"info"` or `"warning"` |
| `context_key` | string | See format below |
| `organ_system` | string | Organ system (empty for study-scope) |
| `output_text` | string | Resolved template text |
| `evidence_refs` | string[] | Evidence reference strings |

**Context key formats:**
- Endpoint: `"{domain}_{test_code}_{sex}"` (e.g., `"LB_ALT_M"`)
- Organ: `"organ_{organ_system}"` (e.g., `"organ_hepatic"`)
- Study: `"study_{sex}"` (e.g., `"study_M"`, `"study_Combined"`)

#### All 16 Rules

| Rule | Scope | Severity | Condition | Template |
|------|-------|----------|-----------|----------|
| R01 | endpoint | info | `treatment_related == True` | `"Treatment-related: {endpoint_label} shows statistically significant dose-dependent change ({direction}) in {sex} ({pattern})."` |
| R02 | endpoint | info | Any pairwise `p_value_adj < 0.05` | `"Significant pairwise difference at {dose_label} (p={p_value:.4f}, d={effect_size:.2f})."` (one result per significant dose) |
| R03 | endpoint | info | `trend_p < 0.05` | `"Significant dose-response trend (p={trend_p:.4f})."` |
| R04 | endpoint | warning | `severity == "adverse"` | `"Adverse finding: {endpoint_label} classified as adverse in {sex} (p={p_value:.4f})."` |
| R05 | endpoint | info | `dose_response_pattern in ("monotonic_increase", "monotonic_decrease")` | `"Monotonic dose-response: {endpoint_label} shows {pattern} across dose groups in {sex}."` |
| R06 | endpoint | info | `dose_response_pattern == "threshold"` | `"Threshold effect: {endpoint_label} shows threshold pattern in {sex} -- effect begins at higher doses."` |
| R07 | endpoint | info | `dose_response_pattern == "non_monotonic"` | `"Non-monotonic: {endpoint_label} shows inconsistent dose-response in {sex}. Consider biological plausibility."` |
| R08 | organ | warning | `target_organ_flag == True` | `"Target organ: {organ_system} identified with convergent evidence from {n_domains} domains ({domains})."` |
| R09 | organ | info | `n_domains >= 2` | `"Multi-domain evidence for {organ_system}: {n_endpoints} endpoints across {domains}."` |
| R10 | endpoint | warning | `abs(max_effect_size) >= 1.0` | `"Large effect: {endpoint_label} shows Cohen's d = {effect_size:.2f} at high dose in {sex}."` |
| R11 | endpoint | info | `0.5 <= abs(max_effect_size) < 1.0` | `"Moderate effect: {endpoint_label} shows Cohen's d = {effect_size:.2f} at high dose."` |
| R12 | endpoint | warning | `domain in ("MI", "MA", "CL") AND direction == "up" AND severity != "normal"` | `"Histopathology: increased incidence of {finding} in {specimen} at high dose ({sex})."` |
| R13 | endpoint | info | `domain in ("MI", "MA", "CL") AND dose_response_pattern in ("monotonic_increase", "threshold") AND avg_severity is not None` | `"Severity grade increase: {finding} in {specimen} shows dose-dependent severity increase."` |
| R14 | study | info | `noael_dose_level is not None` | `"NOAEL established at {noael_label} ({noael_dose_value} {noael_dose_unit}) for {sex}."` |
| R15 | study | warning | `noael_dose_level is None` | `"NOAEL not established for {sex}: adverse effects observed at lowest dose tested."` |
| R16 | organ | info | Organ has >= 2 findings | `"Correlated findings in {organ_system}: {endpoint_labels} suggest convergent toxicity."` (up to 5 unique labels) |

**Template resolution:** Uses Python `str.format(**context)`. If format fails (missing key/type error), the raw template is used as-is.

**Finding context for template resolution:**
```python
context = {
    "endpoint_label": finding.get("endpoint_label", ""),
    "domain": finding.get("domain", ""),
    "test_code": finding.get("test_code", ""),
    "sex": finding.get("sex", ""),
    "direction": finding.get("direction", ""),
    "pattern": finding.get("dose_response_pattern", ""),
    "severity": finding.get("severity", ""),
    "specimen": finding.get("specimen", ""),
    "finding": finding.get("finding", ""),
    "organ_system": finding.get("organ_system", ""),
    "p_value": finding.get("min_p_adj", 0) or 0,
    "effect_size": finding.get("max_effect_size", 0) or 0,
    "trend_p": finding.get("trend_p", 0) or 0,
}
```

### Phase 6: Static Chart Generation

**File:** `generator/static_charts.py::generate_target_organ_bar_chart(target_organs)`

Generates a self-contained HTML bar chart with inline CSS. No external dependencies (no Plotly, no JavaScript).

**Specifications:**
- Horizontal bars, one per organ system, sorted by evidence_score descending.
- Bar width = `(score / max_score) * 100` percent.
- Colors: red (`#ef4444`) if evidence_score >= 0.3 threshold; green (`#22c55e`) if below.
- Each bar shows numeric evidence_score value.
- Detail text: `"{n_endpoints} endpoints, {n_domains} domains"`.
- Target organ flag marked with `" *"` suffix.
- Header: "Target Organ Evidence Scores".
- Legend: "Threshold for target organ designation: 0.3".
- Font: `system-ui, -apple-system, sans-serif`.

---

## Signal Score Computation

**File:** `generator/view_dataframes.py::_compute_signal_score(p_value, trend_p, effect_size, dose_response_pattern)`

**Range:** 0.0 to 1.0. Computed for each endpoint x dose combination.

```python
score = 0.0

# P-value component (weight: 0.35)
if p_value is not None and p_value > 0:
    p_score = min(-math.log10(p_value) / 4.0, 1.0)   # caps at p=0.0001
    score += 0.35 * p_score

# Trend component (weight: 0.20)
if trend_p is not None and trend_p > 0:
    t_score = min(-math.log10(trend_p) / 4.0, 1.0)
    score += 0.20 * t_score

# Effect size component (weight: 0.25)
if effect_size is not None:
    e_score = min(abs(effect_size) / 2.0, 1.0)         # caps at |d|=2.0
    score += 0.25 * e_score

# Dose-response pattern component (weight: 0.20)
pattern_scores = {
    "monotonic_increase": 1.0,
    "monotonic_decrease": 1.0,
    "threshold": 0.7,
    "non_monotonic": 0.3,
    "flat": 0.0,
    "insufficient_data": 0.0,
}
score += 0.20 * pattern_scores.get(dose_response_pattern, 0.0)

return min(score, 1.0)
```

**Weights:**

| Component | Weight | Scaling |
|-----------|--------|---------|
| p_value | 0.35 | `-log10(p) / 4.0`, capped at 1.0 |
| trend_p | 0.20 | `-log10(p) / 4.0`, capped at 1.0 |
| effect_size | 0.25 | `abs(d) / 2.0`, capped at 1.0 |
| dose_response_pattern | 0.20 | Lookup table |

**Organ evidence score** (in `build_target_organ_summary`):
```
mean_signal = total_signal / n_unique_endpoints
convergence_multiplier = 1 + 0.2 * (n_domains - 1)
evidence_score = mean_signal * convergence_multiplier
```

---

## Statistical Methods Reference

| Test | scipy Function | When Used | Parameters | Min Group Size | Output |
|------|---------------|-----------|------------|----------------|--------|
| Welch's t-test | `stats.ttest_ind(a1, a2, equal_var=False)` | Continuous pairwise (LB, BW, OM, FW) | NaN removed; `equal_var=False` | n >= 2 per group | `{statistic: float, p_value: float}` |
| Fisher's exact | `stats.fisher_exact([[a,b],[c,d]])` | Incidence pairwise (MI, MA, CL) | 2x2 table: `[[treat_affected, treat_unaffected], [ctrl_affected, ctrl_unaffected]]` | -- | `{odds_ratio: float, p_value: float}` |
| Spearman (trend) | `stats.spearmanr(dose_levels, values)` | Continuous trend (LB, BW, OM, FW) | dose_levels = ordinal ints; values = individual measurements; NaN removed | >= 4 total obs | `{statistic: float, p_value: float}` |
| Cochran-Armitage | Custom (chi-square z-test) | Incidence trend (MI, MA, CL) | scores = `[0,1,...,k-1]`; counts and totals per dose | >= 2 groups; p_bar not 0 or 1 | `{statistic: float, p_value: float}` |
| Cohen's d | Custom (pooled SD formula) | Effect size for continuous | `pooled_std = sqrt(((n1-1)*var1 + (n2-1)*var2) / (n1+n2-2))` ; `d = (mean1 - mean2) / pooled_std` | n >= 2 per group; pooled_std != 0 | `float` or `None` |
| Bonferroni | `min(p * n_tests, 1.0)` | Continuous pairwise adjustment | n_tests = count of non-null p-values in finding | -- | list of adjusted p-values |
| ANOVA (one-way) | `stats.f_oneway(*groups)` | Generator enrichment (continuous) | -- | >= 2 groups with >= 2 obs | `float` or `None` |
| Dunnett's | `stats.dunnett(*treated, control=control)` | Generator enrichment (continuous) | -- | control >= 2; treated >= 2 each | list of p-values |
| Kruskal-Wallis | `stats.kruskal(*groups)` | Generator enrichment (ordinal) | -- | >= 2 groups with >= 1 obs | `float` or `None` |
| Mann-Whitney U | `stats.mannwhitneyu(a1, a2, alternative="two-sided")` | Available but not used in main pipeline | -- | >= 1 per group | `{statistic: float, p_value: float}` |
| Spearman correlation | `stats.spearmanr(x, y)` | Cross-finding correlations (on-demand pipeline) | NaN pair-removed; need >= 3 pairs | >= 3 non-null pairs | `{rho: float, p_value: float}` |

**ANOVA/Dunnett's computation (BUG-04/SD-09 resolved):** The generator's enrichment phase (`domain_stats.py`) computes ANOVA, Dunnett's, and Jonckheere-Terpstra tests from raw per-subject values (`raw_values` key in finding dicts). All continuous domain findings modules (LB, BW, OM, FW) now pass `raw_values` — a list of numpy arrays, one per dose group. The enrichment loop uses these directly: `_anova_p(raw_values)`, `_dunnett_p(control, treated)`, `_jonckheere_terpstra_p(raw_values)`. A fallback approximation from `min_p_adj`/`trend_p` exists only for edge cases where raw values are unavailable. The `raw_values` key is popped from finding dicts before JSON serialization.

**Bonferroni application scope (SD-11 resolved):**
- Applied to continuous domain pairwise p-values (LB, BW, OM, FW): `n_tests` = number of treated dose groups in that finding.
- **NOT** applied to incidence domain pairwise p-values (MI, MA, CL, DS): `p_value_adj` is set equal to `p_value`.
- **Rationale**: For continuous endpoints, Bonferroni corrects for testing multiple endpoints simultaneously within a domain (e.g., 20 lab parameters). For incidence endpoints, each histopathological finding is a distinct biological observation, not part of a statistical test battery. FDA/EMA regulatory guidance does NOT require multiplicity adjustment for histopathology. Over-correction would miss real effects because incidence rates are low and studies are not powered for individual histopath findings.

---

## On-Demand Pipeline: Adverse Effects Detail

**File:** `services/analysis/unified_findings.py::compute_adverse_effects(study)`

This pipeline runs the same Phase 1-2 as the generator (same dose_groups, same per-domain findings modules for LB, BW, OM, MI, MA, CL -- but NOT FW), then adds:

1. **Deterministic IDs:** `md5("{domain}_{test_code}_{day}_{sex}")[:12]`
2. **Classification:** Same `classify_severity()`, `classify_dose_response()`, `determine_treatment_related()`.
3. **Cross-finding correlations:** `correlations.py::compute_correlations(findings, max_pairs=50)`

**Correlations logic:**
- Pair findings by shared `(specimen or domain, sex)`.
- Correlation vector: group means (continuous) or incidence values (incidence) across dose levels, using shorter vector length.
- Minimum: 3 dose levels with non-null values for both findings.
- `spearman_correlation(vals1, vals2)` -> `{rho, p_value}`.
- Results sorted by `abs(rho)` descending, capped at 50 pairs.

4. **Context pane data:** `context_panes.py::build_finding_context(finding, all_findings, correlations, dose_groups)` -- produces 5 structured panes (treatment_summary, statistics, dose_response, correlations, effect_size), each with computed insights.

5. **Summary:** Counts by severity, treatment_related count, target organs, domains with findings, suggested NOAEL.

**Caching:** Results serialized to `backend/cache/{study_id}/adverse_effects.json`. Cache is valid when its mtime exceeds the max mtime of relevant XPT files.

---

## Current State

**Real (computing actual statistics from XPT data):**
- Full statistical pipeline: Welch's t, Fisher's exact, Cochran-Armitage, Cohen's d, Bonferroni, Spearman trend
- All per-domain finding modules (LB, BW, OM, MI, MA, CL, FW)
- Classification engine (severity, dose-response pattern, treatment-relatedness)
- Signal scoring and rule engine (16 rules)
- Cross-finding correlations (on-demand pipeline)
- View-specific DataFrame assembly (all 8 JSON outputs)

**Hardcoded (would need generalization for production):**
- ~~`ARMCD_TO_DOSE_LEVEL`~~ and ~~`RECOVERY_ARMCDS`~~ — now dynamically derived from TX domain. Recovery detected via `RECOVDUR` param or label keywords. TK satellite detected via waterfall heuristics (see Phase 1 Step 4a). Dose levels sorted by `TRTDOS` ascending.
- `ORGAN_SYSTEM_MAP` and `BIOMARKER_MAP` -- static lookup tables in `send_knowledge.py`
- Severity classification thresholds (p < 0.05, |d| >= 0.5 etc.)
- Signal score weights (0.35, 0.20, 0.25, 0.20)
- Target organ threshold (evidence_score >= 0.3 AND n_significant >= 1)

**Limitations:**
- Single study only (`ALLOWED_STUDIES = {"PointCross"}`)
- No incremental recomputation -- full pipeline reruns on each generation
- FW domain only in generator pipeline, not in on-demand adverse effects pipeline
- Recovery subjects pooled with main study during treatment period for in-life domains (DATA-01). Terminal domains (MI, MA, OM, TF) and mortality (DS, DD) remain main-study-only. Recovery reversibility assessments computed frontend-side via `lib/recovery-assessment.ts` using subject-level data from the temporal API.
- TK satellite subjects excluded from all statistical analyses. Detected via TX domain heuristics (TXPARMCD values, SETCD substring, label keywords) and classified via DM.SETCD membership. Frontend `StudyBanner` displays exclusion count for reviewer transparency.

---

## Frontend Transform Pipeline

After the backend delivers `UnifiedFinding[]` to the frontend, `useFindingsAnalyticsLocal.ts` applies a chain of client-side transforms before passing data to downstream derivations (endpoint summaries, organ coherence, syndromes, signal scores, NOAEL). The transforms operate on `UnifiedFinding[]` at the array level, preserving the same pattern as the backend pipeline.

```
API response (UnifiedFinding[])
  │
  ├─ sex filter, domain filter, search filter
  │
  ▼
scheduledFindings                      ← applyScheduledFilter() swaps group_stats/pairwise
  │                                      for terminal domains when mortality exclusion enabled
  ▼
applyEffectSizeMethod(method)          ← recomputes pairwise[].cohens_d + max_effect_size
  │                                      from group_stats[].n, .mean, .sd
  │                                      Fast path: "hedges-g" returns input by reference (no-op)
  ▼
applyMultiplicityMethod(method)        ← recomputes p_value_adj + min_p_adj from p_value_welch
  │                                      Fast path: "dunnett-fwer" returns input by reference (no-op)
  ▼
activeFindings                         ← consumed by all downstream useMemo chains:
                                         deriveEndpointSummaries(), organCoherence,
                                         crossDomainSyndromes, signal scores, NOAEL
```

**Transform composition order matters:** Scheduled filter runs first because it swaps the underlying `group_stats` arrays. Effect size recomputation uses those (possibly swapped) stats. Multiplicity correction uses `p_value_welch` from the (possibly swapped) pairwise arrays.

**Session state keys:** Method preferences stored via `useSessionState()`:
- `pcc.${studyId}.effectSize` — `"hedges-g"` (default) | `"cohens-d"` | `"glass-delta"`
- `pcc.${studyId}.multiplicity` — `"dunnett-fwer"` (default) | `"bonferroni"`

**Files:**
- `lib/stat-method-transforms.ts` — pure transform functions (no React dependencies)
- `hooks/useStatMethods.ts` — reads session state, returns `{ effectSize, multiplicity }`
- `hooks/useFindingsAnalyticsLocal.ts` — wires transforms into the derivation pipeline

---

## Code Map

| File | What It Does | Key Functions |
|------|-------------|---------------|
| `generator/generate.py` | CLI entry point; orchestrates pipeline, writes JSON | `generate(study_id)`, `_sanitize(obj)`, `_write_json(path, data)` |
| `generator/domain_stats.py` | Collects all domain findings, enriches with classification | `compute_all_findings(study)`, `_anova_p()`, `_dunnett_p()`, `_jonckheere_terpstra_p()`, `_kruskal_p()`, `_compute_fw_findings()`, `_classify_endpoint_type()` |
| `generator/view_dataframes.py` | Assembles 7 view-specific JSON structures from findings | `build_study_signal_summary()`, `build_target_organ_summary()`, `build_dose_response_metrics()`, `build_organ_evidence_detail()`, `build_lesion_severity_summary()`, `build_adverse_effect_summary()`, `build_noael_summary()`, `_compute_signal_score()`, `_compute_noael_confidence()` |
| `generator/scores_and_rules.py` | Evaluates 17 rules (R01-R17), emits structured results | `evaluate_rules(findings, target_organs, noael_summary, dose_groups)`, `_build_finding_context()`, `_emit()`, `_emit_organ()`, `_emit_study()` |
| `generator/organ_map.py` | Organ system resolution (specimen/test_code/domain -> system) | `get_organ_system(specimen, test_code, domain)`, `get_organ_name(specimen, test_code)` |
| `generator/static_charts.py` | HTML bar chart generation | `generate_target_organ_bar_chart(target_organs)` |
| `services/xpt_processor.py` | XPT loading, CSV caching, TS metadata extraction | `read_xpt(xpt_path)`, `ensure_cached(study, domain)`, `extract_full_ts_metadata(study)` |
| `services/analysis/dose_groups.py` | Dose group construction from DM+TX, TK satellite detection | `_parse_tx(study)` → `(tx_map, tk_setcds)`, `build_dose_groups(study)` → `{dose_groups, subjects, tx_map, tk_count}` |
| `services/analysis/phase_filter.py` | Phase-aware subject/record filtering (DATA-01) | `get_treatment_subjects()`, `get_terminal_subjects()`, `filter_treatment_period_records()`, `compute_last_dosing_day()` |
| `services/analysis/findings_lb.py` | LB domain continuous analysis | `compute_lb_findings(study, subjects, last_dosing_day)` |
| `services/analysis/findings_bw.py` | BW domain continuous analysis with baseline % change | `compute_bw_findings(study, subjects, last_dosing_day)` |
| `services/analysis/findings_om.py` | OM domain continuous analysis with relative organ weight | `compute_om_findings(study, subjects)` |
| `services/analysis/findings_mi.py` | MI domain incidence + severity analysis | `compute_mi_findings(study, subjects)` |
| `services/analysis/findings_ma.py` | MA domain incidence analysis | `compute_ma_findings(study, subjects)` |
| `services/analysis/findings_cl.py` | CL domain incidence analysis | `compute_cl_findings(study, subjects)` |
| `services/analysis/findings_ds.py` | DS domain mortality incidence analysis | `compute_ds_findings(study, subjects)` |
| `services/analysis/statistics.py` | Pure function wrappers for all statistical tests | `dunnett_pairwise()`, `welch_pairwise()`, `welch_t_test()`, `fisher_exact_2x2()`, `trend_test()`, `trend_test_incidence()`, `cohens_d()`, `spearman_correlation()`, `severity_trend()`, `bonferroni_correct()`, `mann_whitney_u()` |
| `services/analysis/classification.py` | Finding classification (severity, pattern, treatment-related) | `classify_severity(finding)`, `classify_dose_response(group_stats, data_type)`, `determine_treatment_related(finding)` |
| `services/analysis/send_knowledge.py` | Static SEND domain knowledge tables | `BIOMARKER_MAP`, `ORGAN_SYSTEM_MAP`, `THRESHOLDS`, `DOMAIN_EFFECT_THRESHOLDS` |
| `services/analysis/unified_findings.py` | On-demand adverse effects orchestrator with caching | `compute_adverse_effects(study)` |
| `services/analysis/correlations.py` | Cross-finding Spearman correlations | `compute_correlations(findings, max_pairs=50)` |
| `services/analysis/context_panes.py` | Per-finding context pane data for 5 panes | `build_finding_context(finding, all_findings, correlations, dose_groups)` |
| `services/analysis/insights.py` | Rule-based insight generators for context panes | `treatment_summary_insights()`, `statistics_insights()`, `dose_response_insights()`, `correlations_insights()`, `effect_size_insights()` |
| `routers/analyses.py` | Adverse effects API endpoints | `get_adverse_effects()`, `get_finding_context()`, `get_adverse_effects_summary()` |
| `routers/analysis_views.py` | Serves pre-generated JSON files | `get_analysis_view()`, `get_static_chart()` |
| `models/analysis_schemas.py` | Pydantic models for adverse effects API | `AdverseEffectsResponse`, `UnifiedFinding`, `FindingContext`, `AnalysisSummary` |

---

## Datagrok Notes

- **Python code ports directly.** All dependencies (scipy, pandas, numpy, pyreadstat) are available in Datagrok's Python environment.
- **Generator pattern becomes on-import computation.** When a study is imported into Datagrok, run the pipeline and store results in Datagrok DataFrames rather than JSON files.
- **Pre-generated JSON becomes Datagrok DataFrames in memory.** The frontend currently fetches via REST API; in Datagrok, data will be available as in-memory DataFrames accessed directly by the UI.
- **Dose group mapping must be generalized.** The hardcoded `ARMCD_TO_DOSE_LEVEL` only works for ARMCD values "1"-"4". Production must derive mappings dynamically from TX domain `TRTDOS` values (sorted ascending, assign ordinal indices).
- **Organ system mapping is portable.** `ORGAN_SYSTEM_MAP` and `BIOMARKER_MAP` are pure data tables -- easily loaded from config files or a database.
- **On-demand pipeline can be simplified.** In Datagrok, all analysis data is in memory, so the adverse effects view can operate on the same enriched findings as the generator views, eliminating the need for a separate pipeline.
- **Caching strategy changes.** File-based CSV and JSON caching (`backend/cache/`) should be replaced with Datagrok's built-in caching or in-memory DataFrames.

---

## Changelog

- 2026-02-22: Added frontend transform pipeline documentation. Backend: `welch_pairwise()` added to statistics.py and called in 6 continuous domain modules (LB, BW, OM, EG, VS, BG) to store raw Welch p-values as `p_value_welch` alongside Dunnett-corrected p-values. Frontend: client-side effect size switching (Hedges' g / Cohen's d / Glass's Δ) and multiplicity switching (Dunnett FWER / Bonferroni) via transform pipeline in useFindingsAnalyticsLocal.ts.
- 2026-02-20: Added TK satellite detection and segregation (63ae665). Phase 1 Step 4a documents waterfall heuristics (TK param value, SETCD substring, label keywords), ARMCD collision avoidance, SETCD-based subject classification. Phase 2 subject filter updated from `~is_recovery` to `~is_recovery & ~is_satellite` across all 12 domain modules + mortality + food consumption. Output contract updated: `tk_count` added, subjects DataFrame columns documented.
- 2026-02-08: Consolidated from `data-pipeline-spec.md` (1,452 lines) and actual backend code. Verified all function signatures, column names, thresholds, and formulas against source. Corrected Phase numbering (generator has 4 phases in code, spec had 6 -- reconciled as Phases 1-6 covering loading, stats, classification, view assembly, rules, static charts). Added on-demand adverse effects pipeline documentation. Added complete code map with all function names.

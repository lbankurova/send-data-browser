# Cross-Study Insights Engine — Specification

## Architecture

```
Input:  selected_study (Study object)
        all_studies (Study[] — all studies in the system)

Step 0: Evaluate self-referencing rules on selected_study alone
        - Rule 0 (Reported vs Derived Discrepancy)
        - Rule 9 (NOAEL-LOAEL Margin)

Step 1: Filter reference studies
        references = all_studies where:
          - id != selected_study.id
          - test_article == selected_study.test_article (same compound)
          - pipeline_stage == "submitted" (only submitted studies serve as references)

Step 2: For each reference study, evaluate cross-study rules (1-8, 10-18)
Step 3: Collect all insights, sort by priority (0 first), then rule order within priority
Step 4: Return insights array

Output: Insight[] sorted by priority, then rule order
```

## Resolved Accessors

All rules use these accessors to get the best available data. Reported is preferred; derived is fallback.

```
target_organs(study):
  return study.target_organs_reported ?? study.target_organs_derived ?? []

noael(study):
  return study.noael_reported ?? study.noael_derived ?? null

loael(study):
  return study.loael_reported ?? study.loael_derived ?? null

has_target_organ_discrepancy(study):
  if study.target_organs_reported == null or study.target_organs_derived == null: return false
  return set(target_organs_derived) != set(target_organs_reported)

has_noael_discrepancy(study):
  if study.noael_reported == null or study.noael_derived == null: return false
  return study.noael_reported.dose != study.noael_derived.dose
```

## Insight Schema

```
{
  priority: number,       // 0 = stage-specific/critical, 1 = cross-study tox, 2 = supporting, 3 = informational
  rule: string,           // rule identifier (e.g., "discrepancy", "cross_species_noael")
  title: string,          // short descriptive title
  detail: string,         // full insight text, 1-3 sentences
  ref_study: string|null  // ID of reference study, or null for self-referencing rules
}
```

## Display Rules

- **Priority 0 and 1**: Always visible
- **Priority 2 and 3**: Collapsed by default behind "Show more insights" toggle
- Insights appear on the **Study Details page** (not the landing page context panel)
- Self-referencing insights (ref_study = null) display at the top

---

## PHASE 1 RULES

---

### Rule 0: Reported vs Derived Discrepancy
- **Priority:** 0
- **Rule ID:** `discrepancy`
- **Self-referencing:** Yes (ref_study = null)
- **Trigger:** Study has both reported AND derived values, AND they differ — for either target organs or NOAEL/LOAEL
- **Logic — Target Organs:**
  1. `derived_only = target_organs_derived.filter(o => !target_organs_reported.includes(o))`
  2. `reported_only = target_organs_reported.filter(o => !target_organs_derived.includes(o))`
  3. If derived_only is non-empty: data suggests organs not in report
  4. If reported_only is non-empty: report lists organs not flagged by data (rare but possible — e.g., clinical observation-based assessment)
- **Logic — NOAEL:**
  1. Compare noael_reported.dose vs noael_derived.dose
  2. If derived < reported: statistical analysis is more conservative than study director's assessment
  3. If derived > reported: study director was more conservative (unusual)
- **Output templates:**
  - Target organ discrepancy: `"Data analysis identifies {derived_only} as potential target organ(s) not listed in study report. Report lists: {reported}. Data suggests: {derived}. Review histopathology assessment."`
  - NOAEL discrepancy: `"Study report NOAEL ({reported.dose} {reported.unit}) differs from data-derived NOAEL ({derived.dose} {derived.unit}, {derived.method}). {interpretation}"`
    - If derived < reported: `"Statistical analysis is more conservative — data flags findings at {derived.dose} that study director considered non-adverse."`
    - If derived > reported: `"Study director applied additional clinical judgment beyond statistical thresholds."`
- **Edge cases:**
  - Both layers null → skip
  - Only one layer present → skip (no comparison possible)
  - Values identical → skip (no discrepancy)
  - LOAEL discrepancy: follow same logic as NOAEL but generate separate insight

### Rule 1: Dose Selection from Prior Data
- **Priority:** 0
- **Rule ID:** `dose_selection`
- **Trigger:** `selected.pipeline_stage == "planned"` AND `selected.design_rationale != null` AND same compound
- **Logic:** Surface the design rationale text, appending the reference study's resolved NOAEL.
- **Template:** `"{design_rationale} Ref: {ref.species} NOAEL {noael(ref).dose} {noael(ref).unit} ({ref.id})."`
- **Edge cases:**
  - noael(ref) is null → append "Ref: {ref.id} — NOAEL not determined."
  - One insight per reference study

### Rule 2: Monitoring Watchlist
- **Priority:** 0
- **Rule ID:** `monitoring_watchlist`
- **Trigger:** `selected.pipeline_stage == "ongoing"` AND `ref.pipeline_stage == "submitted"` AND same compound AND ref.findings != null AND target_organs(ref) is non-empty
- **Logic:**
  1. Collect from ref.findings: all params + all specimen values → deduplicate → first 6
  2. Progress: `selected.domains_collected.length / selected.domains_planned.length`
- **Template:** `"{ref.id} ({ref.species}, {ref.duration_weeks}wk) found {target_organs(ref)} as target. Watch: {params}. Collected: {collected}/{planned} domains."`
- **Edge cases:**
  - target_organs(ref) empty → skip
  - selected.domains_collected null → show "0/{planned}"

### Rule 3: Ongoing Dose Overlap Warning
- **Priority:** 0
- **Rule ID:** `dose_overlap_warning`
- **Trigger:** `selected.pipeline_stage == "ongoing"` AND same compound AND same dose_unit
- **Logic:**
  1. `at_risk = selected.doses.filter(d => d >= loael(ref).dose)`
  2. If ref has DD findings: check if any selected doses ≥ dose at DD groups
  3. Generate warning if overlap exists
- **Computation for mortality threshold:**
  ```
  death_groups = ref.findings.DD ? ref.findings.DD.groups : []
  death_dose = death_groups.length > 0 ? ref.doses[Math.min(...death_groups) - 1] : null
  lethal_overlap = death_dose ? selected.doses.filter(d => d >= death_dose) : []
  ```
- **Templates:**
  - LOAEL overlap: `"Doses {at_risk} ≥ {ref.species} LOAEL ({loael(ref).dose} {loael(ref).unit}) from {ref.id}."`
  - Mortality overlap: `"Dose {lethal_overlap} approaches level associated with mortality in {ref.id}. {ref.findings.DD.count} deaths from {ref.findings.DD.cause}."`
- **Edge cases:**
  - Different dose_units → skip
  - loael(ref) null → skip
  - No overlap → do not generate

### Rule 4: Cross-Species NOAEL
- **Priority:** 1
- **Rule ID:** `cross_species_noael`
- **Trigger:** same compound AND different species AND both have resolved NOAEL (noael(study) != null for both)
- **Logic:**
  1. If dose_units match: `ratio = noael(selected).dose / noael(ref).dose`, round to 1 decimal
  2. ratio > 1 → "{selected.species} tolerates ~{ratio}x higher dose"
  3. ratio < 1 → "{ref.species} tolerates ~{1/ratio}x higher dose"
  4. ratio == 1 → "Equivalent across species"
- **Template:** `"{selected.species}: {noael(selected).dose} {noael(selected).unit} vs {ref.species}: {noael(ref).dose} {noael(ref).unit}. {comparison}"`
- **Edge cases:**
  - Different dose_units → do not compute ratio: "Direct comparison requires dose unit normalization ({unit_a} vs {unit_b})."
  - Same species → skip (Rules 7/8 cover this)
  - NOAEL of 0 in one, non-zero in other → compute. Both 0 → "No safe dose identified in either species."

### Rule 5: Shared Target Organ Confirmation
- **Priority:** 1
- **Rule ID:** `shared_target_organ`
- **Trigger:** same compound AND both have non-empty target_organs(study) AND intersection is non-empty
- **Logic:**
  1. `shared = target_organs(selected) ∩ target_organs(ref)`
  2. Same species → "Reproducible across study durations ({duration_a}wk vs {duration_b}wk)."
  3. Different species → "Cross-species concordance strengthens toxicological significance."
- **Template:** `"{shared} identified as target in both {selected.id} ({selected.species} {selected.duration_weeks}wk) and {ref.id} ({ref.species} {ref.duration_weeks}wk). {concordance}"`
- **Edge cases:**
  - Multiple shared organs → list all
  - Empty target_organs on either → skip

### Rule 6: Novel Target Organ
- **Priority:** 1
- **Rule ID:** `novel_target_organ`
- **Trigger:** same compound AND both have non-empty target_organs AND selected has organs NOT in ref (or vice versa)
- **Logic:**
  1. `novel_in_selected = target_organs(selected).filter(o => !target_organs(ref).includes(o))`
  2. `novel_in_ref = target_organs(ref).filter(o => !target_organs(selected).includes(o))`
  3. Generate insight for each direction if non-empty
- **Template:** `"{novel_organs} identified in {study_with_novel} but not in {other}. {interpretation}"`
  - Different species: "May reflect species-specific sensitivity."
  - Same species, different duration: "May emerge with longer exposure."
  - Same species, similar duration: "May reflect dose range differences."
- **Edge cases:**
  - Can fire alongside Rule 5 (shared + novel for different organs in same pair)

### Rule 7: Same-Species NOAEL Trend
- **Priority:** 1
- **Rule ID:** `same_species_noael_trend`
- **Trigger:** same compound AND same species AND different duration AND same dose_unit AND both have resolved NOAEL
- **Logic:**
  1. longer = study with higher duration_weeks
  2. Lower NOAEL in longer → "NOAEL decreased with longer exposure, suggesting cumulative toxicity"
  3. Higher NOAEL in longer → "May indicate adaptation or different dose range"
  4. Equal → "Consistent across durations"
- **Template:** `"{duration_a}wk NOAEL: {noael_a} vs {duration_b}wk NOAEL: {noael_b} {unit} in {species}. {trend}"`
- **Edge cases:**
  - Same duration → skip
  - Different dose_units → skip

### Rule 8: Same-Species LOAEL Trend
- **Priority:** 1
- **Rule ID:** `same_species_loael_trend`
- **Trigger:** same compound AND same species AND different duration AND same dose_unit AND both have resolved LOAEL
- **Logic:** Same as Rule 7 but for LOAEL.
- **Template:** `"{duration_a}wk LOAEL: {loael_a} vs {duration_b}wk LOAEL: {loael_b} {unit} in {species}. {trend}"`
- **Note:** Present alongside Rule 7 when both fire.

### Rule 9: NOAEL-LOAEL Margin
- **Priority:** 1
- **Rule ID:** `noael_loael_margin`
- **Self-referencing:** Yes (ref_study = null)
- **Trigger:** selected has both resolved NOAEL and LOAEL, non-null
- **Logic:**
  1. `ratio = loael(selected).dose / noael(selected).dose`
  2. ratio ≤ 2 → "Narrow safety margin — dose selection requires caution."
  3. ratio > 10 → "Wide safety margin."
  4. Otherwise → neutral
- **Template:** `"NOAEL-to-LOAEL margin: {ratio}x ({noael.dose} → {loael.dose} {unit}). {margin_text}"`
- **Edge cases:**
  - NOAEL of 0 → "LOAEL at lowest tested dose. No safety margin established."
  - Run ONCE, do not iterate over references

### Rule 10: Mortality Signal
- **Priority:** 1
- **Rule ID:** `mortality_signal`
- **Trigger:** same compound AND ref.findings has "DD" key
- **Logic:**
  1. Extract cause, count, groups from ref.findings.DD
  2. Map groups to doses: `ref.doses[group - 1]`
- **Template:** `"{ref.id} ({ref.species} {ref.duration_weeks}wk): {count} deaths ({cause}) at ≥{dose} {dose_unit}. {stage_context}"`
  - ongoing: "Current study includes doses in this range." (if overlap) or "Current doses below mortality threshold."
  - planned: "Consider in dose selection."
  - submitted/pre-sub: "Compare mortality profiles."
- **Edge cases:**
  - DD without cause → "cause not specified"
  - DD without count → omit count

### Rule 11: Tumor Signal
- **Priority:** 1
- **Rule ID:** `tumor_signal`
- **Trigger:** same compound AND ref.findings has entry with non-null `types`
- **Logic:** Extract tumor types, groups, doses.
- **Template:** `"{ref.id} ({ref.species} {ref.duration_weeks}wk): Neoplastic findings ({types}) at ≥{dose} {dose_unit}. {stage_context}"`
  - ongoing/planned: "Relevant for carcinogenicity risk assessment."
  - submitted/pre-sub: "Cross-reference with current study histopathology."

### Rule 12: Reversibility Comparison
- **Priority:** 2
- **Rule ID:** `reversibility_comparison`
- **Trigger:** same compound AND both have findings AND overlapping domain keys with non-null recovery
- **Logic:**
  1. Collect (key, recovery) from each study's findings where recovery != null
  2. Match on exact domain key
  3. Compare recovery values
- **Template:** `"Recovery: {comparisons joined by semicolon}."`
- **Edge cases:**
  - Only exact key matches: "LB" ≠ "LB_HEM"
  - Identical recovery + same species → still report

### Rule 13: Severity Comparison
- **Priority:** 2
- **Rule ID:** `severity_comparison`
- **Trigger:** same compound AND both have findings with non-null severity AND shared specimen
- **Logic:**
  1. Match findings on specimen
  2. Compare severity at highest group in each
  3. Ordinal ranking: minimal < mild < moderate < marked < severe
  4. Compound values like "minimal-mild" → use upper bound for comparison
- **Template:** `"{specimen} severity: {selected.species} {sev_a} vs {ref.species} {sev_b}. {interpretation}"`
- **Edge cases:**
  - Different group numbering → compare each study's highest group

### Rule 14: Sex-Specific Finding Flag
- **Priority:** 2
- **Rule ID:** `sex_specific_finding`
- **Trigger:** same compound AND ref.findings has entry with non-null sex
- **Template:** `"{ref.id}: {specimen or domain} findings were {sex} ({ref.species}). Evaluate sex-stratified data in current study."`

### Rule 15: Route of Administration Difference
- **Priority:** 3 (reduced from 2 — informational)
- **Rule ID:** `route_difference`
- **Trigger:** same compound AND different route
- **Logic:**
  - Both oral (GAVAGE vs CAPSULE): "Both oral; formulation effects possible."
  - One injection, one oral: "Local injection site findings not expected with oral dosing."
  - Otherwise: state the difference
- **Template:** `"Route differs: {selected.route} (current) vs {ref.route} ({ref.id}). {interpretation}"`

### Rule 16: Study Type Difference
- **Priority:** 3
- **Rule ID:** `study_type_difference`
- **Trigger:** same compound AND different study_type
- **Template:** `"Different study types: {selected.study_type} vs {ref.study_type} ({ref.id}). {interpretation}"`
  - Reproductive vs Repeat Dose: "General tox findings inform maternal toxicity dose selection but reproductive endpoints are novel."

### Rule 17: Domain Coverage Gap
- **Priority:** 3
- **Rule ID:** `domain_coverage_gap`
- **Trigger:** same compound AND both have domain lists AND ref has findings-class domains not in selected
- **Logic:**
  1. `selected_domains = selected.domains ?? selected.domains_planned ?? []`
  2. `ref_domains = ref.domains ?? []`
  3. `gap = ref_domains.filter(d => !selected_domains.includes(d))`
  4. Keep only findings-class: BG, BW, CL, DD, EG, FW, LB, MA, MI, OM, PC, PM, PP, SC, TF, VS
  5. Remove structural: RELREC, SUPPMA, SUPPMI, CO
- **Template:** `"Endpoints in {ref.id} not in current study: {gap}. {interpretation}"`
  - DD/TF in gap: "Mortality/tumor endpoints absent."
  - PC/PP in gap: "No PK assessment."
  - EG in gap: "No ECG endpoints."

### Rule 18: Dose Range Context
- **Priority:** 3
- **Rule ID:** `dose_range_context`
- **Trigger:** same compound AND same dose_unit AND both have doses
- **Logic:**
  1. `sel_max = max(selected.doses excluding 0)`
  2. `ref_max = max(ref.doses excluding 0)`
  3. Compare ranges
- **Templates:**
  - sel_max > ref_max: `"Current study tests higher doses (up to {sel_max}) than {ref.id} (up to {ref_max} {unit}). New signals may emerge."`
  - sel_max < ref_max: `"Current dose range (up to {sel_max}) below {ref.id} max ({ref_max} {unit}). High-dose findings from {ref.id} may not manifest."`
  - Overlapping: `"Dose ranges overlap. Direct comparison feasible at overlapping levels."`
- **Edge cases:** Different dose_units → skip

---

## PHASE 2 RULES — Future Implementation

---

### P2-1: Safety Margin to Human Dose
- **Requires:** `intended_clinical_dose` field on project or study
- **Logic:** margin = NOAEL / HED. FDA expects ≥10x.

### P2-2: Historical Control Comparison
- **Requires:** External HCD database for species/strain
- **Logic:** Compare finding incidences against background rates.

### P2-3: TK/Exposure-Based Comparison
- **Requires:** `pk_at_noael: { cmax, cmax_unit, auc, auc_unit }` on study or from PC/PP domain data
- **Logic:** Compare Cmax/AUC at NOAEL across species for exposure-normalized safety margins.

### P2-4: Findings Concordance Matrix
- **Requires:** ≥3 submitted studies of same compound
- **Logic:** Matrix showing which findings appear across which studies. Consistent signals vs isolates.

### P2-5: Genetic Toxicology Cross-Reference
- **Requires:** Genotox study results (separate data standard)
- **Logic:** Positive genotox + tumors = genotoxic carcinogen concern.

### P2-6: Organ Weight Ratio Analysis
- **Requires:** OM domain xpt data for relative organ weights
- **Logic:** Disproportionate vs proportional organ weight changes.

### P2-7: Recovery Period Adequacy
- **Requires:** Timepoint-level recovery data
- **Logic:** Flag if selected study's recovery period is shorter than reference's and reference showed partial recovery.

---

## Expected Outputs for Mock Data

Uses updated mock data with reported/derived fields.

### Selected: PC201708 (Submitted, Rat 13wk)
References: PC201802 (Submitted, Dog 4wk)

| Rule | ID | Fires? | Output summary |
|------|----|--------|----------------|
| 0 | discrepancy | **Yes** | target_organs_reported=[LIVER], derived=[LIVER, HEMATOPOIETIC SYSTEM]. "Data analysis identifies HEMATOPOIETIC SYSTEM as potential target organ not in study report." |
| 4 | cross_species_noael | **Yes** | "Rat: 2 vs Dog: 5 mg/kg/day. Dog tolerates ~2.5x higher dose." |
| 5 | shared_target_organ | **Yes** | "LIVER confirmed across species." |
| 6 | novel_target_organ | **Yes** | "KIDNEY in PC201802 but not PC201708. May reflect species-specific sensitivity." |
| 9 | noael_loael_margin | **Yes** | "10x (2 → 20 mg/kg/day). Wide safety margin." |
| 12 | reversibility | **Yes** | "BW: partial (Rat) / full (Dog); LB: partial (Rat) / full (Dog)." |
| 14 | sex_specific | **Yes** | "PC201802: KIDNEY findings were males only (Dog)." |
| 15 | route_difference | **Yes** | "ORAL GAVAGE vs ORAL CAPSULE. Both oral; formulation effects possible." |
| 17 | domain_gap | **Yes** | "PC201708 has DD, PC, PM, PP, TF not in PC201802." |
| 18 | dose_range | **Yes** | "Current up to 200 vs PC201802 up to 25. New signals may emerge." |
| Others | — | No | — |

### Selected: PC201905 (Pre-Sub, Dog 26wk) — DISCREPANCY STUDY
References: PC201708 (Rat 13wk), PC201802 (Dog 4wk)

| Rule | ID | Fires? | Output summary |
|------|----|--------|----------------|
| 0 | discrepancy | **Yes (x2)** | NOAEL: "Report 3 vs derived 1 mg/kg/day. Statistical analysis more conservative." AND Target organs: "Data identifies ADRENAL not in report." |
| 4 | cross_species_noael | **Yes** vs PC201708 | "Dog: 3 vs Rat: 2. Dog tolerates ~1.5x higher." (Uses reported NOAEL = 3) |
| 5 | shared_target_organ | **Yes** vs PC201708 | "LIVER cross-species." |
| 5 | shared_target_organ | **Yes** vs PC201802 | "LIVER across durations (26wk vs 4wk)." |
| 7 | same_species_noael_trend | **Yes** vs PC201802 | "26wk NOAEL: 3 vs 4wk NOAEL: 5 in Dog. Decreased with longer exposure." |
| 8 | same_species_loael_trend | **Yes** vs PC201802 | "26wk LOAEL: 10 vs 4wk LOAEL: 25 in Dog. Threshold decreased." |
| 9 | noael_loael_margin | **Yes** | "3.3x (3 → 10 mg/kg/day)." |
| 12 | reversibility | **Yes** vs PC201802 | "LB: full (Dog) / full (Dog)." |
| 15 | route_difference | **Yes** vs PC201708 | "ORAL CAPSULE vs ORAL GAVAGE." |
| 18 | dose_range | **Yes** x2 | Various range comparisons |
| 10 | mortality_signal | **Yes** vs PC201708 | "PC201708: 3 deaths (Hepatocellular carcinoma) at ≥200. Compare mortality profiles." |
| 11 | tumor_signal | **Yes** vs PC201708 | "PC201708: Neoplastic findings. Cross-reference histopathology." |

### Selected: PC202103 (Ongoing, Dog 13wk)
References: PC201708 (Rat 13wk), PC201802 (Dog 4wk)

| Rule | ID | Fires? | Output summary |
|------|----|--------|----------------|
| 0 | discrepancy | No | No reported data exists |
| 2 | monitoring_watchlist | **Yes** x2 | One per ref. Targets + params to watch. "5/19 domains collected." |
| 3 | dose_overlap_warning | No | Max dose 8 < both LOAELs (20 and 25) |
| 9 | noael_loael_margin | No | No NOAEL/LOAEL yet |
| 15 | route_difference | **Yes** vs PC201708 | CAPSULE vs GAVAGE |
| 17 | domain_gap | **Yes** | Compares planned vs ref domains |
| 18 | dose_range | **Yes** x2 | "Up to 8 vs 200 (PC201708). High-dose findings may not manifest." |

### Selected: PC202201 (Planned, Rat EFD)
References: PC201708 (Rat 13wk), PC201802 (Dog 4wk)

| Rule | ID | Fires? | Output summary |
|------|----|--------|----------------|
| 1 | dose_selection | **Yes** x2 | Design rationale + each ref NOAEL |
| 10 | mortality_signal | **Yes** vs PC201708 | "3 deaths at ≥200. Consider in dose selection." |
| 11 | tumor_signal | **Yes** vs PC201708 | "Hepatocellular carcinoma. Relevant for carcinogenicity risk." |
| 15 | route_difference | **Yes** vs PC201802 | GAVAGE vs CAPSULE |
| 16 | study_type_difference | **Yes** x2 | "Reproductive Toxicity vs Repeat Dose Toxicity. Reproductive endpoints are novel." |
| 17 | domain_gap | **Yes** | EFD planned domains vs ref domains |
| 18 | dose_range | **Yes** x2 | "Up to 50 vs 200 (PC201708)" and "Up to 50 vs 25 (PC201802)" |

### Selected: AX220401 (Submitted, Rat 4wk, AXL-42)
References: none (no other submitted AXL-42 studies)

| Rule | ID | Fires? | Output summary |
|------|----|--------|----------------|
| 0 | discrepancy | No | Reported and derived match |
| 9 | noael_loael_margin | **Yes** | "4x (25 → 100 mg/kg/week)." |
| All others | — | No | No references to compare against |

---

## Implementation Notes

### Rule evaluation order
Evaluate in numeric order (0, 1, 2, ..., 18). Within same priority, maintain rule number order.

### Self-referencing rules
Rules 0 and 9 do not iterate over references. Run once on selected study. Set ref_study = null.

### Resolved accessor consistency
Always use resolved accessors (noael(), target_organs(), loael()). Never access reported/derived fields directly in insight text — the accessor determines which value to show. However, Rule 0 (discrepancy) is the ONE exception that explicitly compares both layers.

### Deduplication
Do not deduplicate complementary rules (e.g., 5+6, 7+8). They are distinct observations. Only deduplicate if identical detail text would result (shouldn't happen).

### Performance
18 rules × N references. With typical programs (5-10 studies, 2-3 submitted), this is <100 evaluations. Trivially fast.

### Testing
Use the Expected Outputs tables as a test suite. Verify each study produces exactly the listed insights.

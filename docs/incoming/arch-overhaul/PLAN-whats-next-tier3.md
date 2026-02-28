# What's Next: Tier 3 Implementation Plan

**Date:** 2026-02-28 | **Status:** Proposal — awaiting approval
**Depends on:** Tiers 1+2 shipped, Briefs 1/2/4/5/6 complete, Brief 3 not started

---

## Summary

Three implementation tracks are ready. All research is complete — no briefs outstanding except Brief 3 (cross-domain concordance linkage map, blocks Tier 4C only). The tracks are independent and can be parallelized or sequenced as preferred.

| Track | Source | Effort | Impact | Dependencies |
|---|---|---|---|---|
| **3A. HCD Static Ranges** | Brief 4 | ~2 days | High — enables A-3 factor, primary false-positive filter | None |
| **3B. B-6 Progression Chains** | Brief 6 | ~3-4 days | High — completes B-6 factor (currently tumors-only) | None |
| **2C. Full Hall 2012 Liver LB Panel** | Brief 1 + existing code | ~1 day | Medium — completes liver adaptive tree | None |

**Recommended sequence:** 2C → 3A → 3B (easiest-first, each builds confidence in the next).

---

## Track 2C: Full Hall 2012 Liver LB Panel Verification

**Status:** Partially implemented. Liver tree in `adaptive_trees.py` already checks for concurrent necrosis/fibrosis/steatosis and enzyme fold. The full Hall panel counting (9 LB markers, min 5 clean, ALT+AST both clean) is configured in `organ-weight-thresholds.json` but not yet consumed by the tree.

### What to build

Extend `_tree_liver()` in `adaptive_trees.py` (~80 lines):
1. Read `adaptive_requires` config from organ-weight-thresholds.json LIVER entry
2. For each marker in the 9-marker panel (ALT, AST, ALP, GGT, BILI, CHOL, BILEAC, TP, ALB):
   - Use `ConcurrentFindingIndex.is_lb_marker_clean(test_code, sex)` (already exists)
   - Count: available, clean, elevated
3. Decision logic:
   - ≥5 clean + ALT clean + AST clean + severity ≤ grade 2 → `tr_adaptive` (enzyme induction without hepatotoxicity)
   - ALT or AST elevated (p < 0.05 + direction "up") → `tr_adverse` (hepatocellular damage)
   - Panel incomplete (<5 markers available) → `equivocal` with "LB panel incomplete" annotation
   - Available but <5 clean → `equivocal` with "insufficient clean markers" annotation
4. Annotate `_tree_result.ecetoc_factors` with panel summary: `["B-2: Hall 2012 panel 7/9 clean, ALT clean, AST clean"]`

### Files affected
- `backend/services/analysis/adaptive_trees.py` (+~80 lines in `_tree_liver`)
- `frontend/tests/organ-thresholds.test.ts` (add Hall panel assertions)

### Verification
- Regenerate PointCross, check liver MI hypertrophy findings for panel annotations
- Expect: ALT elevation already detected → should see `tr_adverse` with panel detail

---

## Track 3A: Historical Control Data — Phase 1 (Static JSON Ranges)

**Source:** Brief 4 — compiled reference ranges + Inotiv PDFs

### What to build

**1. Shared config: `shared/hcd-reference-ranges.json`** (~300 lines)

Schema per entry:
```json
{
  "strain": "Hsd:Sprague Dawley",
  "strain_aliases": ["SD", "Sprague-Dawley", "Sprague Dawley"],
  "sex": "M",
  "study_duration_category": "90-day",
  "organ": "LIVER",
  "weight_type": "absolute",
  "unit": "g",
  "mean": 12.1,
  "sd": 1.24,
  "n": 20,
  "p5": null,
  "p95": null,
  "min": null,
  "max": null,
  "source": "Envigo C11963",
  "date_range": "2015-2020"
}
```

Populate from:
- Brief 4 starter table: 10 organs × 2 sexes × 2 durations for SD rat (Envigo C11963)
- Inotiv RccHan:WIST PDFs: organ weights with 5th/95th percentiles, age-stratified (digitize the freely downloadable PDF)
- Cross-validate Brief 4's flagged anomaly: male 13-week kidney SD=2.24 against NTP TR-595

**2. Backend loader: `backend/services/analysis/hcd.py`** (~150 lines)

- `HcdRangeDB` class: lazy-loads JSON, indexes by `(strain_normalized, sex, duration_category, organ)`
- `_normalize_strain(species_str) → str`: Maps SEND TS SPECIES values to config strain keys
  - "RAT" + "SPRAGUE" → "Hsd:Sprague Dawley"
  - "RAT" + "WISTAR" → "RccHan:WIST"
  - "RAT" + "FISCHER" or "F344" → "F344/N"
- `query_hcd(strain, sex, duration_days, organ) → HcdRange | None`
- `assess_a3(group_mean, strain, sex, duration_days, organ) → str`:
  - Within [p5, p95] (or [mean-2SD, mean+2SD]) → `"within_hcd"`
  - Outside → `"outside_hcd"`
  - No matching HCD → `"no_hcd"` (current default)

**3. Wire A-3 into classification.py** (~30 lines)

In `assess_finding()` A-factor scoring:
- Currently A-3 is reserved (returns 0). Change to:
  - Call `hcd.assess_a3()` with the finding's control group mean, study strain/sex/duration, specimen
  - `within_hcd` → A-3 = -0.5 (reduces treatment-relatedness score — finding is within normal variation)
  - `outside_hcd` → A-3 = +0.5 (increases treatment-relatedness — finding exceeds normal variation)
  - `no_hcd` → A-3 = 0 (no data, neutral)
- This shifts the A-score threshold: a borderline finding within HCD range may drop below 1.0 → `not_treatment_related`

**4. Thread study duration through pipeline** (~15 lines)

- Add `study_duration_days: int | None` to `process_findings()` params
- Extract from TS domain: TSPARMCD = "PLESSION" or "DOESSION" (planned/actual study duration)
- Pass to `assess_finding_with_context()`

### Files affected
| File | Change |
|---|---|
| `shared/hcd-reference-ranges.json` | NEW ~300L |
| `backend/services/analysis/hcd.py` | NEW ~150L |
| `backend/services/analysis/classification.py` | +~30L (A-3 scoring) |
| `backend/services/analysis/findings_pipeline.py` | +~10L (duration threading) |
| `backend/generator/domain_stats.py` | +~5L (duration extraction) |
| `backend/services/analysis/unified_findings.py` | +~5L (duration pass-through) |
| `frontend/tests/finding-class.test.ts` | Update expectations if distribution shifts |

### Expected behavior changes
- Some OM findings with control means within HCD range may shift from `equivocal` → `not_treatment_related`
- Some high-background findings (if they happen to fall within HCD) may lose treatment-relatedness
- NOAEL may shift upward if findings at LOAEL dose reclassify as non-treatment-related

### Verification
```bash
cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe -m generator.generate PointCross

# Check A-3 factor impact
C:/pg/pcc/backend/venv/Scripts/python.exe -c "
import json, sys; sys.stdout.reconfigure(encoding='utf-8')
from collections import Counter
d = json.load(open('generated/PointCross/unified_findings.json'))
print('finding_class:', Counter(f.get('finding_class','missing') for f in d['findings']))
# Compare with pre-HCD: 227/103/40/23/3
"
```

---

## Track 3B: B-6 Progression Chain Encoding

**Source:** Brief 6 — 14 organ-specific progression chains

### Design decisions

1. **YAML or Python?** YAML for the chain definitions (data-driven, editable by toxicologists), Python for the evaluation engine. Same pattern as `syndrome-definitions.json` + `corroboration.py`.

2. **Where does B-6 fire?** In `assess_finding()` B-factor assessment, after the current B-6 tumor check. Currently B-6 only checks `isNeoplastic` (TF domain). Extend to check non-tumor progression chains.

3. **What does B-6 do to classification?** B-6 fires → the finding is a **precursor to adverse outcome** → escalate toward `tr_adverse` even if current severity is low. This is the opposite of B-2 (adaptive = de-escalate).

4. **HCD dependency?** Several chains specify "exceeds HCD range" as a firing condition. Without HCD (Track 3A), use a fallback: fire B-6 based on severity triggers only, skip HCD-range checks. When Track 3A ships, HCD-range checks become available. Design the chain schema to support both modes.

### What to build

**1. Shared config: `shared/progression-chains.yaml`** (~400 lines)

Each chain entry:
```yaml
- chain_id: "LIVER_NEOPLASTIC"
  organ: "LIVER"
  domain: ["MI", "MA"]
  species_filter: null  # all species
  strain_filter: null   # all strains; override for strain-specific chains
  sex_filter: null      # null = both; "M" for male-only chains
  stages:
    - stage: "early"
      terms: ["hypertrophy"]
      severity_trigger: 3  # grade ≥3 fires B-6
      requires_concurrent: ["necrosis", "proliferation"]  # AND condition
      obligate_precursor: false
    - stage: "early"
      terms: ["altered hepatocellular foci", "eosinophilic foci", "basophilic foci", "clear cell foci"]
      severity_trigger: 1  # any grade fires B-6 (obligate precursor)
      obligate_precursor: true
    - stage: "intermediate"
      terms: ["adenoma"]
      obligate_precursor: true
    - stage: "late"
      terms: ["carcinoma", "hepatoblastoma"]
  human_relevance:
    mechanism: "CAR/PXR/PPARa"
    relevance: "rodent_specific_for_nongenotoxic"
    note: "Human hepatocytes refractory to mitogen-driven proliferation from nuclear receptor agonists"
  spontaneous_notes:
    B6C3F1_M: "adenoma 60%, carcinoma 34%"
    F344_M: "adenoma <5%, carcinoma <2%"
  time_dependency: "chronic"  # "subchronic" or "chronic" or "both"

- chain_id: "KIDNEY_ALPHA2U"
  organ: "KIDNEY"
  domain: ["MI"]
  sex_filter: "M"
  species_filter: "rat"
  stages:
    - stage: "early"
      terms: ["hyaline droplet"]
      severity_trigger: 3
      obligate_precursor: false
    # ... etc
  human_relevance:
    mechanism: "alpha2u_globulin"
    relevance: "not_human_relevant"
    note: "EPA 1991: alpha2u-globulin nephropathy not relevant to humans"
```

14 chains from Brief 6:
1. LIVER_NEOPLASTIC
2. KIDNEY_CPN
3. KIDNEY_ALPHA2U
4. THYROID_FOLLICULAR
5. ADRENAL_PHEO
6. TESTIS_LEYDIG
7. LUNG_ALVEOLAR
8. FORESTOMACH_SQUAMOUS
9. BLADDER_UROTHELIAL
10. MAMMARY_GLAND
11. PANCREAS_ACINAR
12. NASAL_SQUAMOUS
13. LIVER_FIBROSIS
14. HEART_CARDIOMYOPATHY

**2. Backend engine: `backend/services/analysis/progression_chains.py`** (~250 lines)

- `ProgressionChainDB`: lazy-loads YAML, indexes by `(organ_upper, domain)`
- `evaluate_b6(finding, index, species, strain) → B6Result | None`:
  1. Match finding to chains by organ + domain + species/sex/strain filter
  2. For each matching chain, check finding text against stage terms (substring match, lowercase)
  3. If matched to a stage:
     - Check severity trigger (if `finding.severity_grade >= trigger` or `obligate_precursor`)
     - Check concurrent requirements if specified (via `ConcurrentFindingIndex`)
     - Check HCD range if available (via `hcd.py` — graceful when absent)
  4. Return: `chain_id`, `stage`, `fires: bool`, `rationale`, `human_relevance`
- `B6Result` dataclass: `chain_id, stage, fires, rationale, human_relevance, spontaneous_note`

**3. Wire B-6 into classification.py** (~40 lines)

In `assess_finding()` B-factor section:
- After current B-6 tumor check (`isNeoplastic`), add:
  - `b6_result = evaluate_b6(finding, index, species, strain)`
  - If `b6_result.fires`:
    - Early/intermediate precursor with severity trigger → escalate to `tr_adverse` (the finding IS a precursor to organ-level damage)
    - Annotate finding: `_b6_result = b6_result.to_dict()`
  - If chain matched but B-6 doesn't fire (below severity trigger, within HCD):
    - No escalation, but annotate `_b6_result` for transparency

**4. Frontend type update** (~5 lines)

Add `_b6_result?` to `UnifiedFinding` in `analysis.ts`:
```typescript
_b6_result?: {
  chain_id: string;
  stage: string;
  fires: boolean;
  rationale: string;
  human_relevance?: { mechanism: string; relevance: string; note: string };
};
```

### Files affected
| File | Change |
|---|---|
| `shared/progression-chains.yaml` | NEW ~400L |
| `backend/services/analysis/progression_chains.py` | NEW ~250L |
| `backend/services/analysis/classification.py` | +~40L (B-6 evaluation) |
| `backend/services/analysis/findings_pipeline.py` | +~5L (pass strain to assessment) |
| `frontend/src/types/analysis.ts` | +~10L (_b6_result type) |
| `frontend/tests/finding-class.test.ts` | Add B-6 assertions |

### Implementation notes
- **Severity grades:** SEND MI/MA findings use text severity (MINIMAL, MILD, MODERATE, MARKED, SEVERE → 1-5). The backend already parses `avg_severity` as numeric. Chain triggers compare against this.
- **Strain threading:** Need to extract strain from TS domain (TSPARMCD = "STRAIN") alongside species. Add to `get_species()` → `get_species_strain()`.
- **Graceful degradation:** When HCD unavailable, fire B-6 from severity triggers only. When strain unknown, skip strain-specific chains (KIDNEY_ALPHA2U still fires for male rat regardless of strain).

### Expected behavior changes
- MI findings matching progression chains with sufficient severity → escalate to `tr_adverse`
- Findings identified as obligate precursors (AHF, atypical hyperplasia, focal thyroid hyperplasia) → `tr_adverse` regardless of severity
- Some equivocal MI findings may resolve → `tr_adverse` when they match a progression chain
- Human relevance annotations appear on relevant findings (alpha2u, forestomach, rodent thyroid mechanism)

---

## What comes after Tier 3

| Track | Source | Status | Notes |
|---|---|---|---|
| 3A+ HCD Phase 2 (SQLite DTT IAD) | Brief 4 | Ready to implement after 3A ships | 78 MB Excel → SQLite ETL. Enables dynamic matching by route/vehicle/age/date. |
| 4A GRADE Confidence Scoring | Brief 5 | Research complete | Expand ECI to include HCD dimension (depends on 3A), cross-sex consistency. Merge temporal into B-3 + DR quality. |
| 4B BMD Optional Module | — | Research not needed | `pip install pybmds`. Low complexity. |
| 4C Backend Compound Logic | Brief 3 (not started) | Blocked on Brief 3 | Port frontend compound logic to backend corroboration. |
| 2C+ Extend adaptive trees | — | Ongoing | As new studies expose gaps, add tree nodes or new organ trees. |

---

## Risk register

| Risk | Mitigation |
|---|---|
| PointCross study may lack MI findings that match progression chains | Chains still correct; verify at least liver neoplastic chain fires; other chains tested on future studies |
| Brief 4 kidney SD anomaly (2.24 vs mean 2.91) | Cross-validate against NTP TR-595 before entering in JSON config |
| Severity grades inconsistent across studies | Use avg_severity from backend (already normalized). Document grade mapping. |
| YAML parsing adds dependency | PyYAML already in requirements.txt (used by validation engine). No new dependency. |
| B-6 escalation too aggressive | Each chain has explicit severity triggers — won't fire on minimal/mild unless obligate precursor. HCD check prevents flagging normal background. |
| Strain not available in TS domain | Default to generic (skip strain-specific chains). Log warning. |

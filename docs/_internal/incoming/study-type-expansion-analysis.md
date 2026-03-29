# Study Type Expansion — Codebase Analysis (2026-03-27, updated 2026-03-28)

**Source spec:** `docs/_internal/incoming/archive/sendex-study-type-expansion-spec.md`
**Status:** Analysis complete, P0 fixes applied, SME reference data extracted. 9 new studies added 2026-03-28. Design-adapter architecture implemented 2026-03-28 — crossover/escalation studies now produce findings (SG-04, SG-07, SG-10 resolved).

---

## Current State

The frontend has a study type registry (`shared/study-types/`) with 4 JSON configs (repeat-dose, acute, dose-range-finder, safety-pharm-cardiovascular). The backend now consumes `statistical_mode` from these configs for adapter routing (semicolon TRTDOS heuristic takes priority, config match via TS.STYPE is fallback). The `time_course` and `enabled_syndrome_groups` fields are still not consumed.

---

## Study Type Implementation Status

### 1. Repeat-dose subacute (≤28d) — ALREADY WORKS

This is what PointCross is. No changes needed.

### 2. Repeat-dose subchronic (≤90d) — ALREADY WORKS

Same pipeline as subacute. HCD duration category routing already exists. Minor gap: HCD coverage for non-rat species is sparse (degrades gracefully).

### 3. Repeat-dose chronic (>90d) — WORKS with minor gap

Same pipeline. HCD has "chronic" duration category already wired. No chronic study uploaded to test with.

### 4. Single-dose / GLP Acute — NEEDS WORK

The `acute.json` config exists but backend doesn't consume it.

| What's needed | Where | Effort |
|---|---|---|
| Backend must load and use `StudyTypeConfig` | `generator/generate.py`, `domain_stats.py` | Medium |
| `time_course: false` handling — collapse to single-timepoint evidence, skip trajectory analysis | `domain_stats.py`, evidence collector | Medium |
| n-threshold caveat — flag `SMALL_N` when n < 5/group, cap certainty | Statistics layer, certainty cascade | Small |
| Tmax timing advisory — "acute studies may underrepresent peak enzyme activity" | Output layer (advisory in provenance_messages) | Small |
| HCD has no "acute" duration category — falls back to defaults | `hcd.py` — add acute category or explicit fallback | Small |
| Frontend must respect `time_course: false` to hide trajectory panels | View components | Small |

**Testable with:** Study3 (VECTORSTUDYU1) is a single IV dose with 24-week observation. Design differs from typical acute (no terminal snapshot at Tmax) but exercises the `time_course: false` path.

### 5. Dose Range Finder (non-GLP) — NEEDS WORK

Same delta as acute, plus:

| What's needed | Where | Effort |
|---|---|---|
| Non-GLP confidence modifier — discount certainty scores | Certainty cascade, provenance messages | Small |
| GLP status detection from TS domain (`TSPARMCD = 'GLESSION'` or `'GLPSTUDY'`) | Study metadata extraction | Small |
| Heuristic routing when `TS.STYPE` absent — check GLP=N + short duration + limited domains | `study-type-registry.ts` `routeByMetadata()` | Small |
| Frontend badge/warning for "Non-GLP — confidence level reduced" | UI components | Small |

No uploaded DRF studies to test with.

### 6. Safety Pharmacology — Cardiovascular (EG only) — PARTIALLY DONE

Design-adapter architecture implemented 2026-03-28. Crossover/escalation studies now produce findings via within-subject statistics. Study5: 18 findings (QTc tr_adverse, NOAEL=50 mg/kg). CJUGSEND00: 7 findings.

| What's needed | Where | Effort | Status |
|---|---|---|---|
| Within-animal crossover statistics — paired t-test, Page's trend, Cohen's d_z, Friedman omnibus | `generator/adapters/within_subject_stats.py` | Large | **DONE** |
| Dose-escalation design support — detect semicolon-delimited TX.TRTDOS, build within-subject dose groups | `generator/adapters/treatment_periods.py` | Large | **DONE** |
| Latin square design support — per-occasion baselines, carryover detection | `generator/adapters/per_occasion_baseline.py`, `within_subject_stats.py` | Large | **DONE** |
| Backend consumes `statistical_mode: "within_animal_crossover"` from config | `generator/adapters/__init__.py` | Medium | **DONE** |
| Domain filtering — don't generate noise findings for LB/MI/MA when study is EG-only | Generator pipeline, domain_stats.py | Medium | |
| `enabled_syndrome_groups` enforcement — only run XS10 (cardiac), not all 38 syndromes | Syndrome engine | Medium | |
| Fix TS routing — `"CARDIOVASCULAR PHARMACOLOGY"` doesn't match `"SAFETY PHARMACOLOGY"` | `study-type-registry.ts` ts_stype_values | Small | |
| Fix `routeByMetadata()` heuristic — Study5 has LB (even though empty), breaks `!domains.has("LB")` | Registry heuristic | Small | |
| EG-only UI profile — waveform timeline, QTc trend, interval summary (doesn't exist yet) | New frontend components | Large | |
| Magnitude floor adjustment — acute/crossover thresholds differ from repeat-dose | Cross-domain syndromes | Medium | |

### 7. Safety Pharmacology — Respiratory (RE only) — DEFERRED but testable

Discovered via CJ16050 study (imported as CJ16050-xptonly). Spec defers this to v2, but we now have test data.

| What's needed | Where | Effort |
|---|---|---|
| RE domain parsing in generator pipeline | New `findings_re.py` module | Medium |
| Non-monotonic dose-response handling — bidirectional effects (low dose stimulates, high dose suppresses) | Trend analysis, certainty cascade | Medium |
| Respiratory safety syndrome definitions (XSR group per spec) | Syndrome definitions | Medium |
| SAFETY_PHARM_RESPIRATORY study type config | `shared/study-types/` | Small |
| Import CJ16050 study data to `send/` | File copy | Trivial |

**Testable with:** CJ16050 (parallel design, vehicle control + 2 treatment groups, RE domain with respiratory rate, tidal volume, minute volume).

---

## Uploaded Study Inventory (Non-PointCross)

### Study Matrix

| Study | Type | Species | Route | Design | Generator | Useful? |
|---|---|---|---|---|---|---|
| Study1 (Vaccine) | Repeat-dose 29d | Monkey | IM | Single-arm, no control | Complete | NO — 0 stats |
| Study2 (Vaccine) | Repeat-dose 30d | Rabbit | IM | Control + 1 treatment | Complete | YES |
| Study3 (Gene Therapy) | Single-dose | Monkey | IV | 2 treatments, no control | Complete | PARTIAL — wrong NOAEL |
| Study4 (Vaccine) | Repeat-dose 37d | Rabbit | IM | Control + 2 treatments | Complete | YES — best non-PointCross |
| Study5 (CV Pharm) | Safety pharm, Latin square | Dog | Oral | Crossover, 4 periods | **Complete** | **YES** — 18 findings, QTc tr_adverse |
| CJUGSEND00 (CV Pharm) | Safety pharm, dose escalation | Monkey | Oral | Within-animal escalation | **Complete** | **YES** — 7 findings |
| CV01 (CDISC Safety Pharm) | CV safety pharm, Latin square | Dog (Beagle) | Oral | 4-way crossover, 4 subjects | Not run | Needs XPT extraction |
| FFU (Multi-compound) | Repeat-dose ~30d IV | Monkey (Cynomolgus) | IV | 5 groups, 3 compounds, n=2/group | Complete | PARTIAL — 584 findings, multi-compound issues |
| Nimort-01 (Nimble) | Repeat-dose 21d | Rat (F344) | Oral | 3 groups, unbalanced sex | Complete | YES — but massive control mortality |
| PDS2014 | Repeat-dose 30d + 27d recovery | Rat (SD) | Oral gavage | 4 groups + TK subsets | Complete | YES — 426 findings, sex-stratified groups |
| 35449 (TOXSCI, Cmpd B) | Repeat-dose 28d dog | Dog (Beagle) | Oral gavage | 4 groups + 4-wk recovery | CRASHED | NO — only mortality file produced |
| 43066 (TOXSCI, Cmpd A) | Repeat-dose 28d dog | Dog (Beagle) | Oral gavage | 4 groups + 2-wk recovery | Complete | YES — 378 findings, first working dog study |
| 87497 (TOXSCI, Cmpd B) | Repeat-dose 28d rat | Rat (SD) | Oral gavage | 4 groups + 4-wk recovery | Complete | YES — 210 findings, clean results |
| 96298 (TOXSCI, Cmpd A) | Repeat-dose 28d rat | Rat (SD) | Oral gavage | 4 groups + recovery | Complete | YES — 266 findings, 1 death detected |
| GLP003 (instem) | Repeat-dose 29d + recovery | Rat (SD) | Oral gavage | 5 groups (dual control) | Complete | PARTIAL — 1661 findings, dose group labeling issues |

### TS Domain Metadata

| Study | SSTYP | SDESIGN | Species | Route | Duration | GLP |
|---|---|---|---|---|---|---|
| Study1 | N/A | N/A | MONKEY | INTRAMUSCULAR | P29D | N/A |
| Study2 | N/A | N/A | RABBIT | INTRAMUSCULAR | P30D | N/A |
| Study3 | N/A | N/A | MONKEY | INTRAVENOUS | P1D | N/A |
| Study4 | N/A | N/A | RABBIT | INTRAMUSCULAR | P37D | N/A |
| Study5 | CARDIOVASCULAR PHARMACOLOGY | LATIN SQUARE | DOG | ORAL GAVAGE | P36D | Y |
| CJUGSEND00 | CARDIOVASCULAR PHARMACOLOGY | DOSE ESCALATION | MONKEY | ORAL GAVAGE | P1D | N |
| CV01 | CARDIOVASCULAR PHARMACOLOGY | LATIN SQUARE | DOG | ORAL | P1D | Y |
| FFU | REPEAT DOSE TOXICITY | N/A | MONKEY | INTRAVENOUS | ~P30D | N/A |
| Nimort-01 | N/A | PARALLEL | RAT | ORAL | P21D | Y |
| PDS2014 | REPEAT DOSE TOXICITY | PARALLEL | RAT | ORAL GAVAGE | P30D + P27D rec | Y |
| 35449 | REPEAT DOSE TOXICITY | PARALLEL | DOG | ORAL GAVAGE | P4W + P4W rec | Y |
| 43066 | REPEAT DOSE TOXICITY | PARALLEL | DOG | ORAL GAVAGE | P28D + P2W rec | N |
| 87497 | REPEAT DOSE TOXICITY | PARALLEL | RAT | ORAL GAVAGE | P28D + P4W rec | Y |
| 96298 | REPEAT DOSE TOXICITY | PARALLEL | RAT | ORAL GAVAGE | P1M + P44D rec | U |
| GLP003 | REPEAT DOSE TOXICITY | PARALLEL | RAT | ORAL GAVAGE | P29D + rec | Y |

### Per-Study Details

**Study1 — Single-arm, no fix possible without design changes**
- One vaccine group (4 female monkeys), no vehicle/placebo control
- Between-group statistics impossible. 133 findings all `severity=normal`
- Options: (a) support descriptive-only analysis, (b) accept empty results
- Missing vs PointCross: No MI, MA, OM, EG, FW, DD, PC, PP, TF

**Study2 — Works today**
- 2 dose groups (control + treatment), valid NOAEL
- 490 findings across 8 domains (BW, CL, FW, LB, MA, MI, OM, VS)
- Missing vs PointCross: No BG, EG, PC, PP, TF, DD
- Minor: No subject_syndromes.json or provenance_messages.json generated

**Study3 — Works but NOAEL is scientifically wrong (P0 BUG)**
- Two treatment groups (Vector A vs Vector B), no vehicle control
- TCNTRL=None for both arms. Generator calls Vector A "NOAEL" — incorrect
- Fix: detect TCNTRL absence → "No concurrent control — NOAEL not determinable"
- Only males, 3/group — should trigger SMALL_N caveat
- Missing vs PointCross: No BG, EG, FW, OM, VS, DD, PC, PP, TF

**Study4 — Works today, best non-PointCross study**
- 3 dose groups (control + 2 treatments), valid NOAEL
- 747 findings across 10 domains, has subject_syndromes.json
- Has IS domain (immunogenicity) — logged as "not yet supported"
- Missing vs PointCross: No DM(?), EG, PC, PP, DD, TF

**Study5 — NOW WORKS (design-adapter architecture, 2026-03-28)**
- 0-byte lb.xpt handled (P0 fix, Prov-011 warning). Latin square crossover now supported via CrossoverDesignAdapter.
- **18 findings across 3 domains (EG, VS, CL)**. QTCSAG (QTc) classified as `tr_adverse` with `monotonic_increase`, p_adj=0.006, effect_size=2.05. NOAEL=50 mg/kg, LOAEL=150 mg/kg.
- Carryover test: p=0.836 (no carryover detected — adequate washout). Friedman omnibus: p=0.014.
- Remaining gaps: CV domain not processed, domain filtering not implemented, EG-only UI profile missing.
- SSTYP = "CARDIOVASCULAR PHARMACOLOGY", SDESIGN = "LATIN SQUARE"

**CJUGSEND00 — NOW WORKS (design-adapter architecture, 2026-03-28)**
- Dose-escalation within-animal: all 4 monkeys in 1 arm (0→10→30→100 mg/kg). Now parsed via semicolon TRTDOS.
- **7 findings across 3 domains (EG, VS, CL)**. Escalation confound flagged in `_design_meta`. QRSAG detected as `tr_adverse`.
- Remaining gaps: CV domain not processed, RE domain not processed.
- SSTYP = "CARDIOVASCULAR PHARMACOLOGY", SDESIGN = "DOSE ESCALATION"

**CV01 (CDISC Safety Pharm POC) — Not yet run (no XPT files extracted)**
- 4 Beagle dogs (2M, 2F), 4-way crossover: vehicle, 0.15, 0.5, 1.5 mg/kg oral single dose per period
- Test article: "CDISC Drug X" — synthetic POC dataset from CDISC SEND Safety Pharmacology Subteam
- Has CV (3,328 rows), EG (4,160 rows), VS (832 rows) — comprehensive telemetry data
- No BW, LB, MI, MA, OM, CL, BG, FW, PC, PP, TF, DD — pure safety pharm profile
- CrossoverDesignAdapter would route correctly (semicolon TRTDOS). Needs XPT extraction to test.
- SEND IG 3.1 with define.xml. Only 4 of 10 planned subjects enrolled (POC dataset)

**FFU (FFU-Contribution-to-FDA) — Complete, multi-compound IV monkey study**
- 10 Cynomolgus monkeys (both sexes), 5 dose groups with 3 different compounds
- Doses: 0 mg/kg (histidine buffer vehicle), 12 mg/kg (Compound 1), 4 & 8 mg/kg (Compound 2), 6 mg/kg (Compound 3)
- **Results:** 584 findings, 172 adverse, 192 treatment-related. NOAEL=0 mg/kg (control). Males NOAEL not established (single-endpoint confidence penalty). Females LOAEL at G2 (12 mg/kg) for glucose, prothrombin time, heart weight
- 5 target organs flagged: hematologic, electrolyte, hepatic, metabolic, renal
- Multi-compound design: generator ran but treats all groups as single dose-response — scientifically questionable for groups with different compounds (SG-11)
- ADC PK data with multiple analytes (total, free MMAE, conjugated, ADC-associated)
- SEND 3.0 with define.xml

**Nimort-01 (Nimble) — Complete, F344 rat repeat-dose with anomalous mortality**
- 100 F344 rats (63F, 37M — unbalanced sex), 3 groups: placebo, 10, 20 mg/kg/day oral
- 21-day dosing with interim sacrifice at Day 14
- **Results:** Only 7 findings total (3 adverse, 4 warning), all treatment-related. NOAEL=0 mg/kg/day (control). LOAEL at treatment group for lymphoma (vagina), thymus atrophy, mortality
- **DATA QUALITY CONCERN:** 26 deaths total — 14 FOUND DEAD + 10 accidental at control vs 1+1 at treatment. Massive control mortality in F344 rats (known tumor-prone strain) dominates the dataset
- 2 target organs flagged: hematologic, general. Only 2 dose groups limits dose-response analysis.
- Different strain from PointCross/PDS (Fischer 344 vs Sprague-Dawley) — tests HCD coverage for non-SD rats
- SEND IG 3.0. Generator ran successfully but results dominated by background pathology.

**PDS2014 — Complete, comprehensive PointCross-like study**
- 124 SD rats (62M, 62F) with TK subsets, 4 groups: 0, 20, 200, 400 mg/kg/day oral gavage
- 30-day dosing + 27-day recovery (P57D total). Test article: PDS-FAKEDRUG-111 (synthetic)
- **Results:** 426 findings, 321 adverse, 289 treatment-related. NOAEL=0 mg/kg (vehicle). LOAEL at M-Low (20 mg/kg) for albumin, basophils, chloride, fibrinogen, globulin, lymphocytes, specific gravity, BWG, food consumption
- **NOTE:** Sex-stratified dose groups (M-Vehicle, F-Vehicle, M-Low, F-Low, etc.) — engine creates 8 dose groups instead of 4. Sex-discordant NOAEL: males 0 mg/kg, females 200 mg/kg
- 7 target organs flagged: neurological, hepatic, cardiovascular, hematologic, general, electrolyte, renal
- Has TF and DD — rare outside PointCross. Multi-LIMS integration. SEND 3.0, FDA-validated.

**35449 (TOXSCI — 1-month dog, Compound B / IDO1 inhibitor) — CRASHED**
- 32 Beagle dogs (16M, 16F), 4 groups: 0, 3, 18, 356 mg/kg/day oral gavage
- 4-week dosing + 4-week recovery (P57D). GLP, randomized, parallel.
- Domains: BG, BW, CL, EG, FW, LB, MA, MI, OM, PC, PP, VS + trial design (25 total)
- **Generator produced only `study_mortality.json`** — all other files missing. All dose_value fields parsed as null despite numeric labels. Needs investigation and regeneration.
- First non-crossover dog study — tests engine on canine species with standard parallel design
- Pharmacologic class: IDO1 inhibitor (Compound 6576, NCE)

**43066 (TOXSCI — 1-month dog, Compound A / IDO1 inhibitor) — Complete, first working dog study**
- 36 Beagle dogs (18M, 18F), 4 groups: 0, 25, 50, 100 mg/kg/day oral gavage
- 28-day dosing + 2-week recovery (P45D). Non-GLP, randomized, parallel.
- **Results:** 378 findings, 108 adverse, 96 treatment-related. NOAEL=0 mg/kg/day (combined). Sex-discordant: males 0 mg/kg/day (prostate weight effects at lowest dose), females 25 mg/kg/day. No deaths.
- 7 target organs flagged: renal, general, cardiovascular, hematologic, hepatic, reproductive, neurological
- First fully working non-crossover dog study. Pharmacologic class: IDO1 inhibitor (Compound 5492, NCE).

**87497 (TOXSCI — 1-month rat, Compound B / IDO1 inhibitor) — Complete, clean results**
- 160 SD rats (80M, 80F), 4 groups: 0, 25, 125, 1000 mg/kg/day oral gavage
- 28-day dosing + 4-week recovery (P57D). GLP, randomized, parallel.
- **Results:** 210 findings, 141 adverse, 129 treatment-related. NOAEL=0 mg/kg/day (reference item). LOAEL at 1000 mg/kg/day (high dose only) — no adverse effects at 25 or 125 mg/kg/day. No deaths.
- 4 target organs flagged: reproductive, neurological, general, cardiovascular
- NOTE: Dose group ordering in data is non-sequential (0, 1000, 25, 125). Engine handles this but worth verifying display order.
- Same compound as 35449 (Compound 6576) — enables cross-species comparison (rat vs dog, once 35449 is fixed).

**96298 (TOXSCI — 1-month rat, Compound A / IDO1 inhibitor) — Complete, 1 death**
- 110 SD rats (55M, 55F), 4 groups: 0, 50, 125, 250 mg/kg/day oral gavage
- 1-month dosing + 44-day recovery (P44D). GLP status unknown.
- **Results:** 266 findings, 172 adverse, 163 treatment-related. NOAEL=0 mg/kg/day. LOAEL at 50 mg/kg/day for cholesterol, food consumption, liver weight. 1 moribund sacrifice (female at 125 mg/kg/day, day 28). Mortality LOAEL=125 mg/kg/day.
- 4 target organs flagged: general, hematologic, hepatic, cardiovascular
- NOTE: Dose group labels concatenated without spaces (e.g., "Group 3125mg/kg/day" for 125 mg/kg/day) — display artifact.
- Same compound as 43066 for cross-species comparison (rat vs dog).

**GLP003 (instem) — Complete, dose group labeling issues**
- 241 SD rats (120M, 121F), 5 groups: 0 vehicle, 0 water (dual control), 60, 200, 600 mg/kg/day oral gavage
- 29-day dosing + 2-week recovery (P46D). FDA GLP. Test article: XYZ-12345 (synthetic).
- **Results:** 1661 findings, 719 adverse, 652 treatment-related. NOAEL not established (both sexes). 4 deaths (2 at control moribund sacrifice, 1 at dose -1, 1 at 200 mg/kg/day). Mortality LOAEL=200 mg/kg/day.
- **ISSUE:** Multiple dose groups labeled "Group ?" (levels 1-5) — unmapped dose metadata. Only negative control (0 mg/kg) and groups 6-8 (60, 200, 600 mg/kg) are properly labeled. This explains the very large adverse count and NOAEL not established.
- 6 target organs flagged: general, hematologic, hepatic, metabolic, renal, electrolyte
- Largest study in the collection (241 subjects). Has TF and DD. Dual control groups.
- SEND 3.0 with define.xml. **Needs dose group metadata investigation before results are trustworthy.**

---

## Domain Coverage Matrix

| Domain | PointCross | Study1 | Study2 | Study3 | Study4 | Study5 | CJUGSEND00 | CJ16050 |
|--------|-----------|--------|--------|--------|--------|--------|------------|---------|
| DM | Y | Y | Y | Y | pooldef | Y | Y | Y |
| TS/TA/TX/TE | Y | Y | Y | Y | Y | Y | Y | Y |
| BW | Y | Y | Y | Y | Y | Y | - | - |
| LB | Y | Y | Y | Y | Y | **0-byte** | - | - |
| MI | Y | - | Y | Y | Y | - | - | - |
| MA | Y | - | Y | Y | Y | - | - | - |
| OM | Y | - | Y | - | Y | - | - | - |
| CL | Y | Y | Y | Y | Y | Y | Y | Y |
| EG | Y | - | - | - | - | Y | Y | - |
| VS | Y | - | Y | - | Y | Y | Y | - |
| BG | Y | Y | - | - | Y | - | - | - |
| FW | Y | - | Y | - | Y | - | - | - |
| DS | Y | Y | Y | Y | Y | Y | Y | Y |
| IS | - | Y | - | Y | Y | - | - | - |
| PC/PP | Y | - | - | Y(PC) | - | Y(PC) | - | - |
| TF | Y | - | - | - | - | - | - | - |
| RE | - | - | - | - | - | - | Y | **Y** |
| CV | - | - | - | - | - | Y | Y | - |

### Domain Coverage Matrix — New Studies (2026-03-28)

| Domain | CV01 | FFU | Nimort-01 | PDS2014 | 35449 | 43066 | 87497 | 96298 | GLP003 |
|--------|------|-----|-----------|---------|-------|-------|-------|-------|--------|
| DM | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| TS/TA/TX/TE | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| BW | - | Y | Y | Y | Y | Y | Y | Y | Y |
| LB | - | Y | Y | Y | Y | Y | Y | Y | Y |
| MI | - | Y | Y | Y | Y | Y | Y | Y | Y |
| MA | - | Y | Y | Y | Y | Y | Y | Y | Y |
| OM | - | Y | Y | Y | Y | Y | Y | Y | Y |
| CL | - | Y | Y | Y | Y | Y | Y | Y | Y |
| EG | Y | - | - | - | Y | - | - | - | - |
| VS | Y | - | - | - | Y | Y | Y | - | - |
| BG | - | Y | Y | Y | Y | - | Y | Y | Y |
| FW | - | - | Y | Y | Y | - | Y | Y | Y |
| DS | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| IS | - | - | - | - | - | - | - | - | - |
| PC/PP | - | Y | - | Y | Y | Y | Y | Y | Y |
| TF | - | - | - | Y | - | - | - | - | Y |
| RE | - | - | - | - | - | - | - | - | - |
| CV | Y | - | - | - | - | - | - | - | - |
| DD | - | - | - | Y | - | - | - | Y | Y |
| SC | - | - | - | Y | - | - | - | - | - |
| POOLDEF | - | - | Y | Y | - | - | Y | Y | Y |

---

## Priority Implementation Order

| Priority | Work Item | Testable With | Effort | Status |
|---|---|---|---|---|
| P0 | Fix 0-byte XPT crash (Study5) | Study5 | 1 hour | **DONE** |
| P0 | Fix missing-control NOAEL (Study3) — detect TCNTRL absence | Study3 | 1 day | **DONE** |
| P0 | Fix TCNTRL "None" string truthy bug | Study3 | 30 min | **DONE** |
| P1 | Backend consumes StudyTypeConfig — wire available_domains, enabled_syndrome_groups, time_course | All studies | 1 week | |
| P1 | TS routing: add "CARDIOVASCULAR PHARMACOLOGY" to safety-pharm config | Study5, CJUGSEND00, CV01 | 1 hour | **DONE** (backend reads config, matches TS.STYPE) |
| P1 | Adversity classification — distinguish pharmacology-related from toxicity (SG-01) | Study2, Study4 | 2 weeks | |
| P1 | n < 5 per group caveat (SG-09) | Study1, Study3, CJUGSEND00, FFU, CJ16050 | 1 day | |
| P0 | Fix 35449 generator crash — dose_value null, only mortality file produced | 35449 | 1 day | |
| P0 | Fix GLP003 dose group labeling — levels 1-5 mapped as "Group ?", NOAEL not established | GLP003 | 1 day | |
| P1 | Dose label/value parsing robustness (SG-15) — concatenated labels in 96298, non-sequential ordering in 87497 | 96298, 87497, 35449, GLP003 | 1 week | |
| P1 | Multi-compound study handling — FFU has 3 test articles in one study (SG-11) | FFU | 1 week | |
| P1 | Dual control group handling — GLP003 has vehicle + water controls (SG-12) | GLP003 | 1 day | |
| P2 | Within-animal crossover/escalation statistics engine (SG-04) | Study5, CJUGSEND00, CV01 | 2-3 weeks | **DONE** (design-adapter architecture) |
| P2 | Dose-escalation dose group detection — parse semicolon-delimited TX.TRTDOS (SG-10) | CJUGSEND00 | 1 week | **DONE** (treatment_periods.py) |
| P2 | CV domain processing (SG-05) | Study5, CJUGSEND00, CV01 | 1 week | |
| P2 | Per-occasion baseline for crossover studies (SG-07) | Study5, CJUGSEND00, CV01 | 1 week | **DONE** (per_occasion_baseline.py) |
| P2 | Non-SD rat HCD coverage — F344 strain baseline data (SG-13) | Nimort-01 | 1 week | |
| P2 | Cross-study comparison support — same compound across species (SG-14) | TOXSCI set (35449/87497, 43066/96298) | 2 weeks | |
| P3 | RE domain processing (SG-06) | CJUGSEND00, CJ16050 | 1 week | |
| P3 | Import CJ16050 study data | CJ16050 | trivial | **DONE** (as CJ16050-xptonly) |
| P3 | Non-monotonic dose-response handling (SG-08) | CJ16050 | 1 week | |
| P3 | Safety pharm UI profile (EG/CV-focused views) | Study5, CJUGSEND00 | 2 weeks | |
| P3 | Acute/DRF study type support (time_course=false, Tmax advisory) | Study3 | 1 week | |
| P4 | IS domain support (SG-02) | Study1, Study3, Study4 | 2 weeks | |

---

## Generator Pipeline Architecture Notes

- DM is the only truly REQUIRED domain (KeyError if missing)
- All other domains return `[]` if XPT missing — graceful degradation
- 0-byte XPT files excluded during discovery (P0 fix) with Prov-011 warning
- **Design adapter pattern (2026-03-28):** `select_adapter(study)` routes by semicolon TRTDOS (Priority 1) or `study_type_config.statistical_mode` via TS.STYPE (Priority 2). `ParallelDesignAdapter` wraps existing pipeline; `CrossoverDesignAdapter` uses within-subject statistics (paired t-test, Page's trend, Cohen's d_z, Friedman omnibus, McNemar's for CL)
- Recovery detection: automatic from TX/DM (ARMCD+R convention)
- Terminal domains (MI, MA, OM, TF, DS): dual-pass if early deaths exist
- In-life domains (BW, LB, CL, EG, VS, BG, FW): recovery-aware filtering via last_dosing_day
- IS domain: explicitly unsupported, provenance warning logged
- No upfront validation of domain presence vs study type expectations

---

## Part 2: SME Reference Data (from Submission Reports)

Source: Study reports, nSDRGs, and define.xml files in `C:/pg/pcc-studies2import/`.

### Study1 — Covance 8326556: Hepatitis B Vaccine T-Cell Dependent Antibody Response in Cynomolgus Monkeys

| Field | Report Value |
|---|---|
| **Study Number** | 8326556 |
| **Type** | Immunogenicity characterization (TS says "REPEAT DOSE TOXICITY" but functionally NOT a tox study) |
| **GLP** | No |
| **Species/Strain** | Cynomolgus monkey |
| **Sex** | Female only (n=4) |
| **Dose groups** | Single group: 20 ug/dose HBsAg (IM), no control |
| **Dosing** | Day 1 + Day 29 (2 doses total) |
| **Duration** | 57 days (P57D) |
| **Terminal sacrifice** | None — all 4 animals returned to stock colony alive |
| **Domains collected** | BW, BG, CL, IS, LB (heme, chem, coag, UA), DS, CO |
| **Domains NOT collected** | MI, MA, OM, FW (qualitative only), EG, TK, RE, CV, DD |
| **NOAEL (report)** | Not formally determined. Report says vaccine was "well tolerated" |
| **LOAEL** | Not determined — no adverse effects |
| **Target organs** | None |
| **Key findings** | All endpoints normal. Robust IgG/IgM response in 3/4 animals (IS domain). One low-responder (I10809). |
| **Clinical path** | All hematology, chemistry, coagulation, urinalysis within normal limits |
| **Mortality** | 0 deaths |

### Study2 — 456a Vaccine Repeated Dose in New Zealand White Rabbits

| Field | Report Value |
|---|---|
| **Study Number** | ZYX-CBA001 / CBER-POC |
| **Type** | Repeat-dose toxicity + local tolerance |
| **GLP** | Yes (OECD) |
| **Species/Strain** | NZW Rabbit |
| **Sex** | Both (5M+5F main, 5M+5F recovery per group) |
| **Dose groups** | G1: Saline control (0 vp), G2: 456a 1x10^11 VP |
| **Dosing** | Days 1, 15, 29 (IM, 3 doses) |
| **Duration** | 30 days dosing + 21 days recovery |
| **Sacrifice** | Day 31 (main), Day 52 (recovery) |
| **NOAEL (report)** | **1x10^11 VP (the only dose tested = NOAEL)** — all findings non-adverse, pharmacology-related |
| **LOAEL** | None — no adverse effects at the single dose |
| **Target organs** | Injection sites, spleen, iliac lymph node (all immune-mediated, non-adverse) |
| **Key histopath** | Spleen: germinal centre cellularity 10/10 treated at Day 31. Iliac LN: germinal centre + generalised cellularity 10/10. Injection sites: mononuclear infiltration 7/10, necrosis 4/10, mixed inflammation 5/10 at Day 29 site |
| **Key clinical path** | CRP: 34-66x elevation at 24h post-dose (acute phase). Fibrinogen: 1.65-2x at Day 3. Globulin: 1.2-1.3x increased. Monocytes: 3x at Day 3 |
| **Organ weights** | Iliac LN: 7.8-10.4x at Day 31 (p<0.05). Spleen: 1.0-1.4x |
| **Recovery** | Partial (injection sites cleared; spleen/LN lymphoid hyperplasia reduced but present) |
| **Mortality** | 0 deaths |

### Study3 — VECTORSTUDYU1: AAV Gene Therapy in Cynomolgus Monkeys

| Field | Report Value |
|---|---|
| **Study Number** | VECTORSTUDYU1 |
| **Type** | Single-dose toxicity (24 weeks) |
| **GLP** | No (GLP-commensurate procedures) |
| **Species/Strain** | Cynomolgus monkey (Chinese origin) |
| **Sex** | Males only (n=3 per group) |
| **Dose groups** | G1: Vector A 1.024x10^13 GC/kg, G5: Vector B 1.024x10^13 GC/kg — **NO vehicle control** |
| **Dosing** | Single IV bolus, Day 1 |
| **Duration** | 24 weeks (terminal sacrifice Day 169) |
| **NOAEL (report)** | **Not formally declared.** Report says "no adverse test article-related findings; tolerated" |
| **LOAEL** | Not determined |
| **Target organs** | Cecum/colon (mononuclear infiltration, minimal — test article-related per pathologist). Kidney (basophilic tubule in 1 Vector B animal, mononuclear infiltration in 4/6) |
| **Key histopath** | Liver vacuolation in 6/6 — background. Colon mononuclear infiltrate 5/6 — test article-related. Kidney mononuclear infiltrate 4/6 — test article-related |
| **Key clinical path** | No treatment-related changes in hematology, chemistry, or coagulation |
| **Mortality** | 0 deaths |

### Study4 — RABBITV1: Adjuvanted Influenza Vaccine in Rabbits

| Field | Report Value |
|---|---|
| **Study Number** | RABBITV1 |
| **Type** | Repeat-dose toxicity |
| **GLP** | Yes (OECD) |
| **Species/Strain** | NZW Rabbit (SPF) |
| **Sex** | Both (5M+5F main, 5M+5F recovery per group = 60 total) |
| **Dose groups** | G1: NaCl control, G2: SENDVACC10 (15 ug HA, 12.5 mg adj), G3: SENDVACC99 (45 ug HA, 12.5 mg adj) |
| **Dosing** | Days 1, 15, 29 (IM, 3 injection sites) |
| **Duration** | 37 days dosing + 4 weeks recovery |
| **Sacrifice** | Day 31 (main), Day 57 (recovery) |
| **NOAEL (report)** | **Not formally stated** — vaccine study, all findings classified non-adverse (pharmacology-related). Report says "locally and systemically well tolerated" |
| **LOAEL** | None — no adverse effects |
| **Target organs** | Injection sites (subacute inflammation), spleen (lymphoid hyperplasia + weight increase), draining LN (inguinal/iliac — lymphoid hyperplasia), abdominal adipose (edema/hemorrhage, females only — gravity extension from injection site) |
| **Key histopath** | Spleen hyperplasia: SENDVACC10 3-5/5, SENDVACC99 3-5/5. LN hyperplasia: 100% treated at Day 31. Injection site inflammation: 4-5/5 treated vs 0-2/5 control |
| **Key clinical path** | CRP: 338-729% increase at Day 3 and Day 31 (p<0.01). Fibrinogen: 1.5-2x at Day 3 (p<0.01). A/G ratio: decreased (p<0.01). LUC (large unstained cells): increased both sexes (p<0.01). Cholesterol: slightly lower in treated |
| **Organ weights** | Spleen: SENDVACC10 +47-63% (p<0.01 females). Recovery: partial (M) to complete (F) |
| **Recovery** | Partial for lymphoid hyperplasia and injection sites; complete for adipose tissue |
| **Mortality** | 0 deaths |
| **BW** | Transient minimal loss after doses 1-2 (SENDVACC99 females -18g, males -60g after dose 2 vs controls). Non-adverse |
| **Food consumption** | Minimally reduced around dosing days (p<0.05 to p<0.01). Transient |

### Study5 — 3-1-PILOT: Cardiovascular Safety of Drug-X in Beagle Dogs

| Field | Report Value |
|---|---|
| **Study Number** | 3-1-PILOT / Sponsor 12345 |
| **Type** | Cardiovascular safety pharmacology |
| **GLP** | Yes |
| **Species/Strain** | Beagle dog |
| **Sex** | Males only (n=6) |
| **Design** | **Latin square crossover** — all 6 dogs receive all 4 treatments |
| **Dose levels** | Vehicle (0), 20, 50, 150 mg/kg (oral gavage, single dose per period) |
| **Dosing days** | Days 1, 11, 22, 36 (with washout between periods) |
| **Duration** | 36 days (P36D) |
| **Sacrifice** | None — all 6 dogs returned to stock alive |
| **NOAEL (report)** | **Not explicitly stated.** Based on QTc data: likely 20 mg/kg |
| **Primary CV finding** | **QTc prolongation (dose-dependent):** Vehicle ~+5 msec, 20 mg/kg ~+8 msec, 50 mg/kg ~+15 msec, **150 mg/kg ~+44 msec** peak at 5-6h postdose. This is a major safety signal (>30 msec = concern threshold) |
| **Secondary CV finding** | Blood pressure decrease at 150 mg/kg: sustained ~25 mmHg reduction in SBP through 17h postdose |
| **QTc correction** | Modified Spence (nonstandard: QTCSAG, sponsor-defined) |
| **Clinical signs** | Emesis at 50 and 150 mg/kg. Soft feces at 150 mg/kg |
| **PK (6h postdose)** | Vehicle BLQ; 20 mg/kg ~31 ug/mL; 50 mg/kg ~113 ug/mL; 150 mg/kg ~392 ug/mL |
| **LB domain** | **0-byte XPT** — data not available in SEND dataset (was planned per define.xml) |
| **Mortality** | 0 deaths |

### CJUGSEND00 — Compound A CV Safety in Conscious Monkeys

| Field | Report Value |
|---|---|
| **Study Number** | CJUGSEND00 |
| **Type** | Cardiovascular safety pharmacology |
| **GLP** | No |
| **Species/Strain** | Cynomolgus monkey |
| **Sex** | Males only (n=4) |
| **Design** | **Within-subject dose escalation** — all 4 monkeys get all doses sequentially |
| **Dose levels** | 0 (vehicle), 10, 30, 100 mg/kg oral gavage (single dose per occasion) |
| **Dosing days** | Days 1, 8, 15, 22 (6-day washout between doses) |
| **Duration** | 22 days dosing, animals removed Day 23 |
| **Sacrifice** | None — all returned to colony alive |
| **Endpoints** | BP (systolic, diastolic, MAP), HR, ECG (PR, QRS, QT, QTcB, RR), respiratory rate, body temperature |
| **QTc correction** | Bazett (QTcB) — no Fridericia |
| **Telemetry** | Implanted telemetry (intravascular BP, ambulatory ECG) |
| **Baseline** | Per-dose-occasion derived baseline (mean of 2 pre-dose readings) |
| **Clinical signs** | Hindleg paralysis noted in one comment. Vomitus in another. Qualitative food consumption tracked |
| **NOAEL** | Not formally stated (safety pharm study, not tox study) |
| **Mortality** | 0 deaths |

### CJ16050 — Compound A Respiratory Function in Rats (imported as CJ16050-xptonly)

| Field | Report Value |
|---|---|
| **Study Number** | CJ16050 |
| **Type** | Respiratory safety pharmacology |
| **GLP** | No |
| **Species/Strain** | Sprague-Dawley rat (Crl:CD(SD)) |
| **Sex** | Males only (n=6 per group) |
| **Design** | Parallel (3 groups), single dose |
| **Dose groups** | G00: Vehicle control, G01: 100 mg/kg, G02: 1000 mg/kg (oral gavage) |
| **Dosing** | Single dose, animals sacrificed same day after 8h measurement |
| **Duration** | 1 day |
| **Domains** | TS, TE, TA, TX, DM, SE, EX, DS, CL, RE (respiratory). **No BW, LB, OM, MA, MI** |
| **Method** | Whole body unrestrained plethysmography |
| **Endpoints** | Respiratory rate, tidal volume, minute volume (derived = TV x RR) |
| **Key findings — 100 mg/kg** | **Stimulatory:** RR +108% at 1h (p<0.05), MV +100% at 1h (p<0.05). TV unchanged. Sustained through 8h |
| **Key findings — 1000 mg/kg** | **Suppressive:** TV -26% at 1h (p<0.05), MV -27% at 2h (p<0.05). RR -4.5% at 2h (p<0.05). Clinical signs: decreased activity + scrotum relaxation in 6/6 (CNS depression) |
| **Dose-response** | **Non-monotonic/bidirectional** — low dose stimulates, high dose suppresses. NOT a simple linear dose-response |
| **NOAEL** | Not stated (safety pharm study). Both doses produced significant respiratory effects |
| **Statistical method** | Parametric Dunnett's test, two-sided, p<0.05 |
| **Missing data** | Animal 01M02 (100 mg/kg): RE data NOT DONE at 2h (unstable behavioral condition) |
| **Mortality** | 0 deaths |
| **XPT location** | `send/CJ16050-xptonly/` — 10 XPT files (ts, te, ta, tx, dm, se, ex, ds, cl, re) |
| **Generator status** | Runs, but only produces 2 CL findings (RE domain not processed) |

### PointCross — PC201708: 13-Week Repeat-Dose Toxicity of PCDRUG in Rats

**Note:** This is a **synthetic dataset** created by PointCross Inc. The nSDRG section 6.2 explicitly documents which signals were artificially injected. This makes it an ideal ground-truth test case — we know exactly what the engine should find.

| Field | nSDRG Value |
|---|---|
| **Study Number** | PC201708 |
| **Type** | Repeat-dose toxicity (13-week) |
| **GLP** | Yes (FDA) |
| **Species/Strain** | Sprague-Dawley rat |
| **Sex** | Both (M+F) |
| **Dose groups** | G1: Vehicle (0 mg/kg), G2: 2 mg/kg, G3: 20 mg/kg, G4: 200 mg/kg (oral gavage, daily) |
| **N per group** | 10M+10F main, 5M+5F recovery, 5M+5F TK per treatment group. Control: 10M+10F main, 5M+5F recovery, no TK. Total: 150 |
| **Duration** | 13 weeks dosing + 2 weeks recovery |
| **Sacrifice** | Week 13 (main), Week 15 (recovery) |
| **Domains** | 28 XPT files: DS, BG, BW, CL, DD, EG, FW, LB, MA, MI, OM, PC, PM, PP, SC, TF, VS, EX, RELREC, CO, DM, SE, TA, TE, TS, TX, SUPPMA, SUPPMI |

**Engineered signals (from nSDRG Section 6.2):**

| Signal | Groups Affected | Domain |
|---|---|---|
| Body weight decreased | Groups 3, 4 | BW |
| Body weight gain decreased | Groups 3, 4 | BG |
| AST increased | Group 4 | LB |
| ALT increased | Group 4 | LB |
| ALP increased | Group 4 | LB |
| RBC decreased | Group 4 | LB |
| HGB decreased | Group 4 | LB |
| HCT decreased | Group 4 | LB |
| Liver weights increased | Group 4 | OM |
| Liver macroscopic findings | Groups 3, 4 | MA |
| Liver microscopic findings | Groups 3, 4 | MI |
| Liver tumors | Group 4 | TF |
| Premature deaths (hepatocellular carcinoma) | Group 4 | DD |

**Expected interpretation:** Classic hepatotoxicity pattern — liver enzyme elevations, liver weight increase, histopath correlates (hypertrophy, neoplasia), with secondary hematological effects (anemia) and body weight decreases. NOAEL should be at the control dose (Group 1) since Group 2 (2 mg/kg) may show early signals depending on how the data was synthesized.

### CV01 — CDISC Drug X: Cardiovascular Safety in Telemetered Dogs (POC Dataset)

| Field | Value |
|---|---|
| **Study Number** | CV01 |
| **Type** | Cardiovascular safety pharmacology |
| **GLP** | Yes |
| **Species/Strain** | Beagle dog |
| **Sex** | Both (2M+2F) — 4 of 10 planned subjects enrolled |
| **Dose groups** | 4-way Latin square crossover: 0 (vehicle), 0.15, 0.5, 1.5 mg/kg oral, single dose per period |
| **Vehicle** | Ethanol/PEG400 (10/90 v/v) |
| **Design** | Latin square — each animal receives all 4 doses across 4 periods (7-day washout) |
| **Duration** | ~3 weeks (4 periods: Days 1, 11, 22, 36) |
| **Domains** | CV (3,328 rows), EG (4,160 rows), VS (832 rows), DM, DS, EX, SE, TS, TA, TE, TX |
| **Domains NOT collected** | BW, LB, MI, MA, OM, CL, BG, FW, PC, PP, TF, DD |
| **Mortality** | 0 deaths — all returned to stock |
| **Source** | CDISC SEND Safety Pharmacology Subteam POC (synthetic). SEND IG 3.1 |
| **Key note** | No study report available — POC dataset for FDA reviewer tool testing |

### FFU — Multi-Compound IV Toxicity in Cynomolgus Monkeys

| Field | Value |
|---|---|
| **Study Number** | FFU (FFU-Contribution-to-FDA) |
| **Type** | Repeat-dose IV toxicity |
| **GLP** | Not stated |
| **Species/Strain** | Cynomolgus monkey |
| **Sex** | Both (mixed M+F) |
| **Dose groups** | 5 groups: 0 mg/kg (histidine buffer vehicle), 12 mg/kg (Compound 1), 4 mg/kg (Compound 2), 8 mg/kg (Compound 2), 6 mg/kg (Compound 3) |
| **N per group** | 2 animals per group (10 total) |
| **Route** | Intravenous |
| **Duration** | ~30 days |
| **Domains** | BW, BG, CL, CO, LB, MA, MI, OM, PC, PP, SE, DS, DM, EX, TA, TE, TS, TX + 5 SUPP domains (25 total) |
| **Domains NOT collected** | EG, VS, FW, TF, DD, RE, CV |
| **Key note** | Multi-compound design (3 different test articles). ADC PK data with multiple analytes (total, free MMAE, conjugated). SEND 3.0. No study report available. |
| **Mortality** | Not documented in metadata |

### Nimort-01 — 3-Week Oral Toxicity in Fischer 344 Rats (Nimble)

| Field | Value |
|---|---|
| **Study Number** | Nimort-01 |
| **Type** | 3-week repeat-dose oral toxicity |
| **GLP** | Yes (FDA & OECD) |
| **Species/Strain** | Fischer 344 rat (non-diabetic obese) |
| **Sex** | Both — 63F, 37M (unbalanced) |
| **Dose groups** | 3 groups: 0 (saline placebo), 10, 20 mg/kg/day oral |
| **N per group** | ~33 animals (100 total across 3 groups) |
| **Duration** | 21 days with interim sacrifice at Day 14 |
| **Domains** | BW, BG, CL, FW, LB, MA, MI, OM, DM, DS, EX, SUPPEX, CO, POOLDEF, TS, TA, TE, TX (18 XPT) |
| **Domains NOT collected** | EG, VS, PC, PP, DD, TF, RE, CV |
| **Mortality** | Not documented in metadata |
| **Key note** | F344 strain (not SD) — tests HCD coverage for non-standard rat strain. Unbalanced sex ratio. SEND 3.0 with define.xml + reviewers guide. |

### PDS2014 — 1-Month Oral Toxicity with Recovery in SD Rats (PDS)

| Field | Value |
|---|---|
| **Study Number** | PDS2014 |
| **Type** | 1-month repeat-dose oral toxicity + recovery |
| **GLP** | Yes (FDA & OECD) |
| **Species/Strain** | Sprague-Dawley rat |
| **Sex** | Both (62M+62F) |
| **Dose groups** | 4 groups: 0 (methocell vehicle), 20, 200, 400 mg/kg/day oral gavage |
| **N per group** | ~31 (124 total, includes TK subsets) |
| **Duration** | 30 days dosing + 27 days recovery (P57D total) |
| **Test article** | PDS-FAKEDRUG-111 (synthetic) |
| **Supplier** | Charles River Laboratories |
| **Domains** | BW, BG, CL, FW, LB, MA, MI, OM, PC, PP, SC, DD, TF, DS, SE, DM, EX, CO, POOLDEF, RELREC, TS, TA, TE, TX + SUPP domains (25+ total) |
| **Key note** | Most comprehensive non-PointCross dataset. Has TF+DD (rare). Multi-LIMS source (PathData, Watson). FDA-validated SEND 3.0. |
| **Mortality** | Not documented in metadata |

### TOXSCI Studies — IDO1 Inhibitor Cross-Study Analysis (4 studies)

**Source:** TOXSCI-24-0062 publication dataset. Two compounds (5492/6576, both IDO1 inhibitors) tested in two species (rat/dog). No study reports available — data only.

#### 35449 — 1-Month Oral Toxicity in Beagle Dogs (Compound B / 6576)

| Field | Value |
|---|---|
| **Study Number** | 35449 |
| **Type** | 1-month repeat-dose oral toxicity |
| **GLP** | Yes |
| **Species/Strain** | Beagle dog |
| **Sex** | Both (16M+16F) |
| **Dose groups** | 4 groups: 0, 3, 18, 356 mg/kg/day oral gavage |
| **Duration** | 4 weeks dosing + 4 weeks recovery (P57D) |
| **Pharmacologic class** | IDO1 inhibitor (Compound 6576, NCE) |
| **Domains** | BG, BW, CL, EG, FW, LB, MA, MI, OM, PC, PP, VS + trial design (25 total) |

#### 43066 — 1-Month Oral Toxicity in Beagle Dogs (Compound A / 5492)

| Field | Value |
|---|---|
| **Study Number** | 43066 |
| **Type** | 1-month repeat-dose oral toxicity |
| **GLP** | No |
| **Species/Strain** | Beagle dog |
| **Sex** | Both (18M+18F) |
| **Dose groups** | 4 groups: 0, 25, 50, 100 mg/kg/day oral gavage |
| **Duration** | 28 days dosing + 2 weeks recovery (P45D) |
| **Pharmacologic class** | IDO1 inhibitor (Compound 5492, NCE) |
| **Domains** | BW, CL, LB, MA, MI, OM, PC, PP, VS + trial design (21 total). No BG, EG, FW |

#### 87497 — 1-Month Oral Toxicity in SD Rats (Compound B / 6576)

| Field | Value |
|---|---|
| **Study Number** | 87497 |
| **Type** | 1-month repeat-dose oral toxicity |
| **GLP** | Yes |
| **Species/Strain** | Sprague-Dawley rat |
| **Sex** | Both (80M+80F) |
| **Dose groups** | 4 groups: 0, 25, 125, 1000 mg/kg/day oral gavage |
| **Duration** | 28 days dosing + 4 weeks recovery (P57D) |
| **Pharmacologic class** | IDO1 inhibitor (Compound 6576, NCE) |
| **Domains** | BG, BW, CL, FW, LB, MA, MI, OM, PC, PP, VS, POOLDEF + trial design (26 total) |

#### 96298 — 1-Month Oral Toxicity in SD Rats (Compound A / 5492)

| Field | Value |
|---|---|
| **Study Number** | 96298 |
| **Type** | 1-month repeat-dose oral toxicity |
| **GLP** | Unknown |
| **Species/Strain** | Sprague-Dawley rat |
| **Sex** | Both (55M+55F) |
| **Dose groups** | 4 groups: 0, 50, 125, 250 mg/kg/day oral gavage |
| **Duration** | 1 month dosing + 44 days recovery (P44D) |
| **Pharmacologic class** | IDO1 inhibitor (Compound 5492, NCE) |
| **Domains** | BG, BW, CL, DD, FW, LB, MA, MI, OM, PC, PP, POOLDEF + trial design (25 total). Has DD domain. |

### GLP003 — 1-Month Oral Toxicity with Recovery in SD Rats (instem)

| Field | Value |
|---|---|
| **Study Number** | GLP003 (XYZ-12345) |
| **Type** | 1-month repeat-dose oral toxicity + 2-week recovery |
| **GLP** | Yes (FDA) |
| **Species/Strain** | Sprague-Dawley rat |
| **Sex** | Both (120M+121F) |
| **Dose groups** | 5 groups: 0 vehicle (saline), 0 water (negative control), 60, 200, 600 mg/kg/day oral gavage |
| **N per group** | ~38-40 main + ~10 recovery per group (241 total) |
| **Duration** | 29 days dosing + 2 weeks recovery (P46D) |
| **Test article** | XYZ-12345 (synthetic) |
| **Domains** | BW, BG, CL, FW, LB, MA, MI, OM, PC, PP, DD, TF, DS, SE, DM, EX, CO, POOLDEF, RELREC, TS, TA, TE, TX + SUPP domains (25 total) |
| **Key note** | Largest study (241 subjects). Dual control groups (vehicle + water). Has TF+DD. Multi-format (XPT + XLSX). SEND 3.0 with define.xml. |
| **Mortality** | DD domain present (1 record) |

---

## Part 3: Automated (SENDEX) vs SME (Report) Comparison

This section compares what the SENDEX generator currently produces against the reference conclusions from the submission reports. Each discrepancy is a testable gap.

### Legend

- **MATCH**: SENDEX output agrees with report
- **PARTIAL**: SENDEX captures some but not all findings
- **WRONG**: SENDEX produces scientifically incorrect output
- **MISSING**: SENDEX cannot assess this (missing capability or data)
- **N/A**: Not applicable to study type

---

### Study1 — Hepatitis B Vaccine (Covance 8326556)

| Dimension | Report (SME) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study type classification** | Immunogenicity characterization | Falls back to REPEAT_DOSE | **WRONG** — functionally not a tox study |
| **NOAEL** | Not determined (not a tox study) | "Not established" (method: not_established) | **MATCH** — correct output, though reasoning differs |
| **Target organs** | None | None identified | **MATCH** |
| **Adverse findings** | None | 0 adverse, 0 treatment-related | **MATCH** |
| **Clinical path assessment** | All within normal limits | 133 findings, all severity=normal | **MATCH** |
| **Control group detection** | No control (single-arm) | `has_concurrent_control: false` | **MATCH** (after P0 fix) |
| **Statistical analysis** | Not possible (n=4, no control) | No statistics computed | **MATCH** |
| **IS domain (immunogenicity)** | Primary endpoint: IgG/IgM responses | Logged as "not yet supported" | **MISSING** — IS domain not analyzed |
| **Recovery assessment** | N/A (no recovery period) | No recovery verdicts generated | **MATCH** |

**Gap count: 2** (study type misclassification, IS domain unsupported)

---

### Study2 — 456a Vaccine (NZW Rabbits)

| Dimension | Report (SME) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study type classification** | Repeat-dose toxicity + local tolerance | Falls back to REPEAT_DOSE (correct) | **MATCH** |
| **NOAEL** | 1x10^11 VP (only dose = NOAEL, all findings non-adverse) | Control group (dose_level 0) = NOAEL | **PARTIAL** — SENDEX calls control the NOAEL because it found adverse findings at the treatment dose. Report says treatment dose IS the NOAEL because findings are non-adverse (pharmacology). Fundamental disagreement on adversity classification |
| **Target organs (report)** | Injection sites, spleen, iliac LN (all non-adverse) | Need to check generated target_organ_summary | **CHECK** |
| **CRP elevation** | 34-66x at 24h (major acute phase signal) | CRP may not be in standard biomarker catalog — check if detected | **CHECK** |
| **Fibrinogen elevation** | 1.65-2x (p<0.001) | Should appear in LB coagulation findings | **CHECK** |
| **Monocyte increase** | 3x at Day 3 (M+F) | Should appear in LB hematology findings | **CHECK** |
| **Globulin increase** | 1.2-1.3x (A/G ratio decreased) | Should appear in LB chemistry findings | **CHECK** |
| **Spleen lymphoid hyperplasia** | 10/10 treated at Day 31 (100% incidence) | Should appear in MI findings | **CHECK** |
| **Iliac LN enlargement** | 7.8-10.4x weight increase (p<0.05) | Should appear in OM findings | **CHECK** |
| **Recovery assessment** | Partial — injection sites cleared, lymphoid still present | Recovery verdicts should show mixed reversibility | **CHECK** |
| **Injection site findings** | Mononuclear infiltration 7/10, necrosis 4/10, inflammation 5/10 | MI domain should capture these | **CHECK** |
| **Adversity classification** | ALL findings non-adverse (pharmacology of vaccine) | Engine likely classifies as adverse (statistically significant, dose-related) | **WRONG** — engine cannot distinguish pharmacology-related from toxicity-related |
| **IS domain** | Immunology data present (not in SEND scope) | Not analyzed | **MISSING** |

**Gap count: 2 definite** (adversity misclassification, IS unsupported) + **8 items to verify** against generated data

---

### Study3 — AAV Gene Therapy (Cynomolgus Monkeys)

| Dimension | Report (SME) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study type classification** | Single-dose toxicity (24 weeks) | Falls back to REPEAT_DOSE | **WRONG** — should be ACUTE or SINGLE_DOSE |
| **NOAEL** | Not formally declared (no adverse findings, no control) | "Not established" (method: no_concurrent_control) | **MATCH** (after P0 fix) |
| **Control group** | No vehicle control (Vector A vs Vector B at same dose) | `has_concurrent_control: false` | **MATCH** (after P0 fix) |
| **Target organs (report)** | Colon (mononuclear infiltrate 5/6), kidney (mononuclear infiltrate 4/6, basophilic tubule 1/6) — test article-related per pathologist | Engine comparing Vector A vs B without control — findings may not be flagged correctly | **PARTIAL** — engine found 44 adverse findings but without a control these are Group-0-vs-Group-1 comparisons, not treatment-vs-control |
| **Background findings** | Liver vacuolation 6/6 (NOT test article-related per pathologist) | Engine may flag this as adverse (100% incidence, but present in "both groups") | **CHECK** — depends on how engine handles equal-incidence findings |
| **Clinical path** | No treatment-related changes | 593 findings generated, need to verify how many flagged as significant | **CHECK** |
| **Small N** | Only 3 per group | No SMALL_N caveat generated | **MISSING** — n-threshold caveat not implemented |
| **Males only** | Males only (no sex comparison) | F and Combined rows show "Not established" | **MATCH** (structural) |
| **IS domain** | Custom domain (NAb titers, protein expression) | Not analyzed | **MISSING** |
| **PC domain** | Biodistribution data (DNA/RNA copies) | Not analyzed as standard PK | **CHECK** |

**Gap count: 3 definite** (study type, small-N caveat, IS unsupported) + **3 items to verify**

---

### Study4 — Adjuvanted Influenza Vaccine (NZW Rabbits)

| Dimension | Report (SME) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study type classification** | Repeat-dose toxicity | Falls back to REPEAT_DOSE | **MATCH** |
| **NOAEL** | Not formally stated (vaccine study — all findings non-adverse) | Control (dose_level 0) = NOAEL, with LOAEL at SENDVACC10 | **WRONG** — same adversity classification issue as Study2. Engine sees statistical significance and calls findings adverse; report says all are pharmacology-related |
| **Target organs (report)** | Spleen, draining LN, injection sites, abdominal adipose (F only) | 747 findings, 113 adverse, 70 treatment-related. Target organ summary has 14 organs | **PARTIAL** — engine identifies target organs but likely over-classifies. Report has 4 target tissues, engine has 14 |
| **CRP elevation** | 338-729% (p<0.01) | Should be detected in LB | **CHECK** |
| **Fibrinogen** | 1.5-2x (p<0.01) | Should be in LB | **CHECK** |
| **A/G ratio decrease** | p<0.01 both treatments | Should be in LB | **CHECK** |
| **LUC increase** | Both sexes, p<0.01 | Should be in LB hematology | **CHECK** |
| **Spleen weight** | +47-63% SENDVACC10 (p<0.01 F) | Should appear in OM | **CHECK** |
| **Spleen hyperplasia** | 3-5/5 both treatments | Should appear in MI | **CHECK** |
| **LN hyperplasia** | 100% treated at Day 31 | Should appear in MI | **CHECK** |
| **Injection site inflammation** | 4-5/5 treated vs 0-2/5 control | Should appear in MI | **CHECK** |
| **Body weight** | Transient loss after doses 1-2 (non-adverse) | Should be in BW findings | **CHECK** |
| **Food consumption** | Minimally reduced (p<0.05 to p<0.01, transient) | Should be in FW findings | **CHECK** |
| **Recovery** | Partial lymphoid, complete adipose | Recovery verdicts should be generated | **CHECK** |
| **IS domain** | Immunogenicity data (H1-specific IgG) | Not analyzed | **MISSING** |

**Gap count: 2 definite** (NOAEL adversity, IS unsupported) + **10 items to verify**

---

### Study5 — Cardiovascular Safety Pharmacology (Beagle Dogs) — UPDATED 2026-03-28

| Dimension | Report (SME) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study type classification** | CV safety pharmacology, Latin square crossover | Routed to `within_animal_crossover` via semicolon TRTDOS | **MATCH** |
| **Study design recognition** | Latin square — each animal is own control | CrossoverDesignAdapter: per-occasion baselines, within-subject CFB, paired stats | **MATCH** |
| **NOAEL** | ~20 mg/kg (inferred from QTc data) | 50 mg/kg (LOAEL at 150 mg/kg, QTc p_adj=0.006). Pairwise at 50 mg/kg: p_adj=0.07, not significant | **PARTIAL** — SENDEX NOAEL=50 is defensible statistically (50 mg/kg not significant). Report suggests 20 mg/kg based on magnitude (+15 msec at 50 mg/kg). Difference is threshold interpretation, not a bug |
| **QTc prolongation** | 150 mg/kg: **+44 msec** peak at 5-6h (MAJOR finding). 50 mg/kg: +15 msec. 20 mg/kg: +8 msec | QTCSAG: `tr_adverse`, `monotonic_increase`, direction=up, mean CFB at 150 mg/kg = +25.9 msec (averaged across all postdose timepoints), max_effect_size=2.05 | **MATCH** — QTc prolongation detected as dose-dependent. Mean CFB lower than peak because it averages across all postdose timepoints including waning signal at 24h |
| **Blood pressure** | 150 mg/kg: sustained -25 mmHg SBP through 17h | VS domain has only TEMP (body temperature). BP data is in CV domain, which is not yet processed | **MISSING** — CV domain not supported (SG-05) |
| **QTc correction method** | Modified Spence (QTCSAG — nonstandard) | Engine correctly processes QTCSAG from EG domain — no vocabulary issue | **MATCH** |
| **PK-PD correlation** | Peak QTc at 5-6h matches Tmax (PK at 6h: 392 ug/mL at 150 mg/kg) | No PK-PD analysis | **MISSING** |
| **Emesis** | 50 and 150 mg/kg (GI tolerability signal) | CL domain: Emesis and Vomitus detected. McNemar's pairwise tests computed (non-significant at N=6) | **MATCH** |
| **Carryover effects** | Not mentioned (adequate washout) | Carryover test: p=0.836 (Kruskal-Wallis). No carryover detected | **MATCH** |
| **LB data** | 0-byte lb.xpt — data not available | Correctly excluded with Prov-011 warning (after P0 fix) | **MATCH** |
| **Mortality** | 0 deaths | Correctly reports 0 | **MATCH** |

**Gap count: 2** (CV domain/BP not processed, PK-PD analysis not implemented). Down from 5 definite + 1 to verify.

---

### CJUGSEND00 — Cardiovascular Safety Pharmacology (Cynomolgus Monkey) — UPDATED 2026-03-28

| Dimension | Report (SME) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study type classification** | CV safety pharm, dose escalation | Routed to `within_animal_escalation` via semicolon TRTDOS | **MATCH** |
| **Study design recognition** | Within-subject dose escalation (all animals get all doses) | CrossoverDesignAdapter with `is_escalation=True`, `escalation_confound` flagged | **MATCH** |
| **NOAEL** | Not formally stated (safety pharm study) | NOAEL not established (no adverse findings at any dose). QRSAG detected as tr_adverse at dose_level 2 (threshold_decrease) | **PARTIAL** — structural output reasonable |
| **CV endpoint detection** | BP (systolic, diastolic, MAP), HR from CV domain | CV domain not processed | **MISSING** — CV domain not supported (SG-05) |
| **ECG endpoint detection** | PR, QRS, QT, QTcB, RR from EG domain | 5 EG findings with within-subject statistics. QRSAG: tr_adverse. PRAG/QTAG/QTCBAG/RRAG: normal or not_treatment_related | **MATCH** |
| **Respiratory rate** | RE domain (respiratory rate telemetry) | RE domain not processed | **MISSING** — RE domain not supported (SG-06) |
| **Body temperature** | VS domain (continuous telemetry) | 1 VS finding (TEMP): not_treatment_related | **MATCH** |
| **Baseline handling** | Per-dose-occasion derived baseline (mean of 2 pre-dose readings) | Per-occasion baselines computed from predose readings (EGBLFL + text matching) | **MATCH** |
| **Dose mapping** | TX.TRTDOS = "0;10;30;100" (semicolon-delimited) | Parsed correctly, 4 dose levels, 4 periods mapped via SE domain | **MATCH** |
| **Escalation confound** | Period effects confounded with dose (acknowledged limitation) | `_design_meta.escalation_confound=True`, carryover test skipped (no period variation) | **MATCH** |
| **Mortality** | 0 deaths | Correctly reports 0 | **MATCH** |

**Gap count: 2** (CV domain, RE domain). Down from 7 definite.

---

### PointCross — 13-Week PCDRUG Rat Toxicity (Synthetic Ground Truth)

| Dimension | nSDRG (Ground Truth) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study type classification** | REPEAT DOSE TOXICITY | REPEAT_DOSE | **MATCH** |
| **NOAEL** | Expected: Control (Group 1) — signals start at Group 2 or 3 | Control (Group 1), LOAEL at Group 2 (2 mg/kg) | **MATCH** — LOAEL at lowest treatment dose, 3 adverse findings at LOAEL (M), 1 (F), 4 (combined) |
| **Mortality** | Premature deaths from hepatocellular carcinoma in Group 4 | 1 death detected, mortality LOAEL at dose_level 3 (Group 4) | **MATCH** |
| **BW decreased (Groups 3,4)** | Engineered signal | 26 adverse BW findings across M+F | **MATCH** |
| **AST increased (Group 4)** | Engineered signal | AST adverse for both M and F | **MATCH** |
| **ALT increased (Group 4)** | Engineered signal | ALT adverse for both M and F | **MATCH** |
| **ALP increased (Group 4)** | Engineered signal | ALP adverse for both M and F | **MATCH** |
| **RBC decreased (Group 4)** | Engineered signal | RBC adverse for M (F not flagged — check threshold) | **PARTIAL** — M detected, F may be below significance threshold |
| **HGB decreased (Group 4)** | Engineered signal | HGB adverse for both M and F | **MATCH** |
| **HCT decreased (Group 4)** | Engineered signal | HCT adverse for both M and F | **MATCH** |
| **Liver weight increased (Group 4)** | Engineered signal | OM LIVER WEIGHT adverse for both M and F | **MATCH** |
| **Liver macro findings (Groups 3,4)** | Engineered signal | MA LIVER ENLARGED adverse for F (M not flagged — check) | **PARTIAL** — F detected, M may be below threshold or different finding term |
| **Liver micro findings (Groups 3,4)** | Engineered signal | MI LIVER HYPERTROPHY adverse for both M and F | **MATCH** |
| **Liver tumors (Group 4)** | Engineered signal (hepatocellular carcinoma) | TF: 3 findings detected. Tumor summary correctly reports them. `finding_class=tr_adverse` correctly assigned to liver tumors. Mortality from hepatocellular carcinoma caps mortality_loael at Group 4. Note: `severity=normal` and `treatment_related=False` on TF findings are inconsistent with `finding_class=tr_adverse` — display bug, but NOAEL unaffected because LB/MI/MA already drive LOAEL at Group 2 | **MATCH** — tumors detected, tumor summary correct, mortality cap works. Minor: severity/treatment_related fields inconsistent with finding_class on TF records |
| **Target organs** | Liver (primary), hematologic system (secondary) | 7 organs flagged: neurological, hematologic, hepatic, general, cardiovascular, renal, metabolic | **PARTIAL** — hepatic and hematologic correctly flagged, but 5 additional organs flagged that aren't in the ground truth (over-classification) |
| **Control detection** | Vehicle control at Group 1 | `is_control: true` for Group 1 | **MATCH** |
| **Recovery assessment** | 2-week recovery period for all groups | Recovery verdicts generated | **MATCH** (structural) |
| **Dose-response pattern** | Hepatotoxicity dose-dependent (worst at 200 mg/kg) | Liver findings show dose-response | **MATCH** |

**Gap count: 0 wrong, 2 partial** (RBC F threshold, MA liver M). Target organ over-classification is a tuning issue, not a miss. TF severity/treatment_related display fields inconsistent with finding_class — cosmetic bug, doesn't affect NOAEL or tumor summary.

---

### CJ16050 — Respiratory Safety Pharmacology (Rats)

| Dimension | Report (SME) | SENDEX (Automated) | Verdict |
|---|---|---|---|
| **Study imported** | In `send/CJ16050-xptonly/` | Generator produces 2 CL findings only (RE ignored) | **PARTIAL** — imported but primary data (RE) not processed |
| **Study type** | Respiratory safety pharmacology | Would need SAFETY_PHARM_RESPIRATORY config | **MISSING** — no respiratory safety pharm support |
| **RE domain** | Respiratory rate, tidal volume, minute volume (270 records) | RE domain not processed by generator | **MISSING** |
| **Non-monotonic dose-response** | 100 mg/kg stimulates RR (+108%), 1000 mg/kg suppresses TV (-26%) | Engine assumes monotonic dose-response for trend tests | **MISSING** — bidirectional effects not handled |
| **Parallel design** | Standard parallel (vehicle + 2 treatments) | Would be detected correctly | **MATCH** (if imported) |
| **Control group** | Vehicle control (ARMCD 00, TCNTRL present) | Would be detected correctly | **MATCH** (if imported) |
| **Statistical method** | Parametric Dunnett's | Engine uses Dunnett's | **MATCH** (if imported) |
| **Clinical signs** | 1000 mg/kg: decreased activity + scrotum relaxation 6/6 (CNS depression) | CL domain would be processed | **PARTIAL** (if imported — CL analyzed but no CNS syndrome detection) |

**Gap count: 3 definite** (RE domain not processed, non-monotonic dose-response, study type config)

---

### New Studies — Generator Results (2026-03-28)

9 studies imported to `send/`. Generator output in `backend/generated/`. 7 completed, 1 crashed, 1 unsupported design.

**Completed successfully (7):** FFU, Nimort-01, PDS2014, 43066, 87497, 96298, GLP003. Part 3 SME comparison entries pending — no study reports available for these datasets.

**Crashed (1):** 35449 (dog, Compound B) — only `study_mortality.json` produced. All dose_value fields null. Needs investigation.

**No output (1):** CV01 — Latin square crossover, same blocker as Study5 (SG-04, SG-05, SG-07).

**Issues discovered from generated output:**
- **SG-11** (multi-compound): FFU generator ran but treats all 5 groups as single dose-response — scientifically wrong when groups have different compounds
- **SG-12** (dual control): GLP003 has "Group ?" labels for levels 1-5, NOAEL not established. Dose metadata mapping is broken.
- **SG-13** (F344 HCD): Nimort-01 produced only 7 findings despite 100 subjects — possibly F344 background pathology not contextualized
- **SG-15** (dose label parsing): 96298 has concatenated labels ("Group 3125mg/kg/day"), 87497 has non-sequential dose ordering, 35449 has null dose values
- **Data quality**: Nimort-01 has 26 deaths (mostly control) in a 3-week study — F344 strain known for early neoplasia

---

## Part 4: Gap Summary

### Systemic Gaps (affect multiple studies)

| Gap ID | Gap | Studies Affected | Priority |
|---|---|---|---|
| **SG-01** | **Adversity misclassification** — engine classifies statistically significant findings as "adverse" but cannot distinguish pharmacology-related (expected immune response) from toxicity. Vaccine/biologic studies have treatment-related but non-adverse findings | Study2, Study4 | P1 |
| **SG-02** | **IS domain unsupported** — immunogenicity data not analyzed | Study1, Study3, Study4 | P2 |
| **SG-03** | **Study type misclassification** — TS.STYPE absent for CBER studies, safety pharm TS values don't match config | Study1, Study3, Study5, CJUGSEND00 | P1 |
| **~~SG-04~~** | ~~**Within-animal crossover/escalation statistics not implemented**~~ — **DONE** (design-adapter architecture, 2026-03-28). Paired t-test, Page's trend, Cohen's d_z, Friedman omnibus, McNemar's incidence, carryover detection. | Study5, CJUGSEND00, CV01 | ~~P2~~ |
| **SG-05** | **CV domain not processed** — blood pressure, HR from CV domain ignored | Study5, CJUGSEND00, CV01 | P2 |
| **SG-06** | **RE domain not processed** — respiratory parameters ignored | CJUGSEND00, CJ16050 | P3 |
| **~~SG-07~~** | ~~**Per-occasion baseline not supported**~~ — **DONE** (per_occasion_baseline.py, 2026-03-28). EGBLFL + text matching + per-subject per-period computation. | Study5, CJUGSEND00, CV01 | ~~P2~~ |
| **SG-08** | **Non-monotonic dose-response** — engine assumes monotonic trend; bidirectional effects (stimulation at low dose, suppression at high dose) not handled | CJ16050 | P3 |
| **SG-09** | **n < 5 caveat not implemented** — small group sizes should trigger reduced-confidence warning | Study1, Study3, CJUGSEND00, CJ16050, FFU, CV01 | P1 |
| **~~SG-10~~** | ~~**Semicolon-delimited TX.TRTDOS not parsed**~~ — **DONE** (treatment_periods.py, 2026-03-28). Adapter routing detects semicolon TRTDOS; treatment period parser maps SETCD sequences to dose levels. | CJUGSEND00 | ~~P2~~ |
| **SG-11** | **Multi-compound studies not supported** — generator assumes single test article; FFU has 3 compounds across 5 groups | FFU | P1 |
| **SG-12** | **Dual control group handling** — GLP003 has both vehicle and water controls; engine may misidentify control or create spurious comparisons | GLP003 | P1 |
| **SG-13** | **Non-SD rat HCD coverage** — F344 strain baseline data may not be in HCD tables; engine degrades gracefully but loses context | Nimort-01 | P2 |
| **SG-14** | **Cross-study comparison not supported** — TOXSCI set has same compound tested in 2 species; no mechanism to compare across studies | TOXSCI (35449/87497, 43066/96298) | P2 |
| **SG-15** | **Dose label/value parsing failures** — concatenated labels ("Group 3125mg/kg/day"), null dose values, non-sequential ordering across TOXSCI and instem studies | 35449, 87497, 96298, GLP003 | P1 |

### Per-Study Verdict Summary

| Study | Matches | Partial | Wrong | Missing | Total Checks |
|---|---|---|---|---|---|
| **PointCross** | **14** | **2** | **0** | **0** | **16** |
| Study1 | 6 | 0 | 1 | 2 | 9 |
| Study2 | 1 | 1 | 1 | 1 | 4 (+ 8 to verify) |
| Study3 | 2 | 1 | 1 | 2 | 6 (+ 3 to verify) |
| Study4 | 1 | 1 | 1 | 1 | 4 (+ 10 to verify) |
| Study5 | **8** | **1** | **0** | **2** | **11** (updated 2026-03-28) |
| CJUGSEND00 | **8** | **1** | **0** | **2** | **11** (updated 2026-03-28) |
| CJ16050 | 3 | 1 | 0 | 4 | 8 |
| CV01 | — | — | — | — | Not run — needs XPT extraction (adapter would route correctly) |
| FFU | — | — | — | — | 584 findings, pending SME comparison |
| Nimort-01 | — | — | — | — | 7 findings, massive control mortality — pending SME comparison |
| PDS2014 | — | — | — | — | 426 findings, pending SME comparison |
| 35449 | — | — | — | — | CRASHED — only mortality file |
| 43066 | — | — | — | — | 378 findings, pending SME comparison |
| 87497 | — | — | — | — | 210 findings, pending SME comparison |
| 96298 | — | — | — | — | 266 findings, 1 death, pending SME comparison |
| GLP003 | — | — | — | — | 1661 findings, dose label issues — pending investigation |

### Study Type Support Matrix

| Study Type | Uploadable Study | Engine Status | Blocker |
|---|---|---|---|
| Repeat-dose subacute (≤28d) | PointCross | **Full support** | — |
| Repeat-dose (vaccine, single dose + control) | Study2 | **Mostly works** | Adversity classification (SG-01) |
| Repeat-dose (vaccine, multi-dose + control) | Study4 | **Mostly works** | Adversity classification (SG-01) |
| Single-dose (no control) | Study3 | **Partially works** | No control handled (P0 fix applied), study type misclassified (SG-03) |
| Immunogenicity characterization (single-arm) | Study1 | **Structural output only** | No control, IS unsupported (SG-02) |
| CV safety pharm — Latin square crossover | Study5 | **EG/VS/CL working** | CV domain (SG-05), domain filtering, UI profile |
| CV safety pharm — dose escalation | CJUGSEND00 | **EG/VS/CL working** | CV/RE domains (SG-05, SG-06), domain filtering, UI profile |
| Respiratory safety pharm — parallel | CJ16050 | **Imported, RE not processed** | RE domain (SG-06), non-monotonic DR (SG-08) |
| CV safety pharm — Latin square (proper) | CV01 | **Not yet run** | Needs XPT extraction. CV domain (SG-05), small N (SG-09) |
| Repeat-dose IV (multi-compound) | FFU | **Not yet run** | Multi-compound (SG-11), small N (SG-09) |
| Repeat-dose subacute (non-SD rat) | Nimort-01 | **Expected: mostly works** | F344 HCD coverage (SG-13) |
| Repeat-dose subacute + recovery (SD rat) | PDS2014 | **Expected: full support** | PointCross-like design |
| Repeat-dose subacute (dog, parallel) | 35449, 43066 | **Expected: mostly works** | First non-crossover canine studies |
| Repeat-dose subacute (rat, large N) | 87497, 96298 | **Expected: full support** | Standard parallel design |
| Repeat-dose subacute + dual control | GLP003 | **Expected: mostly works** | Dual control (SG-12) |

---

## Part 5: Root Cause Audit (2026-03-28)

The systemic gaps (SG-01 through SG-15) and per-study verdicts in Parts 3-4 frequently identify **symptoms** rather than **root causes**. This section maps each SG to its architectural root cause, revises per-study verdicts where the original analysis misdiagnosed the problem, and provides a collapsed root-cause-driven priority table.

**Why this matters:** Fixing symptoms independently produces inconsistent patches. Example: TK satellite detection has 4 SEND encoding patterns; the code handles 2 via ad-hoc if-statements. The temptation is to add 2 more if-statements. Deep research (`docs/_internal/research/deep-research-TKclass-28mar2026.md`) documents **at least 12 SETCD naming conventions**, a 3-value TKDESC codelist that sponsors populate inconsistently (6-99% field population rate across 1,800 FDA submissions), and a satellite-vs-combined-cohort disambiguation problem that no published tool solves. The actual fix is a vocabulary normalization layer with cascading signal priority and domain-data validation — the same architectural pattern that also fixes dose label parsing (SG-15), study type routing (SG-03), and control detection edge cases.

**Cross-cutting requirement — user override and CRO-defined mappings:** Automated detection will never achieve 100% accuracy across the full SEND encoding wilderness. Every normalization layer (RC-1 through RC-9) must support two escape hatches: (1) **post-validation user override** — the system computes its best classification, presents it with evidence (which signals fired, which were absent), and the user can correct it before analysis runs; (2) **user-defined mapping libraries** — customers work with specific CROs who encode SEND data in consistent-but-nonstandard ways. A CRO-specific mapping file (e.g., "Covance uses SETCD pattern X for TK, Labcorp uses Y") lets the normalization layer learn from prior corrections and apply them to future studies from the same source. Without these two mechanisms, every edge case becomes a code change instead of a configuration change.

---

### 5.1 Systemic Gap Audit

#### SG-01: Adversity misclassification

**Original framing:** "Engine classifies statistically significant findings as adverse but cannot distinguish pharmacology-related from toxicity-related."

**Verdict: SYMPTOM.** Frames this as a vaccine-specific problem, implying the fix is a vaccine exemption. The root cause is architectural: **the adversity classification pipeline (`classification.py`) has no semantic input about compound mechanism or study purpose.** The ECETOC A/B-factor system uses: (A-1) dose-response pattern, (A-2) corroboration, (A-3) HCD, (A-6) statistics. None encode *what the compound does*. An expected immune response to a vaccine (CRP 34x elevation, spleen hyperplasia) scores high on A-1 (monotonic), A-6 (p<0.001), and A-3 (outside HCD) — correctly by the framework's math, but wrong scientifically because these are the intended pharmacological effect.

**Root cause → RC-3:** No "expected pharmacological effect" annotation layer. The `adversity_dictionary.py` handles intrinsic histopath adversity (necrosis=always_adverse, hypertrophy=context_dependent), but there is no equivalent for clinical pathology findings that are expected pharmacological responses. Affects any study where treatment-related ≠ adverse: vaccines, biologics, gene therapy, pharmacology studies. Fix direction: study-type-aware or compound-class-aware "expected effect" profiles that feed into B-factor assessment.

---

#### SG-02: IS domain unsupported

**Original framing:** "Immunogenicity data not analyzed."

**Verdict: WRONG — IS is already implemented.** `findings_is.py` (465 lines) is a full IS domain module with GMT kinetics, seroconversion rates, BLQ substitution at LLOQ/2, log₁₀-transform statistics, peak timepoint detection, and time-course visualization data. It outputs the standard findings contract (`group_stats`, `pairwise`, `trend_p`, `direction`, `max_effect_size`) and is wired into `domain_stats.py` Pass 1 via `compute_is_findings()`. The original analysis (Part 1-4) incorrectly stated IS was unsupported — it likely tested studies where IS data produced no significant findings (Study1 has no control, so IS findings would be empty) and mistook empty results for missing capability.

**RC-5 is downgraded.** IS proves that adding a domain follows an informal but functional pattern: create `findings_*.py` module, add import + `pool.submit()` to `domain_stats.py`. This is not an architectural gap — it's a 2-file change per domain. The remaining missing domains are:
- **RE (respiratory):** Not implemented. Needed for CJ16050 (parallel design). Structurally identical to EG/VS — continuous endpoints, standard between-group statistics. ~2-3 days.
- **CV (cardiovascular telemetry):** Not implemented. Needed for CV01/Study5 (crossover design). Gated on RC-4 (crossover adapter) because all CV data comes from crossover studies. Additionally requires time-series summarization (peak detection, AUC) before feeding into FindingRecord. ~1-2 weeks after RC-4.

**Root cause → RC-5 (revised):** Not "no domain registration pattern" — the pattern exists and works. The gap is simply **RE module not written** (actionable now) and **CV module not written** (gated on RC-4). RC-5 is reclassified from architectural gap to implementation task.

---

#### SG-03: Study type misclassification

**Original framing:** "TS.STYPE absent for CBER studies, safety pharm TS values don't match config."

**Verdict: SYMPTOM of two distinct root causes.**

**Root cause A → RC-1:** No vocabulary normalization for TS domain values. TS.STYPE can be "REPEAT DOSE TOXICITY", "CARDIOVASCULAR PHARMACOLOGY", "SAFETY PHARMACOLOGY", "ACUTE", or absent. `routeStudyType()` does case-insensitive exact match against `ts_stype_values` arrays. SEND allows synonyms, abbreviations, and sponsor-specific values. The fix is not "add CARDIOVASCULAR PHARMACOLOGY to the config" — it is a **SEND controlled terminology lookup** normalizing sponsor values to canonical categories. `send-terminology-alignment.json` exists for MI pathology synonyms but nothing equivalent for TS metadata.

**Root cause B → RC-2:** Study type routing has zero effect on pipeline behavior. The backend ignores `StudyTypeConfig` entirely. `study_type` is stored as a string in `StudyMetadata` for portfolio display only. `time_course`, `statistical_mode`, `enabled_syndrome_groups`, `available_domains` are defined in JSON configs, have TypeScript functions with unit tests, and are **never called in production code** (confirmed via grep — only in test files). Fixing the routing without wiring it to pipeline behavior is pure ceremony.

---

#### SG-04: Within-animal crossover/escalation statistics not implemented

**Original framing:** "Engine only does between-group comparisons."

**Verdict: CORRECTLY IDENTIFIED as a gap, but framed as a feature addition when it is a design constraint.** The entire pipeline — from `dose_groups.py` (one ARMCD = one dose level, animals non-overlapping) through `statistics.py` (Dunnett's each-treated-vs-control) through `classification.py` (dose-response pattern = monotonic trend across independent groups) through NOAEL derivation (highest dose level with no adverse finding) — assumes parallel between-group design. This is not "add crossover stats alongside existing stats." The data model for what a dose group IS and how subjects relate to treatments needs a second mode. The `dose_groups` output structure (`dose_level`, `armcd`, `n_male`, `n_female`) is meaningless for a crossover design where every subject appears at every dose level.

**Root cause → RC-4:** The data model and statistical pipeline assume parallel between-group design. Within-animal crossover requires: different data model, different dose group assembly, different statistical pipeline (period-corrected repeated-measures ANOVA, not Dunnett's), different baseline computation, different NOAEL derivation (within-subject effect size, not between-group). This is a parallel pipeline, not a module addition.

---

#### SG-05: CV domain not processed

**Original framing:** "Blood pressure, HR from CV domain ignored."

**Verdict: CORRECTLY IDENTIFIED, but effort understated and dependency missed.** CV data has a fundamentally different structure from LB/BW: continuous telemetry (high-frequency time series, e.g. 3,328 rows for 4 dogs in CV01) vs discrete timepoint measurements. Processing CV requires time-series summarization (peak detection, AUC, duration above threshold) before producing FindingRecords. Additionally, all CV data in the study inventory comes from crossover studies (Study5, CJUGSEND00, CV01) — so `findings_cv.py` must be built as a crossover adapter domain module, not a parallel adapter module. The analysis lists "CV domain processing" as 1-week effort — this dramatically understates it.

**Root cause → RC-4** (crossover adapter must exist first) **+ implementation task** (write `findings_cv.py` with time-series summarization, ~1-2 weeks after RC-4).

---

#### SG-06: RE domain not processed

**Original framing:** "Respiratory parameters ignored."

**Verdict: CORRECTLY IDENTIFIED, scope is small.** RE (respiratory plethysmography) is structurally similar to existing continuous domains (EG, VS) — discrete timepoint measurements of respiratory rate, tidal volume, minute volume. CJ16050 uses a parallel design (vehicle + 2 treatment groups), so RE processing fits the existing `ParallelDesignAdapter` and follows the same `findings_*.py` pattern that IS already demonstrates. Unlike CV, RE does not require time-series summarization or the crossover adapter.

**Root cause → Implementation task** (write `findings_re.py`, add to `domain_stats.py`, ~2-3 days). Not an architectural gap. CJ16050 is imported and ready to test.

---

#### SG-07: Per-occasion baseline not supported

**Original framing:** "Crossover studies need baseline per treatment period, not global."

**Verdict: SYMPTOM of SG-04.** This is not a separate gap — it is one facet of the crossover design assumption. The baseline concept in the current pipeline is implicitly "control group mean" (between-group comparison). In crossover designs, baseline is "same animal's pre-dose reading for this treatment period." This is inseparable from the crossover statistics design (RC-4). Listing it separately inflates the gap count and invites a patch (per-occasion baseline bolted onto between-group stats) that would not actually produce valid results.

**Root cause → RC-4** (subsumed).

---

#### SG-08: Non-monotonic dose-response

**Original framing:** "Engine assumes monotonic trend; bidirectional effects not handled."

**Verdict: PARTIALLY CORRECT.** `classify_dose_response()` already returns `non_monotonic` as a pattern — non-monotonic patterns are detected, not missed. The root cause: **the classification treats non-monotonic = low-confidence noise, when for some pharmacological targets (respiratory, CNS, autonomic), biphasic dose-response IS the expected biology.** The fix is not "handle non-monotonic" (already detected) — it is "do not penalize non-monotonic patterns for compound classes where biphasic response is pharmacologically expected." This ties back to RC-3 (no compound-class/mechanism awareness in the classification layer).

**Root cause → RC-9** (specific to dose-response interpretation, but informed by RC-3).

---

#### SG-09: n < 5 caveat not implemented

**Original framing:** "Small group sizes should trigger reduced-confidence warning."

**Verdict: SYMPTOM.** A text warning is cosmetic. The root cause: **the statistics layer has no power analysis or minimum-N gate.** For n=2 per group (Study3, CJUGSEND00), Dunnett's returns a p-value, Hedges' g returns an effect size, and the classification pipeline treats them identically to n=15 results. The certainty cascade (`confidence.py`) has 7 GRADE dimensions — none is "sample size adequacy." A caveat message does not fix this; what is needed is **formal downweighting of underpowered results in the certainty score**, so findings from n=2 groups automatically score LOW regardless of p-value. D1 rewards p<0.01, but p<0.01 from n=2 vs n=15 has completely different evidential weight.

**Root cause → RC-6:** Certainty cascade has no N-awareness. Structural fix, not a text warning.

---

#### SG-10: Semicolon-delimited TX.TRTDOS not parsed

**Original framing:** "Dose escalation studies encode all doses in one TX row."

**Verdict: SYMPTOM of SG-04.** Parsing semicolons without restructuring how dose groups are assembled (RC-4) produces four dose groups with one subject each — a between-group decomposition of a within-subject design, statistically meaningless. This gap is inseparable from SG-04/RC-4.

**Root cause → RC-4** (subsumed) **+ RC-1** (TX value normalization for the parsing itself).

---

#### SG-11: Multi-compound studies not supported

**Original framing:** "FFU has 3 test articles in one study."

**Verdict: CORRECTLY IDENTIFIED, but root cause is more specific than stated.** The pipeline assumes `dose_groups` form a single ordinal dose-response (0 → low → mid → high of ONE compound). FFU has 5 groups with 3 different compounds — dose levels do not form an ordered series. Jonckheere-Terpstra trend test across compounds is scientifically meaningless (testing monotonic trend across "0, 12 mg/kg Compound-1, 4 mg/kg Compound-2, 8 mg/kg Compound-2, 6 mg/kg Compound-3" is nonsense). Multi-compound studies need compound-stratified analysis (separate dose-response per compound, or pairwise-only-vs-control with no trend test).

**Root cause → RC-8:** Dose groups are assumed to be ordinal levels of a single variable. The trend test and NOAEL derivation must become compound-aware.

---

#### SG-12: Dual control group handling

**Original framing:** "GLP003 has vehicle + water controls; engine may misidentify control."

**Verdict: SYMPTOM.** The root cause: **`_is_control()` assumes exactly one control group.** `dose_groups.py` sorts controls to dose_level=0 and everything else to dose_level=1+. With dual controls (vehicle + water), one becomes dose_level=0, the other becomes dose_level=1 (a "treated" group). Pairwise statistics then compare water control (dose_level=1) against vehicle control (dose_level=0), producing spurious "treatment effects" that are vehicle-vs-water noise. The fix is not "detect dual control" — the control model needs to support **multiple control arms excluded from the treated-vs-control comparison** or **merged into a pooled control**.

**Root cause → RC-7:** Control model assumes single control. Needs multi-control support (merge or exclude).

---

#### SG-13: Non-SD rat HCD coverage

**Original framing:** "F344 strain baseline data may not be in HCD tables."

**Verdict: CORRECTLY IDENTIFIED.** The HCD system (`hcd.py`) has strain-specific routing (Phase 2 SQLite has 14+ strains). If F344 data exists in the NTP database, it routes correctly. If not, A-3 score = 0 (neutral). This is a genuine data coverage gap, not an architectural problem. Degradation is graceful.

**Root cause: Data gap (not architectural).** No RC assignment needed. **HCD acquisition in progress:** `docs/_internal/research/hcd/hcd_acquisition_report.md` — Tier 1 seed dataset: 835 rows from 3 sources (cynomolgus monkey, NZW rabbit, Wistar Han rat) loaded into `hcd_seed.sqlite`. SD rat (He 2017) and beagle dog (Choi 2011) pending manual extraction. Extends species/strain coverage beyond the existing NTP DTT IAD database.

---

#### SG-14: Cross-study comparison not supported

**Original framing:** "Same compound tested in 2 species; no mechanism to compare across studies."

**Verdict: CORRECTLY IDENTIFIED.** A product feature request, not a pipeline bug. P2 is appropriate.

**Root cause: Feature gap (not architectural).** No RC assignment needed.

---

#### SG-15: Dose label/value parsing failures

**Original framing:** "Concatenated labels, null dose values, non-sequential ordering."

**Verdict: SYMPTOM.** Four studies with different parsing failures treated as four bugs. The root cause: **no normalization layer between raw TX domain values and the canonical dose representation.** `_parse_tx()` does `float(params["TRTDOS"])` — a single conversion with no validation, no unit normalization, no format detection. When TRTDOS is "3125mg/kg/day" (value concatenated with unit), or absent, or semicolon-delimited, or whitespace-padded, the `float()` call fails or produces garbage. Similarly, GRPLBL "Group 3125mg/kg/day" is used as-is because there is no label normalization. The fix is not 4 study-specific patches — it is a **TX value extraction and normalization module** handling the known SEND encoding variants: numeric string, numeric+unit concatenation, missing (derive from GRPLBL), semicolon-delimited (escalation), non-numeric (categorical).

**Root cause → RC-1:** No TX/TS vocabulary normalization layer. Same class of problem as TK detection — deep research (`docs/_internal/research/deep-research-TKclass-28mar2026.md`) documents 12+ SETCD naming conventions, a satellite-vs-combined-cohort disambiguation problem requiring domain-data validation, and the finding that no published tool implements heuristic TK detection. The code handles 2 patterns ad-hoc; the research catalogs the full encoding space. The same cascading-signal-with-validation architecture that solves TK detection also solves dose value extraction, study type routing, and control identification. All normalization layers must support **post-validation user override** (present computed classification with evidence, let user correct) and **CRO-defined mapping libraries** (learn from prior corrections for studies from the same CRO source).

---

### 5.2 Per-Study Verdict Revisions

#### Study1

**Original:** "Gap count: 2 (study type misclassification, IS unsupported)"

**Revised:** Study1 is a **single-arm immunogenicity characterization** — not a toxicology study. The engine correctly produces 0 adverse findings and "NOAEL not established." Study type misclassification is misleading: even with correct routing, the pipeline runs all 11 domain modules and produces 133 normal findings because routing has no effect (RC-2). The real question: should the system attempt tox analysis on a non-tox study, or route to a fundamentally different analysis mode (descriptive summary only, no NOAEL, no adversity classification)? This is a **study purpose** gap, not a study type routing gap. IS unsupported is RC-5.

**Revised gap count: 1 root cause** (RC-2 study design routing). IS is already implemented (`findings_is.py`). The "study type misclassification" label is retired.

---

#### Study2

**Original:** "Gap count: 2 definite + 8 items to verify"

**Revised:** The 8 "CHECK" items are deferred analysis — unacceptable for a gap assessment. The adversity verdict is correct as a symptom but the fix requires RC-3 (expected pharmacological effect layer), not a study-specific patch. SME says NOAEL = treatment dose (all findings non-adverse). Engine says NOAEL = control (findings are adverse because statistically significant). This is not a classification threshold bug; it is the absence of compound-class awareness in the B-factor pathway.

**Revised gap count: 1 root cause** (RC-3). IS is already implemented. The 8 CHECK items must be resolved — they are either matches or they surface additional gaps.

---

#### Study3

**Original:** "Gap count: 3 definite (study type, small-N caveat, IS unsupported) + 3 items to verify"

**Revised:** P0 fix (TCNTRL absence → NOAEL not determinable) was correct. But "study type misclassification" changes nothing in the pipeline (RC-2). The real unaddressed gap: the engine ran between-group comparisons on Vector A vs Vector B (treating Vector A as "control" because it is dose_level=0), which is scientifically meaningless — these are two different treatments, not control-vs-treated. The root cause: **`dose_groups.py` forces one arm to be "control" even when no control exists.** The P0 fix addressed the NOAEL output, but the 44 adverse findings from a treatment-vs-treatment comparison are garbage output. The system should suppress adversity classifications entirely when `has_concurrent_control=false`.

**Revised gap count: 2 root causes** (RC-7 control model / no-control behavior, RC-6 N-awareness for n=3). IS is already implemented.

---

#### Study4

**Original:** "Gap count: 2 definite (NOAEL adversity, IS unsupported) + 10 items to verify"

**Revised:** 10 deferred CHECK items is unacceptable analysis quality. Same adversity root cause as Study2 (RC-3). The "14 target organs vs report's 4" over-classification is the same root cause: every statistically significant finding gets classified adverse, so every organ with any significant finding becomes a "target organ." With RC-3 (expected-effect layer), the immune-related organs (spleen, LN, injection sites) would classify as pharmacology-related, matching the SME assessment.

**Revised gap count: 1 root cause** (RC-3). IS is already implemented. 10 CHECK items must be resolved.

---

#### Study5

**Original:** "Gap count: 5 definite + 1 to verify"

**Revised:** The 5 gaps (study type, design recognition, QTc missed, BP missed, QTc correction method) are all symptoms of **one root cause (RC-4: no crossover pipeline).** Study type routing (RC-2) would not help. Design recognition, QTc, and BP are all "between-group stats applied to crossover data." QTc correction method (QTCSAG not recognized) is a real vocabulary gap (RC-1) but irrelevant until the crossover pipeline exists. Counting these as 5 separate gaps inflates the work estimate and invites 5 patches instead of 1 architectural change.

**Revised gap count: 1 root cause** (RC-4). RC-1 (QTCSAG vocabulary) is a secondary gap that unblocks only after RC-4 is addressed.

---

#### CJUGSEND00

**Original:** "Gap count: 7 definite"

**Revised:** Same over-counting as Study5. Study type (RC-2), design recognition (RC-4), CV domain (missing module, gated on RC-4), EG stats (RC-4), RE domain (missing module — but CJUGSEND00 is escalation design, so RE here also needs RC-4), baseline (RC-4), dose mapping (RC-4 + RC-1). Almost everything collapses to "crossover/escalation pipeline does not exist" (RC-4). CV and RE modules are implementation tasks, not architectural gaps.

**Revised gap count: 1 root cause** (RC-4) + 2 implementation tasks (CV module, RE module — both gated on RC-4 for this study's escalation design).

---

#### PointCross

**Original:** "Gap count: 0 wrong, 2 partial"

**Revised: Agree.** PointCross is the design target. 14/16 MATCH is expected. The 2 partials (RBC F threshold, MA liver M) are genuine tuning items within the existing architecture.

---

#### CJ16050

**Original:** "Gap count: 3 definite (RE domain, non-monotonic DR, study type config)"

**Revised:** RE domain = implementation task (`findings_re.py`, 2-3 days — CJ16050 is parallel design, so no RC-4 dependency). Non-monotonic DR = RC-9, partially informed by RC-3. Study type config = RC-2 (routing has no effect). Net: 1 root cause (RC-9) + 1 implementation task (RE module).

**Revised gap count: 1 root cause** (RC-9) + 1 implementation task (RE module, no architectural blocker).

---

#### New studies (2026-03-28 batch)

**Original:** Per-study bugs listed independently.

**Revised:** Each per-study issue collapses to a root cause:

| Study | Surface Issue | Root Cause |
|---|---|---|
| 35449 | Crash — null dose_value, only mortality file | RC-1 (TX normalization) |
| 96298 | Concatenated labels ("Group 3125mg/kg/day") | RC-1 (TX normalization) |
| 87497 | Non-sequential dose ordering | RC-1 (TX normalization) |
| GLP003 | "Group ?" labels, levels 1-5 unmapped | RC-1 (TX normalization) |
| GLP003 | Dual control, spurious comparisons | RC-7 (control model) |
| FFU | Multi-compound treated as single dose-response | RC-8 (compound-stratified analysis) |
| FFU | n=2/group, no confidence penalty | RC-6 (N-awareness) |
| Nimort-01 | F344 HCD coverage | Data gap (not architectural) |
| PDS2014 | Sex-stratified dose groups (8 instead of 4) | RC-1 (TX normalization — SPGRPCD by sex) |

These should not be tracked as 9 separate P0/P1 items — they collapse to 3 architectural fixes (RC-1, RC-7, RC-8) + 1 data gap.

---

### 5.3 Root Cause Summary Table

| ID | Root Cause | Original SGs | Studies Affected | Priority | Effort |
|---|---|---|---|---|---|
| **RC-1** | **TX/TS vocabulary normalization layer.** No normalization between raw SEND domain values and canonical representations. `float(TRTDOS)` with no validation. No controlled terminology lookup for TS metadata. TK detection handles 2 of 12+ documented SETCD patterns ad-hoc (see `docs/_internal/research/deep-research-TKclass-28mar2026.md` — FDA analysis of 1,800 submissions shows 6-99% field population rates). Cascading signal priority with domain-data validation needed, not more if-statements. **Must include post-validation user override** (system presents classification + evidence, user corrects before analysis) **and CRO-defined mapping libraries** (customers work with specific CROs whose nonstandard-but-consistent encodings can be learned from prior corrections). Without these, every encoding edge case becomes a code change instead of a config change. | SG-03, SG-10, SG-15 | 35449, 87497, 96298, GLP003, PDS2014, Study5, CJUGSEND00 | **P0** | 1-2 weeks |
| **RC-2** | **Study-design-aware pipeline routing.** Backend ignores StudyTypeConfig entirely. `time_course`, `statistical_mode`, `enabled_syndrome_groups`, `available_domains` defined but never consumed. Routing has zero effect on analysis behavior. | SG-03 (backend side) | All non-repeat-dose studies | **P1** | 1 week (wiring only; crossover pipeline separate) |
| **RC-3** | **Expected pharmacological effect layer.** Adversity classification is purely statistical — no semantic input about compound mechanism or study purpose. Expected immune responses (CRP elevation, spleen hyperplasia) classified as adverse because statistically significant. `adversity_dictionary.py` covers histopath intrinsic adversity but nothing for expected pharmacological clinical path findings. | SG-01, SG-08 (partial) | Study2, Study4, vaccines/biologics generally | **P1** | 2 weeks |
| **RC-4** | **Design-adapter architecture.** Entire pipeline assumes parallel between-group design, but classification/confidence/NOAEL/syndromes/recovery are actually design-independent — they consume {p_value, effect_size, pattern}, not raw data. Refactor into: (1) formalized findings contract (intermediate representation), (2) shared analysis core (classification, confidence, NOAEL, syndromes, recovery), (3) design-specific adapters (`ParallelDesignAdapter` = current pipeline renamed, `CrossoverDesignAdapter` = new). RC-2 (routing) becomes the adapter selector, built as part of this refactor. Current pipeline becomes an adapter with zero logic changes. See `docs/_internal/incoming/design-adapter-architecture-plan.md` for implementation plan. **Deep research for CV domain processing complete:** `docs/_internal/research/engine/cardiovascular-telementry-analysis.md` — ICH S7A/S7B requirements, QTc correction methods (species-specific), time-series summarization (time-matched vehicle subtraction + ANCOVA), clinically meaningful thresholds, SEND CV domain structure, PK-PD concentration-QTc modeling, FindingRecord mapping. | SG-04, SG-07, SG-10 | Study5, CJUGSEND00, CV01 | **P2** | 1 week (contract + extraction) + 3-4 weeks (crossover adapter) |
| **RC-5** | **~~Domain registration pattern~~ → Missing domain modules (RE, CV).** IS is already implemented (`findings_is.py`, 465 lines, fully wired). The informal domain registration pattern (create `findings_*.py`, add import + `pool.submit` to `domain_stats.py`) works. RE is a straightforward implementation (~2-3 days, parallel design, clones EG/VS pattern, CJ16050 ready to test). CV is gated on RC-4 (all CV data comes from crossover studies) and requires time-series summarization (~1-2 weeks after RC-4). | SG-05, SG-06 | CJ16050 (RE), Study5/CJUGSEND00/CV01 (CV) | RE: **P1**, CV: **P2** (after RC-4) | RE: 2-3 days, CV: 1-2 weeks |
| **RC-6** | **Certainty cascade N-awareness.** Statistics layer has no power analysis or minimum-N gate. For n=2/group, Dunnett's returns p-values treated identically to n=15 results. The 7-dimension GRADE certainty system has no "sample size adequacy" dimension. Findings from underpowered comparisons need structural downweighting, not a text caveat. **Deep research complete:** `docs/_internal/research/sample-size/sample-size-adequacy-29mar2026.md` — Dunnett's at N=3 has 10% power for 1.0 SD effect; Fisher's exact cannot reach significance at N=2 regardless of true incidence. Proposes D8 dimension with study-type-aware thresholds and paired-design adjustments. | SG-09 | Study1, Study3, CJUGSEND00, CJ16050, FFU, CV01 | **P1** | 3-5 days |
| **RC-7** | **Control model (multi-control, no-control).** `_is_control()` assumes exactly one control group. Dual controls: one becomes dose_level=1 ("treated"), producing spurious vehicle-vs-water comparisons. No control: one treatment arm forced to dose_level=0 ("control"), producing treatment-vs-treatment comparisons. System should suppress adversity when `has_concurrent_control=false` and support merged/multiple control arms. **Deep research complete:** `docs/_internal/research/control-groups/control-groups-model-29mar2026.md` — taxonomy of 7 control types with SEND encoding (TCNTRL values from FDA repository), dual control pooling decision tree, no-control suppression rules, positive control exclusion logic. ~30% of real-world SEND designs misclassified by single-control assumption. | SG-12 | Study1, Study3, GLP003 | **P1** | 1 week |
| **RC-8** | **Compound-stratified analysis.** Dose groups assumed to be ordinal levels of a single variable. JT trend test across different compounds is meaningless. Multi-compound studies need compound-stratified analysis (separate dose-response per compound, or pairwise-only-vs-control with no trend test). **Deep research complete:** `docs/_internal/research/multi-compound-studies/multi_compound_study_analysis.md` — taxonomy of 4 multi-compound designs (comparator, combination, ADC component, biosimilar), ICH S6(R1)/S9/M3(R2) requirements, compound detection from TX domain (TRTNAM/TRT), per-compound NOAEL derivation, ADC multi-analyte PK handling. | SG-11 | FFU | **P2** | 1-2 weeks |
| **RC-9** | **Non-monotonic dose-response semantics.** `classify_dose_response()` already detects `non_monotonic` but penalizes it as low-confidence noise. For some pharmacological targets (respiratory, CNS, autonomic), biphasic dose-response IS the expected biology. The classification should not penalize non-monotonic patterns when the compound class predicts biphasic response. Informed by RC-3. **Deep research complete:** `docs/_internal/research/d-r/NonMonotonic_DoseResponse_29mar2026.md` — 10 pharmacological mechanisms producing NMDR (receptor desensitization, opposing subtypes, partial agonism, metabolite reversal, hormesis, etc.), compound-class-aware D2 scoring decision tree, false-positive rate analysis. CJ16050 confirmed as textbook biphasic: should score D2=+1. | SG-08 | CJ16050 | **P3** | 3-5 days |

### 5.4 Dependency Graph

```
RC-1 (TX/TS normalization)  ← no dependencies, unblocks 35449/87497/96298/GLP003/PDS2014
RC-3 (expected effect layer) ← no dependencies, unblocks Study2/Study4 adversity
RC-6 (N-awareness)          ← no dependencies, unblocks small-N confidence
RC-7 (control model)        ← no dependencies, unblocks GLP003 + suppresses Study1/Study3 garbage output
RE module (findings_re.py)  ← no dependencies, unblocks CJ16050 (2-3 days)

RC-4 (design-adapter arch)  ← benefits from RC-1 (dose parsing); RC-2 routing built as part of this
CV module (findings_cv.py)  ← depends on RC-4 (all CV data comes from crossover studies)
RC-8 (compound-stratified)  ← benefits from RC-1 (dose parsing)
RC-9 (non-monotonic DR)     ← benefits from RC-3 (compound-class awareness)
```

**Recommended execution order:**

| Phase | Items | Rationale | Effort |
|---|---|---|---|
| **A — Fix the working portfolio** | RC-7 → RC-6 → RC-3, then RE module | Quick wins that fix scientific correctness for studies that already run (GLP003 dual control, small-N confidence, vaccine adversity). RE module (`findings_re.py`) is a 2-3 day task that unblocks CJ16050 — parallel design, clones EG/VS pattern. **All deep research landed:** control groups, sample size, expected pharmacological effects (pending). | ~4 weeks |
| **C — Design-adapter refactor** | RC-4 + RC-2 together | Formalize findings contract, extract shared core, wrap current pipeline as `ParallelDesignAdapter`, build `CrossoverDesignAdapter`, wire RC-2 routing as adapter selector. See `docs/_internal/incoming/design-adapter-architecture-plan.md`. **CV telemetry research landed.** RC-4 implementation in progress. | ~4-5 weeks (1 wk contract+extraction, 3-4 wk crossover adapter) |
| **D — Long tail** | RC-8, RC-9 | FFU multi-compound, CJ16050 non-monotonic. Narrow scope, low urgency. **Both deep research landed.** | ~2 weeks |
| **Parallel (separate agent)** | RC-1 (TK normalization scope) | TX/TS vocabulary normalization — TK detection execution in progress. Dose parsing, study type routing values, control detection normalization share the same cascading-signal architecture. | In progress |
| **Data** | HCD seed acquisition | 835 rows loaded (cynomolgus, rabbit, Wistar Han). SD rat + beagle dog pending extraction. Extends species/strain coverage for A-3 factor. | In progress |

**Note:** RC-2 (pipeline routing) is NOT a standalone phase. It is built as part of RC-4 — when the crossover pipeline exists, routing becomes a real requirement. Building routing before there are different pipelines to route to is ceremony.

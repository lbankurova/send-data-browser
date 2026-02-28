# Species Profiles

Every place in the analysis engine where scientific logic depends on species or strain. Companion to `vehicle-profiles.md` (vehicle/route) and follows the same conventions as `dependencies.md` and `methods.md`.

**Lookup axes:**
- This file: lookup key is an animal (DM.SPECIES + DM.STRAIN)
- `vehicle-profiles.md`: lookup key is a substance (TS.VEHICLE) or route (EX.EXROUTE)

---

## Audit Results (2026-02-20)

### Found in codebase

1. **Species read from SEND:** YES. Backend `xpt_processor.py` extracts `TS.TSPARMCD="SPECIES"` → `StudyMetadata.species`. Frontend receives via API → `StudyContext.species`. Fallback: if TS missing, reads from `DM.SPECIES`. Backend tracks provenance (`species_source: "TS" | "DM"`).

2. **Strain read from SEND:** YES. Backend extracts `TS.TSPARMCD="STRAIN"` → `StudyMetadata.strain`. Fallback from `DM.STRAIN`. Provenance tracked (`strain_source: "TS" | "DM"`). Frontend: `StudyContext.strain`.

3. **Species used in analysis logic (7 places):**
   - `parse-study-context.ts:deriveECGInterpretation()` — species-branched QTc translational relevance (rodent=false, dog=VanDeWater, NHP=Fridericia)
   - `syndrome-interpretation.ts:checkSpeciesPreferredMarkers()` — REM-11 rat-specific markers (GLDH, SDH, KIM-1, CLUSTERIN, bile acids, troponins)
   - `syndrome-interpretation.ts:assessHumanNonRelevance()` — alpha-2u-globulin nephropathy (male rats only), PPARa agonism (rodents), TSH-mediated thyroid tumors (rodents)
   - `syndrome-interpretation.ts:normalizeSpecies()` — normalizes species strings for concordance lookups ("rat", "dog", "mouse", "monkey", "rabbit")
   - `syndrome-interpretation.ts` — concordance data (Liu & Fan 2026) keyed by normalized species for SOC and PT LR+ lookups
   - `syndrome-interpretation.ts` — Fischer 344 strain caveat note (~38% male MCL background)
   - `pk_integration.py:KM_TABLE` — HED conversion factors per species (Km scaling)

4. **Strain used in analysis logic (2 places):**
   - `mock-historical-controls.ts` — HCD data scoped to "SPRAGUE-DAWLEY" with 4-tier matching cascade (strain+species → species-only → duration fallback → any)
   - `syndrome-interpretation.ts` — Fischer 344 strain-specific caveat note

5. **Magnitude floors (Cohen's d):** Universal 0.5/1.0/1.5/2.0 across all species. No species-specific thresholds.

6. **Lab rule thresholds:** Universal fold-change cutoffs. `speciesApplicability` field exists on lab rules ("nonclinical" | "clinical" | "both") but no per-species threshold branching.

7. **Controlled terminology (YAML):** 18 species, hierarchical strain structure per species (SD/Wistar/F344/Long-Evans/Lewis/Zucker/Wistar Han for rat; CD-1/C57BL-6/BALB-C/ICR for mouse; etc.).

8. **A-3 HCD factor (ECETOC):** Always "no_hcd" (hard-coded). HCD matching is implemented locally in `mock-historical-controls.ts` but not integrated into formal ECETOC A-factor scoring.

### Confirmed absent

- No REM-11 preferred markers for dog, mouse, monkey, or rabbit (only rat configured)
- No species-specific magnitude floors
- No adaptive lab rule thresholds per species (fold-change cutoffs uniform)
- No clinical observation species gating (chromodacryorrhea listed for XS08 but not gated to rodent-only)
- No species-specific HCD incidence ranges beyond Crl:CD(SD) rat
- No strain-specific syndrome rules (only narrative caveats)
- No species-specific hematology baseline adjustments
- No A-3 integration with HCD match result

---

## Part I: Species

### SPECIES-01 — Rat (Rattus norvegicus)

**Status:** Primary. Most thresholds, biomarker lists, and interpretation rules calibrated for rat. See strain entries in Part II for within-species stratification.

**HED scaling:** Km=6, conversion factor=6.2. Source: @depends FDA-KM-SCALING. Implementation: `pk_integration.py:KM_TABLE["RAT"]`.

**Concordance:** SOC LR+ in concordance-v0 data ("rat" key); PT LR+ includes rat-specific entries. Source: @depends LIU-FAN-2026. Implementation: `syndrome-interpretation.ts:normalizeSpecies()` → concordance lookup.

#### Preferred biomarkers — hepatotoxicity (rat-specific)

| Marker | Rat-specific rationale | Engine use |
|---|---|---|
| SDH (sorbitol dehydrogenase) | More liver-specific than ALT in rat; ALT has muscle and RBC sources in rat | Supporting term in XS01 (REM-11) |
| GLDH (glutamate dehydrogenase) | Mitochondrial enzyme; high liver specificity in rat | Supporting term in XS01 (REM-11) |
| ALT/AST | Accepted rat hepato markers; less specific than SDH/GLDH | Required terms in XS01 |

In dog, ALT specificity is higher and SDH/GLDH are not standard markers. In monkey, similar to dog. Engine currently applies rat-specific marker logic (REM-11) regardless of species — stub for non-rat.

#### Preferred biomarkers — nephrotoxicity (rat-specific)

| Marker | Regulatory status | Applies to other species? |
|---|---|---|
| KIM-1 | FDA/EMA DDT-qualified for rat | No — rat only |
| Clusterin | FDA/EMA DDT-qualified for rat | No — rat only |
| Urinary albumin | FDA/EMA DDT-qualified for rat | No — rat only |
| Cystatin C | Cross-species, less rat-specific | Partially |

When these are absent from a rat study, REM-11 emits "preferred markers not measured" and may cap XS03 certainty. For non-rat species, these qualifications do not apply and this note should not fire.

#### Preferred biomarkers — cholestasis (rat-specific)

| Marker | Rat-specific rationale | Engine use |
|---|---|---|
| Bile acids (TBA) | GGT is virtually undetectable in healthy rats; bile acids are more sensitive | Supporting term in XS02 (REM-11) |

#### Preferred biomarkers — cardiac (rat-specific)

| Marker | Rationale | Engine use |
|---|---|---|
| cTnI / cTnT (cardiac troponins) | Improves certainty for structural cardiac damage in rats | Supporting term in XS10 (REM-11) |

#### ALP bone isoform confound (rat-specific, age-dependent)

In young rats (up to approximately 6 months), the bone isoform dominates circulating ALP. ALP elevation alone is therefore unreliable as a cholestasis marker in rat without GGT or 5NT confirmation. This is the scientific basis for XS02's compound required logic `ALP AND (GGT OR 5NT)`.

Dog has a steroid-induced ALP isoform confound (different mechanism, same compound-logic solution). Monkey and mouse have less pronounced isoform confounds.

Age at study start is available in SEND (DM.BRTHDTC or DM.AGE) but is not currently consumed by the engine for this purpose. See Open Questions.

#### QTc translational limitation (rodent-specific)

Rat heart rate 300-500 bpm makes QTc correction unreliable as a human proarrhythmic predictor. ICH S7B exempts rodent studies from the same QTc documentation requirements as non-rodent studies (@depends ICH-S7B). Implementation: `parse-study-context.ts:deriveECGInterpretation()` returns `qtcTranslationallyRelevant: false` for rodent species.

#### Chromodacryorrhea (rat-only clinical observation)

Reddish periocular discharge from the Harderian gland. Classified as a Tier 3 CL observation in XS08 stress response. Not applicable to dog, monkey, or mouse — those species lack Harderian gland secretion. Currently not species-gated in the CL observation catalog; will fire incorrectly for non-rat studies if those species are ever loaded.

#### Human non-relevance mechanisms (rodent)

Three well-established mechanisms produce tumors in rodents but are not considered relevant to human risk:
1. **PPARa agonism** — hepatocellular tumors in rodents (rodent-specific receptor density). Implementation: `syndrome-interpretation.ts:assessHumanNonRelevance()`.
2. **TSH-mediated thyroid tumors** — follicular cell tumors from sustained TSH elevation. Implementation: same function.
3. **alpha-2u-globulin nephropathy** — kidney tumors in male rats only (protein absent in humans). Implementation: gated on `isMaleRat`.

---

### SPECIES-02 — Dog (Canis lupus familiaris, Beagle)

**Status:** Concordance weights available. Magnitude floors, preferred biomarker lists, and background lesion rates are stubs — rat values used as proxy.

**HED scaling:** Km=20, conversion factor=1.8. Source: @depends FDA-KM-SCALING. Implementation: `pk_integration.py:KM_TABLE["DOG"]`.

**Concordance:** SOC LR+ in concordance-v0 data ("dog" key); PT LR+ includes dog-specific entries (hyperphagia LR+ 230.8, hypercalcemia LR+ 98.2). Source: @depends LIU-FAN-2026.

**ECG interpretation:** `qtcTranslationallyRelevant: true`, preferred correction: Van de Water. Dog QTc is the gold-standard non-clinical model for human QT risk. Implementation: `parse-study-context.ts:deriveECGInterpretation()`.

#### Known differences from rat that affect engine logic

| Parameter | Dog reality | Current engine assumption | Action needed |
|---|---|---|---|
| ALP isoform | Steroid-induced (not bone) | Rat bone-isoform rationale used | Dog-specific XS02 interpretation note |
| Emesis | Vomiting reflex intact; rat lacks it | Not species-gated in CL catalog | CL catalog needs dog-specific emesis handling |
| QTc | High translational value (opposite of rat) | Correctly species-gated | No code change needed |
| GI concordance | SOC LR+ 4.5 vs rat 2.5 | Handled in concordance JSON | No code change needed |
| Cardiac concordance | SOC LR+ 3.5 vs rat 2.5 | Handled in concordance JSON | No code change needed |
| SDH/GLDH preferred markers | Not standard in dog | Rat REM-11 list applied | REM-11 marker list needs species branch |
| KIM-1/clusterin | Not FDA/EMA-qualified for dog | Rat REM-11 qualification note may fire | REM-11 must gate on species before emitting qualification note |

**Stubs:** Magnitude floors (minG, minFcDelta), organ weight reference ranges, background spontaneous lesion incidence rates, hematology reference ranges.

---

### SPECIES-03 — Cynomolgus Monkey (Macaca fascicularis)

**Status:** Concordance weights available. All thresholds and biomarker lists stubbed — rat values used as proxy.

**HED scaling:** Km=12, conversion factor=3.1. Source: @depends FDA-KM-SCALING. Implementation: `pk_integration.py:KM_TABLE["MONKEY"]`.

**Concordance:** Highest immune system SOC LR+ of all species (6.0). Metabolic disorder PT LR+ 217.4 (monkey-specific). Source: @depends LIU-FAN-2026.

**ECG interpretation:** `qtcTranslationallyRelevant: true`, preferred correction: Fridericia. Implementation: `parse-study-context.ts:deriveECGInterpretation()`.

#### Known differences from rat relevant to engine

| Parameter | Monkey reality | Engine impact |
|---|---|---|
| HPA axis cortisol variability | Higher baseline than rat | XS08 stress response may over-fire |
| KIM-1/clusterin qualification | Not FDA/EMA DDT-qualified for monkey | REM-11 qualification note must not fire |
| Immune concordance | SOC LR+ 6.0 | Handled in JSON |
| Supplier source (Cambodia/Vietnam/Mauritius) | Affects baseline lymphocyte counts | Not modeled; see STRAIN-03-CYN |

**Stubs:** All magnitude floors, all background lesion rates, all hematology reference ranges, preferred biomarker lists.

---

### SPECIES-04 — Mouse (Mus musculus)

**Status:** Immune-mediated hepatitis concordance data available. All thresholds and biomarker lists stubbed — rat values used as proxy.

**HED scaling:** Km=3, conversion factor=12.3. Source: @depends FDA-KM-SCALING. Implementation: `pk_integration.py:KM_TABLE["MOUSE"]`.

**Concordance:** Immune-mediated hepatitis PT LR+ 462.4 (mouse-specific, highest value in LIU-FAN-2026 dataset). Hepatobiliary SOC LR+ 5.0. Source: @depends LIU-FAN-2026.

#### Known differences from rat relevant to engine

| Parameter | Mouse reality | Engine impact |
|---|---|---|
| Immune-mediated hepatitis signal | Exceptionally high concordance | Already in JSON; translational tier correct |
| Cardiac concordance | SOC LR+ 1.5 (lowest across species) | Already in JSON |
| KIM-1/clusterin | Not FDA/EMA DDT-qualified for mouse | REM-11 note must not fire |

**Stubs:** All magnitude floors, background lesion rates, hematology reference ranges. Strain-level stratification in Part II (CD-1 vs C57BL/6).

---

### SPECIES-05 — Rabbit (Oryctolagus cuniculus)

**Status:** Minimal concordance data. All thresholds stubbed — rat values used as proxy.

**HED scaling:** Km=12, conversion factor=3.1. Source: @depends FDA-KM-SCALING. Implementation: `pk_integration.py:KM_TABLE["RABBIT"]`.

**Concordance:** All SOC LR+ 1.5-2.5 (lowest across all species). Cerebellar ataxia to seizure cross-term LR+ 10.9. Source: @depends LIU-FAN-2026.

**Stubs:** All magnitude floors, all background lesion rates, all biomarker lists, all hematology reference ranges. Least characterized species in engine.

---

## Part II: Strains

### Preamble

Strain stratification matters most for three engine components:

1. **A-3 HCD comparison (METRIC-08):** Currently always scores 0 ("no_hcd") because `mock-historical-controls.ts` is the only HCD source and it is hardcoded to Crl:CD(SD). When real HCD is integrated, the lookup key must be `{species, strain, supplier, sex, age_range}`. A-3 cannot score above 0 until strain is surfaced from `DM.STRAIN` or `TS.STSTRAIN` in the study context.

2. **CLASS-11 protective signal:** Background incidence rates for spontaneous lesions (used to classify treatment-related decreases as pharmacological vs. background) are currently stubs. These rates differ substantially between strains, especially for SD vs Wistar vs F344 rat.

3. **Magnitude floors and lab rule thresholds:** Currently species-level only. Within-species strain differences in baseline variance could justify strain-specific floors in the future, though this is lower priority than HCD stratification.

**SEND fields:** `DM.STRAIN` (animal-level) and `TS.STSTRAIN` (study-level). Both are in the SEND domain model. The audit confirms both fields reach the study context object in the engine. The 4-tier HCD matching cascade in `mock-historical-controls.ts` already uses strain for Tier 1-2 matching.

---

### STRAIN-01-SD — Rat, Sprague-Dawley (Crl:CD(SD), HsdBrl:WIST(SD))

**Status:** HCD organ weight ranges available (Phase 1). `shared/hcd-reference-ranges.json` has `Hsd:Sprague Dawley` strain with 10 organs × 2 sexes × 2 durations (Envigo C11963, n=20). Alias resolution via `hcd.py` supports SD, SPRAGUE-DAWLEY, SPRAGUE DAWLEY, Hsd:Sprague Dawley SD.

**Common suppliers:** Charles River (Crl:CD(SD)), Envigo (HanBrl:WIST(SD)). Supplier-within-strain variation exists; CRL and Envigo SD have documented HCD differences — see Open Questions.

#### Background profile and engine impact

| Parameter | SD characteristic | Engine impact if pooled with other strains |
|---|---|---|
| Spontaneous hepatocellular adenoma | Lower than Wistar | XS01 false-positive rate artificially elevated if Wistar HCD used |
| Body weight gain | Faster, heavier terminal body weight than Wistar | BW percent-change thresholds reference SD-specific baselines |
| Mammary gland adenoma (females) | Higher spontaneous rate | Protective signal classifier needs SD female HCD; may under-flag without it |
| Mononuclear cell leukemia (MCL) | High spontaneous rate, increases with age in males | Spleen weight and WBC changes may be spontaneous; treatment-relatedness confounded without SD HCD |
| Pituitary adenoma | High background | MI pituitary findings confounded without strain HCD |
| Chronic progressive nephropathy (CPN) | Increases with age, especially males | Renal endpoints NOAEL may be underestimated if CPN contribution not HCD-compared |

**HCD integration note:** When `mock-historical-controls.ts` is replaced, data must be keyed by `{species: "rat", strain: "SD", supplier, sex, age_weeks}`. The A-3 factor implementation must match on `DM.STRAIN` from study data.

---

### STRAIN-01-WI — Rat, Wistar (HsdBrl:WH, HanWistar)

**Status:** STUB. No validated HCD in engine. SD background rates used as proxy.

#### Background differences from SD

| Parameter | Wistar difference vs SD | Engine impact |
|---|---|---|
| Hepatocellular adenoma | Higher spontaneous rate | XS01 certainty may be inflated if SD HCD applied |
| Body weight | Lighter than SD at same age | BW percent-change denominators differ |
| Testicular atrophy | Lower spontaneous background | Reproductive syndrome NOAEL threshold differs |
| Pituitary adenoma | Lower than SD | MI pituitary finding classification may differ |

**Stubs:** All background lesion rates, all hematology reference ranges.

---

### STRAIN-01-F344 — Rat, Fischer 344

**Status:** STUB. No validated HCD in engine. SD background rates used as proxy. High-priority gap: F344 is commonly used in carcinogenicity studies, where background tumor rates make HCD essential.

**Engine caveat:** `syndrome-interpretation.ts` emits a Fischer 344-specific note when strain includes "FISCHER" or "F344": "Fischer 344 rats have high background mononuclear cell leukemia (~38% males). May inflate adverse effect burden; evaluate causality carefully."

#### Background differences — high spontaneous tumor and disease rates

| Parameter | F344 characteristic | Engine impact |
|---|---|---|
| Mononuclear cell leukemia | >80% incidence in aged males | WBC and spleen weight changes likely spontaneous; treatment-relatedness essentially requires F344 HCD |
| Testicular interstitial cell tumors | >90% aged males | Reproductive findings heavily confounded without F344 HCD |
| Pituitary adenoma | Very high background (>80% aged animals) | MI pituitary findings unreliable without F344-specific HCD |
| Hepatocellular adenoma/carcinoma | High background | XS01 NOAEL confounded; translational scoring unreliable |

**F344 engine flag:** For studies where `DM.STRAIN` = F344 and HCD is absent (A-3 = no_hcd), the engine should surface a study-level warning. Currently partially implemented (caveat note exists but not gated on HCD availability).

**Stubs:** All background lesion rates, all hematology reference ranges.

---

### STRAIN-01-HAN — Rat, Han Wistar (HsdBrl:WH)

**Status:** HCD organ weight ranges available (Phase 1+). `shared/hcd-reference-ranges.json` has `Crl:WI(Han)` strain with 7 organs × 2 sexes, 90-day only (NTP TR-587/591/593 composite, n=30). Aliases: WISTAR HAN, WISTAR, WIST, RccHan:WIST, WI(HAN), HANNOVER WISTAR, HAN WISTAR. 28-day data not yet available. NTP panel does not include brain, adrenal, ovaries, epididymides, or pituitary. Kidney and testis are right-side only (NTP convention). Similar to Wistar but with some documented background differences, particularly lower spontaneous kidney disease incidence.

---

### STRAIN-02-BGL — Dog, Beagle

**Status:** STUB. Only one strain used in regulatory tox; strain-level stratification is not meaningful here.

---

### STRAIN-03-CYN — Monkey, Cynomolgus (Macaca fascicularis)

**Status:** STUB. Geographic source (Cambodian, Vietnamese, Chinese, Mauritian) affects baseline immune activation, lymphocyte counts, and parasite burden. Not modeled. When monkey studies are common enough to warrant HCD, source population should be a lookup dimension alongside strain.

---

### STRAIN-04-CD1 — Mouse, CD-1 (outbred)

**Status:** STUB. Most common regulatory tox mouse strain.

---

### STRAIN-04-B6 — Mouse, C57BL/6 (inbred)

**Status:** STUB. Known to have higher baseline hepatic enzyme variability than CD-1 and different immune activation profile. The immune-mediated hepatitis LR+ 462.4 from LIU-FAN-2026 may be outbred-strain-specific; not confirmed for C57BL/6.

---

## Open Questions

1. **Strain field reliability in SEND submissions:** Is `DM.STRAIN` or `TS.STSTRAIN` consistently populated in submitted SEND packages from sponsor companies, or is it frequently missing or free-text? The A-3 HCD factor can only be strain-stratified if this field is reliably present. Fallback strategy needed: species-level pooled HCD with a degraded-comparison flag when strain is missing or unrecognized.

2. **Supplier within strain:** CRL Sprague-Dawley and Envigo Sprague-Dawley have documented HCD differences (body weight trajectories, some lesion rates). Is supplier available in SEND study data, and should it be a dimension in the HCD lookup key, or is strain-level stratification sufficient?

3. **Age-at-start and ALP bone isoform:** The bone-ALP confound in rat is age-dependent and most pronounced in animals younger than 3-4 months at study start. DM.BRTHDTC or DM.AGE is available in SEND. Should the engine gate the XS02 bone-isoform interpretation note on computed age-at-study-start, or is a blanket rat-species gate sufficient given most regulatory studies use young adults?

4. **F344 warning threshold:** At what point should the engine surface the F344 high-background warning? Only on carcinogenicity studies (DM study type), or on all F344 studies regardless of duration?

5. **Han Wistar vs Wistar stratification:** HanWistar (HsdBrl:WH) is sometimes treated as a separate strain from conventional Wistar due to Harlan breeding history. Does this distinction matter enough for separate STRAIN entries, or is pooling under STRAIN-01-WI acceptable?

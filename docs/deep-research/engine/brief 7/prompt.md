# Brief 7: Organ × Finding × Species Recovery Duration Lookup Table

## Research objective

Produce a **machine-readable recovery duration lookup table** — keyed by organ, finding type, species, and severity — grounded in published toxicologic pathology literature. This replaces the current system's unvalidated placeholder values that were authored without any literature citations.

The system currently uses flat, organ-agnostic recovery timelines (e.g., "all adaptive findings = 6 weeks regardless of organ or species") and a fixed `±2 week` uncertainty window. These values directly drive clinical decisions:

1. **"Expected to reverse within X–Y weeks"** — displayed to pathologists in the Recovery pane
2. **Recovery duration adequacy assessment** — flags whether a study's recovery period was long enough to observe expected recovery for a given finding
3. **ASSESSMENT_LIMITED_BY_DURATION classification** — a formal verdict that the study design was insufficient to assess reversibility
4. **Persistence warnings** — alerts when findings persist beyond expected recovery timelines

If the numbers are wrong, every recovery assessment in the system inherits that error. This is not a cosmetic issue — it directly affects whether a pathologist trusts or dismisses a "persistent" verdict.

## What's currently hardcoded (the values to validate or replace)

### Base recovery weeks by finding type (no organ/species differentiation)

| Finding type | Current base weeks | Current reversibility | Source |
|---|---|---|---|
| Hyperplasia | 6 | High (expected) | **None — placeholder** |
| Hypertrophy | 6 | High (expected) | **None — placeholder** |
| Vacuolation | 6 | High (expected) | **None — placeholder** |
| Basophilia | 4 | High (expected) | **None — placeholder** |
| Glycogen depletion | 6 | High (expected) | **None — placeholder** |
| Pigmentation | 6 | High (expected) | **None — placeholder** |
| Inflammation | 8 | Moderate (possible) | **None — placeholder** |
| Granuloma | 8 | Moderate (possible) | **None — placeholder** |
| Necrosis | 8 | Moderate (possible) | **None — placeholder** |
| Degeneration | 10 | Moderate (possible) | **None — placeholder** |
| Atrophy | 10 | Moderate (possible) | **None — placeholder** |
| Mineralization | 13 | Low (unlikely) | **None — placeholder** |
| Hemorrhage | 4 | Moderate (expected) | **None — placeholder** |
| Congestion | 2 | High (expected) | **None — placeholder** |
| Decreased spermatogenesis | 16 | Low (unlikely) | **None — placeholder** |
| Fibrosis | — | None (irreversible) | **None — placeholder** |
| All neoplasia | — | None (irreversible) | Standard (reasonable) |

### Severity modulation multipliers (also unvalidated)

| Finding nature | Low severity (≤2) | Mid severity (3) | High severity (≥4) |
|---|---|---|---|
| Adaptive | 1.0× | 1.5× | 2.0× |
| Inflammatory | 1.0× | 1.3× | 2.0× |
| Degenerative | 1.0× | 1.6× | 2.5× |
| Vascular | 1.0× | 1.5× | 2.0× |
| Depositional | 1.0× | 1.0× | 1.0× |

### Fixed ±2 week uncertainty window

The system displays recovery timelines as a range (e.g., "4–8 weeks") by subtracting and adding 2 weeks from the base estimate, regardless of the base value. A 2-week finding and a 16-week finding both get ±2 weeks — this seems wrong.

## Specific deliverables

### 1. Organ × finding type recovery duration table

For each combination below, provide **expected recovery duration in weeks** with literature citation. "Recovery" means return to control-comparable levels (incidence = 0 or severity reduction to minimal/background), not necessarily complete histological normalization.

**Priority organs (account for >80% of treatment-related findings in repeat-dose studies):**

| Organ | Key finding types to cover |
|---|---|
| Liver | Hepatocellular hypertrophy, hepatocellular necrosis, hepatocellular vacuolation, bile duct hyperplasia, inflammation (portal/lobular), Kupffer cell hypertrophy/hyperplasia, glycogen depletion |
| Kidney | Tubular degeneration/necrosis, tubular basophilia, tubular dilatation, interstitial inflammation, interstitial nephritis, mineralization, cast formation |
| Thyroid | Follicular cell hypertrophy, follicular cell hyperplasia, colloid alteration |
| Adrenal | Cortical hypertrophy, cortical vacuolation, medullary hyperplasia |
| Spleen | Increased extramedullary hematopoiesis, lymphoid depletion, congestion, hemosiderosis |
| Thymus | Cortical atrophy/lymphoid depletion, increased apoptosis |
| Testes | Decreased spermatogenesis, germ cell degeneration, seminiferous tubule atrophy, Leydig cell hypertrophy |
| Bone marrow | Hypocellularity, myeloid depletion, erythroid depletion, increased cellularity |
| Stomach | Mucosal hyperplasia, erosion, ulceration (glandular vs. forestomach) |
| Heart | Cardiomyocyte degeneration/necrosis, inflammation, fibrosis |
| Lung | Alveolar macrophage accumulation, inflammation, alveolar epithelial hyperplasia |
| Lymph nodes | Hyperplasia (follicular, paracortical), sinus histiocytosis, atrophy |
| Injection site | Inflammation, necrosis, fibrosis, granuloma |

**For each cell, provide:**
- Expected recovery duration range (weeks): low–high
- Reversibility qualifier: expected / possible / unlikely / none
- Whether duration changes with severity grade (and if so, how)
- Whether duration differs between rat and dog (the two most common preclinical species)
- Literature citation (author, year, journal — or regulatory guideline reference)
- Key conditions/caveats (e.g., "only if stimulus removed," "depends on extent of stem cell damage")

### 2. Species-specific recovery rate modifiers

Do rats, mice, dogs, and NHPs recover from the same lesion at different rates? If so, provide species-specific multipliers or separate duration tables. Key questions:

- **Liver regeneration:** Rats are known for rapid hepatic regeneration. Is liver recovery meaningfully faster in rats (days) vs. dogs (weeks)?
- **Testicular recovery:** Spermatogenic cycle length is species-specific (~52 days rat, ~62 days dog, ~74 days human). Does this translate directly to recovery timeline differences?
- **Thymic recovery:** Young rodents regenerate thymus rapidly after stress-induced involution. Is this different in dogs?
- **Renal recovery:** Rat kidney has higher background CPN. Does this affect recovery timeline interpretation?
- **Bone marrow:** Rodent bone marrow turnover is faster than large animals. Does this affect hematopoietic recovery timelines?

### 3. Severity-graded recovery modulation — is it real?

The system assumes higher severity = longer recovery (multipliers 1.0× to 2.5×). Validate or refute:

- Is there published evidence that severity grade (minimal → mild → moderate → marked → severe, per STP/INHAND convention) correlates with recovery duration?
- Is the relationship linear, or is there a threshold above which recovery becomes qualitatively different (e.g., "marked necrosis" is irreversible but "mild necrosis" reverses in 4 weeks)?
- Are the specific multiplier values (1.5× for mid-severity, 2.0–2.5× for high-severity) defensible, or should they be different?
- Does severity interact with organ (e.g., mild renal tubular degeneration reverses, but marked does not — while marked hepatocellular necrosis can still reverse)?

### 4. Uncertainty range — should it scale?

The current `±2 weeks` fixed window produces:
- Congestion: 0–4 weeks (floor clamped to 1) — range = 3 weeks on a 2-week base = 150% uncertainty
- Decreased spermatogenesis: 14–18 weeks — range = 4 weeks on a 16-week base = 25% uncertainty

This is inconsistent. Should the uncertainty range be:
- A fixed percentage of the base estimate (e.g., ±30%)?
- Based on published inter-study variability for that finding type?
- Asymmetric (faster recovery is less common than slower)?
- Organ-dependent?

Provide a recommendation with rationale.

### 5. Continuous endpoint recovery timelines (non-histopathology)

The system also assesses recovery for continuous endpoints (organ weights, clinical pathology, body weight). Currently these have NO recovery duration expectations at all. Provide guidance for:

| Endpoint type | Examples | Expected recovery timeline | Notes |
|---|---|---|---|
| Organ weight changes | Liver weight ↑, thymus weight ↓, testes weight ↓ | ? | Depends on underlying pathology |
| Clinical chemistry | ALT ↑, AST ↑, BUN ↑, creatinine ↑, bilirubin ↑ | ? | Functional recovery may precede structural |
| Hematology | RBC ↓, WBC ↓, platelets ↓, reticulocytes ↑ | ? | Bone marrow regeneration rate |
| Body weight | Body weight ↓ (≥10% deficit) | ? | Depends on cause (palatability vs. toxicity) |
| Coagulation | PT ↑, APTT ↑, fibrinogen ↑ | ? | Factor turnover rates |

## Key sources to investigate

### Textbooks (primary sources for recovery timelines)

- **Greaves P. (2012)** *Histopathology of Preclinical Toxicity Studies: Interpretation and Relevance in Drug Safety Evaluation*, 4th ed. Academic Press. — Chapter-by-chapter organ coverage with reversibility discussions. This is likely the single most comprehensive source. Check each organ chapter for explicit recovery timeline statements.
- **Haschek WM, Rousseaux CG, Wallig MA. (2013)** *Haschek and Rousseaux's Handbook of Toxicologic Pathology*, 3rd ed. Academic Press. — Organ-specific chapters with recovery data.
- **Boorman GA, Eustis SL, Elwell MR, et al. (1990)** *Pathology of the Fischer Rat: Reference and Atlas.* Academic Press. — F344-specific recovery baselines.

### STP/ESTP position papers (peer-reviewed consensus)

- **Kerlin R et al. (2016)** "Scientific and Regulatory Policy Committee (SRPC) Points to Consider: Histopathologic Evaluation in Safety Assessment Studies" — *Toxicol Pathol* 44:971-987. Recovery group recommendations.
- **Crissman JW et al. (2004)** "Best Practices Guideline: Toxicologic Histopathology" — *Toxicol Pathol* 32:126-131. Recovery period design guidance.
- **Sellers RS et al. (2007)** "Society of Toxicologic Pathology Position Paper: Organ Weight Recommendations for Toxicology Studies" — *Toxicol Pathol* 35:751-755. Organ weight recovery expectations.
- **Creasy DM et al. (2012)** "Proliferative and Nonproliferative Lesions of the Rat and Mouse Male Reproductive System" — *Toxicol Pathol* 40:40S-121S. Spermatogenesis cycle and testicular recovery.
- **Dixon D et al. (2014)** (STP female reproductive pathology) — Ovarian/uterine recovery timelines.
- **Everds NE et al. (2013)** "Interpreting Stress Responses during Routine Toxicity Studies" — *Toxicol Pathol* 41:560-614. Thymic/adrenal/lymphoid recovery from stress.
- **Reagan WJ et al. (2011)** "Best Practices for Evaluation of Bone Marrow in Nonclinical Toxicity Studies" — *Toxicol Pathol* 39:435-448. Hematopoietic recovery timelines.

### Regulatory guidelines

- **ICH M3(R2)** — Guidance on recovery group design (duration recommendations relative to dosing period)
- **ICH S2/S4/S5/S6** — Study-type-specific recovery period requirements
- **OECD TG 407** (28-day repeat dose) — §11: "Satellite group of 5 animals per sex per group may be treated for 28 days and observed for recovery for a further 14 days." Is 14 days (2 weeks) sufficient? For which findings?
- **OECD TG 408** (90-day repeat dose) — Recovery satellite specifications
- **OECD TG 452/453** (chronic/carcinogenicity) — Any recovery period guidance?
- **EPA OPPTS 870.3100** — 90-day oral toxicity: recovery group recommendations
- **FDA Guidance for Industry: Nonclinical Safety Evaluation** — Recovery period expectations

### Specific organ recovery literature

- **Michalopoulos GK, DeFrances MC (1997)** "Liver Regeneration" — *Science* 276:60-66. Hepatic regeneration kinetics.
- **Mehendale HM (2005)** "Tissue repair: An important determinant of final outcome of toxicant-induced injury" — *Toxicol Pathol* 33:41-51. Tissue-specific repair capacity.
- **Capen CC (1997)** — Thyroid follicular cell recovery (rodent-specific TSH response, recovery after enzyme inducer withdrawal)
- **Hard GC, Khan KN (2004)** — CPN and renal recovery in rats
- **Lenz B et al. (2018)** — ESTP 5th workshop: Phospholipidosis/vacuolation reversibility
- **Rosol TJ et al. (2001)** — Adrenal gland recovery patterns
- **Hall AP et al. (2012)** — Liver weight and hepatocellular hypertrophy recovery (enzyme induction cessation)

### INHAND nomenclature monographs (may contain reversibility notes)

The INHAND (International Harmonization of Nomenclature and Diagnostic Criteria) organ-system monographs published in *Toxicologic Pathology* sometimes include notes on expected reversibility. Check:
- Liver INHAND (Thoolen et al. 2010)
- Kidney INHAND (Frazier et al. 2012)
- Male reproductive INHAND (Creasy et al. 2012)
- Endocrine INHAND (Rosol et al. 2013)
- Hematolymphoid INHAND (Haley et al. 2005)

## What NOT to research

- **Neoplastic lesion reversibility** — neoplasms are irreversible; this is already correctly handled.
- **Compound-specific recovery** — we need generic, mechanism-agnostic timelines based on tissue biology, not drug-specific data.
- **Recovery study design** (how many animals, which doses to include in recovery groups) — this is a study design question, not a data interpretation question.
- **Recovery statistics** (how to compute recovery percentage or verdict) — already implemented and validated with 65+ tests.
- **PK/TK relationships** — half-life and exposure margins are important but out of scope for this morphological recovery table.

## Output format

### Primary deliverable: JSON lookup table

```json
{
  "recovery_duration_table": {
    "LIVER": {
      "hypertrophy_hepatocellular": {
        "base_weeks": { "low": 2, "high": 4 },
        "reversibility": "expected",
        "severity_modulation": {
          "minimal": 1.0,
          "mild": 1.0,
          "moderate": 1.3,
          "marked": 2.0,
          "severe": null
        },
        "species_modifier": {
          "rat": 1.0,
          "mouse": 1.0,
          "dog": 1.5,
          "nhp": 1.5
        },
        "conditions": "Requires cessation of inducing stimulus. Enzyme induction-type hypertrophy reverses faster (1-2 weeks) than direct toxicant-driven.",
        "sources": ["Hall 2012", "Greaves 2012 Ch.8"],
        "confidence": "high"
      },
      "necrosis_hepatocellular": {
        "base_weeks": { "low": 4, "high": 8 },
        "reversibility": "possible",
        "severity_modulation": {
          "minimal": 1.0,
          "mild": 1.0,
          "moderate": 1.5,
          "marked": 2.5,
          "severe": null
        },
        "species_modifier": {
          "rat": 0.8,
          "mouse": 0.8,
          "dog": 1.2,
          "nhp": 1.2
        },
        "conditions": "Massive/bridging necrosis may not reverse. Recovery depends on extent — zonal necrosis with intact reticulin framework can regenerate; confluent necrosis with reticulin collapse progresses to fibrosis.",
        "sources": ["Greaves 2012 Ch.8", "Mehendale 2005"],
        "confidence": "moderate"
      }
    },
    "KIDNEY": {
      "tubular_degeneration": { "..." : "..." }
    }
  },

  "uncertainty_model": {
    "method": "percentage_based",
    "default_range_pct": 30,
    "min_range_weeks": 1,
    "rationale": "...",
    "source": "..."
  },

  "continuous_endpoint_recovery": {
    "clinical_chemistry": {
      "ALT": { "base_weeks": { "low": 1, "high": 3 }, "notes": "..." },
      "AST": { "base_weeks": { "low": 1, "high": 3 }, "notes": "..." },
      "BUN": { "base_weeks": { "low": 2, "high": 4 }, "notes": "..." }
    },
    "hematology": {
      "RBC": { "base_weeks": { "low": 4, "high": 8 }, "notes": "Erythrocyte lifespan ~60d rat, ~110d dog" }
    },
    "organ_weights": {
      "liver_weight": { "base_weeks": { "low": 2, "high": 6 }, "notes": "Parallels hepatocellular hypertrophy resolution" }
    },
    "body_weight": {
      "base_weeks": { "low": 4, "high": 8 },
      "notes": "Depends on cause. Palatability: rapid. Metabolic toxicity: slower."
    }
  },

  "metadata": {
    "version": "1.0",
    "species_covered": ["rat", "mouse", "dog", "nhp"],
    "sources_consulted": ["..."],
    "limitations": "Generic timelines — actual recovery depends on compound, dose, duration, individual variation"
  }
}
```

### Secondary deliverable: Validation of existing values

A table comparing current system values against literature-supported values:

| Finding type | Current (weeks) | Literature (weeks) | Current correct? | Adjustment needed | Source |
|---|---|---|---|---|---|
| Adaptive / hypertrophy | 6 (4–8) | ? | ? | ? | ? |
| Necrosis | 8 (6–10) | ? | ? | ? | ? |
| Atrophy | 10 (8–12) | ? | ? | ? | ? |
| etc. | ... | ... | ... | ... | ... |

### Tertiary deliverable: Decision on severity modulation

A brief (half-page) recommendation on whether the current multiplier approach is supported, should be replaced with a threshold model (e.g., "above moderate severity, recovery becomes unlikely"), or should be organ-specific.

## Estimated scope

2–3 days. The liver, kidney, and testes sections are well-documented in the STP/INHAND literature. Thyroid and adrenal require cross-referencing with endocrine physiology. The continuous endpoint section (clinical pathology, organ weights) may require pulling from pharmacology/clinical references rather than pathology textbooks.

## Priority

**High.** This is GAP-23 in the project backlog. Every recovery verdict the system produces depends on these numbers. The current values may be in the right ballpark by coincidence, but without literature backing they cannot be defended to a regulatory reviewer. A pathologist seeing "expected to reverse within 4–8 weeks" will immediately ask "according to what source?" — and right now the answer is "none."

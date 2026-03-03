# Brief 8: Recovery Anomaly Discrimination — Delayed Onset vs. Spontaneous vs. True Anomaly

## Research objective

Produce a **machine-readable classification framework** for discriminating between three scenarios when a histopathology finding is absent in the main (terminal sacrifice) arm but present in the recovery arm. The current system labels all such cases as a blanket "anomaly" — this is too blunt. The actual possibilities are:

1. **Delayed onset** — Drug-initiated tissue damage that manifests histologically after a lag. The finding is treatment-related; its absence in the main arm reflects latency, not absence of causation.
2. **Spontaneous/incidental** — Background finding that happened to appear in recovery animals by chance. Not treatment-related.
3. **True anomaly** — Cannot be confidently classified as either. Requires pathologist adjudication.

This distinction matters because the downstream action is completely different: delayed onset findings are adverse and may require safety margin reassessment, spontaneous findings are ignored, and true anomalies need expert review. Currently all three get the same alarming "biologically implausible" label, which erodes trust in the system.

## Current system behavior

### Verdict level (per dose group)

Guard 2 in `computeVerdict()`:
```
if (main.incidence === 0 && main.affected === 0 && recovery.affected > 0)
  → "anomaly"
```

This fires for ANY finding absent in main but present in recovery, regardless of:
- Whether it's dose-related in recovery
- Whether the finding has known delayed-onset biology
- Whether related precursor findings exist in the main arm
- Whether the finding is common in historical controls
- How many recovery animals are affected (1/10 vs. 8/10)

### Classification level (across dose groups)

Two classification steps reference this pattern:

**PATTERN_ANOMALY** — fires when:
- Recovery incidence > main incidence × 1.5 at some dose
- Dose consistency is "Weak"
- Finding is non-adverse
- Output: "Recovery incidence exceeds treatment-phase incidence without dose-response support."

**DELAYED_ONSET_POSSIBLE** — fires when:
- Main incidence ≤ 10% and recovery incidence ≥ 20% at some dose
- Recovery affected ≥ 2
- Finding is non-adverse
- Output: "Finding absent or minimal during treatment phase but present during recovery."

Problems:
- Both require the finding to be non-adverse, but delayed onset of adverse findings is the most important scenario
- Neither uses dose-response within the recovery arm
- Neither considers finding biology (is this finding *known* to have delayed presentation?)
- Neither considers precursor findings in the main arm
- The PATTERN_ANOMALY label is applied to what could be legitimate delayed onset

## What we need from the research

### 1. Findings with known delayed-onset biology

Which histopathology findings are documented to appear after cessation of exposure, even when absent at terminal sacrifice? For each, provide:

- Finding name (INHAND/STP standardized terminology)
- Organ(s) where delayed onset is documented
- Typical latency (days/weeks from end of dosing to histological manifestation)
- Biological mechanism for the delay
- Whether a precursor finding is expected in the main arm (and what that precursor is)
- Literature citation

**Key categories to investigate:**

| Category | Examples | Mechanism hypothesis |
|---|---|---|
| Progressive degenerative sequelae | Fibrosis following necrosis, cirrhosis after chronic hepatocyte injury | Initial injury triggers repair cascade that overshoots or fails |
| Immune-mediated reactions | Delayed hypersensitivity, autoimmune responses | Immune priming during dosing, effector phase after lag |
| Proliferative responses | Hyperplasia/neoplasia following chronic stimulation | Mitotic lag — cells committed to division during dosing, manifest after |
| Hormonal cascade effects | Thyroid follicular changes after enzyme inducer withdrawal | TSH feedback loop takes weeks to re-equilibrate |
| Spermatogenic cycle effects | Germ cell depletion, tubular atrophy | Spermatogenic cycle ~52d rat — damage to stem cells manifests 1-2 cycles later |
| Phospholipidosis | Lamellar body accumulation | Slow lysosomal turnover — accumulation continues after drug clearance |
| Bone marrow recovery overshoot | Extramedullary hematopoiesis, reticulocytosis | Compensatory response to marrow suppression, peaks during recovery |
| Stress-related involution recovery | Thymic repopulation, adrenal cortical changes | HPA axis normalization after chronic stress |

### 2. Precursor finding map

When a finding appears in recovery but not main, what related findings in the main arm would support a delayed-onset interpretation? This is a directed graph of biological relationships:

```
Main arm finding → Recovery arm finding (delayed manifestation)
```

**Examples to validate or expand:**

| Main arm precursor | Recovery arm delayed finding | Organ | Mechanism | Confidence |
|---|---|---|---|---|
| Hepatocellular degeneration | Hepatocellular necrosis | Liver | Progressive cell death | High |
| Hepatocellular necrosis | Fibrosis, bile duct hyperplasia | Liver | Repair response | High |
| Tubular degeneration | Tubular necrosis, cast formation | Kidney | Progressive injury | High |
| Tubular necrosis | Interstitial fibrosis, tubular atrophy | Kidney | Repair/scarring | High |
| Germ cell degeneration | Decreased spermatogenesis, tubular atrophy | Testis | Spermatogenic cycle lag | High |
| Inflammation (acute) | Fibrosis, granuloma | Any | Chronic repair | Moderate |
| Follicular cell hypertrophy | Follicular cell hyperplasia | Thyroid | Continued TSH stimulation | Moderate |
| Lymphoid depletion | Lymphoid hyperplasia (rebound) | Thymus/spleen | Immune reconstitution | Moderate |
| Hepatocellular hypertrophy | Hepatocellular hyperplasia | Liver | Sustained mitogenic stimulus | Low |
| Alveolar macrophage accumulation | Interstitial fibrosis | Lung | Chronic inflammatory cascade | Low |

For each pair, provide:
- Strength of evidence (documented in literature vs. theoretically plausible)
- Whether the precursor must be at a specific severity threshold to predict the delayed finding
- Species differences (if any)
- Literature citations

### 3. Dose-response patterns in delayed onset

When delayed-onset findings are truly treatment-related, do they show dose-response in the recovery arm? Specifically:

- Is the incidence of delayed findings higher in high-dose recovery groups than low-dose recovery groups?
- Is the severity of delayed findings dose-related?
- Are there documented cases where delayed onset occurs at only one dose level (non-monotonic)?
- Can delayed onset occur at low doses but not high doses (inverse relationship due to high-dose cytotoxicity preventing the delayed response)?

This determines whether "dose-response in recovery arm" is a reliable discriminator.

### 4. Background incidence rates for common "anomaly" findings

Some findings flagged as "anomaly" (0% main → >0% recovery) may simply reflect normal background variation. For the common species (rat, mouse, dog), which findings have sufficient background incidence that seeing them in 1-2 out of 10 recovery animals is within normal sampling variation?

Provide guidance on:
- Which findings have >5% background incidence in common strains (Sprague-Dawley, Wistar, CD-1, Beagle)
- At what recovery-arm incidence (given typical group sizes of 5-10 animals) can a finding be dismissed as likely spontaneous
- Whether historical control data (when available) should override the anomaly classification

### 5. Recovery group size and statistical power for anomaly detection

The current system requires `recovery.examined >= 3` before assessing anomaly. With typical recovery group sizes of 5 animals/sex/group:

- What is the probability of observing 0/5 in main but ≥1/5 in recovery for a finding with true incidence X%?
- At what true incidence does this become unlikely enough to flag as treatment-related?
- Is there a principled threshold for "anomaly" that accounts for group size?

### 6. Discrimination algorithm

Based on the above evidence, propose a decision tree or scoring system for classifying "0 in main → >0 in recovery" findings. The algorithm should use available inputs:

**Available at verdict time (per dose group):**
- main.incidence, main.affected, main.n, main.examined
- recovery.incidence, recovery.affected, recovery.n, recovery.examined
- main.avgSeverity, main.maxSeverity
- recovery.avgSeverity, recovery.maxSeverity
- finding name (can look up finding nature/biology)
- organ/specimen name
- species
- dose level (can check if pattern is dose-related across groups)

**Available at classification time (across dose groups):**
- All per-dose verdicts and stats
- Whether finding is adverse vs. non-adverse
- Dose-response pattern strength
- Finding nature classification (adaptive/degenerative/etc.)
- Historical control incidence (when available)

**NOT available:**
- Individual animal tracking across arms (same animal main vs. recovery — recovery arms are separate animals in most designs)
- Time-to-onset data within the recovery period
- Compound PK/ADME data

Propose output categories:
```
delayed_onset          — strong evidence for treatment-related delayed effect
delayed_onset_possible — some evidence, but cannot rule out spontaneous
possible_spontaneous   — pattern consistent with background incidence
anomaly_unresolved     — insufficient evidence to classify, needs pathologist
```

For each output, specify:
- Which discriminators must be true
- Confidence level (and what drives it)
- Recommended action for the pathologist

## What NOT to research

- **Treatment-specific delayed onset** — we need generic, mechanism-agnostic rules based on tissue biology, not "drug X causes delayed Y"
- **Recovery study design** — how many animals, which doses to include in recovery groups
- **Statistical methods for recovery comparison** — already implemented with incidence ratios and severity ratios
- **Recovery duration timelines** — already covered in Brief 7
- **Neoplastic delayed onset** — carcinogenesis latency is a separate problem from repeat-dose recovery assessment

## Key sources to investigate

### Delayed onset / progressive lesions
- **Haschek WM, Rousseaux CG, Wallig MA (2013)** *Handbook of Toxicologic Pathology*, 3rd ed. — Look for "delayed", "progressive", "latent" in organ chapters
- **Greaves P (2012)** *Histopathology of Preclinical Toxicity Studies*, 4th ed. — Recovery group interpretation sections
- **Kerlin R et al. (2016)** STP SRPC Points to Consider — Recovery group evaluation guidance
- **Mann PC et al. (2012)** "International Harmonization of Toxicologic Pathology Nomenclature" — INHAND progression relationships

### Precursor–sequel relationships
- **Thoolen B et al. (2010)** INHAND Liver — Hepatocyte degeneration → necrosis → fibrosis progression
- **Frazier KS et al. (2012)** INHAND Kidney — Tubular injury progression cascade
- **Creasy DM et al. (2012)** INHAND Male Reproductive — Spermatogenic cycle and delayed depletion
- **Rosol TJ et al. (2013)** INHAND Endocrine — Thyroid/adrenal feedback dynamics
- **Dixon D et al. (2014)** INHAND Female Reproductive — Ovarian cycle effects

### Background incidence and historical control context
- **Keenan C et al. (2009)** "Best Practices for Use of Historical Control Data" — *Toxicol Pathol* 37:679-693
- **Crissman JW et al. (2004)** Best Practices Guideline — Historical control data in recovery interpretation
- **NTP Historical Control Database** — Background rates for common findings in B6C3F1 mice and F344 rats
- **Charles River / Envigo background data reports** — Strain-specific spontaneous lesion rates

### Immune-mediated delayed reactions
- **Descotes J (2006)** "Immunotoxicology: Role in the Safety Assessment of Drugs" — Delayed immune responses
- **Bugelski PJ et al. (2010)** — Delayed hypersensitivity and autoimmune reactions in preclinical studies

### Statistical considerations
- **Peto R et al. (1980)** — Statistical aspects of interpreting small-group incidence data
- **Haseman JK (1984)** "Statistical Issues in the Design, Analysis and Interpretation of Animal Carcinogenicity Studies" — Applicable to recovery group power analysis
- **Hothorn LA (2014)** Statistical methods for toxicology — Small-sample incidence comparison

## Output format

### Primary deliverable: JSON classification framework

```json
{
  "delayed_onset_findings": {
    "LIVER": {
      "fibrosis": {
        "known_precursors": ["necrosis", "inflammation"],
        "precursor_severity_threshold": 2,
        "typical_latency_weeks": { "low": 4, "high": 12 },
        "mechanism": "Post-necrotic scarring — hepatic stellate cell activation",
        "dose_response_expected": true,
        "species_notes": { "rat": "Faster fibrosis onset", "dog": "Slower but more progressive" },
        "confidence": "high",
        "sources": ["Greaves 2012 Ch.8", "Thoolen 2010"]
      }
    }
  },

  "precursor_map": [
    {
      "precursor": "hepatocellular_necrosis",
      "sequel": "fibrosis",
      "organ": "LIVER",
      "min_precursor_severity": 2,
      "expected_latency_weeks": { "low": 4, "high": 12 },
      "confidence": "high",
      "bidirectional": false,
      "sources": ["Thoolen 2010"]
    }
  ],

  "spontaneous_incidence_thresholds": {
    "rat_sprague_dawley": {
      "LIVER": {
        "vacuolation_hepatocellular": { "background_pct": 8, "note": "Common in aging SD rats" },
        "inflammation_portal": { "background_pct": 5, "note": "Low-grade portal inflammation is frequent" }
      }
    }
  },

  "discrimination_algorithm": {
    "inputs": ["dose_response_in_recovery", "precursor_in_main", "finding_delayed_onset_propensity", "recovery_incidence_magnitude", "historical_control_incidence", "severity_in_recovery"],
    "decision_tree": {
      "step_1": { "check": "precursor_in_main_arm", "if_true": "delayed_onset", "if_false": "step_2" },
      "step_2": { "check": "dose_response_in_recovery", "if_true": "delayed_onset_possible", "if_false": "step_3" },
      "step_3": "..."
    },
    "output_categories": {
      "delayed_onset": { "description": "...", "action": "..." },
      "delayed_onset_possible": { "description": "...", "action": "..." },
      "possible_spontaneous": { "description": "...", "action": "..." },
      "anomaly_unresolved": { "description": "...", "action": "..." }
    }
  },

  "metadata": {
    "version": "1.0",
    "sources_consulted": ["..."],
    "limitations": "..."
  }
}
```

### Secondary deliverable: Evidence log

For each finding entry and precursor relationship, a structured evidence record:

```json
{
  "claim": "Hepatocellular necrosis can be followed by fibrosis in recovery",
  "evidence_type": "textbook_review",
  "source": "Greaves 2012, Chapter 8, p. 234",
  "verbatim_quote": "...",
  "confidence": "high",
  "limitations": "..."
}
```

### Tertiary deliverable: Dose-response discrimination guidance

A brief (1 page) recommendation on:
- How to assess dose-response within the recovery arm (incidence trend, severity trend)
- Whether absence of dose-response is sufficient to rule out delayed onset (answer: probably not — threshold effects exist)
- Recommended minimum evidence for each classification category

## Priority

**High.** The current "anomaly" verdict is the highest-priority verdict in the system (it dominates all others via `worstVerdict()`). When it fires incorrectly — labeling a legitimate delayed-onset finding as an anomaly, or treating a common spontaneous finding as alarming — it actively degrades the pathologist's trust in the entire recovery assessment. Getting this classification right is critical for system credibility.

## Estimated scope

2–3 days. The precursor map and delayed-onset finding list are well-documented in the INHAND monographs and standard toxpath textbooks. The spontaneous incidence thresholds require strain-specific historical control data which may be harder to find in published literature (much of it is proprietary). The discrimination algorithm design is primarily a synthesis task.

# Lab clinical significance thresholds + open-source rule catalogs (GitHub scan)

This document converts my findings into Markdown, emphasizing (1) *sourced* LFT/DILI threshold patterns you can directly encode as **Lxx** rules and (2) the most reusable open-source implementations on GitHub for grading / liver-safety patterning.

---

## 1) What is actually well-defined (with clear threshold combos): LFT / DILI patterns

### 1.1 Regulatory / consensus threshold patterns you can encode directly

> **Note:** Outside of LFT/DILI paradigms, the nonclinical literature repeatedly notes that *numeric “adversity” thresholds for clinical pathology biomarkers are not consistently defined in regulatory guidance*—and emphasizes weight-of-evidence/context. :contentReference[oaicite:0]{index=0}

| Proposed L-rule ID | Pattern / parameter(s) | Threshold / definition | Suggested severity class | Species applicability | High-value source(s) |
|---|---|---|---|---|---|
| L01 | ALT or AST elevation (screen) | ALT or AST > 3× ULN is a key “hepatocellular injury” signal used in Hy’s Law frameworks | Warning | Clinical framework (human); **adapt as fold-change vs concurrent control** in nonclinical | :contentReference[oaicite:1]{index=1} DILI Guidance (Hy’s Law discussion) :contentReference[oaicite:2]{index=2} |
| L02 | Hy’s Law biochemical criteria (core) | ALT or AST > 3× ULN **AND** total bilirubin > 2× ULN, with no evidence of cholestasis (ALP typically < 2× ULN) | Critical | Clinical framework; often used as “high concern” flag even when adapted to nonclinical | FDA DILI Guidance :contentReference[oaicite:3]{index=3}; summary of same criteria :contentReference[oaicite:4]{index=4} |
| L03 | Cholestasis “exclusion” component for Hy’s Law | For Hy’s Law interpretation, absence of cholestasis typically indicated by ALP not > 2× ULN (or only modestly elevated) | High | Clinical framework; supports pattern classification | FDA DILI Guidance :contentReference[oaicite:5]{index=5} |
| L04 | “Temple’s Corollary” quadrant (eDISH lower-right) | ALT (or AST) > 3× ULN **AND** bilirubin < 2× ULN (i.e., transaminase signal without bilirubin rise) | Warning | Clinical framework; useful as *sensitive* signal | CIOMS DILI report describes Temple’s Corollary quadrant concept :contentReference[oaicite:6]{index=6}; EASL guideline notes Temple’s Corollary as a more sensitive, less specific signal (conceptual) :contentReference[oaicite:7]{index=7} |
| L05 | DILI “case definition” style thresholds (screening) | Common biochemical triggers used to identify potential DILI cases include ALT or AST ≥ 5× ULN **or** ALP ≥ 2× ULN (often with persistence/confirmation) | High | Clinical framework; could be adapted to nonclinical “strong trigger” flags | CIOMS DILI consensus report :contentReference[oaicite:8]{index=8} |
| L06 | Cross-parameter pattern classification via R ratio (“R value”) | R = (ALT/ULN) / (ALP/ULN). Typical interpretation: R < 2 cholestatic; 2–5 mixed; > 5 hepatocellular | Informational → escalates when paired with bilirubin | Clinical framework; useful to label patterns (hepatocellular vs cholestatic vs mixed) | CIOMS DILI report :contentReference[oaicite:9]{index=9} |
| L07 | “Cholestatic pattern” (practical multi-parameter) | Cholestatic injury: ALP ≥ 2× ULN and/or low R ratio (≤ 2); often accompanied by bilirubin elevation depending on clinical course | Warning | Clinical framework; useful to tag non-hy’s-law patterns | CIOMS DILI report :contentReference[oaicite:10]{index=10}; example definition in clinical literature :contentReference[oaicite:11]{index=11} |
| L08 | “Mixed pattern” (practical multi-parameter) | Mixed injury: 2 < R < 5 (ALT elevated with concomitant ALP elevation) | Informational → Warning | Clinical framework; helps interpret multi-parameter shifts | CIOMS DILI report :contentReference[oaicite:12]{index=12} |

**Implementation note for preclinical/SEND:** most of these are expressed as ULN-multipliers in clinical development. For animal studies, you often won’t have ULN in the same sense—so you’d typically map to:
- fold-change vs concurrent control (group mean or robust control reference),
- historical control ranges, and/or
- lab/strain/age-specific reference intervals (where available),
then retain the *pattern logic* (multi-parameter combinations) while swapping in animal-appropriate baselines.

---

## 2) Nonclinical clinical pathology: what STP/ASVCP actually contributes (and what it doesn’t)

A recurring message in tox clinical pathology consensus work is: **numeric “adversity” cutpoints for CP biomarkers are not universally prescribed; adversity is context-driven and weight-of-evidence**. :contentReference[oaicite:13]{index=13}

### 2.1 Key consensus anchors (useful for how you *score* meaning, even without hard numbers)

| Topic | What to encode (engine behavior) | Source(s) |
|---|---|---|
| Adversity ≠ statistical significance | Don’t equate p-values with “adverse”; consider magnitude, duration, functional impact, and corroboration across domains | :contentReference[oaicite:14]{index=14} adversity best-practices paper (general adversity/NOAEL principles) :contentReference[oaicite:15]{index=15} |
| CP adversity principles are contextual | Build a “context layer” (baseline, species/strain, procedural artifacts, timecourse, reversibility, related biomarkers) rather than relying on one hard threshold | ASVCP/STP clinical pathology adversity principles paper :contentReference[oaicite:16]{index=16} |
| Best practices for tox clinical pathology evaluation | Use standardized parameter panels, consistent units, QA on methods, and careful interpretation frameworks (helps your metadata strategy) | Tomlinson et al. best practices (veterinary toxicologic clinical pathology) :contentReference[oaicite:17]{index=17} |

---

## 3) GitHub / open-source work you can reuse right now

Below are the highest-leverage open-source implementations I found that already encode (a) *grading rules as metadata* and/or (b) *Hy’s-law/eDISH patterning*.

### 3.1 Repositories worth harvesting

| Repo / project | What it gives you (re thresholds/patterns) | Threshold model | What to reuse for your L01/L02… catalog | Preclinical caveats |
|---|---|---|---|---|
| :contentReference[oaicite:18]{index=18} `{admiral}` | A real “parameter → threshold → grade” engine; lab grading metadata maintained in **JSON** for multiple criteria libraries | Mostly ULN/LLN + baseline-aware grading rules that output discrete severity grades | Reuse: **criteria-as-data** design, unit handling, generic grader functions, extensible metadata schemas | Criteria are clinical/human (CTCAE/DAIDS). Still the best *engineering pattern* to copy for species-specific catalogs | 
| :contentReference[oaicite:19]{index=19} `hep-explorer` | Hepatic safety explorer + eDISH workflow (quadrants, drilldowns) | ULN-multipliers + eDISH quadrant logic | Reuse: reviewer workflow UI + state/quadrant classification patterns | Liver-centric; clinical framing |
| :contentReference[oaicite:20]{index=20} `Composite-eDish-Plot` | Shiny code for composite eDISH + migration table and subject-level plots | ULN + baseline/migration concepts | Reuse: baseline-abnormal handling and “migration” concept (baseline quadrant → on-treatment quadrant) | Liver-centric; clinical framing |
| :contentReference[oaicite:21]{index=21} `dv.edish` | eDISH module as part of a modular visualization framework | eDISH / Hy’s-law style rules | Reuse: an additional implementation reference + packaging patterns | Liver-centric; clinical framing |
| `nepExplorer` | Renal safety explorer with drill-down | Reference-range/trigger style exploration for renal function | Reuse: renal workflow template analogous to liver explorer | Does not expose a general “threshold catalog” from what’s visible in the overview |
| :contentReference[oaicite:22]{index=22} `safety-explorer-suite` (+ `safetyexploreR`) | Suite of interactive safety charts and widget architecture | Visualization + outlier/shift workflows | Reuse: chart registry + reusable interactive components | Primarily clinical safety monitoring tooling |

### 3.2 Evidence snapshots (links via citations)

- `{admiral}` grading function and docs (derive lab toxicity grade) :contentReference[oaicite:23]{index=23}  
- `{admiral}` release notes explicitly stating lab grading metadata in JSON for CTCAE/DAIDS :contentReference[oaicite:24]{index=24}  
- `hep-explorer` repo and hosted demo page :contentReference[oaicite:25]{index=25}  
- `Composite-eDish-Plot` repo description (composite plot + migration table) :contentReference[oaicite:26]{index=26}  
- `dv.edish` repo description (eDISH module) :contentReference[oaicite:27]{index=27}  
- `nepExplorer` repo description (renal safety explorer) :contentReference[oaicite:28]{index=28}  
- Rho safety explorer suite repo and hosted site :contentReference[oaicite:29]{index=29}  
- PHUSE paper on interactive hepatotoxicity monitoring (context/workflow reference) :contentReference[oaicite:30]{index=30}  

---

## 4) “DeepWiki” note (since you asked)

DeepWiki (by Cognition) is a repo-to-wiki system that generates navigable documentation and diagrams for GitHub repositories. :contentReference[oaicite:31]{index=31}  
So for any of the repos above, it’s typically feasible to generate a DeepWiki view (where available) and then quickly locate:
- the exact threshold logic,
- where metadata lives (JSON/CSV),
- and how grading/pattern membership is computed.

---

## 5) Biggest gap from the GitHub scan (explicit)

I did **not** find a public GitHub repository that already provides a **species-specific (rat/dog/NHP) “clinical pathology alert value catalog” for nonclinical safety studies** as a clean “parameter → threshold → severity → source” dataset.

That absence is consistent with the tox-path consensus literature noting limited prescriptive regulatory cutpoints for CP adversity (outside of certain well-known clinical liver-safety paradigms), and an emphasis on contextual/weight-of-evidence interpretation. :contentReference[oaicite:32]{index=32}

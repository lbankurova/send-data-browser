# User Personas and View Utility Analysis

> **Purpose:** Map real-world user personas to application views. Rank each view's utility per persona, identify collaboration patterns, and surface design opportunities that serve all groups. This document is the foundation for UX prioritization — every layout, interaction, and annotation decision should trace back to a persona goal.
>
> **Last updated:** 2026-02-09

---

## 1. Persona Definitions

### P1 — Study Director (Toxicologist)

**Who they are.** The scientific lead on a nonclinical study. Typically a PhD or DVM toxicologist with 5-15 years of experience. They own the scientific conclusions and are legally responsible for the study report narrative under GLP (Good Laboratory Practice) regulations.

**What they do in the real world.**
- Design the study protocol (species, dose levels, duration, endpoints)
- Monitor in-life data as the study runs (body weights, clinical observations, clinical pathology)
- Review all terminal data (organ weights, histopathology, macroscopic observations)
- Determine treatment-relatedness for every finding ("Is this caused by the drug or incidental?")
- Classify findings as adverse or non-adverse
- Set the NOAEL (No Observed Adverse Effect Level) — the single most important regulatory output
- Write the toxicology narrative section of the study report
- Defend conclusions in regulatory interactions

**Their mental model.** They think in convergence patterns: "Elevated ALT + liver hypertrophy + hepatocellular vacuolation = hepatotoxicity signal." A single finding in isolation means little. The strength of evidence comes from *concordance across domains* — when clinical chemistry, organ weights, and microscopic findings all point to the same organ. They are trained to distinguish statistical significance from biological significance (a p < 0.001 finding with a tiny effect size may be statistically significant but toxicologically irrelevant).

**What keeps them up at night.**
- Missing a real signal (false negative → regulatory rejection, clinical safety issue)
- Over-calling a signal (false positive → unnecessarily killing a drug program)
- Being unable to justify the NOAEL if FDA asks ("Why did you pick dose 2 and not dose 1?")
- Inconsistency between their assessment and the pathologist's findings

**Primary goals:**
1. **Orient fast** — "What happened in this study?" within 60 seconds
2. **Triage signals** — Which organs need deep review? Which are noise?
3. **Assess dose-response** — Is the finding dose-dependent? Monotonic?
4. **Determine adversity** — Is this finding adverse (limits the dose) or non-adverse (monitoring only)?
5. **Set and justify NOAEL** — What is the highest dose with no adverse effects, and why?
6. **Document reasoning** — Capture treatment-relatedness, adversity, and rationale per finding
7. **Generate the report** — Produce a reviewable artifact for the study report

---

### P2 — Pathologist

**Who they are.** A board-certified veterinary pathologist (DVM, DACVP). Two sub-roles:
- **Study pathologist** — reads microscopic slides, grades lesion severity, writes the pathology narrative
- **Peer review pathologist** — independent pathologist who reviews the study pathologist's findings (required by GLP for regulatory studies)

**What they do in the real world.**
- Examine H&E-stained tissue sections for every animal
- Grade each lesion on a 0-5 severity scale (none/minimal/slight/moderate/marked/severe)
- Diagnose findings using standardized terminology (INHAND nomenclature)
- Distinguish background/spontaneous findings from treatment-related findings
- Write the microscopic pathology narrative (tissue-by-tissue, dose-by-dose)
- Peer review: compare own reads against the study pathologist's, note agreements and discrepancies, negotiate changes

**Their mental model.** Specimen-centric. They think "Liver → what did I see?" not "ALT → where is the correlate?" They navigate tissue-by-tissue, not endpoint-by-endpoint. Incidence (how many animals affected) and severity (how bad) are their primary metrics. They care deeply about the distinction between adaptive responses (not adverse) and degenerative/necrotic changes (adverse).

**What keeps them up at night.**
- Missing a subtle finding that another pathologist catches in peer review
- Inconsistency in severity grading across specimens
- Not having adequate context (clinical pathology correlates) when interpreting a lesion
- The peer review pathologist overriding their diagnosis without sufficient discussion

**Primary goals:**
1. **Review specimen by specimen** — See all findings for one tissue, across all dose groups
2. **Assess severity distribution** — Is severity dose-dependent? Is incidence increasing with dose?
3. **Compare to concurrent controls** — Is this finding present in controls (spontaneous) or only in treated?
4. **Correlate with clinical pathology** — Does the microscopic finding have a functional correlate (e.g., liver necrosis → elevated ALT)?
5. **Record observations** — Document each finding's interpretation and peer review status
6. **Peer review** — Compare against another pathologist's reads, track agreements/adjustments

---

### P3 — Regulatory Toxicologist

**Who they are.** A toxicologist who works in regulatory affairs, often at the CRO or sponsor company. They synthesize study-level findings into regulatory documents (IND/NDA toxicology summaries, integrated summary of safety). They may not have been involved in the study conduct.

**What they do in the real world.**
- Review completed study reports (may review 5-20 studies for a single drug program)
- Extract key toxicology findings from each study
- Compare findings across studies (same compound, different species/duration)
- Write the Nonclinical Overview and Toxicology Written Summary for regulatory submissions
- Evaluate whether the NOAEL is adequately justified and consistent across the program
- Identify gaps in the nonclinical safety package

**Their mental model.** Cross-study synthesis. They think in study comparisons: "Is the hepatotoxicity in rats consistent with the finding in dogs? Is the NOAEL margin adequate for the proposed clinical dose?" They need the NOAEL, the target organs, and the dose-limiting findings — fast. They do not need to re-derive conclusions; they need to verify and cite them.

**What keeps them up at night.**
- A regulatory reviewer finding a signal they missed in their integrated summary
- NOAELs that don't make sense across the program (e.g., rat NOAEL higher than dog NOAEL without explanation)
- Inadequate safety margins for the proposed human dose
- Missing a study or forgetting to integrate a late-arriving study into the package

**Primary goals:**
1. **Extract key findings** — NOAEL, target organs, dose-limiting effects for each study
2. **Verify NOAEL justification** — Is the rationale documented and defensible?
3. **Identify target organs** — Which organs are consistently affected across studies?
4. **Assess reversibility** — Did effects reverse during recovery period?
5. **Generate submission-ready artifacts** — Reports, tables, summaries that can go into regulatory documents
6. **Compare across studies** — Same compound, different designs (future, multi-study feature)

---

### P4 — Data Manager / SEND Programmer

**Who they are.** A data programmer or bioinformatics specialist who transforms raw study data into SEND-conformant XPT files. Often works at a CRO. May or may not have toxicology training.

**What they do in the real world.**
- Receive raw data from the laboratory or in-life systems
- Map raw data fields to SEND domain variables (DM, LB, BW, MI, MA, CL, etc.)
- Create XPT files using SAS, Python, or R
- Validate the dataset against CDISC SENDIG rules before submission
- Fix conformance issues (wrong controlled terminology, missing required variables, formatting errors)
- Package the final dataset for submission to the regulatory authority

**Their mental model.** Variable-and-domain-centric. They think "Is LBTESTCD populated correctly? Does the ARMCD map to a valid TX set?" They care about structural conformance, not scientific interpretation. A validation error is a data quality defect to be fixed, not a toxicology signal.

**What keeps them up at night.**
- Submitting a dataset with validation errors (FDA rejection, delays, embarrassment)
- Ambiguous CDISC rules that different tools interpret differently
- Data mapping edge cases (compound specimen names, non-standard test codes)
- Time pressure from study directors who want the analysis NOW

**Primary goals:**
1. **Validate datasets** — Run conformance checks, see all issues, understand what's wrong
2. **Triage issues** — Which issues are real errors vs. acceptable deviations?
3. **Fix efficiently** — Apply batch fixes, preview changes, track what was fixed
4. **Track review progress** — How many issues reviewed, how many remaining?
5. **Browse raw data** — Verify domain contents, check variable values, spot anomalies
6. **Document dispositions** — Record why an issue was accepted or how it was fixed (audit trail)

---

### P5 — Biostatistician

**Who they are.** A statistician responsible for the statistical analysis plan (SAP), the analysis output, and statistical interpretation. MS or PhD in biostatistics. May be at the CRO or sponsor.

**What they do in the real world.**
- Design the statistical analysis plan before the study starts
- Specify which tests to run (ANOVA, Dunnett's, trend tests, Fisher's exact)
- Review statistical outputs for correctness
- Interpret statistical significance in context (multiplicity, effect size, biological plausibility)
- Advise the study director on which findings are statistically meaningful
- May compute additional post-hoc analyses

**Their mental model.** They think in distributions, effect sizes, and test assumptions. "Is the sample size adequate for this test? Does the data meet normality assumptions? Is the p-value inflated by multiple comparisons?" They are trained to distrust small effects with small p-values in large sample sizes, and to take large effects with moderate p-values seriously in small sample sizes.

**What keeps them up at night.**
- False positive inflation from running too many tests (the "p-hacking" problem)
- Missing a real signal because the test lacked power
- The study director overinterpreting a marginally significant finding
- Regulatory auditors questioning the statistical methodology

**Primary goals:**
1. **Review dose-response metrics** — Verify p-values, effect sizes, trend tests are correct
2. **Assess dose-response patterns** — Is the dose-response monotonic? Threshold? U-shaped?
3. **Evaluate statistical methodology** — Are the right tests being applied? Are assumptions met?
4. **Check multiplicity control** — Bonferroni, Dunnett's — is the correction appropriate?
5. **Explore endpoint-level detail** — Drill into specific endpoints for deep statistical review
6. **Advise on significance** — "This is statistically significant but clinically irrelevant" or vice versa

---

### P6 — QA Auditor

**Who they are.** A Quality Assurance professional responsible for GLP audit of the study. They do not make scientific judgments — they verify that processes were followed, data is traceable, and documentation is complete.

**What they do in the real world.**
- Audit the study against the protocol and SOPs
- Verify data integrity (no unauthorized changes, complete audit trail)
- Check that all findings were documented and reviewed
- Confirm that the SEND dataset matches the study report
- Issue audit findings for non-compliance
- May inspect at any phase (in-life, post-study, pre-submission)

**Their mental model.** Process and traceability. They think "Was this step documented? Is there an audit trail? Does the output match the input?" They do not evaluate whether a finding is treatment-related — they evaluate whether the study director documented their rationale for calling it treatment-related.

**What keeps them up at night.**
- Missing a GLP non-compliance that the FDA inspector catches later
- Incomplete audit trails (who changed what, when)
- Annotations or assessments that exist in the tool but aren't in the study report
- Data integrity concerns (unsigned reviews, undocumented corrections)

**Primary goals:**
1. **Verify review completeness** — Has every finding been reviewed? Every annotation saved?
2. **Check audit trail** — Who made which assessment, when?
3. **Validate data integrity** — Does the SEND dataset match what was analyzed?
4. **Review documentation** — Are all dispositions (accepted, flagged, fixed) justified?
5. **Inspect validation status** — Were all conformance issues addressed before submission?
6. **Cross-reference** — Does the tool's output match the study report?

---

### P7 — Regulatory Reviewer (FDA/EMA)

**Who they are.** A pharmacologist, toxicologist, or pathologist at a regulatory agency who reviews the submitted nonclinical data to assess whether the compound is safe enough for clinical trials. They are NOT the tool's primary user — they receive outputs from it.

**What they do in the real world.**
- Review submitted SEND datasets and toxicology summaries
- Look for signals the sponsor may have missed or downplayed
- Evaluate whether the NOAEL is justified
- May run independent analyses on the submitted data
- Issue review questions or clinical holds

**Their mental model.** Skeptical verification. They think "Show me the evidence for this NOAEL. Did you adequately characterize the hepatotoxicity? Why did you dismiss the kidney finding?" They want transparent reasoning and complete data — they do NOT want the sponsor's tool to hide or de-emphasize inconvenient findings.

**Primary goals:**
1. **Verify NOAEL justification** — Is the evidence sufficient? Is the confidence adequate?
2. **Identify missed signals** — Run their own signal scan, compare against the sponsor's conclusions
3. **Review adversity classification** — Do they agree with what was called adverse vs. non-adverse?
4. **Inspect raw data** — Drill to source data for any suspicious finding
5. **Generate independent analyses** — Re-run statistical comparisons, alternate groupings

**Note:** This persona is mostly a *consumer* of the tool's outputs (reports, exports). They would use the tool directly only if it were deployed at the agency. Primary design implication: the tool's reports and exports must be transparent, complete, and auditable.

---

## 2. View-Persona Utility Matrix

How useful is each view to each persona? Scored 0-5:
- **5** = Primary workspace — spends most of their time here
- **4** = Essential — visits frequently, relies on heavily
- **3** = Valuable — visits regularly, provides useful context
- **2** = Occasional — visits when needed for specific tasks
- **1** = Peripheral — rarely visits, low relevance
- **0** = Irrelevant — never uses this view

| View | P1 Study Dir | P2 Pathologist | P3 Reg Tox | P4 Data Mgr | P5 Biostat | P6 QA | P7 Reg Rev |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Landing Page** | 3 | 2 | 4 | 3 | 2 | 3 | 3 |
| **Study Summary (Details)** | 3 | 2 | 4 | 2 | 2 | 3 | 3 |
| **Study Summary (Signals)** | **5** | 3 | **5** | 1 | 3 | 2 | **5** |
| **Dose-Response** | **5** | 2 | 4 | 0 | **5** | 1 | 4 |
| **Target Organs** | 4 | 3 | **5** | 0 | 2 | 1 | **5** |
| **Histopathology** | 4 | **5** | 3 | 0 | 1 | 2 | 4 |
| **NOAEL Decision** | **5** | 3 | **5** | 0 | 3 | 2 | **5** |
| **Validation** | 2 | 0 | 2 | **5** | 0 | **5** | 3 |
| **Adverse Effects** | 3 | 2 | 3 | 1 | 3 | 1 | 3 |
| **Domain Tables** | 2 | 1 | 1 | **5** | 3 | 4 | 3 |

### Heat map reading guide

**Study Director (P1):** Three primary workspaces — Signals (orient), Dose-Response (analyze), NOAEL Decision (conclude). Visits Target Organs and Histopathology for convergence assessment. Validation is secondary.

**Pathologist (P2):** Histopathology is their world. Everything else is context. They need Signals and NOAEL for understanding the study director's conclusions, and Target Organs to see multi-domain convergence. They never touch Validation or Domain Tables.

**Regulatory Toxicologist (P3):** Signals, Target Organs, and NOAEL are their extraction points. They need the conclusions, the target organs, and the NOAEL justification — fast. Dose-Response is for spot-checking specific endpoints. Landing Page is high because they review many studies.

**Data Manager (P4):** Validation and Domain Tables are their world. Everything else is irrelevant to their work (they don't interpret toxicology — they fix data quality). Landing Page for study selection.

**Biostatistician (P5):** Dose-Response is their primary workspace (p-values, effect sizes, trend tests, dose-response patterns). Signals provides the summary statistics. NOAEL for dose-level analysis. They rarely need microscopic or organ-level views.

**QA Auditor (P6):** Validation (conformance issues reviewed?), Domain Tables (data integrity), Landing Page (study overview). They need to verify that assessments were made — not make them. Study Summary and NOAEL provide review status context.

**Regulatory Reviewer (P7):** Signals, Target Organs, and NOAEL — the same core as the Reg Toxicologist, but from a skeptical verification angle. Histopathology for spot-checking pathology claims. Domain Tables for raw data verification. Dose-Response for independent analysis.

---

## 3. Persona Workflow Maps

### P1 Study Director — "The Assessor"

```
Landing Page                Study Summary (Signals)          Dose-Response
   │                              │                              │
   │  open study                  │  "What happened?"            │  "Is this dose-dependent?"
   └──────────────► ┌─────────────┴──────────────┐               │
                    │ Decision Bar: NOAEL/LOAEL   │               │
                    │ Organ Rail: triage organs    │───────────────┘
                    │ Overview: convergence check  │      endpoint click
                    │ Signal Matrix: scan all      │
                    └──────────┬──────────────────┘
                               │ organ click
                               ▼
                    ┌──────────────────────────┐
                    │  Target Organs            │───► Histopathology
                    │  "Which organs converge?" │     "What do the slides show?"
                    └──────────┬───────────────┘
                               │
                               ▼
                    ┌──────────────────────────┐
                    │  NOAEL Decision           │───► Generate Report
                    │  "What's the NOAEL?"      │     "Package for study report"
                    │  Document adversity        │
                    │  Justify NOAEL            │
                    └──────────────────────────┘
```

**Critical path:** Signals → Target Organs → NOAEL Decision. Every other view is a detour from this spine.

**Annotation touchpoints:** ToxFinding form (Signals, D-R, Target Organs, NOAEL), CausalAssessment (D-R Causality tool)

**Delight factors:**
- Decision Bar gives NOAEL answer instantly (no navigation required)
- InsightsList synthesizes rules into actionable statements (no mental aggregation)
- Cross-view links carry context (don't lose the organ when switching views)
- Causality worksheet captures Bradford Hill reasoning inline

---

### P2 Pathologist — "The Microscopist"

```
Landing Page ──► Study Summary ──► Histopathology
                 (quick orient)         │
                                        │  PRIMARY WORKSPACE
                                  ┌─────┴─────────────────────┐
                                  │ Specimen Rail: tissue nav   │
                                  │ Overview: findings list     │
                                  │ Severity Matrix: dose grid  │
                                  │ Subject View: per-animal    │
                                  │ PathologyReview form        │
                                  └─────┬─────────────────────┘
                                        │ "What's the clinical correlate?"
                                        ▼
                                  Dose-Response (LB endpoints)
                                  Target Organs (convergence)
                                  NOAEL Decision (adversity context)
```

**Critical path:** Histopathology (95% of time). Brief excursions to other views for clinical pathology correlation.

**Annotation touchpoints:** PathologyReview form (Histopathology), ToxFinding form (Histopathology finding-level)

**Delight factors:**
- Specimen-centric navigation (matches how they think)
- Severity matrix shows dose-response at a glance
- Subject-level view shows individual animal grades (peer review comparison)
- PathologyReview form captures peer review status inline

---

### P3 Regulatory Toxicologist — "The Synthesizer"

```
Landing Page ──► Study Summary (Signals) ──► Target Organs ──► NOAEL Decision
    │                   │                          │                  │
    │ review many       │ extract signals          │ identify         │ verify
    │ studies           │ note target organs       │ targets          │ NOAEL
    │                   │ check NOAEL              │                  │
    │                   ▼                          │                  ▼
    │            Dose-Response                     │         Generate Report
    │            (spot-check specific endpoints)   │         (submission artifact)
    ▼
    next study ──► ...repeat...
```

**Critical path:** Landing Page → Signals → NOAEL → Report. Fast extraction, not deep analysis.

**Annotation touchpoints:** Minimal — they consume assessments, rarely create them. May add comments to flag cross-study issues.

**Delight factors:**
- Landing Page shows validation status and metadata at a glance (triage which studies need attention)
- Decision Bar gives the NOAEL instantly (they can extract it in 5 seconds)
- Target Organs view shows converging evidence (feeds directly into regulatory narratives)
- Generate Report produces a submission-ready artifact

---

### P4 Data Manager — "The Validator"

```
Landing Page ──► Validation View ◄──► Domain Tables
                      │
                ┌─────┴─────────────────────┐
                │ Rules Table: issue scan     │
                │ Records Table: per-record   │
                │ Context Panel: fix guidance  │
                │ Fix Scripts: batch fixes     │
                │ Review Tracking: progress    │
                └─────┬─────────────────────┘
                      │ "Check the raw data"
                      ▼
                 Domain Tables
                 (verify fix, inspect values)
```

**Critical path:** Validation → Domain Tables → Validation (fix-verify cycle). They never leave this loop.

**Annotation touchpoints:** ValidationRecordReview (per-record), ValidationIssue (per-rule disposition)

**Delight factors:**
- Severity pills for instant triage (errors first, then warnings)
- Fix tier system (accept, correct, or script — clear action per issue)
- Review progress bar (how close to done?)
- Bidirectional status filters (context panel pushes filters to records table)
- Linkified domain/variable references (click to inspect raw data)

---

### P5 Biostatistician — "The Quantifier"

```
Landing Page ──► Study Summary (Signals) ──► Dose-Response
                 (statistical overview)           │
                                            ┌─────┴─────────────────────┐
                                            │ Endpoint Rail: scan all    │
                                            │ Evidence Tab: charts       │
                                            │ Metrics Tab: full grid     │
                                            │ Time-course: temporal      │
                                            │ Causality: methodology     │
                                            └─────┬─────────────────────┘
                                                  │ "Are the stats right?"
                                                  ▼
                                            NOAEL Decision
                                            (dose-level p-values)
                                            Domain Tables
                                            (raw data for re-analysis)
```

**Critical path:** Dose-Response (80% of time). Signals for orientation, NOAEL for dose-level review.

**Annotation touchpoints:** Minimal — they advise, the study director annotates. May want a "statistical note" annotation type in production.

**Delight factors:**
- Full metrics grid with all statistical columns (p, trend_p, effect_size, pattern)
- Charts show both sexes with error bars (visual verification of statistical tests)
- Dose-response pattern characterization (monotonic/threshold/non-monotonic)
- Time-course toggle (see temporal dynamics, not just terminal values)
- Effect size alongside p-value (prevents over-reliance on statistical significance alone)

---

### P6 QA Auditor — "The Inspector"

```
Landing Page ──► Validation View ──► Domain Tables
                      │                    │
                      │ "Were all          │ "Does the data
                      │  issues addressed?" │  match the report?"
                      │                    │
                      ▼                    ▼
                 Study Summary         NOAEL Decision
                 (review progress)     (were assessments made?)
```

**Critical path:** Validation (conformance audit) → Domain Tables (data integrity) → Study Summary (review completeness). They inspect, they don't create.

**Annotation touchpoints:** Read-only. They verify that annotations exist and are complete. In production, they would need an "audit observation" annotation type.

**Delight factors:**
- Review progress bars (instant status: "47 of 52 records reviewed")
- Complete audit trail per record (who, when, what decision)
- Validation summary with issue counts by severity
- Domain Tables with raw data for cross-reference
- Landing Page with study status and validation badge

---

### P7 Regulatory Reviewer — "The Skeptic"

```
Study Summary (Signals) ──► Target Organs ──► NOAEL Decision
        │                        │                  │
        │ "What did the          │ "Which organs     │ "Is this NOAEL
        │  sponsor conclude?"    │  are targets?"    │  justified?"
        │                        │                  │
        ▼                        ▼                  ▼
  Dose-Response            Histopathology       Domain Tables
  (verify specific         (verify severity     (check raw data
   endpoint claims)         grades)              for hidden issues)
```

**Critical path:** Signals → Target Organs → NOAEL → spot-check via D-R/Histo/Domain. They follow the sponsor's logic, looking for gaps.

**Annotation touchpoints:** None in the submission review context. If deployed at the agency, they would need a "reviewer comment" annotation type.

**Delight factors:**
- Transparent InsightsList that shows HOW conclusions were derived
- Signal matrix that lets them scan for missed signals
- NOAEL confidence score that flags weak justifications
- Cross-view links that let them trace any claim to source evidence
- Domain Tables for raw data verification

---

## 4. Collaboration Matrix

Who needs to see whose work? Where do handoffs happen?

| From | To | What transfers | Where it happens in the app |
|------|----|----------------|----------------------------|
| P2 Pathologist | P1 Study Director | Severity grades, pathology narrative, peer review status | PathologyReview annotations visible in Histopath context panel; severity data flows into NOAEL adversity matrix |
| P1 Study Director | P2 Pathologist | Treatment-relatedness assessment, adversity classification | ToxFinding annotations visible in Histopath context panel |
| P1 Study Director | P3 Reg Toxicologist | NOAEL, target organs, adverse findings, study report | NOAEL banner, Target Organs view, Generate Report output |
| P5 Biostatistician | P1 Study Director | Statistical significance interpretation, methodology advice | Dose-Response metrics grid, p-values in context panels |
| P4 Data Manager | P1 Study Director | Clean SEND dataset, validation report | Validation view results, "Pass" badge on Landing Page |
| P4 Data Manager | P6 QA Auditor | Validation dispositions, fix documentation | ValidationRecordReview + ValidationIssue annotations |
| P6 QA Auditor | P1 Study Director | Audit findings, non-compliance observations | Currently no direct path — production gap |
| P1 Study Director | P7 Reg Reviewer | Complete submission package: data + report + justification | Generate Report, NOAEL Decision view, all annotations |

### Collaboration Patterns

**Sequential handoff (assembly line):**
```
P4 Data Manager → P2 Pathologist → P1 Study Director → P3 Reg Toxicologist → P7 Reg Reviewer
                                         ↕
                                    P5 Biostatistician
```

The Data Manager produces the clean dataset. The Pathologist reads slides and records findings. The Study Director integrates everything and makes conclusions. The Reg Toxicologist extracts findings for the submission. The Regulatory Reviewer evaluates the submission.

**Concurrent collaboration:**
- P1 (Study Director) and P2 (Pathologist) work simultaneously — the SD reviews in-life data while the pathologist reads slides. They converge on adversity classification.
- P1 (Study Director) and P5 (Biostatistician) collaborate on statistical interpretation — the biostatistician flags significant findings, the SD assesses biological relevance.
- P4 (Data Manager) and P6 (QA Auditor) work validation in parallel — the DM fixes issues, QA verifies fixes.

**Friction points (current design):**
1. **No role awareness.** The app doesn't know who is logged in. All users see the same views, same annotations, same actions. A data manager sees the Histopathology view they'll never use. A pathologist sees the Validation view that's irrelevant to them.
2. **No review workflow.** P2 records a PathologyReview. P1 needs to see it and possibly disagree. There's no mechanism for comments, discussion, or resolution between annotators.
3. **No audit observation type.** P6 can verify that annotations exist but can't record their audit observations within the app.
4. **No cross-user annotation visibility.** The current system stores one annotation per entity per schema type. If P1 annotates a ToxFinding and then P3 annotates the same finding, one overwrites the other. Production needs per-user annotation layers or versioning.
5. **Single-study scope.** P3 needs to compare across studies. The app shows one study at a time. The multi-study gap (HC-03) blocks the Reg Toxicologist's primary workflow.

---

## 5. View Priority Rankings Per Persona

For each persona, which views should the app emphasize (prominently accessible, optimized for their workflow) vs. de-emphasize (available but not in their face)?

### P1 Study Director — Optimization priority

| Priority | Views | Why |
|----------|-------|-----|
| **Tier 1 — Primary** | Signals, NOAEL Decision, Dose-Response | These three answer the study director's core questions: What happened? What's dose-dependent? What's the NOAEL? |
| **Tier 2 — Supporting** | Target Organs, Histopathology | Convergence assessment and microscopic correlations. Visited for specific organs. |
| **Tier 3 — Occasional** | Landing Page, Adverse Effects, Study Details | Entry point, alternative tabulation, metadata reference. |
| **Tier 4 — Background** | Validation, Domain Tables | Not their responsibility but may browse if a data issue is suspected. |

### P2 Pathologist — Optimization priority

| Priority | Views | Why |
|----------|-------|-----|
| **Tier 1 — Primary** | Histopathology | Their entire world. Specimen rail + severity matrix + subject-level is the core workflow. |
| **Tier 2 — Supporting** | Target Organs, Signals (overview only) | Context for their microscopic findings. Which organs are flagged systemically? |
| **Tier 3 — Occasional** | NOAEL Decision, Dose-Response | Understanding the adversity context. Checking clinical pathology correlates. |
| **Tier 4 — Background** | Landing Page, Study Details | Entry and metadata only. |
| **Irrelevant** | Validation, Domain Tables, Adverse Effects | Outside their workflow entirely. |

### P3 Regulatory Toxicologist — Optimization priority

| Priority | Views | Why |
|----------|-------|-----|
| **Tier 1 — Primary** | Signals, Target Organs, NOAEL Decision | Fast extraction of key findings for regulatory documents. |
| **Tier 2 — Supporting** | Landing Page, Dose-Response, Study Details | Study triage, spot-checking specific endpoints, metadata for submission tables. |
| **Tier 3 — Occasional** | Histopathology, Adverse Effects | Microscopic detail when needed, alternative finding views. |
| **Tier 4 — Background** | Validation, Domain Tables | Only if data quality concerns arise. |

### P4 Data Manager — Optimization priority

| Priority | Views | Why |
|----------|-------|-----|
| **Tier 1 — Primary** | Validation, Domain Tables | Their entire workflow: validate, fix, verify. |
| **Tier 2 — Supporting** | Landing Page | Study selection and overview (validation status column). |
| **Tier 3 — Occasional** | Study Details | Metadata verification (protocol, standard, species). |
| **Irrelevant** | Signals, Dose-Response, Target Organs, Histopathology, NOAEL, Adverse Effects | Scientific analysis views — not their job. |

### P5 Biostatistician — Optimization priority

| Priority | Views | Why |
|----------|-------|-----|
| **Tier 1 — Primary** | Dose-Response | Full statistical metrics, charts, p-values, effect sizes, patterns. |
| **Tier 2 — Supporting** | Signals, NOAEL Decision | Summary statistics, dose-level analysis. |
| **Tier 3 — Occasional** | Domain Tables, Adverse Effects | Raw data for re-analysis, alternative finding tables. |
| **Tier 4 — Background** | Target Organs, Histopathology | Organ-level context when requested by study director. |
| **Irrelevant** | Validation, Landing Page (beyond selection) | Not their workflow. |

### P6 QA Auditor — Optimization priority

| Priority | Views | Why |
|----------|-------|-----|
| **Tier 1 — Primary** | Validation | Conformance audit: were all issues addressed? |
| **Tier 2 — Supporting** | Domain Tables, Landing Page | Data integrity checks, study status overview. |
| **Tier 3 — Occasional** | Study Details, NOAEL Decision, Signals | Review completion verification, assessment documentation. |
| **Tier 4 — Background** | Dose-Response, Target Organs, Histopathology | May inspect for completeness but doesn't interpret. |
| **Irrelevant** | Adverse Effects | Dynamic analysis view, not relevant to audit. |

---

## 6. Design Implications

### 6.1 Navigation Personalization (Production Feature)

The browsing tree currently shows all views to all users. In production, consider:

- **Role-based tree ordering:** P1/P3/P7 see Analysis Views first (Signals, Target Organs, D-R, Histopath, NOAEL). P4/P6 see Validation and Domains first.
- **Favorites / pinned views:** Let users pin their most-used views to the top of the tree.
- **Role presets:** "Toxicologist", "Pathologist", "Data Manager" presets that reorder the tree and set default landing views.
- **Do NOT hide views.** Every persona occasionally needs views outside their primary set. Reorder, don't remove.

### 6.2 Landing Page Optimization

The landing page serves different purposes per persona:

| Persona | Landing page need | Current status |
|---------|------------------|----------------|
| P1 Study Director | Open study, see health summary | Partially met — validation badge shown but no NOAEL/target organ summary |
| P3 Reg Toxicologist | Compare studies, extract key findings | Not met — single-study only, no comparative columns |
| P4 Data Manager | See validation status, open validation | Met — validation badge + context menu |
| P6 QA Auditor | See review completeness, open audit | Partially met — no review progress in table |

**Opportunity:** Add summary columns to the Landing Page table:
- **Target organs** (count or top organ name)
- **NOAEL** (dose value or "Not set")
- **Review progress** (% complete)
- These let P3 and P6 triage without opening each study.

### 6.3 Annotation Collaboration Model

Current: one annotation per entity per schema, last-write-wins.

**Production needs per persona:**

| Need | Personas | Priority |
|------|----------|----------|
| Per-user annotation layers (don't overwrite each other) | P1 + P2 concurrent access | Critical |
| Comment threads on annotations (discuss disagreements) | P1 ↔ P2 (adversity), P4 ↔ P6 (validation disposition) | High |
| Annotation history / versioning | P6 (audit trail), P7 (transparency) | High |
| Role-typed annotations (audit observation, reviewer note) | P6 (QA), P7 (regulatory) | Medium |
| Read-only annotation view (see but not edit others' annotations) | P3, P6, P7 | Medium |
| Annotation locking (finalize, prevent further edits) | P6 (GLP sign-off) | Medium |

### 6.4 Cross-View Link Optimization

Current: every context panel has "Related views" links. These are equally weighted.

**Persona-aware optimization:**
- For P1 (Study Director): prioritize Dose-Response and NOAEL links (the assessment path)
- For P2 (Pathologist): prioritize Histopathology links from every other view
- For P5 (Biostatistician): prioritize Dose-Response links with full endpoint context

**Implementation:** A "role" setting (local preference, not auth) could reorder cross-view link sections.

### 6.5 Report and Export per Persona

| Persona | Export need | Current status |
|---------|-----------|----------------|
| P1 Study Director | Study report narrative, finding tables | HTML report (basic) |
| P2 Pathologist | Pathology narrative, severity tables, peer review summary | Not available |
| P3 Reg Toxicologist | NOAEL table, target organ summary, finding tables for regulatory docs | Not available (partially in HTML report) |
| P4 Data Manager | Validation report with dispositions | Not available (could be derived from validation data) |
| P5 Biostatistician | Statistical tables (p-values, effect sizes, trend tests) | Not available |
| P6 QA Auditor | Audit trail export, review completion report | Not available |

**Priority:** Persona-specific report templates would dramatically increase the tool's utility across all roles.

### 6.6 Context Panel Content per Persona

The context panel is "the product" — but its content should adapt:

| Persona | Most valuable context panel content | Currently available? |
|---------|-------------------------------------|---------------------|
| P1 Study Director | InsightsList, ToxFinding form, cross-view links | Yes |
| P2 Pathologist | PathologyReview form, severity statistics, clinical correlates | Partially (correlates limited) |
| P3 Reg Toxicologist | NOAEL justification, target organ summary, export links | Partially |
| P4 Data Manager | Fix guidance, review form, domain link | Yes |
| P5 Biostatistician | Full statistical details (means, SDs, n, test assumptions) | Partially (no test assumptions) |
| P6 QA Auditor | Review completion status, audit trail | Partially (no audit trail) |

### 6.7 Keyboard and Efficiency Patterns

| Persona | Speed need | Implication |
|---------|-----------|-------------|
| P2 Pathologist | Reviews 40+ tissues per study, needs fast specimen navigation | Arrow keys for rail navigation, tab between severity matrix cells, quick-save annotations (Ctrl+S) |
| P4 Data Manager | Triages 50+ validation records, needs batch actions | Select multiple records, bulk review status change, "Mark all as reviewed" for rules with common disposition |
| P1 Study Director | Navigates 8-14 organs, 50+ endpoints | Arrow keys in rails, Escape to deselect, quick cross-view hotkeys |

---

## 7. Persona Delight Inventory

What would make each persona *love* this tool — not just tolerate it?

### P1 Study Director
| Feature | Current | Delight level |
|---------|---------|:---:|
| 60-second study orientation via Decision Bar + Signals | Available | High |
| InsightsList synthesizes rules into actionable text | Available | High |
| Cross-view links carry organ/endpoint context | Available | High |
| Causality worksheet captures Bradford Hill reasoning | Available | High |
| Single-page study report for study report narrative | Basic HTML | Medium |
| **Missing: "Draft narrative" generator from assessed findings** | Not available | Would be transformative |
| **Missing: Side-by-side study comparison** | Blocked (HC-03) | Would be transformative |

### P2 Pathologist
| Feature | Current | Delight level |
|---------|---------|:---:|
| Specimen-centric navigation matching mental model | Available | High |
| Subject-level severity matrix (per-animal grades) | Available | High |
| PathologyReview form inline | Available | Medium |
| **Missing: Slide image viewer integration** | Not available | Would be transformative |
| **Missing: INHAND terminology auto-suggest** | Not available | High impact |
| **Missing: Peer review comparison (side-by-side reads)** | Not available | High impact |

### P3 Regulatory Toxicologist
| Feature | Current | Delight level |
|---------|---------|:---:|
| NOAEL extraction in 5 seconds via banner | Available | High |
| Target organ identification at a glance | Available | High |
| Generate Report for submission artifacts | Basic | Medium |
| **Missing: Cross-study comparison view** | Blocked (HC-03) | Would be transformative |
| **Missing: NOAEL margin calculator (animal dose → human equivalent)** | Not available | High impact |
| **Missing: Export to regulatory document templates (Word/PDF)** | Stub | High impact |

### P4 Data Manager
| Feature | Current | Delight level |
|---------|---------|:---:|
| Real validation engine with 18 rules | Available | High |
| Fix tier system (accept/correct/script) | Available | High |
| Review progress tracking | Available | High |
| Fix script previews | Available | Medium |
| **Missing: Batch operations (review all, fix all matching)** | Not available | High impact |
| **Missing: Comparison with previous submission version** | Not available | Medium impact |
| **Missing: CDISC Pinnacle 21 parity (industry-standard rule set)** | Partial (18 rules vs. 200+) | High impact for adoption |

### P5 Biostatistician
| Feature | Current | Delight level |
|---------|---------|:---:|
| Full metrics grid with all statistical columns | Available | High |
| Charts with error bars and both sexes | Available | High |
| Dose-response pattern characterization | Available | Medium |
| Time-course toggle for temporal analysis | Available | Medium |
| **Missing: Statistical methodology display (which test, assumptions)** | Not available | High impact |
| **Missing: Re-analysis capability (alternate groupings, exclusions)** | Not available | Would be transformative |
| **Missing: Forest plot / meta-analysis view (across endpoints)** | Not available | Medium impact |

### P6 QA Auditor
| Feature | Current | Delight level |
|---------|---------|:---:|
| Validation summary with severity counts | Available | Medium |
| Review progress bars | Available | Medium |
| **Missing: Complete audit trail (who, when, what changed)** | Not available (GAP-05) | Critical for production |
| **Missing: Audit observation annotation type** | Not available | High impact |
| **Missing: Review completion report (exportable)** | Not available | High impact |
| **Missing: Electronic signature / sign-off** | Not available | Critical for GLP |

### P7 Regulatory Reviewer
| Feature | Current | Delight level |
|---------|---------|:---:|
| Transparent InsightsList showing derivation | Available | High |
| Signal matrix for independent signal scan | Available | High |
| NOAEL confidence score flagging weak justifications | Available | Medium |
| **Missing: "Reviewer mode" — read-only with annotation overlay** | Not available | High impact |
| **Missing: Independent re-analysis with alternate assumptions** | Not available | Would be transformative |
| **Missing: Regulatory question generator ("Explain why you dismissed...")** | Not available | Medium impact |

---

## 8. Collaboration Enablers — Production Roadmap

Priority order for features that unlock multi-persona collaboration:

| # | Feature | Enables | Personas | Effort |
|---|---------|---------|----------|--------|
| 1 | **Authentication + user identity** | Per-user annotations, audit trail, role awareness | All | Infrastructure (HC-06) |
| 2 | **Per-user annotation layers** | Concurrent P1+P2 annotation without overwrite | P1, P2 | Medium |
| 3 | **Audit trail (annotation history)** | GLP compliance, QA inspection, regulatory transparency | P6, P7, all | Medium |
| 4 | **Role-based tree ordering** | Each persona sees relevant views first | All | Small |
| 5 | **Persona-specific report templates** | Each role gets the output format they need | All | Medium |
| 6 | **Annotation comment threads** | P1↔P2 discussion on adversity, P4↔P6 on validation | P1, P2, P4, P6 | Medium |
| 7 | **Multi-study support** | Cross-study comparison for P3, full program view | P3 primarily | Large (HC-03) |
| 8 | **Batch validation operations** | Efficient triage for 100+ record datasets | P4 | Small |
| 9 | **Electronic signature / sign-off** | GLP finalization, regulatory readiness | P1, P2, P6 | Medium |
| 10 | **Read-only reviewer mode** | Regulatory reviewers can inspect without modifying | P7 | Small |

---

## 9. View Design Principles — Per Persona Lens

Each design principle in the design system was evaluated through the persona lens to confirm it serves all groups:

| Principle | Primary beneficiary | Also serves | Risk if violated |
|-----------|-------------------|-------------|-----------------|
| **Insights first, data second** | P1, P3, P7 (need conclusions) | P5 (statistical summary) | P4 confused (they need data first) — mitigated by tree ordering |
| **Context panel is the product** | P1 (assessment forms), P4 (fix guidance) | All (detail surface) | P2 underserved if PathologyReview form is hard to find |
| **Selection cascade** | P1, P5 (drill-down analysis) | All | P2 frustrated if specimen selection doesn't update context |
| **Cross-view linking** | P1, P3 (follow evidence chains) | P7 (verify claims) | P2 loses context if links don't carry specimen identity |
| **Color is signal, not decoration** | P5 (statistical thresholds), P1 (severity) | P7 (scan for missed signals) | P6 overwhelmed if everything is colored (they scan for completeness, not severity) |
| **Consistency across views** | All | — | P3 frustrated if NOAEL is presented differently in Signals vs. NOAEL view |
| **Every element interactive** | P1, P4 (annotation workflows) | All | P6 confused if buttons appear clickable but don't respond |

---

## Appendix A — Persona Quick Reference Cards

### P1 Study Director
**Archetype:** "The Assessor"
**Question:** "What happened, and what does it mean?"
**Primary views:** Signals, NOAEL, D-R
**Annotates:** ToxFinding, CausalAssessment
**Collaborates with:** P2 (pathology), P5 (statistics)
**Success metric:** Confident, defensible NOAEL in < 2 hours

### P2 Pathologist
**Archetype:** "The Microscopist"
**Question:** "What do the slides show, and is it treatment-related?"
**Primary views:** Histopathology
**Annotates:** PathologyReview, ToxFinding
**Collaborates with:** P1 (adversity), peer pathologist
**Success metric:** All specimens reviewed with severity + peer review status in < 4 hours

### P3 Regulatory Toxicologist
**Archetype:** "The Synthesizer"
**Question:** "What goes into the regulatory document?"
**Primary views:** Signals, Target Organs, NOAEL
**Annotates:** Minimal (consumes others')
**Collaborates with:** P1 (study conclusions)
**Success metric:** Key findings extracted from 5 studies in one day

### P4 Data Manager
**Archetype:** "The Validator"
**Question:** "Is the dataset clean and conformant?"
**Primary views:** Validation, Domain Tables
**Annotates:** ValidationRecord, ValidationIssue
**Collaborates with:** P6 (audit), P1 (anomaly escalation)
**Success metric:** Zero unresolved errors, all dispositions documented

### P5 Biostatistician
**Archetype:** "The Quantifier"
**Question:** "Are the numbers right, and what do they mean?"
**Primary views:** Dose-Response
**Annotates:** Minimal (advises P1)
**Collaborates with:** P1 (significance interpretation)
**Success metric:** All endpoints reviewed, statistical concerns flagged

### P6 QA Auditor
**Archetype:** "The Inspector"
**Question:** "Was everything documented and reviewed?"
**Primary views:** Validation, Domain Tables
**Annotates:** Audit observations (not yet available)
**Collaborates with:** P4 (validation fixes), P1 (study compliance)
**Success metric:** Audit trail complete, no undocumented assessments

### P7 Regulatory Reviewer
**Archetype:** "The Skeptic"
**Question:** "Can I trust the sponsor's conclusions?"
**Primary views:** Signals, Target Organs, NOAEL
**Annotates:** Reviewer notes (not yet available)
**Collaborates with:** P1 (via regulatory questions)
**Success metric:** Independently verified NOAEL, no missed signals

# SENDEX Roadmap

> **Purpose:** Strategic prioritization surface. Groups all planned work by functional area.
> **Sources:** `docs/TODO.md` (tactical backlog), `docs/incoming/` (specs), `docs/reports/phuse-repo-cross-reference.md` (external research), user decisions.
>
> **Relationship to TODO.md:** ROADMAP owns epics and features (the "what" and "why"). TODO.md owns bugs, hardcoded values, and implementation-level gaps (the "fix this"). New strategic work starts here; implementation details get broken down into TODO.md items tagged with their ROADMAP area. When a ROADMAP item ships, mark it done here (commit checklist 5b).
>
> **Process:** Pick an area > pick an item > break down into TODO.md tasks if needed > implement > mark done here AND in TODO.md.

**Size key:** **Epic** = multi-sprint, cross-cutting | **Feature** = standalone, 1-3 days | **Improvement** = < 1 day, incremental

---

## Area 1: Statistical & Analytical Engine

The core scientific computation layer. Most items here are unique to SENDEX — no external PHUSE repo covers this ground.

### Epic: Bayesian Historical Borrowing for Incidence Analysis
- **Source:** bayesian_tox (phuse-org), GAP-28, GAP-29
- **What:** Replace post-hoc A-3 factor with formal Bayesian Beta-Binomial prior for MI/MA incidence. ESS-parameterized `Beta(ESS * HC_rate, ESS * (1 - HC_rate))`. Produce `P(theta_trt > theta_ctrl | data)` as continuous probability.
- **Why:** More principled than our current HCD reference range check. Better power for rare findings. Tunable borrowing strength via ESS.
- **Depends on:** GAP-28 (production HCD database wiring)
- **Impl:** `scipy.stats.beta` conjugate update — no MCMC needed for the simple model. ~200 LOC backend.

### Epic: Benchmark Dose (BMD) Modeling
- **Source:** GAP-30, phuse-repo cross-reference (gap across entire PHUSE ecosystem)
- **What:** Implement BMD/BMDL computation via `pybmds` or custom implementation. Model averaging across candidate dose-response models.
- **Why:** Increasingly preferred over NOAEL by EPA, EFSA, and FDA nonclinical reviewers. First-mover opportunity — no PHUSE repo has this.
- **Depends on:** None (additive to existing D-R engine)

### Feature: Bayesian Logistic Dose-Response (incidence)
- **Source:** bayesian_tox Stan model
- **What:** `logit(P) = beta0 + beta1 * dose` with informative Beta prior on intercept from HCD.
- **Why:** Complements Cochran-Armitage trend test for incidence endpoints. Produces credible intervals on response probability at each dose.
- **Depends on:** Bayesian HCD borrowing epic
- **Impl:** PyMC or NumPyro. ~300-400 LOC.

### Feature: Reserved ECETOC Factors (5 data-dependent)
- **Source:** GAP-29
- **What:** A-4 temporal onset, A-5 mechanism plausibility, B-2 general stress confound, B-6 precursor-to-worse (non-tumor), onset-timing modifiers.
- **Depends on:** Various (MOA database, time-course infrastructure, cross-syndrome interference)

### Improvement: Verify MI synonym handling
- **Source:** send-summarizer cross-reference
- **What:** Check if our MI processing treats "CELL DEBRIS" / "CELLULAR DEBRIS", "Infiltration, mononuclear cell" / "Infiltrate", "Fibrosis" / "Fibroplasia/Fibrosis" as separate findings. Add normalization if so.

### Improvement: Verify 4-point severity scale handling
- **Source:** send-summarizer cross-reference
- **What:** Ensure MI severity parsing handles "X OF 4" format (1-of-4 = 2, 2-of-4 = 3, 3-of-4 = 4, 4-of-4 = 5).

### Improvement: Cross-check BIOMARKER_MAP completeness
- **Source:** send-summarizer organ-system TESTCD panels
- **What:** Compare `send_knowledge.py` BIOMARKER_MAP against send-summarizer's reproductive (GNRH, LH, FSH, DHT, TESTOS...), endocrine, and hematopoietic panels.

### Epic: User-Configurable Severity/Adversity Thresholds
- **Source:** Customer demo feedback (2026-03-27), GAP-126
- **What:** Customers define thresholds from clinical experience and historical data. Needs: (a) per-TESTCD / per-organ threshold overrides (e.g., ALT adverse at |d| >= 0.3), (b) configurable incidence thresholds, (c) HCD-informed default thresholds, (d) "threshold profile" concept (named, reusable config per compound/species). Currently `classification.py` has 3 hardcoded modes; `ScoringParams` has some weights. Neither supports per-endpoint granularity.
- **Stage 1:** Per-endpoint threshold overrides in study settings (single study).
- **Stage 2:** Reusable threshold profiles shared across studies (requires GAP-129, HC-03).

---

## Area 2: Historical Control Data

Building out the HCD infrastructure for cross-study reference ranges and Bayesian priors.

### Epic: Production HCD System
- **Source:** GAP-28, sendigR cross-reference
- **What:** (a) Wire frontend ECETOC A-3 to backend HCD data. (b) Production laboratory-specific HCD API with species/strain/lab filtering. (c) Expand strain coverage (BALB/C, LONG-EVANS have <50 records).
- **Depends on:** Backend infrastructure exists (78K+ NTP records, SQLite)

### Feature: CDISC CT Pre-validation for HCD Imports
- **Source:** sendigR's `xptcleaner` module
- **What:** Standardize sex, strain, species, severity, route, specimen, finding type before loading external studies into HCD database.
- **Why:** Cross-study terminology alignment. sendigR has a ready-made Python module for this.

### Feature: Species/Strain Resolution Hierarchy
- **Source:** sendigR DM > TX > TS fallback chain
- **What:** Cross-check our `hcd.py` strain alias resolution against sendigR's hierarchical approach with uncertainty tracking.

### Feature: SUPPQUAL Domain Handling
- **Source:** sendigR cross-reference
- **What:** Parse SUPPMI/SUPPLB/etc. and merge back to parent records. May contain additional severity qualifiers, method details, specimen info.
- **Depends on:** Check if our source XPT data includes SUPP* domains first.

---

## Area 3: Recovery Analysis

Already the most sophisticated recovery engine in the PHUSE ecosystem. Items here refine edge cases.

### Feature: Option D — Same-Arm Recovery Baseline
- **Source:** BUG-21, `docs/incoming/option-d-same-arm-recovery-baseline.md`
- **What:** Use within-subject change instead of between-group Hedges' g for recovery verdict. Eliminates cross-arm baseline shift artifacts.

### Feature: Recovery Verdict Override (Annotation)
- **Source:** GAP-59
- **What:** Allow pathologist to override automated continuous recovery verdict. Stored per endpoint/sex/dose.

### Feature: Recovery Anomaly Discrimination (Brief 8 refinement)
- **Source:** GAP-24
- **What:** Update PRECURSOR_MAP and DELAYED_ONSET_PROPENSITY from Brief 8 deep research. Improve delayed-onset vs spontaneous vs anomaly discrimination.

### Feature: Recovery Override in Findings Table
- **Source:** `docs/incoming/recovery-override-to-findings-table.md`
- **What:** Surface recovery override controls directly in the findings table.

### Feature: Unified Incidence Recovery Charts
- **Source:** `docs/incoming/unified-incidence-recovery-charts.md`
- **What:** Unified chart pattern for incidence domain recovery visualization.

### Improvement: Recovery Pipeline Audit
- **Source:** `docs/incoming/recovery-pipeline-audit.md`
- **What:** End-to-end audit of recovery data flow.

---

## Area 4: Cross-Study Comparison

Currently single-study. Three PHUSE repos (toxSummary, send-summarizer, phuse-scripts) target this space.

### Epic: Multi-Study Support
- **Source:** HC-03, cross-reference report
- **What:** Remove single-study restriction. Support loading and comparing multiple studies in a drug program.
- **Reference implementations:** send-summarizer (radar charts, z-score comparison), toxSummary (safety margin visualization), phuse-scripts HistoGraphicApp (multi-study histopath sunburst)
- **Depends on:** HC-01 (dynamic dose mapping), HC-02 (dynamic recovery arms), database infrastructure

### Feature: Exposure Margin / Safety Margin Calculation
- **Source:** toxSummary cross-reference
- **What:** HED computation with species conversion factors, Cmax/AUC-based safety margins. Standard regulatory deliverable.
- **Depends on:** PP domain support, proposed clinical dose input

### Feature: Cross-Study Threshold Profiles
- **Source:** Customer demo feedback (2026-03-27), GAP-129
- **What:** Named, reusable threshold configurations (e.g., "Compound B — Rat thresholds") that apply consistently across all studies in a program. Enables cross-study comparability when customers want the same severity/adversity criteria everywhere.
- **Depends on:** GAP-126 (per-endpoint thresholds), HC-03 (multi-study support)

---

## Area 5: Data Quality & Validation

Ensuring data integrity before analysis.

### Feature: SEND Conformance Checking
- **Source:** phuse-scripts (CDISC rules v2.0), GAP-36
- **What:** Auto-install and run CDISC CORE validation. Currently requires manual setup.

### Feature: INHAND Vocabulary Normalization
- **Source:** GAP-34
- **What:** Normalize histopathology terms to INHAND controlled vocabulary. XL effort.

### Feature: Validation Rules Completion
- **Source:** MF-03 (VAL-016, VAL-018), GAP-37 (custom rule execution)
- **What:** Visit day alignment check, domain-specific findings checks, custom rule evaluation.

### Improvement: Cross-check subject grouping against groupSEND.R
- **Source:** phuse-scripts cross-reference
- **What:** Verify `subject_context.py` + `dose_groups.py` handle edge cases covered by phuse-scripts' `groupSEND.R`: interim sacrifice, multi-arm TK, recovery start day from SE domain.

### Improvement: Acquire phuse-scripts SEND test datasets
- **Source:** phuse-scripts `data/send/` (16 studies)
- **What:** Additional test data for generator pipeline stress testing.

### Feature: CDISC Controlled Terminology Versioning and Quarterly Updates
- **Source:** Customer demo feedback (2026-03-27), GAP-127
- **What:** (a) Detect CT version from TS domain (SENDCTVER), (b) load/switch between CT versions, (c) backward compatibility — validate against the version the study was built with, (d) update mechanism for quarterly CDISC CT releases. Related: MF-04, GAP-07, GAP-34, sendigR xptcleaner.

---

## Area 6: NOAEL & Weight-of-Evidence

The decision-support layer for regulatory conclusions.

### Epic: NOAEL View Overhaul
- **Source:** `docs/incoming/noael-view-overhaul-audit.md`, `docs/incoming/noael-findings-merge.md`
- **What:** Comprehensive audit and overhaul of the NOAEL determination view.

### Epic: WoE Synthesis Pane
- **Source:** `docs/incoming/woe-synthesis-pane-research.md`
- **What:** Weight-of-evidence synthesis pane for integrating findings across domains into a regulatory conclusion.

### Feature: Pattern/Onset Override → NOAEL Propagation
- **Source:** BUG-23
- **What:** Ensure pattern classification and onset dose overrides flow through ECI → NOAEL weight pipeline.

---

## Area 7: Cohort & Subject Analysis

Subject-level filtering, selection, and comparison.

### Epic: Cohort View Overhaul
- **Source:** `docs/incoming/cohort-view-overhaul.md`, `docs/incoming/cohort-view.md`
- **What:** Composable filters, syndrome-driven selection, temporal onset filtering, recovery reversal queries, sorting, reference cohort comparison.

### Feature: Incidence Center Panel
- **Source:** `docs/incoming/incidence-center-panel.md`
- **What:** Completely different center panel layout for incidence endpoints (not continuous D-R framework).

---

## Area 8: Findings & Dose-Response Views

Core analytical views refinement.

### Feature: Findings View UX Audit
- **Source:** `docs/incoming/findings-view-ux-audit.md`
- **What:** Comprehensive UX audit items for the findings view.

### Feature: Histopathology View Audit
- **Source:** `docs/incoming/histopathology-view-audit.md`
- **What:** Comprehensive audit of histopath view.

### Feature: Findings-Histopath Merge Audit
- **Source:** `docs/incoming/findings-histopath-merge-audit.md`
- **What:** Audit the merge of findings and histopath views for consistency.

### Feature: Center Panel Charts
- **Source:** `docs/incoming/arch01-central-panel-charts-plan.md`
- **What:** Central panel chart improvements.

### Feature: Findings Table Override Menus
- **Source:** `docs/incoming/findings-table-override-menus-plan.md`
- **What:** Right-click override menus in findings table cells.

### Feature: Volcano Effect Axis Fix
- **Source:** `docs/incoming/volcano-effect-axis-fix.md`
- **What:** Fix the effect axis scaling/rendering on volcano plots.

### Improvement: Dose-Response View Interaction Gaps
- **Source:** GAP-55, GAP-39
- **What:** Time-course click-to-profile, evidence chart clickable points, pairwise row click, model fit / correlation / outlier intents.

---

## Area 9: UI Framework & Interaction Model

Cross-cutting UI infrastructure.

### Feature: Multi-Select Interaction Model
- **Source:** BUG-12
- **What:** Ctrl+click multi-select + right-click context menu for scatterplot and rail. Universal selection convention.

### Feature: Autoscroll on Rail Selection
- **Source:** BUG-10
- **What:** Table scrolls to show current finding when rail card clicked.

### Feature: View Consistency Audit Framework
- **Source:** `docs/incoming/view-consistency-audit-framework.md`
- **What:** Systematic framework for auditing consistency across all analysis views.

### Improvement: Panel Resize Freedom
- **Source:** GAP-58
- **What:** Remove hard min/max width limits on resizable panels.

### Improvement: SVG Chart Responsive Rendering
- **Source:** BUG-07, BUG-11, BUG-20
- **What:** Fix dumbbell chart, reference line labels, and D-R error bars at various panel widths.

### Improvement: PaneTable Migration
- **Source:** GAP-56
- **What:** Migrate ~23 pane tables to shared PaneTable component. Opportunistic.

### Idea: Custom Endpoint Groups / Favorites View
- **Source:** GAP-130
- **What:** User-curated named endpoint groups (any combination across domains). Context panel content TBD — needs design exploration (radar chart with HCD? dose concordance? annotation-only?). Extends existing `endpoint-bookmarks` annotation.
- **Priority:** P4 — revisit when core views stable

---

## Area 10: Production Infrastructure

Items blocking production deployment.

### Epic: Authentication & Multi-User
- **Source:** HC-05, HC-06, MF-08, GAP-04, GAP-05, GAP-35
- **What:** Auth middleware, reviewer identity, concurrency control, audit trail (GLP requirement), PWG workflow.

### Epic: Database-Backed Storage
- **Source:** HC-04, HC-09
- **What:** Replace file-based annotation storage with database. Enable transactions, concurrency, multi-user.

### Feature: Dynamic Dose Group Mapping
- **Source:** HC-01, HC-02
- **What:** Derive dose group mapping and recovery arm codes from TX/DM domains instead of hardcoding.
- **Blocks:** Multi-study support

### Improvement: Generator Pipeline Performance (**done**)
- **Source:** Performance investigation (instem: 280s generation time)
- **Spec:** `incoming/generator-pipeline-performance.md`
- **What:** ProcessPoolExecutor for domain computations, Dunnett/JT reuse in stats loop, groupby-based incidence recovery. 280s -> 124s (56%).

### Feature: Backend Test Framework
- **Source:** GAP-22
- **What:** pytest with session-scoped PointCross fixture. Cover recovery API, dose_groups, statistics, generator pipeline, validation engine.

### Feature: Chrome MCP Server for E2E Testing
- **Source:** GAP-17
- **What:** MCP server exposing Chrome DevTools Protocol for integration testing during development.

---

## Area 11: Study Intelligence & Reporting

Study-level summaries, reports, and contextual intelligence.

### Feature: Overview Tab (Study Summary)
- **Source:** GAP-46
- **What:** Entire Overview tab — 0/8 files exist. Spec archived.

### Feature: Generated Report Redesign
- **Source:** GAP-13
- **What:** Redesign HTML report to reflect current view structure.

### Feature: Study Intelligence Gaps
- **Source:** GAP-40
- **What:** User-added timeline annotations, study design validation acknowledgment workflow.

### Feature: Insights Engine Structural Gaps
- **Source:** GAP-48
- **What:** Rule hierarchy, Clinical Weighting Layer, Protective Plausibility Gate, Structured Signal Output, Scoring Model.

### Feature: Chart and Findings Export to PPT/PDF
- **Source:** Customer demo feedback (2026-03-27), GAP-128
- **What:** Export charts (D-R, time-course, volcano, incidence, recovery) and findings tables to PowerPoint and PDF. Datagrok has native chart export; we don't. Needs: SVG/PNG chart capture, table-to-slide formatting, PPT template, batch export option (all charts for an organ/study). Consider server-side PDF via headless browser.

---

## Area 12: Domain-Specific Gaps

Per-domain technical debt and missing capabilities.

### Feature: BG/EG/VS On-Demand Pipeline
- **Source:** GAP-33
- **What:** `unified_findings.py` serves 8 of 12 domains. Add BG, EG, VS.

### Feature: TS Domain Parser (Estrous Cycle)
- **Source:** GAP-21
- **What:** Extract estrous cycle staging for cycle-stage-adjusted organ weight stats.
- **Blocked on:** Study data with FE/EO/RE domains

### Feature: MIMETHOD / Special Stain Handling
- **Source:** GAP-43
- **What:** Extract MIMETHOD for special stain identification.

### Feature: Compound-Class Contextual Warnings
- **Source:** GAP-16
- **What:** Warn when syndrome matches known compound-class effect profile.
- **Blocked on:** External compound-class-to-findings reference database

### Improvement: OM Pattern Classifier Metric Verification
- **Source:** GAP-42
- **What:** Verify pattern classifier uses normalized metric per organ, not absolute weight.

### Improvement: Extend `is_derived` to BW Gain and OM Ratios
- **Source:** GAP-64
- **What:** Flag derived findings to prevent them driving NOAEL.

---

## Area 14: Tool Validation & Confidence

Demonstrating the system produces trustworthy results. Critical for regulatory acceptance and customer confidence.

### Epic: Automated vs Expert Assessment Comparison Report
- **Source:** User requirement, customer feedback
- **What:** Generate a structured side-by-side report comparing SENDEX automated analysis against expert manual analysis for a given study. Output format: table per target organ system showing what the tool found (LB, OM, MI) vs what the expert found, with a summary of concordance.
- **Why:** Builds confidence that the tool is a reliable decision-support system. Regulatory reviewers need to trust the automated output before relying on it.
- **Stage 1 (single study):** For a given study, export the tool's per-organ findings summary (which LB parameters flagged, OM changes, MI findings, dose-response patterns, severity) in a structured format that can be placed alongside an expert's manual summary. Identify concordances and discordances.
- **Stage 2 (cross-study):** Same comparison across multiple studies in a drug program — requires multi-study support (Area 4).
- **Output shape:** Table per organ system: Automated Analysis column | Expert Manual Analysis column. Summary row: concordance narrative. Example organs: Kidney (LB + OM + MI), Liver (LB + OM + MI), Reproductive Tract (OM + MI), Endocrine System (OM + MI), Hematopoietic System (LB + OM + MI).
- **Depends on:** Stage 1 needs a "findings export by organ system" API. Stage 2 needs HC-03 (multi-study).

### Feature: Per-Dose Aggregated Data Export for Manual Report Comparison
- **Source:** Customer request
- **What:** Export per-dose-group aggregated data (group means, SDs, incidence rates, statistical test results) in a format that matches how toxicologists manually compile data for regulatory reports. Enables side-by-side comparison: "here's what the tool computed" vs "here's what I put in my report."
- **Why:** Customers want to verify the tool's numbers match their manual calculations before trusting it for submissions. Also useful as a draft data source for report writing.
- **Output:** CSV/Excel with one sheet per domain, rows = endpoints, columns = dose groups, cells = mean +/- SD (n) or incidence % with p-value.

### Improvement: Concordance Metrics
- **What:** Quantify agreement between automated and expert analysis: % target organs correctly identified, % findings concordant, false positives (tool flagged, expert didn't), false negatives (expert flagged, tool missed).
- **Depends on:** Automated vs Expert comparison report (need both sides populated first).

---

## Area 13: Specs Ready to Implement

Incoming specs not yet started. Pick up when prioritized.

| Spec | Area | Size |
|------|------|------|
| `sendex-onset-dose-override.md` | Findings/D-R | Feature |
| `unified-override-pattern.md` | Findings/D-R | Feature |
| `correlation-context-strategy.md` | Cross-domain | Feature |
| `cohort-view-overhaul.md` | Cohort | Epic |
| `noael-view-overhaul-audit.md` | NOAEL | Epic |
| `woe-synthesis-pane-research.md` | NOAEL/WoE | Epic |
| `noael-findings-merge.md` | NOAEL | Feature |
| `findings-view-ux-audit.md` | Findings | Feature |
| `histopathology-view-audit.md` | Histopath | Feature |
| `findings-histopath-merge-audit.md` | Histopath | Feature |
| `arch01-central-panel-charts-plan.md` | Charts | Feature |
| `arch01-d5d6d12-review.md` | UI polish | Feature |
| `arch01-fixes-ui-polish-plan.md` | UI polish | Feature |
| `findings-table-override-menus-plan.md` | Findings | Feature |
| `recovery-chart-reorganization.md` | Recovery | Feature |
| `recovery-pipeline-audit.md` | Recovery | Improvement |
| `recovery-domain-research.md` | Recovery | Research |
| `recovery-unification-proposal.md` | Recovery | Feature |
| `option-d-same-arm-recovery-baseline.md` | Recovery | Feature |
| `unified-incidence-recovery-charts.md` | Recovery | Feature |
| `recovery-override-to-findings-table.md` | Recovery | Feature |
| `incidence-center-panel.md` | Findings | Feature |
| `volcano-effect-axis-fix.md` | Charts | Improvement |
| `view-consistency-audit-framework.md` | UI | Feature |
| `signal-scoring-sex-concordance-clinical-boost.md` | Engine | Improvement |
| `vaccine-study-diagnostic.md` | Domain | Research |
| `cber-domain-inventory.md` | Domain | Research |
| `pointcross-domain-inventory.md` | Domain | Research |

---

## Quick Reference: What Came From External Repos

| Item | Source Repo | Area | Size | Our Status |
|------|-----------|------|------|------------|
| ESS Beta prior for HCD | bayesian_tox | Engine | Feature | New methodology |
| Bayesian logistic D-R | bayesian_tox | Engine | Feature | New methodology |
| P(trt > ctrl) metric | bayesian_tox | Engine | Improvement | Augments Fisher's |
| HCD DB architecture | sendigR | HCD | Epic (part of) | Cross-check existing |
| xptcleaner CT standardization | sendigR | HCD | Feature | New for HCD imports |
| Species/strain hierarchy | sendigR | HCD | Feature | Cross-check existing |
| SUPPQUAL handling | sendigR | Data Quality | Feature | Missing capability |
| Organ TESTCD panels | send-summarizer | Engine | Improvement | Cross-check BIOMARKER_MAP |
| MI finding synonyms | send-summarizer | Engine | Improvement | Verify handling |
| 4-point severity scale | send-summarizer | Engine | Improvement | Verify handling |
| groupSEND.R subject grouping | phuse-scripts | Data Quality | Improvement | Cross-check existing |
| 16 SEND test datasets | phuse-scripts | Testing | Improvement | Acquire for coverage |
| BMD modeling | All (gap everywhere) | Engine | Epic | First-mover opportunity |
| Cross-study comparison | toxSummary, send-summarizer | Cross-Study | Epic | Future |
| Exposure margins | toxSummary | Cross-Study | Feature | Future |
| CDISC conformance | phuse-scripts | Data Quality | Feature | Partial (GAP-36) |

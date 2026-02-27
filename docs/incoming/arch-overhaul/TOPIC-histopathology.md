# Topic Hub: Histopathology View & Evidence Ecosystem

**Last updated:** 2026-02-26
**Overall status:** Fully shipped. Three-tab evidence view (2,552L), 5-pane context panel (2,356L), severity matrix with subject/group toggle, dose incidence/severity charts with recovery bars, 14 histopath-specific syndrome rules, recovery classification engine, laterality handling, mock historical controls, multi-step peer review form. All 14 enhancements (Phases 1–3) implemented. Backlog items V-6, M-13 deferred.

---

## What Shipped

### Core View Architecture

HistopathologyView (2,552 lines) — three-tab master-detail layout:

| Tab | Component | Content |
|-----|-----------|---------|
| **Evidence** | Inline in HistopathologyView | Observed findings table, dose incidence/severity charts (`DoseChartsSelectionZone`), severity matrix (`SubjectHeatmap` + `MatrixSelectionZone`) |
| **Hypotheses** | `HistopathologyHypothesesTab` (342L) | Exploratory tools: peer comparison (mock HCD), recovery assessment table, dose-dependence methods |
| **Compare** | `CompareTab` (962L) | Multi-specimen comparison with clinical observations, organ weight correlation, and laterality |

Specimen rail is polymorphic — rendered by `SpecimenRailMode.tsx` (513L) via the shell's `ShellRailPanel`, not internal to the view.

### Context Panel (`HistopathologyContextPanel`, 2,356 lines)

5 nested panes (not tabs): SpecimenOverview, LabCorrelates, RecoveryAssessment, PeerComparison, FindingDetail. Each pane supports Mode 1 (complete context) and Mode 2 (issue pane, minimal — per CLAUDE.md design rule).

### Enhancement Phases (All 3 Shipped)

**Phase 1 — Signal integrity** (`71f8567`): 5 enhancements.

| # | Enhancement | Key change |
|---|-------------|------------|
| 3 | Clinical-aware signal score | `clinicalClassFloor` + `sentinelBoost` terms; S badge on rail |
| 5 | Sentinel event flagging | `▴` indicator on group heatmap cells when max sev ≥ 3 and exceeds avg by ≥ 2 |
| 10 | Examined vs. no-findings | Three-state cell: blank (not examined), dashed `0/N` (examined, none), heat-colored |
| 11 | Non-monotonic dose-response | Fourth dose consistency category `NonMonotonic` with `▲▼` rail glyph; high-dose mortality check |
| 14 | Sex-difference statistics | Fisher's exact 2×2 in `statistics.ts`; p-value in context panel; sexSkew threshold (20pp + p < 0.10) |

Minor gaps: G1 (S badge tooltip uses class label, not finding names), G2 (sentinel glyph tooltip simplified), G3 (non-monotonic tooltip omits peak dose label). All deliberate scope reductions.

**Phase 2 — Scientific depth** (`6e96707`): 4 enhancements.

| # | Enhancement | Key change |
|---|-------------|------------|
| 1 | Historical controls (stub) | `mock-historical-controls.ts` (439L) with ~30 findings seeded from Charles River data; Peer Comparison tool in Hypotheses tab; HCD context line in Insights pane |
| 7 | Statistical methods | 5-method context menu (Moderate+, Strong only, Cochran-Armitage, JT, Fisher's pairwise); compact G-label cell display |
| 8 | Recovery finding-nature | `finding-nature.ts` (242L): adaptive/degenerative/proliferative/inflammatory classification; nature-aware recovery assessment |
| 12 | R16 cross-organ coherence | Expanded tooltip with full spec text; cross-organ entry format includes finding name + incidence; click navigates to specimen |

All 15 post-implementation gaps fixed. Decision points D-5 through D-8 documented in spec.

**Phase 3 — Workflow enrichment** (`ff32690`): 3 enhancements.

| # | Enhancement | Key change |
|---|-------------|------------|
| 2 | Cross-domain correlation | `useSpecimenLabCorrelation` (130L) correlates LB findings with current specimen; displayed in HistopathologyContextPanel LabCorrelates pane |
| 4 | Laterality | `laterality.ts` (123L) with `isPairedOrgan()`, `PAIRED_ORGANS`; backend MILAT/MALAT extraction; conditional column + heatmap indicators |
| 9 | Enhanced peer review | `PathologyReviewForm.tsx` (422L): multi-step Agree/Disagree/Defer form; 6-status specimen review classification |

### Histopathology Syndrome Detection (`syndrome-rules.ts`, 544 lines)

14 hardcoded pattern rules (NOT the cross-domain engine in TOPIC-syndrome-engine):
- Testicular degeneration, hepatotoxicity classic, hepatocellular adaptation, nephrotoxicity tubular, CPN, bone marrow suppression, lymphoid depletion, GI toxicity, cardiac toxicity, adrenal hypertrophy, phospholipidosis, spontaneous cardiomyopathy, GI mucosal toxicity, injection site reaction
- Strain suppressions (IMP-06b), sex filtering, route gates
- Input: `Map<organ, LesionSeverityRow[]>` — operates on histopath-specific data, not cross-domain endpoint summaries

### Recovery Classification Engine (1,130 lines across 2 files)

- `recovery-assessment.ts` (567L) — reversibility scoring, pooling logic, time phase classification
- `recovery-classification.ts` (563L) — classify findings as reversible/irreversible/partially reversible, 6 interpretive categories, confidence model

Consumed by: HistopathologyContextPanel RecoveryAssessment pane, Hypotheses tab recovery assessment table, CompareTab recovery comparison.

### Severity Visualization

- `severity-colors.ts` (343L) — 5-step neutral grayscale heat ramp via `getNeutralHeatColor()`, severity color functions, interaction-driven evidence colors
- `SubjectHeatmap.tsx` (611L) — severity matrix with group/subject toggle, sentinel indicators
- `histopathology-charts.ts` (693L) — ECharts builders for dose incidence/severity bars with recovery bar extension

### Supporting Logic

- `finding-aggregation.ts` (169L) — aggregate findings by specimen/organ/lesion
- `finding-nature.ts` (242L) — adaptive/degenerative/proliferative/inflammatory classification
- `histopathology-helpers.ts` (389L) — utility functions for view, CompareTab, heatmap, dose charts
- `statistics.ts` (63L) — Fisher's exact 2×2 (log-factorial, hand-rolled)
- `laterality.ts` (123L) — paired organ detection, MILAT/MALAT handling
- `mock-historical-controls.ts` (439L) — ~30 findings seeded from Charles River SD rat data
- `subject-profile-logic.ts` (188L) — animal timeline, recovery bar rendering

### Subject Profile Panel (877 lines, design frozen)

`SubjectProfilePanel.tsx` — individual animal cross-domain evidence panel. **Design frozen per CLAUDE.md hard rule.** Functional bug fixes exempt; visual changes require explicit user approval. Consumed from histopathology view and other views.

### Key Commits

| Commit | Description |
|--------|-------------|
| `71f8567` | Phase 1: signal integrity (#3, #5, #10, #11, #14) |
| `6e96707` | Phase 2: scientific depth (#1 HCD stub, #7 stat methods, #8 finding-nature, #12 R16) |
| `ff32690` | Phase 3: workflow enrichment (#2 cross-domain, #4 laterality, #9 peer review) |
| `24e6224` | StudyContext type + severity tri-state model (histopath engine phase 1) |
| `7088b22` | Finding nature severity modulation, pattern weights, NOAEL transparency |
| `82c380b` | Move recovery assessment table from Hypotheses to context panel |
| `e51c67f` | Add 62 recovery assessment + classification tests |
| `40287a6` | Add organ weight strip to histopathology specimen header |

---

## What's NOT Shipped (spec vs. reality)

### Backlog (deferred by design)

| ID | Item | Spec | Reason |
|----|------|------|--------|
| V-6 | SEND vocabulary normalization / INHAND harmonization | Enhancement #6 | Requires terminology service + controlled vocabulary database. XL effort. |
| M-13 | MIMETHOD / special stain handling | Enhancement #13 | Requires MIMETHOD field extraction from MI domain. P3 priority. |
| H-1 | Production historical control database | Enhancement #1 backlog | Mock data shipped; production needs laboratory-specific HCD API with species/strain/lab filtering. |
| R-9a | Full PWG workflow | Enhancement #9 backlog | Multi-step review form shipped; full panel invitation, slide distribution, concordance, and consensus recording deferred. P3. |
| D-2b | Organ weight correlation in cross-domain pane | Enhancement #2 backlog | Lab correlates shipped; dedicated OW group-level mean±SD per dose group not built. |
| D-11a | Disposition/mortality per dose group flag | Enhancement #11 backlog | Non-monotonic detection shipped; high-dose mortality masking check uses existing DS data but dedicated dose-group-level mortality flag not surfaced. |
| S-3a | Signal score transparency / configurable weights | Enhancement #3 backlog | Fixed formula with clinical-class and sentinel terms shipped; user-adjustable weights deferred. P3. |

### Minor gaps (Phase 1)

| ID | Gap | Status |
|----|-----|--------|
| G1 | S badge tooltip shows clinical class, not individual sentinel finding names | Deliberate — class label sufficient for triage |
| G2 | Sentinel glyph tooltip simplified from spec format | Extended info in cell tooltip on hover |
| G3 | Non-monotonic tooltip omits peak dose label | Dose data not available in rail without extra fetch |

---

## Roadmap

### Near-term
- MIMETHOD extraction (M-13) — low-effort backend change, display as visual indicator on special-stain findings
- Disposition/mortality dose-group flag (D-11a) — surface existing DS data as structured per-group summary

### Medium-term
- Historical control database integration (H-1) — replace mock data with laboratory-specific API
- Organ weight correlation in cross-domain pane (D-2b) — group-level mean±SD per dose group

### Long-term
- SEND vocabulary normalization (V-6) — INHAND terminology service, fuzzy matching, mapping UI
- Full PWG workflow (R-9a) — multi-user collaboration, slide distribution, concordance
- Signal score configurable weights (S-3a) — user-adjustable weight profiles

---

## File Map

### Specifications (historical)

| File | Role | Status |
|------|------|--------|
| `docs/incoming/arch-overhaul/histopath-engine-spec.md` | Engine improvement spec (1,196L): StudyContext, IMP items, severity tri-state, CT normalization | IMPLEMENTED |
| `docs/incoming/arch-overhaul/histopathology-enhancements-spec.md` | 14 enhancements (1,113L): Phases 1–3 + backlog table | IMPLEMENTED (12/14). V-6, M-13 deferred. |
| `docs/incoming/arch-overhaul/recovery-dose-charts-spec.md` | Recovery bars in dose charts (619L): append recovery bars, visual separator, stable frame rule | IMPLEMENTED |
| `docs/incoming/arch-overhaul/protective-signal-spec.md` | Protective signal handling (424L) | IMPLEMENTED — "repurposing" label removed as scientifically inappropriate |
| `docs/incoming/arch-overhaul/individual-animal-view-spec.md` | Individual animal panel spec (235L) | IMPLEMENTED — design frozen per CLAUDE.md |

### View spec

| File | Sections | Current? |
|------|----------|----------|
| `docs/views/histopathology.md` | Full view spec: 3 tabs, specimen rail, selection zones, severity matrix, dose charts, recovery classification | Yes — updated 2026-02-15 |

### System specs

| File | Relevant sections | Current? |
|------|-------------------|----------|
| `docs/systems/data-pipeline.md` | Lesion severity summary generation, MI/MA/TF domain processing | Yes |
| `docs/systems/insights-engine.md` | Syndrome boost in signal scoring, R01–R17 histopath rules | Yes |

### Implementation (code)

#### Frontend — core view & tabs (4 files, 3,863 lines)

| File | Lines | Role |
|------|-------|------|
| `components/analysis/HistopathologyView.tsx` | 2,552 | Evidence tab: findings table, dose charts, severity matrix |
| `components/analysis/HistopathologyViewWrapper.tsx` | 7 | Wrapper setting rail mode |
| `components/analysis/HistopathologyHypothesesTab.tsx` | 342 | Hypotheses: peer comparison, recovery assessment, dose-dep methods |
| `components/analysis/CompareTab.tsx` | 962 | Multi-specimen comparison with CL, OW, laterality |

#### Frontend — context panel & panes (3 files, 3,113 lines)

| File | Lines | Role |
|------|-------|------|
| `panes/HistopathologyContextPanel.tsx` | 2,356 | 5-pane context: SpecimenOverview, LabCorrelates, Recovery, PeerComparison, FindingDetail |
| `panes/RecoveryPane.tsx` | 335 | Recovery detail pane (standalone) |
| `panes/PathologyReviewForm.tsx` | 422 | Multi-step Agree/Disagree/Defer form, 6-status classification |

#### Frontend — visualization (4 files, 1,746 lines)

| File | Lines | Role |
|------|-------|------|
| `components/analysis/SubjectHeatmap.tsx` | 611 | Severity matrix, group/subject toggle, sentinel indicators |
| `charts/histopathology-charts.ts` | 693 | ECharts dose incidence/severity bar builders + recovery bars |
| `components/analysis/DoseChartsSelectionZone.tsx` | 195 | Dose chart selection interaction |
| `components/analysis/MatrixSelectionZone.tsx` | 247 | Severity matrix selection interaction |

#### Frontend — rail, selection, profile (4 files, 2,338 lines)

| File | Lines | Role |
|------|-------|------|
| `components/shell/SpecimenRailMode.tsx` | 513 | Polymorphic specimen rail |
| `components/analysis/FindingsSelectionZone.tsx` | 71 | Findings table row selection |
| `panes/SubjectProfilePanel.tsx` | 877 | Individual animal panel (design frozen) |
| `components/analysis/SubjectHeatmap.tsx` | — | (listed in visualization above) |

#### Frontend — library (9 files, 2,574 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/syndrome-rules.ts` | 544 | 14 histopathology-specific pattern rules |
| `lib/recovery-assessment.ts` | 567 | Reversibility scoring, pooling, phase classification |
| `lib/recovery-classification.ts` | 563 | Reversible/irreversible classification, 6 categories |
| `lib/mock-historical-controls.ts` | 439 | ~30 mock HCD entries from Charles River SD rat data |
| `lib/histopathology-helpers.ts` | 389 | Utility functions for view, CompareTab, heatmap |
| `lib/finding-nature.ts` | 242 | Adaptive/degenerative/proliferative/inflammatory |
| `lib/finding-aggregation.ts` | 169 | Aggregate by specimen/organ/lesion |
| `lib/laterality.ts` | 123 | Paired organ detection, MILAT/MALAT |
| `lib/statistics.ts` | 63 | Fisher's exact 2×2 (log-factorial) |

#### Frontend — shared library (2 files, 531 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/severity-colors.ts` | 343 | Neutral heat ramp, severity colors — *shared across all views* |
| `lib/subject-profile-logic.ts` | 188 | Animal timeline, recovery bars — *shared with other views* |

#### Frontend — hooks (7 files, 315 lines)

| File | Lines | Role |
|------|-------|------|
| `hooks/useSpecimenLabCorrelation.ts` | 130 | LB findings correlated with current specimen |
| `hooks/useOrganRecovery.ts` | 110 | Recovery data by organ |
| `hooks/useRecoveryComparison.ts` | 25 | Multi-specimen recovery comparison |
| `hooks/useSubjectProfile.ts` | 14 | Individual animal profile data |
| `hooks/useHistopathSubjects.ts` | 14 | Specimen list fetch |
| `hooks/useFindingDoseTrends.ts` | 11 | Dose trend data for selected finding |
| `hooks/useLesionSeveritySummary.ts` | 11 | Pre-generated lesion severity data |

#### Frontend — tests (3 files, 1,609 lines)

| File | Lines | Tests | Coverage |
|------|-------|-------|----------|
| `tests/recovery.test.ts` | 764 | 62 | Recovery assessment + classification |
| `tests/recovery-pooling.test.ts` | 563 | 28 | Recovery pooling toggle integration |
| `tests/subject-profile-logic.test.ts` | 282 | 33 | Animal timeline, recovery bar rendering |

#### Backend (serving histopathology data)

| File | Lines | Role |
|------|-------|------|
| `generator/view_dataframes.py` | 587 | `build_lesion_severity_summary()` — *shared, listed in TOPIC-data-pipeline* |
| `services/analysis/findings_tf.py` | 208 | Tumor Findings domain — *shared, listed in TOPIC-data-pipeline* |
| `routers/analysis_views.py` | 121 | Serves lesion-severity-summary — *shared* |

Backend code is primarily shared with TOPIC-data-pipeline. No histopathology-specific backend modules beyond the domain finding modules.

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Frontend components | 15 | 11,060 |
| Frontend library | 11 | 3,105 |
| Frontend hooks | 7 | 315 |
| Frontend tests | 3 | 1,609 |
| **Grand total (frontend)** | **36** | **16,089** |

*Excludes shared backend files already in TOPIC-data-pipeline. Excludes cross-domain syndrome engine files in TOPIC-syndrome-engine.*

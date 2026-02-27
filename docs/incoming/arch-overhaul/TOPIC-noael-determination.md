# Topic Hub: NOAEL Determination & Signal Analysis

**Last updated:** 2026-02-27
**Overall status:** Fully shipped. 5-tab evidence view (2,003L), NOAEL banner with override, StudyStatementsBar + ProtectiveSignalsBar, signals panel engine (664L), three-tier protective classification, NOAEL narrative, PK exposure integration, safety margin calculator, adversity matrix, signal matrix (organ-scoped heatmap), rule inspector. Endpoint Confidence Index shared with TOPIC-organ-measurements.

---

## What Shipped

### View Architecture (`NoaelDeterminationView.tsx`, 2,003 lines)

Flex column layout: persistent NOAEL banner → StudyStatementsBar → ProtectiveSignalsBar → PK warnings → safety margin calculator → organ header → 5-tab evidence panel.

| Tab | Content |
|-----|---------|
| **Evidence** | Endpoint summary (sorted by severity → TR → effect size), organ-scoped insights |
| **Adversity matrix** | Neutral grayscale severity matrix + adverse effect grid with recovery column |
| **Signal matrix** | `OrganGroupedHeatmap` in single-organ mode, shared signal selection |
| **Metrics** | Sortable 12-column signal table, session-persisted sort/sizing |
| **Rules** | `RuleInspectorTab` with threshold editor and custom rule builder |

Organ selection via shell-level `OrganRailMode` (not embedded in view). Auto-selects first organ on load. Inbound navigation via `location.state: { organ_system }`.

### NOAEL Banner (persistent, non-scrolling)

Up to 3 cards (Combined, Males, Females) showing NOAEL/LOAEL determination:
- **Status indicators:** Established (green `#15803d`) / Not established (red `#dc2626`) — text-only, no background color
- **Inline override form:** dose selector + rationale textarea, persisted via annotations API (`noael-override` schema)
- **Divergent NOAEL support:** sex-specific narratives when M/F have different NOAEL levels
- **LOAEL dose-limiting findings:** clickable buttons (up to 3) navigating to organ in Evidence tab
- **Confidence popover:** ECI percentage with 5-dimension breakdown, color-coded (green ≥80%, amber ≥60%, red <60%)

PK exposure section (conditional): Cmax, AUC, HED, MRSD from `usePkIntegration`. Safety margin calculator with interactive human exposure inputs.

### Narrative Generation (`noael-narrative.ts`, 148 lines)

`generateNoaelNarrative()` produces human-readable rationale text for the banner and context panel. Handles divergent (sex-specific) narratives. **Deliberately simple** — plain-language summary of the determination, not a verbose report.

### Signals Panel Engine (`signals-panel-engine.ts`, 664 lines)

`buildSignalsPanelData()` synthesizes study-level findings into structured output:
- **Study statements** — key findings (e.g., target organs identified, dose-limiting findings)
- **Modifiers** — study-level qualifying observations (e.g., high-dose mortality, non-monotonic response)
- **Caveats** — study design limitations

Each item carries an icon type (`fact`, `warning`, `review-flag`) and optional organ scoping. Organ-scoped items filter by selected organ; study-level items always display.

### Protective Signal Classification (`protective-signal.ts`, 181 lines)

Three-tier classification replacing the original binary "repurposing" flag (removed as scientifically inappropriate per `protective-signal-spec.md`):

| Tier | Display | Criteria |
|------|---------|----------|
| Pharmacological | Blue border-left, prominent | Finding in `PHARMACOLOGICAL_EXCLUSIONS` list (known drug class effects) |
| Treatment-decrease | Slate border-left, medium | Decreased incidence, treatment-related, not pharmacological |
| Background | Gray border-left, compact | Other decreased findings (spontaneous variation, aging) |

`aggregateProtectiveFindings()` extracts R18/R19 rule results. Cross-domain correlates derived from signal data by matching organ system.

### Context Panel (`NoaelContextPanel.tsx`, 576 lines)

Three states following design system priority (insights → stats → annotation → navigation):

| State | Panes |
|-------|-------|
| No selection | NOAEL rationale, study-level insights, footer prompt |
| Organ selected | Organ insights, contributing endpoints table, evidence breakdown, related views |
| Endpoint selected | Endpoint insights, statistics (signal score popover), adversity rationale, source records, correlations, tox assessment form, related views, audit trail, methodology |

### Endpoint Confidence Index (shared with TOPIC-organ-measurements)

`endpoint-confidence.ts` (922L) provides the 5-dimension min-aggregation framework that determines NOAEL contribution weighting. Documented in detail in TOPIC-organ-measurements. Key integration points with this hub:

- **NOAEL contribution weighting** — 0.0/0.3/0.7/1.0 weights from integrated confidence
- **Weighted NOAEL derivation** — study-level NOAEL from weighted endpoint contributions
- **Confidence display** — banner popover, context panel breakdown

### Supporting Components

| Component | Lines | Role |
|-----------|-------|------|
| `SignalHeatmap.tsx` | 162 | Heatmap visualization for signal matrix tab |
| `OrganGroupedHeatmap.tsx` | 430 | Multi-organ or single-organ signal heatmap |
| `RuleInspectorTab.tsx` | 324 | Rule catalog, threshold editor, custom rule builder |
| `ToxFindingForm.tsx` | 182 | Tox assessment annotation form |
| `OrganRailMode.tsx` | 416 | Shell-level organ selection rail — *shared with Study Summary* |

### Backend Signal Scoring & Rules

| File | Lines | Role |
|------|-------|------|
| `scores_and_rules.py` | 394 | Pre-generates rule evaluation (R01–R19) + signal scores — *also in TOPIC-data-pipeline* |
| `insights_engine.py` | 862 | Backend synthesis: rule results → structured insights, protective exclusions |
| `insights.py` | 523 | Signal scoring computation, insight rule evaluation |
| `pk_integration.py` | 883 | PK exposure (Cmax, AUC, HED, MRSD), dose proportionality, safety margins |
| `analysis_schemas.py` | 130 | Pydantic schemas: `NoaelSummaryRow`, `AdverseEffectSummaryRow`, `SignalSummaryRow` |

### Key Commits

| Commit | Description |
|--------|-------------|
| `9beb9d0` | Merge Signals tab into NOAEL view, redesign Study Summary as 2-tab orientation page |
| `efb95ba` | Endpoint confidence integrity (ECI) — 4 mechanisms prevent low-quality endpoints from anchoring NOAEL |
| `3c7e44d` | Replace repurposing with three-tier protective classification |
| `92dc33a` | Resolve 11 spec audit gaps for protective signal classification |
| `b4e8da3` | Confidence panel — expandable dimension rows with spec-aligned content |
| `aa4311c` | Unify confidence display, skip ECI trend validity when ANCOVA available |
| `0b72688` | Polish NOAEL view design, redesign Decision Bar |
| `510d675` | NOAEL adversity matrix — neutral grayscale + tooltips |

---

## What's NOT Shipped (spec vs. reality)

### Deferred by design

| ID | Item | Spec | Reason |
|----|------|------|--------|
| N-1 | Scatter plot NOAEL color dimension | `scatter-noael-dimension-spec.md` (131L) | Warm color tint on scatter dots for low-NOAEL endpoints. Requires scatter chart integration (scatter is in Dose Response view). |
| N-2 | Full PWG-style expert review workflow | — | Multi-reviewer NOAEL consensus. Current: single-reviewer override form with rationale. |
| N-3 | NOAEL comparison across studies | — | Requires multi-study support (HC-03). |
| N-4 | Automated NOAEL narrative enrichment | — | Narrative is deliberately simple. Agent mistake risk: over-engineering the narrative with verbose regulatory language. |
| N-5 | Signal score configurable weights | `insights-engine.md` backlog | Fixed formula; user-adjustable weight profiles deferred (also in TOPIC-histopathology S-3a). |

### Minor gaps

| Gap | Status |
|-----|--------|
| RED-02: NOAEL summary table removed from context panel | Deliberate — banner already shows sex × NOAEL × LOAEL × confidence |
| Signal scoring formula only in code | Referenced in `data-pipeline.md` but not reproduced as documentation |
| Confidence popover doesn't show raw dimension scores for all 5 dimensions in all states | Shows breakdown but some edge cases show partial data |

---

## Roadmap

### Near-term
- Signal scoring formula documentation (extract from `signals-panel-engine.ts` into system spec)
- Confidence popover edge case coverage (ensure all 5 dimensions always display)

### Medium-term
- Scatter plot NOAEL color dimension (N-1) — warm tint for low-NOAEL endpoints
- PK-informed safety margin reporting (expand calculator output)

### Long-term
- Multi-study NOAEL comparison (blocked on HC-03)
- Multi-reviewer consensus workflow (N-2)

---

## File Map

### Specifications

| File | Role | Status |
|------|------|--------|
| `docs/views/noael-determination.md` | Full view spec: 5 tabs, banner, bars, context panel, state management (623L) | CURRENT |
| `docs/incoming/arch-overhaul/protective-signal-spec.md` | Three-tier protective classification (424L) | IMPLEMENTED |
| `docs/incoming/arch-overhaul/spec_endpoint_confidence_integrity.md` | ECI 5-dimension framework (1,091L) | IMPLEMENTED — *also in TOPIC-organ-measurements* |
| `docs/incoming/arch-overhaul/archive/scatter-noael-dimension-spec.md` | Scatter NOAEL color tint (131L) | NOT IMPLEMENTED (N-1) |

### System specs

| File | NOAEL sections | Current? |
|------|----------------|----------|
| `docs/systems/insights-engine.md` | R01–R19 rules, signal scoring, protective exclusions, synthesis | Yes |
| `docs/systems/data-pipeline.md` | NOAEL summary generation, signal summary, rule results output | Yes |
| `docs/systems/annotations.md` | `noael-override` schema type | Yes |

### Knowledge docs

| File | Entries | Current? |
|------|---------|----------|
| `docs/knowledge/methods-index.md` | CLASS-06 (NOAEL/LOAEL Backend), CLASS-07 (Endpoint NOAEL), CLASS-11 (Protective Signal), CLASS-13 (Adversity Assessment), CLASS-14 (Overall Severity Cascade), CLASS-18 (Rule Engine R01–R19), CLASS-26 (NOAEL Contribution Weight), CLASS-27 (Weighted NOAEL Derivation) | Yes |
| `docs/knowledge/field-contracts-index.md` | FIELD-07 (mortality NOAEL cap), FIELD-10 (endpoint NOAEL tier/dose), FIELD-30 (mortality cap relevance), FIELD-34 (signal composite score), FIELD-35 (adverse signal confidence), FIELD-42 (protective signal class), FIELD-44 (NOAEL narrative), FIELD-53 (ECI assessment), FIELD-58 (NOAEL contribution weight), FIELD-59 (weighted NOAEL result) | Yes |

### Deep research

| File | Lines | Role |
|------|-------|------|
| `docs/deep-research/integrating-pk-with-tox-to-compute-preclinical-exposure-margins.md` | 179 | PK-tox exposure margin methodology — informs `pk_integration.py` safety margin calculator |

### Implementation (code)

#### Frontend — view & context panel (3 files, 2,586 lines)

| File | Lines | Role |
|------|-------|------|
| `components/analysis/NoaelDeterminationView.tsx` | 2,003 | 5-tab evidence view, NOAEL banner, StudyStatementsBar, ProtectiveSignalsBar |
| `components/analysis/NoaelDeterminationViewWrapper.tsx` | 7 | Rail mode preference wrapper |
| `panes/NoaelContextPanel.tsx` | 576 | 3-state context panel (no-sel, organ, endpoint) |

#### Frontend — supporting components (4 files, 1,098 lines)

| File | Lines | Role |
|------|-------|------|
| `charts/SignalHeatmap.tsx` | 162 | Signal matrix heatmap |
| `charts/OrganGroupedHeatmap.tsx` | 430 | Multi/single-organ grouped heatmap |
| `analysis/RuleInspectorTab.tsx` | 324 | Rule catalog, thresholds, custom rules |
| `panes/ToxFindingForm.tsx` | 182 | Tox assessment annotation form |

#### Frontend — library (3 files, 993 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/signals-panel-engine.ts` | 664 | Study statement synthesis, organ blocks, metrics — *also in TOPIC-data-pipeline* |
| `lib/protective-signal.ts` | 181 | Three-tier protective classification |
| `lib/noael-narrative.ts` | 148 | NOAEL rationale narrative generation |

#### Frontend — shared library (cross-referenced)

| File | Lines | Owner |
|------|-------|-------|
| `lib/endpoint-confidence.ts` | 922 | TOPIC-organ-measurements — NOAEL weighting is a consumer |
| `lib/derive-summaries.ts` | 632 | TOPIC-data-pipeline — adversity matrix derivation is a consumer |
| `lib/recovery-assessment.ts` | 567 | TOPIC-recovery-phase-detection — recovery column is a consumer |

#### Frontend — hooks (7 files, 135 lines)

| File | Lines | Role |
|------|-------|------|
| `hooks/useNoaelSummary.ts` | 11 | NOAEL summary fetch (React Query, 5min stale) |
| `hooks/useEffectiveNoael.ts` | 49 | Merge NOAEL data with override annotations |
| `hooks/useAdverseEffectSummary.ts` | 11 | Adverse effect summary fetch |
| `hooks/useStudySignalSummary.ts` | 11 | Signal summary fetch |
| `hooks/useRuleResults.ts` | 11 | Rule results fetch (shared cache) |
| `hooks/useTargetOrganSummary.ts` | 11 | Target organ summary fetch |
| `hooks/usePkIntegration.ts` | 12 | PK exposure data fetch |
| `hooks/useInsights.ts` | 30 | Insights data fetch |

#### Frontend — shell (shared)

| File | Lines | Role |
|------|-------|------|
| `shell/OrganRailMode.tsx` | 416 | Shell-level organ selection rail — *shared with Study Summary, target organs* |

#### Backend — API routing (1 file, 121 lines)

| File | Lines | Role |
|------|-------|------|
| `routers/analysis_views.py` | 121 | Serves `noael-summary` (+ 17 other view endpoints) — *shared, also in TOPIC-data-pipeline* |

#### Backend — scoring & insights (4 files, 1,909 lines)

| File | Lines | Role |
|------|-------|------|
| `services/insights_engine.py` | 862 | Backend synthesis engine, R01–R19 evaluation, protective exclusions |
| `services/analysis/insights.py` | 523 | Signal scoring, insight rule evaluation |
| `generator/scores_and_rules.py` | 394 | Pre-generated rule evaluation — *also in TOPIC-data-pipeline* |
| `models/analysis_schemas.py` | 130 | Pydantic schemas for NOAEL, AE, signal summary rows |

#### Backend — PK integration (1 file, 883 lines)

| File | Lines | Role |
|------|-------|------|
| `generator/pk_integration.py` | 883 | PK exposure (Cmax, AUC, HED, MRSD), dose proportionality, safety margins |

#### Frontend — tests (2 files, 962 lines, 64 test cases / 150 assertions)

| File | Lines | Test cases | Assertions | Coverage |
|------|-------|------------|------------|----------|
| `tests/endpoint-confidence.test.ts` | 756 | 50 | 134 | ECI 5-dimension computation, concordance, NOAEL weighting |
| `tests/derive-summaries.test.ts` | 206 | 14 | 16 | Endpoint/organ summary derivation |

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Frontend components | 7 | 3,684 |
| Frontend library (owned) | 3 | 993 |
| Frontend hooks | 8 | 146 |
| Frontend shell (shared) | 1 | 416 |
| Backend API routing (shared) | 1 | 121 |
| Backend scoring & insights | 4 | 1,909 |
| Backend PK | 1 | 883 |
| Tests | 2 | 962 |
| **Grand total (owned + shared)** | **27** | **9,114** |

*Endpoint confidence (922L), derive-summaries (632L), and recovery-assessment (567L) are cross-referenced from their owning TOPICs. If counted, subsystem footprint reaches ~11,114 lines.*

### Cross-TOPIC Boundaries

| Concern | This hub | Other hubs |
|---------|----------|------------|
| NOAEL view, banner, narrative | **Owns** | — |
| Signals panel engine | **Owns** | Data-pipeline cross-refs |
| Protective signal classification | **Owns** | TOPIC-histopathology consumes via `ProtectiveSignalsBar` findings |
| Signal scoring formula | **Owns** (frontend) | Data-pipeline cross-refs backend |
| ECI 5-dimension framework | Consumer | **TOPIC-organ-measurements owns** |
| NOAEL contribution weighting | **Owns** (weighting logic) | OM owns ECI computation |
| Adversity matrix derivation | Consumer | **TOPIC-data-pipeline owns** `derive-summaries.ts` |
| Recovery column in adversity grid | Consumer | **TOPIC-recovery owns** recovery-assessment |
| R01–R19 rule engine | Consumer | **TOPIC-data-pipeline owns** `scores_and_rules.py` |
| PK integration | **Owns** | — |

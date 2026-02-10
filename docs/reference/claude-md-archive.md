# CLAUDE.md — Archived Reference Detail

> **Purpose:** Verbose reference tables and implementation details moved from CLAUDE.md to reduce always-loaded context. Agents `Read` this file on demand when they need specific API paths, module locations, color hex values, or implementation details.
>
> **Source:** Extracted from CLAUDE.md on 2026-02-09 during context window optimization.

---

## API Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/studies` | All studies with summary metadata |
| GET | `/api/studies/{study_id}/metadata` | Full study metadata from TS domain |
| GET | `/api/studies/{study_id}/domains` | List of domains with row/col counts |
| GET | `/api/studies/{study_id}/domains/{domain_name}?page=&page_size=` | Paginated domain data |
| GET | `/api/studies/{study_id}/analyses/adverse-effects?page=&page_size=&domain=&sex=&severity=&search=` | Dynamic adverse effects (computed on request) |
| GET | `/api/studies/{study_id}/analyses/adverse-effects/finding/{finding_id}` | Finding context detail |
| GET | `/api/studies/{study_id}/analyses/adverse-effects/summary` | Adverse effects summary counts |
| GET | `/api/studies/{study_id}/analysis/{view_name}` | Pre-generated JSON (see view names below) |
| GET | `/api/studies/{study_id}/analysis/static/{chart_name}` | Pre-generated HTML charts |
| POST | `/api/studies/{study_id}/validate` | Run validation engine, cache results |
| GET | `/api/studies/{study_id}/validation/results` | Cached validation results (rules + summary) |
| GET | `/api/studies/{study_id}/validation/results/{rule_id}/records` | Paginated affected records for a rule |
| POST | `/api/studies/{study_id}/validation/scripts/{script_key}/preview` | Fix script before/after preview |

---

## Frontend Routes

Routes (React Router 7, defined in `App.tsx`):

| Route | Component | Status |
|-------|-----------|--------|
| `/` | AppLandingPage | Done |
| `/studies/:studyId` | StudySummaryViewWrapper | Done |
| `/studies/:studyId/domains/:domainName` | CenterPanel | Done |
| `/studies/:studyId/analyses/adverse-effects` | AdverseEffectsView | Done |
| `/studies/:studyId/dose-response` | DoseResponseViewWrapper | Done |
| `/studies/:studyId/target-organs` | TargetOrgansViewWrapper | Done |
| `/studies/:studyId/histopathology` | HistopathologyViewWrapper | Done |
| `/studies/:studyId/noael-decision` | NoaelDecisionViewWrapper | Done |
| `/studies/:studyId/validation` | ValidationViewWrapper | Done |

---

## Frontend Module Inventory

- `lib/api.ts` — fetch wrapper for domain browsing (`/api` base, proxied by Vite)
- `lib/analysis-api.ts` — fetch functions for dynamic adverse effects
- `lib/analysis-view-api.ts` — fetch functions for all pre-generated JSON views (signal, target organ, dose-response, organ evidence, lesion severity, NOAEL, adverse effect, rule results)
- `lib/analysis-definitions.ts` — `ANALYSIS_VIEWS` array (key, label, implemented flag)
- `lib/severity-colors.ts` — color functions for p-values, signal scores, severity, domains, sex
- `lib/signals-panel-engine.ts` — Signals Panel engine (derives semantic rules from NOAEL/organ/signal data, priority-band section assignment, compound merge)
- `lib/rule-synthesis.ts` — organ-grouped rule synthesis for InsightsList context panel (parses R01-R17 rule_results)
- `hooks/useStudySignalSummary.ts`, `useTargetOrganSummary.ts`, `useRuleResults.ts` — hooks for generated data
- `hooks/useNoaelSummary.ts`, `useAdverseEffectSummary.ts`, `useDoseResponseMetrics.ts`, `useOrganEvidenceDetail.ts`, `useLesionSeveritySummary.ts` — hooks for Views 2-5
- `hooks/useAdverseEffects.ts`, `useAESummary.ts`, `useFindingContext.ts` — hooks for dynamic analysis
- `hooks/useValidationResults.ts`, `useAffectedRecords.ts`, `useRunValidation.ts` — hooks for validation engine API
- `types/analysis-views.ts` — TypeScript interfaces for all generated view data
- `types/analysis.ts` — TypeScript interfaces for adverse effects
- `contexts/SelectionContext.tsx` — study selection state
- `contexts/FindingSelectionContext.tsx` — adverse effects finding selection
- `contexts/SignalSelectionContext.tsx` — study summary signal + organ selection (mutually exclusive)
- `contexts/ViewSelectionContext.tsx` — shared selection state for Views 2-5 (NOAEL, Target Organs, Dose-Response, Histopathology)
- `components/analysis/StudySummaryView.tsx` — View 1: Study Summary (two tabs: Details + Signals; Signals tab has dual-mode center panel with persistent Decision Bar)
- `components/analysis/SignalsPanel.tsx` — Signals tab two-panel components: `SignalsOrganRail` (organ navigation), `SignalsEvidencePanel` (organ header + Overview/Matrix tabs), `StudyStatementsBar` (study-level statements)
- `components/analysis/charts/OrganGroupedHeatmap.tsx` — organ-grouped collapsible signal matrix with `singleOrganMode` prop for organ-scoped rendering
- `components/analysis/DoseResponseView.tsx` — View 2: Dose-Response (two-panel: organ-grouped endpoint rail + evidence panel with evidence/hypotheses/metrics tabs; time-course toggle in evidence tab)
- `components/analysis/TargetOrgansView.tsx` — View 3: Target Organs (two-panel: organ rail with signal metrics + evidence panel with Evidence/Hypotheses/Metrics tabs, 5 organ-level tools)
- `components/analysis/HistopathologyView.tsx` — View 4: Histopathology (two-panel: specimen rail + evidence panel with overview/severity matrix tabs)
- `components/analysis/NoaelDecisionView.tsx` — View 5: NOAEL & Decision (two-panel: persistent NOAEL banner, organ rail + evidence panel with overview/adversity matrix tabs)
- `hooks/useClinicalObservations.ts` — hook for CL timecourse data from temporal API (used by Dose-Response time-course toggle for CL endpoints)
- `components/analysis/panes/*ContextPanel.tsx` — context panels for each view
- `components/analysis/panes/InsightsList.tsx` — organ-grouped signal synthesis with tiered insights (Critical/Notable/Observed)

---

## Generated Analysis Data

Pre-generated by `python -m generator.generate PointCross`. Output in `backend/generated/PointCross/`:

| File | Items | Grain | Key columns |
|------|-------|-------|-------------|
| `study_signal_summary.json` | 989 | endpoint × dose × sex | signal_score, p_value, effect_size, trend_p, severity, treatment_related, dose_response_pattern |
| `target_organ_summary.json` | 14 | organ system | evidence_score, n_endpoints, n_domains, max_signal_score, target_organ_flag |
| `dose_response_metrics.json` | 1342 | endpoint × dose × sex | mean, sd, n, incidence, p_value, effect_size, trend_p, dose_response_pattern, data_type |
| `organ_evidence_detail.json` | 357 | organ × endpoint × dose × sex | p_value, effect_size, direction, severity, treatment_related |
| `lesion_severity_summary.json` | 728 | finding × dose × sex | n, affected, incidence, avg_severity, severity |
| `adverse_effect_summary.json` | 357 | endpoint × dose × sex | p_value, effect_size, direction, severity, treatment_related, dose_response_pattern |
| `noael_summary.json` | 3 | sex (M/F/Combined) | noael_dose_level/label/value/unit, loael_dose_level/label, n_adverse_at_loael, noael_confidence |
| `rule_results.json` | 975+ | rule instance | rule_id (R01-R17), scope, severity, context_key, organ_system, output_text, evidence_refs |
| `static/target_organ_bar.html` | 1 | static chart | Plotly bar chart of target organs |

---

## Color Schemes (§12.3 — use exactly)

| What | Values |
|------|--------|
| P-value | `#D32F2F` (<0.001), `#F57C00` (<0.01), `#FBC02D` (<0.05), `#388E3C` (≥0.05) |
| Signal score | `#D32F2F` (0.8–1.0), `#F57C00` (0.6–0.8), `#FBC02D` (0.4–0.6), `#81C784` (0.2–0.4), `#388E3C` (0.0–0.2) |
| Severity | `#FFF9C4` (minimal) → `#FFE0B2` → `#FFB74D` → `#FF8A65` → `#E57373` (severe) |
| Dose groups | `#1976D2` (control), `#66BB6A` (low), `#FFA726` (mid), `#EF5350` (high) |
| Sex | `#1565C0` (M), `#C62828` (F) |
| Primary / links | `#2083d5` (Datagrok blue) |
| Background | `#ffffff` (white) |
| Border | `#d7dfe7` (steel-2), subtle `#eceff2` (steel-1) |
| Muted surfaces | `#f2f2f5` (grey-1) |
| Destructive | `#bb0000` (kit failure) |

Implemented in `lib/severity-colors.ts` and `index.css` `:root`.
Full palette reference: `docs/design-system/datagrok-visual-design-guide.md` §0.

---

## Implementation Status — Detailed

### Validation Engine

Real SEND conformance validation engine replaces the original hardcoded rules/records.

**Backend** (`validation/` package):
- **18 rules** across 3 YAML files (domain_level, cross_domain, completeness)
- **15 check types** mapped to handler functions via `CHECK_DISPATCH` dict in `engine.py`
- **SENDIG metadata**: `sendig_31_variables.yaml` (required/expected variables per domain), `controlled_terms.yaml` (14 codelists)
- **Results cached** as JSON in `generated/{study_id}/validation_results.json`
- **Fix scripts**: 4 generic scripts (strip-whitespace, uppercase-ct, fix-domain-value, fix-date-format) with live preview from actual data
- PointCross results: 7 rules fired, 22 affected records, ~1.2s

**Frontend hooks** (replace hardcoded HARDCODED_RULES, RULE_DETAILS, AFFECTED_RECORDS, FIX_SCRIPTS):
- `useValidationResults(studyId)` — fetches cached results (rules + scripts + summary)
- `useAffectedRecords(studyId, ruleId)` — fetches paginated records for a rule
- `useRunValidation(studyId)` — POST mutation to trigger validation run
- `mapApiRecord()` / `extractRuleDetail()` — snake_case → camelCase mapping helpers

**Data flow**: User clicks "RUN VALIDATION" → POST `/validate` → engine loads all XPT, runs rules → caches JSON → frontend fetches via GET. Context panel uses same React Query cache keys (no extra network calls).

### InsightsList Synthesis

The `InsightsList` component (`panes/InsightsList.tsx`) synthesizes raw rule_results into actionable organ-grouped signals:
- **Grouping**: Rules grouped by `organ_system`, tiered as Critical / Notable / Observed based on rule_id combinations
- **Synthesis**: Per-organ endpoint signals collapsed from R10/R04/R01 into compact lines (e.g., "ALT ↑ (d=2.23 F, 1.14 M), AST ↑ — adverse, dose-dependent")
- **R09 counts**: Endpoint/domain counts parsed from R09 output_text, not counted from filtered rules
- **R16 chips**: Correlation findings rendered as wrapped chips, not comma-separated text
- **R14 NOAEL**: Consolidated when same dose across sexes ("NOAEL: Control for both sexes")
- **Tier filter bar**: Clickable pills at top (Critical N / Notable N / Observed N) with opacity toggle
- All parsing is heuristic-based on rule_id semantics and context_key format (`DOMAIN_TESTCODE_SEX`), not study-specific

### Signals Tab — Two-Panel Master-Detail

The Signals tab uses a **two-panel master-detail layout** with a persistent Decision Bar. The left panel is an organ rail for navigation; the right panel is an evidence panel with Overview and Signal Matrix tabs. No mode toggle — both conclusions and evidence are accessible simultaneously via tabs.

**Layout zones:**
- **Decision Bar** (~60px, non-scrolling): NOAEL statement + metrics line. Renders from priority 900+ rules only.
- **Study Statements Bar** (non-scrolling): study-level facts, modifiers, caveats (only items where `organSystem` is falsy).
- **Two-panel area** (`flex flex-1 overflow-hidden max-[1200px]:flex-col`):
  - **Organ rail** (left, 300px): scrollable list of organs sorted by `evidence_score` desc. Search input at top. Auto-selects highest-evidence organ on load.
  - **Evidence panel** (right, flex-1): organ header + [Overview | Signal Matrix] tab bar + tab content.
- **Context panel** (right sidebar): reacts to organ or endpoint selection.

**Engine** (`lib/signals-panel-engine.ts`): derives semantic rules from NOAEL/organ/signal data. Output: `decisionBar` (NOAEL rules), `studyStatements` (study-scope facts), `organBlocks` (with `evidenceScore`), `modifiers`, `caveats`, `metrics`.

**Components** (from `SignalsPanel.tsx`):
- `SignalsOrganRail` — organ navigation rail with search, evidence score bars, domain chips, D-R summary
- `SignalsEvidencePanel` — organ header + tab bar + Overview/Signal Matrix tabs
- `StudyStatementsBar` — study-level statements, modifiers, caveats (filters out organ-specific items)

**Evidence panel tabs:**
- **Overview tab** (`SignalsOverviewTab`): InsightsList (organ-scoped rules), modifiers, review flags, domain breakdown table, top findings by effect size, cross-view links (Target Organs / Dose-Response / Histopathology)
- **Signal Matrix tab** (`SignalsMatrixTab`): inline filters (no organ dropdown) + `OrganGroupedHeatmap` with `singleOrganMode` (suppresses organ header, always expanded)

**OrganGroupedHeatmap** (`charts/OrganGroupedHeatmap.tsx`): supports `singleOrganMode?: boolean` prop. When true: no organ header row, single organ always expanded. Normal mode: organs grouped by evidence_score desc, target organs first, collapsible with chevron.

**Selection:** `SignalSelectionContext` manages `selection` (endpoint-level) and `organSelection` (organ-level) — mutually exclusive (setting one clears the other). Escape clears both. Rail click sets organ selection. Heatmap cell click sets endpoint selection.

### Validation View — Fix Tier System

The validation view is a **triage and dispatch tool**, not a data editor. The system auto-validates on import, applying trivial fixes. What the user sees is what's left:
- Auto-fixed items needing **confirmation** (review + approve)
- Items that could NOT be auto-fixed needing **human attention**

**Three fix tiers:**
- **Tier 1 — Accept as-is**: Value is non-standard but intentional. User provides justification.
- **Tier 2 — Simple correction**: Fix is known (CT mapping). Single suggestion or pick from candidates.
- **Tier 3 — Script fix**: Requires batch logic or derived calculation. Opens script dialog.

**Two independent status tracks:**
- **Fix status**: Not fixed → Auto-fixed / Manually fixed / Accepted as-is / Flagged
- **Review status**: Not reviewed → Reviewed → Approved

Fix status tracks what happened to the data. Review status tracks human sign-off. Independent.

**Finding section (Mode 2 context panel)** uses category-based evidence rendering:
- Each `AffectedRecord` carries a `RecordEvidence` discriminated union (`type` field) and a `diagnosis` string
- 6 evidence templates: `value-correction`, `value-correction-multi`, `code-mapping`, `range-check`, `missing-value`, `metadata`
- The Finding section dispatches by `evidence.type` — no instructional prose, just data + action buttons
- Button logic: auto-fixed → REVERT; has suggestion → APPLY FIX / DISMISS; no suggestion → Fix dropdown / ACCEPT

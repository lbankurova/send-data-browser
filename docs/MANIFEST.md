# Asset Manifest

> **Purpose:** Registry of documentation assets with code dependencies for staleness detection.
> **Scope:** System specs, view specs, and design system. Portability docs are frozen snapshots — not tracked here.
> **Last full audit:** 2026-02-14
> **Last incoming/ validation:** 2026-02-11 (9 specs archived, 2 remain active)

---

## System Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `systems/insights-engine.md` | `frontend/src/lib/signals-panel-engine.ts`, `frontend/src/lib/rule-synthesis.ts`, `frontend/src/lib/finding-aggregation.ts`, `frontend/src/components/analysis/panes/InsightsList.tsx`, `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`, `frontend/src/components/analysis/NoaelDecisionView.tsx`, `backend/generator/scores_and_rules.py`, `backend/generator/view_dataframes.py`, `backend/services/analysis/clinical_catalog.py` | 2026-02-13 | Current — clinical catalog (C01-C15, PEX01-PEX07) fully documented. SignalsPanel.tsx deleted; signal consumers moved to NoaelDecisionView.tsx |
| `systems/validation-engine.md` | `backend/validation/engine.py`, `backend/validation/models.py`, `backend/validation/rules/*.yaml`, `backend/validation/checks/*.py`, `backend/validation/scripts/registry.py`, `backend/routers/validation.py`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAffectedRecords.ts`, `frontend/src/components/analysis/ValidationView.tsx` | 2026-02-08 | Current |
| `systems/data-pipeline.md` | `backend/generator/generate.py`, `backend/generator/domain_stats.py`, `backend/generator/view_dataframes.py`, `backend/generator/scores_and_rules.py`, `backend/generator/organ_map.py`, `backend/services/xpt_processor.py`, `backend/services/analysis/*.py`, `frontend/src/lib/stat-method-transforms.ts`, `frontend/src/hooks/useStatMethods.ts`, `frontend/src/hooks/useFindingsAnalyticsLocal.ts` | 2026-02-23 | Current — Phase-aware subject filtering (DATA-01): recovery pooling for in-life domains, Dunnett's pairwise (STAT-07) + welch raw p-values (STAT-13), JT trend (STAT-04). Frontend transform pipeline documented. |
| `systems/navigation-and-layout.md` | `frontend/src/App.tsx`, `frontend/src/components/panels/BrowsingTree.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/components/panels/Layout.tsx`, `frontend/src/contexts/*.tsx`, `frontend/src/components/analysis/*View.tsx`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/hooks/useAutoFitSections.ts`, `frontend/src/hooks/useCollapseAll.ts`, `frontend/src/components/ui/ViewSection.tsx`, `frontend/src/components/ui/CollapsedStrip.tsx`, `frontend/src/components/ui/PanelResizeHandle.tsx`, `frontend/src/components/analysis/panes/CollapsiblePane.tsx`, `frontend/src/components/analysis/panes/CollapseAllButtons.tsx`, `frontend/src/components/data-table/DataTable.tsx` | 2026-02-13 | Current — CollapsedStrip component added for section summary strips |
| `systems/annotations.md` | `backend/routers/annotations.py`, `frontend/src/hooks/useAnnotations.ts`, `frontend/src/hooks/useSaveAnnotation.ts`, `frontend/src/components/analysis/panes/ValidationRecordForm.tsx` | 2026-02-09 | Current |

## View Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `views/study-summary.md` | `frontend/src/components/analysis/StudySummaryView.tsx`, `frontend/src/components/analysis/StudySummaryViewWrapper.tsx`, `frontend/src/components/analysis/charts/StudyTimeline.tsx`, `frontend/src/components/analysis/panes/StudyDetailsContextPanel.tsx`, `frontend/src/hooks/useInsights.ts`, `frontend/src/hooks/useStudySummaryTab.ts`, `frontend/src/hooks/usePkIntegration.ts`, `frontend/src/lib/species-vehicle-context.ts` | 2026-02-23 | Current — UX improvements: Analysis Settings section removed (duplicated context panel), profile block restructured into Identity + Conclusions Strip with PK exposure/HED/MRSD, domain table "Key findings" → "Notes" with decision-point context, auto-set organ weight method when BW adverse+down, interpretation context section (species/vehicle/route notes), context panel spacing + header simplification, recovery line consolidated, TK simplified in Data Quality, NOAEL cap comment removed from MortalityInfoPane |
| `views/dose-response.md` | `frontend/src/components/analysis/DoseResponseView.tsx`, `frontend/src/components/analysis/DoseResponseViewWrapper.tsx`, `frontend/src/components/analysis/DoseResponseEndpointPicker.tsx`, `frontend/src/components/analysis/panes/DoseResponseContextPanel.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/hooks/useDoseResponseMetrics.ts`, `frontend/src/hooks/useClinicalObservations.ts`, `frontend/src/hooks/useTimecourse.ts`, `frontend/src/hooks/useStatMethods.ts`, `frontend/src/lib/stat-method-transforms.ts`, `frontend/src/components/ui/DoseLabel.tsx`, `frontend/src/components/ui/ViewSection.tsx` | 2026-02-23 | Current — Dynamic effect size label (Hedges' g/Cohen's d/Glass' delta), recovery boundary marker in timecourse, include-recovery toggle, volcano scatter dynamic axis label |
| `views/histopathology.md` | `frontend/src/components/analysis/HistopathologyView.tsx`, `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`, `frontend/src/components/analysis/charts/histopathology-charts.ts`, `frontend/src/hooks/useLesionSeveritySummary.ts`, `frontend/src/hooks/useHistopathSubjects.ts`, `frontend/src/hooks/useFindingDoseTrends.ts`, `frontend/src/hooks/useRuleResults.ts`, `frontend/src/hooks/useAnnotations.ts`, `frontend/src/lib/severity-colors.ts`, `frontend/src/lib/design-tokens.ts`, `frontend/src/lib/finding-aggregation.ts`, `frontend/src/lib/recovery-assessment.ts`, `frontend/src/lib/recovery-classification.ts`, `frontend/src/components/analysis/DoseChartsSelectionZone.tsx`, `backend/services/analysis/clinical_catalog.py`, `frontend/src/components/ui/CollapsedStrip.tsx` | 2026-02-15 | Current — Recovery classification interpretive layer: 6 categories, confidence model, Insights pane RecoveryInsightBlock, Hypotheses tab recovery tool. |
| `views/noael-decision.md` | `frontend/src/components/analysis/NoaelDecisionView.tsx`, `frontend/src/components/analysis/NoaelDecisionViewWrapper.tsx`, `frontend/src/components/analysis/panes/NoaelContextPanel.tsx`, `frontend/src/hooks/useEffectiveNoael.ts`, `frontend/src/hooks/useAdverseEffectSummary.ts`, `frontend/src/hooks/useRuleResults.ts`, `frontend/src/hooks/useOrganRecovery.ts`, `frontend/src/lib/recovery-assessment.ts`, `frontend/src/lib/noael-narrative.ts`, `frontend/src/lib/signals-panel-engine.ts`, `frontend/src/lib/protective-signal.ts`, `frontend/src/contexts/StudySelectionContext.tsx`, `frontend/src/contexts/GlobalFilterContext.tsx` | 2026-02-22 | Current — Major enhancement: 5 tabs (Evidence, Adversity matrix, Signal matrix, Metrics, Rules), StudyStatementsBar + ProtectiveSignalsBar added below NOAEL banner, signal data via useStudySignalSummary + buildSignalsPanelData, absorbs all signal content from former Study Summary Signals tab |
| `views/adverse-effects.md` | `frontend/src/components/analysis/findings/AdverseEffectsView.tsx`, `frontend/src/components/analysis/FindingsTable.tsx`, `frontend/src/components/analysis/FindingsFilterBar.tsx`, `frontend/src/components/analysis/panes/AdverseEffectsContextPanel.tsx`, `frontend/src/components/analysis/panes/SyndromeContextPanel.tsx`, `frontend/src/components/analysis/panes/FindingsContextPanel.tsx`, `frontend/src/components/analysis/panes/RecoveryPane.tsx`, `frontend/src/lib/organ-proportionality.ts`, `frontend/src/hooks/useAdverseEffects.ts`, `frontend/src/hooks/useAESummary.ts`, `backend/routers/analyses.py`, `backend/services/analysis/*.py` | 2026-02-23 | Current — Added Recovery pane (Pane 5) to endpoint-level context panel for histopath + continuous domain recovery assessment |
| `views/validation.md` | `frontend/src/components/analysis/ValidationView.tsx`, `frontend/src/components/analysis/ValidationRuleCatalog.tsx`, `frontend/src/components/analysis/panes/ValidationContextPanel.tsx`, `frontend/src/components/analysis/panes/ValidationIssueForm.tsx`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAffectedRecords.ts`, `frontend/src/hooks/useRunValidation.ts`, `frontend/src/hooks/useAutoFitSections.ts`, `frontend/src/hooks/useCollapseAll.ts`, `frontend/src/components/ui/ViewSection.tsx`, `frontend/src/lib/validation-rule-catalog.ts`, `backend/validation/engine.py`, `backend/routers/validation.py` | 2026-02-16 | Current — Synced: session-persisted state (tab, sorting, column sizing), ViewSection layout (not flex 4:6), double-click sorting, Rule metadata pane, CollapseAllButtons in tab bar, severity colored text (not badges), URL param handling corrected, grid text-[10px] + content-hugging absorber pattern |
| `views/app-landing.md` | `frontend/src/components/panels/AppLandingPage.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/components/portfolio/StudyPortfolioContextPanel.tsx`, `frontend/src/hooks/useStudies.ts`, `frontend/src/hooks/useStudyPortfolio.ts`, `frontend/src/hooks/useProjects.ts`, `frontend/src/hooks/useScenarios.ts`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAnnotations.ts` | 2026-02-16 | Current — Synced: table text-[10px], cell padding px-1.5 py-px, row classes standardized (cursor-pointer border-b transition-colors), status column pr-1.5 |

## Design System

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `design-system/datagrok-visual-design-guide.md` | `frontend/src/lib/severity-colors.ts`, `frontend/src/lib/design-tokens.ts`, `frontend/src/index.css` | 2026-02-09 | Current — §1.1 rewritten (conclusion-tier-only colors), §1.10 expanded (emphasis tiers, color budget, info hierarchy, cognitive modes, visual hierarchy) |
| `design-system/datagrok-app-design-patterns.md` | `design-system/user-personas-and-view-analysis-original.md` | 2026-02-09 | Current — condensed, personas integrated from §1 |
| `design-system/datagrok-llm-development-guide.md` | None (meta-guide) | 2026-02-09 | Current — condensed |
| `design-system/audit-checklist.md` | All design system docs, CLAUDE.md, `incoming/design-rules-consolidated.md` | 2026-02-09 | Current — 75 testable rules + 3 principles across 7 categories (C: 27, T: 9, S: 6, X: 7, K: 6, I: 10, A: 10). All 15 master-rule gaps resolved. |
| `design-system/user-personas-and-view-analysis.md` | — | 2026-02-09 | Redirect → `datagrok-app-design-patterns.md` §1 |

> **Rollback:** All 4 design system docs were condensed 2026-02-09 (2,333→490 lines). Full originals preserved as `*-original.md` in the same directory. To restore: `cp docs/design-system/{name}-original.md docs/design-system/{name}.md` for each file.

## Knowledge Docs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `knowledge/field-contracts.md` | `frontend/src/lib/syndrome-interpretation.ts`, `frontend/src/lib/derive-summaries.ts`, `frontend/src/lib/cross-domain-syndromes.ts`, `frontend/src/lib/organ-proportionality.ts`, `frontend/src/lib/findings-rail-engine.ts`, `frontend/src/lib/recovery-classification.ts`, `frontend/src/lib/finding-nature.ts`, `frontend/src/lib/protective-signal.ts`, `frontend/src/lib/lab-clinical-catalog.ts`, `frontend/src/lib/noael-narrative.ts`, `frontend/src/lib/rule-synthesis.ts`, `frontend/src/lib/finding-aggregation.ts`, `frontend/src/lib/signals-panel-engine.ts`, `frontend/src/lib/stat-method-transforms.ts` | 2026-02-23 | Current — 50 fields (FIELD-01–FIELD-50) across 14 source files. Source refs use function names only (no line numbers). Consumer tracking per entry. |
| `knowledge/api-field-contracts.md` | `backend/generator/generate.py`, `backend/generator/view_dataframes.py`, `backend/generator/scores_and_rules.py`, `backend/generator/domain_stats.py`, `backend/services/analysis/classification.py`, `backend/services/analysis/dose_groups.py`, `backend/services/analysis/mortality.py`, `backend/generator/tumor_summary.py`, `backend/generator/food_consumption_summary.py`, `backend/generator/pk_integration.py` | 2026-02-23 | Current — Backend computed fields across all generator JSON outputs. BFIELD-XX IDs. |
| `knowledge/methods.md` | `frontend/src/lib/*.ts`, `backend/generator/*.py`, `backend/services/analysis/*.py` | 2026-02-14 | Current — analytical methods registry (STAT-*, CLASS-*, METRIC-*, METH-*, DATA-*) |

## Reference (not actively tracked — refresh on demand)

| Asset | Notes |
|-------|-------|
| `reference/claude-md-archive.md` | Archived CLAUDE.md content (API tables, module inventory, color hex values) |
| `reference/demo-stub-guide.md` | Full Demo/Stub migration guide with file paths and line numbers |
| `TODO.md` | Open backlog — all items deferred to production |
| `TODO-archived.md` | 31 resolved backlog items |
| `portability/*.md` | 8 docs for Datagrok migration — frozen snapshots, refresh when porting begins |
| `scaffold/*.md` | Templates — no code dependencies |
| `platform/datagrok-patterns.ts` | DG SDK pattern reference — frozen |
| `portability/dg-knowledge-gaps.md` | DG-01 through DG-15 platform research tasks |
| `views/archive/target-organs.md` | Archived 2026-02-16 — view removed, route redirects to parent. Hooks (`useTargetOrganSummary`, `OrganRailMode`) still used by other views. |

## Incoming Feature Specs

Specs in `incoming/` represent pending or in-progress features. Specs in `incoming/archive/` are fully implemented.

**Last archival:** 2026-02-11

| Asset | Status | Notes |
|-------|--------|-------|
| `incoming/send-study-intelligence-prompt.md` | Phases 1-7 complete (2026-02-11) | Cross-study intelligence with dual-layer data (reported/derived). Landing page table + adaptive context panel ✅. All 19 rules (0-18) ✅. Insights tab ✅. Routing integration ✅. Feature complete. |
| `incoming/IMPLEMENTATION_PLAN_study_intelligence_v2.md` | Phases 1-7 complete (2026-02-11) | Phase 1-6 ✅. Phase 7: Routing integration ✅. StudyDetailsLinkPane with navigation to insights tab, query parameter deep linking. Feature complete. |
| `incoming/cdisc-core-integration.md` | Not started | CDISC CORE engine integration (400+ rules). Requires Python 3.12 venv, separate repo clone. |
| `incoming/dose-response-redesign.md` | Phase 1 partial (2.5/4) | NOAEL ✅, time-course default-expanded ✅, time-course repositioning ❌, sticky header ❌, volcano scatter ❌ |
| `incoming/send-browser-design-mode.md` | v1 implemented 2026-02-11 | Toggle + 4 core scenarios (SCN-001–SCN-004). Checklist overlay (v2) and state simulator (v3) deferred. |
| `incoming/archive/send-study-context-enrichment.md` | ✅ Archived 2026-02-11 | Subject context enrichment layer fully implemented |
| `incoming/archive/send-enrichment-validation-provenance.md` | ✅ Archived 2026-02-11 | SD-001 to SD-007 validation rules + Prov-001 to Prov-007 messages |
| `incoming/archive/treatment-arms.md` | ✅ Archived 2026-02-11 | Dynamic dose groups with ARMCD mapping |
| `incoming/archive/multi-study-discovery.md` | ✅ Archived 2026-02-11 | ALLOWED_STUDIES empty, all studies served |
| `incoming/archive/study-import.md` | ✅ Archived 2026-02-11 | POST /api/import with zip extraction + DELETE |
| `incoming/archive/ndarray-json-serialization.md` | ✅ Archived 2026-02-11 | ndarray serialization fix in unified_findings.py |
| `incoming/archive/tree-chevron-toggle.md` | ✅ Archived 2026-02-11 | Separate chevron/row click handlers in TreeNode |
| `incoming/archive/subject-count-fallback.md` | ✅ Archived 2026-02-11 | DM domain fallback for subject count |
| `incoming/archive/portable-config.md` | ✅ Archived 2026-02-11 | Path(__file__) instead of hardcoded paths |

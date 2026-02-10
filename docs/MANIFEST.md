# Asset Manifest

> **Purpose:** Registry of documentation assets with code dependencies for staleness detection.
> **Scope:** System specs, view specs, and design system. Portability docs are frozen snapshots — not tracked here.
> **Last full audit:** 2026-02-09

---

## System Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `systems/insights-engine.md` | `frontend/src/lib/signals-panel-engine.ts`, `frontend/src/lib/rule-synthesis.ts`, `frontend/src/components/analysis/panes/InsightsList.tsx`, `frontend/src/components/analysis/SignalsPanel.tsx`, `backend/generator/scores_and_rules.py`, `backend/generator/view_dataframes.py` | 2026-02-09 | Current |
| `systems/validation-engine.md` | `backend/validation/engine.py`, `backend/validation/models.py`, `backend/validation/rules/*.yaml`, `backend/validation/checks/*.py`, `backend/validation/scripts/registry.py`, `backend/routers/validation.py`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAffectedRecords.ts`, `frontend/src/components/analysis/ValidationView.tsx` | 2026-02-08 | Current |
| `systems/data-pipeline.md` | `backend/generator/generate.py`, `backend/generator/domain_stats.py`, `backend/generator/view_dataframes.py`, `backend/generator/scores_and_rules.py`, `backend/generator/organ_map.py`, `backend/services/xpt_processor.py`, `backend/services/analysis/*.py` | 2026-02-08 | Current |
| `systems/navigation-and-layout.md` | `frontend/src/App.tsx`, `frontend/src/components/panels/BrowsingTree.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/components/panels/Layout.tsx`, `frontend/src/contexts/*.tsx`, `frontend/src/components/analysis/*View.tsx`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/hooks/useCollapseAll.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx`, `frontend/src/components/analysis/panes/CollapsiblePane.tsx`, `frontend/src/components/analysis/panes/CollapseAllButtons.tsx`, `frontend/src/components/data-table/DataTable.tsx` | 2026-02-09 | Current |
| `systems/annotations.md` | `backend/routers/annotations.py`, `frontend/src/hooks/useAnnotations.ts`, `frontend/src/hooks/useSaveAnnotation.ts`, `frontend/src/components/analysis/panes/ValidationRecordForm.tsx` | 2026-02-09 | Current |

## View Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `views/study-summary.md` | `frontend/src/components/analysis/StudySummaryView.tsx`, `frontend/src/components/analysis/SignalsPanel.tsx`, `frontend/src/components/analysis/StudySummaryFilters.tsx`, `frontend/src/components/analysis/charts/OrganGroupedHeatmap.tsx`, `frontend/src/components/analysis/panes/StudySummaryContextPanel.tsx`, `frontend/src/lib/signals-panel-engine.ts` | 2026-02-09 | Current — Phase 1 audit complete, evidence panel bg + tab naming + top findings hover color |
| `views/dose-response.md` | `frontend/src/components/analysis/DoseResponseView.tsx`, `frontend/src/components/analysis/panes/DoseResponseContextPanel.tsx`, `frontend/src/hooks/useDoseResponseMetrics.ts`, `frontend/src/hooks/useClinicalObservations.ts`, `frontend/src/hooks/useTimecourse.ts`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx`, `frontend/src/lib/analysis-definitions.ts` | 2026-02-09 | Current — Phase 1 audit complete, metrics ev color + canonical tab bar + context panel panes |
| `views/target-organs.md` | `frontend/src/components/analysis/TargetOrgansView.tsx`, `frontend/src/components/analysis/TargetOrgansViewWrapper.tsx`, `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx`, `frontend/src/hooks/useTargetOrganSummary.ts`, `frontend/src/hooks/useOrganEvidenceDetail.ts`, `frontend/src/hooks/useRuleResults.ts` | 2026-02-09 | Current — Phase 1 audit complete, canonical tab bar + pane reorder |
| `views/histopathology.md` | `frontend/src/components/analysis/HistopathologyView.tsx`, `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`, `frontend/src/hooks/useLesionSeveritySummary.ts`, `frontend/src/hooks/useHistopathSubjects.ts`, `frontend/src/hooks/useRuleResults.ts`, `frontend/src/lib/severity-colors.ts`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx` | 2026-02-09 | Current — Phase 1 audit complete, Hypotheses tab added |
| `views/noael-decision.md` | `frontend/src/components/analysis/NoaelDecisionView.tsx`, `frontend/src/components/analysis/panes/NoaelContextPanel.tsx`, `frontend/src/hooks/useAdverseEffectSummary.ts`, `frontend/src/hooks/useRuleResults.ts`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx` | 2026-02-09 | Current — Phase 1 audit complete, spec synced to code |
| `views/adverse-effects.md` | `frontend/src/components/analysis/AdverseEffectsView.tsx`, `frontend/src/components/analysis/FindingsTable.tsx`, `frontend/src/components/analysis/panes/AdverseEffectsContextPanel.tsx`, `frontend/src/hooks/useAdverseEffects.ts`, `frontend/src/hooks/useAESummary.ts`, `backend/routers/analyses.py`, `backend/services/analysis/*.py` | 2026-02-09 | Current |
| `views/validation.md` | `frontend/src/components/analysis/ValidationView.tsx`, `frontend/src/components/analysis/panes/ValidationContextPanel.tsx`, `frontend/src/components/analysis/panes/ValidationIssueForm.tsx`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAffectedRecords.ts`, `frontend/src/hooks/useRunValidation.ts`, `backend/validation/engine.py`, `backend/routers/validation.py` | 2026-02-09 | Current — Phase 1 audit complete, header typography promoted |
| `views/app-landing.md` | `frontend/src/components/panels/AppLandingPage.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAnnotations.ts` | 2026-02-09 | Current — Phase 1 audit complete, spec synced to code |

## Design System

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `design-system/datagrok-visual-design-guide.md` | `frontend/src/lib/severity-colors.ts`, `frontend/src/lib/design-tokens.ts`, `frontend/src/index.css` | 2026-02-09 | Current — §1.1 rewritten (conclusion-tier-only colors), §1.10 expanded (emphasis tiers, color budget, info hierarchy, cognitive modes, visual hierarchy) |
| `design-system/datagrok-app-design-patterns.md` | `design-system/user-personas-and-view-analysis-original.md` | 2026-02-09 | Current — condensed, personas integrated from §1 |
| `design-system/datagrok-llm-development-guide.md` | None (meta-guide) | 2026-02-09 | Current — condensed |
| `design-system/audit-checklist.md` | All design system docs, CLAUDE.md, `incoming/design-rules-consolidated.md` | 2026-02-09 | Current — 75 testable rules + 3 principles across 7 categories (C: 27, T: 9, S: 6, X: 7, K: 6, I: 10, A: 10). All 15 master-rule gaps resolved. |
| `design-system/user-personas-and-view-analysis.md` | — | 2026-02-09 | Redirect → `datagrok-app-design-patterns.md` §1 |

> **Rollback:** All 4 design system docs were condensed 2026-02-09 (2,333→490 lines). Full originals preserved as `*-original.md` in the same directory. To restore: `cp docs/design-system/{name}-original.md docs/design-system/{name}.md` for each file.

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

# Asset Manifest

> **Purpose:** Registry of all documentation assets with code dependencies for staleness detection.
> **How to use:** After any commit, check which code files changed. Look up those files in the "Depends on" column. Any matching asset needs review.
> **Last full audit:** 2026-02-09

---

## System Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `systems/insights-engine.md` | `frontend/src/lib/signals-panel-engine.ts`, `frontend/src/lib/rule-synthesis.ts`, `frontend/src/components/analysis/panes/InsightsList.tsx`, `frontend/src/components/analysis/SignalsPanel.tsx`, `backend/generator/scores_and_rules.py`, `backend/generator/view_dataframes.py` | 2026-02-09 | Current — MetricsLine expanded with loael/driver fields |
| `systems/validation-engine.md` | `backend/validation/engine.py`, `backend/validation/models.py`, `backend/validation/rules/*.yaml`, `backend/validation/checks/*.py`, `backend/validation/scripts/registry.py`, `backend/routers/validation.py`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAffectedRecords.ts`, `frontend/src/components/analysis/ValidationView.tsx` | 2026-02-08 | Current — updated for STUB-01, GAP-06, BUG-02 |
| `systems/data-pipeline.md` | `backend/generator/generate.py`, `backend/generator/domain_stats.py`, `backend/generator/view_dataframes.py`, `backend/generator/scores_and_rules.py`, `backend/generator/organ_map.py`, `backend/services/xpt_processor.py`, `backend/services/analysis/*.py` | 2026-02-08 | Current — updated for BUG-04/SD-09, SD-11, DS domain |
| `systems/navigation-and-layout.md` | `frontend/src/App.tsx`, `frontend/src/components/panels/BrowsingTree.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/components/panels/Layout.tsx`, `frontend/src/contexts/*.tsx`, `frontend/src/components/analysis/*View.tsx`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/hooks/useCollapseAll.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx`, `frontend/src/components/analysis/panes/CollapsiblePane.tsx`, `frontend/src/components/analysis/panes/CollapseAllButtons.tsx`, `frontend/src/components/data-table/DataTable.tsx` | 2026-02-09 | Current — ViewSelectionContext typed as discriminated union (BUG-05 resolved), clinical-observations route |
| `systems/annotations.md` | `backend/routers/annotations.py`, `frontend/src/hooks/useAnnotations.ts`, `frontend/src/hooks/useSaveAnnotation.ts`, `frontend/src/components/analysis/panes/ValidationRecordForm.tsx` | 2026-02-08 | Current — updated for BUG-01, MF-07 |

## View Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `views/study-summary.md` | `frontend/src/components/analysis/StudySummaryView.tsx`, `frontend/src/components/analysis/StudySummaryGrid.tsx`, `frontend/src/components/analysis/SignalsPanel.tsx`, `frontend/src/components/analysis/charts/OrganGroupedHeatmap.tsx`, `frontend/src/components/analysis/panes/StudySummaryContextPanel.tsx`, `frontend/src/lib/signals-panel-engine.ts` | 2026-02-09 | Current — design audit: neutral Decision Bar, Metrics tab documented, OrganPanel fully specified, cross-view links complete |
| `views/dose-response.md` | `frontend/src/components/analysis/DoseResponseView.tsx`, `frontend/src/components/analysis/panes/DoseResponseContextPanel.tsx`, `frontend/src/hooks/useDoseResponseMetrics.ts`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx`, `frontend/src/lib/analysis-definitions.ts` | 2026-02-09 | Current — design audit aligned: neutral badges/arrows, always-on p-value color, font-mono doses, signal-not-meaning principle |
| `views/target-organs.md` | `frontend/src/components/analysis/TargetOrgansView.tsx`, `frontend/src/components/analysis/TargetOrgansViewWrapper.tsx`, `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx`, `frontend/src/hooks/useTargetOrganSummary.ts`, `frontend/src/hooks/useOrganEvidenceDetail.ts`, `frontend/src/hooks/useRuleResults.ts` | 2026-02-09 | Current — design audit: typography-only metrics, ev class on grid, tier dots documented |
| `views/histopathology.md` | `frontend/src/components/analysis/HistopathologyView.tsx`, `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`, `frontend/src/hooks/useLesionSeveritySummary.ts`, `frontend/src/hooks/useHistopathSubjects.ts`, `frontend/src/hooks/useRuleResults.ts`, `frontend/src/lib/severity-colors.ts`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx` | 2026-02-09 | Current — design audit: SubjectHeatmap documented, context panel pane order corrected, adverse badge style |
| `views/noael-decision.md` | `frontend/src/components/analysis/NoaelDecisionView.tsx`, `frontend/src/components/analysis/panes/NoaelContextPanel.tsx`, `frontend/src/hooks/useNoaelSummary.ts`, `frontend/src/hooks/useAdverseEffectSummary.ts`, `frontend/src/hooks/useRuleResults.ts`, `frontend/src/hooks/useResizePanel.ts`, `frontend/src/components/ui/PanelResizeHandle.tsx` | 2026-02-09 | Current — design audit: neutral grid columns, adverse badge consistency, bg-muted/5, context panel panes |
| `views/adverse-effects.md` | `frontend/src/components/analysis/AdverseEffectsView.tsx`, `frontend/src/components/analysis/FindingsTable.tsx`, `frontend/src/components/analysis/panes/AdverseEffectsContextPanel.tsx`, `frontend/src/hooks/useAdverseEffects.ts`, `frontend/src/hooks/useAESummary.ts`, `backend/routers/analyses.py`, `backend/services/analysis/*.py` | 2026-02-09 | Current |
| `views/validation.md` | `frontend/src/components/analysis/ValidationView.tsx`, `frontend/src/components/analysis/panes/ValidationContextPanel.tsx`, `frontend/src/components/analysis/panes/ValidationIssueForm.tsx`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAffectedRecords.ts`, `frontend/src/hooks/useRunValidation.ts`, `backend/validation/engine.py`, `backend/routers/validation.py` | 2026-02-09 | Current — design audit: severity filter pills, tri-color progress bar, clickable count filters documented |
| `views/app-landing.md` | `frontend/src/components/panels/AppLandingPage.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAnnotations.ts` | 2026-02-09 | Current — StudyInspector redesigned: health one-liner, review progress, validation tooltip |

## Portability Assets

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `portability/porting-guide.md` | All frontend components, `platform/datagrok-patterns.ts` | 2026-02-09 | Current — added §4 Grid & Table Portability Analysis (18 components, 12 context panel displays) |
| `portability/data-pipeline-spec.md` | `backend/generator/*.py`, `backend/services/analysis/*.py` | 2026-02-08 | Current (see also `systems/data-pipeline.md`) |
| `portability/prototype-decisions-log.md` | `CLAUDE.md` (Demo/Stub section) | 2026-02-08 | Current |
| `portability/datagrok-implementation-plan.md` | `platform/datagrok-patterns.ts`, all system specs | 2026-02-08 | Current |
| `portability/datagrok-viewer-config.md` | `frontend/src/components/analysis/DoseResponseView.tsx`, `docs/views/dose-response.md` | 2026-02-09 | Current — Dose-Response viewer migration configs (Evidence + Hypotheses) |
| `portability/clinical-case-handoff.md` | All system specs, all view specs, `CLAUDE.md`, all `docs/design-system/*.md`, all `docs/scaffold/*.md` | 2026-02-09 | Current — Self-contained handoff for SDTM Clinical Case sister app |
| `portability/design-decisions.md` | All view code, `docs/portability/porting-guide.md` | 2026-02-09 | Current — DG consultation decision log (managed by Review Agent) |

## Platform Reference

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `platform/datagrok-patterns.ts` | Datagrok SDK (external) | 2026-02-08 | Current |

## Design System & Scaffold

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `design-system/datagrok-app-design-patterns.md` | None (generalized) | 2026-02-08 | Current |
| `design-system/datagrok-visual-design-guide.md` | `frontend/src/lib/severity-colors.ts`, `frontend/src/index.css` | 2026-02-09 | Current — added §1.11 color philosophy, neutral-at-rest, domain dot colors, DS/FW |
| `design-system/datagrok-llm-development-guide.md` | None (meta-guide) | 2026-02-08 | Current |
| `scaffold/prototype-methodology-guide.md` | None (template) | 2026-02-08 | Current |
| `scaffold/spec-template.md` | None (template) | 2026-02-08 | Current |
| `scaffold/view-audit-template.md` | None (template) | 2026-02-08 | Current |
| `scaffold/prototype-project-template/` | None (template) | 2026-02-08 | Current |

---

## Backlog

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `TODO.md` | All system specs | 2026-02-09 | Current — BUG-05 resolved, HC-07 line number corrected |

---

## Staleness Detection Workflow

After a commit that changes code files:

1. Get changed files: `git diff HEAD~1 --name-only`
2. For each changed file, find rows in the tables above where that file appears in "Depends on"
3. Mark those assets as `STALE — <commit hash>`
4. Review and update the stale assets
5. Reset status to `Current` and update "Last validated" date

### Quick reference: high-churn files and their assets

| Code file (frequently changed) | Assets to check |
|-------------------------------|-----------------|
| `frontend/src/components/analysis/StudySummaryView.tsx` | `views/study-summary.md`, `systems/insights-engine.md` |
| `frontend/src/lib/signals-panel-engine.ts` | `systems/insights-engine.md` |
| `backend/generator/scores_and_rules.py` | `systems/insights-engine.md`, `systems/data-pipeline.md` |
| `backend/validation/engine.py` | `systems/validation-engine.md`, `views/validation.md` |
| `backend/validation/rules/*.yaml` | `systems/validation-engine.md` |
| `frontend/src/components/panels/ContextPanel.tsx` | `systems/navigation-and-layout.md`, `views/app-landing.md` |
| `backend/generator/domain_stats.py` | `systems/data-pipeline.md` |
| `backend/routers/annotations.py` | `systems/annotations.md` |
| `frontend/src/App.tsx` | `systems/navigation-and-layout.md` |
| `frontend/src/lib/severity-colors.ts` | `design-system/datagrok-visual-design-guide.md` |
| `frontend/src/hooks/useResizePanel.ts` | `systems/navigation-and-layout.md` |
| `frontend/src/components/ui/PanelResizeHandle.tsx` | `systems/navigation-and-layout.md` |
| `frontend/src/hooks/useCollapseAll.ts` | `systems/navigation-and-layout.md` |
| `frontend/src/components/analysis/panes/CollapsiblePane.tsx` | `systems/navigation-and-layout.md` |
| `frontend/src/components/analysis/panes/CollapseAllButtons.tsx` | `systems/navigation-and-layout.md` |
| `frontend/src/components/data-table/DataTable.tsx` | `systems/navigation-and-layout.md` |
| `frontend/src/components/analysis/StudySummaryGrid.tsx` | `views/study-summary.md` |
| `frontend/src/components/analysis/FindingsTable.tsx` | `views/adverse-effects.md` |

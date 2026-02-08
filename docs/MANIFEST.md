# Asset Manifest

> **Purpose:** Registry of all documentation assets with code dependencies for staleness detection.
> **How to use:** After any commit, check which code files changed. Look up those files in the "Depends on" column. Any matching asset needs review.
> **Last full audit:** 2026-02-08

---

## System Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `systems/insights-engine.md` | `frontend/src/lib/signals-panel-engine.ts`, `frontend/src/lib/rule-synthesis.ts`, `frontend/src/components/analysis/panes/InsightsList.tsx`, `frontend/src/components/analysis/SignalsPanel.tsx`, `backend/generator/scores_and_rules.py`, `backend/generator/view_dataframes.py` | 2026-02-08 | Current — updated for R17, MF-01, MF-02, SD-01–07 |
| `systems/validation-engine.md` | `backend/validation/engine.py`, `backend/validation/models.py`, `backend/validation/rules/*.yaml`, `backend/validation/checks/*.py`, `backend/validation/scripts/registry.py`, `backend/routers/validation.py`, `frontend/src/hooks/useValidationResults.ts`, `frontend/src/hooks/useAffectedRecords.ts`, `frontend/src/components/analysis/ValidationView.tsx` | 2026-02-08 | Current — updated for STUB-01, GAP-06, BUG-02 |
| `systems/data-pipeline.md` | `backend/generator/generate.py`, `backend/generator/domain_stats.py`, `backend/generator/view_dataframes.py`, `backend/generator/scores_and_rules.py`, `backend/generator/organ_map.py`, `backend/services/xpt_processor.py`, `backend/services/analysis/*.py` | 2026-02-08 | Current — updated for BUG-04/SD-09, SD-11, DS domain |
| `systems/navigation-and-layout.md` | `frontend/src/App.tsx`, `frontend/src/components/panels/BrowsingTree.tsx`, `frontend/src/components/panels/ContextPanel.tsx`, `frontend/src/components/panels/Layout.tsx`, `frontend/src/contexts/*.tsx`, `frontend/src/components/analysis/*View.tsx` | 2026-02-08 | Current — updated for GAP-03 |
| `systems/annotations.md` | `backend/routers/annotations.py`, `frontend/src/hooks/useAnnotations.ts`, `frontend/src/hooks/useSaveAnnotation.ts`, `frontend/src/components/analysis/panes/ValidationRecordForm.tsx` | 2026-02-08 | Current — updated for BUG-01, MF-07 |

## View Specs

| Asset | Depends on (code files) | Last validated | Status |
|-------|------------------------|----------------|--------|
| `views/study-summary.md` | `frontend/src/components/analysis/StudySummaryView.tsx`, `frontend/src/components/analysis/SignalsPanel.tsx`, `frontend/src/components/analysis/charts/OrganGroupedHeatmap.tsx`, `frontend/src/components/analysis/panes/StudySummaryContextPanel.tsx` | 2026-02-08 | Current |
| `views/dose-response.md` | `frontend/src/components/analysis/DoseResponseView.tsx`, `frontend/src/components/analysis/panes/DoseResponseContextPanel.tsx`, `frontend/src/hooks/useDoseResponseMetrics.ts` | 2026-02-08 | Current |
| `views/target-organs.md` | `frontend/src/components/analysis/TargetOrgansView.tsx`, `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx`, `frontend/src/hooks/useTargetOrganSummary.ts` | 2026-02-08 | Current |
| `views/histopathology.md` | `frontend/src/components/analysis/HistopathologyView.tsx`, `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx`, `frontend/src/hooks/useLesionSeveritySummary.ts` | 2026-02-08 | Current |
| `views/noael-decision.md` | `frontend/src/components/analysis/NoaelDecisionView.tsx`, `frontend/src/components/analysis/panes/NoaelDecisionContextPanel.tsx`, `frontend/src/hooks/useNoaelSummary.ts` | 2026-02-08 | Current |
| `views/adverse-effects.md` | `frontend/src/components/analysis/AdverseEffectsView.tsx`, `frontend/src/hooks/useAdverseEffects.ts`, `frontend/src/hooks/useAESummary.ts`, `backend/routers/analyses.py`, `backend/services/analysis/*.py` | 2026-02-08 | Current |
| `views/validation.md` | `frontend/src/components/analysis/ValidationView.tsx`, `frontend/src/components/analysis/panes/ValidationContextPanel.tsx`, `backend/validation/engine.py` | 2026-02-08 | Current |
| `views/app-landing.md` | `frontend/src/components/panels/AppLandingPage.tsx`, `frontend/src/components/panels/ContextPanel.tsx` | 2026-02-08 | Current |

## Portability Assets

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `portability/porting-guide.md` | All frontend components, `platform/datagrok-patterns.ts` | 2026-02-08 | Current |
| `portability/data-pipeline-spec.md` | `backend/generator/*.py`, `backend/services/analysis/*.py` | 2026-02-08 | Current (see also `systems/data-pipeline.md`) |
| `portability/prototype-decisions-log.md` | `CLAUDE.md` (Demo/Stub section) | 2026-02-08 | Current |
| `portability/datagrok-implementation-plan.md` | `platform/datagrok-patterns.ts`, all system specs | 2026-02-08 | Current |

## Platform Reference

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `platform/datagrok-patterns.ts` | Datagrok SDK (external) | 2026-02-08 | Current |

## Design System & Scaffold

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `design-system/datagrok-app-design-patterns.md` | None (generalized) | 2026-02-08 | Current |
| `design-system/datagrok-visual-design-guide.md` | `frontend/src/lib/severity-colors.ts`, `frontend/src/index.css` | 2026-02-08 | Current |
| `design-system/datagrok-llm-development-guide.md` | None (meta-guide) | 2026-02-08 | Current |
| `scaffold/prototype-methodology-guide.md` | None (template) | 2026-02-08 | Current |
| `scaffold/spec-template.md` | None (template) | 2026-02-08 | Current |
| `scaffold/view-audit-template.md` | None (template) | 2026-02-08 | Current |
| `scaffold/prototype-project-template/` | None (template) | 2026-02-08 | Current |

---

## Backlog

| Asset | Depends on | Last validated | Status |
|-------|-----------|----------------|--------|
| `TODO.md` | All system specs | 2026-02-08 | Current |

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

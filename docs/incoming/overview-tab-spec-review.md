# Overview Tab Spec — Review Notes

**Spec reviewed:** `docs/incoming/overview-tab-spec.md`
**Date:** 2026-02-11
**Status:** Pending decisions

---

## Design System Violations

### 1. Stage colors in Program NOAELs table (C-01/C-05/C-27 FAIL)

The spec assigns per-stage colors: Submitted `#4A9B68`, Pre-Sub `#7CA8E8`, Ongoing `#E8D47C`, Planned `#C49BE8`. Pipeline stage is **categorical identity** — a fixed classification, not a measured value. Per CLAUDE.md hard rules:

> *"Categorical identity NEVER gets color. Categorical identity includes: dose group, domain, sex, severity level, fix status, review status, workflow state, and any other fixed label or classification."*

Pipeline stage is literally "workflow state." Must use neutral gray (`bg-gray-100 text-gray-600 border-gray-200`).

### 2. Provenance icon source-type tinting (C-01 borderline)

The spec assigns different icon colors by source type: report → `text-blue-400`, derived → `text-slate-400`, cross-study → `text-violet-400`. Source type is categorical identity.

**Counterargument:** Tiny info icons at 50% opacity serving a trust/provenance function, not decorative badges. Color is secondary — tooltip is the primary communicator.

**Options:**
- (a) Unify to single muted color (`text-muted-foreground/50` for all), keep distinction tooltip-only
- (b) Approve as a design system exception (provenance is a special trust-building case)

---

## Data & Architecture Gaps

### 3. No reported/derived dual-layer NOAEL model

The spec assumes `key_findings_reported`, `target_organs_reported`, `target_organs_derived`, and a reported-vs-derived NOAEL distinction. None exist in current data. `useNoaelSummary` returns a single NOAEL per sex with no "source" field.

**Impact:** Sections 1 and 2 (Key Findings narrative, NOAEL/LOAEL card) heavily depend on the dual-layer model. Discrepancy rendering (amber warnings, Rule 0 interpretation) cannot be built without it.

**Decision needed:** Define what "single layer" (current state) rendering looks like as the default path. Treat dual-layer discrepancy model as future enhancement, or build nSDRG parser first?

### 4. Rule 0 doesn't exist

The spec references "Rule 0 output" for discrepancy interpretation text. Current engine has R01-R17 only.

**Options:**
- (a) Define Rule 0 in insights engine spec first
- (b) Hardcode discrepancy interpretation in the component, formalize as a rule later

### 5. No "Driver" field in NOAEL summary

The NOAEL card shows a "DRIVER" row with endpoint name. Current `NoaelSummaryRow` has no `driver_endpoint` field. Generator would need to identify which endpoint at the LOAEL dose is the primary driver.

### 6. Fate of Cross-study insights tab is unspecified

Current view: `[Study details] [Signals] [Cross-study insights]`
Spec shows: `[Overview] [Signals] [Study Details] [Gen Report]`

The Cross-study insights tab disappears without being explicitly addressed. Its content partially moves to Overview Section 4, but the current tab shows priority-filtered insight cards with full detail while Overview Section 4 is a condensed version.

**Decision needed:** Explicitly remove the tab (absorbed into Overview Section 4), or keep it for full-detail access?

### 7. `useCrossStudyInsights` vs existing `useInsights`

The Cross-study insights tab uses `useInsights(studyId)`. The new `useCrossStudyInsights(studyId)` has a different shape. Do both coexist, or does the new hook replace the old one?

---

## Casing Issues (Minor)

### 8. "Study Details" should be "Study details"

CLAUDE.md: sentence case for all UI text by default. Current implementation already uses "Study details" (lowercase d).

### 9. "Study Context" context panel title

Spec uses "Study Context" (Title Case). Pane headers use sentence case → "Study context".

---

## What Passes Cleanly

- Evidence tier dots in Target Organs card — encodes measured value (evidence score), Tier 1 emphasis, always-on at rest. C-01 PASS.
- Confidence dot (green/amber/red) — encodes measured value (confidence score). C-01 PASS.
- Section headers match rail header pattern (T-09 `font-semibold`).
- Domain labels use colored text only (C-25).
- Evidence panel background `bg-muted/5` (S-06).
- Tab bar uses canonical pattern (K-05).
- Organ names use `titleCase()` (X-06).
- Context panel pane order follows A-02 (insights → stats → details → navigation).
- Organ rail simplification (rows 4-5 removed) is well-motivated — detail lives in Evidence panel.
- Provenance pattern overall is strong trust-building UX.

---

## Decision Summary

| # | Issue | Severity | Decision needed |
|---|-------|----------|-----------------|
| 1 | Stage colors = categorical identity | **Must fix** | Confirm: use neutral gray |
| 2 | Provenance icon per-type colors | **Should fix** | Unify to single color, or approve exception? |
| 3 | No dual-layer NOAEL model | **Gap** | Build single-layer default first, or nSDRG parser first? |
| 4 | Rule 0 doesn't exist | **Gap** | Define rule, or hardcode interpretation? |
| 5 | No Driver field in NOAEL data | **Gap** | Generator enhancement — when? |
| 6 | Cross-study insights tab fate | **Clarify** | Remove or keep alongside Overview? |
| 7 | `useCrossStudyInsights` vs `useInsights` | **Clarify** | Coexist or replace? |
| 8 | Casing: "Study Details" → "Study details" | **Minor** | Fix in spec |
| 9 | Casing: "Study Context" → "Study context" | **Minor** | Fix in spec |

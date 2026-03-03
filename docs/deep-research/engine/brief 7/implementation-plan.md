# Plan: Literature-Backed Recovery Duration Lookup Table

## Context

The recovery duration system uses hardcoded, organ-agnostic placeholder values (e.g., all hypertrophy = 6 weeks regardless of organ/species). GAP-23 in TODO.md flags this as unvalidated. Deep research (Brief 7) produced a literature-backed lookup table with 13 organs, 51 findings, 12 continuous endpoints, per-entry severity models, species modifiers, and a new uncertainty model. This plan implements those research results.

The research is **preliminary** — values need further verification. TODO will be updated to note this.

## Approach

Add optional `organ` and `species` parameters to `classifyFindingNature()`. When provided, look up organ-specific recovery data from a new `recovery-duration-table.ts` module. When omitted, fall back to existing keyword logic (backward compatible). Replace ±2 week fixed window with the lookup's explicit low/high range. Replace universal severity multipliers with per-entry severity models (threshold vs. modest scaling). Wire organ/species through call sites that have the context.

## Files

### New file
- `frontend/src/lib/recovery-duration-table.ts` — Lookup table data, query functions, specimen-to-organ mapping, finding-to-entry matching, severity/species modulation

### Modified files
- `frontend/src/lib/finding-nature.ts` — Extend `FindingNatureInfo` with range fields, add `organ?`/`species?` params to `classifyFindingNature()`, update `reversibilityLabel()` to use ranges
- `frontend/src/lib/recovery-assessment.ts` — Update `assessRecoveryAdequacy()` to use range high-end, add `organ?`/`species?` to `deriveRecoveryAssessments()`
- `frontend/src/lib/recovery-classification.ts` — Update `ASSESSMENT_LIMITED_BY_DURATION` qualifier strings to use ranges
- `frontend/src/components/analysis/panes/RecoveryPane.tsx` — Pass organ/species to `classifyFindingNature()` (specimen + useStudyContext available)
- `frontend/src/components/analysis/HistopathologyView.tsx` — Pass specimen to classifyFindingNature where available
- `frontend/src/components/analysis/panes/HistopathologyContextPanel.tsx` — Pass specimen/species
- `frontend/tests/recovery.test.ts` — Update assertions for new values, add organ-specific tests
- `docs/TODO.md` — Update GAP-23 status, add note about preliminary research

### Not modified
- `finding-term-map.ts` — Unchanged; serves as secondary fallback when no organ match
- `protective-signal.ts` — Only reads `.nature` field, unaffected
- Backend — No backend changes

## Steps

### 1. Create `recovery-duration-table.ts`

New module containing:
- **Types**: `RecoveryDurationEntry`, `SeverityModulation`, `SpeciesModifier`, `UncertaintyModel`, `RecoveryDurationLookupResult`
- **Data**: The 13x51 histopath table + 12 continuous entries compiled from the JSON (inline TypeScript constants, not runtime JSON import)
- **`SPECIMEN_TO_ORGAN_KEY`**: Map SEND specimen names to organ keys (LIVER, KIDNEY, KIDNEYS->KIDNEY, GLAND, THYROID->THYROID, GLAND, ADRENAL->ADRENAL, etc.)
- **`lookupRecoveryDuration(findingName, opts?)`**: Primary query — matches finding to organ-specific entry, applies severity + species modulation, returns result with source attribution
- **`findingToEntryKey(findingName, organKey)`**: Substring matching with synonym fallback to find the right entry within an organ
- **`applySeverityModulation(entry, severity)`**: Per-entry model — `"none"` (no scaling), `"modest_scaling"` (multiply, null->unlikely), `"threshold_to_poor_recovery"` (null->switches to unlikely/none)
- **`applySpeciesModifier(weeks, entry, species)`**: Multiply by species factor
- **Generic fallback**: When no organ provided, scan all organs for the best finding match, return the broadest range

### 2. Extend `FindingNatureInfo` interface

Add optional fields (backward compatible):
- `recovery_weeks_range?: { low: number; high: number } | null`
- `lookup_confidence?: "high" | "moderate" | "low"`
- `organ_key?: string`
- `severity_capped?: boolean` (true when severity exceeded threshold and reversibility downgraded)

### 3. Update `classifyFindingNature()`

New signature: `classifyFindingNature(findingName, maxSeverity?, organ?, species?)`

Logic:
1. If organ provided, try `lookupRecoveryDuration(findingName, { organ, species, maxSeverity })`
2. If lookup succeeds, populate `recovery_weeks_range`, `lookup_confidence`, override `typical_recovery_weeks` (midpoint), override `reversibilityQualifier` based on entry + severity model
3. Keep `nature` from existing CT/keyword classification (the lookup table doesn't classify nature)
4. If lookup fails or no organ, fall through to existing CT + keyword logic unchanged

### 4. Update `reversibilityLabel()`

When `recovery_weeks_range` is populated, display it directly (no +/-2 computation). Sub-week values shown as days. Legacy path preserved for callers without organ context.

### 5. Update `assessRecoveryAdequacy()`

Use `recovery_weeks_range.high` (conservative) when available, fall back to `typical_recovery_weeks`.

### 6. Update `recovery-classification.ts`

`ASSESSMENT_LIMITED_BY_DURATION` qualifier uses range `{low}-{high} weeks` when available.

### 7. Wire organ/species through call sites

| Call site | Organ source | Species source |
|-----------|-------------|---------------|
| `RecoveryPane.tsx:190,268` | `specimen` (prop) | `useStudyContext(studyId).species` |
| `HistopathologyView.tsx:1180` | `selection?.specimen` | `studyCtx?.species` (already available) |
| `HistopathologyContextPanel.tsx:927` | `specimen` (prop) | `useStudyContext(studyId).species` |
| `recovery-assessment.ts:385` (deriveRecoveryAssessments) | Add `organ?` param, pass through | Add `species?` param |
| `protective-signal.ts:146` | Not needed (only reads `.nature`) | Not needed |

### 8. Update tests

- Update hardcoded week assertions (e.g., "Hypertrophy" -> 6 becomes range-based)
- Add new test block: organ-specific lookups with expected values from the table
- Add tests for severity threshold model (marked=null -> reversibility downgrade)
- Add tests for species modifiers
- Add tests for specimen-to-organ mapping
- Keep backward-compat tests (no organ -> generic fallback)

### 9. Update TODO.md

- Update GAP-23 status to note implementation with preliminary research
- Add caveat about verification still needed

## Verification

```bash
cd C:/pg/pcc/frontend && npm run build    # TypeScript compiles
cd C:/pg/pcc/frontend && npm test         # All tests pass
```

Manual check: Recovery pane for PointCross study should show organ-specific recovery windows instead of flat 6-week defaults.

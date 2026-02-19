# Knowledge Reference Conventions

Code references knowledge files. Knowledge files never reference code.

```
docs/knowledge/dependencies.md   — external standards, datasets, references (stable IDs)
docs/knowledge/methods.md        — statistical tests, algorithms, scoring formulas (stable IDs)
```

## Tagging Convention

Two comment tags mark where code depends on knowledge entries:

```
// @depends <ID> — <reason>
// @method <ID> — <reason>
```

- `@depends` — code that depends on an external standard, dataset, or reference
- `@method` — code that implements a scientific method
- IDs come from `dependencies.md` and `methods.md` respectively
- Tags go on the line above or inline with the code they describe
- The reason after the em dash explains *why* this code needs this entry

### Examples

```typescript
// @depends SENDIG-3.1 — DSDECOD controlled vocabulary
const DISPOSITION_CATEGORIES = ["TERMINAL SACRIFICE", "FOUND DEAD", ...];

// @method STAT-05 — Cochran-Armitage trend test for incidence data
const trendP = cochranArmitage(incidenceByDose);

// @depends LIU-FAN-2026 — hand-seeded, replace when supplementary drops
const SOC_LR_PLUS: Record<string, number> = { ... };

// @method CLASS-19 — finding nature classification
const nature = classifyFindingNature(findingName, maxSeverity);

function computeSignalScore(  // @method METRIC-01 — 4-component weighted signal score
  pValue: number, trendP: number, effectSize: number, pattern: string
) { ... }
```

### Stubbed Dependencies

When a dependency is hand-seeded or unavailable, say so in the tag:

```typescript
// @depends HCD-CRL — stubbed, no API yet
const HISTORICAL_CONTROLS: Record<string, number> = {};
```

## Queries

```bash
# What code depends on SENDIG 3.1?
grep -r "@depends SENDIG-3.1" backend/ frontend/src/

# What implements Dunnett's test?
grep -r "@method STAT-07" backend/ frontend/src/

# What's stubbed or hand-seeded?
grep -r "@depends.*stubbed\|@depends.*hand-seeded" backend/ frontend/src/

# All code using any statistical test
grep -r "@method STAT-" backend/ frontend/src/

# Everything referencing a specific scoring formula
grep -r "@method METRIC-01" backend/ frontend/src/
```

## Rules

1. **One-way dependency.** Code references knowledge files via stable IDs.
   Knowledge files never reference source files, specs, or filenames.
   Specs are not tagged — they are disposable. Code is the source of
   truth for what depends on what.

2. **Add before tagging.** If code depends on a standard, dataset, or method
   that doesn't have an ID yet, add the entry to `dependencies.md` or
   `methods.md` first, then tag the code.

3. **IDs are stable.** Once assigned, an ID is never reassigned to a different
   entry. Deleted entries leave their ID permanently retired.

4. **Grep is the query engine.** No index file, no database. Comment tags
   are plain text; grep answers every cross-reference question.

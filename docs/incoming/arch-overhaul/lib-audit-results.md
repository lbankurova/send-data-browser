# Frontend Lib Audit — Results

**Date:** 2026-02-17
**Scope:** `frontend/src/lib/` — 35 files, 10,567 lines
**Method:** Playbook at `docs/incoming/arch-overhaul/lib-audit-playbook.md`

---

## Phase 1: Structural Map

### File inventory (sorted by size)

```
 972 lines  cross-domain-syndromes.ts
 898 lines  lab-clinical-catalog.ts
 735 lines  viz-optimizer.ts
 699 lines  pattern-classification.ts
 663 lines  signals-panel-engine.ts
 647 lines  finding-term-map.ts
 567 lines  recovery-assessment.ts
 561 lines  recovery-classification.ts
 543 lines  syndrome-rules.ts
 454 lines  rule-synthesis.ts
 436 lines  mock-historical-controls.ts
 431 lines  report-generator.ts
 428 lines  rule-definitions.ts
 426 lines  findings-rail-engine.ts
 397 lines  derive-summaries.ts
 295 lines  design-tokens.ts
 243 lines  severity-colors.ts
 239 lines  finding-nature.ts
 238 lines  validation-rule-catalog.ts
 180 lines  protective-signal.ts
 168 lines  finding-aggregation.ts
 148 lines  send-categories.ts
 140 lines  organ-analytics.ts
 129 lines  study-accessors.ts
 126 lines  noael-narrative.ts
 123 lines  laterality.ts
 121 lines  parse-study-context.ts
 114 lines  analysis-view-api.ts
  88 lines  temporal-api.ts
  84 lines  organ-test-mapping.ts
  66 lines  api.ts
  63 lines  statistics.ts
  56 lines  analysis-api.ts
  34 lines  annotations-api.ts
  30 lines  analysis-definitions.ts
   6 lines  utils.ts
```

### Import graph (lib → lib only)

```
derive-summaries.ts           → (no lib imports — ROOT)
cross-domain-syndromes.ts     → derive-summaries
findings-rail-engine.ts       → derive-summaries, cross-domain-syndromes
lab-clinical-catalog.ts       → derive-summaries, cross-domain-syndromes
noael-narrative.ts            → severity-colors
protective-signal.ts          → finding-nature
report-generator.ts           → analysis-view-api, api, rule-synthesis, severity-colors
design-tokens.ts              → design-tokens (self-import, harmless)
```

27 files have zero lib → lib imports (fully leaf nodes).

### Type duplication check

None. No duplicate type/interface names across files.

### Function name collision check

None. No duplicate exported function names across files.

---

## Phase 2: Analysis

### Conceptual modules

| Module | Files | Lines | Purpose |
|--------|-------|-------|---------|
| Data derivation core | derive-summaries, findings-rail-engine | 823 | EndpointSummary, signal scores, grouping, sorting |
| Syndrome engines | cross-domain-syndromes, syndrome-rules | 1,515 | Two separate syndrome detection systems |
| Clinical rules | lab-clinical-catalog | 898 | Lab rule evaluation + UI badge helpers |
| Pattern classification | pattern-classification | 699 | Dose-response pattern classifier |
| Signals panel | signals-panel-engine, rule-synthesis, rule-definitions | 1,545 | Context panel signal text generation |
| Finding classification | finding-nature, finding-aggregation, finding-term-map, protective-signal | 1,234 | Nature, aggregation, term normalization, protective |
| Histopath domain | recovery-assessment, recovery-classification, laterality, mock-historical-controls | 1,687 | Recovery, laterality, HCD stubs |
| NOAEL | noael-narrative, study-accessors, organ-analytics | 395 | NOAEL text, TS-domain helpers, organ stats |
| Viz optimizer | viz-optimizer | 735 | Persona-based layout scoring |
| API layer | api, analysis-api, analysis-view-api, annotations-api, temporal-api | 358 | REST client functions |
| UI utilities | severity-colors, design-tokens, utils | 544 | Colors, tokens, cn() |
| Definitions | analysis-definitions, validation-rule-catalog, send-categories, organ-test-mapping, parse-study-context | 621 | Catalogs, mappings, parsers |
| Report | report-generator, statistics | 494 | HTML report, Fisher's test |

### Circular imports

**None.** Clean DAG:

```
derive-summaries (root)
  ├── cross-domain-syndromes
  │     ├── lab-clinical-catalog
  │     └── findings-rail-engine
  └── (no back-edges)
```

### Files too big

| Threshold | Files | Action |
|-----------|-------|--------|
| > 800 lines | cross-domain-syndromes (972), lab-clinical-catalog (898) | Split candidates |
| > 500 lines | viz-optimizer (735), pattern-classification (699), signals-panel-engine (663), finding-term-map (647), recovery-assessment (567), recovery-classification (561), syndrome-rules (543) | Review for cohesion |
| < 50 lines | analysis-definitions (30), annotations-api (34), utils (6) | Fine — small focused files |

**lab-clinical-catalog.ts (898):** Lines 1-667 = rule engine (synonyms, rules, evaluator). Lines 700-898 = UI utilities (badge classes, formatters, `describeThreshold`, `getRelatedRules`). Two distinct concerns in one file.

**cross-domain-syndromes.ts (972):** Contains syndrome definitions (data), detection algorithm, near-miss analysis, term report builder, and display helpers — ~5 concerns in one file.

### Same concept computed twice

1. **Syndrome detection x2:** `detectCrossDomainSyndromes()` in cross-domain-syndromes.ts and `detectSyndromes()` in syndrome-rules.ts. Both take endpoint summaries and find matching syndromes. See investigation below.

2. **`organName()` vs `titleCase()`:** `titleCase()` in severity-colors.ts and `organName()` in signals-panel-engine.ts both transform organ names. `organName` special-cases "general" -> "General (systemic)". Complementary, not duplicated.

---

## Phase 3: Refactoring Recommendations

### A. Extract (too big)

**A1. Split `lab-clinical-catalog.ts` (898 lines -> 3 files):**

```
lab-clinical-catalog.ts
  -> lab-synonyms.ts          — LAB_SYNONYMS, resolveCanonical(), ORGAN_SYSTEM_OVERRIDES (~140 lines)
  -> lab-rules.ts             — LAB_RULES[], evaluateThreshold(), evaluateLabRules() (~520 lines)
  -> lab-clinical-ui.ts       — badge classes, formatters, describeThreshold(), getRelatedRules() (~200 lines)
```

Reason: resolveCanonical is consumed by both syndrome engines and the rule evaluator. UI helpers are a different concern from rule evaluation.

**A2. Split `cross-domain-syndromes.ts` (972 lines -> 2 files):**

```
cross-domain-syndromes.ts
  -> syndrome-definitions.ts  — SYNDROME_DEFS[] data array (~600 lines of definitions)
  -> cross-domain-syndromes.ts — detectCrossDomainSyndromes(), getNearMissInfo(), getTermReport() (~350 lines)
```

Reason: The syndrome definitions are pure data. The detection algorithm is logic.

### B. Consolidate (potential overlap)

**B1. Investigate `syndrome-rules.ts` vs `cross-domain-syndromes.ts`:**

See "Dual Syndrome Engine Investigation" section below.

### C. Move (wrong location)

**C1. `lab-clinical-catalog.ts` UI helpers -> separate file:**

Functions `getClinicalTierBadgeClasses`, `getClinicalTierTextClass`, `getClinicalTierCardBorderClass`, `getClinicalTierCardBgClass`, `getRuleSourceShortLabel`, `getClinicalSeverityLabel` are Tailwind class generators consumed by React components, not by the rule engine.

### D. Structural health (no action needed)

- Import graph: clean DAG, no cycles
- Type ownership: `EndpointSummary` defined once in derive-summaries.ts, imported everywhere
- No `as any` type escapes in lib -> lib boundaries
- Small files (utils.ts at 6 lines) are standard patterns, don't fold
- API layer well-separated: 5 small focused files

---

## Dual Syndrome Engine Investigation

**Files:** `cross-domain-syndromes.ts` (972 lines) vs `syndrome-rules.ts` (543 lines)

### TL;DR

**Not duplicated. Complementary systems at different abstraction levels.**

- `syndrome-rules.ts` = **histopathology-specific** syndrome detection. Works on microscopic findings (morphological terms like "inflammation", "necrosis", "hyperplasia"). Used by the histopathology view's recovery and pattern analysis. Operates on finding text, not endpoint summaries.

- `cross-domain-syndromes.ts` = **cross-domain** syndrome detection for the Findings view. Works on `EndpointSummary[]` spanning LB, BW, MI, MA, OM, CL domains. Matches endpoint labels (e.g., "ALT", "AST", "ALP") to named syndromes (e.g., "Hepatotoxicity", "Nephrotoxicity"). Produces `CrossDomainSyndrome` objects consumed by the scatter plot, rail engine, and context panels.

### Detailed comparison

| Dimension | syndrome-rules.ts | cross-domain-syndromes.ts |
|-----------|-------------------|---------------------------|
| Input type | `Map<string, LesionSeverityRow[]>` (organ -> lesion rows) | `EndpointSummary[]` (aggregated endpoints) |
| Domain scope | MI/MA only (microscopic/macroscopic findings) | All domains (LB, BW, MI, MA, OM, CL, FW) |
| Matching logic | Substring/token-overlap on finding text via `findingMatches()` | Structured term dictionaries: test codes, canonical labels, specimen+finding pairs |
| Rule count | 14 rules (organ-specific morphological patterns) | 9 rules (XS01-XS09, cross-domain toxicity profiles) |
| Output type | `SyndromeMatch[]` with specimen, findings, concordant dose groups | `CrossDomainSyndrome[]` with matched endpoints, confidence, domain coverage |
| Required logic | Simple: at least one required finding present | Compound: `"ALP AND (GGT OR 5NT)"`, `"ANY(NEUT, PLAT, (RBC AND HGB))"` |
| Extra signals | Related organ findings, organ weight correlations, strain-specific adjustments | Near-miss analysis, term reports, domain coverage gaps |
| Detection function | `detectSyndromes(studyData, signalData, studyContext)` | `detectCrossDomainSyndromes(endpoints)` |

### Consumer analysis

**syndrome-rules.ts — 3 consumers (all histopathology):**

| Consumer | Usage |
|----------|-------|
| `HistopathologyView.tsx` | Detects syndromes; feeds signal score boost for specimen summaries |
| `HistopathologyContextPanel.tsx` | Matches specimen findings to syndromes in context pane |
| `SpecimenRailMode.tsx` | Syndrome matching for specimen rail items |

**cross-domain-syndromes.ts — 9 consumers (all findings/adverse effects):**

| Consumer | Usage |
|----------|-------|
| `FindingsView.tsx` | Computes syndromes from endpoint summaries; passes to analytics provider |
| `FindingsRail.tsx` | Groups endpoints by syndrome in "Syndrome" grouping mode |
| `FindingsQuadrantScatter.tsx` | Passes syndromes to scatter for dot metadata |
| `findings-charts.ts` | Indexes syndromes by endpoint for scatter tooltip (syndrome name) |
| `findings-rail-engine.ts` | `buildMultiSyndromeIndex()`, syndrome-aware grouping |
| `OrganContextPanel.tsx` | Related syndromes per organ; near-miss syndrome analysis |
| `SyndromeContextPanel.tsx` | Full term report, definition, regulatory interpretation |
| `FindingsAnalyticsContext.tsx` | Context shape for shared syndrome data |
| `lab-clinical-catalog.ts` | `syndromeMatched` flag in clinical significance rule context |

### Representative rules compared

**syndrome-rules.ts — "Hepatotoxicity (Classic Pattern)":**
- Organ: LIVER
- Required: necrosis
- Supporting: hypertrophy, vacuolation, inflammation, bile duct hyperplasia
- Exclusion: (none)
- Asks: "Do the microscopic findings in this liver specimen show a hepatotoxicity pattern?"

**cross-domain-syndromes.ts — XS01 "Hepatocellular injury":**
- Required: ALT or AST (test codes, LB domain, direction up)
- Supporting: SDH/GLDH (LB), Bilirubin (LB), Liver weight (OM), Liver necrosis/apoptosis (MI), Liver hypertrophy (MI)
- minDomains: 2
- Asks: "Do the lab chemistry + organ weight + microscopic endpoints together indicate hepatocellular injury?"

Same organ system, completely different level of analysis.

### Shared concept, no shared code

Both define "syndrome" as "a pattern of co-occurring findings that suggests a specific toxicity mechanism." But they operate at different levels:

- **syndrome-rules.ts** asks: "Do these microscopic findings in this organ form a recognizable morphological pattern?" (e.g., centrilobular hypertrophy + bile duct hyperplasia + hepatocyte necrosis = hepatotoxicity pattern)

- **cross-domain-syndromes.ts** asks: "Do these endpoints across multiple SEND domains form a recognizable toxicity profile?" (e.g., ALT + AST + ALP elevated in LB + liver weight increased in OM + hepatocyte necrosis in MI = hepatotoxicity syndrome)

### Recommendation

**Keep separate. No consolidation needed.**

The two files serve genuinely different views with different input types and output consumers. They share a conceptual name ("syndrome") but not logic. Merging them would create a 1,500-line file coupling two independent view pipelines.

Zero consumer overlap: no component imports from both files.

If naming confusion is a concern, consider renaming:
- `syndrome-rules.ts` -> `histopath-syndrome-rules.ts` (makes the scope explicit)
- Or leave as-is — the consumers already disambiguate by import path.

---

## Summary Scorecard

| Finding | Severity | Action |
|---------|----------|--------|
| Two syndrome engines (972 + 543 lines) | Healthy | Complementary, not duplicated. No action. |
| lab-clinical-catalog.ts mixes engine + UI (898) | Moderate | Split into 3 files (A1) |
| cross-domain-syndromes.ts too large (972) | Moderate | Extract definitions from logic (A2) |
| No circular imports | Healthy | -- |
| No type duplication | Healthy | -- |
| No function name collisions | Healthy | -- |
| Import DAG is clean | Healthy | -- |

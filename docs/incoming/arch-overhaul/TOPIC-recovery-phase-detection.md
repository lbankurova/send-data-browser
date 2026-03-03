# Topic Hub: Recovery & Phase Detection

**Last updated:** 2026-03-01
**Overall status:** Fully shipped. Treatment-period pooling (7 in-life domains), 2-method last-dosing-day detection with reviewer override, recovery assessment engine (11 verdict types, 7-tier classification), TK/satellite exclusion, early death dual-pass, continuous recovery comparison (control-normalized Hedges' g with drift/n=1/no-control handling). 5 test suites (206 assertions). Validation-view surfacing (GAP-19) deferred.

---

## What Shipped

### Phase Detection Waterfall (`phase_filter.py`, 170 lines)

Two-method cascade for determining the treatment/recovery phase boundary:

| Priority | Method | Source | Confidence |
|----------|--------|--------|------------|
| 1 | TE/TA epoch accumulation | Walk arm epochs by TAETORD, accumulate TEDUR, find "treatment"/"dosing" epoch end | High |
| 2 | TS.DOSDUR | Parse ISO 8601 duration from trial summary parameter | Medium |
| — | Fallback | Return `None` → recovery animals excluded entirely (safe but data loss) | N/A |

Reviewer override via `override_reader.py` (28L) reads `analysis_settings.json` from the annotations store. Override takes absolute priority over auto-detection.

### Treatment-Period Pooling

**Core rule:** During the treatment period (Day 1 through last dosing day), recovery animals receive identical treatment to main study animals. Their in-life data is pooled with main study animals for group statistics. Terminal domains always remain main-study-only because sacrifice timing differs.

| Domain type | Domains | Pooling behavior |
|-------------|---------|-----------------|
| In-life | BW, LB, CL, FW, BG, EG, VS | Pool main + recovery during treatment period |
| Terminal | MI, MA, OM, TF, DS | Main study only — sacrifice timing differs |

Three subject selection functions:
- `get_treatment_subjects()` — main + recovery, excluding satellites (for in-life)
- `get_terminal_subjects()` — main only, excluding recovery + satellites (for terminal)
- `filter_treatment_period_records()` — keeps recovery records only where day ≤ last_dosing_day

Scientific rationale documented in `recovery-animal-data-handling-spec.md` (411L): recovery animals are pharmacologically indistinguishable from main study animals during dosing; separate CRO tables are a formatting convention, not a scientific distinction.

### TK Satellite & Recovery Arm Detection (`dose_groups.py`, 255 lines)

`_parse_tx()` detects recovery and satellite arms from the TX domain:
- **Recovery detection:** RECOVDUR parameter present, or label contains "recovery"
- **TK satellite detection:** TK-prefixed params with positive values, SETCD contains "TK", or label contains "satellite"/"toxicokinetic"
- TK sets excluded from `tx_map` to avoid ARMCD collision (TK and main arms share ARMCD)

### Subject Context (`subject_context.py`, 692 lines)

Builds per-subject metadata including `is_recovery`, `is_satellite`, `is_tk` flags. These flags drive all downstream phase-aware filtering. Recovery arm detection, TK satellite filtering, and treatment arm classification all originate here.

### Recovery Assessment Engine (1,130 lines across 2 files)

**`recovery-assessment.ts` (567L)** — Mechanical verdict computation (histopath):

Guard chain (ordered): `not_examined` → `insufficient_n` → `anomaly` → `low_power` → `not_observed` → `reversed` → ratio computation

11 verdict types: `reversed`, `reversing`, `persistent`, `progressing`, `recovery_too_short`, `anomaly`, `not_examined`, `low_power`, `insufficient_n`, `not_observed`, `no_data`

Key thresholds: `MIN_RECOVERY_N = 3`, `reversedIncidence: 0.2`, `reversedSeverity: 0.3`

Calls `classifyFindingNature()` from `finding-nature.ts` for duration-aware verdicts — adaptive findings expected to reverse faster than degenerative ones.

**`recovery-classification.ts` (563L)** — Interpretive layer on top of verdicts:

7-tier classification: `EXPECTED_REVERSIBILITY`, `INCOMPLETE_RECOVERY`, `ASSESSMENT_LIMITED_BY_DURATION`, `DELAYED_ONSET_POSSIBLE`, `INCIDENTAL_RECOVERY_SIGNAL`, `PATTERN_ANOMALY`, `UNCLASSIFIABLE`

Each classification carries confidence (High/Moderate/Low) and a CSS border class for UI rendering. Specimen-level summary aggregates by priority, takes min confidence across findings.

Consumed by: HistopathologyContextPanel RecoveryAssessment pane, Hypotheses tab recovery assessment table, CompareTab recovery comparison, specimen rail recovery label.

### Continuous Recovery Comparison (`temporal.py` + `RecoveryPane.tsx`)

**Backend** (`routers/temporal.py`, recovery-comparison endpoint): Computes control-normalized Hedges' g for each dose × sex × endpoint at both terminal and recovery timepoints. Returns per-row:

| Field group | Fields |
|-------------|--------|
| Core | `mean`, `sd`, `p_value`, `effect_size`, `dose_level`, `sex` |
| Terminal reference | `terminal_effect`, `terminal_day` |
| Peak context | `peak_effect`, `peak_day` (max |g| across main-arm timepoints) |
| Control stats | `control_mean`, `control_n`, `control_mean_terminal`, `treated_n`, `treated_mean_terminal` |
| Edge case flags | `insufficient_n` (n<2), `no_concurrent_control` (no control at recovery) |

Flagged rows (n<2, no-control) are emitted with null stats instead of being skipped, enabling frontend to render appropriate warnings.

**Frontend** (`RecoveryPane.tsx`, 775L): Verdict-first display with 8 continuous verdict types:

| Verdict | Condition |
|---------|-----------|
| Resolved | `|g_recovery| < 0.5 AND pct ≥ 80%` |
| Reversed | `pct ≥ 80%` (or `|g_recovery| < 0.5 AND pct < 80%`) |
| Reversing | `pct 50–80%` |
| Partial | `pct 20–50%` |
| Persistent | `pct < 20%` |
| Worsening | `pct < 0` (effect grew) |
| Overcorrected | Sign change + `|g_recovery| ≥ 0.5` |
| Not assessed | `|g_terminal| < 0.5` (below threshold) |

Additional features:
- **Control drift warning** (§4.3): Shown when control mean shifted >15% between terminal and recovery
- **n=1 suppression** (§10.5): "insufficient for classification" with raw value fallback
- **No-control warning** (§10.4): Amber warning when no concurrent control at recovery
- **Hover tooltips** (§6.4): Row-level `title` with treated/control means + g at both timepoints
- **Severity shift annotations** (§9.2): Per-dose histopath annotations (Improving/Progressing/Reducing/Mixed)
- **Element tooltips** (§12): `title` attributes on verdict badge, desc, p-value, peak annotation
- **P-values always shown**: No threshold gate — users need them to assess verdict reliability
- **Peak trajectory** (§5.4): When peak > terminal × 1.5, shows full Peak → Terminal → Recovery trajectory
- **Pane position**: Immediately after Dose detail pane, before Evidence

### Recovery Start Day Override (`8e8817b`)

Full implementation of reviewer-editable phase boundary:
- `override_reader.py` (28L) — reads from annotations store
- `analysis_settings.json` schema added to annotations system
- Generator and on-demand API both consume the override
- Frontend UI: checkbox + number input in study details, confirmation dialog, "Reset to auto-detected" link

### Early Death Exclusion (dual-pass)

Recovery animals interact with early death exclusion: moribund/found-dead recovery animals (e.g., PC201708-4113) are excluded from recovery-arm analysis but their treatment-period data is still pooled if within the dosing window. The dual-pass strategy (Pass 1: all subjects for treatment-period stats, Pass 3: main-only for terminal stats) handles this correctly.

### Key Commits

| Commit | Description |
|--------|-------------|
| `4f6138f` | Pool recovery animals with main study during treatment period |
| `4181435` | Recovery phases 3-5, stat method transforms, recovery endpoint fix |
| `05d17d0` | V3 recovery guards — examination-aware verdicts, compare tab grouping |
| `58160bb` | Recovery classification — interpretive layer for Insights pane |
| `e51c67f` | 62 recovery assessment and classification tests |
| `8e8817b` | Recovery start day override — full backend + frontend implementation |
| `40e7742` | Wire recovery pooling toggle through full pipeline (Bug #30) |
| `63ae665` | Detect and exclude TK satellite animals from all statistical analyses |
| `a13998a` | Recovery arm detection + regenerate with correct 4-group structure |
| `2268ccc` | Recovery duration awareness + context-aware historical controls |
| `729206d` | Recovery pane spec gap closure — resolved/overcorrected verdicts, peak gate, p-threshold, concordance, trajectory |
| `e80af5c` | Recovery pane spec gap closure — drift, hover, n=1, no-control, severity shift, tooltips |
| `563ad7b` | Recovery verdict accuracy — resolve/reverse threshold fix, always show p-value |

---

## What's NOT Shipped (spec vs. reality)

### Deferred by design

| ID | Item | Spec | Reason |
|----|------|------|--------|
| GAP-19 | Recovery period validation — surface detection failures as blocking issues in import dialog | `recovery-validation-spec.md` (239L) | Spec ready, not implemented. Requires confirmation dialog extension, issue codes (NO_TA_DOMAIN, NULL_RECOVERY_DAY, etc.), validated config output. |
| HC-01 | Dynamic dose group mapping | `dose_groups.py:10` | `ARMCD_TO_DOSE_LEVEL` hardcoded for PointCross. Blocked on multi-study support. |
| HC-02 | Dynamic recovery arm codes | `dose_groups.py:13` | `RECOVERY_ARMCDS` hardcoded. Should derive from TX domain (TXPARMCD = "RECOVDUR"). |
| TK-1 | TK × recovery interaction | `pk_integration.py` | TK satellite recovery animals may need special handling — not yet researched. |
| TC-01 | Dumbbell toolbar controls (Metric, Show peak, Show CI, Sync axes, Sort by, Export) | `recovery-trajectory-dumbbell-spec.md` §6 | Not implementing (design decision) — context-panel chart does not need configuration UI. |

### Minor gaps

| Gap | Status |
|-----|--------|
| Phase timing only in console output (generator phases) | Documented in TOPIC-data-pipeline.md |
| `compute_last_dosing_day()` silently falls through to `None` when both methods fail — no structured error reporting | Addressed by GAP-19 spec but not yet implemented |
| Recovery pooling toggle state not persisted across sessions | Ephemeral React state; acceptable for single-reviewer workflow |

---

## Roadmap

### Near-term
- HC-02: derive recovery arm codes dynamically from TX domain (TXPARMCD = "RECOVDUR")
- Surface `compute_last_dosing_day()` detection method and confidence in study details UI

### Medium-term
- GAP-19: recovery validation view — structured issue codes, blocking/informational classification, import dialog integration
- TK × recovery interaction research — clarify handling for TK satellite recovery animals in PK integration

### Long-term
- Multi-study recovery handling — different studies may have different phase structures, detection methods, and override requirements
- Recovery period duration comparison across studies (for HCD context)

---

## File Map

### Specifications

| File | Role | Status |
|------|------|--------|
| `docs/incoming/arch-overhaul/recovery-validation-spec.md` | Detection failure surfacing, issue codes, import dialog (239L) | NOT IMPLEMENTED (GAP-19) |
| `docs/incoming/recovery-start-day-override.md` | Reviewer override for last dosing day (206L) | IMPLEMENTED (`8e8817b`) |
| `docs/knowledge/recovery-animal-data-handling-spec.md` | Scientific rationale for treatment-period pooling (411L) | REFERENCE — still the definitive source for *why* pooling is correct |

### Knowledge docs

| File | Entries | Current? |
|------|---------|----------|
| `docs/knowledge/methods-index.md` | CLASS-10 (Recovery Verdict), CLASS-20 (Recovery Classification) | Yes |
| `docs/knowledge/field-contracts-index.md` | FIELD-06 (recovery status), FIELD-28 (recovery endpoints), FIELD-33 (pooled_n), FIELD-37/38 (classification/confidence), FIELD-41 (typical recovery weeks) | Yes |

### Specifications (active)

| File | Lines | Role | Status |
|------|-------|------|--------|
| `docs/incoming/arch-overhaul/recovery-pane-spec.md` | ~490 | Continuous recovery comparison, control normalization, hover tooltips, edge cases | IMPLEMENTED — §15 tracks all items |

### Specifications (archived — logic implemented)

| File | Lines | Role | Status |
|------|-------|------|--------|
| `docs/incoming/arch-overhaul/archive/recovery-reversibility-spec.md` | 726 | Verdict computation, main vs recovery comparison | IMPLEMENTED |
| `docs/incoming/arch-overhaul/archive/recovery-guards-spec.md` | 562 | Guard chain, examination-aware verdicts (v3) | IMPLEMENTED |
| `docs/incoming/arch-overhaul/archive/recovery-classification-spec.md` | 731 | 7-tier classification, confidence model | IMPLEMENTED |
| `docs/incoming/arch-overhaul/archive/recovery-pane-enhancements-spec.md` | 360 | Recovery pane UI, assessment table, comparison view | IMPLEMENTED |
| `docs/incoming/arch-overhaul/recovery-dose-charts-spec.md` | 619 | Recovery bars in dose incidence/severity charts | IMPLEMENTED — *also in TOPIC-histopathology* |

### System specs

| File | Recovery sections | Current? |
|------|-------------------|----------|
| `docs/systems/data-pipeline.md` | `phase_filter.py` module, recovery pooling in in-life domains | Yes |
| `docs/systems/annotations.md` | Override storage via annotations API | Gap — `analysis-settings` schema type not yet documented in this spec (feature works, spec not updated) |
| `docs/systems/insights-engine.md` | — | No recovery sections — recovery-signal integration is not documented here |

### View specs

| File | Recovery sections | Current? |
|------|-------------------|----------|
| `docs/views/histopathology.md` | Recovery pane, dose charts with recovery bars, classification | Yes |
| `docs/views/adverse-effects.md` | Recovery pooling toggle, group N display | Yes |

### Implementation (code)

#### Backend — phase detection & pooling (4 files, 1,145 lines)

| File | Lines | Role |
|------|-------|------|
| `services/analysis/phase_filter.py` | 170 | 2-method detection waterfall, subject selection, record filtering |
| `services/analysis/dose_groups.py` | 255 | TX-domain parsing, recovery arm detection, TK satellite detection |
| `services/analysis/subject_context.py` | 692 | Per-subject metadata: is_recovery, is_satellite, is_tk flags |
| `services/analysis/override_reader.py` | 28 | Read last_dosing_day_override from annotations store |

#### Backend — domain modules consuming phase_filter (7 files, shared)

These files import `phase_filter` functions for treatment-period pooling. They are **owned by TOPIC-data-pipeline** — listed here for cross-reference only.

| File | Import |
|------|--------|
| `generator/domain_stats.py` | `get_treatment_subjects()` — dual-pass enrichment |
| `services/analysis/unified_findings.py` | `get_terminal_subjects()` — on-demand API |
| `services/analysis/findings_bw.py` | `filter_treatment_period_records()` |
| `services/analysis/findings_lb.py` | `filter_treatment_period_records()` |
| `services/analysis/findings_cl.py` | `filter_treatment_period_records()` |
| `generator/generate.py` | `compute_last_dosing_day()` — orchestration |
| `services/analysis/findings_pipeline.py` | `IN_LIFE_DOMAINS` constant |

#### Frontend — recovery logic (3 files, 1,372 lines)

| File | Lines | Role |
|------|-------|------|
| `lib/recovery-assessment.ts` | 567 | Guard chain, 11 verdict types, reversibility scoring — *also in TOPIC-histopathology* |
| `lib/recovery-classification.ts` | 563 | 7-tier classification, confidence model — *also in TOPIC-histopathology* |
| `lib/finding-nature.ts` | 242 | Adaptive/degenerative/proliferative/inflammatory — *shared, also in TOPIC-histopathology* |

#### Frontend — components (1 file, 775 lines)

| File | Lines | Role |
|------|-------|------|
| `panes/RecoveryPane.tsx` | 775 | Recovery detail pane — continuous verdicts, histopath assessment, tooltips, drift/n=1/no-control handling — *also in TOPIC-histopathology* |

#### Frontend — hooks & API (3 files, 274 lines)

| File | Lines | Role |
|------|-------|------|
| `hooks/useOrganRecovery.ts` | 112 | Fetch + derive recovery assessments for organ — *also in TOPIC-histopathology* |
| `hooks/useRecoveryComparison.ts` | 25 | Multi-specimen recovery comparison — *also in TOPIC-histopathology* |
| `lib/temporal-api.ts` | 137 | `RecoveryComparisonResponse` type + fetch function — row type with control stats, edge case flags |

#### Tests (5 suites, 2,791 lines, 206 assertions)

| File | Lines | Assertions | Coverage |
|------|-------|------------|----------|
| `frontend/tests/recovery.test.ts` | 764 | 62 | Verdict guard chain, ratio computation, classification |
| `frontend/tests/recovery-pooling.test.ts` | 563 | 28 | Pooling toggle integration |
| `frontend/tests/per-sex-phases.test.ts` | 462 | 31 | Per-sex phase assignment |
| `frontend/tests/early-death-exclusion.test.ts` | 629 | 41 | Dual-pass terminal stats, recovery animal handling |
| `backend/tests/test_early_death_exclusion.py` | 373 | 44 | Backend dual-pass, recovery exclusion, scheduled stats |

### Totals

| Scope | Files | Lines |
|-------|-------|-------|
| Backend (owned by this hub) | 4 | 1,145 |
| Backend (cross-referenced, owned by data-pipeline) | 7 | — |
| Frontend logic | 3 | 1,372 |
| Frontend components | 1 | 775 |
| Frontend hooks & API | 3 | 274 |
| Tests | 5 | 2,791 |
| **Grand total (owned)** | **16** | **6,357** |

*Frontend recovery-assessment, recovery-classification, finding-nature, RecoveryPane, and hooks are also listed in TOPIC-histopathology (the primary consumer). This hub documents the subsystem's internal architecture and cross-cutting phase detection concerns that span beyond histopathology.*

### Cross-TOPIC Boundaries

| Concern | This hub | TOPIC-histopathology | TOPIC-data-pipeline |
|---------|----------|---------------------|---------------------|
| Phase detection waterfall | **Owns** | — | Cross-refs `phase_filter.py` |
| Treatment-period pooling logic | **Owns** | — | Cross-refs pooling in domain stats |
| Recovery arm / TK detection | **Owns** | — | Cross-refs `dose_groups.py` |
| Recovery assessment engine | Documents architecture | **Owns** UI integration | — |
| Recovery classification | Documents architecture | **Owns** UI integration | — |
| Recovery dose charts | — | **Owns** | — |
| Early death × recovery | Dual-pass interaction | — | **Owns** dual-pass pipeline |

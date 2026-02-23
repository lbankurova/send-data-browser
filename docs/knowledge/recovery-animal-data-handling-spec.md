# Task: Recovery Animal Data Handling — Analysis Segregation Logic

## The question

Should recovery animals' treatment-period data be included in main study group statistics, or analyzed separately?

## The answer

**During the treatment period, recovery animals' in-life data should be pooled with main study animals by default.** During recovery, they're analyzed separately. At terminal sacrifice, they're always separate (different timepoints).

I was wrong to say pooling "inflates N." The user's point is correct: recovery animals are in both numerator and denominator. If Group 4 has 10M main + 5M recovery at 200 mg/kg, and Group 1 has 10M main + 5M recovery at 0 mg/kg, pooling gives 15M vs 15M. The effect size estimate doesn't change — it gets more precise. The animals are biologically identical during the treatment period: same drug, same dose, same route, same duration, same randomization.

## Scientific rationale

Recovery animals are designated at randomization (before dosing begins) in most modern study designs. During the treatment period, they are pharmacologically indistinguishable from main study animals. The only difference is administrative: their fate after dosing ends.

The STP (Perry et al. 2013) and IQ Consortium (Salian-Mehta et al. 2024) position papers discuss recovery study design extensively but focus on recovery-phase evaluation, not treatment-period pooling — because treatment-period pooling is not controversial. CROs present separate tables in study reports as a formatting convention to mirror the arm structure, not because the data is scientifically different during dosing.

The STP best practices for clinical pathology in recovery studies (Tomlinson et al. 2016) state that recovery evaluation requires concurrent controls to separate procedure-related from treatment-related changes. This applies to the recovery period. During the treatment period, main and recovery animals ARE concurrent — they're in the same room, same conditions, same dosing.

## Three analysis phases

### Phase 1: Treatment period (Day 1 through last dosing day)

**Pool main study + recovery animals.**

All animals designated for the same dose level are receiving identical treatment. The data is biologically equivalent regardless of the animal's post-treatment fate.

| Endpoint | Pool? | Rationale |
|---|---|---|
| BW (weekly) | Yes | Same drug exposure, same timepoints |
| BW gain | Yes | Derived from same BW data |
| FW/FC | Yes | Same housing conditions, same drug |
| CL (clinical obs) | Yes | Same drug exposure |
| LB (interim draws) | Yes | Same drug exposure, same collection timepoints |

**Group N during treatment period:** Main + Recovery at each dose level.

Example for the PointCross study during treatment:
```
Group 1 (0 mg/kg):   10M + 5M recovery = 15M,  10F + 5F recovery = 15F
Group 2 (2 mg/kg):   10M + 5M recovery = 15M,  10F + 5F recovery = 15F
Group 3 (20 mg/kg):  10M + 5M recovery = 15M,  10F + 5F recovery = 15F
Group 4 (200 mg/kg): 10M + 5M recovery = 15M,  10F + 5F recovery = 15F
```

(Actual N depends on which arms have recovery groups. Many studies only include recovery at control + high dose, or only high dose.)

**Control group during treatment:** Pool main control + recovery control for treatment-period comparisons. If there are recovery controls (SETCD "0R" / "CR"), their treatment-period data is valid control data.

### Phase 2: Terminal sacrifice (main study)

**Main study animals only.**

Main study animals are sacrificed at end of dosing (e.g., day 92). Recovery animals continue to the recovery sacrifice (e.g., day 120). Terminal data from different timepoints cannot be pooled.

| Endpoint | Pool? | Rationale |
|---|---|---|
| OM (organ weights) | No | Different sacrifice day = different age, different BW |
| MI (histopath) | No | Different sacrifice day = different lesion progression |
| MA (gross path) | No | Different sacrifice day |
| LB (terminal) | No | Different sacrifice day |
| Terminal BW | No | Different age, different drug-free duration |

**Group N at terminal sacrifice:** Main study only.

```
Group 1 terminal:  10M, 10F
Group 4 terminal:  10M, 10F  (minus any excluded early deaths)
```

This is what feeds OPI calculations, syndrome-level histopath incidence, organ weight Δ%, and terminal lab comparisons. Recovery animals are not in these denominators.

### Phase 3: Recovery period (post-dosing through recovery sacrifice)

**Recovery animals only, compared to recovery controls.**

Only recovery animals exist at these timepoints. Main study animals were sacrificed at end of treatment.

| Endpoint | Comparison | Rationale |
|---|---|---|
| BW (recovery period) | Recovery treated vs recovery control | Assess BW reversibility |
| LB (recovery draw) | Recovery treated vs recovery control | Assess clinical path reversibility |
| OM (recovery sacrifice) | Recovery treated vs recovery control | Assess organ weight reversibility |
| MI (recovery sacrifice) | Recovery treated vs recovery control | Assess histopath reversibility |

**Group N at recovery sacrifice:** Recovery animals only.

```
Group 1R recovery:  5M, 5F
Group 4R recovery:  5M, 5F  (minus any excluded early deaths like 4113)
```

**When no recovery controls exist:** Some studies omit recovery controls (the IQ Consortium 2024 paper notes this as an emerging 3Rs practice — control + high dose only, no recovery control). In this case, recovery terminal data can be compared to:
1. Main study terminal controls (different timepoint — less ideal but common)
2. Pre-study baseline values (for clinical path where available)
3. The recovery animals' own end-of-treatment values (within-animal comparison)

The system should note which comparison method is used.

---

## Implementation

### Data model

```typescript
type AnalysisPhase = 'treatment' | 'terminal' | 'recovery';

interface AnimalAnalysisClassification {
  animalId: string;
  sex: string;
  doseLevel: number;
  doseLabel: string;

  /** From TK classification — true = excluded from everything */
  isTk: boolean;

  /** Animal's arm designation */
  armType: 'main' | 'recovery';

  /** Which phases this animal contributes to */
  phases: {
    treatment: boolean;   // true for both main + recovery (unless TK)
    terminal: boolean;    // true for main only
    recovery: boolean;    // true for recovery only
  };

  /** Exclusion state (from mortality settings, reviewer override) */
  excluded: boolean;
  exclusionReason?: string;
}
```

### Phase assignment logic

```typescript
function classifyAnimalPhases(animal: Animal, tkClassification: TkClassification): AnimalAnalysisClassification {
  // TK animals: excluded from everything (already implemented)
  if (tkClassification.isTk(animal.id)) {
    return { ...base, isTk: true, phases: { treatment: false, terminal: false, recovery: false } };
  }

  const isRecovery = detectRecoveryArm(animal);  // SETCD "xR", ARMCD contains "RECOVERY", etc.

  if (isRecovery) {
    return {
      ...base,
      armType: 'recovery',
      phases: {
        treatment: true,    // ← KEY: recovery animals ARE in treatment-period analysis
        terminal: false,     // not sacrificed at main study terminal timepoint
        recovery: true       // analyzed in recovery-phase comparison
      }
    };
  }

  // Main study animal
  return {
    ...base,
    armType: 'main',
    phases: {
      treatment: true,
      terminal: true,
      recovery: false
    }
  };
}
```

### Data filtering per analysis context

Every downstream hook that computes group statistics needs to know which phase it's operating in. The filtering layer provides the correct animal set for each context.

```typescript
interface AnalysisContext {
  phase: AnalysisPhase;
  domain: string;       // BW, LB, MI, OM, etc.
  timepoint?: number;   // study day — determines which phase applies
}

function getAnalysisAnimals(
  allAnimals: AnimalAnalysisClassification[],
  context: AnalysisContext
): AnimalAnalysisClassification[] {
  return allAnimals.filter(a => {
    // TK always excluded
    if (a.isTk) return false;
    // Reviewer exclusions always respected
    if (a.excluded) return false;
    // Phase-appropriate filtering
    return a.phases[context.phase];
  });
}
```

### Determining phase from data context

The system needs to infer which phase applies based on what's being computed:

```typescript
function inferPhase(domain: string, timepoint?: number, sacrificeType?: string): AnalysisPhase {
  // Terminal sacrifice data: always phase-specific
  if (['OM', 'MI', 'MA'].includes(domain)) {
    if (sacrificeType === 'recovery') return 'recovery';
    return 'terminal';
  }

  // In-life data: depends on timepoint relative to dosing period
  if (['BW', 'FW', 'CL'].includes(domain)) {
    if (timepoint === undefined) return 'treatment';  // fallback
    if (timepoint <= lastDosingDay) return 'treatment';
    return 'recovery';  // post-dosing BW/CL only from recovery animals
  }

  // Labs: depends on collection timepoint
  if (domain === 'LB') {
    if (timepoint === undefined) return 'treatment';
    if (timepoint <= lastDosingDay + 1) return 'treatment';  // +1 for terminal draws on sacrifice day
    return 'recovery';
  }

  return 'treatment';  // default
}
```

### Group N display

The UI needs to show the correct N for each context, and it changes by phase.

**Treatment period displays (BW trajectory, FW, CL):**
```
Group 4 (200 mg/kg): N = 15M, 15F  (10 main + 5 recovery)
```

**Terminal displays (OM, MI, LB terminal, OPI):**
```
Group 4 (200 mg/kg): N = 10M, 10F  (main study)
```

**Recovery displays:**
```
Group 4R (200 mg/kg recovery): N = 5M, 5F
```

When an animal is excluded (early death, reviewer override), N decreases in the relevant phase. An early death at day 45 reduces treatment-period N AND terminal N for a main study animal, or treatment-period N AND recovery N for a recovery animal.

### Impact on existing features

**BW group mean trajectory (center pane):**

During the treatment period (days 1–91), the group mean includes both main and recovery animals. At the terminal sacrifice timepoint, only main study terminal BW is shown. During the recovery period, a separate trace shows recovery group BW.

The BW plot should show a visual break or color change at the dosing/recovery boundary to make this clear. The N changes at that boundary.

```
Days 1-91:   Group 4 BW mean (N=15M)  ─────────┐
Day 92:      Group 4 terminal BW (N=10M)         ● [terminal sacrifice marker]
Days 93-120: Group 4R recovery BW (N=5M)          ─ ─ ─ ─ ● [recovery sacrifice]
```

**OPI calculations:**

OPI uses terminal organ weights and terminal BW. These are main-study-only by definition (Phase 2). Recovery organ weights feed a separate recovery OPI comparison. No change from what's already specified — OPI was never supposed to include recovery animals at the terminal timepoint.

**Syndrome detection (interpretSyndrome):**

Treatment-related signal detection uses treatment-period data (pooled N) for in-life endpoints and terminal data (main study N) for sacrifice endpoints. The syndrome engine already works per-endpoint, so each endpoint gets the correct animal set based on its domain and timepoint.

**Histopath incidence:**

Terminal histopath incidence = main study animals only. Recovery histopath is a separate analysis. The tumor linkage spec already handles this correctly (includes both terminal and recovery in the tumor dose-response denominator, but separately tracked).

**Mortality table:**

No change. The mortality table shows all deaths (main + recovery) with their arm designation. NOAEL impact is already handled per the mortality spec — recovery deaths don't cap NOAEL for the main study analysis.

---

## Edge cases

### 1. Unequal recovery arms across dose groups

Many studies only include recovery at control + high dose (not all dose groups). During the treatment period:

```
Group 1 (0 mg/kg):    10M main + 5M recovery = 15M
Group 2 (2 mg/kg):    10M main only = 10M
Group 3 (20 mg/kg):   10M main only = 10M
Group 4 (200 mg/kg):  10M main + 5M recovery = 15M
```

This is fine for group mean calculations (each group has its own N). But for dose-response trend tests, unequal N across groups requires the statistical test to handle it (Dunnett's, Williams', and Jonckheere-Terpstra all handle unequal N). The system should use the pooled N for treatment-period trend tests.

### 2. Recovery animals selected by response at end of dosing

Rare but documented (Pandher 2012): some protocols stratify animals by response at end of dosing and alternate them into recovery vs terminal sacrifice. In this design, recovery animals were NOT randomly designated at the start — they were selected based on treatment-period outcomes.

**This is the one case where treatment-period pooling could be problematic.** If recovery animals were selected to have higher ALT values, their treatment-period ALT trajectory would bias the pooled group mean upward.

**Detection:** If the SEND dataset includes information about stratification (unlikely — this is usually in the protocol, not the SEND data), flag it. Otherwise, the system can't detect this automatically.

**Default:** Pool anyway. The bias from stratification at the END of dosing affects the last timepoint most. Earlier treatment-period data (weeks 1–12 of a 13-week study) was collected before stratification and is unbiased. The practical impact is small and only affects the final treatment-period timepoint.

### 3. Recovery animals with different treatment-period blood draw schedule

Some protocols collect more frequent labs from recovery animals during the treatment period (e.g., weekly instead of at interim and terminal). If recovery animals have lab draws at timepoints that main study animals don't, those extra timepoints should NOT be pooled — they're recovery-specific data during the treatment period.

**Rule:** Only pool at shared timepoints. If both main and recovery animals have a Week 4 lab draw, pool them. If only recovery animals have a Week 8 draw, that's recovery-arm-only data.

### 4. Studies with recovery at all dose groups vs. control + high only

When recovery arms exist at all dose groups, treatment-period N increases equally across all groups. When recovery exists only at control + high dose, only those two groups get a larger N.

The system handles this automatically — it counts how many animals are classified as `phases.treatment = true` per dose group. It doesn't assume symmetric recovery arms.

### 5. Early death of a recovery animal during treatment period

If a recovery animal dies during the treatment period (before reaching the recovery phase), it's excluded from both treatment-period statistics (from death day onward) and recovery statistics. Its pre-death treatment-period data is still included up to the last observation day, same as any early-death animal.

The mortality exclusion logic (from the mortality spec) applies to recovery animals during the treatment period just as it does to main study animals. TR early death of a recovery animal = excluded by default. Accidental death = included through death day by default.

### 6. Interim sacrifice animals

Some studies include interim sacrifice groups (e.g., sacrificed at Week 4 of a 13-week study). These are separate from both main study terminal and recovery. Their treatment-period data IS pooled up to their sacrifice day, then they drop out.

```
Interim (day 29):     Treatment-period data days 1-29 only
Main (day 92):        Treatment-period data days 1-91, terminal data day 92
Recovery (day 120):   Treatment-period data days 1-91, recovery data days 92-120
```

---

## UI communication

### Study details banner

```
Subjects: 150 (75M, 75F)
├─ Main study:  80 (40M, 40F) — terminal analysis
├─ Recovery:    40 (20M, 20F) — pooled with main during treatment, separate at sacrifice
└─ TK satellite: 30 (15M, 15F) — excluded from all analyses
```

### Group N in analysis displays

When showing group means, always indicate the phase-appropriate N:

**BW trajectory plot tooltip:**
```
Week 8 (Day 56) — Treatment period
Group 4 (200 mg/kg): Mean 285.3g ± 12.1 (N=15M, incl. 5 recovery)
```

**Terminal organ weight table:**
```
Group 4 (200 mg/kg): Liver 12.3g ± 0.8 (N=10M)
```

**Recovery organ weight table:**
```
Group 4R (200 mg/kg recovery): Liver 11.1g ± 0.7 (N=5M)
```

The "(incl. N recovery)" note appears during treatment-period displays only when recovery animals are pooled. This is transparency, not a warning — the reviewer should know the N composition.

### Analysis settings

In the study-level analysis settings (context panel), add a toggle:

```
RECOVERY DATA HANDLING
  Treatment period: [Pool with main study ▾]
    Options:
    • Pool with main study (default) — recovery animals included in treatment-period group means
    • Analyze separately — CRO-style: main and recovery tabulated independently throughout
```

Default: Pool. The "analyze separately" option exists for reviewers who want to match CRO report tables exactly or who have a specific reason to keep the groups distinct.

When set to "analyze separately," the system reverts to treating recovery animals as their own analysis track throughout — separate treatment-period tables, separate terminal tables, separate recovery tables. This is the CRO convention and may be preferred when comparing to the official study report.

---

## What NOT to do

- **Do not exclude recovery animals from treatment-period analysis by default.** Their treatment-period data is valid, biologically identical to main study data, and excluding it discards useful information.
- **Do not pool terminal sacrifice data across main and recovery.** Different sacrifice timepoints = different biological state. This is the one hard boundary.
- **Do not assume all dose groups have recovery arms.** Many studies have recovery at control + high dose only, or even high dose only with no recovery control.
- **Do not show different N for the same timepoint in different views.** If BW at Week 8 shows N=15 in the trajectory plot, the same data in the dose-response table should also show N=15. Consistency across views is critical.
- **Do not re-implement TK filtering.** TK segregation is already in place. Recovery handling is additive to TK — first filter TK out, then apply recovery phase logic to the remaining animals.

---

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Treatment-period pooling (backend) | **Complete** | `phase_filter.py`, all in-life modules updated. Method: DATA-01 |
| Phase 2: Group N display (frontend) | **Complete** | `pooled_n_*` fields in DoseGroup, context panel breakdown |
| Phase 3: Pool/separate toggle | Deferred | Pooling-by-default is scientifically correct |
| Phase 4: BW recovery trace visualization | Deferred | Enhancement, not a correctness fix |
| Phase 5: Recovery insights in context panel | Deferred | Scope separately after Phases 1-2 |
| Phase 6: Documentation | **Complete** | DATA-01 in methods.md, FIELD-33 in field-contracts.md |

**Key implementation details:**
- `compute_last_dosing_day()` derives treatment end from TE/TA epochs (primary) or TS.DOSDUR (fallback).
- PointCross: 40 recovery animals (10/group, 5M+5F), last_dosing_day=108. Pooled N: 30/group (from 20).
- In-life domains BW/LB/CL/BG/EG/VS/FW use `get_treatment_subjects()` + `filter_treatment_period_records()`.
- Terminal domains MI/MA/OM/TF/DS unchanged (main-study-only).

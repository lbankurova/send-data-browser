# Recovery Duration Lookup Table v2

## What changed

This revision replaces the prior placeholder-style table with an **evidence-first synthesis**. The key difference is that the new JSON explicitly labels each row by:

- **confidence** (`high` / `moderate` / `low`)
- **evidence_level** (`direct`, `mixed`, `indirect`)
- **conditions** that change the prognosis
- **species modifiers** grounded in tissue biology rather than one flat multiplier
- **severity logic** that uses threshold rules where appropriate

This matters because the literature almost never provides a universal statement like *"kidney tubular basophilia recovers in exactly X weeks in all species."* Much more often, the literature provides one of four things:

1. **Direct recovery study data** at one or more timepoints
2. **Consensus pathology statements** that a lesion is readily reversible / may persist / is irreversible
3. **Mechanistic tissue-biology constraints** (e.g., spermatogenic cycle length, RBC lifespan)
4. **Study-design conventions** (e.g., 14-day or 28-day recovery groups), which are **not** the same as lesion biology

The new package keeps those distinctions visible instead of hiding them.

## Bottom-line recommendations

1. **Do not keep the organ-agnostic placeholder table.**
2. **Do not keep the universal severity multipliers.**
3. **Do not keep the fixed ±2 week uncertainty band.**
4. **Derive continuous-endpoint recovery expectations from the underlying tissue/turnover biology.**
5. **Treat low-confidence rows as "use cautiously" rather than as hard regulatory facts.**

## Most important conclusions

### 1) The current hardcoded values are not defensible as universal defaults

They are sometimes in the right neighborhood by coincidence, but they fail in both directions:

- too long for rapidly reversible adaptive lesions (e.g., glycogen depletion, simple vacuolation, stress thymic atrophy)
- too short for persistent storage/pigment/granulomatous/fibrotic lesions
- dangerously misleading for lesions whose reversibility is **organ-dependent** (e.g., necrosis in liver/kidney vs. heart)

### 2) Severity does matter — but not as a universal multiplier

The literature supports the idea that **more extensive injury can reduce reversibility**, but it does **not** support a single numeric mapping like:

- mid severity = 1.5×
- high severity = 2.0× or 2.5×

Instead, the best-supported model is:

- **adaptive lesions** → modest scaling at most
- **degenerative/necrotic lesions** → **threshold model**
- **certain organs** (heart, established fibrosis) → effectively **non-reversible regardless of grade**
- **testis** → severity must be interpreted together with **which cell compartment was hit**

### 3) A fixed ±2 week window should be retired

It overstates uncertainty for short lesions and understates uncertainty for long lesions.

Recommended replacement:

- **asymmetric percentage band**
- default around **-25% / +50%**
- confidence-based widening for low-confidence rows
- use explicit literature low/high ranges where available

## Validation of prior hardcoded values

| finding_type              |   current_weeks | literature_supported_weeks                                                | current_correct   | adjustment_needed                                                                            | sources         |
|:--------------------------|----------------:|:--------------------------------------------------------------------------|:------------------|:---------------------------------------------------------------------------------------------|:----------------|
| Hyperplasia               |               6 | 2-6 depending organ                                                       | No                | Replace with organ-specific values; thyroid/liver shorter, stomach can be similar            | E06,E19         |
| Hypertrophy               |               6 | 1-4 liver/adrenal/thyroid; 2-6 Leydig                                     | No                | Current value systematically high for many adaptive lesions                                  | E01,E06,E11,E17 |
| Vacuolation               |               6 | 0.5-2 renal osmotic; 1-4 hepatic simple vacuolation; 2-8 phospholipidosis | No                | Split by mechanism rather than one bucket                                                    | E03,E04,E09     |
| Basophilia                |               4 | 1-4 kidney reparative basophilia                                          | Partly            | Reasonable for renal regeneration only; should not be organ-agnostic                         | E07,E10         |
| Glycogen depletion        |               6 | 0.5-2                                                                     | No                | Current value too long                                                                       | E03             |
| Pigmentation              |               6 | 4-12+ or persistent depending pigment                                     | No                | Too short for residual pigment/hemosiderin                                                   | E10             |
| Inflammation              |               8 | 2-6 uncomplicated; 4-26 granulomatous/chronic                             | No                | Need acute vs chronic/granulomatous split                                                    | E04,E21         |
| Granuloma                 |               8 | 4-26+                                                                     | No                | Underestimates foreign-body/adjuvant persistence                                             | E21             |
| Necrosis                  |               8 | 1-8 liver/kidney if reparable; none in heart                              | No                | Must be organ-specific and threshold-based                                                   | E02,E08,E20     |
| Degeneration              |              10 | 1-4 mild acute tubular/hepatic; 4-12 if severe                            | No                | Too long as default, but can be too short when chronic                                       | E08,E26         |
| Atrophy                   |              10 | 1-3 thymus; 6-16+ testis; 2-6 lymphoid                                    | No                | Meaningless average                                                                          | E11,E12,E16     |
| Mineralization            |              13 | persistent / none in many contexts                                        | No                | Too optimistic                                                                               | E26             |
| Hemorrhage                |               4 | 0.5-2 usually                                                             | Usually no        | Often shorter than current value                                                             | E21             |
| Congestion                |               2 | 0.5-2                                                                     | Mostly            | Current ballpark acceptable but still needs organ/context awareness                          | E26             |
| Decreased spermatogenesis |              16 | 6-10 rat; 8-12 dog if stem cells survive; none if diffuse atrophy         | Partly            | Too long for reversible endocrine/germ-cell suppression, too short for nonrecovering atrophy | E16,E17,E18     |
| Fibrosis                  |             nan | irreversible / none                                                       | Yes               | Keep as non-reversible                                                                       | E20,E21         |

## Recommended severity policy

**Recommendation:** replace the current universal multiplier approach with a **lesion-specific threshold model**.

Key reasons:

- severity grades describe **extent/complexity**, not validated time-to-recovery
- marked injury often changes the biology from recoverable → persistent
- the relationship is strongly organ-dependent

**Operational rule:**

- `adaptive` lesions: allow modest scaling only (up to ~1.5×)
- `degenerative/necrotic` lesions: if `marked` or `severe`, often switch to `unlikely`/`none`
- `heart necrosis` and `fibrosis`: non-reversible
- `testis`: use spermatogenic-cycle logic + stem-cell/Sertoli-cell preservation
- `kidney basophilia`: treat as reparative regeneration, not "longer degeneration"

## Recommended uncertainty policy

```json
{
  "method": "asymmetric_percentage_based_with_floor",
  "default_low_pct": 25,
  "default_high_pct": 50,
  "min_low_weeks": 0.5,
  "min_high_weeks": 0.5,
  "confidence_overrides": {
    "high": {
      "low_pct": 25,
      "high_pct": 35
    },
    "moderate": {
      "low_pct": 25,
      "high_pct": 50
    },
    "low": {
      "low_pct": 25,
      "high_pct": 75
    }
  },
  "rationale": [
    "A fixed \u00b12 week band distorts short lesions and understates long lesions.",
    "Recovery is biologically asymmetric: slower-than-expected recovery is more common than faster-than-expected recovery.",
    "Confidence-dependent bands reflect whether a value is supported by direct recovery data versus extrapolation from tissue biology."
  ],
  "implementation_note": "For entries with an explicit low/high range in the table, display that range directly. Use the uncertainty model only when converting a single-point estimate or when widening the range for low-confidence extrapolated rows."
}
```

## Evidence hierarchy used in this redo

### Highest weight
- direct recovery studies with post-dose timepoints
- INHAND / NTP atlas / expert workshop statements on reversibility class

### Medium weight
- organ/tissue turnover biology that constrains plausible recovery time
- repeated-dose study reports with explicit recovery intervals

### Lower weight
- mechanistic extrapolation where direct lesion-specific recovery data were not published

## Practical implementation guidance for the engine

1. Match the lesion to the **most specific organ + morphology row** available.
2. Apply the **organ-process species modifier**, not a single global species modifier.
3. Apply **severity threshold logic**:
   - if lesion remains in same recoverable class, scale modestly
   - if marked/severe implies fibrosis, scaffold loss, or terminal-cell loss, switch reversibility class
4. If row confidence is `low`, widen uncertainty and avoid strong persistence language.
5. For continuous endpoints, use the dedicated continuous-endpoint table **or** borrow from the underlying structural lesion when a pathology correlate exists.

## Deliverables in this package

- `recovery_duration_lookup_v2.json` — primary machine-readable lookup
- `recovery_duration_lookup_summary_v2.md` — this report
- `recovery_duration_evidence_log_v2.json` — source-by-source audit trail

## Caveat

This is materially better than the placeholder table, but it is still not a substitute for **compound-specific** or **study-specific** pathology judgment. Some rows — especially adrenal medullary hyperplasia, chronic interstitial nephritis, and certain inflammatory patterns — remain evidence-thin in the public literature and are therefore flagged with lower confidence in the JSON.

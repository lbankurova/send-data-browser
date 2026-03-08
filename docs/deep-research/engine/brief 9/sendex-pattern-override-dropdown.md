# Pattern override dropdown — endpoint verdict context panel

## Rationale

No authoritative equivalence band threshold standard exists for preclinical dose-response trend classification (confirmed across PHUSE SSWG, OECD TGs 407/408/412/413/453, FDA, EMA, PMDA, ICH). The algorithm's pattern assignment is always a proposal, never a ruling. The dropdown makes this visible and overridable, putting the toxicologist in the loop.

## Pattern enum (direction-independent)

Direction is a separate row. The pattern dropdown uses a closed set:

- **No change**
- **Monotonic**
- **Threshold**
- **Non-monotonic**
- **U-shaped** (captures downturn-at-high-dose / inverted-U)

## Provenance marking and override propagation

The algorithmically assigned pattern is visually distinguishable from a user override. Default assignment renders as plain text. Once the user selects a different value, a subtle override indicator appears. Tooltip on the indicator shows the original algorithmic assignment so the toxicologist can always see what the system proposed and what they changed.

The pattern feeds NOAEL determination, severity, and rail icons. A pattern override is a high-consequence action. On change, show a brief inline preview of what will update downstream — e.g., "Changing pattern to Monotonic will update NOAEL from 20 mg/kg to 2 mg/kg." The goal is informed override. Not a blocking modal.

For implementation examples, see mortality info pane on study detail view.

## Granularity: per-sex

The override lives at the per-sex level (F and M separately in the sex comparison section) of the endpoint context panel > verdict section. The combined endpoint-level pattern, if displayed, derives from the per-sex patterns — not the other way around. A sex where pattern = No change and a sex where pattern = Monotonic should not average into Threshold.

## Rail icon behavior

Rail icons reflect the current pattern value, whether algorithmic or overridden. If the user changes the pattern, the rail icon updates. Severity override, if needed, is a separate control. Do not create a dependency web where changing one value has non-obvious effects on three others without the user seeing the chain.

## Lookup table integration

Use the tiered CV%-based multiplier system where available to inform the algorithmic default:

- **Tier 1** (CV < 10%): ±1.0 SD — body weight, brain, heart, RBC parameters, total protein, albumin
- **Tier 2** (CV 10–20%): ±1.0 SD, flag equivocal at 0.75–1.0 SD — liver, kidney, ALT, AST, glucose, platelets
- **Tier 3** (CV > 20%): ±1.5 SD — spleen, thymus, adrenals (mouse), WBC, triglycerides, bilirubin, reproductive organs

Where data is sparse (NHP, dog clinical chemistry), surface lower confidence on the algorithmic assignment, which naturally invites user judgment via the dropdown.

For moe=re context, see "C:\pg\pcc\docs\deep-research\engine\brief 9\deep-research-dr-pattern.md"

## Test case

Male body weight, means: 402.67 → 408.13 → 398.87 → 324.07 (control through high dose). Algorithm flags Non-monotonic because of the slight rise from control to low dose. A toxicologist would reasonably call this Threshold — the rise from 402 to 408 is noise on a 400 g rat, and the real signal is the sharp drop at 200 mg/kg. The dropdown lets them make that call. This is the design working as intended.

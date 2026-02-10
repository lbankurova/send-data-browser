# Design Rules Extraction — External Sources

> **Purpose:** Extract all design rules from external pcc-design files, document source, consolidate, flag conflicts.
> **Process:** One file at a time → extract → append → next file → consolidate.
> **Created:** 2026-02-09

---

## Source 1: `pcc-design/ui-spec-colors--send-app-only.md`

| # | Rule | Section | Notes |
|---|------|---------|-------|
| E1 | At rest, only conclusions may use saturated color | §0 Global | Hard rule |
| E2 | Numbers must be readable without color | §0 Global | Hard rule |
| E3 | Color must never be the only carrier of meaning | §0 Global | Hard rule |
| E4 | One column = one saturated color family max at rest | §0 Global | Hard rule |
| E5 | If unsure, use neutral gray | §0 Global | Default behavior |
| E6 | Density is acceptable; ambiguity is not | §0 Global | Principle |
| E7 | Every UI element belongs to exactly one info hierarchy category: Decision, Primary Finding, Qualifier, Caveat, Evidence, Context | §1 Hierarchy | Classification system |
| E8 | Mixing categories in one visual unit is forbidden | §1 Hierarchy | Hard rule |
| E9 | Each view must declare one cognitive mode: Exploration, Analysis, Conclusion, or Hybrid | §2 Modes | Architectural |
| E10 | Signals view is Hybrid (Conclusion-First) | §2 Modes | View-specific |
| E11 | Neutral base palette: primary text #1F2937, secondary #4B5563, muted #6B7280, borders #E5E7EB, hover bg #F3F4F6, selection bg #E0F2FE | §3.1 Colors | Fixed palette |
| E12 | Status/decision color (#DC2626) used ONLY for final conclusions (TARGET ORGAN, Critical tier) | §3.2 Colors | Rare use only |
| E13 | No numbers in decision red (#DC2626) | §3.2 Colors | Hard rule |
| E14 | No repetition of decision red per row | §3.2 Colors | Hard rule |
| E15 | Decision red never used in tables by default | §3.2 Colors | Hard rule |
| E16 | Qualifier (#D97706) and Warning (#F59E0B): outline or text only, never inline with primary findings | §3.3 Colors | Presentation constraint |
| E17 | Evidence numbers neutral at rest; color only on focus, hover, or sorting | §3.4 Colors | Interaction-only |
| E18 | Active evidence color: #DC2626 on hover/selection | §3.4 Colors | Interaction pattern |
| E19 | Typography preferred over color for evidence | §3.4 Colors | Principle |
| E20 | Domain identity: dot or outline only, no filled pills, max color width ≤ 6px | §3.5 Colors | Hard rule |
| E21 | Semantic color (attention-driving): encodes status, importance, urgency — strictly limited | §4.1 Semantic | Definition |
| E22 | Syntactic color (parsing-only): allowed ONLY in Evidence/Context zones for readability | §4.2 Syntactic | Permitted use |
| E23 | Syntactic color must not imply severity or priority, must not compete with conclusions, must not use #DC2626 | §4.2 Syntactic | Constraints |
| E24 | Organ list at rest: name #1F2937, TARGET badge #DC2626, strength bar neutral gray #D1D5DB, evidence score neutral, domains dot/outline only | §5.1 Components | Component spec |
| E25 | Organ list on interaction: evidence score may turn #DC2626, no other color changes | §5.1 Components | Interaction spec |
| E26 | Evidence tables at rest: all numbers neutral, direction arrows gray #9CA3AF, "adverse" = outline badge only | §5.2 Components | Component spec |
| E27 | Evidence tables on interaction: selected row effect size + p-value may turn #DC2626; sorted column only that column may show color | §5.2 Components | Interaction spec |
| E28 | Interpretation panels: "Critical" badge #DC2626, narrative text neutral, use grouping/indentation not color repetition | §5.3 Components | Component spec |
| E29 | Histopath summaries: Evidence/Context category, neutral text block, optional low-salience syntactic color for parsing | §6 Histopath | Component spec |
| E30 | Histopath block: no #DC2626 anywhere, no background fills except neutral card bg, no reuse of status colors | §6.2 Histopath | Hard constraints |
| E31 | Histopath block: no TARGET badges, no red severity encoding, no numeric emphasis, no inline conclusions | §6.3 Histopath | Forbidden elements |
| E32 | Color budget test: grayscale still makes sense, ≤10% saturated pixels at rest, only conclusions visually "shout" | §7 Budget | Mandatory test |
| E33 | "Color is punctuation, not prose. Conclusions speak in color; evidence whispers in text." | §8 Motto | Core principle |

---

## Source 2: `pcc-design/design-guide-addition.md`

| # | Rule | Section | Notes |
|---|------|---------|-------|
| D1 | Only one color family may be "attention-dominant" per visual zone; everything else → neutral, outline-only, desaturated, or revealed-on-interaction | Key Principle | Hard rule |
| D2 | TARGET ORGAN badge is the only persistent high-saturation color in its column | §1 Concrete | View-specific (Target Organs) |
| D3 | Strength/progress bars → neutral gray (not red) | §1 Concrete | Component spec |
| D4 | Evidence score: neutral text at rest, red only when row selected | §1 Concrete | Interaction-only |
| D5 | Domain chips: switch from filled color → colored outline or dot | §2 Concrete | Hard rule |
| D6 | Domain chips are categorical, not urgent — must not compete with conclusions | §2 Concrete | Principle |
| D7 | "Numbers should be read, not felt" — evidence numbers default to dark neutral text | §3 Concrete | Principle |
| D8 | Evidence score color appears only on: row selected, hover, or critical threshold crossed (rare) | §3 Concrete | Interaction-only |
| D9 | Typography (bold/normal/light) preferred over color for evidence strength | §3 Concrete | Principle |
| D10 | "adverse" label → outline badge, muted (not filled red) | §4 Concrete | Component spec |
| D11 | Direction arrows default to neutral gray | §4 Concrete | Component spec |
| D12 | p-values → neutral unless row selected or sorted by p-value column | §4 Concrete | Interaction-only |
| D13 | Effect size color → hover/selection only | §4 Concrete | Interaction-only |
| D14 | Emphasis tier system: Tier 1 (always colored) = TARGET ORGAN + Critical flags; Tier 2 (visible, muted) = adverse label + arrows; Tier 3 (on interaction) = p-values + effect sizes | §4 Concrete | Structural |
| D15 | Convergence/interpretation panel: only "Critical" badge may be saturated red | §5 Concrete | Component spec |
| D16 | Panel narrative text must be neutral (black/dark gray) | §5 Concrete | Hard rule |
| D17 | Use grouping + indentation instead of color repetition in panels | §5 Concrete | Principle |
| D18 | Per screen color budget: 1 dominant color (status), 1 secondary accent (interaction/selection), unlimited neutrals | Budget | Hard budget rule |
| D19 | Color tokens encode role, not aesthetics | §1.1 Token System | Principle |
| D20 | Status color (--status-critical): only for final, asserted decisions (TARGET ORGAN, Critical flags) | §1.1A Tokens | Definition |
| D21 | Only one status color visible per column at rest | §1.1A Tokens | Hard rule |
| D22 | Status color never applied to tables wholesale | §1.1A Tokens | Hard rule |
| D23 | Qualifiers (--status-qualifier, --status-warning): never inline with primary findings, always secondary in visual hierarchy | §1.1B Tokens | Presentation constraint |
| D24 | Evidence strength tokens: never saturated by default | §1.1C Tokens | Hard rule |
| D25 | Typography > color for evidence strength | §1.1C Tokens | Principle |
| D26 | Domain identity tokens: outline, dot, or glyph only; no filled pills at rest; domain colors never compete with status | §1.1D Tokens | Hard rule |
| D27 | Interaction color: temporary only, never encodes meaning | §1.1E Tokens | Hard rule |
| D28 | At rest, a column may use ONE saturated color family; everything else neutral/outlined/muted/interaction-only | §1.2 Hard Budget | Hard rule (repeat of D1) |
| D29 | Lint: no more than one saturated color family per column at rest | §3.1 Lint | Binary check |
| D30 | Lint: no numeric value uses saturated color by default | §3.1 Lint | Binary check |
| D31 | Lint: no categorical identity uses filled color at rest | §3.1 Lint | Binary check |
| D32 | Lint: color is never the only carrier of meaning | §3.1 Lint | Binary check |
| D33 | Lint: TARGET ORGAN is the only persistent red element in its column | §3.2 Lint | Binary check |
| D34 | Lint: status color not reused for evidence, metrics, or domains | §3.2 Lint | Binary check |
| D35 | Lint: status color does not appear more than once per row | §3.2 Lint | Binary check |
| D36 | Lint: evidence scores neutral by default | §3.3 Lint | Binary check |
| D37 | Lint: evidence scores gain color only on hover or selection | §3.3 Lint | Binary check |
| D38 | Lint: effect size color not visible unless sorted or focused | §3.3 Lint | Binary check |
| D39 | Lint: direction arrows default to neutral gray | §3.3 Lint | Binary check |
| D40 | Lint: domain chips are outline-only or dot-based | §3.4 Lint | Binary check |
| D41 | Lint: no filled domain pills at rest | §3.4 Lint | Binary check |
| D42 | Lint: domain colors never compete with status colors | §3.4 Lint | Binary check |
| D43 | Lint: if >30% of rows contain red at rest → FAIL | §3.5 Lint | Binary check |
| D44 | Lint: if user can't tell what's primary without color → FAIL | §3.5 Lint | Binary check |
| D45 | Lint: if color dominates before text is read → FAIL | §3.5 Lint | Binary check |
| D46 | Lint: review panel — only "Critical" flags may be saturated | §3.6 Lint | Binary check |
| D47 | Lint: review panel — narrative text is neutral | §3.6 Lint | Binary check |
| D48 | Lint: review panel — correlated findings grouped, not individually color-coded | §3.6 Lint | Binary check |
| D49 | UI spec: organ list — keep red TARGET badge, bars → neutral gray, evidence score → neutral text | §2.1 UI Changes | Component spec |
| D50 | UI spec: domain chips — neutral pill + colored dot OR outline pill with colored border | §2.2 UI Changes | Component spec |
| D51 | UI spec: evidence table — adverse = outline badge muted; p-values neutral unless selected/sorted; effect size = hover only; arrows = gray | §2.3 UI Changes | Component spec |
| D52 | UI spec: convergence panel — Critical badge red, everything else neutral, grouping not color | §2.4 UI Changes | Component spec |

---

## Source 3: `pcc-design/datagrok-design-system.md`

| # | Rule | Section | Notes |
|---|------|---------|-------|
| G1 | Maximize signal per pixel — every pixel should earn its place | §1 Core Goal | Core principle |
| G2 | Every visual choice (color, size, position, spacing) must encode meaning; if it doesn't contribute to comprehension, it's noise | §1.1 Principles | Hard rule |
| G3 | Data-heavy interfaces are expected and acceptable — accommodate dense data, don't fight it | §1.1 Principles | Principle |
| G4 | Visual hierarchy order: Position > Grouping > Typography > Color | §1.1 Principles | Structural |
| G5 | Layout optimized for large monitors (24"+), must be usable on laptops; mobile out of scope | §1.1 Principles | Constraint |
| G6 | Every view serves a specific cognitive mode: Home/Setup, Exploration, Analysis, Conclusion, or Hybrid | §2 Modes | Architectural (overlaps E9) |
| G7 | A view that mixes modes without making boundaries clear feels confusing | §2 Modes | Principle |
| G8 | Exploration views: no asserted conclusions by default | §2 Modes | Hard rule |
| G9 | Analysis views: hypotheses explicit, statistics and thresholds visible, results conditional not final | §2 Modes | Principle |
| G10 | Conclusion views: conclusions explicitly stated; evidence supports but doesn't lead; minimal interaction | §2 Modes | Principle |
| G11 | Hybrid views: user must always be able to tell whether reading a stated conclusion or looking at data behind it | §2 Modes | Hard rule |
| G12 | Every derived information element belongs to exactly one category: Decision, Finding, Qualifier, Caveat, Evidence, Context | §3 Hierarchy | Classification (overlaps E7) |
| G13 | Reader must always know which category they're looking at | §3 Hierarchy | Hard rule |
| G14 | A finding assertion must not hedge with a caveat in the same statement — present separately | §3 Hierarchy | Hard rule |
| G15 | Card/panel with both findings and caveats is fine if clearly marked and visually distinguished | §3 Hierarchy | Principle |
| G16 | Color must carry meaning — must map to something real in the data | §4 Color | Hard rule (overlaps E3) |
| G17 | No decorative color — no accent colors for visual interest, no alternating row colors implying nonexistent grouping, no bright tones without reason | §4 Color | Hard rule |
| G18 | Color removal test: if removing all color loses only aesthetics (not information), the color wasn't doing real work | §4 Color | Mandatory test (overlaps E32) |
| G19 | Progressive disclosure: conclusions are the default surface; supporting detail accessible but not in the way | §5 Layout | Principle |
| G20 | Show on interaction: secondary actions appear on hover/selection, keeping resting state clean | §5 Layout | Principle |
| G21 | Context panels explain *why* something is true, not repeat *what* is already visible; reactive to selection | §5 Layout | Principle |
| G22 | Don't assert conclusions in exploration views | §6 Anti-patterns | Hard rule |
| G23 | In Conclusion/Hybrid views, charts alone can't be the only way to reach a conclusion — state the finding | §6 Anti-patterns | Hard rule |
| G24 | Don't mix certainty levels in the same statement | §6 Anti-patterns | Hard rule |
| G25 | Gauges and sparklines without stated meaning force interpretation — always state the conclusion | §6 Anti-patterns | Principle |
| G26 | Don't say the same thing multiple ways — once is clarity, twice is clutter | §6 Anti-patterns | Principle |
| G27 | Make the system compute what it can — don't make users derive conclusions from raw data | §6 Anti-patterns | Hard rule |
| G28 | "If everything looks important, nothing is." | §7 Final | Core principle |
| G29 | For LLM agents: principles enforced through binary linting rules; agents don't apply judgment, they follow rules | §0 Scope | Process rule |

---

## Source 4: `pcc-design/signals-view-spec.md`

| # | Rule | Section | Notes |
|---|------|---------|-------|
| S1 | Signals view is Hybrid — Conclusion-First cognitive mode | §0 Identity | View-specific (overlaps E10) |
| S2 | Dual-mode center panel: Findings (default) + Heatmap; shared selection state and context panel | §1 Overview | Structural |
| S3 | Decision Bar fixed at top of center column, visible in both modes — the regulatory conclusion | §3 Decision Bar | Component spec |
| S4 | Decision Bar: typography only — no color on NOAEL/LOAEL values; exception: "Not established" may use amber | §3.2 Rendering | Hard rule |
| S5 | Decision Bar max height ~80px (2-3 lines), never scrolls | §3.2 Rendering | Component spec |
| S6 | Metrics line updates with filters; NOAEL line does NOT change with filters | §3.2 Rendering | Hard rule |
| S7 | This view uses full information hierarchy: Decision → Finding → Qualifier → Caveat → Evidence → Context | §1 Hierarchy | Structural (overlaps E7, G12) |
| S8 | Findings mode: two-column signal landscape — left = target organ rows, right = conditions rail | §5.1 Layout | Structural |
| S9 | "Target organ identified" text never appears — position implies status | §5.2 Design Decisions | Hard rule |
| S10 | Organ rows sorted by evidence_score descending | §5.2 Content | Presentation |
| S11 | Target organ rows: neutral text, no color — confident fact needs no color emphasis | §12 Color | Hard rule |
| S12 | Domain evidence chips: muted gray, shouldn't compete with findings | §12 Color | Hard rule |
| S13 | Dose-response indicators: cool accent (blue/teal), distinct from warnings | §12 Color | Color spec |
| S14 | Modifiers: amber styling | §5.3 Conditions Rail | Color spec |
| S15 | Review flags: orange styling, warning icon mandatory | §5.3 Conditions Rail | Color spec |
| S16 | NOAEL/LOAEL values: no color — regulatory statement, color would imply opinion | §12 Color | Hard rule |
| S17 | Selected row: blue border + subtle blue bg (interactive state, not epistemic) | §12 Color | Interaction spec |
| S18 | No expand/collapse toggles in Findings mode — everything always visible | §5.4 Design Decision | Hard rule |
| S19 | "View in heatmap →" only appears on selected row — never on hover, never on unselected rows | §5.5 Selection | Hard rule |
| S20 | Filters don't affect Findings mode conclusions; only affect Heatmap content + metrics line | §13 Filters | Hard rule |
| S21 | Context panel: no selection → prompt; organ level → Insights/Endpoints/Evidence/Navigation; endpoint level → Insights/Statistics/Correlations/ToxAssessment | §7 Context Panel | Component spec |
| S22 | Each rule renders in exactly one UI section, determined solely by priority number | §11 Pipeline | Structural |
| S23 | Lower-priority rules never appear above higher-priority ones | §11 Pipeline | Hard rule |
| S24 | Heatmap: target organs expanded by default, all others collapsed | §6.1 Matrix | Interaction default |
| S25 | Heatmap cells: signal score color bg + score text + significance stars | §6.1 Matrix | Component spec |
| S26 | Heatmap sex toggle: Combined (default) / M / F segmented control | §6.1 Matrix | Component spec |
| S27 | Forbidden: auto-opening evidence for every finding by default | §9.2 Forbidden | Hard rule |
| S28 | Forbidden: any interaction that changes the wording of conclusions | §9.2 Forbidden | Hard rule |
| S29 | Forbidden: requiring charts to understand whether an organ is a target organ | §9.2 Forbidden | Hard rule |
| S30 | Linting: conclusions in Findings mode must be visible without interaction | §16 Lint | Binary check |
| S31 | Linting: evidence reachable within one interaction from a finding row | §16 Lint | Binary check |
| S32 | Linting: caveats/qualifiers never mixed inline with primary findings | §16 Lint | Binary check (overlaps E8, G14) |
| S33 | Signal detail grid hidden by default behind toggle — power-user tool | §14 Grid | Component spec |
| S34 | Mental model order: Decision → Target organs → Conditions → Cautions → Verify | §18 Mental Model | Principle |
| S35 | If any step in the mental model requires exploration rather than reading, the view is mis-designed | §18 Mental Model | Hard rule |


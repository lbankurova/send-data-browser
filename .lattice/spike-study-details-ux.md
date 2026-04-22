# Spike: StudySummaryView UX/UI

Running brainstorm + decisions. Implementation deferred until user says "go".

## Context

- Target view: `frontend/src/components/analysis/StudySummaryView.tsx` (wrapped by `StudySummaryViewWrapper.tsx`, which renders `StudyBannerConnected` above).
- `StudyBanner` is a shared compact strip (used by StudySummaryView, FindingsView, ValidationView, CohortView). Shows: species/strain | duration+recovery+route | N dose groups | study type | design type | (TK satellite excluded).
- Datagrok compatibility target: tab bar is reserved for view-agnostic chrome (home/search left, user/session right). View-specific controls live **below** the tab bar as a Datagrok-style view menu strip (single-line toolbar pattern).
- Datagrok reference: screenshot shows tab-bar-global-icons + below-tab view menu (`Edit | View | Select | Data | ML | SAVE | icons`).

## Decisions

### 1. Control strip placement & styling (2026-04-21)

**Problem:**
- Generate report button (`ViewTabBar.right`) too wide (~160px) for laptop screens.
- Dedicated section-controls row (line 947-961) wastes ~24px vertical for a single expand/collapse icon.
- Datagrok-compat: tab bar's right slot will be claimed by global icons, not view actions.

**Decision:**
- Add a **thin single-line toolbar strip below the tab bar**, left-aligned, matching Datagrok's view-menu convention.
- Controls in the strip:
  - `[📄]` Generate report — icon (`FileText`) + tooltip "Generate report"
  - `[⇕]` Expand/collapse all — already a single toggle icon, relocated (currently a dedicated row)
- Delete the dedicated section-controls row (current line 947-961).
- Tab bar's right slot: **leave empty** for now (reserved for future Datagrok global icons).
- Strip is **toolbar-only** — no right-column content (columnar layout from earlier iteration rejected once the fixed header redundancy was identified — see decision 2).

**Rejected:** putting Generate report back in the tab bar's right slot (conflicts with Datagrok convention).

**Rejected:** right-aligning banner text (moot — banner content deleted in decision 2).

### 2. Fixed header redundancy cleanup + pane restructure (2026-04-21)

**Problem:** The fixed header section (StudySummaryView.tsx lines 818-916) duplicates info already shown in StudyBanner and StudyTimeline.

**Audit:**

| Fixed header content | Redundant with | Action |
|---|---|---|
| Subtitle (species \| design \| route \| N groups \| study type) | StudyBanner | DELETE |
| N subjects total | — | DELETE (low value here) |
| Pipeline stage dot | — | DELETE (low value here) |
| `Groups: Control, 50 mg/kg, …` | StudyTimeline per-row labels | DELETE |
| `Arms: Main: X · Recovery: Y · TK: Z` | StudyTimeline (shown next to chart) | DELETE |
| TK/recovery behavior note | Unique | **MOVE** to renamed Study design section |
| NOAEL / LOAEL + counts + confidence | Unique | **NEW PANE** (see below) |
| `At NOAEL: Cmax · AUC` | Partially in PK Exposure pane | **MOVE** into NOAEL/LOAEL pane as callout (conclusion-grade summary) |
| `HED · MRSD` | Partially in PK Exposure pane | **MOVE** into NOAEL/LOAEL pane as callout |
| Interpretation notes (cross-domain cautions) | Unique | **MOVE** into new Notes pane |

**Result — pane restructure:**
- Delete entire fixed header section (lines 818-916).
- Rename "Study timeline" pane → **"Study design"**. Absorbs the TK/recovery behavior note.
- **NEW PANE:** "NOAEL / LOAEL" — owns NOAEL, LOAEL, target organ count, domains-with-signals, confidence, exposure-at-NOAEL (Cmax/AUC), HED, MRSD.
- **NEW PANE:** "Notes" — system-generated + user notes. Replaces the out-of-place Notes section in Settings Context Panel.
- **NEW PANE (placeholder):** "Favorites" — table of user-favorited entities with metadata + notes. Implementation deferred to a parallel spike (GAP-267). For this spike: render empty state ("No favorites yet — click ★ on any finding to add it here").

### 3. Scroll order of panes (2026-04-21)

Order (top to bottom in scrollable body):

1. **NOAEL / LOAEL**
2. **Study design** (renamed from Study timeline; includes TK/recovery note)
3. **Favorites** (placeholder pane in this spike)
4. **Notes**
5. **Domains**
6. **PK Exposure**
7. **Data quality**

Rationale: conclusions-first, then design, then user-curated content, then data inventory, then caveats. Favorites+Notes are kept adjacent but below Study design because favorites will be empty for first-visits and would otherwise waste prime viewport.

### 4. Notes and Favorites — two separate panes (2026-04-21)

- Two distinct panes, not one combined. Simpler mental model, each has one job.
- Notes pane: system-generated alerts (cross-domain interpretation cautions) + user free-form notes. Long-term: team/collaborator notes.
- Favorites pane: table of entities user has starred from other views, each with optional note. Long-term: syncs with "Notes" section in each entity's Context Panel.

## Final target layout

```
┌─────────────────────────────────────────────────────────────┐
│ StudyBanner (external, persistent, compact single-line)     │
├─────────────────────────────────────────────────────────────┤
│ Tab bar: [Study details] [+ Rules…]          (right: empty) │
├─────────────────────────────────────────────────────────────┤
│ Control strip: [📄] [⇕]                                     │
├─────────────────────────────────────────────────────────────┤
│ (Provenance warnings, if any)                               │
├─────────────────────────────────────────────────────────────┤
│ ▸ NOAEL / LOAEL                                              │
│ ▸ Study design                                              │
│ ▸ Favorites                                                 │
│ ▸ Notes                                                     │
│ ▸ Domains (N)                                               │
│ ▸ PK Exposure                                               │
│ ▸ Data quality                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5. Delete "Dose groups" pane from Settings Context Panel (2026-04-21)

**Problem:** `StudyDetailsContextPanel.tsx` has a "Dose groups" pane (lines 329-333; component `DoseGroupsSection` at lines 81-144) rendering a read-only table of arm colors / labels / doses / N / recovery N.

**Three issues:**
1. Semantic mismatch — panel is titled "Study-level settings" but this pane is pure reference data, not a setting.
2. Redundant with StudyTimeline (in the renamed "Study design" pane), which already shows every dose group with matching colors, per-sex N, and recovery arms.
3. Wrong location for a reference — hidden in a closed pane of the context panel; if the scientist wants a quick arm reference while in Findings/Histopath, they won't find it here.

**Decision:** Delete the pane entirely.

**Implementation notes:**
- Remove the `CollapsiblePane` block at `StudyDetailsContextPanel.tsx:329-333`.
- Remove the `DoseGroupsSection` local component (lines 81-144).
- Remove the local `DoseGroupWithRecovery` type alias (line 77) if unreferenced after deletion.
- Verify no external imports of `DoseGroupsSection` (it's a local function — `grep` during pre-write).

### 6. Compound identity — strings-only for small molecules (2026-04-21)

**Problem:** No place today to record the compound being tested. Scientist asks "what molecule is this?" and must check external sources.

**Constraint:** SENDEX is NOT on Datagrok yet. Sketcher + structure rendering + physchem calcs require multi-MB chem libraries (RDKit.js, Ketcher, etc.) with real maintenance cost. Not worth it pre-Datagrok because all the analytical value (SAR, similarity, structural alerts) also waits on Datagrok. Pre-Datagrok value of investing in rendering: low.

**Decision — minimal storage, no rendering:**

- Extend the existing Compound profile pane (`CompoundProfileSection.tsx`). Only show these fields when `inference.compound_class === "small_molecule"`.
- Fields per compound (all optional strings, no validation, no rendering):
  - **Compound ID** — free text (internal code, CAS#, InChIKey, sponsor ID)
  - **SMILES** — free text
  - **SMARTS** — free text (optional, for substructure intent)
- Stored as a list on the study annotation, even in single-compound studies:
  ```ts
  // extend existing sme_confirmed schema
  compound_identity?: Array<{
    id?: string;
    smiles?: string;
    smarts?: string;
  }>
  ```
- Rendering:
  - Default: one row of inputs.
  - If `is_multi_compound === true`: show one row per compound + "Add another" button (list-mode).
- Persistence: extend `useSaveCompoundProfile` payload schema; no new annotation type (confirmed with user).
- Display back: raw strings in monospace. No visual structure, no physchem, no search.

**Prevalence check that supported this scope:** 1/16 studies in validation corpus are multi-compound (6%). Research (`docs/_internal/research/multi-compound-studies/...`) confirms multi-compound is minority pattern in SEND corpus; storing as a list from day 1 costs ~5% extra and avoids later migration.

**Rejected:** sketcher/Ketcher-based structure input (pre-Datagrok cost too high vs. pre-Datagrok analytical value — there is none).

**Rejected — separately:** "Attachments" pane (images + links). Out of scope per user: Datagrok will provide hyperlinks + file attachments out-of-the-box; no sense in building an interim surface.

**Deferred to Datagrok era** — log in ROADMAP + capabilities.yaml as a single initiative ("Datagrok-era chem capabilities"):
1. Structure rendering from stored SMILES
2. Auto-physchem (logP, MW, TPSA, pKa, HBD/HBA, RotBonds)
3. Substructure / similarity search across studies
4. Structural alerts → expected-effects refinement (hERG, PAINS, reactive-group)
5. Analog compound lookup (Tanimoto top-K across portfolio, linked to their tox signals)
6. SAR workbench / R-group decomp (cross-study)
7. Metabolite / TK parent+metabolite surfacing
8. Attachments & hyperlinks (Datagrok Files/Browse)

Tracked as **GAP-268** in `docs/_internal/TODO.md` with the phased breakdown.

### 7. Compound class override — inference-first, replace 29-row dropdown (2026-04-21)

**Problem:** Current Compound profile pane shows a 29-row `Select` dropdown listing every profile in the catalog, regardless of study context. For a small-molecule rat study (PointCross), the user sees 28 biologic profiles (ADC variants, mAb variants, gene therapies, vaccines). Visual noise + poor scaling as catalog grows. Also: mojibake on 7 ADC entries (fixed separately, decision logged via GAP-269 audit).

**First-principles re-framing:**
- Inference runs on every study (TS metadata + domains + species → `compound_class` with HIGH/MEDIUM/LOW/DEFAULT confidence).
- HIGH/MEDIUM cases: inference is reliable; user needs NO dropdown interaction.
- LOW/DEFAULT cases: user corrects, which is the EXCEPTION path. The scientist KNOWS their compound — they don't want to scroll a 29-row catalog, they want to TYPE what it is.
- A 29-row `Select` optimizes for recognition; search/autocomplete optimizes for recall. Scientists recall.

**Decision:**

- Delete the current 29-row `Select` in `CompoundProfileSection.tsx`.
- Replace with a compact "Override…" affordance that expands into a searchable autocomplete input.
- Autocomplete filters the catalog as the user types; pressing Enter on a catalog match wires that profile's `expected_findings` (current behavior).
- **Free-text fallback** (the user is allowed to declare a class label that has no catalog match, e.g., "small-molecule CDK inhibitor", "novel anti-XYZ mAb"). Saves as free-text on the annotation; does not resolve to a catalog profile.

**Fallback message — mandatory when no catalog match:**

Display an inline notice (Info icon, sentence-case, matching existing inference-note style) explaining:
1. What class (if any) the system falls back to for rules.
2. What this means for analysis — exactly which kinds of expected-effect filtering DO vs DO NOT apply.
3. The remedy — pick a closer catalog match if one exists; request a new profile if coverage is missing.

**Draft copy templates (need SME review before ship):**

| Fallback case | Message |
|---|---|
| Small molecule, no catalog rules exist | "No catalog rules apply to this class. Findings will be scored on their own evidence; no class-specific expected-effect filtering will be used. If your compound matches a specific class in the catalog (e.g., NSAID, kinase inhibitor), pick it from the list for tailored rules." |
| Biologic, falls back to `general_mab` | "Using generic monoclonal antibody rules. Broad mAb effects — infusion reactions, general immunogenicity, complement activation — will be filtered as expected. Class-specific findings (e.g., anti-IL-6 hepatic effects, anti-VEGF vascular findings) will not be contextualized until a closer catalog match is picked." |
| ADC, falls back to `adc_base` | "Using ADC antibody-backbone rules only. Fc-mediated effects will be filtered as expected. Payload-specific findings (e.g., MMAE peripheral neuropathy, PBD hematotoxicity) will not be contextualized until a payload-specific profile is picked." |

**Storage shape — extends `sme_confirmed` annotation (pairs with decision 6):**
```ts
sme_confirmed: {
  compound_class?: string;              // catalog profile_id (if catalog match)
  compound_class_freetext?: string;     // user-typed label (if no catalog match)
  compound_class_fallback?: string;     // which generic profile is used for rules (e.g., 'general_mab', 'adc_base', null)
  original_compound_class: string;      // the inferred value (audit)
  confirmed_by_sme: boolean;
  expected_findings: Record<string, boolean>;
  note?: string;
  reviewDate: string;
  compound_identity?: Array<{ id?: string; smiles?: string; smarts?: string }>;  // decision 6
}
```

**Open design notes for implementation:**
- Autocomplete input should debounce and fuzzy-match (substring + modality + display_name).
- Keyboard: Enter to pick top match, Escape to cancel override.
- "Reset to auto" button stays as today — clears `sme_confirmed` entirely.
- If HIGH/MEDIUM confidence: still allow override, but the override affordance can be less prominent (small "Override…" link vs. a full button).
- If LOW/DEFAULT confidence: keep the current "select a profile below" hint but point at the override affordance, not the 29-row list.

### 8. Historical control data — on-demand detail tab (2026-04-21)

**Problem:** Current `Historical control data` pane in Settings Context Panel shows only `"153 references available"` + upload affordance. Scientists can't see which endpoints are covered, what values, from where, whether duration matches. PointCross example: 153 refs from `NTP_DTT_IAD`, 78 LB test codes × M/F, all invisible.

**Use cases driving this:**
1. **QC at study setup** — "what HCD is the engine pulling for this study?"
2. **Reference lookup during analysis** — "is this value within HCD range? Where did that number come from?"
3. **Audit artifact for the study report** — HCD choice is regulatorily relevant.

**Decision — on-demand closable tab, same pattern as Rules & classification:**

- Add a closable tab `"HCD reference"` to `StudySummaryView`'s tab bar, opened on demand via a link in the HCD pane ("View HCD reference →"). Close via X.
- Matches existing `rulesTabOpen` pattern (`StudySummaryView.tsx:147-157`). No new mechanism.
- Supports use cases 1 and 2: scientists can keep the tab open while moving between Study details / Findings / etc., or close it when done.
- Use case 3 (report-embedded audit) satisfied separately by adding an HCD section to the generated study report (`generateStudyReport`) — not in scope for this decision, log as follow-up.

**Content of the HCD reference tab:**

- **Header:** species, strain, duration category, duration-match status (is this HCD for the right study length?), total refs, user-uploaded count, sources.
- **Coverage table:** domain × sex → count.
- **Per-endpoint rows-of-records table** (one row per `test_code × sex × source`):
  - Columns: `test_code`, `sex`, `N`, `mean ± SD`, `range (lower–upper)`, `unit`, `source`, `confidence`, `source_type` (system / user).
  - Sortable, no custom filtering widgets in MVP.
- **Source glossary:** expanded provenance for each source seen (e.g., `NTP_DTT_IAD` → link to NTP Domestic Toxicology Testing database documentation).
- **Missing-coverage section:** study endpoints with no HCD match (optional in MVP; add later if asked).

**Datagrok migration:**
- Pre-Datagrok: React table component bound to `hcd_references` as rows-of-records.
- Post-Datagrok: swap the table for `grok.shell.addTableView(df)`. All grid features (sort/filter/pivot/pin) come free from the platform. Zero data-model lock-in as long as we stay rows-of-records.

**Implementation flag (not a decision):** The control strip from decision 1 (`[📄] [⇕]`) is Study-details-oriented. When on the HCD tab, expand/collapse has no meaning. Options: tab-aware control strip (preferred), or thin tab-content header for tab-specific actions. Pin this at build time.

**Rejected:**
- New browser tab (use case mismatch — breaks SPA routing, back button awkward, duplicate styling; standard middle-click on the in-app link still gives "open in new tab" when a user wants it).
- Progressive expand-in-place inside the current pane (too narrow for dense tables).

**Follow-up (not in scope):**
- HCD section inside generated study report (use case 3) — log as GAP.
- Inline HCD provenance on findings cells (use case 2 refinement) — log as GAP.

### 9. Override spec collision resolved by scope reduction (2026-04-21)

**Problem:** The `study-design-override-surfaces-synthesis.md` spec (marked "ready for build cycle") proposes a 14-row inference audit panel with per-row overrides. Feature 3.2 **builds on the existing Study Summary profile block** with a two-mode toggle and always-on tier badges — directly conflicts with our decision 2 which deletes that profile block.

**Resolution — scope challenge to the spec, not compromise on decision 2:**

Row-by-row audit from SEND-domain perspective (documented in `docs/_internal/incoming/study-design-override-surfaces-scope-challenge.md`):

- 9 of the 14 rows are featuritis or low-value (species, strain, route, vehicle, dose unit, study type, duration, test article, pathologist source).
- 4 rows are already shipped (test article, compound class, pathologist, normalization, primary comparator/control_type).
- **Only 2-3 rows carry genuine unmet value:**
  - Per-ARMCD `recovery?` flag override (ARMCD-"R" heuristic fails on non-standard naming)
  - Per-ARMCD `satellite?` (TK) flag override (sponsors unreliable with TX.TKCAT)
  - Maybe per-arm control_type refinement if study has multiple control types

**Consequence for this spike:**
- The "Design inference audit" panel is OUT. Nothing from the spec lands in our StudyDetailsView layout under the reduced scope.
- The surviving arm-level overrides belong inline on `StudyTimeline` rows (our renamed "Study design" pane from decision 2). Right-click on a timeline row → toggle recovery / satellite. No new pane.
- The regen-in-progress banner (Feature 3.4) is separate, unaffected, and adds a slot above StudyBanner — updating the layout diagram.

**Updated final target layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ Regen-in-progress banner (transient, Feature 3.4)           │
├─────────────────────────────────────────────────────────────┤
│ StudyBanner (external, persistent, compact single-line)     │
├─────────────────────────────────────────────────────────────┤
│ Tab bar: [Study details] [+ Rules…] [+ HCD reference…]       │
├─────────────────────────────────────────────────────────────┤
│ Control strip: [📄] [⇕]  (tab-aware in future)              │
├─────────────────────────────────────────────────────────────┤
│ (Provenance warnings, if any)                               │
├─────────────────────────────────────────────────────────────┤
│ ▸ NOAEL / LOAEL                                              │
│ ▸ Study design  (renamed timeline; per-arm right-click      │
│                  recovery?/satellite? override when reworked│
│                  override spec ships)                        │
│ ▸ Favorites                                                 │
│ ▸ Notes                                                     │
│ ▸ Domains (N)                                               │
│ ▸ PK Exposure                                               │
│ ▸ Data quality                                              │
└─────────────────────────────────────────────────────────────┘
```

**Action taken:**
- Wrote `docs/_internal/incoming/study-design-override-surfaces-scope-challenge.md` — detailed row-by-row assessment with HIGH/MED/LOW value and feasibility, for the next research/synthesis pass to consume. The spec should NOT enter build cycle in its current form.
- Created `docs/_internal/checklists/SPEC-VALUE-AUDIT.md` — mandatory per-feature value audit to be run on specs before architect review approves them for build. Process safeguard so this class of overscoped spec gets caught at synthesis time, not via a collision-review accident.

### 10. Switcher + Overview architecture (supersedes stacked-scroll from decisions 1/2/3) (2026-04-22)

**Problem:** Stacked-scroll layout (7 collapsible panes from decision 2) has three issues: (a) scientists must scroll + guess section names to navigate, (b) panes share vertical space → timeline, tables, charts are cramped, (c) the expand/collapse-all toggle is a blunt tool. Adding a popover ToC or sticky headers only partially addresses these.

**Decision — content-switcher rail + Overview default:**

- Add an in-view left rail (~260px, matching `FindingsView` sizing) inside StudyDetailsView. Rail lists sections; clicking switches the center content.
- Each section becomes a **full-viewport-height detail view**, not a stacked CollapsiblePane.
- **Default section on first visit:** "Overview" — a summary-card dashboard that preserves the at-a-glance story the stacked-scroll model gave for free.
- URL: `/studies/{id}/details/{section}` — deep-linkable, back button works, shareable.
- Semantic match with FindingsView: both rails select center content.

**Rail sections (order unchanged from decision 3, with Overview prepended):**

1. **Overview** (default) — summary cards
2. NOAEL / LOAEL
3. Study design
4. Favorites
5. Notes
6. Domains (N)
7. PK Exposure
8. Data quality

**Overview content — dashboard of summary cards:**

Grid of compact clickable cards, one per other rail item. Each card shows the 1-3 most-asked facts + navigates to the detail section on click. Example cards:

- **NOAEL/LOAEL** card: `NOAEL: Not established (<2 mg/kg) | LOAEL: 2 mg/kg | 5 target organs | 80% confidence`
- **Study design** card: species + duration + group count + tiny timeline sparkline
- **Favorites** card: N starred entities with preview chips (empty state when empty)
- **Notes** card: N notes, preview of latest
- **Domains** card: total count + top tier-1 domains
- **PK Exposure** card: HED/MRSD if available, otherwise "No PK data"
- **Data quality** card: validation summary + warnings

Card sizing: 3-column grid on wide viewport, 2-column on laptop. Each card compact (~120px tall).

**Ripple effects on prior decisions:**

- **Decision 1 (control strip):** `[⇕]` expand/collapse toggle is DROPPED — no stacked panes, nothing to expand/collapse. Control strip reduces to `[📄]` Generate report. Stays above the rail+center split (matches Datagrok's view-menu convention). No tab bar right slot change.
- **Decision 2 (pane restructure):** the pane LIST is unchanged; what changes is the RENDERING. Stacked CollapsiblePane → rail + full-height switcher. Same 7 sections + new Overview.
- **Decision 3 (scroll order):** becomes **rail order**. Overview prepended.
- **Decision 4 (Notes + Favorites as two separate panes):** **kept** as two separate rail items. Considered merging into one "Curation" section under switcher (each section has full height regardless of content size, so merging saves nothing visually). Keep separate — simpler mental model; different user actions (star-an-entity vs. write-a-note).
- **Decision 8 (HCD reference as closable tab):** **unchanged**. HCD stays as a sibling closable tab at the Study Details level, not a rail section. Rationale: HCD is a study-wide reference surface accessed infrequently; transient-tab pattern matches the "open when needed, close when done" workflow; promoting to rail makes it always-visible without payoff.
- **Decision 9 (override spec scope):** unchanged. The reworked override spec's surviving arm-level overrides land inline on StudyTimeline rows within the Study design section.

**Final target layout (revised from decision 9):**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Regen-in-progress banner (transient, Feature 3.4)                   │
├─────────────────────────────────────────────────────────────────────┤
│ StudyBanner (persistent, compact single-line)                       │
├─────────────────────────────────────────────────────────────────────┤
│ Tab bar: [Study details] [+ Rules…] [+ HCD reference…]              │
├─────────────────────────────────────────────────────────────────────┤
│ Control strip: [📄]                                                  │
├─────────────────────┬───────────────────────────────────────────────┤
│ Overview ●          │                                               │
│ NOAEL / LOAEL       │   [Full-viewport content for selected         │
│ Study design        │    section — ~860px tall, ~1070px wide on     │
│ Favorites           │    1920x1080 with Context Panel open]         │
│ Notes               │                                               │
│ Domains (28)        │                                               │
│ PK Exposure         │                                               │
│ Data quality ⚠      │                                               │
├─────────────────────┴───────────────────────────────────────────────┤
│ (Context Panel is rendered by parent layout, not shown here)        │
└─────────────────────────────────────────────────────────────────────┘
```

**Implementation notes (not decisions — surface at build time):**

- Rail component: reuse `FindingsRail` scaffolding if feasible; otherwise build minimal `StudyDetailsRail`. Rail items: label, optional count badge, optional warning pill.
- State: `activeSection` persisted in URL param + session storage for back/forward.
- Section components: stop using `CollapsiblePane`; each section becomes a top-level component with its own header.
- Overview cards: lightweight, reuse chart/summary primitives where possible (e.g., existing tier dot for Data quality, existing dose color dots for Study design).
- Empty states: cards for unpopulated sections (Favorites, Notes) show clear empty-state copy + CTA.
- Keyboard: up/down arrows to move between rail items; Enter/Space to open.
- Mobile/narrow viewport: rail can collapse to a dropdown or slide-in panel. Out of scope for MVP.

**Rejected alternatives:**
- ToC popover from control strip + sticky headers — smaller change, but doesn't capture the focus-per-section benefit; kept as a fallback if switcher proves too invasive.
- In-view rail as scroll-anchor (rail items scroll rather than switch) — semantic mismatch with FindingsView's rail function; rejected.
- Merge Favorites + Notes under switcher — rail-slot saving is cosmetic; mental model cost is real.

## Open work — tracked elsewhere

- **Favorites spike / feature:** GAP-267 in `docs/_internal/TODO.md` (cross-view favorite actions, persistence, data model). Not in scope for this spike.
- **Datagrok-era chem capabilities:** GAP-268 in `docs/_internal/TODO.md` (structure rendering, physchem, SAR, analog lookup, attachments — all deferred until Datagrok migration). Not in scope for this spike.
- **Backend UTF-8 audit:** GAP-269 in `docs/_internal/TODO.md` (19 remaining `open(..., "r")` sites with latent Windows-encoding bugs). Immediate fix in `compound_class.py` shipped as part of this spike.

## Pending items

_(to be added as user continues listing pain points)_

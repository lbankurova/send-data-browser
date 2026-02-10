# Consolidated Design Rules — External vs Internal

> **Purpose:** Compare rules extracted from external pcc-design files (149 rules) with internal design system docs (146 rules). Identify overlaps, gaps, and conflicts.
> **Created:** 2026-02-09
> **Process:** Merged by theme, flagged duplicates, flagged conflicts for user resolution.

---

## 1. Overlap Analysis

Most external rules are already captured in internal docs. The internal docs are more specific (exact hex values, CSS classes, component specs). The external docs are more principled (why-level reasoning, color budgets, cognitive modes).

### Fully Overlapping (same rule, both sources)

| Theme | External | Internal | Status |
|-------|----------|----------|--------|
| Only conclusions in color at rest | E1, D1, D28 | V15, V17, CL8, C-02 | **Aligned** |
| Numbers readable without color | E2, D7 | V38, C-02 | **Aligned** |
| Color never sole carrier of meaning | E3, D32 | C-06, AP22 | **Aligned** |
| One saturated color family per column | E4, D28, D29 | — | **Gap: not in internal as explicit rule** |
| If unsure, use neutral gray | E5 | CL4, C-05, V14 | **Aligned** |
| Info hierarchy: Decision→Finding→Qualifier→Caveat→Evidence→Context | E7, G12, S7 | — | **Gap: not codified internally** |
| Mixing categories in one visual unit forbidden | E8, G14, S32 | — | **Gap: not in internal checklist** |
| Each view declares a cognitive mode | E9, G6 | — | **Gap: not codified internally** |
| Signals view = Hybrid (Conclusion-First) | E10, S1 | — | View spec only, not in design system |
| Status/decision color ONLY for final conclusions | E12, D20, D33 | V16, V19, C-07 | **Aligned** |
| No numbers in decision red | E13 | C-02, CL8 | **Aligned** |
| No repetition of decision red per row | E14, D35 | — | **Gap: not explicit internally** |
| Decision red never in tables by default | E15, D22 | CL8, C-02 | **Aligned** |
| Qualifiers: outline or text only, never inline with findings | E16, D23 | — | **Partially covered by C-04** |
| Evidence numbers neutral at rest, color on interaction | E17, D4, D8, D36 | CL8, C-02, C-03 | **Aligned** |
| Typography preferred over color for evidence | E19, D9, D25 | AP24 | **Aligned** |
| Domain identity: dot or outline only, no filled pills | E20, D5, D26, D40, D41 | V13, CL3, C-25 | **Conflict: internal says colored text only (CL3), external says dot/outline (E20)** |
| Semantic vs syntactic color distinction | E21, E22, E23 | C-01 | **Aligned** (C-01 covers the principle) |
| Organ list at rest: neutral strength bar, neutral evidence score | E24, D3, D49 | V17, CL8 | **Aligned** |
| Evidence tables: all numbers neutral, arrows gray | E26, D11, D39, D51 | CL8, C-02 | **Aligned** |
| Interpretation panel: Critical badge red, narrative neutral | E28, D15, D16, D52 | C-04, C-07 | **Aligned** |
| Histopath: no #DC2626, no background fills, no status color reuse | E30, E31 | — | **Gap: not in internal checklist** |
| Color budget test: grayscale still works, ≤10% saturated at rest | E32, G18 | — | **Gap: not in internal checklist** |
| No categorical identity uses filled color | D31, D30 | CL4, C-05, C-27, V14 | **Aligned** |
| >30% of rows red at rest = FAIL | D43 | — | **Gap: not in internal checklist** |
| Context panels explain why, not repeat what | G21 | AP2 | **Aligned** |
| Progressive disclosure: conclusions default, detail on interaction | G19, G20 | CL8, S33 | **Aligned** |
| Don't assert conclusions in exploration views | G22, G8 | — | **Gap: not in internal** |
| System computes what it can, don't make users derive | G27 | — | **Gap: not in internal** |
| Visual hierarchy: Position > Grouping > Typography > Color | G4 | — | **Gap: not codified internally** |
| Canonical tab bar | — | CL5, K-05 | Internal only (view-specific) |
| Evidence panel bg-muted/5 | — | CL6, S-06 | Internal only |
| Rail header font-semibold | — | CL7, T-09 | Internal only |
| Evidence tab named "Evidence" | — | CL10, K-06 | Internal only |
| Data label casing: titleCase for organ_system, raw for clinical labels | — | CL11, X-06, X-07 | Internal only |

---

## 2. Conflicts Requiring Resolution

### CONFLICT 1: Domain label treatment

| Source | Rule | What it says |
|--------|------|-------------|
| External (E20) | Domain identity: **dot or outline only**, no filled pills, max color width ≤ 6px |
| External (D5, D26, D50) | Domain chips: **colored outline or dot**, neutral pill + colored dot, outline-only pill with colored border |
| Internal (CL3, V13, C-25) | Domain labels: **colored text only**. `getDomainBadgeColor(d).text` + `text-[9px] font-semibold`. Never dot badges, outline pills, bordered treatments |

**The conflict:** External says "dot or outline badges." Internal says "colored text only, never any badge treatment." These are contradictory. Internal is more restrictive.

**Context:** Internal rule was a deliberate design decision made during implementation. CL3 is marked as HARD RULE in CLAUDE.md.

### CONFLICT 2: Decision Bar color

| Source | Rule | What it says |
|--------|------|-------------|
| External (S4, S16) | Decision Bar: **typography only** — no color on NOAEL/LOAEL values. Exception: "Not established" amber |
| Internal (V21) | Decision Bar: `border-l-2 border-l-blue-500 bg-blue-50/30` — persistent accent at rest |

**The conflict:** External says "no color" but internal has a blue accent border + tinted background on the Decision Bar itself. The external rule targets the *values* (NOAEL/LOAEL text), while internal describes the *container styling*. These may not actually conflict — the container has accent styling, but the values within don't have color.

**Likely resolution:** Not a true conflict. External rule about values, internal about container. Both can coexist.

### CONFLICT 3: Severity badges — already resolved

| Source | Rule | What it says |
|--------|------|-------------|
| External (E12) | Status/decision color ONLY for final conclusions |
| Internal (V14, CL4) | ALL categorical badges (including severity) use neutral gray |
| Visual guide §1.1 | Lists semantic colors for Error/Warning/Info with specific Tailwind classes |

**Status:** §1.1 still lists colored semantic badges (`bg-red-100 text-red-800 border-red-200` for Error, etc.) but §1.8 overrides this: "ALL categorical badges use neutral gray." The code was fixed to match §1.8. §1.1 is stale — the hex values remain valid for *conclusion-level* usage (tier dots, NOAEL badges) but NOT for categorical severity badges.

**Resolution needed:** Update §1.1 to clarify these colors are for conclusion tiers only, not for categorical severity badges. Or remove §1.1 entirely if the distinction is covered elsewhere.

---

## 3. Rules in External Only (Gaps in Internal)

These rules appear in the external pcc-design files but are NOT captured in the internal design system docs:

| # | Rule | Source | Recommendation |
|---|------|--------|---------------|
| GAP-E1 | One saturated color family per column at rest | E4, D1, D28, D29 | **Add to checklist as C-08** |
| GAP-E2 | Info hierarchy: 6 categories (Decision→Context) — every element classified | E7, G12 | **Add to design guide §1.10** |
| GAP-E3 | Mixing info hierarchy categories in one visual unit forbidden | E8, G14 | **Add to checklist as C-09** |
| GAP-E4 | Each view declares a cognitive mode | E9, G6 | **Add to design guide** |
| GAP-E5 | No repetition of decision red per row | E14, D35 | **Add to checklist as C-28** |
| GAP-E6 | Histopath block: no #DC2626, no bg fills, no status color reuse, no TARGET badges | E30, E31 | **Add to audit checklist** |
| GAP-E7 | Color budget test: grayscale works, ≤10% saturated pixels at rest | E32, G18 | **Add to checklist as C-29** |
| GAP-E8 | >30% of rows red at rest = FAIL (table density lint) | D43 | **Add to checklist as C-30** |
| GAP-E9 | Don't assert conclusions in exploration views | G8, G22 | **Add to design guide** |
| GAP-E10 | Visual hierarchy: Position > Grouping > Typography > Color | G4 | **Add to design guide** |
| GAP-E11 | System computes what it can — don't make users derive | G27 | **Add to design guide** |
| GAP-E12 | Emphasis tier system: Tier 1 (always colored) = conclusions; Tier 2 (muted) = labels; Tier 3 (interaction) = evidence | D14 | **Add to design guide §1.10** |
| GAP-E13 | Per-screen color budget: 1 dominant, 1 secondary accent, unlimited neutrals | D18 | **Add to design guide** |
| GAP-E14 | Color removal test (if removing color loses only aesthetics, color wasn't doing work) | G18 | Overlaps E32, merge into C-29 |
| GAP-E15 | "If everything looks important, nothing is" | G28 | **Add to design guide** |

---

## 4. Rules in Internal Only (Not in External)

These exist only in the internal implementation docs — no external counterpart. Most are implementation-specific and correct:

| Rule | Source | Status |
|------|--------|--------|
| Canonical tab bar pattern (CL5, K-05) | CLAUDE.md, checklist | Implementation detail — keep |
| Evidence panel bg-muted/5 (CL6, S-06) | CLAUDE.md, checklist | Implementation detail — keep |
| Rail header font-semibold (CL7, T-09) | CLAUDE.md, checklist | Implementation detail — keep |
| Evidence tab named "Evidence" (CL10, K-06) | CLAUDE.md, checklist | Design decision — keep |
| Data label casing two-tier strategy (CL11, X-06/07) | CLAUDE.md, checklist | Implementation detail — keep |
| No breadcrumb nav in context panel (CL1) | CLAUDE.md | Design decision — keep |
| Mode 2 issue pane constraints (CL2) | CLAUDE.md | Design decision — keep |
| Hard process rules (CL12-14) | CLAUDE.md | Governance — keep |
| Specific typography tokens (V30-V38) | Visual guide | Exact CSS specs — keep |
| Specific spacing tokens (V40-V43) | Visual guide | Exact CSS specs — keep |
| 7 user personas and critical paths | App patterns | Reference — keep |
| Two-track status workflow (AP15) | App patterns | Design decision — keep |

All internal-only rules are valid and should be retained.

---

## 5. Summary for User Review

### No action needed (already aligned): ~120 rules
Both sources agree. Internal docs are more specific (CSS classes, hex values). External docs provide the "why."

### 2 conflicts requiring user decision:
1. **Domain labels:** External says dot/outline badges. Internal says colored text only. Which wins?
2. **§1.1 semantic colors:** Lists colored badges for Error/Warning/Info but §1.8 says all categorical = neutral gray. Should §1.1 be updated?

### 15 gaps to fill:
External rules not yet captured in internal docs. All are valid principles that should be added.

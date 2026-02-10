# Design Audit: Target Organs

## What this does

Comprehensive design audit of the Target Organs view to verify prior audit compliance, check Hypotheses tab consistency, and ensure cross-view pattern alignment.

## Scope

- **View:** Target Organs (`/studies/:studyId/target-organs`)
- **Components:** `TargetOrgansView.tsx`, `TargetOrgansViewWrapper.tsx`, `TargetOrgansContextPanel.tsx`, related hooks
- **View spec:** `docs/views/target-organs.md`
- **Primary personas:** P1 (Study Director — convergence assessment), P3 (Reg Toxicologist — target organ identification), P7 (Reg Reviewer — evidence verification)
- **Prior audit:** 2026-02-09 — Target Organs deep audit. Already substantially aligned.

## Phase 1: Compliance Audit

### Tab bar consistency (cross-view issue)

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Tab bar active indicator | `border-b-2 border-primary text-foreground` | XD-01 — pending canonical decision | DEFER to Phase 3 |
| Tab padding | `px-4 py-1.5` | XD-02 — pending canonical decision | DEFER to Phase 3 |
| Tab bar bg | `bg-muted/30` | Matches D-R | OK |
| Tab names | "Evidence", "Hypotheses", "Metrics" | CHECK — D-R uses "Evidence", "Hypotheses", "Metrics" too | OK — consistent with D-R |

### Typography gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Rail header | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | Matches `ty.sectionHeaderUpper` | OK |
| Organ header name | `text-sm font-semibold` | OK | OK |
| Metrics table headers | Verify against `ty.tableHeader` | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground` | CHECK in code |
| Domain breakdown table headers | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | Almost matches but `font-medium` instead of `font-semibold` | FIX — change to `font-semibold` to match `ty.tableHeader` |

### Color gaps

| Element | Current | Expected | Action |
|---------|---------|----------|--------|
| Evidence bars | `bg-[#E5E7EB]` track, `bg-[#D1D5DB]` fill | Neutral gray — matches Signals and Histopath | OK |
| Tier dots | `#DC2626` (red), `#D97706` (amber) | Matches design system | OK |
| Domain labels | `getDomainBadgeColor().text` + `text-[9px] font-semibold` | Colored-text-only | OK |
| Evidence panel bg | `bg-muted/5` | XD-03 — should all evidence panels have this? | DEFER |
| Metrics p-value/effect columns | `ev` class (interaction-driven) | XD-05 — matches §1.11 recommendation | OK pending XD-05 resolution |

### Context panel pane ordering

| Current order | Design system priority | Action |
|--------------|----------------------|--------|
| Convergence → Domain coverage → Related Views → Tox Assessment | Insights → Stats → Navigation → Annotation | XD-06 — Tox Assessment after Related Views reverses annotation > navigation priority |

**Decision needed (XD-06):** Move Tox Assessment before Related Views to match design system priority (annotation > navigation). This makes Target Organs consistent with D-R and NOAEL.

### Hypotheses tab consistency

| Element | Target Organs | Dose-Response | Consistent? |
|---------|--------------|---------------|-------------|
| Toolbar bg | `bg-muted/20` | Not specified | CHECK — D-R Hypotheses uses `border-b px-4 py-2` (pill bar) |
| Tool selector | Favorite pills + dropdown | Intent pill bar | DIFFERENT — Target Organs uses favorites/dropdown, D-R uses fixed pill bar. Both are valid but visually different |
| Disclaimer text | Right-aligned italic | Right-aligned italic | OK |
| Tools | 5 organ-level tools | 6 endpoint-level tools | OK — different scope, different tools |

**Decision point (TO-01):** The Hypotheses tab toolbar interaction pattern differs between D-R (fixed pill bar) and Target Organs (favorites + dropdown). This is arguably correct (D-R has 6 fixed tools, TO has 5 with favorites). But the visual language should match. Recommendation: adopt the fixed pill bar pattern for both, with a "+" button for extensibility.

### Empty state audit

| Area | Has empty state? | Action |
|------|-----------------|--------|
| No organ selected | Yes — "Select an organ system..." | OK |
| Rail search no matches | Yes — "No matches for '{search}'" | OK |
| No evidence rows | Yes — "No evidence rows for this organ." | OK |
| Context panel no selection | Yes — "Select an organ system..." | OK |
| Convergence pane empty | Yes — "No convergence rules for this organ." | OK |
| Domain coverage pane empty | Yes — "No endpoints for this organ." | OK |

## Phase 2: Optimization Opportunities

1. **Organ header conclusion** — `deriveOrganConclusion()` is a deterministic sentence. Good for consistency. Could benefit from tooltip explanations of terms like "dose-dependent" vs "dose-trending."
2. **Hypotheses tab** — currently uses viewer placeholders. Low priority to enhance, but verify placeholder styling matches D-R.
3. **Cross-organ coherence hint** — R16 rule extraction is smart but brittle (regex on output_text). Consider making this more robust.
4. **Metrics tab "evidence-driven" color** — uses `ev` class consistently. Good.

## Decision points for user review

| ID | Decision | Recommendation | Rationale |
|----|----------|----------------|-----------|
| TO-01 | Hypotheses toolbar pattern: favorites+dropdown vs fixed pill bar | Adopt fixed pill bar (like D-R) for both views | Visual consistency; favorites add complexity |
| TO-02 | Context panel: move Tox Assessment before Related Views? | Yes | Annotation > navigation per design system priority |
| TO-03 | Domain breakdown table header font-weight | Change `font-medium` to `font-semibold` | Match `ty.tableHeader` token |

## Integration points

- `docs/views/target-organs.md` — view spec (update after audit)
- `frontend/src/components/analysis/TargetOrgansView.tsx`
- `frontend/src/components/analysis/panes/TargetOrgansContextPanel.tsx`
- `frontend/src/lib/design-tokens.ts` — token adoption target

## Acceptance criteria

- Tab bar matches canonical pattern (XD-01)
- Domain breakdown table headers match `ty.tableHeader`
- Context panel pane order corrected (XD-06)
- Hypotheses tab toolbar aligned with D-R pattern
- All empty states verified
- View spec updated

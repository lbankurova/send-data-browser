# Study Summary View — Design Concepts Update

> **ARCHIVED — This design doc is superseded. The implementation diverged from these specs. See `study-summary.md` for the current accurate documentation.** Key differences: the "Key Findings Banner" was implemented as a simpler DecisionBar + StudyStatementsBar; the sex toggle is a dropdown not a segmented control; no color scale legend was implemented; the SelectionLevel type uses separate `selection`/`organSelection` props instead of a `level` field; the Signal Detail Grid is a full Metrics tab, not a toggled panel.

> ~~Append to or replace the Study Summary sections in `pcc-visual-design-guide.md`. This supersedes the current two-tab layout description for the Signals tab.~~

---

## Study Summary: Design Intent

The Study Summary (View 1) serves two simultaneous purposes on one surface:

- **360 view:** Glanceable study-level picture — which organs, how severe, NOAEL, key conclusions
- **Instant drill:** Click anything that catches your eye to get the full story in the context panel

The page is structured as three layers, top to bottom:

### Layer 1: Key Findings Banner (fixed, non-scrolling)

A ~110-145px fixed banner at the top of the Signals tab. Contains two tiers:

**Tier 1 — Rule-driven findings (4-6 statements):**
- Source: `rule_results` filtered to `scope IN ('study', 'organ', 'noael')`, `state = 'emitted'`, sorted by `priority` desc
- Organ-scope rules grouped per organ (e.g., target organ ID + convergence = one compound statement)
- Facts marked with ● (solid dot, tier-colored), warnings with ▲
- Rendering follows rule engine language rules: facts are declarative ("is identified"), warnings use review language ("review," "evaluate")
- Every organ name and endpoint name in a statement is a clickable link → sets selection in the matrix + fires context panel
- `[▸]` arrows scroll to and expand the relevant organ group
- Max 5-6 statements visible; overflow behind "Show N more"
- Findings do NOT change with filter bar — they're study-level conclusions

**Tier 2 — Metrics line:**
```
NOAEL 10 mg/kg (M+F) · 3 targets · 67/142 significant · 23 D-R · 7 domains
```
- Computed from `noael_summary`, `target_organ_summary`, `study_signal_summary`
- Metrics line updates with filters; findings tier does not

### Layer 2: Grouped Signal Matrix (scrollable)

Replaces the current flat heatmap + target organ bar chart with a single organ-grouped collapsible component.

**Organ group headers:**
- One per organ system from `target_organ_summary` (14 total)
- Contains: organ name, evidence score, domain badges, sex indicators (M●/F●), dose-response sparkline, target organ marker, expand/collapse chevron
- Sorted by `EVIDENCE_SCORE` desc
- Clicking header body → organ-level selection → context panel shows organ insights
- Clicking chevron → expand/collapse (layout only)
- Collapsed: ~32px per row. All collapsed = ~448px = one screen

**Endpoint rows (inside expanded groups):**
- Same as current heatmap cells: signal score color background, score text, significance stars
- Sorted by signal score desc within group
- Click cell → endpoint-level selection → context panel shows InsightsList + Stats + Correlations + ToxAssessment
- Dose columns: one per dose group, sorted ascending
- Endpoint labels: left-aligned, sticky, truncated with tooltip

**Default state:** Target organs (`TARGET_ORGAN_FLAG = true`) expanded. All others collapsed.

**Sex toggle:** `[Combined] [M] [F]` segmented control in filter bar. Combined = max across sexes (current behavior). M/F = sex-filtered.

**Color scale legend:** Compact horizontal bar below the matrix header:
```
■ 0–0.2  ■ 0.2–0.4  ■ 0.4–0.6  ■ 0.6–0.8  ■ 0.8–1.0
```
Using exact hex values from §12.3 signal score scale.

**No global endpoint cap.** Organ grouping + collapsibility manages cognitive load. Per-organ cap (top 5-8 with "show more") is optional.

### Layer 3: Context Panel (right sidebar)

Three selection levels, all feeding the same 280px context panel:

**Organ level (new):**
1. **Organ insights** — InsightsList scoped to `organ_{organ_system}` context keys
2. **Contributing endpoints** — compact table of all endpoints in this organ, sorted by signal_score desc. Each row clickable → narrows to endpoint level
3. **Evidence breakdown** — score decomposition, domain count, sex comparison
4. **Navigation** — "View in Target Organs →", "View histopathology →" cross-view links

**Endpoint level (unchanged):**
1. InsightsList (endpoint + organ + study scope)
2. Statistics (signal score, p-value, effect size, trend, direction, etc.)
3. Correlations (other findings in same organ system, clickable)
4. Tox Assessment form (treatment-related, adversity, comment, save)

**No selection:** Brief prompt: "Click an organ group or signal cell to see insights."

### Secondary: Signal Detail Grid (toggled)

The full 12-column TanStack table. Hidden by default behind "Show signal table (N rows)" toggle. Shares `SignalSelection` state. Power-user tool.

---

## Selection State Model

Extends the current `SignalSelectionContext`:

```typescript
type SelectionLevel = 'none' | 'organ' | 'endpoint';

interface SignalSelection {
  level: SelectionLevel;
  organSystem?: string;        // set for organ and endpoint levels
  endpointId?: string;         // set for endpoint level only
  dose?: string;               // set for endpoint level only  
  sex?: string;                // set for endpoint level only
  signalRow?: SignalSummaryRow; // full row data for endpoint level
}
```

Context panel checks `selection.level` and renders the appropriate panes.

---

## Data Sources per Component

| Component | Data | API |
|-----------|------|-----|
| Key Findings (tier 1) | `rule_results` where scope in study/organ/noael | `/api/studies/{id}/analysis/rule_results` |
| Metrics line | `noael_summary` + `target_organ_summary` + counts from `study_signal_summary` | Existing endpoints |
| Organ group headers | `target_organ_summary` (14 rows) + aggregated from `study_signal_summary` | Existing endpoints |
| Sparklines | Computed client-side: max signal_score per dose per organ from `study_signal_summary` | No new endpoint |
| Endpoint cells | `study_signal_summary` grouped by organ_system | Existing endpoint |
| Context panel (organ) | `rule_results` filtered to organ scope + `study_signal_summary` filtered to organ | Existing endpoints |
| Context panel (endpoint) | Same as current — no change | Existing endpoints |

No new API endpoints required. All data already served.

---

## Critical Implementation Notes

1. **The Key Findings banner earns its pixels.** ~110-145px is a lot of fixed space. Every statement must be rule-derived, clickable, and drive the investigation. If a statement doesn't point somewhere, cut it.

2. **Organ group headers must be visually distinct from endpoint rows.** Larger/bolder text, subtle background tint, different row height. The scientist must read them as "summary" not "another data row."

3. **The sparkline in each organ header shows the dose-response shape for the whole organ.** Computed as max(signal_score) per dose across all endpoints in that organ. It's a 4-point line/bar chart, ~60-80px wide.

4. **Expand/collapse is a layout action, not a selection action.** You can select an organ header (context panel shows organ insights) without expanding it. You can expand a group (endpoint rows visible) without selecting the header.

5. **The InsightsList component is called at three scopes now** — study (in the banner logic, for gathering statements), organ (in the organ-level context panel), and endpoint (in the endpoint-level context panel, unchanged). Same component, different filter on `context_key` / `scope`.

6. **Filter bar affects everything except the Key Findings tier 1.** Metrics line, sparklines, endpoint cells, grid — all respect filters. The Key Findings statements are study-level conclusions and don't change when you filter to "pathology only."

# Visual Encoding Strategy

> Working document. Edit freely, then each approved item becomes an implementation task.
> Final version will be promoted to design system docs after all changes land.

---

## Guiding Principles

1. **Dose-response is the central question.** "Does the effect increase with dose?" drives every analytical view.
2. **Color encodes what matters analytically**, not data provenance.
3. **Position > Grouping > Typography > Color.** Color is the last resort, not the first.
4. **Quantitative signals use interaction-driven color** (neutral at rest, colored on hover/select).
5. **Categorical identity stays neutral** unless it's a conclusion (TARGET, NOAEL established).

---

## Primary Personas

| Persona | Primary goal | Key visual needs |
|---------|-------------|-----------------|
| Toxicologist / Study Director | Dose-response assessment, NOAEL, target organs | Instant dose-group orientation, severity progression |
| Regulatory Reviewer (FDA/EMA) | Verify NOAEL, check adversity, data quality | Signal strength at a glance, cross-domain concordance |
| Data Manager / QC | Validation, coding accuracy | Error vs. warning distinction, fix status |

---

## Categorical Dimensions

### 1. Dose Group (control / low / mid / high)

**Analytical importance:** PRIMARY — the independent variable of every study.

**Current state:**
- Color in ECharts only (line series, bar fills, sparklines, legends)
- `getDoseGroupColor(level)`: 0=#6b7280 (gray), 1=#3b82f6 (blue), 2=#f59e0b (amber), 3=#ef4444 (red)
- `badge.dose` token exists but barely used
- Plain text in all tables

**Proposal:** PROMOTE — extend color to tables, dose badges, matrix column headers. The 4-color ramp mirrors dose escalation (neutral → alarming). Use `badge.dose` token consistently.

**Decision:** APPROVE

**Notes:**
<!-- Your edits here -->

---

### 2. Domain (LB, BW, MI, MA, OM, CL, DS, FW)

**Analytical importance:** LOW — data provenance, not analytical reasoning. Toxicologists think "liver enzymes," not "LB domain."

**Current state:**
- 8 unique saturated text colors via `getDomainBadgeColor().text`
- `DomainLabel` component: `text-[9px] font-semibold` + colored text
- `getDomainDotColor()` exists but appears unused in main UI
- Hard rule in CLAUDE.md: "colored text only, no dots/pills/badges"
- Most color-expensive categorical encoding in the system

**Proposal:** DEMOTE — change `DomainLabel` to neutral monospace: `font-mono text-[9px] font-semibold text-muted-foreground`. Codes are already distinctive 2-letter uppercase abbreviations.

**Exception to consider:** In convergence views (Target Organs evidence panel showing LB + OM + MI for same organ), subtle muted tint differentiation may help. Not saturated — think `text-muted-foreground` with a hint.

**Decision:** APPROVE

**Notes:**
<!-- Your edits here -->

---

### 3. Sex (M / F)

**Analytical importance:** SECONDARY — sex stratification matters but "M" and "F" are already instantly recognizable single characters.

**Current state:**
- `getSexColor()`: M=#3b82f6 (blue), F=#ec4899 (pink)
- Used in chart series lines and sex header labels (DoseResponseView)
- NOT color-coded in any table cell or badge
- Plain "M"/"F" text in all tables

**Proposal:** NO CHANGE — keep blue/pink for chart series identity only. Tables stay plain text.

**Optional enhancement:** When sex divergence is detected (existing `sex_divergence` field), a subtle inline indicator could use sex color to show which sex drives the effect. This would be analytical, not identity encoding.

**Decision:** APPROVE

**Notes:**
<!-- Your edits here -->

---

### 4. Treatment Arm (ARMCD)

**Analytical importance:** MINIMAL — in most SEND studies, arm = dose group. ARMCD is a data management identifier.

**Current state:**
- No visual encoding at all
- Plain neutral table in Study Details tab

**Proposal:** NO CHANGE — redundant with dose group encoding.

**Decision:** APPROVE

**Notes:**
<!-- Your edits here -->

---

### 5. Severity Category (adverse / warning / normal)

**Analytical importance:** MEDIUM — adversity classification matters but is already communicated by position, grouping, and the word itself.

**Current state:**
- Tables: neutral gray badges (`bg-gray-100 text-gray-600 border-gray-200`) per hard rule
- Context panels: colored dots via `getSeverityDotColor()` (adverse=#dc2626, warning=#d97706, normal=#16a34a)
- `getSeverityColor()` returns all-gray for all values

**Proposal:** NO CHANGE — neutral in tables prevents alarm fatigue. Colored dots in single-item context panels are correct (they're conclusions, not labels).

**Decision:** MODIFY

**Notes:**
Tables: let's try colored left border. Context panel - font color 

---

### 6. Dose-Response Pattern (monotonic_increase, threshold, flat, etc.)

**Analytical importance:** MEDIUM — pattern classification is analytically meaningful but secondary to the raw data.

**Current state:**
- All patterns use same neutral gray pill (`bg-gray-100 text-gray-600`)
- No visual differentiation between patterns
- `PATTERN_LABELS` and `PATTERN_BG` in DoseResponseView

**Proposal:** NO CHANGE — the pattern label text is sufficient. Color here would be redundant with dose-group color and signal score.

**Decision:** APPROVE

**Notes:**
<!-- Your edits here -->

---

### 7. Dose Consistency (Weak / Moderate / Strong)

**Analytical importance:** MEDIUM — tells the toxicologist how reliable the dose-response pattern is.

**Current state:**
- Plain text only in organ rails
- No visual differentiation

**Proposal:** ADD TYPOGRAPHY ENCODING — encode via font-weight (preserves color budget):
- Strong → `font-semibold`
- Moderate → `font-medium`
- Weak → normal weight

Consistent with existing "typography encodes strength" pattern used for p-values and effect sizes.

**Decision:** APPROVE

**Notes:**
May need to replace with icons but ok for now

---

### 8. Pipeline Stage (submitted / pre_submission / ongoing / planned)

**Analytical importance:** LOW — landing page only, not in analytical views.

**Current state:**
- `getPipelineStageColor()`: green/blue/amber/purple text
- Landing page study cards only

**Proposal:** NO CHANGE — low impact, isolated to landing page.

**Decision:** APPROVE

**Notes:**
<!-- Your edits here -->

---

## Conclusion Indicators (Tier 1 — always colored at rest)

### 9. TARGET Organ Flag

**Current state:** `text-[#DC2626] text-[9px] font-semibold uppercase` — "TARGET" label, sorted to top of rails.

**Proposal:** NO CHANGE — correct as Tier 1 conclusion.

**Decision:** APPROVE

---

### 10. NOAEL Established (yes / no)

**Current state:** `bg-green-100 text-green-700` (established) vs `bg-red-100 text-red-700` (not established).

**Proposal:** NO CHANGE — this is a binary study conclusion, not categorical identity. Green/red is appropriate.

**Decision:** MODIFY

**Notes:**
Use font color - not badges, pills, or chips

---

### 11. Insight Tier (Critical / Notable / Observed)

**Current state:** Critical=#DC2626, Notable=#D97706, Observed=muted-foreground.

**Proposal:** NO CHANGE — Tier 1 conclusion indicators.

**Decision:** APPROVE

---

## Quantitative / Signal Dimensions

### 12. P-value

**Current state:** Interaction-driven via `.ev` CSS class. Neutral at rest, #DC2626 on hover/select. Font-weight encodes strength (semibold < 0.001, medium < 0.01). Always `font-mono`.

**Proposal:** NO CHANGE.

**Decision:** APPROVE

---

### 13. Effect Size |d|

**Current state:** Same interaction-driven pattern as p-value. `font-semibold` when |d| >= 0.8.

**Proposal:** NO CHANGE.

**Decision:** APPROVE

---

### 14. Signal Score (heatmaps)

**Current state:** `getNeutralHeatColor()` 5-step gray ramp for matrices. `getSignalScoreHeatmapColor()` colored ramp available but not used in main views.

**Proposal:** NO CHANGE.

**Decision:** APPROVE

---

### 15. NOAEL Confidence

**Current state:** Text color — green >= 0.8, amber >= 0.6, red below.

**Proposal:** NO CHANGE.

**Decision:** APPROVE

---

### 16. Direction (up / down)

**Current state:** ↑/↓ symbols. `getDirectionColor()`: up=text-red-500, down=text-blue-500.

**Proposal:** NO CHANGE.

**Decision:** APPROVE

---

### 17. Incidence

**Current state:** Background opacity ramp via `getIncidenceColor()`. Red/orange/yellow at 0.8/0.5/0.2 thresholds.

**Proposal:** NO CHANGE.

**Decision:** APPROVE

---

## Interaction & State Encoding

### 18. Selection State

**Current:** `bg-accent` / `bg-blue-50/60` for selected rows/rail items. `border-l-blue-500` for selected organ in NOAEL view.

**Proposal:** NO CHANGE.

**Decision:** MODIFY - SEE LATEST CODEBASE FOR RAILS

---

### 19. Evidence on Interaction (.ev class)

**Current:** CSS rule — neutral at rest, `#DC2626` on `tr:hover` / `tr[data-selected]`.

**Proposal:** NO CHANGE.

**Decision:** APPROVE
---

### 20. Validation Status (pass / warning / fail)

**Current:** `validationIcon` — green/amber/red icon color. Badges in tables are neutral gray.

**Proposal:** NO CHANGE.

**Decision:** APPROVE
---

## Implementation Order

> Fill in priority after review. Each approved item becomes a separate task.
> We implement one at a time to evaluate visual impact before proceeding.

| # | Change | Priority | Status |
|---|--------|----------|--------|
| 1 | Dose group: extend color to tables/badges/headers | | |
| 2 | Domain: demote to neutral monospace | | |
| 3 | Dose consistency: add font-weight encoding | | |
| 4 | (other approved changes) | | |

/**
 * Persona-Driven Visualization Scoring Engine
 *
 * Computes the optimal visualization mix for the dose-response view using a
 * 22-question × 22-viz scoring matrix driven by 7 persona weights.
 *
 * Key features:
 *   - Per-persona importance scores (0-10) for 22 regulatory questions
 *   - Regulatory blockers (NOAEL, reversibility, adversity) with 0.5x penalties
 *   - Best-viz discrimination (best answerer gets 1.0, others get 0.3)
 *   - Data profile distribution modeling (4 endpoint types weighted by prevalence)
 *   - Temporal boost (1.4x) and Q19 minimum (0.7x) penalties
 *   - Score-per-pixel efficiency tracking
 *   - Datagrok migration targets for layout comparison
 */

// ─── Types ──────────────────────────────────────────────────

export type PersonaId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7";

export type QuestionId =
  | "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8"
  | "Q9" | "Q10" | "Q11" | "Q12" | "Q13" | "Q14" | "Q15" | "Q16"
  | "Q17" | "Q18" | "Q19" | "Q20" | "Q21" | "Q22";

export type VizId =
  | "dr-line" | "dr-bar" | "time-course" | "volcano"
  | "pairwise-table" | "metrics-grid" | "noael-ref"
  | "shape-explorer" | "causality"
  | "insights-pane" | "stats-pane" | "correlations-pane" | "assessment-pane" | "related-pane"
  | "dg-scatter" | "dg-box" | "dg-trellis" | "dg-correlation"
  | "dg-pc" | "dg-histogram" | "dg-group" | "dg-grid";

export type SlotId =
  | "chart" | "overlay" | "temporal" | "scanning" | "table"
  | "rail" | "insights" | "stats" | "correlations" | "assessment" | "related"
  | "dg-primary" | "dg-secondary" | "dg-tertiary";

export type Platform = "recharts" | "custom" | "panel" | "datagrok";

export type TargetPlatform = "recharts" | "datagrok";

export type LayoutConfig = Partial<Record<SlotId, VizId>>;

export interface VizEntry {
  label: string;
  /** Answer quality per question (0-1) */
  a: Partial<Record<QuestionId, number>>;
  /** Data needs: tc = time-course, noael = NOAEL, rec = recovery */
  n?: Partial<Record<string, number>>;
  /** Relative pixel cost (0 = overlay, 2 = full grid) */
  px: number;
  platform: Platform;
  slots: SlotId[];
  excludes?: VizId[];
  dgViewer?: string;
}

export interface ScoreResult {
  score: number;
  px: number;
  spp: number;
}

export interface LayoutOptions {
  dataType: "continuous" | "categorical";
  hasTemporal: boolean;
  hasNoael: boolean;
  hasRecovery: boolean;
  target?: TargetPlatform;
}

export interface LayoutResult {
  config: LayoutConfig;
  score: number;
  px: number;
  spp: number;
  alternatives: LayoutConfig[];
}

export interface CoverageResult {
  covered: { q: QuestionId; bestViz: VizId; quality: number }[];
  gaps: { q: QuestionId; label: string; importance: number }[];
  coveragePercent: number;
  blockersCovered: boolean;
}

export interface CompareResult {
  recharts: LayoutResult;
  datagrok: LayoutResult;
  improvement: number;
}

// ─── Scoring Matrices ───────────────────────────────────────

export const PERSONAS: Record<PersonaId, { name: string; weight: number }> = {
  P1: { name: "Study Director",          weight: 0.24 },
  P2: { name: "Pathologist",             weight: 0.10 },
  P3: { name: "Regulatory Toxicologist", weight: 0.19 },
  P4: { name: "Data Manager",            weight: 0.00 },
  P5: { name: "Biostatistician",         weight: 0.24 },
  P6: { name: "QA Auditor",              weight: 0.05 },
  P7: { name: "Regulatory Reviewer",     weight: 0.19 },
};

export const QUESTIONS: Record<QuestionId, { label: string; p: Partial<Record<PersonaId, number>> }> = {
  Q1:  { label: "Is the finding dose-dependent?",                       p: { P1:10, P2:5,  P3:8,  P5:6,  P6:1,  P7:9  } },
  Q2:  { label: "What is the dose-response shape?",                     p: { P1:8,  P2:3,  P3:5,  P5:8,         P7:6  } },
  Q3:  { label: "Does the effect reverse during recovery?",             p: { P1:8,  P2:4,  P3:9,  P5:3,         P7:7  } },
  Q4:  { label: "When does the effect first appear?",                   p: { P1:10, P2:3,  P3:6,  P5:7,         P7:8  } },
  Q5:  { label: "Is the NOAEL justified?",                              p: { P1:9,  P2:3,  P3:10, P5:5,  P6:2,  P7:10 } },
  Q6:  { label: "Do multiple domains show the same finding?",           p: { P1:10, P2:7,  P3:9,  P5:5,         P7:8  } },
  Q7:  { label: "Stat significant but bio irrelevant (or vice versa)?", p: { P1:7,  P2:2,  P3:5,  P5:10,        P7:6  } },
  Q8:  { label: "Is the sex difference meaningful?",                    p: { P1:7,  P2:4,  P3:5,  P5:4,         P7:5  } },
  Q9:  { label: "What has already been concluded?",                     p: { P1:10, P2:3,  P3:7,  P5:7,  P6:1,  P7:10 } },
  Q10: { label: "Bradford Hill weight of evidence?",                    p: { P1:4,  P2:2,  P3:4,  P5:10,        P7:6  } },
  Q11: { label: "Does the dose-response model fit?",                    p: { P1:6,  P2:2,  P3:5,  P5:10,        P7:6  } },
  Q12: { label: "What is the effect magnitude at each dose?",           p: { P1:7,  P2:2,  P3:4,  P5:8,         P7:5  } },
  Q13: { label: "Is the multiple comparison correction appropriate?",   p: { P1:4,  P2:2,  P3:3,  P5:9,         P7:4  } },
  Q14: { label: "Do statistical assumptions hold?",                     p: { P1:5,  P2:3,  P3:4,  P5:10,        P7:6  } },
  Q15: { label: "How does the effect progress over time?",              p: { P1:5,  P2:2,  P3:3,  P5:7,         P7:5  } },
  Q16: { label: "Is the statistical method appropriate?",               p: { P1:4,  P2:2,  P3:3,  P5:9,         P7:4  } },
  Q17: { label: "Is this finding adverse?",                             p: { P1:9,  P2:6,  P3:8,  P5:3,  P6:3,  P7:9  } },
  Q18: { label: "Is regulatory documentation complete?",                p: { P1:6,  P2:4,  P3:9,  P5:3,  P6:8,  P7:10 } },
  Q19: { label: "Does microscopy confirm the clinical finding?",        p: { P1:5,  P2:10, P3:4,  P5:2,         P7:4  } },
  Q20: { label: "Is the data complete and reliable?",                   p: { P1:5,  P2:5,  P3:4,  P5:6,         P7:7  } },
  Q21: { label: "Is the audit trail complete?",                         p: { P1:3,  P2:2,  P3:3,  P5:1,  P6:10, P7:5  } },
  Q22: { label: "What is the review completion status?",                p: { P1:4,  P2:2,  P3:5,  P5:1,  P6:9,  P7:4  } },
};

export const DATA_PROFILES: Record<string, { w: number; tc: boolean; rec: boolean }> = {
  D1: { w: 0.40, tc: true,  rec: true  },
  D2: { w: 0.30, tc: true,  rec: false },
  D3: { w: 0.15, tc: false, rec: false },
  D4: { w: 0.15, tc: false, rec: false },
};

export const BLOCKERS: Partial<Record<QuestionId, number>> = {
  Q5:  0.6,
  Q3:  0.5,
  Q17: 0.6,
};

export const TEMPORAL_QS: QuestionId[] = ["Q3", "Q4", "Q15"];
export const Q19_MIN = 0.6;

// ─── Visualization Catalog ──────────────────────────────────

export const VIZ_CATALOG: Record<VizId, VizEntry> = {
  "dr-line": {
    label: "Dose-response line chart",
    a: { Q1: 0.9, Q2: 0.9, Q5: 0.6, Q8: 0.5, Q12: 0.8 },
    px: 1.0,
    platform: "recharts",
    slots: ["chart"],
    excludes: ["dr-bar"],
  },
  "dr-bar": {
    label: "Incidence bar chart",
    a: { Q1: 0.8, Q2: 0.5, Q8: 0.4, Q12: 0.6 },
    px: 1.0,
    platform: "recharts",
    slots: ["chart"],
    excludes: ["dr-line"],
  },
  "time-course": {
    label: "Time-course line chart",
    a: { Q3: 0.9, Q4: 1.0, Q15: 0.9, Q1: 0.4 },
    n: { tc: 0.8 },
    px: 1.2,
    platform: "recharts",
    slots: ["temporal"],
  },
  "volcano": {
    label: "Volcano scatter (effect vs. significance)",
    a: { Q7: 1.0, Q1: 0.3, Q6: 0.4, Q17: 0.4 },
    px: 1.3,
    platform: "recharts",
    slots: ["scanning"],
  },
  "pairwise-table": {
    label: "Pairwise comparison table",
    a: { Q5: 0.8, Q12: 0.7, Q13: 0.6, Q14: 0.5, Q16: 0.5, Q20: 0.6 },
    px: 0.6,
    platform: "custom",
    slots: ["table"],
  },
  "metrics-grid": {
    label: "Metrics data grid",
    a: { Q20: 0.9, Q16: 0.7, Q14: 0.6, Q18: 0.5 },
    px: 2.0,
    platform: "custom",
    slots: ["table"],
  },
  "noael-ref": {
    label: "NOAEL reference line overlay",
    a: { Q5: 0.9 },
    n: { noael: 0.9 },
    px: 0.0,
    platform: "recharts",
    slots: ["overlay"],
  },
  "shape-explorer": {
    label: "Dose-response model fit explorer",
    a: { Q2: 0.9, Q11: 0.8, Q1: 0.5 },
    px: 1.5,
    platform: "datagrok",
    slots: ["dg-primary"],
  },
  "causality": {
    label: "Bradford Hill causality assessment",
    a: { Q10: 1.0, Q17: 0.7, Q9: 0.6, Q18: 0.5 },
    px: 2.0,
    platform: "custom",
    slots: ["table"],
  },
  "insights-pane": {
    label: "Insights synthesis pane",
    a: { Q9: 0.9, Q17: 0.5, Q6: 0.4 },
    px: 0.4,
    platform: "panel",
    slots: ["insights"],
  },
  "stats-pane": {
    label: "Statistical summary pane",
    a: { Q12: 0.5, Q1: 0.4, Q17: 0.4 },
    px: 0.3,
    platform: "panel",
    slots: ["stats"],
  },
  "correlations-pane": {
    label: "Cross-domain correlations pane",
    a: { Q6: 0.9, Q19: 0.5 },
    px: 0.4,
    platform: "panel",
    slots: ["correlations"],
  },
  "assessment-pane": {
    label: "Assessment & review pane",
    a: { Q9: 0.8, Q18: 0.7, Q17: 0.6, Q22: 0.8, Q21: 0.6 },
    px: 0.5,
    platform: "panel",
    slots: ["assessment"],
  },
  "related-pane": {
    label: "Related findings pane",
    a: { Q6: 0.3, Q19: 0.3 },
    px: 0.2,
    platform: "panel",
    slots: ["related"],
  },
  "dg-scatter": {
    label: "Datagrok scatter plot",
    a: { Q7: 1.0, Q6: 0.6, Q12: 0.5, Q1: 0.5 },
    px: 1.3,
    platform: "datagrok",
    slots: ["dg-primary", "dg-secondary"],
    dgViewer: "Scatterplot",
  },
  "dg-box": {
    label: "Datagrok box plot",
    a: { Q14: 0.9, Q8: 0.8, Q1: 0.7, Q12: 0.6 },
    px: 1.0,
    platform: "datagrok",
    slots: ["dg-primary", "dg-secondary"],
    dgViewer: "Box plot",
  },
  "dg-trellis": {
    label: "Datagrok trellis plot",
    a: { Q8: 0.9, Q6: 0.8, Q1: 0.5 },
    px: 1.5,
    platform: "datagrok",
    slots: ["dg-primary", "dg-secondary"],
    dgViewer: "Trellis plot",
  },
  "dg-correlation": {
    label: "Datagrok correlation matrix",
    a: { Q6: 1.0, Q19: 0.7 },
    px: 1.2,
    platform: "datagrok",
    slots: ["dg-secondary", "dg-tertiary"],
    dgViewer: "Correlation plot",
  },
  "dg-pc": {
    label: "Datagrok parallel coordinates",
    a: { Q6: 0.7, Q7: 0.5, Q8: 0.4 },
    px: 1.5,
    platform: "datagrok",
    slots: ["dg-secondary", "dg-tertiary"],
    dgViewer: "PC plot",
  },
  "dg-histogram": {
    label: "Datagrok distribution histogram",
    a: { Q14: 0.8, Q2: 0.3, Q8: 0.3 },
    px: 0.8,
    platform: "datagrok",
    slots: ["dg-secondary", "dg-tertiary"],
    dgViewer: "Histogram",
  },
  "dg-group": {
    label: "Datagrok group analysis",
    a: { Q13: 0.9, Q16: 0.8, Q14: 0.7, Q1: 0.5 },
    px: 1.0,
    platform: "datagrok",
    slots: ["dg-primary", "dg-secondary"],
    dgViewer: "Group Analysis",
  },
  "dg-grid": {
    label: "Datagrok data grid",
    a: { Q20: 1.0, Q16: 0.8, Q14: 0.7, Q18: 0.6 },
    px: 2.0,
    platform: "datagrok",
    slots: ["dg-primary"],
    dgViewer: "Grid",
  },
};

// ─── Scoring Engine ─────────────────────────────────────────

const QUESTION_IDS = Object.keys(QUESTIONS) as QuestionId[];

/** Data-availability weighted capability for a viz across the study distribution. */
function avail(vid: VizId, V: Partial<Record<VizId, VizEntry>>): number {
  const v = V[vid];
  if (!v) return 0;
  let total = 0;
  for (const dp of Object.values(DATA_PROFILES)) {
    let c = 1;
    const tcNeed = v.n?.tc;
    if (tcNeed != null && !dp.tc) c *= (1 - tcNeed);
    const recNeed = v.n?.rec;
    if (recNeed != null && !dp.rec) c *= (1 - recNeed);
    total += dp.w * c;
  }
  return total;
}

/** Best question coverage map across all vizzes in a config. */
function qCov(cfg: LayoutConfig, V: Partial<Record<VizId, VizEntry>>): Partial<Record<QuestionId, number>> {
  const ids = Object.values(cfg).filter((v): v is VizId => v != null);
  const c: Partial<Record<QuestionId, number>> = {};
  for (const q of QUESTION_IDS) {
    let best = 0;
    for (const id of ids) {
      const quality = V[id]?.a?.[q];
      if (quality != null && quality > best) best = quality;
    }
    if (best > 0) c[q] = best;
  }
  return c;
}

/** Multiplicative penalty for uncovered regulatory blocker questions. */
function blockerPenalty(cfg: LayoutConfig, V: Partial<Record<VizId, VizEntry>>): number {
  const cov = qCov(cfg, V);
  let penalty = 1;
  for (const [q, min] of Object.entries(BLOCKERS) as [QuestionId, number][]) {
    if ((cov[q] ?? 0) < min) penalty *= 0.5;
  }
  return penalty;
}

/** Penalty when histopathology confirmation (Q19) is under-covered. */
function q19Penalty(cfg: LayoutConfig, V: Partial<Record<VizId, VizEntry>>): number {
  const cov = qCov(cfg, V);
  return (cov.Q19 ?? 0) >= Q19_MIN ? 1 : 0.7;
}

/**
 * Main scoring function. Computes weighted persona × question score with
 * best-viz discrimination, temporal boost, and regulatory penalties.
 */
export function score(
  cfg: LayoutConfig,
  V: Partial<Record<VizId, VizEntry>> = VIZ_CATALOG,
): ScoreResult {
  const ids = Object.values(cfg).filter((v): v is VizId => v != null);

  // Best-per-question map: for each question, the highest quality across all vizzes
  const qb: Partial<Record<QuestionId, number>> = {};
  for (const id of ids) {
    const v = V[id];
    if (!v) continue;
    for (const [q, qual] of Object.entries(v.a) as [QuestionId, number][]) {
      if (!qb[q] || qual > qb[q]!) qb[q] = qual;
    }
  }

  let totalScore = 0;
  let totalPx = 0;

  for (const id of ids) {
    const v = V[id];
    if (!v) continue;

    const av = avail(id as VizId, V);
    let vizScore = 0;

    for (const [pid, per] of Object.entries(PERSONAS) as [PersonaId, { name: string; weight: number }][]) {
      if (!per.weight) continue;

      let personaScore = 0;
      for (const [q, qual] of Object.entries(v.a) as [QuestionId, number][]) {
        const qd = QUESTIONS[q];
        if (!qd) continue;

        let w = qd.p[pid] ?? 0;

        // Temporal boost when recovery data exists in the study distribution
        for (const dp of Object.values(DATA_PROFILES)) {
          if (dp.rec && TEMPORAL_QS.includes(q)) {
            w *= 1.4;
            break;
          }
        }

        // Best-viz discrimination: only the best answerer gets full credit
        const discrimination = qual >= (qb[q] ?? 0) ? 1 : 0.3;
        personaScore += qual * w * discrimination;
      }

      vizScore += per.weight * personaScore;
    }

    totalScore += vizScore * av;
    totalPx += v.px;
  }

  const bp = blockerPenalty(cfg, V);
  const q19p = q19Penalty(cfg, V);
  const finalScore = totalScore * bp * q19p;

  return {
    score: finalScore,
    px: totalPx,
    spp: totalPx > 0 ? finalScore / totalPx : 0,
  };
}

// ─── Layout Search ──────────────────────────────────────────

/**
 * Exhaustive search over valid slot combinations to find the optimal layout.
 * Deterministic slots (chart, overlay, panels) are fixed; optional slots
 * (temporal, scanning, table, DG viewers) are enumerated.
 */
export function findOptimalLayout(options: LayoutOptions): LayoutResult {
  const { dataType, hasTemporal, hasNoael, target = "recharts" } = options;

  // Base config: deterministic slots
  const base: LayoutConfig = {};
  base.chart = dataType === "continuous" ? "dr-line" : "dr-bar";
  if (hasNoael) base.overlay = "noael-ref";
  base.insights = "insights-pane";
  base.stats = "stats-pane";
  base.correlations = "correlations-pane";
  base.assessment = "assessment-pane";
  base.related = "related-pane";

  // Variable slots with candidates
  const varSlots: { slot: SlotId; options: (VizId | null)[] }[] = [];

  if (hasTemporal) {
    varSlots.push({ slot: "temporal", options: ["time-course", null] });
  }
  varSlots.push({ slot: "scanning", options: ["volcano", null] });
  varSlots.push({ slot: "table", options: ["pairwise-table", "metrics-grid", "causality", null] });

  if (target === "datagrok") {
    const dgBySlot = (slot: SlotId) =>
      (Object.entries(VIZ_CATALOG) as [VizId, VizEntry][])
        .filter(([, v]) => v.platform === "datagrok" && v.slots.includes(slot))
        .map(([id]) => id);
    varSlots.push({ slot: "dg-primary", options: [...dgBySlot("dg-primary"), null] });
    varSlots.push({ slot: "dg-secondary", options: [...dgBySlot("dg-secondary"), null] });
    varSlots.push({ slot: "dg-tertiary", options: [...dgBySlot("dg-tertiary"), null] });
  }

  // Track best and top alternatives
  let bestResult: ScoreResult = { score: -Infinity, px: 0, spp: 0 };
  let bestConfig: LayoutConfig = base;
  const topN: { config: LayoutConfig; result: ScoreResult }[] = [];

  function recordResult(config: LayoutConfig, result: ScoreResult) {
    if (result.score > bestResult.score) {
      if (bestResult.score > -Infinity) {
        topN.push({ config: bestConfig, result: bestResult });
      }
      bestResult = result;
      bestConfig = { ...config };
    } else {
      topN.push({ config: { ...config }, result });
    }
  }

  function enumerate(idx: number, current: LayoutConfig, used: Set<VizId>) {
    if (idx >= varSlots.length) {
      recordResult(current, score(current));
      return;
    }
    const { slot, options: candidates } = varSlots[idx];
    for (const vizId of candidates) {
      if (vizId == null) {
        enumerate(idx + 1, current, used);
        continue;
      }
      if (used.has(vizId)) continue;
      const entry = VIZ_CATALOG[vizId];
      if (entry.excludes?.some(ex => used.has(ex as VizId))) continue;
      used.add(vizId);
      current[slot] = vizId;
      enumerate(idx + 1, current, used);
      delete current[slot];
      used.delete(vizId);
    }
  }

  const usedBase = new Set(
    Object.values(base).filter((v): v is VizId => v != null),
  );
  enumerate(0, { ...base }, usedBase);

  topN.sort((a, b) => b.result.score - a.result.score);

  return {
    config: bestConfig,
    score: bestResult.score,
    px: bestResult.px,
    spp: bestResult.spp,
    alternatives: topN.slice(0, 5).map(t => t.config),
  };
}

// ─── Analysis Utilities ─────────────────────────────────────

/** Gap analysis: which questions are covered and which are missing. */
export function analyzeCoverage(
  cfg: LayoutConfig,
  V: Partial<Record<VizId, VizEntry>> = VIZ_CATALOG,
): CoverageResult {
  const ids = Object.values(cfg).filter((v): v is VizId => v != null);
  const covered: CoverageResult["covered"] = [];
  const gaps: CoverageResult["gaps"] = [];

  for (const q of QUESTION_IDS) {
    let bestQual = 0;
    let bestViz: VizId = "dr-line";
    for (const id of ids) {
      const quality = V[id]?.a?.[q];
      if (quality != null && quality > bestQual) {
        bestQual = quality;
        bestViz = id;
      }
    }
    if (bestQual > 0) {
      covered.push({ q, bestViz, quality: bestQual });
    } else {
      // Compute importance as max persona weight × importance across all personas
      let importance = 0;
      const qd = QUESTIONS[q];
      for (const [pid, w] of Object.entries(qd.p) as [PersonaId, number][]) {
        importance = Math.max(importance, PERSONAS[pid].weight * w);
      }
      gaps.push({ q, label: qd.label, importance });
    }
  }

  const blockersCovered = (Object.entries(BLOCKERS) as [QuestionId, number][])
    .every(([q, min]) => {
      const c = covered.find(item => item.q === q);
      return c != null && c.quality >= min;
    });

  return {
    covered,
    gaps: gaps.sort((a, b) => b.importance - a.importance),
    coveragePercent: QUESTION_IDS.length > 0
      ? (covered.length / QUESTION_IDS.length) * 100
      : 100,
    blockersCovered,
  };
}

/** Human-readable diagnostic report for a layout configuration. */
export function diagnosticReport(options: LayoutOptions): string {
  const result = findOptimalLayout(options);
  const coverage = analyzeCoverage(result.config);
  const lines: string[] = [];

  lines.push(`=== Viz Optimizer: ${options.target ?? "recharts"} ===`);
  lines.push(`Data: ${options.dataType}, temporal=${options.hasTemporal}, noael=${options.hasNoael}, recovery=${options.hasRecovery}`);
  lines.push(`Score: ${result.score.toFixed(1)}  Pixels: ${result.px.toFixed(1)}  SPP: ${result.spp.toFixed(2)}`);
  lines.push("");

  lines.push("Layout:");
  for (const [slot, vizId] of Object.entries(result.config) as [SlotId, VizId][]) {
    const v = VIZ_CATALOG[vizId];
    if (v) {
      lines.push(`  [${slot.padEnd(14)}] ${v.label} (${v.platform}, ${v.px}px)`);
    }
  }
  lines.push("");

  lines.push(`Coverage: ${coverage.coveragePercent.toFixed(0)}% (${coverage.covered.length}/${QUESTION_IDS.length})`);
  lines.push(`Blockers: ${coverage.blockersCovered ? "ALL COVERED" : "GAPS — penalty applied"}`);

  if (coverage.gaps.length > 0) {
    lines.push("");
    lines.push("Gaps:");
    for (const gap of coverage.gaps.slice(0, 5)) {
      lines.push(`  ${gap.q}: ${gap.label} (importance: ${gap.importance.toFixed(2)})`);
    }
  }

  if (result.alternatives.length > 0) {
    lines.push("");
    lines.push(`Alternatives: ${result.alternatives.length} configs scored`);
  }

  return lines.join("\n");
}

/** Side-by-side comparison of Recharts (current) vs Datagrok (migration) layouts. */
export function compareLayouts(options: Omit<LayoutOptions, "target">): CompareResult {
  const recharts = findOptimalLayout({ ...options, target: "recharts" });
  const datagrok = findOptimalLayout({ ...options, target: "datagrok" });
  const improvement = recharts.score > 0
    ? ((datagrok.score - recharts.score) / recharts.score) * 100
    : 0;
  return { recharts, datagrok, improvement };
}

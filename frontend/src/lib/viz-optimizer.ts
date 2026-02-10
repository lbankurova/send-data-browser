/**
 * Visualization Mix Optimizer
 *
 * Computes the optimal combination of visualizations for each view context,
 * driven by persona-question scoring matrices. Used to determine what charts,
 * tables, and overlays to render for any given endpoint/view combination.
 *
 * Architecture:
 *   Input:  view type + endpoint data characteristics
 *   Output: ranked list of visualization recommendations with DG viewer mapping
 *
 * The algorithm:
 *   1. Identify active personas (utility >= 3 for this view)
 *   2. Collect their questions (Q1-Q10)
 *   3. Score each viz type by question coverage × persona weight
 *   4. Greedy selection with redundancy penalty (diminishing returns)
 *   5. Map to layout slots (primary / secondary / tertiary / overlay)
 *   6. Provide Datagrok viewer configuration for migration
 */

// ─── Types ──────────────────────────────────────────────────

export type ViewType =
  | "study-summary"
  | "dose-response"
  | "target-organs"
  | "histopathology"
  | "noael-decision"
  | "adverse-effects"
  | "validation";

export type VizType =
  | "line-chart"
  | "bar-chart"
  | "box-plot"
  | "scatter-volcano"
  | "scatter-xy"
  | "time-course"
  | "heatmap"
  | "trellis-box"
  | "pc-plot"
  | "correlation"
  | "table-grid"
  | "reference-overlay"
  | "histogram"
  | "density"
  | "group-analysis";

export type DGViewerType =
  | "Scatterplot"
  | "Line chart"
  | "Bar chart"
  | "Box plot"
  | "Heatmap"
  | "Trellis plot"
  | "PC plot"
  | "Correlation plot"
  | "Histogram"
  | "Density plot"
  | "Grid"
  | "Group Analysis";

export type QuestionId =
  | "Q1"
  | "Q2"
  | "Q3"
  | "Q4"
  | "Q5"
  | "Q6"
  | "Q7"
  | "Q8"
  | "Q9"
  | "Q10";

export type PersonaId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7";

export type LayoutSlot = "primary" | "secondary" | "tertiary" | "overlay" | "scanning";

// ─── Scoring Matrices ───────────────────────────────────────

/**
 * Question weights: frequency × criticality.
 * Derived from persona gap analysis (Q1-Q10).
 * Frequency: how often the question is asked (0-1).
 * Criticality: how important the answer is for regulatory decisions (0-1).
 */
export const QUESTION_WEIGHTS: Record<QuestionId, { frequency: number; criticality: number; label: string }> = {
  Q1:  { frequency: 1.0, criticality: 1.0, label: "Is the finding dose-dependent?" },
  Q2:  { frequency: 1.0, criticality: 1.0, label: "What is the dose-response shape?" },
  Q3:  { frequency: 1.0, criticality: 1.0, label: "Are the statistics correct?" },
  Q4:  { frequency: 0.7, criticality: 0.8, label: "When did it appear / does it progress?" },
  Q5:  { frequency: 0.5, criticality: 1.0, label: "Is there an effect at NOAEL dose?" },
  Q6:  { frequency: 0.6, criticality: 0.8, label: "Do other domains show the same in this organ?" },
  Q7:  { frequency: 0.4, criticality: 0.8, label: "Stat significant but bio irrelevant (or vice versa)?" },
  Q8:  { frequency: 0.6, criticality: 0.6, label: "Is the sex difference meaningful?" },
  Q9:  { frequency: 0.7, criticality: 0.6, label: "What has already been concluded?" },
  Q10: { frequency: 0.3, criticality: 0.6, label: "Bradford Hill weight of evidence?" },
};

/**
 * Viz → Question utility: how well each viz type answers each question (0-1).
 * Higher = the viz is a better fit for answering that question.
 */
export const VIZ_QUESTION_UTILITY: Record<VizType, Partial<Record<QuestionId, number>>> = {
  "line-chart":        { Q1: 0.9, Q2: 0.9, Q5: 0.6, Q8: 0.5 },
  "bar-chart":         { Q1: 0.8, Q2: 0.5 },
  "box-plot":          { Q1: 0.7, Q2: 0.6, Q3: 0.8, Q8: 0.7 },
  "scatter-volcano":   { Q7: 1.0, Q1: 0.3 },
  "scatter-xy":        { Q1: 0.5, Q7: 0.7 },
  "time-course":       { Q4: 1.0, Q1: 0.4 },
  "heatmap":           { Q6: 0.8, Q8: 0.7, Q1: 0.3 },
  "trellis-box":       { Q6: 0.7, Q8: 0.8, Q1: 0.4 },
  "pc-plot":           { Q6: 0.6, Q7: 0.5 },
  "correlation":       { Q6: 0.9, Q8: 0.3 },
  "table-grid":        { Q3: 1.0, Q5: 0.5, Q9: 0.3 },
  "reference-overlay": { Q5: 0.9 },
  "histogram":         { Q3: 0.4, Q2: 0.3 },
  "density":           { Q2: 0.4, Q8: 0.3 },
  "group-analysis":    { Q3: 0.7, Q1: 0.5, Q8: 0.6 },
};

/**
 * View → Persona utility matrix (0-5 scale).
 * 5 = primary workspace, 0 = irrelevant.
 */
export const VIEW_PERSONA_UTILITY: Record<ViewType, Record<PersonaId, number>> = {
  "study-summary":   { P1: 5, P2: 3, P3: 5, P4: 1, P5: 3, P6: 2, P7: 5 },
  "dose-response":   { P1: 5, P2: 2, P3: 4, P4: 0, P5: 5, P6: 1, P7: 4 },
  "target-organs":   { P1: 4, P2: 3, P3: 5, P4: 0, P5: 2, P6: 1, P7: 5 },
  "histopathology":  { P1: 4, P2: 5, P3: 3, P4: 0, P5: 1, P6: 2, P7: 4 },
  "noael-decision":  { P1: 5, P2: 3, P3: 5, P4: 0, P5: 3, P6: 2, P7: 5 },
  "adverse-effects": { P1: 3, P2: 2, P3: 3, P4: 1, P5: 3, P6: 1, P7: 3 },
  "validation":      { P1: 2, P2: 0, P3: 2, P4: 5, P5: 0, P6: 5, P7: 3 },
};

/**
 * Persona → Questions they ask.
 */
export const PERSONA_QUESTIONS: Record<PersonaId, QuestionId[]> = {
  P1: ["Q1", "Q2", "Q4", "Q5", "Q6", "Q10"],
  P2: ["Q6"],
  P3: ["Q1", "Q5", "Q9"],
  P4: [],
  P5: ["Q2", "Q3", "Q7", "Q8"],
  P6: ["Q9"],
  P7: ["Q1", "Q5", "Q7", "Q9"],
};

/**
 * Data compatibility: what data characteristics each viz requires.
 */
const VIZ_REQUIREMENTS: Record<
  VizType,
  {
    dataTypes: ("continuous" | "categorical")[];
    needsTemporal?: boolean;
    needsNoael?: boolean;
    minEndpoints?: number;
    minDoseGroups?: number;
  }
> = {
  "line-chart":        { dataTypes: ["continuous"] },
  "bar-chart":         { dataTypes: ["categorical"] },
  "box-plot":          { dataTypes: ["continuous"], minDoseGroups: 2 },
  "scatter-volcano":   { dataTypes: ["continuous", "categorical"], minEndpoints: 5 },
  "scatter-xy":        { dataTypes: ["continuous"] },
  "time-course":       { dataTypes: ["continuous"], needsTemporal: true },
  "heatmap":           { dataTypes: ["continuous", "categorical"] },
  "trellis-box":       { dataTypes: ["continuous"], minDoseGroups: 2 },
  "pc-plot":           { dataTypes: ["continuous"], minEndpoints: 3 },
  "correlation":       { dataTypes: ["continuous"], minEndpoints: 3 },
  "table-grid":        { dataTypes: ["continuous", "categorical"] },
  "reference-overlay": { dataTypes: ["continuous", "categorical"], needsNoael: true },
  "histogram":         { dataTypes: ["continuous"] },
  "density":           { dataTypes: ["continuous"] },
  "group-analysis":    { dataTypes: ["continuous"], minDoseGroups: 2 },
};

/**
 * Viz → Datagrok viewer mapping with default configuration.
 */
export const VIZ_TO_DG: Record<VizType, { viewer: DGViewerType; config: Record<string, unknown> }> = {
  "line-chart":        { viewer: "Line chart",       config: { xColumnName: "dose_level", yColumnNames: ["mean"], splitColumnName: "sex" } },
  "bar-chart":         { viewer: "Bar chart",        config: { splitColumnName: "dose_label", valueColumnName: "incidence", valueAggrType: "avg" } },
  "box-plot":          { viewer: "Box plot",          config: { categoryColumnName: "dose_label", valueColumnName: "mean" } },
  "scatter-volcano":   { viewer: "Scatterplot",       config: { xColumnName: "abs_effect_size", yColumnName: "neg_log10_p", colorColumnName: "organ_system" } },
  "scatter-xy":        { viewer: "Scatterplot",       config: { xColumnName: "effect_size", yColumnName: "p_value" } },
  "time-course":       { viewer: "Line chart",       config: { xColumnName: "day", yColumnNames: ["mean"], splitColumnName: "dose_label" } },
  "heatmap":           { viewer: "Heatmap",           config: {} },
  "trellis-box":       { viewer: "Trellis plot",     config: { innerViewerType: "Box plot" } },
  "pc-plot":           { viewer: "PC plot",           config: {} },
  "correlation":       { viewer: "Correlation plot", config: {} },
  "table-grid":        { viewer: "Grid",             config: {} },
  "reference-overlay": { viewer: "Scatterplot",       config: {} },
  "histogram":         { viewer: "Histogram",         config: {} },
  "density":           { viewer: "Density plot",     config: {} },
  "group-analysis":    { viewer: "Group Analysis",   config: { groupColumnNames: ["dose_label"] } },
};

// ─── Endpoint Context ───────────────────────────────────────

export interface EndpointContext {
  /** Endpoint data type */
  dataType: "continuous" | "categorical";
  /** Whether temporal (time-course) data exists for this endpoint */
  hasTemporal: boolean;
  /** Whether NOAEL data exists for the study */
  hasNoael: boolean;
  /** Total number of endpoints in the study (for scanning views) */
  nEndpoints: number;
  /** Number of domains contributing to this organ system */
  nDomains: number;
  /** Number of sexes (1 or 2) */
  nSexes: number;
  /** Number of dose groups including control */
  nDoseGroups: number;
  /** Whether an existing annotation/assessment exists */
  hasAnnotation: boolean;
}

// ─── Recommendation Output ──────────────────────────────────

export interface VizRecommendation {
  /** Which visualization type to render */
  vizType: VizType;
  /** Composite score (higher = more valuable for this context) */
  score: number;
  /** Which persona questions this viz answers */
  questionsAnswered: QuestionId[];
  /** Novel questions (not already covered by higher-ranked vizzes) */
  novelQuestions: QuestionId[];
  /** Layout slot assignment */
  slot: LayoutSlot;
  /** Datagrok viewer type and configuration for migration */
  dgViewer: DGViewerType;
  dgConfig: Record<string, unknown>;
  /** Human-readable rationale */
  rationale: string;
}

// ─── Algorithm ──────────────────────────────────────────────

/**
 * Check if a viz type is compatible with the endpoint's data characteristics.
 */
function isCompatible(viz: VizType, ctx: EndpointContext): boolean {
  const req = VIZ_REQUIREMENTS[viz];
  if (!req.dataTypes.includes(ctx.dataType)) return false;
  if (req.needsTemporal && !ctx.hasTemporal) return false;
  if (req.needsNoael && !ctx.hasNoael) return false;
  if (req.minEndpoints && ctx.nEndpoints < req.minEndpoints) return false;
  if (req.minDoseGroups && ctx.nDoseGroups < req.minDoseGroups) return false;
  return true;
}

/**
 * Compute the optimal visualization mix for a given view + endpoint context.
 *
 * Algorithm:
 *   1. Find active personas (utility >= 3 for this view)
 *   2. Collect their questions
 *   3. For each viz type, compute: Σ(question_weight × viz_utility × persona_weight)
 *   4. Filter by data compatibility
 *   5. Greedy selection: pick highest-scoring, penalize subsequent vizzes
 *      that answer already-covered questions (novelty factor: 0.3 base + 0.7 × novel/total)
 *   6. Assign layout slots: first = primary, next 2 = secondary, rest = tertiary
 *   7. Reference overlays are always "overlay" slot if selected
 *
 * @param view - Which view we're computing for
 * @param ctx  - Endpoint data characteristics
 * @param maxVizzes - Maximum number of visualizations to recommend (default 5)
 * @returns Ranked list of visualization recommendations
 */
export function computeVizMix(
  view: ViewType,
  ctx: EndpointContext,
  maxVizzes = 5,
): VizRecommendation[] {
  // 1. Active personas for this view (utility >= 3)
  const personaUtilities = VIEW_PERSONA_UTILITY[view];
  const activePersonas = (Object.entries(personaUtilities) as [PersonaId, number][])
    .filter(([, u]) => u >= 3)
    .map(([p]) => p);

  // 2. Relevant questions (union of all active persona questions)
  const relevantQuestions = new Set<QuestionId>();
  for (const p of activePersonas) {
    for (const q of PERSONA_QUESTIONS[p]) relevantQuestions.add(q);
  }

  // 3. Score each viz type
  const candidates: { viz: VizType; score: number; questions: QuestionId[] }[] = [];

  for (const viz of Object.keys(VIZ_QUESTION_UTILITY) as VizType[]) {
    if (!isCompatible(viz, ctx)) continue;

    const utilities = VIZ_QUESTION_UTILITY[viz];
    let score = 0;
    const answeredQs: QuestionId[] = [];

    for (const [q, utility] of Object.entries(utilities) as [QuestionId, number][]) {
      if (!relevantQuestions.has(q)) continue;

      const w = QUESTION_WEIGHTS[q];
      const qWeight = w.frequency * w.criticality;

      // Persona multiplier: sum of normalized utilities of personas who ask this question
      const personaMultiplier = activePersonas
        .filter((p) => PERSONA_QUESTIONS[p].includes(q))
        .reduce((sum, p) => sum + personaUtilities[p] / 5, 0);

      score += qWeight * utility * Math.min(personaMultiplier, 1.5);
      answeredQs.push(q);
    }

    if (score > 0) {
      candidates.push({ viz, score, questions: answeredQs });
    }
  }

  // 4. Greedy set-cover selection: each round picks the candidate with the
  //    highest marginal (adjusted) score given current coverage. This is O(n²)
  //    but n ≤ 15 viz types so it's trivial. Ensures high-novelty candidates
  //    always beat zero-novelty ones regardless of raw score ordering.
  const selected: VizRecommendation[] = [];
  const coveredQuestions = new Set<QuestionId>();
  const remaining = new Set(candidates.map((_, i) => i));

  while (selected.length < maxVizzes && remaining.size > 0) {
    // Find the candidate with the best adjusted score this round
    let bestIdx = -1;
    let bestAdj = -Infinity;
    let bestNovel: QuestionId[] = [];

    for (const i of remaining) {
      const c = candidates[i];
      const novelQs = c.questions.filter((q) => !coveredQuestions.has(q));
      const totalQs = c.questions.length || 1;
      const noveltyFactor = novelQs.length === 0
        ? 0.05
        : 0.3 + 0.7 * (novelQs.length / totalQs);
      const adj = c.score * noveltyFactor;
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = i;
        bestNovel = novelQs;
      }
    }

    if (bestIdx < 0 || bestAdj < 0.08) break;
    remaining.delete(bestIdx);

    const candidate = candidates[bestIdx];

    // Assign layout slot
    const dg = VIZ_TO_DG[candidate.viz];
    let slot: LayoutSlot;
    if (candidate.viz === "reference-overlay") {
      slot = "overlay";
    } else if (candidate.viz === "scatter-volcano") {
      slot = "scanning";
    } else if (selected.filter((s) => s.slot !== "overlay" && s.slot !== "scanning").length === 0) {
      slot = "primary";
    } else if (selected.filter((s) => s.slot === "secondary").length < 2) {
      slot = "secondary";
    } else {
      slot = "tertiary";
    }

    // Build rationale
    const rationale = buildRationale(candidate.viz, bestNovel, activePersonas, view);

    selected.push({
      vizType: candidate.viz,
      score: bestAdj,
      questionsAnswered: candidate.questions,
      novelQuestions: bestNovel,
      slot,
      dgViewer: dg.viewer,
      dgConfig: dg.config,
      rationale,
    });

    for (const q of candidate.questions) coveredQuestions.add(q);
  }

  return selected;
}

// ─── Rationale Generator ────────────────────────────────────

function buildRationale(
  viz: VizType,
  novelQs: QuestionId[],
  personas: PersonaId[],
  _view: ViewType,
): string {
  const vizLabels: Record<VizType, string> = {
    "line-chart": "Dose-response line chart",
    "bar-chart": "Incidence bar chart",
    "box-plot": "Box plot by dose group",
    "scatter-volcano": "Volcano scatter (effect vs. significance)",
    "scatter-xy": "XY scatter",
    "time-course": "Time-course line chart",
    "heatmap": "Heatmap matrix",
    "trellis-box": "Trellis box plots by organ",
    "pc-plot": "Parallel coordinates",
    "correlation": "Correlation matrix",
    "table-grid": "Data grid with sorting/filtering",
    "reference-overlay": "NOAEL reference line overlay",
    "histogram": "Distribution histogram",
    "density": "Density plot",
    "group-analysis": "Statistical group comparison",
  };

  const personaLabels: Record<PersonaId, string> = {
    P1: "Study Director",
    P2: "Pathologist",
    P3: "Reg Toxicologist",
    P4: "Data Manager",
    P5: "Biostatistician",
    P6: "QA Auditor",
    P7: "Reg Reviewer",
  };

  const qLabels = novelQs.map((q) => QUESTION_WEIGHTS[q].label);
  const pLabels = personas.map((p) => personaLabels[p]).join(", ");

  if (qLabels.length === 0) {
    return `${vizLabels[viz]} reinforces coverage for ${pLabels}.`;
  }

  return `${vizLabels[viz]} answers: ${qLabels.join("; ")} — serves ${pLabels}.`;
}

// ─── Precomputed View Defaults ──────────────────────────────

/**
 * Quick lookup: given a view and basic data characteristics,
 * return the standard viz mix without running the full algorithm.
 * Useful for static layout decisions.
 */
export const VIEW_DEFAULTS: Record<ViewType, VizType[]> = {
  "study-summary":   ["heatmap", "scatter-volcano", "table-grid"],
  "dose-response":   ["line-chart", "time-course", "scatter-volcano", "reference-overlay", "table-grid"],
  "target-organs":   ["heatmap", "bar-chart", "correlation", "table-grid"],
  "histopathology":  ["heatmap", "bar-chart", "box-plot", "table-grid"],
  "noael-decision":  ["line-chart", "reference-overlay", "table-grid"],
  "adverse-effects": ["table-grid", "scatter-volcano", "histogram"],
  "validation":      ["table-grid"],
};

// ─── Coverage Analysis ──────────────────────────────────────

/**
 * Compute question coverage for a given viz mix.
 * Returns which questions are covered, which are gaps.
 */
export function analyzeCoverage(
  view: ViewType,
  vizzes: VizType[],
): { covered: QuestionId[]; gaps: QuestionId[]; coveragePercent: number } {
  const personaUtilities = VIEW_PERSONA_UTILITY[view];
  const activePersonas = (Object.entries(personaUtilities) as [PersonaId, number][])
    .filter(([, u]) => u >= 3)
    .map(([p]) => p);

  const relevantQuestions = new Set<QuestionId>();
  for (const p of activePersonas) {
    for (const q of PERSONA_QUESTIONS[p]) relevantQuestions.add(q);
  }

  const covered = new Set<QuestionId>();
  for (const viz of vizzes) {
    const utilities = VIZ_QUESTION_UTILITY[viz];
    for (const q of Object.keys(utilities) as QuestionId[]) {
      if (relevantQuestions.has(q)) covered.add(q);
    }
  }

  const relevantArr = [...relevantQuestions];
  const coveredArr = relevantArr.filter((q) => covered.has(q));
  const gaps = relevantArr.filter((q) => !covered.has(q));

  return {
    covered: coveredArr,
    gaps,
    coveragePercent: relevantArr.length > 0 ? (coveredArr.length / relevantArr.length) * 100 : 100,
  };
}

// ─── Diagnostic: Print Full Analysis ────────────────────────

/**
 * Generate a diagnostic report for a view + context.
 * Useful for development and design review.
 */
export function diagnosticReport(view: ViewType, ctx: EndpointContext): string {
  const mix = computeVizMix(view, ctx);
  const coverage = analyzeCoverage(
    view,
    mix.map((m) => m.vizType),
  );

  const lines: string[] = [
    `=== Viz Optimizer: ${view} ===`,
    `Context: ${ctx.dataType}, ${ctx.nDoseGroups} dose groups, ${ctx.nSexes} sexes, ${ctx.nEndpoints} endpoints`,
    `  temporal=${ctx.hasTemporal}, noael=${ctx.hasNoael}, annotation=${ctx.hasAnnotation}`,
    "",
    "Recommended mix:",
  ];

  for (const rec of mix) {
    lines.push(
      `  [${rec.slot.toUpperCase().padEnd(9)}] ${rec.vizType.padEnd(18)} score=${rec.score.toFixed(3)}  novel=${rec.novelQuestions.join(",")}`,
    );
    lines.push(`    → DG: ${rec.dgViewer}`);
    lines.push(`    ${rec.rationale}`);
  }

  lines.push("");
  lines.push(`Coverage: ${coverage.coveragePercent.toFixed(0)}% (${coverage.covered.length}/${coverage.covered.length + coverage.gaps.length})`);
  if (coverage.gaps.length > 0) {
    lines.push(`Gaps: ${coverage.gaps.map((q) => `${q} (${QUESTION_WEIGHTS[q].label})`).join(", ")}`);
  }

  return lines.join("\n");
}

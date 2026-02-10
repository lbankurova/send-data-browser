/**
 * Persona-Driven Visualization Scoring Engine
 *
 * 22-question × 58-viz scoring matrix driven by 7 persona weights.
 * 9-slot layout system with pruned exhaustive search.
 *
 * Catalog: 42 Datagrok-native vizzes (R/G/S/C/T/X) + 16 extended (E)
 * covering temporal, individual animal, pathology, NOAEL detail, and audit gaps.
 *
 * Key features:
 *   - Per-persona importance scores (0-10) for 22 regulatory questions
 *   - Regulatory blockers (NOAEL, reversibility, adversity) with 0.5x penalties
 *   - Best-viz discrimination (best answerer gets 1.0, others get 0.3)
 *   - Data profile distribution modeling (4 endpoint types weighted by prevalence)
 *   - Temporal boost (1.4x) and Q19 minimum (0.7x) penalties
 *   - Score-per-pixel efficiency tracking
 *   - Data-needs pruning (tc, rec, sl soft; me, md hard thresholds)
 */

// ─── Types ──────────────────────────────────────────────────

export type PersonaId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7";

export type QuestionId =
  | "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8"
  | "Q9" | "Q10" | "Q11" | "Q12" | "Q13" | "Q14" | "Q15" | "Q16"
  | "Q17" | "Q18" | "Q19" | "Q20" | "Q21" | "Q22";

export type VizId =
  | "R1" | "R2" | "R3" | "R4" | "R5"
  | "G1" | "G2" | "G3" | "G4" | "G5"
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7"
  | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9" | "C10"
  | "T1" | "T2" | "T3" | "T4" | "T5"
  | "X1" | "X2" | "X3" | "X4" | "X5" | "X6" | "X7" | "X8" | "X9" | "X10"
  | "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8"
  | "E9" | "E10" | "E11" | "E12" | "E13" | "E14" | "E15" | "E16";

export type SlotId = "ri" | "rh" | "og" | "sv" | "dc" | "dt" | "cu" | "cm" | "cl";

export type LayoutConfig = Partial<Record<SlotId, VizId>>;

export interface VizEntry {
  nm: string;
  cat: string;
  px: number;
  dg: string;
  n: Record<string, number>;
  a: Partial<Record<QuestionId, number>>;
}

export interface ScoreResult {
  score: number;
  px: number;
  spp: number;
}

export interface LayoutOptions {
  hasTemporal: boolean;
  hasRecovery: boolean;
  hasSubjectLevel: boolean;
  nEndpoints: number;
  nDomains: number;
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

// ─── Visualization Catalog (58 entries) ─────────────────────
// nm = name, cat = category, px = pixel cost, dg = Datagrok component
// n = data needs (≤1: soft degradation, >1: hard minimum threshold)
// a = answer quality per question (0-1)

export const VIZ_CATALOG: Record<VizId, VizEntry> = {

  /* ─── Rail ──────────────────────────────────────────────────── */

  R1: { nm: "Text only (badge+p+d)", cat: "rail", px: 10560,
    dg: "Custom cell renderer", n: {},
    a: { Q1: .3, Q2: .3, Q10: .5, Q11: .5, Q12: .3 } },
  R2: { nm: "D-R sparkline + text", cat: "rail", px: 11200,
    dg: "Grid sparkline renderer", n: {},
    a: { Q1: .7, Q2: .7, Q9: .3, Q10: .5, Q11: .5, Q12: .7 } },
  R3: { nm: "D-R spark + TC spark", cat: "rail", px: 12320,
    dg: "Grid dual sparkline renderer", n: { tc: .7 },
    a: { Q1: .7, Q2: .7, Q4: .7, Q9: .5, Q10: .5, Q11: .5, Q12: .7 } },
  R4: { nm: "D-R + TC spark + recovery flag", cat: "rail", px: 12800,
    dg: "Grid dual sparkline+icon", n: { tc: .7, rec: .5 },
    a: { Q1: .7, Q2: .7, Q3: .3, Q4: .7, Q9: .5, Q10: .5, Q11: .5, Q12: .7 } },
  R5: { nm: "Organ header + signal histogram", cat: "rail", px: 7040,
    dg: "Grid summary row+histogram", n: { me: 10 },
    a: { Q6: .7, Q9: .5, Q18: .3 } },

  /* ─── Overview Grid ─────────────────────────────────────────── */

  G1: { nm: "Plain metrics grid", cat: "overview", px: 460800,
    dg: "Grid viewer", n: {},
    a: { Q10: .7, Q11: .5, Q12: .3, Q22: .3 } },
  G2: { nm: "Grid+D-R sparklines+hist headers", cat: "overview", px: 460800,
    dg: "Grid+sparklines+col histograms", n: { me: 10 },
    a: { Q1: .7, Q2: .7, Q9: .7, Q10: .7, Q11: .7, Q12: .7, Q14: .3, Q22: .3 } },
  G3: { nm: "G2+TC sparklines+effect bars", cat: "overview", px: 460800,
    dg: "Grid+dual spark+bar-in-cell+hist", n: { tc: .7, me: 10 },
    a: { Q1: .7, Q2: .7, Q4: .7, Q7: .5, Q9: .7, Q10: .7, Q11: .7, Q12: .7, Q14: .3, Q22: .3 } },
  G4: { nm: "G3+Pareto flag+cluster labels", cat: "overview", px: 460800,
    dg: "Grid+spark+bar+hist+computed cols", n: { tc: .7, me: 15 },
    a: { Q1: .7, Q2: .7, Q4: .7, Q6: .7, Q7: .5, Q9: .9, Q10: .7, Q11: .7,
         Q12: .7, Q14: .5, Q18: .3, Q22: .3 } },
  G5: { nm: "G2+Pareto flag (no TC)", cat: "overview", px: 460800,
    dg: "Grid+spark+hist+Pareto col", n: { me: 15 },
    a: { Q1: .7, Q2: .7, Q7: .5, Q9: .9, Q10: .7, Q11: .7, Q12: .7, Q14: .3, Q22: .3 } },

  /* ─── Study-Level Viz ───────────────────────────────────────── */

  S1: { nm: "Scatter — Volcano/Pareto", cat: "study", px: 75000,
    dg: "Scatter Plot+Pareto Front", n: { me: 10 },
    a: { Q7: 1, Q9: 1, Q14: .5, Q18: .5 } },
  S2: { nm: "Scatter — Dim reduction (UMAP)", cat: "study", px: 75000,
    dg: "Scatter Plot (precomp coords)", n: { me: 15 },
    a: { Q6: .9, Q14: .7, Q18: .7 } },
  S3: { nm: "Dendrogram — Hierarchical cluster", cat: "study", px: 90000,
    dg: "Dendrogram viewer", n: { me: 8 },
    a: { Q6: .8, Q14: .7, Q18: .5 } },
  S4: { nm: "Correlation Plot — Endpoint×endpoint", cat: "study", px: 160000,
    dg: "Correlation Plot viewer", n: { me: 8 },
    a: { Q14: 1, Q19: .7, Q6: .5 } },
  S5: { nm: "Heatmap — Signal (ep×dose×sex)", cat: "study", px: 120000,
    dg: "Heatmap viewer", n: { me: 8 },
    a: { Q1: .7, Q8: .7, Q9: .7, Q18: .5 } },
  S6: { nm: "Parallel Coords — Multi-ep profiles", cat: "study", px: 96000,
    dg: "PC Plot viewer", n: { me: 10 },
    a: { Q1: .5, Q6: .5, Q12: .5, Q14: .5 } },
  S7: { nm: "Matrix Plot — Pairwise distributions", cat: "study", px: 140000,
    dg: "Matrix Plot viewer", n: { me: 8 },
    a: { Q14: .7, Q13: .5, Q16: .3 } },

  /* ─── Detail Chart ──────────────────────────────────────────── */

  C1: { nm: "Line Chart — D-R", cat: "detail_chart", px: 140800,
    dg: "Line Chart viewer", n: {},
    a: { Q1: 1, Q2: 1, Q5: .7, Q8: .7, Q12: .7, Q19: .5 } },
  C2: { nm: "Stacked D-R+TC Lines", cat: "detail_chart", px: 268800,
    dg: "Two Line Charts stacked", n: { tc: 1 },
    a: { Q1: 1, Q2: 1, Q3: .7, Q4: 1, Q5: .7, Q8: .7, Q12: .7, Q15: .7, Q19: .5 } },
  C3: { nm: "Trellis — Dose×Time (Line inner)", cat: "detail_chart", px: 179200,
    dg: "Trellis Plot (Line Chart)", n: { tc: 1, md: 3 },
    a: { Q1: 1, Q2: 1, Q3: .7, Q4: 1, Q5: 1, Q8: 1, Q12: .8, Q15: .8, Q19: .5 } },
  C4: { nm: "Trellis+Box overlay (spaghetti)", cat: "detail_chart", px: 192000,
    dg: "Trellis Plot (Box/Line hybrid)", n: { tc: 1, sl: 1, md: 3 },
    a: { Q1: 1, Q2: 1, Q3: .7, Q4: 1, Q5: 1, Q8: 1, Q12: .8,
         Q13: .8, Q15: .8, Q16: .7, Q19: .5 } },
  C5: { nm: "Box Plot — Per-dose distribution", cat: "detail_chart", px: 128000,
    dg: "Box Plot viewer", n: { sl: 1 },
    a: { Q1: .8, Q5: .7, Q8: .7, Q13: 1, Q16: .8 } },
  C6: { nm: "Multi Curve — Overlaid D-R", cat: "detail_chart", px: 140800,
    dg: "Multi Curve Viewer", n: {},
    a: { Q1: 1, Q2: 1, Q5: .7, Q8: .5, Q12: .9 } },
  C7: { nm: "Bar Chart — Means±SE", cat: "detail_chart", px: 128000,
    dg: "Bar Chart viewer", n: {},
    a: { Q1: .8, Q5: .7, Q8: .7, Q11: .5 } },
  C8: { nm: "Heatmap strip — Dose×Time×Sex", cat: "detail_chart", px: 64000,
    dg: "Heatmap (compact)", n: { tc: 1 },
    a: { Q1: .7, Q3: .5, Q4: .7, Q8: .7, Q15: .5 } },
  C9: { nm: "Histogram — Dist per dose", cat: "detail_chart", px: 128000,
    dg: "Histogram (split)", n: { sl: 1 },
    a: { Q13: .9, Q16: .7 } },
  C10: { nm: "Scatter — Individual values", cat: "detail_chart", px: 140800,
    dg: "Scatter Plot", n: { sl: 1 },
    a: { Q1: .8, Q8: .7, Q13: .7, Q16: .9 } },

  /* ─── Detail Table ──────────────────────────────────────────── */

  T1: { nm: "Pairwise table (plain)", cat: "detail_table", px: 153600,
    dg: "Grid viewer", n: {},
    a: { Q1: .7, Q5: .7, Q10: 1, Q11: .7, Q13: .5 } },
  T2: { nm: "Enriched pairwise (bars+color)", cat: "detail_table", px: 153600,
    dg: "Grid+bar-in-cell+color+sparklines", n: {},
    a: { Q1: .7, Q5: .7, Q7: .5, Q10: 1, Q11: .9, Q12: .5, Q13: .5 } },
  T3: { nm: "Statistics Viewer", cat: "detail_table", px: 96000,
    dg: "Statistics viewer", n: {},
    a: { Q10: .7, Q11: .5, Q13: .7 } },
  T4: { nm: "Pivot Table — Dose×Time×Sex", cat: "detail_table", px: 153600,
    dg: "Pivot Table viewer", n: { tc: .8 },
    a: { Q1: .5, Q4: .5, Q5: .5, Q8: .5, Q10: .7, Q13: .5 } },
  T5: { nm: "Group Analysis + in-cell charts", cat: "detail_table", px: 153600,
    dg: "Group Analysis viewer", n: {},
    a: { Q1: .7, Q5: .7, Q10: .8, Q11: .7, Q13: .6, Q19: .3 } },

  /* ─── Context Panes ─────────────────────────────────────────── */

  X1: { nm: "Insights text (rule engine)", cat: "context", px: 48000,
    dg: "Markup viewer / Info pane", n: {},
    a: { Q1: .5, Q5: .5, Q7: .5, Q9: .5, Q17: .7, Q18: .5, Q21: .5, Q22: .3 } },
  X2: { nm: "Causality form (Bradford Hill)", cat: "context", px: 64000,
    dg: "Custom JsViewer (form)", n: {},
    a: { Q17: 1, Q1: .3, Q21: .7 } },
  X3: { nm: "Radar — Bradford Hill criteria", cat: "context", px: 51200,
    dg: "Radar viewer", n: {},
    a: { Q17: .7, Q1: .3, Q3: .3, Q4: .3 } },
  X4: { nm: "Correlation pane — Related endpoints", cat: "context", px: 48000,
    dg: "Grid (compact, filtered)", n: { me: 5 },
    a: { Q6: .8, Q14: .5, Q19: .8 } },
  X5: { nm: "Statistics pane", cat: "context", px: 44800,
    dg: "Statistics viewer (compact)", n: {},
    a: { Q10: .7, Q11: .5, Q13: .7 } },
  X6: { nm: "Historical control comparison", cat: "context", px: 51200,
    dg: "Box Plot (vs historical)", n: {},
    a: { Q20: 1, Q17: .3, Q7: .3 } },
  X7: { nm: "Mini scatter — Effect vs p", cat: "context", px: 38400,
    dg: "Scatter Plot (compact)", n: { me: 5 },
    a: { Q7: .7, Q9: .5, Q18: .3 } },
  X8: { nm: "Mini line — TC selected", cat: "context", px: 38400,
    dg: "Line Chart (compact)", n: { tc: 1 },
    a: { Q3: .5, Q4: .7, Q15: .5 } },
  X9: { nm: "Tile viewer — Related findings", cat: "context", px: 51200,
    dg: "Tile Viewer", n: { me: 5 },
    a: { Q6: .5, Q18: .5, Q19: .5 } },
  X10: { nm: "Mini box — NOAEL dose dist", cat: "context", px: 38400,
    dg: "Box Plot (compact, NOAEL)", n: { sl: .8 },
    a: { Q5: .5, Q13: .5, Q16: .5 } },

  /* ─── Extended: Temporal / Recovery / Reversibility ──────────── */

  E1: { nm: "Recovery Overlay Plot (Treatment vs Recovery)", cat: "detail_chart", px: 160000,
    dg: "Custom Line Chart (phase-annotated)", n: { tc: 1, rec: 1 },
    a: { Q3: 1.0, Q4: 0.8, Q15: 1.0, Q17: 0.6 } },
  E2: { nm: "Delta-from-Baseline Time Course", cat: "detail_chart", px: 140000,
    dg: "Line Chart (baseline-normalized)", n: { tc: 1 },
    a: { Q4: 1.0, Q3: 0.7, Q12: 0.6 } },
  E3: { nm: "Slope-of-Change Plot (Early vs Late Phase)", cat: "detail_chart", px: 120000,
    dg: "Scatter / Line Hybrid", n: { tc: 1 },
    a: { Q4: 0.8, Q15: 0.9, Q12: 0.6 } },

  /* ─── Extended: Distribution / Outlier / Individual Animal ──── */

  E4: { nm: "Spaghetti Plot (Individuals over Time)", cat: "detail_chart", px: 180000,
    dg: "Multi-line (individual trajectories)", n: { tc: 1, sl: 1 },
    a: { Q13: 1.0, Q16: 1.0, Q4: 0.7 } },
  E5: { nm: "Waterfall Plot (Individual Response Magnitude)", cat: "detail_chart", px: 110000,
    dg: "Ordered Bar Chart", n: { sl: 1 },
    a: { Q16: 0.9, Q13: 0.7, Q7: 0.6 } },
  E6: { nm: "Shift Function (Quantile Comparison vs Control)", cat: "detail_chart", px: 150000,
    dg: "Quantile Plot", n: { sl: 1 },
    a: { Q13: 0.9, Q7: 0.7, Q16: 0.7 } },

  /* ─── Extended: NOAEL / Dose Justification ──────────────────── */

  E7: { nm: "NOAEL Boundary Plot (Annotated Dose Response)", cat: "detail_chart", px: 140000,
    dg: "Line Chart + Reference Band", n: {},
    a: { Q5: 1.0, Q1: 0.7, Q17: 0.6 } },
  E8: { nm: "Adjacent Dose Contrast Plot (NOAEL vs LOAEL)", cat: "detail_chart", px: 120000,
    dg: "Paired Difference Plot", n: {},
    a: { Q5: 0.9, Q7: 0.7, Q11: 0.6 } },

  /* ─── Extended: Cross-Endpoint / Organ Convergence ──────────── */

  E9: { nm: "Organ-Level Signal Summary Matrix", cat: "study", px: 130000,
    dg: "Matrix / Heatmap", n: { me: 5 },
    a: { Q6: 1.0, Q18: 0.7, Q9: 0.6 } },
  E10: { nm: "Domain Convergence Chord Diagram", cat: "study", px: 160000,
    dg: "Chord Diagram", n: { me: 5 },
    a: { Q6: 0.9, Q14: 0.7 } },

  /* ─── Extended: Pathology-Specific ──────────────────────────── */

  E11: { nm: "Histopath Incidence × Severity Heatmap", cat: "detail_chart", px: 120000,
    dg: "Heatmap", n: {},
    a: { Q19: 1.0, Q6: 0.7, Q17: 0.6 } },
  E12: { nm: "ClinChem vs Histopath Scatter (Per Animal)", cat: "detail_chart", px: 140000,
    dg: "Scatter Plot (linked)", n: { sl: 1 },
    a: { Q19: 1.0, Q14: 0.7, Q16: 0.6 } },

  /* ─── Extended: Statistical Interpretability ────────────────── */

  E13: { nm: "Effect Size vs N Context Plot", cat: "study", px: 110000,
    dg: "Scatter Plot (contextualized)", n: {},
    a: { Q10: 1.0, Q7: 0.8, Q11: 0.7 } },
  E14: { nm: "P-Value Stability Plot (Jackknife / Leave-One-Out)", cat: "detail_chart", px: 150000,
    dg: "Line / Dot Plot", n: { sl: 1 },
    a: { Q10: 0.9, Q16: 0.7, Q7: 0.6 } },

  /* ─── Extended: Audit / Review / Completeness ───────────────── */

  E15: { nm: "Endpoint Review Coverage Map", cat: "overview", px: 90000,
    dg: "Matrix / Checklist Viewer", n: {},
    a: { Q22: 1.0, Q21: 0.8, Q18: 0.6 } },
  E16: { nm: "Decision Provenance Timeline", cat: "context", px: 80000,
    dg: "Timeline Viewer", n: {},
    a: { Q21: 0.9, Q22: 0.9, Q17: 0.5 } },
};

// ─── Layout Constraints & Metadata ──────────────────────────

export const SLOT_OPTS: Record<SlotId, (VizId | null)[]> = {
  ri: ["R1", "R2", "R3", "R4"],
  rh: [null, "R5"],
  og: ["G1", "G2", "G3", "G4", "G5", "E15"],
  sv: [null, "S1", "S2", "S3", "S4", "S5", "S6", "S7", "E9", "E10", "E13"],
  dc: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10",
       "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E11", "E12", "E14"],
  dt: ["T1", "T2", "T3", "T4", "T5"],
  cu: [null, "X1", "X2"],
  cm: [null, "X3", "X4", "X5", "X6", "E16"],
  cl: [null, "X7", "X8", "X9", "X10"],
};

export const SLOT_NAMES: Record<SlotId, string> = {
  ri: "Rail Item",
  rh: "Rail Header",
  og: "Overview Grid",
  sv: "Study-Level Viz",
  dc: "Detail Chart",
  dt: "Detail Table",
  cu: "Context Upper",
  cm: "Context Mid",
  cl: "Context Lower",
};

export const CATS: Record<string, string> = {
  dr:          "D-R Core",
  temporal:    "Temporal",
  noael:       "NOAEL",
  convergence: "Convergence",
  stat:        "Statistical",
  adversity:   "Adversity",
  triage:      "Triage",
  complete:    "Completeness",
  path:        "Pathology",
  context:     "Context",
  audit:       "Audit",
};

export const AC: Record<string, { bg: string; bd: string; tx: string }> = {
  rail:         { bg: "#fef3c7", bd: "#d97706", tx: "#92400e" },
  overview:     { bg: "#dbeafe", bd: "#2563eb", tx: "#1e3a5f" },
  study:        { bg: "#ede9fe", bd: "#7c3aed", tx: "#4c1d95" },
  detail_chart: { bg: "#d1fae5", bd: "#059669", tx: "#064e3b" },
  detail_table: { bg: "#e0f2fe", bd: "#0284c7", tx: "#0c4a6e" },
  context:      { bg: "#fce7f3", bd: "#db2777", tx: "#831843" },
};

// ─── Scoring Engine ─────────────────────────────────────────

const QUESTION_IDS = Object.keys(QUESTIONS) as QuestionId[];
const SLOT_ORDER = Object.keys(SLOT_OPTS) as SlotId[];

/** Data-availability weighted capability for a viz across the study distribution. */
function avail(
  vid: string,
  V: Record<string, VizEntry>,
  ctx?: { hasTemporal?: boolean; hasRecovery?: boolean; hasSubjectLevel?: boolean },
): number {
  const v = V[vid];
  if (!v) return 0;
  let total = 0;
  for (const dp of Object.values(DATA_PROFILES)) {
    let c = 1;
    const tcNeed = v.n.tc;
    const hasTc = dp.tc && (ctx?.hasTemporal ?? true);
    if (tcNeed != null && !hasTc) c *= (1 - tcNeed);
    const recNeed = v.n.rec;
    const hasRec = dp.rec && (ctx?.hasRecovery ?? true);
    if (recNeed != null && !hasRec) c *= (1 - recNeed);
    total += dp.w * c;
  }
  // Subject-level: study-level flag, not endpoint-type dependent
  const slNeed = v.n.sl;
  if (slNeed != null && ctx && !ctx.hasSubjectLevel) total *= (1 - slNeed);
  return total;
}

/** Best question coverage map across all vizzes in a config. */
function qCov(cfg: LayoutConfig, V: Record<string, VizEntry>): Partial<Record<QuestionId, number>> {
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
function blockerPenalty(cfg: LayoutConfig, V: Record<string, VizEntry>): number {
  const cov = qCov(cfg, V);
  let penalty = 1;
  for (const [q, min] of Object.entries(BLOCKERS) as [QuestionId, number][]) {
    if ((cov[q] ?? 0) < min) penalty *= 0.5;
  }
  return penalty;
}

/** Penalty when histopathology confirmation (Q19) is under-covered. */
function q19Penalty(cfg: LayoutConfig, V: Record<string, VizEntry>): number {
  const cov = qCov(cfg, V);
  return (cov.Q19 ?? 0) >= Q19_MIN ? 1 : 0.7;
}

/**
 * Main scoring function. Computes weighted persona × question score with
 * best-viz discrimination, temporal boost, and regulatory penalties.
 */
export function score(
  cfg: LayoutConfig,
  V: Record<string, VizEntry> = VIZ_CATALOG,
  ctx?: { hasTemporal?: boolean; hasRecovery?: boolean; hasSubjectLevel?: boolean },
): ScoreResult {
  const ids = Object.values(cfg).filter((v): v is VizId => v != null);

  // Best-per-question map
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

    const av = avail(id, V, ctx);
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

const MAX_COMBOS = 100_000;
const PRUNE_K = 4;
const MAX_ALT = 5;

/**
 * Pruned exhaustive search over the 9-slot layout system.
 * Filters candidates by data-needs, prunes to top-K per slot if the
 * combo count exceeds MAX_COMBOS, then scores all remaining configs.
 */
export function findOptimalLayout(options: LayoutOptions): LayoutResult {
  const { hasTemporal, hasRecovery, hasSubjectLevel, nEndpoints, nDomains } = options;
  const ctx = { hasTemporal, hasRecovery, hasSubjectLevel };

  // Filter candidates per slot by data availability
  const filtered: Record<string, (VizId | null)[]> = {};
  for (const slot of SLOT_ORDER) {
    filtered[slot] = SLOT_OPTS[slot].filter(id => {
      if (id == null) return true;
      const v = VIZ_CATALOG[id];
      if (!v) return false;
      // Hard threshold filters
      if (v.n.me != null && nEndpoints < v.n.me) return false;
      if (v.n.md != null && nDomains < v.n.md) return false;
      // Hard data-need filters (need = 1 means absolute requirement)
      if (v.n.tc === 1 && !hasTemporal) return false;
      if (v.n.rec === 1 && !hasRecovery) return false;
      if (v.n.sl === 1 && !hasSubjectLevel) return false;
      return true;
    }) as (VizId | null)[];
    // Ensure non-optional slots have at least one candidate
    if (filtered[slot].length === 0) filtered[slot] = [null];
  }

  // Combo count check — prune to top-K per slot if needed
  let totalCombos = 1;
  for (const slot of SLOT_ORDER) totalCombos *= filtered[slot].length;

  if (totalCombos > MAX_COMBOS) {
    for (const slot of SLOT_ORDER) {
      const cands = filtered[slot];
      if (cands.length <= PRUNE_K) continue;
      // Score each candidate independently for marginal ranking
      const scored = cands.map(id => {
        if (id == null) return { id, s: 0 };
        const cfg: LayoutConfig = {};
        cfg[slot as SlotId] = id;
        return { id, s: score(cfg, VIZ_CATALOG, ctx).score };
      }).sort((a, b) => b.s - a.s);
      const hasNull = cands.includes(null);
      const top = scored.slice(0, hasNull ? PRUNE_K - 1 : PRUNE_K).map(s => s.id);
      if (hasNull && !top.includes(null)) top.push(null);
      filtered[slot] = top;
    }
  }

  // Exhaustive enumeration with bounded alternative tracking
  let bestResult: ScoreResult = { score: -Infinity, px: 0, spp: 0 };
  let bestConfig: LayoutConfig = {};
  const alts: { config: LayoutConfig; result: ScoreResult }[] = [];

  function addAlt(config: LayoutConfig, result: ScoreResult) {
    if (alts.length < MAX_ALT) {
      alts.push({ config, result });
      alts.sort((a, b) => b.result.score - a.result.score);
    } else if (result.score > alts[alts.length - 1].result.score) {
      alts[alts.length - 1] = { config, result };
      alts.sort((a, b) => b.result.score - a.result.score);
    }
  }

  function enumerate(idx: number, current: LayoutConfig) {
    if (idx >= SLOT_ORDER.length) {
      const result = score(current, VIZ_CATALOG, ctx);
      if (result.score > bestResult.score) {
        if (bestResult.score > -Infinity) addAlt(bestConfig, bestResult);
        bestResult = result;
        bestConfig = { ...current };
      } else {
        addAlt({ ...current }, result);
      }
      return;
    }
    const slot = SLOT_ORDER[idx];
    for (const vizId of filtered[slot]) {
      if (vizId == null) {
        enumerate(idx + 1, current);
      } else {
        current[slot as SlotId] = vizId;
        enumerate(idx + 1, current);
        delete current[slot as SlotId];
      }
    }
  }

  enumerate(0, {});

  return {
    config: bestConfig,
    score: bestResult.score,
    px: bestResult.px,
    spp: bestResult.spp,
    alternatives: alts.map(a => a.config),
  };
}

// ─── Analysis Utilities ─────────────────────────────────────

/** Gap analysis: which questions are covered and which are missing. */
export function analyzeCoverage(
  cfg: LayoutConfig,
  V: Record<string, VizEntry> = VIZ_CATALOG,
): CoverageResult {
  const ids = Object.values(cfg).filter((v): v is VizId => v != null);
  const covered: CoverageResult["covered"] = [];
  const gaps: CoverageResult["gaps"] = [];

  for (const q of QUESTION_IDS) {
    let bestQual = 0;
    let bestViz: VizId = "R1";
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

  lines.push("=== Viz Optimizer ===");
  lines.push(`Study: tc=${options.hasTemporal} rec=${options.hasRecovery} sl=${options.hasSubjectLevel} ep=${options.nEndpoints} dom=${options.nDomains}`);
  lines.push(`Score: ${result.score.toFixed(1)}  Pixels: ${result.px}  SPP: ${result.spp.toFixed(4)}`);
  lines.push("");

  lines.push("Layout:");
  for (const slot of SLOT_ORDER) {
    const vizId = result.config[slot];
    if (vizId) {
      const v = VIZ_CATALOG[vizId];
      lines.push(`  [${SLOT_NAMES[slot].padEnd(16)}] ${vizId.padEnd(4)} ${v.nm} (${v.px}px)`);
    } else {
      lines.push(`  [${SLOT_NAMES[slot].padEnd(16)}] —`);
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
    lines.push(`Alternatives: ${result.alternatives.length} configs within reach`);
  }

  return lines.join("\n");
}

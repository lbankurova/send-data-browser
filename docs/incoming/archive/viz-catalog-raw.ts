/* ═══════════════════════════════════════════════════════════════════════════════
   EXTENDED VISUALIZATION CATALOG
   SEND / PRECLINICAL TOXICOLOGY
   Non-Datagrok-native or underrepresented visualizations
   Schema-compatible with existing V
   ═══════════════════════════════════════════════════════════════════════════════ */

export const V_EXT = {

  /* ───────────────────────────────────────────────────────────────────────────
     TEMPORAL / RECOVERY / REVERSIBILITY
     ─────────────────────────────────────────────────────────────────────────── */

  E1: {
    nm: "Recovery Overlay Plot (Treatment vs Recovery)",
    cat: "detail_chart",
    px: 160000,
    dg: "Custom Line Chart (phase-annotated)",
    n: { tc: 1, rec: 1 },
    a: {
      Q3: 1.0,   // reversibility
      Q4: 0.8,   // temporal progression
      Q15: 1.0,  // sacrifice-timing artifact
      Q17: 0.6,  // adversity justification
    },
  },

  E2: {
    nm: "Delta-from-Baseline Time Course",
    cat: "detail_chart",
    px: 140000,
    dg: "Line Chart (baseline-normalized)",
    n: { tc: 1 },
    a: {
      Q4: 1.0,
      Q3: 0.7,
      Q12: 0.6,
    },
  },

  E3: {
    nm: "Slope-of-Change Plot (Early vs Late Phase)",
    cat: "detail_chart",
    px: 120000,
    dg: "Scatter / Line Hybrid",
    n: { tc: 1 },
    a: {
      Q4: 0.8,
      Q15: 0.9,
      Q12: 0.6,
    },
  },

  /* ───────────────────────────────────────────────────────────────────────────
     DISTRIBUTION / OUTLIER / INDIVIDUAL ANIMAL
     ─────────────────────────────────────────────────────────────────────────── */

  E4: {
    nm: "Spaghetti Plot (Individuals over Time)",
    cat: "detail_chart",
    px: 180000,
    dg: "Multi-line (individual trajectories)",
    n: { tc: 1, sl: 1 },
    a: {
      Q13: 1.0,  // within-group variability
      Q16: 1.0,  // outlier animals
      Q4: 0.7,
    },
  },

  E5: {
    nm: "Waterfall Plot (Individual Response Magnitude)",
    cat: "detail_chart",
    px: 110000,
    dg: "Ordered Bar Chart",
    n: { sl: 1 },
    a: {
      Q16: 0.9,
      Q13: 0.7,
      Q7: 0.6,
    },
  },

  E6: {
    nm: "Shift Function (Quantile Comparison vs Control)",
    cat: "detail_chart",
    px: 150000,
    dg: "Quantile Plot",
    n: { sl: 1 },
    a: {
      Q13: 0.9,
      Q7: 0.7,
      Q16: 0.7,
    },
  },

  /* ───────────────────────────────────────────────────────────────────────────
     NOAEL / DOSE JUSTIFICATION
     ─────────────────────────────────────────────────────────────────────────── */

  E7: {
    nm: "NOAEL Boundary Plot (Annotated Dose Response)",
    cat: "detail_chart",
    px: 140000,
    dg: "Line Chart + Reference Band",
    n: {},
    a: {
      Q5: 1.0,   // NOAEL justification
      Q1: 0.7,
      Q17: 0.6,
    },
  },

  E8: {
    nm: "Adjacent Dose Contrast Plot (NOAEL vs LOAEL)",
    cat: "detail_chart",
    px: 120000,
    dg: "Paired Difference Plot",
    n: {},
    a: {
      Q5: 0.9,
      Q7: 0.7,
      Q11: 0.6,
    },
  },

  /* ───────────────────────────────────────────────────────────────────────────
     CROSS-ENDPOINT / ORGAN CONVERGENCE
     ─────────────────────────────────────────────────────────────────────────── */

  E9: {
    nm: "Organ-Level Signal Summary Matrix",
    cat: "study",
    px: 130000,
    dg: "Matrix / Heatmap",
    n: { me: 5 },
    a: {
      Q6: 1.0,   // convergence
      Q18: 0.7,  // completeness
      Q9: 0.6,
    },
  },

  E10: {
    nm: "Domain Convergence Chord Diagram",
    cat: "study",
    px: 160000,
    dg: "Chord Diagram",
    n: { me: 5 },
    a: {
      Q6: 0.9,
      Q14: 0.7,
    },
  },

  /* ───────────────────────────────────────────────────────────────────────────
     PATHOLOGY-SPECIFIC (CRITICAL FOR SEND)
     ─────────────────────────────────────────────────────────────────────────── */

  E11: {
    nm: "Histopath Incidence × Severity Heatmap",
    cat: "detail_chart",
    px: 120000,
    dg: "Heatmap",
    n: {},
    a: {
      Q19: 1.0,  // clin-path correlation
      Q6: 0.7,
      Q17: 0.6,
    },
  },

  E12: {
    nm: "ClinChem vs Histopath Scatter (Per Animal)",
    cat: "detail_chart",
    px: 140000,
    dg: "Scatter Plot (linked)",
    n: { sl: 1 },
    a: {
      Q19: 1.0,
      Q14: 0.7,
      Q16: 0.6,
    },
  },

  /* ───────────────────────────────────────────────────────────────────────────
     STATISTICAL INTERPRETABILITY (NOT RAW STATS)
     ─────────────────────────────────────────────────────────────────────────── */

  E13: {
    nm: "Effect Size vs N Context Plot",
    cat: "study",
    px: 110000,
    dg: "Scatter Plot (contextualized)",
    n: {},
    a: {
      Q10: 1.0,
      Q7: 0.8,
      Q11: 0.7,
    },
  },

  E14: {
    nm: "P-Value Stability Plot (Jackknife / Leave-One-Out)",
    cat: "detail_chart",
    px: 150000,
    dg: "Line / Dot Plot",
    n: { sl: 1 },
    a: {
      Q10: 0.9,
      Q16: 0.7,
      Q7: 0.6,
    },
  },

  /* ───────────────────────────────────────────────────────────────────────────
     AUDIT / REVIEW / COMPLETENESS
     ─────────────────────────────────────────────────────────────────────────── */

  E15: {
    nm: "Endpoint Review Coverage Map",
    cat: "overview",
    px: 90000,
    dg: "Matrix / Checklist Viewer",
    n: {},
    a: {
      Q22: 1.0,  // review progress
      Q21: 0.8,  // documentation exists
      Q18: 0.6,
    },
  },

  E16: {
    nm: "Decision Provenance Timeline",
    cat: "context",
    px: 80000,
    dg: "Timeline Viewer",
    n: {},
    a: {
      Q21: 0.9,
      Q22: 0.9,
      Q17: 0.5,
    },
  },
};


/* ═══════════════════════════════════════════════════════════════════════════════
   45 VISUALIZATION CANDIDATES — Full Datagrok inventory
   a = answers {qId: quality 0-1}, n = needs, px = pixels, dg = component
   ═══════════════════════════════════════════════════════════════════════════════ */

export const V = {

  /* ─── Rail ──────────────────────────────────────────────────────────────── */

  R1: { nm: "Text only (badge+p+d)",                    sl: "ri", cat: "rail",         px: 10560,  dg: "Custom cell renderer",                n: {},                    a: { Q1: .3, Q2: .3, Q10: .5, Q11: .5, Q12: .3 } },
  R2: { nm: "D-R sparkline + text",                     sl: "ri", cat: "rail",         px: 11200,  dg: "Grid sparkline renderer",             n: {},                    a: { Q1: .7, Q2: .7, Q9: .3, Q10: .5, Q11: .5, Q12: .7 } },
  R3: { nm: "D-R spark + TC spark",                     sl: "ri", cat: "rail",         px: 12320,  dg: "Grid dual sparkline renderer",        n: { tc: .7 },            a: { Q1: .7, Q2: .7, Q4: .7, Q9: .5, Q10: .5, Q11: .5, Q12: .7 } },
  R4: { nm: "D-R + TC spark + recovery flag",           sl: "ri", cat: "rail",         px: 12800,  dg: "Grid dual sparkline+icon",            n: { tc: .7, rec: .5 },   a: { Q1: .7, Q2: .7, Q3: .3, Q4: .7, Q9: .5, Q10: .5, Q11: .5, Q12: .7 } },
  R5: { nm: "Organ header + signal histogram",          sl: "rh", cat: "rail",         px: 7040,   dg: "Grid summary row+histogram",          n: { me: 10 },            a: { Q6: .7, Q9: .5, Q18: .3 } },

  /* ─── Overview Grid ─────────────────────────────────────────────────────── */

  G1: { nm: "Plain metrics grid",                       sl: "og", cat: "overview",     px: 460800, dg: "Grid viewer",                         n: {},                    a: { Q10: .7, Q11: .5, Q12: .3, Q22: .3 } },
  G2: { nm: "Grid+D-R sparklines+hist headers",         sl: "og", cat: "overview",     px: 460800, dg: "Grid+sparklines+col histograms",      n: { me: 10 },            a: { Q1: .7, Q2: .7, Q9: .7, Q10: .7, Q11: .7, Q12: .7, Q14: .3, Q22: .3 } },
  G3: { nm: "G2+TC sparklines+effect bars",             sl: "og", cat: "overview",     px: 460800, dg: "Grid+dual spark+bar-in-cell+hist",    n: { tc: .7, me: 10 },    a: { Q1: .7, Q2: .7, Q4: .7, Q7: .5, Q9: .7, Q10: .7, Q11: .7, Q12: .7, Q14: .3, Q22: .3 } },
  G4: { nm: "G3+Pareto flag+cluster labels",            sl: "og", cat: "overview",     px: 460800, dg: "Grid+spark+bar+hist+computed cols",   n: { tc: .7, me: 15 },    a: { Q1: .7, Q2: .7, Q4: .7, Q6: .7, Q7: .5, Q9: .9, Q10: .7, Q11: .7, Q12: .7, Q14: .5, Q18: .3, Q22: .3 } },
  G5: { nm: "G2+Pareto flag (no TC)",                   sl: "og", cat: "overview",     px: 460800, dg: "Grid+spark+hist+Pareto col",          n: { me: 15 },            a: { Q1: .7, Q2: .7, Q7: .5, Q9: .9, Q10: .7, Q11: .7, Q12: .7, Q14: .3, Q22: .3 } },

  /* ─── Study-Level Viz ───────────────────────────────────────────────────── */

  S1: { nm: "Scatter — Volcano/Pareto",                 sl: "sv", cat: "study",        px: 75000,  dg: "Scatter Plot+Pareto Front",           n: { me: 10 },            a: { Q7: 1, Q9: 1, Q14: .5, Q18: .5 } },
  S2: { nm: "Scatter — Dim reduction (UMAP)",           sl: "sv", cat: "study",        px: 75000,  dg: "Scatter Plot (precomp coords)",       n: { me: 15 },            a: { Q6: .9, Q14: .7, Q18: .7 } },
  S3: { nm: "Dendrogram — Hierarchical cluster",        sl: "sv", cat: "study",        px: 90000,  dg: "Dendrogram viewer",                   n: { me: 8 },             a: { Q6: .8, Q14: .7, Q18: .5 } },
  S4: { nm: "Correlation Plot — Endpoint×endpoint",     sl: "sv", cat: "study",        px: 160000, dg: "Correlation Plot viewer",             n: { me: 8 },             a: { Q14: 1, Q19: .7, Q6: .5 } },
  S5: { nm: "Heatmap — Signal (ep×dose×sex)",           sl: "sv", cat: "study",        px: 120000, dg: "Heatmap viewer",                      n: { me: 8 },             a: { Q1: .7, Q8: .7, Q9: .7, Q18: .5 } },
  S6: { nm: "Parallel Coords — Multi-ep profiles",     sl: "sv", cat: "study",        px: 96000,  dg: "PC Plot viewer",                      n: { me: 10 },            a: { Q1: .5, Q6: .5, Q12: .5, Q14: .5 } },
  S7: { nm: "Matrix Plot — Pairwise distributions",     sl: "sv", cat: "study",        px: 140000, dg: "Matrix Plot viewer",                  n: { me: 8 },             a: { Q14: .7, Q13: .5, Q16: .3 } },

  /* ─── Detail Chart ──────────────────────────────────────────────────────── */

  C1: { nm: "Line Chart — D-R",                         sl: "dc", cat: "detail_chart", px: 140800, dg: "Line Chart viewer",                   n: {},                    a: { Q1: 1, Q2: 1, Q5: .7, Q8: .7, Q12: .7, Q19: .5 } },
  C2: { nm: "Stacked D-R+TC Lines",                     sl: "dc", cat: "detail_chart", px: 268800, dg: "Two Line Charts stacked",             n: { tc: 1 },             a: { Q1: 1, Q2: 1, Q3: .7, Q4: 1, Q5: .7, Q8: .7, Q12: .7, Q15: .7, Q19: .5 } },
  C3: { nm: "Trellis — Dose×Time (Line inner)",         sl: "dc", cat: "detail_chart", px: 179200, dg: "Trellis Plot (Line Chart)",           n: { tc: 1, md: 3 },     a: { Q1: 1, Q2: 1, Q3: .7, Q4: 1, Q5: 1, Q8: 1, Q12: .8, Q15: .8, Q19: .5 } },
  C4: { nm: "Trellis+Box overlay (spaghetti)",          sl: "dc", cat: "detail_chart", px: 192000, dg: "Trellis Plot (Box/Line hybrid)",      n: { tc: 1, sl: 1, md: 3 }, a: { Q1: 1, Q2: 1, Q3: .7, Q4: 1, Q5: 1, Q8: 1, Q12: .8, Q13: .8, Q15: .8, Q16: .7, Q19: .5 } },
  C5: { nm: "Box Plot — Per-dose distribution",         sl: "dc", cat: "detail_chart", px: 128000, dg: "Box Plot viewer",                     n: { sl: 1 },             a: { Q1: .8, Q5: .7, Q8: .7, Q13: 1, Q16: .8 } },
  C6: { nm: "Multi Curve — Overlaid D-R",               sl: "dc", cat: "detail_chart", px: 140800, dg: "Multi Curve Viewer",                  n: {},                    a: { Q1: 1, Q2: 1, Q5: .7, Q8: .5, Q12: .9 } },
  C7: { nm: "Bar Chart — Means±SE",                     sl: "dc", cat: "detail_chart", px: 128000, dg: "Bar Chart viewer",                    n: {},                    a: { Q1: .8, Q5: .7, Q8: .7, Q11: .5 } },
  C8: { nm: "Heatmap strip — Dose×Time×Sex",            sl: "dc", cat: "detail_chart", px: 64000,  dg: "Heatmap (compact)",                   n: { tc: 1 },             a: { Q1: .7, Q3: .5, Q4: .7, Q8: .7, Q15: .5 } },
  C9: { nm: "Histogram — Dist per dose",                sl: "dc", cat: "detail_chart", px: 128000, dg: "Histogram (split)",                   n: { sl: 1 },             a: { Q13: .9, Q16: .7 } },
  C10: { nm: "Scatter — Individual values",             sl: "dc", cat: "detail_chart", px: 140800, dg: "Scatter Plot",                        n: { sl: 1 },             a: { Q1: .8, Q8: .7, Q13: .7, Q16: .9 } },

  /* ─── Detail Table ──────────────────────────────────────────────────────── */

  T1: { nm: "Pairwise table (plain)",                   sl: "dt", cat: "detail_table", px: 153600, dg: "Grid viewer",                         n: {},                    a: { Q1: .7, Q5: .7, Q10: 1, Q11: .7, Q13: .5 } },
  T2: { nm: "Enriched pairwise (bars+color)",           sl: "dt", cat: "detail_table", px: 153600, dg: "Grid+bar-in-cell+color+sparklines",   n: {},                    a: { Q1: .7, Q5: .7, Q7: .5, Q10: 1, Q11: .9, Q12: .5, Q13: .5 } },
  T3: { nm: "Statistics Viewer",                        sl: "dt", cat: "detail_table", px: 96000,  dg: "Statistics viewer",                    n: {},                    a: { Q10: .7, Q11: .5, Q13: .7 } },
  T4: { nm: "Pivot Table — Dose×Time×Sex",              sl: "dt", cat: "detail_table", px: 153600, dg: "Pivot Table viewer",                  n: { tc: .8 },            a: { Q1: .5, Q4: .5, Q5: .5, Q8: .5, Q10: .7, Q13: .5 } },
  T5: { nm: "Group Analysis + in-cell charts",          sl: "dt", cat: "detail_table", px: 153600, dg: "Group Analysis viewer",               n: {},                    a: { Q1: .7, Q5: .7, Q10: .8, Q11: .7, Q13: .6, Q19: .3 } },

  /* ─── Context Panes ─────────────────────────────────────────────────────── */

  X1: { nm: "Insights text (rule engine)",              sl: "cu", cat: "context",      px: 48000,  dg: "Markup viewer / Info pane",           n: {},                    a: { Q1: .5, Q5: .5, Q7: .5, Q9: .5, Q17: .7, Q18: .5, Q21: .5, Q22: .3 } },
  X2: { nm: "Causality form (Bradford Hill)",           sl: "cu", cat: "context",      px: 64000,  dg: "Custom JsViewer (form)",              n: {},                    a: { Q17: 1, Q1: .3, Q21: .7 } },
  X3: { nm: "Radar — Bradford Hill criteria",           sl: "cm", cat: "context",      px: 51200,  dg: "Radar viewer",                        n: {},                    a: { Q17: .7, Q1: .3, Q3: .3, Q4: .3 } },
  X4: { nm: "Correlation pane — Related endpoints",     sl: "cm", cat: "context",      px: 48000,  dg: "Grid (compact, filtered)",            n: { me: 5 },             a: { Q6: .8, Q14: .5, Q19: .8 } },
  X5: { nm: "Statistics pane",                          sl: "cm", cat: "context",      px: 44800,  dg: "Statistics viewer (compact)",          n: {},                    a: { Q10: .7, Q11: .5, Q13: .7 } },
  X6: { nm: "Historical control comparison",            sl: "cm", cat: "context",      px: 51200,  dg: "Box Plot (vs historical)",            n: {},                    a: { Q20: 1, Q17: .3, Q7: .3 } },
  X7: { nm: "Mini scatter — Effect vs p",               sl: "cl", cat: "context",      px: 38400,  dg: "Scatter Plot (compact)",              n: { me: 5 },             a: { Q7: .7, Q9: .5, Q18: .3 } },
  X8: { nm: "Mini line — TC selected",                  sl: "cl", cat: "context",      px: 38400,  dg: "Line Chart (compact)",                n: { tc: 1 },             a: { Q3: .5, Q4: .7, Q15: .5 } },
  X9: { nm: "Tile viewer — Related findings",           sl: "cl", cat: "context",      px: 51200,  dg: "Tile Viewer",                         n: { me: 5 },             a: { Q6: .5, Q18: .5, Q19: .5 } },
  X10: { nm: "Mini box — NOAEL dose dist",              sl: "cl", cat: "context",      px: 38400,  dg: "Box Plot (compact, NOAEL)",           n: { sl: .8 },            a: { Q5: .5, Q13: .5, Q16: .5 } },
};


/* ═══════════════════════════════════════════════════════════════════════════════
   LAYOUT CONSTRAINTS & METADATA
   ═══════════════════════════════════════════════════════════════════════════════ */

export const SLOT_OPTS = {
  ri: ["R1", "R2", "R3", "R4"],
  rh: [null, "R5"],
  og: ["G1", "G2", "G3", "G4", "G5"],
  sv: [null, "S1", "S2", "S3", "S4", "S5", "S6", "S7"],
  dc: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"],
  dt: ["T1", "T2", "T3", "T4", "T5"],
  cu: [null, "X1", "X2"],
  cm: [null, "X3", "X4", "X5", "X6"],
  cl: [null, "X7", "X8", "X9", "X10"],
};

export const SLOT_NAMES = {
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

export const CATS = {
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

export const AC = {
  rail:         { bg: "#fef3c7", bd: "#d97706", tx: "#92400e" },
  overview:     { bg: "#dbeafe", bd: "#2563eb", tx: "#1e3a5f" },
  study:        { bg: "#ede9fe", bd: "#7c3aed", tx: "#4c1d95" },
  detail_chart: { bg: "#d1fae5", bd: "#059669", tx: "#064e3b" },
  detail_table: { bg: "#e0f2fe", bd: "#0284c7", tx: "#0c4a6e" },
  context:      { bg: "#fce7f3", bd: "#db2777", tx: "#831843" },
};

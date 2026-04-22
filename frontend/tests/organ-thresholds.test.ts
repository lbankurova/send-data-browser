/**
 * organ-thresholds.test.ts — Tier 2 autotests for organ-specific thresholds,
 * two-gate OM classification, and adaptive decision trees.
 *
 * Validates:
 * 1. FCT registry (field-consensus-thresholds.json, migrated from organ-weight-thresholds.json) schema and content
 * 2. _assessment_detail on OM findings (two-gate logic)
 * 3. _tree_result on MI findings (adaptive trees)
 * 4. Two-gate classification consistency rules
 * 5. Adaptive tree biological plausibility
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const UNIFIED_PATH = path.join(ROOT, "backend/generated/PointCross/unified_findings.json");
const THRESHOLD_PATH = path.join(ROOT, "shared/rules/field-consensus-thresholds.json");

// ─── Guards ─────────────────────────────────────────────────

const hasGenerated = fs.existsSync(UNIFIED_PATH);
const hasThresholds = fs.existsSync(THRESHOLD_PATH);

// ─── Load data ──────────────────────────────────────────────

interface AssessmentDetail {
  method: string;
  stat_gate: boolean;
  mag_gate: boolean | null;
  pct_change: number | null;
  organ_threshold: number;
  ceiling?: number;
  baseline?: "ancova" | "absolute";
  trend_tiebreaker?: boolean;
}

interface TreeResult {
  tree_id: string;
  node_path?: string[];
  ecetoc_factors?: string[];
  rationale: string;
  human_relevance?: string;
}

interface Finding {
  id: string;
  domain: string;
  test_code: string;
  specimen: string | null;
  finding: string;
  sex: string;
  severity: string;
  treatment_related: boolean;
  finding_class: string;
  min_p_adj: number | null;
  max_effect_size: number | null;
  trend_p: number | null;
  dose_response_pattern: string | null;
  direction: string | null;
  group_stats: Array<{ dose_level: number; mean?: number | null }>;
  _assessment_detail?: AssessmentDetail;
  _tree_result?: TreeResult;
}

const findings: Finding[] = hasGenerated
  ? JSON.parse(fs.readFileSync(UNIFIED_PATH, "utf-8")).findings
  : [];

interface FctBand {
  variation_ceiling: number | null;
  concern_floor: number | null;
  adverse_floor: number | null;
  strong_adverse_floor: number | null;
  units: string;
  provenance?: string;
  any_significant?: boolean;
}

interface FctEntry {
  species_specific: boolean;
  sex_specific?: boolean;
  bands: Record<string, FctBand>;
  coverage: string;
  provenance: string;
  threshold_reliability?: string;
  nhp_tier?: string;
  special_flags?: string[];
  cross_organ_link?: string;
  adaptive_requires?: {
    lb_panel: string[];
    critical_clean: string[];
    min_clean: number;
    max_fold_for_clean: number;
    max_severity_for_adaptive: number;
  };
  adaptive_ceiling_pct?: Record<string, number>;
}

interface FctRegistry {
  entries?: Record<string, FctEntry>;
}

const registry: FctRegistry = hasThresholds
  ? (JSON.parse(fs.readFileSync(THRESHOLD_PATH, "utf-8")) as FctRegistry)
  : {};
const entries: Record<string, FctEntry> = registry.entries ?? {};

function omEntry(organ: string): FctEntry | undefined {
  return entries[`OM.${organ}.both`];
}
function bandFor(entry: FctEntry | undefined, species: string): FctBand | undefined {
  if (!entry || !entry.bands) return undefined;
  if (entry.species_specific === false) return entry.bands.any;
  return entry.bands[species] ?? entry.bands.other;
}

// ─── 1. field-consensus-thresholds.json (FCT registry) schema ───────────────

describe("field-consensus-thresholds.json (FCT registry)", () => {
  const EXPECTED_ORGANS = [
    "LIVER", "KIDNEY", "HEART", "BRAIN", "ADRENAL", "THYROID",
    "SPLEEN", "THYMUS", "TESTES", "EPIDIDYMIDES", "OVARIES", "UTERUS", "LUNGS",
  ];

  test.skipIf(!hasThresholds)("has an OM entry for each of the 13 expected organs", () => {
    for (const organ of EXPECTED_ORGANS) {
      expect(omEntry(organ), `missing OM.${organ}.both entry`).toBeDefined();
    }
  });

  test.skipIf(!hasThresholds)("each OM entry has bands + coverage + provenance", () => {
    const violations: string[] = [];
    for (const organ of EXPECTED_ORGANS) {
      const entry = omEntry(organ);
      if (!entry) continue;
      if (!entry.bands) violations.push(`${organ}: missing bands`);
      if (!entry.coverage) violations.push(`${organ}: missing coverage`);
      if (!entry.provenance) violations.push(`${organ}: missing provenance`);
    }
    expect(violations).toEqual([]);
  });

  test.skipIf(!hasThresholds)("threshold ordering: ceiling <= floor <= strong (rat)", () => {
    const violations: string[] = [];
    for (const organ of EXPECTED_ORGANS) {
      const entry = omEntry(organ);
      if (!entry) continue;
      const band = bandFor(entry, "rat");
      if (!band) continue;
      const ceiling = band.variation_ceiling;
      const floor = band.adverse_floor;
      const strong = band.strong_adverse_floor;
      if (ceiling == null || floor == null || strong == null) continue;
      if (ceiling > floor) violations.push(`${organ}: ceiling(${ceiling}) > floor(${floor})`);
      if (floor > strong) violations.push(`${organ}: floor(${floor}) > strong(${strong})`);
    }
    expect(violations).toEqual([]);
  });

  test.skipIf(!hasThresholds)("ADRENAL has species-specific bands", () => {
    const adrenal = omEntry("ADRENAL");
    expect(adrenal).toBeDefined();
    expect(adrenal.species_specific).toBe(true);
    expect(adrenal.bands.rat).toBeDefined();
    expect(adrenal.bands.mouse).toBeDefined();
    expect(adrenal.bands.mouse.adverse_floor).toBeGreaterThan(adrenal.bands.rat.adverse_floor);
  });

  test.skipIf(!hasThresholds)("BRAIN has any_significant policy for rat/mouse (ceiling=0)", () => {
    const brain = omEntry("BRAIN");
    expect(brain).toBeDefined();
    expect(brain.bands.rat.variation_ceiling).toBe(0);
    expect(brain.bands.mouse.variation_ceiling).toBe(0);
    expect(brain.bands.rat.any_significant).toBe(true);
    expect(brain.bands.mouse.any_significant).toBe(true);
    // Dog brain CV ~5% → 5% floor (not any_significant)
    expect(brain.bands.dog.variation_ceiling).toBe(5);
  });

  test.skipIf(!hasThresholds)("LIVER has adaptive_requires block with LB panel", () => {
    const liver = omEntry("LIVER");
    expect(liver.adaptive_requires).toBeDefined();
    expect(liver.adaptive_requires.lb_panel).toBeDefined();
    expect(liver.adaptive_requires.lb_panel.length).toBeGreaterThanOrEqual(5);
    expect(liver.adaptive_requires.critical_clean).toContain("ALT");
    expect(liver.adaptive_requires.critical_clean).toContain("AST");
  });

  test.skipIf(!hasThresholds)("KIDNEY has special_flags for alpha2u and CPN", () => {
    const kidney = omEntry("KIDNEY");
    expect(kidney.special_flags).toBeDefined();
    expect(kidney.special_flags).toContain("alpha2u_globulin_male_rat");
  });

  test.skipIf(!hasThresholds)("NHP spleen/thymus/lungs/pancreas have Tier C qualitative + null bands", () => {
    for (const organ of ["SPLEEN", "THYMUS", "LUNGS", "PANCREAS"]) {
      const entry = omEntry(organ);
      if (!entry) continue;
      expect(entry.nhp_tier, `${organ}: expected nhp_tier = C_qualitative`).toBe("C_qualitative");
      const nhp = entry.bands.nhp;
      if (nhp) {
        expect(nhp.variation_ceiling).toBeNull();
        expect(nhp.adverse_floor).toBeNull();
      }
    }
  });
});

// ─── 2. _assessment_detail on OM findings ────────────────────

describe("OM two-gate assessment (_assessment_detail)", () => {
  const omFindings = findings.filter(f => f.domain === "OM");

  test.skipIf(!hasGenerated)("every OM finding has _assessment_detail", () => {
    const missing = omFindings.filter(f => !f._assessment_detail);
    expect(
      missing.length,
      `${missing.length}/${omFindings.length} OM findings lack _assessment_detail`,
    ).toBe(0);
  });

  test.skipIf(!hasGenerated)("_assessment_detail has required fields", () => {
    const violations: string[] = [];
    for (const f of omFindings) {
      const det = f._assessment_detail;
      if (!det) continue;
      if (det.method === undefined) violations.push(`${f.specimen} ${f.sex}: missing method`);
      if (det.stat_gate === undefined) violations.push(`${f.specimen} ${f.sex}: missing stat_gate`);
      if (det.organ_threshold === undefined) violations.push(`${f.specimen} ${f.sex}: missing organ_threshold`);
    }
    expect(violations).toEqual([]);
  });

  test.skipIf(!hasGenerated)("organ-specific organs use organ_specific method", () => {
    const expectedSpecific = ["BRAIN", "HEART", "LIVER", "KIDNEY", "SPLEEN", "THYMUS", "TESTIS", "OVARY"];
    const violations: string[] = [];
    for (const f of omFindings) {
      const det = f._assessment_detail;
      if (!det) continue;
      const isExpectedSpecific = expectedSpecific.some(
        s => (f.specimen ?? "").toUpperCase().includes(s),
      );
      if (isExpectedSpecific && !det.method.startsWith("organ_specific:")) {
        violations.push(`${f.specimen} ${f.sex}: expected organ_specific, got ${det.method}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test.skipIf(!hasGenerated)(
    "stat_gate=true iff min_p_adj < 0.05",
    () => {
      const violations: string[] = [];
      for (const f of omFindings) {
        const det = f._assessment_detail;
        if (!det) continue;
        const expectedGate = f.min_p_adj !== null && f.min_p_adj < 0.05;
        if (det.stat_gate !== expectedGate) {
          violations.push(
            `${f.specimen} ${f.sex}: stat_gate=${det.stat_gate} but p=${f.min_p_adj}`,
          );
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "pct_change matches group_stats control-vs-high",
    () => {
      const violations: string[] = [];
      for (const f of omFindings) {
        const det = f._assessment_detail;
        if (!det || det.pct_change === null) continue;
        if (det.baseline === "ancova") continue; // ANCOVA-adjusted, can't verify from group_stats
        const gs = f.group_stats;
        if (gs.length < 2) continue;
        const ctrl = gs[0]?.mean;
        const high = gs[gs.length - 1]?.mean;
        if (ctrl == null || high == null || Math.abs(ctrl) < 1e-10) continue;
        const expected = ((high - ctrl) / Math.abs(ctrl)) * 100;
        const diff = Math.abs(det.pct_change - expected);
        if (diff > 0.2) {
          violations.push(
            `${f.specimen} ${f.sex}: pct_change=${det.pct_change} but expected=${expected.toFixed(1)}`,
          );
        }
      }
      expect(violations).toEqual([]);
    },
  );

  // Two-gate logic consistency (HCD downgrade: within_hcd can push tr_adverse → equivocal)
  test.skipIf(!hasGenerated)(
    "both gates pass → tr_adverse (or equivocal if HCD downgrade)",
    () => {
      const violations: string[] = [];
      for (const f of omFindings) {
        const det = f._assessment_detail;
        if (!det) continue;
        if (det.stat_gate && det.mag_gate === true) {
          const hcdDowngrade = det.hcd_downgrade === true;
          if (hcdDowngrade) {
            // HCD downgrade: both gates pass but within HCD → equivocal is correct
            if (f.finding_class !== "equivocal") {
              violations.push(
                `${f.specimen} ${f.sex}: HCD downgrade but class=${f.finding_class} (expected equivocal)`,
              );
            }
          } else {
            if (f.finding_class !== "tr_adverse") {
              violations.push(
                `${f.specimen} ${f.sex}: both gates pass but class=${f.finding_class}`,
              );
            }
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "neither gate passes → not_treatment_related (absent trend significance)",
    () => {
      const violations: string[] = [];
      for (const f of omFindings) {
        const det = f._assessment_detail;
        if (!det) continue;
        if (!det.stat_gate && det.mag_gate === false) {
          const trendSig = f.trend_p !== null && f.trend_p < 0.05;
          const aboveCeiling = det.pct_change !== null && det.ceiling !== undefined &&
            Math.abs(det.pct_change) >= det.ceiling;
          if (!trendSig || !aboveCeiling) {
            if (f.finding_class !== "not_treatment_related") {
              violations.push(
                `${f.specimen} ${f.sex}: neither gate, no trend, but class=${f.finding_class}`,
              );
            }
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)("BRAIN uses any_significant policy (threshold=0)", () => {
    const brainOm = omFindings.filter(f => (f.specimen ?? "").toUpperCase().includes("BRAIN"));
    for (const f of brainOm) {
      const det = f._assessment_detail;
      if (!det) continue;
      expect(det.organ_threshold, `BRAIN ${f.sex}: threshold should be 0`).toBe(0);
    }
  });

  // A-3 HCD integration
  test.skipIf(!hasGenerated)("OM findings have _hcd_assessment annotation", () => {
    const withHcd = omFindings.filter(f => f._hcd_assessment);
    expect(withHcd.length, "All OM findings should have _hcd_assessment").toBe(omFindings.length);
    for (const f of withHcd) {
      const hcd = f._hcd_assessment;
      expect(["within_hcd", "outside_hcd", "no_hcd"]).toContain(hcd.result);
      expect(typeof hcd.score).toBe("number");
      expect(typeof hcd.detail).toBe("string");
    }
  });

  test.skipIf(!hasGenerated)("HCD downgrade: within_hcd + both gates → equivocal", () => {
    for (const f of omFindings) {
      const det = f._assessment_detail;
      if (!det || !det.hcd_downgrade) continue;
      expect(
        f.finding_class,
        `${f.specimen} ${f.sex}: HCD downgrade should result in equivocal`,
      ).toBe("equivocal");
    }
  });

  test.skipIf(!hasGenerated)("_assessment_detail includes hcd_result field", () => {
    for (const f of omFindings) {
      const det = f._assessment_detail;
      if (!det) continue;
      expect(
        det.hcd_result,
        `${f.specimen} ${f.sex}: _assessment_detail should have hcd_result`,
      ).toBeDefined();
    }
  });
});

// ─── 3. Adaptive tree results (_tree_result) ─────────────────

describe("Adaptive decision trees (_tree_result)", () => {
  const VALID_TREE_IDS = new Set([
    "liver_hall_2012", "thyroid", "adrenal", "thymus_spleen", "kidney", "gastric", "none",
  ]);
  const miFindings = findings.filter(f => f.domain === "MI" || f.domain === "MA");

  test.skipIf(!hasGenerated)("tree_id values are from valid set", () => {
    const violations: string[] = [];
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr) continue;
      if (!VALID_TREE_IDS.has(tr.tree_id)) {
        violations.push(`${f.specimen} — ${f.finding}: invalid tree_id="${tr.tree_id}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  test.skipIf(!hasGenerated)("tree results have rationale", () => {
    const violations: string[] = [];
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr || tr.tree_id === "none") continue;
      if (!tr.rationale || tr.rationale.length === 0) {
        violations.push(`${f.specimen} — ${f.finding} ${f.sex}: tree ${tr.tree_id} has no rationale`);
      }
    }
    expect(violations).toEqual([]);
  });

  test.skipIf(!hasGenerated)("tree results have node_path", () => {
    const violations: string[] = [];
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr || tr.tree_id === "none") continue;
      if (!tr.node_path || tr.node_path.length === 0) {
        violations.push(`${f.specimen} — ${f.finding} ${f.sex}: tree ${tr.tree_id} has no node_path`);
      }
    }
    expect(violations).toEqual([]);
  });

  // Liver tree specific
  test.skipIf(!hasGenerated)("liver tree fires for LIVER HYPERTROPHY", () => {
    const liverHyp = miFindings.filter(
      f => (f.specimen ?? "").toUpperCase().includes("LIVER") &&
        (f.finding ?? "").toLowerCase().includes("hypertrophy") &&
        f._tree_result?.tree_id === "liver_hall_2012",
    );
    expect(
      liverHyp.length,
      "Expected liver Hall 2012 tree to fire for LIVER HYPERTROPHY",
    ).toBeGreaterThan(0);
  });

  test.skipIf(!hasGenerated)("liver tree node_path starts with entry:MI_LIVER_hypertrophy", () => {
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr || tr.tree_id !== "liver_hall_2012") continue;
      expect(
        tr.node_path?.[0],
        `${f.sex}: liver tree should start with entry:MI_LIVER_hypertrophy`,
      ).toBe("entry:MI_LIVER_hypertrophy");
    }
  });

  // Hall 2012 LB panel verification — only applies to findings that reached
  // the N2 panel analysis branch (not the N1 concurrent-adverse early exit)
  test.skipIf(!hasGenerated)("liver tree reports panel marker breakdown in ecetoc_factors", () => {
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr || tr.tree_id !== "liver_hall_2012") continue;
      // Skip findings that took the N1 early exit (concurrent adverse histopath)
      const reachedPanel = (tr.node_path ?? []).some((n: string) => n.startsWith("N2:"));
      if (!reachedPanel) continue;
      // ecetoc_factors should contain panel summary (e.g. "3/7 clean; changed: ALT,AST")
      const factors = tr.ecetoc_factors ?? [];
      const hasPanelDetail = factors.some(
        (fac: string) => /\d+\/\d+ clean/.test(fac),
      );
      expect(
        hasPanelDetail,
        `${f.sex}: liver tree ecetoc_factors should contain panel marker breakdown`,
      ).toBe(true);
    }
  });

  test.skipIf(!hasGenerated)("liver tree rationale lists changed markers", () => {
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr || tr.tree_id !== "liver_hall_2012") continue;
      const reachedPanel = (tr.node_path ?? []).some((n: string) => n.startsWith("N2:"));
      if (!reachedPanel) continue;
      // Rationale should contain "panel:" with marker detail
      expect(
        tr.rationale.toLowerCase(),
        `${f.sex}: liver tree rationale should contain panel detail`,
      ).toContain("panel:");
    }
  });

  test.skipIf(!hasGenerated)("liver tree node_path includes panel counts", () => {
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr || tr.tree_id !== "liver_hall_2012") continue;
      const reachedPanel = (tr.node_path ?? []).some((n: string) => n.startsWith("N2:"));
      if (!reachedPanel) continue;
      const panelNode = (tr.node_path ?? []).find(
        (n: string) => n.startsWith("N2:panel_available="),
      );
      expect(
        panelNode,
        `${f.sex}: liver tree should have panel count in node_path`,
      ).toBeDefined();
    }
  });

  test.skipIf(!hasGenerated)(
    "liver tree with critical marker changed → tr_adverse",
    () => {
      for (const f of miFindings) {
        const tr = f._tree_result;
        if (!tr || tr.tree_id !== "liver_hall_2012") continue;
        // If ALT or AST changed, finding_class must be tr_adverse
        const changedNode = (tr.node_path ?? []).find(
          (n: string) => n.startsWith("N2:ALT_changed") || n.startsWith("N2:AST_changed"),
        );
        if (changedNode) {
          expect(
            f.finding_class,
            `${f.sex}: critical marker changed should → tr_adverse`,
          ).toBe("tr_adverse");
        }
      }
    },
  );

  // Thyroid tree specific
  test.skipIf(!hasGenerated)("thyroid tree fires for THYROID HYPERTROPHY/HYPERPLASIA", () => {
    const thyroidFindings = miFindings.filter(
      f => (f.specimen ?? "").toUpperCase().includes("THYROID") &&
        f._tree_result?.tree_id === "thyroid",
    );
    expect(
      thyroidFindings.length,
      "Expected thyroid tree to fire for thyroid hypertrophy/hyperplasia",
    ).toBeGreaterThan(0);
  });

  test.skipIf(!hasGenerated)("thyroid adaptive findings have human_relevance annotation", () => {
    for (const f of miFindings) {
      const tr = f._tree_result;
      if (!tr || tr.tree_id !== "thyroid") continue;
      if (f.finding_class === "tr_adaptive") {
        expect(
          tr.human_relevance,
          `Thyroid ${f.finding} ${f.sex}: adaptive should have human_relevance`,
        ).toBe("not_relevant_rodent_specific");
      }
    }
  });
});

// ─── 4. Two-gate classification consistency ──────────────────

describe("Two-gate classification rules", () => {
  test.skipIf(!hasGenerated)(
    "context_dependent MI findings without tree match are not tr_adaptive",
    () => {
      const dict = JSON.parse(fs.readFileSync(
        path.join(ROOT, "shared/adversity-dictionary.json"), "utf-8",
      ));
      const ctxTerms: string[] = dict.context_dependent;
      const violations: string[] = [];

      for (const f of findings) {
        if (!["MI", "MA", "TF"].includes(f.domain)) continue;
        if (!f.finding) continue;
        const lower = f.finding.toLowerCase();
        const isCtx = ctxTerms.some(t => lower.includes(t));
        if (!isCtx) continue;

        // If finding_class is tr_adaptive, it must have come from a tree
        if (f.finding_class === "tr_adaptive") {
          const tr = f._tree_result;
          if (!tr || tr.tree_id === "none") {
            violations.push(
              `${f.specimen} — ${f.finding} (${f.sex}): tr_adaptive without tree result`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "context_dependent with tree_id=none are not tr_adaptive",
    () => {
      const violations: string[] = [];
      for (const f of findings) {
        const tr = f._tree_result;
        if (!tr) continue;
        if (tr.tree_id === "none" && f.finding_class === "tr_adaptive") {
          violations.push(
            `${f.specimen} — ${f.finding} (${f.sex}): tr_adaptive but tree_id=none`,
          );
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "OM findings never get _tree_result (wrong domain for trees)",
    () => {
      const omWithTree = findings.filter(
        f => f.domain === "OM" && f._tree_result !== undefined,
      );
      expect(
        omWithTree.length,
        "OM findings should not have _tree_result",
      ).toBe(0);
    },
  );

  test.skipIf(!hasGenerated)(
    "non-OM, non-MI/MA findings use base assess_finding (no tree or detail)",
    () => {
      const otherDomains = findings.filter(
        f => !["OM", "MI", "MA", "TF"].includes(f.domain),
      );
      const withDetail = otherDomains.filter(f => f._assessment_detail);
      const withTree = otherDomains.filter(
        f => f._tree_result && f._tree_result.tree_id !== "none",
      );
      expect(withDetail.length, "Non-OM findings should not have _assessment_detail").toBe(0);
      expect(withTree.length, "Non-histopath findings should not have active _tree_result").toBe(0);
    },
  );
});

// ─── 5. Distribution sanity checks ──────────────────────────

describe("Tier 2 distribution sanity", () => {
  test.skipIf(!hasGenerated)("all 5 finding_class categories are populated", () => {
    const categories = new Set(findings.map(f => f.finding_class));
    expect(categories.size, `Only ${categories.size} categories`).toBe(5);
  });

  test.skipIf(!hasGenerated)("tr_adaptive count > 0 (trees are firing)", () => {
    const adaptiveCount = findings.filter(f => f.finding_class === "tr_adaptive").length;
    expect(adaptiveCount, "Expected some adaptive findings from trees").toBeGreaterThan(0);
  });

  test.skipIf(!hasGenerated)("OM findings use at least 3 distinct organ thresholds", () => {
    const methods = new Set(
      findings
        .filter(f => f.domain === "OM" && f._assessment_detail)
        .map(f => f._assessment_detail!.method),
    );
    expect(
      methods.size,
      `Only ${methods.size} distinct methods: ${[...methods].join(", ")}`,
    ).toBeGreaterThanOrEqual(3);
  });

  test.skipIf(!hasGenerated)("at least 2 distinct tree_ids fire (not counting none)", () => {
    const treeIds = new Set(
      findings
        .filter(f => f._tree_result && f._tree_result.tree_id !== "none")
        .map(f => f._tree_result!.tree_id),
    );
    expect(
      treeIds.size,
      `Only ${treeIds.size} tree(s) fired: ${[...treeIds].join(", ")}`,
    ).toBeGreaterThanOrEqual(2);
  });
});

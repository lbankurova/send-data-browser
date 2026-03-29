/**
 * finding-class.test.ts — ECETOC per-finding adversity assessment tests
 *
 * Validates the finding_class field in unified_findings.json, the adversity
 * dictionary in shared/adversity-dictionary.json, NOAEL derivation traces,
 * and R04 finding_class_disagrees annotations.
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const UNIFIED_PATH = path.join(ROOT, "backend/generated/PointCross/unified_findings.json");
const NOAEL_PATH = path.join(ROOT, "backend/generated/PointCross/noael_summary.json");
const RULES_PATH = path.join(ROOT, "backend/generated/PointCross/rule_results.json");
const DICT_PATH = path.join(ROOT, "shared/adversity-dictionary.json");

// ─── Guards ─────────────────────────────────────────────────

const hasGenerated = fs.existsSync(UNIFIED_PATH);

// ─── Load data ──────────────────────────────────────────────

interface ConfidenceDim {
  dimension: string;
  label: string;
  score: number | null;
  rationale: string;
}

interface Confidence {
  dimensions: ConfidenceDim[];
  grade_sum: number;
  n_scored: number;
  n_skipped: number;
  grade: "HIGH" | "MODERATE" | "LOW";
}

interface Finding {
  id: string;
  domain: string;
  test_code: string;
  test_name: string;
  specimen: string | null;
  finding: string;
  sex: string;
  severity: string;
  treatment_related: boolean;
  finding_class?: string;
  corroboration_status?: string;
  min_p_adj: number | null;
  max_effect_size: number | null;
  trend_p: number | null;
  dose_response_pattern: string | null;
  direction: string | null;
  data_type: string;
  _confidence?: Confidence;
  _hcd_assessment?: { result: string };
}

interface NoaelRow {
  sex: string;
  noael_dose_level: number | null;
  loael_dose_level: number | null;
  n_adverse_at_loael: number;
  noael_confidence: number;
  noael_derivation: {
    method: string;
    classification_method?: string;
    adverse_findings_at_loael: Array<{
      finding: string;
      domain: string;
      p_value: number;
      finding_class?: string;
      corroboration_status?: string;
    }>;
  };
}

interface RuleResult {
  rule_id: string;
  params: Record<string, unknown>;
}

const findings: Finding[] = hasGenerated
  ? JSON.parse(fs.readFileSync(UNIFIED_PATH, "utf-8")).findings
  : [];

const noael: NoaelRow[] = hasGenerated
  ? JSON.parse(fs.readFileSync(NOAEL_PATH, "utf-8"))
  : [];

const rules: RuleResult[] = hasGenerated
  ? JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"))
  : [];

const VALID_CLASSES = new Set([
  "not_treatment_related",
  "tr_non_adverse",
  "tr_adaptive",
  "tr_adverse",
  "equivocal",
]);

// ─── Adversity Dictionary Tests ─────────────────────────────

describe("adversity-dictionary.json", () => {
  const dict = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));

  test("has three tiers", () => {
    expect(Object.keys(dict).sort()).toEqual([
      "always_adverse",
      "context_dependent",
      "likely_adverse",
    ]);
  });

  test("each tier is a non-empty string array", () => {
    for (const [tier, terms] of Object.entries(dict)) {
      expect(Array.isArray(terms), `${tier} is not an array`).toBe(true);
      expect((terms as string[]).length, `${tier} is empty`).toBeGreaterThan(0);
      for (const t of terms as string[]) {
        expect(typeof t, `${tier} has non-string entry`).toBe("string");
        expect(t.length, `${tier} has empty string`).toBeGreaterThan(0);
      }
    }
  });

  test("all terms are lowercase", () => {
    const violations: string[] = [];
    for (const [tier, terms] of Object.entries(dict)) {
      for (const t of terms as string[]) {
        if (t !== t.toLowerCase()) {
          violations.push(`${tier}: "${t}" should be "${t.toLowerCase()}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("no duplicate terms across tiers", () => {
    const all = [
      ...dict.always_adverse,
      ...dict.likely_adverse,
      ...dict.context_dependent,
    ];
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const t of all) {
      if (seen.has(t)) dupes.push(t);
      seen.add(t);
    }
    expect(dupes).toEqual([]);
  });

  test("known always_adverse terms are present", () => {
    const required = ["necrosis", "fibrosis", "carcinoma", "sarcoma"];
    for (const term of required) {
      expect(
        dict.always_adverse.includes(term),
        `missing always_adverse: ${term}`,
      ).toBe(true);
    }
  });

  test("known context_dependent terms are present", () => {
    const required = ["hypertrophy", "hyperplasia"];
    for (const term of required) {
      expect(
        dict.context_dependent.includes(term),
        `missing context_dependent: ${term}`,
      ).toBe(true);
    }
  });
});

// ─── finding_class Field Tests ──────────────────────────────

describe("finding_class in unified_findings.json", () => {
  test.skipIf(!hasGenerated)("every finding has a finding_class field", () => {
    const missing = findings.filter((f) => f.finding_class === undefined);
    expect(missing.length, `${missing.length} findings lack finding_class`).toBe(0);
  });

  test.skipIf(!hasGenerated)("all finding_class values are valid", () => {
    const invalid = findings.filter(
      (f) => f.finding_class !== undefined && !VALID_CLASSES.has(f.finding_class),
    );
    if (invalid.length > 0) {
      const examples = invalid.slice(0, 3).map(
        (f) => `${f.id}: "${f.finding_class}"`,
      );
      expect.fail(`Invalid finding_class values: ${examples.join(", ")}`);
    }
  });

  test.skipIf(!hasGenerated)("distribution has at least 3 categories populated", () => {
    const categories = new Set(findings.map((f) => f.finding_class));
    expect(
      categories.size,
      `Only ${categories.size} categories: ${[...categories].join(", ")}`,
    ).toBeGreaterThanOrEqual(3);
  });

  test.skipIf(!hasGenerated)("not_treatment_related is the largest category", () => {
    const counts = new Map<string, number>();
    for (const f of findings) {
      const c = f.finding_class ?? "missing";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const ntr = counts.get("not_treatment_related") ?? 0;
    const max = Math.max(...counts.values());
    expect(ntr, "not_treatment_related should be the most common class").toBe(max);
  });

  // ─── Logical consistency ───────────────────────────────

  test.skipIf(!hasGenerated)(
    "not_treatment_related findings should not be treatment_related",
    () => {
      const violations = findings.filter(
        (f) => f.finding_class === "not_treatment_related" && f.treatment_related,
      );
      // Note: finding_class uses A-factor scoring (≥1.0) which differs from
      // determine_treatment_related(). Some disagreement is expected when the
      // legacy function uses severity+DR pattern shortcuts. Only flag gross violations.
      // We allow a small number of edge cases.
      expect(
        violations.length,
        `${violations.length} not_treatment_related findings have treatment_related=true`,
      ).toBeLessThan(findings.length * 0.1);
    },
  );

  test.skipIf(!hasGenerated)(
    "tr_adverse findings should have some statistical or biological evidence",
    () => {
      const violations: string[] = [];
      for (const f of findings) {
        if (f.finding_class !== "tr_adverse") continue;
        const hasP = f.min_p_adj !== null && f.min_p_adj < 0.1;
        const hasTrend = f.trend_p !== null && f.trend_p < 0.1;
        const hasPattern = f.dose_response_pattern !== null &&
          f.dose_response_pattern !== "flat" &&
          f.dose_response_pattern !== "insufficient_data";
        const hasLargeEffect = f.max_effect_size !== null &&
          Math.abs(f.max_effect_size) >= 1.5;
        const hasCorroboration = f.corroboration_status === "corroborated";
        // B-6 progression chain escalation is valid biological evidence
        const b6 = (f as Record<string, unknown>)._b6_result as
          | { fires: boolean }
          | undefined;
        const hasB6Escalation = b6?.fires === true;
        // tr_adverse requires A-score >= 1.0 (treatment-related) plus B-factor
        // evidence. Valid paths: large effect, dictionary override,
        // moderate effect + corroboration, or B-6 progression chain.
        if (!hasP && !hasTrend && !hasPattern && !hasLargeEffect && !hasCorroboration && !hasB6Escalation) {
          violations.push(
            `${f.test_name ?? f.test_code} (${f.sex}): no evidence at all`,
          );
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "equivocal should not overlap with clear not_treatment_related",
    () => {
      // Equivocal means mixed evidence — should have SOME signal
      const violations: string[] = [];
      for (const f of findings) {
        if (f.finding_class !== "equivocal") continue;
        const hasAnySignal =
          (f.min_p_adj !== null && f.min_p_adj < 0.2) ||
          (f.trend_p !== null && f.trend_p < 0.2) ||
          (f.max_effect_size !== null && Math.abs(f.max_effect_size) >= 0.3) ||
          // MI: avg_severity is the domain-appropriate magnitude (not effect size)
          (f.avg_severity !== null && f.avg_severity !== undefined && f.avg_severity > 0) ||
          (f.dose_response_pattern !== null &&
            !["flat", "insufficient_data"].includes(f.dose_response_pattern));
        if (!hasAnySignal) {
          violations.push(
            `${f.test_name ?? f.test_code} (${f.sex}): equivocal but no signal`,
          );
        }
      }
      expect(violations).toEqual([]);
    },
  );

  // ─── Histopath-specific rules ──────────────────────────

  test.skipIf(!hasGenerated)(
    "always_adverse histopath terms with signal should be tr_adverse",
    () => {
      const dict = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
      const alwaysTerms: string[] = dict.always_adverse;

      const violations: string[] = [];
      for (const f of findings) {
        if (!["MI", "MA", "TF"].includes(f.domain)) continue;
        if (!f.finding) continue;
        const lower = f.finding.toLowerCase();
        const isAlways = alwaysTerms.some((t) => lower.includes(t));
        if (!isAlways) continue;

        // If it has signal (A-score ≥ 1), should be tr_adverse
        const hasSignal =
          (f.min_p_adj !== null && f.min_p_adj < 0.05) ||
          (f.trend_p !== null && f.trend_p < 0.05) ||
          (f.dose_response_pattern !== null &&
            ["monotonic_increase", "monotonic_decrease"].includes(
              f.dose_response_pattern,
            ));
        if (hasSignal && f.finding_class !== "tr_adverse") {
          violations.push(
            `${f.specimen} — ${f.finding} (${f.sex}): always_adverse with signal but finding_class=${f.finding_class}`,
          );
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "context_dependent histopath terms should not be tr_adverse unless large magnitude or tree decision",
    () => {
      const dict = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
      const ctxTerms: string[] = dict.context_dependent;

      const violations: string[] = [];
      for (const f of findings) {
        if (!["MI", "MA", "TF"].includes(f.domain)) continue;
        if (!f.finding) continue;
        const lower = f.finding.toLowerCase();
        const isCtx = ctxTerms.some((t) => lower.includes(t));
        if (!isCtx) continue;

        if (f.finding_class === "tr_adverse") {
          // Valid paths to tr_adverse for context_dependent:
          // 1. Large magnitude (|d| >= 1.5) — base assess_finding B-factor
          // 2. Adaptive tree decision (tree routed to adverse based on biological evidence)
          const d = f.max_effect_size;
          const hasLargeMagnitude = d !== null && Math.abs(d) >= 1.5;
          const treeResult = (f as Record<string, unknown>)._tree_result as
            | { tree_id: string }
            | undefined;
          const hasTreeDecision =
            treeResult !== undefined && treeResult.tree_id !== "none";
          if (!hasLargeMagnitude && !hasTreeDecision) {
            violations.push(
              `${f.specimen} — ${f.finding} (${f.sex}): context_dependent classified as tr_adverse but |d|=${d} and no tree decision`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );
});

// ─── NOAEL Derivation Trace Tests ───────────────────────────

describe("NOAEL derivation with finding_class", () => {
  test.skipIf(!hasGenerated)(
    "derivation trace includes classification_method",
    () => {
      for (const row of noael) {
        const method = row.noael_derivation?.classification_method;
        expect(
          method,
          `${row.sex}: missing classification_method in derivation`,
        ).toBeDefined();
        expect(
          ["finding_class", "legacy_severity"].includes(method!),
          `${row.sex}: invalid classification_method "${method}"`,
        ).toBe(true);
      }
    },
  );

  test.skipIf(!hasGenerated)(
    "adverse_findings_at_loael include finding_class and corroboration_status",
    () => {
      for (const row of noael) {
        if (row.noael_derivation.adverse_findings_at_loael.length === 0) continue;
        for (const af of row.noael_derivation.adverse_findings_at_loael) {
          expect(
            af.finding_class,
            `${row.sex}: ${af.finding} missing finding_class in derivation`,
          ).toBeDefined();
          expect(
            af.corroboration_status,
            `${row.sex}: ${af.finding} missing corroboration_status in derivation`,
          ).toBeDefined();
        }
      }
    },
  );

  test.skipIf(!hasGenerated)(
    "when classification_method is finding_class, all LOAEL findings are tr_adverse",
    () => {
      const violations: string[] = [];
      for (const row of noael) {
        if (row.noael_derivation?.classification_method !== "finding_class") continue;
        for (const af of row.noael_derivation.adverse_findings_at_loael) {
          if (af.finding_class !== "tr_adverse") {
            violations.push(
              `${row.sex}: ${af.finding} (${af.domain}) at LOAEL has finding_class="${af.finding_class}"`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)("confidence is between 0 and 1", () => {
    for (const row of noael) {
      expect(row.noael_confidence).toBeGreaterThanOrEqual(0);
      expect(row.noael_confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── R04 Annotation Tests ───────────────────────────────────

describe("R04 finding_class annotations", () => {
  const r04s = rules.filter((r) => r.rule_id === "R04");

  test.skipIf(!hasGenerated)("R04 results have finding_class in params", () => {
    const missing = r04s.filter((r) => r.params?.finding_class === undefined);
    expect(
      missing.length,
      `${missing.length}/${r04s.length} R04 results lack finding_class`,
    ).toBe(0);
  });

  test.skipIf(!hasGenerated)(
    "finding_class_disagrees is set when finding_class != tr_adverse",
    () => {
      const violations: string[] = [];
      for (const r of r04s) {
        const fc = r.params?.finding_class as string | undefined;
        const disagrees = r.params?.finding_class_disagrees as boolean | undefined;
        if (fc && fc !== "tr_adverse" && !disagrees) {
          violations.push(
            `${r.params?.endpoint_label}: finding_class="${fc}" but finding_class_disagrees not set`,
          );
        }
        if (fc === "tr_adverse" && disagrees) {
          violations.push(
            `${r.params?.endpoint_label}: finding_class="tr_adverse" but finding_class_disagrees=true`,
          );
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "disagrees count is non-zero (backend and ECETOC should diverge on some findings)",
    () => {
      const disagreeCount = r04s.filter(
        (r) => r.params?.finding_class_disagrees,
      ).length;
      expect(
        disagreeCount,
        "Expected some findings where legacy severity and ECETOC disagree",
      ).toBeGreaterThan(0);
    },
  );
});

// ─── B-6 Progression Chain Tests ──────────────────────────────

describe("B-6 progression chains in unified_findings.json", () => {
  const miMaTfFindings = findings.filter((f) =>
    ["MI", "MA", "TF"].includes(f.domain),
  );

  test.skipIf(!hasGenerated)(
    "treatment-related MI/MA/TF findings matching chains have _b6_result",
    () => {
      // Not all findings match chains — only check that _b6_result is
      // structurally valid when present
      const withB6 = miMaTfFindings.filter(
        (f) => (f as Record<string, unknown>)._b6_result !== undefined,
      );
      expect(
        withB6.length,
        "Expected at least some MI/MA/TF findings to match progression chains",
      ).toBeGreaterThan(0);

      for (const f of withB6) {
        const b6 = (f as Record<string, unknown>)._b6_result as Record<
          string,
          unknown
        >;
        expect(b6.chain_id, `${f.finding}: missing chain_id`).toBeDefined();
        expect(b6.stage, `${f.finding}: missing stage`).toBeDefined();
        expect(b6.fires, `${f.finding}: missing fires`).toBeDefined();
        expect(b6.rationale, `${f.finding}: missing rationale`).toBeDefined();
        expect(
          typeof b6.fires,
          `${f.finding}: fires should be boolean`,
        ).toBe("boolean");
        expect(
          ["early", "intermediate", "late"].includes(b6.stage as string),
          `${f.finding}: invalid stage "${b6.stage}"`,
        ).toBe(true);
      }
    },
  );

  test.skipIf(!hasGenerated)(
    "B-6 fires only escalates treatment-related findings",
    () => {
      const violations: string[] = [];
      for (const f of miMaTfFindings) {
        const b6 = (f as Record<string, unknown>)._b6_result as
          | { fires: boolean; chain_id: string }
          | undefined;
        if (!b6 || !b6.fires) continue;
        // If B-6 fires and finding_class is tr_adverse, the finding must
        // have been treatment-related (A-score >= 1.0 means it had signal)
        if (f.finding_class === "tr_adverse" && !f.treatment_related) {
          // A-score ≥ 1.0 from ECETOC engine doesn't always match legacy
          // treatment_related, so we just check it's not a gross violation
          const hasAnySignal =
            (f.min_p_adj !== null && f.min_p_adj < 0.2) ||
            (f.trend_p !== null && f.trend_p < 0.2) ||
            (f.max_effect_size !== null && Math.abs(f.max_effect_size) >= 0.3);
          if (!hasAnySignal) {
            violations.push(
              `${f.specimen} — ${f.finding} (${f.sex}): B-6 fired but no signal at all`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );

  test.skipIf(!hasGenerated)(
    "_b6_result.chain_id references valid chain IDs",
    () => {
      const VALID_CHAIN_IDS = new Set([
        "LIVER_NEOPLASTIC", "KIDNEY_CPN", "KIDNEY_ALPHA2U",
        "THYROID_FOLLICULAR", "ADRENAL_PHEO", "TESTIS_LEYDIG",
        "LUNG_ALVEOLAR", "FORESTOMACH_SQUAMOUS", "BLADDER_UROTHELIAL",
        "MAMMARY_GLAND", "PANCREAS_ACINAR", "NASAL_SQUAMOUS",
        "LIVER_FIBROSIS", "HEART_CARDIOMYOPATHY",
      ]);
      const invalid: string[] = [];
      for (const f of miMaTfFindings) {
        const b6 = (f as Record<string, unknown>)._b6_result as
          | { chain_id: string }
          | undefined;
        if (!b6) continue;
        if (!VALID_CHAIN_IDS.has(b6.chain_id)) {
          invalid.push(`${f.finding}: unknown chain_id "${b6.chain_id}"`);
        }
      }
      expect(invalid).toEqual([]);
    },
  );
});

// ─── Track 4A: GRADE Confidence Scoring ─────────────────────

describe.runIf(hasGenerated)(
  "_confidence in unified_findings.json",
  () => {
    test("every finding has _confidence", () => {
      const missing = findings.filter((f) => !f._confidence);
      expect(missing.length).toBe(0);
    });

    test("_confidence structure is valid", () => {
      const VALID_DIMS = new Set(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"]);
      const VALID_GRADES = new Set(["HIGH", "MODERATE", "LOW"]);
      const bad: string[] = [];
      for (const f of findings) {
        const c = f._confidence!;
        if (!VALID_GRADES.has(c.grade)) {
          bad.push(`${f.id}: invalid grade "${c.grade}"`);
        }
        if (c.dimensions.length !== 9) {
          bad.push(`${f.id}: expected 9 dimensions, got ${c.dimensions.length}`);
        }
        for (const d of c.dimensions) {
          if (!VALID_DIMS.has(d.dimension)) {
            bad.push(`${f.id}: unknown dimension "${d.dimension}"`);
          }
          // D8 can score -2 (severely underpowered)
          if (d.score !== null && ![-2, -1, 0, 1].includes(d.score)) {
            bad.push(`${f.id}/${d.dimension}: invalid score ${d.score}`);
          }
        }
        if (c.n_scored + c.n_skipped !== 9) {
          bad.push(`${f.id}: n_scored(${c.n_scored}) + n_skipped(${c.n_skipped}) != 9`);
        }
      }
      expect(bad).toEqual([]);
    });

    test("grade distribution has meaningful spread", () => {
      const grades = new Map<string, number>();
      for (const f of findings) {
        const g = f._confidence!.grade;
        grades.set(g, (grades.get(g) ?? 0) + 1);
      }
      // Should have at least 2 different grades
      expect(grades.size).toBeGreaterThanOrEqual(2);
      // No single grade should have 100%
      for (const [, count] of grades) {
        expect(count).toBeLessThan(findings.length);
      }
    });

    test("D4 scored only for OM findings with HCD", () => {
      const wronglyScored: string[] = [];
      for (const f of findings) {
        const d4 = f._confidence!.dimensions.find((d) => d.dimension === "D4");
        if (!d4) continue;
        if (d4.score !== null) {
          // Must have _hcd_assessment with non-"no_hcd" result
          const hcd = f._hcd_assessment;
          if (!hcd || hcd.result === "no_hcd") {
            wronglyScored.push(`${f.id}: D4 scored=${d4.score} but no HCD`);
          }
        }
      }
      expect(wronglyScored).toEqual([]);
    });

    test("D5 skipped for sex-specific organs", () => {
      const SEX_SPECIFIC = new Set([
        "TESTES", "OVARIES", "UTERUS", "PROSTATE",
        "EPIDIDYMIS", "SEMINAL VESICLE", "MAMMARY GLAND",
      ]);
      const wronglyScored: string[] = [];
      for (const f of findings) {
        if (!f.specimen) continue;
        if (!SEX_SPECIFIC.has(f.specimen.toUpperCase())) continue;
        const d5 = f._confidence!.dimensions.find((d) => d.dimension === "D5");
        if (d5 && d5.score !== null) {
          wronglyScored.push(`${f.id}: D5 scored for sex-specific organ ${f.specimen}`);
        }
      }
      expect(wronglyScored).toEqual([]);
    });

    test("HIGH confidence + tr_adverse findings exist (≥2)", () => {
      const highAdverse = findings.filter(
        (f) =>
          f._confidence!.grade === "HIGH" &&
          f.finding_class === "tr_adverse",
      );
      expect(highAdverse.length).toBeGreaterThanOrEqual(2);
    });

    test("grade_sum correctly determines grade", () => {
      const bad: string[] = [];
      for (const f of findings) {
        const c = f._confidence!;
        const expected =
          c.grade_sum >= 2 ? "HIGH" : c.grade_sum >= 0 ? "MODERATE" : "LOW";
        if (c.grade !== expected) {
          bad.push(
            `${f.id}: grade_sum=${c.grade_sum}, grade="${c.grade}", expected="${expected}"`,
          );
        }
      }
      expect(bad).toEqual([]);
    });
  },
);

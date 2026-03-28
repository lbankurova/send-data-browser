import { describe, test, expect } from "vitest";
import { evaluateCondition } from "@/lib/rule-evaluator";
import type { RuleCondition, EvalContext } from "@/lib/rule-evaluator";

/** Minimal context factory — all fields empty by default. */
function ctx(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    foldChanges: new Map(),
    presentCanonicals: new Set(),
    endpointDirection: new Map(),
    endpointPattern: new Map(),
    sexes: new Map(),
    coherenceDomainCount: 0,
    syndromeMatched: false,
    ...overrides,
  };
}

// ─── Primitive: direction ────────────────────────────────────

describe("direction primitive", () => {
  const cond: RuleCondition = { type: "direction", canonical: "ALT", direction: "up" };

  test("true when canonical present and direction matches", () => {
    const c = ctx({
      presentCanonicals: new Set(["ALT"]),
      endpointDirection: new Map([["ALT", "up"]]),
    });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("false when direction differs", () => {
    const c = ctx({
      presentCanonicals: new Set(["ALT"]),
      endpointDirection: new Map([["ALT", "down"]]),
    });
    expect(evaluateCondition(cond, c)).toBe(false);
  });

  test("false when canonical not present", () => {
    expect(evaluateCondition(cond, ctx())).toBe(false);
  });
});

// ─── Primitive: fold_above ───────────────────────────────────

describe("fold_above primitive", () => {
  const cond: RuleCondition = { type: "fold_above", canonical: "ALT", threshold: 2 };

  test("true when fold change meets threshold", () => {
    const c = ctx({ foldChanges: new Map([["ALT", 3.5]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("true at exact threshold", () => {
    const c = ctx({ foldChanges: new Map([["ALT", 2.0]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("false below threshold", () => {
    const c = ctx({ foldChanges: new Map([["ALT", 1.5]]) });
    expect(evaluateCondition(cond, c)).toBe(false);
  });

  test("handles decrease fold changes (reciprocal)", () => {
    // FC=0.4 → magnitude=1/0.4=2.5 → meets threshold 2
    const c = ctx({ foldChanges: new Map([["ALT", 0.4]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("false when canonical missing (defaults to 0)", () => {
    expect(evaluateCondition(cond, ctx())).toBe(false);
  });
});

// ─── Primitive: fold_between ─────────────────────────────────

describe("fold_between primitive", () => {
  const cond: RuleCondition = { type: "fold_between", canonical: "ALT", gte: 2, lt: 5 };

  test("true within range", () => {
    const c = ctx({ foldChanges: new Map([["ALT", 3.0]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("true at lower bound", () => {
    const c = ctx({ foldChanges: new Map([["ALT", 2.0]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("false at upper bound (exclusive)", () => {
    const c = ctx({ foldChanges: new Map([["ALT", 5.0]]) });
    expect(evaluateCondition(cond, c)).toBe(false);
  });

  test("false below range", () => {
    const c = ctx({ foldChanges: new Map([["ALT", 1.5]]) });
    expect(evaluateCondition(cond, c)).toBe(false);
  });
});

// ─── Primitive: count_present ────────────────────────────────

describe("count_present primitive", () => {
  test("lt operator", () => {
    const cond: RuleCondition = {
      type: "count_present",
      canonicals: ["ALT", "AST", "SDH", "GDH"],
      operator: "lt",
      value: 2,
    };
    // Only ALT present → count=1 < 2 → true
    const c1 = ctx({ presentCanonicals: new Set(["ALT"]) });
    expect(evaluateCondition(cond, c1)).toBe(true);

    // ALT + AST present → count=2, not < 2 → false
    const c2 = ctx({ presentCanonicals: new Set(["ALT", "AST"]) });
    expect(evaluateCondition(cond, c2)).toBe(false);
  });

  test("gte operator", () => {
    const cond: RuleCondition = {
      type: "count_present",
      canonicals: ["ALT", "AST"],
      operator: "gte",
      value: 2,
    };
    const c = ctx({ presentCanonicals: new Set(["ALT", "AST", "BUN"]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });
});

// ─── Primitive: share_sex ────────────────────────────────────

describe("share_sex primitive", () => {
  const cond: RuleCondition = { type: "share_sex", canonical_a: "ALT", canonical_b: "TBILI" };

  test("true when sexes overlap", () => {
    const c = ctx({ sexes: new Map([["ALT", ["M", "F"]], ["TBILI", ["M"]]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("false when sexes don't overlap", () => {
    const c = ctx({ sexes: new Map([["ALT", ["M"]], ["TBILI", ["F"]]]) });
    expect(evaluateCondition(cond, c)).toBe(false);
  });

  test("true when sex data missing (don't block)", () => {
    const c = ctx({ sexes: new Map([["ALT", ["M"]]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });
});

// ─── Primitive: pattern_match ────────────────────────────────

describe("pattern_match primitive", () => {
  const cond: RuleCondition = {
    type: "pattern_match",
    canonical: "ALT",
    patterns: ["monotonic_increase", "threshold"],
  };

  test("true when pattern matches", () => {
    const c = ctx({ endpointPattern: new Map([["ALT", "monotonic_increase"]]) });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("false when pattern doesn't match", () => {
    const c = ctx({ endpointPattern: new Map([["ALT", "flat"]]) });
    expect(evaluateCondition(cond, c)).toBe(false);
  });

  test("false when no pattern data", () => {
    expect(evaluateCondition(cond, ctx())).toBe(false);
  });
});

// ─── Primitive: context_property ─────────────────────────────

describe("context_property primitive", () => {
  test("coherenceDomainCount gte", () => {
    const cond: RuleCondition = {
      type: "context_property",
      property: "coherenceDomainCount",
      operator: "gte",
      value: 3,
    };
    expect(evaluateCondition(cond, ctx({ coherenceDomainCount: 3 }))).toBe(true);
    expect(evaluateCondition(cond, ctx({ coherenceDomainCount: 2 }))).toBe(false);
  });

  test("syndromeMatched eq", () => {
    const cond: RuleCondition = {
      type: "context_property",
      property: "syndromeMatched",
      operator: "eq",
      value: true,
    };
    expect(evaluateCondition(cond, ctx({ syndromeMatched: true }))).toBe(true);
    expect(evaluateCondition(cond, ctx({ syndromeMatched: false }))).toBe(false);
  });
});

// ─── Composition: and / or / not ─────────────────────────────

describe("composition operators", () => {
  test("and — all must pass", () => {
    const cond: RuleCondition = {
      type: "and",
      conditions: [
        { type: "direction", canonical: "ALT", direction: "up" },
        { type: "fold_above", canonical: "ALT", threshold: 2 },
      ],
    };
    const c = ctx({
      presentCanonicals: new Set(["ALT"]),
      endpointDirection: new Map([["ALT", "up"]]),
      foldChanges: new Map([["ALT", 3]]),
    });
    expect(evaluateCondition(cond, c)).toBe(true);

    // direction wrong → and fails
    const c2 = ctx({
      presentCanonicals: new Set(["ALT"]),
      endpointDirection: new Map([["ALT", "down"]]),
      foldChanges: new Map([["ALT", 3]]),
    });
    expect(evaluateCondition(cond, c2)).toBe(false);
  });

  test("or — any can pass", () => {
    const cond: RuleCondition = {
      type: "or",
      conditions: [
        { type: "direction", canonical: "ALT", direction: "up" },
        { type: "direction", canonical: "AST", direction: "up" },
      ],
    };
    // Only AST up → true
    const c = ctx({
      presentCanonicals: new Set(["AST"]),
      endpointDirection: new Map([["AST", "up"]]),
    });
    expect(evaluateCondition(cond, c)).toBe(true);
  });

  test("not — inverts", () => {
    const cond: RuleCondition = {
      type: "not",
      condition: { type: "direction", canonical: "ALP", direction: "up" },
    };
    // ALP not present → direction returns false → not returns true
    expect(evaluateCondition(cond, ctx())).toBe(true);

    // ALP up → direction returns true → not returns false
    const c = ctx({
      presentCanonicals: new Set(["ALP"]),
      endpointDirection: new Map([["ALP", "up"]]),
    });
    expect(evaluateCondition(cond, c)).toBe(false);
  });
});

// ─── Integration: full rule condition trees ──────────────────

describe("full rule condition trees", () => {
  test("L01 (ALT moderate): up + fold 2-5", () => {
    const cond: RuleCondition = {
      type: "and",
      conditions: [
        { type: "direction", canonical: "ALT", direction: "up" },
        { type: "fold_between", canonical: "ALT", gte: 2, lt: 5 },
      ],
    };

    // Fold 3 → within [2, 5) → true
    const c1 = ctx({
      presentCanonicals: new Set(["ALT"]),
      endpointDirection: new Map([["ALT", "up"]]),
      foldChanges: new Map([["ALT", 3]]),
    });
    expect(evaluateCondition(cond, c1)).toBe(true);

    // Fold 6 → ≥5 → L01 should NOT fire (L02 would catch this)
    const c2 = ctx({
      presentCanonicals: new Set(["ALT"]),
      endpointDirection: new Map([["ALT", "up"]]),
      foldChanges: new Map([["ALT", 6]]),
    });
    expect(evaluateCondition(cond, c2)).toBe(false);
  });

  test("L04 (isolated bilirubin): TBILI up, no ALT/AST/ALP/GGT", () => {
    const cond: RuleCondition = {
      type: "and",
      conditions: [
        { type: "direction", canonical: "TBILI", direction: "up" },
        { type: "not", condition: { type: "direction", canonical: "ALT", direction: "up" } },
        { type: "not", condition: { type: "direction", canonical: "AST", direction: "up" } },
        { type: "not", condition: { type: "direction", canonical: "ALP", direction: "up" } },
        { type: "not", condition: { type: "direction", canonical: "GGT", direction: "up" } },
      ],
    };

    // Isolated TBILI → true
    const c1 = ctx({
      presentCanonicals: new Set(["TBILI"]),
      endpointDirection: new Map([["TBILI", "up"]]),
    });
    expect(evaluateCondition(cond, c1)).toBe(true);

    // TBILI + ALT both up → false (not isolated)
    const c2 = ctx({
      presentCanonicals: new Set(["TBILI", "ALT"]),
      endpointDirection: new Map([["TBILI", "up"], ["ALT", "up"]]),
    });
    expect(evaluateCondition(cond, c2)).toBe(false);
  });

  test("L20 (bidirectional): either direction + fold threshold", () => {
    const cond: RuleCondition = {
      type: "and",
      conditions: [
        {
          type: "or",
          conditions: [
            { type: "direction", canonical: "K", direction: "up" },
            { type: "direction", canonical: "K", direction: "down" },
          ],
        },
        { type: "fold_above", canonical: "K", threshold: 1.5 },
      ],
    };

    // K down, fold 0.5 → magnitude 2.0 → true
    const c = ctx({
      presentCanonicals: new Set(["K"]),
      endpointDirection: new Map([["K", "down"]]),
      foldChanges: new Map([["K", 0.5]]),
    });
    expect(evaluateCondition(cond, c)).toBe(true);
  });
});

// ─── Parity: all JSON conditions load without error ──────────

describe("JSON condition parity", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rulesConfig = require("../../shared/rules/lab-clinical-rules.json");

  test("all rules have conditions field", () => {
    for (const rule of rulesConfig.rules) {
      expect(rule.conditions, `Rule ${rule.id} missing conditions`).toBeDefined();
    }
  });

  test("all conditions evaluate without throwing", () => {
    const c = ctx({
      presentCanonicals: new Set(["ALT", "AST", "TBILI"]),
      endpointDirection: new Map([["ALT", "up"], ["AST", "up"], ["TBILI", "up"]]),
      foldChanges: new Map([["ALT", 3], ["AST", 2], ["TBILI", 1.5]]),
      sexes: new Map([["ALT", ["M"]], ["AST", ["M"]], ["TBILI", ["M"]]]),
      endpointPattern: new Map([["ALT", "monotonic_increase"]]),
      coherenceDomainCount: 3,
      syndromeMatched: true,
    });

    for (const rule of rulesConfig.rules) {
      expect(() => evaluateCondition(rule.conditions as RuleCondition, c)).not.toThrow();
    }
  });
});

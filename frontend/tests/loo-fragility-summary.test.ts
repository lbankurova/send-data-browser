// Unit tests for the Overview LOO-fragility aggregation. Verifies the
// numerator/denominator semantics against PointCross fixture data per
// peer-review F8 ("59 of 135 LOO-tested findings, 135 of 415 total findings
// had LOO testing run").

import { describe, it, expect } from "vitest";
import { aggregateLooFragility } from "@/hooks/useLooFragilitySummary";
import type { UnifiedFinding } from "@/types/analysis";

describe("aggregateLooFragility — synthetic", () => {
  it("returns zero counts for undefined", () => {
    const out = aggregateLooFragility(undefined);
    expect(out).toEqual({ fragileCount: 0, looTested: 0, totalFindings: 0 });
  });

  it("counts only findings with non-null loo_stability as LOO-tested", () => {
    const findings: UnifiedFinding[] = [
      { loo_stability: 0.9, loo_control_fragile: false } as unknown as UnifiedFinding,
      { loo_stability: 0.5, loo_control_fragile: true } as unknown as UnifiedFinding,
      { loo_stability: null, loo_control_fragile: null } as unknown as UnifiedFinding,
      { /* no loo fields */ } as unknown as UnifiedFinding,
    ];
    expect(aggregateLooFragility(findings)).toEqual({
      fragileCount: 1,
      looTested: 2,
      totalFindings: 4,
    });
  });
});

describe("aggregateLooFragility vs PointCross fixture (CLAUDE.md rule 16)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let findings: UnifiedFinding[] | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    const fixturePath = path.resolve(
      __dirname,
      "../../backend/generated/PointCross/unified_findings.json",
    );
    if (fs.existsSync(fixturePath)) {
      const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      findings = (data.findings ?? []) as UnifiedFinding[];
    }
  } catch {
    findings = null;
  }
  const itIfFixture = findings && findings.length > 0 ? it : it.skip;

  itIfFixture(
    "matches spec: 59 fragile, 135 LOO-tested, 415 total on PointCross",
    () => {
      const out = aggregateLooFragility(findings!);
      expect(out.totalFindings).toBe(415);
      expect(out.looTested).toBe(135);
      expect(out.fragileCount).toBe(59);
    },
  );
});

/**
 * buildBannerSpec — covers both detection paths:
 *   (a) firedViaSupporting === false  -> kind: "required"
 *   (b) firedViaSupporting === true   -> kind: "supporting"
 *
 * Plus boundary cases for direction-arrow hydration (the part most likely to
 * silently flip syndrome interpretation if buggy).
 */
import { describe, test, expect } from "vitest";
import { buildBannerSpec } from "@/lib/member-roles-row";
import type { SyndromeTermReport, TermReportEntry } from "@/lib/cross-domain-syndrome-types";

const baseReport = (overrides: Partial<SyndromeTermReport> = {}): SyndromeTermReport => ({
  requiredEntries: [],
  supportingEntries: [],
  requiredMetCount: 0,
  requiredTrendCount: 0,
  requiredTotal: 0,
  supportingMetCount: 0,
  supportingTotal: 0,
  domainsCovered: [],
  missingDomains: [],
  oppositeCount: 0,
  requiredLogicText: "",
  requiredLogicType: "any",
  satisfiedClause: null,
  promotedSupportingTags: [],
  minDomains: 2,
  firedViaSupporting: false,
  ...overrides,
});

const entry = (overrides: Partial<TermReportEntry>): TermReportEntry => ({
  label: "ALT ↑",
  domain: "LB",
  role: "required",
  status: "matched",
  ...overrides,
});

describe("buildBannerSpec — path (a) required-met (firedViaSupporting=false)", () => {
  test("any logic — wraps tag-join in parens; arrows hydrated from entry.label", () => {
    const r = baseReport({
      requiredEntries: [
        entry({ tag: "ALT", label: "ALT ↑" }),
        entry({ tag: "AST", label: "AST ↑" }),
      ],
      requiredLogicText: "ALT or AST",
      requiredLogicType: "any",
      minDomains: 2,
    });
    const s = buildBannerSpec(r);
    expect(s.kind).toBe("required");
    expect(s.ruleText).toBe("(ALT ↑ or AST ↑)");
    expect(s.minDomains).toBe(2);
  });

  test("all logic — wraps in parens with + operator", () => {
    const r = baseReport({
      requiredEntries: [
        entry({ tag: "ALT", label: "ALT ↑" }),
        entry({ tag: "AST", label: "AST ↑" }),
      ],
      requiredLogicText: "ALT + AST",
      requiredLogicType: "all",
    });
    const s = buildBannerSpec(r);
    expect(s.ruleText).toBe("(ALT ↑ + AST ↑)");
  });

  test("compound logic — leaves outer expression untouched (already has scoping parens)", () => {
    const r = baseReport({
      requiredEntries: [
        entry({ tag: "NEUT", label: "NEUT ↓", role: "required" }),
        entry({ tag: "PLAT", label: "PLAT ↓", role: "required" }),
      ],
      supportingEntries: [
        entry({ tag: "RBC", label: "RBC ↓", role: "supporting" }),
        entry({ tag: "HGB", label: "HGB ↓", role: "supporting" }),
      ],
      requiredLogicText: "any of (NEUT, PLAT, (RBC + HGB))",
      requiredLogicType: "compound",
    });
    const s = buildBannerSpec(r);
    // Compound expression is NOT re-wrapped in parens
    expect(s.ruleText).toBe("any of (NEUT ↓, PLAT ↓, (RBC ↓ + HGB ↓))");
    // Supporting tags hydrate too — they may participate in compound rule (REM-26)
    expect(s.ruleText).toContain("RBC ↓");
    expect(s.ruleText).toContain("HGB ↓");
  });

  test("longest-tag-first replacement avoids prefix collision (ALT vs ALT2)", () => {
    const r = baseReport({
      requiredEntries: [
        entry({ tag: "ALT", label: "ALT ↑" }),
        entry({ tag: "ALT2", label: "ALT2 ↓" }),
      ],
      requiredLogicText: "ALT or ALT2",
      requiredLogicType: "any",
    });
    const s = buildBannerSpec(r);
    expect(s.ruleText).toBe("(ALT ↑ or ALT2 ↓)");
  });

  test("missing tag in label map — falls through to the bare tag (no crash)", () => {
    const r = baseReport({
      requiredEntries: [],
      requiredLogicText: "MYSTERY",
      requiredLogicType: "any",
    });
    expect(buildBannerSpec(r).ruleText).toBe("(MYSTERY)");
  });
});

describe("buildBannerSpec — path (b) supporting fallback (firedViaSupporting=true)", () => {
  test("kind=supporting; passes supportingMet + domainsCovered", () => {
    const r = baseReport({
      firedViaSupporting: true,
      supportingMetCount: 4,
      supportingTotal: 6,
      domainsCovered: ["LB", "MI", "OM"],
      requiredEntries: [
        entry({ tag: "ALT", label: "ALT ↑", status: "not_significant" }),
        entry({ tag: "AST", label: "AST ↑", status: "not_measured" }),
      ],
      requiredLogicText: "ALT or AST",
      requiredLogicType: "any",
    });
    const s = buildBannerSpec(r);
    expect(s.kind).toBe("supporting");
    expect(s.supportingMet).toBe(4);
    expect(s.domainsCovered).toBe(3);
    // ruleText is still hydrated for the tooltip path; the renderer chooses NOT
    // to display it on the supporting branch — but it's available.
    expect(s.ruleText).toBe("(ALT ↑ or AST ↑)");
  });

  test("kind toggle reads firedViaSupporting flag exactly", () => {
    expect(buildBannerSpec(baseReport({ firedViaSupporting: false })).kind).toBe("required");
    expect(buildBannerSpec(baseReport({ firedViaSupporting: true })).kind).toBe("supporting");
  });
});

describe("buildBannerSpec — direction arrows are load-bearing", () => {
  test("up direction propagates to all occurrences", () => {
    const r = baseReport({
      requiredEntries: [entry({ tag: "ALT", label: "ALT ↑" })],
      requiredLogicText: "ALT",
      requiredLogicType: "any",
    });
    expect(buildBannerSpec(r).ruleText).toContain("↑");
  });
  test("down direction propagates and is distinguishable from up", () => {
    const r = baseReport({
      requiredEntries: [entry({ tag: "ALB", label: "ALB ↓" })],
      requiredLogicText: "ALB",
      requiredLogicType: "any",
    });
    const s = buildBannerSpec(r);
    expect(s.ruleText).toContain("↓");
    expect(s.ruleText).not.toContain("↑");
  });
  test("term with no direction (e.g. organ-weight terms) renders without arrow", () => {
    const r = baseReport({
      requiredEntries: [entry({ tag: "LIVERWT", label: "Liver weight" })],
      requiredLogicText: "LIVERWT",
      requiredLogicType: "any",
    });
    const s = buildBannerSpec(r);
    expect(s.ruleText).toBe("(Liver weight)");
    expect(s.ruleText).not.toMatch(/[↑↓]/);
  });
});

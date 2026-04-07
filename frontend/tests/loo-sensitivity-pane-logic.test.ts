/**
 * LooSensitivityPane — pure logic tests.
 *
 * Per project convention (see resize-panel.test.ts:6-7), React components are
 * tested by extracting / mirroring their logic rather than rendering with RTL —
 * the project's Vitest config has no JSDOM environment and no @testing-library/react
 * dependency. This file mirrors the three critical code paths in LooSensitivityPane.tsx
 * (cross-day aggregation, cross-endpoint exclusion derivation, and the Apply button
 * label formula) and tests them against the BUG-001 scenario that motivated Feature 9.
 *
 * If these mirror functions drift from the pane's implementation, the build gate
 * won't catch it — the test regresses silently. Mitigation: the mirror functions
 * are small (<40 lines total) and are the focal point of this cycle's fix, so
 * drift is likely to be caught by the same PR that changes them.
 */
import { describe, it, expect } from "vitest";

const LOO_THRESHOLD = 0.8;

// -----------------------------------------------------------------------------
// Types mirrored from LooSensitivityPane.tsx
// -----------------------------------------------------------------------------
interface MirrorFinding {
  endpoint_label?: string | null;
  finding?: string | null;
  domain: string;
  day: number | null;
  sex: string | null;
  loo_per_subject?: Record<string, { ratio: number; dose_level: number }> | null;
}

interface InfluentialSubject {
  usubjid: string;
  doseLevel: number;
  sex: string;
  days: number[];
  worstRatio: number;
}

interface OtherEndpointExclusion {
  endpointLabel: string;
  subjects: Array<{ usubjid: string; sex: string; doseLevel: number }>;
}

// -----------------------------------------------------------------------------
// Mirror: useInfluentialSubjectsMap hook (Feature 1, post-fix iteration over
// loo_per_subject keys instead of just loo_influential_subject)
// -----------------------------------------------------------------------------

interface PairwiseEntry {
  dose_level: number;
  g_lower?: number | null;
}

interface HookFinding extends MirrorFinding {
  pairwise?: PairwiseEntry[] | null;
}

interface HookEntry {
  doseLevel: number;
  isControlSide: boolean;
}

function influentialSubjectsMap(
  findings: HookFinding[],
  endpointLabel: string | null | undefined,
  domain: string,
  day?: number | null,
): Map<string, HookEntry> {
  const out = new Map<string, HookEntry>();
  for (const f of findings) {
    if ((f.endpoint_label ?? f.finding) !== endpointLabel) continue;
    if (f.domain !== domain) continue;
    if (day != null && f.day !== day) continue;
    const per = f.loo_per_subject;
    if (!per) continue;
    let maxGl = 0;
    let affectedTreated = 0;
    if (f.pairwise) {
      for (const pw of f.pairwise) {
        const gl = pw.g_lower ?? 0;
        if (gl > maxGl) {
          maxGl = gl;
          affectedTreated = pw.dose_level;
        }
      }
    }
    for (const [usubjid, entry] of Object.entries(per)) {
      if (entry.ratio == null || entry.ratio >= LOO_THRESHOLD) continue;
      if (out.has(usubjid)) continue;
      const isCtrl = entry.dose_level === 0;
      const doseLevel = isCtrl ? affectedTreated : entry.dose_level;
      out.set(usubjid, { doseLevel, isControlSide: isCtrl });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Mirror: influentialSubjects aggregation (Feature 3)
// -----------------------------------------------------------------------------
function aggregateInfluentialSubjects(
  allFindings: MirrorFinding[],
  endpointLabel: string | null | undefined,
  domain: string,
): InfluentialSubject[] {
  const subjectsByUsubjid = new Map<string, InfluentialSubject>();

  for (const f of allFindings) {
    const ep = f.endpoint_label ?? f.finding;
    if (ep !== endpointLabel || f.domain !== domain) continue;
    if (f.day == null) continue;

    const perSubject = f.loo_per_subject;
    if (!perSubject) continue;

    for (const [usubjid, entry] of Object.entries(perSubject)) {
      if (entry.ratio >= LOO_THRESHOLD) continue;

      const existing = subjectsByUsubjid.get(usubjid);
      if (existing) {
        if (!existing.days.includes(f.day)) existing.days.push(f.day);
        if (entry.ratio < existing.worstRatio) existing.worstRatio = entry.ratio;
      } else {
        subjectsByUsubjid.set(usubjid, {
          usubjid,
          doseLevel: entry.dose_level,
          sex: f.sex ?? "",
          days: [f.day],
          worstRatio: entry.ratio,
        });
      }
    }
  }

  for (const s of subjectsByUsubjid.values()) s.days.sort((a, b) => a - b);

  return [...subjectsByUsubjid.values()].sort(
    (a, b) =>
      a.doseLevel - b.doseLevel ||
      b.days.length - a.days.length ||
      a.worstRatio - b.worstRatio,
  );
}

// -----------------------------------------------------------------------------
// Mirror: otherEndpointExclusions derivation (Feature 5)
// -----------------------------------------------------------------------------
function deriveOtherEndpointExclusions(
  pendingExclusions: Map<string, Set<string>>,
  currentEndpointLabel: string | null | undefined,
  allFindings: MirrorFinding[],
): OtherEndpointExclusion[] {
  const out: OtherEndpointExclusion[] = [];
  for (const [otherEp, ids] of pendingExclusions) {
    if (otherEp === currentEndpointLabel) continue;
    if (ids.size === 0) continue;
    const subjects: Array<{ usubjid: string; sex: string; doseLevel: number }> = [];
    for (const usubjid of ids) {
      let meta: { sex: string; doseLevel: number } | null = null;
      for (const f of allFindings) {
        if ((f.endpoint_label ?? f.finding) !== otherEp) continue;
        const per = f.loo_per_subject?.[usubjid];
        if (per) {
          meta = { sex: f.sex ?? "", doseLevel: per.dose_level };
          break;
        }
      }
      if (meta) {
        subjects.push({ usubjid, sex: meta.sex, doseLevel: meta.doseLevel });
      } else {
        subjects.push({ usubjid, sex: "", doseLevel: -1 });
      }
    }
    out.push({ endpointLabel: otherEp, subjects });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Mirror: Apply button label formula (Feature 5 — the BUG-001 fix)
// -----------------------------------------------------------------------------
function applyButtonLabel(pendingCount: number, isApplying: boolean): string | null {
  if (pendingCount <= 0) return null;
  if (isApplying) return "Applying...";
  return `Apply ${pendingCount} pending exclusion${pendingCount > 1 ? "s" : ""}`;
}

// =============================================================================
// Tests
// =============================================================================

describe("LooSensitivityPane — influentialSubjects aggregation", () => {
  const baseFinding = (overrides: Partial<MirrorFinding>): MirrorFinding => ({
    endpoint_label: "Body Weight",
    finding: "Body Weight",
    domain: "BW",
    day: 15,
    sex: "M",
    loo_per_subject: null,
    ...overrides,
  });

  it("aggregates per-subject days across multiple findings", () => {
    const findings: MirrorFinding[] = [
      baseFinding({
        day: 8,
        loo_per_subject: { "SUBJ-001": { ratio: 0.3, dose_level: 1 } },
      }),
      baseFinding({
        day: 15,
        loo_per_subject: { "SUBJ-001": { ratio: 0.5, dose_level: 1 } },
      }),
      baseFinding({
        day: 29,
        loo_per_subject: { "SUBJ-001": { ratio: 0.2, dose_level: 1 } },
      }),
    ];
    const result = aggregateInfluentialSubjects(findings, "Body Weight", "BW");
    expect(result).toHaveLength(1);
    expect(result[0].usubjid).toBe("SUBJ-001");
    expect(result[0].days).toEqual([8, 15, 29]);
    expect(result[0].worstRatio).toBe(0.2); // minimum across contributing findings
  });

  it("filters out subjects whose ratio is >= LOO_THRESHOLD", () => {
    const findings: MirrorFinding[] = [
      baseFinding({
        day: 15,
        loo_per_subject: {
          "SUBJ-FRAGILE": { ratio: 0.3, dose_level: 1 },
          "SUBJ-ROBUST": { ratio: 0.92, dose_level: 1 },
        },
      }),
    ];
    const result = aggregateInfluentialSubjects(findings, "Body Weight", "BW");
    expect(result).toHaveLength(1);
    expect(result[0].usubjid).toBe("SUBJ-FRAGILE");
  });

  it("filters findings by endpoint and domain", () => {
    const findings: MirrorFinding[] = [
      baseFinding({
        endpoint_label: "Body Weight",
        loo_per_subject: { "SUBJ-001": { ratio: 0.3, dose_level: 1 } },
      }),
      baseFinding({
        endpoint_label: "Food Consumption",
        domain: "FW",
        loo_per_subject: { "SUBJ-002": { ratio: 0.3, dose_level: 1 } },
      }),
    ];
    const result = aggregateInfluentialSubjects(findings, "Body Weight", "BW");
    expect(result.map((s) => s.usubjid)).toEqual(["SUBJ-001"]);
  });

  it("sorts rows by doseLevel asc -> days.length desc -> worstRatio asc", () => {
    const findings: MirrorFinding[] = [
      baseFinding({
        day: 15,
        loo_per_subject: {
          "SUBJ-A-HIGH-DOSE": { ratio: 0.1, dose_level: 3 },
          "SUBJ-B-LOW-DOSE-SINGLE": { ratio: 0.4, dose_level: 1 },
          "SUBJ-C-LOW-DOSE-MULTI": { ratio: 0.5, dose_level: 1 },
        },
      }),
      baseFinding({
        day: 29,
        loo_per_subject: {
          "SUBJ-C-LOW-DOSE-MULTI": { ratio: 0.3, dose_level: 1 },
        },
      }),
    ];
    const result = aggregateInfluentialSubjects(findings, "Body Weight", "BW");
    // Expected order: low-dose multi-day (2 days) -> low-dose single-day -> high-dose
    expect(result.map((s) => s.usubjid)).toEqual([
      "SUBJ-C-LOW-DOSE-MULTI",
      "SUBJ-B-LOW-DOSE-SINGLE",
      "SUBJ-A-HIGH-DOSE",
    ]);
    expect(result[0].days).toEqual([15, 29]);
  });

  it("skips findings with null day (defensive)", () => {
    const findings: MirrorFinding[] = [
      baseFinding({
        day: null,
        loo_per_subject: { "SUBJ-001": { ratio: 0.3, dose_level: 1 } },
      }),
    ];
    const result = aggregateInfluentialSubjects(findings, "Body Weight", "BW");
    expect(result).toHaveLength(0);
  });

  it("dedupes days (no double-count if a subject appears twice on the same day)", () => {
    const findings: MirrorFinding[] = [
      baseFinding({
        day: 15,
        sex: "F",
        loo_per_subject: { "SUBJ-001": { ratio: 0.3, dose_level: 1 } },
      }),
      baseFinding({
        day: 15,
        sex: "M",
        loo_per_subject: { "SUBJ-001": { ratio: 0.2, dose_level: 1 } },
      }),
    ];
    const result = aggregateInfluentialSubjects(findings, "Body Weight", "BW");
    expect(result).toHaveLength(1);
    expect(result[0].days).toEqual([15]);
    expect(result[0].worstRatio).toBe(0.2); // min across both entries
  });
});

describe("LooSensitivityPane — otherEndpointExclusions (BUG-001 regression guard)", () => {
  const findings: MirrorFinding[] = [
    {
      endpoint_label: "Body Weight",
      finding: "Body Weight",
      domain: "BW",
      day: 15,
      sex: "M",
      loo_per_subject: {
        "SUBJ-BW": { ratio: 0.3, dose_level: 1 },
      },
    },
    {
      endpoint_label: "ALT",
      finding: "ALT",
      domain: "LB",
      day: 29,
      sex: "F",
      loo_per_subject: {
        "SUBJ-ALT-1": { ratio: 0.4, dose_level: 2 },
        "SUBJ-ALT-2": { ratio: 0.25, dose_level: 1 },
      },
    },
  ];

  it("excludes the current endpoint from the result", () => {
    const pending = new Map<string, Set<string>>([
      ["Body Weight", new Set(["SUBJ-BW"])],
      ["ALT", new Set(["SUBJ-ALT-1"])],
    ]);
    const result = deriveOtherEndpointExclusions(pending, "Body Weight", findings);
    expect(result).toHaveLength(1);
    expect(result[0].endpointLabel).toBe("ALT");
  });

  it("looks up sex and doseLevel from full findings list", () => {
    const pending = new Map<string, Set<string>>([
      ["ALT", new Set(["SUBJ-ALT-1", "SUBJ-ALT-2"])],
    ]);
    const result = deriveOtherEndpointExclusions(pending, "Body Weight", findings);
    expect(result).toHaveLength(1);
    const subs = result[0].subjects;
    const s1 = subs.find((s) => s.usubjid === "SUBJ-ALT-1")!;
    const s2 = subs.find((s) => s.usubjid === "SUBJ-ALT-2")!;
    expect(s1.sex).toBe("F");
    expect(s1.doseLevel).toBe(2);
    expect(s2.sex).toBe("F");
    expect(s2.doseLevel).toBe(1);
  });

  it("falls back to bare usubjid when subject not found in any finding", () => {
    const pending = new Map<string, Set<string>>([
      ["ALT", new Set(["SUBJ-STALE"])],
    ]);
    const result = deriveOtherEndpointExclusions(pending, "Body Weight", findings);
    expect(result[0].subjects[0]).toEqual({
      usubjid: "SUBJ-STALE",
      sex: "",
      doseLevel: -1,
    });
  });

  it("filters out endpoints whose set became empty", () => {
    const pending = new Map<string, Set<string>>([
      ["Body Weight", new Set(["SUBJ-BW"])],
      ["ALT", new Set()],
    ]);
    const result = deriveOtherEndpointExclusions(pending, "Body Weight", findings);
    expect(result).toHaveLength(0);
  });

  it("returns empty when only the current endpoint has pending exclusions", () => {
    const pending = new Map<string, Set<string>>([
      ["Body Weight", new Set(["SUBJ-BW"])],
    ]);
    const result = deriveOtherEndpointExclusions(pending, "Body Weight", findings);
    expect(result).toHaveLength(0);
  });
});

describe("LooSensitivityPane — Apply button label (BUG-001)", () => {
  it("uses the global pendingCount, not the endpoint-local count (BUG-001 fix)", () => {
    // BUG-001 reproduction: user views BW pane, has no BW exclusions checked,
    // but one exclusion is pending on a different endpoint (pendingCount=1).
    // Pre-fix: button was hidden or showed a misleading local count.
    // Post-fix: button shows "Apply 1 pending exclusion" — honest global count.
    expect(applyButtonLabel(1, false)).toBe("Apply 1 pending exclusion");
  });

  it("pluralizes correctly for counts > 1", () => {
    expect(applyButtonLabel(3, false)).toBe("Apply 3 pending exclusions");
  });

  it("shows 'Applying...' when an apply is in-flight", () => {
    expect(applyButtonLabel(3, true)).toBe("Applying...");
  });

  it("returns null when pendingCount is zero (button hidden)", () => {
    expect(applyButtonLabel(0, false)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Integrated scenarios — reproduce the spec's Feature 9 Test 1-5 scenarios
// as pure-logic setups. These build the full state (pendingExclusions Map,
// excludedIds for current endpoint, derived pendingCount) and assert on the
// integrated label + disclosure + local-empty properties simultaneously.
//
// These cannot click the disclosure toggle (no JSDOM/RTL in this project's
// test infra — see `resize-panel.test.ts:6-7` for the convention). The
// disclosureOpen state is a pure setState boolean and does not need testing.
// -----------------------------------------------------------------------------

function totalPending(pendingExclusions: Map<string, Set<string>>): number {
  let count = 0;
  for (const ids of pendingExclusions.values()) count += ids.size;
  return count;
}

function localExclusions(
  pendingExclusions: Map<string, Set<string>>,
  endpointLabel: string,
): Set<string> {
  return pendingExclusions.get(endpointLabel) ?? new Set<string>();
}

describe("LooSensitivityPane — Feature 9 integrated scenarios (spec Tests 1-5)", () => {
  const bwFindings: MirrorFinding[] = [
    {
      endpoint_label: "Body Weight",
      finding: "Body Weight",
      domain: "BW",
      day: 15,
      sex: "M",
      loo_per_subject: { "SUBJ-BW-1": { ratio: 0.3, dose_level: 1 } },
    },
    {
      endpoint_label: "Alanine Aminotransferase",
      finding: "Alanine Aminotransferase",
      domain: "LB",
      day: 29,
      sex: "F",
      loo_per_subject: {
        "SUBJ-ALT-1": { ratio: 0.25, dose_level: 2 },
        "SUBJ-ALT-2": { ratio: 0.4, dose_level: 1 },
      },
    },
  ];
  const currentEndpoint = "Body Weight";

  it("Test 1: honest global label — pendingCount=3 with BW(1)+ALT(2), user on BW pane", () => {
    // Mock pendingExclusions: 1 BW entry + 2 ALT entries. User is viewing BW pane.
    const pending = new Map<string, Set<string>>([
      ["Body Weight", new Set(["SUBJ-BW-1"])],
      ["Alanine Aminotransferase", new Set(["SUBJ-ALT-1", "SUBJ-ALT-2"])],
    ]);
    const pendingCount = totalPending(pending); // = 3 (global)
    expect(pendingCount).toBe(3);
    // Button text must reflect global count (3), not local BW count (1).
    const label = applyButtonLabel(pendingCount, false);
    expect(label).toContain("Apply 3 pending exclusion");
  });

  it("Test 2: disclosure hidden when pendingExclusions only has current endpoint", () => {
    const pending = new Map<string, Set<string>>([
      ["Body Weight", new Set(["SUBJ-BW-1"])],
    ]);
    const pendingCount = totalPending(pending);
    const others = deriveOtherEndpointExclusions(pending, currentEndpoint, bwFindings);
    // Button should still render (pendingCount > 0) but disclosure block is hidden
    // because otherEndpointExclusions is empty.
    expect(applyButtonLabel(pendingCount, false)).toBe("Apply 1 pending exclusion");
    expect(others).toHaveLength(0);
  });

  it("Test 3: disclosure data shape — other-endpoint subjects resolvable without click", () => {
    // The click-to-expand behavior is React state toggle (untestable without JSDOM).
    // But the data that WOULD be rendered after expansion is derivable as pure logic,
    // so we assert the disclosure data structure contains the expected subjects.
    const pending = new Map<string, Set<string>>([
      ["Body Weight", new Set(["SUBJ-BW-1"])],
      ["Alanine Aminotransferase", new Set(["SUBJ-ALT-1", "SUBJ-ALT-2"])],
    ]);
    const others = deriveOtherEndpointExclusions(pending, currentEndpoint, bwFindings);
    expect(others).toHaveLength(1);
    expect(others[0].endpointLabel).toBe("Alanine Aminotransferase");
    const subjectIds = others[0].subjects.map((s) => s.usubjid).sort();
    expect(subjectIds).toEqual(["SUBJ-ALT-1", "SUBJ-ALT-2"]);
    // Metadata is looked up correctly
    const alt1 = others[0].subjects.find((s) => s.usubjid === "SUBJ-ALT-1")!;
    expect(alt1.sex).toBe("F");
    expect(alt1.doseLevel).toBe(2);
  });

  it("Test 4: BUG-001 regression guard — local empty, global non-zero, disclosure shows the missing exclusion", () => {
    // The exact bug reproduction from BUG-SWEEP.md:140:
    // User unchecks every box on the BW pane; one exclusion is pending on ALT.
    // Expected: button IS visible (honest global label), local checkboxes all unchecked,
    // disclosure shows the 1 ALT exclusion.
    const pending = new Map<string, Set<string>>([
      ["Alanine Aminotransferase", new Set(["SUBJ-ALT-1"])],
    ]);
    const pendingCount = totalPending(pending);
    const local = localExclusions(pending, currentEndpoint);
    const others = deriveOtherEndpointExclusions(pending, currentEndpoint, bwFindings);
    // (a) Button IS visible
    expect(applyButtonLabel(pendingCount, false)).toBe("Apply 1 pending exclusion");
    // (b) Local checkboxes all unchecked (excludedIds for BW is empty)
    expect(local.size).toBe(0);
    // (c) Disclosure shows 1 ALT exclusion
    expect(others).toHaveLength(1);
    expect(others[0].endpointLabel).toBe("Alanine Aminotransferase");
    expect(others[0].subjects).toHaveLength(1);
    expect(others[0].subjects[0].usubjid).toBe("SUBJ-ALT-1");
  });

  it("Test 5: empty state — pendingCount=0, button hidden, no disclosure", () => {
    const pending = new Map<string, Set<string>>();
    const pendingCount = totalPending(pending);
    const others = deriveOtherEndpointExclusions(pending, currentEndpoint, bwFindings);
    expect(pendingCount).toBe(0);
    expect(applyButtonLabel(pendingCount, false)).toBeNull();
    expect(others).toHaveLength(0);
  });
});

// =============================================================================
// useInfluentialSubjectsMap hook — mirror tests
//
// CRITICAL: this hook was rewritten to iterate `loo_per_subject` keys (matching
// the LooSensitivityPane semantic) instead of just checking the per-finding
// `loo_influential_subject` pointer. The pointer-based filter shipped first
// and produced an empty chart on PointCross BW because the per-finding worst
// subject's ratio was almost never < 0.8 (real values 0.94-0.97 across 27/29
// findings). The data-fixture test below guards against that regression.
// =============================================================================

describe("useInfluentialSubjectsMap — per-subject iteration", () => {
  it("iterates ALL keys in loo_per_subject, not just loo_influential_subject", () => {
    // Two fragile subjects in one finding. Old hook would only mark one.
    const findings: HookFinding[] = [
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 1,
        sex: "M",
        loo_per_subject: {
          "SUBJ-A": { ratio: 0.0, dose_level: 1 },
          "SUBJ-B": { ratio: 0.0, dose_level: 0 },
          "SUBJ-C": { ratio: 1.05, dose_level: 1 }, // not fragile
        },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
    ];
    const result = influentialSubjectsMap(findings, "Body Weight", "BW", 1);
    expect(result.size).toBe(2);
    expect(result.has("SUBJ-A")).toBe(true);
    expect(result.has("SUBJ-B")).toBe(true);
    expect(result.has("SUBJ-C")).toBe(false);
  });

  it("treated subject keeps own dose_level; control subject inherits affected treated dose level", () => {
    const findings: HookFinding[] = [
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 1,
        sex: "M",
        loo_per_subject: {
          "SUBJ-TREATED": { ratio: 0.3, dose_level: 2 }, // mid dose treated
          "SUBJ-CONTROL": { ratio: 0.2, dose_level: 0 }, // control
        },
        // High dose (3) has the max gLower, so control subject's marker
        // should color to dose_level 3 even though their own dose_level is 0.
        pairwise: [
          { dose_level: 1, g_lower: 0.2 },
          { dose_level: 2, g_lower: 0.4 },
          { dose_level: 3, g_lower: 0.8 },
        ],
      },
    ];
    const result = influentialSubjectsMap(findings, "Body Weight", "BW", 1);
    expect(result.get("SUBJ-TREATED")).toEqual({
      doseLevel: 2,
      isControlSide: false,
    });
    expect(result.get("SUBJ-CONTROL")).toEqual({
      doseLevel: 3,
      isControlSide: true,
    });
  });

  it("filters by day when opts.day is provided", () => {
    const findings: HookFinding[] = [
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 1,
        sex: "M",
        loo_per_subject: { "D1-FRAGILE": { ratio: 0.3, dose_level: 1 } },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 15,
        sex: "M",
        loo_per_subject: { "D15-FRAGILE": { ratio: 0.4, dose_level: 1 } },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
    ];
    const d1 = influentialSubjectsMap(findings, "Body Weight", "BW", 1);
    expect(d1.size).toBe(1);
    expect(d1.has("D1-FRAGILE")).toBe(true);
    const d15 = influentialSubjectsMap(findings, "Body Weight", "BW", 15);
    expect(d15.size).toBe(1);
    expect(d15.has("D15-FRAGILE")).toBe(true);
  });

  it("returns endpoint-union when day is undefined (recovery mode fallback)", () => {
    const findings: HookFinding[] = [
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 1,
        sex: "M",
        loo_per_subject: { "D1-FRAGILE": { ratio: 0.3, dose_level: 1 } },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 15,
        sex: "M",
        loo_per_subject: { "D15-FRAGILE": { ratio: 0.4, dose_level: 1 } },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
    ];
    const all = influentialSubjectsMap(findings, "Body Weight", "BW", undefined);
    expect(all.size).toBe(2);
  });

  it("excludes findings with no loo_per_subject", () => {
    const findings: HookFinding[] = [
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 1,
        sex: "F",
        loo_per_subject: null,
        pairwise: [],
      },
    ];
    const result = influentialSubjectsMap(findings, "Body Weight", "BW", 1);
    expect(result.size).toBe(0);
  });

  it("excludes subjects with ratio >= LOO_THRESHOLD", () => {
    const findings: HookFinding[] = [
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 1,
        sex: "M",
        loo_per_subject: {
          "S-FRAGILE": { ratio: 0.5, dose_level: 1 },
          "S-AT-THRESHOLD": { ratio: 0.8, dose_level: 1 },
          "S-ABOVE": { ratio: 0.95, dose_level: 1 },
        },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
    ];
    const result = influentialSubjectsMap(findings, "Body Weight", "BW", 1);
    expect(result.size).toBe(1);
    expect(result.has("S-FRAGILE")).toBe(true);
    expect(result.has("S-AT-THRESHOLD")).toBe(false); // strict <
    expect(result.has("S-ABOVE")).toBe(false);
  });

  it("filters by endpoint and domain", () => {
    const findings: HookFinding[] = [
      {
        endpoint_label: "Body Weight",
        finding: "Body Weight",
        domain: "BW",
        day: 1,
        sex: "M",
        loo_per_subject: { "BW-FRAGILE": { ratio: 0.3, dose_level: 1 } },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
      {
        endpoint_label: "Food Consumption",
        finding: "Food Consumption",
        domain: "FW",
        day: 1,
        sex: "M",
        loo_per_subject: { "FW-FRAGILE": { ratio: 0.3, dose_level: 1 } },
        pairwise: [{ dose_level: 1, g_lower: 0.5 }],
      },
    ];
    const result = influentialSubjectsMap(findings, "Body Weight", "BW", 1);
    expect(result.size).toBe(1);
    expect(result.has("BW-FRAGILE")).toBe(true);
  });
});

// =============================================================================
// Data verification — fixture test against the actual PointCross unified_findings.json
//
// This is the test that should have caught the original "empty chart" regression.
// It loads the real generated output and asserts the hook produces the expected
// per-day cardinalities. Per CLAUDE.md rule 18 (verify empirical claims against
// actual data), this fixture exists specifically to enforce that empirical claims
// in the loo-display-scoping spec match real generated output.
// =============================================================================

describe("useInfluentialSubjectsMap — PointCross BW data fixture", () => {
  // Load the real generated findings file at test time. Skips gracefully if the
  // file is missing (e.g., fresh checkout that hasn't generated PointCross yet).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bwFindings: any[] | null = null;
  try {
    // Use sync fs read because vitest doesn't natively support top-level await
    // for json without `assert { type: "json" }` config friction.
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
      bwFindings = (data.findings || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f: any) => f.domain === "BW",
      );
    }
  } catch {
    bwFindings = null;
  }

  const itIfFixture = bwFindings && bwFindings.length > 0 ? it : it.skip;

  itIfFixture(
    "matches LooSensitivityPane: 2 fragile subjects across BW endpoint, both on D1",
    () => {
      // Endpoint-union — what the pane shows.
      const all = influentialSubjectsMap(bwFindings!, "Body Weight", "BW", undefined);
      expect(all.size).toBe(2);
      expect(all.has("PC201708-2004")).toBe(true); // treated, ratio 0.0 on D1
      expect(all.has("PC201708-1001")).toBe(true); // control, ratio 0.0 on D1
    },
  );

  itIfFixture(
    "D1 main mode: chart shows 2 dots (matches pane)",
    () => {
      const d1 = influentialSubjectsMap(bwFindings!, "Body Weight", "BW", 1);
      expect(d1.size).toBe(2);
    },
  );

  itIfFixture(
    "D15 main mode: chart shows 0 dots (no fragile drivers at D15)",
    () => {
      const d15 = influentialSubjectsMap(bwFindings!, "Body Weight", "BW", 15);
      expect(d15.size).toBe(0);
    },
  );

  itIfFixture(
    "control subject's marker colors to affected treated dose level (not their own 0)",
    () => {
      const d1 = influentialSubjectsMap(bwFindings!, "Body Weight", "BW", 1);
      const ctrl = d1.get("PC201708-1001");
      expect(ctrl).toBeDefined();
      expect(ctrl!.isControlSide).toBe(true);
      // Their own dose_level is 0; the marker should inherit the affected
      // treated dose level (whichever pairwise has max gLower at that day).
      expect(ctrl!.doseLevel).toBeGreaterThan(0);
    },
  );

  itIfFixture(
    "treated subject's marker uses their own dose_level",
    () => {
      const d1 = influentialSubjectsMap(bwFindings!, "Body Weight", "BW", 1);
      const treated = d1.get("PC201708-2004");
      expect(treated).toBeDefined();
      expect(treated!.isControlSide).toBe(false);
      expect(treated!.doseLevel).toBe(1); // low-dose
    },
  );
});

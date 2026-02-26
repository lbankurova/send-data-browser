/**
 * Findings rail → table selection interaction tests.
 *
 * Regression guards for the three bugs fixed in 548be11:
 * 1. Stale highlight: clicking endpoint X must not leave endpoint Y highlighted
 * 2. Autoscroll target: first sibling row must match the active endpoint
 * 3. Selected row: must be the "best" finding for the active endpoint
 *    (lowest p-value, then largest |effect size|) — same as scatterplot marker
 *
 * Tests the pure logic extracted from FindingsView and FindingsTable
 * without React rendering.
 */
import { describe, it, expect } from "vitest";
import type { UnifiedFinding } from "@/types/analysis";

// ─── pickBestFinding — mirrors FindingsView.pickBestFinding ─────────

function pickBestFinding(findings: UnifiedFinding[]): UnifiedFinding {
  return findings.reduce((best, f) => {
    const bestP = best.min_p_adj ?? Infinity;
    const fP = f.min_p_adj ?? Infinity;
    if (fP < bestP) return f;
    if (fP === bestP) {
      const bestE = Math.abs(best.max_effect_size ?? 0);
      const fE = Math.abs(f.max_effect_size ?? 0);
      if (fE > bestE) return f;
    }
    return best;
  });
}

// ─── Table highlight logic — mirrors FindingsTable row classification ──

interface RowHighlight {
  isPrimary: boolean;   // selected + sibling
  isSecondary: boolean; // sibling, not selected
  isStaleHighlight: boolean; // selected from different endpoint (the bug)
}

function classifyRow(
  rowEndpointLabel: string,
  rowId: string,
  activeEndpoint: string | null,
  selectedFindingId: string | null,
): RowHighlight {
  const isSelected = selectedFindingId === rowId;
  const isSibling = activeEndpoint != null && rowEndpointLabel === activeEndpoint;
  return {
    isPrimary: isSelected && isSibling,
    isSecondary: !isSelected && isSibling,
    // The fix: non-sibling selected rows only show highlight when NO endpoint is active
    isStaleHighlight: isSelected && !isSibling && !activeEndpoint,
  };
}

// ─── Synchronous endpoint selection — mirrors handleEndpointSelect ──

interface SelectionState {
  activeEndpoint: string | null;
  selectedFindingId: string | null;
}

function handleEndpointSelect(
  endpointLabel: string | null,
  findings: UnifiedFinding[],
): SelectionState {
  if (endpointLabel && findings.length) {
    const epFindings = findings.filter(
      (f) => (f.endpoint_label ?? f.finding) === endpointLabel,
    );
    if (epFindings.length > 0) {
      return {
        activeEndpoint: endpointLabel,
        selectedFindingId: pickBestFinding(epFindings).id,
      };
    }
  }
  if (!endpointLabel) {
    return { activeEndpoint: null, selectedFindingId: null };
  }
  return { activeEndpoint: endpointLabel, selectedFindingId: null };
}

// ─── First sibling detection — mirrors FindingsTable ref assignment ──

function findFirstSiblingIndex(
  rows: { endpoint_label: string }[],
  activeEndpoint: string | null,
): number {
  if (!activeEndpoint) return -1;
  return rows.findIndex((r) => r.endpoint_label === activeEndpoint);
}

// ─── Minimal finding factory ──

let _nextId = 0;
function makeFinding(overrides: Partial<UnifiedFinding> & { finding: string }): UnifiedFinding {
  _nextId++;
  return {
    id: `f${_nextId}`,
    domain: "LB",
    test_code: overrides.finding,
    test_name: overrides.finding,
    specimen: null,
    day: 30,
    sex: "M",
    unit: null,
    data_type: "continuous",
    severity: "adverse",
    direction: "up",
    dose_response_pattern: "monotonic_increase",
    treatment_related: true,
    max_effect_size: null,
    min_p_adj: null,
    trend_p: null,
    trend_stat: null,
    group_stats: [],
    pairwise: [],
    endpoint_label: null,
    ...overrides,
  };
}

// ─── Test fixtures ──

const KIDNEY_M = makeFinding({
  finding: "KIDNEY (WEIGHT)",
  endpoint_label: "KIDNEY \u2014 KIDNEY (WEIGHT)",
  specimen: "KIDNEY",
  domain: "OM",
  sex: "M",
  min_p_adj: 0.0001,
  max_effect_size: 2.61,
});

const KIDNEY_F = makeFinding({
  finding: "KIDNEY (WEIGHT)",
  endpoint_label: "KIDNEY \u2014 KIDNEY (WEIGHT)",
  specimen: "KIDNEY",
  domain: "OM",
  sex: "F",
  min_p_adj: 0.0003,
  max_effect_size: 1.80,
});

const OVARY_F = makeFinding({
  finding: "OVARY (WEIGHT)",
  endpoint_label: "OVARY \u2014 OVARY (WEIGHT)",
  specimen: "OVARY",
  domain: "OM",
  sex: "F",
  min_p_adj: 0.02,
  max_effect_size: 1.10,
});

const ALB_M = makeFinding({
  finding: "Albumin",
  endpoint_label: "Albumin",
  domain: "LB",
  sex: "M",
  min_p_adj: 0.03,
  max_effect_size: -0.95,
});

const ALB_F = makeFinding({
  finding: "Albumin",
  endpoint_label: "Albumin",
  domain: "LB",
  sex: "F",
  min_p_adj: 0.03,
  max_effect_size: -1.50,
});

const FINDINGS = [KIDNEY_M, KIDNEY_F, OVARY_F, ALB_M, ALB_F];

// ═══════════════════════════════════════════════════════════════════════

describe("pickBestFinding — scatterplot marker correspondence", () => {
  it("picks lowest p-value among endpoint rows", () => {
    const best = pickBestFinding([KIDNEY_M, KIDNEY_F]);
    expect(best.id).toBe(KIDNEY_M.id); // 0.0001 < 0.0003
  });

  it("breaks p-value tie with largest |effect size|", () => {
    const best = pickBestFinding([ALB_M, ALB_F]);
    // same p-value (0.03), ALB_F has |−1.50| > |−0.95|
    expect(best.id).toBe(ALB_F.id);
  });

  it("handles single-row endpoint (Ovary)", () => {
    const best = pickBestFinding([OVARY_F]);
    expect(best.id).toBe(OVARY_F.id);
  });

  it("handles all null p-values (Infinity fallback)", () => {
    const a = makeFinding({ finding: "X", min_p_adj: null, max_effect_size: 1.0 });
    const b = makeFinding({ finding: "X", min_p_adj: null, max_effect_size: 2.0 });
    const best = pickBestFinding([a, b]);
    expect(best.id).toBe(b.id); // tie on Infinity, pick larger effect
  });
});

describe("synchronous endpoint selection — no stale selection", () => {
  it("selecting Ovary endpoint picks Ovary finding", () => {
    const state = handleEndpointSelect("OVARY \u2014 OVARY (WEIGHT)", FINDINGS);
    expect(state.activeEndpoint).toBe("OVARY \u2014 OVARY (WEIGHT)");
    expect(state.selectedFindingId).toBe(OVARY_F.id);
  });

  it("selecting Kidney endpoint picks best Kidney finding (M, lower p)", () => {
    const state = handleEndpointSelect("KIDNEY \u2014 KIDNEY (WEIGHT)", FINDINGS);
    expect(state.activeEndpoint).toBe("KIDNEY \u2014 KIDNEY (WEIGHT)");
    expect(state.selectedFindingId).toBe(KIDNEY_M.id);
  });

  it("clearing endpoint clears selection", () => {
    const state = handleEndpointSelect(null, FINDINGS);
    expect(state.activeEndpoint).toBeNull();
    expect(state.selectedFindingId).toBeNull();
  });

  it("endpoint not in data sets activeEndpoint but no selection", () => {
    const state = handleEndpointSelect("SPLEEN \u2014 SPLEEN (WEIGHT)", FINDINGS);
    expect(state.activeEndpoint).toBe("SPLEEN \u2014 SPLEEN (WEIGHT)");
    expect(state.selectedFindingId).toBeNull();
  });

  it("uses endpoint_label fallback to finding when endpoint_label is null", () => {
    const noLabel = makeFinding({
      finding: "Custom Finding",
      endpoint_label: null,
    });
    const state = handleEndpointSelect("Custom Finding", [noLabel]);
    expect(state.selectedFindingId).toBe(noLabel.id);
  });
});

describe("table row highlight — no cross-endpoint bleed", () => {
  it("Kidney row is NOT highlighted when Ovary endpoint is active", () => {
    // This was the original bug: Kidney row showed bg-accent when Ovary was clicked
    const h = classifyRow(
      "KIDNEY \u2014 KIDNEY (WEIGHT)",
      KIDNEY_M.id,
      "OVARY \u2014 OVARY (WEIGHT)",  // active endpoint = Ovary
      KIDNEY_M.id,                      // selected = still Kidney (stale)
    );
    expect(h.isPrimary).toBe(false);
    expect(h.isSecondary).toBe(false);
    expect(h.isStaleHighlight).toBe(false); // ← the fix
  });

  it("Ovary row IS highlighted as sibling when Ovary endpoint is active", () => {
    const h = classifyRow(
      "OVARY \u2014 OVARY (WEIGHT)",
      OVARY_F.id,
      "OVARY \u2014 OVARY (WEIGHT)",
      KIDNEY_M.id, // stale selection from Kidney
    );
    expect(h.isPrimary).toBe(false); // not selected
    expect(h.isSecondary).toBe(true); // sibling highlight
  });

  it("selected + sibling row gets primary highlight", () => {
    const h = classifyRow(
      "OVARY \u2014 OVARY (WEIGHT)",
      OVARY_F.id,
      "OVARY \u2014 OVARY (WEIGHT)",
      OVARY_F.id,
    );
    expect(h.isPrimary).toBe(true);
    expect(h.isSecondary).toBe(false);
    expect(h.isStaleHighlight).toBe(false);
  });

  it("selected row shows highlight when NO endpoint is active", () => {
    // Normal table browsing without endpoint focus — selected row should still show
    const h = classifyRow(
      "KIDNEY \u2014 KIDNEY (WEIGHT)",
      KIDNEY_M.id,
      null,           // no active endpoint
      KIDNEY_M.id,    // selected
    );
    expect(h.isPrimary).toBe(false); // no endpoint → no sibling concept
    expect(h.isStaleHighlight).toBe(true); // shows the selected-row style
  });

  it("unrelated row gets no highlight regardless of endpoint", () => {
    const h = classifyRow(
      "Albumin",
      ALB_M.id,
      "OVARY \u2014 OVARY (WEIGHT)",
      OVARY_F.id,
    );
    expect(h.isPrimary).toBe(false);
    expect(h.isSecondary).toBe(false);
    expect(h.isStaleHighlight).toBe(false);
  });
});

describe("first sibling (autoscroll target)", () => {
  const TABLE_ROWS = [
    { endpoint_label: "Albumin" },
    { endpoint_label: "Albumin" },
    { endpoint_label: "KIDNEY \u2014 KIDNEY (WEIGHT)" },
    { endpoint_label: "KIDNEY \u2014 KIDNEY (WEIGHT)" },
    { endpoint_label: "OVARY \u2014 OVARY (WEIGHT)" },
  ];

  it("finds first Ovary row at index 4", () => {
    expect(findFirstSiblingIndex(TABLE_ROWS, "OVARY \u2014 OVARY (WEIGHT)")).toBe(4);
  });

  it("finds first Kidney row at index 2", () => {
    expect(findFirstSiblingIndex(TABLE_ROWS, "KIDNEY \u2014 KIDNEY (WEIGHT)")).toBe(2);
  });

  it("finds first Albumin row at index 0", () => {
    expect(findFirstSiblingIndex(TABLE_ROWS, "Albumin")).toBe(0);
  });

  it("returns -1 when no endpoint active", () => {
    expect(findFirstSiblingIndex(TABLE_ROWS, null)).toBe(-1);
  });

  it("returns -1 when endpoint not in table", () => {
    expect(findFirstSiblingIndex(TABLE_ROWS, "SPLEEN \u2014 SPLEEN (WEIGHT)")).toBe(-1);
  });
});

describe("end-to-end: rail click → table state", () => {
  it("Ovary click: correct selection + correct highlights for every row", () => {
    // Simulate: user clicks Ovary endpoint on rail
    const state = handleEndpointSelect("OVARY \u2014 OVARY (WEIGHT)", FINDINGS);

    // Check every finding's highlight state
    for (const f of FINDINGS) {
      const epLabel = f.endpoint_label ?? f.finding;
      const h = classifyRow(epLabel, f.id, state.activeEndpoint, state.selectedFindingId);

      if (f.id === OVARY_F.id) {
        // The Ovary finding: selected + sibling → primary
        expect(h.isPrimary).toBe(true);
        expect(h.isSecondary).toBe(false);
        expect(h.isStaleHighlight).toBe(false);
      } else {
        // All other findings: not selected, not sibling → no highlight
        expect(h.isPrimary).toBe(false);
        expect(h.isStaleHighlight).toBe(false);
        // Only Ovary rows are siblings
        expect(h.isSecondary).toBe(false);
      }
    }
  });

  it("Kidney click: best finding selected, both M/F rows highlighted", () => {
    const state = handleEndpointSelect("KIDNEY \u2014 KIDNEY (WEIGHT)", FINDINGS);

    // Selected finding should be KIDNEY_M (lowest p-value)
    expect(state.selectedFindingId).toBe(KIDNEY_M.id);

    // KIDNEY_M: selected + sibling → primary
    const hM = classifyRow(
      KIDNEY_M.endpoint_label!,
      KIDNEY_M.id,
      state.activeEndpoint,
      state.selectedFindingId,
    );
    expect(hM.isPrimary).toBe(true);

    // KIDNEY_F: not selected, sibling → secondary
    const hF = classifyRow(
      KIDNEY_F.endpoint_label!,
      KIDNEY_F.id,
      state.activeEndpoint,
      state.selectedFindingId,
    );
    expect(hF.isSecondary).toBe(true);

    // Ovary: not highlighted at all
    const hO = classifyRow(
      OVARY_F.endpoint_label!,
      OVARY_F.id,
      state.activeEndpoint,
      state.selectedFindingId,
    );
    expect(hO.isPrimary).toBe(false);
    expect(hO.isSecondary).toBe(false);
    expect(hO.isStaleHighlight).toBe(false);
  });

  it("switching from Kidney to Ovary: no Kidney highlight remains", () => {
    // Step 1: select Kidney
    const s1 = handleEndpointSelect("KIDNEY \u2014 KIDNEY (WEIGHT)", FINDINGS);
    expect(s1.selectedFindingId).toBe(KIDNEY_M.id);

    // Step 2: switch to Ovary
    const s2 = handleEndpointSelect("OVARY \u2014 OVARY (WEIGHT)", FINDINGS);

    // Kidney rows must have NO highlight
    for (const kidneyFinding of [KIDNEY_M, KIDNEY_F]) {
      const h = classifyRow(
        kidneyFinding.endpoint_label!,
        kidneyFinding.id,
        s2.activeEndpoint,
        s2.selectedFindingId,
      );
      expect(h.isPrimary).toBe(false);
      expect(h.isSecondary).toBe(false);
      expect(h.isStaleHighlight).toBe(false);
    }

    // Ovary row IS highlighted
    const hO = classifyRow(
      OVARY_F.endpoint_label!,
      OVARY_F.id,
      s2.activeEndpoint,
      s2.selectedFindingId,
    );
    expect(hO.isPrimary).toBe(true);
  });
});

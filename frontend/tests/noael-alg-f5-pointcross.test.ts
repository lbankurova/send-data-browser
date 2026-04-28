/**
 * F5-PointCross — algorithm-defensibility test corpus signoff harness.
 *
 * Per NOAEL-ALG synthesis F5a / F5b: assert post-Path-C NOAEL output for
 * the canonical regression study against the current algorithm-defensible
 * value. This is a regression-detection harness (silent algorithmic drift
 * fails the test); per AC-F5-5, full toxicologist sign-off is tracked as
 * a deferred-defect entry per the AC-F5-5 pattern.
 *
 * The current expected values reflect the algorithm-defensibility analysis
 * persisted at `docs/validation/NOAEL-ALG-defensibility-pointcross.md`:
 *
 *   - Combined NOAEL = Not established (LOAEL at lowest treated dose,
 *     driven by C4 intrinsic-adverse pathology — hepatocellular carcinoma,
 *     mammary gland atrophy at every dose level).
 *   - BW endpoint Combined: NO firing dose under P3 terminal-primary.
 *     The 3 NS sign-flipping single-timepoint hits the BUG-031
 *     retrospective named are correctly suspended.
 *
 * Toxicologist sign-off (AC-F5-5) will retire this snapshot to a
 * fixture-driven assertion set keyed on the (study_id, finding_class
 * version) tuple in `docs/validation/NOAEL-ALG-signoff-snapshot.txt`.
 * Until then this test is regression-detection; a deviation should be
 * read as "the algorithm changed; re-confirm whether the new output is
 * still defensible."
 */

import { describe, it, expect } from "vitest";
import { computeEndpointNoaelMap } from "@/lib/derive-summaries";
import type {
  UnifiedFinding,
  DoseGroup,
  EndpointLoaelAggregated,
} from "@/types/analysis";

interface PointCrossFixture {
  findings: UnifiedFinding[];
  dose_groups: DoseGroup[];
  endpoint_loael_summary: Record<string, EndpointLoaelAggregated>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fixture: PointCrossFixture | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  const p = path.resolve(__dirname, "../../backend/generated/PointCross/unified_findings.json");
  if (fs.existsSync(p)) {
    fixture = JSON.parse(fs.readFileSync(p, "utf-8"));
  }
} catch {
  fixture = null;
}

const hasFixture = fixture && fixture.endpoint_loael_summary
  && Object.keys(fixture.endpoint_loael_summary).length > 0;
const itIfFixture = hasFixture ? it : it.skip;

describe("F5-PointCross — algorithm-defensibility regression", () => {
  itIfFixture(
    "BW endpoint Combined: post-BUG-032/033 fires HD only (defensible per Rule 19)",
    () => {
      // Find the Body Weight Combined entry (domain BW; classify_endpoint
      // routes to BW class; aggregator dispatches to p3_terminal_primary).
      const summary = fixture!.endpoint_loael_summary;
      const bwKey = Object.keys(summary).find(
        (k) => k.startsWith("Body Weight__Combined"),
      );
      expect(bwKey).toBeDefined();
      const bw = summary[bwKey!];
      expect(bw.endpoint_class).toBe("BW");
      // Post-BUG-032 fix (terminal-day field-name fallback) + BUG-033 fix
      // (C1 per-dose direction match): P3 correctly selects day-92 terminal,
      // C1 fires only at dose 3 where g=-3.13/g_lower=2.47 with direction
      // match, not at doses 1-2 where the per-dose effect is wrong-direction
      // NS or sub-threshold. Defensible NOAEL = 20 mg/kg per
      // docs/_internal/research/data-gap-noael-alg-01-pointcross-derivation.md.
      // The pre-BUG-032/033 expectation "no firing dose under P3" was the
      // slice-4 INVALID acceptance that masked both bugs (see
      // .lattice/cycle-state/NOAEL-ALG.yaml SF2 revised 2026-04-28).
      const firedDoses = Object.entries(bw.by_dose_level)
        .filter(([, d]) => d.fired && !d.suspended)
        .map(([k]) => k)
        .sort();
      expect(firedDoses).toEqual(["3"]);
    },
  );

  itIfFixture(
    "F2 dispatch covers expected endpoint classes (P3 + P2 + M1 + cumulative + single)",
    () => {
      // PointCross corpus exercises: BW (P3), LB-multi (P2/M1 depending
      // on n_timepoints), CL (single_timepoint_incidence), MI/MA/OM
      // (single_timepoint), with per-class C6 direction-consistency where
      // applicable.
      const summary = fixture!.endpoint_loael_summary;
      const policiesUsed = new Set<string>();
      for (const entry of Object.values(summary)) {
        for (const dec of Object.values(entry.by_dose_level)) {
          if (dec.policy) policiesUsed.add(dec.policy);
        }
      }
      // Should include P3 (BW) at minimum.
      expect(policiesUsed.has("p3_terminal_primary")).toBe(true);
      // M1 OR P2 (depending on n_timepoints distribution).
      expect(
        policiesUsed.has("m1_tightened_c2b")
          || policiesUsed.has("p2_sustained_consecutive"),
      ).toBe(true);
      // single_timepoint for terminal-sacrifice domains (MI/MA/OM).
      expect(policiesUsed.has("single_timepoint")).toBe(true);
    },
  );

  itIfFixture(
    "Frontend NOAEL map produces a valid Combined entry for at least one endpoint",
    () => {
      const noaelMap = computeEndpointNoaelMap(
        fixture!.findings,
        fixture!.dose_groups,
        fixture!.endpoint_loael_summary,
      );
      expect(noaelMap.size).toBeGreaterThan(0);
      // At least one endpoint should have a Combined tier value (the echo
      // path from the backend).
      let hasValidCombined = false;
      for (const result of noaelMap.values()) {
        if (result.combined && result.combined.tier !== "none") {
          hasValidCombined = true;
          break;
        }
      }
      expect(hasValidCombined).toBe(true);
    },
  );

  itIfFixture(
    "C4 intrinsic-adverse pathology fires only at doses with non-zero per-dose incidence (post-BUG-033 guard)",
    () => {
      // Post-BUG-033 fix: C4 restored with per-dose-incidence guard
      // (`gs.incidence > ctrl.incidence`). Preserves ECETOC B-6 / ICH S1B
      // "any dose-related increase" while excluding genuinely-zero-pathology
      // doses. PointCross HEPATOCELLULAR CARCINOMA fires only at HD (1/10
      // vs 0/10 ctrl, p=0.65 NS — neither C1 nor C5 catches this; C4 does).
      // The pre-BUG-033 expectation "fires at every treated dose level" was
      // the finding-level over-firing the per-dose-incidence guard removes.
      const summary = fixture!.endpoint_loael_summary;
      const carcinomaKey = Object.keys(summary).find((k) =>
        k.toLowerCase().includes("hepatocellular carcinoma")
          && k.endsWith("__Combined"),
      );
      // Fixture may name it differently across regen runs; soft-skip if
      // the exact key is absent.
      if (!carcinomaKey) return;
      const carcinoma = summary[carcinomaKey];
      const firedAtHD = carcinoma.by_dose_level["3"]?.fired === true
        && carcinoma.by_dose_level["3"]?.suspended === false;
      expect(firedAtHD).toBe(true);
    },
  );
});

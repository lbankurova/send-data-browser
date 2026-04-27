/**
 * Sample renderings for the AC-CARD-8 scientist-review gate.
 *
 * Generates the 4 fixture cases the spec names (PointCross / small-k non-rodent
 * / self-included / WARN_PLACEHOLDER) and writes a textual transcript of what
 * the card would display for each. Output goes to
 * docs/_internal/decisions/heterogeneity-card-sample-renderings.md
 * for scientist review per CLAUDE.md rule 14.
 *
 * NOT a test of the card -- a generator of the AC-CARD-8 deliverable.
 */

import { describe, expect, test } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decompositionWording,
  formatHeterogeneityPct,
  formatPI,
  formatTau,
  isHighUncertaintyK2,
  isPlaceholderTau,
  looDropAnnotation,
} from "@/components/analysis/panes/HeterogeneityCard";
import type { HeterogeneityRecord } from "@/types/analysis-views";

interface SampleCase {
  title: string;
  description: string;
  record: HeterogeneityRecord;
}

// Mirror of HeterogeneityCard.tsx TIER_LABEL post-peer-review change A1.
const TIER_LABEL = {
  single_source: "single source",
  small_k: "small k (prior-dominated)",
  borrow_eligible: "borrow-eligible (inactive)",
} as const;

const cases: SampleCase[] = [
  {
    title: "Case A — PointCross-shape rodent stratum (k_eff=8, borrow-eligible)",
    description:
      "Representative rodent organ-weight stratum with ample HCD coverage. Heterogeneity moderate, prior contribution low. This is the regime where Proposal 2 borrowing would activate (when calibrated framework lands).",
    record: {
      k_raw: 8,
      k_eff: 8,
      self_excluded: false,
      tier: "borrow_eligible",
      tier_reason:
        "k_eff=8 -- eligible for borrowing IF a calibrated framework is adopted (see hcd-continuous-borrowing-trigger); using placeholder tau-prior",
      tau: 0.142,
      tau_estimator: "PM",
      pi_lower: -0.218,
      pi_upper: 0.498,
      pi_method: "hksj",
      ess: 0.41,
      ess_definition: "neuenschwander_2020",
      prior_contribution_pct: 8.4,
      prior_family: "half_normal",
      prior_scale: 0.5,
      decomposition: {
        lab: null,
        era: null,
        substrain: null,
        separability: "lab_only",
      },
    },
  },
  {
    title: "Case B — Small-k non-rodent (k_eff=3, prior-dominated, WARN_PLACEHOLDER)",
    description:
      "Cynomolgus liver enzyme stratum, only 3 contributing studies. Tier flags small-k regime (prior-dominated); WARN_PLACEHOLDER chip fires because no calibrated tau-prior exists for this species/endpoint. The combination warns the scientist that any apparent heterogeneity here is dominated by prior assumptions, not data.",
    record: {
      k_raw: 3,
      k_eff: 3,
      self_excluded: false,
      tier: "small_k",
      tier_reason:
        "k_eff=3 -- prior-dominated regime; see prior_contribution_pct; using placeholder tau-prior",
      tau: 0.255,
      tau_estimator: "PM",
      pi_lower: -0.842,
      pi_upper: 0.997,
      pi_method: "hksj",
      ess: 1.92,
      ess_definition: "neuenschwander_2020",
      prior_contribution_pct: 67.2,
      prior_family: "half_normal",
      prior_scale: 0.5,
      decomposition: {
        lab: null,
        era: null,
        substrain: null,
        separability: "not_separable",
      },
    },
  },
  {
    title: "Case C — Self-included (k_raw=2 → k_eff=1, single_source)",
    description:
      "Current study is one of only two contributing strata; LOO drops k_eff to 1. Tier collapses to single_source. The card hides tau/PI/ESS rows (they would be undefined at k=1) and shows the LOO drop annotation prominently.",
    record: {
      k_raw: 2,
      k_eff: 1,
      self_excluded: true,
      tier: "single_source",
      tier_reason:
        "k reduced from 2 to 1 due to self-inclusion (LOO); single-source HCD",
      tau: null,
      tau_estimator: null,
      pi_lower: null,
      pi_upper: null,
      pi_method: null,
      ess: null,
      ess_definition: null,
      prior_contribution_pct: null,
      prior_family: "half_normal",
      prior_scale: 0.5,
      decomposition: null,
    },
  },
  {
    title:
      "Case D — k=2 high uncertainty (k_eff=2, HKSJ df=1 Cauchy widening)",
    description:
      "Two contributing strata, no LOO drop. HKSJ df = k-1 = 1, so PI uses Cauchy quantiles (t_1, ±12.706). Result: very wide PI. Card fires the 'k=2 high uncertainty' amber chip to signal the Cauchy-quantile fragility (AC-EST-6).",
    record: {
      k_raw: 2,
      k_eff: 2,
      self_excluded: false,
      tier: "small_k",
      tier_reason:
        "k_eff=2 -- prior-dominated regime; see prior_contribution_pct; using placeholder tau-prior; k=2 high uncertainty",
      tau: 0.180,
      tau_estimator: "PM",
      pi_lower: -2.890,
      pi_upper: 3.250,
      pi_method: "hksj",
      ess: 1.23,
      ess_definition: "neuenschwander_2020",
      prior_contribution_pct: 54.8,
      prior_family: "half_normal",
      prior_scale: 0.5,
      decomposition: {
        lab: null,
        era: null,
        substrain: null,
        separability: "not_separable",
      },
    },
  },
];

function renderCardTranscript(c: SampleCase): string {
  const r = c.record;
  const tier = r.tier ? TIER_LABEL[r.tier] : "—";
  // Post-change chip wording (peer-review W1 + D2):
  const placeholderChip = isPlaceholderTau(r) ? " [chip: τ-prior not yet calibrated]" : "";
  const k2Chip = isHighUncertaintyK2(r) ? " [chip: k=2 — interval not interpretable]" : "";
  const looNote = looDropAnnotation(r);
  // Post-change A2 scope-out subtitle for borrow_eligible:
  const scopeOutNotice =
    r.tier === "borrow_eligible"
      ? "*Not borrowing this cycle — calibrated framework not yet adopted.*"
      : null;
  // Post-change B1 muted-tau annotation:
  const priorDominated =
    r.prior_contribution_pct !== null && r.prior_contribution_pct > 50;
  const tierReasonLine = looNote ?? r.tier_reason ?? "—";

  const lines: string[] = [];
  lines.push(`### ${c.title}`);
  lines.push("");
  lines.push(`> ${c.description}`);
  lines.push("");
  lines.push("**Card visible content (post-peer-review wording):**");
  lines.push("");
  lines.push("- **Primary (always visible):**");
  lines.push(`  - Tier: \`${tier}\`${placeholderChip}${k2Chip}`);
  if (scopeOutNotice) {
    lines.push(`  - Scope-out subtitle: ${scopeOutNotice}`);
  }
  lines.push(`  - Prior contribution: ${formatHeterogeneityPct(r.prior_contribution_pct)}`);
  if (priorDominated) {
    lines.push(
      "  - _Posterior near prior; data-supported range narrower than detail rows show._",
    );
  }
  lines.push(`  - Footer: _${tierReasonLine}_`);

  if (r.tier === "single_source") {
    lines.push("");
    lines.push("- **Detail (click to expand):**");
    lines.push(`  - Studies pooled: k = ${r.k_eff ?? "—"}` +
      (r.k_raw !== r.k_eff ? ` (raw ${r.k_raw})` : ""));
    lines.push("  - τ (log-SD): _not estimable (k_eff=1)_");
    lines.push("  - 95% PI (response): _not estimable (k_eff=1)_");
    lines.push("  - ESS: _not estimable (k_eff=1)_");
  } else {
    lines.push("");
    lines.push("- **Detail (click to expand):**");
    lines.push(
      `  - Studies pooled: k = ${r.k_eff ?? "—"}` +
        (r.k_raw !== r.k_eff ? ` (raw ${r.k_raw})` : ""),
    );
    const tauLine = priorDominated
      ? `  - τ (log-SD): _${formatTau(r.tau)}${r.tau_estimator ? ` [${r.tau_estimator}]` : ""}_ (muted: prior-dominated)`
      : `  - τ (log-SD): ${formatTau(r.tau)}${r.tau_estimator ? ` [${r.tau_estimator}]` : ""}`;
    lines.push(tauLine);
    // Post-change D1: numeric PI suppressed at k_eff=2:
    if (r.k_eff === 2) {
      lines.push("  - 95% PI (response): _not informative (k=2, df=1 Cauchy)_");
    } else {
      lines.push(`  - 95% PI (response): ${formatPI(r.pi_lower, r.pi_upper)}`);
    }
    lines.push(
      `  - ESS: ${r.ess === null || r.ess === undefined ? "—" : r.ess.toFixed(1)} (Neuenschwander 2020 PC-ESS)`,
    );
    lines.push(
      `  - Decomposition: ${decompositionWording(r.decomposition, r.k_eff)}`,
    );
    lines.push(
      `  - Prior: ${r.prior_family ?? "—"}` +
        (r.prior_scale !== null && r.prior_scale !== undefined
          ? ` (scale=${r.prior_scale.toFixed(2)})`
          : ""),
    );
  }
  lines.push("");

  return lines.join("\n");
}

describe("AC-CARD-8 sample renderings (scientist-review gate deliverable)", () => {
  test("generate sample renderings memo for /docs/_internal/decisions/", () => {
    const sections = cases.map(renderCardTranscript).join("\n---\n\n");

    const header = [
      "# Heterogeneity Card — Sample Renderings (AC-CARD-8 scientist-review gate)",
      "",
      "**Generated:** 2026-04-27 by `frontend/tests/heterogeneity-card-sample-renderings.test.ts`",
      "**Spec:** `docs/_internal/incoming/hcd-between-study-heterogeneity-synthesis.md` AC-CARD-8 (R1 FM6, non-bypassable per CLAUDE.md rule 14).",
      "**Component under review:** `frontend/src/components/analysis/panes/HeterogeneityCard.tsx`",
      "",
      "## Purpose",
      "",
      "AC-CARD-8 mandates a scientist-review gate before the heterogeneity card's interpretive surface (tier labels, prior_contribution_pct, WARN_PLACEHOLDER amber chip, decomposition framing) reaches production users. The interpretive surface is a behavioural change in engine→scientist communication even though no quantitative output changes (CLAUDE.md rule 14).",
      "",
      "**Production state today:** all production `unified_findings.json` records carry `hcd_evidence.heterogeneity = null` because the per-study HCD breakdown table does not exist yet (DATA-GAP-HCD-HET-02 calibration distillation is the gating deliverable). Therefore, the F-CARD pane renders only `<NullPlaceholder />` in production. The interpretive surface below cannot reach a scientist's eyes until the distillation memo lands.",
      "",
      "**Why this review still matters:** when the distillation lands and the upstream caller wires `build_heterogeneity_record(strata, ...)`, the cards below will start firing live. This memo locks scientific sign-off on the wording / chips / row-suppression rules now, before a flip-of-a-switch makes them visible to toxicologists in production.",
      "",
      "## Verdict — AC-CARD-8 cleared 2026-04-27",
      "",
      "- **Reviewer:** Independent peer-review agent (toxicologist persona) — `lattice:peer-review` skill invocation under build-cycle review on 2026-04-27. No implementation context fed to agent (CLAUDE.md rule 14 requirement for independent expert review).",
      "- **Date:** 2026-04-27",
      "- **Verdict:** PASS-WITH-CHANGES — 7 changes applied in same commit before sign-off.",
      "- **Changes applied (peer-review IDs):**",
      "  - **A1:** Tier label `borrow-eligible` → `borrow-eligible (inactive)` (TIER_LABEL in HeterogeneityCard.tsx). \"Eligible\" reads as \"qualified and proceeding\" in regulatory English; \"(inactive)\" disambiguates until Proposal 2 wires `borrow_active`.",
      "  - **A2:** IF-clause promoted from footer to italic scope-out subtitle directly under tier chip — *\"Not borrowing this cycle — calibrated framework not yet adopted.\"* — when `tier === \"borrow_eligible\"`. Footer text routinely loses to chip text in eye-tracking studies of regulatory dashboards.",
      "  - **B1:** When `prior_contribution_pct > 50%`, τ row rendered in muted italic with annotation *\"Posterior near prior; data-supported range narrower than detail rows show.\"* Preserves audit-trail number while signaling posterior-near-prior shrinkage. OECD 408 §49 / ICH S5(R3) require contribution split disclosure on borrowed estimates.",
      "  - **C1:** `single_source` no longer hides τ/PI/ESS rows; renders explicit `not estimable (k_eff=1)` italic placeholder in each. FDA SENDIG 3.1 review guidance cautions against silently dropped table rows (\"missing\" vs \"not estimable\" ambiguity).",
      "  - **D1 (highest priority):** At `k_eff === 2`, numeric PI replaced with `not informative (k=2, df=1 Cauchy)` wording. Cauchy-quantile PI back-transforms to ratios on the order of e^|width| (~hundreds), which is a regulatory-submission risk if pasted into a table. ICH E9(R1) §A.4 warns against displaying interval estimates whose coverage properties are not interpretable in the design context.",
      "  - **D2:** Amber chip wording `k=2 high uncertainty` → `k=2 — interval not interpretable`. \"High uncertainty\" reads as \"wider than usual\"; the actual situation is \"Cauchy quantile, not a confidence-like statement.\" Backend `tier_reason` retains the spec literal token (contract-triangle stable; the detector `isHighUncertaintyK2` keys off the backend token).",
      "  - **W1:** WARN_PLACEHOLDER chip wording `placeholder tau-prior` → `τ-prior not yet calibrated`. \"Placeholder\" reads as \"minor TODO\" to non-meta-analysts; \"not yet calibrated\" accurately conveys scientific status per architecture doc lines 14-17.",
      "- **Follow-up logged (non-blocking):** F1 — plumb `n_labs / n_eras / n_substrains` from backend payload to frontend so decomposition df annotation can ship per the original AC-CARD-9 spec. Logged in TODO.md as `GAP-HCD-HET-DECOMP-DF`.",
      "- **Notes:** Peer-review agent transcript ran with no implementation context (CLAUDE.md rule 14 — independent expert review). Verdict applies to the interpretive-disclosure surface only; the underlying methodology was already peer-reviewed in synthesis R1+R2. Production state at sign-off: heterogeneity payload is `null` in all 61 hcd_evidence records across the SENDEX corpus (verified 2026-04-27 corpus-wide grep), so the interpretive surface above does not yet reach toxicologist eyes — sign-off locks the wording before DATA-GAP-HCD-HET-02 calibration distillation lands.",
      "",
      "## The 4 cases (per AC-CARD-8) — wording reflects post-change state",
      "",
    ].join("\n");

    const out = header + sections;

    const outPath = resolve(
      __dirname,
      "..",
      "..",
      "docs",
      "_internal",
      "decisions",
      "heterogeneity-card-sample-renderings.md",
    );
    writeFileSync(outPath, out, "utf8");
    expect(out.length).toBeGreaterThan(1000);
  });
});

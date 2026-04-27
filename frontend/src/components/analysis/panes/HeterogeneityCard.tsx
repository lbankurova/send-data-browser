/**
 * HeterogeneityCard pane (F-CARD, hcd-between-study-heterogeneity).
 *
 * Sibling pane to HcdEvidencePane. Renders the
 * `hcd_evidence.heterogeneity` payload populated by
 * `backend/services/analysis/hcd_evidence.py::build_heterogeneity_record()`.
 *
 * Visual contract (design-decisions §1-2 + .claude/rules/frontend-ui-gate.md):
 *   - Sentence case (X-01), font-mono for numerics (T-08), no font-bold (T-07).
 *   - Neutral gray badges; no per-category color.
 *   - Tooltips on tau-estimator label + ESS footnote (AC-CARD-6).
 *   - 2-row primary (tier + prior_contribution_pct) + expand for detail
 *     (AC-CARD-10 progressive disclosure).
 */

import { useState } from "react";
import type {
  HeterogeneityRecord,
  HeterogeneityDecomposition,
} from "@/types/analysis-views";

interface HeterogeneityCardProps {
  heterogeneity: HeterogeneityRecord | null | undefined;
}

const TIER_LABEL: Record<NonNullable<HeterogeneityRecord["tier"]>, string> = {
  single_source: "single source",
  small_k: "small k (prior-dominated)",
  // Peer-review change A1 (2026-04-27): "borrow-eligible" alone reads as
  // "borrowing is on" to busy regulatory reviewers. Append "(inactive)"
  // until Proposal 2 wires borrow_active. Re-rename when Proposal 2 ships.
  borrow_eligible: "borrow-eligible (inactive)",
};

export function formatTau(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(3);
}

function formatNumber(v: number | null, digits = 2): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return v > 0 ? "+inf" : "-inf";
  return v.toFixed(digits);
}

export function formatHeterogeneityPct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(1)}%`;
}

export function formatPI(lo: number | null, hi: number | null): string {
  if (lo === null || hi === null) return "—";
  return `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`;
}

export function decompositionWording(
  d: HeterogeneityDecomposition | null,
  k_eff: number | null,
  strataCounts?: { labs: number; eras: number; substrains: number },
): string {
  if (d === null) return "—";
  if (d.separability === "not_separable") {
    return `lab/era/substrain confounded; not separable at k=${k_eff ?? "?"}`;
  }
  // df annotation per AC-CARD-9: lives in the card text, not a tooltip.
  // Frontend doesn't always have lab/era/substrain counts -- when omitted,
  // print without df. Backend test exposes them via decomposition.lab/era/
  // substrain numbers when populated.
  if (d.separability === "lab_only") {
    const df =
      strataCounts && k_eff !== null
        ? ` (k=${k_eff}, df=${k_eff - strataCounts.labs})`
        : ` (k=${k_eff ?? "?"})`;
    return `lab effect detectable${df}`;
  }
  if (d.separability === "lab_era") {
    const df =
      strataCounts && k_eff !== null
        ? ` (k=${k_eff}, df=${k_eff - strataCounts.labs - strataCounts.eras + 1})`
        : ` (k=${k_eff ?? "?"})`;
    return `lab+era effects detectable${df}`;
  }
  if (d.separability === "full") {
    return `lab+era+substrain detectable (k=${k_eff ?? "?"})`;
  }
  return "—";
}

export function isPlaceholderTau(record: HeterogeneityRecord): boolean {
  // F-RODENT placeholder signal: tier_reason carries the literal token from
  // warn_if_placeholder() (AC-RODENT-3).
  return Boolean(
    record.tier_reason && record.tier_reason.includes("placeholder tau-prior"),
  );
}

export function isHighUncertaintyK2(record: HeterogeneityRecord): boolean {
  // AC-EST-6 amber chip token.
  return Boolean(
    record.tier_reason &&
      record.tier_reason.toLowerCase().includes("k=2 high uncertainty"),
  );
}

export function looDropAnnotation(record: HeterogeneityRecord): string | null {
  // AC-CARD-4: explicit LOO drop wording.
  if (!record.self_excluded) return null;
  return `k reduced from ${record.k_raw ?? "?"} to ${record.k_eff ?? "?"} due to self-inclusion (LOO)`;
}

/** Neutral placeholder when record is absent (AC-CARD-2). */
function NullPlaceholder() {
  return (
    <div className="space-y-1 text-xs">
      <p className="text-muted-foreground">
        No heterogeneity assessment — per-study HCD breakdown unavailable for
        this stratum.
      </p>
    </div>
  );
}

function AmberChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      className="ml-1 inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
      title={title}
    >
      {children}
    </span>
  );
}

export function HeterogeneityCard({ heterogeneity }: HeterogeneityCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!heterogeneity) return <NullPlaceholder />;

  const h = heterogeneity;
  const tierLabel = h.tier ? TIER_LABEL[h.tier] : "—";

  const looNote = looDropAnnotation(h);
  const placeholder = isPlaceholderTau(h);
  const highUncertaintyK2 = isHighUncertaintyK2(h);
  // Peer-review change B1 (2026-04-27): demote tau visually when prior dominates.
  // At >50% prior contribution, the point estimate is half-determined by the
  // prior tail, not the data — show but visually mute it.
  const priorDominated =
    h.prior_contribution_pct !== null && h.prior_contribution_pct > 50;
  // Peer-review change A2 (2026-04-27): for borrow-eligible tier, surface the
  // scope-out as a subtitle directly under the tier chip (footer text routinely
  // loses to chip text in eye-tracking studies of regulatory dashboards).
  const scopeOutNotice =
    h.tier === "borrow_eligible"
      ? "Not borrowing this cycle — calibrated framework not yet adopted."
      : null;

  // AC-CARD-10: 2-row primary by default
  const primary = (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">Tier</span>
        <span className="text-right">
          <span className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
            {tierLabel}
          </span>
          {placeholder && (
            // Peer-review change W1 (2026-04-27): "placeholder" reads as
            // "minor TODO" to a non-meta-analyst reader. "Not yet calibrated"
            // accurately conveys the scientific status.
            <AmberChip title="F-RODENT WARN_PLACEHOLDER -- numerical priors deferred to calibration distillation (AC-RODENT-5 / DATA-GAP-HCD-HET-02)">
              τ-prior not yet calibrated
            </AmberChip>
          )}
          {highUncertaintyK2 && (
            // Peer-review change D2 (2026-04-27): "high uncertainty" reads as
            // "wider than usual"; the actual situation is "Cauchy quantile,
            // not interpretable as a confidence-like statement." Strengthened.
            <AmberChip title="HKSJ df=1 at k=2 -> Cauchy quantiles. Interval coverage is not interpretable in the conventional sense (AC-EST-6).">
              k=2 — interval not interpretable
            </AmberChip>
          )}
        </span>
      </div>
      {scopeOutNotice && (
        <p className="text-[11px] text-muted-foreground italic">{scopeOutNotice}</p>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">Prior contribution</span>
        <span className="font-mono text-right">
          {formatHeterogeneityPct(h.prior_contribution_pct)}
        </span>
      </div>
      {priorDominated && (
        <p className="text-[10px] text-muted-foreground italic">
          Posterior near prior; data-supported range narrower than detail rows show.
        </p>
      )}
      {looNote && (
        <p className="text-[11px] text-muted-foreground">{looNote}</p>
      )}
      {h.tier_reason && !looNote && !scopeOutNotice && (
        <p className="text-[11px] text-muted-foreground">{h.tier_reason}</p>
      )}
    </div>
  );

  // Detail rows revealed on expand.
  const detail = (
    <table className="w-full text-xs">
      <tbody>
        <tr className="border-b border-dashed">
          <td className="w-1/2 py-1 text-muted-foreground">Studies pooled</td>
          <td className="py-1 text-right font-mono">
            k = {h.k_eff ?? "—"}
            {h.k_raw !== null && h.k_eff !== null && h.k_raw !== h.k_eff && (
              <span className="ml-1 text-muted-foreground">(raw {h.k_raw})</span>
            )}
          </td>
        </tr>
        {h.tier === "single_source" ? (
          // Peer-review change C1 (2026-04-27): instead of hiding tau/PI/ESS
          // rows entirely (AC-CARD-3 original), render "not estimable" so
          // reviewers see explicit absence rather than infer from missing rows.
          // FDA SENDIG 3.1 review guidance cautions against silently dropped
          // table rows.
          <>
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">τ (log-SD)</td>
              <td className="py-1 text-right text-[11px] italic text-muted-foreground">
                not estimable (k_eff=1)
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">95% PI (response)</td>
              <td className="py-1 text-right text-[11px] italic text-muted-foreground">
                not estimable (k_eff=1)
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">ESS</td>
              <td className="py-1 text-right text-[11px] italic text-muted-foreground">
                not estimable (k_eff=1)
              </td>
            </tr>
          </>
        ) : (
          <>
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">τ (log-SD)</td>
              <td
                className={`py-1 text-right font-mono${priorDominated ? " text-muted-foreground italic" : ""}`}
                title={
                  h.tau_estimator
                    ? `${h.tau_estimator} estimator (PM<5, REML>=10; see hcd-heterogeneity.md)`
                    : undefined
                }
              >
                {formatTau(h.tau)}
                {h.tau_estimator && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    [{h.tau_estimator}]
                  </span>
                )}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">95% PI (response)</td>
              <td
                className="py-1 text-right font-mono"
                title={
                  h.pi_method === "hksj"
                    ? "Hartung-Knapp-Sidik-Jonkman, IntHout 2016"
                    : h.pi_method === "reml_wald"
                      ? "REML-Wald (k>=10)"
                      : undefined
                }
              >
                {/* Peer-review change D1 (2026-04-27): at k_eff=2 (HKSJ df=1
                    Cauchy), the numeric PI back-transforms to ~e^|width| which
                    is uninformative and a regulatory-submission risk if pasted
                    into a table. Replace numbers with explicit
                    "not informative" wording. ICH E9(R1) §A.4 warns against
                    displaying interval estimates whose coverage properties
                    are not interpretable in the design context. */}
                {h.k_eff === 2 ? (
                  <span className="text-[11px] italic text-muted-foreground font-sans">
                    not informative (k=2, df=1 Cauchy)
                  </span>
                ) : (
                  formatPI(h.pi_lower, h.pi_upper)
                )}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td
                className="py-1 text-muted-foreground"
                title="ESS = Neuenschwander, Weber, Schmidli & O'Hagan 2020 predictively-consistent ESS."
              >
                ESS
              </td>
              <td className="py-1 text-right font-mono">{formatNumber(h.ess, 1)}</td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">Decomposition</td>
              <td className="py-1 text-right text-[11px]">
                {decompositionWording(h.decomposition, h.k_eff)}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">Prior</td>
              <td className="py-1 text-right font-mono text-[11px]">
                {h.prior_family ?? "—"}
                {h.prior_scale !== null && (
                  <span className="ml-1">(scale={h.prior_scale.toFixed(2)})</span>
                )}
              </td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-2 text-xs">
      {primary}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground"
      >
        {expanded ? "Hide heterogeneity detail" : "Show heterogeneity detail"}
      </button>
      {expanded && detail}
    </div>
  );
}

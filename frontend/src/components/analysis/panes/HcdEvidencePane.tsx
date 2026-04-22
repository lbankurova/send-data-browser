/**
 * HCD Evidence pane (F10, hcd-mi-ma-s08-wiring).
 *
 * Renders the `hcd_evidence` record attached to an MI/MA rule result.
 * Display-only in Phase-1; does not gate catalog firing or NOAEL.
 *
 * Visual contract (design-decisions §1-2):
 *   - Chip: neutral gray (bg-gray-100 text-gray-600 border-gray-200), text-[10px].
 *   - Pane text: text-xs cell body, text-xs font-semibold header (T-02).
 *   - Sentence case (X-01), font-mono for numeric values (T-08), no font-bold (T-07).
 *   - No raw hex, no per-category color.
 */

import type { HcdEvidence } from "@/types/analysis-views";
import { formatPValue } from "@/lib/severity-colors";

interface HcdEvidencePaneProps {
  evidence: HcdEvidence;
  missReason?: string; // optional override text for the absence state
}

type PercentileTier = "above_95" | "above_99" | "within" | "below_5" | "unknown";

function classifyPercentile(pct: number | null): PercentileTier {
  if (pct === null) return "unknown";
  if (pct > 99) return "above_99";
  if (pct > 95) return "above_95";
  if (pct < 5) return "below_5";
  return "within";
}

const PERCENTILE_LABEL: Record<PercentileTier, string> = {
  above_99: "HCD: >99th pct",
  above_95: "HCD: >95th pct",
  within: "HCD: within range",
  below_5: "HCD: <5th pct",
  unknown: "HCD: n/a",
};

export function HcdChip({ evidence }: { evidence: HcdEvidence | null | undefined }) {
  if (!evidence) return null;
  // No chip when crosswalk miss / species not covered / cell-N too low.
  if (evidence.background_rate === null) return null;

  const tier = classifyPercentile(evidence.percentile_of_observed);
  const label = PERCENTILE_LABEL[tier];
  return (
    <span
      className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
      title={`Background rate ${((evidence.background_rate ?? 0) * 100).toFixed(1)}% (${evidence.source ?? "n/a"})`}
    >
      {label}
    </span>
  );
}

function formatYearRange(range: [number, number] | null): string {
  if (!range) return "—";
  const [a, b] = range;
  return a === b ? String(a) : `${a}-${b}`;
}

function formatPct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatPercentile(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(0)}th`;
}

function MissState({ reason }: { reason: string }) {
  return (
    <div className="space-y-1 text-xs">
      <p className="text-muted-foreground">No HCD match — {reason}</p>
    </div>
  );
}

function explainMiss(e: HcdEvidence): string {
  if (e.cell_n_below_reliability_threshold && e.match_tier !== null) {
    return `reference cell N below reliability threshold`;
  }
  if (e.match_tier === null && e.source === null) {
    return "crosswalk miss / species not covered";
  }
  return "no HCD cell available for this combination";
}

/** F4 AC-F4-2 / AC-F4-4: explicit message when β-adjunct cannot be computed. */
function betaAdjunctWithheldReason(e: HcdEvidence): string | null {
  if (e.fisher_p_vs_hcd !== null) return null;
  if (e.background_rate === null) return null; // caller renders MissState instead
  const n = e.background_n_animals;
  if (n === null) {
    return "no β-adjunct statistic — HCD counts unavailable";
  }
  if (n < 100) {
    return `β-adjunct withheld: reference N below reliability threshold (n=${n})`;
  }
  return null;
}

export function HcdEvidencePane({ evidence, missReason }: HcdEvidencePaneProps) {
  const missing = evidence.background_rate === null;

  if (missing) {
    return <MissState reason={missReason ?? explainMiss(evidence)} />;
  }

  const sourceLabel = evidence.source ?? "unknown";
  const yearRange = formatYearRange(evidence.year_range);
  const cellN = evidence.background_n_animals ?? 0;

  const components = evidence.contribution_components;
  const hcdDiscordantProtective =
    components.hcd_discordant_protective === -1;

  return (
    <div className="space-y-2 text-xs">
      <table className="w-full text-xs">
        <tbody>
          <tr className="border-b border-dashed">
            <td className="w-1/2 py-1 text-muted-foreground">Background rate</td>
            <td className="py-1 text-right font-mono">{formatPct(evidence.background_rate)}</td>
          </tr>
          <tr className="border-b border-dashed">
            <td className="py-1 text-muted-foreground">Source</td>
            <td className="py-1 text-right">
              <span className="font-mono text-[11px]">{sourceLabel}</span>
              <span className="ml-1 text-muted-foreground">({yearRange})</span>
            </td>
          </tr>
          <tr className="border-b border-dashed">
            <td className="py-1 text-muted-foreground">Reference N</td>
            <td className="py-1 text-right font-mono">{cellN}</td>
          </tr>
          <tr className="border-b border-dashed">
            <td className="py-1 text-muted-foreground">Observed percentile</td>
            <td className="py-1 text-right font-mono">{formatPercentile(evidence.percentile_of_observed)}</td>
          </tr>
          <tr className="border-b border-dashed">
            <td className="py-1 text-muted-foreground">Match tier</td>
            <td className="py-1 text-right">
              <span className="font-mono">{evidence.match_tier ?? "—"}</span>
              {evidence.match_confidence && (
                <span className="ml-1 text-[11px] text-muted-foreground">({evidence.match_confidence})</span>
              )}
            </td>
          </tr>
          {evidence.fisher_p_vs_hcd !== null && (
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">vs HCD</td>
              <td className="py-1 text-right font-mono">{formatPValue(evidence.fisher_p_vs_hcd)}</td>
            </tr>
          )}
          {(() => {
            const withheld = betaAdjunctWithheldReason(evidence);
            if (!withheld) return null;
            return (
              <tr className="border-b border-dashed">
                <td className="py-1 text-muted-foreground">vs HCD</td>
                <td className="py-1 text-right text-[11px]">{withheld}</td>
              </tr>
            );
          })()}
          {evidence.drift_flag !== null && evidence.drift_flag === true && (
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">Drift flag</td>
              <td className="py-1 text-right text-[11px]">reference predates study by &gt;10y</td>
            </tr>
          )}
          {evidence.alpha_applies && (
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">α-cell scaling</td>
              <td className="py-1 text-right text-[11px]">{evidence.reason}</td>
            </tr>
          )}
          {hcdDiscordantProtective && (
            <tr className="border-b border-dashed">
              <td className="py-1 text-muted-foreground">HCD-discordant protective</td>
              <td className="py-1 text-right text-[11px]">candidate flagged for review</td>
            </tr>
          )}
        </tbody>
      </table>

      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted-foreground">γ contribution breakdown (audit)</summary>
        <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono">
          <dt className="text-muted-foreground">&gt;95th</dt>
          <dd className="text-right">{components.gt_95th_percentile}</dd>
          <dt className="text-muted-foreground">&gt;99th</dt>
          <dd className="text-right">{components.gt_99th_percentile}</dd>
          <dt className="text-muted-foreground">&lt;5th (down)</dt>
          <dd className="text-right">{components.below_5th_down_direction}</dd>
          <dt className="text-muted-foreground">Ultra-rare</dt>
          <dd className="text-right">{components.ultra_rare_any_occurrence}</dd>
          <dt className="text-muted-foreground">Discordant protective</dt>
          <dd className="text-right">{components.hcd_discordant_protective}</dd>
          <dt className="text-muted-foreground">Tier cap</dt>
          <dd className="text-right">{components.tier_cap_applied ? "yes" : "no"}</dd>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-right">{evidence.confidence_contribution}</dd>
        </dl>
      </details>

      {evidence.noael_floor_applied && (
        <p className="text-[11px] text-muted-foreground">
          NOAEL floor applies — Sentinel / HighConcern class protected from γ downgrade.
        </p>
      )}
    </div>
  );
}

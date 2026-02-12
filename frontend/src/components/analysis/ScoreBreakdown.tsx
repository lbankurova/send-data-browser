import type { ReactNode } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { DomainLabel } from "@/components/ui/DomainLabel";
import {
  computeSignalScoreBreakdown,
  computeEvidenceScoreBreakdown,
  computeConfidenceBreakdown,
  SIGNAL_SCORE_WEIGHTS,
} from "@/lib/rule-definitions";
import { formatPValue, formatEffectSize } from "@/lib/severity-colors";

// ---------------------------------------------------------------------------
// Shared styling
// ---------------------------------------------------------------------------

const triggerClass =
  "cursor-pointer underline decoration-dotted decoration-muted-foreground/40 underline-offset-2";

// ---------------------------------------------------------------------------
// SignalScorePopover
// ---------------------------------------------------------------------------

export function SignalScorePopover({
  row,
  children,
}: {
  row: {
    p_value: number | null;
    trend_p: number | null;
    effect_size: number | null;
    dose_response_pattern: string;
    signal_score: number;
  };
  children: ReactNode;
}) {
  const breakdown = computeSignalScoreBreakdown(row);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className={triggerClass}>{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="mb-2 text-xs font-semibold">Signal score breakdown</div>
        <table className="w-full text-[10px] font-mono tabular-nums">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pb-1 text-left font-medium">Component</th>
              <th className="pb-1 text-right font-medium">Weight</th>
              <th className="pb-1 text-right font-medium">Raw</th>
              <th className="pb-1 text-right font-medium">Contribution</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/30">
              <td className="py-0.5">p-value</td>
              <td className="py-0.5 text-right">{SIGNAL_SCORE_WEIGHTS.pValue}</td>
              <td className="py-0.5 text-right">{formatPValue(breakdown.pValueRaw)}</td>
              <td className="py-0.5 text-right">{breakdown.pValueComponent.toFixed(3)}</td>
            </tr>
            <tr className="border-b border-border/30">
              <td className="py-0.5">Trend</td>
              <td className="py-0.5 text-right">{SIGNAL_SCORE_WEIGHTS.trend}</td>
              <td className="py-0.5 text-right">{formatPValue(breakdown.trendRaw)}</td>
              <td className="py-0.5 text-right">{breakdown.trendComponent.toFixed(3)}</td>
            </tr>
            <tr className="border-b border-border/30">
              <td className="py-0.5">Effect size</td>
              <td className="py-0.5 text-right">{SIGNAL_SCORE_WEIGHTS.effectSize}</td>
              <td className="py-0.5 text-right">{formatEffectSize(breakdown.effectSizeRaw)}</td>
              <td className="py-0.5 text-right">{breakdown.effectSizeComponent.toFixed(3)}</td>
            </tr>
            <tr className="border-b border-border/30">
              <td className="py-0.5">Pattern</td>
              <td className="py-0.5 text-right">{SIGNAL_SCORE_WEIGHTS.pattern}</td>
              <td className="py-0.5 text-right text-[9px]">
                {breakdown.patternRaw?.replace(/_/g, " ") ?? "\u2014"}
              </td>
              <td className="py-0.5 text-right">{breakdown.patternComponent.toFixed(3)}</td>
            </tr>
            <tr className="border-t font-semibold">
              <td className="pt-1" colSpan={3}>Total</td>
              <td className="pt-1 text-right">{breakdown.total.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-2 text-[9px] text-muted-foreground">
          formula: min(&minus;log<sub>10</sub>(p)/4, 1) &times; weight
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// EvidenceScorePopover
// ---------------------------------------------------------------------------

export function EvidenceScorePopover({
  organ,
  children,
}: {
  organ: {
    evidence_score: number;
    n_endpoints: number;
    n_domains: number;
    domains: string[];
    n_significant: number;
  };
  children: ReactNode;
}) {
  const breakdown = computeEvidenceScoreBreakdown(organ);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className={triggerClass}>{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="mb-2 text-xs font-semibold">Evidence score breakdown</div>
        <div className="space-y-1.5 text-[10px] font-mono tabular-nums">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg signal per endpoint</span>
            <span>{breakdown.avgSignalPerEndpoint.toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Unique endpoints</span>
            <span>{breakdown.nEndpoints}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Domains</span>
            <span className="flex items-center gap-1">
              {breakdown.nDomains} (
              {breakdown.domains.map((d) => (
                <DomainLabel key={d} domain={d} />
              ))}
              )
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Convergence multiplier</span>
            <span>{breakdown.convergenceMultiplier.toFixed(1)}&times; (= 1 + 0.2 &times; {breakdown.nDomains - 1})</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <span>Evidence score</span>
            <span>{breakdown.evidenceScore.toFixed(3)}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-muted-foreground">Target organ</span>
            <span>
              evidence &ge; 0.3{" "}
              {breakdown.meetsEvidenceThreshold ? "\u2713" : "\u2717"} AND
              significant &ge; 1{" "}
              {breakdown.meetsSignificantThreshold ? "\u2713" : "\u2717"}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// ConfidencePopover
// ---------------------------------------------------------------------------

export function ConfidencePopover({
  row,
  allNoael,
  children,
}: {
  row: {
    sex: string;
    noael_dose_level: number;
    noael_label: string;
    noael_confidence: number;
    n_adverse_at_loael: number;
  };
  allNoael: Array<{
    sex: string;
    noael_dose_level: number;
    noael_label: string;
    noael_confidence: number;
  }>;
  children: ReactNode;
}) {
  const breakdown = computeConfidenceBreakdown(row, allNoael);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className={triggerClass}>{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="mb-2 text-xs font-semibold">NOAEL confidence breakdown</div>
        <div className="space-y-1 text-[10px] font-mono tabular-nums">
          <div className="flex justify-between">
            <span>Base</span>
            <span>{breakdown.base.toFixed(2)}</span>
          </div>
          <PenaltyRow
            label="Single endpoint"
            value={breakdown.singleEndpointPenalty}
            detail={breakdown.singleEndpointDetail}
          />
          <PenaltyRow
            label="Sex inconsistency"
            value={breakdown.sexInconsistencyPenalty}
            detail={breakdown.sexInconsistencyDetail}
          />
          <PenaltyRow
            label="Pathology disagreement"
            value={breakdown.pathologyPenalty}
            detail={breakdown.pathologyDetail}
          />
          <PenaltyRow
            label="Large effect non-sig"
            value={breakdown.largeEffectPenalty}
            detail={breakdown.largeEffectDetail}
          />
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <span>Confidence</span>
            <span>
              {breakdown.total.toFixed(2)} ({Math.round(breakdown.total * 100)}%)
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PenaltyRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">&minus; {label}</span>
      <span className="flex items-baseline gap-1.5">
        <span>{value.toFixed(2)}</span>
        <span className="text-[9px] text-muted-foreground">({detail})</span>
      </span>
    </div>
  );
}

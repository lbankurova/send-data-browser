import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatEffectSize, getEffectSizeColor } from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import type { FindingContext } from "@/types/analysis";
import type { EffectSizeMethod } from "@/lib/stat-method-transforms";

// ─── Types ─────────────────────────────────────────────────

interface EffectEntry {
  finding_id: string;
  endpoint_label: string;
  finding: string;
  domain: string;
  effect_size: number;
  data_type: string;
  peak_day: number | null;
  peak_sex: string | null;
}

interface Props {
  effectSize: FindingContext["effect_size"];
  selectedFindingId: string | null;
  effectSizeMethod?: EffectSizeMethod;
}

// ─── Constants ──────────────────────────────────────────────

const TOP_N = 10;

// ─── Sub-components ─────────────────────────────────────────

function EffectList({ entries, currentLabel, label, total, unit }: {
  entries: EffectEntry[];
  currentLabel: string;
  label: string;
  total: number;
  unit: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const canExpand = total > TOP_N;
  const visible = expanded ? entries : entries.slice(0, TOP_N);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="shrink-0 text-[11px] font-mono text-muted-foreground">{unit}</span>
      </div>
      <div className="space-y-0.5">
        {visible.map((e, i) => {
          const isCurrent = e.endpoint_label === currentLabel;
          const peakParts: string[] = [];
          if (e.peak_day != null) peakParts.push(`Day ${e.peak_day}`);
          if (e.peak_sex) peakParts.push(e.peak_sex);
          const peakLabel = peakParts.length > 0 ? peakParts.join(", ") : null;

          return (
            <div
              key={e.endpoint_label}
              className={cn(
                "flex items-center gap-1 text-xs",
                isCurrent && "bg-accent font-medium rounded"
              )}
            >
              <span className="w-5 shrink-0 text-right text-[11px] text-muted-foreground">
                #{i + 1}
              </span>
              <DomainLabel domain={e.domain} />
              <span className="flex-1 truncate" title={peakLabel ? `Peak: ${peakLabel}` : undefined}>
                {e.finding}
                {peakLabel && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({peakLabel})
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono",
                  getEffectSizeColor(e.effect_size)
                )}
              >
                {formatEffectSize(e.effect_size)}
              </span>
            </div>
          );
        })}
      </div>
      {canExpand && (
        <button
          type="button"
          className="mt-1 text-[11px] text-primary hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show top 10" : `Show all ${total}`}
        </button>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function ContextPane({ effectSize, selectedFindingId: _selectedFindingId, effectSizeMethod }: Props) {
  const continuous = effectSize.continuous_effects ?? [];
  const incidence = effectSize.incidence_effects ?? [];

  if (continuous.length === 0 && incidence.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No effect sizes computed for this study.
      </div>
    );
  }

  const currentLabel = effectSize.current_endpoint_label ?? "";
  const symbol = getEffectSizeSymbol(effectSizeMethod ?? "hedges-g");

  return (
    <div className="space-y-3">
      <EffectList
        entries={continuous}
        currentLabel={currentLabel}
        label="Largest continuous effects"
        total={effectSize.total_continuous ?? continuous.length}
        unit={`|${symbol}|`}
      />
      <EffectList
        entries={incidence}
        currentLabel={currentLabel}
        label="Largest incidence effects"
        total={effectSize.total_incidence ?? incidence.length}
        unit="avg severity"
      />
    </div>
  );
}

import { useMemo } from "react";
import { FilterSelect } from "@/components/ui/FilterBar";
import type { SignalSummaryRow, StudySummaryFilters as Filters } from "@/types/analysis-views";

interface Props {
  data: SignalSummaryRow[];
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function StudySummaryFilters({ data, filters, onChange }: Props) {
  const endpointTypes = useMemo(
    () => [...new Set(data.map((r) => r.endpoint_type))].sort(),
    [data]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Endpoint
        <FilterSelect
          value={filters.endpoint_type ?? ""}
          onChange={(e) =>
            onChange({ ...filters, endpoint_type: e.target.value || null })
          }
        >
          <option value="">All</option>
          {endpointTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
            </option>
          ))}
        </FilterSelect>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Sex
        <FilterSelect
          value={filters.sex ?? ""}
          onChange={(e) =>
            onChange({ ...filters, sex: e.target.value || null })
          }
        >
          <option value="">All</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Min score
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={filters.signal_score_min}
          onChange={(e) =>
            onChange({
              ...filters,
              signal_score_min: parseFloat(e.target.value),
            })
          }
          className="h-1 w-20"
        />
        <span className="w-8 text-right font-mono text-xs">
          {filters.signal_score_min.toFixed(2)}
        </span>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={filters.significant_only}
          onChange={(e) =>
            onChange({ ...filters, significant_only: e.target.checked })
          }
          className="h-3.5 w-3.5 rounded border"
        />
        Significant only
      </label>
    </div>
  );
}

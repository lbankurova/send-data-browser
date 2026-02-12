import { FilterSelect } from "@/components/ui/FilterBar";
import type { AdverseEffectsFilters } from "@/types/analysis";

interface FindingsFilterBarProps {
  filters: AdverseEffectsFilters;
  onFiltersChange: (filters: AdverseEffectsFilters) => void;
}

const DOMAINS = ["LB", "BW", "OM", "MI", "MA", "CL"];
const SEVERITIES = ["adverse", "warning", "normal"];

export function FindingsFilterBar({
  filters,
  onFiltersChange,
}: FindingsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Domain
        <FilterSelect
          value={filters.domain ?? ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, domain: e.target.value || null })
          }
        >
          <option value="">All</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </FilterSelect>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Sex
        <FilterSelect
          value={filters.sex ?? ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, sex: e.target.value || null })
          }
        >
          <option value="">All</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Classification
        <FilterSelect
          value={filters.severity ?? ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, severity: e.target.value || null })
          }
        >
          <option value="">All</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </FilterSelect>
      </label>

      <input
        placeholder="Search findings..."
        value={filters.search}
        onChange={(e) =>
          onFiltersChange({ ...filters, search: e.target.value })
        }
        className="rounded border bg-background px-2 py-0.5 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

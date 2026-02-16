import { FilterSelect } from "@/components/ui/FilterBar";
import type { AdverseEffectsFilters } from "@/types/analysis";

interface FindingsFilterBarProps {
  filters: AdverseEffectsFilters;
  onFiltersChange: (filters: AdverseEffectsFilters) => void;
  /** Hide domain dropdown when Domain grouping is active in the rail. */
  hideDomain?: boolean;
}

const DOMAINS = ["LB", "BW", "OM", "MI", "MA", "CL"];
const SEVERITIES = ["adverse", "warning", "normal"];

export function FindingsFilterBar({
  filters,
  onFiltersChange,
  hideDomain = false,
}: FindingsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!hideDomain && (
        <FilterSelect
          value={filters.domain ?? ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, domain: e.target.value || null })
          }
        >
          <option value="">All domains</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </FilterSelect>
      )}

      <FilterSelect
        value={filters.sex ?? ""}
        onChange={(e) =>
          onFiltersChange({ ...filters, sex: e.target.value || null })
        }
      >
        <option value="">All sexes</option>
        <option value="M">Male</option>
        <option value="F">Female</option>
      </FilterSelect>

      <FilterSelect
        value={filters.severity ?? ""}
        onChange={(e) =>
          onFiltersChange({ ...filters, severity: e.target.value || null })
        }
      >
        <option value="">All classifications</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </FilterSelect>

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

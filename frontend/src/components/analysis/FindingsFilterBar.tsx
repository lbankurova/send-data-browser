import { FilterSelect } from "@/components/ui/FilterBar";
import type { AdverseEffectsFilters } from "@/types/analysis";

interface FindingsFilterBarProps {
  filters: AdverseEffectsFilters;
  onFiltersChange: (filters: AdverseEffectsFilters) => void;
  /** Hide domain dropdown when Domain grouping is active in the rail. */
  hideDomain?: boolean;
  /** Label for the active rail scope chip (e.g., "Hepatic", "LB — Laboratory"). */
  scopeLabel?: string | null;
  /** Called when the user clears the scope chip. */
  onClearScope?: () => void;
}

const DOMAINS = ["LB", "BW", "OM", "MI", "MA", "CL"];
const SEVERITIES = ["adverse", "warning", "normal"];

export function FindingsFilterBar({
  filters,
  onFiltersChange,
  hideDomain = false,
  scopeLabel,
  onClearScope,
}: FindingsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {scopeLabel && onClearScope && (
        <span className="inline-flex items-center gap-1 rounded border border-border bg-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
          {scopeLabel}
          <button
            className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClearScope}
            title="Clear scope"
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </span>
      )}
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

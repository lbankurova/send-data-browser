import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useRailMode } from "@/contexts/RailModeContext";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { FilterSelect } from "@/components/ui/FilterBar";
import { OrganRailMode } from "./OrganRailMode";
import { SpecimenRailMode } from "./SpecimenRailMode";

// ---------------------------------------------------------------------------
// PolymorphicRail
// ---------------------------------------------------------------------------

export function PolymorphicRail() {
  const { studyId } = useParams<{ studyId: string }>();
  const { mode, setMode } = useRailMode();
  const { filters, setFilters } = useGlobalFilters();

  // Only render when studyId is present
  if (!studyId) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Mode toggle */}
      <div className="shrink-0 border-b bg-muted/30 px-2.5 py-1.5">
        <div className="flex gap-px rounded-sm bg-muted/40 p-px">
          {(["organ", "specimen"] as const).map((m) => (
            <button
              key={m}
              className={cn(
                "flex-1 rounded-sm px-2 py-1 text-[10px] font-medium transition-colors",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMode(m)}
            >
              {m === "organ" ? "Organs" : "Specimens"}
            </button>
          ))}
        </div>
      </div>

      {/* Global filter bar */}
      <div className="shrink-0 border-b px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Search\u2026"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <FilterSelect
            value={filters.sex ?? ""}
            onChange={(e) => setFilters({ sex: e.target.value || null })}
          >
            <option value="">All</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </FilterSelect>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={filters.adverseOnly}
              onChange={(e) => setFilters({ adverseOnly: e.target.checked })}
              className="h-3 w-3 rounded border-gray-300"
            />
            Adverse
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={filters.significantOnly}
              onChange={(e) =>
                setFilters({ significantOnly: e.target.checked })
              }
              className="h-3 w-3 rounded border-gray-300"
            />
            Significant
          </label>
        </div>
      </div>

      {/* Mode content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === "organ" ? <OrganRailMode /> : <SpecimenRailMode />}
      </div>
    </div>
  );
}

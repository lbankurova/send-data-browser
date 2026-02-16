import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAdverseEffects } from "@/hooks/useAdverseEffects";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { FindingsFilterBar } from "../FindingsFilterBar";
import { FindingsTable } from "../FindingsTable";
import { FilterBar, FilterBarCount } from "@/components/ui/FilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdverseEffectsFilters } from "@/types/analysis";

export function AdverseEffectsView() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectStudy } = useSelection();
  const { selectFinding } = useFindingSelection();

  const [filters, setFilters] = useState<AdverseEffectsFilters>({
    domain: null,
    sex: null,
    severity: null,
    search: "",
  });

  // Sync study selection
  useEffect(() => {
    if (studyId) selectStudy(studyId);
  }, [studyId, selectStudy]);

  // Clear finding selection when filters change
  useEffect(() => {
    selectFinding(null);
  }, [filters, selectFinding]);

  const { data, isLoading, error } = useAdverseEffects(
    studyId,
    1,
    10000,
    filters
  );

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load analysis: {error.message}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filter bar — aligned with other views */}
      <FilterBar>
        <FindingsFilterBar filters={filters} onFiltersChange={setFilters} />
        {data && (
          <>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.summary.total_adverse} adverse
            </span>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.summary.total_warning} warning
            </span>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.summary.total_normal} normal
            </span>
            <FilterBarCount>{data.summary.total_findings} total</FilterBarCount>
          </>
        )}
      </FilterBar>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
      {isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : data ? (
        <FindingsTable
          findings={data.findings}
          doseGroups={data.dose_groups}
        />
      ) : null}
      </div>
    </div>
  );
}

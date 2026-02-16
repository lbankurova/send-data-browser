import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAdverseEffects } from "@/hooks/useAdverseEffects";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { FindingsFilterBar } from "../FindingsFilterBar";
import { FindingsTable } from "../FindingsTable";
import { DataTablePagination } from "@/components/data-table/DataTablePagination";
import { FilterBar, FilterBarCount } from "@/components/ui/FilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdverseEffectsFilters } from "@/types/analysis";

export function AdverseEffectsView() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectStudy } = useSelection();
  const { selectFinding } = useFindingSelection();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const { data, isLoading, error } = useAdverseEffects(
    studyId,
    page,
    pageSize,
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
      <div className="flex-1 overflow-auto p-4">
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : data ? (
        <>
          <FindingsTable
            findings={data.findings}
            doseGroups={data.dose_groups}
          />
          <DataTablePagination
            page={data.page}
            pageSize={data.page_size}
            totalPages={data.total_pages}
            totalRows={data.total_findings}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </>
      ) : null}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAdverseEffects } from "@/hooks/useAdverseEffects";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { FindingsFilterBar } from "../FindingsFilterBar";
import { FindingsTable } from "../FindingsTable";
import { DataTablePagination } from "@/components/data-table/DataTablePagination";
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
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Adverse Effects</h1>
        <p className="text-sm text-muted-foreground">{studyId}</p>
      </div>

      {/* Summary counts */}
      {data && (
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">
            {data.summary.total_adverse} adverse
          </span>
          <span className="rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
            {data.summary.total_warning} warning
          </span>
          <span className="rounded-sm border border-green-200 bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">
            {data.summary.total_normal} normal
          </span>
          <span className="ml-1 text-muted-foreground">
            {data.summary.total_findings} total
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4">
        <FindingsFilterBar filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Table */}
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
  );
}

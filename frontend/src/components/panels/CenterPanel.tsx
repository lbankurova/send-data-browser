import { useState } from "react";
import { useParams } from "react-router-dom";
import { useDomainData } from "@/hooks/useDomainData";
import { DataTable } from "@/components/data-table/DataTable";
import { DataTablePagination } from "@/components/data-table/DataTablePagination";
import { Skeleton } from "@/components/ui/skeleton";
import { DOMAIN_DESCRIPTIONS } from "@/lib/send-categories";

export function CenterPanel() {
  const { studyId, domainName } = useParams<{
    studyId: string;
    domainName: string;
  }>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data, isLoading, error } = useDomainData(
    studyId!,
    domainName!,
    page,
    pageSize
  );

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load data: {error.message}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">
          {domainName!.toUpperCase()}
          <span className="ml-2 text-lg font-normal text-muted-foreground">
            {DOMAIN_DESCRIPTIONS[domainName!.toUpperCase()] ?? data?.label ?? ""}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">{studyId}</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="overflow-x-auto">
            <DataTable columns={data.columns} rows={data.rows} />
          </div>
          <DataTablePagination
            page={data.page}
            pageSize={data.page_size}
            totalPages={data.total_pages}
            totalRows={data.total_rows}
            onPageChange={(p) => setPage(p)}
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

import { useParams } from "react-router-dom";
import { useDomainData } from "@/hooks/useDomainData";
import { DataTable } from "@/components/data-table/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { DOMAIN_DESCRIPTIONS } from "@/lib/send-categories";

export function CenterPanel() {
  const { studyId, domainName } = useParams<{
    studyId: string;
    domainName: string;
  }>();

  const { data, isLoading, error } = useDomainData(
    studyId!,
    domainName!,
    1,
    10000
  );

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load data: {error.message}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold">
          {domainName!.toUpperCase()}
          <span className="ml-2 text-lg font-normal text-muted-foreground">
            {DOMAIN_DESCRIPTIONS[domainName!.toUpperCase()] ?? data?.label ?? ""}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">{studyId}</p>
      </div>

      {isLoading ? (
        <div className="space-y-2 px-6">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : data ? (
        <div className="min-h-0 flex-1 px-6 pb-6">
          <DataTable columns={data.columns} rows={data.rows} totalRows={data.total_rows} storageKeyPrefix={`pcc.domain.${domainName}`} />
        </div>
      ) : null}
    </div>
  );
}

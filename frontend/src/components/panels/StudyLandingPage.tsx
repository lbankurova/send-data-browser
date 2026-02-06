import { useParams } from "react-router-dom";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { Skeleton } from "@/components/ui/skeleton";

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="select-all">{value}</span>
    </div>
  );
}

function formatDuration(iso: string): string {
  // P13W → 13 weeks, P14D → 14 days
  const wMatch = iso.match(/^P(\d+)W$/);
  if (wMatch) return `${wMatch[1]} weeks`;
  const dMatch = iso.match(/^P(\d+)D$/);
  if (dMatch) return `${dMatch[1]} days`;
  return iso;
}

function formatSubjects(
  total: string | null,
  males: string | null,
  females: string | null
): string | null {
  if (!total) return null;
  const parts = [total];
  if (males && females) parts.push(`(${males}M, ${females}F)`);
  return parts.join(" ");
}

export function StudyLandingPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: meta, isLoading, error } = useStudyMetadata(studyId!);

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load study metadata: {error.message}
      </div>
    );
  }

  if (isLoading || !meta) {
    return (
      <div className="p-6">
        <Skeleton className="mb-4 h-8 w-2/3" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-1/2" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Study: {meta.study_id}</h1>
        {meta.title && (
          <p className="mt-1 text-muted-foreground">{meta.title}</p>
        )}
      </div>

      {/* Study overview */}
      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Study overview
        </h2>
        <MetadataRow label="Species" value={meta.species} />
        <MetadataRow label="Strain" value={meta.strain} />
        <MetadataRow label="Study type" value={meta.study_type} />
        <MetadataRow label="Design" value={meta.design} />
        <MetadataRow
          label="Subjects"
          value={formatSubjects(meta.subjects, meta.males, meta.females)}
        />
        <MetadataRow label="Start date" value={meta.start_date} />
        <MetadataRow label="End date" value={meta.end_date} />
        <MetadataRow
          label="Duration"
          value={meta.dosing_duration ? formatDuration(meta.dosing_duration) : null}
        />
      </section>

      {/* Treatment */}
      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Treatment
        </h2>
        <MetadataRow label="Test article" value={meta.treatment} />
        <MetadataRow label="Vehicle" value={meta.vehicle} />
        <MetadataRow label="Route" value={meta.route} />
      </section>

      {/* Administration */}
      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Administration
        </h2>
        <MetadataRow label="Sponsor" value={meta.sponsor} />
        <MetadataRow label="Test facility" value={meta.test_facility} />
        <MetadataRow label="Study director" value={meta.study_director} />
        <MetadataRow label="GLP" value={meta.glp} />
        <MetadataRow label="SEND version" value={meta.send_version} />
      </section>

      {/* Domains */}
      <section>
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Domains ({meta.domain_count})
        </h2>
        <div className="flex flex-wrap gap-2">
          {meta.domains.map((d) => (
            <span
              key={d}
              className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
            >
              {d}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { useSelection } from "@/contexts/SelectionContext";
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
    <div className="flex justify-between gap-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="select-all text-right">{value}</span>
    </div>
  );
}

function formatDuration(iso: string): string {
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
  if (males && females) return `${total} (${males}M, ${females}F)`;
  return total;
}

function StudyInspector({ studyId }: { studyId: string }) {
  const { data: meta, isLoading } = useStudyMetadata(studyId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (!meta) return null;

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Study: {meta.study_id}</h3>

      {/* Study overview */}
      <section className="mb-4">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Study overview
        </h4>
        <MetadataRow label="Species" value={meta.species} />
        <MetadataRow label="Strain" value={meta.strain} />
        <MetadataRow label="Type" value={meta.study_type} />
        <MetadataRow label="Design" value={meta.design} />
        <MetadataRow
          label="Subjects"
          value={formatSubjects(meta.subjects, meta.males, meta.females)}
        />
        <MetadataRow
          label="Duration"
          value={meta.dosing_duration ? formatDuration(meta.dosing_duration) : null}
        />
        <MetadataRow label="Start" value={meta.start_date} />
        <MetadataRow label="End" value={meta.end_date} />
      </section>

      {/* Treatment */}
      <section className="mb-4">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Treatment
        </h4>
        <MetadataRow label="Test article" value={meta.treatment} />
        <MetadataRow label="Vehicle" value={meta.vehicle} />
        <MetadataRow label="Route" value={meta.route} />
      </section>

      {/* Administration */}
      <section className="mb-4">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Administration
        </h4>
        <MetadataRow label="Sponsor" value={meta.sponsor} />
        <MetadataRow label="Facility" value={meta.test_facility} />
        <MetadataRow label="Director" value={meta.study_director} />
        <MetadataRow label="GLP" value={meta.glp} />
      </section>

      {/* Quick actions */}
      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Actions
        </h4>
        <div className="space-y-1">
          <button
            className="w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
            onClick={() =>
              navigate(`/studies/${encodeURIComponent(meta.study_id)}`)
            }
          >
            Open study
          </button>
          <button
            className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
            disabled
          >
            Validation report
          </button>
          <button
            className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
            disabled
          >
            Export
          </button>
        </div>
      </section>
    </div>
  );
}

export function ContextPanel() {
  const { selectedStudyId } = useSelection();

  if (!selectedStudyId) {
    return (
      <div className="p-4">
        <p className="text-xs text-muted-foreground">
          Select a study to view details.
        </p>
      </div>
    );
  }

  return <StudyInspector studyId={selectedStudyId} />;
}

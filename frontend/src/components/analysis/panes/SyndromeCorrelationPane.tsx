import { CorrelationMatrixPane } from "./CorrelationMatrixPane";
import { DomainLabel } from "@/components/ui/DomainLabel";
import type { OrganCorrelationMatrix, ExcludedMember } from "@/types/analysis";

interface Props {
  matrix: OrganCorrelationMatrix;
  excludedMembers: ExcludedMember[];
  onCellClick: (endpointLabel: string) => void;
}

const REASON_LABELS: Record<string, string> = {
  incidence_data: "incidence data",
  insufficient_subjects: "insufficient subjects",
  no_individual_data: "no individual data",
};

export function SyndromeCorrelationPane({ matrix, excludedMembers, onCellClick }: Props) {
  return (
    <div className="space-y-3">
      <CorrelationMatrixPane data={matrix} onCellClick={onCellClick} />

      {excludedMembers.length > 0 && (
        <ExcludedMembersList excluded={excludedMembers} />
      )}
    </div>
  );
}

function ExcludedMembersList({ excluded }: { excluded: ExcludedMember[] }) {
  // Group by reason
  const byReason = new Map<string, ExcludedMember[]>();
  for (const m of excluded) {
    const list = byReason.get(m.reason) ?? [];
    list.push(m);
    byReason.set(m.reason, list);
  }

  return (
    <div className="text-[10px] text-muted-foreground space-y-0.5">
      {[...byReason.entries()].map(([reason, members]) => (
        <div key={reason}>
          {members.length} member{members.length > 1 ? "s" : ""} excluded ({REASON_LABELS[reason] ?? reason}):{" "}
          {members.map((m, i) => (
            <span key={m.endpoint_label}>
              {i > 0 && ", "}
              <DomainLabel domain={m.domain} /> {m.endpoint_label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

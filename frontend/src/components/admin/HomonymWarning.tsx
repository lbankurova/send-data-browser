import { AlertTriangle } from "lucide-react";

// LEVEL-4-REPORT-ONLY: this component renders the pending-admin-candidate
// homonym warning in the curation UI. Amber color is an intentional
// exception to the no-text-color rule (design-decisions.md C-05 allows
// warning icons/text for safety warnings). The level 4 tier is surfaced
// only in curation UI, never as a pipeline value.
export function HomonymWarning({ evidence }: { evidence: string | null }) {
  if (!evidence) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600"
      title="Homonym risk — severity or direction distribution diverges across studies"
    >
      <AlertTriangle className="h-3 w-3" />
      <span>{evidence}</span>
    </span>
  );
}

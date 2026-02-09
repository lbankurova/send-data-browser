import { useState, useEffect } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { cn } from "@/lib/utils";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { ValidationIssue } from "@/types/annotations";

const STATUS_OPTIONS = ["Not reviewed", "In progress", "Resolved", "Exception", "Won't fix"] as const;
const RESOLUTION_OPTIONS = ["", "Fixed in source", "Auto-fixed", "Documented exception", "Not applicable"] as const;
const DISPOSITION_OPTIONS = ["", "Accept all", "Needs fix", "Partial fix", "Not applicable"] as const;

interface Props {
  studyId: string;
  ruleId: string;
}

export function ValidationIssueForm({ studyId, ruleId }: Props) {
  const { data: annotations } = useAnnotations<ValidationIssue>(studyId, "validation-issues");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<ValidationIssue>(studyId, "validation-issues");

  // Auto-reset success flash after 2s
  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = annotations?.[ruleId];

  const [status, setStatus] = useState<ValidationIssue["status"]>("Not reviewed");
  const [assignedTo, setAssignedTo] = useState("");
  const [resolution, setResolution] = useState<ValidationIssue["resolution"]>("");
  const [disposition, setDisposition] = useState<ValidationIssue["disposition"]>("");
  const [comment, setComment] = useState("");

  // Sync from loaded annotation
  useEffect(() => {
    if (existing) {
      setStatus(existing.status);
      setAssignedTo(existing.assignedTo ?? "");
      setResolution(existing.resolution ?? "");
      setDisposition(existing.disposition ?? "");
      setComment(existing.comment ?? "");
    } else {
      setStatus("Not reviewed");
      setAssignedTo("");
      setResolution("");
      setDisposition("");
      setComment("");
    }
  }, [existing, ruleId]);

  const resolutionEnabled = status === "Resolved" || status === "Exception";

  const handleSave = () => {
    save({
      entityKey: ruleId,
      data: {
        status,
        assignedTo,
        resolution: resolutionEnabled ? resolution : "",
        disposition,
        comment,
      },
    });
  };

  const dirty =
    status !== (existing?.status ?? "Not reviewed") ||
    assignedTo !== (existing?.assignedTo ?? "") ||
    resolution !== (existing?.resolution ?? "") ||
    disposition !== (existing?.disposition ?? "") ||
    comment !== (existing?.comment ?? "");

  return (
    <CollapsiblePane title="Rule disposition" defaultOpen>
      <div className="space-y-2 text-[11px]">
        {/* Status */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Status</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={status}
            onChange={(e) => setStatus(e.target.value as ValidationIssue["status"])}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* Assigned To */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Assigned to</label>
          <input
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Name..."
          />
        </div>

        {/* Resolution */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Resolution</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px] disabled:opacity-40"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as ValidationIssue["resolution"])}
            disabled={!resolutionEnabled}
          >
            {RESOLUTION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o || "(none)"}</option>
            ))}
          </select>
        </div>

        {/* Disposition */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Disposition</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as ValidationIssue["disposition"])}
          >
            {DISPOSITION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o || "(none)"}</option>
            ))}
          </select>
        </div>

        {/* Comment */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Comment</label>
          <textarea
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Notes..."
          />
        </div>

        {/* Save button */}
        <button
          className={cn(
            "rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50",
            isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          onClick={handleSave}
          disabled={!dirty || isPending || isSuccess}
        >
          {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
        </button>

        {/* Footer */}
        {existing?.reviewedBy && (
          <p className="text-[10px] text-muted-foreground">
            Reviewed by {existing.reviewedBy} on{" "}
            {new Date(existing.reviewedDate).toLocaleDateString()}
          </p>
        )}
      </div>
    </CollapsiblePane>
  );
}

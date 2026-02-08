import { useState, useEffect } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { ValidationRecordReview } from "@/types/annotations";

const REVIEW_STATUS_OPTIONS = ["Not reviewed", "Reviewed", "Approved"] as const;
const FIX_STATUS_OPTIONS = ["Not fixed", "Auto-fixed", "Manually fixed", "Accepted as-is", "Flagged"] as const;

interface Props {
  studyId: string;
  issueId: string;
  defaultOpen?: boolean;
}

export function ValidationRecordForm({ studyId, issueId, defaultOpen = true }: Props) {
  const { data: annotations } = useAnnotations<ValidationRecordReview>(studyId, "validation-records");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<ValidationRecordReview>(studyId, "validation-records");

  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = annotations?.[issueId];

  const [reviewStatus, setReviewStatus] = useState<ValidationRecordReview["reviewStatus"]>("Not reviewed");
  const [fixStatus, setFixStatus] = useState<ValidationRecordReview["fixStatus"]>("Not fixed");
  const [assignedTo, setAssignedTo] = useState("");
  const [justification, setJustification] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (existing) {
      setReviewStatus(existing.reviewStatus ?? "Not reviewed");
      setFixStatus(existing.fixStatus ?? "Not fixed");
      setAssignedTo(existing.assignedTo ?? "");
      setJustification(existing.justification ?? "");
      setComment(existing.comment ?? "");
    } else {
      setReviewStatus("Not reviewed");
      setFixStatus("Not fixed");
      setAssignedTo("");
      setJustification("");
      setComment("");
    }
  }, [existing, issueId]);

  const handleSave = () => {
    save({
      entityKey: issueId,
      data: { reviewStatus, fixStatus, assignedTo, justification, comment },
    });
  };

  const dirty =
    reviewStatus !== (existing?.reviewStatus ?? "Not reviewed") ||
    fixStatus !== (existing?.fixStatus ?? "Not fixed") ||
    assignedTo !== (existing?.assignedTo ?? "") ||
    justification !== (existing?.justification ?? "") ||
    comment !== (existing?.comment ?? "");

  return (
    <CollapsiblePane title="Review" defaultOpen={defaultOpen}>
      <div className="space-y-2 text-[11px]">
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Review status</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value as ValidationRecordReview["reviewStatus"])}
          >
            {REVIEW_STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Fix status</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={fixStatus}
            onChange={(e) => setFixStatus(e.target.value as ValidationRecordReview["fixStatus"])}
          >
            {FIX_STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Justification</label>
          <textarea
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            rows={2}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Reason for accepting / flagging..."
          />
        </div>

        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Assigned to</label>
          <input
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Name..."
          />
        </div>

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

        <button
          className={`rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          onClick={handleSave}
          disabled={!dirty || isPending || isSuccess}
        >
          {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
        </button>

        {(existing?.reviewedBy ?? existing?.pathologist) && (
          <p className="text-[10px] text-muted-foreground">
            Reviewed by {existing?.pathologist ?? existing?.reviewedBy} on{" "}
            {new Date(existing?.reviewDate ?? existing?.reviewedDate ?? "").toLocaleDateString()}
          </p>
        )}
      </div>
    </CollapsiblePane>
  );
}

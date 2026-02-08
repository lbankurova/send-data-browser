import { useState, useEffect } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { ValidationRecordReview } from "@/types/annotations";

const REVIEW_STATUS_OPTIONS = ["Not reviewed", "Reviewed", "Approved"] as const;

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
  const [assignedTo, setAssignedTo] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (existing) {
      setReviewStatus(existing.reviewStatus ?? "Not reviewed");
      setAssignedTo(existing.assignedTo ?? "");
      setComment(existing.comment ?? "");
    } else {
      setReviewStatus("Not reviewed");
      setAssignedTo("");
      setComment("");
    }
  }, [existing, issueId]);

  const handleSave = () => {
    save({
      entityKey: issueId,
      data: { reviewStatus, assignedTo, comment },
    });
  };

  const dirty =
    reviewStatus !== (existing?.reviewStatus ?? "Not reviewed") ||
    assignedTo !== (existing?.assignedTo ?? "") ||
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

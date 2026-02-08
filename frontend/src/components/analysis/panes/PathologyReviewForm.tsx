import { useState, useEffect } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { PathologyReview } from "@/types/annotations";

const PEER_REVIEW_OPTIONS = ["Not Reviewed", "Agreed", "Disagreed", "Deferred"] as const;
const SEVERITY_OPTIONS = ["Minimal", "Mild", "Moderate", "Marked", "Severe", "N/A"] as const;

interface Props {
  studyId: string;
  finding: string;
  defaultOpen?: boolean;
}

export function PathologyReviewForm({ studyId, finding, defaultOpen = false }: Props) {
  const { data: annotations } = useAnnotations<PathologyReview>(studyId, "pathology-reviews");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<PathologyReview>(studyId, "pathology-reviews");

  // Auto-reset success flash after 2s
  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = annotations?.[finding];

  const [peerReviewStatus, setPeerReviewStatus] = useState<PathologyReview["peerReviewStatus"]>("Not Reviewed");
  const [revisedSeverity, setRevisedSeverity] = useState<PathologyReview["revisedSeverity"]>("N/A");
  const [revisedDiagnosis, setRevisedDiagnosis] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (existing) {
      setPeerReviewStatus(existing.peerReviewStatus);
      setRevisedSeverity(existing.revisedSeverity ?? "N/A");
      setRevisedDiagnosis(existing.revisedDiagnosis ?? "");
      setComment(existing.comment ?? "");
    } else {
      setPeerReviewStatus("Not Reviewed");
      setRevisedSeverity("N/A");
      setRevisedDiagnosis("");
      setComment("");
    }
  }, [existing, finding]);

  const disagreed = peerReviewStatus === "Disagreed";

  const handleSave = () => {
    save({
      entityKey: finding,
      data: {
        peerReviewStatus,
        revisedSeverity: disagreed ? revisedSeverity : "N/A",
        revisedDiagnosis: disagreed ? revisedDiagnosis : "",
        comment,
      },
    });
  };

  const dirty =
    peerReviewStatus !== (existing?.peerReviewStatus ?? "Not Reviewed") ||
    revisedSeverity !== (existing?.revisedSeverity ?? "N/A") ||
    revisedDiagnosis !== (existing?.revisedDiagnosis ?? "") ||
    comment !== (existing?.comment ?? "");

  return (
    <CollapsiblePane title="Pathology review" defaultOpen={defaultOpen}>
      <div className="space-y-2 text-[11px]">
        {/* Peer Review Status */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Peer review status</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={peerReviewStatus}
            onChange={(e) => setPeerReviewStatus(e.target.value as PathologyReview["peerReviewStatus"])}
          >
            {PEER_REVIEW_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* Revised Severity */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Revised severity</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px] disabled:opacity-40"
            value={revisedSeverity}
            onChange={(e) => setRevisedSeverity(e.target.value as PathologyReview["revisedSeverity"])}
            disabled={!disagreed}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* Revised Diagnosis */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Revised diagnosis</label>
          <input
            className="w-full rounded border bg-background px-2 py-1 text-[11px] disabled:opacity-40"
            value={revisedDiagnosis}
            onChange={(e) => setRevisedDiagnosis(e.target.value)}
            placeholder="Revised diagnosis..."
            disabled={!disagreed}
          />
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

        {/* Save */}
        <button
          className={`rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          onClick={handleSave}
          disabled={!dirty || isPending || isSuccess}
        >
          {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
        </button>

        {/* Footer */}
        {existing?.pathologist && (
          <p className="text-[10px] text-muted-foreground">
            Pathologist: {existing.pathologist} on{" "}
            {new Date(existing.reviewDate).toLocaleDateString()}
          </p>
        )}
      </div>
    </CollapsiblePane>
  );
}

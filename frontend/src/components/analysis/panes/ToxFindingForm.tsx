import { useState, useEffect } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { ToxFinding } from "@/types/annotations";

const TREATMENT_OPTIONS = ["Yes", "No", "Equivocal", "Not Evaluated"] as const;
const ADVERSITY_OPTIONS = ["Adverse", "Non-Adverse/Adaptive", "Not Determined"] as const;

interface Props {
  studyId: string;
  endpointLabel: string;
  defaultOpen?: boolean;
}

export function ToxFindingForm({ studyId, endpointLabel, defaultOpen = false }: Props) {
  const { data: annotations } = useAnnotations<ToxFinding>(studyId, "tox-findings");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<ToxFinding>(studyId, "tox-findings");

  // Auto-reset success flash after 2s
  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = annotations?.[endpointLabel];

  const [treatmentRelated, setTreatmentRelated] = useState<ToxFinding["treatmentRelated"]>("Not Evaluated");
  const [adversity, setAdversity] = useState<ToxFinding["adversity"]>("Not Determined");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (existing) {
      setTreatmentRelated(existing.treatmentRelated);
      setAdversity(existing.adversity);
      setComment(existing.comment ?? "");
    } else {
      setTreatmentRelated("Not Evaluated");
      setAdversity("Not Determined");
      setComment("");
    }
  }, [existing, endpointLabel]);

  const handleSave = () => {
    save({
      entityKey: endpointLabel,
      data: { treatmentRelated, adversity, comment },
    });
  };

  const dirty =
    treatmentRelated !== (existing?.treatmentRelated ?? "Not Evaluated") ||
    adversity !== (existing?.adversity ?? "Not Determined") ||
    comment !== (existing?.comment ?? "");

  return (
    <CollapsiblePane title="Tox assessment" defaultOpen={defaultOpen}>
      <div className="space-y-2 text-[11px]">
        {/* Treatment Related */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Treatment related</label>
          <select
            className="w-full rounded border bg-background px-2 py-1 text-[11px]"
            value={treatmentRelated}
            onChange={(e) => setTreatmentRelated(e.target.value as ToxFinding["treatmentRelated"])}
          >
            {TREATMENT_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* Adversity */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">Adversity</label>
          <select
            className={`w-full rounded border bg-background px-2 py-1 text-[11px] ${treatmentRelated === "No" ? "opacity-40" : ""}`}
            value={adversity}
            onChange={(e) => setAdversity(e.target.value as ToxFinding["adversity"])}
          >
            {ADVERSITY_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
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

        {/* Save */}
        <button
          className={`rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
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

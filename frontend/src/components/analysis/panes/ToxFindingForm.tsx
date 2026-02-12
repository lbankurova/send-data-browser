import { useState, useEffect } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { ToxFinding, ToxSystemSuggestion } from "@/types/annotations";

const TREATMENT_OPTIONS = ["Yes", "No", "Equivocal", "Not Evaluated"] as const;
const ADVERSITY_OPTIONS = ["Adverse", "Non-Adverse/Adaptive", "Not Determined"] as const;

interface Props {
  studyId: string;
  endpointLabel: string;
  defaultOpen?: boolean;
  /** System suggestion from signal analysis — enables override tracking */
  systemSuggestion?: ToxSystemSuggestion;
}

export function ToxFindingForm({ studyId, endpointLabel, defaultOpen = false, systemSuggestion }: Props) {
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

  // Override detection — does the expert's current value disagree with the system suggestion?
  const treatmentOverridden =
    systemSuggestion?.treatmentRelated != null &&
    treatmentRelated !== "Not Evaluated" &&
    treatmentRelated !== "Equivocal" &&
    treatmentRelated !== systemSuggestion.treatmentRelated;
  const adversityOverridden =
    systemSuggestion?.adversity != null &&
    adversity !== "Not Determined" &&
    adversity !== systemSuggestion.adversity;
  const hasOverride = treatmentOverridden || adversityOverridden;

  const handleSave = () => {
    save({
      entityKey: endpointLabel,
      data: {
        treatmentRelated,
        adversity,
        comment,
        // Persist system suggestions at time of review for audit trail
        ...(systemSuggestion && {
          systemSuggestedTreatment: systemSuggestion.treatmentRelated,
          systemSuggestedAdversity: systemSuggestion.adversity,
        }),
      },
    });
  };

  const dirty =
    treatmentRelated !== (existing?.treatmentRelated ?? "Not Evaluated") ||
    adversity !== (existing?.adversity ?? "Not Determined") ||
    comment !== (existing?.comment ?? "");

  return (
    <CollapsiblePane
      title="Tox assessment"
      defaultOpen={defaultOpen}
      headerRight={hasOverride ? <span className="text-[9px] text-muted-foreground">(overridden)</span> : undefined}
    >
      <div className="space-y-2 text-[11px]">
        {/* Treatment Related */}
        <div>
          <div className="mb-0.5 flex items-baseline gap-1.5">
            <label className="font-medium text-muted-foreground">Treatment related</label>
            {systemSuggestion?.treatmentRelated != null && (
              <span className="text-[10px] text-muted-foreground/70">
                System: {systemSuggestion.treatmentRelated}
              </span>
            )}
            {treatmentOverridden && (
              <span className="text-[9px] text-muted-foreground">(overridden)</span>
            )}
          </div>
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
          <div className="mb-0.5 flex items-baseline gap-1.5">
            <label className="font-medium text-muted-foreground">Adversity</label>
            {systemSuggestion?.adversity != null && (
              <span className="text-[10px] text-muted-foreground/70">
                System: {systemSuggestion.adversity}
              </span>
            )}
            {adversityOverridden && (
              <span className="text-[9px] text-muted-foreground">(overridden)</span>
            )}
          </div>
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

        {/* Override justification hint */}
        {hasOverride && !comment.trim() && (
          <p className="text-[10px] text-muted-foreground">
            Consider adding a justification for overriding the system suggestion.
          </p>
        )}

        {/* Comment */}
        <div>
          <label className="mb-0.5 block font-medium text-muted-foreground">
            {hasOverride ? "Justification / comment" : "Comment"}
          </label>
          <textarea
            className={`w-full rounded border bg-background px-2 py-1 text-[11px] ${hasOverride && !comment.trim() ? "border-muted-foreground/50" : ""}`}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={hasOverride ? "Reason for overriding system suggestion..." : "Notes..."}
          />
        </div>

        {/* Save */}
        <button
          className={`rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${isSuccess ? "bg-primary/80 text-primary-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
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

        {/* System basis tooltip */}
        {systemSuggestion && (
          <p className="text-[9px] text-muted-foreground/60">
            {systemSuggestion.basis}
          </p>
        )}
      </div>
    </CollapsiblePane>
  );
}

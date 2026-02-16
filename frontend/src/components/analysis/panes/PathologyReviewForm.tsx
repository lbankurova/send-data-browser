import { useState, useEffect, useMemo } from "react";
import { CollapsiblePane } from "./CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";
import type { PathologyReview } from "@/types/annotations";

const SEVERITY_OPTIONS = ["Minimal", "Mild", "Moderate", "Marked", "Severe", "N/A"] as const;
const SEVERITY_NUM: Record<string, number> = { Minimal: 1, Mild: 2, Moderate: 3, Marked: 4, Severe: 5, "N/A": 0 };

const DISAGREEMENT_CATEGORIES = [
  { value: "terminology", label: "Terminology" },
  { value: "severity_grade", label: "Severity grade" },
  { value: "presence", label: "Presence/absence" },
  { value: "interpretation", label: "Interpretation" },
] as const;

const RESOLUTION_OPTIONS = [
  { value: "original_upheld", label: "Original upheld" },
  { value: "peer_accepted", label: "Peer accepted" },
  { value: "compromise", label: "Compromise" },
  { value: "pwg_pending", label: "PWG pending" },
] as const;

const REVIEWER_ROLES = [
  { value: "original", label: "Original pathologist" },
  { value: "peer", label: "Peer reviewer" },
  { value: "pwg_chair", label: "PWG chair" },
  { value: "pwg_member", label: "PWG member" },
] as const;

interface Props {
  studyId: string;
  finding: string;
  defaultOpen?: boolean;
}

type Step = "initial" | "agree" | "disagree_details" | "resolution";

export function PathologyReviewForm({ studyId, finding, defaultOpen = false }: Props) {
  const { data: annotations } = useAnnotations<PathologyReview>(studyId, "pathology-reviews");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<PathologyReview>(studyId, "pathology-reviews");

  // Auto-reset success flash
  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = annotations?.[finding];

  // Form state
  const [peerReviewStatus, setPeerReviewStatus] = useState<PathologyReview["peerReviewStatus"]>("Not Reviewed");
  const [comment, setComment] = useState("");
  const [disagreementCategory, setDisagreementCategory] = useState<string>("");
  const [originalDiagnosis, setOriginalDiagnosis] = useState("");
  const [peerDiagnosis, setPeerDiagnosis] = useState("");
  const [originalSeverity, setOriginalSeverity] = useState<number>(0);
  const [peerSeverity, setPeerSeverity] = useState<number>(0);
  const [resolution, setResolution] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [reviewerRole, setReviewerRole] = useState<string>("");
  const [reviewerName, setReviewerName] = useState("");

  // Determine step from form state
  const step = useMemo<Step>(() => {
    if (peerReviewStatus === "Not Reviewed" || peerReviewStatus === "Deferred") return "initial";
    if (peerReviewStatus === "Agreed") return "agree";
    // Disagreed: check if we need to show details or resolution
    if (!disagreementCategory) return "disagree_details";
    if (!resolution) return "resolution";
    return "resolution";
  }, [peerReviewStatus, disagreementCategory, resolution]);

  // Load existing annotation
  useEffect(() => {
    if (existing) {
      setPeerReviewStatus(existing.peerReviewStatus);
      setComment(existing.comment ?? "");
      setDisagreementCategory(existing.disagreementCategory ?? "");
      setOriginalDiagnosis(existing.originalDiagnosis ?? "");
      setPeerDiagnosis(existing.peerDiagnosis ?? "");
      setOriginalSeverity(existing.originalSeverity ?? 0);
      setPeerSeverity(existing.peerSeverity ?? 0);
      setResolution(existing.resolution ?? "");
      setResolutionNotes(existing.resolutionNotes ?? "");
      setReviewerRole(existing.reviewerRole ?? "");
      setReviewerName(existing.reviewerName ?? "");
    } else {
      setPeerReviewStatus("Not Reviewed");
      setComment("");
      setDisagreementCategory("");
      setOriginalDiagnosis("");
      setPeerDiagnosis("");
      setOriginalSeverity(0);
      setPeerSeverity(0);
      setResolution("");
      setResolutionNotes("");
      setReviewerRole("");
      setReviewerName("");
    }
  }, [existing, finding]);

  const handleStatusSelect = (status: PathologyReview["peerReviewStatus"]) => {
    setPeerReviewStatus(status);
    if (status !== "Disagreed") {
      // Clear disagreement fields
      setDisagreementCategory("");
      setOriginalDiagnosis("");
      setPeerDiagnosis("");
      setOriginalSeverity(0);
      setPeerSeverity(0);
      setResolution("");
      setResolutionNotes("");
    }
  };

  const handleSave = () => {
    const disagreed = peerReviewStatus === "Disagreed";
    save({
      entityKey: finding,
      data: {
        peerReviewStatus,
        comment,
        disagreementCategory: disagreed ? (disagreementCategory as PathologyReview["disagreementCategory"]) : "",
        originalDiagnosis: disagreed ? originalDiagnosis : "",
        peerDiagnosis: disagreed ? peerDiagnosis : "",
        originalSeverity: disagreed ? originalSeverity : 0,
        peerSeverity: disagreed ? peerSeverity : 0,
        resolution: disagreed ? (resolution as PathologyReview["resolution"]) : "",
        resolutionNotes: disagreed ? resolutionNotes : "",
        reviewerRole: reviewerRole as PathologyReview["reviewerRole"],
        reviewerName,
        reviewedAt: new Date().toISOString(),
        // Legacy fields
        revisedSeverity: disagreed && peerSeverity > 0
          ? (Object.entries(SEVERITY_NUM).find(([, v]) => v === peerSeverity)?.[0] ?? "N/A") as PathologyReview["revisedSeverity"]
          : "N/A",
        revisedDiagnosis: disagreed ? peerDiagnosis : "",
        pathologist: reviewerName || "User",
        reviewDate: new Date().toISOString(),
      },
    });
  };

  const dirty = useMemo(() => {
    if (!existing) return peerReviewStatus !== "Not Reviewed" || comment !== "" || reviewerName !== "";
    return (
      peerReviewStatus !== existing.peerReviewStatus ||
      comment !== (existing.comment ?? "") ||
      disagreementCategory !== (existing.disagreementCategory ?? "") ||
      originalDiagnosis !== (existing.originalDiagnosis ?? "") ||
      peerDiagnosis !== (existing.peerDiagnosis ?? "") ||
      originalSeverity !== (existing.originalSeverity ?? 0) ||
      peerSeverity !== (existing.peerSeverity ?? 0) ||
      resolution !== (existing.resolution ?? "") ||
      resolutionNotes !== (existing.resolutionNotes ?? "") ||
      reviewerRole !== (existing.reviewerRole ?? "") ||
      reviewerName !== (existing.reviewerName ?? "")
    );
  }, [existing, peerReviewStatus, comment, disagreementCategory, originalDiagnosis, peerDiagnosis, originalSeverity, peerSeverity, resolution, resolutionNotes, reviewerRole, reviewerName]);

  const showSeverityFields = disagreementCategory === "severity_grade";
  const showDiagnosisFields = disagreementCategory === "terminology" || disagreementCategory === "presence" || disagreementCategory === "interpretation";

  return (
    <CollapsiblePane title="Pathology review" defaultOpen={defaultOpen}>
      <div className="space-y-2 text-[11px]">
        {/* Step 1: Review decision */}
        <div>
          <label className="mb-1 block font-medium text-muted-foreground">Review decision</label>
          <div className="flex gap-px rounded bg-muted/40 p-px">
            {(["Agreed", "Disagreed", "Deferred"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={cn(
                  "flex-1 rounded-sm px-2 py-1 text-[10px] font-medium transition-colors",
                  peerReviewStatus === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => handleStatusSelect(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2a: Agree → notes + save */}
        {step === "agree" && (
          <>
            <div>
              <label className="mb-0.5 block font-medium text-muted-foreground">Notes</label>
              <textarea
                className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </>
        )}

        {/* Step 2b: Disagree details */}
        {(step === "disagree_details" || step === "resolution") && peerReviewStatus === "Disagreed" && (
          <>
            <div>
              <label className="mb-0.5 block font-medium text-muted-foreground">Disagreement category</label>
              <div className="space-y-0.5">
                {DISAGREEMENT_CATEGORIES.map((cat) => (
                  <label key={cat.value} className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="radio"
                      name="disagree-cat"
                      checked={disagreementCategory === cat.value}
                      onChange={() => setDisagreementCategory(cat.value)}
                      className="h-3 w-3"
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
            </div>

            {showDiagnosisFields && (
              <>
                <div>
                  <label className="mb-0.5 block font-medium text-muted-foreground">Original diagnosis</label>
                  <input
                    className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                    value={originalDiagnosis}
                    onChange={(e) => setOriginalDiagnosis(e.target.value)}
                    placeholder="Original pathologist's diagnosis..."
                  />
                </div>
                <div>
                  <label className="mb-0.5 block font-medium text-muted-foreground">Peer diagnosis</label>
                  <input
                    className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                    value={peerDiagnosis}
                    onChange={(e) => setPeerDiagnosis(e.target.value)}
                    placeholder="Peer reviewer's diagnosis..."
                  />
                </div>
              </>
            )}

            {showSeverityFields && (
              <>
                <div>
                  <label className="mb-0.5 block font-medium text-muted-foreground">Original severity</label>
                  <select
                    className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                    value={originalSeverity}
                    onChange={(e) => setOriginalSeverity(Number(e.target.value))}
                  >
                    <option value={0}>Select...</option>
                    {SEVERITY_OPTIONS.filter((s) => s !== "N/A").map((s) => (
                      <option key={s} value={SEVERITY_NUM[s]}>{s} ({SEVERITY_NUM[s]})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block font-medium text-muted-foreground">Peer severity</label>
                  <select
                    className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                    value={peerSeverity}
                    onChange={(e) => setPeerSeverity(Number(e.target.value))}
                  >
                    <option value={0}>Select...</option>
                    {SEVERITY_OPTIONS.filter((s) => s !== "N/A").map((s) => (
                      <option key={s} value={SEVERITY_NUM[s]}>{s} ({SEVERITY_NUM[s]})</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="mb-0.5 block font-medium text-muted-foreground">Notes</label>
              <textarea
                className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe the disagreement..."
              />
            </div>
          </>
        )}

        {/* Step 3: Resolution (only for Disagreed with category selected) */}
        {step === "resolution" && peerReviewStatus === "Disagreed" && (
          <>
            <div className="border-t pt-2">
              <label className="mb-0.5 block font-medium text-muted-foreground">Resolution</label>
              <div className="space-y-0.5">
                {RESOLUTION_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="radio"
                      name="resolution"
                      checked={resolution === opt.value}
                      onChange={() => setResolution(opt.value)}
                      className="h-3 w-3"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {resolution && (
              <div>
                <label className="mb-0.5 block font-medium text-muted-foreground">Resolution notes</label>
                <textarea
                  className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Resolution details..."
                />
              </div>
            )}
          </>
        )}

        {/* Deferred → just notes */}
        {peerReviewStatus === "Deferred" && (
          <div>
            <label className="mb-0.5 block font-medium text-muted-foreground">Reason for deferral</label>
            <textarea
              className="w-full rounded border bg-background px-2 py-1 text-[11px]"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Reason for deferring..."
            />
          </div>
        )}

        {/* Reviewer identity (shown for all non-initial states) */}
        {peerReviewStatus !== "Not Reviewed" && (
          <div className="flex gap-2 border-t pt-2">
            <div className="flex-1">
              <label className="mb-0.5 block font-medium text-muted-foreground">Role</label>
              <select
                className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                value={reviewerRole}
                onChange={(e) => setReviewerRole(e.target.value)}
              >
                <option value="">Select...</option>
                {REVIEWER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-0.5 block font-medium text-muted-foreground">Name</label>
              <input
                className="w-full rounded border bg-background px-2 py-1 text-[11px]"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Reviewer name..."
              />
            </div>
          </div>
        )}

        {/* Save button */}
        {peerReviewStatus !== "Not Reviewed" && (
          <button
            className={cn(
              "rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50",
              isSuccess
                ? "bg-green-600 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            onClick={handleSave}
            disabled={!dirty || isPending || isSuccess}
          >
            {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
          </button>
        )}

        {/* Back to not-reviewed */}
        {peerReviewStatus !== "Not Reviewed" && (
          <button
            type="button"
            className="ml-2 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => handleStatusSelect("Not Reviewed")}
          >
            Reset
          </button>
        )}

        {/* Footer */}
        {existing?.reviewedAt && (
          <p className="text-[10px] text-muted-foreground">
            {existing.reviewerRole && <>{existing.reviewerRole}: </>}
            {existing.reviewerName || existing.pathologist || "User"} on{" "}
            {new Date(existing.reviewedAt || existing.reviewDate).toLocaleDateString()}
          </p>
        )}
      </div>
    </CollapsiblePane>
  );
}

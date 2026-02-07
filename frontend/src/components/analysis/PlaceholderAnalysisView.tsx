import { useParams, useLocation } from "react-router-dom";

const ANALYSIS_LABELS: Record<string, string> = {
  noael: "NOAEL Determination",
  "target-organs": "Target Organ Assessment",
  validation: "Data Validation",
  "sex-differences": "Sex Differences Analysis",
  reversibility: "Reversibility Assessment",
  "dose-response": "Dose-response & Causality",
  histopathology: "Histopathology Review",
  "noael-decision": "NOAEL & Decision",
};

export function PlaceholderAnalysisView() {
  const { studyId, analysisType } = useParams<{
    studyId: string;
    analysisType: string;
  }>();
  const location = useLocation();

  // Extract the view key from the path for the new-style routes
  const pathParts = location.pathname.split("/");
  const viewKey = analysisType ?? pathParts[pathParts.length - 1];
  const label = ANALYSIS_LABELS[viewKey] ?? viewKey;

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="mb-4 rounded-lg bg-muted p-6">
        <h1 className="mb-2 text-xl font-semibold">{label}</h1>
        <p className="text-sm text-muted-foreground">
          Analysis view for study <span className="font-medium">{studyId}</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        This analysis type is not yet implemented.
      </p>
    </div>
  );
}

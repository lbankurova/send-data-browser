import { useParams } from "react-router-dom";

const ANALYSIS_LABELS: Record<string, string> = {
  noael: "NOAEL Determination",
  "target-organs": "Target Organ Assessment",
  validation: "Data Validation",
  "sex-differences": "Sex Differences Analysis",
  reversibility: "Reversibility Assessment",
};

export function PlaceholderAnalysisView() {
  const { studyId, analysisType } = useParams<{
    studyId: string;
    analysisType: string;
  }>();

  const label = ANALYSIS_LABELS[analysisType ?? ""] ?? analysisType;

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

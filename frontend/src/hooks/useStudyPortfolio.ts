import { useQuery } from "@tanstack/react-query";

export interface NoaelReported {
  dose: number;
  unit: string;
  basis: string;
}

export interface NoaelDerived {
  dose: number;
  unit: string;
  method: string;
}

export interface LoaelReported {
  dose: number;
  unit: string;
}

export interface LoaelDerived {
  dose: number;
  unit: string;
}

export interface Finding {
  groups: number[];
  direction?: string | null;
  params?: string[] | null;
  recovery?: string | null;
  specimen?: string | null;
  severity?: Record<string, string> | null;
  types?: string[] | null;
  cause?: string | null;
  count?: number | null;
  sex?: string | null;
  note?: string | null;
}

export interface StudyValidation {
  errors: number;
  warnings: number;
  all_addressed: boolean;
}

export interface StudyMetadata {
  // Identity
  id: string;
  project?: string | null;
  test_article?: string | null;
  title?: string | null;
  protocol?: string | null;

  // Design
  species?: string | null;
  strain?: string | null;
  route?: string | null;
  study_type?: string | null;
  duration_weeks?: number | null;
  recovery_weeks?: number | null;
  doses?: number[] | null;
  dose_unit?: string | null;
  subjects?: number | null;

  // Pipeline
  pipeline_stage: string;
  submission_date?: string | null;
  status: string;

  // Data availability
  has_nsdrg?: boolean;
  has_define?: boolean;
  has_xpt?: boolean;

  // Source tracking
  auto_derived?: boolean;

  // Reported layer (from nSDRG)
  target_organs_reported?: string[] | null;
  noael_reported?: NoaelReported | null;
  loael_reported?: LoaelReported | null;
  key_findings_reported?: string | null;

  // Derived layer (from XPT)
  target_organs_derived?: string[] | null;
  noael_derived?: NoaelDerived | null;
  loael_derived?: LoaelDerived | null;

  // Domain inventory
  domains?: string[] | null;
  domains_planned?: string[] | null;
  domains_collected?: string[] | null;

  // Validation
  validation?: StudyValidation | null;

  // Findings
  findings?: Record<string, Finding> | null;

  // Stage-specific
  interim_observations?: string | null;
  design_rationale?: string | null;
}

export function useStudyPortfolio() {
  return useQuery<StudyMetadata[]>({
    queryKey: ["portfolio-studies"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/studies");
      if (!res.ok) throw new Error(`Failed to fetch studies: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useStudy(studyId: string | undefined) {
  return useQuery<StudyMetadata>({
    queryKey: ["portfolio-study", studyId],
    queryFn: async () => {
      if (!studyId) throw new Error("Study ID required");
      const res = await fetch(`/api/portfolio/studies/${studyId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(`Study ${studyId} not found`);
        throw new Error(`Failed to fetch study: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}

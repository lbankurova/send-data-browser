/** TypeScript interfaces for temporal evidence API (spec 01). */

// --- Endpoint 1: Per-subject time-course (continuous domains) ---

export interface TimecourseResponse {
  test_code: string;
  test_name: string;
  domain: string;
  unit: string;
  timepoints: TimecourseTimepoint[];
  last_dosing_day?: number;
}

export interface TimecourseTimepoint {
  day: number;
  groups: TimecourseGroup[];
}

export interface TimecourseGroup {
  dose_level: number;
  dose_label: string;
  sex: string;
  n: number;
  mean: number;
  sd: number;
  values: number[];
}

export interface TimecourseSubjectResponse {
  test_code: string;
  test_name: string;
  domain: string;
  unit: string;
  subjects: TimecourseSubject[];
  last_dosing_day?: number;
}

export interface TimecourseSubject {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  arm_code: string;
  is_recovery?: boolean;
  values: { day: number; value: number }[];
}

// --- Endpoint 2: Clinical observations timecourse ---

export interface CLTimecourseResponse {
  findings: string[];
  categories: string[];
  timecourse: CLTimepoint[];
}

export interface CLTimepoint {
  day: number;
  counts: CLGroupCount[];
}

export interface CLGroupCount {
  dose_level: number;
  dose_label: string;
  sex: string;
  total_subjects: number;
  findings: Record<string, number>;
  subjects: Record<string, string[]>;  // finding → list of USUBJIDs
}

// --- Endpoint 3: Subject profile ---

export interface SubjectProfile {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  arm_code: string;
  disposition: string | null;
  disposition_day: number | null;
  death_cause?: string | null;
  death_relatedness?: string | null;
  domains: {
    BW?: { measurements: SubjectMeasurement[] };
    LB?: { measurements: SubjectMeasurement[] };
    OM?: { measurements: SubjectMeasurement[] };
    CL?: { observations: SubjectObservation[] };
    MI?: { findings: SubjectFinding[] };
    MA?: { findings: SubjectFinding[] };
  };
  control_stats?: {
    lab?: Record<string, { mean: number; sd: number; unit: string; n: number }>;
  } | null;
}

export interface SubjectMeasurement {
  day: number;
  test_code: string;
  value: number;
  unit: string;
}

export interface SubjectObservation {
  day: number;
  finding: string;
  category: string;
}

export interface SubjectFinding {
  specimen: string;
  finding: string;
  severity?: string | null;
  result_category?: string | null;  // MIRESCAT: "MALIGNANT" | "BENIGN" | null
}

// --- Endpoint 4: Subject-level histopath matrix ---

export interface SubjectHistopathResponse {
  specimen: string;
  findings: string[];
  subjects: SubjectHistopathEntry[];
  recovery_days: number | null;
}

export interface SubjectHistopathEntry {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  is_recovery: boolean;
  findings: Record<string, { severity: string | null; severity_num: number; laterality?: string | null }>;
  disposition: string | null;
  disposition_day: number | null;
}

// --- Endpoint 5: Multi-subject comparison ---

export interface SubjectComparisonResponse {
  subjects: ComparisonSubjectProfile[];
  lab_values: ComparisonLabValue[];
  body_weights: ComparisonBodyWeight[];
  clinical_obs: ComparisonClinicalObs[];
  control_stats: ControlStats;
  available_timepoints: number[];
}

export interface ComparisonSubjectProfile {
  usubjid: string;
  short_id: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  disposition: string | null;
  disposition_day: number | null;
}

export interface ComparisonLabValue {
  usubjid: string;
  test: string;
  unit: string;
  day: number;
  value: number;
}

export interface ComparisonBodyWeight {
  usubjid: string;
  day: number;
  weight: number;
}

export interface ComparisonClinicalObs {
  usubjid: string;
  day: number;
  observation: string;
}

export interface ControlLabStat {
  mean: number;
  sd: number;
  unit: string;
  n: number;
  by_sex?: Record<string, { mean: number; sd: number; unit: string; n: number }>;
}

export interface ControlBWStat {
  mean: number;
  sd: number;
  n: number;
  by_sex?: Record<string, { mean: number; sd: number; n: number }>;
}

export interface ControlStats {
  lab: Record<string, ControlLabStat>;
  bw: Record<string, ControlBWStat>;
}

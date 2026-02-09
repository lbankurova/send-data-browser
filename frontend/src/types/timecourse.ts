/** TypeScript interfaces for temporal evidence API (spec 01). */

// --- Endpoint 1: Per-subject time-course (continuous domains) ---

export interface TimecourseResponse {
  test_code: string;
  test_name: string;
  domain: string;
  unit: string;
  timepoints: TimecourseTimepoint[];
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
}

export interface TimecourseSubject {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  arm_code: string;
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
  domains: {
    BW?: { measurements: SubjectMeasurement[] };
    LB?: { measurements: SubjectMeasurement[] };
    OM?: { measurements: SubjectMeasurement[] };
    CL?: { observations: SubjectObservation[] };
    MI?: { findings: SubjectFinding[] };
    MA?: { findings: SubjectFinding[] };
  };
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
}

// --- Endpoint 4: Subject-level histopath matrix ---

export interface SubjectHistopathResponse {
  specimen: string;
  findings: string[];
  subjects: SubjectHistopathEntry[];
}

export interface SubjectHistopathEntry {
  usubjid: string;
  sex: string;
  dose_level: number;
  dose_label: string;
  findings: Record<string, { severity: string | null; severity_num: number }>;
}

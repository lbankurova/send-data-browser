/** Fetch functions for temporal evidence API (spec 01). */

import type {
  TimecourseResponse,
  TimecourseSubjectResponse,
  CLTimecourseResponse,
  SubjectProfile,
  SubjectHistopathResponse,
  SubjectComparisonResponse,
} from "@/types/timecourse";

const API_BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function fetchTimecourseGroup(
  studyId: string,
  domain: string,
  testCode: string,
  sex?: "M" | "F",
  includeRecovery?: boolean,
): Promise<TimecourseResponse> {
  const params = new URLSearchParams({ mode: "group" });
  if (sex) params.set("sex", sex);
  if (includeRecovery) params.set("include_recovery", "true");
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/timecourse/${encodeURIComponent(domain)}/${encodeURIComponent(testCode)}?${params}`,
  );
}

export function fetchTimecourseSubject(
  studyId: string,
  domain: string,
  testCode: string,
  sex?: "M" | "F",
  includeRecovery?: boolean,
): Promise<TimecourseSubjectResponse> {
  const params = new URLSearchParams({ mode: "subject" });
  if (sex) params.set("sex", sex);
  if (includeRecovery) params.set("include_recovery", "true");
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/timecourse/${encodeURIComponent(domain)}/${encodeURIComponent(testCode)}?${params}`,
  );
}

export function fetchCLTimecourse(
  studyId: string,
  finding?: string,
  category?: string,
): Promise<CLTimecourseResponse> {
  const params = new URLSearchParams();
  if (finding) params.set("finding", finding);
  if (category) params.set("category", category);
  const qs = params.toString();
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/timecourse/cl${qs ? `?${qs}` : ""}`,
  );
}

export function fetchSubjectProfile(
  studyId: string,
  usubjid: string,
): Promise<SubjectProfile> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/subjects/${encodeURIComponent(usubjid)}/profile`,
  );
}

export function fetchHistopathSubjects(
  studyId: string,
  specimen: string,
): Promise<SubjectHistopathResponse> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/histopath/subjects?specimen=${encodeURIComponent(specimen)}`,
  );
}

export function fetchSubjectComparison(
  studyId: string,
  subjectIds: string[],
): Promise<SubjectComparisonResponse> {
  const ids = subjectIds.map(encodeURIComponent).join(",");
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/subjects/compare?ids=${ids}`,
  );
}

export interface RecoveryComparisonResponse {
  available: boolean;
  recovery_day: number | null;
  /** Last dosing day (treatment/recovery boundary). */
  last_dosing_day: number | null;
  /** Available recovery-period days per endpoint per sex, for day stepper. */
  recovery_days_available: Record<string, Record<string, number[]>>;
  rows: {
    endpoint_label: string;
    test_code: string;
    sex: string;
    /** Study day this row's stats were computed at. */
    day: number;
    recovery_day: number;
    dose_level: number;
    mean: number;
    sd: number;
    p_value: number | null;
    effect_size: number | null;
    terminal_effect: number | null;
    /** Same-arm terminal: Hedges' g at terminal day using recovery-arm subjects only.
     *  Eliminates cross-arm control baseline shift. Null when data unavailable. */
    terminal_effect_same_arm?: number | null;
    /** Study day of the terminal sacrifice (end of dosing). */
    terminal_day: number | null;
    /** Peak effect (max |g|) across all main-arm timepoints for this dose (annotation context). */
    peak_effect: number | null;
    /** Study day when peak effect occurred. */
    peak_day: number | null;
    /** Recovery-arm control group mean. */
    control_mean?: number | null;
    /** Recovery-arm control group sample size. */
    control_n?: number | null;
    /** Recovery-arm treated group sample size. */
    treated_n?: number | null;
    /** Main-arm treated group mean at terminal sacrifice. */
    treated_mean_terminal?: number | null;
    /** Main-arm control group mean at terminal sacrifice (for drift detection). */
    control_mean_terminal?: number | null;
    /** True when treated n < 2 — stats not computed. */
    insufficient_n?: boolean;
    /** True when no concurrent control exists at recovery. */
    no_concurrent_control?: boolean;
    /** % difference from control at terminal: (treated - control) / control × 100. */
    pct_diff_terminal?: number | null;
    /** % difference from control at recovery. */
    pct_diff_recovery?: number | null;
    /** Lower 95% CI of mean difference at recovery. */
    ci_lower?: number | null;
    /** Upper 95% CI of mean difference at recovery. */
    ci_upper?: number | null;
    /** Lower 95% CI of mean difference at terminal. */
    ci_lower_terminal?: number | null;
    /** Upper 95% CI of mean difference at terminal. */
    ci_upper_terminal?: number | null;
  }[];
  incidence_rows?: {
    domain: string;
    finding: string;
    sex: string;
    dose_level: number;
    dose_label: string;
    main_affected: number;
    main_n: number;
    recovery_affected: number;
    recovery_n: number;
    recovery_day: number | null;
    /** Examination-aware denominator (MI/MA: subjects with tissue record; CL: roster N). */
    main_examined?: number;
    /** Examination-aware denominator for recovery arm. */
    recovery_examined?: number;
    verdict: string | null;
    /** Confidence based on recovery examined N. */
    confidence?: "low" | "adequate" | null;
    /** Organ/specimen (MI/MA domains). */
    specimen?: string;
    /** Severity grade counts for main arm (MI only). Keys: "1"-"5". */
    main_severity_counts?: Record<string, number> | null;
    /** Severity grade counts for recovery arm (MI only). Keys: "1"-"5". */
    recovery_severity_counts?: Record<string, number> | null;
    /** Mean severity grade for main arm. */
    main_avg_severity?: number | null;
    /** Mean severity grade for recovery arm. */
    recovery_avg_severity?: number | null;
  }[];
}

export function fetchRecoveryComparison(
  studyId: string,
): Promise<RecoveryComparisonResponse> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/recovery-comparison`,
  );
}

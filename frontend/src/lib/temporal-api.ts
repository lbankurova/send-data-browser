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
): Promise<TimecourseResponse> {
  const params = new URLSearchParams({ mode: "group" });
  if (sex) params.set("sex", sex);
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/timecourse/${encodeURIComponent(domain)}/${encodeURIComponent(testCode)}?${params}`,
  );
}

export function fetchTimecourseSubject(
  studyId: string,
  domain: string,
  testCode: string,
  sex?: "M" | "F",
): Promise<TimecourseSubjectResponse> {
  const params = new URLSearchParams({ mode: "subject" });
  if (sex) params.set("sex", sex);
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

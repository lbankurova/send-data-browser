const API_BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

import type { StudySummary, StudyMetadata, DomainSummary, DomainData } from "@/types";

export function fetchStudies(): Promise<StudySummary[]> {
  return fetchJson("/studies");
}

export function fetchStudyMetadata(studyId: string): Promise<StudyMetadata> {
  return fetchJson(`/studies/${encodeURIComponent(studyId)}/metadata`);
}

export function fetchDomains(studyId: string): Promise<DomainSummary[]> {
  return fetchJson(`/studies/${encodeURIComponent(studyId)}/domains`);
}

export function fetchDomainData(
  studyId: string,
  domainName: string,
  page: number,
  pageSize: number
): Promise<DomainData> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/domains/${encodeURIComponent(domainName)}?page=${page}&page_size=${pageSize}`
  );
}

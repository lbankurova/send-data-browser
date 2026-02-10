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

export async function importStudy(
  file: File
): Promise<{ study_id: string; domain_count: number; domains: string[] }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/import`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Import failed: ${res.status}`);
  }
  return res.json();
}

export async function deleteStudy(
  studyId: string
): Promise<{ study_id: string; removed: string[] }> {
  const res = await fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Delete failed: ${res.status}`);
  }
  return res.json();
}

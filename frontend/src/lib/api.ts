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
  files: File | File[],
  options?: { validate?: boolean; autoFix?: boolean; studyId?: string; append?: boolean }
): Promise<{ study_id: string; domain_count: number; domains: string[]; overwritten?: string[] }> {
  const form = new FormData();
  const fileList = Array.isArray(files) ? files : [files];
  for (const f of fileList) form.append("files", f);
  const params = new URLSearchParams();
  if (options?.studyId) params.set("study_id", options.studyId);
  if (options?.append) params.set("append", "true");
  if (options?.validate === false) params.set("validate", "false");
  if (options?.autoFix) params.set("auto_fix", "true");
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/import${qs ? `?${qs}` : ""}`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Import failed: ${res.status}`);
  }
  return res.json();
}

export interface StudyPreferences {
  display_names: Record<string, string>;
  order: string[];
}

export function fetchStudyPreferences(): Promise<StudyPreferences> {
  return fetchJson("/studies/preferences");
}

export async function renameStudy(
  studyId: string,
  displayName: string | null
): Promise<{ study_id: string; display_name: string | null }> {
  const res = await fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}/rename`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Rename failed: ${res.status}`);
  }
  return res.json();
}

export async function updateStudyOrder(
  order: string[]
): Promise<{ order: string[] }> {
  const res = await fetch(`${API_BASE}/studies/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Reorder failed: ${res.status}`);
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

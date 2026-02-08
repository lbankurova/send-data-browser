const API_BASE = "/api";

export async function fetchAnnotations<T>(
  studyId: string,
  schemaType: string
): Promise<Record<string, T>> {
  const res = await fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}/annotations/${schemaType}`
  );
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function saveAnnotation<T>(
  studyId: string,
  schemaType: string,
  entityKey: string,
  data: Partial<T>
): Promise<T> {
  const res = await fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}/annotations/${schemaType}/${encodeURIComponent(entityKey)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

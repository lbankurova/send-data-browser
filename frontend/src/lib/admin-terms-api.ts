/**
 * Admin curation API client (Phase D Feature 2 + Feature 6 cross-study).
 *
 * All admin endpoints require X-Admin-Token. The token lives in
 * sessionStorage (cleared on tab close; localStorage is forbidden per
 * synthesis section 11).
 */

const API_BASE = "/api";
const ADMIN_TOKEN_KEY = "sendex.admin.token";

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  } catch {
    // sessionStorage may be unavailable (private mode); ignore silently.
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function adminHeaders(extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  const token = getAdminToken();
  if (token) headers["X-Admin-Token"] = token;
  return headers;
}

export type SuggestionCandidate = {
  canonical: string;
  confidence: number;
  token_jaccard: number;
  string_similarity: number;
  match_reason: string;
  organ_scope_reliable: boolean;
  organ_norm_tier_reason: string | null;
  ncit_code: string | null;
  source: string[];
};

export type PromotionSignal = {
  promotable: boolean;
  proportion_studies: number;
  cross_cro: boolean;
  effective_threshold: number;
  structural_variant_of: string | null;
  homonym_flag: boolean;
  homonym_p_raw: number | null;
  homonym_p_adj: number | null;
  homonym_evidence: string | null;
  rejection_reason?: string | null;
};

export type UnrecognizedTermItem = {
  id: string;
  domain: "MI" | "MA" | "CL";
  raw_term: string;
  organ_system: string | null;
  organ_scope_reliable: boolean;
  frequency: number;
  seen_in_studies: string[];
  seen_in_cros: string[] | null;
  candidates: SuggestionCandidate[];
  promotion_signal: PromotionSignal;
  concordance_impact: number | null;
  prior_rejection: { rejected_by: string; rejected_date: string; reason: string } | null;
};

export type UnrecognizedTermsResponse = {
  generated_at: string;
  dictionary_version: string;
  total_studies: number;
  items: UnrecognizedTermItem[];
};

export type AdminFilters = {
  domain?: string;
  organ_system?: string;
  min_frequency?: number;
  include_rejected?: boolean;
};

export async function fetchUnrecognizedTerms(filters: AdminFilters = {}): Promise<UnrecognizedTermsResponse> {
  const params = new URLSearchParams();
  if (filters.domain) params.set("domain", filters.domain);
  if (filters.organ_system) params.set("organ_system", filters.organ_system);
  if (filters.min_frequency) params.set("min_frequency", String(filters.min_frequency));
  if (filters.include_rejected) params.set("include_rejected", "1");
  const res = await fetch(`${API_BASE}/admin/unrecognized-terms?${params.toString()}`, {
    headers: adminHeaders(),
  });
  if (!res.ok) {
    throw new Error(`admin.get ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export type SynonymMappingBody = {
  domain: "MI" | "MA" | "CL";
  canonical: string;
  alias: string;
  organ_scope?: string[] | null;
  added_by: string;
  source_justification: string;
  add_new_canonical?: boolean;
};

export type PutSynonymError = Error & {
  status: number;
  detail?: {
    error?: string;
    impact_count?: number;
    existing_canonical?: string;
    pending_studies?: string[];
    [key: string]: unknown;
  };
};

export async function putSynonymMapping(
  body: SynonymMappingBody,
  opts: { confirmImpact?: boolean; forceSequential?: boolean } = {},
): Promise<{ status: string; new_dict_version: string; affected_studies: string[]; impact_count: number; staleness_warning: string | null }> {
  const headers: Record<string, string> = {};
  if (opts.confirmImpact) headers["X-Confirm-Impact"] = "1";
  if (opts.forceSequential) headers["X-Force-Sequential"] = "accept-lower-bound";
  const res = await fetch(`${API_BASE}/admin/synonym-mapping`, {
    method: "PUT",
    headers: adminHeaders(headers),
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`admin.put ${res.status}`) as PutSynonymError;
    err.status = res.status;
    err.detail = parsed?.detail ?? parsed;
    throw err;
  }
  return parsed;
}

export async function deleteSynonymMapping(
  id: string,
  rejected_by: string,
  reason: string,
): Promise<{ status: string; id: string }> {
  const res = await fetch(`${API_BASE}/admin/synonym-mapping/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: adminHeaders(),
    body: JSON.stringify({ rejected_by, reason }),
  });
  if (!res.ok) {
    throw new Error(`admin.delete ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export type CollisionReport = {
  study_a: string;
  study_b: string;
  organ: string | null;
  domain: string;
  term_a: string;
  term_b: string;
  token_jaccard: number;
  string_similarity: number;
  confidence: number;
  report_kind: "collision" | "qualifier_divergence";
};

export type TermCollisionsResponse = {
  studies: string[];
  organs_scanned: string[];
  dictionary_version: string | null;
  collisions: CollisionReport[];
  computed_in_ms: number;
  note?: string;
};

export async function fetchTermCollisions(
  studyIds: string[],
  opts: { organs?: string[]; minConfidence?: number; includeQualifierDivergence?: boolean } = {},
): Promise<TermCollisionsResponse> {
  const params = new URLSearchParams();
  params.set("study_ids", studyIds.join(","));
  if (opts.organs && opts.organs.length > 0) params.set("organs", opts.organs.join(","));
  if (opts.minConfidence !== undefined) params.set("min_confidence", String(opts.minConfidence));
  if (opts.includeQualifierDivergence) params.set("include_qualifier_divergence", "1");
  const res = await fetch(`${API_BASE}/xstudy/term-collisions?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`xstudy.term-collisions ${res.status}: ${await res.text()}`);
  }
  return res.json();
}


// ─── Pure helpers (exported for unit tests) ────────────────────────────────


/** Filter predicate for the curation dashboard (AC-4.2). */
export function applyCurationFilters(
  items: UnrecognizedTermItem[],
  filters: {
    search?: string;
    organ?: string;
    state?: "pending" | "rejected" | "all";
  },
): UnrecognizedTermItem[] {
  const needle = (filters.search ?? "").trim().toUpperCase();
  let out = items;
  if (needle) out = out.filter((i) => i.raw_term.includes(needle));
  if (filters.organ) out = out.filter((i) => i.organ_system === filters.organ);
  if (filters.state === "rejected") out = out.filter((i) => !!i.prior_rejection);
  return out;
}


/** Derive the organ filter options from the current item list. */
export function deriveOrganOptions(items: UnrecognizedTermItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.organ_system) seen.add(item.organ_system);
  }
  return Array.from(seen).sort();
}


/** Build a synthetic UnrecognizedTermItem from a collision report so the
 *  curation Accept modal can open with term_a as the alias and term_b as
 *  the candidate canonical (AC-6.5 / AC-4.8).
 */
export function syntheticItemFromCollision(collision: CollisionReport): UnrecognizedTermItem {
  return {
    id: `collision:${collision.study_a}:${collision.term_a}`,
    domain: collision.domain as "MI" | "MA" | "CL",
    raw_term: collision.term_a,
    organ_system: collision.organ,
    organ_scope_reliable: true,
    frequency: 1,
    seen_in_studies: [collision.study_a, collision.study_b],
    seen_in_cros: null,
    candidates: [
      {
        canonical: collision.term_b,
        confidence: collision.confidence,
        token_jaccard: collision.token_jaccard,
        string_similarity: collision.string_similarity,
        match_reason: "collision",
        organ_scope_reliable: true,
        organ_norm_tier_reason: null,
        ncit_code: null,
        source: [],
      },
    ],
    promotion_signal: {
      promotable: false,
      proportion_studies: 0,
      cross_cro: false,
      effective_threshold: 0,
      structural_variant_of: null,
      homonym_flag: false,
      homonym_p_raw: null,
      homonym_p_adj: null,
      homonym_evidence: null,
    },
    concordance_impact: null,
    prior_rejection: null,
  };
}


/** Extract an impact-threshold retry state from a 409 PutSynonymError.
 *  Returns null when the error is not a 409 impact-threshold case — the
 *  caller then leaves the default Accept button wired (AC-4.3).
 */
export function extractImpactRetry(
  error: PutSynonymError | null | undefined,
): { impactCount: number } | null {
  if (!error || error.status !== 409) return null;
  const detail = error.detail ?? {};
  if (detail.error !== "impact_threshold_exceeded") return null;
  if (typeof detail.impact_count !== "number") return null;
  return { impactCount: detail.impact_count };
}


/** Whether the Accept button should be disabled given the current draft
 *  state. Factored out so it's testable without rendering the modal.
 */
export function isAcceptDisabled(args: {
  pending: boolean;
  canonical: string;
  addedBy: string;
  justification: string;
  homonym: boolean;
  homonymAcknowledged: boolean;
}): boolean {
  return (
    args.pending ||
    !args.canonical.trim() ||
    !args.addedBy.trim() ||
    !args.justification.trim() ||
    (args.homonym && !args.homonymAcknowledged)
  );
}

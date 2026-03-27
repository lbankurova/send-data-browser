/**
 * Types for the Cohort View — multi-subject analysis surface.
 *
 * @see docs/_internal/incoming/cohort-view.md
 */

// ── Preset modes ─────────────────────────────────────────────

export type CohortPreset = "trs" | "histo" | "recovery" | "all";

/** Why a subject was included in the Histopath preset. */
export type HistoReason = "adverse" | "cod" | "pattern";

// ── Subject roster ───────────────────────────────────────────

export interface CohortSubject {
  usubjid: string;
  sex: string;
  dose: number;
  doseLabel: string;
  doseGroupOrder: number;
  isControl: boolean;
  isRecovery: boolean;
  isTK: boolean;
  sacrificeDay: number | null;
  /** Treatment end day (planned sacrifice). */
  plannedDay: number | null;
  /** Recovery start day — only set for recovery subjects. */
  recoveryStartDay: number | null;
  arm: string;
  /** Badge reason for display in the rail. */
  badge: "trs" | "adverse" | "rec" | "pattern" | "tk" | null;
  /** Histopath preset qualification reason, if applicable. */
  histoReason: HistoReason | null;
}

// ── Organ evidence ───────────────────────────────────────────

/** Domain priority for row ordering within an organ group. */
export const DOMAIN_PRIORITY: Record<string, number> = {
  MI: 0, MA: 1, LB: 2, OM: 3, CL: 4, BW: 5,
};

export interface OrganSignal {
  organName: string;
  /** Worst severity across all findings for this organ. */
  worstSeverity: "adverse" | "warning" | "normal";
  /** Total finding rows across all domains. */
  findingCount: number;
}

export interface CohortFindingRow {
  /** Unique row key (domain + finding + day + sex). */
  key: string;
  domain: string;
  finding: string;
  testCode: string;
  organName: string;
  sex: string;
  day: number | null;
  severity: "adverse" | "warning" | "normal";
  direction: "up" | "down" | "none" | null;
  /** Unified finding id — for linking to evidence pane. */
  findingId: string;
  /** Group-level stats by dose level. */
  groupStats: GroupStatEntry[];
  /** Per-subject values keyed by USUBJID. */
  subjectValues: Record<string, number | string | null>;
  /** Data type: continuous (LB, OM, BW) or incidence (MI, MA, CL). */
  dataType: "continuous" | "incidence";
  /** Max fold-change vs control (LB, OM, BW). */
  maxFoldChange: number | null;
  /** Max incidence across treated dose groups (MI, MA, CL). */
  maxIncidence: number | null;
}

export interface GroupStatEntry {
  doseLevel: number;
  n: number;
  mean: number | null;
  sd: number | null;
  affected: number | null;
  incidence: number | null;
}

// ── Shared findings ──────────────────────────────────────────

export interface SharedFinding {
  domain: string;
  finding: string;
  direction: "up" | "down" | "none" | null;
  severity: "adverse" | "warning" | "normal";
}

// ── Per-subject syndrome matching ───────────────────────────

export interface SyndromeEvidence {
  domain: string;
  test_code?: string;
  specimen?: string;
  finding?: string;
  severity?: string;
  value?: number;
  fold_change?: number;
  pct_change?: number;
  direction?: "up" | "down";
}

export interface SyndromeMissingCriteria {
  domain: string;
  specimen?: string;
  criteria: string; // human-readable description of what's missing
}

export interface SubjectSyndromeMatch {
  syndrome_id: string;
  syndrome_name: string;
  match_type: "full" | "partial";
  matched_required: SyndromeEvidence[];
  matched_supporting: SyndromeEvidence[];
  missing_required: SyndromeMissingCriteria[];
  confidence: "HIGH" | "MODERATE" | "LOW";
}

export interface SubjectSyndromeProfile {
  syndromes: SubjectSyndromeMatch[];
  partial_syndromes: SubjectSyndromeMatch[];
  syndrome_count: number;
  partial_count: number;
  affected_organ_count: number;
  finding_count: number;
}

export interface SubjectSyndromesResponse {
  meta: {
    generated: string;
    study_id: string;
    syndrome_definitions_version: string;
  };
  subjects: Record<string, SubjectSyndromeProfile>;
}

// ── Composable filter predicates ─────────────────────────────

export type FilterOperator = "and" | "or";

export interface FilterGroup {
  operator: FilterOperator;
  predicates: FilterPredicate[];
}

export type FilterPredicate =
  | { type: "dose"; values: Set<number> }
  | { type: "sex"; values: Set<string> }
  | { type: "organ"; organName: string; role?: "any" | "adverse" | "warning" }
  | { type: "domain"; domain: string }
  | { type: "syndrome"; syndromeId: string; matchType: "full" | "partial" | "any" }
  | { type: "severity"; minGrade: number }
  | { type: "bw_change"; minPct: number; direction: "loss" | "gain" }
  | { type: "organ_count"; min: number }
  | { type: "disposition"; values: Set<string> }
  | { type: "recovery"; isRecovery: boolean }
  | { type: "onset_day"; min: number | null; max: number | null; finding?: string }
  | { type: "recovery_verdict"; finding: string; specimen: string; verdict: string[] }
  | { type: "tk"; isTK: boolean }
  | { type: "search"; query: string };

// ── Onset days response ─────────────────────────────────────

export interface OnsetDaysResponse {
  meta: { generated: string; study_id: string };
  /** Per-subject map: { [USUBJID]: { [findingKey]: onset_day } } */
  subjects: Record<string, Record<string, number>>;
}

// ── Recovery verdicts response ──────────────────────────────

export interface RecoveryFindingVerdict {
  domain: string;
  specimen: string;
  finding: string;
  verdict: string | null;
  main_incidence?: number;
  recovery_incidence?: number;
  subjects_reversed?: number;
  subjects_persistent?: number;
  main_severity?: number | null;
  recovery_severity?: number | null;
  confidence?: { level: string };
}

export interface RecoverySubjectProfile {
  findings: RecoveryFindingVerdict[];
  summary: {
    reversed_count: number;
    partially_reversed_count: number;
    persistent_count: number;
    progressing_count: number;
    anomaly_count: number;
  };
}

export interface RecoveryVerdictsResponse {
  meta: { generated: string; study_id: string };
  per_subject: Record<string, RecoverySubjectProfile>;
  per_finding: Record<string, RecoveryFindingVerdict>;
}

// ── Phase 3 stubs ────────────────────────────────────────────

/** Per-subject recovery verdict data. Phase 3 placeholder. */
export interface RecoveryVerdictSubject {
  findings: Array<{ finding: string; specimen: string; verdict: string }>;
}

// ── Cohort state ─────────────────────────────────────────────

export interface CohortState {
  preset: CohortPreset;
  selectedSubjects: Set<string>;
  selectedOrgan: string | null;
  includeTK: boolean;
  doseFilter: Set<number> | null;
  sexFilter: Set<string> | null;
  searchQuery: string;
}

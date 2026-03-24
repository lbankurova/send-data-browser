/**
 * Types for the Cohort View — multi-subject analysis surface.
 *
 * @see docs/incoming/cohort-view.md
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

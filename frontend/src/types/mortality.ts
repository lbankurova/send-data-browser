/** Study mortality summary from DD + DS domains. */

export interface DeathRecord {
  USUBJID: string;
  sex: string;
  dose_level: number;
  is_recovery: boolean;
  disposition: string;
  cause: string | null;
  cause_category?: string | null;
  relatedness: string | null;
  study_day: number | null;
  dose_label: string;
}

export interface DoseGroupMortality {
  dose_level: number;
  dose_label: string;
  dose_value: number | null;
  deaths: number;
  accidental: number;
  subjects: string[];
  accidental_subjects: string[];
}

export interface MortalityQualification {
  control_mortality_rate: number | null;
  control_survival_rate: number | null;
  control_n: number | null;
  control_deaths: number | null;
  duration_days: number | null;
  duration_weeks: number | null;
  qualification_flags: Array<{ severity: string; code: string; message: string }>;
  suppress_noael: boolean;
}

export interface StudyMortality {
  has_mortality: boolean;
  total_deaths: number;
  total_accidental: number;
  mortality_loael: number | null;
  mortality_loael_label: string | null;
  mortality_noael_cap: number | null;
  severity_tier: string;
  deaths: DeathRecord[];
  accidentals: DeathRecord[];
  by_dose: DoseGroupMortality[];
  /** Non-scheduled subjects: {USUBJID: DSDECOD} */
  early_death_subjects: Record<string, string>;
  /** Per-subject detail for exclusion counts: sex, dose_level, disposition */
  early_death_details: Array<{
    USUBJID: string;
    sex: string;
    dose_level: number;
    disposition: string;
    dose_label: string;
  }>;
  /** Control mortality qualification (Phase B) */
  qualification?: MortalityQualification;
}

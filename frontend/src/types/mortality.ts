/** Study mortality summary from DD + DS domains. */

export interface DeathRecord {
  USUBJID: string;
  sex: string;
  dose_level: number;
  is_recovery: boolean;
  disposition: string;
  cause: string | null;
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
}

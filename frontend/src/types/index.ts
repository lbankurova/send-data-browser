export interface StudySummary {
  study_id: string;
  name: string;
  domain_count: number;
  species: string | null;
  study_type: string | null;
  protocol: string | null;
  standard: string | null;
  subjects: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export interface DoseGroup {
  dose_level: number;
  armcd: string;
  label: string;
  dose_value: number | null;
  dose_unit: string | null;
  n_male: number;
  n_female: number;
  n_total: number;
  tk_count?: number;
  is_recovery?: boolean;
  recovery_armcd?: string | null;
  recovery_n?: number;
}

export interface StudyMetadata {
  study_id: string;
  title: string | null;
  protocol: string | null;
  species: string | null;
  strain: string | null;
  study_type: string | null;
  design: string | null;
  route: string | null;
  treatment: string | null;
  vehicle: string | null;
  dosing_duration: string | null;
  start_date: string | null;
  end_date: string | null;
  subjects: string | null;
  males: string | null;
  females: string | null;
  sponsor: string | null;
  test_facility: string | null;
  study_director: string | null;
  glp: string | null;
  send_version: string | null;
  recovery_sacrifice: string | null;   // RECSAC — e.g., "P14D"
  terminal_sacrifice: string | null;   // TRMSAC — e.g., "P13W"
  ct_version: string | null;           // SNDCTVER
  diet: string | null;                 // DIET
  age_text: string | null;             // AGETXT — e.g., "6-7"
  age_unit: string | null;             // AGEU — e.g., "WEEKS"
  sex_population: string | null;       // SEXPOP — e.g., "BOTH"
  supplier: string | null;             // SPLRNAM
  domain_count: number;
  domains: string[];
  dose_groups: DoseGroup[] | null;
}

export interface DomainSummary {
  name: string;
  label: string;
  row_count: number;
  col_count: number;
  subject_count?: number | null;
}

export interface ColumnInfo {
  name: string;
  label: string;
}

export interface DomainData {
  domain: string;
  label: string;
  columns: ColumnInfo[];
  rows: Record<string, string | null>[];
  total_rows: number;
  page: number;
  page_size: number;
  total_pages: number;
}

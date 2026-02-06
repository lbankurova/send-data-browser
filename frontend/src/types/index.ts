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
  domain_count: number;
  domains: string[];
}

export interface DomainSummary {
  name: string;
  label: string;
  row_count: number;
  col_count: number;
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

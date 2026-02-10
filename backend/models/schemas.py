from pydantic import BaseModel


class StudySummary(BaseModel):
    study_id: str
    name: str
    domain_count: int
    species: str | None = None
    study_type: str | None = None
    protocol: str | None = None
    standard: str | None = None
    subjects: int | None = None
    start_date: str | None = None
    end_date: str | None = None
    status: str = "Complete"


class DoseGroupSchema(BaseModel):
    dose_level: int
    armcd: str
    label: str
    dose_value: float | None = None
    dose_unit: str | None = None
    n_male: int = 0
    n_female: int = 0
    n_total: int = 0


class StudyMetadata(BaseModel):
    study_id: str
    title: str | None = None
    protocol: str | None = None
    species: str | None = None
    strain: str | None = None
    study_type: str | None = None
    design: str | None = None
    route: str | None = None
    treatment: str | None = None
    vehicle: str | None = None
    dosing_duration: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    subjects: str | None = None
    males: str | None = None
    females: str | None = None
    sponsor: str | None = None
    test_facility: str | None = None
    study_director: str | None = None
    glp: str | None = None
    send_version: str | None = None
    domain_count: int = 0
    domains: list[str] = []
    dose_groups: list[DoseGroupSchema] | None = None


class DomainSummary(BaseModel):
    name: str
    label: str
    row_count: int
    col_count: int


class ColumnInfo(BaseModel):
    name: str
    label: str


class DomainData(BaseModel):
    domain: str
    label: str
    columns: list[ColumnInfo]
    rows: list[dict]
    total_rows: int
    page: int
    page_size: int
    total_pages: int

/* eslint-disable react-refresh/only-export-components -- data registry with inline JSX renderers; HMR exemption is intentional. */
import { getPipelineStageColor } from "@/lib/severity-colors";
import { routeStudyTypeWithQuality } from "@/lib/study-type-registry";
import type { DisplayStudy, StudyColumn } from "./types";

/** Display label for a study: display_name if set, otherwise study_id */
export function studyLabel(s: DisplayStudy): string {
  return s.display_name || s.study_id;
}

function joinList(v: string[] | null | undefined): string | null {
  if (!v || v.length === 0) return null;
  return v.join(", ");
}

function fmtBool(v: boolean | null | undefined): string | null {
  if (v == null) return null;
  return v ? "Yes" : "No";
}

export const STUDY_COLUMNS: StudyColumn[] = [
  {
    key: "protocol", label: "Protocol", type: "text", default: true,
    value: (s) => (s.protocol && s.protocol !== "NOT AVAILABLE" ? s.protocol : null),
  },
  {
    key: "test_article", label: "Test article", type: "category", default: true,
    value: (s, { project, testArticleOverride }) =>
      testArticleOverride ?? s.portfolio_metadata?.test_article ?? project?.compound ?? null,
  },
  {
    key: "species", label: "Species", type: "category", default: true,
    value: (s) => s.species,
  },
  {
    key: "subjects", label: "Subj", type: "number", default: true, align: "right",
    value: (s) => s.subjects ?? null,
  },
  {
    key: "duration_weeks", label: "Dur", type: "number", default: true,
    value: (s) => s.duration_weeks ?? null,
    render: (s) => s.duration_weeks ? <span className="text-muted-foreground">{s.duration_weeks}w</span> : <span className="text-muted-foreground">—</span>,
  },
  {
    key: "study_type", label: "Type", type: "category", default: true,
    value: (s) => {
      if (!s.study_type) return null;
      const r = routeStudyTypeWithQuality(s.study_type);
      return r.config.display_name;
    },
    render: (s) => {
      if (!s.study_type) return <span className="text-muted-foreground">—</span>;
      const r = routeStudyTypeWithQuality(s.study_type);
      return (
        <span title={r.match === "fallback" ? `Unrecognized SSTYP: "${s.study_type}"` : s.study_type ?? undefined}>
          {r.config.display_name}
          {r.match === "fallback" && (
            <span className="ml-1 rounded bg-amber-100 px-0.5 text-[9px] font-medium text-amber-700">fallback</span>
          )}
        </span>
      );
    },
  },
  {
    key: "start_date", label: "Start", type: "date", default: true,
    value: (s) => s.start_date?.slice(0, 10) ?? null,
    render: (s) => <span className="tabular-nums text-muted-foreground">{s.start_date?.slice(0, 10) ?? "—"}</span>,
  },
  {
    key: "end_date", label: "End", type: "date", default: true,
    value: (s) => s.end_date?.slice(0, 10) ?? null,
    render: (s) => <span className="tabular-nums text-muted-foreground">{s.end_date?.slice(0, 10) ?? "—"}</span>,
  },
  {
    key: "noael_value", label: "NOAEL", type: "text", default: true, align: "right",
    value: (s) => s.noael_value ?? null,
    render: (s) => <span className="tabular-nums">{s.noael_value ?? "—"}</span>,
  },
  {
    key: "status", label: "Validation", type: "category", default: true,
    value: (s) => s.status ?? null,
    render: (s) => (
      <span className="relative pl-3 text-muted-foreground">
        {s.status === "Complete" && (
          <span
            className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
            style={{ background: "#16a34a" }}
          />
        )}
        {s.status}
      </span>
    ),
  },
  {
    key: "pipeline_stage", label: "Stage", type: "category", default: true,
    value: (s) => s.pipeline_stage ?? null,
    render: (s) => s.pipeline_stage ? (
      <span style={{ color: getPipelineStageColor(s.pipeline_stage) }}>
        {s.pipeline_stage.charAt(0).toUpperCase() + s.pipeline_stage.slice(1).replace(/_/g, " ")}
      </span>
    ) : <span className="text-muted-foreground">—</span>,
  },
  { key: "title", label: "Title", type: "text", default: false, value: (s) => s.portfolio_metadata?.title ?? null },
  { key: "strain", label: "Strain", type: "category", default: false, value: (s) => s.portfolio_metadata?.strain ?? null },
  { key: "route", label: "Route", type: "category", default: false, value: (s) => s.portfolio_metadata?.route ?? null },
  { key: "recovery_weeks", label: "Recovery (w)", type: "number", default: false, value: (s) => s.portfolio_metadata?.recovery_weeks ?? null },
  { key: "dose_unit", label: "Dose unit", type: "category", default: false, value: (s) => s.portfolio_metadata?.dose_unit ?? null },
  {
    key: "doses", label: "Doses", type: "text", default: false,
    value: (s) => s.portfolio_metadata?.doses ? s.portfolio_metadata.doses.join(" / ") : null,
  },
  { key: "domain_count", label: "Domains", type: "number", default: false, align: "right", value: (s) => s.domain_count ?? null },
  { key: "submission_date", label: "Submitted", type: "date", default: false, value: (s) => s.portfolio_metadata?.submission_date ?? null },
  { key: "has_xpt", label: "Has XPT", type: "category", default: false, value: (s) => fmtBool(s.portfolio_metadata?.has_xpt) },
  { key: "has_define", label: "Has define.xml", type: "category", default: false, value: (s) => fmtBool(s.portfolio_metadata?.has_define) },
  { key: "has_nsdrg", label: "Has nSDRG", type: "category", default: false, value: (s) => fmtBool(s.portfolio_metadata?.has_nsdrg) },
  {
    key: "target_organs_reported", label: "Target organs (reported)", type: "text", default: false,
    value: (s) => joinList(s.portfolio_metadata?.target_organs_reported),
  },
  {
    key: "target_organs_derived", label: "Target organs (derived)", type: "text", default: false,
    value: (s) => joinList(s.portfolio_metadata?.target_organs_derived),
  },
];

export const COLUMN_BY_KEY = new Map(STUDY_COLUMNS.map((c) => [c.key, c]));
export const DEFAULT_VISIBLE: string[] = STUDY_COLUMNS.filter((c) => c.default).map((c) => c.key);
export const DEFAULT_ORDER: string[] = STUDY_COLUMNS.map((c) => c.key);

/** Bump when STUDY_COLUMNS keys change — invalidates stale visible/order in sessionStorage. */
export const STUDY_COLUMNS_SCHEMA = 3;

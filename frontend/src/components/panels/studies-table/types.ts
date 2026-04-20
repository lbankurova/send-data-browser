import type { ReactNode } from "react";
import type { Project } from "@/hooks/useProjects";
import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import type { StudySummary } from "@/types";
import type { ColType, ColumnFilter } from "../studies-table-helpers";

export type DisplayStudy = StudySummary & {
  validation: string;
  pipeline_stage?: string;
  duration_weeks?: number;
  noael_value?: string;
  portfolio_metadata?: StudyMetadata;
};

export type CellCtx = {
  project: Project | undefined;
  /** User-provided override for the Test article column. */
  testArticleOverride: string | undefined;
};

export interface StudyColumn {
  key: string;
  label: string;
  type: ColType;
  /** Visible by default. */
  default: boolean;
  align?: "left" | "right";
  /** Raw value used for sort + filter + default render. */
  value: (s: DisplayStudy, ctx: CellCtx) => string | number | null;
  /** Optional custom cell renderer. */
  render?: (s: DisplayStudy, ctx: CellCtx) => ReactNode;
}

export interface SortState { key: string; dir: "asc" | "desc" }

export type FilterMap = Record<string, ColumnFilter>;

export interface SavedView {
  visible: string[];
  order: string[];
  sort: SortState | null;
  filters: FilterMap;
}

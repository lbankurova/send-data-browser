/**
 * Design system tokens — referenceable constants for layout, typography,
 * spacing, badges, buttons, empty states, and surface classes.
 *
 * Color-scale functions (p-value, effect size, signal score, severity,
 * dose group, sex, domain) live in severity-colors.ts.
 *
 * Import tokens by category:
 *   import { ty, sp, badge, btn, tbl, surface, emptyState, link } from "@/lib/design-tokens";
 */

// ---------------------------------------------------------------------------
// Typography (ty)
// ---------------------------------------------------------------------------

export const ty = {
  /** Page title (L1) — one per view */
  pageTitle: "text-2xl font-bold",
  /** App title — sidebar header */
  appTitle: "text-xl font-semibold tracking-tight",
  /** Section header — pane headers */
  sectionHeader: "text-sm font-semibold",
  /** Section header rendered uppercase via CSS */
  sectionHeaderUpper: "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
  /** Table header — compact analysis grids */
  tableHeader: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
  /** Table header — spacious tables (validation, landing) */
  tableHeaderSpacious: "text-xs font-medium text-muted-foreground",
  /** Body text */
  body: "text-sm",
  /** Table cell */
  cell: "text-xs",
  /** Caption / label */
  caption: "text-xs text-muted-foreground",
  /** Tiny text */
  tiny: "text-[10px]",
  /** Micro text — tier pills */
  micro: "text-[9px] font-medium",
  /** Monospace data value — p-values, effect sizes, IDs */
  mono: "font-mono text-[11px]",
  /** Monospace small — rule IDs, issue IDs, subject IDs, domain codes */
  monoSm: "font-mono text-xs",
} as const;

// ---------------------------------------------------------------------------
// Spacing (sp)
// ---------------------------------------------------------------------------

export const sp = {
  /** Main content area */
  mainContent: "p-6",
  /** Landing page sections */
  landingStudies: "px-8 py-6",
  landingHero: "px-8 py-8",
  landingImport: "px-8 py-4",
  /** Context panel header */
  ctxHeader: "px-4 py-3",
  /** Context panel pane content */
  ctxPane: "px-4 py-2",
  /** Filter bar */
  filterBar: "px-4 py-2",
  /** Table cells — compact grids */
  cellCompact: "px-2 py-1",
  /** Table cells — spacious grids */
  cellSpacious: "px-3 py-2",
  /** Table header cells — compact */
  headerCompact: "px-2 py-1.5",
  /** Table header cells — spacious */
  headerSpacious: "px-3 py-2.5",
  /** Cards (compact) */
  card: "p-3",
  /** Divider bar */
  divider: "px-4 py-2",
} as const;

// ---------------------------------------------------------------------------
// Badge / pill classes (badge)
// ---------------------------------------------------------------------------

export const badge = {
  /** Severity badge base: bg + text + border from getSeverityColor() */
  severity: "inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
  /** Score badge: colored bg + white text */
  score: "rounded px-1.5 py-0.5 text-xs font-semibold text-white",
  /** Category badge: light bg + dark text (domain colors) */
  category: "rounded px-1.5 py-0.5 text-[10px] font-medium",
  /** Tier filter pill: rounded-full, toggle via opacity */
  tierPill: "rounded-full px-2 py-0.5 text-[9px] font-medium",
  /** Tier pill inactive state */
  tierPillInactive: "opacity-30",
  /** Domain chip (study details) */
  domainChip: "rounded-md bg-muted px-2 py-0.5 font-mono text-xs hover:bg-primary/20 transition-colors",
  /** Dose badge: colored bg + white text */
  dose: "rounded px-1.5 py-0.5 text-[10px] font-medium text-white",
  /** Domain dot+outline badge (rails, compact layouts) */
  domainDot: "inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70",
  /** Standard badge padding */
  pad: "px-1.5 py-0.5",
  /** Domain chip padding */
  padChip: "px-2 py-0.5",
  /** Filter pill padding */
  padPill: "px-2.5 py-0.5",
} as const;

// ---------------------------------------------------------------------------
// Filter controls (filter)
// ---------------------------------------------------------------------------

export const filter = {
  /** Filter select — compact bordered dropdown, canonical style */
  select: "h-5 rounded border bg-background px-1 text-[10px] text-muted-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary",
  /** Filter label wrapping a select */
  label: "flex items-center gap-1.5 text-xs text-muted-foreground",
} as const;

// ---------------------------------------------------------------------------
// Button classes (btn)
// ---------------------------------------------------------------------------

export const btn = {
  /** Primary big — single per view */
  primaryBig: "bg-primary text-primary-foreground",
  /** Primary small — context panel actions (APPLY FIX, SAVE) */
  primary: "rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground hover:bg-primary/90",
  /** Secondary / outlined */
  secondary: "rounded border px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted/50",
  /** Ghost / text */
  ghost: "rounded border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50",
  /** Danger (destructive) */
  danger: "rounded bg-red-600 px-2.5 py-1 text-[10px] font-semibold uppercase text-white hover:bg-red-700",
  /** Disabled modifier — add to any button */
  disabled: "opacity-50 cursor-not-allowed",
} as const;

// ---------------------------------------------------------------------------
// Table classes (tbl)
// ---------------------------------------------------------------------------

export const tbl = {
  /** Compact grid header row */
  headerRowCompact: "bg-muted/50 border-b",
  /** Spacious table header row */
  headerRowSpacious: "border-b",
  /** Spacious table header bg (hardcoded for consistency) */
  headerBg: "#f8f8f8",
  /** Sortable header hover */
  sortableHover: "cursor-pointer hover:bg-accent/50",
  /** Row divider — primary */
  rowDivider: "border-b",
  /** Row divider — pairwise detail */
  rowDividerDashed: "border-b border-dashed",
  /** Card/table wrapper */
  wrapper: "rounded-md border",
} as const;

// ---------------------------------------------------------------------------
// Surface hierarchy (surface)
// ---------------------------------------------------------------------------

export const surface = {
  page: "bg-background",
  card: "bg-card",
  muted: "bg-muted/30",
  mutedStrong: "bg-muted/50",
  hover: "bg-accent/30",
  hoverStrong: "bg-accent/50",
  selected: "bg-accent",
  selectedEmphasis: "bg-blue-50/50 border-blue-500",
  filterBar: "bg-muted/30",
} as const;

// ---------------------------------------------------------------------------
// Link styles (link)
// ---------------------------------------------------------------------------

export const link = {
  /** Inline navigation link class */
  color: "text-primary",
  /** Cross-view link in context panel */
  crossView: "block text-primary text-[11px] hover:underline",
  /** Issue ID link */
  issueId: "font-mono text-xs hover:underline",
} as const;

// ---------------------------------------------------------------------------
// Empty state messages (emptyState)
// ---------------------------------------------------------------------------

export const emptyState = {
  /** Container class for "no selection" messages */
  container: "p-4 text-xs text-muted-foreground",
  /** Centered "no filter matches" */
  noMatches: "text-sm text-muted-foreground text-center",
  /** Truncated list indicator */
  truncated: "p-2 text-center text-[10px] text-muted-foreground",
  /** Error box */
  errorBox: "rounded border border-red-200 bg-red-50 p-4",
} as const;

// ---------------------------------------------------------------------------
// Collapsible pane (pane)
// ---------------------------------------------------------------------------

export const pane = {
  /** Pane header text */
  header: "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
  /** Standalone collapsible toggle */
  toggle: "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground",
  /** Chevron size */
  chevron: "h-3 w-3",
} as const;

// ---------------------------------------------------------------------------
// Context menu (menu)
// ---------------------------------------------------------------------------

export const menu = {
  container: "fixed z-50 min-w-[200px] rounded-md border bg-popover py-1 shadow-lg",
  overlay: "fixed inset-0 z-40",
  item: "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-[var(--hover-bg)]",
  disabled: "opacity-40",
} as const;

// ---------------------------------------------------------------------------
// Workflow status badge (neutral — categorical identity, not signal)
// ---------------------------------------------------------------------------

export const workflowBadge = {
  base: "inline-block rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 border-gray-200",
} as const;

// ---------------------------------------------------------------------------
// Semantic status tokens (status) — neutral badges, NOT colored
// Severity categories (Error/Warning/Info) are categorical identity, not signal.
// Per CLAUDE.md hard rule: no colored badges for categorical identity in tables.
// ---------------------------------------------------------------------------

export const status = {
  error:   { bg: "bg-gray-100",  text: "text-gray-600",  border: "border-gray-200" },
  warning: { bg: "bg-gray-100",  text: "text-gray-600",  border: "border-gray-200" },
  info:    { bg: "bg-gray-100",  text: "text-gray-600",  border: "border-gray-200" },
  success: { bg: "bg-gray-100",  text: "text-gray-600",  border: "border-gray-200" },
} as const;

// ---------------------------------------------------------------------------
// Progress bar (progress)
// ---------------------------------------------------------------------------

export const progress = {
  track: "h-1 w-full rounded-full bg-gray-200",
  fill: "bg-green-500",
  label: "text-[10px] text-muted-foreground",
} as const;

// ---------------------------------------------------------------------------
// Layout dimensions
// ---------------------------------------------------------------------------

export const layout = {
  toolboxWidth: 260,
  contextPanelWidth: 280,
  /** Master-detail split: master flex weight */
  masterFlex: 4,
  /** Master-detail split: detail flex weight */
  detailFlex: 6,
} as const;

// ---------------------------------------------------------------------------
// Validation icons
// ---------------------------------------------------------------------------

export const validationIcon = {
  pass:    { color: "#16a34a" },
  warning: { color: "#d97706" },
  fail:    { color: "#dc2626" },
  notRun:  { class: "text-muted-foreground" },
} as const;

/**
 * FilterPanel — collapsible panel for adding composable filter predicates.
 *
 * Renders below the quick-access filters in CohortRail. Users pick a dimension,
 * configure its value, and click "Add" to create a predicate in the FilterGroup.
 * Active predicates appear as pills in CohortRail (managed there, not here).
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCohort } from "@/contexts/CohortContext";
import type { FilterPredicate } from "@/types/cohort";

// ── Dimension categories ─────────────────────────────────────

type DimensionId =
  | "organ"
  | "domain"
  | "severity"
  | "syndrome"
  | "bw_change"
  | "organ_count"
  | "disposition"
  | "onset_day"
  | "recovery_verdict";

interface DimensionDef {
  id: DimensionId;
  label: string;
  group: "finding" | "metrics" | "phase3";
  disabled?: boolean;
}

const DIMENSIONS: DimensionDef[] = [
  { id: "organ", label: "Organ", group: "finding" },
  { id: "domain", label: "Domain", group: "finding" },
  { id: "severity", label: "MI severity", group: "finding" },
  { id: "syndrome", label: "Syndrome", group: "finding" },
  { id: "disposition", label: "Disposition", group: "finding" },
  { id: "bw_change", label: "Body weight change", group: "metrics" },
  { id: "organ_count", label: "Organ count", group: "metrics" },
  { id: "onset_day", label: "Onset day", group: "phase3", disabled: true },
  { id: "recovery_verdict", label: "Recovery verdict", group: "phase3", disabled: true },
];

const DOMAIN_OPTIONS = ["MI", "MA", "LB", "OM", "BW", "CL"];
const DISPOSITION_OPTIONS = [
  { key: "early_sacrifice", label: "Early sacrifice" },
  { key: "found_dead", label: "Found dead" },
  { key: "moribund", label: "Moribund" },
  { key: "scheduled", label: "Scheduled" },
];

// ── FilterPanel component ────────────────────────────────────

export function FilterPanel() {
  const { addPredicate, organSignals, filterGroup } = useCohort();
  const [expanded, setExpanded] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState<DimensionId | null>(null);

  const predicateCount = filterGroup.predicates.length;

  return (
    <div className="border-b">
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/30"
        onClick={() => setExpanded((p) => !p)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span>Filters</span>
        {predicateCount > 0 && (
          <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 border border-gray-200">
            {predicateCount}
          </span>
        )}
      </button>

      {/* Panel body */}
      {expanded && (
        <div className="bg-muted/5 px-3 pb-2 pt-1">
          {/* Dimension selector */}
          {selectedDimension === null ? (
            <DimensionPicker onSelect={setSelectedDimension} />
          ) : (
            <DimensionConfigurator
              dimension={selectedDimension}
              organSignals={organSignals}
              onAdd={(predicate) => {
                addPredicate(predicate);
                setSelectedDimension(null);
              }}
              onCancel={() => setSelectedDimension(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── DimensionPicker ──────────────────────────────────────────

function DimensionPicker({ onSelect }: { onSelect: (id: DimensionId) => void }) {
  const groups: Record<string, DimensionDef[]> = { finding: [], metrics: [], phase3: [] };
  for (const d of DIMENSIONS) {
    groups[d.group].push(d);
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Add filter
      </div>
      {Object.entries(groups).map(([groupKey, dims]) => (
        <div key={groupKey}>
          {dims.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={d.disabled}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs",
                d.disabled
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : "text-foreground hover:bg-accent/50 cursor-pointer"
              )}
              onClick={() => !d.disabled && onSelect(d.id)}
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span>{d.label}</span>
              {d.disabled && (
                <span className="ml-auto text-[9px] text-muted-foreground/40">(Phase 3)</span>
              )}
            </button>
          ))}
          {groupKey !== "phase3" && (
            <div className="my-1 border-t border-border/30" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── DimensionConfigurator ────────────────────────────────────

function DimensionConfigurator({
  dimension,
  organSignals,
  onAdd,
  onCancel,
}: {
  dimension: DimensionId;
  organSignals: { organName: string }[];
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  switch (dimension) {
    case "organ":
      return <OrganConfig organSignals={organSignals} onAdd={onAdd} onCancel={onCancel} />;
    case "domain":
      return <DomainConfig onAdd={onAdd} onCancel={onCancel} />;
    case "severity":
      return <SeverityConfig onAdd={onAdd} onCancel={onCancel} />;
    case "syndrome":
      return <SyndromeConfig onAdd={onAdd} onCancel={onCancel} />;
    case "bw_change":
      return <BwChangeConfig onAdd={onAdd} onCancel={onCancel} />;
    case "organ_count":
      return <OrganCountConfig onAdd={onAdd} onCancel={onCancel} />;
    case "disposition":
      return <DispositionConfig onAdd={onAdd} onCancel={onCancel} />;
    default:
      return null;
  }
}

// ── Shared layout ────────────────────────────────────────────

function ConfigLayout({
  label,
  onCancel,
  onAdd,
  canAdd,
  children,
}: {
  label: string;
  onCancel: () => void;
  onAdd: () => void;
  canAdd: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {children}
      <button
        type="button"
        disabled={!canAdd}
        onClick={onAdd}
        className={cn(
          "w-full rounded px-2 py-1 text-xs font-medium",
          canAdd
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        )}
      >
        Add filter
      </button>
    </div>
  );
}

// ── Organ configurator ──────────────────────────────────────

function OrganConfig({
  organSignals,
  onAdd,
  onCancel,
}: {
  organSignals: { organName: string }[];
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [role, setRole] = useState<"any" | "adverse" | "warning">("any");

  const organs = organSignals.map((o) => o.organName).sort();

  return (
    <ConfigLayout
      label="Organ"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "organ", organName: value, role })}
      canAdd={value !== ""}
    >
      <select
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">Select organ...</option>
        {organs.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Role:</span>
        {(["any", "adverse", "warning"] as const).map((r) => (
          <label key={r} className="flex items-center gap-1 text-[10px] cursor-pointer">
            <input
              type="radio"
              name="organ-role"
              checked={role === r}
              onChange={() => setRole(r)}
              className="h-2.5 w-2.5"
            />
            <span className={cn(role === r ? "text-foreground" : "text-muted-foreground")}>
              {r === "any" ? "Any" : r === "adverse" ? "Adverse" : "Warning+"}
            </span>
          </label>
        ))}
      </div>
    </ConfigLayout>
  );
}

// ── Domain configurator ─────────────────────────────────────

function DomainConfig({
  onAdd,
  onCancel,
}: {
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");

  return (
    <ConfigLayout
      label="Domain"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "domain", domain: value })}
      canAdd={value !== ""}
    >
      <select
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">Select domain...</option>
        {DOMAIN_OPTIONS.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </ConfigLayout>
  );
}

// ── Severity configurator ───────────────────────────────────

function SeverityConfig({
  onAdd,
  onCancel,
}: {
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [minGrade, setMinGrade] = useState(3);

  return (
    <ConfigLayout
      label="MI severity"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "severity", minGrade })}
      canAdd={true}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Min grade:</span>
        <input
          type="number"
          min={1}
          max={5}
          value={minGrade}
          onChange={(e) => setMinGrade(Math.max(1, Math.min(5, Number(e.target.value))))}
          className="w-16 rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <span className="text-[10px] text-muted-foreground">(1-5)</span>
      </div>
    </ConfigLayout>
  );
}

// ── Syndrome configurator ───────────────────────────────────

function SyndromeConfig({
  onAdd,
  onCancel,
}: {
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [syndromeId, setSyndromeId] = useState("");
  const [matchType, setMatchType] = useState<"full" | "partial" | "any">("any");

  // Common syndrome IDs -- kept simple as the syndrome definitions are known
  const COMMON_SYNDROMES = [
    "hepatotoxicity",
    "nephrotoxicity",
    "cardiotoxicity",
    "hematotoxicity",
    "immunotoxicity",
    "neurotoxicity",
  ];

  return (
    <ConfigLayout
      label="Syndrome"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "syndrome", syndromeId, matchType })}
      canAdd={syndromeId !== ""}
    >
      <select
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        value={syndromeId}
        onChange={(e) => setSyndromeId(e.target.value)}
      >
        <option value="">Select syndrome...</option>
        {COMMON_SYNDROMES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Match:</span>
        {(["any", "full", "partial"] as const).map((m) => (
          <label key={m} className="flex items-center gap-1 text-[10px] cursor-pointer">
            <input
              type="radio"
              name="syndrome-match"
              checked={matchType === m}
              onChange={() => setMatchType(m)}
              className="h-2.5 w-2.5"
            />
            <span className={cn(matchType === m ? "text-foreground" : "text-muted-foreground")}>
              {m === "any" ? "Any" : m === "full" ? "Full" : "Partial"}
            </span>
          </label>
        ))}
      </div>
    </ConfigLayout>
  );
}

// ── BW change configurator ──────────────────────────────────

function BwChangeConfig({
  onAdd,
  onCancel,
}: {
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [minPct, setMinPct] = useState(10);
  const [direction, setDirection] = useState<"loss" | "gain">("loss");

  return (
    <ConfigLayout
      label="Body weight change"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "bw_change", minPct, direction })}
      canAdd={true}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Min %:</span>
        <input
          type="number"
          min={1}
          max={100}
          value={minPct}
          onChange={(e) => setMinPct(Math.max(1, Math.min(100, Number(e.target.value))))}
          className="w-16 rounded border border-border bg-background px-2 py-1 text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Direction:</span>
        {(["loss", "gain"] as const).map((d) => (
          <label key={d} className="flex items-center gap-1 text-[10px] cursor-pointer">
            <input
              type="radio"
              name="bw-direction"
              checked={direction === d}
              onChange={() => setDirection(d)}
              className="h-2.5 w-2.5"
            />
            <span className={cn(direction === d ? "text-foreground" : "text-muted-foreground")}>
              {d === "loss" ? "Loss" : "Gain"}
            </span>
          </label>
        ))}
      </div>
    </ConfigLayout>
  );
}

// ── Organ count configurator ────────────────────────────────

function OrganCountConfig({
  onAdd,
  onCancel,
}: {
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [min, setMin] = useState(2);

  return (
    <ConfigLayout
      label="Organ count"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "organ_count", min })}
      canAdd={true}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Min organs:</span>
        <input
          type="number"
          min={1}
          max={20}
          value={min}
          onChange={(e) => setMin(Math.max(1, Math.min(20, Number(e.target.value))))}
          className="w-16 rounded border border-border bg-background px-2 py-1 text-xs"
        />
      </div>
    </ConfigLayout>
  );
}

// ── Disposition configurator ────────────────────────────────

function DispositionConfig({
  onAdd,
  onCancel,
}: {
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <ConfigLayout
      label="Disposition"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "disposition", values: new Set(selected) })}
      canAdd={selected.size > 0}
    >
      <div className="space-y-0.5">
        {DISPOSITION_OPTIONS.map((opt) => (
          <label key={opt.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(opt.key)}
              onChange={() => toggle(opt.key)}
              className="h-3 w-3 rounded border-gray-300"
            />
            <span className={cn(
              selected.has(opt.key) ? "text-foreground" : "text-muted-foreground"
            )}>
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </ConfigLayout>
  );
}

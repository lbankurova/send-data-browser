/**
 * FilterPanel -- side panel for adding composable filter predicates.
 *
 * Opens as a vertical panel alongside the subject list (like FindingsTableFilterPanel).
 * Users pick a dimension, configure its value, and click "Add" to create a predicate.
 * Active predicates appear as pills in CohortRail (managed there, not here).
 */
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Filter, Plus, X, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCohort } from "@/contexts/CohortContext";
import { useParams } from "react-router-dom";
import { useSubjectSyndromes } from "@/hooks/useSubjectSyndromes";
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

// ── FilterPanelToggle -- icon button to open the panel ─────────

export function FilterPanelToggle({
  predicateCount,
  isOpen,
  onToggle,
}: {
  predicateCount: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
        isOpen
          ? "bg-primary/10 text-primary"
          : predicateCount > 0
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
      onClick={onToggle}
      title="Toggle filter panel"
    >
      <Filter className="h-3 w-3" />
      {predicateCount > 0 && (
        <span className="rounded-full bg-gray-100 px-1 text-[9px] font-semibold text-gray-600 border border-gray-200">
          {predicateCount}
        </span>
      )}
    </button>
  );
}

// ── FilterPanel component ────────────────────────────────────

export function FilterPanel({ onClose }: { onClose: () => void }) {
  const { addPredicate, organSignals } = useCohort();
  const { studyId } = useParams<{ studyId: string }>();
  const { data: syndromesData } = useSubjectSyndromes(studyId);
  const [selectedDimension, setSelectedDimension] = useState<DimensionId | null>(null);

  // Derive available syndrome options from actual data
  const syndromeOptions = useMemo(() => {
    if (!syndromesData?.subjects) return [];
    const syndromeMap = new Map<string, string>();
    for (const profile of Object.values(syndromesData.subjects)) {
      for (const s of [...profile.syndromes, ...profile.partial_syndromes]) {
        if (!syndromeMap.has(s.syndrome_id)) {
          syndromeMap.set(s.syndrome_id, s.syndrome_name);
        }
      }
    }
    return [...syndromeMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [syndromesData]);

  return (
    <div className="flex flex-col bg-muted/10 border-r w-[200px] shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Add filter
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          title="Close filter panel"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Content */}
      <div className="px-2 py-1.5">
        {selectedDimension === null ? (
          <DimensionPicker onSelect={setSelectedDimension} />
        ) : (
          <DimensionConfigurator
            dimension={selectedDimension}
            organSignals={organSignals}
            syndromeOptions={syndromeOptions}
            onAdd={(predicate) => {
              addPredicate(predicate);
              setSelectedDimension(null);
            }}
            onCancel={() => setSelectedDimension(null)}
          />
        )}
      </div>
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
    <div className="space-y-0.5">
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

// ── SearchableCombobox ───────────────────────────────────────

function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = "Search...",
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower) || o.key.toLowerCase().includes(lower));
  }, [options, search]);

  const selectedLabel = options.find((o) => o.key === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          if (!open) setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex w-full items-center justify-between rounded border border-border bg-background px-2 py-1 text-xs",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{selectedLabel ?? placeholder}</span>
        <svg className="h-3 w-3 shrink-0 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full max-h-[200px] overflow-hidden rounded-md border bg-popover shadow-md flex flex-col">
          {/* Search input */}
          <div className="flex items-center gap-1 border-b px-2 py-1">
            <Search className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to filter..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setSearch(""); }
                if (e.key === "Enter" && filtered.length === 1) {
                  onChange(filtered[0].key);
                  setOpen(false);
                  setSearch("");
                }
              }}
            />
          </div>
          {/* Options list */}
          <div className="overflow-y-auto max-h-[160px]">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-[10px] text-muted-foreground/60">No matches</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    onChange(o.key);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/50 text-left",
                    o.key === value && "bg-accent/30",
                  )}
                >
                  {o.key === value && <Check className="h-3 w-3 text-primary shrink-0" />}
                  {o.key !== value && <span className="w-3" />}
                  <span className="truncate">{o.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DimensionConfigurator ────────────────────────────────────

function DimensionConfigurator({
  dimension,
  organSignals,
  syndromeOptions,
  onAdd,
  onCancel,
}: {
  dimension: DimensionId;
  organSignals: { organName: string }[];
  syndromeOptions: { id: string; name: string }[];
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
      return <SyndromeConfig syndromeOptions={syndromeOptions} onAdd={onAdd} onCancel={onCancel} />;
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

  const organOptions = useMemo(
    () => organSignals.map((o) => ({ key: o.organName, label: o.organName })).sort((a, b) => a.label.localeCompare(b.label)),
    [organSignals],
  );

  return (
    <ConfigLayout
      label="Organ"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "organ", organName: value, role })}
      canAdd={value !== ""}
    >
      <SearchableCombobox
        options={organOptions}
        value={value}
        onChange={setValue}
        placeholder="Select organ..."
      />
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
  syndromeOptions,
  onAdd,
  onCancel,
}: {
  syndromeOptions: { id: string; name: string }[];
  onAdd: (p: FilterPredicate) => void;
  onCancel: () => void;
}) {
  const [syndromeId, setSyndromeId] = useState("");
  const [matchType, setMatchType] = useState<"full" | "partial" | "any">("any");

  const comboOptions = useMemo(
    () => syndromeOptions.map((s) => ({ key: s.id, label: `${s.name} (${s.id})` })),
    [syndromeOptions],
  );

  return (
    <ConfigLayout
      label="Syndrome"
      onCancel={onCancel}
      onAdd={() => onAdd({ type: "syndrome", syndromeId, matchType })}
      canAdd={syndromeId !== ""}
    >
      <SearchableCombobox
        options={comboOptions}
        value={syndromeId}
        onChange={setSyndromeId}
        placeholder="Select syndrome..."
      />
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

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

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

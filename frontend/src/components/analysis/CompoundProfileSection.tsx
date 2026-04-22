/**
 * CompoundProfileSection — compound class override for the context panel.
 *
 * Shows auto-inferred compound class. User can override by selecting a
 * different profile. Follows the standard override pattern: saves
 * original value, timestamp, and optional note via OverridePill.
 * "Reset to auto" clears the annotation.
 */

import { useState, useMemo, useEffect } from "react";
import { useCompoundProfile, useSaveCompoundProfile, useResetCompoundProfile } from "@/hooks/useCompoundProfile";
import { OverridePill } from "@/components/ui/OverridePill";
import { Loader2, FlaskConical, Info, Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExpectedFinding, CompoundIdentity } from "@/types/compound-profile";

// ── Display name mapping for inferred compound classes ──────────────────

const CLASS_DISPLAY_NAMES: Record<string, string> = {
  small_molecule: "Small molecule",
  checkpoint_inhibitor: "Checkpoint inhibitor",
  monoclonal_antibody: "Monoclonal antibody",
  vaccine: "Vaccine",
  aav_gene_therapy: "AAV gene therapy",
  oligonucleotide: "Oligonucleotide",
  biologic_unspecified: "Biologic (unspecified)",
  vaccine_adjuvanted: "Vaccine (adjuvanted)",
  vaccine_non_adjuvanted: "Vaccine (non-adjuvanted)",
};

function classDisplayName(cls: string): string {
  return CLASS_DISPLAY_NAMES[cls] ?? cls.replace(/_/g, " ");
}

// ── Confidence badge ─────────────────────────────────────────────────────

const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: "High confidence",
  MEDIUM: "Medium confidence",
  LOW: "Low confidence",
  DEFAULT: "Default",
};

function ConfidenceBadge({ level }: { level: string }) {
  const label = CONFIDENCE_LABELS[level] ?? level;
  return (
    <span className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
      {label}
    </span>
  );
}

// Sentinel value for "auto-detect" in the Select
const AUTO_DETECT = "__auto__";

// ── Expected finding row ─────────────────────────────────────────────────

function FindingRow({
  finding,
  checked,
  onToggle,
}: {
  finding: ExpectedFinding;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <label className="flex items-start gap-2 py-1 cursor-pointer group">
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle(finding.key)}
        className="mt-0.5 h-3.5 w-3.5"
      />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-foreground group-hover:text-foreground/80">
          {finding.description}
        </div>
        <div className="text-[10px] text-muted-foreground">
          <span className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1 py-px text-[9px] font-medium text-gray-600">
            {finding.domain}
          </span>
          {finding.organs && finding.organs.length > 0 && (
            <span className="ml-1">
              {finding.organs.slice(0, 3).join(", ").toLowerCase()}
              {finding.organs.length > 3 && ` +${finding.organs.length - 3}`}
            </span>
          )}
          {finding.test_codes && finding.test_codes.length > 0 && (
            <span className="ml-1">
              {finding.test_codes.join(", ")}
            </span>
          )}
          <span className="ml-1">
            {finding.direction === "up" ? "\u2191"
              : finding.direction === "down" ? "\u2193"
              : finding.direction === "present" ? "\u25CF"
              : finding.direction === "absent" ? "\u25CB"
              : finding.direction === "normal" ? "\u2550"
              : "?"}
          </span>
        </div>
        {finding.translation_gap && (
          <div className="mt-0.5 bg-amber-50 border-l-2 border-amber-400 px-2 py-0.5 text-[9px]">
            <span className="font-semibold text-amber-700">Translation gap: </span>
            <span className="text-amber-600">{finding.translation_gap}</span>
          </div>
        )}
      </div>
    </label>
  );
}


// ── Main component ───────────────────────────────────────────────────────

export function CompoundProfileSection({ studyId }: { studyId: string }) {
  const { data: profile, isLoading } = useCompoundProfile(studyId);
  const saveMutation = useSaveCompoundProfile(studyId);
  const resetMutation = useResetCompoundProfile(studyId);

  // Selected profile ID — AUTO_DETECT means "use inferred"
  const [selectedProfileId, setSelectedProfileId] = useState<string>(AUTO_DETECT);
  // Checked expected findings (key -> boolean)
  const [checkedFindings, setCheckedFindings] = useState<Record<string, boolean>>({});
  // Override UX — click "Override..." to reveal a compact autocomplete input.
  // Replaces the 29-row Select dropdown per spike decision 7.
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideInput, setOverrideInput] = useState("");
  // Compound identity strings (SMILES / SMARTS / sponsor ID) — small molecules only, decision 6.
  // List shape from day 1 to avoid painful multi-compound retrofit later (GAP-268).
  const [identityList, setIdentityList] = useState<CompoundIdentity[]>([]);
  const [identityDirty, setIdentityDirty] = useState(false);

  // Initialize from API response
  useEffect(() => {
    if (!profile) return;

    if (profile.sme_confirmed) {
      setSelectedProfileId(profile.sme_confirmed.compound_class);
      if (profile.sme_confirmed.expected_findings) {
        setCheckedFindings(profile.sme_confirmed.expected_findings);
      } else if (profile.active_profile) {
        const defaults: Record<string, boolean> = {};
        for (const f of profile.active_profile.expected_findings) {
          defaults[f.key] = true;
        }
        setCheckedFindings(defaults);
      }
      setIdentityList(profile.sme_confirmed.compound_identity ?? [{}]);
    } else {
      setSelectedProfileId(AUTO_DETECT);
      if (profile.active_profile) {
        const defaults: Record<string, boolean> = {};
        for (const f of profile.active_profile.expected_findings) {
          defaults[f.key] = true;
        }
        setCheckedFindings(defaults);
      }
      setIdentityList([{}]);
    }
    setIdentityDirty(false);
  }, [profile]);

  // The profile to display findings from
  const activeProfile = useMemo(() => {
    if (!profile) return null;
    if (selectedProfileId === AUTO_DETECT) {
      // Use inferred profile if available
      return profile.active_profile;
    }
    if (profile.active_profile && profile.active_profile.profile_id === selectedProfileId) {
      return profile.active_profile;
    }
    return null;
  }, [profile, selectedProfileId]);

  const isOverridden = !!profile?.sme_confirmed;

  // Apply class override — only fires when input resolves to a catalog profile.
  const handleApplyOverride = (profileId: string) => {
    setSelectedProfileId(profileId);
    setOverrideOpen(false);
    setOverrideInput("");

    const findings: Record<string, boolean> = {};
    if (profile?.active_profile && profile.active_profile.profile_id === profileId) {
      for (const f of profile.active_profile.expected_findings) {
        findings[f.key] = true;
      }
    }
    setCheckedFindings(findings);

    saveMutation.mutate({
      compound_class: profileId,
      original_compound_class: profile?.inference.compound_class ?? "small_molecule",
      confirmed_by_sme: true,
      expected_findings: findings,
      reviewDate: new Date().toISOString(),
      compound_identity: identityList.filter(i => i.id || i.smiles || i.smarts),
    });
  };

  // Save compound identity alone (small molecules: no class override needed).
  const handleSaveIdentity = () => {
    if (!profile) return;
    const cleaned = identityList.filter(i => i.id || i.smiles || i.smarts);
    const currentClass = profile.sme_confirmed?.compound_class ?? profile.inference.compound_class;
    saveMutation.mutate({
      compound_class: currentClass,
      original_compound_class: profile.sme_confirmed?.original_compound_class ?? profile.inference.compound_class,
      confirmed_by_sme: profile.sme_confirmed?.confirmed_by_sme ?? false,
      expected_findings: checkedFindings,
      note: profile.sme_confirmed?.note,
      reviewDate: new Date().toISOString(),
      compound_identity: cleaned,
    });
    setIdentityDirty(false);
  };

  const handleToggleFinding = (key: string) => {
    if (!selectedProfileId || selectedProfileId === AUTO_DETECT) return;

    const updated = { ...checkedFindings, [key]: !checkedFindings[key] };
    setCheckedFindings(updated);

    // Auto-save the updated findings
    saveMutation.mutate({
      compound_class: selectedProfileId,
      original_compound_class: profile?.inference.compound_class ?? "small_molecule",
      confirmed_by_sme: true,
      expected_findings: updated,
      note: profile?.sme_confirmed?.note,
      reviewDate: new Date().toISOString(),
      compound_identity: identityList.filter(i => i.id || i.smiles || i.smarts),
    });
  };

  const handleSaveNote = (text: string) => {
    if (!profile?.sme_confirmed) return;
    saveMutation.mutate({
      compound_class: profile.sme_confirmed.compound_class,
      original_compound_class: profile.sme_confirmed.original_compound_class ?? profile.inference.compound_class,
      confirmed_by_sme: true,
      expected_findings: checkedFindings,
      note: text,
      reviewDate: profile.sme_confirmed.reviewDate ?? new Date().toISOString(),
      compound_identity: identityList.filter(i => i.id || i.smiles || i.smarts),
    });
  };

  // ── Loading state ──

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading compound profile...
      </div>
    );
  }

  if (!profile) return null;

  const { inference, sme_confirmed, available_profiles } = profile;
  const isSmallMoleculeDefault = inference.compound_class === "small_molecule" && inference.confidence === "DEFAULT";

  return (
    <div className="space-y-2">
      {/* Inferred class header */}
      <div className="flex items-center gap-2 text-[11px]">
        <FlaskConical className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium text-foreground">
          {classDisplayName(inference.compound_class)}
        </span>
        <ConfidenceBadge level={inference.confidence} />
        {isOverridden && (
          <OverridePill
            isOverridden
            note={sme_confirmed?.note}
            timestamp={sme_confirmed?.reviewDate ? new Date(sme_confirmed.reviewDate).toLocaleDateString() : undefined}
            onSaveNote={handleSaveNote}
            placeholder="Confirmed via PCLAS review"
            popoverSide="bottom"
            popoverAlign="start"
          />
        )}
      </div>

      {/* Inference method — subtle detail */}
      {!isSmallMoleculeDefault && (
        <div className="text-[10px] text-muted-foreground pl-5">
          via {inference.inference_method.replace(/_/g, " ")}
        </div>
      )}

      {/* Small molecule default hint */}
      {isSmallMoleculeDefault && !sme_confirmed && (
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-snug">
          <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          <span>No biologic signals detected in study metadata. Compound profile defaults to small molecule. To apply expected-effect rules for a biologic, select a profile below.</span>
        </div>
      )}

      {/* Active profile — shows which specific profile is resolved when
           the inferred class is generic (e.g., "Vaccine" → "Adjuvanted vaccine") */}
      {!isOverridden && activeProfile && activeProfile.profile_id !== inference.compound_class && (
        <div className="text-[10px] text-muted-foreground pl-5">
          Active profile: {activeProfile.display_name}
        </div>
      )}

      {/* Prompt when multiple profiles match but none is auto-assigned */}
      {!isOverridden && !activeProfile && inference.suggested_profiles.length > 1 && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-600 leading-snug">
          <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          <span>
            {inference.suggested_profiles.length} profiles match — select one below to enable expected-effect rules.
          </span>
        </div>
      )}

      {/* Override metadata */}
      {isOverridden && sme_confirmed && (
        <div className="text-[10px] text-muted-foreground pl-5">
          Overridden to {classDisplayName(sme_confirmed.compound_class)}
          {sme_confirmed.reviewDate && (
            <> on {new Date(sme_confirmed.reviewDate).toLocaleDateString()}</>
          )}
        </div>
      )}

      {/* Compact class override — replaces the 29-row Select (spike decision 7).
           Inference-first: most studies need no interaction. Override opens on
           demand; user types their compound class, autocomplete filters the
           catalog, free-text shows a fallback message. */}
      {available_profiles.length > 0 && (
        <OverrideControl
          availableProfiles={available_profiles}
          isOverridden={isOverridden}
          overrideOpen={overrideOpen}
          setOverrideOpen={setOverrideOpen}
          overrideInput={overrideInput}
          setOverrideInput={setOverrideInput}
          onApply={handleApplyOverride}
          onReset={() => {
            setSelectedProfileId(AUTO_DETECT);
            resetMutation.mutate();
          }}
          resetPending={resetMutation.isPending}
        />
      )}

      {/* Compound identity (small molecules only, spike decision 6).
           Strings-only storage — structure rendering / physchem / similarity
           light up post-Datagrok (GAP-268). */}
      {inference.compound_class === "small_molecule" && (
        <CompoundIdentityEditor
          items={identityList}
          onChange={(items) => {
            setIdentityList(items);
            setIdentityDirty(true);
          }}
          onSave={handleSaveIdentity}
          dirty={identityDirty}
          saving={saveMutation.isPending}
        />
      )}

      {/* Expected findings checklist */}
      {activeProfile && activeProfile.expected_findings.length > 0 && (
        <div className="mt-1">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">
            {activeProfile.display_name} — {activeProfile.expected_findings.length} expected findings
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-gray-100 bg-muted/5 px-2 py-1">
            {activeProfile.expected_findings.map((f) => (
              <FindingRow
                key={f.key}
                finding={f}
                checked={checkedFindings[f.key] ?? true}
                onToggle={handleToggleFinding}
              />
            ))}
          </div>
        </div>
      )}

      {/* No findings available for selected profile that isn't loaded */}
      {selectedProfileId !== AUTO_DETECT && !activeProfile && (
        <div className="text-[10px] text-muted-foreground">
          Profile data will load after page refresh.
        </div>
      )}
    </div>
  );
}

// ── Class override control ─────────────────────────────────────────────────

function OverrideControl({
  availableProfiles,
  isOverridden,
  overrideOpen,
  setOverrideOpen,
  overrideInput,
  setOverrideInput,
  onApply,
  onReset,
  resetPending,
}: {
  availableProfiles: import("@/types/compound-profile").ProfileSummary[];
  isOverridden: boolean;
  overrideOpen: boolean;
  setOverrideOpen: (v: boolean) => void;
  overrideInput: string;
  setOverrideInput: (v: string) => void;
  onApply: (profileId: string) => void;
  onReset: () => void;
  resetPending: boolean;
}) {
  // Fuzzy match: typed text anywhere in display_name OR profile_id.
  const matches = useMemo(() => {
    const q = overrideInput.trim().toLowerCase();
    if (!q) return [] as typeof availableProfiles;
    return availableProfiles
      .filter(p => p.display_name.toLowerCase().includes(q) || p.profile_id.toLowerCase().includes(q))
      .slice(0, 8);
  }, [availableProfiles, overrideInput]);

  const exactMatch = useMemo(
    () => availableProfiles.find(
      p => p.display_name.toLowerCase() === overrideInput.trim().toLowerCase(),
    ) ?? null,
    [availableProfiles, overrideInput],
  );

  const hasInput = overrideInput.trim().length > 0;
  const canApply = exactMatch != null;

  if (!overrideOpen) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={() => setOverrideOpen(true)}
        >
          Override class&hellip;
        </button>
        {isOverridden && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onReset}
            disabled={resetPending}
          >
            Reset to auto
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-border/60 bg-muted/10 p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Override class
      </div>
      <input
        type="text"
        value={overrideInput}
        onChange={(e) => setOverrideInput(e.target.value)}
        placeholder="Type class (e.g., anti-IL-6 mAb, ADC MMAE, LNP mRNA)"
        className="w-full rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      />
      {hasInput && matches.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded border border-border/40 bg-background">
          {matches.map((p) => (
            <li key={p.profile_id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] hover:bg-accent/40"
                onClick={() => onApply(p.profile_id)}
              >
                <span>{p.display_name}</span>
                <span className="text-[10px] text-muted-foreground">{p.modality}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasInput && matches.length === 0 && (
        <div className="rounded border border-amber-200 bg-amber-50/50 px-2 py-1.5 text-[10px] leading-snug text-amber-700">
          No catalog match for &ldquo;{overrideInput}&rdquo;. Findings would be scored on their own
          evidence; no class-specific expected-effect filtering would apply. Pick a closer
          catalog entry if your compound matches one; otherwise leave the inferred class.
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={!canApply}
          onClick={() => exactMatch && onApply(exactMatch.profile_id)}
        >
          Apply
        </button>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            setOverrideOpen(false);
            setOverrideInput("");
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Compound identity editor (small molecules, strings-only) ───────────────

function CompoundIdentityEditor({
  items,
  onChange,
  onSave,
  dirty,
  saving,
}: {
  items: CompoundIdentity[];
  onChange: (items: CompoundIdentity[]) => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
}) {
  const update = (i: number, patch: Partial<CompoundIdentity>) => {
    const next = items.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
    onChange(next);
  };
  const addRow = () => onChange([...items, {}]);
  const removeRow = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1 rounded border border-border/60 bg-muted/10 p-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Compound identity
        </div>
        <div className="text-[9px] text-muted-foreground/70">
          strings only &middot; structure / physchem post-Datagrok
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="space-y-0.5 rounded border border-border/40 bg-background p-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-medium text-muted-foreground">
                Compound {items.length > 1 ? i + 1 : ""}
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => removeRow(i)}
                  title="Remove compound"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <IdentityField label="ID" placeholder="e.g., CAS 22204-53-1" value={item.id ?? ""} onChange={(v) => update(i, { id: v })} />
            <IdentityField label="SMILES" placeholder="e.g., CC(c1ccc2cc(OC)ccc2c1)C(=O)O" value={item.smiles ?? ""} onChange={(v) => update(i, { smiles: v })} mono />
            <IdentityField label="SMARTS" placeholder="optional substructure pattern" value={item.smarts ?? ""} onChange={(v) => update(i, { smarts: v })} mono />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          onClick={addRow}
        >
          <Plus className="h-3 w-3" /> Add compound
        </button>
        <button
          type="button"
          className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function IdentityField({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-14 shrink-0 text-[10px] text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded border bg-background px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

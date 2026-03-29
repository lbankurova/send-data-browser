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
import { Loader2, FlaskConical, Info } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExpectedFinding } from "@/types/compound-profile";

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
      </div>
    </label>
  );
}


// ── Main component ───────────────────────────────────────────────────────

export function CompoundProfileSection({ studyId }: { studyId: string }) {
  const { data: profile, isLoading } = useCompoundProfile(studyId);
  const saveMutation = useSaveCompoundProfile(studyId);
  const resetMutation = useResetCompoundProfile(studyId);

  // Selected profile ID (for the dropdown) — AUTO_DETECT means "use inferred"
  const [selectedProfileId, setSelectedProfileId] = useState<string>(AUTO_DETECT);
  // Checked expected findings (key -> boolean)
  const [checkedFindings, setCheckedFindings] = useState<Record<string, boolean>>({});

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
    } else {
      setSelectedProfileId(AUTO_DETECT);
      if (profile.active_profile) {
        const defaults: Record<string, boolean> = {};
        for (const f of profile.active_profile.expected_findings) {
          defaults[f.key] = true;
        }
        setCheckedFindings(defaults);
      }
    }
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

  // When profile dropdown changes
  const handleProfileChange = (value: string) => {
    setSelectedProfileId(value);

    if (value === AUTO_DETECT) {
      // Reset to auto-detected
      resetMutation.mutate();
      return;
    }

    // Auto-save on selection (with metadata)
    const findings: Record<string, boolean> = {};
    if (profile?.active_profile && profile.active_profile.profile_id === value) {
      for (const f of profile.active_profile.expected_findings) {
        findings[f.key] = true;
      }
    }
    setCheckedFindings(findings);

    saveMutation.mutate({
      compound_class: value,
      original_compound_class: profile?.inference.compound_class ?? "small_molecule",
      confirmed_by_sme: true,
      expected_findings: findings,
      reviewDate: new Date().toISOString(),
    });
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

      {/* Profile selector */}
      {available_profiles.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            value={selectedProfileId}
            onValueChange={handleProfileChange}
          >
            <SelectTrigger className="h-7 w-fit min-w-[180px] text-xs">
              <SelectValue placeholder="Select profile..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_DETECT} className="text-xs">
                Auto-detect{activeProfile && selectedProfileId === AUTO_DETECT
                  ? ` (${activeProfile.display_name})`
                  : !isSmallMoleculeDefault ? ` (${classDisplayName(inference.compound_class)})` : ""}
              </SelectItem>
              {available_profiles.map((p) => (
                <SelectItem key={p.profile_id} value={p.profile_id} className="text-xs">
                  {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Reset link — visible when overridden */}
          {isOverridden && (
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSelectedProfileId(AUTO_DETECT);
                resetMutation.mutate();
              }}
              disabled={resetMutation.isPending}
            >
              Reset to auto
            </button>
          )}
        </div>
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

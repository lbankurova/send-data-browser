/**
 * CompoundProfileSection — compound class selector for the Study Summary view.
 *
 * Shows inferred compound class, lets SME confirm/change via dropdown,
 * displays expected-effect checklist from the selected profile, and
 * persists the confirmation as an annotation.
 */

import { useState, useMemo, useEffect } from "react";
import { useCompoundProfile, useSaveCompoundProfile } from "@/hooks/useCompoundProfile";
import { Loader2, Check, FlaskConical, Info } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExpectedFinding } from "@/types/compound-profile";

// ── Display name mapping for compound classes ────────────────────────────

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
            {finding.direction === "up" ? "\u2191" : "\u2193"}
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

  // Selected profile ID (for the dropdown)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  // Checked expected findings (key -> boolean)
  const [checkedFindings, setCheckedFindings] = useState<Record<string, boolean>>({});
  // Track if user has changed anything from confirmed state
  const [dirty, setDirty] = useState(false);

  // Initialize from API response
  useEffect(() => {
    if (!profile) return;

    if (profile.sme_confirmed) {
      setSelectedProfileId(profile.sme_confirmed.compound_class);
      if (profile.sme_confirmed.expected_findings) {
        setCheckedFindings(profile.sme_confirmed.expected_findings);
      } else if (profile.active_profile) {
        // Default all checked
        const defaults: Record<string, boolean> = {};
        for (const f of profile.active_profile.expected_findings) {
          defaults[f.key] = true;
        }
        setCheckedFindings(defaults);
      }
    } else if (profile.active_profile) {
      setSelectedProfileId(profile.active_profile.profile_id);
      const defaults: Record<string, boolean> = {};
      for (const f of profile.active_profile.expected_findings) {
        defaults[f.key] = true;
      }
      setCheckedFindings(defaults);
    } else if (profile.inference.suggested_profiles.length > 0) {
      setSelectedProfileId(profile.inference.suggested_profiles[0]);
    }
    setDirty(false);
  }, [profile]);

  // Find the active profile object to display findings from
  const activeProfile = useMemo(() => {
    if (!profile) return null;
    // If selected matches the fetched active_profile, use it directly
    if (profile.active_profile && profile.active_profile.profile_id === selectedProfileId) {
      return profile.active_profile;
    }
    return null;
  }, [profile, selectedProfileId]);

  // When profile dropdown changes
  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId);
    setDirty(true);
    // Reset checklist — need to fetch the profile's findings
    // If the newly selected profile matches active_profile, use its findings
    if (profile?.active_profile && profile.active_profile.profile_id === profileId) {
      const defaults: Record<string, boolean> = {};
      for (const f of profile.active_profile.expected_findings) {
        defaults[f.key] = true;
      }
      setCheckedFindings(defaults);
    } else {
      // Clear findings for profiles we don't have loaded
      setCheckedFindings({});
    }
  };

  const handleToggleFinding = (key: string) => {
    setCheckedFindings(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const handleConfirm = () => {
    if (!selectedProfileId) return;
    saveMutation.mutate({
      compound_class: selectedProfileId,
      confirmed_by_sme: true,
      expected_findings: checkedFindings,
    });
    setDirty(false);
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
  const isConfirmed = !!sme_confirmed && !dirty;

  // ── Small molecule default: subtle indicator ──

  if (isSmallMoleculeDefault && !sme_confirmed) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <FlaskConical className="h-3 w-3" />
          <span>No expected-effect profile</span>
          <ConfidenceBadge level="DEFAULT" />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Info className="h-2.5 w-2.5" />
          <span>Small molecule default. Select a profile below if this study tests a biologic.</span>
        </div>
        {available_profiles.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={selectedProfileId ?? ""}
              onValueChange={handleProfileChange}
            >
              <SelectTrigger className="h-7 w-fit min-w-[180px] text-xs">
                <SelectValue placeholder="Assign profile..." />
              </SelectTrigger>
              <SelectContent>
                {available_profiles.map((p) => (
                  <SelectItem key={p.profile_id} value={p.profile_id} className="text-xs">
                    {p.display_name} ({p.finding_count} findings)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProfileId && (
              <button
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                onClick={handleConfirm}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Confirm profile
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Profile detected or confirmed ──

  return (
    <div className="space-y-2">
      {/* Inferred class header */}
      <div className="flex items-center gap-2 text-[11px]">
        <FlaskConical className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium text-foreground">
          {classDisplayName(inference.compound_class)}
        </span>
        <ConfidenceBadge level={inference.confidence} />
        <span className="text-[10px] text-muted-foreground">
          via {inference.inference_method.replace(/_/g, " ")}
        </span>
      </div>

      {/* Confirmation status */}
      {isConfirmed && sme_confirmed && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Check className="h-2.5 w-2.5 text-green-600" />
          <span>
            Confirmed by {sme_confirmed.pathologist ?? "User"}
            {sme_confirmed.reviewDate && (
              <> on {new Date(sme_confirmed.reviewDate).toLocaleDateString()}</>
            )}
          </span>
        </div>
      )}

      {/* Profile selector */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Profile:</span>
        <Select
          value={selectedProfileId ?? ""}
          onValueChange={handleProfileChange}
        >
          <SelectTrigger className="h-7 w-fit min-w-[180px] text-xs">
            <SelectValue placeholder="Select profile..." />
          </SelectTrigger>
          <SelectContent>
            {available_profiles.map((p) => (
              <SelectItem key={p.profile_id} value={p.profile_id} className="text-xs">
                {p.display_name} ({p.finding_count} findings)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isConfirmed && selectedProfileId && (
          <button
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            onClick={handleConfirm}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Confirm profile
          </button>
        )}
      </div>

      {/* Expected findings checklist */}
      {activeProfile && activeProfile.expected_findings.length > 0 && (
        <div className="mt-1">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">
            Expected findings ({activeProfile.expected_findings.length})
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
          {dirty && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                onClick={handleConfirm}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Confirm profile
              </button>
              {saveMutation.isSuccess && !dirty && (
                <span className="text-[10px] text-green-600">Saved</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* No findings available for selected profile */}
      {selectedProfileId && !activeProfile && !isSmallMoleculeDefault && (
        <div className="text-[10px] text-muted-foreground">
          Expected-effect checklist will be available after confirming this profile.
        </div>
      )}
    </div>
  );
}

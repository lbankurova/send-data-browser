import type { StudyContext } from "@/types/study-context";
import type { StudyMortality, DeathRecord } from "@/types/mortality";
import type { CrossAnimalFlags } from "@/lib/analysis-view-api";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { AlertTriangle } from "lucide-react";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface StudyBannerProps {
  studyContext: StudyContext;
  doseGroupCount: number;
  tumorCount?: number;
  tkSubjectCount?: number;
  mortality?: StudyMortality | null;
  crossAnimalFlags?: CrossAnimalFlags;
}

/**
 * Compact study identity bar for analysis views.
 * Shows species+strain, duration+route, dose group count, GLP status.
 * Matches MortalityBanner pattern: bg-muted/30, text-[11px], border-b border-border/40.
 */
export function StudyBanner({ studyContext, doseGroupCount, tumorCount, tkSubjectCount, mortality, crossAnimalFlags }: StudyBannerProps) {
  const { species, strain, dosingDurationWeeks, recoveryPeriodDays, route, glpCompliant } = studyContext;

  // Format: "Sprague-Dawley rat" or just "Rat" if no strain
  const speciesStrain = strain
    ? `${titleCase(strain)} ${species.toLowerCase()}`
    : titleCase(species);

  // Format: "13-week, 2wk rec oral gavage" or "oral gavage" if no duration
  const recSuffix = recoveryPeriodDays != null
    ? (recoveryPeriodDays >= 7
        ? `, ${Math.round(recoveryPeriodDays / 7)}wk rec`
        : `, ${recoveryPeriodDays}d rec`)
    : "";
  const durationRoute = dosingDurationWeeks != null
    ? `${Math.round(dosingDurationWeeks)}-week${recSuffix} ${route.toLowerCase()}`
    : route.toLowerCase();

  // Mortality header text: "1 TR death at 200 mg/kg day 90 — NOAEL ≤ 20 mg/kg"
  const mortalityHeader = (() => {
    if (!mortality?.has_mortality) return null;
    const mainTrDeaths = mortality.deaths.filter(d => !d.is_recovery);
    if (mainTrDeaths.length === 0) return null;
    const unit = mortality.mortality_loael_label?.match(/\d[\d.]*\s*(mg\/kg|mg|µg\/kg|µg|g\/kg|g)/)?.[1] ?? "";

    // Death detail: dose + day (for single death, show specifics)
    let deathDetail = "";
    if (mainTrDeaths.length === 1) {
      const d = mainTrDeaths[0];
      const dg = mortality.by_dose.find(b => b.dose_level === d.dose_level);
      const doseStr = dg?.dose_value != null && unit ? `${dg.dose_value} ${unit}` : d.dose_label;
      deathDetail = ` at ${doseStr}${d.study_day != null ? ` day ${d.study_day}` : ""}`;
    }

    // NOAEL cap
    let capStr = "";
    if (mortality.mortality_loael != null) {
      const capLevel = mortality.mortality_loael - 1;
      const capDose = mortality.by_dose.find(b => b.dose_level === capLevel);
      if (capDose?.dose_value != null && unit) {
        capStr = ` \u2014 NOAEL \u2264 ${capDose.dose_value} ${unit}`;
      }
    }

    const n = mainTrDeaths.length;
    return `${n} TR death${n !== 1 ? "s" : ""}${deathDetail}${capStr}`;
  })();

  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-semibold">{speciesStrain}</span>
      <span className="text-muted-foreground/40">|</span>
      <span>{durationRoute}</span>
      <span className="text-muted-foreground/40">|</span>
      <span>{doseGroupCount} dose group{doseGroupCount !== 1 ? "s" : ""}</span>
      {glpCompliant && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>GLP</span>
        </>
      )}
      {tumorCount != null && tumorCount > 0 && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>
            {tumorCount} tumor{tumorCount !== 1 ? "s" : ""}
            {crossAnimalFlags?.tumor_linkage?.banner_text && (
              <span className="ml-1 text-foreground/70">
                | <AlertTriangle className="inline h-3 w-3 shrink-0 align-text-bottom" style={{ color: "#D97706" }} /> {crossAnimalFlags.tumor_linkage.banner_text}
              </span>
            )}
          </span>
        </>
      )}
      {crossAnimalFlags?.tissue_battery?.study_level_note && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-foreground/70">
            <AlertTriangle className="inline h-3 w-3 shrink-0 align-text-bottom" style={{ color: "#D97706" }} /> Tissue battery: {crossAnimalFlags.tissue_battery.study_level_note}
          </span>
        </>
      )}
      {tkSubjectCount != null && tkSubjectCount > 0 && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>{tkSubjectCount} TK satellite{tkSubjectCount !== 1 ? "s" : ""} excluded</span>
        </>
      )}
      {mortalityHeader && mortality && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-auto cursor-pointer border-l-4 pl-1.5 font-medium text-foreground decoration-dotted underline underline-offset-2"
              style={{ borderLeftColor: "#DC2626" }}
            >
              {mortalityHeader}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto max-w-[480px] p-3">
            <MortalityPopover mortality={mortality} crossAnimalFlags={crossAnimalFlags} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/** Transposed mortality table: subjects as columns, fields as rows. */
function MortalityPopover({ mortality, crossAnimalFlags }: { mortality: StudyMortality; crossAnimalFlags?: CrossAnimalFlags }) {
  const { setSelectedSubject } = useViewSelection();
  const { excludedSubjects } = useScheduledOnly();

  // Combine all deaths: TR (main + recovery) + accidental, sorted by study_day
  const allDeaths: (DeathRecord & { attribution: string })[] = [
    ...mortality.deaths.map(d => ({ ...d, attribution: "TR" })),
    ...mortality.accidentals.map(d => ({ ...d, attribution: "Accidental" })),
  ].sort((a, b) => (a.study_day ?? 999) - (b.study_day ?? 999));

  if (allDeaths.length === 0) return null;

  const unit = mortality.mortality_loael_label?.match(/\d[\d.]*\s*(mg\/kg|mg|µg\/kg|µg|g\/kg|g)/)?.[1] ?? "";

  // NOAEL cap dose label
  const capLevel = mortality.mortality_loael != null ? mortality.mortality_loael - 1 : null;
  const capDose = capLevel != null ? mortality.by_dose.find(b => b.dose_level === capLevel) : null;
  const capLabel = capDose?.dose_value != null && unit ? `${capDose.dose_value} ${unit}` : null;

  const rows: { label: string; labelTitle?: string; cells: (d: DeathRecord & { attribution: string }) => { text: string; className?: string; title?: string; style?: React.CSSProperties; onClick?: () => void } }[] = [
    {
      label: "Subj. ID",
      cells: (d) => ({ text: d.USUBJID.slice(-4), title: `${d.USUBJID}\nClick to see details in the context panel`, className: "font-medium cursor-pointer hover:opacity-70", style: { color: "#3b82f6" }, onClick: () => setSelectedSubject(d.USUBJID) }),
    },
    {
      label: "Group",
      cells: (d) => {
        const dg = mortality.by_dose.find(b => b.dose_level === d.dose_level);
        const doseStr = dg?.dose_value != null && unit ? `${dg.dose_value} ${unit}` : d.dose_label;
        return { text: doseStr, style: { color: getDoseGroupColor(d.dose_level) }, className: "font-medium" };
      },
    },
    {
      label: "Sex",
      cells: (d) => ({ text: d.sex }),
    },
    {
      label: "Day",
      cells: (d) => ({ text: d.study_day != null ? String(d.study_day) : "\u2014" }),
    },
    {
      label: "Phase",
      cells: (d) => ({ text: d.is_recovery ? "Recovery" : "Treatment" }),
    },
    {
      label: "Attribution",
      cells: (d) => ({
        text: d.attribution,
        className: d.attribution === "TR" ? "font-medium text-foreground" : "text-muted-foreground",
      }),
    },
    {
      label: "Cause",
      cells: (d) => {
        const cause = d.cause ?? d.disposition;
        const truncated = cause.length > 25 ? cause.slice(0, 24) + "\u2026" : cause;
        return { text: truncated, title: cause.length > 25 ? cause : undefined };
      },
    },
    {
      label: "Data",
      cells: (d) => {
        const tip = "Can be changed on the study summary view";
        // Enrich with cross-animal flags data
        const batteryFlag = crossAnimalFlags?.tissue_battery?.flagged_animals?.find(
          (f) => f.animal_id === d.USUBJID,
        );
        const recoveryNarr = crossAnimalFlags?.recovery_narratives?.find(
          (r) => r.animal_id === d.USUBJID,
        );
        let suffix = "";
        if (batteryFlag) {
          suffix += ` \u00B7 \u26A0 MI: ${batteryFlag.examined_count}/${batteryFlag.expected_count} tissues`;
          if (batteryFlag.sacrifice_group === "recovery") suffix += " (recovery)";
        }
        if (recoveryNarr && recoveryNarr.bw_trend !== "unknown") {
          const sign = recoveryNarr.bw_change_pct > 0 ? "+" : "";
          suffix += ` \u00B7 BW ${recoveryNarr.bw_trend} ${sign}${recoveryNarr.bw_change_pct}%`;
        }
        if (excludedSubjects.has(d.USUBJID)) {
          return { text: `Excluded${suffix}`, className: "text-foreground/70 font-medium", title: tip };
        }
        if (d.is_recovery) return { text: `Recovery arm${suffix}`, className: "text-muted-foreground/60", title: tip };
        return { text: `Included${d.study_day != null ? ` (to d${d.study_day})` : ""}${suffix}`, className: "text-muted-foreground", title: tip };
      },
    },
    {
      label: "NOAEL impact",
      cells: (d) => {
        if (d.is_recovery) return { text: "None (recovery)", className: "text-muted-foreground" };
        if (d.attribution === "Accidental") return { text: "None", className: "text-muted-foreground" };
        // TR main study — check if at LOAEL level
        if (mortality.mortality_loael != null && d.dose_level === mortality.mortality_loael && capLabel) {
          return { text: `Capped \u2264 ${capLabel}`, className: "font-medium text-foreground" };
        }
        return { text: "None", className: "text-muted-foreground" };
      },
    },
  ];

  return (
    <div>
      <table className="border-collapse text-[10px]">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground" title={row.labelTitle}>{row.label}</td>
              {allDeaths.map((d) => {
                const cell = row.cells(d);
                return (
                  <td
                    key={d.USUBJID + d.study_day}
                    className={`whitespace-nowrap px-2 py-px text-center font-mono tabular-nums ${cell.className ?? ""}`}
                    title={cell.title}
                    style={cell.style}
                    onClick={cell.onClick}
                  >
                    {cell.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(s.includes("-") ? "-" : " ");
}

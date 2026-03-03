import type { StudySettings } from "@/contexts/StudySettingsContext";

const DEFAULTS: StudySettings = {
  scheduledOnly: false,
  recoveryPooling: "pool",
  effectSize: "hedges-g",
  multiplicity: "dunnett-fwer",
  controlGroup: "vehicle",
  adversityThreshold: "grade-ge-2-or-dose-dep",
  pairwiseTest: "dunnett",
  trendTest: "jonckheere",
  incidenceTrend: "cochran-armitage",
  organWeightMethod: "absolute",
};

// camelCase → snake_case mapping for backend query params
const KEY_MAP: Record<keyof StudySettings, string> = {
  scheduledOnly: "scheduled_only",
  recoveryPooling: "recovery_pooling",
  effectSize: "effect_size",
  multiplicity: "multiplicity",
  controlGroup: "control_group",
  adversityThreshold: "adversity_threshold",
  pairwiseTest: "pairwise_test",
  trendTest: "trend_test",
  incidenceTrend: "incidence_trend",
  organWeightMethod: "organ_weight_method",
};

/** Serialize non-default settings to URL query string. Returns "" when all defaults. */
export function buildSettingsParams(settings: StudySettings): string {
  const params = new URLSearchParams();
  for (const [key, snakeKey] of Object.entries(KEY_MAP)) {
    const value = settings[key as keyof StudySettings];
    const defaultValue = DEFAULTS[key as keyof StudySettings];
    if (value !== defaultValue) {
      params.set(snakeKey, String(value));
    }
  }
  return params.toString();
}

// ── Display label maps ──────────────────────────────────────

export const PAIRWISE_TEST_LABELS: Record<string, string> = {
  dunnett: "Dunnett's test",
  williams: "Williams' test",
  steel: "Steel's test",
};

export const TREND_TEST_LABELS: Record<string, string> = {
  jonckheere: "Jonckheere-Terpstra",
  cuzick: "Cuzick's test",
  "williams-trend": "Williams' trend",
};

export const INCIDENCE_TREND_LABELS: Record<string, string> = {
  "cochran-armitage": "Cochran-Armitage",
  "logistic-slope": "Logistic regression",
};

export const MULTIPLICITY_LABELS: Record<string, string> = {
  "dunnett-fwer": "Dunnett FWER",
  bonferroni: "Bonferroni",
  "holm-sidak": "Holm-Sidak",
  "bh-fdr": "BH-FDR",
};

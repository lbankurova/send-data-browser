import { AdverseEffectsView } from "./AdverseEffectsView";
import { useRailModePreference } from "@/hooks/useRailModePreference";

export function AdverseEffectsViewWrapper() {
  useRailModePreference("organ");
  return <AdverseEffectsView />;
}

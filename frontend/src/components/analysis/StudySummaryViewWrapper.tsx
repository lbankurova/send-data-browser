import { StudySummaryView } from "./StudySummaryView";
import { useRailModePreference } from "@/hooks/useRailModePreference";

export function StudySummaryViewWrapper() {
  useRailModePreference("organ");
  return <StudySummaryView />;
}

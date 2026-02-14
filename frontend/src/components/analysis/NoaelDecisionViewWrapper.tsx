import { NoaelDecisionView } from "./NoaelDecisionView";
import { useRailModePreference } from "@/hooks/useRailModePreference";

export function NoaelDecisionViewWrapper() {
  useRailModePreference("organ");
  return <NoaelDecisionView />;
}

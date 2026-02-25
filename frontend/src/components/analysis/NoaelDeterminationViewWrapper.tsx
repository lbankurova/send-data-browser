import { NoaelDeterminationView } from "./NoaelDeterminationView";
import { useRailModePreference } from "@/hooks/useRailModePreference";

export function NoaelDeterminationViewWrapper() {
  useRailModePreference("organ");
  return <NoaelDeterminationView />;
}

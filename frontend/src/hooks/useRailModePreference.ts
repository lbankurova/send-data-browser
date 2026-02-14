import { useEffect } from "react";
import { useRailMode } from "@/contexts/RailModeContext";
import type { RailMode } from "@/contexts/RailModeContext";

/**
 * Call in a view wrapper to declare the view's preferred rail mode.
 * The preference is ignored if the user has manually toggled the mode.
 */
export function useRailModePreference(preferred: RailMode) {
  const { declarePreference } = useRailMode();
  useEffect(() => {
    declarePreference(preferred);
  }, [preferred, declarePreference]);
}

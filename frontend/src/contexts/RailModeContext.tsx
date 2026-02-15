import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RailMode = "organ" | "specimen";

interface RailModeContextValue {
  mode: RailMode;
  setMode: (mode: RailMode) => void;
  /** True once the user has manually toggled mode — views stop overriding. */
  userHasToggled: boolean;
  /**
   * Views call this to declare their preferred mode.
   * Ignored if userHasToggled is true.
   */
  declarePreference: (preferred: RailMode) => void;
  /** Clear the user toggle flag (e.g., on browsing tree navigation). */
  clearToggle: () => void;
}

const RailModeContext = createContext<RailModeContextValue>({
  mode: "organ",
  setMode: () => {},
  userHasToggled: false,
  declarePreference: () => {},
  clearToggle: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RailModeProvider({
  studyId,
  children,
}: {
  studyId: string;
  children: ReactNode;
}) {
  const [mode, setModeState] = useState<RailMode>("organ");
  const [userHasToggled, setUserHasToggled] = useState(false);

  // Reset userHasToggled on study switch
  const prevStudyId = useRef(studyId);
  if (studyId !== prevStudyId.current) {
    prevStudyId.current = studyId;
    setUserHasToggled(false);
    setModeState("organ");
  }

  const setMode = useCallback((m: RailMode) => {
    setModeState(m);
    setUserHasToggled(true);
  }, []);

  const declarePreference = useCallback(
    (preferred: RailMode) => {
      if (!userHasToggled) {
        setModeState(preferred);
      }
    },
    [userHasToggled],
  );

  const clearToggle = useCallback(() => {
    setUserHasToggled(false);
  }, []);

  return (
    <RailModeContext.Provider
      value={{ mode, setMode, userHasToggled, declarePreference, clearToggle }}
    >
      {children}
    </RailModeContext.Provider>
  );
}

export function useRailMode() {
  return useContext(RailModeContext);
}
